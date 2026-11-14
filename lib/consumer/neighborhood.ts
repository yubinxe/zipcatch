/**
 * 공고 주변의 실제 지리 — 공개 지도(OpenStreetMap)의 건물 윤곽·길·물·공원.
 *
 * 쓰는 자료와 허락
 *  - OpenStreetMap 기여자, ODbL 1.0. 화면에 '© OpenStreetMap 기여자'를 반드시 적는다.
 *  - 자료는 미리 만든 정적 타일이다(scripts/spatial/build_tiles.py → public/spatial/<버전>/15/x/y.json).
 *    원천은 Protomaps Basemap 일일 빌드(OSM 파생). 방문자가 누를 때 바깥 지도 서버(Overpass 등)에 묻지 않는다 —
 *    공개 Overpass 는 반복 서비스용 자료원이 아니고, 운영에서 406·시간 초과로 실제로 막혔다.
 *
 * 무엇이 아닌가
 *  - 주변 건물은 '지금 있는 건물'의 윤곽이다. 공고 단지(대개 아직 짓지 않은 집)의 형상이 아니다.
 *    그래서 어떤 건물도 '이 공고의 아파트'로 강조하지 않는다.
 *  - 높이는 지도 자료에 적힌 값만 쓴다(실측 값이거나 층수에서 셈한 값 — 원천이 둘을 가르지 않는다).
 *    적힌 값이 없으면 바닥 윤곽만. 높이를 지어내지 않는다.
 *
 * 좌표는 기준점(공고 자리)에서 동쪽 x·남쪽 z 미터 — 현장 자료(lib/consumer/sites)와 같은 틀.
 */

export interface NeighborhoodData {
  origin: { lat: number; lng: number }
  radiusM: number
  /** f: 바닥 윤곽(미터) · holes: 안뜰 · h: 높이(m) — 자료에 없으면 null · est: 원천 높이(실측·층수 셈을 가르지 못함) */
  buildings: { f: [number, number][]; holes?: [number, number][][]; h: number | null; est: boolean }[]
  /** k: 1 큰길 · 0 골목 */
  roads: { k: 0 | 1; p: [number, number][] }[]
  water: [number, number][][]
  parks: [number, number][][]
  counts: { buildings: number; withHeight: number; roads: number }
  source: 'OSM_TILES'
  attribution: string
  /** 원천 빌드 기준일 */
  fetchedAt: string
}

/** 공고명 좌표는 범위가 넓다 — 그 범위만큼 받는다(빌드 스크립트와 같은 값) */
export const NEIGHBORHOOD_RADIUS = { pinpoint: 450, approximate: 600 } as const
