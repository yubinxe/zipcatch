import { AUTO_ROUTINES, ROUTINES } from '@/lib/services/routines'
import * as rr from '@/lib/db/routines-repo'
import { runRoutine, nextRunAt, ensureRoutines } from '@/lib/services/routine-runner'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * 스케줄러 진입점 (Vercel Cron).
 *
 * 인증은 `CRON_SECRET` 으로만 한다. 이 경로는 수집 전용 루틴만 돌린다(알림 없음).
 * Vercel Cron 은 `Authorization: Bearer <CRON_SECRET>` 을 붙여 호출한다.
 */
export async function GET(req: Request) {
  const secret = (process.env.CRON_SECRET ?? '').trim()
  if (!secret) {
    return Response.json({ error: '스케줄러가 설정되지 않았습니다.' }, { status: 503 })
  }
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${secret}`) {
    return Response.json({ error: '인증되지 않은 호출입니다.' }, { status: 401 })
  }

  await ensureRoutines()

  /*
   * 예약은 저장된 다음 실행 시각으로 판단한다(rr.claimDue). 알림을 낼 수 있는 루틴은 예약으로 돌리지
   * 않는다 — AUTO_ROUTINES(수집·좌표 채우기)만. 루틴마다 결과(성공·실패·건너뜀)를 그대로 돌려준다.
   */
  const now = new Date()
  const at = now.toISOString()
  const results: { key: string; status: string; summary: string }[] = []
  for (const key of AUTO_ROUTINES) {
    const def = ROUTINES.find(r => r.key === key)
    if (!def) continue
    const claimed = await rr.claimDue(key, at, nextRunAt(def.scheduleCron, now))
    if (!claimed) {
      results.push({ key, status: 'NOT_DUE', summary: '예약 시각 전이거나 이미 돌았습니다' })
      continue
    }
    const out = await runRoutine(key, 'SCHEDULE')
    results.push({ key, status: out.status, summary: out.summary })
  }

  return Response.json({ ran: results.filter(r => r.status !== 'NOT_DUE').length, results })
}
