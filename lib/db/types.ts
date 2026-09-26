/** DB 레코드 타입 — supabase/schema.sql 과 1:1 로 맞춘다 */

export type LifecycleStage = 'COLD' | 'WARM' | 'HOT' | 'APPLICATION_INTENT'

export interface CustomerRow {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  telegram_chat_id: string | null
  lifecycle_stage: LifecycleStage
  lead_score: number
  session_id: string | null
  created_at: string
  updated_at: string
}

export interface PreferenceRow {
  id: string
  customer_id: string
  preferred_regions: string[]
  /** 만원. null = 사용자가 정하지 않음 (임의값으로 채우지 않는다) */
  max_deposit: number | null
  max_monthly_rent: number | null
  min_area: number | null
  preferred_housing_types: string[]
  move_in_period: string | null
  notification_enabled: boolean
  created_at: string
  updated_at: string
}

export type OpportunityType = 'SUBSCRIPTION' | 'RENTAL' | 'PUBLIC_SALE' | 'VACANCY'
export type OpportunityStatus = 'OPEN' | 'UPCOMING' | 'CLOSED' | 'CANCELLED'

export interface OpportunityRow {
  id: string
  source: string
  external_id: string | null
  opportunity_type: OpportunityType
  housing_type: string
  title: string
  region: string
  district: string | null
  address: string | null
  area: number | null
  deposit: number | null
  monthly_rent: number | null
  supply_count: number | null
  vacancy_count: number | null
  /** 공고 원문에 있는 날짜만. 없으면 null */
  application_start: string | null
  application_end: string | null
  document_deadline: string | null
  result_date: string | null
  contract_start: string | null
  status: OpportunityStatus
  source_url: string | null
  /** 공개 통계가 있을 때만. 없으면 null — 만들어내지 않는다 */
  competition_rate: number | null
  is_demo: boolean
  /**
   * 지도에 찍을 자리.
   *
   * 예전에는 지도를 열 때마다 주소·공고명을 카카오에 물어 좌표로 바꿨다.
   * 캐시가 빈 인스턴스에서는 공고 예순 건에 백스무 번을 물어야 해서 첫 화면이
   * 스무 초 넘게 비었다. 좌표는 공고가 뜬 뒤 바뀌지 않으므로 한 번 찾아
   * 적어 두고, 지도는 읽기만 한다.
   */
  lat: number | null
  lng: number | null
  /** ADDRESS(주소로) · NAME(공고명으로) · REGION(지역 기준점) */
  geo_source: GeoSource | null
  /** 좌표를 찾아본 시각. 못 찾았어도 찍어 두어 같은 걸 매번 다시 묻지 않는다 */
  geo_at: string | null
  created_at: string
  updated_at: string
}

export type GeoSource = 'ADDRESS' | 'NAME' | 'REGION'

export type OpportunityEventType =
  | 'NEW_ANNOUNCEMENT'
  | 'NEW_PROPERTY'
  | 'VACANCY_CREATED'
  | 'VACANCY_INCREASED'
  | 'VACANCY_DECREASED'
  | 'VACANCY_CLOSED'
  | 'APPLICATION_OPEN'
  | 'DEADLINE_APPROACHING'
  | 'PRICE_CHANGED'
  | 'STATUS_CHANGED'

export interface OpportunityEventRow {
  id: string
  opportunity_id: string
  event_type: OpportunityEventType
  previous_value: string | null
  current_value: string | null
  occurred_at: string
  is_demo: boolean
  metadata: Record<string, unknown>
}

export type MatchStatus = 'NEW' | 'NOTIFIED' | 'VIEWED' | 'FAVORITED' | 'DISMISSED'

export interface MatchRow {
  id: string
  customer_id: string
  opportunity_id: string
  event_id: string | null
  region_score: number
  affordability_score: number
  area_score: number
  housing_type_score: number
  /** 공개 경쟁률이 없으면 null. 가중치는 나머지로 재분배한다 */
  competition_score: number | null
  urgency_score: number
  opportunity_score: number
  within_budget: boolean
  deposit_over: number
  rent_over: number
  reason: string
  status: MatchStatus
  created_at: string
}

export type NotificationChannel = 'TELEGRAM' | 'KAKAO' | 'EMAIL' | 'PUSH' | 'RCS'
export type NotificationStatus = 'PREVIEW' | 'QUEUED' | 'SENT' | 'FAILED'

export interface NotificationRow {
  id: string
  customer_id: string
  opportunity_id: string | null
  match_id: string | null
  channel: NotificationChannel
  status: NotificationStatus
  message: string
  detail: string | null
  sent_at: string | null
  clicked_at: string | null
  created_at: string
}

export type BehaviorEventType =
  | 'NOTIFICATION_SENT'
  | 'NOTIFICATION_CLICKED'
  | 'DETAIL_VIEWED'
  | 'FAVORITED'
  | 'UNFAVORITED'
  | 'APPLICATION_STARTED'
  | 'APPLICATION_SUBMITTED'
  | 'INQUIRY_CREATED'
  | 'RETURN_VISIT'
  | 'SEARCH_COMPLETED'
  | 'PREFERENCE_SAVED'

export interface BehaviorEventRow {
  id: string
  customer_id: string | null
  session_id: string | null
  opportunity_id: string | null
  notification_id: string | null
  event_type: BehaviorEventType
  source: string
  metadata: Record<string, unknown>
  created_at: string
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

export interface ApplicationRow {
  id: string
  customer_id: string
  opportunity_id: string
  stage: ApplicationStage
  created_at: string
  updated_at: string
}

export type TaskType = 'REVIEW' | 'APPLY' | 'DOCUMENT' | 'RESULT' | 'CONTRACT'
/** OFFICIAL: 공고 기재 기한 / RECOMMENDED: 서비스가 제안하는 준비일 */
export type DateSource = 'OFFICIAL' | 'RECOMMENDED'
export type TaskStatus = 'TODO' | 'DONE' | 'DATE_UNKNOWN' | 'BLOCKED'

export interface ApplicationTaskRow {
  id: string
  application_id: string
  title: string
  due_date: string | null
  task_type: TaskType
  date_source: DateSource
  status: TaskStatus
  created_at: string
}

export interface InquiryRow {
  id: string
  customer_id: string | null
  session_id: string | null
  opportunity_id: string | null
  message: string
  contact: string | null
  status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED'
  created_at: string
}
