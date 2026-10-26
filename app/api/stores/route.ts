import { NextRequest } from 'next/server'
import { fetchStoresInRadius } from '@/lib/adapters/sbiz-stores'

export const dynamic = 'force-dynamic'

/**
 * 공고 자리 주변의 생활 상권.
 *
 * 아무 좌표나 받으면 우리 키로 전국을 훑는 창구가 된다. 대한민국 안의 좌표만,
 * 반경은 1km 까지만 받는다. 좌표는 소수 넷째 자리(약 10m)로 맞춰 캐시가 모이게 한다.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const lat = Number(sp.get('lat'))
  const lng = Number(sp.get('lng'))
  const radius = Math.min(1000, Math.max(100, Number(sp.get('radius') ?? 500) || 500))

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 33 || lat > 39 || lng < 124 || lng > 132) {
    return Response.json({ ok: false, reason: '좌표가 올바르지 않습니다.' }, { status: 400 })
  }

  const round = (n: number) => Math.round(n * 1e4) / 1e4
  const result = await fetchStoresInRadius(round(lat), round(lng), radius)
  if (!result.ok) return Response.json(result, { status: 502 })
  return Response.json({ ok: true, ...result.read, source: '소상공인시장진흥공단 상가(상권)정보 · 공공데이터포털' })
}
