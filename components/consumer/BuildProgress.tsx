'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ProgressColumns, ProvinceProgress } from '@/lib/consumer/build-progress'
import Skyline3D from './three/Skyline3D'
import type { SkyTower } from './three/skyline-scene'

/**
 * 지금 짓고 있는 집 — 지역별 분양아파트 공정률(HUG).
 *
 * 청약은 당첨으로 끝나지 않는다. 계약하고, 중도금을 내고, 공사가 끝나기를
 * 기다린다. 그 기다림이 지역마다 얼마나 남았는지를 보여 준다.
 *
 * 숫자는 HUG 가 보증 사업장을 집계한 값 그대로다. 평균이 아니라 중앙값을 쓴다 —
 * 막 착공한 대단지 하나가 지역 전체를 '초기'로 끌어내리지 않게. 구간은
 * 착공 초기(30% 미만) · 골조(30~70%) · 마감(70% 이상)으로 나눈다.
 * 공정률을 입주일로 바꿔 말하지 않는다.
 *
 * 표 위의 도시는 같은 집계를 세운 그림이다 — 탑 높이는 사업장 수, 불 켜진 층은
 * 공정률 중앙값. 그림은 눈을 위한 것이고 원본은 표다. 탑을 가리키면 표의 같은
 * 줄이 밝아지고, 줄을 가리키면 탑이 밝아진다. 평면 그림이 먼저 서고, WebGL 이
 * 되는 브라우저에서만 같은 칸 위에 입체(three/Skyline3D)가 겹쳐 뜬다.
 */

interface Payload {
  ok: boolean
  reason?: string
  provinces?: ProvinceProgress[]
  columns?: ProgressColumns
  rows?: number
  apartmentsOnly?: boolean
  baseMonth?: string | null
  skipped?: number
  source?: string
}

function ym(m: string | null) {
  if (!m) return '미표기'
  const [y, mo] = m.split('-')
  return `${y}.${mo}`
}

/** 평면 그림에 세우는 지역 수 — 좁은 칸에서도 이름이 읽히는 만큼 */
const FLAT_MAX = 12

/**
 * 평면 도시 — 입체가 뜨기 전, 그리고 입체를 띄우지 않는 브라우저에서 남는 그림.
 * 같은 규칙(높이 = 사업장 수, 불 켜진 부분 = 공정률 중앙값)을 옆에서 본 모양으로 그린다.
 */
function FlatSkyline({ towers, hot }: { towers: SkyTower[]; hot: string | null }) {
  const list = towers.slice(0, FLAT_MAX)
  const max = Math.max(1, ...list.map(t => t.sites))
  const W = 1000
  const H = 420
  const base = 360
  const top = 64
  const slot = W / Math.max(list.length, 6)
  const bw = Math.min(64, slot * 0.56)
  const x0 = (W - slot * list.length) / 2
  return (
    <svg className="cs-sky__flat" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <defs>
        <linearGradient id="cs-sky-lit" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFB27A" />
          <stop offset="1" stopColor="#9A3412" />
        </linearGradient>
        <pattern id="cs-sky-win" width="8" height="10" patternUnits="userSpaceOnUse">
          <rect x="1.5" y="2" width="4" height="5" fill="rgba(255,226,196,0.55)" />
        </pattern>
      </defs>
      <line x1="0" x2={W} y1={base} y2={base} className="cs-sky__ground" />
      {list.map((t, i) => {
        const h = ((base - top) * t.sites) / max
        const lit = h * Math.max(0, Math.min(1, t.median / 100))
        const x = x0 + slot * i + (slot - bw) / 2
        const on = t.province === hot
        return (
          <g key={t.province} className="cs-sky__bar" data-on={on || undefined}>
            <rect x={x} y={base - h} width={bw} height={h - lit} className="cs-sky__frame" />
            <rect x={x} y={base - lit} width={bw} height={lit} fill="url(#cs-sky-lit)" />
            <rect x={x} y={base - lit} width={bw} height={lit} fill="url(#cs-sky-win)" />
            <text x={x + bw / 2} y={base - h - 12} className="cs-sky__num">
              {t.sites.toLocaleString('ko-KR')}
            </text>
            <text x={x + bw / 2} y={base + 34} className="cs-sky__name">
              {t.province}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export default function BuildProgress() {
  const [data, setData] = useState<Payload | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [sort, setSort] = useState<'sites' | 'median'>('sites')
  const [open, setOpen] = useState<string | null>(null)
  const [all, setAll] = useState(false)
  /** 그림과 표가 함께 가리키는 지역 */
  const [hot, setHot] = useState<string | null>(null)
  /** 입체가 첫 장을 그렸는가 — 그 전까지는 평면 그림이 보인다 */
  const [live, setLive] = useState(false)

  useEffect(() => {
    const ctl = new AbortController()
    fetch('/api/progress', { signal: ctl.signal })
      .then(r => r.json().catch(() => ({ ok: false, reason: `응답을 읽지 못했습니다 (HTTP ${r.status})` })))
      .then((json: Payload) => setData(json))
      .catch(() => {
        if (!ctl.signal.aborted) setData({ ok: false, reason: '불러오지 못했습니다.' })
      })
    return () => ctl.abort()
  }, [attempt])

  /** 그림에 세울 탑 — 사업장 많은 순. 정렬 단추와 무관하게 같은 도시를 보여 준다 */
  const towers = useMemo<SkyTower[]>(
    () =>
      (data?.ok ? data.provinces ?? [] : [])
        .filter(p => p.sites > 0)
        .map(p => ({ province: p.province, sites: p.sites, median: p.median }))
        .sort((a, b) => b.sites - a.sites || a.province.localeCompare(b.province, 'ko')),
    [data],
  )

  /** 탑을 누르면 표의 그 줄을 펼친다. 접혀 있는 지역이면 목록을 다 편다 */
  const pick = useCallback(
    (province: string | null, pointerType: string) => {
      if (!province) {
        if (pointerType !== 'mouse') setHot(null)
        return
      }
      setHot(province)
      setOpen(province)
      const rows = [...(data?.provinces ?? [])].sort((a, b) =>
        sort === 'sites' ? b.sites - a.sites : b.median - a.median || b.sites - a.sites,
      )
      if (rows.findIndex(r => r.province === province) >= 8) setAll(true)
    },
    [data, sort],
  )

  if (!data) {
    return (
      <div className="cs-bp" aria-busy="true">
        {/* 도시 그림의 자리도 미리 잡는다 — 집계가 도착할 때 아래 표가 밀려 내려가지 않게 */}
        <div className="cs-sky" aria-hidden="true">
          <div className="cs-sky__stage cs-skel" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="cs-skel" style={{ height: 58, marginTop: i ? 8 : 0 }} />
        ))}
      </div>
    )
  }

  if (!data.ok || !data.provinces) {
    return (
      <div className="cs-bp cs-bp--quiet">
        <p>공정률 자료를 지금 불러오지 못했어요.</p>
        <p className="cs-note">{data.reason} 빈 자리를 추정치로 채우지 않습니다.</p>
        <button
          className="cs-btn cs-btn--sm cs-btn--ghost"
          onClick={() => {
            setData(null)
            setAttempt(a => a + 1)
          }}
        >
          다시 시도
        </button>
      </div>
    )
  }

  if (data.provinces.length === 0) {
    return (
      <div className="cs-bp cs-bp--quiet">
        <p>이번 집계에 공사 중인 아파트 사업장이 없어요.</p>
        <p className="cs-note">
          {data.baseMonth ? `${ym(data.baseMonth)} 기준 · ` : ''}빈 자리를 추정치로 채우지 않습니다.
        </p>
      </div>
    )
  }

  const rows = [...data.provinces].sort((a, b) =>
    sort === 'sites' ? b.sites - a.sites : b.median - a.median || b.sites - a.sites,
  )
  const shown = all ? rows : rows.slice(0, 8)
  const totalSites = rows.reduce((s, r) => s + r.sites, 0)
  const lit = hot ?? open
  const summary =
    `지역별 공사 현장 그림. 탑의 높이는 공사 중인 사업장 수, 불 켜진 층은 공정률 중앙값입니다. ` +
    towers
      .slice(0, 5)
      .map(t => `${t.province} ${t.sites.toLocaleString('ko-KR')}곳 ${t.median}%`)
      .join(', ') +
    (towers.length > 5 ? ` 외 ${towers.length - 5}개 지역.` : '.') +
    ' 모든 값은 아래 표에 있습니다.'

  return (
    <div className="cs-bp">
      <div className="cs-bp__bar">
        <p className="cs-bp__sum">
          전국 <b className="cs-num">{totalSites.toLocaleString('ko-KR')}</b>곳이 공사 중
          {data.baseMonth && <span className="cs-num"> · {ym(data.baseMonth)} 기준</span>}
        </p>
        <div className="cs-bp__sort" role="group" aria-label="정렬">
          <button type="button" aria-pressed={sort === 'sites'} onClick={() => setSort('sites')}>
            사업장 많은 순
          </button>
          <button type="button" aria-pressed={sort === 'median'} onClick={() => setSort('median')}>
            공정률 높은 순
          </button>
        </div>
      </div>

      {towers.length > 0 && (
        <figure className="cs-sky" data-3d={live ? 'on' : undefined}>
          {/* 칸의 크기는 CSS 가 정한다 — 평면 그림과 입체가 같은 칸을 겹쳐 쓴다 */}
          <div className="cs-sky__stage" role="img" aria-label={summary}>
            <FlatSkyline towers={towers} hot={lit} />
            <Skyline3D towers={towers} highlight={lit} onHover={setHot} onPick={pick} onLive={setLive} />
          </div>
          <figcaption className="cs-sky__cap">
            <span data-k="h">높이 · 공사 중인 사업장 수</span>
            <span data-k="lit">불 켜진 층 · 공정률 중앙값</span>
            <span data-k="frame">철골만 선 층 · 남은 공정</span>
            <span className="cs-sky__hint">탑을 누르면 아래 표의 같은 지역이 펼쳐집니다</span>
          </figcaption>
        </figure>
      )}

      <div className="cs-bp__legend" aria-hidden="true">
        <span data-b="early">착공 초기 30% 미만</span>
        <span data-b="middle">골조 30~70%</span>
        <span data-b="late">마감 70% 이상</span>
        <span data-b="median">중앙값</span>
      </div>

      <ol className="cs-bp__list">
        {shown.map(r => {
          const isOpen = open === r.province
          const pct = (n: number) => `${(n / r.sites) * 100}%`
          return (
            <li key={r.province} data-open={isOpen || undefined} data-hot={lit === r.province || undefined}>
              <button
                type="button"
                className="cs-bp__row"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : r.province)}
                onPointerEnter={e => e.pointerType === 'mouse' && setHot(r.province)}
                onPointerLeave={e => e.pointerType === 'mouse' && setHot(null)}
                onFocus={() => setHot(r.province)}
                onBlur={() => setHot(null)}
              >
                <span className="cs-bp__name">{r.province}</span>
                <span className="cs-bp__count cs-num">
                  {r.sites}곳{r.households > 0 && <em> · {r.households.toLocaleString('ko-KR')}세대</em>}
                </span>
                <span className="cs-bp__track" aria-hidden="true">
                  <i data-b="early" style={{ width: pct(r.buckets.early) }} />
                  <i data-b="middle" style={{ width: pct(r.buckets.middle) }} />
                  <i data-b="late" style={{ width: pct(r.buckets.late) }} />
                  <b style={{ left: `${r.median}%` }} />
                </span>
                <span className="cs-bp__median cs-num">{r.median}%</span>
                <span className="cs-bp__soon cs-num">{r.soon > 0 ? `6개월 내 사용검사 ${r.soon}곳` : ''}</span>
              </button>
              {isOpen && (
                <ul className="cs-bp__sites">
                  {r.top.map(s => (
                    <li key={`${s.name}-${s.developer}-${s.progress}`}>
                      <span className="cs-bp__site">
                        {s.name}
                        {s.developer && <em>{s.developer}</em>}
                      </span>
                      <span className="cs-bp__mini" aria-hidden="true">
                        <i style={{ width: `${s.progress}%` }} />
                      </span>
                      <span className="cs-num">{s.progress}%</span>
                      <span className="cs-bp__when cs-num">사용검사 예정 {ym(s.inspection)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ol>

      {rows.length > 8 && (
        <button type="button" className="cs-bp__more" onClick={() => setAll(v => !v)}>
          {all ? '접기' : `${rows.length - 8}개 지역 더 보기`}
        </button>
      )}

      <p className="cs-note cs-bp__src">
        주택도시보증공사(HUG) 「월별 집합건물 사업장 공정율 현황」 · 공공데이터포털.
        {data.apartmentsOnly ? ' 아파트 사업장만 셌습니다.' : ' 원자료에 건물 구분이 없어 상가가 섞여 있을 수 있습니다.'}
        {!!data.skipped && ` 공정률·지역을 읽지 못한 ${data.skipped}건은 뺐습니다.`} 보증 사업장 기준이며 실제
        입주 시기와 다를 수 있습니다.
      </p>
    </div>
  )
}
