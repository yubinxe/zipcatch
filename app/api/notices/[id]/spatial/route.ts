import { findOfficialProperty } from '@/lib/consumer/official'
import { provinceOf } from '@/lib/consumer/classify'
import { resolveCoord } from '@/lib/consumer/geo'
import { verifiedForNotice } from '@/lib/consumer/complex-visualization'
import { resolveSpatial } from '@/lib/consumer/spatial-capability'

/**
 * 공고 하나의 공간 자료 — 탐험을 열기 전에 '무엇을 그려도 되는지'를 정해 돌려준다.
 *
 * 열쇠는 운영 공고 id 하나다. 청약홈 공고번호·기관 외부 id·등록부 열쇠를 섞어 받지 않는다 —
 * 섞으면 같은 공고가 화면마다 다른 이름으로 불린다.
 *
 * 여기서는 읽기만 한다. 누를 때마다 바깥 지오코딩을 부르지 않는다(이미 저장된 좌표와
 * 지역 기준점만 쓴다). 비밀값이나 운영 전용 필드는 내보내지 않는다.
 */
export const dynamic = 'force-dynamic'

export interface SpatialResponse {
  noticeId: string
  notice: {
    name: string
    source: string
    housingType: string | null
    applicationEnd: string | null
    sourceUrl: string | null
  }
  location: {
    lat: number | null
    lng: number | null
    province: string | null
    district: string | null
    address: string | null
    provenance: 'PARCEL' | 'ADDRESS' | 'NAME' | 'DISTRICT' | 'PROVINCE' | 'UNKNOWN'
    confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN'
  }
  geometry: {
    mode: 'REAL_MODEL' | 'VERIFIED_MASSING' | 'PUBLIC_BUILDINGS' | 'TERRAIN' | 'REGION' | 'UNAVAILABLE'
    fallback: SpatialResponse['geometry']['mode']
    source: string | null
    verifiedAt: string | null
    attribution: string | null
    assetUrl: string | null
  }
  credibility: string
  accuracy: string
  spatialAvailable: boolean
  limitations: string[]
}

const CONFIDENCE = {
  ADDRESS: 'HIGH',
  NAME: 'MEDIUM',
  DISTRICT: 'LOW',
  PROVINCE: 'LOW',
} as const

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const property = await findOfficialProperty(id)
    if (!property) return Response.json({ error: '공고를 찾을 수 없습니다.' }, { status: 404 })

    const province = provinceOf(property)
    const stored = property.lat !== null && property.lng !== null ? { lat: property.lat, lng: property.lng } : null
    const coord = resolveCoord({
      geocoded: stored,
      geoSource: property.geoSource,
      address: property.address,
      region: property.district,
      province,
    })

    // 원문 대조를 마친 공고인가 — 등록부에서 id·이름 어느 쪽으로든 찾는다
    const hit = verifiedForNotice({ id: property.id, name: property.name, announcementId: property.announcementId })
    const src = hit?.src ?? null

    const cap = resolveSpatial({
      officialDocument: Boolean(src),
      hasSiteData: Boolean(src?.siteKey),
      hasAuthorizedModel: false, // 사용 허락을 받은 실제 3D 모델은 아직 없다
      coord: coord?.source ?? null,
      officialFeed: property.dataOrigin === 'OFFICIAL',
    })

    const body: SpatialResponse = {
      noticeId: property.id,
      notice: {
        name: property.name,
        source: property.source,
        housingType: property.housingType ?? null,
        applicationEnd: property.applicationEnd ?? null,
        sourceUrl: src?.sourceUrl ?? property.sourceUrl ?? null,
      },
      location: {
        lat: coord?.lat ?? null,
        lng: coord?.lng ?? null,
        province: province || null,
        district: property.district || null,
        address: property.address || null,
        provenance: coord?.source ?? 'UNKNOWN',
        confidence: coord ? CONFIDENCE[coord.source] : 'UNKNOWN',
      },
      geometry: {
        mode: cap.mode,
        fallback: cap.fallback,
        source: src ? src.developer : coord ? '공개 행정구역 경계' : null,
        verifiedAt: src?.checkedAt ?? null,
        attribution: src?.geometryNote ?? null,
        assetUrl: null,
      },
      credibility: cap.source,
      accuracy: cap.accuracy,
      spatialAvailable: cap.available,
      limitations: cap.limitations,
    }

    return Response.json(body, {
      // 공고의 자리는 분 단위로 바뀌지 않는다. 같은 공고를 여럿이 열어도 한 번만 센다
      headers: { 'Cache-Control': 'public, max-age=60, s-maxage=600, stale-while-revalidate=3600' },
    })
  } catch {
    return Response.json({ error: '공간 정보를 불러오지 못했습니다.' }, { status: 500 })
  }
}
