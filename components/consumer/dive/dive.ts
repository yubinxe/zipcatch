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
/** 공간 탐험을 여는 하나의 입구 — 공고 id 로 */
export const EXPLORE_EVENT = 'zc:explore'

export interface ExploreOptions {
  /** 누른 요소의 화면 위치 — 전환의 출발점 */
  from?: { x: number; y: number } | null
  /** 불러오는 동안 껍데기에 미리 적을 이름(자료가 오면 서버 값으로 바뀐다) */
  name?: string | null
  /** 지도·목록에서 고른 지역 이름 */
  region?: string | null
  /** 처음 볼 단계 — 없으면 자료가 허락하는 가장 가까운 단계 */
  level?: 'NATIONAL' | 'REGIONAL' | 'NEIGHBORHOOD' | 'COMPLEX' | null
}

export interface ExploreRequest extends ExploreOptions {
  noticeId: string
}

/**
 * 모든 '3D 공간 탐험' 단추가 부르는 하나의 함수. 공고 id(운영 저장소의 id)만 넘기면 된다 —
 * 좌표·지역·형상은 공간 API(/api/notices/:id/spatial)가 정한다. 껍데기는 누르는 즉시 열리고,
 * 자료는 그 안에서 받는다(DiveHost).
 */
export function openSpatialExplorer(noticeId: string, options: ExploreOptions = {}) {
  window.dispatchEvent(new CustomEvent<ExploreRequest>(EXPLORE_EVENT, { detail: { noticeId, ...options } }))
}

/* ── 주소 ─────────────────────────────────────────────────────
   공유·새 탭의 고정 주소는 공고 상세의 ?view=3d 하나다. 다른 화면 위에서 열 때는 그 화면 주소를
   지키고(지도·목록의 고른 지역·필터) 그 위에 ?explore=<id> 만 얹는다. 예전 #dive= 고리도 받는다. */

/** 공유·새 탭용 주소 */
export const explorerHref = (noticeId: string) => `/notices/${encodeURIComponent(noticeId)}?view=3d`

const UUID_OR_FX = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|fx-[a-z0-9-]{1,40})$/i

/** 지금 주소가 가리키는 탐험 공고 id(없으면 null) — ?explore= · /notices/<id>?view=3d · 예전 #dive=<id> */
export function explorerIdFromUrl(loc: Pick<Location, 'pathname' | 'search' | 'hash'>): string | null {
  const q = new URLSearchParams(loc.search)
  const e = q.get('explore')
  if (e && UUID_OR_FX.test(e)) return e
  const m = /^\/notices\/([^/?#]+)\/?$/.exec(loc.pathname)
  if (m && q.get('view') === '3d' && UUID_OR_FX.test(decodeURIComponent(m[1]))) return decodeURIComponent(m[1])
  const k = parseDiveHash(loc.hash)
  if (k?.noticeId && UUID_OR_FX.test(k.noticeId)) return k.noticeId
  return null
}

/** 이 화면 위에서 탐험을 연 주소 — 공고 상세 위에서는 ?view=3d, 그 밖은 ?explore=<id> */
export function urlWithExplorer(loc: Pick<Location, 'pathname' | 'search'>, noticeId: string): string {
  const q = new URLSearchParams(loc.search)
  if (loc.pathname === `/notices/${noticeId}`) q.set('view', '3d')
  else q.set('explore', noticeId)
  const s = q.toString()
  return `${loc.pathname}${s ? `?${s}` : ''}`
}

/** 탐험 고리를 걷어 낸 주소 — 화면의 다른 상태(지역·필터)는 그대로 */
export function urlWithoutExplorer(loc: Pick<Location, 'pathname' | 'search'>): string {
  const q = new URLSearchParams(loc.search)
  q.delete('explore')
  // 3D 와 무관한 view 값(목록·지도 보기 등)은 지우지 않는다
  if (q.get('view') === '3d') q.delete('view')
  const s = q.toString()
  return `${loc.pathname}${s ? `?${s}` : ''}`
}
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
  const m = /^#dive=([A-Za-z0-9-]{4,64})$/.exec(hash)
  if (!m) return null
  const v = m[1]
  if (/^\d{10}$/.test(v)) return { announcementId: `${v}-${v}`, noticeId: null }
  return { announcementId: null, noticeId: v }
}

/**
 * 들어갈 곳을 미리 받아 둔다 — 탐험 단추에 손이 가거나(올리기·초점).
 *
 * 무엇을 받는지는 단추가 정한다. 원문 대조 단지(현장 열쇠가 있는 단추)만 단지 장면 코드와 그 현장
 * 자료를 받고, 그 밖의 공고는 공용 무대 코드만 받는다 — 상관없는 공고에서 고덕강일 자료를 받지 않는다.
 * 같은 것은 한 번만.
 */
/** 등록된 확인 사례(고덕강일 3단지)의 현장 열쇠 — 그 사례로 바로 들어가는 단추(첫 화면·ONE MAP·FOUR STEPS)만 쓴다 */
export const VERIFIED_SITE = 'godeok-gangil-3'

const prefetched = new Set<string>()
export function prefetchDive(siteKey: string | null = null) {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } }
  if (nav.connection?.saveData) return
  if (!prefetched.has('stage')) {
    prefetched.add('stage')
    void import('./geo-scene').catch(() => {})
  }
  if (siteKey && !prefetched.has(siteKey)) {
    prefetched.add(siteKey)
    void import('../complex/ComplexExperience').catch(() => {})
    void import('../complex/complex-scene').catch(() => {})
    void import('@/lib/consumer/sites').then(m => m.loadSite(siteKey)).catch(() => {})
  }
}
