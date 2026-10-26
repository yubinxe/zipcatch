'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

/**
 * 마감 달력 — 네모 하나가 공고 하나다.
 *
 * 목록은 "무엇이 있는지"를 답한다. 이 그림은 "언제 움직여야 하는지"를 답한다.
 * 한 날에 스물세 건이 몰리는 것은 목록을 아무리 내려도 보이지 않는다.
 *
 * 막대 대신 네모를 쌓는다. 높이만 있는 막대는 "많다"만 말하지만, 네모를 세면
 * 몇 건인지가 그대로 읽히고 분양과 임대가 어떻게 섞였는지도 함께 보인다.
 *
 * 색은 단청의 두 색을 쓴다 — 분양은 주묵(朱), 임대는 쪽빛(藍). 원색 빨강·파랑은
 * 한지 톤의 지면에서 혼자 튀어 그래프가 아니라 경고처럼 읽힌다.
 *
 * 스물여덟 칸은 한 화면에 너무 많았다. 칸이 좁으면 네모가 점이 되고, 점은
 * 세어지지 않는다. 기본을 2주로 줄여 칸을 넓히고, 더 보고 싶은 사람만 4주로
 * 펼친다.
 */

interface Day {
  date: string
  sale: number
  rent: number
  total: number
}

interface Notice {
  id: string
  name: string
  region: string
  housingType: string
  date: string
  kind: 'SALE' | 'RENT'
  daysLeft: number | null
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

/** 칸이 넓어졌으므로 한 건만 있어도 머리에 수를 적는다 — 세지 않아도 보이게 */
const LABEL_FROM = 1
/** 네모를 무한정 쌓지 않는다. 넘치면 마지막 칸에 남은 수를 적는다 */
const MAX_CELLS = 24

function parse(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export default function DeadlineCalendar() {
  /** 기본은 2주. 칸을 넓게 두는 쪽이 세는 데 유리하다 */
  const [weeks, setWeeks] = useState<2 | 4>(2)
  /** 어떤 기간의 결과인지 함께 담아, 로딩 여부를 파생값으로 계산한다 */
  const [result, setResult] = useState<{
    key: number
    data: {
      today: string
      days: Day[]
      notices: Notice[]
      within: number
      beyond: number
      undated: number
    } | null
    error: string | null
  } | null>(null)

  const data = result?.key === weeks ? result.data : null
  const error = result?.key === weeks ? result.error : null
  /** 펼쳐 본 날짜. 한 번에 하나만 연다 */
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch(`/api/notices/calendar?weeks=${weeks}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('마감 일정을 불러오지 못했어요.'))))
      .then(json => {
        if (!alive) return
        setResult({ key: weeks, data: json.error ? null : json, error: json.error ?? null })
      })
      .catch((err: unknown) => {
        if (!alive) return
        setResult({
          key: weeks,
          data: null,
          error: err instanceof Error ? err.message : '마감 일정을 불러오지 못했어요.',
        })
      })
    return () => {
      alive = false
    }
  }, [weeks])

  if (error) {
    return (
      <section className="cs-wrap cs-section">
        <div className="cs-error">
          <span>{error}</span>
        </div>
      </section>
    )
  }

  if (!data) {
    return (
      <section className="cs-wrap cs-section">
        <div className="cs-skel" style={{ height: 320 }} />
      </section>
    )
  }

  const peak = Math.max(1, ...data.days.map(d => Math.min(d.total, MAX_CELLS)))
  const openDay = open ? data.notices.filter(n => n.date === open) : []

  return (
    <section className="cs-wrap cs-section">
      <div className="cs-cal">
        <header className="cs-cal__head">
          <div>
            <span className="cs-sec-eyebrow">Deadlines</span>
            <h2 className="cs-cal__title">앞으로 {weeks}주, 접수가 끝나는 날</h2>
            <p className="cs-cal__sub">네모 하나가 공고 하나예요.</p>
          </div>

          <div className="cs-cal__tools">
            <div className="cs-cal__legend">
              <span className="cs-cal__key">
                <i className="cs-cal__cell" data-kind="sale" />
                분양
              </span>
              <span className="cs-cal__key">
                <i className="cs-cal__cell" data-kind="rent" />
                임대
              </span>
            </div>
            <div className="cs-cal__span" role="group" aria-label="보는 기간">
              {([2, 4] as const).map(w => (
                <button
                  key={w}
                  type="button"
                  className="cs-cal__spanbtn"
                  data-on={weeks === w}
                  aria-pressed={weeks === w}
                  onClick={() => {
                    setWeeks(w)
                    setOpen(null)
                  }}
                >
                  {w}주
                </button>
              ))}
            </div>
          </div>
        </header>

        <div className="cs-cal__plot" style={{ ['--peak' as string]: peak }}>
          {data.days.map(d => {
            const dt = parse(d.date)
            const dow = dt.getDay()
            const isToday = d.date === data.today
            // 월요일마다 주가 바뀐다. 칸 사이에 괘선을 세워 주 단위로 읽히게.
            const weekEdge = dow === 1
            const shown = Math.min(d.total, MAX_CELLS)
            const over = d.total - shown

            return (
              <div
                key={d.date}
                className="cs-cal__col"
                data-today={isToday}
                data-week-edge={weekEdge}
                data-weekend={dow === 0 || dow === 6}
              >
                <div className="cs-cal__stack">
                  {d.total >= LABEL_FROM && (
                    <button
                      type="button"
                      className="cs-cal__count"
                      onClick={() => setOpen(open === d.date ? null : d.date)}
                      aria-expanded={open === d.date}
                    >
                      {d.total}건
                    </button>
                  )}
                  {/* 임대를 위에, 분양을 아래에 쌓는다. 아래가 더 무거워 보여야
                      기둥이 서 있는 것처럼 읽힌다 */}
                  {Array.from({ length: Math.min(d.rent, shown) }).map((_, i) => (
                    <i key={`r${i}`} className="cs-cal__cell" data-kind="rent" />
                  ))}
                  {Array.from({ length: Math.max(0, shown - Math.min(d.rent, shown)) }).map((_, i) => (
                    <i key={`s${i}`} className="cs-cal__cell" data-kind="sale" />
                  ))}
                  {over > 0 && <span className="cs-cal__over">+{over}</span>}
                </div>

                <div className="cs-cal__axis">
                  <span className="cs-cal__d">{dt.getDate()}</span>
                  <span className="cs-cal__w">{WEEKDAY[dow]}</span>
                </div>

                {isToday && <span className="cs-cal__today">오늘</span>}
              </div>
            )
          })}
        </div>

        {open && (
          <div className="cs-cal__list">
            <div className="cs-cal__list-head">
              <strong>
                {parse(open).getMonth() + 1}월 {parse(open).getDate()}일 마감 {openDay.length}건
              </strong>
              <button type="button" className="cs-btn cs-btn--sm cs-btn--text" onClick={() => setOpen(null)}>
                닫기
              </button>
            </div>
            <ul>
              {openDay.map(n => (
                <li key={n.id}>
                  <Link href={`/notices/${n.id}`}>
                    <span className="cs-cal__tag" data-kind={n.kind.toLowerCase()}>
                      {n.kind === 'SALE' ? '분양' : '임대'}
                    </span>
                    <span className="cs-cal__name">{n.name}</span>
                    <span className="cs-cal__meta">
                      {n.region} · {n.housingType}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <footer className="cs-cal__foot">
          <p className="cs-note">날짜 위 숫자를 누르면 그날 마감하는 공고 목록이 열립니다.</p>
          <p className="cs-note cs-num">
            {weeks}주 안 마감 {data.within}건 · 그 뒤 {data.beyond}건
            {data.undated > 0 && ` · 마감일 미공개 ${data.undated}건`}
          </p>
        </footer>
      </div>
    </section>
  )
}
