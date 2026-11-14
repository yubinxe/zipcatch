import { randomUUID } from 'crypto'
import { getSupabase } from './supabase'

/**
 * 루틴 정의와 실행 이력 저장소.
 *
 * 다른 저장소와 같은 규칙이다 — Supabase 가 없으면 메모리로 떨어지고 앱은 죽지 않는다.
 * 다만 이력은 메모리에 있으면 의미가 옅어지므로 화면에 그 사실을 적는다.
 */

export interface RoutineRow {
  id: string
  key: string
  name: string
  purpose: string
  instruction: string
  schedule_cron: string
  schedule_label: string
  enabled: boolean
  last_run_at: string | null
  next_run_at: string | null
  created_at: string
  updated_at: string
}

export type RunStatus = 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED'

export interface RoutineRunRow {
  id: string
  routine_id: string
  routine_key: string
  trigger: 'SCHEDULE' | 'MANUAL'
  status: RunStatus
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  summary: string | null
  detail: Record<string, unknown>
}

interface Mem {
  routines: RoutineRow[]
  runs: RoutineRunRow[]
}

const g = globalThis as unknown as { __jipcatchRoutines?: Mem }
function mem(): Mem {
  if (!g.__jipcatchRoutines) g.__jipcatchRoutines = { routines: [], runs: [] }
  return g.__jipcatchRoutines
}

const now = () => new Date().toISOString()

export interface RoutineSeed {
  key: string
  name: string
  purpose: string
  instruction: string
  scheduleCron: string
  scheduleLabel: string
}

/**
 * 코드에 있는 루틴 정의를 저장소에 맞춘다.
 *
 * 이름·목적·지침·주기는 코드가 원본이므로 매번 덮어쓴다.
 * `enabled` 는 운영자가 화면에서 끈 값이므로 **건드리지 않는다.**
 */
export async function syncRoutineDefs(defs: RoutineSeed[]): Promise<RoutineRow[]> {
  const sb = getSupabase()
  const stamp = now()

  if (!sb) {
    const s = mem()
    for (const d of defs) {
      const found = s.routines.find(r => r.key === d.key)
      if (found) {
        Object.assign(found, {
          name: d.name,
          purpose: d.purpose,
          instruction: d.instruction,
          schedule_cron: d.scheduleCron,
          schedule_label: d.scheduleLabel,
          updated_at: stamp,
        })
      } else {
        s.routines.push({
          id: randomUUID(),
          key: d.key,
          name: d.name,
          purpose: d.purpose,
          instruction: d.instruction,
          schedule_cron: d.scheduleCron,
          schedule_label: d.scheduleLabel,
          enabled: true,
          last_run_at: null,
          next_run_at: null,
          created_at: stamp,
          updated_at: stamp,
        })
      }
    }
    return s.routines
  }

  const { error } = await sb.from('routines').upsert(
    defs.map(d => ({
      key: d.key,
      name: d.name,
      purpose: d.purpose,
      instruction: d.instruction,
      schedule_cron: d.scheduleCron,
      schedule_label: d.scheduleLabel,
      updated_at: stamp,
    })),
    { onConflict: 'key' },
  )
  if (error) throw new Error(`syncRoutineDefs: ${error.message}`)

  return listRoutines()
}

export async function listRoutines(): Promise<RoutineRow[]> {
  const sb = getSupabase()
  if (!sb) return mem().routines
  const { data, error } = await sb.from('routines').select('*').order('created_at')
  if (error) throw new Error(`listRoutines: ${error.message}`)
  return (data ?? []) as RoutineRow[]
}

export async function getRoutine(key: string): Promise<RoutineRow | null> {
  const sb = getSupabase()
  if (!sb) return mem().routines.find(r => r.key === key) ?? null
  const { data, error } = await sb.from('routines').select('*').eq('key', key).maybeSingle()
  if (error) throw new Error(`getRoutine: ${error.message}`)
  return data as RoutineRow | null
}

export async function setRoutineEnabled(key: string, enabled: boolean) {
  const sb = getSupabase()
  if (!sb) {
    const r = mem().routines.find(x => x.key === key)
    if (r) {
      r.enabled = enabled
      r.updated_at = now()
    }
    return r ?? null
  }
  const { data, error } = await sb
    .from('routines')
    .update({ enabled, updated_at: now() })
    .eq('key', key)
    .select()
    .maybeSingle()
  if (error) throw new Error(`setRoutineEnabled: ${error.message}`)
  return data as RoutineRow | null
}

export async function markRoutineRan(key: string, at: string, next: string | null) {
  const sb = getSupabase()
  if (!sb) {
    const r = mem().routines.find(x => x.key === key)
    if (r) {
      r.last_run_at = at
      r.next_run_at = next
    }
    return
  }
  const { error } = await sb
    .from('routines')
    .update({ last_run_at: at, next_run_at: next, updated_at: now() })
    .eq('key', key)
  if (error) throw new Error(`markRoutineRan: ${error.message}`)
}

/**
 * 예약 실행 한 번을 잡는다 — 저장된 next_run_at 이 지금 값(expect)과 같을 때만 다음 예약(next)으로 옮긴다.
 * 같은 예약에 두 호출이 겹쳐도 한 호출만 성공한다(조건부 갱신). expect=null 은 '처음 등록' 자리.
 * 판단은 lib/services/schedule.decideClaim 이 한다 — 여기서는 저장만.
 */
export async function claimRun(key: string, expect: string | null, next: string, at: string): Promise<boolean> {
  const sb = getSupabase()
  if (!sb) {
    const r = mem().routines.find(x => x.key === key)
    if (!r || (r.next_run_at ?? null) !== expect) return false
    r.next_run_at = next
    r.last_run_at = at
    return true
  }
  let q = sb.from('routines').update({ next_run_at: next, last_run_at: at, updated_at: now() }).eq('key', key)
  q = expect === null ? q.is('next_run_at', null) : q.eq('next_run_at', expect)
  const { data, error } = await q.select('key')
  if (error) throw new Error(`claimRun: ${error.message}`)
  return (data ?? []).length > 0
}

/** 돌지 않고 다음 예약만 적는다(처음 등록) — 이미 누가 적었으면 그대로 둔다 */
export async function initNextRun(key: string, next: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) {
    const r = mem().routines.find(x => x.key === key)
    if (r && !r.next_run_at) r.next_run_at = next
    return
  }
  const { error } = await sb.from('routines').update({ next_run_at: next, updated_at: now() }).eq('key', key).is('next_run_at', null)
  if (error) throw new Error(`initNextRun: ${error.message}`)
}

/** 실패 뒤 물러섰다 다시 돌 시각을 적는다 */
export async function setNextRun(key: string, next: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) {
    const r = mem().routines.find(x => x.key === key)
    if (r) r.next_run_at = next
    return
  }
  const { error } = await sb.from('routines').update({ next_run_at: next, updated_at: now() }).eq('key', key)
  if (error) throw new Error(`setNextRun: ${error.message}`)
}

/**
 * RUNNING 으로 남은 실행을 '중단됨'으로 닫는다 — 함수가 시간 초과로 죽으면 끝 기록을 남기지 못한다.
 * 닫지 않으면 신선도 판정이 그 실행을 영영 기다리고, 실패가 보이지 않는다.
 */
export async function closeStaleRuns(key: string, olderThan: string): Promise<number> {
  const fields = { status: 'FAILED' as RunStatus, summary: '중단됨 — 끝 기록 없이 멈췄습니다(함수 시간 초과 추정)', finished_at: now() }
  const sb = getSupabase()
  if (!sb) {
    let n = 0
    for (const r of mem().runs) if (r.routine_key === key && r.status === 'RUNNING' && r.started_at < olderThan) {
      Object.assign(r, fields)
      n++
    }
    return n
  }
  const { data, error } = await sb
    .from('routine_runs')
    .update(fields)
    .eq('routine_key', key)
    .eq('status', 'RUNNING')
    .lt('started_at', olderThan)
    .select('id')
  if (error) throw new Error(`closeStaleRuns: ${error.message}`)
  return (data ?? []).length
}

/** 이 루틴의 최근 실행 — 연속 실패 수·출처별 마지막 성공을 셀 때 */
export async function recentRuns(key: string | string[], limit = 20): Promise<RoutineRunRow[]> {
  const keys = Array.isArray(key) ? key : [key]
  const sb = getSupabase()
  if (!sb) return mem().runs.filter(r => keys.includes(r.routine_key)).slice(0, limit)
  const { data, error } = await sb
    .from('routine_runs')
    .select('*')
    .in('routine_key', keys)
    .order('started_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`recentRuns: ${error.message}`)
  return (data ?? []) as RoutineRunRow[]
}

export async function startRun(
  routine: RoutineRow,
  trigger: RoutineRunRow['trigger'],
): Promise<RoutineRunRow> {
  const row: RoutineRunRow = {
    id: randomUUID(),
    routine_id: routine.id,
    routine_key: routine.key,
    trigger,
    status: 'RUNNING',
    started_at: now(),
    finished_at: null,
    duration_ms: null,
    summary: null,
    detail: {},
  }

  const sb = getSupabase()
  if (!sb) {
    mem().runs.unshift(row)
    return row
  }
  const { data, error } = await sb
    .from('routine_runs')
    .insert({
      routine_id: row.routine_id,
      routine_key: row.routine_key,
      trigger: row.trigger,
      status: row.status,
      started_at: row.started_at,
    })
    .select()
    .single()
  if (error) throw new Error(`startRun: ${error.message}`)
  return data as RoutineRunRow
}

export async function finishRun(
  id: string,
  patch: { status: RunStatus; summary: string; detail: Record<string, unknown>; startedAt: string },
) {
  const finished = now()
  const duration = Date.parse(finished) - Date.parse(patch.startedAt)
  const fields = {
    status: patch.status,
    summary: patch.summary,
    detail: patch.detail,
    finished_at: finished,
    duration_ms: Number.isFinite(duration) ? duration : null,
  }

  const sb = getSupabase()
  if (!sb) {
    const r = mem().runs.find(x => x.id === id)
    if (r) Object.assign(r, fields)
    return r ?? null
  }
  const { data, error } = await sb.from('routine_runs').update(fields).eq('id', id).select().maybeSingle()
  if (error) throw new Error(`finishRun: ${error.message}`)
  return data as RoutineRunRow | null
}

export async function listRuns(opts: { routineId?: string; limit?: number } = {}) {
  const { routineId, limit = 30 } = opts
  const sb = getSupabase()
  if (!sb) {
    return mem()
      .runs.filter(r => (routineId ? r.routine_id === routineId : true))
      .slice(0, limit)
  }
  let q = sb.from('routine_runs').select('*')
  if (routineId) q = q.eq('routine_id', routineId)
  const { data, error } = await q.order('started_at', { ascending: false }).limit(limit)
  if (error) throw new Error(`listRuns: ${error.message}`)
  return (data ?? []) as RoutineRunRow[]
}
