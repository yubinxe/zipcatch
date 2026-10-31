'use client'

import Link from 'next/link'

import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type FocusEvent } from 'react'
import { KOREA_PROVINCES, KOREA_VISUAL_VIEWBOX } from '@/lib/korea-map-data'
import { KOREA_REGIONS } from '@/lib/korea-regions'
import Statement3D from '@/components/consumer/three/Statement3D'
import type { StatementDatum } from '@/components/consumer/three/statement-scene'
import { verifiedForNotice } from '@/lib/consumer/complex-visualization'
import { setJourney, useJourney } from '@/lib/consumer/journey-store'
import { centerOf, startDive } from '../dive/dive'
import ScrollStage from './ScrollStage'

/**
 * 장면 1 — 흩어진 공고가 한 장의 지도로 모인다.
 *
 * 내릴수록 문장이 한 단어씩 켜지고, 옆의 지도는 바로 위에서 본 평면에서 점점 뒤로
 * 누우며 입체가 된다. 공고가 많은 지역부터 차례로 불이 들어오며 솟고, 높이는 공고
 * 수에 정비례한다. 불이 들어오는 지역과 숫자는 `/api/notices/map` 의 실제 집계다 —
 * 공고가 없는 지역은 끝까지 어둡고 낮게 남는다.
 *
 * 입체는 두 겹이다. 넓은 화면에서 WebGL 이 되면 three 장면(three/Statement3D)이,
 * 그 전에·그 밖에서는 CSS 입체(평면 지도를 원근으로 눕히고, 불이 든 지역을 여러 장
 * 겹쳐 쌓아 올린 것)가 같은 칸을 채운다. 둘 다 `--p` 하나로 움직인다.
 */

const LINES: { text: string; glow?: boolean }[][] = [
  [{ text: '흩어진' }, { text: '공고를' }],
  [{ text: '한' }, { text: '장의' }, { text: '지도로,', glow: true }],
  [{ text: '내' }, { text: '조건에' }, { text: '맞게.', glow: true }],
]
const WORDS = LINES.flat().length
/** CSS 입체에서 가장 많은 지역이 쌓이는 장 수 */
const LAYERS = 12

interface Province {
  name: string
  count: number
}

interface Pin {
  id: string
  name: string
  province: string
  kind: 'RENT' | 'SALE'
  daysLeft: number | null
}

/** 한 집계(광역 하나, 또는 '전남·광주'처럼 묶여 온 둘) */
interface Group {
  name: string
  codes: string[]
  count: number
  sale: number
  rent: number
  nearest: Pin | null
  dive: { id: string; name: string } | null
}

/**
 * 키보드로 '지도에서 직접 보기'에 오면 장면의 끝(다 선 지도)으로 데려간다.
 * 무대는 화면에 붙어 있어(sticky) 브라우저가 초점 자리로 스크롤해 주지 않는다 —
 * 보이지 않는 곳에 초점이 앉지 않게 직접 옮긴다. 이미 무대가 화면을 덮고 있으면 그대로 둔다.
 */
function revealEnd(e: FocusEvent<HTMLElement>) {
  const stage = e.currentTarget.closest<HTMLElement>('.cs-stage')
  if (!stage) return
  const r = stage.getBoundingClientRect()
  const end = r.bottom - window.innerHeight
  // 무대가 화면을 덮고 장면이 거의 끝났으면(링크가 이미 보이면 — 손으로 누른 경우) 움직이지 않는다
  const p = parseFloat(stage.querySelector<HTMLElement>('.cs-stage__pin')?.style.getPropertyValue('--p') ?? '')
  if (r.top <= 1 && r.bottom >= window.innerHeight - 1 && p >= 0.8) return
  window.scrollTo({ top: window.scrollY + end, behavior: 'instant' })
}

const CODE_BY_NAME = new Map(KOREA_REGIONS.map(r => [r.name, r.code]))

export default function StatementScene() {
  const [provinces, setProvinces] = useState<Province[] | null>(null)
  const [pins, setPins] = useState<Pin[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [stamp, setStamp] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const journey = useJourney()
  const [live, setLive] = useState(false)
  const mapRef = useRef<HTMLDivElement>(null)
  const copyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ctl = new AbortController()
    fetch('/api/notices/map', { signal: ctl.signal })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((d: { total: number; provinces: Province[]; pins?: Pin[] }) => {
        setProvinces(d.provinces ?? [])
        setPins(d.pins ?? [])
        setTotal(d.total ?? 0)
        const n = new Date()
        const z = (v: number) => String(v).padStart(2, '0')
        setStamp(`${n.getFullYear()}.${z(n.getMonth() + 1)}.${z(n.getDate())} ${z(n.getHours())}:${z(n.getMinutes())}`)
      })
      .catch(() => setProvinces([]))
    return () => ctl.abort()
  }, [])

  /*
   * 지도 칸은 글이 끝나는 곳에서 시작한다 — 글자 크기가 화면 폭을 따라 바뀌므로
   * 실제 글의 오른쪽 끝을 재어 `--copy-r` 로 적는다. 어느 폭에서도 지도가 글을 덮지 않는다.
   */
  useEffect(() => {
    const copy = copyRef.current
    const map = mapRef.current
    if (!copy || !map) return
    const measure = () => {
      const base = map.parentElement?.getBoundingClientRect().left ?? 0
      let right = 0
      copy.querySelectorAll('.cs-scene__word, .cs-scene__fact, .cs-scene__go').forEach(el => {
        right = Math.max(right, el.getBoundingClientRect().right - base)
      })
      if (right > 0) map.style.setProperty('--copy-r', `${Math.round(right)}px`)
    }
    measure()
    // 글 상자의 폭은 그대로여도 숫자 줄은 집계가 오면 길어진다 — 숫자 칸마다 따로 본다
    const ro = new ResizeObserver(measure)
    ro.observe(copy)
    copy.querySelectorAll('.cs-scene__fact').forEach(el => ro.observe(el))
    return () => ro.disconnect()
  }, [provinces])

  // 공고가 많은 지역부터 순서를 매긴다. 순서가 곧 불이 들어오고 솟는 차례다
  const lit = useMemo(() => (provinces ?? []).filter(p => p.count > 0).sort((a, b) => b.count - a.count), [provinces])
  const max = lit[0]?.count ?? 0
  // 집계는 '전남·광주'처럼 둘을 묶어 오기도 한다. 지도에서는 각각에 불을 켠다
  const byCode = useMemo(() => {
    const m = new Map<string, { i: number; level: number }>()
    lit.forEach((p, i) => {
      // 공고 수에 정비례하는 높이(장 수). 공고가 있으면 적어도 한 장
      const level = Math.max(1, Math.round((p.count / max) * LAYERS))
      for (const n of p.name.split('·')) {
        const code = CODE_BY_NAME.get(n.trim())
        if (code) m.set(code, { i, level })
      }
    })
    return m
  }, [lit, max])
  const data = useMemo<StatementDatum[] | null>(
    () =>
      provinces
        ? lit.map(p => ({
            name: p.name,
            count: p.count,
            codes: p.name
              .split('·')
              .map(n => CODE_BY_NAME.get(n.trim()))
              .filter((c): c is string => !!c),
          }))
        : null,
    [provinces, lit],
  )
  const litCodes = KOREA_PROVINCES.filter(p => byCode.has(p.code))

  // 집계 한 줄마다 분양·임대·가장 가까운 마감 — 지도 집계와 같은 공고 목록에서 센다
  const groups = useMemo(() => {
    const out = new Map<string, Group>()
    for (const p of provinces ?? []) {
      out.set(p.name, {
        name: p.name,
        codes: p.name
          .split('·')
          .map(n => CODE_BY_NAME.get(n.trim()))
          .filter((c): c is string => !!c),
        count: p.count,
        sale: 0,
        rent: 0,
        nearest: null,
        dive: null,
      })
    }
    for (const pin of pins) {
      const g = out.get(pin.province)
      if (!g) continue
      if (pin.kind === 'SALE') g.sale++
      else g.rent++
      if (pin.daysLeft !== null && pin.daysLeft >= 0 && (g.nearest?.daysLeft == null || pin.daysLeft < g.nearest.daysLeft)) g.nearest = pin
      const v = verifiedForNotice(pin)
      if (v && !g.dive) g.dive = { id: v.id, name: pin.name }
    }
    return out
  }, [provinces, pins])
  const groupOf = (code: string | null) => (code ? [...groups.values()].find(g => g.codes.includes(code)) ?? null : null)
  const activeCode = hover ?? journey.region
  const picked = groupOf(activeCode)
  const pickedName = activeCode ? KOREA_REGIONS.find(r => r.code === activeCode)?.name ?? null : null
  const zero = KOREA_REGIONS.filter(r => !groupOf(r.code))
  const pick = (code: string) => setJourney({ region: code }, 'onemap')

  let w = 0
  return (
    <ScrollStage length={2.4} className="cs-scene cs-scene--statement" label="흩어진 공고를 한 장의 지도로">
      <div
        ref={mapRef}
        className="cs-scene__map"
        aria-hidden="true"
        data-3d={live ? 'on' : undefined}
        style={{ '--lit': Math.max(1, lit.length), '--layers': LAYERS } as CSSProperties}
      >
        {/* 지역 경로는 한 번만 싣고, 바닥판과 쌓는 장마다 <use> 로 다시 쓴다 */}
        <svg className="cs-sm-defs" width="0" height="0" focusable="false">
          <defs>
            {KOREA_PROVINCES.map(p => (
              <path key={p.id} id={`cs-sm-${p.code}`} d={p.path} />
            ))}
          </defs>
        </svg>

        <div className="cs-sm-relief">
          <div className="cs-sm-shadow" />
          <svg className="cs-sm-layer cs-sm-layer--base" viewBox={KOREA_VISUAL_VIEWBOX}>
            {KOREA_PROVINCES.map(p => {
              const o = byCode.get(p.code)
              return (
                <use
                  key={p.id}
                  href={`#cs-sm-${p.code}`}
                  className="cs-scene__land"
                  data-lit={o ? true : undefined}
                  style={o ? ({ '--i': o.i } as CSSProperties) : undefined}
                />
              )
            })}
          </svg>
          {Array.from({ length: LAYERS }, (_, k) => k + 1).map(j => {
            const here = litCodes.filter(p => (byCode.get(p.code)?.level ?? 0) >= j)
            if (!here.length) return null
            return (
              <svg key={j} className="cs-sm-layer" viewBox={KOREA_VISUAL_VIEWBOX} style={{ '--j': j } as CSSProperties}>
                {here.map(p => {
                  const o = byCode.get(p.code)!
                  return (
                    <use
                      key={p.id}
                      href={`#cs-sm-${p.code}`}
                      className={j === o.level ? 'cs-sm-cap' : 'cs-sm-wall'}
                      style={{ '--i': o.i, '--l': o.level } as CSSProperties}
                    />
                  )
                })}
              </svg>
            )
          })}
        </div>

        <Statement3D data={data} onLive={setLive} active={activeCode} onPick={pick} onHover={setHover} />
      </div>

      <div ref={copyRef} className="cs-wrap cs-scene__copy">
        <span className="cs-sec-eyebrow">One Map</span>
        <p className="cs-scene__words" style={{ '--n': WORDS } as CSSProperties}>
          {LINES.map((line, li) => (
            <span key={li} className="cs-scene__line">
              {line.map((word, wi) => {
                const i = w++
                // 단어 사이 띄어쓰기는 상자 밖에 둔다 — inline-block 안의 끝 공백은 사라진다
                return (
                  <Fragment key={word.text}>
                    {wi > 0 && ' '}
                    <span
                      className="cs-scene__word"
                      data-glow={word.glow || undefined}
                      style={{ '--i': i } as CSSProperties}
                    >
                      {word.text}
                    </span>
                  </Fragment>
                )
              })}
            </span>
          ))}
        </p>

        <div className="cs-scene__facts">
          <div className="cs-scene__fact">
            <b className="cs-num">{total ?? '—'}</b>
            <span>지금 접수 중·예정인 공고</span>
          </div>
        </div>

        {/* 열일곱 광역 모두에 닿는 목록 — 지도 위 표가 다 서지 못해도 여기서 고른다 */}
        <div className="cs-om-list" role="group" aria-label="지역 고르기 — 지도와 같은 선택">
          {lit.map(p => {
            const g = groups.get(p.name)
            const code = g?.codes[0]
            if (!code) return null
            return (
              <button
                key={p.name}
                type="button"
                aria-pressed={!!activeCode && !!g?.codes.includes(activeCode)}
                onClick={() => pick(code)}
                onFocus={revealEnd}
              >
                {p.name}
                <b className="cs-num">{p.count}</b>
              </button>
            )
          })}
          {provinces && zero.length > 0 && (
            <details className="cs-om-zero">
              <summary onFocus={revealEnd}>공고 0건 {zero.length}곳</summary>
              <p>{zero.map(r => r.name).join(' · ')} — 지금 집계된 접수 중·예정 공고가 없습니다.</p>
            </details>
          )}
        </div>

        {/* 장면의 끝 — 같은 지도를 손으로 움직여 보는 곳으로. 지도 화면은 이 그림에서 이어 들어간다 */}
        <Link href="/map" className="cs-scene__go" onFocus={revealEnd}>
          지도에서 직접 보기
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      </div>

      {/* 고른 지역 — 숫자는 지도 집계 그대로. 묶여 온 집계는 나누지 않는다 */}
      {provinces && !activeCode && (provinces.length > 0) && (
        <aside className="cs-om-panel cs-om-panel--hint" aria-label="지역 고르기 안내">
          <span className="cs-om-panel__k">지역을 고르세요</span>
          <p className="cs-om-panel__fine">지도를 누르거나 왼쪽 목록에서 고르면 그 지역의 공고 수·분양·임대·가장 가까운 마감이 여기에 섭니다.</p>
        </aside>
      )}
      {provinces && activeCode && (
        <aside className="cs-om-panel" aria-live="polite" aria-label="고른 지역">
          <span className="cs-om-panel__k">{picked ? picked.name : pickedName}</span>
          <div className="cs-om-panel__n">
            <b className="cs-num">{picked?.count ?? 0}</b>
            <span>건</span>
          </div>
          {picked ? (
            <>
              <p className="cs-om-panel__split">
                분양 <b className="cs-num">{picked.sale}</b> · 임대 <b className="cs-num">{picked.rent}</b>
              </p>
              <p className="cs-om-panel__due">
                {picked.nearest ? (
                  <>
                    <span>가장 가까운 마감 {picked.nearest.daysLeft === 0 ? '오늘' : `D-${picked.nearest.daysLeft}`}</span>
                    <Link href={`/notices/${picked.nearest.id}`}>{picked.nearest.name}</Link>
                  </>
                ) : (
                  <span>공고에 마감일이 적혀 있지 않아요</span>
                )}
              </p>
              {picked.codes.length > 1 && <p className="cs-om-panel__fine">{picked.name}는 공고 집계가 합쳐져 와 지역별로 나누지 않습니다.</p>}
              {picked.dive && (
                <button
                  type="button"
                  className="cs-atlas__dive"
                  onClick={e => startDive({ announcementId: picked.dive!.id, from: centerOf(e.currentTarget), region: picked.name })}
                >
                  <span className="cs-atlas__dive-k">3D 단지 탐험 가능</span>
                  <span className="cs-atlas__dive-t">{picked.dive.name}</span>
                </button>
              )}
              <Link href={`/notices?region=${encodeURIComponent(picked.codes.length > 1 ? picked.name.split('·')[0] : picked.name)}`} className="cs-om-panel__go">
                {picked.name} 공고 보기 →
              </Link>
            </>
          ) : (
            <p className="cs-om-panel__fine">지금 집계된 접수 중·예정 공고가 없습니다.</p>
          )}
          <p className="cs-om-panel__stamp">청약홈·LH 접수 중·예정 공고 · {stamp} 집계</p>
        </aside>
      )}
    </ScrollStage>
  )
}
