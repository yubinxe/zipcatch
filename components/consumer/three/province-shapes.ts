import * as THREE from 'three'
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js'

/**
 * 시·도 SVG 경로 → 세울 수 있는 윤곽(three.Shape).
 *
 * 첫 화면 입체 지도(atlas-scene)가 쓰는 다듬기를 그대로 따른다 — 해안선의 잔 마디는
 * 펴고, 눈에 잡히지 않는 바위섬과 본토에서 멀리 떨어진 섬(울릉도)은 세우지 않는다.
 * 좌표는 SVG 한 칸 = `unit`, 가운데(cx, cy)가 원점, SVG 의 위(북)가 -y 가 아닌 +y 다.
 */

export interface ProvinceOutline {
  shape: THREE.Shape
  outer: THREE.Vector2[]
  holes: THREE.Vector2[][]
  a: number
}

export function ringArea(pts: THREE.Vector2[]) {
  let s = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += pts[j].x * pts[i].y - pts[i].x * pts[j].y
  return s / 2
}

function inside(x: number, y: number, poly: THREE.Vector2[]) {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c
  }
  return c
}

function segDist2(p: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = dx * dx + dy * dy
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0
  const ex = a.x + t * dx - p.x
  const ey = a.y + t * dy - p.y
  return ex * ex + ey * ey
}

function edgeDist(x: number, y: number, polys: THREE.Vector2[][]) {
  const p = new THREE.Vector2(x, y)
  let best = Infinity
  for (const poly of polys) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) best = Math.min(best, segDist2(p, poly[j], poly[i]))
  }
  return Math.sqrt(best)
}

/** 닫힌 고리를 더글러스-포이커로 편다 — 벽이 마디마다 다른 빛을 받아 빗살무늬가 되지 않게 */
function simplifyRing(src: THREE.Vector2[], tol: number): THREE.Vector2[] {
  const pts = src.slice()
  if (pts.length > 2 && pts[0].distanceToSquared(pts[pts.length - 1]) < 1e-12) pts.pop()
  const n = pts.length
  if (n < 8) return pts
  let far = 0
  let fd = -1
  for (let i = 1; i < n; i++) {
    const d = pts[0].distanceToSquared(pts[i])
    if (d > fd) {
      fd = d
      far = i
    }
  }
  const keep = new Uint8Array(n)
  keep[0] = keep[far] = 1
  const t2 = tol * tol
  const stack: [number, number][] = [
    [0, far],
    [far, n],
  ]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const pa = pts[a]
    const pb = pts[b % n]
    let idx = -1
    let md = t2
    for (let i = a + 1; i < b; i++) {
      const d = segDist2(pts[i], pa, pb)
      if (d > md) {
        md = d
        idx = i
      }
    }
    if (idx >= 0) {
      keep[idx] = 1
      stack.push([a, idx], [idx, b])
    }
  }
  const out: THREE.Vector2[] = []
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i])
  return out.length >= 3 ? out : pts
}

/** 지역 안에서 가장자리로부터 가장 먼 점 — 숫자 표가 설 자리 */
export function poleOf(outer: THREE.Vector2[], holes: THREE.Vector2[][]) {
  const all = [outer, ...holes]
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of outer) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  const ok = (x: number, y: number) => inside(x, y, outer) && !holes.some(h => inside(x, y, h))
  let bx = (minX + maxX) / 2
  let by = (minY + maxY) / 2
  let bd = -1
  const N = 22
  const sx = (maxX - minX) / N
  const sy = (maxY - minY) / N
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const x = minX + (i + 0.5) * sx
      const y = minY + (j + 0.5) * sy
      if (!ok(x, y)) continue
      const d = edgeDist(x, y, all)
      if (d > bd) {
        bd = d
        bx = x
        by = y
      }
    }
  }
  return new THREE.Vector2(bx, by)
}

export function buildOutlines(
  input: { code: string; path: string }[],
  opts: { unit: number; cx: number; cy: number },
): Map<string, ProvinceOutline[]> {
  const { unit, cx, cy } = opts
  const simplify = 0.55 * unit
  const minIsland = 42 * unit * unit
  const remoteD = 60 * unit
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg"><g transform="scale(${unit},${-unit}) translate(${-cx},${-cy})">` +
    input.map(p => `<path id="p${p.code}" d="${p.path}"/>`).join('') +
    '</g></svg>'
  const parsed = new SVGLoader().parse(svg)

  const remote = (island: THREE.Vector2[], main: THREE.Vector2[]) => {
    if (!island.length || !main.length) return false
    const c = island.reduce((a, p) => a.add(p), new THREE.Vector2()).divideScalar(island.length)
    let best = Infinity
    for (const q of main) best = Math.min(best, q.distanceToSquared(c))
    return best > remoteD * remoteD
  }

  const out = new Map<string, ProvinceOutline[]>()
  for (const path of parsed.paths) {
    const id = String((path.userData?.node as Element | undefined)?.getAttribute?.('id') ?? '').slice(1)
    if (!id) continue
    const list: ProvinceOutline[] = []
    for (const s of path.toShapes()) {
      const outer = simplifyRing(s.getPoints(), simplify)
      list.push({
        shape: s,
        outer,
        holes: s.holes.map(h => simplifyRing(h.getPoints(), simplify)).filter(h => Math.abs(ringArea(h)) > minIsland * 0.5),
        a: Math.abs(ringArea(outer)),
      })
    }
    list.sort((x, y) => y.a - x.a)
    const main = list[0]?.outer ?? []
    const kept = list.filter((o, i) => i === 0 || (o.a >= minIsland && !remote(o.outer, main)))
    for (const o of kept) {
      const sh = new THREE.Shape(o.outer)
      sh.holes = o.holes.map(h => new THREE.Path(h))
      o.shape = sh
    }
    out.set(id, kept)
  }
  return out
}
