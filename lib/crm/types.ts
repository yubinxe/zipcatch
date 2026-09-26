// ──────────────────────────────────────────────────────────
// Housing Opportunity CRM — 도메인 모델
// 실제 공공데이터(청약홈/LH)와 데모용 합성 데이터를 구분하기 위해
// 모든 엔티티는 dataOrigin 을 갖는다.
// ──────────────────────────────────────────────────────────

export type DataOrigin = 'OFFICIAL' | 'SYNTHETIC'

export type HouseholdType = '1인가구' | '신혼부부' | '2인가구' | '다자녀' | '한부모'

export type IncomeBand = '~50%' | '50~70%' | '70~100%' | '100~120%' | '120%~'

export type HousingType =
  | '청년매입임대'
  | '행복주택'
  | '공공임대'
  | '공공지원민간임대'
  | '신혼희망타운'

export const HOUSING_TYPES: HousingType[] = [
  '청년매입임대',
  '행복주택',
  '공공임대',
  '공공지원민간임대',
  '신혼희망타운',
]

export interface Customer {
  id: string
  name: string
  age: number
  householdType: HouseholdType
  incomeBand: IncomeBand
  preferredRegions: string[]
  /** 만원 단위 */
  maxDeposit: number
  /** 만원 단위 */
  maxMonthlyRent: number
  /** ㎡ */
  minArea: number
  preferredHousingTypes: HousingType[]
  /** YYYY-MM */
  moveInPeriod: string
  createdAt: string
  dataOrigin: DataOrigin
}

export type PropertyStatus = 'OPEN' | 'UPCOMING' | 'CLOSED' | 'CANCELLED'

export interface Property {
  id: string
  source: string
  announcementId: string
  name: string
  /**
   * 표시용 원문 유형. 공공 API 는 '민영'·'국민'·'행복주택' 등 자체 표기를 쓴다.
   * 선택지(HOUSING_TYPES)에 맞춰 바꿔 쓰지 않고 공고가 쓴 말을 그대로 둔다.
   */
  housingType: string
  region: string
  district: string
  address: string
  /**
   * 아래 셋은 공고 원문에 있을 때만 값이 있다.
   * 청약홈 분양정보처럼 임대조건을 주지 않는 원본도 있으므로 0 으로 채우지 않는다.
   */
  /** ㎡ */
  area: number | null
  /** 만원 */
  deposit: number | null
  /** 만원 */
  monthlyRent: number | null
  supplyCount: number
  vacancyCount: number
  /**
   * 공고 원문에 적힌 공식 일자. 원문에 없으면 null 이며 임의로 만들지 않는다.
   * YYYY-MM-DD
   */
  applicationStart: string | null
  applicationEnd: string | null
  /** 서류 제출 마감 — 접수 마감과 다른 날짜다. 복사하지 않는다 */
  documentDeadline: string | null
  resultDate: string | null
  /** 계약 시작일 — 당첨자 발표에서 역산하지 않는다 */
  contractStart: string | null
  /** 공고 원문 URL. 없으면 null 이며 상세 링크를 원문인 것처럼 쓰지 않는다 */
  sourceUrl: string | null
  status: PropertyStatus
  /** 직전 공고 경쟁률(배수). 공개 통계가 있을 때만. 없으면 null — 만들지 않는다 */
  competitionRate: number | null
  /**
   * 지도에 찍을 자리. 수집 뒤에 한 번 찾아 저장해 둔 값이다.
   *
   * 화면을 열 때 지오코딩하지 않는다 — 공고 예순 건을 물으면 첫 화면이
   * 스무 초 넘게 빈다. 아직 못 찾은 공고는 null 이고, 지도는 지역 기준점으로
   * 물러선다(lib/consumer/geo.ts).
   */
  lat: number | null
  lng: number | null
  /** ADDRESS(주소로) · NAME(공고명으로). 없으면 아직 못 찾은 것 */
  geoSource: 'ADDRESS' | 'NAME' | 'REGION' | null
  dataOrigin: DataOrigin
}

export type VacancyEventType =
  | 'VACANCY_CREATED'
  | 'VACANCY_INCREASED'
  | 'VACANCY_DECREASED'
  | 'VACANCY_CLOSED'
  | 'NEW_ANNOUNCEMENT'

export interface VacancyEvent {
  id: string
  propertyId: string
  occurredAt: string
  previousVacancy: number
  currentVacancy: number
  eventType: VacancyEventType
  dataOrigin: DataOrigin
}

/**
 * 하나의 고객 × 하나의 물건 판정 결과.
 * 자격 / 예산 / 선호 적합도 / 마감 긴급도를 한 점수로 합치지 않는다.
 */
export interface Match {
  id: string
  customerId: string
  propertyId: string
  /** 지역·면적·유형만 반영한 선호 적합도 0~100 */
  preferenceScore: number
  regionScore: number
  /** 공고에 면적이 없으면 null */
  areaScore: number | null
  housingTypeScore: number
  /** 사용자가 정한 예산 상한 이내인지 */
  withinBudget: boolean
  /** 자격 판정 엔진 전까지 항상 UNKNOWN */
  eligibility: 'UNKNOWN'
  urgencyLevel: string
  /** 실제 값 차이로 만든 근거 */
  reasons: string[]
  cautions: string[]
  createdAt: string
  eventId?: string
}

export type ApplicationStage =
  | 'DISCOVERED'
  | 'REVIEWING'
  | 'APPLYING'
  | 'DOCUMENTS'
  | 'SUBMITTED'
  | 'RESULT_WAITING'
  | 'WON'
  | 'LOST'
  | 'CONTRACT'

export const APPLICATION_STAGES: ApplicationStage[] = [
  'DISCOVERED',
  'REVIEWING',
  'APPLYING',
  'DOCUMENTS',
  'SUBMITTED',
  'RESULT_WAITING',
  'WON',
  'LOST',
  'CONTRACT',
]

export const STAGE_LABEL: Record<ApplicationStage, string> = {
  DISCOVERED: '공고 발견',
  REVIEWING: '지원 검토',
  APPLYING: '신청',
  DOCUMENTS: '서류 준비',
  SUBMITTED: '서류 제출',
  RESULT_WAITING: '결과 대기',
  WON: '당첨',
  LOST: '탈락',
  CONTRACT: '계약',
}

export interface Application {
  id: string
  customerId: string
  propertyId: string
  stage: ApplicationStage
  matchId?: string
  /** 지원 시점의 선호 적합도 (당첨확률이 아니다) */
  preferenceScore?: number
  createdAt: string
  updatedAt: string
}

export type TaskStatus = 'TODO' | 'DONE' | 'DATE_UNKNOWN' | 'BLOCKED'
export type ReminderType = 'KAKAO' | 'PUSH' | 'NONE'

/** 일정 항목의 성격 */
export type TaskKind = 'REVIEW' | 'APPLY' | 'DOCUMENT' | 'RESULT' | 'CONTRACT'

/**
 * OFFICIAL    — 공고 원문에 적힌 기한
 * RECOMMENDED — 공식 기한에서 역산한 준비 권장일
 */
export type TaskSource = 'OFFICIAL' | 'RECOMMENDED'

export interface Task {
  id: string
  applicationId: string
  title: string
  kind: TaskKind
  source: TaskSource
  /** 공고에 기준 일자가 없으면 null — 임의 생성하지 않는다 */
  dueDate: string | null
  status: TaskStatus
  hint?: string
  reminderType: ReminderType
}

export type NotificationChannel = 'KAKAO'
/**
 * DRAFT      — 원문만 생성, 발송하지 않음
 * TEST_SENT  — 운영자 본인 계정으로만 전송 (수신자 발송이 아니다)
 * FAILED     — 전송 시도 실패
 */
export type NotificationStatus = 'DRAFT' | 'TEST_SENT' | 'FAILED'

export interface NotificationLog {
  id: string
  customerId: string
  propertyId: string
  matchId: string
  channel: NotificationChannel
  status: NotificationStatus
  adapter: string
  title: string
  body: string
  detail?: string
  createdAt: string
}

export type ActivityKind =
  | 'EVENT'
  | 'MATCH'
  | 'SCORE'
  | 'NOTIFICATION'
  | 'APPLICATION'
  | 'TASK'
  | 'SYSTEM'

export interface ActivityLog {
  id: string
  at: string
  kind: ActivityKind
  message: string
  refId?: string
}

// ──────────────────────────────────────────────────────────
// 소비자 계정 · 관심공고 · 알림 설정
// 가입 전 탐색과 가입 후 계정을 같은 세션으로 이어 붙인다.
// ──────────────────────────────────────────────────────────

/** 탐색 단계에서 받는 조건. 자격 판정에 쓰는 정밀 정보는 여기에 넣지 않는다. */
/** 주택 소유 상태 — 공고의 무주택 요건과 대조할 때 쓴다 */
export type Homeownership = 'NONE' | 'ONE' | 'MANY'

export interface SearchProfile {
  regions: string[]
  housingTypes: HousingType[]
  householdType: HouseholdType | null
  maxDeposit: number | null
  maxMonthlyRent: number | null
  minArea: number | null
  /* ── 자격·가점 항목. 모르면 null 로 두고 임의로 채우지 않는다 ── */
  /** 무주택 여부 */
  homeownership: Homeownership | null
  /** 무주택 기간(년) — 가점 32점 항목 */
  homelessYears: number | null
  /** 해당지역 거주기간(년) — 순위·우선공급 판정에 쓰인다 */
  residencyYears: number | null
  /** 청약통장 가입기간(년) — 가점 17점 항목 */
  accountYears: number | null
  /** 부양가족 수(본인 제외) — 가점 35점 항목 */
  dependents: number | null
  /** 사용자가 정하지 않은 항목은 임의로 채우지 않고 비워 둔다 */
  unknownFields: string[]
  updatedAt: string
}

export interface ConsumerUser {
  id: string
  email: string
  /** 로그인에 쓰는 아이디. 이메일과 함께 둘 다 열쇠가 된다 */
  username: string
  nickname: string
  createdAt: string
}

export interface SavedNotice {
  id: string
  sessionId: string
  userId: string | null
  propertyId: string
  createdAt: string
}

export type AlertScope = 'NEW_NOTICE' | 'DEADLINE'

export interface AlertSubscription {
  id: string
  sessionId: string
  userId: string | null
  scope: AlertScope
  /** DEADLINE 일 때만 값이 있다 */
  propertyId: string | null
  /** NEW_NOTICE 일 때 감시할 조건 */
  profile: SearchProfile | null
  channel: 'EMAIL'
  /** 동의 시각 — 동의 없이 발송하지 않는다 */
  consentedAt: string
  createdAt: string
}

/** 소비자 세션 — 가입 전 탐색을 보존하고 가입 시 계정에 연결한다 */
export interface ConsumerSession {
  id: string
  userId: string | null
  profile: SearchProfile | null
  /** 가입 절차로 넘어가기 직전의 의도. 가입 후 이 지점으로 되돌린다 */
  pendingIntent: PendingIntent | null
  createdAt: string
  lastSeenAt: string
}

export type PendingIntentKind = 'SAVE_NOTICE' | 'ALERT_NEW' | 'ALERT_DEADLINE'

export interface PendingIntent {
  kind: PendingIntentKind
  propertyId: string | null
  createdAt: string
}
