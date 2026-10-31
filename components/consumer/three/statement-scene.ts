import * as THREE from 'three'
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js'
import { createStage } from './stage'
import { buildOutlines, poleOf } from './province-shapes'

/**
 * 장면 1(ONE MAP)의 입체 — 내릴수록 평면 지도가 눕고, 공고가 있는 지역이 솟는다.
 *
 * 시간으로 움직이는 것은 없다. 모든 것이 스크롤 진행(`--p`, 0→1) 하나로 정해진다. 네 박자:
 * - A 0→0.2    윤곽과 제목. 카메라는 거의 움직이지 않는다(위에서 내려다본 평면 지도)
 * - B 0.2→0.45 공고가 많은 지역부터 차례로 솟는다. 높이는 공고 수에 정비례 — 공고가 없는 곳은
 *              얇은 석판으로 남는다(지어서 켜지 않는다). 빛도 같은 차례로 든다
 * - C 0.45→0.75 지역명과 건수가 많은 순서로 선다. 겹치면 끌어올린 선으로 비켜 세운다
 * - D 0.75→1   카메라가 멈춘 구도에 서고, 지도를 직접 눌러 지역을 고를 수 있다
 *
 * 화면에 보일 때만 그린다(무대 stage.ts 가 맡는다). 진행 값은 매 장면 무대의
 * 인라인 스타일에서 읽는다 — React 는 스크롤마다 다시 그리지 않는다.
 */

export interface StatementInput {
  code: string
  path: string
}

/** 공고가 있는 집계 한 줄. 많은 순서대로 온다 */
export interface StatementDatum {
  name: string
  count: number
  /** 이 집계에 드는 지도 지역 — '전남·광주'처럼 둘일 수 있다 */
  codes: string[]
}

export interface StatementHandle {
  update: (data: StatementDatum[]) => void
  /** 고른 지역(지도 코드) — 첫 화면·목록과 같은 선택을 나눠 쓴다 */
  setActive: (code: string | null) => void
  dispose: () => void
}

/** 이 진행 값부터 지도를 직접 고를 수 있다(박자 D) */
export const STATEMENT_PICK_FROM = 0.74

const UNIT = 0.01
/* 본토와 제주를 감싼 틀(KOREA_VISUAL_VIEWBOX)의 가운데 */
const CX = 199
const CY = 316

/** 공고가 없어도 남는 석판 두께 */
const BASE_H = 0.05
/** 가장 많은 지역이 더 솟는 높이 */
const DATA_H = 0.82
/** 고른 지역이 조금 떠오르는 높이 */
const LIFT_PICK = 0.05
/** 끝 장면의 기울기(정수리에서, 라디안) — 약 56° */
const POLAR_END = 0.98
const POLAR_START = 0.015
/** 끝 장면에서 돌아가 있는 각 — 남동쪽에서 비스듬히 */
const YAW_END = -0.15

const C_SLATE = new THREE.Color('#151A23')
const C_EMBER = new THREE.Color('#2C150D')
const C_HOT = new THREE.Color('#9A3510')
const C_WALL = new THREE.Color('#06080C')
const E_WARM = new THREE.Color('#FF6A1F')
const EDGE_COLD = new THREE.Color('#8FA3C0')
const EDGE_WARM = new THREE.Color('#FFB27A')

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
/** 시작과 끝을 부드럽게 — 급가속·급정지 없이 */
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
/** 더 부드럽게(끝에서 오래 머문다) — 솟는 높이에 쓴다 */
const smoother = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * t * (t * (t * 6 - 15) + 10)
}

const tilt = (p: number) => smooth(0.12, 0.62, p)
const polarAt = (p: number) => POLAR_START + (POLAR_END - POLAR_START) * tilt(p)
const yawAt = (p: number) => YAW_END * smooth(0.16, 0.74, p)
/** 석판이 두께를 얻는 정도 */
const slabAt = (p: number) => smooth(0.08, 0.26, p)
/** 고른 지역의 빛 — 단지 탐험·첫 화면과 같은 금빛 */
const C_PICK = new THREE.Color('#C9A55A')

/**
 * 벽의 결 — 아래는 어둠에 묻히고 위끝만 달아오른다. 밝기는 실제 높이로 잰다(낮은
 * 벽까지 위끝이 똑같이 빛나면 해안선 전체가 주황 테두리가 된다).
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
        float body = 0.02 + 0.42 * pow(clamp(y / ${(BASE_H + DATA_H).toFixed(3)}, 0.0, 1.0), 1.6);
        float rim = smoothstep(uH - 0.035, uH - 0.004, y) * smoothstep(0.1, 0.6, uH);
        totalEmissiveRadiance *= body + rim * 0.85;
      }`,
    )
}

/* 바닥 — 지도 아래 깔리는 어둠의 웅덩이와, 솟은 곳 아래의 낮은 앰버 빛 */
const FLOOR_VS = /* glsl */ `
varying vec3 vPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`
const FLOOR_FS = /* glsl */ `
uniform vec3 uWarm;
uniform vec2 uCenter;
uniform float uAmt;
uniform float uWarmAmt;
varying vec3 vPos;
void main() {
  vec2 q = vPos.xz * vec2(0.9, 0.62);
  float pool = exp(-dot(q, q) * 0.42);
  vec2 w = vPos.xz - uCenter;
  float warm = exp(-dot(w, w) * 0.55) * uWarmAmt;
  vec3 col = vec3(0.01, 0.013, 0.022) + uWarm * warm * 0.5;
  float a = clamp(pool * 0.45 * uAmt + warm * 0.22, 0.0, 1.0);
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

interface Prov {
  code: string
  mesh: THREE.Mesh
  edge: THREE.LineSegments
  cap: THREE.MeshPhysicalMaterial
  side: THREE.MeshStandardMaterial
  edgeMat: THREE.LineBasicMaterial
  wallU: { uH: { value: number } }
  anchor: THREE.Vector3
  area: number
  /** 공고 수 ÷ 가장 많은 곳 — 0 이면 불이 들어오지 않는다 */
  share: number
  /** 솟기 시작하는 진행 값 */
  start: number
  samples: THREE.Vector2[]
}

interface Tag {
  el: HTMLDivElement
  prov: Prov
  /** 이 집계에 드는 지도 코드 — 고른 지역과 견준다 */
  codes: string[]
  /** 표가 서기 시작하는 진행 값(많은 순서) */
  end: number
  w: number
  h: number
  shown: string
  pos: string
  off: string
}

export function mountStatement(
  host: HTMLElement,
  input: StatementInput[],
  cb: { onReady: () => void; onLost: () => void; onPick?: (code: string) => void; onHover?: (code: string | null) => void },
  getP: () => number,
): StatementHandle {
  let readySent = false
  let frames = 0
  let cur = -1

  const stage = createStage({
    host,
    transparent: true,
    fov: 26,
    exposure: 1,
    shadows: true,
    environment: 0.2,
    envKind: 'night',
    tone: 'neutral',
    bloom: { strength: 0.5, radius: 0.42, threshold: 0.86 },
    onResize: () => fit(),
    onFrame: dt => frame(dt),
    onLost: () => cb.onLost(),
  })
  const { scene, camera } = stage

  /* ── 빛 — 북서쪽 높이에서 오는 달빛, 뒤에서 오는 푸른 테두리빛 ── */
  scene.add(new THREE.HemisphereLight('#8FA8D6', '#0B0E14', 0.5))
  const key = new THREE.DirectionalLight('#E4ECFF', 1.6)
  key.position.set(-3.6, 6.4, -2.4)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  Object.assign(key.shadow.camera, { left: -4.2, right: 4.2, top: 4.2, bottom: -4.2, near: 1, far: 16 })
  key.shadow.bias = -0.0005
  key.shadow.normalBias = 0.02
  key.shadow.radius = 6
  key.shadow.blurSamples = 16
  scene.add(key)
  const rim = new THREE.DirectionalLight('#6F8FD8', 0.9)
  rim.position.set(4.5, 2.4, -5.5)
  scene.add(rim)
  const fill = new THREE.DirectionalLight('#C9D7F2', 0.45)
  fill.position.set(1.5, 2.2, 7)
  scene.add(fill)

  /* ── 땅 ─────────────────────────────────────────────── */
  const outlinesBy = buildOutlines(input, { unit: UNIT, cx: CX, cy: CY })
  const land = new THREE.Group()
  scene.add(land)
  const provs: Prov[] = []
  const byCode = new Map<string, Prov>()

  for (const p of input) {
    const outlines = outlinesBy.get(p.code)
    if (!outlines?.length) continue
    const raw = new THREE.ExtrudeGeometry(
      outlines.map(o => o.shape),
      { depth: 1, bevelEnabled: false, curveSegments: 1 },
    )
    // 모양은 (x, y) 평면, 밀어 올리는 방향은 z — 눕혀서 z 를 위로 세운다
    raw.rotateX(-Math.PI / 2)
    const geo = toCreasedNormals(raw, Math.PI / 2.4)
    if (geo !== raw) raw.dispose()
    geo.computeBoundingSphere()

    const cap = new THREE.MeshPhysicalMaterial({
      color: C_SLATE.clone(),
      roughness: 0.46,
      metalness: 0.12,
      clearcoat: 0.6,
      clearcoatRoughness: 0.24,
      emissive: E_WARM.clone(),
      emissiveIntensity: 0,
    })
    const side = new THREE.MeshStandardMaterial({
      color: C_WALL.clone(),
      roughness: 0.92,
      metalness: 0,
      emissive: E_WARM.clone(),
      emissiveIntensity: 0,
    })
    const wallU = { uH: { value: 0.001 } }
    side.onBeforeCompile = shader => wallShader(shader, wallU)
    side.customProgramCacheKey = () => 'cs-sm-wall'
    const mesh = new THREE.Mesh(geo, [cap, side])
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.scale.y = 0.001
    mesh.renderOrder = 2
    land.add(mesh)

    // 윗면 테두리 — 평면 지도의 얇은 경계선이 그대로 윗면을 따라 올라간다
    const seg: number[] = []
    const samples: THREE.Vector2[] = []
    for (const o of outlines) {
      for (const loop of [o.outer, ...o.holes]) {
        for (let i = 0; i < loop.length; i++) {
          const a = loop[i]
          const b = loop[(i + 1) % loop.length]
          seg.push(a.x, 0, -a.y, b.x, 0, -b.y)
        }
      }
      const step = Math.max(1, Math.floor(o.outer.length / 20))
      for (let i = 0; i < o.outer.length; i += step) samples.push(o.outer[i])
    }
    const edgeGeo = new THREE.BufferGeometry()
    edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3))
    const edgeMat = new THREE.LineBasicMaterial({
      color: EDGE_COLD.clone(),
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    })
    const edge = new THREE.LineSegments(edgeGeo, edgeMat)
    edge.renderOrder = 3
    land.add(edge)

    const pole = poleOf(outlines[0].outer, outlines[0].holes)
    const prov: Prov = {
      code: p.code,
      mesh,
      edge,
      cap,
      side,
      edgeMat,
      wallU,
      anchor: new THREE.Vector3(pole.x, 0, -pole.y),
      area: outlines[0].a,
      share: 0,
      start: 1,
      samples,
    }
    provs.push(prov)
    byCode.set(p.code, prov)
  }

  /* ── 바닥 — 그림자를 받는 판과 어둠의 웅덩이 ─────────────── */
  const floorMat = new THREE.ShaderMaterial({
    vertexShader: FLOOR_VS,
    fragmentShader: FLOOR_FS,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uWarm: { value: new THREE.Color('#FF7A30') },
      uCenter: { value: new THREE.Vector2(0, 0) },
      uAmt: { value: 0 },
      uWarmAmt: { value: 0 },
    },
  })
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.002
  floor.renderOrder = 1
  scene.add(floor)

  const shadowMat = new THREE.ShadowMaterial({ color: 0x000000, opacity: 0, depthWrite: false })
  const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), shadowMat)
  shadowCatcher.rotation.x = -Math.PI / 2
  shadowCatcher.position.y = 0.0005
  shadowCatcher.receiveShadow = true
  shadowCatcher.renderOrder = 1.5
  scene.add(shadowCatcher)

  /* ── 숫자 표 — 가장 많은 세 곳의 꼭대기에, 다 솟은 뒤에만 ─── */
  const tagLayer = document.createElement('div')
  tagLayer.className = 'cs-sm-tags'
  tagLayer.setAttribute('aria-hidden', 'true')
  host.appendChild(tagLayer)
  let tags: Tag[] = []
  let warmCenter = new THREE.Vector2(0, 0)
  let activeCodes: string[] = []
  /** 고른 지역이 바뀌면 그 빛이 짧게 옮겨 간다 */
  let pickAmt = 0

  /* ── 높이 — 진행 값 하나로 정해진다 ─────────────────────── */
  function heightAt(pv: Prov, p: number) {
    const base = 0.001 + BASE_H * slabAt(p)
    if (!pv.share) return base
    return base + DATA_H * pv.share * smoother(pv.start, pv.start + 0.12, p) + LIFT_PICK * (activeCodes.includes(pv.code) ? pickAmt : 0) * smooth(0.7, 0.8, p)
  }

  /* ── 카메라 — 진행 값마다 지도 전체(솟은 꼭대기까지)가 칸에 드는 거리 ── */
  const target = new THREE.Vector3(0, 0.1, 0)
  const tmp = new THREE.Vector3()
  function place(d: number, polar: number, az: number) {
    camera.position.setFromSphericalCoords(d, polar, az).add(target)
    camera.lookAt(target)
    camera.updateMatrixWorld()
  }
  /** 진행 값 0, 0.05, … 1 에서 맞춘 거리와 화면 속 가운데 */
  let fits: { d: number; x: number; y: number }[] = []
  function span(p: number, d: number) {
    place(d, polarAt(p), yawAt(p))
    let x0 = Infinity
    let x1 = -Infinity
    let y0 = Infinity
    let y1 = -Infinity
    const see = (x: number, y: number, z: number) => {
      tmp.set(x, y, z).project(camera)
      if (tmp.x < x0) x0 = tmp.x
      if (tmp.x > x1) x1 = tmp.x
      if (tmp.y < y0) y0 = tmp.y
      if (tmp.y > y1) y1 = tmp.y
    }
    for (const pv of provs) {
      const h = heightAt(pv, p)
      for (const s of pv.samples) {
        see(s.x, 0, -s.y)
        if (h > 0.01) see(s.x, h, -s.y)
      }
    }
    // 숫자 표가 설 자리 — 꼭대기 위로 조금 더
    for (const t of tags) see(t.prov.anchor.x, heightAt(t.prov, p) + 0.42, t.prov.anchor.z)
    return { x0, x1, y0, y1 }
  }
  function fit() {
    const { w, h } = stage.size()
    if (!w || !h || !provs.length) return
    camera.clearViewOffset()
    // 좁은 칸에서는 가로 여백을 더 둔다
    const mx = 0.07
    const my = 0.1
    const next: typeof fits = []
    for (let i = 0; i <= 20; i++) {
      const p = i / 20
      let lo = 2
      let hi = 80
      for (let k = 0; k < 22; k++) {
        const mid = (lo + hi) / 2
        const s = span(p, mid)
        if (s.x1 - s.x0 < 2 - 2 * mx && s.y1 - s.y0 < 2 - 2 * my) hi = mid
        else lo = mid
      }
      const s = span(p, hi)
      next.push({ d: hi, x: (s.x0 + s.x1) / 2, y: (s.y0 + s.y1) / 2 })
    }
    fits = next
    if (frames) draw(cur < 0 ? getP() : cur)
  }
  function viewAt(p: number) {
    const f = Math.min(19.999, Math.max(0, p * 20))
    const i = Math.floor(f)
    const t = f - i
    const a = fits[i]
    const b = fits[i + 1]
    return { d: a.d + (b.d - a.d) * t, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
  }

  /* ── 매 장면 ───────────────────────────────────────── */
  const col = new THREE.Color()
  function draw(p: number) {
    for (const pv of provs) {
      const hgt = heightAt(pv, p)
      pv.mesh.scale.y = hgt
      pv.wallU.uH.value = hgt
      pv.edge.position.y = hgt + 0.003
      const s = pv.share
      // 불은 솟기 조금 전에 들어오기 시작해 다 솟을 때 가장 밝다
      const glow = s ? smooth(pv.start - 0.04, pv.start + 0.12, p) : 0
      const w = s * glow
      // 석판 → 숯 → 달아오른 주황. 적은 곳은 숯빛에 머물러 많은 곳이 도드라진다
      const ws = Math.sqrt(w)
      if (ws < 0.4) col.copy(C_SLATE).lerp(C_EMBER, ws / 0.4)
      else col.copy(C_EMBER).lerp(C_HOT, (ws - 0.4) / 0.6)
      if (s) col.lerp(C_EMBER, (1 - ws) * glow * 0.4)
      pv.cap.color.copy(col)
      pv.cap.emissiveIntensity = s ? glow * (0.03 + 1.05 * Math.pow(s, 1.4)) : 0
      pv.side.emissiveIntensity = s ? glow * (0.07 + 0.55 * s) : 0.02
      pv.edgeMat.color.copy(EDGE_COLD).lerp(EDGE_WARM, glow)
      pv.edgeMat.opacity = s ? 0.18 + 0.5 * glow : 0.18 - 0.06 * tilt(p)
      // 고른 지역 — 테두리가 금빛으로, 고르지 않은 곳은 조금 물러난다(박자 D 에서만)
      const on = activeCodes.includes(pv.code)
      const d = smooth(0.7, 0.8, p) * pickAmt
      if (on) {
        pv.edgeMat.color.lerp(C_PICK, d)
        pv.edgeMat.opacity = Math.max(pv.edgeMat.opacity, 0.95 * d)
        pv.cap.color.lerp(C_PICK, 0.35 * d)
      } else if (activeCodes.length) {
        pv.cap.emissiveIntensity *= 1 - 0.35 * d
        pv.edgeMat.opacity *= 1 - 0.3 * d
      }
    }
    const tl = tilt(p)
    floorMat.uniforms.uAmt.value = tl
    floorMat.uniforms.uWarmAmt.value = smooth(0.3, 0.85, p) * 0.9
    floorMat.uniforms.uCenter.value.copy(warmCenter)
    shadowMat.opacity = 0.62 * smooth(0.15, 0.7, p)

    if (fits.length) {
      const v = viewAt(p)
      // 다 선 뒤에는 조금 당겨 본다
      const d = v.d * (1 - 0.02 * smooth(0.78, 1, p))
      const { w, h } = stage.size()
      camera.setViewOffset(w, h, (v.x * w) / 2, (-v.y * h) / 2, w, h)
      place(d, polarAt(p), yawAt(p))
    }
    placeTags(p)
  }

  /** 겹치면 비켜 세운다 — 선을 늘려 위로, 그래도 안 되면 옆으로. 끝내 자리가 없으면 목록에 맡긴다 */
  const LIFTS = [0, 30, 60, 90]
  /** 꼭대기와 글자 사이(선 길이의 기본) — CSS .cs-sm-tag 의 padding-bottom 과 같다 */
  const TAG_GAP = 28
  const NUDGE = [0, -1, 1]
  function placeTags(p: number) {
    const { w, h } = stage.size()
    if (!w) return
    const placed: { x: number; y: number; w: number; h: number }[] = []
    const room = w >= 300
    // 고른 지역이 먼저 자리를 잡는다
    const order = activeCodes.length ? [...tags].sort((a, b) => Number(b.codes.some(c => activeCodes.includes(c))) - Number(a.codes.some(c => activeCodes.includes(c)))) : tags
    for (const t of order) {
      const isOn = t.codes.some(c => activeCodes.includes(c))
      const a = room ? Math.max(smooth(t.end, t.end + 0.06, p), isOn ? smooth(0.7, 0.78, p) : 0) : 0
      let show = a > 0.01
      if (show) {
        if (!t.w) {
          // 글자 덩어리만 — 아래 여백(선이 지나는 자리)은 빼고 잰다
          t.w = t.el.offsetWidth
          t.h = t.el.offsetHeight - parseFloat(getComputedStyle(t.el).paddingBottom || '0')
        }
        tmp.set(t.prov.anchor.x, heightAt(t.prov, p) + 0.01, t.prov.anchor.z).project(camera)
        const ax = (tmp.x * 0.5 + 0.5) * w
        const ay = (-tmp.y * 0.5 + 0.5) * h
        let spot: { x: number; y: number; lift: number } | null = null
        search: for (const lift of LIFTS) {
          for (const n of NUDGE) {
            const sx = ax + n * (t.w * 0.6) * (lift ? 1 : 0)
            const sy = ay - lift
            const box = { x: sx - t.w / 2 - 4, y: sy - TAG_GAP - t.h - 4, w: t.w + 8, h: t.h + 8 }
            if (box.x < 0 || box.x + box.w > w || box.y < 0) continue
            if (placed.some(o => box.x < o.x + o.w && box.x + box.w > o.x && box.y < o.y + o.h && box.y + box.h > o.y)) continue
            placed.push(box)
            spot = { x: sx, y: sy, lift }
            break search
          }
        }
        if (!spot) show = false
        else {
          // 표는 지역의 꼭대기에 매고, 비켜 선 만큼 글자만 올리고(--lift) 옆으로(--dx) — 선이 그 사이를 잇는다
          const pos = `translate3d(${ax.toFixed(1)}px, ${ay.toFixed(1)}px, 0)`
          const off = `${spot.lift}|${(spot.x - ax).toFixed(0)}`
          if (pos !== t.pos || off !== t.off) {
            t.pos = pos
            t.off = off
            t.el.style.transform = pos
            t.el.style.setProperty('--lift', `${spot.lift}px`)
            t.el.style.setProperty('--dx', `${(spot.x - ax).toFixed(0)}px`)
          }
        }
      }
      const on = isOn ? '1' : ''
      if ((t.el.dataset.on ?? '') !== on) {
        if (on) t.el.dataset.on = on
        else delete t.el.dataset.on
        t.w = 0
      }
      const op = show ? a.toFixed(3) : '0'
      if (op !== t.shown) {
        t.shown = op
        t.el.style.opacity = op
      }
    }
  }

  /* ── 고르기 — 박자 D 에서만. 끌다 놓은 것은 고른 것이 아니다 ── */
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const canvas = stage.canvas
  const hit = (e: PointerEvent): string | null => {
    const r = canvas.getBoundingClientRect()
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    const o = ray.intersectObjects(provs.map(pv => pv.mesh), false)[0]
    return o ? provs.find(pv => pv.mesh === o.object)?.code ?? null : null
  }
  let downAt: { x: number; y: number } | null = null
  let hovered: string | null = null
  const canPick = () => cur >= STATEMENT_PICK_FROM
  const onDown = (e: PointerEvent) => {
    downAt = canPick() ? { x: e.clientX, y: e.clientY } : null
  }
  const onUp = (e: PointerEvent) => {
    const d = downAt
    downAt = null
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || !canPick()) return
    const code = hit(e)
    if (code) cb.onPick?.(code)
  }
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || !canPick()) return
    const code = hit(e)
    canvas.style.cursor = code ? 'pointer' : ''
    if (code !== hovered) {
      hovered = code
      cb.onHover?.(code)
    }
  }
  const onLeave = () => {
    if (hovered !== null) {
      hovered = null
      cb.onHover?.(null)
    }
  }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerleave', onLeave)

  function frame(dt: number) {
    frames++
    const target = clamp01(getP())
    // 스크롤을 그대로 따르되 아주 짧게 늦춘다 — 휠의 계단이 화면에서 매끄럽게 이어진다
    if (cur < 0 || dt === 0) cur = target
    else cur += (target - cur) * (1 - Math.exp(-dt * 9))
    if (Math.abs(target - cur) < 0.0005) cur = target
    pickAmt += ((activeCodes.length ? 1 : 0) - pickAmt) * (1 - Math.exp(-dt * 10))
    draw(cur)
    // 박자 D — 지도에 손이 닿게 한다(그 전에는 스크롤을 가로채지 않게 손이 닿지 않는다)
    const interactive = cur >= STATEMENT_PICK_FROM ? '1' : ''
    if ((host.dataset.interactive ?? '') !== interactive) {
      if (interactive) host.dataset.interactive = interactive
      else delete host.dataset.interactive
    }
    if (frames === 2 && !readySent) {
      readySent = true
      cb.onReady()
    }
  }

  fit()

  return {
    update(data) {
      const max = data.reduce((m, d) => Math.max(m, d.count), 0)
      const lit = data.filter(d => d.count > 0)
      for (const pv of provs) {
        pv.share = 0
        pv.start = 1
      }
      const n = lit.length
      lit.forEach((d, i) => {
        // 많은 곳부터 차례로 — 박자 B(0.2→0.45) 안에 다 선다
        const start = 0.2 + (n > 1 ? (0.13 * i) / (n - 1) : 0)
        for (const code of d.codes) {
          const pv = byCode.get(code)
          if (!pv) continue
          pv.share = max ? d.count / max : 0
          pv.start = start
        }
      })
      // 앰버 빛 웅덩이는 공고가 몰린 곳 아래에 — 공고 수로 무게를 단 가운데
      let sx = 0
      let sz = 0
      let sw = 0
      for (const pv of provs) {
        if (!pv.share) continue
        sx += pv.anchor.x * pv.share
        sz += pv.anchor.z * pv.share
        sw += pv.share
      }
      warmCenter = sw ? new THREE.Vector2(sx / sw, sz / sw) : new THREE.Vector2(0, 0)

      for (const t of tags) t.el.remove()
      tags = []
      // 공고가 있는 모든 집계에 표 — 많은 순서로 박자 C(0.45→0.75)에 차례로 선다
      lit.forEach((d, rank) => {
        // 묶인 집계는 가장 넓은 지역 위에 표를 세운다
        const pv = d.codes
          .map(c => byCode.get(c))
          .filter((x): x is Prov => !!x)
          .sort((a, b) => b.area - a.area)[0]
        if (!pv) return
        const el = document.createElement('div')
        el.className = 'cs-sm-tag'
        const nm = document.createElement('b')
        nm.textContent = d.name
        const num = document.createElement('i')
        num.textContent = d.count.toLocaleString('ko-KR')
        el.append(nm, num)
        el.style.opacity = '0'
        tagLayer.appendChild(el)
        tags.push({ el, prov: pv, codes: d.codes, end: 0.45 + (lit.length > 1 ? (0.22 * rank) / (lit.length - 1) : 0), w: 0, h: 0, shown: '0', pos: '', off: '' })
      })
      fit()
    },
    setActive(code) {
      // 묶인 집계(전남·광주)는 함께 밝힌다 — 지역별로 나눈 숫자가 없으므로
      const group = tags.find(t => code && t.codes.includes(code))
      activeCodes = code ? (group ? group.codes : [code]) : []
      for (const t of tags) t.w = 0
    },
    dispose() {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
      stage.dispose()
      tagLayer.remove()
    },
  }
}
