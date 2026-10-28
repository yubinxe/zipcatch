'use client'

import { useSyncExternalStore } from 'react'

/**
 * 폰 화면의 상태 표시줄이 읽는 기기 상태 — 시계·배터리·연결.
 *
 * 꾸밈이 아니라 지금 이 기기의 값을 그대로 보여준다. 시계는 분이 바뀌는
 * 순간에 맞춰 넘어가고, 배터리는 브라우저가 알려줄 때만 숫자를 단다
 * (알려주지 않으면 아이콘만 그린다 — 지어낸 숫자를 쓰지 않는다).
 */

/* ── 시계 ─────────────────────────────────────────────── */

const WEEK = ['일', '월', '화', '수', '목', '금', '토']

export const pad2 = (n: number) => String(n).padStart(2, '0')

/** 13:44 — 상태 표시줄과 말풍선이 같은 24시간 표기를 쓴다 */
export const formatClock = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`

/** 10월 27일 화요일 — 대화 위의 날짜 구분선 */
export const formatDay = (d: Date) => `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEK[d.getDay()]}요일`

let clockSnap = ''
const clockListeners = new Set<() => void>()
let clockTimer: ReturnType<typeof setTimeout> | undefined

const readClock = () => {
  const d = new Date()
  return `${formatClock(d)}|${formatDay(d)}`
}

function tickClock() {
  const next = readClock()
  if (next !== clockSnap) {
    clockSnap = next
    clockListeners.forEach(l => l())
  }
  // 다음 분의 경계에 맞춰 다시 깬다
  clockTimer = setTimeout(tickClock, 60_000 - (Date.now() % 60_000) + 40)
}

function onVisible() {
  if (document.visibilityState === 'visible') {
    clearTimeout(clockTimer)
    tickClock()
  }
}

function subscribeClock(cb: () => void) {
  clockListeners.add(cb)
  if (clockListeners.size === 1) {
    tickClock()
    document.addEventListener('visibilitychange', onVisible)
  }
  return () => {
    clockListeners.delete(cb)
    if (clockListeners.size === 0) {
      clearTimeout(clockTimer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }
}

const getClock = () => clockSnap || (clockSnap = readClock())

export function useDeviceClock() {
  const snap = useSyncExternalStore(subscribeClock, getClock, () => '')
  const [time = '', day = ''] = snap.split('|')
  return { time, day }
}

/* ── 배터리 ───────────────────────────────────────────── */

interface BatteryManagerLike extends EventTarget {
  level: number
  charging: boolean
}
type NavigatorWithBattery = Navigator & { getBattery?: () => Promise<BatteryManagerLike> }

export interface BatteryState {
  /** 0–1. 브라우저가 알려주지 않으면 null */
  level: number | null
  charging: boolean
}

const NO_BATTERY: BatteryState = { level: null, charging: false }
let batterySnap: BatteryState = NO_BATTERY
const batteryListeners = new Set<() => void>()
let batteryRef: BatteryManagerLike | null = null
let batteryAsked = false

function readBattery() {
  if (!batteryRef) return
  const next = { level: batteryRef.level, charging: batteryRef.charging }
  if (next.level !== batterySnap.level || next.charging !== batterySnap.charging) {
    batterySnap = next
    batteryListeners.forEach(l => l())
  }
}

function subscribeBattery(cb: () => void) {
  batteryListeners.add(cb)
  if (!batteryAsked) {
    batteryAsked = true
    const nav = navigator as NavigatorWithBattery
    nav
      .getBattery?.()
      .then(b => {
        batteryRef = b
        b.addEventListener('levelchange', readBattery)
        b.addEventListener('chargingchange', readBattery)
        readBattery()
      })
      .catch(() => {})
  }
  return () => {
    batteryListeners.delete(cb)
  }
}

export function useBattery() {
  return useSyncExternalStore(
    subscribeBattery,
    () => batterySnap,
    () => NO_BATTERY,
  )
}

/* ── 연결 ─────────────────────────────────────────────── */

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}

export function useOnline() {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  )
}

/* ── 화면 조건 ────────────────────────────────────────── */

/**
 * 미디어 쿼리 하나를 구독하는 저장소. 서버에서는 늘 false —
 * 폰은 버튼을 누른 뒤에야 그려지므로 첫 화면이 어긋날 일이 없다.
 */
function mediaStore(query: string) {
  return {
    subscribe(cb: () => void) {
      const mq = window.matchMedia(query)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    get: () => window.matchMedia(query).matches,
  }
}

const serverFalse = () => false
const narrow = mediaStore('(max-width: 760px)')
const reduced = mediaStore('(prefers-reduced-motion: reduce)')
const finePointer = mediaStore('(hover: hover) and (pointer: fine)')

/** 760px 이하 — 테두리 없이 화면 전체가 폰이 된다 */
export function useNarrow() {
  return useSyncExternalStore(narrow.subscribe, narrow.get, serverFalse)
}

/** 움직임 줄이기 — 켜지는 연출과 부드러운 스크롤을 건너뛴다 */
export function useReducedMotion() {
  return useSyncExternalStore(reduced.subscribe, reduced.get, serverFalse)
}

/** 마우스·트랙패드 — 열자마자 입력칸에 커서를 둬도 자판이 화면을 덮지 않는다 */
export const hasFinePointer = () => finePointer.get()
