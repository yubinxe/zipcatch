'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { SIDO, lookupLawd } from '@/lib/consumer/lawd'
import type { FlowResult } from '@/lib/market/flow'
import type { AreaBand, DealKind, Dist, FlowDeal, HouseKind, MonthPoint } from '@/lib/market/flow-core'
import PageMasthead from './PageMasthead'

/**
 * 실거래 흐름 — 지역을 고르고, 그 동네에서 실제로 어떤 값에 몇 건이 거래됐는지 본다.
 *
 * 화면의 순서가 곧 읽는 순서다: 조건 → 요약(표본 수와 함께) → 월별 흐름 →
 * 같은 숫자를 표로 → 그 달의 실제 거래 → 출처와 한계.
 *
 * 차트와 표는 같은 응답의 같은 배열을 그린다. 달을 고르면 차트·표·거래 목록이
 * 함께 그 달로 맞춰진다. 조건은 주소에 남아 새로고침·공유해도 그대로 열린다.
 */

type Resp = FlowResult & { region: string | null; error?: string }

const MONTHS = [3, 6, 12, 24] as const
const KIND_LABEL: Record<DealKind, string> = { trade: '매매', jeonse: '전세', wolse: '월세' }
const HOUSE_LABEL: Record<HouseKind, string> = { APT: '아파트', ROW: '연립·다세대', OFFI: '오피스텔' }
const BAND_LABEL: Record<AreaBand, string> = { all: '전체', u60: '60㎡ 이하', '60to85': '60~85㎡', o85: '85㎡ 초과' }

/** 만원 → '12억 3,400만' */
function man(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  const n = Math.round(v)
  const eok = Math.floor(n / 10000)
  const rest = n % 10000
  if (eok === 0) return `${rest.toLocaleString()}만`
  return rest === 0 ? `${eok}억` : `${eok}억 ${rest.toLocaleString()}만`
}

/** 축 눈금 — 짧게: 18.3억 · 9,500만 */
function tick(v: number): string {
  if (v >= 10000) return `${(v / 10000).toFixed(v >= 100000 ? 0 : 1)}억`
  return `${Math.round(v).toLocaleString()}만`
}

function shortMonth(m: string) {
  return `${m.slice(2, 4)}.${m.slice(5, 7)}`
}

interface State {
  lawd: string
  months: (typeof MONTHS)[number]
  kind: DealKind
  house: HouseKind
  band: AreaBand
  dong: string
}

const DEFAULT: State = { lawd: '11680', months: 12, kind: 'trade', house: 'APT', band: 'all', dong: '' }

function fromParams(sp: URLSearchParams): State {
  const lawd = sp.get('lawd') ?? ''
  const months = Number(sp.get('months'))
  const kind = sp.get('kind') as DealKind
  const house = sp.get('house') as HouseKind
  const band = sp.get('band') as AreaBand
  return {
    lawd: lookupLawd(lawd) ? lawd : DEFAULT.lawd,
    months: (MONTHS as readonly number[]).includes(months) ? (months as State['months']) : DEFAULT.months,
    kind: kind in KIND_LABEL ? kind : DEFAULT.kind,
    house: house in HOUSE_LABEL ? house : DEFAULT.house,
    band: band in BAND_LABEL ? band : DEFAULT.band,
    dong: (sp.get('dong') ?? '').slice(0, 20),
  }
}

function toQuery(s: State, extra: Record<string, string> = {}) {
  const p = new URLSearchParams({
    lawd: s.lawd,
    months: String(s.months),
    kind: s.kind,
    house: s.house,
    band: s.band,
    ...(s.dong ? { dong: s.dong } : {}),
    ...extra,
  })
  return p.toString()
}

function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="cs-flow__field">
      <span className="cs-flow__label" id={`seg-${label}`}>
        {label}
      </span>
      <div className="cs-flow__seg" role="group" aria-labelledby={`seg-${label}`}>
        {options.map(o => (
          <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function TradeFlow() {
  const sp = useSearchParams()
  const router = useRouter()
  const state = useMemo(() => fromParams(new URLSearchParams(sp.toString())), [sp])
  const hit = lookupLawd(state.lawd)
  const [data, setData] = useState<{ key: string; body: Resp | null; error: string | null } | null>(null)
  const [focus, setFocus] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const key = toQuery(state) + `#${nonce}`
  const loading = data?.key !== key
  const body = data?.key === key ? data.body : null
  const error = data?.key === key ? data.error : null

  useEffect(() => {
    let alive = true
    const ctrl = new AbortController()
    fetch(`/api/market/flow?${toQuery(state)}`, { signal: ctrl.signal })
      .then(async r => {
        const j = (await r.json()) as Resp
        if (!r.ok) throw new Error(j.error ?? '불러오지 못했습니다.')
        return j
      })
      .then(j => alive && setData({ key, body: j, error: null }))
      .catch(e => {
        if (!alive || (e instanceof DOMException && e.name === 'AbortError')) return
        setData({ key, body: null, error: e instanceof Error ? e.message : '불러오지 못했습니다.' })
      })
    return () => {
      alive = false
      ctrl.abort()
    }
    // state 는 key 에 그대로 담겨 있다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const set = useCallback(
    (patch: Partial<State>) => {
      const next = { ...state, ...patch }
      // 지역이나 거래 종류가 바뀌면 그 지역에 없는 동이 남지 않게 비운다
      if (patch.lawd !== undefined || patch.kind !== undefined || patch.house !== undefined) next.dong = patch.dong ?? ''
      setFocus(null)
      router.replace(`/flow?${toQuery(next)}`, { scroll: false })
    },
    [state, router],
  )

  // 시·도는 지역 코드에서 따라 나온다 — 시·도를 바꾸면 그 첫 시·군·구로 옮겨 간다
  const sido = hit?.sido ?? SIDO[0]
  const sidoCode = sido.code
  const series = body?.series ?? []
  const focused = focus ? series.find(p => p.month === focus) ?? null : null
  const recent = (body?.recent ?? []).filter(d => !focus || d.month === focus)
  const isTrade = state.kind === 'trade'
  const unit = isTrade ? '거래금액' : '보증금'

  return (
    <div className="cs-flow">
      <PageMasthead
        eyebrow="MARKET FLOW"
        title="실거래 흐름"
        lead={
          <>
            국토교통부에 신고된 실거래를 지역·기간·거래 종류로 모아 봅니다. 대표값은 <b>중앙값</b>이고, 언제나
            <b> 표본 수</b>와 함께 적습니다.
          </>
        }
      />

      <div className="cs-wrap cs-flow__body">
        {/* ── 조건 ─────────────────────────────────── */}
        <section className="cs-flow__controls" aria-label="조회 조건">
          <div className="cs-flow__where">
            <label className="cs-flow__field">
              <span className="cs-flow__label">시·도</span>
              <select
                value={sidoCode}
                onChange={e => {
                  const s = SIDO.find(x => x.code === e.target.value)
                  if (!s) return
                  set({ lawd: s.items[0].code })
                }}
              >
                {SIDO.map(s => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="cs-flow__field">
              <span className="cs-flow__label">시·군·구</span>
              <select value={sido.items.some(i => i.code === state.lawd) ? state.lawd : ''} onChange={e => set({ lawd: e.target.value })}>
                {!sido.items.some(i => i.code === state.lawd) && <option value="">선택</option>}
                {sido.items.map(i => (
                  <option key={i.code} value={i.code}>
                    {i.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="cs-flow__field">
              <span className="cs-flow__label">법정동</span>
              <select value={state.dong} onChange={e => set({ dong: e.target.value })} disabled={!body || body.dongs.length === 0}>
                <option value="">전체</option>
                {state.dong && !body?.dongs.some(d => d.dong === state.dong) && <option value={state.dong}>{state.dong}</option>}
                {(body?.dongs ?? []).map(d => (
                  <option key={d.dong} value={d.dong}>
                    {d.dong} ({d.count.toLocaleString()})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="cs-flow__switches">
            <Segmented
              label="거래"
              value={state.kind}
              options={(['trade', 'jeonse', 'wolse'] as DealKind[]).map(k => ({ value: k, label: KIND_LABEL[k] }))}
              onChange={kind => set({ kind })}
            />
            <Segmented
              label="주택"
              value={state.house}
              options={(['APT', 'ROW', 'OFFI'] as HouseKind[]).map(h => ({ value: h, label: HOUSE_LABEL[h] }))}
              onChange={house => set({ house })}
            />
            <Segmented
              label="기간"
              value={state.months}
              options={MONTHS.map(m => ({ value: m, label: `${m}개월` }))}
              onChange={months => set({ months })}
            />
            <Segmented
              label="전용면적"
              value={state.band}
              options={(Object.keys(BAND_LABEL) as AreaBand[]).map(b => ({ value: b, label: BAND_LABEL[b] }))}
              onChange={band => set({ band })}
            />
          </div>
        </section>

        {/* ── 상태 ─────────────────────────────────── */}
        <div aria-live="polite" className="cs-flow__status">
          {loading && <p className="cs-flow__loading">국토교통부 실거래를 읽는 중입니다. 처음 조회하는 지역은 몇 초 걸립니다.</p>}
          {!loading && error && (
            <div className="cs-flow__alert" role="alert">
              <b>불러오지 못했습니다.</b> {error}
              <button type="button" className="cs-btn cs-btn--sm" onClick={() => setNonce(n => n + 1)}>
                다시 시도
              </button>
            </div>
          )}
          {!loading && body?.status === 'unconfigured' && (
            <div className="cs-flow__alert" role="alert">
              <b>실거래 인증키가 설정되지 않은 환경입니다.</b> 이 화면은 국토교통부 공개 API 로만 그리며, 예시 숫자를 대신
              보여주지 않습니다.
            </div>
          )}
          {!loading && body?.status === 'error' && (
            <div className="cs-flow__alert" role="alert">
              <b>모든 달의 응답을 받지 못했습니다.</b> {body.months.find(m => m.reason)?.reason}
              <button type="button" className="cs-btn cs-btn--sm" onClick={() => setNonce(n => n + 1)}>
                다시 시도
              </button>
            </div>
          )}
          {!loading && body?.status === 'partial' && (
            <p className="cs-flow__warn">
              {body.quality.failedMonths}개월은 응답을 받지 못해 비워 두었습니다(0건이 아닙니다). 그 달은 차트와 표에 ‘확인 불가’로
              표시합니다.
            </p>
          )}
        </div>

        {body && (body.status === 'ok' || body.status === 'partial') && (
          <>
            <Summary body={body} kind={state.kind} />
            <Chart series={series} kind={state.kind} focus={focus} onFocus={setFocus} unit={unit} />
            <MonthTable series={series} kind={state.kind} focus={focus} onFocus={setFocus} />
            <Deals
              deals={recent}
              kind={state.kind}
              title={focused ? `${focused.month.replace('-', '년 ')}월 계약` : '최근 계약'}
              onClear={focus ? () => setFocus(null) : null}
              csvHref={`/api/market/flow?${toQuery(state, { format: 'csv' })}`}
            />
            <Source body={body} />
            {hit && (
              <section className="cs-flow__next">
                <div>
                  <p className="cs-flow__eyebrow">NEXT</p>
                  <h2>{hit.sido.name} 청약·임대 공고와 견주어 보기</h2>
                  <p>
                    공고는 광역 단위로 모아 보여 드립니다. 이 흐름은 공고 금액의 적정성이나 당첨 가능성을 말해 주지 않습니다 —
                    같은 동네의 거래가 어땠는지를 곁에 두고 보는 자료입니다.
                  </p>
                </div>
                <Link className="cs-btn cs-btn--primary" href={`/notices?region=${encodeURIComponent(hit.sido.name)}`}>
                  {hit.sido.name} 공고 보기
                </Link>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/* ───────────────────────── 요약 ───────────────────────── */

function Summary({ body, kind }: { body: Resp; kind: DealKind }) {
  const o = body.overall
  const h = body.halves
  const thin = o.count < 10
  return (
    <section className="cs-flow__summary" aria-label="요약">
      <div className="cs-flow__stat">
        <span>표본</span>
        <b className="cs-num">{o.count.toLocaleString()}건</b>
        <small>
          {body.region}
          {body.query.dong ? ` ${body.query.dong}` : ''} · 최근 {body.query.months}개월
        </small>
      </div>
      <div className="cs-flow__stat">
        <span>{kind === 'trade' ? '거래금액 중앙값' : '보증금 중앙값'}</span>
        <b className="cs-num">{o.median === null ? '표본 부족' : man(o.median)}</b>
        <small>{o.p25 !== null && o.p75 !== null ? `가운데 절반 ${man(o.p25)} ~ ${man(o.p75)}` : '사분위는 5건부터'}</small>
      </div>
      {kind === 'trade' && body.overallPerPyeong && (
        <div className="cs-flow__stat">
          <span>전용 3.3㎡당 중앙값</span>
          <b className="cs-num">{body.overallPerPyeong.median === null ? '—' : `${man(body.overallPerPyeong.median)}원`}</b>
          <small>전용면적 기준 · 공급면적 아님</small>
        </div>
      )}
      {kind === 'wolse' && body.overallRent && (
        <div className="cs-flow__stat">
          <span>월 임대료 중앙값</span>
          <b className="cs-num">{body.overallRent.median === null ? '—' : `${body.overallRent.median.toLocaleString()}만`}</b>
          <small>보증금과 따로 셉니다</small>
        </div>
      )}
      <div className="cs-flow__stat cs-flow__stat--wide">
        <span>기간 앞뒤 비교(관측)</span>
        {h && h.medianChangePct !== null ? (
          <>
            <b className="cs-num" data-dir={h.medianChangePct > 0 ? 'up' : h.medianChangePct < 0 ? 'down' : 'flat'}>
              {h.medianChangePct > 0 ? '+' : ''}
              {h.medianChangePct}%
            </b>
            <small>
              {shortMonth(h.before.from)}~{shortMonth(h.before.to)} {man(h.before.dist.median)}({h.before.dist.count}건) →{' '}
              {shortMonth(h.after.from)}~{shortMonth(h.after.to)} {man(h.after.dist.median)}({h.after.dist.count}건)
            </small>
          </>
        ) : (
          <>
            <b className="cs-num">—</b>
            <small>신고가 끝난 달이 4개월 이상이고 양쪽 표본이 3건 이상일 때만 비교합니다</small>
          </>
        )}
      </div>
      {thin && <p className="cs-flow__thin">표본이 10건 미만입니다. 한두 건이 대표값을 크게 움직일 수 있습니다.</p>}
    </section>
  )
}

/* ───────────────────────── 차트 ───────────────────────── */

function Chart({
  series,
  kind,
  focus,
  onFocus,
  unit,
}: {
  series: MonthPoint[]
  kind: DealKind
  focus: string | null
  onFocus: (m: string | null) => void
  unit: string
}) {
  const W = 960
  const H = 360
  const pad = { l: 72, r: 16, t: 20, b: 34 }
  const priceH = 196
  const gap = 28
  const volTop = pad.t + priceH + gap
  const volH = H - pad.b - volTop
  const n = series.length
  if (n === 0) return null
  const slot = (W - pad.l - pad.r) / n
  const x = (i: number) => pad.l + slot * i + slot / 2

  const vals = series.flatMap(p => [p.value.p25, p.value.median, p.value.p75]).filter((v): v is number => v !== null)
  const lo = vals.length ? Math.min(...vals) : 0
  const hi = vals.length ? Math.max(...vals) : 1
  const span = hi - lo || hi || 1
  const yMin = Math.max(0, lo - span * 0.12)
  const yMax = hi + span * 0.12
  const y = (v: number) => pad.t + priceH - ((v - yMin) / (yMax - yMin)) * priceH
  const maxCount = Math.max(1, ...series.map(p => p.value.count))
  const ticks = [0, 0.5, 1].map(t => yMin + (yMax - yMin) * t)

  // 중앙값이 있는 달끼리만 잇는다 — 비어 있는 달을 건너뛰어 선을 메우지 않는다
  const segs: string[] = []
  let cur: string[] = []
  series.forEach((p, i) => {
    if (p.value.median === null) {
      if (cur.length) segs.push(cur.join(' '))
      cur = []
      return
    }
    cur.push(`${cur.length ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value.median).toFixed(1)}`)
  })
  if (cur.length) segs.push(cur.join(' '))

  const anyMedian = series.some(p => p.value.median !== null)

  return (
    <section className="cs-flow__chart" aria-label="월별 흐름">
      <header className="cs-flow__chart-head">
        <h2>월별 {unit} 중앙값과 거래 건수</h2>
        <ul className="cs-flow__legend" aria-hidden="true">
          <li data-k="median">중앙값</li>
          <li data-k="iqr">가운데 절반(사분위)</li>
          <li data-k="count">거래 건수</li>
          <li data-k="prov">신고 진행 중</li>
        </ul>
      </header>
      {/* 고른 달의 숫자를 차트 위에 그대로 적는다 — 그림만 보고 값을 짐작하지 않도록 */}
      <p className="cs-flow__readout" aria-live="polite">
        {(() => {
          const p = focus ? series.find(m => m.month === focus) : null
          if (!p) return '막대나 아래 달을 누르면 그 달의 숫자와 실제 거래가 펼쳐집니다.'
          if (p.failed) return `${p.month.replace('-', '.')} · 응답을 받지 못해 확인할 수 없습니다.`
          return [
            `${p.month.replace('-', '.')}`,
            `${p.value.count.toLocaleString()}건`,
            p.value.median === null ? '표본 부족' : `중앙값 ${man(p.value.median)}`,
            p.value.p25 !== null && p.value.p75 !== null ? `가운데 절반 ${man(p.value.p25)}~${man(p.value.p75)}` : '',
            p.rent?.median != null ? `월세 ${p.rent.median.toLocaleString()}만` : '',
            p.provisional ? '신고 진행 중' : '',
          ]
            .filter(Boolean)
            .join(' · ')
        })()}
      </p>
      <div className="cs-flow__plot">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`월별 ${KIND_LABEL[kind]} ${unit} 중앙값과 거래 건수. 같은 값이 아래 표에 있습니다.`}>
          {ticks.map(t => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="cs-flow__grid" />
              <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="cs-flow__tick">
                {anyMedian ? tick(t) : ''}
              </text>
            </g>
          ))}
          <text x={pad.l - 8} y={volTop + 10} textAnchor="end" className="cs-flow__tick">
            {maxCount.toLocaleString()}건
          </text>
          <line x1={pad.l} x2={W - pad.r} y1={volTop + volH} y2={volTop + volH} className="cs-flow__axis" />

          {series.map((p, i) => {
            const on = focus === p.month
            const bw = Math.min(28, slot * 0.56)
            const bh = (p.value.count / maxCount) * volH
            return (
              <g key={p.month} data-on={on || undefined} data-prov={p.provisional || undefined} data-failed={p.failed || undefined}>
                {/* 달 전체 폭을 받는 투명한 칸 — 마우스·터치로 달을 고른다 */}
                <rect
                  x={pad.l + slot * i}
                  y={pad.t}
                  width={slot}
                  height={H - pad.t - pad.b + 4}
                  className="cs-flow__hit"
                  onClick={() => onFocus(on ? null : p.month)}
                />
                {p.value.p25 !== null && p.value.p75 !== null && (
                  <rect
                    x={x(i) - bw / 2}
                    y={y(p.value.p75)}
                    width={bw}
                    height={Math.max(2, y(p.value.p25) - y(p.value.p75))}
                    rx={3}
                    className="cs-flow__iqr"
                  />
                )}
                {p.failed ? (
                  <text x={x(i)} y={volTop + volH - 6} textAnchor="middle" className="cs-flow__na">
                    확인 불가
                  </text>
                ) : (
                  <rect x={x(i) - bw / 2} y={volTop + volH - bh} width={bw} height={bh} rx={2} className="cs-flow__bar" />
                )}
                {p.volumeFlag && !p.failed && (
                  <text x={x(i)} y={volTop + volH - bh - 6} textAnchor="middle" className="cs-flow__flag">
                    {p.volumeFlag === 'high' ? '▲' : '▼'}
                  </text>
                )}
                <text x={x(i)} y={H - 12} textAnchor="middle" className="cs-flow__xlabel">
                  {n > 12 && i % 2 === 1 ? '' : shortMonth(p.month)}
                </text>
              </g>
            )
          })}
          {segs.map((d, i) => (
            <path key={i} d={d} className="cs-flow__line" />
          ))}
          {series.map((p, i) =>
            p.value.median === null ? null : (
              <circle key={p.month} cx={x(i)} cy={y(p.value.median)} r={focus === p.month ? 6 : 4} className="cs-flow__dot" data-prov={p.provisional || undefined} />
            ),
          )}
        </svg>
      </div>
      {/* 키보드로도 같은 달을 고른다 */}
      <div className="cs-flow__months" role="group" aria-label="달 고르기">
        {series.map(p => (
          <button key={p.month} type="button" aria-pressed={focus === p.month} onClick={() => onFocus(focus === p.month ? null : p.month)}>
            {shortMonth(p.month)}
          </button>
        ))}
      </div>
      <p className="cs-note">
        한 달에 3건 미만이면 중앙값을 내지 않고 선을 끊습니다. ▲▼ 는 신고가 끝난 달들의 보통 건수보다 두 배 이상·절반 이하인 달의
        <b> 관측 표시</b>이며 원인을 말하지 않습니다. 옅은 점은 계약 후 30일 신고 기한이 아직 남은 달입니다.
      </p>
    </section>
  )
}

/* ───────────────────────── 표 ───────────────────────── */

function distCell(d: Dist | null) {
  if (!d || d.count === 0) return '—'
  if (d.median === null) return '표본 부족'
  return man(d.median)
}

function MonthTable({
  series,
  kind,
  focus,
  onFocus,
}: {
  series: MonthPoint[]
  kind: DealKind
  focus: string | null
  onFocus: (m: string | null) => void
}) {
  return (
    <section className="cs-flow__table" aria-label="월별 표">
      <h2>월별 표</h2>
      <div className="cs-flow__scroll" tabIndex={0} aria-label="월별 표 (가로로 밀어 보기)">
        <table>
          <thead>
            <tr>
              <th scope="col">계약 월</th>
              <th scope="col">건수</th>
              <th scope="col">{kind === 'trade' ? '거래금액' : '보증금'} 중앙값</th>
              <th scope="col">가운데 절반</th>
              {kind === 'trade' && <th scope="col">3.3㎡당</th>}
              {kind === 'wolse' && <th scope="col">월세 중앙값</th>}
              <th scope="col">비고</th>
            </tr>
          </thead>
          <tbody>
            {[...series].reverse().map(p => (
              <tr key={p.month} data-on={focus === p.month || undefined} onClick={() => onFocus(focus === p.month ? null : p.month)}>
                <th scope="row">{p.month.replace('-', '.')}</th>
                <td className="cs-num">{p.failed ? '확인 불가' : p.value.count.toLocaleString()}</td>
                <td className="cs-num">{p.failed ? '—' : distCell(p.value)}</td>
                <td className="cs-num">{p.value.p25 !== null && p.value.p75 !== null ? `${man(p.value.p25)} ~ ${man(p.value.p75)}` : '—'}</td>
                {kind === 'trade' && <td className="cs-num">{distCell(p.perPyeong)}</td>}
                {kind === 'wolse' && <td className="cs-num">{p.rent?.median === null || !p.rent ? '—' : `${p.rent.median.toLocaleString()}만`}</td>}
                <td>
                  {[
                    p.failed ? '응답 실패' : '',
                    p.provisional ? '신고 진행 중' : '',
                    p.volumeFlag === 'high' ? '거래 많음(관측)' : p.volumeFlag === 'low' ? '거래 적음(관측)' : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/* ───────────────────────── 거래 목록 ───────────────────────── */

function Deals({
  deals,
  kind,
  title,
  onClear,
  csvHref,
}: {
  deals: FlowDeal[]
  kind: DealKind
  title: string
  onClear: (() => void) | null
  csvHref: string
}) {
  return (
    <section className="cs-flow__deals" aria-label="실제 거래">
      <header>
        <h2>{title}</h2>
        <div className="cs-flow__deal-actions">
          {onClear && (
            <button type="button" className="cs-btn cs-btn--sm cs-btn--ghost" onClick={onClear}>
              전체 기간 보기
            </button>
          )}
          <a className="cs-btn cs-btn--sm" href={csvHref} download>
            CSV 내려받기
          </a>
        </div>
      </header>
      {deals.length === 0 ? (
        <p className="cs-flow__empty">이 조건에 신고된 거래가 없습니다.</p>
      ) : (
        <ul>
          {deals.map((d, i) => (
            <li key={`${d.month}-${d.day}-${d.name}-${d.area}-${d.floor}-${i}`}>
              <div className="cs-flow__deal-main">
                <b>{d.name || '이름 없음'}</b>
                <span>
                  {d.dong} · 전용 {d.area}㎡{d.floor !== null ? ` · ${d.floor}층` : ''}
                  {d.builtYear ? ` · ${d.builtYear}년` : ''}
                </span>
              </div>
              <div className="cs-flow__deal-price cs-num">
                {kind === 'trade' ? man(d.amount) : kind === 'jeonse' ? man(d.deposit) : `${man(d.deposit)} / ${d.rent}만`}
                <small>
                  {d.month.replace('-', '.')}
                  {d.day ? `.${String(d.day).padStart(2, '0')}` : ''}
                  {d.dealing ? ` · ${d.dealing}` : ''}
                  {d.contract ? ` · ${d.contract}` : ''}
                </small>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="cs-note">목록은 최근 계약부터 최대 60건입니다. 조건에 맞는 전체 거래는 CSV 로 받습니다.</p>
    </section>
  )
}

/* ───────────────────────── 출처·한계 ───────────────────────── */

function Source({ body }: { body: Resp }) {
  const q = body.quality
  const when = new Date(body.fetchedAt)
  const prov = body.months.filter(m => m.provisional).map(m => m.month)
  return (
    <section className="cs-flow__source" aria-label="출처와 한계">
      <h2>출처와 한계</h2>
      <dl>
        <div>
          <dt>출처</dt>
          <dd>
            {body.source.agency} {body.source.label} — <code>{body.source.endpoint}</code>
          </dd>
        </div>
        <div>
          <dt>조회</dt>
          <dd>
            {when.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} · 계약 월 기준 {body.months[0]?.month} ~{' '}
            {body.months[body.months.length - 1]?.month}
          </dd>
        </div>
        <div>
          <dt>제외</dt>
          <dd>
            원자료 {q.raw.toLocaleString()}건 중 해제 {q.canceled.toLocaleString()}건 · 금액·면적 불명 {q.invalid.toLocaleString()}건 ·
            중복 {q.duplicates.toLocaleString()}건
            {q.truncatedMonths > 0 && ` · ${q.truncatedMonths}개월은 응답이 너무 커서 일부만 읽음`}
          </dd>
        </div>
        {prov.length > 0 && (
          <div>
            <dt>신고 진행 중</dt>
            <dd>{prov.join(', ')} — 계약 후 30일 안에 신고하므로 건수가 더 늘 수 있습니다.</dd>
          </div>
        )}
      </dl>
      <ul className="cs-flow__limits">
        <li>연식·층·단지 규모가 다른 거래가 한데 섞여 있습니다. 중앙값의 변화가 곧 같은 집의 값 변화는 아닙니다.</li>
        <li>신고 후 해제·정정되면 원자료가 바뀔 수 있습니다. 국토교통부 실거래가 공개시스템에서 같은 거래를 확인할 수 있습니다.</li>
        <li>이 화면은 적정 가격·당첨 가능성·투자 수익을 판단하지 않습니다.</li>
      </ul>
    </section>
  )
}
