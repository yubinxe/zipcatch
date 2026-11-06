import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { createStage } from '../three/stage'
import { PRESENTATION, shortType, type OfficialModel, type SiteData } from '@/lib/consumer/complex-visualization'

/**
 * PROPERTY EXPERIENCE 의 무대 하나 — 두 세계를 한 렌더러에 둔다(모드를 바꿔도 다시 싣지 않는다).
 *
 * 현장(architecture · unit) — site 가 있을 때만
 *   동 윤곽은 지도 기여자(OSM, ODbL)가 그린 것, 높이는 공고 가격표의 동별 최고층 × 3m.
 *   그래서 이것은 매스 모형이다 — 창·색·지붕·층고·외장은 없다. 실제 외관(조감도·3D 모델)은
 *   사용 허락이 없어 그리지 않는다. 주변 건물은 지도에 높이가 적힌 것만 세우고, 없으면 바닥 윤곽만.
 * 데이터 구조(data)
 *   공고 숫자로 세운 기둥 — 바닥 넓이 = 전용면적(옅은 판 = 공급면적), 높이 = 신규 공급 세대수.
 *   통계 표현이다. 단지 모양이 아니다.
 *
 * 카메라: 어둠 → 넓은 하늘에서 대상으로 다가감(arriveMs) → 서면 onArrived.
 * 모드·주택형이 바뀌면 용수철로 옮겨 간다. 사용자가 끌면 그 즉시 자동 카메라는 손을 뗀다.
 */

export type SceneMode = 'architecture' | 'unit' | 'data'

export interface ComplexState {
  mode: SceneMode
  selected: string | null
  compare: string | null
  hover: string | null
  /** 현장에서 고른 동 */
  dong: number | null
  /** 장면 아래를 덮는 패널의 비율(0~0.5) — 휴대폰 시트. 그만큼 장면을 위로 올려 보인다 */
  inset: number
}

export interface ComplexHandle {
  update: (s: ComplexState) => void
  /** 자동 카메라를 다시 켜고 지금 모드의 전체 자리로 */
  overview: () => void
  dispose: () => void
}

interface Callbacks {
  onHover: (name: string | null) => void
  onPick: (name: string) => void
  onPickDong: (id: number) => void
  onReady: () => void
  /** 도착 카메라가 섰을 때 한 번 */
  onArrived: () => void
  onLost: () => void
}

interface Col {
  name: string
  base: THREE.Vector3
  pos: THREE.Vector3
  body: THREE.Mesh
  mat: THREE.MeshStandardMaterial
  edgeMat: THREE.LineBasicMaterial
  plateMat: THREE.MeshBasicMaterial
  height: number
  tag: HTMLDivElement
  hot: number
  dim: number
}

interface Dong {
  id: number
  mesh: THREE.Mesh
  mat: THREE.MeshStandardMaterial
  edgeMat: THREE.LineBasicMaterial
  floorMat: THREE.LineBasicMaterial
  center: THREE.Vector3
  height: number
  units: number
  types: Record<string, number>
  tag: HTMLDivElement
  sel: number
  cmp: number
  focus: number
  dim: number
}

const C_BODY = new THREE.Color('#2B4675')
const C_SEL = new THREE.Color('#C9A55A')
const C_CMP = new THREE.Color('#7FA3D9')
const C_EDGE = new THREE.Color('#9FB6DB')
const C_DONG = new THREE.Color('#2A3F63')
const C_BOTH = new THREE.Color('#E6DCC4')
const C_DIM = new THREE.Color('#152238')

const U = PRESENTATION.siteUnit
const flat = ([x, z]: [number, number]) => new THREE.Vector2(x / U, -z / U)

function shapeOf(pts: [number, number][]) {
  return new THREE.Shape(pts.map(flat))
}
/** 바닥 윤곽을 높이 h 로 세운다 (장면 단위) */
function prism(pts: [number, number][], h: number) {
  const g = new THREE.ExtrudeGeometry(shapeOf(pts), { depth: h, bevelEnabled: false, curveSegments: 1 })
  g.rotateX(-Math.PI / 2)
  return g
}
function plate(pts: [number, number][], y: number) {
  const g = new THREE.ShapeGeometry(shapeOf(pts), 1)
  g.rotateX(-Math.PI / 2)
  g.translate(0, y, 0)
  return g
}
/** 닫힌 윤곽(close) 또는 선을 선분 목록으로 */
function segs(pts: [number, number][], y: number, close: boolean, out: number[]) {
  const n = pts.length
  for (let i = 0; i < (close ? n : n - 1); i++) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    out.push(a[0] / U, y, a[1] / U, b[0] / U, y, b[1] / U)
  }
}
function lines(arr: number[], mat: THREE.LineBasicMaterial | THREE.LineDashedMaterial) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3))
  const l = new THREE.LineSegments(g, mat)
  return l
}

export function mountComplex(
  host: HTMLElement,
  models: OfficialModel[],
  site: SiteData | null,
  cb: Callbacks,
  reduced: boolean,
): ComplexHandle {
  let state: ComplexState = { mode: site ? 'architecture' : 'data', selected: null, compare: null, hover: null, dong: null, inset: 0 }
  const stage = createStage({
    host,
    background: '#0A1322',
    exclusive: true,
    fov: 32,
    exposure: 1.05,
    shadows: true,
    environment: 0.25,
    envKind: 'night',
    tone: 'neutral',
    bloom: { strength: 0.3, radius: 0.4, threshold: 0.9 },
    onFrame: frame,
    onLost: () => cb.onLost(),
  })
  const { scene, camera, canvas } = stage
  camera.far = 700
  camera.updateProjectionMatrix()
  // 멀리 있는 것은 어둠으로 — 카메라 거리에 맞춰 늘고 준다
  const fog = new THREE.Fog('#0A1322', 40, 160)
  scene.fog = fog

  scene.add(new THREE.HemisphereLight('#9DB2DA', '#0A1322', 0.6))
  const key = new THREE.DirectionalLight('#EAF0FF', 1.6)
  key.position.set(-14, 26, 10)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  Object.assign(key.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 80 })
  key.shadow.bias = -0.0006
  scene.add(key)
  const rim = new THREE.DirectionalLight('#6F8FD8', 0.8)
  rim.position.set(16, 10, -20)
  scene.add(rim)

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ color: '#0C182B', roughness: 0.96, metalness: 0 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.01
  ground.receiveShadow = true
  scene.add(ground)

  const tagLayer = document.createElement('div')
  tagLayer.className = 'cx3-tags'
  host.appendChild(tagLayer)

  /* ── 현장 ─────────────────────────────────────────── */
  const siteG = new THREE.Group()
  const siteMats: { m: THREE.Material & { opacity: number }; base: number }[] = []
  const fade = <M extends THREE.Material & { opacity: number }>(m: M, base: number) => {
    m.transparent = true
    m.opacity = base
    siteMats.push({ m, base })
    return m
  }
  const dongs: Dong[] = []
  const places: { el: HTMLDivElement; at: THREE.Vector3 }[] = []
  const siteCenter = new THREE.Vector3()
  if (site) {
    const ctx = site.context
    // 물·공원 — 바닥의 결
    const water = ctx.water.map(p => plate(p, 0.004))
    if (water.length) siteG.add(new THREE.Mesh(mergeGeometries(water), fade(new THREE.MeshBasicMaterial({ color: '#10294A', depthWrite: false }), 0.9)))
    const parks = ctx.parks.map(p => plate(p, 0.003))
    if (parks.length) siteG.add(new THREE.Mesh(mergeGeometries(parks), fade(new THREE.MeshBasicMaterial({ color: '#12261F', depthWrite: false }), 0.85)))
    // 길 — 큰길은 밝게
    const major: number[] = []
    const minor: number[] = []
    for (const r of ctx.roads) segs(r.p, 0.02, false, r.k ? major : minor)
    for (const r of ctx.rivers) segs(r.p, 0.02, false, minor)
    siteG.add(lines(major, fade(new THREE.LineBasicMaterial({ color: '#5B6F94' }), 0.75)))
    siteG.add(lines(minor, fade(new THREE.LineBasicMaterial({ color: '#2F4062' }), 0.7)))
    // 주변 건물 — 높이가 적힌 것만 세운다
    const tall = ctx.buildings.filter(b => b.h).map(b => prism(b.f, (b.h ?? 0) / U))
    if (tall.length) {
      const m = new THREE.Mesh(mergeGeometries(tall), fade(new THREE.MeshStandardMaterial({ color: '#17253D', roughness: 0.9, metalness: 0.05 }), 0.92))
      m.castShadow = true
      m.receiveShadow = true
      siteG.add(m)
    }
    const outline: number[] = []
    for (const b of ctx.buildings) if (!b.h) segs(b.f, 0.03, true, outline)
    siteG.add(lines(outline, fade(new THREE.LineBasicMaterial({ color: '#33476B' }), 0.6)))
    // 단지 경계 — 금빛 점선
    const bnd: number[] = []
    segs(site.boundary, 0.05, true, bnd)
    const bl = lines(bnd, fade(new THREE.LineDashedMaterial({ color: '#C9A55A', dashSize: 0.8, gapSize: 0.5 }), 0.9))
    bl.computeLineDistances()
    siteG.add(bl)
    siteG.add(new THREE.Mesh(plate(site.boundary, 0.006), fade(new THREE.MeshBasicMaterial({ color: '#C9A55A', depthWrite: false }), 0.05)))

    // 3단지 동 — 지도 윤곽 × 공고 최고층
    for (const d of site.dongs) {
      const height = (d.floors * PRESENTATION.floorM) / U
      const geo = prism(d.footprint, 1)
      const mat = fade(new THREE.MeshStandardMaterial({ color: C_DONG.clone(), roughness: 0.6, metalness: 0.1 }), 1)
      const mesh = new THREE.Mesh(geo, mat)
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.scale.y = height
      mesh.userData.dong = d.id
      const edgeMat = fade(new THREE.LineBasicMaterial({ color: C_EDGE.clone() }), 0.4)
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), edgeMat))
      // 층 — 공고의 층수만큼 둘레선. 창·호 위치는 그리지 않는다
      const fl: number[] = []
      for (let f = 1; f < d.floors; f++) segs(d.footprint, f / d.floors, true, fl)
      const floorMat = fade(new THREE.LineBasicMaterial({ color: '#8FA6CF' }), 0.12)
      mesh.add(lines(fl, floorMat))
      siteG.add(mesh)
      const cx = d.footprint.reduce((s, p) => s + p[0], 0) / d.footprint.length / U
      const cz = d.footprint.reduce((s, p) => s + p[1], 0) / d.footprint.length / U
      const tag = document.createElement('div')
      tag.className = 'cx3-tag cx3-tag--dong'
      tagLayer.appendChild(tag)
      dongs.push({ id: d.id, mesh, mat, edgeMat, floorMat, center: new THREE.Vector3(cx, height, cz), height, units: d.units, types: d.types, tag, sel: 0, cmp: 0, focus: 0, dim: 0 })
      siteCenter.x += cx / site.dongs.length
      siteCenter.z += cz / site.dongs.length
    }
    for (const l of ctx.labels) {
      const el = document.createElement('div')
      el.className = 'cx3-tag cx3-tag--place'
      el.dataset.k = l.k
      el.textContent = l.n
      tagLayer.appendChild(el)
      places.push({ el, at: new THREE.Vector3(l.x / U, 0.3, l.z / U) })
    }
    scene.add(siteG)
  }

  /* ── 데이터 구조 — 전용면적 줄로 묶어 앞뒤로 세운 기둥 ───── */
  const dataG = new THREE.Group()
  const grid = new THREE.GridHelper(24, 48, '#1F3354', '#142540')
  ;(grid.material as THREE.Material).transparent = true
  grid.position.y = 0.001
  dataG.add(grid)
  const rows = new Map<number, OfficialModel[]>()
  for (const m of models) {
    const k = Math.trunc(m.exclusiveArea ?? 0)
    rows.set(k, [...(rows.get(k) ?? []), m])
  }
  const rowKeys = [...rows.keys()].sort((a, b) => a - b)
  const cols: Col[] = []
  const byName = new Map<string, Col>()
  rowKeys.forEach((k, ri) => {
    const list = rows.get(k)!.slice().sort((a, b) => shortType(a.name).localeCompare(shortType(b.name), 'en'))
    list.forEach((m, i) => {
      const side = Math.sqrt(m.exclusiveArea ?? 0) * PRESENTATION.metre
      const outer = Math.sqrt(m.supplyArea ?? 0) * PRESENTATION.metre
      const height = Math.max(0.02, (m.households ?? 0) * PRESENTATION.perHousehold)
      const base = new THREE.Vector3((i - (list.length - 1) / 2) * 1.4, 0, (ri - (rowKeys.length - 1) / 2) * 2.2)
      const mat = new THREE.MeshStandardMaterial({ color: C_BODY.clone(), roughness: 0.55, metalness: 0.12, transparent: true })
      const geo = new THREE.BoxGeometry(side, 1, side)
      geo.translate(0, 0.5, 0)
      const body = new THREE.Mesh(geo, mat)
      body.scale.y = 0.001
      body.castShadow = true
      body.userData.name = m.name
      const edgeMat = new THREE.LineBasicMaterial({ color: C_EDGE.clone(), transparent: true, opacity: 0.35 })
      body.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat))
      const plateMat = new THREE.MeshBasicMaterial({ color: '#7FA3D9', transparent: true, opacity: 0.12, depthWrite: false })
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(outer, outer), plateMat)
      pl.rotation.x = -Math.PI / 2
      pl.position.y = 0.004
      const g = new THREE.Group()
      g.position.copy(base)
      g.add(body, pl)
      dataG.add(g)
      const tag = document.createElement('div')
      tag.className = 'cx3-tag'
      tag.textContent = shortType(m.name)
      tagLayer.appendChild(tag)
      const col: Col = { name: m.name, base, pos: g.position, body, mat, edgeMat, plateMat, height, tag, hot: 0, dim: 0 }
      cols.push(col)
      byName.set(m.name, col)
    })
  })
  scene.add(dataG)

  /* ── 카메라 ─────────────────────────────────────────── */
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 2.5
  controls.maxDistance = 220
  controls.maxPolarAngle = Math.PI * 0.47
  let userTook = false
  controls.addEventListener('start', () => {
    userTook = true
  })
  const SITE_HOME = new THREE.Spherical(40, 0.92, 0.55)
  const DATA_HOME = new THREE.Spherical(9.5, 0.95, 0.55)
  const START = site ? new THREE.Spherical(150, 0.32, 0.15) : new THREE.Spherical(18, 0.12, 0.35)
  const cur = new THREE.Spherical().copy(START)
  const target = new THREE.Vector3()
  const want = { sph: new THREE.Spherical(), target: new THREE.Vector3() }
  let arriveT = 0
  let arrived = false
  const place = () => {
    camera.position.setFromSpherical(cur).add(target)
    camera.lookAt(target)
  }

  const centroidOf = (list: Dong[], weight: (d: Dong) => number, out: THREE.Vector3) => {
    let w = 0
    out.set(0, 0, 0)
    for (const d of list) {
      const k = weight(d)
      if (!k) continue
      out.x += d.center.x * k
      out.z += d.center.z * k
      w += k
    }
    if (!w) return false
    out.divideScalar(w)
    return true
  }

  /** 화면 모양에 맞춘 틀 — 좁으면 물러서고, 넓은 건축 화면은 큰 글자 자리를 비우고, 아래 시트만큼 올린다 */
  function frameFor(siteMode: boolean) {
    const { w, h } = stage.size()
    const asp = w / Math.max(1, h)
    // 세로 화면은 가로 시야가 좁다 — 가로 화면만큼 담기도록 물러선다
    if (asp < 1.2) want.sph.radius *= Math.pow(1.2 / asp, 0.9)
    if (siteMode && state.mode === 'architecture' && state.dong === null && asp > 1.25) {
      const d = want.sph.radius * 0.13
      want.target.x -= Math.cos(want.sph.theta) * d
      want.target.z += Math.sin(want.sph.theta) * d
    }
    if (siteMode && asp < 1) want.sph.phi = Math.min(want.sph.phi, 0.78)
    // 아래 시트가 덮는 만큼 — 겨냥점을 카메라 쪽 바닥으로 당기면 단지가 화면 위로 오른다
    if (siteMode && state.inset) {
      const d = want.sph.radius * state.inset * 0.9
      want.target.x += Math.sin(want.sph.theta) * d
      want.target.z += Math.cos(want.sph.theta) * d
    }
  }

  function aim() {
    aimRaw()
    frameFor(state.mode !== 'data' && !!site)
  }

  function aimRaw() {
    if (state.mode === 'data' || !site) {
      const s = state.selected ? byName.get(state.selected) : null
      const c = state.compare ? byName.get(state.compare) : null
      if (s && c) {
        want.target.set(0, Math.max(s.height, c.height) * 0.45, 2.6)
        want.sph.set(6.2, 1.05, 0.0)
      } else if (s) {
        want.target.set(s.base.x, s.height * 0.5 + 0.2, s.base.z)
        want.sph.set(4.8 + s.height * 0.6, 1.0, 0.45)
      } else {
        want.target.set(0, 0.6, 0)
        want.sph.copy(DATA_HOME)
      }
      return
    }
    const d = state.dong !== null ? dongs.find(x => x.id === state.dong) : null
    if (d) {
      want.target.set(d.center.x, d.height * 0.45, d.center.z)
      want.sph.set(10 + d.height * 1.1, 1.0, SITE_HOME.theta)
      return
    }
    const sel = state.mode === 'unit' ? state.selected : null
    const cmp = state.mode === 'unit' ? state.compare : null
    if (sel && centroidOf(dongs, x => (x.types[sel] ?? 0) + (cmp ? x.types[cmp] ?? 0 : 0), want.target)) {
      want.target.y = 2
      want.sph.set(cmp ? 32 : 28, 0.9, SITE_HOME.theta)
      return
    }
    want.target.set(siteCenter.x, 2, siteCenter.z)
    want.sph.copy(SITE_HOME)
  }
  aim()
  target.copy(want.target)
  place()

  /* ── 고르기 — 끌다 놓은 것은 버린다 ── */
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  let hovered: string | null = null
  let hoverDong: number | null = null
  const pick = (e: PointerEvent | MouseEvent): { col?: string; dong?: number } => {
    const r = canvas.getBoundingClientRect()
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    if (state.mode === 'data' || !site) {
      const hit = ray.intersectObjects(cols.map(c => c.body), false)[0]
      return { col: hit?.object.userData.name as string | undefined }
    }
    const hit = ray.intersectObjects(dongs.map(d => d.mesh), false)[0]
    return { dong: hit?.object.userData.dong as number | undefined }
  }
  let down: { x: number; y: number } | null = null
  const onDown = (e: PointerEvent) => {
    down = { x: e.clientX, y: e.clientY }
  }
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    const p = pick(e)
    canvas.style.cursor = p.col || p.dong ? 'pointer' : ''
    hoverDong = p.dong ?? null
    const n = p.col ?? null
    if (n !== hovered) {
      hovered = n
      cb.onHover(n)
    }
  }
  const onUp = (e: PointerEvent) => {
    const moved = down ? Math.hypot(e.clientX - down.x, e.clientY - down.y) : 99
    down = null
    if (moved > 6) return
    const p = pick(e)
    if (p.col) cb.onPick(p.col)
    if (p.dong) cb.onPickDong(p.dong)
  }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)

  /* ── 그리기 ── */
  let ready = false
  let siteMix = state.mode === 'data' ? 0 : 1
  let dataRise = 0
  let siteRise = reduced ? 1 : 0
  let arriveStart = 0
  const tmp = new THREE.Vector3()
  const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
  const project = (v: THREE.Vector3, el: HTMLElement, w: number, h: number) => {
    tmp.copy(v).project(camera)
    const on = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1
    el.style.transform = `translate(${((tmp.x + 1) / 2) * w}px, ${((1 - tmp.y) / 2) * h}px) translate(-50%, -100%)`
    return on
  }

  function frame(dt: number) {
    const k = (rate: number) => (reduced ? 1 : 1 - Math.exp(-dt * rate))
    const onSite = state.mode !== 'data' && !!site
    // 모드 사이 — 0.6초 남짓 겹쳐 사라지고 떠오른다
    siteMix += ((onSite ? 1 : 0) - siteMix) * k(5)
    // 도착은 벽시계로 — 프레임이 밀리는 기기에서도 1.4초 안에 선다(dt 는 프레임마다 0.1초로 잘린다)
    if (!arriveStart) arriveStart = performance.now()
    const wall = Math.min(1, (performance.now() - arriveStart) / PRESENTATION.arriveMs)
    siteRise = reduced ? 1 : wall
    dataRise += ((onSite ? 0 : 1) - dataRise) * k(4.5)
    siteG.visible = siteMix > 0.01
    dataG.visible = siteMix < 0.99
    for (const s of siteMats) s.m.opacity = s.base * siteMix
    ;(grid.material as THREE.Material).opacity = 0.45 * (1 - siteMix)

    // 동 — 고른 주택형이 있는 동만 밝힌다(세대 비율만큼), 비교는 푸른빛
    const sel = state.mode === 'unit' ? state.selected : null
    const cmp = state.mode === 'unit' ? state.compare : null
    for (const d of dongs) {
      const a = sel ? (d.types[sel] ?? 0) / d.units : 0
      const b = cmp ? (d.types[cmp] ?? 0) / d.units : 0
      d.sel += ((a ? 0.35 + 0.65 * a : 0) - d.sel) * k(7)
      d.cmp += ((b ? 0.35 + 0.65 * b : 0) - d.cmp) * k(7)
      d.focus += ((state.dong === d.id || hoverDong === d.id ? 1 : 0) - d.focus) * k(8)
      const none = (sel || cmp) && !a && !b
      d.mesh.scale.y = Math.max(0.001, d.height * ease(siteRise))
      // 고른 주택형이 없는 동은 비치게 하지 않고 어둡게 — 뒤 건물이 겹쳐 보이면 읽기 어렵다
      d.dim += ((none ? 1 : 0) - d.dim) * k(6)
      const c = d.mat.color.copy(C_DONG).lerp(C_DIM, d.dim * 0.8)
      if (d.sel > 0.01 && d.cmp > 0.01) c.lerp(C_BOTH, Math.max(d.sel, d.cmp))
      else if (d.sel > 0.01) c.lerp(C_SEL, d.sel)
      else if (d.cmp > 0.01) c.lerp(C_CMP, d.cmp)
      d.mat.emissive.copy(d.cmp > d.sel ? C_CMP : C_SEL).multiplyScalar(Math.max(d.sel, d.cmp) * 0.12 + d.focus * 0.1)
      d.mat.opacity = siteMix
      d.mat.transparent = siteMix < 0.999
      d.mat.depthWrite = siteMix > 0.5
      d.edgeMat.opacity = siteMix * Math.min(1, 0.32 + d.focus * 0.6 + Math.max(d.sel, d.cmp) * 0.25 - d.dim * 0.18)
      d.floorMat.opacity = siteMix * (0.1 + d.focus * 0.25)
    }

    // 기둥
    const anyPick = !!(state.selected || state.compare)
    for (const c of cols) {
      const isSel = c.name === state.selected
      const isCmp = c.name === state.compare
      const isHov = c.name === (state.hover ?? hovered)
      c.hot += ((isSel || isCmp ? 1 : 0) - c.hot) * k(7)
      c.dim += ((anyPick && !isSel && !isCmp ? 1 : 0) - c.dim) * k(6)
      c.body.scale.y = Math.max(0.001, c.height * ease(Math.min(1, dataRise)))
      // 비교: 둘이 앞 가운데로 갈라 선다 (splitMs ≈ 0.6s)
      const to = tmp.copy(c.base)
      if (state.selected && state.compare) {
        if (isSel) to.set(-0.95, 0, 2.6)
        else if (isCmp) to.set(0.95, 0, 2.6)
      }
      const r = k(5000 / PRESENTATION.splitMs)
      c.pos.x += (to.x - c.pos.x) * r
      c.pos.z += (to.z - c.pos.z) * r
      c.mat.color.copy(C_BODY).lerp(isCmp ? C_CMP : C_SEL, c.hot)
      c.mat.emissive.copy(isCmp ? C_CMP : C_SEL).multiplyScalar(c.hot * 0.18)
      c.mat.opacity = (1 - c.dim * 0.72) * (1 - siteMix)
      c.edgeMat.opacity = Math.min(1, 0.35 + (isHov ? 0.55 : 0) + c.hot * 0.4 - c.dim * 0.2) * (1 - siteMix)
      c.plateMat.opacity = (0.12 + c.hot * 0.18 - c.dim * 0.08) * (1 - siteMix)
    }

    // 카메라
    if (!userTook) {
      aim()
      if (!arrived) {
        arriveT = reduced ? 1 : wall
        const a = ease(arriveT)
        cur.radius = START.radius + (want.sph.radius - START.radius) * a
        cur.phi = START.phi + (want.sph.phi - START.phi) * a
        cur.theta = START.theta + (want.sph.theta - START.theta) * a
        target.copy(want.target)
        if (arriveT >= 1) {
          arrived = true
          cb.onArrived()
        }
      } else {
        cur.radius += (want.sph.radius - cur.radius) * k(3)
        cur.phi += (want.sph.phi - cur.phi) * k(3)
        cur.theta += (want.sph.theta - cur.theta) * k(3)
        target.lerp(want.target, k(3))
      }
      place()
      controls.target.copy(target)
    } else {
      if (!arrived) {
        arrived = true
        cb.onArrived()
      }
      controls.update()
    }
    const dist = camera.position.distanceTo(controls.target)
    fog.near = dist * 0.9
    fog.far = dist * 2.6 + 20

    // 이름표
    const { w, h } = stage.size()
    for (const c of cols) {
      const show = !onSite && (c.name === state.selected || c.name === state.compare || c.name === (state.hover ?? hovered))
      if (!show || c.dim > 0.5 || siteMix > 0.4) {
        c.tag.style.opacity = '0'
        continue
      }
      tmp.set(c.pos.x, c.height * ease(Math.min(1, dataRise)) + 0.18, c.pos.z)
      c.tag.style.opacity = project(tmp, c.tag, w, h) ? '1' : '0'
      c.tag.dataset.k = c.name === state.compare ? 'cmp' : c.name === state.selected ? 'sel' : 'hov'
    }
    for (const d of dongs) {
      const n = (sel ? d.types[sel] ?? 0 : 0) + (cmp ? d.types[cmp] ?? 0 : 0)
      const show = siteMix > 0.6 && arrived && (state.mode === 'architecture' || n > 0 || d.focus > 0.5)
      if (!show) {
        d.tag.style.opacity = '0'
        continue
      }
      const text = state.mode === 'unit' && n ? `${d.id}동 · ${n}세대` : `${d.id}`
      if (d.tag.textContent !== text) d.tag.textContent = text
      d.tag.dataset.k = d.focus > 0.5 ? 'focus' : d.sel > d.cmp ? 'sel' : d.cmp > 0.01 ? 'cmp' : ''
      tmp.set(d.center.x, d.height * ease(siteRise) + 0.4, d.center.z)
      d.tag.style.opacity = project(tmp, d.tag, w, h) ? '1' : '0'
    }
    for (const p of places) {
      const show = siteMix > 0.6 && arrived && state.mode === 'architecture'
      p.el.style.opacity = show && project(p.at, p.el, w, h) ? '0.85' : '0'
    }

    if (!ready) {
      ready = true
      cb.onReady()
    }
  }

  // 손을 뗀 자리에서 이어 간다 — 튀지 않게
  const resume = () => {
    if (!userTook) return
    userTook = false
    target.copy(controls.target)
    cur.setFromVector3(tmp.copy(camera.position).sub(target))
  }

  return {
    update(s) {
      const moved =
        s.mode !== state.mode || s.selected !== state.selected || s.compare !== state.compare || s.dong !== state.dong || s.inset !== state.inset
      state = s
      // 사용자가 새로 고르면 카메라가 다시 따라간다 — 끌던 손은 그때까지만 이긴다
      if (moved && arrived) resume()
    },
    overview() {
      resume()
    },
    dispose() {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      controls.dispose()
      tagLayer.remove()
      stage.dispose()
    },
  }
}
