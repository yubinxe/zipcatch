'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { KOREA_PROVINCES, KOREA_VISUAL_VIEWBOX } from '@/lib/korea-map-data'
import { KOREA_REGIONS } from '@/lib/korea-regions'
import IslandInset from './IslandInset'

/**
 * 공급 판독 — 전국 지도.
 *
 * 같은 접수 기록(마감된 공고의 1순위 주택형)을 17개 광역으로 나눠 칠한다.
 * 지표는 넷이고 뜻이 서로 다르므로 하나의 점수로 합치지 않는다 — 고른 지표 하나로만
 * 칠하고, 범례에 단위와 기준을 적는다. 기록이 없는 광역은 0 이 아니라 '자료 없음'
 * 무늬로 둔다. 지도와 같은 숫자를 아래 표로도 보여 준다(키보드·화면 읽기).
 *
 * 과거 접수 결과는 시장 참고지표다. 사업성(토지·공사비·금융·분양가)은 판정하지 않는다.
 */

export interface ProvinceSupply {
  province: string
  notices: number
  types: number
  short: number
  supply: number
  applied: number
}

type Metric = 'short' | 'demand' | 'supply' | 'notices'

const METRICS: { id: Metric; label: string; unit: string; note: string }[] = [
  { id: 'short', label: '미달 비율', unit: '%', note: '분석한 주택형 가운데 마지막 구역까지 가고도 세대가 남은 비율' },
  { id: 'demand', label: '접수 배수', unit: '배', note: '1순위 접수 ÷ 공급 세대 (모든 구역 합)' },
  { id: 'supply', label: '공급 세대', unit: '세대', note: '분석한 주택형의 공급 세대 합' },
  { id: 'notices', label: '공고 수', unit: '건', note: '접수 기록이 있는 마감 공고 수' },
]

function value(p: ProvinceSupply, m: Metric): number | null {
  if (!p.types) return null
  switch (m) {
    case 'short':
      return Math.round((p.short / p.types) * 100)
    case 'demand':
      return p.supply > 0 ? Math.round((p.applied / p.supply) * 10) / 10 : null
    case 'supply':
      return p.supply
    case 'notices':
      return p.notices
  }
}

const fmt = (v: number, m: Metric) => (m === 'demand' ? v.toFixed(1) : v.toLocaleString('ko-KR'))

export default function SupplyMap({ provinces, unplaced, notices }: { provinces: ProvinceSupply[]; unplaced: number; notices: number }) {
  const [metric, setMetric] = useState<Metric>('short')
  const [picked, setPicked] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)

  const byName = useMemo(() => new Map(provinces.map(p => [p.province, p])), [provinces])
  const vals = provinces.map(p => value(p, metric)).filter((v): v is number => v !== null)
  const max = Math.max(1, ...vals)
  const m = METRICS.find(x => x.id === metric)!

  // 기본 선택 — 고른 지표가 가장 큰 광역
  const top = [...provinces].sort((a, b) => (value(b, metric) ?? -1) - (value(a, metric) ?? -1))[0]
  const focusName = hover ?? picked ?? top?.province ?? null
  const focus = focusName ? byName.get(focusName) ?? null : null

  const level = (name: string) => {
    const p = byName.get(name)
    const v = p ? value(p, metric) : null
    if (v === null) return 'none'
    return String(Math.max(1, Math.ceil((v / max) * 5)))
  }

  const ranked = [...provinces].sort((a, b) => (value(b, metric) ?? -1) - (value(a, metric) ?? -1))

  return (
    <section className="cs-smap" aria-labelledby="cs-smap-h">
      <div className="cs-smap__head">
        <div>
          <span className="cs-sec-eyebrow">National Read</span>
          <h3 id="cs-smap-h" className="cs-smap__h">전국 공급 지도</h3>
          <p className="cs-smap__basis">
            마감된 공고 {notices}건의 1순위 접수 기록을 17개 광역으로 나눴습니다.
            {unplaced > 0 && ` 지역을 확인하지 못한 주택형 ${unplaced}개는 지도에 넣지 않았습니다.`}
          </p>
        </div>
        <div className="cs-smap__metrics" role="radiogroup" aria-label="칠할 지표">
          {METRICS.map(x => (
            <button
              key={x.id}
              type="button"
              role="radio"
              aria-checked={metric === x.id}
              className="cs-smap__metric"
              onClick={() => setMetric(x.id)}
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>

      <div className="cs-smap__body">
        <div className="cs-smap__mapbox">
          <svg className="cs-smap__map" viewBox={KOREA_VISUAL_VIEWBOX} role="img" aria-label={`전국 ${m.label} 지도`} onPointerLeave={() => setHover(null)}>
            <defs>
              <pattern id="cs-smap-none" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.4" />
              </pattern>
            </defs>
            {KOREA_PROVINCES.map(pv => {
              const geo = KOREA_REGIONS.find(r => r.code === pv.code)
              const name = geo?.name ?? pv.name
              const lv = level(name)
              return (
                <path
                  key={pv.code}
                  d={pv.path}
                  className="cs-smap__land"
                  data-level={lv}
                  data-on={name === focusName || undefined}
                  onPointerEnter={e => e.pointerType === 'mouse' && setHover(name)}
                  onClick={() => byName.get(name) && setPicked(name)}
                />
              )
            })}
          </svg>
          <IslandInset level={0} />
          <div className="cs-smap__legend" aria-hidden="true">
            <span>낮음</span>
            {[1, 2, 3, 4, 5].map(i => (
              <i key={i} data-level={i} />
            ))}
            <span>높음</span>
            <i data-level="none" className="cs-smap__nodata" />
            <span>자료 없음</span>
          </div>
        </div>

        <div className="cs-smap__panel" aria-live="polite">
          {focus ? (
            <>
              <span className="cs-smap__place">{focus.province}</span>
              <div className="cs-smap__big">
                <b className="cs-num">{value(focus, metric) === null ? '—' : fmt(value(focus, metric)!, metric)}</b>
                <span>{m.unit}</span>
              </div>
              <p className="cs-smap__metric-note">{m.label} · {m.note}</p>
              <dl className="cs-smap__facts">
                <div><dt>공고</dt><dd className="cs-num">{focus.notices}건</dd></div>
                <div><dt>주택형</dt><dd className="cs-num">{focus.types}개</dd></div>
                <div><dt>미달 주택형</dt><dd className="cs-num">{focus.short}개</dd></div>
                <div><dt>공급</dt><dd className="cs-num">{focus.supply.toLocaleString('ko-KR')}세대</dd></div>
                <div><dt>1순위 접수</dt><dd className="cs-num">{focus.applied.toLocaleString('ko-KR')}건</dd></div>
              </dl>
              <Link href="/biz" className="cs-smap__biz">
                이 지역 시장을 더 깊게 — 사업성 판독
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </Link>
            </>
          ) : (
            <p className="cs-smap__empty">지역별 접수 기록이 아직 없습니다.</p>
          )}
        </div>
      </div>

      {/* 지도와 같은 숫자 — 표가 원본이다 */}
      <div className="cs-smap__tablewrap">
        <table className="cs-smap__table">
          <caption className="cs-sr">광역별 공급 판독 — {m.label} 순</caption>
          <thead>
            <tr>
              <th scope="col">광역</th>
              <th scope="col">공고</th>
              <th scope="col">주택형</th>
              <th scope="col">미달 비율</th>
              <th scope="col">접수 배수</th>
              <th scope="col">공급 세대</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map(p => (
              <tr
                key={p.province}
                data-on={p.province === focusName || undefined}
                onClick={() => setPicked(p.province)}
                onMouseEnter={() => setHover(p.province)}
                onMouseLeave={() => setHover(null)}
              >
                <th scope="row">
                  <button type="button" className="cs-smap__rowbtn" onClick={() => setPicked(p.province)} aria-pressed={picked === p.province}>
                    {p.province}
                  </button>
                </th>
                <td className="cs-num">{p.notices}</td>
                <td className="cs-num">{p.types}</td>
                <td className="cs-num">{value(p, 'short') ?? '—'}%</td>
                <td className="cs-num">{value(p, 'demand') === null ? '—' : `${value(p, 'demand')!.toFixed(1)}배`}</td>
                <td className="cs-num">{p.supply.toLocaleString('ko-KR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="cs-smap__caveat">
        과거 접수 결과로 본 시장 참고지표입니다. 사업성은 토지가격·공사비·금융비용·분양가·분양률에 따라 달라지며 이 지도로 판정하지 않습니다.
      </p>
    </section>
  )
}
