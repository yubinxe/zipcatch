'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { Property } from '@/lib/crm/types'
import type { UrgencyInfo } from '@/lib/crm/services/scoring'
import type { SpecialBrief } from '@/lib/adapters/applyhome-special'
import { landRentFor, priceRange, shortType, verifiedFor, type SiteData, type TypeRow } from '@/lib/consumer/complex-visualization'
import { loadSite } from '@/lib/consumer/sites'
import { won, wonFull } from '../complex/ComplexParts'
import DataBadge from '../DataBadge'
import DiveButton from '../dive/DiveButton'
import ScrollStage from './ScrollStage'

/**
 * 장면 3 — 두 공고를, 한 줄씩.
 *
 * 열어 본 공고 하나로는 고를 수 없다. 지금 접수 중인 청약홈 분양 두 건을 양옆에 세우고,
 * 내릴수록 같은 잣대(공급 세대 · 특별공급 접수 배수 · 마감 · 발표일)가 한 줄씩 가운데서 펼쳐진다.
 *
 * 값이 다 있는 공고만 쓴다 — 임대 공고는 보증금·임대료를 내놓지 않아 견줄 숫자가 비고,
 * 빈칸을 지어 채우지 않는다.
 *
 * 두 건이 없으면 장면을 지우지 않는다. 원문과 대조한 확인 사례(고덕강일 3단지) 한 단지의 두 주택형을
 * 같은 잣대(신규 청약 세대 · 일반공급 · 주거전용 · 건물 분양가 · 월 토지임대료)로 세우고, 양쪽 주택형을 고를 수 있게 한다.
 * 이때는 '검증 사례' 표를 달아 지금 목록에서 온 공고처럼 보이지 않게 한다.
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
  showA: string
  showB: string
  /** 숫자 아래 덧붙임 — 좁은 화면에서 한 줄에 몰아 쓰면 숫자가 쪼개진다 */
  subA?: string | null
  subB?: string | null
  /** 막대를 칠할 쪽 — 'low' 면 작은 값, 'high' 면 큰 값에 불을 켠다 */
  mark?: 'low' | 'high'
}

const CASE_ID = '2026000373-2026000373'

/** 면적 줄마다 새로 청약받는 세대가 가장 많은 주택형 — 처음 세울 두 쪽 */
function defaultPair(types: TypeRow[]): [string, string] {
  const byArea = new Map<string, TypeRow>()
  for (const t of types) {
    const k = t.type.slice(0, 3)
    const cur = byArea.get(k)
    if (!cur || t.main > cur.main) byArea.set(k, t)
  }
  const best = [...byArea.values()].sort((a, b) => a.type.localeCompare(b.type))
  return best.length >= 2 ? [best[0].type, best[best.length - 1].type] : [types[0].type, types[1]?.type ?? types[0].type]
}

const area = (t: TypeRow) => t.subs[0]?.exclusive ?? null

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
  const src = verifiedFor(CASE_ID)
  const [pickA, setPickA] = useState<string | null>(null)
  const [pickB, setPickB] = useState<string | null>(null)
  const [site, setSite] = useState<SiteData | null>(null)
  const caseMode = pair === null && !!src
  useEffect(() => {
    if (!caseMode || !src || site) return
    let alive = true
    loadSite(src.siteKey).then(s => alive && setSite(s))
    return () => {
      alive = false
    }
  }, [caseMode, src, site])

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

  const [A, B] = pair ?? [undefined, undefined]
  const [defA, defB] = useMemo(() => (src ? defaultPair(src.types) : ['', '']), [src])
  const ta = caseMode ? src!.types.find(t => t.type === (pickA ?? defA)) ?? null : null
  const tb = caseMode ? src!.types.find(t => t.type === (pickB ?? defB)) ?? null : null

  const sideLines = (a: Row, b: Row): Line[] => [
    {
      label: '공급 세대',
      note: '공고에 실린 전체 세대',
      a: a.property.supplyCount,
      b: b.property.supplyCount,
      showA: a.property.supplyCount === null ? '—' : `${a.property.supplyCount.toLocaleString('ko-KR')}세대`,
      showB: b.property.supplyCount === null ? '—' : `${b.property.supplyCount.toLocaleString('ko-KR')}세대`,
      mark: 'high',
    },
    {
      label: '특별공급 접수',
      note: '접수 ÷ 공급 · 낮을수록 자리가 남았다는 뜻',
      a: a.special?.rate ?? null,
      b: b.special?.rate ?? null,
      showA: a.special?.rate == null ? '집계 전' : `${a.special.rate.toFixed(2)}배`,
      showB: b.special?.rate == null ? '집계 전' : `${b.special.rate.toFixed(2)}배`,
      subA: a.special && a.special.shortBy > 0 ? `${a.special.shortBy.toLocaleString('ko-KR')}세대 남음` : null,
      subB: b.special && b.special.shortBy > 0 ? `${b.special.shortBy.toLocaleString('ko-KR')}세대 남음` : null,
      mark: 'low',
    },
    { label: '접수 마감', note: '오늘부터 남은 날', a: a.urgency.daysLeft, b: b.urgency.daysLeft, showA: dday(a.urgency), showB: dday(b.urgency) },
    {
      label: '당첨자 발표',
      note: '마감 뒤 결과까지',
      a: days(a.property.resultDate),
      b: days(b.property.resultDate),
      showA: md(a.property.resultDate),
      showB: md(b.property.resultDate),
    },
  ]

  const typeLines = (a: TypeRow, b: TypeRow): Line[] => {
    const pa = site ? priceRange(site, a.type) : null
    const pb = site ? priceRange(site, b.type) : null
    const la = landRentFor(src, { exclusiveArea: area(a) })
    const lb = landRentFor(src, { exclusiveArea: area(b) })
    const price = (r: { min: number; max: number } | null) => (r ? (r.min === r.max ? won(r.max) : `${won(r.min)} ~`) : site ? '공고문 확인' : '불러오는 중')
    return [
      { label: '새로 청약받는 세대', note: '특별 + 일반 · 사전청약 당첨자 제외', a: a.main, b: b.main, showA: `${a.main.toLocaleString('ko-KR')}세대`, showB: `${b.main.toLocaleString('ko-KR')}세대`, mark: 'high' },
      { label: '일반공급', note: '특별공급 자격 없이 넣는 자리', a: a.general, b: b.general, showA: `${a.general}세대`, showB: `${b.general}세대`, mark: 'high' },
      { label: '주거전용', note: '공고문 공급대상 표', a: area(a), b: area(b), showA: `${area(a) ?? '—'}㎡`, showB: `${area(b) ?? '—'}㎡` },
      {
        label: '건물 분양가',
        note: '동·호별 가격표 · 토지는 임대',
        a: pa?.max ?? null,
        b: pb?.max ?? null,
        showA: price(pa),
        showB: price(pb),
        subA: pa && pa.min !== pa.max ? `최고 ${won(pa.max)}` : null,
        subB: pb && pb.min !== pb.max ? `최고 ${won(pb.max)}` : null,
      },
      { label: '월 토지임대료', note: '공고가 면적 줄 전체에 준 값', a: la, b: lb, showA: la === null ? '공고문 확인' : wonFull(la), showB: lb === null ? '공고문 확인' : wonFull(lb) },
    ]
  }

  const lines: Line[] = A && B ? sideLines(A, B) : ta && tb ? typeLines(ta, tb) : []

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
  const typeSide = (t: TypeRow, k: 'a' | 'b') => (
    <header className="cs-decide__who" data-side={k}>
      <span className="cs-decide__tag">
        전용 {area(t)}㎡ · 총 {t.total.toLocaleString('ko-KR')}세대
      </span>
      <h3 className="cs-decide__name">
        <label className="cs-decide__pick">
          <span className="cs-sr">{k === 'a' ? '왼쪽' : '오른쪽'} 주택형</span>
          <select value={t.type} onChange={e => (k === 'a' ? setPickA : setPickB)(e.target.value)}>
            {src!.types.map(o => (
              <option key={o.type} value={o.type}>
                {shortType(o.type)}형
              </option>
            ))}
          </select>
        </label>
      </h3>
      <p className="cs-decide__where">{src!.name}</p>
    </header>
  )

  return (
    <ScrollStage length={2.0} className="cs-scene cs-scene--decide" label="두 공고를 같은 잣대로 견주는 모습">
      <div className="cs-wrap cs-decide">
        <div className="cs-decide__head">
          <span className="cs-sec-eyebrow">Compare &amp; Decide</span>
          <h2 className="cs-section-title">{caseMode ? '같은 단지, 두 주택형을 한 줄씩.' : '두 공고를, 한 줄씩.'}</h2>
          {caseMode && (
            <p className="cs-decide__why">
              지금 같은 잣대로 견줄 수 있는 접수 중 분양 공고가 두 건이 되지 않습니다. 원문과 대조한 단지 하나의 두 주택형으로
              대신 세웁니다 — 양쪽을 바꿔 볼 수 있습니다.
            </p>
          )}
        </div>

        <div className="cs-decide__board" aria-busy={!A && !ta}>
          <div className="cs-decide__sides">
            {ta && tb ? typeSide(ta, 'a') : side(A, 'a')}
            <span className="cs-decide__vs" aria-hidden="true">vs</span>
            {ta && tb ? typeSide(tb, 'b') : side(B, 'b')}
          </div>

          <ol className="cs-decide__lines">
            {lines.map((l, i) => {
              const both = l.a !== null && l.b !== null
              const max = both ? Math.max(Math.abs(l.a!), Math.abs(l.b!), 1e-9) : 1
              const lit = both && l.mark && l.a !== l.b ? ((l.mark === 'low' ? l.a! < l.b! : l.a! > l.b!) ? 'a' : 'b') : null
              return (
                <li key={l.label} className="cs-decide__line" style={{ '--i': i } as CSSProperties}>
                  <div className="cs-decide__val" data-side="a" data-lit={lit === 'a' || undefined}>
                    <b className="cs-num">{l.showA}</b>
                    {l.subA && <small className="cs-decide__sub">{l.subA}</small>}
                    {l.mark && both && <i style={{ '--w': Math.abs(l.a!) / max } as CSSProperties} />}
                  </div>
                  <div className="cs-decide__label">
                    <span>{l.label}</span>
                    <small>{l.note}</small>
                  </div>
                  <div className="cs-decide__val" data-side="b" data-lit={lit === 'b' || undefined}>
                    <b className="cs-num">{l.showB}</b>
                    {l.subB && <small className="cs-decide__sub">{l.subB}</small>}
                    {l.mark && both && <i style={{ '--w': Math.abs(l.b!) / max } as CSSProperties} />}
                  </div>
                </li>
              )
            })}
          </ol>

          {caseMode && src && (
            <div className="cs-decide__end">
              <p>
                <DataBadge src={src} />
              </p>
              <DiveButton announcementId={CASE_ID} region={src.region} className="cs-btn cs-btn--primary">
                3D 단지 탐험에서 보기
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </DiveButton>
            </div>
          )}
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
