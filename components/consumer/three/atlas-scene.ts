import * as THREE from 'three'
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js'
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js'
import { createStage } from './stage'

/**
 * 첫 화면의 입체 지도.
 *
 * 열일곱 광역을 지도 윤곽(lib/korea-map-data 의 SVG 경로) 그대로 세운다.
 * 높이와 달아오른 정도는 `/api/notices/map` 이 돌려준 접수 중·예정 공고 수에
 * 정비례한다 — 가장 많은 곳이 가장 높고, 공고가 없는 곳은 바닥판 두께만 남는다.
 * 지어낸 높이는 없다. 고른 지역은 공중으로 떠오르고 주황으로 빛난다.
 *
 * 장면은 상태를 갖지 않는다. 무엇을 골랐는지는 React(HeroAtlas)가 쥐고,
 * 장면은 받은 대로 그리고 손이 닿은 곳을 알려 줄 뿐이다.
 */

export interface AtlasProvinceInput {
  code: string
  name: string
  path: string
}

export interface AtlasState {
  counts: Record<string, number>
  max: number
  active: string | null
  /** 숫자 표를 붙일 지역 — 앞에 올수록 먼저 자리를 잡는다 */
  labels: string[]
}

export interface AtlasCallbacks {
  onHover: (code: string | null) => void
  onPick: (code: string) => void
  onReady: () => void
  onLost: () => void
}

export interface AtlasHandle {
  update: (s: AtlasState) => void
  dispose: () => void
}

/* SVG 한 칸 = 0.01. 지도 전체가 5.24 × 6.31 쯤 된다 */
const UNIT = 0.01
const CX = 262
const CY = 315.5
const HALF_D = 3.16

/** 공고가 없어도 남는 땅의 두께 */
const BASE_H = 0.07
/** 가장 많은 지역이 더 올라가는 높이 — 공고 수에 정비례 */
const DATA_H = 1.3
/** 고른 지역이 떠오르는 높이 */
const LIFT = 0.2
/** 카메라가 정수리에서 기운 각(라디안) */
const POLAR = 0.9
/** 해안선 다듬기 — SVG 0.55칸 안쪽의 잔 마디는 펴고, 6.5×6.5칸보다 작은 바위섬은 세우지 않는다 */
const SIMPLIFY = 0.55 * UNIT
const MIN_ISLAND = 42 * UNIT * UNIT
/** 본토 해안에서 이만큼(SVG 60칸) 넘게 떨어진 섬은 입체에서 뺀다 */
const REMOTE = 60 * UNIT

/* 석판(데이터 없음) → 숯 → 달아오른 주황. 고른 곳만 강조색 */
const C_SLATE = new THREE.Color('#171B22')
const C_EMBER = new THREE.Color('#3B1C12')
const C_HOT = new THREE.Color('#8A2E0B')
const C_ON = new THREE.Color('#C2410C')
const C_WALL = new THREE.Color('#07090D')
const E_WARM = new THREE.Color('#FF6A1F')
const E_ON = new THREE.Color('#FF8A3D')
const EDGE = new THREE.Color('#FFB27A')

interface Prov {
  code: string
  name: string
  mesh: THREE.Mesh
  mirror: THREE.Mesh
  edge: THREE.LineSegments
  cap: THREE.MeshPhysicalMaterial
  side: THREE.MeshStandardMaterial
  edgeMat: THREE.LineBasicMaterial
  anchor: THREE.Vector3
  delay: number
  h: number
  lift: number
  warm: number
  on: number
  /** 고른 지역을 가리는 정도 0~1 — 가리면 유리처럼 비운다 */
  ghost: number
  /** 벽 셰이더가 읽는 지금 높이 */
  wallU: { uH: { value: number } }
  glass: boolean
  tag: HTMLDivElement
  tagNum: HTMLElement
  tagSize: { w: number; h: number }
  tagText: string
}

/* ── 다각형 계산 ─────────────────────────────────────────── */
function area(pts: THREE.Vector2[]) {
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

function edgeDist(x: number, y: number, polys: THREE.Vector2[][]) {
  let best = Infinity
  for (const poly of polys) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[j]
      const b = poly[i]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = dx * dx + dy * dy || 1e-9
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len))
      const ex = a.x + t * dx - x
      const ey = a.y + t * dy - y
      const d = ex * ex + ey * ey
      if (d < best) best = d
    }
  }
  return Math.sqrt(best)
}

/** 선분에서 점까지 거리의 제곱 */
function segDist2(p: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = dx * dx + dy * dy
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0
  const ex = a.x + t * dx - p.x
  const ey = a.y + t * dy - p.y
  return ex * ex + ey * ey
}

/**
 * 닫힌 고리를 더글러스-포이커로 편다. 해안선의 잔 마디마다 벽이 따로 빛을 받으면
 * 벽이 빗살무늬가 된다 — 눈에 보이지 않는 마디는 덜어 낸다.
 */
function simplifyRing(src: THREE.Vector2[], tol: number): THREE.Vector2[] {
  const pts = src.slice()
  if (pts.length > 2 && pts[0].distanceToSquared(pts[pts.length - 1]) < 1e-12) pts.pop()
  const n = pts.length
  if (n < 8) return pts
  // 첫 점에서 가장 먼 점으로 고리를 둘로 나눈다
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

/**
 * 본토에서 멀리 떨어진 작은 섬인가(울릉도). 지도 칸을 섬 하나 때문에 옆으로 넓히면
 * 본토가 작아지고, 칸 끝에 걸치면 시선이 흔들릴 때마다 잘려 보인다. 입체에서는
 * 세우지 않는다 — 지역의 기둥은 본토에서 솟고, 평면 지도에는 그대로 있다.
 */
function remote(island: THREE.Vector2[], main: THREE.Vector2[]) {
  if (!island.length || !main.length) return false
  const c = island.reduce((a, p) => a.add(p), new THREE.Vector2()).divideScalar(island.length)
  let best = Infinity
  for (const q of main) best = Math.min(best, q.distanceToSquared(c))
  return best > REMOTE * REMOTE
}

/** 지역 안에서 가장자리로부터 가장 먼 점 — 숫자 표와 빛기둥이 설 자리 */
function poleOf(outer: THREE.Vector2[], holes: THREE.Vector2[][]) {
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
  const N = 26
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
  // 한 번 더 좁혀 본다
  for (let i = -4; i <= 4; i++) {
    for (let j = -4; j <= 4; j++) {
      const x = bx + (i / 4) * sx
      const y = by + (j / 4) * sy
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

/* ── 텍스처 — 그림 파일 없이 그 자리에서 그린다 ──────────── */
function seeded(seed: number) {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

/** 윗면의 도시 불빛. 바탕은 거의 꺼 두고, 불빛 무리만 밝게 — 발광 세기에 곱해진다 */
function cityLights() {
  const S = 512
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  // 바탕 불빛은 낮게 — 푸른 석판 위에 주황이 고르게 깔리면 보랏빛으로 섞인다. 불빛 무리만 밝게
  g.fillStyle = '#161616'
  g.fillRect(0, 0, S, S)
  const rnd = seeded(11)
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-6)) * Math.cos(2 * Math.PI * rnd())
  const dot = (x: number, y: number, r: number, a: number) => {
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        const px = x + ox
        const py = y + oy
        if (px < -r || px > S + r || py < -r || py > S + r) continue
        const grd = g.createRadialGradient(px, py, 0, px, py, r)
        grd.addColorStop(0, `rgba(255,255,255,${a})`)
        grd.addColorStop(1, 'rgba(255,255,255,0)')
        g.fillStyle = grd
        g.fillRect(px - r, py - r, r * 2, r * 2)
      }
    }
  }
  // 큰 도시의 번진 빛 → 동네의 잔 불빛
  for (let k = 0; k < 14; k++) {
    const cx = rnd() * S
    const cy = rnd() * S
    dot(cx, cy, 26 + rnd() * 30, 0.16)
    const n = 40 + rnd() * 90
    const spread = 10 + rnd() * 30
    for (let i = 0; i < n; i++) dot(cx + gauss() * spread, cy + gauss() * spread, 1.6 + rnd() * 2.4, 0.5 + rnd() * 0.5)
  }
  for (let i = 0; i < 520; i++) dot(rnd() * S, rnd() * S, 1.1 + rnd() * 1.4, 0.18 + rnd() * 0.4)
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  tex.repeat.set(0.85, 0.85)
  return tex
}

/**
 * 옆벽의 결 — 아래는 어둠에 묻히고 위로 갈수록 달아오른다.
 * 텍스처 대신 셰이더 안에서 바로 계산한다. 벽의 UV 는 해안선을 따라 마디마다
 * 방향이 바뀌어, 그림으로 칠하면 세로 줄무늬가 진다.
 * 밝기는 실제 높이(uH 곱)로 잰다 — 낮은 벽까지 위끝이 똑같이 달아오르면 해안선
 * 전체가 주황 테두리가 되어 높은 곳이 도드라지지 않는다. 윗끝의 가는 띠만 남긴다.
 */
function wallShader(shader: { vertexShader: string; fragmentShader: string; uniforms: Record<string, THREE.IUniform> }, u: { uH: THREE.IUniform<number> }) {
  shader.uniforms.uH = u.uH
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying float vWallH;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWallH = position.y;')
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vWallH;\nuniform float uH;')
    .replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      {
        float y = clamp(vWallH, 0.0, 1.0) * uH;
        float body = 0.04 + 0.6 * pow(clamp(y / ${(BASE_H + DATA_H).toFixed(3)}, 0.0, 1.0), 1.5);
        float rim = smoothstep(uH - 0.04, uH - 0.004, y) * (0.15 + 0.85 * smoothstep(0.12, 0.7, uH));
        totalEmissiveRadiance *= body + rim * 0.9;
      }`,
    )
}

/* ── 셰이더 ─────────────────────────────────────────────── */
const FLOOR_VS = /* glsl */ `
varying vec3 vPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`

/*
 * 바닥 — 어둡고 반들한 판. 아래 비친 지도가 살짝 보이게 반만 덮는다.
 * 가장자리는 화면 기준의 타원으로 사라진다 — 캔버스의 네모난 칸이 드러나지 않게.
 */
const FLOOR_FS = /* glsl */ `
uniform vec3 uBase;
uniform vec3 uGrid;
uniform vec3 uGlow;
uniform vec2 uSpot;
uniform float uSpotAmt;
uniform float uTime;
uniform vec2 uRes;
varying vec3 vPos;
void main() {
  float r = length(vPos.xz * vec2(1.0, 0.8));
  float fade = 1.0 - smoothstep(1.8, 4.6, r);
  vec2 q = vPos.xz * 3.0;
  vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q);
  float line = 1.0 - min(min(g.x, g.y), 1.0);
  // 큰 칸마다 조금 더 진한 선
  vec2 q2 = vPos.xz * 0.75;
  vec2 g2 = abs(fract(q2 - 0.5) - 0.5) / fwidth(q2);
  float major = 1.0 - min(min(g2.x, g2.y), 1.0);
  float d = length(vPos.xz - uSpot);
  float pool = exp(-d * d * 2.4) * uSpotAmt;
  float ph = fract(uTime * 0.32);
  // 제곱은 곱으로 — pow(음수, 2.0) 은 GPU 에 따라 NaN 이다
  float rr = (d - 0.28 - ph * 2.2) / 0.03;
  float ring = exp(-rr * rr) * (1.0 - ph) * (1.0 - ph) * uSpotAmt;
  vec2 sc = gl_FragCoord.xy / uRes - vec2(0.5, 0.52);
  float vig = 1.0 - smoothstep(0.32, 0.5, length(sc * vec2(1.0, 1.08)));
  fade *= vig;
  vec3 col = uBase + uGrid * (line * 0.55 + major * 0.6) * fade + uGlow * (pool * 0.35 + ring * 1.2);
  float a = fade * 0.78 + (pool * 0.2 + ring * 0.5) * vig;
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

const BEAM_VS = /* glsl */ `
varying float vY;
varying float vRim;
void main() {
  vY = position.y / 2.4;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * normal);
  vRim = abs(dot(n, normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
}`

/*
 * 빛기둥은 칸 위 끝에 닿기 전에 사라진다 — 북쪽 지역을 고르면 기둥 끝이 캔버스
 * 가장자리에서 칼로 자른 듯 끊기던 것을, 칸 위쪽 30% 구간에서 녹여 없앤다.
 */
const BEAM_FS = /* glsl */ `
uniform vec3 uColor;
uniform float uAmt;
uniform float uTime;
uniform vec2 uRes;
varying float vY;
varying float vRim;
void main() {
  float flick = 0.88 + 0.12 * sin(uTime * 2.2 - vY * 12.0);
  float edge = 1.0 - smoothstep(0.7, 0.96, gl_FragCoord.y / uRes.y);
  // pow 의 밑은 0 이상으로 묶는다. 기둥 꼭대기에서 보간된 vY 가 1 을 살짝 넘으면
  // pow(음수) 가 NaN 이 되고, 빛 번짐(UnrealBloom)의 흐림이 그 몇 점을 화면 전체로
  // 퍼뜨려 장면이 통째로 투명해졌다(실제 GPU 에서 첫 화면 지도가 비어 보이던 원인)
  float a = pow(clamp(vRim, 0.0, 1.0), 2.4) * pow(clamp(1.0 - vY, 0.0, 1.0), 2.6) * uAmt * flick * edge;
  gl_FragColor = vec4(uColor, clamp(a, 0.0, 1.0));
}`

const DUST_VS = /* glsl */ `
attribute float aSeed;
uniform float uTime;
uniform float uPx;
varying float vA;
void main() {
  vec3 p = position;
  p.y = mod(p.y + uTime * (0.03 + aSeed * 0.045), 1.9) + 0.04;
  p.x += sin(uTime * 0.31 + aSeed * 31.0) * 0.08;
  p.z += cos(uTime * 0.27 + aSeed * 17.0) * 0.08;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uPx * (0.5 + aSeed * 1.5) * (7.0 / -mv.z);
  float band = smoothstep(0.04, 0.4, p.y) * (1.0 - smoothstep(1.3, 1.9, p.y));
  vA = band * (0.2 + 0.6 * fract(aSeed * 91.7)) * (0.55 + 0.45 * sin(uTime * 1.6 + aSeed * 43.0));
}`

const DUST_FS = /* glsl */ `
uniform vec3 uColor;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(uColor, a * a * vA);
}`

const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3)

export function mountAtlas(host: HTMLElement, input: AtlasProvinceInput[], cb: AtlasCallbacks): AtlasHandle {
  const target = new THREE.Vector3(0, 0.12, 0.18)
  let dist = 12
  let state: AtlasState = { counts: {}, max: 0, active: null, labels: [] }
  let riseAt = -1
  let readySent = false
  let frames = 0
  const pointer = { x: 0, y: 0, sx: 0, sy: 0, inside: false }

  const stage = createStage({
    host,
    transparent: true,
    fov: 30,
    exposure: 1,
    shadows: true,
    environment: 0.22,
    envKind: 'night',
    tone: 'neutral',
    bloom: { strength: 0.58, radius: 0.36, threshold: 0.88 },
    onResize: (w, h) => {
      const dpr = stage.renderer.getPixelRatio()
      floorMat.uniforms.uRes.value.set(w * dpr, h * dpr)
      fit()
      dust.material.uniforms.uPx.value = dpr * 2.4
      for (const p of provs) p.tagSize.w = 0
    },
    onFrame: (dt, t) => frame(dt, t),
    onLost: () => cb.onLost(),
  })
  const { scene, camera, canvas } = stage

  /* ── 빛 ─────────────────────────────────────────────── */
  scene.add(new THREE.HemisphereLight('#8FA8D6', '#0B0E14', 0.55))

  // 북서쪽 높이에서 — 지도가 전통적으로 받는 빛. 그림자는 남동쪽, 보는 이 쪽으로 진다.
  // 달빛처럼 조금 푸른 흰빛 — 석판은 푸르게, 공고가 많은 곳은 제 빛으로 주황이 된다
  const key = new THREE.DirectionalLight('#E4ECFF', 1.7)
  key.position.set(-3.4, 6.2, -2.6)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.camera.left = -4.4
  key.shadow.camera.right = 4.4
  key.shadow.camera.top = 4.4
  key.shadow.camera.bottom = -4.4
  key.shadow.camera.near = 1
  key.shadow.camera.far = 16
  key.shadow.bias = -0.0005
  key.shadow.normalBias = 0.02
  key.shadow.radius = 5
  key.shadow.blurSamples = 16
  scene.add(key)

  // 뒤에서 오는 푸른 테두리빛 — 윗면 가장자리에 결을 세운다
  const rim = new THREE.DirectionalLight('#6F8FD8', 1.0)
  rim.position.set(4.5, 2.4, -5.5)
  scene.add(rim)

  const fill = new THREE.DirectionalLight('#C9D7F2', 0.55)
  fill.position.set(1.5, 2.2, 7)
  scene.add(fill)

  /* ── 땅 ─────────────────────────────────────────────── */
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg"><g transform="scale(${UNIT},${-UNIT}) translate(${-CX},${-CY})">` +
    input.map(p => `<path id="p${p.code}" d="${p.path}"/>`).join('') +
    '</g></svg>'
  const parsed = new SVGLoader().parse(svg)

  /*
   * 윤곽을 다듬는다. 광주는 전남 경로 안에 반대로 감긴 고리로 이미 뚫려 있다 —
   * SVGLoader 가 그 고리를 구멍으로 읽으므로 따로 뚫지 않는다.
   */
  interface Outline {
    shape: THREE.Shape
    outer: THREE.Vector2[]
    holes: THREE.Vector2[][]
    a: number
  }
  const outlinesBy = new Map<string, Outline[]>()
  for (const path of parsed.paths) {
    const id = String((path.userData?.node as Element | undefined)?.getAttribute?.('id') ?? '').slice(1)
    if (!id) continue
    const list: Outline[] = []
    for (const s of path.toShapes()) {
      const outer = simplifyRing(s.getPoints(), SIMPLIFY)
      const a = Math.abs(area(outer))
      list.push({
        shape: s,
        outer,
        holes: s.holes.map(h => simplifyRing(h.getPoints(), SIMPLIFY)).filter(h => Math.abs(area(h)) > MIN_ISLAND * 0.5),
        a,
      })
    }
    list.sort((x, y) => y.a - x.a)
    // 가장 큰 땅은 늘 남기고, 눈에 잡히지 않는 바위섬과 본토에서 멀리 떨어진 섬은 세우지 않는다
    const main = list[0]?.outer ?? []
    const kept = list.filter((o, i) => i === 0 || (o.a >= MIN_ISLAND && !remote(o.outer, main)))
    for (const o of kept) {
      const sh = new THREE.Shape(o.outer)
      sh.holes = o.holes.map(h => new THREE.Path(h))
      o.shape = sh
    }
    outlinesBy.set(id, kept)
  }

  const city = cityLights()
  const land = new THREE.Group()
  const mirrorGroup = new THREE.Group()
  mirrorGroup.scale.y = -1
  scene.add(land, mirrorGroup)

  const tagLayer = document.createElement('div')
  tagLayer.className = 'cs3d-tags'
  tagLayer.setAttribute('aria-hidden', 'true')
  host.appendChild(tagLayer)

  const provs: Prov[] = []
  const byCode = new Map<string, Prov>()
  const pickables: THREE.Mesh[] = []

  for (const p of input) {
    const outlines = outlinesBy.get(p.code)
    if (!outlines?.length) continue
    const shapes = outlines.map(o => o.shape)
    const raw = new THREE.ExtrudeGeometry(shapes, { depth: 1, bevelEnabled: false, curveSegments: 1 })
    // 모양은 (x, y) 평면, 밀어 올리는 방향은 z — 눕혀서 z 를 위로 세운다
    raw.rotateX(-Math.PI / 2)
    // 완만한 꺾임은 부드럽게 잇고, 윗면과 벽이 만나는 직각 모서리는 날카롭게 둔다
    const geo = toCreasedNormals(raw, Math.PI / 2.4)
    if (geo !== raw) raw.dispose()
    geo.computeBoundingSphere()

    const cap = new THREE.MeshPhysicalMaterial({
      color: C_SLATE.clone(),
      roughness: 0.42,
      metalness: 0.15,
      clearcoat: 0.7,
      clearcoatRoughness: 0.22,
      emissive: E_WARM.clone(),
      emissiveMap: city,
      emissiveIntensity: 0,
    })
    // 벽은 빛을 거의 받지 않는다 — 마디마다 다른 법선이 줄무늬를 만들지 않게.
    // 대신 아래에서 위로 달아오르는 제 빛(emissive)으로 높이를 읽힌다
    const side = new THREE.MeshStandardMaterial({
      color: C_WALL.clone(),
      roughness: 0.92,
      metalness: 0,
      emissive: E_WARM.clone(),
      emissiveIntensity: 0,
    })
    const wallU = { uH: { value: 0.001 } }
    side.onBeforeCompile = shader => wallShader(shader, wallU)
    side.customProgramCacheKey = () => 'cs3d-wall'
    const mesh = new THREE.Mesh(geo, [cap, side])
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.scale.y = 0.001
    // 유리로 비울 때 바닥(renderOrder 1)보다 뒤에 그려야 바닥이 덮지 않는다
    mesh.renderOrder = 2
    mesh.userData.code = p.code
    land.add(mesh)
    pickables.push(mesh)

    const mirror = new THREE.Mesh(geo, [cap, side])
    mirror.scale.y = 0.001
    mirrorGroup.add(mirror)

    // 윗면 테두리 — 빛나는 얇은 선
    const seg: number[] = []
    for (const o of outlines) {
      for (const loop of [o.outer, ...o.holes]) {
        for (let i = 0; i < loop.length; i++) {
          const a = loop[i]
          const b = loop[(i + 1) % loop.length]
          seg.push(a.x, 0, -a.y, b.x, 0, -b.y)
        }
      }
    }
    const edgeGeo = new THREE.BufferGeometry()
    edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3))
    const edgeMat = new THREE.LineBasicMaterial({
      color: EDGE.clone(),
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const edge = new THREE.LineSegments(edgeGeo, edgeMat)
    edge.renderOrder = 3
    land.add(edge)

    const pole = poleOf(outlines[0].outer, outlines[0].holes)
    const anchor = new THREE.Vector3(pole.x, 0, -pole.y)

    const tag = document.createElement('div')
    tag.className = 'cs3d-tag'
    const inner = document.createElement('span')
    inner.className = 'cs3d-tag__in'
    const nm = document.createElement('b')
    nm.textContent = p.name
    const num = document.createElement('i')
    inner.append(nm, num)
    tag.appendChild(inner)
    tagLayer.appendChild(tag)

    const prov: Prov = {
      code: p.code,
      name: p.name,
      mesh,
      mirror,
      edge,
      cap,
      side,
      edgeMat,
      anchor,
      // 북에서 남으로 차례로 솟는다
      delay: ((anchor.z + HALF_D) / (2 * HALF_D)) * 0.75,
      h: 0.001,
      lift: 0,
      warm: 0,
      on: 0,
      ghost: 0,
      wallU,
      glass: false,
      tag,
      tagNum: num,
      tagSize: { w: 0, h: 0 },
      tagText: '',
    }
    provs.push(prov)
    byCode.set(p.code, prov)
  }

  /*
   * 유리로 비운 지역의 셰이더(투명한 판)도 처음에 함께 엮어 둔다 — 둘러보기가 처음
   * 서울로 넘어가는 순간 셰이더를 엮느라 멈칫하지 않게. 화면 밖 아래에 둔 조각
   * 하나가 그 재질을 들고 있다(그릴 때는 잘려 나가 그려지지 않는다).
   */
  if (provs[0]) {
    const p0 = provs[0]
    const capGlass = p0.cap.clone()
    const sideGlass = p0.side.clone()
    const glassU = { uH: { value: 1 } }
    sideGlass.onBeforeCompile = shader => wallShader(shader, glassU)
    sideGlass.customProgramCacheKey = () => 'cs3d-wall'
    for (const m of [capGlass, sideGlass]) {
      m.transparent = true
      m.depthWrite = false
    }
    const primer = new THREE.Mesh(p0.mesh.geometry, [capGlass, sideGlass])
    primer.position.y = -100
    primer.receiveShadow = true
    scene.add(primer)
  }

  /* ── 바닥 — 어둡고 반들한 판, 모눈, 고른 자리의 빛 웅덩이 ── */
  const floorMat = new THREE.ShaderMaterial({
    vertexShader: FLOOR_VS,
    fragmentShader: FLOOR_FS,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uBase: { value: new THREE.Color('#06080D') },
      uGrid: { value: new THREE.Color('#1B2638') },
      uGlow: { value: new THREE.Color('#FF7A30') },
      uSpot: { value: new THREE.Vector2(0, 0) },
      uSpotAmt: { value: 0 },
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
    },
  })
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.renderOrder = 1
  scene.add(floor)

  const shadowCatcher = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.6, depthWrite: false }),
  )
  shadowCatcher.rotation.x = -Math.PI / 2
  shadowCatcher.position.y = 0.001
  shadowCatcher.receiveShadow = true
  shadowCatcher.renderOrder = 1.5
  scene.add(shadowCatcher)

  /* ── 고른 지역의 빛기둥과 고리 ──────────────────────────── */
  const beamGeo = new THREE.CylinderGeometry(0.18, 0.05, 2.4, 40, 1, true)
  beamGeo.translate(0, 1.2, 0)
  const beamMat = new THREE.ShaderMaterial({
    vertexShader: BEAM_VS,
    fragmentShader: BEAM_FS,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color('#FF9B52').multiplyScalar(1.5) },
      uAmt: { value: 0 },
      uTime: { value: 0 },
      // 바닥과 같은 값을 나눠 쓴다 — 크기가 바뀔 때 한 곳만 고치면 된다
      uRes: floorMat.uniforms.uRes,
    },
  })
  const beam = new THREE.Mesh(beamGeo, beamMat)
  beam.renderOrder = 4
  scene.add(beam)

  const ringGeo = new THREE.RingGeometry(0.93, 1, 96)
  ringGeo.rotateX(-Math.PI / 2)
  const rings = [0, 0.5].map(phase => {
    const m = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#FFB27A').multiplyScalar(1.6),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const r = new THREE.Mesh(ringGeo, m)
    r.renderOrder = 4
    r.userData.phase = phase
    scene.add(r)
    return r
  })

  /* ── 떠다니는 빛 알갱이 ────────────────────────────────── */
  const DUST = 260
  const dustPos = new Float32Array(DUST * 3)
  const dustSeed = new Float32Array(DUST)
  const rnd = seeded(5)
  for (let i = 0; i < DUST; i++) {
    dustPos[i * 3] = (rnd() * 2 - 1) * 3
    dustPos[i * 3 + 1] = rnd() * 1.9
    dustPos[i * 3 + 2] = (rnd() * 2 - 1) * 3.4
    dustSeed[i] = rnd()
  }
  const dustGeo = new THREE.BufferGeometry()
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3))
  dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(dustSeed, 1))
  const dust = new THREE.Points(
    dustGeo,
    new THREE.ShaderMaterial({
      vertexShader: DUST_VS,
      fragmentShader: DUST_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPx: { value: 2.4 },
        uColor: { value: new THREE.Color('#FFB27A').multiplyScalar(1.4) },
      },
    }),
  )
  dust.renderOrder = 5
  scene.add(dust)

  /* ── 카메라 — 지도 전체가 칸 안에 들어오는 거리 ─────────── */
  // 지도의 실제 윤곽으로 맞춘다 — 네모 상자의 귀퉁이는 빈 바다라서, 원근으로
  // 앞쪽 귀퉁이가 벌어지면 지도가 쓸데없이 작아진다. 윤곽 점을 솎아 쓴다.
  // 높이는 흔한 높이만 — 가장 높은 탑의 꼭대기는 숫자 표 자리로 위에 남긴다
  const corners: THREE.Vector3[] = []
  const islands: THREE.Vector3[] = []
  for (const outlines of outlinesBy.values()) {
    for (const o of outlines) {
      const pts = o.outer
      const big = o.a > 0.03
      const step = Math.max(1, Math.floor(pts.length / 24))
      for (let i = 0; i < pts.length; i += step) {
        const lo = new THREE.Vector3(pts[i].x, 0, -pts[i].y)
        const hi = new THREE.Vector3(pts[i].x, BASE_H + DATA_H * 0.45, -pts[i].y)
        if (big) corners.push(lo, hi)
        else islands.push(lo)
      }
    }
  }
  const tmp = new THREE.Vector3()
  function place(d: number, polar: number, az: number) {
    camera.position.setFromSphericalCoords(d, polar, az).add(target)
    camera.lookAt(target)
    camera.updateMatrixWorld()
  }
  /*
   * 거리와 화면 속 위치를 함께 맞춘다. 거리만 맞추면 비스듬히 본 지도의 앞쪽이
   * 크게 잡혀 위가 빈다. 투영된 윤곽의 가운데가 칸의 가운데에 오도록 화면을
   * 옮긴다(setViewOffset — 원근은 그대로 두고 그림만 민다).
   */
  function spanAt(d: number, pts: THREE.Vector3[] = corners, az = 0) {
    place(d, POLAR, az)
    let x0 = Infinity
    let x1 = -Infinity
    let y0 = Infinity
    let y1 = -Infinity
    for (const c of pts) {
      tmp.copy(c).project(camera)
      x0 = Math.min(x0, tmp.x)
      x1 = Math.max(x1, tmp.x)
      y0 = Math.min(y0, tmp.y)
      y1 = Math.max(y1, tmp.y)
    }
    return { x0, x1, y0, y1 }
  }
  const withIslands = islands.length ? [...corners, ...islands] : corners
  /**
   * 시선이 저절로 좌우로 흔들리는 끝까지 재서 합친 폭. 가운데에서만 재면
   * 서해의 섬들이 흔들릴 때 칸 가장자리에 걸린다. 손으로 기울이는 몫은 잠깐이라 넣지 않는다.
   */
  const SWAY = 0.17
  function swaySpan(d: number) {
    const a = spanAt(d, withIslands, -SWAY)
    const b = spanAt(d, withIslands, SWAY)
    const c = spanAt(d, withIslands, 0)
    return {
      x0: Math.min(a.x0, b.x0, c.x0),
      x1: Math.max(a.x1, b.x1, c.x1),
      y0: Math.min(a.y0, b.y0, c.y0),
      y1: Math.max(a.y1, b.y1, c.y1),
    }
  }
  /**
   * 공고가 있는 지역마다, 그 지역을 골랐을 때 숫자 표가 서는 자리(떠오른 윗면의 한가운데).
   * 가장 높은 지역이 북쪽(경기 등)이면 비스듬히 본 화면에서 꼭대기가 칸 위로 솟아
   * 기둥과 표가 잘린다 — 이 점들까지 표 높이만큼의 여유를 두고 칸 안에 넣는다.
   */
  let peaks: THREE.Vector3[] = []
  let peakKey = ''
  function setPeaks(counts: Record<string, number>, max: number) {
    const key = max > 0 ? provs.map(p => counts[p.code] ?? 0).join(',') + '/' + max : ''
    if (key === peakKey) return false
    peakKey = key
    peaks = []
    if (max > 0) {
      for (const p of provs) {
        const n = counts[p.code] ?? 0
        if (n > 0) peaks.push(new THREE.Vector3(p.anchor.x, BASE_H + (DATA_H * n) / max + LIFT + 0.02, p.anchor.z))
      }
    }
    return true
  }

  /*
   * 카메라는 맞춘 자리(td·tx·ty)로 미끄러져 간다. 집계가 도착해 기둥이 솟는 동안
   * 칸에 맞춰 천천히 물러난다 — 툭 하고 줌이 바뀌지 않게. 크기가 바뀔 때는 바로 맞춘다.
   */
  const view = { d: dist, x: 0, y: 0, td: dist, tx: 0, ty: 0, init: false }
  function applyView() {
    const { w, h } = stage.size()
    if (!w || !h) return
    camera.setViewOffset(w, h, (view.x * w) / 2, (-view.y * h) / 2, w, h)
  }
  function fit(snap = true) {
    const { w, h } = stage.size()
    if (!w || !h) return
    camera.clearViewOffset()
    // 숫자 표(높이 약 25px)와 줄기(18px)가 설 자리
    const tagRoom = (2 * (w < 440 ? 44 : 50)) / h
    const peakTop = (d: number) => (peaks.length ? spanAt(d, peaks).y1 + tagRoom : -Infinity)
    let lo = 3
    let hi = 60
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2
      const s = spanAt(mid)
      // 섬과 흔들리는 끝은 칸 안에만 들면 된다 — 본토를 칸에 꽉 채운다
      const all = swaySpan(mid)
      const top = Math.max(all.y1, peakTop(mid))
      if (s.x1 - s.x0 < 1.86 && s.y1 - s.y0 < 1.68 && all.x1 - all.x0 < 1.9 && top - all.y0 < 1.9) hi = mid
      else lo = mid
    }
    dist = hi
    const all = swaySpan(dist)
    const s = spanAt(dist)
    const top = Math.max(all.y1, peakTop(dist))
    // 본토를 가운데에 두되, 섬과 솟은 기둥·표가 칸 밖으로 나가지 않는 데까지만 민다
    const M = 0.95
    let cx = (s.x0 + s.x1) / 2
    cx = Math.min(Math.max(cx, all.x1 - M), all.x0 + M)
    // 위로 조금 여유를 둔다 — 높이 솟은 지역과 숫자 표가 설 자리
    let cy = (s.y0 + s.y1) / 2 + 0.06
    cy = Math.min(Math.max(cy, top - 0.98), all.y0 + M)
    view.td = dist
    view.tx = cx
    view.ty = cy
    if (snap || !view.init) {
      view.d = dist
      view.x = cx
      view.y = cy
      view.init = true
    }
    applyView()
  }

  /* ── 손 ─────────────────────────────────────────────── */
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  let hovered: string | null = null
  function pick(e: PointerEvent | MouseEvent): string | null {
    const r = canvas.getBoundingClientRect()
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    ray.far = Infinity
    for (const hit of ray.intersectObjects(pickables, false)) {
      const code = hit.object.userData.code as string
      // 유리로 비운 지역은 손이 통과한다 — 그 안에 고른 지역이 있다
      if ((byCode.get(code)?.ghost ?? 0) > 0.5) continue
      return (state.counts[code] ?? 0) > 0 ? code : null
    }
    return null
  }
  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect()
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1
    pointer.y = ((e.clientY - r.top) / r.height) * 2 - 1
    pointer.inside = true
    if (e.pointerType !== 'mouse') return
    const code = pick(e)
    canvas.style.cursor = code ? 'pointer' : ''
    if (code !== hovered) {
      hovered = code
      cb.onHover(code)
    }
  }
  const onLeave = () => {
    pointer.inside = false
    canvas.style.cursor = ''
    if (hovered !== null) {
      hovered = null
      cb.onHover(null)
    }
  }
  const onClick = (e: MouseEvent) => {
    const code = pick(e)
    if (code) cb.onPick(code)
  }
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerleave', onLeave)
  canvas.addEventListener('click', onClick)

  /* ── 가림 — 고른 지역을 앞에서 가리는 더 높은 지역은 유리처럼 비운다 ── */
  const blockers = new Set<string>()
  const occRay = new THREE.Raycaster()
  const occDir = new THREE.Vector3()
  const occPt = new THREE.Vector3()
  function findBlockers(ap: Prov | null) {
    blockers.clear()
    if (!ap) return
    const top = ap.lift + ap.h
    for (const fy of [1, 0.55]) {
      occPt.set(ap.anchor.x, top * fy + 0.01, ap.anchor.z)
      occDir.copy(occPt).sub(camera.position)
      const len = occDir.length()
      occDir.divideScalar(len)
      occRay.set(camera.position, occDir)
      occRay.far = len - 0.02
      for (const hit of occRay.intersectObjects(pickables, false)) {
        const code = hit.object.userData.code as string
        if (code !== ap.code) blockers.add(code)
      }
    }
  }
  function setGlass(p: Prov, on: boolean) {
    if (p.glass === on) return
    p.glass = on
    for (const m of [p.cap, p.side]) {
      m.transparent = on
      m.depthWrite = !on
      m.needsUpdate = true
    }
    p.mesh.castShadow = !on
  }

  /* ── 매 장면 ───────────────────────────────────────── */
  const spotPos = new THREE.Vector3()
  let spotAmt = 0
  let spotInit = false
  const placed: { x: number; y: number; w: number; h: number }[] = []
  const col = new THREE.Color()

  function frame(dt: number, t: number) {
    frames++
    const k = (rate: number) => 1 - Math.exp(-dt * rate)
    const hasData = state.max > 0
    if (hasData && riseAt < 0) riseAt = t
    const active = state.active && byCode.has(state.active) && (state.counts[state.active] ?? 0) > 0 ? state.active : null
    const ap = active ? byCode.get(active)! : null
    if (frames % 3 === 1 || dt === 0) findBlockers(ap)

    for (const p of provs) {
      const count = state.counts[p.code] ?? 0
      const share = hasData ? count / state.max : 0
      const intro = ease((t - p.delay * 0.6) / 1.1)
      const rise = riseAt < 0 ? 0 : ease((t - riseAt - p.delay) / 1.2)
      const isOn = p.code === active ? 1 : 0
      const th = Math.max(0.001, (BASE_H + DATA_H * share * rise) * intro)
      p.h += (th - p.h) * k(7)
      p.lift += (isOn * LIFT - p.lift) * k(6)
      p.warm += (share * rise - p.warm) * k(5)
      p.on += (isOn - p.on) * k(6)
      p.ghost += ((blockers.has(p.code) ? 1 : 0) - p.ghost) * k(8)
      setGlass(p, p.ghost > 0.02)

      p.mesh.scale.y = p.h
      p.wallU.uH.value = p.h
      p.mesh.position.y = p.lift
      p.mirror.scale.y = p.h
      p.mirror.position.y = p.lift
      p.edge.position.y = p.lift + p.h + 0.003

      // 석판 → 숯 → 달아오른 주황. 적은 곳은 거의 석판으로 남아 많은 곳이 도드라진다
      const w = p.warm
      if (w < 0.35) col.copy(C_SLATE).lerp(C_EMBER, w / 0.35)
      else col.copy(C_EMBER).lerp(C_HOT, (w - 0.35) / 0.65)
      col.lerp(C_ON, p.on)
      p.cap.color.copy(col)
      p.cap.emissive.copy(E_WARM).lerp(E_ON, p.on)
      p.side.emissive.copy(p.cap.emissive)
      const lit = count > 0
      const g = p.ghost
      // 유리로 비운 지역은 제 빛도 줄인다 — 테두리만 남아 안쪽이 보이게
      // 고른 지역은 달아오르되 하얗게 타지 않게 — 벽의 위아래 결이 남을 만큼만
      p.cap.emissiveIntensity = ((lit ? 0.05 + 0.7 * w : 0) + p.on * 0.95) * (1 - g * 0.8)
      p.side.emissiveIntensity = ((lit ? 0.22 + 0.9 * w : 0.05) + p.on * 0.35) * (1 - g * 0.75)
      p.cap.opacity = 1 - g * 0.72
      p.side.opacity = 1 - g * 0.8
      p.edgeMat.opacity = Math.min(1, (lit ? 0.24 + 0.4 * w : 0.13) + p.on * 0.6 + g * 0.2)
      p.edgeMat.color.copy(EDGE).multiplyScalar(1 + p.on * 0.9)
    }

    // 빛기둥·빛 웅덩이는 고른 지역으로 미끄러져 간다
    if (ap) {
      const top = ap.lift + ap.h
      if (!spotInit) {
        spotPos.set(ap.anchor.x, top, ap.anchor.z)
        spotInit = true
      }
      spotPos.x += (ap.anchor.x - spotPos.x) * k(5)
      spotPos.z += (ap.anchor.z - spotPos.z) * k(5)
      spotPos.y += (top - spotPos.y) * k(6)
    }
    spotAmt += ((ap ? 1 : 0) - spotAmt) * k(3)
    beam.position.set(spotPos.x, spotPos.y + 0.004, spotPos.z)
    beamMat.uniforms.uAmt.value = spotAmt * 0.5
    beamMat.uniforms.uTime.value = t
    beam.visible = spotAmt > 0.01
    for (const r of rings) {
      const ph = (t * 0.5 + (r.userData.phase as number)) % 1
      const s = 0.06 + ph * 0.4
      r.scale.set(s, 1, s)
      r.position.set(spotPos.x, spotPos.y + 0.006, spotPos.z)
      ;(r.material as THREE.MeshBasicMaterial).opacity = (1 - ph) * (1 - ph) * spotAmt * 0.85
      r.visible = spotAmt > 0.01
    }
    floorMat.uniforms.uSpot.value.set(spotPos.x, spotPos.z)
    floorMat.uniforms.uSpotAmt.value = spotAmt
    floorMat.uniforms.uTime.value = t
    dust.material.uniforms.uTime.value = t

    // 천천히 좌우로 흔들리는 시선 + 손 따라 기우는 시선
    pointer.sx += ((pointer.inside ? pointer.x : 0) - pointer.sx) * k(3)
    pointer.sy += ((pointer.inside ? pointer.y : 0) - pointer.sy) * k(3)
    const intro = ease(t / 2.4)
    const az = Math.sin(t * 0.19) * 0.17 + pointer.sx * 0.14 + (1 - intro) * 0.35
    const polar = POLAR - (1 - intro) * 0.3 + Math.sin(t * 0.15) * 0.025 + pointer.sy * 0.06
    view.d += (view.td - view.d) * k(2.4)
    view.x += (view.tx - view.x) * k(2.4)
    view.y += (view.ty - view.y) * k(2.4)
    applyView()
    place(view.d * (1 + (1 - intro) * 0.2), polar, az)

    if (frames === 2 && !readySent) {
      readySent = true
      cb.onReady()
    }
    placeTags()
  }

  /* ── 숫자 표 — 겹치면 덜 중요한 쪽을 숨긴다 ─────────────── */
  function placeTags() {
    const { w, h } = stage.size()
    if (!w) return
    placed.length = 0
    const want = new Set<string>()
    const order: string[] = []
    const active = state.active && (state.counts[state.active] ?? 0) > 0 ? state.active : null
    if (active) order.push(active)
    for (const c of state.labels) if (c !== active) order.push(c)
    const limit = w < 280 ? 1 : w < 420 ? 3 : 6
    for (const code of order) {
      if (want.size >= limit) break
      const p = byCode.get(code)
      if (!p || !(state.counts[code] > 0)) continue
      if (!p.tagSize.w) {
        const el = p.tag.firstElementChild as HTMLElement | null
        p.tagSize.w = el?.offsetWidth ?? 0
        p.tagSize.h = el?.offsetHeight ?? 0
      }
      tmp.set(p.anchor.x, p.lift + p.h + 0.02, p.anchor.z).project(camera)
      const sx = (tmp.x * 0.5 + 0.5) * w
      const sy = (-tmp.y * 0.5 + 0.5) * h
      const box = { x: sx - p.tagSize.w / 2 - 3, y: sy - p.tagSize.h - 20, w: p.tagSize.w + 6, h: p.tagSize.h + 4 }
      if (box.x < -4 || box.x + box.w > w + 4 || box.y < -4) continue
      if (placed.some(o => box.x < o.x + o.w && box.x + box.w > o.x && box.y < o.y + o.h && box.y + box.h > o.y)) continue
      placed.push(box)
      want.add(code)
      p.tag.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`
    }
    for (const p of provs) {
      const show = want.has(p.code)
      if (show !== (p.tag.dataset.show === '1')) {
        if (show) p.tag.dataset.show = '1'
        else delete p.tag.dataset.show
      }
    }
    markActive()
  }

  /**
   * 고른 지역의 표에 불을 켠다. 다음 장면을 기다리지 않고 상태가 바뀌는 즉시 —
   * 느린 기기에서도 칩·읽기 칸과 지도의 표가 한 박자 어긋나지 않게.
   */
  function markActive() {
    const active = state.active && (state.counts[state.active] ?? 0) > 0 ? state.active : null
    for (const p of provs) {
      const on = p.code === active
      if (on !== (p.tag.dataset.on === '1')) {
        if (on) p.tag.dataset.on = '1'
        else delete p.tag.dataset.on
        p.tagSize.w = 0
      }
    }
  }

  fit()

  return {
    update(next) {
      state = next
      if (setPeaks(next.counts, next.max)) fit(false)
      for (const p of provs) {
        const n = next.counts[p.code] ?? 0
        const text = n > 0 ? `${n.toLocaleString('ko-KR')}건` : ''
        if (text !== p.tagText) {
          p.tagText = text
          p.tagNum.textContent = text
          p.tagSize.w = 0
        }
      }
      markActive()
    },
    dispose() {
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('click', onClick)
      stage.dispose()
      tagLayer.remove()
    },
  }
}
