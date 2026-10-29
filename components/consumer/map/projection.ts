/**
 * 위경도 ↔ 지도 경로 좌표(@svg-maps/south-korea, viewBox 0 0 524 631).
 *
 * 벡터 지도에서 카카오 지도로 넘어가는 순간 두 그림이 같은 자리에 겹쳐야 한 번의
 * 카메라 움직임으로 읽힌다. 그러려면 "카카오가 여는 위도·경도"가 경로 좌표의
 * 어디인지 알아야 한다.
 *
 * ── 보정(calibration) ─────────────────────────────────────────────
 * 경로 원본은 메르카토르(등각)로 그려져 있다. 세 가지 모형을 같은 기준점에 맞춰
 * 비교했다(오차는 경로 좌표 1칸 ≈ 0.94km 기준):
 *
 *   횡메르카토르(TM, 중앙 127.5°)  RMS 2.2칸 · 제주가 9칸 어긋남
 *   등장방형(위경도 그대로)         RMS 1.9칸
 *   메르카토르 x·y 따로              RMS 1.5칸 · x/y 축척비 0.993
 *   메르카토르 축척 하나(등각)       RMS 1.55칸  ← 채택
 *
 * 기준점: 바다·섬이 없는 광역시 네 곳(서울·대전·광주·대구)의 동서남북 극점
 * (공식 '위치' 자료, 분 단위)과 경로의 바운딩 박스 16개, 그리고 강원 북단
 * (38°36.8′)·경기 북단(38°17′)·부산 북단(35°23′)·강원 동단(129°21′) 4개.
 * 섬이 붙은 시도(인천·전남·경남·제주)는 원본이 먼 섬을 빼거나 옮겨 그려 기준에서 뺐다.
 * 분 단위 자료 자체의 오차가 약 ±0.9칸이라 이보다 더 맞출 근거는 없다.
 *
 *   x = K·λ + BX,  y = −K·ln(tan(π/4 + φ/2)) + BY     (λ·φ 는 라디안)
 *
 * 검증(경로 안에 드는가, 브라우저 isPointInFill): 서울시청 → (153.0, 127.2) 서울,
 * 부산시청 → (350.9, 406.9) 부산, 제주시청 → (108.8, 595.9) 제주. 그 밖의 시청·도청
 * 17곳을 더해 20곳 모두 제 시도 안에 든다.
 * 제주는 원본이 섬을 왼쪽 위로 (−2.1, −2.9)칸 옮겨 그렸다(섬의 극점 4개 비교) — 그만큼 되돌린다.
 * 보정 전에는 서귀포시청(남쪽 해안)이 바다에 떨어졌다.
 * 울릉도·독도는 원본이 경북 오른쪽 위(x 512~524)로 옮겨 그린 것이라 이 식이 맞지 않는다.
 */

const D2R = Math.PI / 180

/** 라디안 1 당 경로 좌표 칸 수 */
export const CAL_K = 5404.828
export const CAL_BX = -11825.072
export const CAL_BY = 3956.061

const EARTH_R = 6378137

export interface LatLng {
  lat: number
  lng: number
}

export interface Pt {
  x: number
  y: number
}

/** 제주 보정 — 원본이 섬을 이만큼 왼쪽 위로 옮겨 그렸다(섬의 동서남북 극점 4개 평균) */
const JEJU_DX = -2.1
const JEJU_DY = -2.9

export function project(lat: number, lng: number): Pt {
  // 북위 34.2° 아래로 내려갈수록 제주 보정을 얹는다(34.2→0, 33.8→전부). 본토 남해안은 34.3° 위다
  const j = Math.max(0, Math.min(1, (34.2 - lat) / 0.4))
  return {
    x: CAL_K * lng * D2R + CAL_BX + JEJU_DX * j,
    y: -CAL_K * Math.log(Math.tan(Math.PI / 4 + (lat * D2R) / 2)) + CAL_BY + JEJU_DY * j,
  }
}

/** project 의 역. 본토 기준이다(제주 보정은 되돌리지 않는다 — 짐작에만 쓴다) */
export function unproject(p: Pt): LatLng {
  const lng = (p.x - CAL_BX) / CAL_K / D2R
  const lat = (2 * Math.atan(Math.exp((CAL_BY - p.y) / CAL_K)) - Math.PI / 2) / D2R
  return { lat, lng }
}

/** 그 위도에서 경로 좌표 1칸이 땅 위로 몇 m 인가 (메르카토르라 위도마다 다르다) */
export function metersPerUnit(lat: number) {
  return (EARTH_R * Math.cos(lat * D2R)) / CAL_K
}

/**
 * 카카오 지도 level 의 화면 1px 당 m.
 *
 * 카카오(다음) 지도는 WCONGNAMUL 좌표(1 = 0.4m)를 쓰고, level 3 에서 1px 이 1 이다.
 * 한 단 오를 때마다 두 배. 이 값은 **예측**에만 쓴다 — 실제 넘김은 카카오가 돌려준
 * 화면 범위(getBounds)로 맞추므로, 이 수가 조금 틀려도 넘기는 순간은 어긋나지 않는다.
 */
export function kakaoMetersPerPixel(level: number) {
  return 0.4 * 2 ** (level - 3)
}

/** 벡터 지도를 이보다 더 당기지 않는다 — 원본 경로의 해상도(약 0.1칸)가 드러난다 */
export const MAX_VECTOR_SCALE = 28

/**
 * 카카오 지도를 몇 단 넓게 열지.
 *
 * 벡터가 다가오다 넘겨주면, 마지막 한 단은 카카오가 직접 당긴다 — 그래야 바꿔
 * 끼우는 게 아니라 하나의 움직임이 된다. 벡터가 너무 가까이 가야 하는 목표면
 * (공고가 한 점에 몰린 경우) 벡터가 갈 수 있는 데까지 넓혀서 넘긴다.
 */
export function introStartLevel(target: number, lat: number, reduced: boolean) {
  if (reduced) return target
  let level = Math.min(14, target + 1)
  while (level < 14 && metersPerUnit(lat) / kakaoMetersPerPixel(level) > MAX_VECTOR_SCALE) level++
  return level
}

/**
 * 카카오 setBounds(범위, 32, 32, 32, 32) 가 고를 화면을 미리 짐작한다.
 * 범위가 다 들어가는 가장 가까운 level, 가운데는 범위의 가운데.
 */
export function predictKakaoView(
  points: LatLng[],
  fallback: { center: LatLng; level: number },
  W: number,
  H: number,
): { center: LatLng; level: number } {
  if (points.length === 0) return fallback
  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity
  for (const p of points) {
    minLat = Math.min(minLat, p.lat)
    maxLat = Math.max(maxLat, p.lat)
    minLng = Math.min(minLng, p.lng)
    maxLng = Math.max(maxLng, p.lng)
  }
  const sw = project(minLat, minLng)
  const ne = project(maxLat, maxLng)
  const c = unproject({ x: (sw.x + ne.x) / 2, y: (sw.y + ne.y) / 2 })
  const mpu = metersPerUnit(c.lat)
  const spanX = (ne.x - sw.x) * mpu
  const spanY = (sw.y - ne.y) * mpu
  const availX = Math.max(1, W - 64)
  const availY = Math.max(1, H - 64)
  let level = 1
  while (level < 14 && (spanX / kakaoMetersPerPixel(level) > availX || spanY / kakaoMetersPerPixel(level) > availY))
    level++
  return { center: c, level }
}
