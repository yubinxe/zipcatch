/**
 * 타임머신 — 날짜별 상태 판정. 아래 공고는 테스트용으로 손으로 쓴 것이다.  실행: npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stateOn, readDay, timelineRange, series, addDays, diffDays } from '../lib/consumer/timeline-core.ts'

const N = [
  { id: 'a', name: 'A', province: '서울', kind: 'SALE', start: '2026-10-01', end: '2026-10-10' },
  { id: 'b', name: 'B', province: '서울', kind: 'RENT', start: '2026-10-08', end: '2026-10-20' },
  { id: 'c', name: 'C', province: '경기', kind: 'RENT', start: null, end: '2026-10-15' },
  { id: 'd', name: 'D', province: '부산', kind: 'SALE', start: '2026-10-05', end: null },
]

test('상태: 시작 전·접수 중·마감·시작일 미기재·마감일 없음', () => {
  assert.equal(stateOn(N[0], '2026-09-30'), 'UPCOMING')
  assert.equal(stateOn(N[0], '2026-10-01'), 'OPEN')
  assert.equal(stateOn(N[0], '2026-10-10'), 'OPEN')
  assert.equal(stateOn(N[0], '2026-10-11'), 'CLOSED')
  assert.equal(stateOn(N[2], '2026-10-01'), 'OPEN_UNDATED')
  assert.equal(stateOn(N[3], '2026-10-06'), 'UNKNOWN')
  // 시작일이 없으면 처음 저장한 날 전은 모른다
  const late = { start: null, end: '2026-10-20', seen: '2026-10-12' }
  assert.equal(stateOn(late, '2026-10-11'), 'UNKNOWN')
  assert.equal(stateOn(late, '2026-10-12'), 'OPEN_UNDATED')
})

test('하루 읽기: 합계·광역·시작·마감', () => {
  const r = readDay(N, '2026-10-08')
  assert.equal(r.open, 2)
  assert.equal(r.undated, 1)
  assert.equal(r.upcoming, 0)
  assert.deepEqual(r.byProvince['서울'], { open: 2, upcoming: 0 })
  assert.deepEqual(r.opening, ['b'])
  assert.equal(readDay(N, '2026-10-10').closing[0], 'a')
  // 마감일 없는 공고는 어느 날에도 세지 않는다
  assert.equal(readDay(N, '2026-10-06').byProvince['부산'], undefined)
})

test('구간: 원문 일정 범위, 오늘 기준 앞뒤로 자른다', () => {
  assert.deepEqual(timelineRange(N, '2026-10-12'), { from: '2026-10-01', to: '2026-10-20' })
  assert.deepEqual(timelineRange(N, '2026-10-12', 5), { from: '2026-10-07', to: '2026-10-17' })
})

test('날짜 계산과 막대 계열', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01')
  assert.equal(diffDays('2026-10-01', '2026-10-20'), 19)
  const s = series(N, '2026-10-01', '2026-10-03')
  assert.equal(s.length, 3)
  assert.deepEqual(s[0], { day: '2026-10-01', open: 2, upcoming: 1 })
})
