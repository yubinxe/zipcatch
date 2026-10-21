import { checkMutation } from '@/lib/consumer/security'
import { NextRequest } from 'next/server'
import { resolveSession } from '@/lib/consumer/session'
import { saveProfile, track } from '@/lib/consumer/store'
import { listOfficialProperties } from '@/lib/consumer/official'
import * as repo from '@/lib/db/repo'
import { trackBehavior } from '@/lib/services/pipeline'
import { findCandidatesForCustomer } from '@/lib/crm/services/matching'
import {
  HOUSING_TYPES,
  type Homeownership,
  type HousingType,
  type SearchProfile,
} from '@/lib/crm/types'

export const dynamic = 'force-dynamic'

const HOUSEHOLDS = ['1인가구', '신혼부부', '2인가구', '다자녀', '한부모'] as const
const OWNERSHIP: Homeownership[] = ['NONE', 'ONE', 'MANY']

/** 연수·인원 — 범위를 벗어나면 잘라 담는다. 모르면 null 을 지킨다 */
function boundedInt(v: unknown, max: number) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return Math.min(max, Math.max(0, Math.round(n)))
}

function positiveInt(v: unknown) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0 || n > 10000000) throw new Error('금액과 면적은 0 이상의 숫자로 입력해 주세요.')
  return Math.round(n)
}

/**
 * 탐색 조건으로 후보를 찾는다.
 *
 * 자격 판정에 필요한 소득·자산은 이 단계에서 받지 않는다.
 * 사용자가 정하지 않은 항목은 임의로 채우지 않고 unknownFields 에 남긴다.
 */
export async function POST(req: NextRequest) {
  const denied = checkMutation(req)
  if (denied) return denied
  try {
    const session = await resolveSession()
    const body = (await req.json()) ?? {}
    const now = new Date()

    const regions: string[] = Array.isArray(body.regions)
      ? body.regions.filter((r: unknown): r is string => typeof r === 'string').slice(0, 3)
      : []
    if (regions.length === 0) {
      return Response.json({ error: '희망지역을 1곳 이상 선택해 주세요.' }, { status: 400 })
    }

    const housingTypes: HousingType[] = Array.isArray(body.housingTypes)
      ? body.housingTypes.filter((t: unknown): t is HousingType => HOUSING_TYPES.includes(t as HousingType))
      : []

    const householdType = HOUSEHOLDS.includes(body.householdType) ? body.householdType : null

    const unknownFields: string[] = []
    const maxDeposit = positiveInt(body.maxDeposit)
    const maxMonthlyRent = positiveInt(body.maxMonthlyRent)
    const minArea = positiveInt(body.minArea)

    if (maxDeposit === null) unknownFields.push('maxDeposit')
    if (maxMonthlyRent === null) unknownFields.push('maxMonthlyRent')
    if (minArea === null) unknownFields.push('minArea')
    if (housingTypes.length === 0) unknownFields.push('housingTypes')

    // 자격 항목은 사용자가 고른 것만 담는다. 비워두면 비운 채로 둔다 —
    // 기본값을 채우면 화면이 "무주택 0년"을 사실처럼 보여주게 된다.
    const homeownership: Homeownership | null = OWNERSHIP.includes(body.homeownership)
      ? body.homeownership
      : null
    const homelessYears = boundedInt(body.homelessYears, 16)
    const residencyYears = boundedInt(body.residencyYears, 30)
    const accountYears = boundedInt(body.accountYears, 17)
    const dependents = boundedInt(body.dependents, 6)

    const profile: SearchProfile = {
      regions,
      housingTypes,
      householdType,
      homeownership,
      homelessYears,
      residencyYears,
      accountYears,
      dependents,
      // 미입력 시 상한을 두지 않는다 (사실처럼 보이는 기본값을 만들지 않는다)
      maxDeposit,
      maxMonthlyRent,
      minArea,
      unknownFields,
      updatedAt: now.toISOString(),
    }
    if (!body.readOnly) {
      saveProfile(session.id, profile)
      // CRM 기록은 응답을 막지 않는다. 실패해도 사용자는 후보를 본다.
      await persistPreference(session.id, profile).catch(err => {
        console.error('persistPreference', err)
      })
    }

    // 매칭 엔진은 Customer 형태를 받는다. 탐색 단계에서 모르는 값은 넣지 않는다.
    const searcher = {
      preferredRegions: regions,
      maxDeposit, maxMonthlyRent, minArea,
      preferredHousingTypes: housingTypes,
    }

    // 실제 공고만 평가한다. 예시는 화면 구성을 보여주려고 만든 것이라
    // 후보로 내놓으면 지원할 수 없는 공고를 권하는 셈이 된다.
    // 맞는 공고가 없으면 없다고 말한다 — 예시로 자리를 메우지 않는다.
    const official = await listOfficialProperties({ openOnly: true, limit: 300 })
    const outcome = findCandidatesForCustomer(searcher, official, { now })
    const officialInResult =
      outcome.primary.filter(r => r.property.dataOrigin === 'OFFICIAL').length +
      outcome.relaxed.filter(r => r.property.dataOrigin === 'OFFICIAL').length

    if (!body.readOnly) track(session, 'analysis_completed', {
      regionCount: regions.length,
      primaryCount: outcome.primary.length,
      hasUnknown: unknownFields.length > 0,
    })

    return Response.json({
      profile,
      primary: outcome.primary,
      relaxed: outcome.relaxed,
      insight: outcome.insight,
      // 실제 공고와 예시가 섞일 수 있다. 하나로 뭉뚱그리지 않는다.
      officialCount: officialInResult,
      dataOrigin: officialInResult > 0 ? ('MIXED' as const) : ('SYNTHETIC' as const),
    })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : '후보를 찾지 못했습니다.' },
      { status: 500 },
    )
  }
}

/**
 * 탐색 조건을 customers + customer_preferences 로 저장한다.
 * 가입 전이면 세션 ID 로 고객을 만들고, 가입 시 같은 세션이 계정에 승계된다.
 * 알림 수신 동의는 여기서 켜지 않는다 — 별도 동의 절차가 있다.
 */
async function persistPreference(sessionId: string, profile: SearchProfile) {
  let customer = await repo.findCustomerBySession(sessionId)
  if (!customer) customer = await repo.upsertCustomer({ session_id: sessionId })

  const existing = await repo.getPreference(customer.id)

  await repo.savePreference(customer.id, {
    preferred_regions: profile.regions,
    // 사용자가 정하지 않은 항목은 null 로 보존한다 (임의값을 만들지 않는다)
    max_deposit: profile.unknownFields.includes('maxDeposit') ? null : profile.maxDeposit,
    max_monthly_rent: profile.unknownFields.includes('maxMonthlyRent') ? null : profile.maxMonthlyRent,
    min_area: profile.unknownFields.includes('minArea') ? null : profile.minArea,
    preferred_housing_types: profile.housingTypes,
    move_in_period: null,
    notification_enabled: existing?.notification_enabled ?? false,
  })

  await trackBehavior({
    customerId: customer.id,
    sessionId,
    eventType: existing ? 'SEARCH_COMPLETED' : 'PREFERENCE_SAVED',
    source: 'WEB',
  })
}
