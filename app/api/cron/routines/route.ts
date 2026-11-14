import { AUTO_ROUTINES, ROUTINES } from '@/lib/services/routines'
import * as rr from '@/lib/db/routines-repo'
import { isSupabaseConfigured } from '@/lib/db/supabase'
import { runRoutine, ensureRoutines } from '@/lib/services/routine-runner'
import { decideClaim, retryAt, RUN_LEASE_MS } from '@/lib/services/schedule'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * 스케줄러 진입점 (Vercel Cron). 수집 전용 루틴만 돈다 — 알림·매칭은 예약으로 돌지 않는다.
 *
 * 인증은 `CRON_SECRET` 으로만 한다. Vercel Cron 은 `Authorization: Bearer <CRON_SECRET>` 을 붙인다.
 * vercel.json 이 루틴마다 따로 부른다(`?only=<key>`) — 한 호출이 한 루틴만 맡아 함수 시간(300초)을 나눠 쓰지 않는다.
 *
 * 판단(lib/services/schedule)
 *  - 처음 등록: 수집(ingest-notices)만 그 자리에서 한 번 돈다(늦으면 손해가 크다). 그 밖은 다음 예약만 적는다
 *  - 저장된 next_run_at 이 지났으면 한 번 — 잡는 순간 다음 예약으로 옮겨 같은 예약의 두 번째 호출은 잡지 못한다
 *  - 실패하면 2h·4h·8h… 뒤로 물러서 다시(다음 정규 예약을 넘지 않는다)
 *  - 끝 기록 없이 RUNNING 으로 남은 실행(시간 초과)은 10분이 지나면 '중단됨'으로 닫는다
 *
 * 운영·미리보기 배포에서 DB 설정이 없으면 메모리로 돌고 성공이라 말하지 않는다 — 곧장 503.
 */
const RECOVER_ON_FIRST = new Set(['ingest-notices'])

export async function GET(req: Request) {
  const secret = (process.env.CRON_SECRET ?? '').trim()
  if (!secret) {
    return Response.json({ error: '스케줄러가 설정되지 않았습니다.' }, { status: 503 })
  }
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${secret}`) {
    return Response.json({ error: '인증되지 않은 호출입니다.' }, { status: 401 })
  }
  if (process.env.VERCEL_ENV && !isSupabaseConfigured()) {
    console.error('[cron] 저장소 설정 없음 — 수집을 돌리지 않습니다(SUPABASE_URL·SERVICE_ROLE_KEY 존재 여부만 확인).')
    return Response.json({ error: '저장소가 설정되지 않아 수집을 돌리지 않았습니다.', code: 'DB_NOT_CONFIGURED' }, { status: 503 })
  }

  const only = new URL(req.url).searchParams.get('only')
  const keys = AUTO_ROUTINES.filter(k => !only || k === only)
  if (only && !keys.length) return Response.json({ error: `예약으로 돌 수 없는 루틴: ${only}` }, { status: 400 })

  await ensureRoutines()
  const now = new Date()
  const at = now.toISOString()
  const results: { key: string; status: string; summary: string; reason?: string }[] = []

  for (const key of keys) {
    const def = ROUTINES.find(r => r.key === key)
    const row = await rr.getRoutine(key)
    if (!def || !row) continue

    // 시간 초과로 죽은 실행을 닫는다 — 닫지 않으면 신선도 판정이 그 실행을 영영 기다린다
    const stale = await rr.closeStaleRuns(key, new Date(now.getTime() - RUN_LEASE_MS).toISOString())

    const recent = await rr.recentRuns(key, 10)
    const lastDone = recent.find(r => r.status !== 'RUNNING' && r.status !== 'SKIPPED')
    const d = decideClaim({
      cron: def.scheduleCron,
      now,
      nextRunAt: row.next_run_at,
      recoverOnFirst: RECOVER_ON_FIRST.has(key) && !row.last_run_at,
      retrying: lastDone?.status === 'FAILED',
    })
    if (d.kind === 'INIT') {
      await rr.initNextRun(key, d.next)
      results.push({ key, status: 'INITIALIZED', summary: `처음 등록 — 다음 예약 ${d.next}` })
      continue
    }
    if (d.kind === 'NOT_DUE') {
      results.push({ key, status: 'NOT_DUE', summary: `다음 예약 ${d.next}${stale ? ` · 중단된 실행 ${stale}건 닫음` : ''}` })
      continue
    }
    if (!(await rr.claimRun(key, d.expect, d.next, at))) {
      results.push({ key, status: 'NOT_DUE', summary: '같은 예약을 다른 호출이 이미 잡았습니다' })
      continue
    }
    const out = await runRoutine(key, 'SCHEDULE')
    if (out.status === 'FAILED') {
      // 연속 실패 수만큼 물러선다(이번 실패 포함)
      let fails = 1
      for (const r of recent) {
        if (r.status === 'FAILED') fails++
        else if (r.status === 'SUCCESS') break
      }
      await rr.setNextRun(key, retryAt(def.scheduleCron, new Date(), fails))
    }
    results.push({ key, status: out.status, summary: out.summary, reason: d.reason })
  }

  return Response.json({ ran: results.filter(r => r.status === 'SUCCESS' || r.status === 'FAILED').length, results })
}
