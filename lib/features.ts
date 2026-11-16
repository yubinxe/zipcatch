/**
 * 4.0 확장 기능 스위치.
 *
 * 새 기능은 기존 화면 위에 덧붙인다. 문제가 생기면 배포 환경변수 하나로 걷어낼 수 있어야
 * 한다 — 값을 '0' 으로 두면 꺼진다. 비워 두면 켜진 채다.
 * NEXT_PUBLIC_ 이라 빌드 때 박힌다: 바꾼 뒤에는 다시 배포해야 반영된다.
 */
const off = (v: string | undefined) => (v ?? '').trim() === '0'
/** 기본 꺼짐 — '1' 일 때만 켜진다. 데이터·검증이 준비되기 전의 기능에 쓴다 */
const on = (v: string | undefined) => (v ?? '').trim() === '1'

export const FEATURES = {
  /** A. 지도 화면의 날짜 되감기 */
  timeMachine: !off(process.env.NEXT_PUBLIC_FEATURE_TIME_MACHINE),
  /** B. 입체 지도 탐험 모드 */
  explore: !off(process.env.NEXT_PUBLIC_FEATURE_EXPLORE),
  /** C. 비교 담기 · 트레이 · 차이 시각화 */
  battle: !off(process.env.NEXT_PUBLIC_FEATURE_BATTLE),
  /** D. 세 갈래 주거비 비교 */
  playground: !off(process.env.NEXT_PUBLIC_FEATURE_PLAYGROUND),
  /** E. ⌘K 빠른 검색 */
  spotlight: !off(process.env.NEXT_PUBLIC_FEATURE_SPOTLIGHT),
  /** F. 내 조건의 지도 (결과 화면) */
  universe: !off(process.env.NEXT_PUBLIC_FEATURE_UNIVERSE),
  /** G. 업무지구까지 (상세·비교) */
  commute: !off(process.env.NEXT_PUBLIC_FEATURE_COMMUTE),
  /** H. 결과를 이미지로 (비교·주거비·타임머신) */
  share: !off(process.env.NEXT_PUBLIC_FEATURE_SHARE),
  /** 4.1 공고 제목이 이어지는 화면 전환 */
  transitions: !off(process.env.NEXT_PUBLIC_FEATURE_TRANSITIONS),
  /** PROPERTY EXPERIENCE — 공고의 주택형을 입체로 보고 견주기 */
  complex: !off(process.env.NEXT_PUBLIC_FEATURE_COMPLEX),
  /**
   * 역세권·교통 입지 분석 — 기본 꺼짐.
   * 역·출입구 공식 데이터가 아직 저장소에 없다(docs/domain/transit-premium-hypothesis-v0.md).
   * 데이터를 들인 뒤 '1' 로 켠다. 가격 보정 시나리오는 이 스위치와 무관하게 화면에 내지 않는다.
   */
  transitAccess: on(process.env.NEXT_PUBLIC_FEATURE_TRANSIT_ACCESS),
} as const
