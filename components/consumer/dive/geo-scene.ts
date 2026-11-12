import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import { KOREA_MAP_VIEWBOX, KOREA_PROVINCES } from '@/lib/korea-map-data'

/**
 * 전국 지리 무대 — 평면 그림 대신 실제로 깊이가 있는 장면.
 *
 * 지금까지 대조를 마치지 않은 공고는 납작한 SVG 한 장을 받았다. 그것을 '3D 공간 탐험'이라
 * 부를 수 없다. 같은 행정 경계 자료를 쓰되 판으로 세우고, 카메라가 전국에서 그 지역으로
 * 내려가고, 자리를 아는 공고만 그 점에 표식을 세운다.
 *
 * 쓰는 자료는 이미 지면에서 쓰는 행정구역 경계 하나뿐이다. 지도 엔진을 새로 들이지 않는다.
 * 건물을 그리지 않는다 — 동 윤곽과 층수를 확인하지 않았기 때문이다. 세울 수 있는 것은
 * '어디인가'까지다.
 *
 * 좌표는 경계 그림과 같은 틀에 놓아야 겹친다. 대한민국 범위의 경위도를 SVG viewBox 로
 * 선형 대응시킨다 — 이 축척에서는 도법 차이가 표식 크기 안에 들어간다.
 */

/** 경계 그림이 그려진 경위도 범위 — @svg-maps/south-korea 의 틀에 맞춘 값 */
const BOUNDS = { west: 125.0, east: 131.0, south: 33.0, north: 38.7 }

export interface GeoSceneInput {
  /** 비출 광역의 코드. 없으면 전국을 보여 준다 */
  regionCode: string | null
  /** 표식을 세울 자리. 자리를 모르면 null */
  point: { lat: number; lng: number } | null
  /** 그 점을 '그 자리'로 짚어도 되는가 — 아니면 지역만 밝힌다 */
  pinpoint: boolean
  reducedMotion: boolean
}

export interface GeoScene {
  dispose: () => void
  /** 카메라를 처음 자리로 */
  reset: () => void
}

const COLOR = {
  base: 0x12212f,
  land: 0x1d3446,
  lit: 0xc7a36a,
  pin: 0xa83a20,
  halo: 0x55cdd2,
}

/** viewBox 의 x y w h */
function viewBox(): [number, number, number, number] {
  const [x, y, w, h] = KOREA_MAP_VIEWBOX.split(/[\s,]+/).map(Number)
  return [x, y, w, h]
}

/** 경위도 → 경계 그림의 좌표계 */
function project(lat: number, lng: number): { x: number; y: number } {
  const [vx, vy, vw, vh] = viewBox()
  const u = (lng - BOUNDS.west) / (BOUNDS.east - BOUNDS.west)
  const v = (BOUNDS.north - lat) / (BOUNDS.north - BOUNDS.south)
  return { x: vx + u * vw, y: vy + v * vh }
}

export function createGeoScene(canvas: HTMLCanvasElement, input: GeoSceneInput): GeoScene {
  const [vx, vy, vw, vh] = viewBox()
  const cx = vx + vw / 2
  const cy = vy + vh / 2
  /** 그림 좌표를 장면 단위로 — 전국이 대략 100 단위에 들어오게 */
  const S = 100 / vh

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)

  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(COLOR.base, 180, 420)

  const camera = new THREE.PerspectiveCamera(42, canvas.clientWidth / Math.max(1, canvas.clientHeight), 1, 900)

  scene.add(new THREE.AmbientLight(0xffffff, 1.5))
  const key = new THREE.DirectionalLight(0xfff3dd, 2.1)
  key.position.set(-60, 110, 70)
  scene.add(key)
  const rim = new THREE.DirectionalLight(0x55cdd2, 0.8)
  rim.position.set(80, 40, -60)
  scene.add(rim)

  /* ── 행정구역 판 ─────────────────────────────────────────
     같은 경계 자료를 shape 으로 바꿔 두께를 준다. 고른 지역만 한 단 높이 올리고
     금빛을 입힌다 — 높이가 뜻을 가지는 유일한 자리다(고른 곳인가 아닌가). */
  const group = new THREE.Group()
  const geoms: THREE.BufferGeometry[] = []
  const mats: THREE.Material[] = []

  for (const p of KOREA_PROVINCES) {
    const on = p.code === input.regionCode
    for (const shape of shapesOf(p.path)) {
      const geo = new THREE.ExtrudeGeometry(shape, { depth: on ? 7 : 3.2, bevelEnabled: false })
      geo.translate(-cx, -cy, 0)
      geo.scale(S, -S, S)
      geo.rotateX(-Math.PI / 2)
      const mat = new THREE.MeshStandardMaterial({
        color: on ? COLOR.lit : COLOR.land,
        roughness: on ? 0.42 : 0.9,
        metalness: on ? 0.3 : 0.05,
        emissive: on ? 0x3a2c12 : 0x000000,
      })
      geoms.push(geo)
      mats.push(mat)
      group.add(new THREE.Mesh(geo, mat))
    }
  }
  scene.add(group)

  /* ── 자리 표식 ───────────────────────────────────────────
     짚어도 되는 공고만 기둥을 세운다. 지역까지만 아는 공고는 지역 판의 금빛이 답이다. */
  const marks: THREE.Object3D[] = []
  if (input.point && input.pinpoint) {
    const { x, y } = project(input.point.lat, input.point.lng)
    const px = (x - cx) * S
    const pz = (y - cy) * S
    const pin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 16, 12),
      new THREE.MeshStandardMaterial({ color: COLOR.pin, emissive: 0x4a1408, roughness: 0.4 }),
    )
    pin.position.set(px, 14, pz)
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 3.4, 48),
      new THREE.MeshBasicMaterial({ color: COLOR.halo, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    )
    halo.rotation.x = -Math.PI / 2
    halo.position.set(px, 7.2, pz)
    scene.add(pin, halo)
    marks.push(pin, halo)
  }

  /* ── 카메라 ─────────────────────────────────────────────── */
  const target = new THREE.Vector3(0, 0, 0)
  if (input.regionCode) {
    const r = KOREA_PROVINCES.find(p => p.code === input.regionCode)
    if (r) {
      const b = pathCenter(r.path)
      target.set((b.x - cx) * S, 0, (b.y - cy) * S)
    }
  }
  if (input.point && input.pinpoint) {
    const { x, y } = project(input.point.lat, input.point.lng)
    target.set((x - cx) * S, 0, (y - cy) * S)
  }

  const near = new THREE.Vector3(target.x + 24, 46, target.z + 58)
  const far = new THREE.Vector3(0, 170, 150)
  camera.position.copy(input.reducedMotion ? near : far)
  camera.lookAt(target)

  const controls = new OrbitControls(camera, canvas)
  controls.target.copy(target)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 28
  controls.maxDistance = 320
  controls.maxPolarAngle = Math.PI / 2.15
  controls.update()

  /* 전국에서 그 지역으로 한 번 내려간다. 움직임 줄이기면 처음부터 도착해 있다 */
  let t0 = 0
  let flying = !input.reducedMotion
  const DUR = 1200
  const ease = (x: number) => 1 - Math.pow(1 - x, 3)

  let raf = 0
  const resize = () => {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  const ro = new ResizeObserver(resize)
  ro.observe(canvas)

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick)
    if (flying) {
      if (!t0) t0 = now
      const k = Math.min(1, (now - t0) / DUR)
      camera.position.lerpVectors(far, near, ease(k))
      camera.lookAt(controls.target)
      if (k >= 1) {
        flying = false
        controls.update()
      }
    } else {
      controls.update()
    }
    for (const m of marks) if (m instanceof THREE.Mesh && m.geometry instanceof THREE.RingGeometry) m.rotation.z += 0.004
    renderer.render(scene, camera)
  }
  raf = requestAnimationFrame(tick)

  const onVis = () => {
    if (document.hidden) {
      cancelAnimationFrame(raf)
      raf = 0
    } else if (!raf) raf = requestAnimationFrame(tick)
  }
  document.addEventListener('visibilitychange', onVis)

  return {
    reset() {
      flying = !input.reducedMotion
      t0 = 0
      controls.target.copy(target)
      camera.position.copy(input.reducedMotion ? near : far)
      controls.update()
    },
    dispose() {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVis)
      ro.disconnect()
      controls.dispose()
      for (const g of geoms) g.dispose()
      for (const m of mats) m.dispose()
      for (const m of marks) {
        if (m instanceof THREE.Mesh) {
          m.geometry.dispose()
          ;(m.material as THREE.Material).dispose()
        }
      }
      renderer.dispose()
      // 창을 여러 번 여닫아도 WebGL 맥락이 쌓이지 않게 한다
      renderer.forceContextLoss()
    },
  }
}

/* ── SVG path → Shape ────────────────────────────────────────
   SVGLoader 는 문서를 파싱한다. 우리에게는 d 문자열 하나뿐이라 문서를 만들어 맡긴다 —
   경로 문법(곡선·호)을 직접 다시 구현하지 않으려는 것이다. 한 번 만든 결과는 모아 둔다. */
const SHAPE_CACHE = new Map<string, THREE.Shape[]>()

function shapesOf(d: string): THREE.Shape[] {
  const hit = SHAPE_CACHE.get(d)
  if (hit) return hit
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${KOREA_MAP_VIEWBOX}"><path d="${d}"/></svg>`
  const data = new SVGLoader().parse(svg)
  const out = data.paths.flatMap(p => SVGLoader.createShapes(p))
  SHAPE_CACHE.set(d, out)
  return out
}

/** 경로의 대략 가운데 — 카메라가 바라볼 자리 */
function pathCenter(d: string): { x: number; y: number } {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${KOREA_MAP_VIEWBOX}"><path d="${d}"/></svg>`
  const data = new SVGLoader().parse(svg)
  const box = new THREE.Box2()
  for (const p of data.paths)
    for (const sp of p.subPaths)
      for (const pt of sp.getPoints(16)) box.expandByPoint(new THREE.Vector2(pt.x, pt.y))
  const c = box.getCenter(new THREE.Vector2())
  return { x: c.x, y: c.y }
}
