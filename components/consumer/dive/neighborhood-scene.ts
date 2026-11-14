import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { NeighborhoodData } from '@/lib/consumer/neighborhood'

/**
 * 동네 무대 — 공고 자리 둘레의 실제 공개 지도(OSM) 건물·길·물·공원.
 *
 * 미터 좌표(x 동쪽 · z 남쪽)를 그대로 쓴다. 전국 무대의 그림 좌표와 섞지 않는다.
 * 건물은 지도에 높이가 적힌 것만 세우고, 적히지 않은 것은 바닥 윤곽만 깐다 — 높이를 지어내지 않는다.
 * 어떤 건물도 '이 공고의 아파트'로 칠하지 않는다. 자리는 표식(한 점) 또는 범위(원)로만 말한다.
 *
 * 그릴 일이 있을 때만 그린다(내려가는 동안·손으로 돌리는 동안·크기가 바뀔 때).
 */
export interface NeighborhoodInput {
  data: NeighborhoodData
  /** 한 점으로 짚는가(필지·주소) — 아니면 범위만 */
  pinpoint: boolean
  /** 표식·범위 반경(m) */
  uncertaintyM: number | null
  reducedMotion: boolean
  lowPower: boolean
}

export interface NeighborhoodScene {
  dispose: () => void
  reset: () => void
  northUp: () => void
  nudge: (kind: 'in' | 'out' | 'left' | 'right' | 'up' | 'down') => void
}

const C = {
  ground: 0x101a26,
  plate: 0x1b2a3a,
  building: 0x8a9bb0,
  buildingFlat: 0x3a4b5f,
  road: 0x56677b,
  roadBig: 0x8592a3,
  water: 0x1f4d6b,
  park: 0x1f3a2c,
  pin: 0xa83a20,
  halo: 0x55cdd2,
}

function shapeOf(pts: [number, number][], holes: [number, number][][] = []): THREE.Shape | null {
  if (pts.length < 3) return null
  // x 동쪽, z 남쪽 → shape 의 (x, -z) 로 그리고 눕히면(rotateX -90°) 다시 (x, z) 가 된다
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)))
  // 안뜰(구멍) — 자산 단계에서 형상을 바로잡았으므로 그대로 뚫는다
  for (const h of holes) if (h.length >= 3) s.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))))
  return s
}

export function createNeighborhoodScene(canvas: HTMLCanvasElement, input: NeighborhoodInput): NeighborhoodScene {
  const { data } = input
  const R = data.radiusM
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !input.lowPower, alpha: true, powerPreference: 'low-power' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, input.lowPower ? 1.25 : 2))
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)

  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(C.ground, R * 2.2, R * 5)
  // 가까운 면은 1m, 먼 면은 무대 반경의 열 배 — 지면·건물 속으로 파고들지 않게(아래 각도 제한과 함께)
  const camera = new THREE.PerspectiveCamera(40, canvas.clientWidth / Math.max(1, canvas.clientHeight), 1, R * 10)

  scene.add(new THREE.HemisphereLight(0xdfe8f5, 0x0b1118, 1.4))
  const sun = new THREE.DirectionalLight(0xfff1d8, 1.8)
  sun.position.set(-R, R * 1.4, R * 0.6)
  scene.add(sun)

  const geoms: THREE.BufferGeometry[] = []
  const mats: THREE.Material[] = []
  const add = (g: THREE.BufferGeometry, m: THREE.Material, y = 0) => {
    geoms.push(g)
    mats.push(m)
    const mesh = new THREE.Mesh(g, m)
    mesh.position.y = y
    scene.add(mesh)
    return mesh
  }

  // 바닥 — 받아 온 범위만큼(원). 그 밖은 자료가 없다는 뜻으로 비워 둔다
  const plate = new THREE.CircleGeometry(R * 1.05, 96)
  plate.rotateX(-Math.PI / 2)
  add(plate, new THREE.MeshStandardMaterial({ color: C.plate, roughness: 1 }), -0.05)

  const flatPoly = (rings: [number, number][][], color: number, y: number) => {
    const shapes = rings.map(r => shapeOf(r)).filter((s): s is THREE.Shape => Boolean(s))
    if (!shapes.length) return
    const g = new THREE.ShapeGeometry(shapes)
    g.rotateX(-Math.PI / 2)
    add(g, new THREE.MeshStandardMaterial({ color, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }), y)
  }
  flatPoly(data.parks, C.park, 0.02)
  flatPoly(data.water, C.water, 0.04)

  // 길 — 굵기를 가진 띠로(선은 기기마다 1px 로 그려져 보이지 않는다)
  for (const big of [0, 1] as const) {
    const pos: number[] = []
    const w = big ? 7 : 3.5
    for (const r of data.roads)
      if (r.k === big)
        for (let i = 1; i < r.p.length; i++) {
          const [x1, z1] = r.p[i - 1]
          const [x2, z2] = r.p[i]
          const dx = x2 - x1
          const dz = z2 - z1
          const L = Math.hypot(dx, dz) || 1
          const nx = (-dz / L) * (w / 2)
          const nz = (dx / L) * (w / 2)
          pos.push(x1 + nx, 0, z1 + nz, x2 + nx, 0, z2 + nz, x2 - nx, 0, z2 - nz, x1 + nx, 0, z1 + nz, x2 - nx, 0, z2 - nz, x1 - nx, 0, z1 - nz)
        }
    if (!pos.length) continue
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.computeVertexNormals()
    add(g, new THREE.MeshBasicMaterial({ color: big ? C.roadBig : C.road, side: THREE.DoubleSide }), big ? 0.08 : 0.06)
  }

  // 건물 — 높이가 적힌 것만 세운다. 없는 것은 얇은 바닥 윤곽
  const tall: THREE.BufferGeometry[] = []
  const flat: THREE.BufferGeometry[] = []
  for (const b of data.buildings) {
    const s = shapeOf(b.f, b.holes)
    if (!s) continue
    if (b.h !== null) {
      const g = new THREE.ExtrudeGeometry(s, { depth: b.h, bevelEnabled: false })
      g.rotateX(-Math.PI / 2)
      tall.push(g)
    } else {
      const g = new THREE.ShapeGeometry(s)
      g.rotateX(-Math.PI / 2)
      g.translate(0, 0.12, 0)
      flat.push(g)
    }
  }
  const merge = (list: THREE.BufferGeometry[]) => {
    // 같은 재질은 한 덩어리로 — 그리기 호출을 건물 수만큼 늘리지 않는다
    if (!list.length) return null
    let n = 0
    for (const g of list) n += (g.index ? g.index.count : g.attributes.position.count)
    const pos = new Float32Array(n * 3)
    const nor = new Float32Array(n * 3)
    let o = 0
    for (const g0 of list) {
      const g = g0.index ? g0.toNonIndexed() : g0
      g.computeVertexNormals()
      pos.set(g.attributes.position.array as Float32Array, o)
      nor.set(g.attributes.normal.array as Float32Array, o)
      o += g.attributes.position.array.length
      if (g !== g0) g.dispose()
      g0.dispose()
    }
    const out = new THREE.BufferGeometry()
    out.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, o), 3))
    out.setAttribute('normal', new THREE.BufferAttribute(nor.subarray(0, o), 3))
    return out
  }
  const tallG = merge(tall)
  if (tallG) add(tallG, new THREE.MeshStandardMaterial({ color: C.building, roughness: 0.85, metalness: 0.05 }))
  const flatG = merge(flat)
  if (flatG) add(flatG, new THREE.MeshStandardMaterial({ color: C.buildingFlat, roughness: 1, side: THREE.DoubleSide }))

  // 자리 — 한 점(필지·주소)은 기둥과 고리, 범위(공고명)는 옅은 원과 테두리
  const r = Math.max(40, input.uncertaintyM ?? 150)
  const marks: THREE.Mesh[] = []
  if (input.pinpoint) {
    marks.push(add(new THREE.CylinderGeometry(2.2, 2.2, 90, 16), new THREE.MeshStandardMaterial({ color: C.pin, emissive: 0x4a1408 }), 45))
    const ring = new THREE.RingGeometry(r * 0.92, r, 96)
    ring.rotateX(-Math.PI / 2)
    marks.push(add(ring, new THREE.MeshBasicMaterial({ color: C.halo, transparent: true, opacity: 0.7, depthWrite: false }), 0.3))
  } else {
    const area = new THREE.CircleGeometry(r, 96)
    area.rotateX(-Math.PI / 2)
    marks.push(add(area, new THREE.MeshBasicMaterial({ color: C.halo, transparent: true, opacity: 0.12, depthWrite: false }), 0.25))
    const edge = new THREE.RingGeometry(r * 0.985, r, 128)
    edge.rotateX(-Math.PI / 2)
    marks.push(add(edge, new THREE.MeshBasicMaterial({ color: C.halo, transparent: true, opacity: 0.75, depthWrite: false }), 0.3))
  }

  /* ── 카메라 — 높은 곳에서 그 자리로 한 번 내려간다 ── */
  const target = new THREE.Vector3(0, 0, 0)
  const near = new THREE.Vector3(R * 0.55, R * 0.62, R * 0.95)
  const far = new THREE.Vector3(R * 0.2, R * 3.2, R * 1.6)
  camera.position.copy(input.reducedMotion ? near : far)
  camera.lookAt(target)

  const controls = new OrbitControls(camera, canvas)
  controls.target.copy(target)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 60
  controls.maxDistance = R * 4
  // 지면 아래로 돌아 들어가지 않게 — 수평선 조금 위에서 멈춘다
  controls.maxPolarAngle = Math.PI / 2 - 0.12
  controls.screenSpacePanning = false
  controls.update()

  let flying = !input.reducedMotion
  let t0 = 0
  const DUR = 1300
  const ease = (x: number) => 1 - Math.pow(1 - x, 3)

  let raf = 0
  let settle = 0
  const draw = () => renderer.render(scene, camera)
  const clampPan = () => {
    // 받아 온 범위 밖으로 떠나지 않게
    const d = Math.hypot(controls.target.x, controls.target.z)
    if (d > R) controls.target.multiplyScalar(R / d)
    controls.target.y = 0
  }
  const tick = (now: number) => {
    raf = 0
    if (document.hidden) return
    if (flying) {
      if (!t0) t0 = now
      const k = Math.min(1, (now - t0) / DUR)
      camera.position.lerpVectors(far, near, ease(k))
      camera.lookAt(controls.target)
      if (k >= 1) {
        flying = false
        controls.update()
      }
      draw()
      raf = requestAnimationFrame(tick)
      return
    }
    clampPan()
    const moved = controls.update()
    draw()
    if (moved) settle = 12
    if (settle-- > 0) raf = requestAnimationFrame(tick)
  }
  const wake = () => {
    settle = 12
    if (!raf) raf = requestAnimationFrame(tick)
  }
  controls.addEventListener('change', wake)
  controls.addEventListener('start', wake)
  const resize = () => {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    wake()
  }
  const ro = new ResizeObserver(resize)
  ro.observe(canvas)
  const onVis = () => !document.hidden && wake()
  document.addEventListener('visibilitychange', onVis)
  wake()

  return {
    reset() {
      flying = !input.reducedMotion
      t0 = 0
      controls.target.copy(target)
      camera.position.copy(input.reducedMotion ? near : far)
      controls.update()
      wake()
    },
    northUp() {
      flying = false
      const dist = camera.position.distanceTo(controls.target)
      camera.position.set(controls.target.x, controls.target.y + dist * 0.75, controls.target.z + dist * 0.66)
      controls.update()
      wake()
    },
    nudge(kind) {
      flying = false
      const off = camera.position.clone().sub(controls.target)
      const sph = new THREE.Spherical().setFromVector3(off)
      if (kind === 'in') sph.radius = Math.max(controls.minDistance, sph.radius * 0.8)
      if (kind === 'out') sph.radius = Math.min(controls.maxDistance, sph.radius * 1.25)
      if (kind === 'left') sph.theta -= 0.25
      if (kind === 'right') sph.theta += 0.25
      if (kind === 'up') sph.phi = Math.max(0.15, sph.phi - 0.12)
      if (kind === 'down') sph.phi = Math.min(controls.maxPolarAngle, sph.phi + 0.12)
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph))
      controls.update()
      wake()
    },
    dispose() {
      cancelAnimationFrame(raf)
      controls.removeEventListener('change', wake)
      controls.removeEventListener('start', wake)
      document.removeEventListener('visibilitychange', onVis)
      ro.disconnect()
      controls.dispose()
      for (const g of geoms) g.dispose()
      for (const m of mats) m.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
    },
  }
}
