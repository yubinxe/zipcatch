import type { Customer, Match, Property } from '@/lib/crm/types'
import { daysUntil } from '@/lib/crm/services/scoring'
import { GUARD_NOTE, isGuardedDeploy } from '@/lib/runtime/deploy-guard'

export interface NotificationPayload {
  customerId: string
  propertyId: string
  matchId: string
  title: string
  body: string
  /** 공고 원문 링크 (있을 때만) */
  linkUrl?: string
}

export interface NotificationResult {
  status: 'TEST_SENT' | 'DRAFT' | 'FAILED'
  adapter: string
  detail: string
}

/**
 * 메시징 Adapter.
 * 이 환경에 카카오/메시징 MCP tool 이 없으면 KakaoMemoAdapter 가 비활성화되고
 * PreviewAdapter 가 payload 를 그대로 로그에 남긴다 — 데모는 중단되지 않는다.
 */
export interface NotificationAdapter {
  readonly id: string
  readonly label: string
  isAvailable(): boolean
  send(payload: NotificationPayload): Promise<NotificationResult>
}

function formatMoney(man: number) {
  if (man >= 10000) {
    const eok = Math.floor(man / 10000)
    const rest = man % 10000
    return rest ? `${eok}억 ${rest.toLocaleString()}만원` : `${eok}억원`
  }
  return `${man.toLocaleString()}만원`
}

function formatDeadline(dateStr: string | null) {
  if (!dateStr) return '공고문 확인 필요'
  const [, m, d] = dateStr.split('-')
  return `${Number(m)}월 ${Number(d)}일`
}

export function buildNotificationPayload(
  customer: Customer,
  property: Property,
  match: Match,
  now = new Date(),
): NotificationPayload {
  const d = daysUntil(property.applicationEnd, now)
  const dday = d === null ? '' : d < 0 ? ' (마감됨)' : d === 0 ? ' (오늘 마감!)' : ` · D-${d}`

  const body = [
    `[집캐치] ${customer.name}님 맞춤 주거기회 안내`,
    '',
    '등록하신 조건에 부합하는 물건이 확인되어 안내드립니다.',
    '',
    `■ ${property.name}`,
    `   ${property.region} · ${property.housingType}${property.area === null ? '' : ` · 전용 ${property.area}㎡`}`,
    property.deposit === null && property.monthlyRent === null
      ? '   임대조건: 모집공고문 확인 필요'
      : `   보증금 ${property.deposit === null ? '공고문 확인' : formatMoney(property.deposit)} / 월 임대료 ${
          property.monthlyRent === null ? '공고문 확인' : `${property.monthlyRent}만원`
        }`,
    '',
    `■ 희망조건 일치도 ${match.preferenceScore}점 (100점 만점)`,
    ...match.reasons.map(r => `   · ${r}`),
    '',
    '■ 확인이 필요한 사항',
    ...match.cautions.map(c => `   · ${c}`),
    '',
    `■ 접수 마감 ${formatDeadline(property.applicationEnd)}${dday}`,
    '',
    '※ 자격요건은 아직 확인하지 않았습니다. 참고용 안내이며 공식 판정이 아닙니다.',
    '※ 지원 전 반드시 공식 모집공고문을 확인하시기 바랍니다.',
  ].join('\n')

  return {
    customerId: customer.id,
    propertyId: property.id,
    matchId: match.id,
    title: `맞춤 주거기회 안내 · ${property.name}`,
    linkUrl: property.sourceUrl ?? undefined,
    body,
  }
}

/**
 * 카카오톡 "나에게 보내기" (메모 API).
 * KAKAO_ACCESS_TOKEN 이 설정된 경우에만 실제 발송한다. 키는 .env 로만 주입한다.
 */
export const kakaoMemoAdapter: NotificationAdapter = {
  id: 'kakao-memo',
  label: '카카오톡 나에게 보내기 (테스트 전용)',
  isAvailable() {
    return Boolean(process.env.KAKAO_ACCESS_TOKEN)
  },
  async send(payload) {
    const token = process.env.KAKAO_ACCESS_TOKEN
    if (!token) {
      return { status: 'FAILED', adapter: this.id, detail: 'KAKAO_ACCESS_TOKEN 미설정' }
    }
    if (isGuardedDeploy()) return { status: 'DRAFT', adapter: this.id, detail: GUARD_NOTE }
    try {
      const template = {
        object_type: 'text',
        text: payload.body.slice(0, 200),
        link: { web_url: payload.linkUrl ?? 'https://www.applyhome.co.kr' },
        button_title: payload.linkUrl ? '공고 원문' : '청약홈 안내',
      }
      const res = await fetch('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ template_object: JSON.stringify(template) }),
      })
      if (!res.ok) {
        const text = await res.text()
        return { status: 'FAILED', adapter: this.id, detail: `카카오 API ${res.status}: ${text.slice(0, 160)}` }
      }
      return {
        status: 'TEST_SENT',
        adapter: this.id,
        // "나에게 보내기"는 운영자 본인 계정으로만 간다. 수신자별 발송이 아니다.
        detail: '운영자 본인 카카오톡으로 테스트 전송했습니다. 고객 수신자 발송이 아닙니다.',
      }
    } catch (err) {
      return {
        status: 'FAILED',
        adapter: this.id,
        detail: `전송 실패: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  },
}

/** 발송 권한이 없는 환경의 폴백 — payload 를 그대로 보존해 Dashboard 에 미리보기로 노출 */
export const previewAdapter: NotificationAdapter = {
  id: 'preview',
  label: '초안 생성 · 미발송',
  isAvailable() {
    return true
  },
  async send() {
    return {
      status: 'DRAFT',
      adapter: 'preview',
      detail: '카카오 채널 연동 전으로 발송하지 않고 알림 초안만 보관합니다.',
    }
  },
}

const CHAIN: NotificationAdapter[] = [kakaoMemoAdapter, previewAdapter]

export function activeNotificationAdapter(): NotificationAdapter {
  return CHAIN.find(a => a.isAvailable()) ?? previewAdapter
}

export async function dispatchNotification(payload: NotificationPayload, testApproved = false) {
  const adapter = testApproved ? activeNotificationAdapter() : previewAdapter
  try {
    const result = await adapter.send(payload)
    if (result.status === 'FAILED' && adapter.id !== 'preview') {
      const fallback = await previewAdapter.send(payload)
      return { ...fallback, detail: `${result.detail} → 초안으로 보관` }
    }
    return result
  } catch (err) {
    return {
      status: 'DRAFT' as const,
      adapter: 'preview',
      detail: `어댑터 예외로 초안 보관: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}
