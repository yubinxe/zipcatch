import { findOfficialProperty, isNoticeId, OfficialReadError } from '@/lib/consumer/official'
import { verifiedForNotice } from '@/lib/consumer/complex-visualization'
import { resolveNoticeLocation } from '@/lib/consumer/location'
import { resolveSiteGeometry } from '@/lib/consumer/site-resolver'
import { fetchNeighborhood } from '@/lib/consumer/neighborhood'

/**
 * 공고 주변의 공개 지도 자료(건물 윤곽·길·물·공원) — 읽기만 한다.
 *
 * 자리를 한 점(필지·주소) 또는 범위(공고명)로 정할 수 있는 공고만 받는다. 시·군·구나 시·도까지만
 * 아는 공고는 동네로 내려가지 않는다 — 그 자리를 모르는 채 어느 동네를 보여 주면 거짓이다(409).
 */
// force-dynamic 을 두지 않는다 — 그러면 아래 바깥 요청의 30일 캐시(next.revalidate)가 꺼진다.
// 이 길은 공고 id 를 받으므로 어차피 요청마다 돈다.
export const maxDuration = 30

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!isNoticeId(id)) return Response.json({ error: '공고를 찾을 수 없습니다.', code: 'NOT_FOUND' }, { status: 404 })
  let point: { lat: number; lng: number } | null = null
  let uncertaintyM: number | null = null
  let provenance = 'UNKNOWN'
  try {
    const property = await findOfficialProperty(id)
    if (!property) return Response.json({ error: '공고를 찾을 수 없습니다.', code: 'NOT_FOUND' }, { status: 404 })
    const hit = verifiedForNotice({ id: property.id, name: property.name, announcementId: property.announcementId })
    const site = await resolveSiteGeometry(hit)
    const loc = resolveNoticeLocation(property, { parcel: site.parcel })
    provenance = loc.provenance
    if (!['PARCEL_CONFIRMED', 'ADDRESS_GEOCODED', 'NAME_GEOCODED'].includes(loc.provenance) || !loc.point) {
      return Response.json(
        { error: '이 공고는 동네 수준의 자리를 정할 수 없습니다.', code: 'NOT_ELIGIBLE', provenance: loc.provenance },
        { status: 409 },
      )
    }
    point = loc.point
    uncertaintyM = loc.uncertaintyM
  } catch (err) {
    const readFailed = err instanceof OfficialReadError
    return Response.json({ error: '공간 정보를 불러오지 못했습니다.', code: readFailed ? 'READ_FAILED' : 'ERROR' }, { status: readFailed ? 503 : 500 })
  }

  try {
    // 공고명 좌표는 범위가 넓다 — 그 범위를 다 덮게 조금 더 넓게 받는다
    const data = await fetchNeighborhood(point.lat, point.lng, provenance === 'NAME_GEOCODED' ? 900 : 450)
    return Response.json(
      { ...data, provenance, uncertaintyM },
      { headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' } },
    )
  } catch (err) {
    return Response.json(
      { error: '주변 지도 자료를 받지 못했습니다.', code: 'SOURCE_UNAVAILABLE', detail: err instanceof Error ? err.message.slice(0, 160) : null },
      { status: 502 },
    )
  }
}
