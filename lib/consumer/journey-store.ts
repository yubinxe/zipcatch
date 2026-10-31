'use client'

import { useSyncExternalStore } from 'react'

/**
 * 홈 전체가 나눠 쓰는 선택 — 첫 화면 지도에서 고른 지역이 ONE MAP·단지 탐험·FOUR STEPS 까지 이어진다.
 *
 * 장면마다 예시를 새로 고르지 않는다. 값은 실제 집계·공고에서만 들어온다(지어낸 기본값 없음).
 * 탭 안에서만 기억한다(sessionStorage) — 다른 사람·다른 기기와 나누지 않는다.
 */
export interface JourneyState {
  /** 광역 지역 코드(KOREA_REGIONS.code) */
  region: string | null
  /** 고른 공고 — 공고 id(있으면) 또는 확인된 공고의 청약홈 id */
  noticeId: string | null
  noticeName: string | null
  /** 확인된 공고의 청약홈 id('2026000373-2026000373') — 단지 탐험·검증 상태에 쓴다 */
  announcementId: string | null
  /** 고른 주택형(청약홈 표기) — 비교면 둘 */
  unitTypes: string[]
  /** 누가 마지막으로 바꿨나 — 장면이 자기 변경에 다시 반응하지 않게 */
  by: string | null
}

const KEY = 'zc:journey'
const EMPTY: JourneyState = { region: null, noticeId: null, noticeName: null, announcementId: null, unitTypes: [], by: null }

let state: JourneyState = EMPTY
let loaded = false
const subs = new Set<() => void>()

function load() {
  if (loaded || typeof window === 'undefined') return
  loaded = true
  try {
    const raw = sessionStorage.getItem(KEY)
    if (raw) state = { ...EMPTY, ...(JSON.parse(raw) as Partial<JourneyState>) }
  } catch {
    // 저장소를 못 쓰면 이번 화면 안에서만 기억한다
  }
}

export function getJourney(): JourneyState {
  load()
  return state
}

export function setJourney(patch: Partial<JourneyState>, by: string) {
  load()
  const next = { ...state, ...patch, by }
  if (
    next.region === state.region &&
    next.noticeId === state.noticeId &&
    next.announcementId === state.announcementId &&
    next.unitTypes.join() === state.unitTypes.join()
  ) {
    return
  }
  state = next
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // 위와 같음
  }
  subs.forEach(f => f())
}

function subscribe(f: () => void) {
  subs.add(f)
  return () => {
    subs.delete(f)
  }
}

/** 서버 렌더에서는 늘 빈 선택 — 첫 HTML 은 선택 없이 그려지고 깨어난 뒤 이어 붙는다 */
export function useJourney(): JourneyState {
  return useSyncExternalStore(subscribe, getJourney, () => EMPTY)
}
