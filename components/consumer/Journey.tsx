'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isRental, mapProvince } from '@/lib/consumer/classify'
import {
  compareModels,
  landRentFor,
  shortType,
  verifiedFor,
  verifiedForNotice,
  verifiedModels,
  type OfficialModel,
  type SiteData,
  type VerifiedSource,
} from '@/lib/consumer/complex-visualization'
import { setJourney, useJourney } from '@/lib/consumer/journey-store'
import { loadSite } from '@/lib/consumer/sites'
import { KOREA_REGIONS } from '@/lib/korea-regions'
import { won, wonFull } from './complex/ComplexParts'
import { centerOf, startDive } from './dive/dive'

/**
 * 집 하나를 고르기까지 — 네 장면, 하나의 결정.
 *
 * 왼쪽 기둥은 지금 장면을 말하고, 오른쪽에서 장면을 실제로 조작한다. 네 장면은 같은 선택
 * (lib/consumer/journey-store — 첫 화면·ONE MAP·단지 탐험이 함께 쓰는 것)을 이어 받는다.
 * 숫자는 공고 목록 API 와 원문 대조를 마친 공고의 값뿐이다. 없는 값은 없다고 적는다.
 *
 * 스크롤을 빼앗지 않는다. 기둥의 장면 이름을 누르면 그 장면으로 가고, '자동 시연'은 손을 대면 멈춘다.
 */

const SCENES = [
  {
    verb: '고르기',
    title: '세 가지만 정하면 후보가 나옵니다',
    desc: '살고 싶은 지역, 감당할 수 있는 주거비, 주택 유형. 자격 판단이 아니라 희망 조건과 맞는지만 봅니다.',
    href: '/analyze',
    cta: '내 조건 넣기',
  },
  {
    verb: '견주기',
    title: '두 공고를 같은 줄에 세웁니다',
    desc: '같은 단지라면 주택형끼리, 다른 공고라면 공고끼리. 어느 쪽이 나은지는 숫자 차이로 말합니다.',
    href: '/compare',
    cta: '공고 비교하기',
  },
  {
    verb: '확인하기',
    title: '확인된 것과 아닌 것을 나눠 둡니다',
    desc: '공고 원문에 있는 사실, 아직 확인하지 않은 자격요건, 공고에 없어 미정인 것. 섞지 않고 표시합니다.',
    href: '/guide',
    cta: '청약 가이드 읽기',
  },
  {
    verb: '챙기기',
    title: '마감은 저희가 기억합니다',
    desc: '공식 일정과 준비 권장일을 나눠 한 줄에 놓습니다. 지난 일정은 지났다고 적습니다.',
    href: '/saved',
    cta: '관심공고 보기',
  },
] as const

interface Item {
  property: {
    id: string
    name: string
    announcementId: string | null
    housingType: string
    region: string | null
    district: string | null
    deposit: number | null
    monthlyRent: number | null
    supplyCount: number
    applicationStart: string | null
    applicationEnd: string | null
    resultDate: string | null
    contractStart: string | null
    sourceUrl: string | null
  }
}

const VERIFIED_ID = '2026000373-2026000373'
const BUDGETS = [
  { v: 0, label: '제한 없음' },
  { v: 1000, label: '1천만원' },
  { v: 3000, label: '3천만원' },
  { v: 5000, label: '5천만원' },
  { v: 10000, label: '1억원' },
]

const today = () => new Date(new Date().toDateString())
const dayDiff = (iso: string) => Math.round((new Date(iso).getTime() - today().getTime()) / 86400000)
const ymd = (iso: string) => iso.slice(0, 10).replaceAll('-', '.')
const firstDate = (s: string) => s.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null
const lastDate = (s: string) => {
  const full = s.match(/\d{4}-\d{2}-\d{2}/g)
  const short = s.match(/~ (\d{2})-(\d{2})/)
  if (short && full) return `${full[0].slice(0, 4)}-${short[1]}-${short[2]}`
  return full?.[full.length - 1] ?? null
}

/* ── 장면 1 — 고르기 ───────────────────────────────────── */
function Choose({
  items,
  failed,
  region,
  onRegion,
  noticeId,
  verifiedPicked,
  onPick,
}: {
  verifiedPicked: boolean
  items: Item[] | null
  failed: boolean
  region: string | null
  onRegion: (code: string | null) => void
  noticeId: string | null
  onPick: (it: Item | 'verified') => void
}) {
  const [kind, setKind] = useState<'all' | 'sale' | 'rent'>('all')
  const [budget, setBudget] = useState(0)
  const regionName = region ? KOREA_REGIONS.find(r => r.code === region)?.name ?? null : null
  const hits = useMemo(
    () =>
      (items ?? []).filter(it => {
        const p = it.property
        if (regionName && mapProvince(p.district ?? '', p.region) !== regionName) return false
        const rent = isRental(p.housingType)
        if (kind === 'sale' && rent) return false
        if (kind === 'rent' && !rent) return false
        // 보증금 상한은 금액이 적힌 임대 공고에만 — 분양 공고는 목록에 가격이 없어 걸러내지 않는다
        if (budget && rent && p.deposit !== null && p.deposit > budget) return false
        return true
      }),
    [items, regionName, kind, budget],
  )
  const hasVerified = hits.some(it => verifiedForNotice(it.property))
  return (
    <div className="op-jr op-jr--choose">
      <div className="op-jr__ctl">
        <label>
          <span>지역</span>
          <select value={region ?? ''} onChange={e => onRegion(e.target.value || null)}>
            <option value="">전국</option>
            {KOREA_REGIONS.map(r => (
              <option key={r.code} value={r.code}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>유형</span>
          <select value={kind} onChange={e => setKind(e.target.value as typeof kind)}>
            <option value="all">분양·임대</option>
            <option value="sale">분양</option>
            <option value="rent">임대</option>
          </select>
        </label>
        <label>
          <span>보증금 상한(임대)</span>
          <select value={budget} onChange={e => setBudget(Number(e.target.value))}>
            {BUDGETS.map(b => (
              <option key={b.v} value={b.v}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="op-jr__count" aria-live="polite">
        {failed ? (
          '공고 목록을 불러오지 못했어요 — 조회 불가'
        ) : items === null ? (
          '공고를 불러오는 중'
        ) : (
          <>
            조건에 맞는 접수 중·예정 공고 <b className="cs-num">{hits.length}</b>건
          </>
        )}
      </p>
      {hits.length > 0 && (
        <ul className="op-jr__list" role="radiogroup" aria-label="견줄 공고 고르기">
          {hits.slice(0, 5).map(it => {
            const v = verifiedForNotice(it.property)
            return (
              <li key={it.property.id}>
                <button type="button" role="radio" aria-checked={noticeId === it.property.id} onClick={() => onPick(it)}>
                  <b>{it.property.name}</b>
                  <span>
                    {mapProvince(it.property.district ?? '', it.property.region)} · {it.property.housingType}
                    {it.property.applicationEnd && ` · 마감 ${ymd(it.property.applicationEnd)}`}
                  </span>
                  {v && <em>3D 단지 탐험 · 원문 대조</em>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {!hasVerified && (
        <button type="button" className="op-jr__sample" aria-pressed={verifiedPicked} onClick={() => onPick('verified')}>
          <em>검증용 사례</em> 고덕강일지구 3단지 토지임대부(본청약) — 공고 원문·정정본과 대조한 값으로 이어 보기
        </button>
      )}
      <p className="op-jr__fine">희망 조건과 맞는지만 봅니다 — 소득·자산·거주기간 같은 자격은 판정하지 않습니다.</p>
    </div>
  )
}

/* ── 장면 2 — 견주기 ───────────────────────────────────── */
function CompareTypes({ src, models, types, onTypes }: { src: VerifiedSource; models: OfficialModel[]; types: string[]; onTypes: (t: string[]) => void }) {
  const a = models.find(m => m.name === types[0]) ?? models.find(m => m.name === '059.0000B') ?? models[0]
  const b = models.find(m => m.name === types[1] && m.name !== a.name) ?? models.find(m => Math.trunc(m.exclusiveArea ?? 0) !== Math.trunc(a.exclusiveArea ?? 0)) ?? models[1]
  const diffs = compareModels(a, b)
  const ra = landRentFor(src, a)
  const rb = landRentFor(src, b)
  const fmt = (k: string, v: number) => (k === 'topAmount' ? won(v) : k === 'households' ? `${v}세대` : k === 'perPyeong' ? `${v.toLocaleString('ko-KR')}만원` : `${v.toFixed(2)}㎡`)
  return (
    <div className="op-jr op-jr--cmp">
      <p className="op-jr__k">동일 단지 내 주택형 비교 · {src.name}</p>
      <div className="op-jr__ctl">
        {[a, b].map((m, i) => (
          <label key={i}>
            <span>{i ? '비교할 주택형' : '고른 주택형'}</span>
            <select
              value={m.name}
              onChange={e => onTypes(i ? [a.name, e.target.value] : [e.target.value, b.name])}
            >
              {models.map(x => (
                <option key={x.name} value={x.name} disabled={x.name === (i ? a.name : b.name)}>
                  {shortType(x.name)} · 전용 {x.exclusiveArea}㎡
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <table className="op-jr__board">
        <caption className="cs-sr">
          {shortType(a.name)}과 {shortType(b.name)}의 차이 — 공고 원문 값
        </caption>
        <thead>
          <tr>
            <th scope="col">항목</th>
            <th scope="col" data-k="a">
              {shortType(a.name)}
            </th>
            <th scope="col" data-k="b">
              {shortType(b.name)}
            </th>
            <th scope="col">차이</th>
          </tr>
        </thead>
        <tbody>
          {diffs.map(d => (
            <tr key={d.key}>
              <th scope="row">{d.key === 'topAmount' && ra !== null ? '건물 분양가 최고' : d.label}</th>
              <td className="cs-num">{fmt(d.key, d.a)}</td>
              <td className="cs-num">{fmt(d.key, d.b)}</td>
              <td className="cs-num">{d.diff > 0 ? '+' : d.diff < 0 ? '−' : '±'}{fmt(d.key, Math.abs(d.diff))}</td>
            </tr>
          ))}
          {ra !== null && rb !== null && (
            <tr>
              <th scope="row">월 토지임대료(별도)</th>
              <td className="cs-num">{wonFull(ra)}</td>
              <td className="cs-num">{wonFull(rb)}</td>
              <td className="cs-num">{ra === rb ? '같음' : `${rb > ra ? '+' : '−'}${wonFull(Math.abs(rb - ra))}`}</td>
            </tr>
          )}
        </tbody>
      </table>
      <button
        type="button"
        className="op-jr__3d"
        onClick={e => startDive({ announcementId: VERIFIED_ID, from: centerOf(e.currentTarget), region: src.region, type: a.name })}
      >
        이 두 주택형을 단지 안에서 보기 (3D)
      </button>
    </div>
  )
}

function CompareNotices({ items, picked }: { items: Item[]; picked: Item }) {
  const others = items.filter(it => it.property.id !== picked.property.id)
  const [other, setOther] = useState<string>(others[0]?.property.id ?? '')
  const b = others.find(it => it.property.id === other) ?? null
  const rows: { k: string; f: (p: Item['property']) => string }[] = [
    { k: '지역', f: p => mapProvince(p.district ?? '', p.region) },
    { k: '유형', f: p => p.housingType },
    { k: '보증금', f: p => (p.deposit === null ? '공고문 확인' : `${p.deposit.toLocaleString('ko-KR')}만원`) },
    { k: '월 임대료', f: p => (p.monthlyRent === null ? '공고문 확인' : `${p.monthlyRent.toLocaleString('ko-KR')}만원`) },
    { k: '공급 규모', f: p => `${p.supplyCount.toLocaleString('ko-KR')}세대` },
    { k: '접수 마감', f: p => (p.applicationEnd ? ymd(p.applicationEnd) : '미정') },
  ]
  if (!others.length) return <p className="op-jr__fine">견줄 다른 공고가 지금 목록에 없습니다.</p>
  return (
    <div className="op-jr op-jr--cmp">
      <p className="op-jr__k">두 공고 비교 — 공고 목록 값 그대로</p>
      <div className="op-jr__ctl">
        <label>
          <span>견줄 공고</span>
          <select value={other} onChange={e => setOther(e.target.value)}>
            {others.slice(0, 20).map(it => (
              <option key={it.property.id} value={it.property.id}>
                {it.property.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {b && (
        <table className="op-jr__board" key={b.property.id}>
          <caption className="cs-sr">두 공고의 목록 값</caption>
          <thead>
            <tr>
              <th scope="col">항목</th>
              <th scope="col" data-k="a">
                {picked.property.name}
              </th>
              <th scope="col" data-k="b">
                {b.property.name}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.k}>
                <th scope="row">{r.k}</th>
                <td>{r.f(picked.property)}</td>
                <td>{r.f(b.property)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {b && (
        <Link className="op-jr__3d" href={`/compare?ids=${picked.property.id},${b.property.id}`}>
          비교 화면에서 자세히
        </Link>
      )}
    </div>
  )
}

/* ── 장면 3 — 확인하기 ─────────────────────────────────── */
interface Check {
  s: 'ok' | 'check' | 'none'
  what: string
  why: string
  src: string
}

function verifyRows(src: VerifiedSource | null, it: Item | null): Check[] {
  if (src) {
    const stamp = `원문 대조 ${src.checkedAt}`
    return [
      { s: 'ok', what: `공급 세대 — 단지 ${src.supply.total.toLocaleString('ko-KR')} = 사전청약 ${src.supply.preWinners} + 특별 ${src.supply.special} + 일반 ${src.supply.general}`, why: '20개 주택형 표의 합계와 면적 줄 합계로 다시 맞췄습니다.', src: `공고문 ${src.supply.page}쪽 · ${stamp}` },
      { s: 'ok', what: '주택형별 면적·건물 분양가(동·호별 1,305세대)', why: '가격표 1,305행의 최고가가 청약홈 20줄과 같습니다(천원→만원 내림).', src: `공고문 51~80쪽 · ${stamp}` },
      { s: 'ok', what: src.landLease ? `월 토지임대료 — ${Object.entries(src.landLease.monthlyByArea).map(([a, v]) => `${a}㎡ ${wonFull(v)}`).join(' · ')}` : '토지임대료', why: '면적 줄 전체 같은 금액이라고 공고가 적었습니다. 다른 면적에 추정해 붙이지 않습니다.', src: `공고문 ${src.landLease?.page ?? '—'}쪽 · ${stamp}` },
      { s: 'ok', what: '정정 내용 — 평면도 16개 타입, 테라스 문구, 예비입주자 기준', why: '숫자(세대·면적·가격·일정·임대료)는 바뀌지 않았습니다.', src: `SH 정정본 2026-10-23 · ${stamp}` },
      { s: 'check', what: '무주택·소득·자산·거주기간·특별공급 자격', why: '이 서비스는 자격을 판정하지 않습니다. 공고문의 기준표로 직접 확인해야 합니다.', src: '공고문 자격 기준(정정본) — 신청자 확인' },
      { s: 'check', what: '동·호 배정', why: '무작위 추첨으로 정해집니다. 층·향을 고를 수 없습니다.', src: '공고문 52쪽' },
      { s: 'none', what: '토지임대료 보증금 전환이율', why: '공고에 확정값이 없습니다("계약 전 안내 예정"). 예시의 2.5%를 실제 값으로 쓰지 않습니다.', src: '공고문 82쪽' },
      { s: 'none', what: '실제 외관·3D 모델', why: '사업주체 자료의 사용 허락이 없어 그리지 않습니다. 탐험의 덩어리는 개념 시각화입니다.', src: '자료 사용 상태: LINK_ONLY · UNAVAILABLE' },
    ]
  }
  if (!it) return []
  const p = it.property
  const missing = [p.deposit === null && '보증금', p.monthlyRent === null && '월 임대료', !p.applicationEnd && '접수 마감일'].filter(Boolean) as string[]
  return [
    { s: 'ok', what: `일정 — ${[p.applicationStart && `접수 ${ymd(p.applicationStart)}`, p.applicationEnd && `마감 ${ymd(p.applicationEnd)}`, p.resultDate && `발표 ${ymd(p.resultDate)}`].filter(Boolean).join(' · ') || '없음'}`, why: '공고 목록 API 에 적힌 값 그대로입니다.', src: '청약홈·LH 공고 목록' },
    { s: 'check', what: '무주택·소득·자산·거주기간 자격', why: '이 서비스는 자격을 판정하지 않습니다.', src: '공고 원문에서 신청자 확인' },
    ...(missing.length ? [{ s: 'none' as const, what: missing.join('·'), why: '공고 목록에 값이 없습니다. 지어 넣지 않고 원문 확인으로 남깁니다.', src: '공고 원문' }] : []),
  ]
}

function Verify({ rows }: { rows: Check[] }) {
  if (!rows.length) return <p className="op-jr__fine">장면 1에서 공고를 고르면 그 공고의 확인 상태가 여기에 섭니다.</p>
  const label = { ok: '원문으로 확인', check: '직접 확인 필요', none: '공고에 없음' }
  return (
    <ul className="op-jr op-jr--verify">
      {rows.map(r => (
        <li key={r.what} data-s={r.s}>
          <details>
            <summary>
              <i aria-hidden="true" />
              <span className="op-jr__vk">{label[r.s]}</span>
              <span>{r.what}</span>
            </summary>
            <p>
              {r.why} <em>출처 · {r.src}</em>
            </p>
          </details>
        </li>
      ))}
    </ul>
  )
}

/* ── 장면 4 — 챙기기 ───────────────────────────────────── */
interface Mark {
  date: string
  label: string
  kind: 'official' | 'recommended'
}

function marksFor(src: VerifiedSource | null, it: Item | null): Mark[] {
  const out: Mark[] = []
  let start: string | null = null
  if (src) {
    for (const s of src.schedule) {
      const d = firstDate(s.date)
      // 기간이면 끝 날만 덧붙인다(시작 날은 왼쪽 날짜 칸에 이미 있다)
      const end = lastDate(s.date)
      const tail = s.date.replace(/^[^~]*/, '').replace(/~\s*/, '').trim()
      if (d) out.push({ date: d, label: end && end !== d ? `${s.label} (~${tail.replace(/^\d{4}-/, '')})` : `${s.label}${/\d{2}:\d{2}/.test(s.date) ? ` ${s.date.match(/\d{2}:\d{2}.*$/)?.[0]}` : ''}`, kind: 'official' })
    }
    start = firstDate(src.schedule.find(s => s.label.startsWith('특별공급'))?.date ?? '')
  } else if (it) {
    const p = it.property
    if (p.applicationStart) out.push({ date: p.applicationStart, label: '접수 시작', kind: 'official' })
    if (p.applicationEnd) out.push({ date: p.applicationEnd, label: '접수 마감', kind: 'official' })
    if (p.resultDate) out.push({ date: p.resultDate, label: '당첨자 발표', kind: 'official' })
    if (p.contractStart) out.push({ date: p.contractStart, label: '계약 시작', kind: 'official' })
    start = p.applicationStart
  }
  // 서비스가 권하는 준비일 — 공식 일정이 아니다
  if (start) {
    const at = (n: number) => new Date(new Date(start).getTime() - n * 86400000).toISOString().slice(0, 10)
    out.push({ date: at(7), label: '서류 준비 시작(권장)', kind: 'recommended' })
    out.push({ date: at(2), label: '청약통장·인증서 점검(권장)', kind: 'recommended' })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

function Prepare({ marks, ended }: { marks: Mark[]; ended: boolean }) {
  if (!marks.length) return <p className="op-jr__fine">장면 1에서 공고를 고르면 그 공고의 일정이 여기에 섭니다.</p>
  return (
    <div className="op-jr op-jr--line">
      {ended && <p className="op-jr__ended">이 공고의 접수 기간은 끝났습니다 — 지금 신청할 수 없습니다.</p>}
      <ol>
        {marks.map(m => {
          const d = dayDiff(m.date)
          return (
            <li key={m.label + m.date} data-k={m.kind} data-past={d < 0 || undefined}>
              <i aria-hidden="true" />
              <span className="cs-num">{ymd(m.date)}</span>
              <b>{m.label}</b>
              <em>{m.kind === 'official' ? '공식' : '권장'}</em>
              <small className="cs-num">{d < 0 ? '지남' : d === 0 ? '오늘' : `D-${d}`}</small>
            </li>
          )
        })}
      </ol>
      <p className="op-jr__fine">공식 = 공고 원문의 일정 · 권장 = 서비스가 제안하는 준비일(공고에 없는 날짜)</p>
    </div>
  )
}

export default function Journey() {
  const [active, setActive] = useState(0)
  const refs = useRef<(HTMLElement | null)[]>([])
  const journey = useJourney()
  const [items, setItems] = useState<Item[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [site, setSite] = useState<SiteData | null>(null)
  const [auto, setAuto] = useState(false)

  useEffect(() => {
    const io = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.i))
        }
      },
      { rootMargin: '-45% 0px -45% 0px' },
    )
    for (const el of refs.current) if (el) io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const ctl = new AbortController()
    fetch('/api/notices?limit=60', { signal: ctl.signal })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((d: { notices?: Item[] }) => setItems(d.notices ?? []))
      .catch(() => {
        if (!ctl.signal.aborted) {
          setFailed(true)
          setItems([])
        }
      })
    return () => ctl.abort()
  }, [])

  // 고른 공고 — 확인된 공고면 원문 값, 아니면 목록의 그 공고
  const src = journey.announcementId ? verifiedFor(journey.announcementId) : null
  const picked = !src && journey.noticeId ? items?.find(it => it.property.id === journey.noticeId) ?? null : null
  useEffect(() => {
    if (!src || site) return
    let alive = true
    loadSite(src.siteKey).then(s => alive && setSite(s))
    return () => {
      alive = false
    }
  }, [src, site])
  const models = useMemo(() => (src && site ? verifiedModels(src, site) : null), [src, site])

  const pick = (it: Item | 'verified') => {
    if (it === 'verified') {
      const v = verifiedFor(VERIFIED_ID)!
      setJourney({ noticeId: v.propertyIds[0] ?? VERIFIED_ID, noticeName: v.name, announcementId: VERIFIED_ID }, 'journey')
      return
    }
    const v = verifiedForNotice(it.property)
    setJourney({ noticeId: it.property.id, noticeName: it.property.name, announcementId: v?.id ?? null, unitTypes: [] }, 'journey')
  }

  const go = useCallback((i: number, smooth = true) => {
    setActive(i)
    refs.current[i]?.scrollIntoView({ block: 'center', behavior: smooth && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' })
  }, [])

  // 자동 시연 — 7초마다 다음 장면. 손을 대면(휠·터치·키·누르기) 바로 멈춘다
  useEffect(() => {
    if (!auto) return
    let i = active
    const id = window.setInterval(() => {
      i = (i + 1) % SCENES.length
      go(i)
    }, 7000)
    const stop = () => setAuto(false)
    const opts = { once: true, passive: true } as const
    window.addEventListener('wheel', stop, opts)
    window.addEventListener('touchstart', stop, opts)
    window.addEventListener('keydown', stop, { once: true })
    return () => {
      window.clearInterval(id)
      window.removeEventListener('wheel', stop)
      window.removeEventListener('touchstart', stop)
      window.removeEventListener('keydown', stop)
    }
    // active 는 시작점으로만 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, go])

  const ended = src
    ? dayDiff(lastDate(src.schedule.find(s => s.label.startsWith('일반공급 2순위'))?.date ?? '') ?? '2100-01-01') < 0
    : !!picked?.property.applicationEnd && dayDiff(picked.property.applicationEnd) < 0
  const chosenName = src?.name ?? picked?.property.name ?? null

  const body = (i: number) => {
    if (i === 0)
      return (
        <Choose
          items={items}
          failed={failed}
          region={journey.region}
          onRegion={code => setJourney({ region: code }, 'journey')}
          noticeId={journey.noticeId}
          verifiedPicked={!!src}
          onPick={pick}
        />
      )
    if (i === 1) {
      if (src && models) return <CompareTypes src={src} models={models} types={journey.unitTypes} onTypes={t => setJourney({ unitTypes: t }, 'journey')} />
      if (src) return <p className="op-jr__fine">단지 자료를 싣는 중</p>
      if (picked && items) return <CompareNotices items={items} picked={picked} />
      return <p className="op-jr__fine">장면 1에서 공고를 고르면 여기서 견줍니다.</p>
    }
    if (i === 2) return <Verify rows={verifyRows(src, picked)} />
    return <Prepare marks={marksFor(src, picked)} ended={ended} />
  }

  return (
    <div className="cs-jr" style={{ '--jr-p': (active + 1) / SCENES.length } as React.CSSProperties}>
      <div className="cs-jr__pin">
        <span className="cs-jr__num cs-num" key={active} aria-hidden="true">
          {String(active + 1).padStart(2, '0')}
        </span>
        <span className="cs-jr__verb" aria-hidden="true">
          {SCENES[active].verb}
        </span>
        {/* 장면 이름은 단추 — 스크롤 대신 눌러서도 간다 */}
        <ol className="cs-jr__rail" aria-label="네 장면">
          {SCENES.map((s, i) => (
            <li key={s.verb} data-on={i <= active || undefined}>
              <button
                type="button"
                aria-current={i === active ? 'step' : undefined}
                onClick={() => {
                  setAuto(false)
                  go(i)
                }}
              >
                {s.verb}
              </button>
            </li>
          ))}
        </ol>
        <p className="op-jr__chosen" aria-live="polite">
          {chosenName ? (
            <>
              <span>지금 보는 공고</span>
              <b>{chosenName}</b>
              {src && <em>검증용 사례 · 공고 원문 대조</em>}
            </>
          ) : (
            <span>아직 고른 공고가 없습니다</span>
          )}
        </p>
        <button type="button" className="op-jr__auto" aria-pressed={auto} onClick={() => setAuto(a => !a)}>
          {auto ? '자동 시연 멈추기' : '자동 시연'}
        </button>
      </div>

      <ol className="cs-jr__scenes">
        {SCENES.map((s, i) => (
          <li
            key={s.verb}
            ref={el => {
              refs.current[i] = el
            }}
            data-i={i}
            data-on={i === active || undefined}
            className="cs-jr__scene"
          >
            <span className="cs-jr__mobile-num cs-num" aria-hidden="true">
              {String(i + 1).padStart(2, '0')} · {s.verb}
            </span>
            <h3 className="cs-jr__title">{s.title}</h3>
            <p className="cs-jr__desc">{s.desc}</p>
            {body(i)}
            <Link href={s.href} className="cs-btn cs-btn--text cs-jr__go">
              {s.cta}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  )
}
