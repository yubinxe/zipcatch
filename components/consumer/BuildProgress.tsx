'use client'

import { useEffect, useState } from 'react'
import type { ProgressColumns, ProvinceProgress } from '@/lib/consumer/build-progress'

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

export default function BuildProgress() {
  const [data, setData] = useState<Payload | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [sort, setSort] = useState<'sites' | 'median'>('sites')
  const [open, setOpen] = useState<string | null>(null)
  const [all, setAll] = useState(false)

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

  if (!data) {
    return (
      <div className="cs-bp" aria-busy="true">
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

  const rows = [...data.provinces].sort((a, b) =>
    sort === 'sites' ? b.sites - a.sites : b.median - a.median || b.sites - a.sites,
  )
  const shown = all ? rows : rows.slice(0, 8)
  const totalSites = rows.reduce((s, r) => s + r.sites, 0)

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
            <li key={r.province} data-open={isOpen || undefined}>
              <button
                type="button"
                className="cs-bp__row"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : r.province)}
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
