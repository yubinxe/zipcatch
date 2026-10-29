'use client'

import Link from 'next/link'
import { useId, useState } from 'react'
import { monthlyCost } from '@/lib/consumer/housing-cost'

/**
 * 한 달에 실제로 나가는 돈.
 *
 * 공고는 보증금과 월 임대료를 따로 적는다. 그런데 보증금도 공짜가 아니다 —
 * 빌렸다면 이자가 나가고, 내 돈이라면 그만큼 이자를 못 받는다. 둘을 같은
 * 단위(월)로 옮겨 놓아야 "보증금 높고 월세 낮은 집"과 그 반대를 견줄 수 있다.
 *
 * 금리는 사용자가 넣는다. 대출 상품의 금리는 소득·자산·상품마다 달라서
 * 여기서 정해 주면 틀린 숫자를 사실처럼 보이게 만든다. 기본값은 조작 예시이며
 * 화면에 그렇게 적는다.
 */

interface Field {
  key: keyof Inputs
  label: string
  unit: string
  min: number
  max: number
  step: number
  hint?: string
}

interface Inputs {
  deposit: number
  rent: number
  fee: number
  loanPct: number
  loanRate: number
  saveRate: number
  income: number
}

const DEFAULTS: Inputs = {
  deposit: 6500,
  rent: 32,
  fee: 8,
  loanPct: 70,
  loanRate: 2.5,
  saveRate: 2.0,
  income: 250,
}

const HOUSING: Field[] = [
  { key: 'deposit', label: '보증금', unit: '만원', min: 0, max: 30000, step: 100 },
  { key: 'rent', label: '월 임대료', unit: '만원', min: 0, max: 200, step: 1 },
  { key: 'fee', label: '관리비', unit: '만원', min: 0, max: 50, step: 1, hint: '공고에 없으면 직접 넣어 보세요' },
]

const MONEY: Field[] = [
  { key: 'loanPct', label: '보증금 중 대출', unit: '%', min: 0, max: 100, step: 5 },
  { key: 'loanRate', label: '대출 금리', unit: '%', min: 0, max: 8, step: 0.1, hint: '상품·소득에 따라 다릅니다' },
  { key: 'saveRate', label: '내 돈의 예금 금리', unit: '%', min: 0, max: 6, step: 0.1, hint: '보증금으로 묶여 못 받는 이자' },
  { key: 'income', label: '월 소득 (세후)', unit: '만원', min: 0, max: 1000, step: 10 },
]

/** 만원 → "1억 2,500만원" */
function won(man: number) {
  const v = Math.round(man)
  if (v >= 10000) {
    const eok = Math.floor(v / 10000)
    const rest = v % 10000
    return rest ? `${eok}억 ${rest.toLocaleString('ko-KR')}만원` : `${eok}억원`
  }
  return `${v.toLocaleString('ko-KR')}만원`
}

/** 월 금액은 소수 첫째 자리까지. 1만원 아래가 버려지면 금리 차이가 안 보인다 */
function monthly(man: number) {
  return man.toLocaleString('ko-KR', { maximumFractionDigits: 1, minimumFractionDigits: man % 1 ? 1 : 0 })
}

function Slider({ f, value, onChange }: { f: Field; value: number; onChange: (v: number) => void }) {
  const id = useId()
  const pct = ((value - f.min) / (f.max - f.min)) * 100
  return (
    <div className="cs-sim__field">
      <div className="cs-sim__row">
        <label htmlFor={id}>{f.label}</label>
        <span className="cs-sim__val cs-num">
          {f.unit === '만원' && f.key === 'deposit' ? won(value) : `${value.toLocaleString('ko-KR')}${f.unit}`}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={f.min}
        max={f.max}
        step={f.step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ '--fill': `${pct}%` } as React.CSSProperties}
        aria-describedby={f.hint ? `${id}-hint` : undefined}
      />
      {f.hint && (
        <span id={`${id}-hint`} className="cs-sim__hint">
          {f.hint}
        </span>
      )}
    </div>
  )
}

export default function CostSimulator() {
  const [v, setV] = useState<Inputs>(DEFAULTS)
  const set = (key: keyof Inputs) => (n: number) => setV(prev => ({ ...prev, [key]: n }))

  // 계산식은 세 갈래 비교(FinancialPlayground)와 함께 쓴다
  const m = monthlyCost(v)
  const parts = [
    { key: 'rent', label: '월 임대료', value: m.rent },
    { key: 'fee', label: '관리비', value: m.fee },
    { key: 'interest', label: '대출 이자', value: m.interest },
    { key: 'forgone', label: '못 받는 예금 이자', value: m.forgone },
  ]
  const sum = m.total
  const cash = m.cash
  const ratio = v.income > 0 ? (cash / v.income) * 100 : null
  // 보증금 1,000만원이 한 달에 얼마와 같은지 — 지금 넣은 조달 비율과 금리로 섞어 본다
  const blended = (v.loanPct / 100) * v.loanRate + (1 - v.loanPct / 100) * v.saveRate
  const per1000 = (1000 * blended) / 100 / 12

  return (
    <div className="cs-sim">
      <div className="cs-sim__inputs">
        <fieldset>
          <legend>집</legend>
          {HOUSING.map(f => (
            <Slider key={f.key} f={f} value={v[f.key]} onChange={set(f.key)} />
          ))}
        </fieldset>
        <fieldset>
          <legend>돈</legend>
          {MONEY.map(f => (
            <Slider key={f.key} f={f} value={v[f.key]} onChange={set(f.key)} />
          ))}
        </fieldset>
        <button type="button" className="cs-sim__reset" onClick={() => setV(DEFAULTS)}>
          예시값으로 되돌리기
        </button>
      </div>

      <div className="cs-sim__out" aria-live="polite">
        <span className="cs-sim__kicker">한 달 실부담</span>
        <div className="cs-sim__total">
          <b className="cs-num">{monthly(sum)}</b>
          <span>만원</span>
        </div>
        <p className="cs-sim__sub">
          그중 통장에서 실제로 빠져나가는 돈 <b className="cs-num">{monthly(cash)}만원</b>
        </p>

        <div className="cs-sim__stack" aria-hidden="true">
          {parts.map(p => (
            <span key={p.key} data-part={p.key} style={{ flexGrow: Math.max(p.value, 0.0001) }} />
          ))}
        </div>
        <ul className="cs-sim__parts">
          {parts.map(p => (
            <li key={p.key} data-part={p.key}>
              <i aria-hidden="true" />
              <span>{p.label}</span>
              <b className="cs-num">{monthly(p.value)}만원</b>
            </li>
          ))}
        </ul>

        {ratio !== null && (
          <div className="cs-sim__ratio">
            <div className="cs-sim__row">
              <span>소득 대비 주거비</span>
              <b className="cs-num">{ratio.toFixed(1)}%</b>
            </div>
            <div className="cs-sim__gauge" aria-hidden="true">
              <span style={{ width: `${Math.min(100, ratio)}%` }} data-over={ratio > 30 || undefined} />
              <i style={{ left: '30%' }} />
            </div>
            <span className="cs-sim__hint">
              눈금은 흔히 쓰는 참고선 30%입니다. 법정 기준이나 대출 심사 기준이 아닙니다.
            </span>
          </div>
        )}

        <p className="cs-sim__insight">
          지금 조건에서 보증금 <b>1,000만원</b>은 한 달 <b className="cs-num">{monthly(per1000)}만원</b>과 같습니다.
          보증금을 올리고 월세를 낮추는 쪽이 유리한지는 이 숫자와 월세 차이를 견줘 보면 됩니다.
        </p>

        <details className="cs-sim__how">
          <summary>계산식 보기</summary>
          <ul>
            <li>대출 이자 = 보증금 × 대출 비율 × 대출 금리 ÷ 12</li>
            <li>못 받는 예금 이자 = 보증금 중 내 돈 × 예금 금리 ÷ 12</li>
            <li>한 달 실부담 = 월 임대료 + 관리비 + 대출 이자 + 못 받는 예금 이자</li>
            <li>소득 대비 주거비 = (월 임대료 + 관리비 + 대출 이자) ÷ 월 소득</li>
          </ul>
          <p>
            단리·이자만 계산합니다. 원금 상환, 보증료, 중개보수, 이사비는 넣지 않았습니다. 기본값은 조작 예시이며
            특정 공고·대출 상품의 조건이 아닙니다.
          </p>
        </details>

        <Link href="/analyze" className="cs-btn cs-btn--primary cs-sim__cta">
          이 예산으로 공고 찾기
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      </div>
    </div>
  )
}
