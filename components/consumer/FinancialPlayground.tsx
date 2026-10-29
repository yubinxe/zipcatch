'use client'

import { useId, useMemo, useRef, useState } from 'react'
import { cumulative, type CostInput } from '@/lib/consumer/housing-cost'
import { FEATURES } from '@/lib/features'

/**
 * 세 갈래 주거비 — 보증금 많고 월세 적은 집, 그 반대, 그 사이를 같은 기간 위에 겹친다.
 *
 * 계산식은 위의 주거비 계산기와 같다(lib/consumer/housing-cost). 여기서 더하는 것은
 * '시간'이다. 매달 차이가 작아도 2년이면 얼마인지, 어느 쪽이 언제부터 앞서는지.
 * 실선은 통장에서 실제로 나가는 돈, 점선은 거기에 내 보증금이 못 받는 이자를 더한 것.
 * 기본값은 조작용 예시이며 특정 공고의 금액이 아니다.
 */

type Shared = Pick<CostInput, 'loanPct' | 'loanRate' | 'saveRate'>
interface Scn {
  name: string
  deposit: number
  rent: number
  fee: number
}

const INIT: Scn[] = [
  { name: '보증금형', deposit: 15000, rent: 10, fee: 8 },
  { name: '중간형', deposit: 6500, rent: 32, fee: 8 },
  { name: '월세형', deposit: 1000, rent: 60, fee: 8 },
]
const SHARED: Shared = { loanPct: 70, loanRate: 2.5, saveRate: 2.0 }
const COLORS = ['var(--title)', 'var(--accent)', '#7D6320']

function won(man: number) {
  const v = Math.round(man)
  if (Math.abs(v) >= 10000) {
    const e = Math.trunc(v / 10000)
    const r = Math.abs(v % 10000)
    return r ? `${e}억 ${r.toLocaleString('ko-KR')}만원` : `${e}억원`
  }
  return `${v.toLocaleString('ko-KR')}만원`
}

function Num({
  label,
  value,
  unit,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  unit: string
  min: number
  max: number
  step: number
  onChange: (n: number) => void
}) {
  const id = useId()
  return (
    <div className="fp-num">
      <label htmlFor={id}>
        {label}
        <output className="cs-num">
          {unit === '만원' ? won(value) : `${value}${unit}`}
        </output>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ ['--p' as string]: `${((value - min) / (max - min)) * 100}%` }}
      />
    </div>
  )
}

export default function FinancialPlayground() {
  const [scns, setScns] = useState<Scn[]>(INIT)
  const [shared, setShared] = useState<Shared>(SHARED)
  const [months, setMonths] = useState(24)
  const [cursor, setCursor] = useState<number | null>(null)
  const plot = useRef<SVGSVGElement>(null)

  const lines = useMemo(
    () => scns.map(s => cumulative({ ...shared, deposit: s.deposit, rent: s.rent, fee: s.fee }, months)),
    [scns, shared, months],
  )
  const top = Math.max(1, ...lines.map(l => l.total[months]))
  const W = 640
  const H = 260
  const x = (k: number) => (k / months) * W
  const y = (v: number) => H - (v / top) * H
  const path = (arr: number[]) => arr.map((v, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const at = cursor ?? months
  const ranked = lines.map((l, i) => ({ i, cash: l.cash[at], total: l.total[at] })).sort((a, b) => a.total - b.total)

  if (!FEATURES.playground) return null

  const setScn = (i: number, key: keyof Scn) => (n: number) =>
    setScns(prev => prev.map((s, j) => (j === i ? { ...s, [key]: n } : s)))

  const track = (clientX: number) => {
    const r = plot.current?.getBoundingClientRect()
    if (!r) return
    const k = Math.round(((clientX - r.left) / r.width) * months)
    setCursor(Math.max(0, Math.min(months, k)))
  }

  return (
    <div className="fp">
      <div className="fp-head">
        <h3 className="fp-title">세 갈래로 견주기</h3>
        <p className="fp-sub">같은 집을 보증금과 월세의 배합만 바꿔 놓고, 시간이 지나며 비용이 어떻게 벌어지는지 봅니다.</p>
      </div>

      <div className="fp-scns">
        {scns.map((s, i) => {
          const m = lines[i].monthly
          return (
            <fieldset key={i} className="fp-scn" style={{ ['--c' as string]: COLORS[i] }}>
              <legend>
                <i aria-hidden="true" />
                {s.name}
              </legend>
              <Num label="보증금" unit="만원" value={s.deposit} min={0} max={40000} step={100} onChange={setScn(i, 'deposit')} />
              <Num label="월 임대료" unit="만원" value={s.rent} min={0} max={200} step={1} onChange={setScn(i, 'rent')} />
              <Num label="관리비" unit="만원" value={s.fee} min={0} max={50} step={1} onChange={setScn(i, 'fee')} />
              <dl className="fp-scn__out">
                <div>
                  <dt>매달 실제 지출</dt>
                  <dd className="cs-num">{m.cash.toFixed(1)}만원</dd>
                </div>
                <div>
                  <dt>+ 기회비용</dt>
                  <dd className="cs-num">{m.forgone.toFixed(1)}만원</dd>
                </div>
                <div>
                  <dt>처음 마련할 내 돈</dt>
                  <dd className="cs-num">{won(m.own)}</dd>
                </div>
              </dl>
            </fieldset>
          )
        })}
      </div>

      <div className="fp-shared">
        <Num label="보증금 중 대출" unit="%" value={shared.loanPct} min={0} max={100} step={5} onChange={n => setShared(p => ({ ...p, loanPct: n }))} />
        <Num label="대출 금리" unit="%" value={shared.loanRate} min={0} max={8} step={0.1} onChange={n => setShared(p => ({ ...p, loanRate: n }))} />
        <Num label="예금 금리" unit="%" value={shared.saveRate} min={0} max={6} step={0.1} onChange={n => setShared(p => ({ ...p, saveRate: n }))} />
        <Num label="기간" unit="개월" value={months} min={6} max={120} step={6} onChange={n => (setMonths(n), setCursor(null))} />
      </div>

      <figure className="fp-chart">
        <figcaption className="fp-read" aria-live="polite">
          <span className="fp-read__at">{at}개월째 누적</span>
          {ranked.map(r => (
            <span key={r.i} className="fp-read__row" style={{ ['--c' as string]: COLORS[r.i] }}>
              <i aria-hidden="true" />
              {scns[r.i].name}
              <b className="cs-num">{won(r.total)}</b>
              <small className="cs-num">현금 {won(r.cash)}</small>
            </span>
          ))}
        </figcaption>
        <svg
          ref={plot}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="fp-plot"
          role="img"
          aria-label={`${months}개월 누적 주거비. ${ranked.map(r => `${scns[r.i].name} ${won(r.total)}`).join(', ')}`}
          onPointerMove={e => track(e.clientX)}
          onPointerDown={e => {
            ;(e.target as Element).setPointerCapture?.(e.pointerId)
            track(e.clientX)
          }}
          onPointerLeave={() => setCursor(null)}
        >
          {[0.25, 0.5, 0.75].map(g => (
            <line key={g} x1={0} x2={W} y1={H * g} y2={H * g} className="fp-grid" />
          ))}
          {lines.map((l, i) => (
            <g key={i} style={{ ['--c' as string]: COLORS[i] }}>
              <path d={path(l.total)} className="fp-line fp-line--total" />
              <path d={path(l.cash)} className="fp-line" />
            </g>
          ))}
          {cursor !== null && <line x1={x(cursor)} x2={x(cursor)} y1={0} y2={H} className="fp-cursor" />}
        </svg>
        <div className="fp-axis" aria-hidden="true">
          <span>0</span>
          <span>{Math.round(months / 2)}개월</span>
          <span>{months}개월</span>
        </div>
        <ul className="fp-legend">
          <li>
            <i data-k="cash" aria-hidden="true" />
            실선 — 실제 현금지출 (월세·관리비·대출이자)
          </li>
          <li>
            <i data-k="total" aria-hidden="true" />
            점선 — 기회비용 포함 (내 보증금이 못 받는 예금이자)
          </li>
        </ul>
      </figure>

      <p className="fp-note">
        보증금 원금은 돌려받는 돈이라 누적 비용에 넣지 않았습니다. 금리·관리비는 조작용 예시이며, 실제 대출 금리는
        상품·소득에 따라 다릅니다. 보증금을 돌려받지 못할 위험(전세보증 등)은 이 계산에 들어 있지 않습니다.
      </p>
    </div>
  )
}
