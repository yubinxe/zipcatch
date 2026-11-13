import type { Property } from '@/lib/crm/types'
import { KOREA_PROVINCES } from '@/lib/korea-map-data'
import { KOREA_REGIONS } from '@/lib/korea-regions'
import { provinceOf } from './classify'
import { DISTRICT_CENTER, districtFromAddress, resolveCoord, type LatLng } from './geo'
import { parseMapPath } from './geo-projection'
import { CHECK_REASON_TEXT, checkLocation, type LocationCheck, type ProvincePolygon } from './location-check'

/**
 * 공고 한 건의 자리 — 저장된 좌표를 검사한 뒤 정밀도 등급과 함께.
 *
 * 공간 API·지도 API·범위 집계가 같은 길을 쓴다. 좌표가 공고의 시·도·시군구와 어긋나면
 * 쓰지 않고 지역 기준점으로 내린다(lib/consumer/location-check). 정밀도를 올려 읽지 않는다.
 */
export const PROVINCE_POLYGONS: ProvincePolygon[] = KOREA_PROVINCES.map(p => ({
  code: p.code,
  name: KOREA_REGIONS.find(r => r.code === p.code)?.name ?? p.name,
  rings: parseMapPath(p.path),
}))

export type LocationProvenance =
  | 'PARCEL_CONFIRMED'
  | 'ADDRESS_GEOCODED'
  | 'NAME_GEOCODED'
  | 'DISTRICT_APPROXIMATE'
  | 'PROVINCE_APPROXIMATE'
  | 'UNKNOWN'

export interface NoticeLocation {
  provenance: LocationProvenance
  /** 짚거나 범위를 그릴 점. 지역 기준점일 때도 채운다(카메라가 바라볼 곳) — 표식은 provenance 로 정한다 */
  point: LatLng | null
  /** 표식 반경(m) — 주소 좌표 150, 공고명 좌표 900. 지역 기준이면 null */
  uncertaintyM: number | null
  province: string | null
  regionCode: string | null
  district: string | null
  /** 저장된 좌표를 쓰지 않았다면 그 이유(화면 문구) */
  rejected: string | null
  rejectCode: LocationCheck['reason']
}

const PROV_OF = { ADDRESS: 'ADDRESS_GEOCODED', NAME: 'NAME_GEOCODED', DISTRICT: 'DISTRICT_APPROXIMATE', PROVINCE: 'PROVINCE_APPROXIMATE' } as const

export function resolveNoticeLocation(
  property: Pick<Property, 'lat' | 'lng' | 'geoSource' | 'address' | 'district' | 'region'>,
  opts: { parcel?: LatLng | null } = {},
): NoticeLocation {
  const province = provinceOf(property) || null
  const regionCode = KOREA_REGIONS.find(r => r.name === province)?.code ?? null
  const base = { province, regionCode, district: property.district || null }

  // 원문 대조로 필지를 확인한 공고 — 그 자리를 쓴다
  if (opts.parcel) return { ...base, provenance: 'PARCEL_CONFIRMED', point: opts.parcel, uncertaintyM: 60, rejected: null, rejectCode: null }

  let geocoded: LatLng | null = null
  let rejected: string | null = null
  let rejectCode: LocationCheck['reason'] = null
  if (property.lat !== null && property.lng !== null && property.geoSource !== 'REGION') {
    const dKey = districtFromAddress(property.address) ?? (property.district && DISTRICT_CENTER[property.district] ? property.district : null)
    const check = checkLocation(
      {
        lat: property.lat,
        lng: property.lng,
        source: property.geoSource === 'ADDRESS' ? 'ADDRESS' : 'NAME',
        province,
        districtCenter: dKey ? DISTRICT_CENTER[dKey] : null,
      },
      PROVINCE_POLYGONS,
    )
    if (check.ok) geocoded = { lat: property.lat, lng: property.lng }
    else {
      rejectCode = check.reason
      rejected = check.reason ? CHECK_REASON_TEXT[check.reason] : null
    }
  }

  const c = resolveCoord({ geocoded, geoSource: property.geoSource, address: property.address, region: property.district, province })
  if (!c) return { ...base, provenance: 'UNKNOWN', point: null, uncertaintyM: null, rejected, rejectCode }
  const provenance = PROV_OF[c.source]
  return {
    ...base,
    provenance,
    point: { lat: c.lat, lng: c.lng },
    uncertaintyM: provenance === 'ADDRESS_GEOCODED' ? 150 : provenance === 'NAME_GEOCODED' ? 900 : null,
    rejected,
    rejectCode,
  }
}

/** spatial-capability 의 입력 이름으로 */
export const coordInputOf = (p: LocationProvenance) =>
  p === 'PARCEL_CONFIRMED'
    ? ('PARCEL' as const)
    : p === 'ADDRESS_GEOCODED'
      ? ('ADDRESS' as const)
      : p === 'NAME_GEOCODED'
        ? ('NAME' as const)
        : p === 'DISTRICT_APPROXIMATE'
          ? ('DISTRICT' as const)
          : p === 'PROVINCE_APPROXIMATE'
            ? ('PROVINCE' as const)
            : null
