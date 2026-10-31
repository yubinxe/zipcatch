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
  /**
   * 톤 매핑. ACES 는 밝은 주황을 복숭아빛으로 바래게 한다 — 브랜드 주황이 그대로
   * 남아야 하는 장면은 'neutral'(Khronos PBR Neutral)을 쓴다. 기본 'aces'.
   */
  tone?: 'aces' | 'neutral'
  bloom?: { strength: number; radius: number; threshold: number } | null
  shadows?: boolean
  /** 환경광 세기. 0 이면 쓰지 않는다 */
  environment?: number
  /**
   * 환경광의 모양. 'night' 는 먹빛 하늘에 지평선만 도시 불빛으로 달아 있는 밤 —
   * 유리와 윗면에 실내 조명(스튜디오) 대신 밤하늘이 비친다. 기본 'room'.
   */
  envKind?: 'room' | 'night'
  /**
   * 전면 장면(단지 탐험처럼 화면을 덮는 것) — 살아 있는 동안 다른 무대는 모두 쉰다.
   * 덮인 지도들이 보이지 않는 채로 GPU 를 나눠 쓰지 않게.
   */
  exclusive?: boolean
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

/**
 * 밤의 환경광 — 반사에만 쓰는 보이지 않는 하늘.
 * 위는 먹빛, 지평선은 도시 불빛으로 낮게 달아 있고, 북서쪽 높이에 달빛 판 하나.
 * 유리 외벽과 윗면이 이 하늘을 비춰 밤의 결을 얻는다(실내 조명이 비친 회색 판이 되지 않게).
 */
function nightEnvironment(): THREE.Scene {
  const scene = new THREE.Scene()
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(40, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          float y = vDir.y;
          vec3 zenith = vec3(0.006, 0.009, 0.02);
          vec3 sky = vec3(0.016, 0.022, 0.045);
          vec3 city = vec3(0.62, 0.2, 0.05);
          vec3 ground = vec3(0.012, 0.009, 0.008);
          vec3 c = mix(sky, zenith, smoothstep(0.1, 0.8, y));
          // 지평선의 도시 불빛 — 얇고 따뜻하게, 아래로는 금세 어두워진다
          // 제곱은 곱으로 — pow(음수, 2.0) 은 GPU 에 따라 NaN 이고, 이 하늘은 반사(환경 맵)로 장면 전체에 묻는다
          float by = (y - 0.02) / 0.09;
          float band = exp(-by * by);
          c += city * band;
          if (y < -0.02) c = mix(c, ground, smoothstep(-0.02, -0.25, y));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  )
  scene.add(dome)
  // 달빛 판 — 윗면 유광에 길게 비치는 차가운 빛
  const moon = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.66, 1.0).multiplyScalar(1.6), side: THREE.DoubleSide }),
  )
  moon.position.set(-12, 22, -16)
  moon.lookAt(0, 0, 0)
  scene.add(moon)
  // 지평선 너머의 따뜻한 빛 판 둘 — 외벽 아래쪽에 주황 결을 남긴다
  for (const [x, z, w] of [
    [16, -26, 22],
    [-22, 14, 14],
  ] as const) {
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(w, 2.2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.42, 0.14).multiplyScalar(2.2), side: THREE.DoubleSide }),
    )
    glow.position.set(x, 1.4, z)
    glow.lookAt(0, 1.4, 0)
    scene.add(glow)
  }
  return scene
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

/* 살아 있는 무대들 — 전면 무대가 서면 나머지를 쉬게 한다 */
const live = new Set<{ exclusive: boolean; sync: () => void }>()
let exclusiveCount = 0

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
  renderer.toneMapping = opts.tone === 'neutral' ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping
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
    if (opts.envKind === 'night') {
      const night = nightEnvironment()
      envRT = pmrem.fromScene(night, 0.02)
      disposeObject(night)
    } else {
      const room = new RoomEnvironment()
      envRT = pmrem.fromScene(room, 0.04)
      room.dispose()
    }
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
  /*
   * 처음 품질 — 손가락으로 쓰는 작은 화면·적은 코어는 한 칸 아래에서 시작한다. 처음 몇 초를
   * 버벅인 뒤에야 내려가지 않게. 이후는 그대로 실측(measure)이 정한다.
   */
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
  const cores = navigator.hardwareConcurrency || 8
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
  let level = coarse || cores <= 4 || memory <= 4 ? 1 : 0
  const deviceDpr = Math.min(window.devicePixelRatio || 1, 2)
  /*
   * 점검용 — ?3d=max 이면 품질을 내리지 않는다. ?3d=debug 는 거기에 더해 한 장마다
   * 시간을 0.2초씩 민다(느린 소프트웨어 렌더러에서도 장면의 끝 모습을 볼 수 있게).
   */
  const qa = new URLSearchParams(window.location.search).get('3d')
  const pinned = qa === 'max' || qa === 'debug'
  const step = qa === 'debug' ? 0.2 : 0
  if (pinned) level = 0

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
  /*
   * 처음 몇 장은 셰이더를 엮느라 늘 느리다 — 세지 않는다. 장 수로만 세면 한 장에
   * 0.5초씩 걸리는 기기는 열몇 초를 버벅인 뒤에야 덜어 내기 시작한다. 그래서
   * '네 장을 넘기고, 스물네 장 또는 정해진 시간 중 먼저 오는 쪽'까지만 쉰다.
   */
  let warm = 0
  let warmUntil = 0
  function rewarm(ms: number) {
    warm = 0
    warmUntil = performance.now() + ms
  }

  function render() {
    if (composer && bloomPass?.enabled) composer.render()
    else renderer.render(scene, camera)
  }

  /** 이 기기에서 실제로 쓰이는 품질 — 같은 값이면 단계가 달라도 그리는 것은 같다 */
  function effective(i: number) {
    const q = LADDER[i]
    return `${Math.min(deviceDpr, q.dpr)}|${q.bloom && !!composer}|${q.shadows && !!opts.shadows}`
  }

  function measure(dtMs: number, now: number) {
    if (pinned || level >= LADDER.length - 1) return
    if (warm < 4 || (warm < 24 && now < warmUntil)) {
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
      // 많이 밀리면(초당 12장·22장 아래) 한 칸씩 내려가며 몇 초를 더 버벅이지 않고 한 번에 건너뛴다
      const from = effective(level)
      level = Math.min(LADDER.length - 1, level + (median > 80 ? 3 : median > 45 ? 2 : 1))
      // 이 기기에서 아무것도 달라지지 않는 칸(예: 화면 배율 1 에서 2 → 1.5)은 건너뛴다
      while (level < LADDER.length - 1 && effective(level) === from) level++
      // 낮춘 뒤 몇 장은 셰이더를 다시 엮는다 — 그 장들로 또 낮추지 않게
      rewarm(500)
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
    measure(dtMs, now)
  }

  /*
   * 셰이더는 그리기 전에 미리, 가능하면 나란히(KHR_parallel_shader_compile) 엮는다.
   * 첫 장을 그리면서 엮으면 그동안 페이지 전체가 멈칫한다 — 스크롤 중이면 더 눈에 띈다.
   */
  let compiled = false
  let compiling = false
  function warmUp() {
    if (compiling || compiled) return
    // 나란히 엮을 수 없는 브라우저(사파리 등)는 기다릴 것이 없다 — 바로 그린다
    if (!renderer.extensions.has('KHR_parallel_shader_compile')) {
      compiled = true
      sync()
      return
    }
    compiling = true
    // 번짐을 쓰면 장면은 화면이 아니라 중간 판(렌더 타깃)에 그려진다 — 셰이더도 그 판에 맞는 갈래로 엮는다
    if (composer && bloomPass?.enabled) renderer.setRenderTarget(composer.readBuffer)
    const ready = renderer.compileAsync(scene, camera)
    renderer.setRenderTarget(null)
    ready
      .catch(() => {})
      .finally(() => {
        compiling = false
        compiled = true
        sync()
      })
  }

  function sync() {
    const covered = exclusiveCount > 0 && !opts.exclusive
    const should = visible && !covered && !document.hidden && !lost && !disposed && w > 0
    if (should && !compiled) {
      warmUp()
      return
    }
    if (should && !raf) {
      last = performance.now()
      // 다시 보일 때(스크롤·탭 전환) 첫 몇 장은 늘 들쭉날쭉하다
      if (warm >= 4) rewarm(400)
      else warmUntil = Math.max(warmUntil, last + 1200)
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
    // 멈춰 있어도 크기가 바뀐 그림 한 장은 남긴다(셰이더를 다 엮은 뒤에만 — 아니면 여기서 멈칫한다)
    if (!raf && compiled) {
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
  const me = { exclusive: !!opts.exclusive, sync: () => sync() }
  live.add(me)
  if (me.exclusive) {
    exclusiveCount++
    live.forEach(o => o !== me && o.sync())
  }

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
      live.delete(me)
      if (me.exclusive) {
        exclusiveCount--
        live.forEach(o => o.sync())
      }
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
