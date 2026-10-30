import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { createStage } from '../three/stage'
import { PRESENTATION, shortType, type OfficialModel } from '@/lib/consumer/complex-visualization'

/**
 * 주택형 개념 시각화 — 실제 단지 모양이 아니다.
 *
 * 확인된 동 배치·층수가 없을 때 쓰는 장면이다(verifiedGeometry = null). 건물을 그리지 않고,
 * 공고에 적힌 숫자만으로 기둥을 세운다.
 *  - 바닥 넓이 = 전용면적 그대로(정사각형, 한 변 = √넓이). 옅은 테두리 판 = 공급면적
 *  - 높이 = 공급 세대수
 * 그래서 넓이끼리, 세대수끼리는 눈으로 바로 견줄 수 있다. 방·창·향 같은 모양은 없다.
 *
 * 카메라: 처음엔 위에서 내려다보다 다가온다(도착). 고른 주택형으로 용수철처럼 옮겨 간다.
 * 사용자가 돌리거나 끌면 그때부터 자동 카메라는 손을 뗀다.
 */

export interface ComplexState {
  selected: string | null
  compare: string | null
  hover: string | null
}

export interface ComplexHandle {
  update: (s: ComplexState) => void
  /** 전체를 다시 내려다보는 자리로 */
  overview: () => void
  dispose: () => void
}

interface Col {
  name: string
  base: THREE.Vector3
  pos: THREE.Vector3
  body: THREE.Mesh
  mat: THREE.MeshStandardMaterial
  edges: THREE.LineSegments
  edgeMat: THREE.LineBasicMaterial
  plate: THREE.Mesh
  plateMat: THREE.MeshBasicMaterial
  height: number
  tag: HTMLDivElement
  hot: number
  dim: number
}

const C_BODY = new THREE.Color('#2B4675')
const C_SEL = new THREE.Color('#C9A55A')
const C_CMP = new THREE.Color('#7FA3D9')
const C_EDGE = new THREE.Color('#9FB6DB')

export function mountComplex(
  host: HTMLElement,
  models: OfficialModel[],
  cb: { onHover: (name: string | null) => void; onPick: (name: string) => void; onReady: () => void; onLost: () => void },
  reduced: boolean,
): ComplexHandle {
  let state: ComplexState = { selected: null, compare: null, hover: null }
  const stage = createStage({
    host,
    background: '#0A1322',
    fov: 32,
    exposure: 1.05,
    shadows: true,
    environment: 0.25,
    envKind: 'night',
    tone: 'neutral',
    bloom: { strength: 0.35, radius: 0.4, threshold: 0.9 },
    onFrame: frame,
    onLost: () => cb.onLost(),
  })
  const { scene, camera, canvas } = stage

  /* 빛 — 달빛 같은 주광, 푸른 테두리빛 */
  scene.add(new THREE.HemisphereLight('#9DB2DA', '#0A1322', 0.6))
  const key = new THREE.DirectionalLight('#EAF0FF', 1.6)
  key.position.set(-4, 7, 3)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 20 })
  key.shadow.bias = -0.0006
  scene.add(key)
  const rim = new THREE.DirectionalLight('#6F8FD8', 0.8)
  rim.position.set(5, 3, -6)
  scene.add(rim)

  /* 바닥 */
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ color: '#0D1A2E', roughness: 0.95, metalness: 0 }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)
  const grid = new THREE.GridHelper(24, 48, '#1F3354', '#142540')
  ;(grid.material as THREE.Material).transparent = true
  ;(grid.material as THREE.Material).opacity = 0.45
  grid.position.y = 0.001
  scene.add(grid)

  /* 기둥 — 전용면적 줄로 묶어 앞뒤로 늘어 세운다 */
  const rows = new Map<number, OfficialModel[]>()
  for (const m of models) {
    const k = m.exclusiveArea ?? 0
    rows.set(k, [...(rows.get(k) ?? []), m])
  }
  const rowKeys = [...rows.keys()].sort((a, b) => a - b)
  const GAP_X = 1.4
  const GAP_Z = 2.2
  const tagLayer = document.createElement('div')
  tagLayer.className = 'cx3-tags'
  host.appendChild(tagLayer)
  const cols: Col[] = []
  const byName = new Map<string, Col>()
  rowKeys.forEach((k, ri) => {
    const list = rows.get(k)!.slice().sort((a, b) => shortType(a.name).localeCompare(shortType(b.name), 'en'))
    list.forEach((m, i) => {
      const side = Math.sqrt(m.exclusiveArea ?? 0) * PRESENTATION.metre
      const outer = Math.sqrt(m.supplyArea ?? 0) * PRESENTATION.metre
      const height = Math.max(0.02, (m.households ?? 0) * PRESENTATION.perHousehold)
      const x = (i - (list.length - 1) / 2) * GAP_X
      const z = (ri - (rowKeys.length - 1) / 2) * GAP_Z
      const base = new THREE.Vector3(x, 0, z)

      const mat = new THREE.MeshStandardMaterial({ color: C_BODY.clone(), roughness: 0.55, metalness: 0.12, transparent: true })
      const geo = new THREE.BoxGeometry(side, 1, side)
      geo.translate(0, 0.5, 0)
      const body = new THREE.Mesh(geo, mat)
      body.scale.y = 0.001
      body.castShadow = true
      body.userData.name = m.name
      const edgeMat = new THREE.LineBasicMaterial({ color: C_EDGE.clone(), transparent: true, opacity: 0.35 })
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat)
      body.add(edges)

      const plateMat = new THREE.MeshBasicMaterial({ color: '#7FA3D9', transparent: true, opacity: 0.12, depthWrite: false })
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(outer, outer), plateMat)
      plate.rotation.x = -Math.PI / 2
      plate.position.y = 0.004

      const g = new THREE.Group()
      g.position.copy(base)
      g.add(body, plate)
      scene.add(g)

      const tag = document.createElement('div')
      tag.className = 'cx3-tag'
      tag.textContent = shortType(m.name)
      tagLayer.appendChild(tag)

      const col: Col = { name: m.name, base, pos: g.position, body, mat, edges, edgeMat, plate, plateMat, height, tag, hot: 0, dim: 0 }
      cols.push(col)
      byName.set(m.name, col)
    })
  })

  /* 카메라 — 처음엔 높이서 내려다보고(도착), 이후 고른 기둥으로 */
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 2.5
  controls.maxDistance = 22
  controls.maxPolarAngle = Math.PI * 0.47
  controls.target.set(0, 0.6, 0)
  let userTook = false
  controls.addEventListener('start', () => {
    userTook = true
  })
  const START = new THREE.Spherical(18, 0.12, 0.35)
  const HOME = new THREE.Spherical(9.5, 0.95, 0.55)
  const cur = new THREE.Spherical().copy(reduced ? HOME : START)
  const target = new THREE.Vector3(0, 0.6, 0)
  const want = { sph: HOME.clone(), target: new THREE.Vector3(0, 0.6, 0) }
  let arriveT = reduced ? 1 : 0
  let rise = reduced ? 1 : 0
  const place = () => {
    camera.position.setFromSpherical(cur).add(target)
    camera.lookAt(target)
  }
  place()

  function aim() {
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
      want.sph.copy(HOME)
    }
  }

  /* 고르기 — 끌다 놓은 것은 버린다 */
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  let hovered: string | null = null
  const pick = (e: PointerEvent | MouseEvent) => {
    const r = canvas.getBoundingClientRect()
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    const hit = ray.intersectObjects(cols.map(c => c.body), false)[0]
    return (hit?.object.userData.name as string | undefined) ?? null
  }
  let down: { x: number; y: number } | null = null
  const onDown = (e: PointerEvent) => {
    down = { x: e.clientX, y: e.clientY }
  }
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    const n = pick(e)
    canvas.style.cursor = n ? 'pointer' : ''
    if (n !== hovered) {
      hovered = n
      cb.onHover(n)
    }
  }
  const onUp = (e: PointerEvent) => {
    const moved = down ? Math.hypot(e.clientX - down.x, e.clientY - down.y) : 99
    down = null
    if (moved > 6) return
    const n = pick(e)
    if (n) cb.onPick(n)
  }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)

  /* 그리기 */
  let ready = false
  const tmp = new THREE.Vector3()
  const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
  function frame(dt: number) {
    const k = (rate: number) => 1 - Math.exp(-dt * rate)
    // 도착 — 기둥이 솟고 카메라가 내려온다
    rise = Math.min(1, rise + dt / (PRESENTATION.arriveMs / 1000))
    const anyPick = !!(state.selected || state.compare)

    for (const c of cols) {
      const isSel = c.name === state.selected
      const isCmp = c.name === state.compare
      const isHov = c.name === (state.hover ?? hovered)
      c.hot += ((isSel || isCmp ? 1 : 0) - c.hot) * k(7)
      c.dim += ((anyPick && !isSel && !isCmp ? 1 : 0) - c.dim) * k(6)
      c.body.scale.y = Math.max(0.001, c.height * ease(rise))
      // 비교: 둘을 앞 가운데로 나란히 옮긴다
      const to = tmp.copy(c.base)
      if (state.selected && state.compare) {
        if (isSel) to.set(-0.95, 0, 2.6)
        else if (isCmp) to.set(0.95, 0, 2.6)
      }
      c.pos.x += (to.x - c.pos.x) * k(5)
      c.pos.z += (to.z - c.pos.z) * k(5)
      c.mat.color.copy(C_BODY).lerp(isCmp ? C_CMP : C_SEL, c.hot)
      c.mat.emissive.copy(isCmp ? C_CMP : C_SEL).multiplyScalar(c.hot * 0.18)
      c.mat.opacity = 1 - c.dim * 0.72
      c.edgeMat.opacity = Math.min(1, 0.35 + (isHov ? 0.55 : 0) + c.hot * 0.4 - c.dim * 0.2)
      c.plateMat.opacity = 0.12 + c.hot * 0.18 - c.dim * 0.08
    }

    if (!userTook) {
      aim()
      arriveT = Math.min(1, arriveT + dt / (PRESENTATION.arriveMs / 1000))
      const a = ease(arriveT)
      const goal = arriveT < 1 ? new THREE.Spherical().set(
        START.radius + (want.sph.radius - START.radius) * a,
        START.phi + (want.sph.phi - START.phi) * a,
        START.theta + (want.sph.theta - START.theta) * a,
      ) : want.sph
      const r = arriveT < 1 ? 1 : k(3)
      cur.radius += (goal.radius - cur.radius) * r
      cur.phi += (goal.phi - cur.phi) * r
      cur.theta += (goal.theta - cur.theta) * r
      target.lerp(want.target, arriveT < 1 ? a : k(3))
      place()
      controls.target.copy(target)
    } else {
      controls.update()
    }

    // 이름표 — 고른 것·비교·손이 간 것만
    const { w, h } = stage.size()
    for (const c of cols) {
      const show = c.name === state.selected || c.name === state.compare || c.name === (state.hover ?? hovered)
      if (!show || c.dim > 0.5) {
        c.tag.style.opacity = '0'
        continue
      }
      tmp.set(c.pos.x, c.height * ease(rise) + 0.18, c.pos.z).project(camera)
      c.tag.style.opacity = tmp.z < 1 ? '1' : '0'
      c.tag.style.transform = `translate(${((tmp.x + 1) / 2) * w}px, ${((1 - tmp.y) / 2) * h}px) translate(-50%, -100%)`
      c.tag.dataset.k = c.name === state.compare ? 'cmp' : c.name === state.selected ? 'sel' : 'hov'
    }

    if (!ready) {
      ready = true
      cb.onReady()
    }
  }

  return {
    update(s) {
      state = s
    },
    overview() {
      userTook = false
      state = { selected: null, compare: null, hover: null }
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
