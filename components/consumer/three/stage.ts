import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

/**
 * 입체 장면 둘(첫 화면 지도 · 공사 중인 도시)이 함께 쓰는 무대.
 *
 * 무대가 맡는 일
 * - 렌더러·카메라·빛 번짐(bloom)·환경광
 * - 크기 맞추기(ResizeObserver) — 캔버스는 평면 그림이 있던 칸을 그대로 채운다
 * - 쉬기 — 화면 밖(IntersectionObserver)이거나 탭이 숨으면 그리기를 멈춘다
 * - 품질 낮추기 — 프레임이 밀리면 해상도·번짐·그림자 순으로 덜어 낸다
 * - 치우기 — 내릴 때 기하·재질·텍스처·렌더 타깃·맥락까지 돌려준다
 *
 * 장면은 onFrame 에서 움직임만 계산한다. 그리는 것은 무대가 한다.
 */

export interface StageOptions {
  host: HTMLElement
  /** 뒤 유리판이 비쳐 보여야 하면 true */
  transparent?: boolean
  background?: THREE.ColorRepresentation
  fov?: number
  exposure?: number
  bloom?: { strength: number; radius: number; threshold: number } | null
  shadows?: boolean
  /** 환경광 세기. 0 이면 쓰지 않는다 */
  environment?: number
  onResize?: (w: number, h: number) => void
  onFrame: (dt: number, t: number) => void
  onLost?: () => void
}

export interface Stage {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  canvas: HTMLCanvasElement
  size: () => { w: number; h: number }
  /** 지금 보이는가 — 장면이 DOM 글자표를 옮길지 정할 때 쓴다 */
  isRunning: () => boolean
  dispose: () => void
}

/** 무대 아래 모든 것을 돌려준다 — 기하, 재질, 재질이 쥔 텍스처까지 */
export function disposeObject(root: THREE.Object3D) {
  const seen = new Set<object>()
  const dropTexture = (v: unknown) => {
    if (v && v instanceof THREE.Texture && !seen.has(v)) {
      seen.add(v)
      v.dispose()
    }
  }
  const dropMaterial = (m: THREE.Material) => {
    if (seen.has(m)) return
    seen.add(m)
    for (const value of Object.values(m)) dropTexture(value)
    const uniforms = (m as THREE.ShaderMaterial).uniforms
    if (uniforms) for (const u of Object.values(uniforms)) dropTexture(u?.value)
    m.dispose()
  }
  root.traverse(obj => {
    const o = obj as THREE.Mesh
    if (o.geometry && !seen.has(o.geometry)) {
      seen.add(o.geometry)
      o.geometry.dispose()
    }
    const mat = o.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) mat.forEach(dropMaterial)
    else if (mat) dropMaterial(mat)
  })
}

/*
 * 품질 사다리. 앞에서부터 덜어 낸다 — 해상도를 먼저 낮추고, 번짐, 그림자 순.
 * 한 번 내려가면 다시 올리지 않는다(오르내리며 깜빡이는 것이 더 나쁘다).
 */
const LADDER = [
  { dpr: 2, bloom: true, shadows: true },
  { dpr: 1.5, bloom: true, shadows: true },
  { dpr: 1.25, bloom: false, shadows: true },
  { dpr: 1, bloom: false, shadows: false },
  { dpr: 0.75, bloom: false, shadows: false },
]

export function createStage(opts: StageOptions): Stage {
  const { host } = opts
  const renderer = new THREE.WebGLRenderer({
    // 번짐을 끄면 화면에 바로 그린다 — 그때도 가장자리가 계단지지 않게
    antialias: true,
    alpha: !!opts.transparent,
    powerPreference: 'high-performance',
    stencil: false,
  })
  const canvas = renderer.domElement
  canvas.className = 'cs3d-canvas'
  canvas.setAttribute('aria-hidden', 'true')
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = opts.exposure ?? 1
  if (opts.transparent) renderer.setClearColor(0x000000, 0)
  else renderer.setClearColor(new THREE.Color(opts.background ?? 0x0b0e14), 1)
  renderer.shadowMap.enabled = !!opts.shadows
  renderer.shadowMap.type = THREE.PCFShadowMap

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(opts.fov ?? 32, 1, 0.1, 200)

  let pmrem: THREE.PMREMGenerator | null = null
  let envRT: THREE.WebGLRenderTarget | null = null
  if (opts.environment) {
    pmrem = new THREE.PMREMGenerator(renderer)
    const room = new RoomEnvironment()
    envRT = pmrem.fromScene(room, 0.04)
    room.dispose()
    scene.environment = envRT.texture
    scene.environmentIntensity = opts.environment
  }

  /* ── 빛 번짐 — 반만 한 해상도에서 흐린 뒤 더한다 ─────────── */
  let composer: EffectComposer | null = null
  let bloomPass: UnrealBloomPass | null = null
  if (opts.bloom) {
    const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 })
    composer = new EffectComposer(renderer, rt)
    composer.addPass(new RenderPass(scene, camera))
    bloomPass = new UnrealBloomPass(new THREE.Vector2(2, 2), opts.bloom.strength, opts.bloom.radius, opts.bloom.threshold)
    composer.addPass(bloomPass)
    composer.addPass(new OutputPass())
  }

  host.appendChild(canvas)

  let w = 0
  let h = 0
  let level = 0
  const deviceDpr = Math.min(window.devicePixelRatio || 1, 2)
  /*
   * 점검용 — ?3d=max 이면 품질을 내리지 않는다. ?3d=debug 는 거기에 더해 한 장마다
   * 시간을 0.2초씩 민다(느린 소프트웨어 렌더러에서도 장면의 끝 모습을 볼 수 있게).
   */
  const qa = new URLSearchParams(window.location.search).get('3d')
  const pinned = qa === 'max' || qa === 'debug'
  const step = qa === 'debug' ? 0.2 : 0

  function applyQuality() {
    const q = LADDER[level]
    const dpr = Math.min(deviceDpr, q.dpr)
    renderer.setPixelRatio(dpr)
    if (composer) composer.setPixelRatio(dpr)
    if (bloomPass) bloomPass.enabled = q.bloom
    if (opts.shadows && renderer.shadowMap.enabled !== q.shadows) {
      renderer.shadowMap.enabled = q.shadows
      // 그림자를 끄고 켜면 재질을 다시 엮어야 한다
      scene.traverse(o => {
        const m = (o as THREE.Mesh).material
        if (Array.isArray(m)) m.forEach(x => (x.needsUpdate = true))
        else if (m) m.needsUpdate = true
      })
    }
    if (w && h) resize(w, h)
  }

  function resize(nw: number, nh: number) {
    w = Math.max(1, Math.round(nw))
    h = Math.max(1, Math.round(nh))
    renderer.setSize(w, h, false)
    composer?.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    opts.onResize?.(w, h)
  }

  /* ── 그리기 ─────────────────────────────────────────── */
  let raf = 0
  let last = 0
  let elapsed = 0
  let visible = false
  let lost = false
  let disposed = false
  const samples: number[] = []
  let warm = 0

  function render() {
    if (composer && bloomPass?.enabled) composer.render()
    else renderer.render(scene, camera)
  }

  function measure(dtMs: number) {
    if (pinned || level >= LADDER.length - 1) return
    // 처음 몇 장은 셰이더를 엮느라 늘 느리다 — 세지 않는다
    if (warm < 24) {
      warm++
      return
    }
    samples.push(dtMs)
    // 아주 느리면(초당 20장 아래) 열두 장만 보고 바로 덜어 낸다 — 버벅이는 몇 초를 줄인다
    if (samples.length < 12) return
    const sorted = samples.slice().sort((a, b) => a - b)
    const median = sorted[sorted.length >> 1]
    if (samples.length < 50 && median <= 50) return
    samples.length = 0
    if (median > 25) {
      level++
      warm = 12
      applyQuality()
    }
  }

  function frame(now: number) {
    raf = requestAnimationFrame(frame)
    const dtMs = now - last
    last = now
    // 한 장이 늦어도 0.1초 넘게 건너뛰지 않는다 — 느린 기기에서도 움직임이 끊겨 튀지 않게
    const dt = step || Math.min(0.1, Math.max(0, dtMs / 1000))
    elapsed += dt
    opts.onFrame(dt, elapsed)
    render()
    measure(dtMs)
  }

  function sync() {
    const should = visible && !document.hidden && !lost && !disposed && w > 0
    if (should && !raf) {
      last = performance.now()
      warm = Math.min(warm, 12)
      samples.length = 0
      raf = requestAnimationFrame(frame)
    } else if (!should && raf) {
      cancelAnimationFrame(raf)
      raf = 0
    }
  }

  const ro = new ResizeObserver(entries => {
    const r = entries[0]?.contentRect
    if (!r || r.width < 2 || r.height < 2) return
    if (Math.round(r.width) === w && Math.round(r.height) === h) return
    resize(r.width, r.height)
    // 멈춰 있어도 크기가 바뀐 그림 한 장은 남긴다
    if (!raf) {
      opts.onFrame(0, elapsed)
      render()
    }
    sync()
  })
  ro.observe(host)

  const io = new IntersectionObserver(
    ([e]) => {
      visible = e.isIntersecting
      sync()
    },
    { rootMargin: '80px' },
  )
  io.observe(host)

  const onVis = () => sync()
  document.addEventListener('visibilitychange', onVis)

  const onLost = (e: Event) => {
    e.preventDefault()
    lost = true
    sync()
    opts.onLost?.()
  }
  canvas.addEventListener('webglcontextlost', onLost)

  applyQuality()

  return {
    renderer,
    scene,
    camera,
    canvas,
    size: () => ({ w, h }),
    isRunning: () => raf !== 0,
    dispose() {
      if (disposed) return
      disposed = true
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      canvas.removeEventListener('webglcontextlost', onLost)
      disposeObject(scene)
      if (scene.background instanceof THREE.Texture) scene.background.dispose()
      envRT?.dispose()
      pmrem?.dispose()
      if (composer) {
        for (const pass of composer.passes) pass.dispose()
        composer.dispose()
      }
      renderer.dispose()
      if (!lost) renderer.forceContextLoss()
      canvas.remove()
    },
  }
}
