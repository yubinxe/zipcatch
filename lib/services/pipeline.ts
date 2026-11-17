import * as repo from '@/lib/db/repo'
import { MATCH_CONFIG, formatMan, scoreMatch, daysUntil } from './matching'
import { applyBehavior } from './lead-scoring'
import { emailProvider } from '@/lib/notifications/email'
import { filterNotifiableMatches } from '@/lib/services/notification-guard'
import type { NotificationProvider } from '@/lib/notifications/provider'
import type {
  BehaviorEventType,
  CustomerRow,
  MatchRow,
  NotificationRow,
  OpportunityEventRow,
  OpportunityEventType,
  OpportunityRow,
} from '@/lib/db/types'

/**
 * 이벤트 → 매칭 → 알림 파이프라인.
 *
 * 화면 컴포넌트에 비즈니스 로직을 넣지 않기 위해 전부 여기에 둔다.
 */

/**
 * 기본 알림 채널은 이메일이다.
 * 텔레그램은 사용자가 chat id 를 직접 찾아 넣어야 해서 접근성이 떨어진다.
 * 다른 채널로 바꾸려면 이 한 줄만 교체한다.
 */
const provider: NotificationProvider = emailProvider

/** 알림 링크에 쓸 사이트 주소. 메일 본문이 상대경로를 이해하지 못한다. */
export function baseUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  ).replace(/\/$/, '')
}

/** 알림 본문. 확률·자격 확정 표현을 쓰지 않는다. */
export function buildMessage(
  customer: CustomerRow,
  opp: OpportunityRow,
  score: number,
  reason: string,
): string {
  const lines = [
    '🏠 집캐치 맞춤 주거기회',
    '',
    `${customer.name ?? '회원'}님의 조건과 잘 맞는`,
    '새로운 주거기회가 발견되었습니다.',
    '',
    opp.title,
    [opp.district, opp.region].filter(Boolean).join(' ') + (opp.area ? ` · 전용 ${opp.area}㎡` : ''),
    '',
    opp.deposit !== null ? `보증금 ${formatMan(opp.deposit)}` : '보증금 공고 확인 필요',
    opp.monthly_rent !== null ? `월 임대료 ${opp.monthly_rent.toLocaleString()}만원` : '월 임대료 공고 확인 필요',
    '',
    `조건 적합도 ${score}`,
    '',
    '추천 이유',
    reason,
    '',
    opp.application_end ? `접수 마감\n${opp.application_end}` : '접수 마감일이 공고에 공개되지 않았습니다',
    '',
    '※ 소득·자산 등 자격요건 체크 요망 — 지원 전 공식 모집공고문을 확인해 주세요.',
  ]
  if (opp.is_demo) lines.push('※ 이 공고는 서비스 구성을 보여드리기 위한 예시 데이터입니다.')
  return lines.join('\n')
}

export interface PipelineResult {
  event: OpportunityEventRow
  opportunity: OpportunityRow
  matches: MatchRow[]
  notified: NotificationRow[]
  /** 임계치 미만이라 알림을 보내지 않은 매칭 수 */
  belowThreshold: number
}

/**
 * 기회에 의미 있는 이벤트가 생겼을 때 실행한다.
 * 후보 고객만 좁혀서 평가한다 (전수 스캔을 기본으로 삼지 않는다).
 */
export async function runMatchingForEvent(
  opportunity: OpportunityRow,
  eventType: OpportunityEventType,
  opts: { previousValue?: string | null; currentValue?: string | null; isDemo?: boolean; excludeCustomerIds?: Set<string> } = {},
): Promise<PipelineResult> {
  const now = new Date()

  const event = await repo.insertEvent({
    opportunity_id: opportunity.id,
    event_type: eventType,
    previous_value: opts.previousValue ?? null,
    current_value: opts.currentValue ?? null,
    is_demo: opts.isDemo ?? opportunity.is_demo,
    metadata: {},
  })

  // 알림 동의한 고객의 조건만 가져온다
  const candidates = await repo.listNotifiablePreferences()

  const scored = candidates
    .map(({ preference, customer }) => ({
      preference,
      customer,
      result: scoreMatch(preference, opportunity, now),
    }))
    // 예산을 넘는 건은 알림 대상으로 삼지 않는다
    .filter(r => r.result.budget.withinBudget)
    .filter(r => r.result.opportunityScore >= MATCH_CONFIG.candidateThreshold)
    .sort((a, b) => b.result.opportunityScore - a.result.opportunityScore)

  const matches = await repo.insertMatches(
    scored.map(({ customer, result }) => ({
      customer_id: customer.id,
      opportunity_id: opportunity.id,
      event_id: event.id,
      region_score: result.regionScore,
      affordability_score: result.affordabilityScore,
      area_score: result.areaScore,
      housing_type_score: result.housingTypeScore,
      competition_score: result.competitionScore,
      urgency_score: result.urgencyScore,
      opportunity_score: result.opportunityScore,
      within_budget: result.budget.withinBudget,
      deposit_over: result.budget.depositOver,
      rent_over: result.budget.rentOver,
      reason: result.reason,
      status: 'NEW' as const,
    })),
  )

  // 임계치 이상이면서 아직 동일 공고 알림을 받지 않은 고객만 발송한다(발송 전 중복 차단)
  const toNotify = filterNotifiableMatches(matches, {
    notifyThreshold: MATCH_CONFIG.notifyThreshold,
    maxNotifications: MATCH_CONFIG.maxNotificationsPerEvent,
    excludeCustomerIds: opts.excludeCustomerIds,
  })

  const notified: NotificationRow[] = []
  for (const match of toNotify) {
    const customer = scored.find(s => s.customer.id === match.customer_id)?.customer
    if (!customer) continue

    const message = buildMessage(customer, opportunity, match.opportunity_score, match.reason)

    // 먼저 알림 레코드를 만들어 id 를 얻고, 그 id 로 추적 링크를 만든다
    const notification = await repo.insertNotification({
      customer_id: customer.id,
      opportunity_id: opportunity.id,
      match_id: match.id,
      channel: provider.channel,
      status: 'PREVIEW',
      message,
      detail: null,
      sent_at: null,
      clicked_at: null,
    })

    const outcome = await provider.send({
      // 이메일은 가입 시 이미 받으므로 추가 입력 단계가 없다
      to: customer.email,
      title: '집캐치 맞춤 주거기회',
      body: message,
      // 상세 페이지로 직접 보내지 않고 추적 경로를 거친다
      linkUrl: `${baseUrl()}/t/${notification.id}`,
      linkLabel: '자세히 보기',
    })

    const updated: NotificationRow = {
      ...notification,
      status: outcome.status === 'SENT' ? 'SENT' : outcome.status === 'FAILED' ? 'FAILED' : 'PREVIEW',
      detail: outcome.detail,
      sent_at: outcome.status === 'SENT' ? new Date().toISOString() : null,
    }
    await patchNotification(updated)
    notified.push(updated)

    await repo.updateMatchStatus(match.id, 'NOTIFIED')

    // 발송은 고객 행동이 아니므로 lead score 를 올리지 않는다
    await repo.insertBehavior({
      customer_id: customer.id,
      session_id: null,
      opportunity_id: opportunity.id,
      notification_id: notification.id,
      event_type: 'NOTIFICATION_SENT',
      source: 'PIPELINE',
      metadata: { status: updated.status },
    })
  }

  return {
    event,
    opportunity,
    matches,
    notified,
    belowThreshold: matches.length - toNotify.length,
  }
}

/** 알림 상태 갱신 (repo 에 전용 헬퍼가 없어 여기서 처리) */
async function patchNotification(row: NotificationRow) {
  const { getSupabase } = await import('@/lib/db/supabase')
  const sb = getSupabase()
  if (!sb) {
    const state = repo.memoryState()
    const found = state.notifications.find(n => n.id === row.id)
    if (found) Object.assign(found, row)
    return
  }
  await sb
    .from('notifications')
    .update({ status: row.status, detail: row.detail, sent_at: row.sent_at })
    .eq('id', row.id)
}

/**
 * 고객 행동을 기록하고 Lead Score 를 갱신한다.
 * 실제로 성공한 행동만 기록한다.
 */
export async function trackBehavior(input: {
  customerId: string | null
  sessionId?: string | null
  opportunityId?: string | null
  notificationId?: string | null
  eventType: BehaviorEventType
  source?: string
  metadata?: Record<string, unknown>
}) {
  const behavior = await repo.insertBehavior({
    customer_id: input.customerId,
    session_id: input.sessionId ?? null,
    opportunity_id: input.opportunityId ?? null,
    notification_id: input.notificationId ?? null,
    event_type: input.eventType,
    source: input.source ?? 'WEB',
    metadata: input.metadata ?? {},
  })

  if (!input.customerId) return { behavior, change: null }

  const customer = await repo.getCustomer(input.customerId)
  if (!customer) return { behavior, change: null }

  const change = applyBehavior(customer.lead_score, input.eventType)
  if (change.delta !== 0 || change.stageChanged) {
    await repo.upsertCustomer({
      id: customer.id,
      lead_score: change.after,
      lifecycle_stage: change.stageAfter,
    })
  }
  return { behavior, change }
}

/** 마감 임박 여부 (알림 스케줄러가 쓸 수 있게 분리) */
export function isDeadlineApproaching(opp: OpportunityRow, withinDays = 3, now = new Date()) {
  const d = daysUntil(opp.application_end, now)
  return d !== null && d >= 0 && d <= withinDays
}
