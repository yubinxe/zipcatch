/**
 * 경위도 → 전국 경계 그림(@svg-maps/south-korea, viewBox 0 0 524 631)의 좌표.
 *
 * 예전 무대(geo-scene)는 경위도 범위(125~131°E, 33~38.7°N)를 viewBox 에 선형으로 늘렸다.
 * 이 그림은 그 틀로 그려진 것이 아니었다 — 시청·도청 17곳 가운데 9곳이 다른 시·도에 떨어졌다
 * (서울시청이 경기, 제주시청이 바다).
 *
 * 그림의 도법을 밝힌 문서가 없어, 그림 자신에서 도법을 찾았다. 시·도 판 13개의 면적 중심과
 * 각 시·도의 지리 중심을 짝지어, 메르카토르 좌표(경도 · ln tan(π/4+φ/2)) 위의 아핀 변환을
 * 최소제곱으로 맞췄다. 맞춘 결과는 축이 거의 섞이지 않는 순수한 메르카토르다
 * (x ≈ 94.2·경도, y ≈ −93.6·메르카토르 위도) — 그림이 메르카토르로 그려졌다는 뜻이다.
 * 잔차는 판 중심마다 0.1~3.2px(그림 1px ≈ 1.1km).
 *
 * 맞추는 데 쓰지 않은 시청·구청 39곳으로 다시 재어, 경계에서 1km 안쪽의 한 곳을 빼고 모두
 * 제 시·도 안에 떨어진다(tests/geo-projection.test.mjs). 이 그림의 해상도(1px ≈ 1km)보다 경계에
 * 가까운 점은 판정하지 않는다 — 그래서 시·도 판정은 '경계에서 2px 넘게 들어와 있을 때'만 믿는다.
 *
 * 한 도시를 맞추려고 따로 밀어 넣은 값은 없다. 이 변환은 전국 무대의 '어느 시·도인가'까지만
 * 책임진다. 동네 수준은 미터 좌표로 따로 그린다(Neighborhood3D).
 */

/** x = A·경도 + B·m + C, y = D·경도 + E·m + F  (m = 메르카토르 위도, 도 단위) */
const A = 94.19834
const B = -0.35754
const C = -11795.95318
const D = 0.55592
const E = -93.58991
const F = 3856.71567

const DEG = Math.PI / 180
/** 메르카토르 위도(도) */
export const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2)) / DEG

export function projectToMap(lat: number, lng: number): { x: number; y: number } {
  const m = mercY(lat)
  return { x: A * lng + B * m + C, y: D * lng + E * m + F }
}

/* ── 경계 그림 → 다각형 ─────────────────────────────────────
   이 그림의 경로는 상대 이동(m)과 그 뒤의 상대 직선, 닫기(z)만 쓴다. */
export type Ring = [number, number][]

export function parseMapPath(d: string): Ring[] {
  const t = d.match(/[mz]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []
  const rings: Ring[] = []
  let cx = 0
  let cy = 0
  let sx = 0
  let sy = 0
  let i = 0
  while (i < t.length) {
    const k = t[i]
    if (k === 'm' || k === 'M') {
      const abs = k === 'M'
      i++
      const x = Number(t[i++])
      const y = Number(t[i++])
      cx = abs ? x : cx + x
      cy = abs ? y : cy + y
      sx = cx
      sy = cy
      const ring: Ring = [[cx, cy]]
      rings.push(ring)
      while (i < t.length && !/[mz]/i.test(t[i])) {
        cx += Number(t[i++])
        cy += Number(t[i++])
        ring.push([cx, cy])
      }
    } else if (k === 'z' || k === 'Z') {
      cx = sx
      cy = sy
      i++
    } else i++
  }
  return rings
}

export function inRing(p: { x: number; y: number }, ring: Ring): boolean {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}

/** 점에서 다각형 변까지의 가장 짧은 거리(그림 px) */
export function edgeDistance(p: { x: number; y: number }, rings: Ring[]): number {
  let best = Infinity
  for (const r of rings)
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [x1, y1] = r[j]
      const [x2, y2] = r[i]
      const dx = x2 - x1
      const dy = y2 - y1
      const L = dx * dx + dy * dy
      const t = L ? Math.max(0, Math.min(1, ((p.x - x1) * dx + (p.y - y1) * dy) / L)) : 0
      const ex = x1 + t * dx - p.x
      const ey = y1 + t * dy - p.y
      best = Math.min(best, Math.hypot(ex, ey))
    }
  return best
}

/** 대한민국 범위(독도·마라도·백령도 포함)를 벗어난 좌표는 좌표가 아니다 */
export function validLatLng(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= 33.0 &&
    lat <= 38.9 &&
    lng >= 124.5 &&
    lng <= 132.0
  )
}

/** 경계에서 이만큼(px) 들어와야 '그 시·도 안'이라 믿는다 — 그림 해상도 1px ≈ 1km */
export const EDGE_TOLERANCE_PX = 2
