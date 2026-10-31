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

export type DivePhase = 'idle' | 'focus' | 'approach' | 'cover' | 'inside'

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
