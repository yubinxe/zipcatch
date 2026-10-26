/**
 * 요금제와 이용 권한 — 한 곳에서만 정한다.
 *
 * 화면마다 `if (plan === 'pro')` 를 흩어 두면, 요금제를 하나 고칠 때 어디를 바꿔야
 * 하는지 아무도 모른다. 요금제가 무엇을 열어 주는지는 여기 표 하나가 말하고,
 * 화면과 서버는 `allows()` · `limitOf()` 로만 묻는다.
 *
 * ── 지금 상태를 정직하게 ──
 *
 *  · 결제는 아직 열지 않았다. PG 연동 전이므로 모든 이용자는 'free' 다(`currentPlan`).
 *  · 가격은 시장 검증 전의 **가설**이다. 화면에도 그렇게 적는다.
 *  · 기능마다 `status` 를 둔다. 'live' 는 지금 쓸 수 있는 것(베타 동안 무료),
 *    'soon' 은 설계만 된 것이다. 준비 중인 기능을 있는 것처럼 팔지 않는다.
 *  · 거래 성사에 따른 수수료는 여기 없다. 중개보수(공인중개사법 제32조)와
 *    플랫폼 이용료는 성격이 다르고, 법률 검토 전에는 청구 기능을 만들지 않는다.
 */

export type PlanId = 'free' | 'plus' | 'pro' | 'business'

export type FeatureId =
  | 'explore'
  | 'safety'
  | 'alerts'
  | 'compare'
  | 'regionStats'
  | 'scenarios'
  | 'contractFiles'
  | 'reports'
  | 'marketRead'
  | 'advancedFilters'
  | 'export'
  | 'monitoring'
  | 'team'
  | 'evidence'
  | 'auditLog'
  | 'api'

export type FeatureStatus = 'live' | 'soon'

export interface Feature {
  id: FeatureId
  label: string
  group: '탐색' | '내 집 찾기' | '분석' | '조직'
  status: FeatureStatus
  /** 지금 쓸 수 있는 기능이면 그 화면 */
  href?: string
  /** 한도가 숫자일 때 붙일 단위 */
  unit?: string
}

export const FEATURES: Feature[] = [
  { id: 'explore', label: '지도·공고 탐색', group: '탐색', status: 'live', href: '/map' },
  { id: 'safety', label: '청약 가이드·계약 안전 정보', group: '탐색', status: 'live', href: '/guide' },
  { id: 'alerts', label: '조건 맞춤 새 공고 알림', group: '탐색', status: 'live', href: '/saved', unit: '개 조건' },
  { id: 'compare', label: '후보 공고 나란히 비교', group: '내 집 찾기', status: 'live', href: '/compare', unit: '건까지' },
  { id: 'scenarios', label: '주거비 시나리오 저장', group: '내 집 찾기', status: 'soon' },
  { id: 'contractFiles', label: '계약 준비 서류함', group: '내 집 찾기', status: 'soon' },
  { id: 'reports', label: '공고별 상세 분석 리포트', group: '내 집 찾기', status: 'soon', unit: '건 / 월' },
  { id: 'regionStats', label: '지역별 경쟁률·당첨가점 통계', group: '분석', status: 'live', href: '/stats' },
  { id: 'marketRead', label: '분양가·미달 사업성 판독', group: '분석', status: 'live', href: '/biz' },
  { id: 'advancedFilters', label: '고급 데이터 필터', group: '분석', status: 'soon' },
  { id: 'export', label: '리포트 내보내기 (PDF·CSV)', group: '분석', status: 'soon' },
  { id: 'monitoring', label: '관심 지역 모니터링·분석 이력', group: '분석', status: 'soon' },
  { id: 'team', label: '팀 작업공간', group: '조직', status: 'soon' },
  { id: 'evidence', label: '거래 증빙 관리', group: '조직', status: 'soon' },
  { id: 'auditLog', label: '권한·감사 기록', group: '조직', status: 'soon' },
  { id: 'api', label: '대량 분석·API 연동', group: '조직', status: 'soon' },
]

/** true 면 무제한, 숫자면 그 한도까지, false 면 없음 */
export type Entitlement = boolean | number

export interface Plan {
  id: PlanId
  name: string
  /** 누구를 위한 요금제인가 — 한 줄 */
  forWhom: string
  /** 월 요금(USD, 센트). null 이면 별도 견적 */
  monthlyCents: number | null
  /** 연 요금(USD, 센트). 연간 결제가 없으면 null */
  annualCents: number | null
  entitlements: Record<FeatureId, Entitlement>
}

const NONE: Record<FeatureId, Entitlement> = {
  explore: false,
  safety: false,
  alerts: false,
  compare: false,
  regionStats: false,
  scenarios: false,
  contractFiles: false,
  reports: false,
  marketRead: false,
  advancedFilters: false,
  export: false,
  monitoring: false,
  team: false,
  evidence: false,
  auditLog: false,
  api: false,
}

/**
 * 안전 정보와 기본 탐색은 어느 요금제에서도 닫지 않는다. 계약 직전에 꼭 봐야 할
 * 정보를 돈으로 가리면 그 순간 서비스의 신뢰가 끝난다.
 */
const FREE: Record<FeatureId, Entitlement> = {
  ...NONE,
  explore: true,
  safety: true,
  alerts: 1,
  compare: 2,
  regionStats: true,
}

const PLUS: Record<FeatureId, Entitlement> = {
  ...FREE,
  alerts: 5,
  compare: 6,
  scenarios: true,
  contractFiles: true,
  reports: 10,
}

const PRO: Record<FeatureId, Entitlement> = {
  ...PLUS,
  alerts: true,
  compare: true,
  reports: true,
  marketRead: true,
  advancedFilters: true,
  export: true,
  monitoring: true,
}

const BUSINESS: Record<FeatureId, Entitlement> = {
  ...PRO,
  team: true,
  evidence: true,
  auditLog: true,
  api: true,
}

export const PLANS: Plan[] = [
  { id: 'free', name: 'Free', forWhom: '처음 찾아보는 모두에게', monthlyCents: 0, annualCents: 0, entitlements: FREE },
  { id: 'plus', name: 'Plus', forWhom: '지금 집을 찾고 있다면', monthlyCents: 699, annualCents: 5990, entitlements: PLUS },
  { id: 'pro', name: 'Pro', forWhom: '투자자·주니어 실무자', monthlyCents: 2799, annualCents: 23990, entitlements: PRO },
  { id: 'business', name: 'Business', forWhom: '중개사무소·전문 조직', monthlyCents: null, annualCents: null, entitlements: BUSINESS },
]

/**
 * 집을 찾는 일은 매달 하지 않는다. 구독이 부담스러운 사람에게는 한 번 사서 30일
 * 쓰고 끝나는 이용권을 둔다 — 자동 갱신이 없다. 권한은 Plus 와 같다.
 */
export const PASS = { id: 'pass30' as const, name: '30일 이용권', priceCents: 999, days: 30, entitlements: PLUS }

/** 결제가 열리기 전까지 모든 이용자는 Free 다 */
export function currentPlan(): PlanId {
  return 'free'
}

export function planById(id: PlanId): Plan {
  return PLANS.find(p => p.id === id) ?? PLANS[0]
}

export function allows(plan: PlanId, feature: FeatureId): boolean {
  return planById(plan).entitlements[feature] !== false
}

/** 한도. 무제한이면 Infinity, 없으면 0 */
export function limitOf(plan: PlanId, feature: FeatureId): number {
  const e = planById(plan).entitlements[feature]
  return e === true ? Infinity : e === false ? 0 : e
}

/** 센트 → 화면에 쓸 조각. "$6.99" 를 큰 숫자와 작은 단위로 나눠 그리기 위해 */
export function priceParts(cents: number): { whole: string; fraction: string } {
  const whole = Math.floor(cents / 100)
  const rest = cents % 100
  return { whole: whole.toLocaleString('en-US'), fraction: rest ? `.${String(rest).padStart(2, '0')}` : '' }
}
