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
  /**
   * 대조를 마치지 않은 공고의 자리 — 전국 어느 공고에서든 '어디인가'로 들어갈 수 있게.
   * 등록부에 없는 공고는 이 값으로 지역·좌표 수준의 화면을 연다(NoticePlace).
   */
  place?: {
    id?: string | null
    name: string
    region?: string | null
    district?: string | null
    address?: string | null
    housingType?: string | null
    source?: string | null
    sourceUrl?: string | null
    applicationEnd?: string | null
    lat?: number | null
    lng?: number | null
    /** 저장된 좌표가 어떻게 얻어졌는가(DB geo_source) — 주소로 찾은 것과 공고명으로 찾은 것을 가른다 */
    geoSource?: 'ADDRESS' | 'NAME' | 'REGION' | null
  } | null
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

/**
 * 주소창으로 바로 여는 고리.
 *
 * 예전에는 청약홈 공고번호 10자리만 받았다('#dive=2026000373'). 전국 공고의 열쇠는
 * 운영 id(UUID 등)라, 그 형식이 아닌 공고는 주소로 열 수도 공유할 수도 없었다.
 * 두 가지를 다 받는다 — 10자리는 예전처럼 청약홈 id 로 풀고, 그 밖은 공고 id 그대로.
 */
export const diveHash = (key: string) => `#dive=${/^\d{10}-\d{10}$/.test(key) ? key.split('-')[0] : key}`

export interface DiveKey {
  /** 청약홈 주택관리번호-공고번호. 10자리 고리로 들어왔을 때만 */
  announcementId: string | null
  /** 운영 공고 id. 그 밖의 고리 */
  noticeId: string | null
}

export function parseDiveHash(hash: string): DiveKey | null {
  const m = /^#dive=([A-Za-z0-9-]{6,64})$/.exec(hash)
  if (!m) return null
  const v = m[1]
  if (/^\d{10}$/.test(v)) return { announcementId: `${v}-${v}`, noticeId: null }
  return { announcementId: null, noticeId: v }
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
