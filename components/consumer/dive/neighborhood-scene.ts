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
 *
 * 해 그림자 연구 — 해의 방위·고도(lib/geo/sun)를 받아 햇빛과 그림자를 옮긴다. 그림자를 드리우는 것은
 * 높이가 적힌 건물뿐이다(나머지는 바닥 윤곽). 처음 들어올 때는 건물이 가운데부터 차례로 솟고,
 * 청사진 선이 먼저 그려졌다가 옅어진다(움직임 줄이기에서는 완성된 모습 그대로).
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
  /** 해의 자리(방위: 정북 0° 시계 방향, 고도°) — 햇빛·그림자·하늘 밝기를 옮긴다 */
  setSun: (sun: { azimuth: number; elevation: number }) => void
  /** 천천히 도는 촬영 시점 */
  setCinematic: (on: boolean) => void
  /** 지금 장면을 세로 4:5 이미지로(글 띠 포함) */
  capture: (caption: { eyebrow: string; title: string; lines: string[]; footer: string }) => Promise<Blob | null>
  /** 그림자 계산에 쓰는 건물(장면과 같은 좌표) */
  readonly buildings: NeighborhoodData['buildings']
}

/**
 * 낮의 빛깔 — 해가 오르면 바닥·길·건물이 흰 매스 모형과 콘크리트 판처럼 밝아져 그림자가 또렷해진다.
 * 해가 지면 밤의 남색으로 돌아간다(아래 C).
 */
const DAY = {
  plate: 0xaeb4ba,
  road: 0xc4c8cc,
  roadBig: 0xd6d9dc,
  park: 0x93a48c,
  water: 0x7593ab,
  building: 0xf3f1ec,
  buildingFlat: 0xc9ccd0,
  fog: 0x46627e,
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
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = input.lowPower ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap

  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(C.ground, R * 2.2, R * 5)
  // 가까운 면은 1m, 먼 면은 무대 반경의 열 배 — 지면·건물 속으로 파고들지 않게(아래 각도 제한과 함께)
  const camera = new THREE.PerspectiveCamera(40, canvas.clientWidth / Math.max(1, canvas.clientHeight), 1, R * 10)

  const sky = new THREE.HemisphereLight(0xdfe8f5, 0x0b1118, 1.4)
  scene.add(sky)
  const sun = new THREE.DirectionalLight(0xfff1d8, 1.8)
  sun.position.set(-R, R * 1.4, R * 0.6)
  sun.castShadow = true
  // 그림자 상자 — 받아 온 범위만큼. 해가 낮으면 그림자가 길어지므로 조금 넉넉히
  const S = R * 1.25
  Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: R * 8 })
  sun.shadow.mapSize.set(input.lowPower ? 1024 : 2048, input.lowPower ? 1024 : 2048)
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.6
  sun.shadow.radius = 3
  scene.add(sun)
  scene.add(sun.target)

  /*
   * 솟는 등장 — 건물마다 '언제 솟기 시작하는가'(aDelay, 가운데에서 멀수록 늦게)를 꼭짓점에 적고,
   * 꼭짓점 셰이더가 높이를 0 → 1 로 키운다. 그림자 깊이 재질에도 같은 셈을 넣어 그림자도 함께 솟는다.
   */
  const rise = { value: input.reducedMotion ? 1 : 0 }
  const riseify = <M extends THREE.Material>(mat: M): M => {
    mat.onBeforeCompile = sh => {
      sh.uniforms.uRise = rise
      sh.vertexShader =
        'attribute float aDelay;\nuniform float uRise;\n' +
        sh.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\n  float rk = clamp((uRise - aDelay) / 0.35, 0.0, 1.0);\n  rk = 1.0 - pow(1.0 - rk, 3.0);\n  transformed.y *= max(rk, 0.002);',
        )
    }
    mat.customProgramCacheKey = () => 'zx-rise'
    return mat
  }

  const geoms: THREE.BufferGeometry[] = []
  const mats: THREE.Material[] = []
  /** 해에 따라 빛깔을 옮길 재질 — [재질, 밤 색, 낮 색] */
  const tint: [THREE.MeshStandardMaterial | THREE.MeshLambertMaterial, THREE.Color, THREE.Color][] = []
  const tintOf = <M extends THREE.MeshStandardMaterial | THREE.MeshLambertMaterial>(m: M, day: number): M => {
    tint.push([m, m.color.clone(), new THREE.Color(day)])
    return m
  }
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
  add(plate, tintOf(new THREE.MeshStandardMaterial({ color: C.plate, roughness: 1 }), DAY.plate), -0.05).receiveShadow = true

  const flatPoly = (rings: [number, number][][], color: number, y: number, day: number) => {
    const shapes = rings.map(r => shapeOf(r)).filter((s): s is THREE.Shape => Boolean(s))
    if (!shapes.length) return
    const g = new THREE.ShapeGeometry(shapes)
    g.rotateX(-Math.PI / 2)
    add(g, tintOf(new THREE.MeshStandardMaterial({ color, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }), day), y).receiveShadow = true
  }
  flatPoly(data.parks, C.park, 0.02, DAY.park)
  flatPoly(data.water, C.water, 0.04, DAY.water)

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
    // 그림자를 받도록 빛을 받는 재질로 — 길만 그림자 위에 떠 보이지 않게
    const road = add(g, tintOf(new THREE.MeshLambertMaterial({ color: big ? C.roadBig : C.road, side: THREE.DoubleSide }), big ? DAY.roadBig : DAY.road), big ? 0.08 : 0.06)
    road.receiveShadow = true
  }

  // 건물 — 높이가 적힌 것만 세운다. 없는 것은 얇은 바닥 윤곽
  const tall: { g: THREE.BufferGeometry; delay: number }[] = []
  const edges: { g: THREE.BufferGeometry; delay: number }[] = []
  const flat: THREE.BufferGeometry[] = []
  data.buildings.forEach((b, i) => {
    const s = shapeOf(b.f, b.holes)
    if (!s) return
    if (b.h !== null) {
      const g = new THREE.ExtrudeGeometry(s, { depth: b.h, bevelEnabled: false })
      g.rotateX(-Math.PI / 2)
      // 가운데에서 멀수록 늦게 솟는다. 같은 거리의 건물이 한꺼번에 솟지 않게 조금씩 어긋낸다(고정된 값)
      let cx = 0
      let cz = 0
      for (const [x, z] of b.f) {
        cx += x
        cz += z
      }
      const d = Math.hypot(cx / b.f.length, cz / b.f.length)
      const delay = Math.min(0.6, (d / R) * 0.55) + ((i * 0.6180339) % 1) * 0.06
      tall.push({ g, delay })
      if (!input.lowPower) edges.push({ g: new THREE.EdgesGeometry(g, 25), delay })
    } else {
      const g = new THREE.ShapeGeometry(s)
      g.rotateX(-Math.PI / 2)
      g.translate(0, 0.12, 0)
      flat.push(g)
    }
  })
  const merge = (list: { g: THREE.BufferGeometry; delay: number }[], normals: boolean) => {
    // 같은 재질은 한 덩어리로 — 그리기 호출을 건물 수만큼 늘리지 않는다
    if (!list.length) return null
    let n = 0
    for (const { g } of list) n += g.index ? g.index.count : g.attributes.position.count
    const pos = new Float32Array(n * 3)
    const nor = normals ? new Float32Array(n * 3) : null
    const del = new Float32Array(n)
    let o = 0
    for (const { g: g0, delay } of list) {
      const g = g0.index ? g0.toNonIndexed() : g0
      if (nor) g.computeVertexNormals()
      const arr = g.attributes.position.array as Float32Array
      pos.set(arr, o)
      if (nor) nor.set(g.attributes.normal.array as Float32Array, o)
      del.fill(delay, o / 3, (o + arr.length) / 3)
      o += arr.length
      if (g !== g0) g.dispose()
      g0.dispose()
    }
    const out = new THREE.BufferGeometry()
    out.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, o), 3))
    if (nor) out.setAttribute('normal', new THREE.BufferAttribute(nor.subarray(0, o), 3))
    out.setAttribute('aDelay', new THREE.BufferAttribute(del.subarray(0, o / 3), 1))
    return out
  }
  const tallG = merge(tall, true)
  if (tallG) {
    const mesh = add(tallG, riseify(tintOf(new THREE.MeshStandardMaterial({ color: C.building, roughness: 0.85, metalness: 0.05 }), DAY.building)))
    mesh.castShadow = true
    mesh.receiveShadow = true
    const depth = riseify(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }))
    mats.push(depth)
    mesh.customDepthMaterial = depth
  }
  // 청사진 선 — 솟는 동안 또렷하다가 옅어진다
  const edgeG = merge(edges, false)
  const edgeMat = riseify(new THREE.LineBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: input.reducedMotion ? 0.16 : 0.9, depthWrite: false }))
  if (edgeG) {
    geoms.push(edgeG)
    mats.push(edgeMat)
    const lines = new THREE.LineSegments(edgeG, edgeMat)
    lines.position.y = 0.05
    lines.renderOrder = 2
    scene.add(lines)
  }
  const flatG = flat.length ? merge(flat.map(g => ({ g, delay: 0 })), true) : null
  if (flatG) add(flatG, tintOf(new THREE.MeshStandardMaterial({ color: C.buildingFlat, roughness: 1, side: THREE.DoubleSide }), DAY.buildingFlat)).receiveShadow = true

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

  /** 지금의 낮 정도(0 밤 ~ 1 한낮) — 저장 이미지의 하늘빛에 쓴다 */
  let dayNow = 1
  let flying = !input.reducedMotion
  let t0 = 0
  const DUR = 1300
  /** 솟는 등장 — 2.4초. 카메라가 내려오는 동안 함께 */
  const RISE = 2400
  let riseT0 = 0
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
  const stepRise = (now: number) => {
    if (rise.value >= 1) return false
    if (!riseT0) riseT0 = now
    rise.value = Math.min(1, (now - riseT0) / RISE)
    // 선은 다 솟을 무렵부터 옅어진다
    edgeMat.opacity = 0.9 - 0.74 * Math.max(0, Math.min(1, (rise.value - 0.7) / 0.3))
    return true
  }
  const tick = (now: number) => {
    raf = 0
    if (document.hidden) return
    const rising = stepRise(now)
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
    if (moved || rising || controls.autoRotate) settle = 12
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
    buildings: data.buildings,
    setSun({ azimuth, elevation }) {
      const a = (azimuth * Math.PI) / 180
      const e = (Math.max(-6, elevation) * Math.PI) / 180
      // x 동쪽 · z 남쪽 · y 위
      const dir = new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e))
      sun.target.position.set(0, 0, 0)
      sun.position.copy(dir.multiplyScalar(R * 3))
      sun.target.updateMatrixWorld()
      // 해가 낮을수록 붉고 약하게, 지면 그림자 대신 밤빛만
      const day = Math.max(0, Math.min(1, (elevation + 2) / 14))
      dayNow = day
      const warm = Math.max(0, Math.min(1, 1 - (elevation - 4) / 26))
      sun.intensity = 3.1 * day
      sun.color.setRGB(1, 0.94 - 0.26 * warm, 0.86 - 0.46 * warm)
      sun.castShadow = elevation > 0
      // 그림자 쪽 밝기(하늘빛)는 낮에도 낮게 — 해가 비치는 면과 그림자가 갈려야 읽힌다
      sky.intensity = 0.42 + 0.5 * day
      sky.color.setRGB(0.72 + 0.15 * day, 0.78 + 0.13 * day, 0.92)
      // 낮에는 흰 매스 모형·콘크리트 판, 밤에는 남색
      const k = Math.pow(day, 0.8)
      for (const [m, night, noon] of tint) m.color.copy(night).lerp(noon, k)
      ;(scene.fog as THREE.Fog).color.set(C.ground).lerp(new THREE.Color(DAY.fog), k)
      wake()
    },
    setCinematic(on) {
      flying = false
      controls.autoRotate = on && !input.reducedMotion
      controls.autoRotateSpeed = 0.55
      wake()
    },
    async capture({ eyebrow, title, lines, footer }) {
      // 그리고 바로 옮긴다 — 그리기 버퍼는 화면에 옮겨진 뒤 비워진다
      draw()
      const W = 1080
      const H = 1350
      const out = document.createElement('canvas')
      out.width = W
      out.height = H
      const ctx = out.getContext('2d')
      if (!ctx) return null
      // 화면의 하늘빛과 같은 결 — 캔버스는 투명해서 그 뒤가 비친다
      const mix = (a: number[], b: number[]) => a.map((v, i) => Math.round(v + (b[i] - v) * dayNow)).join(',')
      const skyG = ctx.createLinearGradient(0, 0, 0, H)
      skyG.addColorStop(0, `rgb(${mix([6, 14, 26], [44, 72, 104])})`)
      skyG.addColorStop(1, `rgb(${mix([9, 19, 33], [70, 98, 126])})`)
      ctx.fillStyle = skyG
      ctx.fillRect(0, 0, W, H)
      const src = renderer.domElement
      const k = Math.max(W / src.width, H / src.height)
      const sw = W / k
      const sh = H / k
      ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, W, H)
      const fade = ctx.createLinearGradient(0, H * 0.52, 0, H)
      fade.addColorStop(0, 'rgba(7,17,31,0)')
      fade.addColorStop(0.55, 'rgba(7,17,31,0.82)')
      fade.addColorStop(1, 'rgba(7,17,31,0.96)')
      ctx.fillStyle = fade
      ctx.fillRect(0, H * 0.52, W, H * 0.48)
      const font = getComputedStyle(document.body).fontFamily || 'sans-serif'
      const X = 72
      let y = H - 330
      ctx.fillStyle = '#c7a36a'
      ctx.font = `700 24px ${font}`
      ctx.fillText(eyebrow.split('').join(String.fromCharCode(8202)), X, y)
      y += 64
      ctx.fillStyle = '#f3f5f8'
      ctx.font = `800 52px ${font}`
      // 제목은 두 줄까지 — 넘치면 말줄임
      const words = title.split(/\s+/)
      const rows: string[] = ['']
      for (const w of words) {
        const next = rows[rows.length - 1] ? `${rows[rows.length - 1]} ${w}` : w
        if (ctx.measureText(next).width > W - X * 2 && rows[rows.length - 1]) rows.push(w)
        else rows[rows.length - 1] = next
      }
      const shown = rows.slice(0, 2)
      if (rows.length > 2) shown[1] = `${shown[1].replace(/.$/, '')}…`
      for (const r of shown) {
        ctx.fillText(r, X, y)
        y += 64
      }
      ctx.fillStyle = 'rgba(232,237,242,0.86)'
      ctx.font = `600 30px ${font}`
      for (const l of lines) {
        y += 6
        ctx.fillText(l, X, y)
        y += 40
      }
      ctx.fillStyle = 'rgba(232,237,242,0.5)'
      ctx.font = `500 21px ${font}`
      ctx.fillText(footer, X, H - 56)
      return new Promise<Blob | null>(res => out.toBlob(b => res(b), 'image/png'))
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
