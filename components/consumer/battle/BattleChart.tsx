'use client'

import { useEffect, useState } from 'react'

/**
 * 비교 화면의 차이 막대 — 표가 '무엇이 다른가'를 적는다면, 이 막대는 '얼마나'를 보인다.
 *
 * 공고 원문에 있는 값만 쓴다. 값이 없는 칸은 0 으로 그리지 않고 '원문 미기재'로 비워 둔다 —
 * 막대가 짧은 것과 값이 없는 것은 다른 말이다. 나은 쪽 표시는 방향이 분명한 지표에만 붙인다.
 */

export interface BattleItem {
  id: string
  name: string
  supply: number | null
  /** 만원. 분양은 주택형 최고가 중 가장 낮은 값, 임대는 보증금 */
  price: number | null
  priceKind: 'SALE' | 'DEPOSIT' | null
  areaMax: number | null
  daysLeft: number | null
}

interface Metric {
  key: string
  label: string
  unit: (v: number) => string
  pick: (i: BattleItem) => number | null
  /** 'high' 면 큰 쪽이, 'low' 면 작은 쪽이 나은 쪽. null 이면 표시하지 않는다 */
  better: 'high' | 'low' | null
  note?: string
}

const won = (man: number) => {
  if (man >= 10000) {
    const e = Math.floor(man / 10000)
    const r = man % 10000
    return r ? `${e}억 ${r.toLocaleString()}만` : `${e}억`
  }
  return `${man.toLocaleString()}만`
}

const METRICS: Metric[] = [
  { key: 'supply', label: '공급 세대', unit: v => `${v.toLocaleString()}세대`, pick: i => i.supply, better: 'high', note: '많을수록 당첨 자리가 넓다는 뜻일 뿐, 경쟁률은 따로 봐야 합니다.' },
  { key: 'price', label: '금액', unit: v => `${won(v)}원`, pick: i => i.price, better: 'low', note: '분양은 주택형 최고가 중 가장 낮은 값, 임대는 보증금입니다. 같은 종류끼리만 견주세요.' },
  { key: 'area', label: '최대 전용면적', unit: v => `${Math.round(v * 10) / 10}㎡`, pick: i => i.areaMax, better: null },
  { key: 'days', label: '마감까지', unit: v => (v === 0 ? '오늘' : `${v}일`), pick: i => (i.daysLeft !== null && i.daysLeft >= 0 ? i.daysLeft : null), better: null },
]

export default function BattleChart({ items }: { items: BattleItem[] }) {
  // 처음 그릴 때 0 에서 자라나게 — 한 박자 뒤에 길이를 준다
  const [grown, setGrown] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true))
    return () => cancelAnimationFrame(id)
  }, [])
  const [focus, setFocus] = useState<string | null>(null)

  const mixedPrice = new Set(items.map(i => i.priceKind).filter(Boolean)).size > 1

  return (
    <section className="cs-battle" aria-label="차이 한눈에">
      <ol className="cs-battle__who">
        {items.map((it, n) => (
          <li
            key={it.id}
            data-n={n}
            data-dim={focus && focus !== it.id ? '' : undefined}
            onPointerEnter={() => setFocus(it.id)}
            onPointerLeave={() => setFocus(null)}
          >
            <i aria-hidden="true" />
            {it.name}
          </li>
        ))}
      </ol>
      <div className="cs-battle__grid">
        {METRICS.map(m => {
          const vals = items.map(m.pick)
          const known = vals.filter((v): v is number => v !== null)
          const max = Math.max(1, ...known)
          const best =
            m.better && known.length >= 2 && !(m.key === 'price' && mixedPrice)
              ? m.better === 'high'
                ? Math.max(...known)
                : Math.min(...known)
              : null
          const gap = known.length >= 2 ? Math.max(...known) - Math.min(...known) : null
          return (
            <div key={m.key} className="cs-battle__m">
              <div className="cs-battle__h">
                <span>{m.label}</span>
                {gap !== null && gap > 0 && <small>차이 {m.unit(gap)}</small>}
              </div>
              <ul>
                {items.map((it, n) => {
                  const v = vals[n]
                  return (
                    <li
                      key={it.id}
                      data-n={n}
                      data-dim={focus && focus !== it.id ? '' : undefined}
                      data-best={best !== null && v === best ? '' : undefined}
                      onPointerEnter={() => setFocus(it.id)}
                      onPointerLeave={() => setFocus(null)}
                    >
                      {v === null ? (
                        <span className="cs-battle__none">원문 미기재</span>
                      ) : (
                        <>
                          <span className="cs-battle__bar" aria-hidden="true">
                            <i style={{ width: grown ? `${Math.max(3, (v / max) * 100)}%` : '0%' }} />
                          </span>
                          <span className="cs-battle__v cs-num">{m.unit(v)}</span>
                        </>
                      )}
                      <span className="cs-sr">{it.name}</span>
                    </li>
                  )
                })}
              </ul>
              {m.key === 'price' && mixedPrice ? (
                <p className="cs-battle__note">분양가와 임대 보증금이 섞여 있어 나은 쪽을 표시하지 않았습니다.</p>
              ) : (
                m.note && <p className="cs-battle__note">{m.note}</p>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
