/**
 * 화면에 보이는 공고 자료가 어디서 왔는가 — 두 상태를 섞지 않는다.
 *
 *  - LIVE           공고 목록 API(청약홈·LH 수집)에서 지금 받은 공고. 출처·수집 시각·상태를 함께 적는다
 *  - VERIFIED_CASE  사람이 공고 원문(정정본)과 대조해 코드에 적어 둔 사례. 실시간 목록이 아니다.
 *                   일정이 지났으면 '지난 사례'로, 지금 신청할 수 있는 것처럼 보이지 않게 한다
 *
 * 순수 함수 — 테스트가 날짜를 넣어 검사한다.
 */
import type { VerifiedSource } from './complex-visualization'

export type CaseState = 'BEFORE' | 'OPEN' | 'CLOSED'

export interface CaseStatus {
  state: CaseState
  /** '접수 2026-11-02 ~ 11-06' 처럼 원문 일정 그대로 */
  window: string
  /** 화면 한 줄 */
  text: string
}

const firstDate = (s: string) => s.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null
function lastDate(s: string): string | null {
  const full = s.match(/\d{4}-\d{2}-\d{2}/g)
  if (!full) return null
  const short = s.match(/~\s*(\d{2})-(\d{2})(?!\d)/)
  if (short && full.length === 1) return `${full[0].slice(0, 4)}-${short[1]}-${short[2]}`
  return full[full.length - 1]
}

/** 확인된 사례의 신규 청약 접수 창(특별공급 시작 ~ 일반공급 2순위 끝)으로 오늘의 상태를 정한다 */
export function verifiedCaseStatus(src: VerifiedSource, today: Date): CaseStatus {
  const start = firstDate(src.schedule.find(s => s.label.startsWith('특별공급'))?.date ?? '')
  const end = lastDate(src.schedule.find(s => s.label.startsWith('일반공급 2순위'))?.date ?? '')
  const iso = today.toISOString().slice(0, 10)
  const window = start && end ? `접수 ${start} ~ ${end.slice(5)}` : '접수 일정 원문 확인'
  if (end && iso > end) return { state: 'CLOSED', window, text: `지난 사례 — 접수가 끝났습니다(${end}). 지금 신청할 수 없습니다` }
  if (start && iso < start) return { state: 'BEFORE', window, text: `원문 일정상 접수 전 — ${window}` }
  return { state: 'OPEN', window, text: `원문 일정상 접수 기간 — ${window}. 신청은 청약홈·사업주체에서` }
}

export interface DataModeLabel {
  kind: 'LIVE' | 'VERIFIED_CASE'
  title: string
  detail: string
}

export function liveLabel(source: string | null, collectedAt: string | null): DataModeLabel {
  const at = collectedAt ? collectedAt.replace('T', ' ').slice(0, 16) : null
  return { kind: 'LIVE', title: '실시간 공고', detail: `${source ?? '청약홈·LH 공고 목록'}${at ? ` · ${at} 수집` : ''}` }
}

export function caseLabel(src: VerifiedSource, today: Date): DataModeLabel {
  const st = verifiedCaseStatus(src, today)
  return {
    kind: 'VERIFIED_CASE',
    title: st.state === 'CLOSED' ? '지난 사례 · 원문 검증' : '검증 사례 · 원문 대조',
    detail: `공고 원문(정정본) ${src.checkedAt} 대조 · 실시간 목록과 별개 · ${st.text}`,
  }
}
