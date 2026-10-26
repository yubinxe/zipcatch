'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { KOREA_MAP_VIEWBOX, KOREA_PROVINCES } from '@/lib/korea-map-data'
import { KOREA_REGIONS } from '@/lib/korea-regions'

/**
 * 첫 화면의 지도 — 지금 열려 있는 공고가 어디에 있는가.
 *
 * 예시 카드 한 장보다 실제 숫자 하나가 강하다. 지도 위의 농담과 점은 전부
 * `/api/notices/map` 이 돌려준 접수 중·예정 공고에서 온다. 지어낸 값은 없다.
 * 공고가 없으면 지도는 비어 있는 채로 그렇다고 말한다.
 *
 * 채색 규칙은 지면과 같다. 지역은 먹의 농담으로만 칠하고, 붉은 것은
 * 가장 가까운 마감 하나뿐이다.
 *
 * 처음에는 공고가 많은 지역부터 천천히 넘겨 보여준다. 손을 대는 순간 멈추고
 * 다시 움직이지 않는다 — 읽는 사람의 손을 이기는 움직임은 없어야 한다.
 */

interface Pin {
  id: string
  name: string
  province: string
  kind: 'RENT' | 'SALE'
  daysLeft: number | null
}

interface MapResponse {
  pins: Pin[]
  total: number
  provinces: { name: string; count: number }[]
}

interface ProvinceRead {
  code: string
  name: string
  count: number
  sale: number
  rent: number
  nearest: Pin | null
}

const TOUR_MS = 3600
const TOUR_STOPS = 5

/** 0~4 단계. 가장 많은 곳을 4로 두고 나머지를 비례로 나눈다 */
function shade(count: number, max: number): number {
  if (!count || !max) return 0
  return Math.max(1, Math.ceil((count / max) * 4))
}

function dLabel(days: number | null) {
  if (days === null) return '마감일 미정'
  if (days <= 0) return '오늘 마감'
  return `D-${days}`
}

/** 바뀐 숫자까지 짧게 세어 올라간다. 움직임을 원치 않으면 바로 바뀐다 */
function useCount(target: number) {
  const [shown, setShown] = useState(target)
  const from = useRef(target)

  useEffect(() => {
    const start = from.current
    if (start === target) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      from.current = target
      const id = requestAnimationFrame(() => setShown(target))
      return () => cancelAnimationFrame(id)
    }
    const t0 = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 420)
      const eased = 1 - (1 - k) ** 3
      setShown(Math.round(start + (target - start) * eased))
      if (k < 1) raf = requestAnimationFrame(tick)
      else from.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      from.current = target
    }
  }, [target])

  return shown
}

export default function HeroAtlas() {
  const [data, setData] = useState<MapResponse | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [stamp, setStamp] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)
  const plateRef = useRef<HTMLDivElement>(null)
  /*
   * 지도 경로(약 80KB)는 문서에 굽지 않는다. 첫 화면 HTML 은 뼈대에서 본문으로
   * 바뀌는 순간이 문서를 다 받은 뒤라, 문서가 무거우면 첫 화면 전체가 늦는다.
   * 빈 <svg> 가 viewBox 비율로 자리를 먼저 잡고, 깨어난 뒤에 경로를 채운다 —
   * 자리가 이미 잡혀 있어 화면이 밀리지 않는다.
   */
  const [drawn, setDrawn] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true))
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    let alive = true
    fetch('/api/notices/map', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((json: MapResponse) => {
        if (!alive) return
        setData(json)
        setError(false)
        const now = new Date()
        setStamp(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`)
      })
      .catch(() => alive && setError(true))
    return () => {
      alive = false
    }
  }, [attempt])

  /** 지도에 있는 열일곱 광역으로 모은다. 지도에 없는 이름은 따로 센다 */
  const { reads, ranked, unplaced, max } = useMemo(() => {
    const byName = new Map<string, ProvinceRead>(
      KOREA_REGIONS.map(r => [r.name, { code: r.code, name: r.name, count: 0, sale: 0, rent: 0, nearest: null }]),
    )
    let unplaced = 0
    for (const pin of data?.pins ?? []) {
      const read = byName.get(pin.province)
      if (!read) {
        unplaced++
        continue
      }
      read.count++
      if (pin.kind === 'SALE') read.sale++
      else read.rent++
      const d = pin.daysLeft
      if (d !== null && d >= 0 && (read.nearest?.daysLeft == null || d < read.nearest.daysLeft)) {
        read.nearest = pin
      }
    }
    const all = [...byName.values()]
    const ranked = all.filter(r => r.count > 0).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'))
    return {
      reads: new Map(all.map(r => [r.code, r])),
      ranked,
      unplaced,
      max: ranked[0]?.count ?? 0,
    }
  }, [data])

  const activeCode = hover ?? selected ?? ranked[0]?.code ?? null
  const active = activeCode ? reads.get(activeCode) ?? null : null
  const total = ranked.reduce((s, r) => s + r.count, 0) + unplaced

  /** 손을 대기 전까지 많은 지역부터 넘긴다. 화면 밖이거나 탭이 숨으면 쉰다 */
  useEffect(() => {
    if (touched || ranked.length < 2) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const el = plateRef.current
    let visible = true
    const io = el
      ? new IntersectionObserver(([e]) => {
          visible = e.isIntersecting
        })
      : null
    if (el && io) io.observe(el)

    const stops = ranked.slice(0, TOUR_STOPS).map(r => r.code)
    let i = 0
    const id = window.setInterval(() => {
      if (!visible || document.hidden) return
      i = (i + 1) % stops.length
      setSelected(stops[i])
    }, TOUR_MS)
    return () => {
      window.clearInterval(id)
      io?.disconnect()
    }
  }, [ranked, touched])

  const choose = useCallback((code: string) => {
    setTouched(true)
    setSelected(code)
  }, [])

  const shownCount = useCount(active?.count ?? 0)
  const shownTotal = useCount(total)
  const loading = !data && !error
  const empty = !!data && total === 0
  const salePct = active && active.count ? Math.round((active.sale / active.count) * 100) : 0

  return (
    <div
      ref={plateRef}
      className="cs-atlas"
      data-state={loading ? 'loading' : error ? 'error' : empty ? 'empty' : 'ready'}
      onPointerEnter={() => setTouched(true)}
      onFocusCapture={() => setTouched(true)}
    >
      <div className="cs-atlas__head">
        <span className="cs-atlas__kicker">
          <i aria-hidden="true" />
          지금 열려 있는 공고
        </span>
        <span className="cs-atlas__stamp cs-num">
          {stamp ? `${stamp} 집계 · 전국 ${shownTotal.toLocaleString('ko-KR')}건` : '집계 중'}
        </span>
      </div>

      <div className="cs-atlas__body">
        {/* 지도는 손과 눈을 위한 것이다. 같은 선택을 아래 목록이 키보드로 받는다 */}
        <svg
          className="cs-atlas__map"
          viewBox={KOREA_MAP_VIEWBOX}
          role="img"
          aria-label={
            active && !empty
              ? `전국 지도. ${active.name}에 접수 중·예정 공고 ${active.count}건`
              : '전국 지도'
          }
          onPointerLeave={() => setHover(null)}
        >
          {drawn && KOREA_PROVINCES.map(p => {
            const read = reads.get(p.code)
            const level = shade(read?.count ?? 0, max)
            return (
              <path
                key={p.code}
                d={p.path}
                data-level={level}
                data-on={p.code === activeCode || undefined}
                className="cs-atlas__land"
                onPointerEnter={e => {
                  if (e.pointerType === 'mouse' && read?.count) setHover(p.code)
                }}
                onClick={() => read?.count && choose(p.code)}
              />
            )
          })}
          {drawn && KOREA_REGIONS.map(r => {
            const read = reads.get(r.code)
            if (!read?.count) return null
            const radius = 3 + Math.sqrt(read.count / Math.max(1, max)) * 9
            const on = r.code === activeCode
            return (
              <g key={r.code} className="cs-atlas__dot" data-on={on || undefined} aria-hidden="true">
                {on && <circle cx={r.x} cy={r.y} r={radius + 7} className="cs-atlas__halo" />}
                <circle cx={r.x} cy={r.y} r={radius} />
              </g>
            )
          })}
        </svg>

        <div className="cs-atlas__read" aria-live="polite">
          {loading ? (
            <>
              <div className="cs-skel" style={{ height: 18, width: '40%' }} />
              <div className="cs-skel" style={{ height: 64, width: '70%', marginTop: 14 }} />
              <div className="cs-skel" style={{ height: 70, marginTop: 22 }} />
            </>
          ) : error ? (
            <div className="cs-atlas__quiet">
              <p>지도 집계를 불러오지 못했어요.</p>
              <button className="cs-btn cs-btn--sm cs-btn--ghost" onClick={() => setAttempt(a => a + 1)}>
                다시 시도
              </button>
            </div>
          ) : empty || !active ? (
            <div className="cs-atlas__quiet">
              <p>지금 집계된 접수 중·예정 공고가 없어요.</p>
              <p className="cs-atlas__fine">비어 있는 자리를 예시로 채우지 않습니다.</p>
            </div>
          ) : (
            <>
              <span className="cs-atlas__place">{active.name}</span>
              <div className="cs-atlas__figure">
                <b className="cs-num">{shownCount}</b>
                <span>건</span>
              </div>

              <div className="cs-atlas__split" aria-label={`분양 ${active.sale}건, 임대 ${active.rent}건`}>
                <div className="cs-atlas__bar">
                  <span style={{ width: `${salePct}%` }} />
                </div>
                <div className="cs-atlas__legend">
                  <span>
                    분양 <b className="cs-num">{active.sale}</b>
                  </span>
                  <span>
                    임대 <b className="cs-num">{active.rent}</b>
                  </span>
                </div>
              </div>

              {/* 지역이 넘어갈 때마다 이 칸의 높이가 바뀌면 아래 지면이 들썩인다(사용자가
                  누르지 않은 움직임이라 CLS 로 잡힌다). 마감이 없어도 칸은 늘 같은 높이로 둔다 */}
              <div className="cs-atlas__next">
                <span className="cs-atlas__label">가장 가까운 마감</span>
                <span className="cs-atlas__due cs-num">{active.nearest ? dLabel(active.nearest.daysLeft) : ''}</span>
                <span className="cs-atlas__name">{active.nearest ? active.nearest.name : '공고에 마감일이 적혀 있지 않아요'}</span>
              </div>

              <Link href={`/notices?region=${encodeURIComponent(active.name)}`} className="cs-atlas__go">
                {active.name} 공고 보기
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* 줄 자리는 불러오는 동안에도 잡아 둔다 — 늦게 나타나며 아래를 밀지 않게 */}
      {ranked.length === 0 && <div className="cs-atlas__rank" aria-hidden="true" />}
      {ranked.length > 0 && (
        <div className="cs-atlas__rank" role="group" aria-label="지역 고르기">
          {ranked.slice(0, 8).map(r => (
            <button
              key={r.code}
              type="button"
              className="cs-atlas__chip"
              aria-pressed={r.code === activeCode}
              onClick={() => choose(r.code)}
            >
              {r.name}
              <span className="cs-num">{r.count}</span>
            </button>
          ))}
        </div>
      )}

      <p className="cs-atlas__source">
        청약홈 · LH 청약플러스 접수 중·예정 공고
        {unplaced > 0 && ` · 지역 미표기 ${unplaced}건은 지도 밖`}
        {' · 지도 윤곽 '}
        <a href="https://github.com/VictorCazanave/svg-maps" target="_blank" rel="noopener noreferrer">
          svg-maps
        </a>{' '}
        (CC BY 4.0)
      </p>
    </div>
  )
}
