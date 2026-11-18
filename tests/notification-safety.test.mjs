/**
 * 알림 멱등화(R2) · 발송 dry-run 안전 잠금(R3) · 루틴 중첩 방지(R5) 검증 시험.
 * 실행: npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  evaluateEmailSendGate,
  filterNotifiableMatches,
  hasActiveRun,
  isLiveNotificationEnabled,
  notifiedCustomerIdsFor,
} from '../lib/services/notification-guard.ts'
import { RUN_LEASE_MS } from '../lib/services/schedule.ts'

test('R2: notifiedCustomerIdsFor 는 해당 공고에 이미 알림을 받은 고객만 정확히 추출한다', () => {
  const sent = new Set(['c1|opp-1', 'c2|opp-2', 'c3|opp-1'])
  const forOpp1 = notifiedCustomerIdsFor(sent, 'opp-1')
  assert.deepEqual([...forOpp1].sort(), ['c1', 'c3'])
  assert.equal(notifiedCustomerIdsFor(sent, 'opp-3').size, 0)
})

test('R2: filterNotifiableMatches 는 발송 전 중복 고객을 걸러내고 신규 고객만 남긴다', () => {
  const matches = [
    { customer_id: 'c1', opportunity_score: 92 },
    { customer_id: 'c2', opportunity_score: 88 },
    { customer_id: 'c3', opportunity_score: 60 }, // 임계치 미만
  ]
  const firstPass = filterNotifiableMatches(matches, {
    notifyThreshold: 75,
    maxNotifications: 20,
  })
  assert.deepEqual(firstPass.map(m => m.customer_id), ['c1', 'c2'])

  // 두 번째 실행 — c1, c2 모두 이미 발송됨 → 0건
  const secondPass = filterNotifiableMatches(matches, {
    notifyThreshold: 75,
    maxNotifications: 20,
    excludeCustomerIds: new Set(['c1', 'c2']),
  })
  assert.equal(secondPass.length, 0)

  // 신규 고객 c4 추가 시 c4 만 통과
  const thirdPass = filterNotifiableMatches(
    [...matches, { customer_id: 'c4', opportunity_score: 80 }],
    {
      notifyThreshold: 75,
      maxNotifications: 20,
      excludeCustomerIds: new Set(['c1', 'c2']),
    },
  )
  assert.deepEqual(thirdPass.map(m => m.customer_id), ['c4'])
})

test('R3: RESEND_API_KEY 가 있어도 NOTIFY_LIVE=1 이 아니면 PREVIEW(dry-run)로 막는다', () => {
  assert.equal(isLiveNotificationEnabled({}), false)
  assert.equal(isLiveNotificationEnabled({ NOTIFY_LIVE: '0' }), false)
  assert.equal(isLiveNotificationEnabled({ NOTIFY_LIVE: '1' }), true)

  const blocked = evaluateEmailSendGate({
    apiKey: 're_test_dummy_key',
    liveEnabled: false,
    guardedDeploy: false,
    guardNote: 'preview guard',
    to: 'user@custom-domain.kr',
  })
  assert.equal(blocked.allow, false)
  if (!blocked.allow) {
    assert.equal(blocked.status, 'PREVIEW')
    assert.match(blocked.detail, /NOTIFY_LIVE=1/)
  }

  const demoBlocked = evaluateEmailSendGate({
    apiKey: 're_test_dummy_key',
    liveEnabled: true,
    guardedDeploy: false,
    guardNote: 'preview guard',
    to: 'seed@example.com',
  })
  assert.equal(demoBlocked.allow, false)

  const liveAllowed = evaluateEmailSendGate({
    apiKey: 're_test_dummy_key',
    liveEnabled: true,
    guardedDeploy: false,
    guardNote: 'preview guard',
    to: 'user@custom-domain.kr',
  })
  assert.equal(liveAllowed.allow, true)
})

test('R5: 10분 이내 RUNNING 실행이 있으면 중첩 실행을 차단하고, 10분 초과 중단 실행은 차단하지 않는다', () => {
  const now = new Date('2026-11-17T10:00:00.000Z')
  const recentRunning = [{ status: 'RUNNING', started_at: new Date(now.getTime() - 2 * 60 * 1000).toISOString() }]
  assert.equal(hasActiveRun(recentRunning, now, RUN_LEASE_MS), true)

  const staleRunning = [{ status: 'RUNNING', started_at: new Date(now.getTime() - 15 * 60 * 1000).toISOString() }]
  assert.equal(hasActiveRun(staleRunning, now, RUN_LEASE_MS), false)

  const completed = [{ status: 'SUCCESS', started_at: new Date(now.getTime() - 60 * 1000).toISOString() }]
  assert.equal(hasActiveRun(completed, now, RUN_LEASE_MS), false)
})
