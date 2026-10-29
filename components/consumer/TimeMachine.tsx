'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { KOREA_PROVINCES, KOREA_VISUAL_VIEWBOX } from '@/lib/korea-map-data'
import { KOREA_REGIONS } from '@/lib/korea-regions'
import { addDays, diffDays, readDay, series, type TimelineNotice } from '@/lib/consumer/timeline-core'

interface TimelineData {
  today: string
  from: string
  to: string
  notices: TimelineNotice[]
  undated: number
  collectedAt: string | null
}

const NAME_BY_CODE = Object.fromEntries(KOREA_REGIONS.map(r => [r.code, r.name]))
const WEEK = ['일', '월', '화', '수', '목', '금', '토']

function dateLabel(day: string) {
  const [y, m, d] = day.split('-').map(Number)
  const w = WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return { ymd: `${y}. ${m}. ${d}.`, w }
}

function relation(day: string, today: string) {
  const n = diffDays(today, day)
  if (n === 0) return { tone: 'now', text: '오늘' }
  if (n < 0) return { tone: 'past', text: `${-n}일 전 · 지난 일정` }
  return { tone: 'future', text: `${n}일 뒤 · 예정 일정` }
}

/** 0~4 단계. 한 건만 있어도 비어 보이지 않게 첫 단계는 1 */
function shade(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || max <= 0) return 0
  return Math.max(1, Math.min(4, Math.ceil((count / max) * 4))) as 1 | 2 | 3 | 4
}

/**
 * 타임머신 — 날짜를 옮기면 지도가 그날의 공고 상태로 바뀐다.
 *
 * 지도 화면 아래에 덧붙는 독립 조각이다. 위의 카카오 지도·목록은 건드리지 않는다.
 * 지도는 첫 화면과 같은 시도 경로(SVG)를 쓴다 — 날짜를 끌 때마다 WebGL 을 다시 그리지 않도록.
 */
export default function TimeMachine() {
  const [data, setData] = useState<TimelineData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [day, setDay] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [focus, setFocus] = useState<string | null>(null)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/notices/timeline', { cache: 'no-store' })
      .then(async r => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? '일정을 불러오지 못했습니다.')
        return j as TimelineData
      })
      .then(j => {
        if (!alive) return
        setData(j)
        setDay(j.today)
      })
      .catch(e => alive && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      alive = false
    }
  }, [])

  const total = data ? diffDays(data.from, data.to) : 0
  const index = data && day ? diffDays(data.from, day) : 0
  const bars = useMemo(() => (data ? series(data.notices, data.from, data.to) : []), [data])
  const peak = useMemo(() => Math.max(1, ...bars.map(b => b.open + b.upcoming)), [bars])
  const read = useMemo(() => (data && day ? readDay(data.notices, day) : null), [data, day])
  const names = useMemo(() => new Map((data?.notices ?? []).map(n => [n.id, n])), [data])

  const provinces = useMemo(() => {
    if (!read) return []
    return Object.entries(read.byProvince)
      .map(([name, v]) => ({ name, ...v }))
      .filter(p => p.open + p.upcoming > 0)
      .sort((a, b) => b.open - a.open || b.upcoming - a.upcoming || a.name.localeCompare(b.name, 'ko'))
  }, [read])
  const maxOpen = Math.max(0, ...provinces.map(p => p.open))
  const placed = new Set(KOREA_REGIONS.map(r => r.name))
  const unplaced = provinces.filter(p => !placed.has(p.name)).reduce((s, p) => s + p.open + p.upcoming, 0)

  const stop = useCallback(() => {
    setPlaying(false)
    if (timer.current) window.clearInterval(timer.current)
    timer.current = null
  }, [])

  const go = useCallback(
    (next: number) => {
      if (!data) return
      setDay(addDays(data.from, Math.max(0, Math.min(total, next))))
    },
    [data, total],
  )

  // 재생 — 하루씩 넘긴다. 끝에 닿으면 멈춘다
  useEffect(() => {
    if (!playing || !data) return
    timer.current = window.setInterval(() => {
      setDay(d => {
        if (!d) return d
        if (d >= data.to) {
          setPlaying(false)
          return d
        }
        return addDays(d, 1)
      })
    }, 260)
    return () => {
      if (timer.current) window.clearInterval(timer.current)
      timer.current = null
    }
  }, [playing, data])

  const play = () => {
    if (!data || !day) return
    if (playing) return stop()
    // 끝에서 누르면 처음부터
    if (day >= data.to) setDay(data.from)
    setPlaying(true)
  }

  return (
    <section className="cs-section tm" aria-labelledby="tm-title">
      <header className="cs-sa-head">
        <div className="cs-sa-head__t">
          <span className="cs-sa-kicker">Time Machine</span>
          <h2 className="cs-sa-h2" id="tm-title">
            날짜를 옮기면, 지도가 그날로
          </h2>
          <p className="cs-sa-sub">
            공고 원문에 적힌 접수 시작·마감일로 어느 날 어디에서 접수가 열려 있었는지, 열릴 것인지 되짚습니다.
          </p>
        </div>
      </header>

      <div className="tm-console">
        {error ? (
          <p className="tm-empty" role="alert">
            일정을 불러오지 못했습니다. {error}
          </p>
        ) : !data || !day || !read ? (
          <div className="tm-skeleton" aria-busy="true" aria-label="일정을 불러오는 중" />
        ) : data.notices.length === 0 ? (
          <p className="tm-empty">
            되짚을 공고 일정이 아직 없습니다. <Link href="/notices">공고 목록</Link>에서 지금 공고를 보세요.
          </p>
        ) : (
          <>
            <div className="tm-date" aria-live="polite">
              <p className="tm-date__d">
                {dateLabel(day).ymd}
                <span className="tm-date__w">({dateLabel(day).w})</span>
              </p>
              <span className="tm-date__rel" data-tone={relation(day, data.today).tone}>
                {relation(day, data.today).text}
              </span>
            </div>

            <div className="tm-body">
              <figure className="tm-map">
                <svg
                  viewBox={KOREA_VISUAL_VIEWBOX}
                  role="img"
                  aria-label={`${dateLabel(day).ymd} 지역별 접수 상태. 마감 전 ${read.open + read.undated}건, 접수 예정 ${read.upcoming}건`}
                >
                  {KOREA_PROVINCES.map(p => {
                    const name = NAME_BY_CODE[p.code]
                    const v = read.byProvince[name]
                    const level = shade(v?.open ?? 0, maxOpen)
                    return (
                      <path
                        key={p.code}
                        d={p.path}
                        className="tm-land"
                        data-level={level}
                        data-soon={!v?.open && v?.upcoming ? '' : undefined}
                        data-on={focus === name || undefined}
                      />
                    )
                  })}
                  {KOREA_REGIONS.map(r => {
                    const v = read.byProvince[r.name]
                    if (!v?.open) return null
                    return (
                      <text key={r.code} x={r.x} y={r.y} className="tm-num" aria-hidden="true">
                        {v.open}
                      </text>
                    )
                  })}
                </svg>
                <figcaption className="tm-legend">
                  <span>
                    <i data-k="open" aria-hidden="true" />
                    마감 전 (짙을수록 많음)
                  </span>
                  <span>
                    <i data-k="soon" aria-hidden="true" />
                    접수 예정만 있음
                  </span>
                </figcaption>
              </figure>

              <div className="tm-read">
                <dl className="tm-kpi">
                  <div>
                    <dt>마감 전</dt>
                    <dd>{read.open + read.undated}</dd>
                  </div>
                  <div>
                    <dt>접수 예정</dt>
                    <dd>{read.upcoming}</dd>
                  </div>
                  <div>
                    <dt title="원문에 접수 시작일이 없어 마감 전이라는 것만 압니다">시작일 미기재</dt>
                    <dd>
                      {read.undated}
                      {read.open + read.undated > 0 && <small>/ {read.open + read.undated}</small>}
                    </dd>
                  </div>
                </dl>

                {provinces.length > 0 ? (
                  <ol className="tm-rank" aria-label="지역별 공고">
                    {provinces.slice(0, 6).map(p => (
                      <li key={p.name} onPointerEnter={() => setFocus(p.name)} onPointerLeave={() => setFocus(null)}>
                        <span className="tm-rank__n">{p.name}</span>
                        <span className="tm-rank__bar" aria-hidden="true">
                          <i style={{ width: `${(p.open / Math.max(1, maxOpen)) * 100}%` }} />
                        </span>
                        <span className="tm-rank__v">
                          {p.open}
                          {p.upcoming > 0 && <small> +예정 {p.upcoming}</small>}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="tm-quiet">이날 열려 있거나 예정된 공고가 없습니다.</p>
                )}

                {(read.opening.length > 0 || read.closing.length > 0) && (
                  <div className="tm-today">
                    {read.opening.length > 0 && (
                      <p>
                        <b>접수 시작 {read.opening.length}</b>
                        {read.opening.slice(0, 3).map(id => names.get(id)?.name).join(' · ')}
                        {read.opening.length > 3 && ` 외 ${read.opening.length - 3}`}
                      </p>
                    )}
                    {read.closing.length > 0 && (
                      <p>
                        <b data-k="close">마감 {read.closing.length}</b>
                        {read.closing.slice(0, 3).map(id => names.get(id)?.name).join(' · ')}
                        {read.closing.length > 3 && ` 외 ${read.closing.length - 3}`}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="tm-scrub">
              <div className="tm-ctrl">
                <button type="button" className="tm-btn tm-btn--play" onClick={play} aria-pressed={playing}>
                  {playing ? '일시정지' : '재생'}
                </button>
                <button type="button" className="tm-btn" onClick={() => { stop(); go(index - 1) }} aria-label="하루 전">
                  ‹
                </button>
                <button type="button" className="tm-btn" onClick={() => { stop(); go(index + 1) }} aria-label="하루 뒤">
                  ›
                </button>
                <button
                  type="button"
                  className="tm-btn tm-btn--today"
                  onClick={() => { stop(); setDay(data.today) }}
                  disabled={day === data.today}
                >
                  오늘로
                </button>
              </div>

              <div className="tm-track">
                <svg className="tm-bars" viewBox={`0 0 ${bars.length} 40`} preserveAspectRatio="none" aria-hidden="true">
                  {bars.map((b, i) => {
                    const ho = (b.open / peak) * 38
                    const hu = (b.upcoming / peak) * 38
                    const future = b.day > data.today
                    return (
                      <g key={b.day} data-future={future || undefined} data-on={i === index || undefined}>
                        <rect x={i + 0.12} width={0.76} y={40 - ho} height={ho} className="tm-bar" />
                        <rect x={i + 0.12} width={0.76} y={40 - ho - hu} height={hu} className="tm-bar tm-bar--soon" />
                      </g>
                    )
                  })}
                </svg>
                <span
                  className="tm-mark tm-mark--today"
                  style={{ left: `${((diffDays(data.from, data.today) + 0.5) / bars.length) * 100}%` }}
                  aria-hidden="true"
                >
                  오늘
                </span>
                <span className="tm-mark tm-mark--cur" style={{ left: `${((index + 0.5) / bars.length) * 100}%` }} aria-hidden="true" />
                <input
                  type="range"
                  className="tm-range"
                  min={0}
                  max={total}
                  step={1}
                  value={index}
                  onPointerDown={stop}
                  onKeyDown={stop}
                  onChange={e => go(Number(e.target.value))}
                  aria-label="날짜"
                  aria-valuetext={`${dateLabel(day).ymd} ${relation(day, data.today).text}, 마감 전 ${read.open + read.undated}건`}
                />
              </div>
              <div className="tm-ends" aria-hidden="true">
                <span>{dateLabel(data.from).ymd}</span>
                <span>{dateLabel(data.to).ymd}</span>
              </div>
            </div>

            <p className="tm-note">
              공고 원문의 접수 일정 기준
              {data.collectedAt && <> · 마지막 수집 {data.collectedAt.slice(0, 10).replaceAll('-', '. ')}.</>}
              {' · '}수집 뒤 바뀐 일정은 아직 따로 보관하지 않아, 지난 날짜도 지금 가진 원문으로 되짚은 상태입니다.
              {data.undated > 0 && <> 마감일이 원문에 없는 {data.undated}건은 세지 않았습니다.</>}
              {unplaced > 0 && <> 지도에 없는 지역 표기 {unplaced}건은 숫자에만 넣었습니다.</>}
            </p>
          </>
        )}
      </div>
    </section>
  )
}
