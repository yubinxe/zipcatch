'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { KOREA_PROVINCES, KOREA_VISUAL_VIEWBOX, pathBBox } from '@/lib/korea-map-data'
import { KOREA_SILHOUETTE } from '../three/korea-silhouette'
import { CameraRig, now, sameView, type Camera, type Geometry } from './camera'
import {
  MAX_VECTOR_SCALE,
  introStartLevel,
  kakaoMetersPerPixel,
  metersPerUnit,
  predictKakaoView,
  project,
  type LatLng,
} from './projection'

/**
 * 지도 화면의 첫 장면 — 나라 전체에서 공고가 있는 곳으로 다가가 카카오 지도로 이어진다.
 *
 *   0ms      서버가 그린 윤곽(5KB)이 판 위에 이미 서 있다. 깨어나면 열일곱 광역의
 *            경계가 같은 자리에 들어선다(움직이기 전이라 바뀌는 게 보이지 않는다).
 *   +120ms   판이 눈에 들어와 있고 판을 담은 그릇이 거의 내려앉았으면 다가가기 시작한다.
 *            1.5초, cubic-bezier(0.4, 0, 0.2, 1). 목표점은 곧게, 확대는 로그로.
 *            목적지는 처음엔 짐작(공고 범위로 카카오 setBounds 가 고를 화면을 계산)이고,
 *            카카오 지도가 서는 순간 그 지도의 실제 범위(getBounds)로 바로잡는다.
 *            속도를 이어받아 갈아타므로 꺾이지 않는다.
 *   착지 −520ms  카카오의 타일이 다 와 있으면(tilesloaded) 넘긴다. 벡터는 진행 92%,
 *            아직 미끄러지는 중이다. 아래의 카카오 지도는 한 단 넓게, 벡터가 가던
 *            바로 그 자리에 서 있다. 이 순간 세 가지가 함께 시작한다:
 *              · 카카오가 마지막 한 단을 직접 당긴다(setLevel animate, 720ms)
 *              · 벡터도 지금 속도를 이어받아 같은 곳으로 당겨진다(잔상이 어긋나지 않게)
 *              · 벡터가 걷힌다(opacity, 500ms)
 *            멈췄다 다시 가는 두 동작이 아니라, 미끄러지던 카메라가 실제 지도 위에서
 *            마저 내려앉는 한 동작으로 읽힌다.
 *
 * 카카오가 늦으면 벡터는 착지한 채 기다린다(아래의 진행 표시가 무엇을 기다리는지 말한다).
 * 카카오를 열지 못하면 벡터 지도가 그대로 남아 범위와 공고 위치를 보여 준다.
 * 움직임을 줄여 달라고 한 브라우저에서는 날지 않고 마지막 장면을 바로 보여 준다.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type KakaoNS = any

const BEAT = 120
const FLY = 1500
const FADE = 500
/** 착지 이만큼 전에 넘긴다 — 벡터가 아직 미끄러지는 중이어야 멈췄다 다시 가는 두 동작이 되지 않는다 */
const HANDOFF_LEAD = 520
const KAKAO_ZOOM = 720
const TILE_TIMEOUT = 6000
const SKIP_FADE = 200

export interface IntroPin {
  lat: number
  lng: number
  kind: 'SALE' | 'RENT'
  hot: boolean
}

export interface IntroAim {
  /** 처음 화면에 담을 공고 위치(카카오 setBounds 에 넘기는 것과 같은 것) */
  points: LatLng[]
  /** 공고가 없을 때의 자리 */
  center: LatLng
  level: number
  /** 공고 목록이 도착했는가 — 아직이면 points 가 비어 있는 것은 '없음'이 아니라 '모름'이다 */
  settled: boolean
}

/**
 * 카카오 지도를 벡터에 넘겨주는 데 필요한 것.
 *
 * 타일 도착(tilesloaded)은 지도를 만든 바로 그 자리에서 듣기 시작해야 한다. 화면이
 * 한 번 더 그려진 뒤에 들으면, 캐시에서 타일이 먼저 와 버린 경우 영영 못 듣는다.
 */
export interface Handoff {
  kakao: KakaoNS
  map: KakaoNS
  /** 최종 level — 카카오가 마지막에 당겨 갈 곳 */
  level: number
  /** 첫 타일이 다 오면 부른다(이미 왔으면 곧바로). 돌려준 함수로 그만 듣는다 */
  whenTiles: (cb: () => void) => () => void
}

export function createHandoff(kakao: KakaoNS, map: KakaoNS, level: number): Handoff {
  let loaded = false
  let waiting: (() => void) | null = null
  const once = () => {
    loaded = true
    try {
      kakao.maps.event.removeListener(map, 'tilesloaded', once)
    } catch {
      /* 한 번 더 불려도 해가 없다 */
    }
    waiting?.()
  }
  kakao.maps.event.addListener(map, 'tilesloaded', once)
  return {
    kakao,
    map,
    level,
    whenTiles(cb) {
      if (loaded) {
        queueMicrotask(cb)
        return () => {}
      }
      waiting = cb
      return () => {
        if (waiting === cb) waiting = null
      }
    },
  }
}

/** 움직임을 줄여 달라고 했는가 */
export function prefersReducedMotion() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export { introStartLevel }

const VB = (() => {
  const [x, y, w, h] = KOREA_VISUAL_VIEWBOX.split(/\s+/).map(Number)
  return { x, y, w, h }
})()

const PROVINCE_BOX = Object.fromEntries(KOREA_PROVINCES.map(p => [p.id, pathBBox(p.path)]))

/** 위경도 격자 — 메르카토르라 곧은 선이다. 다가갈 때 깊이를 준다 */
const GRID = (() => {
  const top = project(39.6, 124).y
  const bottom = project(32.6, 124).y
  const left = project(36, 123.4).x
  const right = project(36, 132.2).x
  const lines: string[] = []
  for (let lat = 33; lat <= 39; lat++) {
    const y = project(lat, 127).y.toFixed(1)
    lines.push(`M${left.toFixed(1)} ${y}H${right.toFixed(1)}`)
  }
  for (let lng = 124; lng <= 132; lng++) {
    const x = project(36, lng).x.toFixed(1)
    lines.push(`M${x} ${top.toFixed(1)}V${bottom.toFixed(1)}`)
  }
  return lines.join('')
})()

/**
 * 판을 담은 그릇이 아직 떠오르는 중이면(화면의 들어서는 장면) 거의 내려앉을 때까지
 * 기다린다. 두 움직임이 처음부터 겹치면 어느 쪽도 읽히지 않는다. 끝 무렵 300ms 는
 * 겹쳐 둔다 — 판이 자리 잡는 순간 카메라가 출발해야 이어진 한 장면이 된다.
 */
function settleDelay(el: HTMLElement) {
  let wait = 0
  for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
    for (const anim of a.getAnimations?.() ?? []) {
      const t = anim.effect?.getComputedTiming()
      if (!t || anim.playState !== 'running') continue
      const left = Number(t.endTime ?? 0) - Number(t.localTime ?? 0)
      if (Number.isFinite(left)) wait = Math.max(wait, left)
    }
  }
  return Math.max(0, Math.min(1000, wait - 300))
}

function overview(g: Geometry): Camera {
  return { x: VB.x + VB.w / 2, y: VB.y + VB.h / 2, s: g.s0 }
}

/** 카카오가 열 화면(의 한 단 넓은 쪽)을 벡터 카메라로 */
function aimCamera(aim: IntroAim, g: Geometry, reduced: boolean): Camera {
  const view = predictKakaoView(aim.points, { center: aim.center, level: aim.level }, g.W, g.H)
  /*
   * 공고가 아직 안 왔으면 두 단 더 넓은 데까지만 다가간다. 짐작대로 깊이 들어갔다가
   * 공고가 오고 나서 도로 물러나면 카메라가 헛디딘 것처럼 보인다. 덜 들어가 있으면
   * 고쳐 잡는 움직임도 '계속 다가가는' 쪽이 된다.
   */
  const level = Math.min(14, introStartLevel(view.level, view.center.lat, reduced) + (aim.settled ? 0 : 2))
  const p = project(view.center.lat, view.center.lng)
  const s = metersPerUnit(view.center.lat) / kakaoMetersPerPixel(level)
  return { x: p.x, y: p.y, s: Math.max(g.s0, Math.min(MAX_VECTOR_SCALE, s)) }
}

/** 카카오 지도가 지금 보여 주는 범위 그대로 — 넘기는 순간 두 그림이 겹친다 */
function exactCamera(map: KakaoNS, g: Geometry): Camera {
  const c = map.getCenter()
  const pc = project(c.getLat(), c.getLng())
  try {
    const b = map.getBounds()
    const sw = b.getSouthWest()
    const ne = b.getNorthEast()
    const p1 = project(sw.getLat(), sw.getLng())
    const p2 = project(ne.getLat(), ne.getLng())
    const sx = g.W / (p2.x - p1.x)
    const sy = g.H / (p1.y - p2.y)
    if (Number.isFinite(sx) && Number.isFinite(sy) && sx > 0 && sy > 0) {
      return { x: pc.x, y: pc.y, s: Math.sqrt(sx * sy) }
    }
  } catch {
    /* 범위가 아직 0 인 순간 — 아래 계산으로 */
  }
  return { x: pc.x, y: pc.y, s: metersPerUnit(c.getLat()) / kakaoMetersPerPixel(map.getLevel()) }
}

interface Area {
  x: number
  y: number
  w: number
  h: number
}

/**
 * 판 위에 무언가(이유를 적은 카드)가 얹혀 있으면, 그것을 피한 가장 넓은 빈 곳.
 * 지도를 카드 밑에 깔아 두면 정작 보여 줄 곳이 가려진다.
 */
function freeArea(root: HTMLElement, g: Geometry): Area {
  const full = { x: 0, y: 0, w: g.W, h: g.H }
  const card = root.parentElement?.querySelector<HTMLElement>('[data-mi-avoid]')
  if (!card) return full
  const a = root.getBoundingClientRect()
  const c = card.getBoundingClientRect()
  const x = c.left - a.left
  const y = c.top - a.top
  // 겹치지 않으면(좁은 판에서 카드가 아래로 내려간 경우) 판 전체를 쓴다
  if (y >= g.H - 1 || x >= g.W - 1 || c.width === 0) return full
  const left = { x: 0, y: 0, w: Math.max(0, x - 8), h: g.H }
  const top = { x: 0, y: 0, w: g.W, h: Math.max(0, y - 8) }
  // 나라는 세로로 길다 — 같은 넓이면 옆으로 비킨 쪽이 낫다
  return left.w * Math.min(left.h, left.w * 1.5) >= top.h * Math.min(top.w, top.h * 1.5) ? left : top
}

/** 지도를 열지 못했을 때: 고른 범위의 시도가 빈 곳에 다 들어오게(그 범위의 공고는 그 시도 안에 있다) */
function fallbackCamera(highlight: string[], g: Geometry, area: Area): Camera {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const id of highlight) {
    const b = PROVINCE_BOX[id]
    if (!b) continue
    x0 = Math.min(x0, b.x)
    y0 = Math.min(y0, b.y)
    x1 = Math.max(x1, b.x + b.width)
    y1 = Math.max(y1, b.y + b.height)
  }
  if (!Number.isFinite(x0)) {
    x0 = VB.x
    y0 = VB.y
    x1 = VB.x + VB.w
    y1 = VB.y + VB.h
  }
  const s = Math.max(
    g.s0 * 0.6,
    Math.min((area.w * 0.84) / Math.max(1, x1 - x0), (area.h * 0.84) / Math.max(1, y1 - y0), 16),
  )
  // 범위의 가운데가 빈 곳의 가운데에 오도록 카메라(판 가운데)를 옮긴다
  const ax = area.x + area.w / 2 - g.W / 2
  const ay = area.y + area.h / 2 - g.H / 2
  return { x: (x0 + x1) / 2 - ax / s, y: (y0 + y1) / 2 - ay / s, s }
}

export default function MapIntro({
  mode,
  aim,
  highlight,
  pins,
  handoff,
  skip,
  onDone,
}: {
  mode: 'intro' | 'fallback'
  aim: IntroAim
  /** 고른 범위의 시도(@svg-maps id) — 살짝 밝힌다 */
  highlight: string[]
  pins: IntroPin[]
  handoff: Handoff | null
  /** 값이 바뀌면 남은 장면을 건너뛴다(범위를 바꿨을 때) */
  skip: number
  onDone: () => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const rigRef = useRef<CameraRig | null>(null)
  const reducedRef = useRef(false)
  const startedRef = useRef(false)
  const desiredRef = useRef<Camera | null>(null)
  const scheduledRef = useRef(false)
  const pendingRef = useRef(false)
  const doneRef = useRef(false)
  const scheduleRef = useRef<(() => void) | null>(null)
  const skipRef = useRef<((land: boolean) => void) | null>(null)
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  const [geom, setGeom] = useState(0)
  /** 목적지의 축척 — 공고 점의 크기를 거기에 맞춘다(착지했을 때 3px 남짓) */
  const [destS, setDestS] = useState(1)
  /*
   * 열일곱 광역의 경로(약 80KB)는 문서에 굽지 않는다(HeroAtlas 와 같은 이유).
   * 서버는 5KB 윤곽을 그리고, 깨어나면 같은 자리에 경계가 들어선다.
   */
  const [drawn, setDrawn] = useState(false)

  // 판을 재고 카메라를 세운다. 처음 장면은 CSS 가 이미 그려 둔 그대로(transform 없음)다.
  useEffect(() => {
    const root = rootRef.current
    const world = worldRef.current
    if (!root || !world) return
    reducedRef.current = prefersReducedMotion()
    const rig = new CameraRig(world)
    rigRef.current = rig
    const measure = () => {
      const W = root.clientWidth
      const H = root.clientHeight
      const ox = world.offsetLeft
      const oy = world.offsetTop
      const wb = world.offsetWidth
      const hb = world.offsetHeight
      if (!W || !H || !wb || !hb) return false
      const s0 = Math.min(wb / VB.w, hb / VB.h)
      const g: Geometry = {
        W,
        H,
        ox,
        oy,
        s0,
        bx: ox + (wb - VB.w * s0) / 2 - VB.x * s0,
        by: oy + (hb - VB.h * s0) / 2 - VB.y * s0,
      }
      const first = !rig.geometry
      rig.setGeometry(g)
      if (first) rig.jump(overview(g))
      setGeom(n => n + 1)
      return true
    }
    measure()
    const raf = requestAnimationFrame(() => setDrawn(true))
    let last = `${root.clientWidth}x${root.clientHeight}`
    const ro =
      'ResizeObserver' in window
        ? new ResizeObserver(() => {
            const size = `${root.clientWidth}x${root.clientHeight}`
            if (size === last) return
            last = size
            measure()
          })
        : null
    ro?.observe(root)
    /*
     * 판이 눈에 들어온 뒤에 출발한다. 휴대폰에서는 머리글에 밀려 지도가 첫 화면
     * 아래에 있다 — 보이지 않는 데서 장면을 다 써 버리면 내려왔을 때 이미 끝나 있다.
     * 들어오면 한 박자(나라 전체가 한 번 읽히는 시간) 뒤에 다가간다.
     */
    let beat: ReturnType<typeof setTimeout> | undefined
    const go = () => {
      if (beat !== undefined || startedRef.current) return
      beat = setTimeout(() => {
        startedRef.current = true
        const d = desiredRef.current
        if (d && !reducedRef.current) rig.flyTo(d, FLY, true)
        if (pendingRef.current) scheduleRef.current?.()
      }, BEAT + settleDelay(root))
    }
    const io =
      'IntersectionObserver' in window
        ? new IntersectionObserver(
            ([e]) => {
              const enough =
                e.intersectionRatio >= 0.5 || e.intersectionRect.height >= window.innerHeight * 0.45
              if (e.isIntersecting && enough) {
                io?.disconnect()
                go()
              }
            },
            { threshold: [0, 0.25, 0.5, 0.75, 1] },
          )
        : null
    if (io) io.observe(root)
    else go()
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(beat)
      io?.disconnect()
      ro?.disconnect()
      rig.destroy()
      rigRef.current = null
    }
  }, [])

  const goTo = useCallback((cam: Camera) => {
    desiredRef.current = cam
    setDestS(prev => (Math.abs(Math.log(prev / cam.s)) > 0.05 ? cam.s : prev))
    const rig = rigRef.current
    const g = rig?.geometry
    if (!rig || !g) return
    if (reducedRef.current) {
      rig.jump(cam)
      return
    }
    if (!startedRef.current || scheduledRef.current) return
    const dest = rig.destination
    if (dest && sameView(dest, cam, g.W, g.H)) return
    const remaining = rig.endTime() - now()
    if (!rig.isFlying()) {
      rig.flyTo(cam, 900)
      return
    }
    // 날던 중에 목적지가 바뀌면 남은 시간에, 바뀐 만큼만 조금 더 준다(최대 300ms)
    const cur = rig.destination ?? cam
    const shift =
      Math.abs(Math.log(cam.s / cur.s)) + Math.hypot((cam.x - cur.x) * cam.s, (cam.y - cur.y) * cam.s) / g.W
    rig.flyTo(cam, Math.max(650, remaining + Math.min(300, shift * 600)))
  }, [])

  // 목적지: 지도를 열면 공고 범위의 짐작, 못 열면 고른 범위
  const highlightKey = highlight.join(',')
  useEffect(() => {
    const g = rigRef.current?.geometry
    if (!g) return
    const root = rootRef.current
    if (mode === 'fallback' && root) goTo(fallbackCamera(highlight, g, freeArea(root, g)))
    else if (!handoff) goTo(aimCamera(aim, g, reducedRef.current))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, aim, highlightKey, handoff, geom, goTo])

  // 넘겨주기
  useEffect(() => {
    const rig = rigRef.current
    const g = rig?.geometry
    const root = rootRef.current
    if (!handoff || mode !== 'intro' || !rig || !g || !root || doneRef.current) return
    const { map, level } = handoff
    const exact = exactCamera(map, g)
    const final: Camera = { ...exact, s: exact.s * 2 ** (map.getLevel() - level) }
    goTo(exact)

    const timers: ReturnType<typeof setTimeout>[] = []
    const finish = (ms: number) => {
      if (doneRef.current) return
      doneRef.current = true
      const end = () => onDoneRef.current()
      if (typeof root.animate !== 'function' || ms <= 0) {
        end()
        return
      }
      const fade = root.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: ms,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        fill: 'forwards',
      })
      // 카메라와 같은 순간에 묶는다 — 메인 스레드가 한 장 늦게 그려도 둘이 어긋나지 않는다
      try {
        fade.startTime = now()
      } catch {
        /* 다음 장부터 */
      }
      fade.onfinish = end
    }
    const zoomKakao = () => {
      if (map.getLevel() === level) return
      try {
        map.setLevel(level, { animate: { duration: KAKAO_ZOOM } })
      } catch {
        map.setLevel(level)
      }
      rig.flyTo(final, KAKAO_ZOOM)
    }
    const schedule = () => {
      if (scheduledRef.current || doneRef.current) return
      if (reducedRef.current) {
        scheduledRef.current = true
        if (map.getLevel() !== level) map.setLevel(level)
        finish(SKIP_FADE)
        return
      }
      if (!startedRef.current) {
        pendingRef.current = true
        return
      }
      scheduledRef.current = true
      const wait = Math.max(0, rig.endTime() - HANDOFF_LEAD - now())
      timers.push(
        setTimeout(() => {
          // 걷힘과 마지막 한 단을 같은 순간에 시작한다. 벡터는 지금 속도를 이어받아
          // 카카오와 같은 곳으로 함께 당겨지며 사라진다
          zoomKakao()
          finish(FADE)
        }, wait),
      )
    }
    scheduleRef.current = schedule
    // 손이 닿으면(또는 범위를 바꾸면) 남은 장면을 접는다. 범위를 바꾼 경우에는
    // 바깥이 이미 새 자리로 옮기고 있으므로 level 을 건드리지 않는다.
    skipRef.current = (land: boolean) => {
      if (doneRef.current) return
      timers.forEach(clearTimeout)
      scheduledRef.current = true
      rig.stop()
      if (land && map.getLevel() !== level) map.setLevel(level)
      finish(SKIP_FADE)
    }
    const unlisten = handoff.whenTiles(schedule)
    // 타일 소식이 끝내 없으면 기다리지 않고 넘긴다 — 지도는 이미 서 있고 표시도 올라가 있다
    timers.push(setTimeout(schedule, TILE_TIMEOUT))
    return () => {
      timers.forEach(clearTimeout)
      unlisten()
      scheduleRef.current = null
      skipRef.current = null
      // 걷히기 전에 멈췄다면 다음 실행이 처음부터 다시 잡을 수 있게
      if (!doneRef.current) {
        scheduledRef.current = false
        pendingRef.current = false
      }
    }
    // 판 크기(geom)는 일부러 넣지 않는다 — 걷히는 중에 다시 돌면 걷기 예약이 지워진다
  }, [handoff, mode, goTo])

  // 범위를 바꾸면 남은 장면을 건너뛴다
  const skipSeen = useRef(skip)
  useEffect(() => {
    if (skipSeen.current === skip) return
    skipSeen.current = skip
    skipRef.current?.(false)
  }, [skip])

  const dots = useMemo(
    () =>
      pins.map(p => {
        const q = project(p.lat, p.lng)
        return { x: q.x, y: q.y, kind: p.kind, hot: p.hot }
      }),
    [pins],
  )
  // 착지했을 때 지름 6~8px. 다가가는 동안에는 점도 함께 커진다
  const r = 3.2 / destS
  /*
   * 경계선 굵기(경로 단위). 카메라가 transform 으로 당기면 선도 같이 굵어진다 — 서울
   * 하나를 화면에 채우면 0.5칸이 9px 이 된다. 목적지에서 2px 을 넘지 않게 줄인다.
   * 바꾸는 것은 목적지가 정해질 때뿐이라(움직이는 동안이 아니다) 다시 그리기는 한 번이다.
   */
  const sw = Math.min(0.5, 2 / destS)

  return (
    <div
      ref={rootRef}
      className="cs-mi"
      data-mode={mode}
      aria-hidden="true"
      onPointerDown={() => skipRef.current?.(true)}
      onWheel={() => skipRef.current?.(true)}
    >
      <div ref={worldRef} className="cs-mi__world">
        <svg
          viewBox={KOREA_VISUAL_VIEWBOX}
          preserveAspectRatio="xMidYMid meet"
          focusable="false"
          style={{ '--mi-sw': sw.toFixed(3) } as CSSProperties}
        >
          <path d={GRID} className="cs-mi__grid" />
          {drawn ? (
            KOREA_PROVINCES.map(p => (
              <path
                key={p.id}
                d={p.path}
                className="cs-mi__land"
                data-on={highlight.includes(p.id) || undefined}
              />
            ))
          ) : (
            <path d={KOREA_SILHOUETTE} className="cs-mi__land" />
          )}
          <g className="cs-mi__pins">
            {dots.map((d, i) => (
              <circle
                key={i}
                cx={d.x}
                cy={d.y}
                r={d.hot ? r * 1.25 : r}
                data-kind={d.kind === 'SALE' ? 'sale' : 'rent'}
                data-hot={d.hot || undefined}
              />
            ))}
          </g>
        </svg>
      </div>
    </div>
  )
}
