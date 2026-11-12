/**
 * 공고를 지도에 올리기 위한 좌표.
 *
 * 청약홈 공고에는 주소가 있고, LH 공고에는 없다. 주소가 있으면 지오코딩으로
 * 정확한 점을 찍는 것이 맞지만, 지오코딩이 열려 있지 않은 동안에도 지도가
 * 비어 있을 이유는 없다. 아래 표는 그 사이를 메우는 **대략 좌표**다.
 *
 * 중요한 것은 정확도가 아니라 정확도를 속이지 않는 것이다. 이 표로 찍은 점은
 * 화면에서 `approx` 로 표시하고, 주소를 지오코딩해 얻은 점과 눈에 띄게 다르게
 * 그린다. 시청·도청 소재지를 기준으로 삼았다 — 임의로 만든 수가 아니라
 * 누구나 확인할 수 있는 한 점이다.
 */

export interface LatLng {
  lat: number
  lng: number
}

/** 시·도 기준점 (시청·도청 소재지) */
export const PROVINCE_CENTER: Record<string, LatLng> = {
  서울: { lat: 37.5665, lng: 126.978 },
  부산: { lat: 35.1798, lng: 129.075 },
  대구: { lat: 35.8714, lng: 128.6014 },
  인천: { lat: 37.4563, lng: 126.7052 },
  광주: { lat: 35.1595, lng: 126.8526 },
  대전: { lat: 36.3504, lng: 127.3845 },
  울산: { lat: 35.5384, lng: 129.3114 },
  세종: { lat: 36.48, lng: 127.289 },
  경기: { lat: 37.4138, lng: 127.5183 },
  강원: { lat: 37.8228, lng: 128.1555 },
  충북: { lat: 36.6357, lng: 127.4917 },
  충남: { lat: 36.6588, lng: 126.6728 },
  전북: { lat: 35.8203, lng: 127.1088 },
  전남: { lat: 34.8161, lng: 126.4629 },
  '전남·광주': { lat: 35.0, lng: 126.65 },
  경북: { lat: 36.5760, lng: 128.5056 },
  경남: { lat: 35.2383, lng: 128.6924 },
  제주: { lat: 33.4996, lng: 126.5312 },
  전국: { lat: 36.5, lng: 127.8 },
}

/**
 * 자주 나오는 시·군·구 기준점.
 *
 * 전국 시군구를 다 적지 않는다. 표가 길어질수록 틀린 줄이 섞이고, 틀린 좌표는
 * 없는 좌표보다 나쁘다. 실제 공고에 나온 곳만 확인해 넣고, 없으면 시·도로 물러선다.
 */
export const DISTRICT_CENTER: Record<string, LatLng> = {
  // 서울
  강남구: { lat: 37.5172, lng: 127.0473 },
  관악구: { lat: 37.4784, lng: 126.9516 },
  동작구: { lat: 37.5124, lng: 126.9393 },
  마포구: { lat: 37.5663, lng: 126.9019 },
  서초구: { lat: 37.4837, lng: 127.0324 },
  성동구: { lat: 37.5634, lng: 127.0369 },
  성북구: { lat: 37.5894, lng: 127.0167 },
  송파구: { lat: 37.5145, lng: 127.1059 },
  영등포구: { lat: 37.5264, lng: 126.8963 },
  서대문구: { lat: 37.5791, lng: 126.9368 },
  금천구: { lat: 37.4569, lng: 126.8956 },
  중구: { lat: 37.5636, lng: 126.9976 },
  // 경기·인천
  남양주시: { lat: 37.6359, lng: 127.2165 },
  의정부시: { lat: 37.738, lng: 127.0338 },
  평택시: { lat: 36.9921, lng: 127.1129 },
  시흥시: { lat: 37.3799, lng: 126.8031 },
  분당구: { lat: 37.3827, lng: 127.1189 },
  권선구: { lat: 37.2576, lng: 126.9716 },
  소사구: { lat: 37.4816, lng: 126.7924 },
  계양구: { lat: 37.5372, lng: 126.7377 },
  양주신도시: { lat: 37.7853, lng: 127.0457 },
}

/** 주소 문자열에서 시·군·구를 집어낸다. 못 찾으면 null */
export function districtFromAddress(address: string | null | undefined): string | null {
  const t = (address ?? '').trim()
  if (!t) return null
  const m = t.match(/([가-힣]+[시군구])/g)
  if (!m) return null
  // '경기도 남양주시 오남읍' 처럼 여러 개가 걸리면 시·군·구 표에 있는 것을 고른다
  for (const token of m) {
    if (DISTRICT_CENTER[token]) return token
  }
  return null
}

/**
 * 이 좌표가 어디서 왔는가. 정확한 것부터.
 *
 *  ADDRESS   주소를 지오코딩한 점 — 그 번지
 *  NAME      공고명으로 찾은 점 — 같은 이름의 다른 곳일 수 있다
 *  DISTRICT  시·군·구 기준점 — 그 구의 한가운데지 공고의 자리가 아니다
 *  PROVINCE  광역 기준점
 *
 * 예전에는 저장된 좌표를 전부 GEOCODED 하나로 불렀다. 공고명으로 찾은 60건이
 * 주소로 찾은 63건과 같은 믿음을 가진 것처럼 보였다 — 지도에서 같은 표식으로
 * 그려지고, 거리 계산에도 같이 들어갔다. 온 길을 끝까지 들고 다닌다.
 */
export type CoordSource = 'ADDRESS' | 'NAME' | 'DISTRICT' | 'PROVINCE'

/** 저장된 좌표의 출처(opportunities.geo_source)를 그대로 받는다 */
export type StoredGeoSource = 'ADDRESS' | 'NAME' | 'REGION' | null | undefined

export interface ResolvedCoord extends LatLng {
  /** 이 점이 얼마나 믿을 만한지. 화면에서 다르게 그린다 */
  source: CoordSource
}

/**
 * 좌표를 정한다 — 정확한 것부터.
 *
 * 1) 주소를 지오코딩한 점 (호출부가 넘겨준다)
 * 2) 주소에서 집어낸 시·군·구 기준점
 * 3) 광역 기준점
 *
 * 어느 단계에서 왔는지를 함께 돌려준다. 화면이 "대략"과 "정확"을 섞어
 * 보여주지 않게 하려는 것이다.
 */
export function resolveCoord(input: {
  geocoded?: LatLng | null
  /**
   * 넘겨준 좌표가 어떻게 얻어진 것인가(DB 의 geo_source). 주소로 찾았으면 'ADDRESS',
   * 공고명으로 찾았으면 'NAME'. 적지 않으면 공고명 수준으로 낮춰 본다 —
   * 모르는 좌표를 주소만큼 믿는 쪽이 늘 더 비싸다.
   */
  geoSource?: StoredGeoSource
  address?: string | null
  region?: string | null
  province?: string | null
}): ResolvedCoord | null {
  if (input.geocoded) {
    const g = input.geoSource
    // 'REGION' 은 지역 기준점을 저장해 둔 것이라 점으로 치지 않는다 — 아래 단계로 내린다
    if (g !== 'REGION') return { ...input.geocoded, source: g === 'ADDRESS' ? 'ADDRESS' : 'NAME' }
  }

  const byAddress = districtFromAddress(input.address)
  if (byAddress) return { ...DISTRICT_CENTER[byAddress], source: 'DISTRICT' }

  const region = (input.region ?? '').trim()
  if (region && DISTRICT_CENTER[region]) return { ...DISTRICT_CENTER[region], source: 'DISTRICT' }

  const province = (input.province ?? '').trim()
  if (province && PROVINCE_CENTER[province]) return { ...PROVINCE_CENTER[province], source: 'PROVINCE' }
  if (region && PROVINCE_CENTER[region]) return { ...PROVINCE_CENTER[region], source: 'PROVINCE' }

  return null
}

/** 지도 첫 화면 — 서울에서 시작해 수도권, 전국으로 넓힌다 */
export const MAP_SCOPE = {
  서울: { center: PROVINCE_CENTER.서울, zoom: 11 },
  수도권: { center: { lat: 37.45, lng: 127.0 }, zoom: 9 },
  전국: { center: PROVINCE_CENTER.전국, zoom: 7 },
} as const

export type MapScope = keyof typeof MAP_SCOPE
