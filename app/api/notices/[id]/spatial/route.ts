import { findOfficialProperty, isNoticeId, OfficialReadError } from '@/lib/consumer/official'
import { verifiedForNotice } from '@/lib/consumer/complex-visualization'
import { resolveSpatial } from '@/lib/consumer/spatial-capability'
import { coordInputOf, resolveNoticeLocation, type LocationProvenance } from '@/lib/consumer/location'
import { resolveSiteGeometry, type SiteGeometryKind } from '@/lib/consumer/site-resolver'

/**
 * 공고 하나의 공간 자료 — 탐험을 열기 전에 '무엇을 그려도 되는지'를 정해 돌려준다.
 *
 * 열쇠는 운영 공고 id 하나다. 청약홈 공고번호·기관 외부 id·등록부 열쇠를 섞어 받지 않는다.
 *
 * 세 가지를 따로 답한다 — 하나가 다른 것을 막지 않는다.
 *   explorerOpens     화면은 언제나 연다(위치를 몰라도 전국 무대와 그 이유)
 *   locationResolved  자리를 지역 이상으로 정할 수 있는가
 *   buildingGeometry  동 형상(매스·모델)을 세울 수 있는가
 *
 * 저장된 좌표는 공고의 시·도·시군구와 맞는지 확인한 뒤에만 쓴다(lib/consumer/location).
 * 여기서는 읽기만 한다. 누를 때마다 바깥 지오코딩을 부르지 않는다.
 */
export const dynamic = 'force-dynamic'

export type ExplorerLevel = 'NATIONAL' | 'REGIONAL' | 'NEIGHBORHOOD' | 'COMPLEX' | 'UNIT_INFORMATION'

export interface SpatialResponse {
  noticeId: string
  notice: {
    name: string
    source: string
    housingType: string | null
    applicationStart: string | null
    applicationEnd: string | null
    status: string | null
    sourceUrl: string | null
  }
  location: {
    lat: number | null
    lng: number | null
    province: string | null
    regionCode: string | null
    district: string | null
    address: string | null
    provenance: LocationProvenance
    /** 표식 반경(m). 지역 기준이면 null */
    uncertaintyM: number | null
    /** 화면 한 줄 */
    accuracy: string
    /** 저장된 좌표를 쓰지 않았다면 그 이유 */
    rejected: string | null
  }
  capability: {
    explorerOpens: true
    locationResolved: boolean
    buildingGeometry: boolean
    /** 한 점으로 짚는가(필지·주소) / 범위로 그리는가(공고명) */
    pinpoint: boolean
    approximateArea: boolean
    /** 공개 지도의 주변 건물·길을 받아 그릴 수 있는 자리인가 */
    neighborhood: boolean
  }
  levels: ExplorerLevel[]
  site: {
    kind: SiteGeometryKind
    /** 원문 대조 단지 탐험(ComplexExperience)을 여는 열쇠 — 매스가 있을 때만 */
    announcementId: string | null
    source: string | null
    verifiedAt: string | null
    note: string | null
  }
  credibility: string
  limitations: string[]
  /** 예전 이름 — locationResolved */
  spatialAvailable: boolean
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!isNoticeId(id)) return Response.json({ error: '공고를 찾을 수 없습니다.', code: 'NOT_FOUND' }, { status: 404 })
  try {
    const property = await findOfficialProperty(id)
    if (!property) return Response.json({ error: '공고를 찾을 수 없습니다.', code: 'NOT_FOUND' }, { status: 404 })

    // 원문 대조를 마친 공고인가 — 등록부에서 id·이름 어느 쪽으로든 찾는다
    const hit = verifiedForNotice({ id: property.id, name: property.name, announcementId: property.announcementId })
    const site = await resolveSiteGeometry(hit)
    const loc = resolveNoticeLocation(property, { parcel: site.parcel })

    const cap = resolveSpatial({
      officialDocument: Boolean(hit),
      hasSiteData: site.kind === 'VERIFIED_MASSING',
      hasAuthorizedModel: site.kind === 'AUTHORIZED_MODEL',
      coord: coordInputOf(loc.provenance),
      officialFeed: property.dataOrigin === 'OFFICIAL',
    })
    const neighborhood = cap.can.pinpoint || cap.can.approximateArea

    const levels: ExplorerLevel[] = ['NATIONAL']
    if (loc.regionCode) levels.push('REGIONAL')
    if (neighborhood) levels.push('NEIGHBORHOOD')
    if (site.kind === 'VERIFIED_MASSING' || site.kind === 'AUTHORIZED_MODEL') levels.push('COMPLEX', 'UNIT_INFORMATION')

    const showPoint = cap.can.pinpoint || cap.can.approximateArea
    const body: SpatialResponse = {
      noticeId: property.id,
      notice: {
        name: property.name,
        source: property.source,
        housingType: property.housingType ?? null,
        applicationStart: property.applicationStart ?? null,
        applicationEnd: property.applicationEnd ?? null,
        status: property.status ?? null,
        sourceUrl: hit?.src.sourceUrl ?? property.sourceUrl ?? null,
      },
      location: {
        // 지역 기준점은 카메라가 바라볼 곳일 뿐 공고의 자리가 아니다 — 점으로 내보내지 않는다
        lat: showPoint ? (loc.point?.lat ?? null) : null,
        lng: showPoint ? (loc.point?.lng ?? null) : null,
        province: loc.province,
        regionCode: loc.regionCode,
        district: loc.district,
        address: property.address || null,
        provenance: loc.provenance,
        uncertaintyM: showPoint ? loc.uncertaintyM : null,
        accuracy: cap.accuracy,
        rejected: loc.rejected,
      },
      capability: {
        explorerOpens: true,
        locationResolved: cap.locationResolved,
        buildingGeometry: cap.buildingGeometry,
        pinpoint: cap.can.pinpoint,
        approximateArea: cap.can.approximateArea,
        neighborhood,
      },
      levels,
      site: {
        kind: site.kind === 'NONE' ? (neighborhood ? 'NEIGHBORHOOD_ONLY' : loc.regionCode ? 'REGION_ONLY' : 'UNKNOWN') : site.kind,
        announcementId: site.kind === 'VERIFIED_MASSING' ? (hit?.id ?? null) : null,
        source: hit ? hit.src.developer : null,
        verifiedAt: hit?.src.checkedAt ?? null,
        note: hit?.src.geometryNote ?? null,
      },
      credibility: cap.source,
      limitations: [...(loc.rejected ? [loc.rejected] : []), ...cap.limitations],
      spatialAvailable: cap.locationResolved,
    }

    return Response.json(body, {
      // 공고의 자리는 분 단위로 바뀌지 않는다. 같은 공고를 여럿이 열어도 한 번만 센다
      headers: { 'Cache-Control': 'public, max-age=60, s-maxage=600, stale-while-revalidate=3600' },
    })
  } catch (err) {
    const readFailed = err instanceof OfficialReadError
    return Response.json(
      { error: '공간 정보를 불러오지 못했습니다.', code: readFailed ? 'READ_FAILED' : 'ERROR' },
      { status: readFailed ? 503 : 500 },
    )
  }
}
