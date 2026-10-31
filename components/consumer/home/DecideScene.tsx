'use client'

import Link from 'next/link'
import { useEffect, useState, type CSSProperties } from 'react'
import type { Property } from '@/lib/crm/types'
import type { UrgencyInfo } from '@/lib/crm/services/scoring'
import type { SpecialBrief } from '@/lib/adapters/applyhome-special'
import ScrollStage from './ScrollStage'

/**
 * 장면 3 — 두 공고를, 한 줄씩.
 *
 * 열어 본 공고 하나로는 고를 수 없다. 지금 접수 중인 청약홈 분양 두 건을 양옆에 세우고,
 * 내릴수록 같은 잣대(공급 세대 · 특별공급 접수 배수 · 마감 · 발표일)가 한 줄씩 가운데서 펼쳐진다.
 *
 * 값이 다 있는 공고만 쓴다 — 임대 공고는 보증금·임대료를 내놓지 않아 견줄 숫자가 비고,
 * 빈칸을 지어 채우지 않는다. 두 건이 없으면 장면을 세우지 않는다.
 * '어느 쪽이 낫다'고 판정하지 않는다. 줄마다 숫자의 크고 작음만 표시한다.
 */

interface Row {
  property: Property
  urgency: UrgencyInfo
  special?: SpecialBrief
}

interface Line {
  label: string
  note: string
  a: number | null
  b: number | null
  show: (v: number | null, r: Row) => string
  /** 숫자 아래 덧붙임 — 좁은 화면에서 한 줄에 몰아 쓰면 숫자가 쪼개진다 */
  sub?: (r: Row) => string | null
  /** 막대를 칠할 쪽 — 'low' 면 작은 값, 'high' 면 큰 값에 불을 켠다 */
  mark?: 'low' | 'high'
}

const dday = (u: UrgencyInfo) =>
  u.daysLeft === null ? '미정' : u.daysLeft < 0 ? '마감' : u.daysLeft === 0 ? 'D-DAY' : `D-${u.daysLeft}`
const md = (d: string | null | undefined) => {
  if (!d) return '미정'
  const m = d.match(/(\d{4})-?(\d{2})-?(\d{2})/)
  return m ? `${Number(m[2])}. ${Number(m[3])}.` : d
}
const days = (d: string | null | undefined) => {
  const m = d?.match(/(\d{4})-?(\d{2})-?(\d{2})/)
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86_400_000 : null
}

export default function DecideScene() {
  const [pair, setPair] = useState<[Row, Row] | null | undefined>(undefined)

  useEffect(() => {
    const ctl = new AbortController()
    fetch('/api/notices?limit=40', { signal: ctl.signal })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((d: { notices: Row[] }) => {
        const full = d.notices.filter(r => r.property.supplyCount && r.property.district)
        // 특별공급 결과까지 있는 두 건을 먼저, 없으면 공급 세대가 있는 두 건
        const rich = full.filter(r => r.special && r.special.rate !== null)
        const pick = rich.length >= 2 ? rich : full
        setPair(pick.length >= 2 ? [pick[0], pick[1]] : null)
      })
      .catch(() => setPair(null))
    return () => ctl.abort()
  }, [])

  if (pair === null) return null
  const [A, B] = pair ?? [undefined, undefined]

  const lines: Line[] =
    A && B
      ? [
          {
            label: '공급 세대',
            note: '공고에 실린 전체 세대',
            a: A.property.supplyCount,
            b: B.property.supplyCount,
            show: v => (v === null ? '—' : `${v.toLocaleString('ko-KR')}세대`),
            mark: 'high',
          },
          {
            label: '특별공급 접수',
            note: '접수 ÷ 공급 · 낮을수록 자리가 남았다는 뜻',
            a: A.special?.rate ?? null,
            b: B.special?.rate ?? null,
            show: v => (v === null ? '집계 전' : `${v.toFixed(2)}배`),
            sub: r => (r.special && r.special.shortBy > 0 ? `${r.special.shortBy.toLocaleString('ko-KR')}세대 남음` : null),
            mark: 'low',
          },
          {
            label: '접수 마감',
            note: '오늘부터 남은 날',
            a: A.urgency.daysLeft,
            b: B.urgency.daysLeft,
            show: (_, r) => dday(r.urgency),
          },
          {
            label: '당첨자 발표',
            note: '마감 뒤 결과까지',
            a: days(A.property.resultDate),
            b: days(B.property.resultDate),
            show: (_, r) => md(r.property.resultDate),
          },
        ]
      : []

  const ids = A && B ? `${A.property.id},${B.property.id}` : ''
  const side = (r: Row | undefined, k: 'a' | 'b') => (
    <header className="cs-decide__who" data-side={k}>
      <span className="cs-decide__tag">
        {r?.property.housingType ?? '분양'} · {r ? dday(r.urgency) : ''}
      </span>
      <h3 className="cs-decide__name">{r?.property.name ?? ' '}</h3>
      <p className="cs-decide__where">{r ? [r.property.district, r.property.region].filter(Boolean).join(' ') : ''}</p>
    </header>
  )

  return (
    <ScrollStage length={2.0} className="cs-scene cs-scene--decide" label="두 공고를 같은 잣대로 견주는 모습">
      <div className="cs-wrap cs-decide">
        <div className="cs-decide__head">
          <span className="cs-sec-eyebrow">Compare &amp; Decide</span>
          <h2 className="cs-section-title">두 공고를, 한 줄씩.</h2>
        </div>

        <div className="cs-decide__board" aria-busy={!A}>
          <div className="cs-decide__sides">
            {side(A, 'a')}
            <span className="cs-decide__vs" aria-hidden="true">vs</span>
            {side(B, 'b')}
          </div>

          <ol className="cs-decide__lines">
            {lines.map((l, i) => {
              const both = l.a !== null && l.b !== null
              const max = both ? Math.max(Math.abs(l.a!), Math.abs(l.b!), 1e-9) : 1
              const lit = both && l.mark && l.a !== l.b ? ((l.mark === 'low' ? l.a! < l.b! : l.a! > l.b!) ? 'a' : 'b') : null
              return (
                <li key={l.label} className="cs-decide__line" style={{ '--i': i } as CSSProperties}>
                  <div className="cs-decide__val" data-side="a" data-lit={lit === 'a' || undefined}>
                    <b className="cs-num">{l.show(l.a, A!)}</b>
                    {l.sub?.(A!) && <small className="cs-decide__sub">{l.sub(A!)}</small>}
                    {l.mark && both && <i style={{ '--w': Math.abs(l.a!) / max } as CSSProperties} />}
                  </div>
                  <div className="cs-decide__label">
                    <span>{l.label}</span>
                    <small>{l.note}</small>
                  </div>
                  <div className="cs-decide__val" data-side="b" data-lit={lit === 'b' || undefined}>
                    <b className="cs-num">{l.show(l.b, B!)}</b>
                    {l.sub?.(B!) && <small className="cs-decide__sub">{l.sub(B!)}</small>}
                    {l.mark && both && <i style={{ '--w': Math.abs(l.b!) / max } as CSSProperties} />}
                  </div>
                </li>
              )
            })}
          </ol>

          {ids && (
            <div className="cs-decide__end">
              <p>숫자는 나란히 둘 뿐, 고르는 건 내 조건입니다.</p>
              <Link href={`/compare?ids=${ids}`} className="cs-btn cs-btn--primary">
                두 공고 자세히 비교
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            </div>
          )}
        </div>
      </div>
    </ScrollStage>
  )
}
