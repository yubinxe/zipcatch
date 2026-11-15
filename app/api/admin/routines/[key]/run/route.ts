import { isAdminRequest } from '@/lib/admin/auth'
import { runRoutine } from '@/lib/services/routine-runner'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** 지금 실행 — 꺼져 있어도 수동 실행은 돈다 */
export async function POST(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  if (!(await isAdminRequest())) {
    return Response.json({ error: '운영자 인증이 필요합니다.' }, { status: 401 })
  }
  const { key } = await ctx.params
  const outcome = await runRoutine(key, 'MANUAL', { force: true })
  // 실패를 200 으로 감추지 않는다 — 실패 502, 일부 출처 실패 207, 꺼져 건너뜀 409
  const status = outcome.status === 'FAILED' ? 502 : outcome.partial ? 207 : outcome.status === 'SKIPPED' ? 409 : 200
  return Response.json(outcome, { status })
}
