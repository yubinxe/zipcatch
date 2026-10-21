import { emailProvider } from '@/lib/notifications/email'
import { findCandidatesForCustomer, type CandidateResult } from '@/lib/crm/services/matching'
import { ELIGIBILITY_CAUTION, formatMan, formatManOr } from '@/lib/crm/services/scoring'
import { listOfficialProperties } from '@/lib/consumer/official'
import { getState } from '@/lib/crm/store'
import type { SearchProfile } from '@/lib/crm/types'

/**
 * 조건 다이제스트 — 저장한 조건에 맞는 공고를 한 통에 모아 보낸다.
 *
 * 정기 알림(`lib/services/pipeline.ts`)은 **공고 하나**가 생겼을 때 그 공고를
 * 보낸다. 이건 반대로 **사람 하나**를 놓고 지금 열려 있는 것을 훑어 보낸다.
 * 알림에 막 동의한 사람은 다음 루틴이 돌 때까지 아무것도 받지 못하는데,
 * 그 침묵은 사용자에게 고장으로 읽힌다.
 *
 * 예시 공고는 담지 않는다. 화면에서는 '예시'라고 적어 구분할 수 있지만,
 * 메일함에 도착한 목록은 배지가 떨어져 나간 채 진짜처럼 읽힌다.
 * 보낼 공고가 없으면 없다고 적어 보낸다 — 그것도 사용자가 알아야 할 결과다.
 */

const MAX_PRIMARY = 5
const MAX_RELAXED = 3

export interface DigestOutcome {
  status: 'SENT' | 'PREVIEW' | 'FAILED'
  detail: string
  /** 메일에 담은 공식 공고 수 */
  officialCount: number
  /** 오차범위로 함께 담은 수 */
  relaxedCount: number
  /** 발송한 본문. 보관·디버깅용 */
  message: string
}

function line(label: string, value: string) {
  return `${label}  ${value}`
}

/** 조건 요약 — 사용자가 정하지 않은 항목은 적지 않는다 */
function describeProfile(profile: SearchProfile): string[] {
  const out = [line('지역', profile.regions.join(' · '))]
  if (!profile.unknownFields.includes('maxDeposit') && profile.maxDeposit !== null) {
    out.push(line('보증금', `${formatMan(profile.maxDeposit)} 이하`))
  }
  if (!profile.unknownFields.includes('maxMonthlyRent') && profile.maxMonthlyRent !== null) {
    out.push(line('월 임대료', `${profile.maxMonthlyRent.toLocaleString()}만원 이하`))
  }
  if (!profile.unknownFields.includes('minArea') && profile.minArea !== null) {
    out.push(line('면적', `전용 ${profile.minArea}㎡ 이상`))
  }
  if (profile.housingTypes.length) out.push(line('유형', profile.housingTypes.join(' · ')))
  return out
}

/** 공고 한 건 — 금액이 없으면 0 으로 채우지 않고 "공고문 확인"으로 둔다 */
function describeNotice(row: CandidateResult, order: number): string {
  const { property, candidate } = row
  const where = [property.district, property.region].filter(Boolean).join(' ')
  const area = property.area !== null ? ` · 전용 ${property.area}㎡` : ''

  const price =
    property.deposit === null && property.monthlyRent === null
      ? '공급금액은 모집공고문에서 확인'
      : `보증금 ${formatManOr(property.deposit)} · 월 임대료 ${
          property.monthlyRent === null ? '공고문 확인' : `${property.monthlyRent.toLocaleString()}만원`
        }`

  const deadline = property.applicationEnd
    ? `접수 마감 ${property.applicationEnd}${
        candidate.urgency.daysLeft !== null && candidate.urgency.daysLeft >= 0
          ? ` (${candidate.urgency.daysLeft === 0 ? 'D-DAY' : `D-${candidate.urgency.daysLeft}`})`
          : ''
      }`
    : '접수 마감일 미공개'

  const why = candidate.reasons.slice(0, 2).join(' · ')

  return [`${order}. ${property.name}`, `${where}${area}`, price, deadline, why ? `— ${why}` : '']
    .filter(Boolean)
    .join('\n')
}

/** 초과분을 감추지 않는다. 얼마를 넘는지 적어야 사용자가 판단한다. */
function describeRelaxed(row: CandidateResult, order: number): string {
  const over: string[] = []
  if (row.candidate.budget.depositOver > 0) {
    over.push(`보증금 ${formatMan(row.candidate.budget.depositOver)} 초과`)
  }
  if (row.candidate.budget.rentOver > 0) {
    over.push(`월 임대료 ${row.candidate.budget.rentOver.toLocaleString()}만원 초과`)
  }
  const head = describeNotice(row, order)
  return over.length ? `${head}\n△ ${over.join(' · ')}` : head
}

/**
 * 조건에 맞는 공고를 찾아 한 통으로 보낸다.
 *
 * `to` 가 없거나 발송 키가 없으면 어댑터가 PREVIEW 로 돌려준다. 앱은 죽지 않고,
 * 호출부는 status 로 실제 발송 여부를 구분한다.
 */
export async function sendConditionDigest(input: {
  to: string | null
  nickname: string | null
  profile: SearchProfile
  siteUrl: string
  now?: Date
}): Promise<DigestOutcome> {
  const { to, nickname, profile, siteUrl, now = new Date() } = input

  const searcher = {
    preferredRegions: profile.regions,
    maxDeposit: profile.unknownFields.includes('maxDeposit') ? null : profile.maxDeposit,
    maxMonthlyRent: profile.unknownFields.includes('maxMonthlyRent') ? null : profile.maxMonthlyRent,
    minArea: profile.unknownFields.includes('minArea') ? null : profile.minArea,
    preferredHousingTypes: profile.housingTypes,
  }

  const official = await listOfficialProperties({ openOnly: true, limit: 300 }).catch(() => [])
  // 예시를 걸러내기 전에 잘리면 예시가 자리를 차지하고 실제 공고가 밀려난다.
  // 넉넉히 받아 두고, 아래에서 공식 공고만 남긴 뒤에 자른다.
  const outcome = findCandidatesForCustomer(searcher, [...official, ...getState().properties], {
    now,
    limit: 40,
    relaxedLimit: 20,
  })

  // 메일에는 공식 공고만 담는다. 예시는 화면에서만 '예시'로 읽힌다.
  const isOfficial = (r: CandidateResult) => r.property.dataOrigin === 'OFFICIAL'
  const primary = outcome.primary.filter(isOfficial).slice(0, MAX_PRIMARY)
  const relaxed = outcome.relaxed.filter(isOfficial).slice(0, MAX_RELAXED)

  const hello = `안녕하세요, ${nickname || '회원'}님.`
  const rule = '─'.repeat(24)
  const lines: string[] = []

  if (primary.length > 0) {
    lines.push(
      '🏠 저장하신 조건에 맞는 공고',
      '',
      hello,
      `지금 접수 중인 공고 가운데 ${primary.length}건을 추렸습니다.`,
      '',
      '저장하신 조건',
      ...describeProfile(profile),
      '',
      rule,
      '',
      ...primary.flatMap((row, i) => [describeNotice(row, i + 1), '']),
    )
  } else {
    // 0건도 결과다. 예시 공고로 자리를 메우지 않는다.
    lines.push(
      '🏠 저장하신 조건 · 지금은 진행 중인 공고가 없습니다',
      '',
      hello,
      '저장하신 조건으로 지금 접수 중인 공식 공고를 찾지 못했습니다.',
      '조건은 그대로 두었고, 새 공고가 열리면 다시 알려드리겠습니다.',
      '',
      '저장하신 조건',
      ...describeProfile(profile),
      '',
      rule,
      '',
    )
  }

  if (relaxed.length > 0) {
    lines.push(
      primary.length > 0 ? '조건을 조금 벗어나지만 눈여겨볼 만한 곳' : '조건을 넓히면 이런 공고가 있습니다',
      '',
      ...relaxed.flatMap((row, i) => [describeRelaxed(row, i + 1), '']),
      rule,
      '',
    )
  }

  lines.push(`※ ${ELIGIBILITY_CAUTION} — 지원 전 공식 모집공고문을 확인해 주세요.`)

  const message = lines.join('\n')

  const sent = await emailProvider.send({
    to,
    title:
      primary.length > 0
        ? `[집캐치] ${profile.regions.join('·')} 조건에 맞는 공고 ${primary.length}건`
        : `[집캐치] ${profile.regions.join('·')} 조건 · 지금은 진행 중인 공고가 없습니다`,
    body: message,
    linkUrl: `${siteUrl.replace(/\/$/, '')}/results`,
    linkLabel: primary.length > 0 ? '후보 전체 보기' : '조건 바꿔보기',
  })

  return {
    status: sent.status,
    detail: sent.detail,
    officialCount: primary.length,
    relaxedCount: relaxed.length,
    message,
  }
}
