/**
 * 이 공고에 대해 공간을 어디까지 정직하게 그릴 수 있는가.
 *
 * 전국 어느 공고에서든 탐험으로 들어갈 수 있어야 하지만, 들어간 자리에서 보여 줄 수 있는
 * 것은 공고마다 다르다. 없는 정밀도를 지어내면 그 화면 전체가 거짓이 되므로, 무엇을 그릴 수
 * 있는지를 먼저 한 곳에서 정한다.
 *
 * 예전에는 '검증'이라는 한 축에 출처·위치·형상을 모두 얹었다. 그러면 원문을 대조한 공고가
 * 곧 실제 외관을 확인한 공고처럼 읽힌다 — 둘은 다른 일이다. 세 축으로 가른다.
 *
 *   출처(source)    그 사실이 어디서 왔는가
 *   위치(position)  그 점이 얼마나 그 자리인가
 *   형상(geometry)  무엇을 입체로 세워도 되는가
 *
 * 이 파일은 정책만 담는다 — 등록부를 찾고 좌표를 푸는 일은 부르는 쪽이 하고, 여기서는 그
 * 결과만 보고 등급을 정한다. 가져다 쓰는 것이 없어야 같은 입력에 같은 등급이 나오는지
 * 그 자리에서 시험할 수 있다.
 */

/** 그 사실이 어디서 왔는가 */
export type SourceCredibility =
  /** 공고 원문을 사람이 대조했다 */
  | 'OFFICIAL_DOCUMENT'
  /** 기관 API 가 준 값을 그대로 쓴다(청약홈·LH) */
  | 'VERIFIED_EXTERNAL_DATA'
  /** 공개 자료에서 우리가 끌어낸 값(주소 지오코딩 등) */
  | 'DERIVED_FROM_PUBLIC_DATA'
  /** 출처를 댈 수 없다 */
  | 'UNVERIFIED'
  | 'UNAVAILABLE'

/** 그 점이 얼마나 그 자리인가 */
export type PositionAccuracy =
  /** 필지·동을 원문이나 공적 자료로 확인했다 */
  | 'PARCEL_CONFIRMED'
  /** 주소를 지오코딩했다 — 주소의 점이지 동의 자리는 아니다 */
  | 'ADDRESS_GEOCODED'
  /** 공고명으로 찾았다 — 같은 이름의 다른 곳일 수 있다(정밀도를 올려 읽지 않는다) */
  | 'NAME_GEOCODED'
  | 'DISTRICT_APPROXIMATE'
  | 'PROVINCE_APPROXIMATE'
  | 'UNKNOWN'

/** 무엇을 입체로 세워도 되는가 */
export type GeometryFidelity =
  /** 사용 허락을 받은 실제 3D 모델 */
  | 'AUTHORIZED_REAL_3D_MODEL'
  /** 공고의 동·층을 세운 매스 모형 — 외관이 아니다 */
  | 'VERIFIED_ARCHITECTURAL_MASSING'
  /** 공개 지도의 건물 윤곽을 올린 것 — 그 건물의 실제 형상이 아니다 */
  | 'PUBLIC_BUILDING_FOOTPRINT'
  /** 지형과 주변 맥락만 */
  | 'TERRAIN_AND_BUILDING_CONTEXT'
  /** 지역 수준 */
  | 'REGION_ONLY'
  | 'NO_GEOGRAPHIC_CONTEXT'

/** 화면이 고를 그림 방식 */
export type VisualMode = 'REAL_MODEL' | 'VERIFIED_MASSING' | 'PUBLIC_BUILDINGS' | 'TERRAIN' | 'REGION' | 'UNAVAILABLE'

export interface SpatialInput {
  /** 공고 원문을 사람이 대조했는가 */
  officialDocument?: boolean
  /** 그 공고에 동·주택형 현장 자료가 있는가 */
  hasSiteData?: boolean
  /** 사용 허락을 받은 실제 3D 모델이 있는가 — 지금은 어느 공고에도 없다 */
  hasAuthorizedModel?: boolean
  /** 좌표가 어디서 왔는가. 좌표가 없으면 null */
  coord?: 'PARCEL' | 'ADDRESS' | 'NAME' | 'DISTRICT' | 'PROVINCE' | null
  /** 기관 API 에서 받은 공고인가(청약홈·LH) */
  officialFeed?: boolean
  /** 주변 건물 윤곽을 올릴 수 있는가 */
  hasFootprints?: boolean
}

export interface SpatialCapability {
  source: SourceCredibility
  position: PositionAccuracy
  geometry: GeometryFidelity
  /** 화면이 세울 그림 */
  mode: VisualMode
  /** 그것도 못 세울 때 물러설 자리 */
  fallback: VisualMode
  /**
   * 세 가지를 따로 답한다 — 하나가 다른 것을 막지 않는다.
   *  explorerOpens     탐험 화면은 언제나 연다(위치를 몰라도 전국 무대와 그 이유를 보여 준다)
   *  locationResolved  공고의 자리를 지역 이상으로 정할 수 있는가
   *  buildingGeometry  동 형상(매스·모델)을 세울 수 있는가
   */
  explorerOpens: true
  locationResolved: boolean
  buildingGeometry: boolean
  /** 예전 이름 — locationResolved 와 같다 */
  available: boolean
  /** 이 등급에서 그려도 되는 것 */
  can: {
    model: boolean
    /** 한 점을 짚는 표식 — 필지 확인·주소 좌표만 */
    pinpoint: boolean
    /** 점 대신 불확실 범위(원)로 — 공고명으로 찾은 자리 */
    approximateArea: boolean
    /** 지역 수준의 지리 맥락 */
    regionContext: boolean
  }
  /** 화면에 그대로 적을 위치 정확도 — 짧게 */
  accuracy: string
  /** 이 등급이 세울 수 없는 것 — 하나 이상 */
  limitations: string[]
}

const POSITION_TEXT: Record<PositionAccuracy, string> = {
  PARCEL_CONFIRMED: '필지·동 확인',
  ADDRESS_GEOCODED: '주소 좌표 기준',
  NAME_GEOCODED: '공고명으로 찾은 자리 · 대략',
  DISTRICT_APPROXIMATE: '시·군·구 기준점 · 대략',
  PROVINCE_APPROXIMATE: '광역 기준점 · 대략',
  UNKNOWN: '위치 정보 없음',
}

const POSITION_LIMIT: Record<PositionAccuracy, string | null> = {
  PARCEL_CONFIRMED: null,
  ADDRESS_GEOCODED: '좌표는 주소를 옮긴 것이고, 개별 동의 자리는 확인하지 않았습니다.',
  NAME_GEOCODED: '공고명으로 찾은 자리입니다. 같은 이름의 다른 곳일 수 있으니 주소를 공고 원문에서 확인하세요.',
  DISTRICT_APPROXIMATE: '표식은 시·군·구의 기준점이며 이 공고의 실제 자리가 아닙니다.',
  PROVINCE_APPROXIMATE: '표식은 광역의 기준점이며 이 공고의 실제 자리가 아닙니다.',
  UNKNOWN: '공고에서 위치를 정할 수 있는 값을 찾지 못했습니다.',
}

const GEOMETRY_LIMIT: Record<GeometryFidelity, string | null> = {
  AUTHORIZED_REAL_3D_MODEL: null,
  VERIFIED_ARCHITECTURAL_MASSING:
    '입체 덩어리는 공고의 동·최고층을 세운 매스 모형입니다. 실제 외관·창·색은 표현하지 않습니다.',
  PUBLIC_BUILDING_FOOTPRINT:
    '건물 덩어리는 공개 지도의 윤곽을 올린 것이며, 이 공고 단지의 확인된 형상이 아닙니다.',
  TERRAIN_AND_BUILDING_CONTEXT: '주변 지형과 맥락만 그립니다. 단지의 동 배치와 형상은 그리지 않습니다.',
  REGION_ONLY: '지역까지만 그립니다. 단지의 자리와 형상은 그리지 않습니다.',
  NO_GEOGRAPHIC_CONTEXT: null,
}

const MODE_OF: Record<GeometryFidelity, VisualMode> = {
  AUTHORIZED_REAL_3D_MODEL: 'REAL_MODEL',
  VERIFIED_ARCHITECTURAL_MASSING: 'VERIFIED_MASSING',
  PUBLIC_BUILDING_FOOTPRINT: 'PUBLIC_BUILDINGS',
  TERRAIN_AND_BUILDING_CONTEXT: 'TERRAIN',
  REGION_ONLY: 'REGION',
  NO_GEOGRAPHIC_CONTEXT: 'UNAVAILABLE',
}

/** 가진 자료만 보고 세 축을 각각 정한다. 추정하지 않는다. */
export function resolveSpatial(input: SpatialInput): SpatialCapability {
  const coord = input.coord ?? null

  const position: PositionAccuracy =
    coord === 'PARCEL'
      ? 'PARCEL_CONFIRMED'
      : coord === 'ADDRESS'
      ? 'ADDRESS_GEOCODED'
      : coord === 'NAME'
        ? 'NAME_GEOCODED'
        : coord === 'DISTRICT'
          ? 'DISTRICT_APPROXIMATE'
          : coord === 'PROVINCE'
            ? 'PROVINCE_APPROXIMATE'
            : 'UNKNOWN'

  const source: SourceCredibility = input.officialDocument
    ? 'OFFICIAL_DOCUMENT'
    : input.officialFeed
      ? 'VERIFIED_EXTERNAL_DATA'
      : position === 'UNKNOWN'
        ? 'UNAVAILABLE'
        : 'DERIVED_FROM_PUBLIC_DATA'

  /*
   * 형상은 '자리를 아는가'가 먼저다. 원문을 대조했어도 동 배치 자료가 없으면 매스를 세울 수 없고,
   * 자리를 모르면 어떤 건물도 올릴 수 없다.
   */
  const geometry: GeometryFidelity = input.hasAuthorizedModel
    ? 'AUTHORIZED_REAL_3D_MODEL'
    : input.officialDocument && input.hasSiteData
      ? 'VERIFIED_ARCHITECTURAL_MASSING'
      : position === 'UNKNOWN'
        ? 'NO_GEOGRAPHIC_CONTEXT'
        : position === 'PARCEL_CONFIRMED' || position === 'ADDRESS_GEOCODED' || position === 'NAME_GEOCODED'
          ? input.hasFootprints
            ? 'PUBLIC_BUILDING_FOOTPRINT'
            : 'TERRAIN_AND_BUILDING_CONTEXT'
          : 'REGION_ONLY'

  const mode = MODE_OF[geometry]
  const fallback: VisualMode =
    mode === 'REAL_MODEL' || mode === 'VERIFIED_MASSING'
      ? 'TERRAIN'
      : mode === 'PUBLIC_BUILDINGS'
        ? 'TERRAIN'
        : mode === 'TERRAIN'
          ? 'REGION'
          : 'UNAVAILABLE'

  const limitations = [POSITION_LIMIT[position], GEOMETRY_LIMIT[geometry]].filter((x): x is string => Boolean(x))

  return {
    source,
    position,
    geometry,
    mode,
    fallback,
    explorerOpens: true,
    locationResolved: position !== 'UNKNOWN',
    buildingGeometry: geometry === 'AUTHORIZED_REAL_3D_MODEL' || geometry === 'VERIFIED_ARCHITECTURAL_MASSING',
    available: position !== 'UNKNOWN',
    can: {
      model: geometry === 'AUTHORIZED_REAL_3D_MODEL' || geometry === 'VERIFIED_ARCHITECTURAL_MASSING',
      // 점으로 짚어도 되는 것은 필지 확인과 주소 좌표뿐. 공고명 좌표는 범위로, 지역 기준점은 짚지 않는다
      pinpoint: position === 'PARCEL_CONFIRMED' || position === 'ADDRESS_GEOCODED',
      approximateArea: position === 'NAME_GEOCODED',
      regionContext: position !== 'UNKNOWN',
    },
    accuracy: POSITION_TEXT[position],
    limitations: limitations.length ? limitations : ['확인된 범위 안에서만 그립니다.'],
  }
}

/** 공간 탐험 화면은 언제나 연다 — 위치를 몰라도 이유와 전국 무대를 보여 준다 */
export const canExplore = (c: SpatialCapability) => c.explorerOpens
