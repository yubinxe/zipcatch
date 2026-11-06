/**
 * 화면에 보이는 공고 자료가 어디서 왔는가 — 두 상태를 섞지 않는다.
 *
 *  - LIVE 계열      공고 목록 API(청약홈·LH 수집)에서 받은 공고. 실제 수집 기록으로 신선함을 따로 판정한다
 *                   (FRESH·갱신 지연·수집 시각 미확인 — 요청 시각을 수집 시각처럼 쓰지 않는다)
 *  - VERIFIED_CASE  사람이 공고 원문(정정본)과 대조해 코드에 적어 둔 사례. 실시간 목록이 아니다.
 *                   일정이 지났으면 '지난 사례'로, 지금 신청할 수 있는 것처럼 보이지 않게 한다
 *
 * 순수 함수 — 테스트가 날짜를 넣어 검사한다.
 */
import type { VerifiedSource } from './complex-visualization'

export type CaseState = 'NOT_YET_OPEN' | 'OPEN_FOR_SPECIFIC_CATEGORY' | 'CLOSED_FOR_TODAY' | 'FULLY_CLOSED'

export interface CaseStatus {
  state: CaseState
  /** '접수 2026-11-02 ~ 11-06' 처럼 원문 일정 그대로 */
  window: string
  /** 지금 접수 중인 유형(OPEN 일 때만) — 그 유형 자격자만 신청할 수 있다 */
  category: string | null
  /** 다음 접수 시작(있으면) — 한국시간 표기 'MM-DD HH:MM' */
  next: { label: string; at: string } | null
  /** 화면 한 줄 */
  text: string
}

const KST = 9 * 3_600_000
/** 한국시간 'YYYY-MM-DD' */
export const kstDay = (t: number) => new Date(t + KST).toISOString().slice(0, 10)
/** 한국시간 'YYYY.MM.DD HH:MM' */
export function kstStamp(iso: string | null): string | null {
  const t = iso ? Date.parse(iso) : NaN
  if (!Number.isFinite(t)) return null
  const k = new Date(t + KST).toISOString()
  return `${k.slice(0, 4)}.${k.slice(5, 7)}.${k.slice(8, 10)} ${k.slice(11, 16)}`
}
const kstHm = (t: number) => {
  const k = new Date(t + KST).toISOString()
  return `${k.slice(5, 10)} ${k.slice(11, 16)}`
}

/**
 * 원문 접수 창으로 지금 상태를 정한다 — 한국시간, 하루 단위 접수 시간.
 *
 * 창마다 날짜별 접수 시간(10:00~17:00)을 따로 센다. 17:00 정각부터는 그날 접수가 끝난 것으로 본다.
 * 접수가 열려 있어도 '그 유형 자격자만' 넣을 수 있다 — 누구나 신청할 수 있다고 쓰지 않는다.
 * 창이 없는 사례(windows 비어 있음)는 날짜를 지어내지 않고 '원문 일정 확인'만 적는다.
 */
export function verifiedCaseStatus(src: VerifiedSource, now: Date): CaseStatus {
  const t = now.getTime()
  const sessions = (src.windows ?? [])
    .flatMap(w => w.days.map(d => ({ label: w.label, open: Date.parse(`${d}T${w.opens}:00+09:00`), close: Date.parse(`${d}T${w.closes}:00+09:00`), last: w.days[w.days.length - 1], closes: w.closes })))
    .filter(s => Number.isFinite(s.open) && Number.isFinite(s.close))
    .sort((a, b) => a.open - b.open)
  if (!sessions.length) {
    return { state: 'NOT_YET_OPEN', window: '접수 일정 원문 확인', category: null, next: null, text: '접수 일정은 공고 원문에서 확인하세요' }
  }
  const first = sessions[0]
  const final = sessions[sessions.length - 1]
  const window = `접수 ${kstDay(first.open)} ~ ${kstDay(final.close).slice(5)}`
  const live = sessions.find(s => t >= s.open && t < s.close)
  if (live) {
    const until = kstDay(live.close) === live.last ? `오늘 ${live.closes}까지 · 이 유형 마지막 날` : `오늘 ${live.closes}까지 · 이 유형 ${live.last.slice(5)} 마감`
    return {
      state: 'OPEN_FOR_SPECIFIC_CATEGORY',
      window,
      category: live.label,
      next: null,
      text: `지금은 ${live.label}만 접수(${until}) — 해당 자격자만 신청할 수 있습니다. 자격은 공고 원문에서 확인`,
    }
  }
  if (t >= final.close) {
    return { state: 'FULLY_CLOSED', window, category: null, next: null, text: `지난 사례 — 접수가 끝났습니다(${kstDay(final.close)} 17:00). 지금 신청할 수 없습니다` }
  }
  const up = sessions.find(s => s.open > t)!
  const next = { label: up.label, at: kstHm(up.open) }
  // 오늘 접수 시간이 이미 끝났고 뒤에 남은 날이 있으면 '오늘 마감', 아직 오늘(또는 첫날) 시작 전이면 '접수 전'
  const closedToday = sessions.some(s => kstDay(s.close) === kstDay(t) && t >= s.close)
  if (closedToday) {
    return { state: 'CLOSED_FOR_TODAY', window, category: null, next, text: `오늘 접수 시간이 끝났습니다 — 다음 접수 ${next.at} ${next.label}` }
  }
  return { state: 'NOT_YET_OPEN', window, category: null, next, text: `접수 전 — ${next.at}부터 ${next.label}` }
}

/* ── 공고 목록의 신선도 — 요청 시각·원문 게시 시각·실제 수집 시각을 가른다 ── */

export type FreshState = 'FRESH' | 'STALE' | 'UNKNOWN' | 'FIXTURE'

export interface IngestMeta {
  state: FreshState
  /** 이 응답을 만든 서버 시각 — 수집 시각이 아니다 */
  requestedAt: string
  /** 수집 실행 기록(routine_runs · sync-notices)상 마지막으로 한 출처라도 받아 저장한 실행의 종료 시각 */
  lastIngestedAt: string | null
  /** 저장된 공고 행의 가장 최근 변경 시각 — 좌표·보강 쓰기도 포함하므로 수집 시각으로 쓰지 않고 '이보다 늦지 않다'의 근거로만 쓴다 */
  latestRowAt: string | null
  /** 원문 게시 시각 — 저장하지 않으므로 늘 null(지어내지 않는다) */
  sourcePublishedAt: null
  basis: 'RUN_LOG' | 'ROW' | 'NONE' | 'FIXTURE'
  staleAfterHours: number
}

/** 매일 09:00 수집 기준 — 하루 + 여유 6시간 */
export const STALE_AFTER_HOURS = 30

/**
 * 보수적으로 판정한다.
 *  - 신선(FRESH)은 수집 실행 기록으로만 말한다.
 *  - 지연(STALE)은 실행 기록이 오래됐고 행 변경도 그보다 새롭지 않을 때, 또는 기록이 없어도 행 변경조차 오래됐을 때.
 *  - 실행 기록은 오래됐는데 행이 최근에 바뀌었다면(수동 수집인지 보강 쓰기인지 가를 수 없다) 미확인.
 */
export function judgeFreshness(i: { now: Date; lastRunOkAt: string | null; latestRowAt: string | null; staleAfterHours?: number }): Pick<IngestMeta, 'state' | 'basis' | 'lastIngestedAt'> {
  const h = i.staleAfterHours ?? STALE_AFTER_HOURS
  const age = (iso: string | null) => (iso && Number.isFinite(Date.parse(iso)) ? (i.now.getTime() - Date.parse(iso)) / 3_600_000 : null)
  const run = age(i.lastRunOkAt)
  const row = age(i.latestRowAt)
  if (run !== null && run <= h) return { state: 'FRESH', basis: 'RUN_LOG', lastIngestedAt: i.lastRunOkAt }
  if (run !== null && (row === null || row > h)) return { state: 'STALE', basis: 'RUN_LOG', lastIngestedAt: i.lastRunOkAt }
  if (run === null && row !== null && row > h) return { state: 'STALE', basis: 'ROW', lastIngestedAt: null }
  return { state: 'UNKNOWN', basis: 'NONE', lastIngestedAt: null }
}

export interface DataModeLabel {
  kind: 'LIVE' | 'STALE' | 'UNKNOWN' | 'FIXTURE' | 'VERIFIED_CASE'
  title: string
  detail: string
}

/** 공고 목록 표 — 초록 점은 수집 기록으로 신선함이 확인될 때만 */
export function liveLabel(source: string | null, meta: IngestMeta | null): DataModeLabel {
  const from = source ?? '청약홈·LH 공고 목록'
  if (!meta) return { kind: 'UNKNOWN', title: '수집 시각 미확인', detail: `${from} · 목록을 언제 수집했는지 확인하지 못했습니다` }
  if (meta.state === 'FIXTURE') return { kind: 'FIXTURE', title: '검증용 가상 공고', detail: '미리보기 확인용으로 지어낸 공고 — 실제 공고가 아닙니다' }
  if (meta.state === 'FRESH') return { kind: 'LIVE', title: '최근 수집 공고', detail: `${from} · ${kstStamp(meta.lastIngestedAt)} 수집 확인` }
  if (meta.state === 'STALE') {
    const at = meta.basis === 'RUN_LOG' ? `마지막 확인 수집 ${kstStamp(meta.lastIngestedAt)}` : `${kstStamp(meta.latestRowAt)} 이후 수집·변경 기록 없음`
    return { kind: 'STALE', title: '갱신 지연', detail: `${from} · ${at} · 그 뒤 새 공고·변경이 빠졌을 수 있습니다` }
  }
  return { kind: 'UNKNOWN', title: '수집 시각 미확인', detail: `${from} · 목록을 언제 수집했는지 확인하지 못했습니다` }
}

/** 첫 화면 한 줄 — 'MM.DD HH:MM 수집' · '갱신 지연 · 마지막 수집 …' · '수집 시각 미확인' */
export function freshLine(meta: IngestMeta | null): string {
  const short = (iso: string | null) => kstStamp(iso)?.slice(5) ?? null
  if (!meta) return '수집 시각 미확인'
  if (meta.state === 'FIXTURE') return '검증용 가상 공고'
  if (meta.state === 'FRESH') return `${short(meta.lastIngestedAt)} 수집`
  if (meta.state === 'STALE') return meta.basis === 'RUN_LOG' ? `갱신 지연 · 마지막 수집 ${short(meta.lastIngestedAt)}` : `갱신 지연 · ${short(meta.latestRowAt)} 이후 기록 없음`
  return '수집 시각 미확인'
}

export function caseLabel(src: VerifiedSource, today: Date): DataModeLabel {
  const st = verifiedCaseStatus(src, today)
  return {
    kind: 'VERIFIED_CASE',
    title: st.state === 'FULLY_CLOSED' ? '지난 사례 · 원문 검증' : '검증 사례 · 원문 대조',
    detail: `공고 원문(정정본) ${src.checkedAt} 대조 · 실시간 목록과 별개 · ${st.text}`,
  }
}
