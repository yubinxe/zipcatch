import * as rr from '@/lib/db/routines-repo'
import { ROUTINES, findRoutine } from '@/lib/services/routines'

/**
 * 루틴 실행기.
 *
 * 실행은 언제나 이력을 먼저 열고 시작한다 — 도중에 죽어도 "돌다 말았다"가 남는다.
 * 시작 기록 없이 돌리면, 터진 실행은 아무 흔적 없이 사라진다.
 */

/** cron 표현식에서 다음 실행 시각을 구한다 (분·시·요일만 쓰는 단순 표현식 기준) */
export function nextRunAt(cron: string, from = new Date()): string | null {
  const [min, hour, , , dow] = cron.trim().split(/\s+/)
  const m = Number(min)
  const h = Number(hour)
  if (!Number.isFinite(m) || !Number.isFinite(h)) return null

  // 요일 제한 (예: 1-5 = 월~금). UTC 기준으로 계산한다.
  const allowed = (() => {
    if (!dow || dow === '*') return null
    const set = new Set<number>()
    for (const part of dow.split(',')) {
      const range = part.split('-').map(Number)
      if (range.length === 2 && range.every(Number.isFinite)) {
        for (let d = range[0]; d <= range[1]; d++) set.add(d % 7)
      } else if (Number.isFinite(range[0])) set.add(range[0] % 7)
    }
    return set
  })()

  const next = new Date(from)
  next.setUTCSeconds(0, 0)
  next.setUTCHours(h, m)
  if (next <= from) next.setUTCDate(next.getUTCDate() + 1)

  // 요일이 맞을 때까지 하루씩 민다 (최대 한 주)
  for (let i = 0; i < 7 && allowed && !allowed.has(next.getUTCDay()); i++) {
    next.setUTCDate(next.getUTCDate() + 1)
  }
  return next.toISOString()
}

export interface RunOutcome {
  run: rr.RoutineRunRow | null
  status: rr.RunStatus
  summary: string
  /** 일부 출처만 실패했다 — 성공이지만 다시 돌 이유가 있다 */
  partial?: boolean
}

/**
 * 루틴 하나를 돌린다.
 *
 * `force` 가 아니면 꺼둔 루틴은 SKIPPED 로 남긴다 —
 * 예약이 왔는데 꺼져 있었다는 사실도 이력이다.
 */
export async function runRoutine(
  key: string,
  trigger: rr.RoutineRunRow['trigger'],
  opts: { force?: boolean } = {},
): Promise<RunOutcome> {
  const def = findRoutine(key)
  if (!def) return { run: null, status: 'FAILED', summary: `알 수 없는 루틴: ${key}` }

  const routine = await rr.getRoutine(key)
  if (!routine) return { run: null, status: 'FAILED', summary: '루틴이 등록되지 않았습니다.' }

  const run = await rr.startRun(routine, trigger)

  if (!routine.enabled && !opts.force) {
    const summary = '꺼져 있어 건너뜀'
    await rr.finishRun(run.id, { status: 'SKIPPED', summary, detail: {}, startedAt: run.started_at })
    return { run, status: 'SKIPPED', summary }
  }

  try {
    const result = await def.run()
    await rr.finishRun(run.id, {
      status: 'SUCCESS',
      summary: result.summary,
      detail: { ...result.detail, actionable: result.actionable },
      startedAt: run.started_at,
    })
    await rr.markRoutineRan(key, run.started_at, nextRunAt(def.scheduleCron))
    return { run, status: 'SUCCESS', summary: result.summary, partial: result.detail?.partial === true }
  } catch (err) {
    // 실패를 삼키지 않는다. 사유를 그대로 이력에 남긴다.
    const message = err instanceof Error ? err.message : String(err)
    await rr.finishRun(run.id, {
      status: 'FAILED',
      summary: `실패: ${message}`,
      detail: { error: message },
      startedAt: run.started_at,
    })
    await rr.markRoutineRan(key, run.started_at, nextRunAt(def.scheduleCron))
    return { run, status: 'FAILED', summary: message }
  }
}

/** 코드에 있는 정의를 저장소에 맞추고 현재 상태를 돌려준다 */
export async function ensureRoutines() {
  return rr.syncRoutineDefs(
    ROUTINES.map(r => ({
      key: r.key,
      name: r.name,
      purpose: r.purpose,
      instruction: r.instruction,
      scheduleCron: r.scheduleCron,
      scheduleLabel: r.scheduleLabel,
    })),
  )
}
