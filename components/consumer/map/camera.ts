/**
 * 벡터 지도의 카메라.
 *
 * 세 가지를 지킨다.
 *
 * 1) **움직임은 합성기(compositor)에서 돈다.** 지도가 다가가는 동안 메인 스레드는
 *    카카오 SDK 를 해석하고 React 가 깨어나느라 바쁘다. requestAnimationFrame 으로
 *    한 장씩 그리면 바로 그 순간에 끊긴다. 경로 전체를 미리 키프레임으로 뽑아
 *    Web Animations 에 넘기면 메인 스레드가 막혀도 60fps 로 흐른다. 움직이는 것은
 *    transform 하나뿐이다.
 *
 * 2) **목표점이 화면 가운데로 곧게 미끄러진다.** 가운데 좌표를 그대로 보간하면
 *    확대가 지수로 커지는 동안 목표가 휘어 들어오며 마지막에 휙 쏠린다. 목표점의
 *    "화면 위 위치"와 "확대의 로그"를 보간하면 목표가 곧은 선으로 오고 확대는
 *    일정한 체감 속도로 붙는다(지도 엔진들이 flyTo 에서 쓰는 방식).
 *
 * 3) **도중에 목적지가 바뀌어도 꺾이지 않는다.** 공고·SDK 가 도착하며 목적지가
 *    정확해진다. 그때 현재 위치·속도에서 이어지는 곡선(에르미트)으로 갈아탄다.
 */

export interface Camera {
  /** 화면 가운데에 올 경로 좌표 */
  x: number
  y: number
  /** 경로 1칸이 화면 몇 px 인가 */
  s: number
}

/**
 * 판 위의 배치. 세계 층(world)은 CSS 로 '전국이 다 보이게' 놓여 있고(서버가 그린
 * 첫 장면 그대로), 카메라는 그 위에 transform 만 더한다.
 */
export interface Geometry {
  /** 판 크기 */
  W: number
  H: number
  /** 세계 층의 왼쪽 위(판 기준) — transform-origin */
  ox: number
  oy: number
  /** transform 이 없을 때 경로 1칸의 px */
  s0: number
  /** transform 이 없을 때 경로 좌표 (0,0) 이 놓이는 판 위 자리 */
  bx: number
  by: number
}

type Curve = (t: number) => number

/**
 * 처음 출발 — 부드럽게 떠서 길게 내려앉는다. cubic-bezier(0.4, 0, 0.2, 1).
 * 꼬리를 너무 길게 끌지 않는다: 착지 0.52초 전(진행 92%, 아직 미끄러지는 중)에
 * 카카오가 이어받아 마지막 한 단을 당긴다.
 */
const FRESH = bezier(0.4, 0, 0.2, 1)

/** 현재 속도 v0(진행률/전체시간)에서 출발해 속도 0으로 닿는 곡선 */
function hermite(v0: number): Curve {
  const v = Math.max(0, Math.min(3, v0))
  return t => v * (t - 2 * t * t + t * t * t) + 3 * t * t - 2 * t * t * t
}

function bezier(x1: number, y1: number, x2: number, y2: number): Curve {
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx
  return x => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let t = x
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x
      const d = dx(t)
      if (Math.abs(e) < 1e-6 || Math.abs(d) < 1e-6) break
      t -= e / d
    }
    t = Math.max(0, Math.min(1, t))
    return ((ay * t + by) * t + cy) * t
  }
}

interface Flight {
  from: Camera
  to: Camera
  t0: number
  D: number
  curve: Curve
  anim: Animation | null
}

export function now() {
  const t = typeof document !== 'undefined' ? document.timeline?.currentTime : null
  return t == null ? performance.now() : Number(t)
}

export function transformFor(cam: Camera, g: Geometry) {
  const k = cam.s / g.s0
  const px = g.bx + cam.x * g.s0
  const py = g.by + cam.y * g.s0
  const tx = g.W / 2 - g.ox - k * (px - g.ox)
  const ty = g.H / 2 - g.oy - k * (py - g.oy)
  return `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${k.toFixed(5)})`
}

/** 경로 위의 한 순간. 목표점의 화면 위치는 곧게, 확대는 로그로 */
function along(f: Flight, p: number): Camera {
  const { from, to } = f
  const z0 = Math.log(from.s)
  const z1 = Math.log(to.s)
  const s = Math.exp(z0 + (z1 - z0) * p)
  // 시작할 때 목표점이 화면 가운데에서 얼마나 떨어져 있었나(px)
  const ux = (to.x - from.x) * from.s * (1 - p)
  const uy = (to.y - from.y) * from.s * (1 - p)
  return { x: to.x - ux / s, y: to.y - uy / s, s }
}

export class CameraRig {
  private el: HTMLElement
  private g: Geometry | null = null
  private flight: Flight | null = null
  private cam: Camera | null = null

  constructor(el: HTMLElement) {
    this.el = el
  }

  setGeometry(g: Geometry) {
    const prev = this.g
    this.g = g
    if (!prev) return
    // 판 크기가 바뀌면 같은 장면을 새 판에 다시 놓는다. 날고 있으면 남은 길을 새로 깐다
    const f = this.flight
    if (f && now() < f.t0 + f.D) this.flyTo(f.to, Math.max(240, f.t0 + f.D - now()))
    else if (this.cam) this.jump(this.cam)
  }

  get geometry() {
    return this.g
  }

  /** 지금 이 순간의 카메라 */
  current(t = now()): Camera | null {
    const f = this.flight
    if (!f) return this.cam
    const k = Math.max(0, Math.min(1, (t - f.t0) / f.D))
    return along(f, f.curve(k))
  }

  /** 지금 날아가는 목적지 */
  get destination(): Camera | null {
    return this.flight?.to ?? this.cam
  }

  /** 지금 비행이 끝나는 시각(타임라인 ms). 날고 있지 않으면 지금 */
  endTime() {
    const f = this.flight
    return f ? Math.max(now(), f.t0 + f.D) : now()
  }

  isFlying() {
    const f = this.flight
    return !!f && now() < f.t0 + f.D
  }

  jump(cam: Camera) {
    this.stop()
    this.cam = cam
    if (this.g) this.el.style.transform = transformFor(cam, this.g)
  }

  stop() {
    const f = this.flight
    if (!f) return
    const cam = this.current()
    this.flight = null
    f.anim?.cancel()
    if (cam) {
      this.cam = cam
      if (this.g) this.el.style.transform = transformFor(cam, this.g)
    }
  }

  /**
   * 목적지로 난다. 이미 날고 있으면 그 속도를 이어받는다.
   * `fresh` 면 정지 상태에서 출발하는 곡선(부드러운 출발 · 긴 감속)을 쓴다.
   */
  flyTo(to: Camera, duration: number, fresh = false) {
    const g = this.g
    const t = now()
    const from = this.current(t)
    if (!g || !from) {
      this.jump(to)
      return
    }
    let curve: Curve = fresh ? FRESH : hermite(0)
    const f0 = this.flight
    if (!fresh && f0 && t < f0.t0 + f0.D) {
      // 지금 속도를 새 길 위의 진행 속도로 옮긴다: 새 길에서 목표점이 화면 가운데로
      // 다가가는 속도와 확대 속도 중 큰 쪽을 기준으로 삼는다(둘 다 같은 길 위에 있다).
      const dt = 8
      const a = this.current(t - dt)!
      const b = from
      const dz = Math.log(to.s) - Math.log(b.s)
      const vz = (Math.log(b.s) - Math.log(a.s)) / dt
      // 새 목표점의 화면 위 거리(가운데 기준)
      const ub = Math.hypot((to.x - b.x) * b.s, (to.y - b.y) * b.s)
      const ua = Math.hypot((to.x - a.x) * a.s, (to.y - a.y) * a.s)
      const vu = (ua - ub) / dt
      let v = 0
      if (Math.abs(dz) > 0.02) v = (vz / dz) * duration
      else if (ub > 1) v = (vu / ub) * duration
      curve = hermite(v)
    }
    const flight: Flight = { from, to, t0: t, D: duration, curve, anim: null }
    const n = Math.max(2, Math.ceil(duration / 16.67) + 1)
    const frames: Keyframe[] = []
    for (let i = 0; i < n; i++) {
      frames.push({ transform: transformFor(along(flight, curve(i / (n - 1))), g) })
    }
    const prev = this.flight
    this.flight = flight
    this.cam = to
    // 끝난 뒤의 모습을 먼저 적어 둔다. 애니메이션이 지워져도 제자리에 남는다
    this.el.style.transform = transformFor(to, g)
    if (typeof this.el.animate !== 'function') {
      prev?.anim?.cancel()
      this.flight = null
      return
    }
    const anim = this.el.animate(frames, { duration, easing: 'linear', fill: 'backwards' })
    // 타임라인의 같은 순간에 맞춰 둔다 — 앞 비행과 이음매가 생기지 않는다
    try {
      anim.startTime = t
    } catch {
      /* 오래된 구현 — 다음 장부터 시작해도 한 장 차이다 */
    }
    flight.anim = anim
    prev?.anim?.cancel()
    anim.onfinish = () => {
      if (this.flight !== flight) return
      this.flight = null
      anim.cancel()
    }
  }

  destroy() {
    this.flight?.anim?.cancel()
    this.flight = null
  }
}

/** 두 카메라가 눈으로 구별되지 않을 만큼 가까운가 */
export function sameView(a: Camera, b: Camera, W: number, H: number) {
  if (Math.abs(Math.log(a.s / b.s)) > 0.01) return false
  const dx = (a.x - b.x) * a.s
  const dy = (a.y - b.y) * a.s
  return Math.hypot(dx, dy) < Math.max(1.5, Math.min(W, H) * 0.002)
}
