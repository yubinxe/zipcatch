import { NextRequest } from 'next/server'
import { readSupply } from '@/lib/services/supply-read'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * 공급 판독.
 *
 * 끝난 공고의 접수 결과를 훑어 "어디가 비었고 누가 가져갔는지"를 돌려준다.
 * 앞일을 점치지 않는다 — 지난 기록을 읽어 줄 뿐이고, 화면도 그렇게 적는다.
 */
export async function GET(req: NextRequest) {
  const pages = Math.min(10, Math.max(1, Number(req.nextUrl.searchParams.get('pages') ?? 6) || 6))
  try {
    const read = await readSupply({ pages })
    return Response.json(read)
  } catch (err) {
    return Response.json(
      { ok: false, reason: err instanceof Error ? err.message : '판독에 실패했습니다.' },
      { status: 200 },
    )
  }
}
