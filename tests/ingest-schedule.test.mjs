/**
 * 수집 예약·상태 — 운영에서 실제로 난 일을 다시 만든다.  실행: npm test
 *  - 처음 등록된 루틴이 예약 시각과 무관하게 돌고, 가까운 다른 예약에 또 돌았다(2026-11-13 23:45·11-14 00:15)
 *  - 함수가 끝 기록 없이 죽어 RUNNING 으로 남았다 → 신선도가 '미확인'
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decideClaim, nextOccurrence, prevOccurrence, retryAt, isStaleRun } from '../lib/services/schedule.ts'
import { ingestStatusOf } from '../lib/consumer/data-mode.ts'

const CRON = '0 23 * * *' // 08:00 KST
const at = iso => new Date(iso)

test('처음 등록 — 복구 정책이 없는 루틴은 돌지 않고 다음 예약만 적는다', () => {
  const d = decideClaim({ cron: '0 1 * * *', now: at('2026-11-14T06:00:00Z'), nextRunAt: null, recoverOnFirst: false })
  assert.equal(d.kind, 'INIT')
  assert.equal(d.next, '2026-11-15T01:00:00.000Z')
})

test('처음 등록 — 수집은 한 번 복구하고, 잡는 순간 다음 정규 예약을 적는다', () => {
  const d = decideClaim({ cron: CRON, now: at('2026-11-14T06:00:00Z'), nextRunAt: null, recoverOnFirst: true })
  assert.equal(d.kind, 'RUN')
  assert.equal(d.reason, 'RECOVER_FIRST')
  assert.equal(d.expect, null)
  assert.equal(d.next, '2026-11-14T23:00:00.000Z')
})

test('예약 시각 전 호출은 돌지 않는다', () => {
  const d = decideClaim({ cron: CRON, now: at('2026-11-14T22:30:00Z'), nextRunAt: '2026-11-14T23:00:00.000Z', recoverOnFirst: true })
  assert.equal(d.kind, 'NOT_DUE')
})

test('한 시간 늦은 호출도 한 번 돈다(Hobby Cron 은 그 시간 안 아무 분)', () => {
  const d = decideClaim({ cron: CRON, now: at('2026-11-15T00:05:00Z'), nextRunAt: '2026-11-14T23:00:00.000Z', recoverOnFirst: true })
  assert.equal(d.kind, 'RUN')
  assert.equal(d.reason, 'DUE')
  assert.equal(d.expect, '2026-11-14T23:00:00.000Z')
  assert.equal(d.next, '2026-11-15T23:00:00.000Z')
})

test('같은 예약의 두 번째 호출 — 첫 호출이 next 를 옮긴 뒤에는 돌지 않는다', () => {
  const first = decideClaim({ cron: CRON, now: at('2026-11-14T23:10:00Z'), nextRunAt: '2026-11-14T23:00:00.000Z', recoverOnFirst: false })
  assert.equal(first.kind, 'RUN')
  const second = decideClaim({ cron: CRON, now: at('2026-11-14T23:40:00Z'), nextRunAt: first.next, recoverOnFirst: false })
  assert.equal(second.kind, 'NOT_DUE')
})

test('서로 다른 예약이 이어 와도 같은 날 두 번 돌지 않는다(예전 00:15 재실행 재현)', () => {
  // 23:45 에 처음 복구 실행 → 00:15 의 다른 예약 호출
  const a = decideClaim({ cron: CRON, now: at('2026-11-13T23:45:00Z'), nextRunAt: null, recoverOnFirst: true })
  assert.equal(a.kind, 'RUN')
  const b = decideClaim({ cron: CRON, now: at('2026-11-14T00:15:00Z'), nextRunAt: a.next, recoverOnFirst: true })
  assert.equal(b.kind, 'NOT_DUE')
})

test('실패 뒤 물러섬 — 2h·4h·8h, 다음 정규 예약을 넘지 않는다', () => {
  const now = at('2026-11-14T23:10:00Z')
  assert.equal(retryAt(CRON, now, 1), '2026-11-15T01:10:00.000Z')
  assert.equal(retryAt(CRON, now, 2), '2026-11-15T03:10:00.000Z')
  assert.equal(retryAt(CRON, now, 3), '2026-11-15T07:10:00.000Z')
  assert.equal(retryAt(CRON, now, 9), '2026-11-15T23:00:00.000Z')
  // 14:00 KST(05:00Z) 재시도 호출이 2h 뒤로 물러선 실패를 받는다
  const d = decideClaim({ cron: CRON, now: at('2026-11-15T05:05:00Z'), nextRunAt: retryAt(CRON, now, 1), recoverOnFirst: true, retrying: true })
  assert.equal(d.kind, 'RUN')
  assert.equal(d.reason, 'RETRY')
})

test('끝 기록 없이 남은 실행은 10분 뒤 중단으로 본다', () => {
  assert.equal(isStaleRun('2026-11-14T23:00:00Z', at('2026-11-14T23:05:00Z')), false)
  assert.equal(isStaleRun('2026-11-14T23:00:00Z', at('2026-11-14T23:11:00Z')), true)
})

test('예약 계산 — 다음·이전 예약', () => {
  assert.equal(nextOccurrence(CRON, at('2026-11-14T23:00:00Z')).toISOString(), '2026-11-15T23:00:00.000Z')
  assert.equal(prevOccurrence(CRON, at('2026-11-14T23:00:00Z')).toISOString(), '2026-11-14T23:00:00.000Z')
  assert.equal(prevOccurrence(CRON, at('2026-11-14T22:59:00Z')).toISOString(), '2026-11-13T23:00:00.000Z')
})

const run = (status, detail = {}, summary = '') => ({ status, started_at: '2026-11-14T23:00:00Z', finished_at: status === 'RUNNING' ? null : '2026-11-14T23:02:00Z', summary, detail })
const SRC = (ok = [true, true, true], inserted = 3) => ({
  sources: [
    { source: 'APPLYHOME', ok: ok[0], fetched: 10, inserted },
    { source: 'LH', ok: ok[1], fetched: 20, inserted: 0 },
    { source: 'MYHOME', ok: ok[2], fetched: 5, inserted: 0 },
  ],
  partial: ok.includes(false),
  inserted,
})

test('수집 상태 — 정상·새 공고 없음·부분 실패·전체 실패·중단·도는 중·기록 없음', () => {
  assert.equal(ingestStatusOf([run('SUCCESS', SRC())]).state, 'OK')
  assert.equal(ingestStatusOf([run('SUCCESS', SRC([true, true, true], 0))]).state, 'NO_NEW')
  const p = ingestStatusOf([run('SUCCESS', SRC([true, false, true]))])
  assert.equal(p.state, 'PARTIAL')
  assert.equal(p.sources.find(s => s.source === 'LH').lastStatus, 'FAILED')
  assert.equal(ingestStatusOf([run('FAILED', {}, '실패: 모든 출처 실패')]).state, 'FAILED')
  assert.equal(ingestStatusOf([run('FAILED', {}, '중단됨 — 끝 기록 없이 멈췄습니다')]).state, 'INTERRUPTED')
  assert.equal(ingestStatusOf([run('RUNNING')]).state, 'RUNNING')
  assert.equal(ingestStatusOf([]).state, 'NONE')
})

test('출처별 마지막 정상 수집 시각 — 이번에 실패한 출처는 그 전 성공 시각', () => {
  const older = { ...run('SUCCESS', SRC()), finished_at: '2026-11-13T23:02:00Z' }
  const s = ingestStatusOf([run('SUCCESS', SRC([true, false, true])), older])
  const lh = s.sources.find(x => x.source === 'LH')
  assert.equal(lh.lastStatus, 'FAILED')
  assert.equal(lh.lastOkAt, '2026-11-13T23:02:00Z')
  assert.equal(s.sources.find(x => x.source === 'APPLYHOME').lastOkAt, '2026-11-14T23:02:00Z')
})
