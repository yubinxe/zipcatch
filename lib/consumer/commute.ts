/**
 * 통근 — 공고 자리에서 업무지구까지.
 *
 * 경로 시간은 ODsay(/api/transit)가 답할 때만 쓴다. 답하지 못하면(키 미설정·인증 실패)
 * 직선거리만 적고 '경로 시간 아님'을 밝힌다. 좌표가 지역 기준점이면 거리를 내지 않는다 —
 * 광역 한가운데에서 잰 거리는 그 집의 거리가 아니다.
 */

export interface Hub {
  name: string
  x: number
  y: number
}

const METRO: Hub[] = [
  { name: '강남역', x: 127.0276, y: 37.4979 },
  { name: '시청역', x: 126.9772, y: 37.5657 },
  { name: '여의도역', x: 126.9243, y: 37.5216 },
  { name: '판교역', x: 127.1112, y: 37.3948 },
]
export const HUBS: Record<string, Hub[]> = {
  서울: METRO,
  경기: METRO,
  인천: [{ name: '인천시청역', x: 126.7027, y: 37.4573 }, ...METRO.slice(0, 3)],
  부산: [{ name: '서면역', x: 129.0592, y: 35.1578 }, { name: '센텀시티역', x: 129.1316, y: 35.1693 }],
  대구: [{ name: '반월당역', x: 128.5933, y: 35.8657 }, { name: '동대구역', x: 128.6283, y: 35.8794 }],
  대전: [{ name: '대전시청역', x: 127.3863, y: 36.3515 }, { name: '대전역', x: 127.4344, y: 36.3324 }],
  광주: [{ name: '광주시청', x: 126.8514, y: 35.1601 }, { name: '상무역', x: 126.8466, y: 35.1529 }],
  울산: [{ name: '울산시청', x: 129.3114, y: 35.5396 }],
  세종: [{ name: '정부세종청사', x: 127.2591, y: 36.504 }],
}

/** 모든 업무지구 (이름 겹침 없이) */
export const ALL_HUBS: Hub[] = [...new Map(Object.values(HUBS).flat().map(h => [h.name, h])).values()]

export function transitHubs(province: string): Hub[] {
  if (HUBS[province]) return HUBS[province]
  if (province.includes('광주')) return HUBS['광주']
  return []
}

/** 두 점 사이 직선거리(km) */
export function km(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = (d: number) => (d * Math.PI) / 180
  const h = Math.sin(r(bLat - aLat) / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLng - aLng) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}

export type CoordTrust = 'ADDRESS' | 'NAME' | 'NONE'

/** 좌표를 거리 계산에 써도 되는지. 주소로 찾은 자리만 '정확', 공고명으로 찾은 자리는 '대략' */
export function coordTrust(lat: number | null, lng: number | null, geoSource: string | null): CoordTrust {
  if (lat === null || lng === null) return 'NONE'
  if (geoSource === 'ADDRESS') return 'ADDRESS'
  if (geoSource === 'NAME') return 'NAME'
  return 'NONE'
}
