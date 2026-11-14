import { findOfficialProperty, isNoticeId, OfficialReadError } from '@/lib/consumer/official'
import { verifiedForNotice } from '@/lib/consumer/complex-visualization'
import { resolveNoticeLocation } from '@/lib/consumer/location'
import { resolveSiteGeometry } from '@/lib/consumer/site-resolver'
import { NEIGHBORHOOD_RADIUS } from '@/lib/consumer/neighborhood'
import { coverTiles } from '@/lib/consumer/spatial-tiles'
import manifest from '@/public/spatial/v1/manifest.json'

/**
 * 공고 주변 공간 자산의 목록 — 무엇을 읽으면 되는지만 알려 준다(자산 자체는 정적 파일·CDN).
 *
 * 바깥 지도 서버를 부르지 않는다. 자리를 한 점(필지·주소) 또는 범위(공고명)로 정할 수 있는 공고만
 * 동네로 내려간다 — 시·군·구나 시·도까지만 아는 공고에 어느 동네를 보여 주면 거짓이다(409).
 *
 * 응답
 *  - tiles: 있는 자산('/spatial/v1/15/x/y.json') · missing: 아직 만들지 않은 자리(scripts/spatial/build_tiles.py 가 채운다)
 *  - available: 덮어야 할 자리의 자산이 하나라도 있는가 — 없으면 화면이 오래 기다리지 않고 지역 무대로 둔다
 */
export const dynamic = 'force-dynamic'

const HAVE = new Set<string>(manifest.tiles)

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!isNoticeId(id)) return Response.json({ error: '공고를 찾을 수 없습니다.', code: 'NOT_FOUND' }, { status: 404 })
  try {
    const property = await findOfficialProperty(id)
    if (!property) return Response.json({ error: '공고를 찾을 수 없습니다.', code: 'NOT_FOUND' }, { status: 404 })
    const hit = verifiedForNotice({ id: property.id, name: property.name, announcementId: property.announcementId })
    const site = await resolveSiteGeometry(hit)
    const loc = resolveNoticeLocation(property, { parcel: site.parcel })
    const pinpoint = loc.provenance === 'PARCEL_CONFIRMED' || loc.provenance === 'ADDRESS_GEOCODED'
    if (!(pinpoint || loc.provenance === 'NAME_GEOCODED') || !loc.point) {
      return Response.json(
        { error: '이 공고는 동네 수준의 자리를 정할 수 없습니다.', code: 'NOT_ELIGIBLE', provenance: loc.provenance },
        { status: 409 },
      )
    }
    const radiusM = pinpoint ? NEIGHBORHOOD_RADIUS.pinpoint : NEIGHBORHOOD_RADIUS.approximate
    const want = coverTiles(loc.point.lat, loc.point.lng, radiusM)
    const tiles = want.filter(k => HAVE.has(k))
    return Response.json(
      {
        origin: loc.point,
        radiusM,
        provenance: loc.provenance,
        uncertaintyM: loc.uncertaintyM,
        available: tiles.length > 0,
        base: `/spatial/${manifest.version}`,
        tiles,
        missing: want.filter(k => !HAVE.has(k)),
        source: manifest.source,
        build: manifest.build,
        attribution: manifest.attribution,
        license: manifest.license,
      },
      { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400' } },
    )
  } catch (err) {
    const readFailed = err instanceof OfficialReadError
    return Response.json({ error: '공간 정보를 불러오지 못했습니다.', code: readFailed ? 'READ_FAILED' : 'ERROR' }, { status: readFailed ? 503 : 500 })
  }
}
