/**
 * 저장된 좌표를 '그 공고의 자리'로 써도 되는가 — 화면에 점을 찍기 전에 한 번 묻는다.
 *
 * 저장소의 좌표는 둘 중 하나로 왔다 — 주소를 지오코딩했거나(ADDRESS), 주소가 없어 공고명으로
 * 찾았거나(NAME). 공고명 검색은 이름이 비슷한 엉뚱한 곳을 돌려줄 수 있다('행복주택'이 다른 도시에서).
 * 그래서 점을 쓰기 전에 공고가 말하는 시·도와 맞는지, 시·군·구 기준점에서 너무 멀지 않은지 본다.
 * 어긋나면 고르지 않고 정밀도를 내린다 — 지역 기준점으로 물러선다.
 *
 * 순수 함수다. 시·도 다각형은 부르는 쪽이 넘긴다(시험이 같은 입력으로 같은 답을 확인한다).
 */
import { EDGE_TOLERANCE_PX, edgeDistance, inRing, projectToMap, validLatLng, type Ring } from './geo-projection.ts'

export interface ProvincePolygon {
  code: string
  /** 화면 이름('서울'·'경기'…) */
  name: string
  rings: Ring[]
}

export type CheckedSource = 'PARCEL' | 'ADDRESS' | 'NAME'

export interface LocationCheck {
  /** 이 좌표를 그 공고의 자리로 써도 되는가 */
  ok: boolean
  /** 왜 쓰지 않는가(ok=false 일 때) */
  reason: null | 'INVALID_COORDINATE' | 'OUTSIDE_LAND' | 'PROVINCE_MISMATCH' | 'FAR_FROM_DISTRICT'
  /** 좌표가 떨어진 시·도(경계에서 충분히 안쪽일 때만) */
  provinceAt: string | null
}

/** 점이 떨어진 시·도 — 경계에서 tolerance 안쪽이면 판정하지 않는다(그림 해상도보다 가깝다) */
export function provinceAt(lat: number, lng: number, polys: ProvincePolygon[]): { name: string; code: string; edge: number } | null {
  const p = projectToMap(lat, lng)
  for (const poly of polys) {
    if (poly.rings.some(r => inRing(p, r))) return { name: poly.name, code: poly.code, edge: edgeDistance(p, poly.rings) }
  }
  return null
}

/** 두 점 사이 거리(km) */
export function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

/** 시·도 이름이 같은가 — 공고가 '전남·광주'처럼 둘을 묶어 오면 둘 중 하나면 같다 */
const sameProvince = (expected: string, at: string) => expected.split(/[·,\s]+/).filter(Boolean).includes(at)

/** 시·군·구 기준점에서 이보다 멀면 그 시·군·구의 점이 아니다 — 가장 넓은 시·군(홍천·인제 약 60km 폭)의 반 */
export const DISTRICT_RADIUS_KM = 35

export function checkLocation(
  input: {
    lat: unknown
    lng: unknown
    source: CheckedSource
    /** 공고가 말하는 시·도 */
    province: string | null
    /** 공고가 말하는 시·군·구의 기준점(알 때만) */
    districtCenter: { lat: number; lng: number } | null
  },
  polys: ProvincePolygon[],
): LocationCheck {
  if (!validLatLng(input.lat, input.lng)) return { ok: false, reason: 'INVALID_COORDINATE', provinceAt: null }
  const lat = input.lat as number
  const lng = input.lng as number
  const at = provinceAt(lat, lng, polys)
  const p = projectToMap(lat, lng)
  if (!at) {
    // 그림의 해안선은 거칠다. 해안에 붙은 점(2px 안쪽)은 바다로 보지 않는다
    const near = Math.min(...polys.map(poly => edgeDistance(p, poly.rings)))
    if (near > EDGE_TOLERANCE_PX * 2) return { ok: false, reason: 'OUTSIDE_LAND', provinceAt: null }
  }
  const sure = at && at.edge > EDGE_TOLERANCE_PX ? at.name : null
  const expected = (input.province ?? '').trim()
  if (expected && expected !== '전국' && sure && !sameProvince(expected, sure)) {
    return { ok: false, reason: 'PROVINCE_MISMATCH', provinceAt: sure }
  }
  if (input.districtCenter && km({ lat, lng }, input.districtCenter) > DISTRICT_RADIUS_KM) {
    return { ok: false, reason: 'FAR_FROM_DISTRICT', provinceAt: sure }
  }
  return { ok: true, reason: null, provinceAt: sure }
}

export const CHECK_REASON_TEXT: Record<NonNullable<LocationCheck['reason']>, string> = {
  INVALID_COORDINATE: '저장된 좌표가 대한민국 범위를 벗어나 쓰지 않았습니다.',
  OUTSIDE_LAND: '저장된 좌표가 육지 밖이라 쓰지 않았습니다.',
  PROVINCE_MISMATCH: '저장된 좌표가 공고의 시·도와 달라 쓰지 않고 지역 기준으로 보여 드립니다.',
  FAR_FROM_DISTRICT: '저장된 좌표가 공고의 시·군·구에서 멀어 쓰지 않고 지역 기준으로 보여 드립니다.',
}
