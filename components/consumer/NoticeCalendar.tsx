'use client'

/**
 * 공고 일정을 달력에 찍는다.
 *
 * 목록으로 적으면 "2026-09-07 접수 시작 / 2026-09-17 접수 마감"이 두 줄일
 * 뿐이지만, 달력에 찍으면 그 사이가 열흘이라는 것이 보인다. 날짜를 읽는 일과
 * 기간을 가늠하는 일은 다르고, 사람이 실제로 하려는 것은 뒤쪽이다.
 *
 * 일정이 걸린 달만 그린다. 비어 있는 달을 끼워 넣으면 스크롤만 길어진다.
 */

export interface CalMark {
  date: string
  label: string
  /** 공고문에 적힌 날짜인가, 우리가 권하는 준비일인가 */
  official: boolean
}

const WEEK = ['일', '월', '화', '수', '목', '금', '토']

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function NoticeCalendar({ marks }: { marks: CalMark[] }) {
  const valid = marks.filter(m => /^\d{4}-\d{2}-\d{2}$/.test(m.date))
  if (valid.length === 0) return null

  // 일정이 걸린 달만 모은다
  const monthKeys = [...new Set(valid.map(m => m.date.slice(0, 7)))].sort()
  const today = ymd(new Date())

  const byDate = new Map<string, CalMark[]>()
  for (const m of valid) {
    byDate.set(m.date, [...(byDate.get(m.date) ?? []), m])
  }

  return (
    <div className="cs-cal2">
      {monthKeys.map(key => {
        const [y, mo] = key.split('-').map(Number)
        const first = new Date(y, mo - 1, 1)
        const days = new Date(y, mo, 0).getDate()
        // 1일이 무슨 요일인지에 따라 앞을 비운다
        const pad = first.getDay()

        return (
          <div key={key} className="cs-cal2__month">
            <div className="cs-cal2__title">
              {y}년 {mo}월
            </div>
            <div className="cs-cal2__grid">
              {WEEK.map(w => (
                <div key={w} className="cs-cal2__w" data-end={w === '일' || w === '토'}>
                  {w}
                </div>
              ))}
              {Array.from({ length: pad }).map((_, i) => (
                <div key={`p${i}`} className="cs-cal2__cell" data-empty="true" />
              ))}
              {Array.from({ length: days }).map((_, i) => {
                const date = `${key}-${String(i + 1).padStart(2, '0')}`
                const hits = byDate.get(date) ?? []
                const dow = new Date(y, mo - 1, i + 1).getDay()
                return (
                  <div
                    key={date}
                    className="cs-cal2__cell"
                    data-today={date === today}
                    data-mark={hits.length > 0}
                    data-end={dow === 0 || dow === 6}
                  >
                    <span className="cs-cal2__d">{i + 1}</span>
                    {hits.map(h => (
                      <span key={h.label} className="cs-cal2__tag" data-official={h.official}>
                        {h.label}
                      </span>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      <div className="cs-cal2__legend">
        <span className="cs-cal2__key">
          <i className="cs-cal2__dot" data-official="true" />
          공식 일정
        </span>
        <span className="cs-cal2__key">
          <i className="cs-cal2__dot" data-official="false" />
          제안 준비일
        </span>
        {valid.some(m => m.date === today) && (
          <span className="cs-cal2__key">
            <i className="cs-cal2__dot" data-today="true" />
            오늘
          </span>
        )}
      </div>
    </div>
  )
}

/** 공고와 준비 일정에서 달력에 찍을 표시를 만든다 */
export function marksFrom(
  property: {
    applicationStart: string | null
    applicationEnd: string | null
    resultDate: string | null
    contractStart: string | null
    documentDeadline: string | null
  },
  suggested: { dueDate: string | null; title: string }[],
): CalMark[] {
  const out: CalMark[] = []
  const add = (date: string | null, label: string, official: boolean) => {
    if (date) out.push({ date, label, official })
  }
  add(property.applicationStart, '접수 시작', true)
  add(property.applicationEnd, '접수 마감', true)
  add(property.documentDeadline, '서류 마감', true)
  add(property.resultDate, '당첨자 발표', true)
  add(property.contractStart, '계약 시작', true)
  for (const t of suggested) add(t.dueDate, t.title, false)
  // 같은 날 같은 이름이 두 번 찍히지 않게
  const seen = new Set<string>()
  return out.filter(m => {
    const k = `${m.date}|${m.label}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
