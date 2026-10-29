import mapData from '@svg-maps/south-korea'
import { svgPathBbox } from 'svg-path-bbox'

interface SvgMapLocation {
  id: string
  name: string
  path: string
}

interface SvgMap {
  viewBox: string
  locations: SvgMapLocation[]
}

const southKoreaMap = mapData as SvgMap

/** @svg-maps id → 청약 API 지역 코드 */
export const SVG_ID_TO_REGION_CODE: Record<string, string> = {
  seoul: '100',
  busan: '600',
  daegu: '700',
  incheon: '400',
  gwangju: '500',
  daejeon: '300',
  ulsan: '680',
  sejong: '338',
  gyeonggi: '410',
  gangwon: '200',
  'north-chungcheong': '360',
  'south-chungcheong': '312',
  'north-gyeongsang': '712',
  'south-gyeongsang': '621',
  'north-jeolla': '560',
  'south-jeolla': '513',
  jeju: '690',
}

export const KOREA_MAP_VIEWBOX = southKoreaMap.viewBox

export interface KoreaProvincePath {
  id: string
  name: string
  path: string
  code: string
}

/** 울릉도·독도는 본토에서 동쪽으로 멀리(원본 x 512~524) 떨어져 있다. 이보다 동쪽에서 시작하는 조각을 섬으로 본다 */
const REMOTE_ISLAND_X = 450

/**
 * 경로에서 본토와 멀리 떨어진 섬 조각을 걷어낸다.
 *
 * 원본 경북 경로는 'm 522.6,128.2 … z m -223.29,222.72 …' — 첫 조각이 울릉도이고
 * 둘째 조각(본토)은 상대 좌표로 이어진다. 'z' 뒤 현재 점은 그 조각의 시작점이므로,
 * 첫 조각을 지울 때 둘째 조각의 시작을 절대 좌표로 바꿔 적는다.
 * 모양이 예상과 다르면(절대 좌표, 조각 셋 이상 등) 손대지 않고 원본을 돌려준다.
 */
function withoutRemoteIsland(path: string): string {
  const head = /^\s*m\s*(-?[\d.]+)[ ,](-?[\d.]+)/.exec(path)
  if (!head) return path
  const x0 = Number(head[1])
  const y0 = Number(head[2])
  if (!(x0 > REMOTE_ISLAND_X)) return path
  const cut = /z\s*m\s*(-?[\d.]+)[ ,](-?[\d.]+)/i.exec(path)
  if (!cut || cut.index === undefined) return path
  const rest = path.slice(cut.index + cut[0].length)
  if (/m/i.test(rest)) return path
  const x = +(x0 + Number(cut[1])).toFixed(4)
  const y = +(y0 + Number(cut[2])).toFixed(4)
  // 경로 첫머리의 소문자 m 은 절대 위치로 읽히고, 뒤따르는 좌표쌍은 상대 l 로 읽힌다 — 원본 문법 그대로
  return `m ${x},${y}${rest}`
}

/**
 * 화면에 그리는 시도 경로 — 울릉도·독도 조각은 뺀다(첫 화면·장면·지도 진입 모두 본토와 제주만).
 * 섬은 데이터에서 지우지 않는다: 지역 코드·집계·선택은 경북 그대로이고,
 * 원본 경로는 공급 지도의 작은 상자(IslandInset)가 KOREA_ISLAND_PROVINCE 로 쓴다.
 */
export const KOREA_PROVINCES: KoreaProvincePath[] = southKoreaMap.locations.map((loc: SvgMapLocation) => ({
  id: loc.id,
  name: loc.name,
  path: withoutRemoteIsland(loc.path),
  code: SVG_ID_TO_REGION_CODE[loc.id] ?? loc.id,
}))

const MAP_FALLBACK = { x: 262, y: 316, width: 524, height: 631 }

/** SVG path의 실제 바운딩 박스 (마커·라벨용) */
export function pathBBox(path: string): { x: number; y: number; width: number; height: number } {
  try {
    const [minX, minY, maxX, maxY] = svgPathBbox(path)
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
  } catch {
    return { ...MAP_FALLBACK }
  }
}

export function pathBBoxCenter(path: string): { x: number; y: number } {
  const b = pathBBox(path)
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

export const REGION_BBOX_BY_CODE = Object.fromEntries(
  KOREA_PROVINCES.map(p => [p.code, pathBBox(p.path)]),
)

export const REGION_CENTROID_BY_CODE = Object.fromEntries(
  KOREA_PROVINCES.map(p => [p.code, pathBBoxCenter(p.path)]),
)

/**
 * 첫 화면 지도의 '보는 틀' — 본토와 제주만 담는다.
 *
 * 원본 viewBox(0 0 524 631)는 울릉도·독도(x 512~524)까지 담느라 오른쪽 4분의 1이
 * 비어 있다. 그대로 칸에 맞추면 본토가 왼쪽 위로 쏠려 보인다(실측: 왼쪽 40px · 위 33px).
 * 본토(x 1~397, y 0~527)와 제주(y ~630)를 감싸고 사방에 같은 여백을 둔다.
 * 울릉도·독도 조각은 KOREA_PROVINCES 에서 걷어냈다(데이터·집계·선택은 경북 그대로).
 * 첫 화면 지도는 별도 상자 없이 본토·제주만 보여 주고, 공급 지도(SupplyMap)는
 * KOREA_ISLAND_INSET 으로 따로 그린다.
 */
export const KOREA_VISUAL_VIEWBOX = '-14 -14 426 660'

/** 울릉도·독도를 담는 작은 상자의 viewBox — 공급 지도(SupplyMap)가 쓴다(원본 좌표 x 512~524, y 127~139 둘레) */
export const KOREA_ISLAND_INSET = '506 121 24 24'

/** 울릉도·독도가 들어 있는 경로(경북) */
export const KOREA_ISLAND_PROVINCE = (() => {
  const loc = southKoreaMap.locations.find(l => l.id === 'north-gyeongsang')
  return loc ? { id: loc.id, name: loc.name, path: loc.path, code: SVG_ID_TO_REGION_CODE[loc.id] } : undefined
})()
