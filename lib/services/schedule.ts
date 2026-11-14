/**
 * 예약 판단 — 순수 함수(시험이 시각을 넣어 확인한다). 저장소·네트워크를 부르지 않는다.
 *
 * 한 루틴의 상태는 `next_run_at` 하나로 말한다 — '아직 돌지 않은, 다음에 돌 예약 시각'.
 *
 *  - 처음 등록(next_run_at 없음)
 *      복구 정책이 있는 루틴(수집처럼 늦으면 손해가 큰 것)은 지금 한 번 돈다.
 *      그 밖은 돌지 않고 다음 예약 시각만 적는다 — 등록된 순간이 예약 시각은 아니다.
 *  - next_run_at ≤ 지금      돈다(늦게 불렸어도 한 번). 잡는 순간 next_run_at 을 다음 예약으로 옮긴다
 *                            → 같은 예약에 두 번째 호출이 와도 잡지 못한다(조건부 갱신).
 *  - next_run_at > 지금       돌지 않는다.
 *  - 실패                    다음 예약을 기다리지 않고 물러서서 다시(2h·4h·8h…, 다음 예약을 넘지 않게).
 *  - RUNNING 으로 남은 실행   함수가 시간 초과로 죽은 것 — 일정 시간(lease)이 지나면 '중단됨'으로 닫는다.
 */

/** 분·시·요일만 쓰는 cron 의 다음 예약 시각(UTC) — from 보다 엄격히 뒤 */
export function nextOccurrence(cron: string, from: Date): Date | null {
  const [min, hour, , , dow] = cron.trim().split(/\s+/)
  const m = Number(min)
  const h = Number(hour)
  if (!Number.isFinite(m) || !Number.isFinite(h)) return null
  const allowed = dowSet(dow)
  const next = new Date(from)
  next.setUTCSeconds(0, 0)
  next.setUTCHours(h, m)
  if (next <= from) next.setUTCDate(next.getUTCDate() + 1)
  for (let i = 0; i < 7 && allowed && !allowed.has(next.getUTCDay()); i++) next.setUTCDate(next.getUTCDate() + 1)
  return next
}

/** 지금 이전(같은 시각 포함)의 가장 가까운 예약 시각 */
export function prevOccurrence(cron: string, at: Date): Date | null {
  const n = nextOccurrence(cron, new Date(at.getTime() - 8 * 86_400_000))
  if (!n) return null
  let prev: Date | null = null
  let cur: Date | null = n
  for (let i = 0; i < 16 && cur && cur <= at; i++) {
    prev = cur
    cur = nextOccurrence(cron, cur)
  }
  return prev
}

function dowSet(dow: string | undefined): Set<number> | null {
  if (!dow || dow === '*') return null
  const set = new Set<number>()
  for (const part of dow.split(',')) {
    const range = part.split('-').map(Number)
    if (range.length === 2 && range.every(Number.isFinite)) for (let d = range[0]; d <= range[1]; d++) set.add(d % 7)
    else if (Number.isFinite(range[0])) set.add(range[0] % 7)
  }
  return set
}

export type ClaimDecision =
  /** 지금 돈다. expect 는 잡을 때 조건(지금 저장된 next_run_at), next 는 잡으면서 적을 다음 예약 */
  | { kind: 'RUN'; expect: string | null; next: string; occurrence: string; reason: 'DUE' | 'RECOVER_FIRST' | 'RETRY' }
  /** 돌지 않고 다음 예약만 적는다(처음 등록) */
  | { kind: 'INIT'; next: string }
  | { kind: 'NOT_DUE'; next: string }

export function decideClaim(input: {
  cron: string
  now: Date
  /** 저장된 next_run_at(ISO) — 처음 등록이면 null */
  nextRunAt: string | null
  /** 한 번도 성공한 적이 없고 늦으면 손해가 큰 루틴인가 — 처음 등록 때 한 번 돈다 */
  recoverOnFirst: boolean
  /** 직전이 실패라 물러섰다 다시 도는 중인가(next_run_at 이 정규 예약이 아닌 경우) */
  retrying?: boolean
}): ClaimDecision {
  const { cron, now } = input
  const next = nextOccurrence(cron, now)
  if (!next) return { kind: 'NOT_DUE', next: now.toISOString() }
  const nextIso = next.toISOString()
  if (!input.nextRunAt) {
    if (input.recoverOnFirst)
      return { kind: 'RUN', expect: null, next: nextIso, occurrence: (prevOccurrence(cron, now) ?? now).toISOString(), reason: 'RECOVER_FIRST' }
    return { kind: 'INIT', next: nextIso }
  }
  const due = Date.parse(input.nextRunAt)
  if (!Number.isFinite(due) || due > now.getTime()) return { kind: 'NOT_DUE', next: input.nextRunAt }
  return { kind: 'RUN', expect: input.nextRunAt, next: nextIso, occurrence: input.nextRunAt, reason: input.retrying ? 'RETRY' : 'DUE' }
}

/** 실패 뒤 다시 돌 시각 — 2h · 4h · 8h … 다음 정규 예약을 넘지 않는다 */
export function retryAt(cron: string, now: Date, consecutiveFailures: number): string {
  const n = Math.max(1, consecutiveFailures)
  const back = new Date(now.getTime() + Math.min(24, 2 * 2 ** (n - 1)) * 3_600_000)
  const regular = nextOccurrence(cron, now)
  return (regular && regular < back ? regular : back).toISOString()
}

/** RUNNING 으로 남은 실행을 '중단됨'으로 닫을 때가 됐는가 — 함수 최대 시간(300초)의 두 배 */
export const RUN_LEASE_MS = 10 * 60 * 1000
export const isStaleRun = (startedAt: string, now: Date) => now.getTime() - Date.parse(startedAt) > RUN_LEASE_MS
