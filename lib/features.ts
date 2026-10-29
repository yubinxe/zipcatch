/**
 * 4.0 확장 기능 스위치.
 *
 * 새 기능은 기존 화면 위에 덧붙인다. 문제가 생기면 배포 환경변수 하나로 걷어낼 수 있어야
 * 한다 — 값을 '0' 으로 두면 꺼진다. 비워 두면 켜진 채다.
 * NEXT_PUBLIC_ 이라 빌드 때 박힌다: 바꾼 뒤에는 다시 배포해야 반영된다.
 */
const off = (v: string | undefined) => (v ?? '').trim() === '0'

export const FEATURES = {
  /** A. 지도 화면의 날짜 되감기 */
  timeMachine: !off(process.env.NEXT_PUBLIC_FEATURE_TIME_MACHINE),
  /** B. 입체 지도 탐험 모드 */
  explore: !off(process.env.NEXT_PUBLIC_FEATURE_EXPLORE),
  /** C. 비교 담기 · 트레이 · 차이 시각화 */
  battle: !off(process.env.NEXT_PUBLIC_FEATURE_BATTLE),
  /** D. 세 갈래 주거비 비교 */
  playground: !off(process.env.NEXT_PUBLIC_FEATURE_PLAYGROUND),
} as const
