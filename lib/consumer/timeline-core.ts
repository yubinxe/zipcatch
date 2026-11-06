/**
 * 타임머신 — 날짜 하나를 고르면 그날 공고가 어떤 상태였는지(또는 일 것인지) 센다.
 *
 * 순수 함수만 둔다. `node --test` 가 그대로 불러 검사할 수 있도록 별칭 import 도 쓰지 않는다.
 *
 * 날짜는 모두 공고 원문에 적힌 접수 시작·마감일이다. 만들지 않는다:
 *  - 마감일이 없으면 어느 날에도 세지 않고 따로 센다.
 *  - 시작일이 없으면 '접수 중'으로 단정하지 않는다. 처음 저장한 날부터 마감까지 '시작일 미기재'로 센다.
 * 오늘보다 앞선 날은 원문 일정상 지난 일이고, 뒤의 날은 예정이다. 수집 뒤에 일정이 바뀐
 * 기록(변경 이력)은 아직 보관하지 않으므로 과거 날짜도 '그때의 실제 화면'이 아니라
 * '지금 보관한 원문 일정으로 되짚은 상태'다. 화면이 이 차이를 말해야 한다.
 */

export interface TimelineNotice {
  id: string
  name: string
  /** 지도의 열일곱 광역 이름 (서울·경기 …) */
  province: string
  kind: 'SALE' | 'RENT'
  /** YYYY-MM-DD 또는 null */
  start: string | null
  end: string | null
  /**
   * 집캐치가 이 공고를 처음 저장한 날. 시작일이 원문에 없을 때만 쓴다 —
   * 그보다 앞선 날에는 공고가 있었는지조차 모르므로 어느 상태로도 세지 않는다.
   */
  seen?: string | null
}

export type NoticeState = 'UPCOMING' | 'OPEN' | 'OPEN_UNDATED' | 'CLOSED' | 'UNKNOWN'

const DAY = 86_400_000

/** YYYY-MM-DD 만 남긴다. 형식이 아니면 null */
export function dayKey(v: string | null | undefined): string | null {
  const s = (v ?? '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

export function addDays(key: string, n: number): string {
  const t = Date.parse(`${key}T00:00:00Z`) + n * DAY
  return new Date(t).toISOString().slice(0, 10)
}

export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY)
}

/** 그날 이 공고의 상태 */
export function stateOn(n: Pick<TimelineNotice, 'start' | 'end' | 'seen'>, day: string): NoticeState {
  const end = dayKey(n.end)
  const start = dayKey(n.start)
  if (!end) return 'UNKNOWN'
  if (day > end) return 'CLOSED'
  if (!start) {
    const seen = dayKey(n.seen)
    return seen && day < seen ? 'UNKNOWN' : 'OPEN_UNDATED'
  }
  return day < start ? 'UPCOMING' : 'OPEN'
}

export interface DayRead {
  day: string
  open: number
  upcoming: number
  undated: number
  closed: number
  /** 그날 접수가 시작되는 공고 */
  opening: string[]
  /** 그날 접수가 끝나는 공고 */
  closing: string[]
  byProvince: Record<string, { open: number; upcoming: number }>
}

export function readDay(notices: TimelineNotice[], day: string): DayRead {
  const out: DayRead = { day, open: 0, upcoming: 0, undated: 0, closed: 0, opening: [], closing: [], byProvince: {} }
  for (const n of notices) {
    const s = stateOn(n, day)
    if (s === 'UNKNOWN') continue
    if (s === 'CLOSED') {
      out.closed++
      continue
    }
    const slot = (out.byProvince[n.province] ??= { open: 0, upcoming: 0 })
    if (s === 'UPCOMING') {
      out.upcoming++
      slot.upcoming++
    } else {
      // 시작일 미기재도 마감 전이면 지도에는 '열려 있을 수 있는' 쪽으로 칠한다. 합계는 따로 센다
      slot.open++
      if (s === 'OPEN') out.open++
      else out.undated++
    }
    if (dayKey(n.start) === day) out.opening.push(n.id)
    if (dayKey(n.end) === day) out.closing.push(n.id)
  }
  return out
}

/**
 * 되감을 수 있는 구간.
 *
 * 원문 일정이 닿는 가장 이른 시작일부터 가장 늦은 마감일까지. 너무 길면 오늘 기준
 * 앞뒤 `span` 일로 자른다 — 1년 전 한 건 때문에 막대가 실처럼 가늘어지지 않게.
 */
export function timelineRange(notices: TimelineNotice[], today: string, span = 90) {
  let lo = today
  let hi = today
  for (const n of notices) {
    const s = dayKey(n.start) ?? dayKey(n.seen) ?? dayKey(n.end)
    const e = dayKey(n.end)
    if (s && s < lo) lo = s
    if (e && e > hi) hi = e
  }
  const min = addDays(today, -span)
  const max = addDays(today, span)
  return { from: lo < min ? min : lo, to: hi > max ? max : hi }
}

/** 구간 전체의 날별 합계 — 막대 그래프용 */
export function series(notices: TimelineNotice[], from: string, to: string) {
  const n = diffDays(from, to)
  const rows: { day: string; open: number; upcoming: number }[] = []
  for (let i = 0; i <= n; i++) {
    const day = addDays(from, i)
    const r = readDay(notices, day)
    rows.push({ day, open: r.open + r.undated, upcoming: r.upcoming })
  }
  return rows
}
