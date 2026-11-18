/**
 * 알림 발송 안전 · 멱등화 · 루틴 중첩 방지 순수 판단 모듈.
 *
 * Node 내장 테스트(`node --test`)에서도 직접 불러와 검증할 수 있도록
 * 경로 별칭(`@/`)이나 외부 I/O 없이 순수 함수만 둔다.
 */

export function isLiveNotificationEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env.NOTIFY_LIVE ?? '').trim() === '1'
}

const UNDELIVERABLE =
  /@(?:example\.(?:com|org|net)|localhost)$|@[^@]*\.(?:test|example|invalid|localhost|local)$/i

export function isUndeliverableAddress(address: string): boolean {
  return UNDELIVERABLE.test(address.trim())
}

export interface EmailGateInput {
  apiKey: string
  liveEnabled: boolean
  guardedDeploy: boolean
  guardNote: string
  to: string | null
}

export type EmailGateDecision =
  | { allow: true }
  | { allow: false; status: 'PREVIEW'; detail: string }

/**
 * 이메일 실발송 전 안전 게이트 — 키 · NOTIFY_LIVE=1 · 미리보기 가드 · 수신자 · 시연용 도메인을 순서대로 확인한다.
 */
export function evaluateEmailSendGate(input: EmailGateInput): EmailGateDecision {
  if (!input.apiKey.trim()) {
    return { allow: false, status: 'PREVIEW', detail: '이메일 발송 키가 없어 발송하지 않고 원문만 보관했습니다.' }
  }
  if (!input.liveEnabled) {
    return { allow: false, status: 'PREVIEW', detail: '안전 잠금(NOTIFY_LIVE=1 미설정)으로 발송하지 않고 원문만 보관했습니다.' }
  }
  if (input.guardedDeploy) {
    return { allow: false, status: 'PREVIEW', detail: input.guardNote }
  }
  if (!input.to) {
    return { allow: false, status: 'PREVIEW', detail: '고객 이메일 주소가 없어 발송하지 않고 원문만 보관했습니다.' }
  }
  if (isUndeliverableAddress(input.to)) {
    return {
      allow: false,
      status: 'PREVIEW',
      detail: '배달할 수 없는 예약 도메인(시연용 주소)이라 발송하지 않고 원문만 보관했습니다.',
    }
  }
  return { allow: true }
}

/**
 * `"customerId|opportunityId"` 집합에서 특정 공고에 이미 알림을 받은 고객 ID 집합을 뽑는다.
 */
export function notifiedCustomerIdsFor(sentKeys: Iterable<string>, opportunityId: string): Set<string> {
  const out = new Set<string>()
  const suffix = `|${opportunityId}`
  for (const key of sentKeys) {
    if (key.endsWith(suffix)) out.add(key.slice(0, -suffix.length))
  }
  return out
}

/**
 * 발송 임계치 필터 뒤, 이미 동일 공고 알림을 받은 고객을 발송 직전에 걸러낸다.
 */
export function filterNotifiableMatches<T extends { customer_id: string; opportunity_score: number }>(
  matches: readonly T[],
  opts: { notifyThreshold: number; maxNotifications: number; excludeCustomerIds?: ReadonlySet<string> },
): T[] {
  return matches
    .filter(m => m.opportunity_score >= opts.notifyThreshold)
    .filter(m => !opts.excludeCustomerIds?.has(m.customer_id))
    .slice(0, opts.maxNotifications)
}

/**
 * 10분(RUN_LEASE_MS) 이내에 끝 기록 없이 RUNNING 으로 남은 실행이 있으면 중첩 실행을 막는다.
 */
export function hasActiveRun(
  runs: readonly { status: string; started_at: string }[],
  now: Date,
  leaseMs = 10 * 60 * 1000,
): boolean {
  return runs.some(r => r.status === 'RUNNING' && now.getTime() - Date.parse(r.started_at) <= leaseMs)
}
