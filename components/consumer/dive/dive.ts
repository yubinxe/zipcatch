'use client'

/**
 * GEOGRAPHIC DIVE — 지도에서 고른 공고에서 그 단지의 탐험으로.
 *
 * 지도와 단지 장면은 좌표계가 다르다(지도 = 행정 경계 그림, 단지 = 현장 미터). 그래서 지도에서
 * 단지까지 실제로 날아가는 척 이어 붙이지 않는다 — 고른 표지와 제목을 화면 위 한 겹으로 붙잡은 채
 * 지도를 가리고, 단지 장면이 그 아래에서 떠오른다(화면 공간 전환).
 */
export interface DiveRequest {
  /** 확인된 공고의 청약홈 id */
  announcementId: string
  /** 출발한 표지의 화면 위치 — 없으면 화면 가운데 */
  from?: { x: number; y: number } | null
  /** 지도에서 고른 지역(이름) — 전환 중 함께 붙잡아 둔다 */
  region?: string | null
  /** 들어가자마자 고를 주택형 */
  type?: string | null
}

export const DIVE_EVENT = 'zc:dive'
export const DIVE_PHASE_EVENT = 'zc:dive-phase'

export type DivePhase = 'idle' | 'focus' | 'approach' | 'cover' | 'reveal' | 'inside'

export function startDive(req: DiveRequest) {
  window.dispatchEvent(new CustomEvent<DiveRequest>(DIVE_EVENT, { detail: req }))
}

/** 눌린 요소의 가운데 — 전환의 출발점 */
export function centerOf(el: Element | null): { x: number; y: number } | null {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

/** 주소창으로 바로 여는 고리 — '/#dive=2026000373' */
export const diveHash = (announcementId: string) => `#dive=${announcementId.split('-')[0]}`
export function parseDiveHash(hash: string): string | null {
  const m = /^#dive=(\d{10})$/.exec(hash)
  return m ? `${m[1]}-${m[1]}` : null
}

/**
 * 들어갈 곳을 미리 받아 둔다 — 탐험 단추에 손이 가거나(올리기·초점) 탐험할 수 있는 지역이 고른 상태일 때.
 * 한 번만. 단지 장면 코드(three 포함)와 현장 자료(약 16KB)를 받되 그리지는 않는다.
 */
let prefetched = false
export function prefetchDive(siteKey: string | null = 'godeok-gangil-3') {
  if (prefetched) return
  prefetched = true
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } }
  if (nav.connection?.saveData) return
  void import('../complex/ComplexExperience').catch(() => {})
  void import('../complex/complex-scene').catch(() => {})
  void import('@/lib/consumer/sites').then(m => m.loadSite(siteKey)).catch(() => {})
}
