'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useConsumer } from './ConsumerProvider'
import YouthDiscoveryLoader from './YouthDiscoveryLoader'
import NightStage from './motion/NightStage'
import LitMap from './motion/LitMap'
import SceneSwitch, { useSceneMotion } from './motion/SceneSwitch'
import StepRail from './motion/StepRail'
import type { SearchProfile } from '@/lib/crm/types'
import { HOUSING_TYPES, type Homeownership, type HousingType } from '@/lib/crm/types'

/**
 * 고를 수 있는 지역 — 전국 광역.
 *
 * 예전에는 서울 자치구 열 곳만 있었다. 그런데 실제로 모이는 공고는 경기 28건,
 * 경남 12건, 강원 10건이고 서울은 0건이다. 서울 바깥에 사는 사람은 고를 것이
 * 없었고, 골라도 매칭은 지역 0점이 나왔다 — 조건 검색이 사실상 빈 결과를 냈다.
 *
 * 공고 분류(`provinceOf`)와 같은 축을 쓴다. 축이 어긋나면 고른 지역과 오는
 * 공고가 영영 만나지 못한다.
 *
 * 공고가 지금 없는 곳도 지운다: 조건은 앞으로 올 공고의 알림 기준이기도 하다.
 * 대신 건수를 함께 적어 어디에 기회가 몰려 있는지 고르기 전에 보이게 한다.
 */
const REGIONS: { name: string; hint: string }[] = [
  { name: '서울', hint: '25개 자치구' },
  { name: '경기', hint: '수원·성남·고양 등' },
  { name: '인천', hint: '송도·검단 등' },
  { name: '부산', hint: '해운대·동래 등' },
  { name: '대구', hint: '수성·달서 등' },
  { name: '광주', hint: '광산·북구 등' },
  { name: '대전', hint: '유성·서구 등' },
  { name: '울산', hint: '남구·북구 등' },
  { name: '세종', hint: '행정중심복합도시' },
  { name: '강원', hint: '춘천·원주·강릉 등' },
  { name: '충북', hint: '청주·충주 등' },
  { name: '충남', hint: '천안·아산 등' },
  { name: '전북', hint: '전주·군산 등' },
  { name: '전남', hint: '여수·순천·목포 등' },
  { name: '경북', hint: '포항·구미·경산 등' },
  { name: '경남', hint: '창원·김해·양산 등' },
  { name: '제주', hint: '제주시·서귀포시' },
]

const HOUSEHOLDS: { name: string; hint: string; types: HousingType[] }[] = [
  { name: '1인가구', hint: '혼자 살아요', types: ['청년매입임대', '행복주택'] },
  { name: '신혼부부', hint: '혼인 7년 이내', types: ['행복주택', '신혼희망타운'] },
  { name: '2인가구', hint: '둘이 살아요', types: ['행복주택', '공공임대'] },
  { name: '다자녀', hint: '자녀 2명 이상', types: ['공공임대', '행복주택'] },
  { name: '한부모', hint: '한부모 가족', types: ['공공임대', '행복주택'] },
]

const TYPE_HINT: Record<HousingType, string> = {
  청년매입임대: '청년 대상 · 자격은 공고별 확인',
  행복주택: '청년·신혼 등 · 공고별 확인',
  공공임대: '오래 살 수 있어요',
  공공지원민간임대: '민간 공급 · 임대료 상한이 있어요',
  신혼희망타운: '신혼부부를 위한 공급',
}

const OWNERSHIP = [
  { v: 'NONE', name: '무주택', hint: '세대구성원 전원 무주택' },
  { v: 'ONE', name: '1주택', hint: '처분 조건 공급이 있어요' },
  { v: 'MANY', name: '2주택 이상', hint: '지원 가능한 유형이 좁아져요' },
] as const

/** 레일의 마디 이름 — 앞으로 무엇을 더 묻는지 미리 보이게 */
const STEPS = ['지역', '주거비', '가구·선호', '자격·가점']
/** 장면의 이름표(영문 눈썹) */
const KICKER = ['Region', 'Budget', 'Household', 'Eligibility']

function manToKorean(man: number) {
  if (man >= 10000) {
    const eok = Math.floor(man / 10000)
    const rest = man % 10000
    return rest ? `${eok}억 ${rest.toLocaleString()}만원` : `${eok}억원`
  }
  return `${man.toLocaleString()}만원`
}

/** 막대가 어디까지 찼는지(%) — 트랙을 그 자리까지 주황으로 칠한다 */
function fill(v: number, min: number, max: number): CSSProperties {
  const pct = Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100))
  return { '--fill': `${Math.round(pct * 10) / 10}%` } as CSSProperties
}

/** 장면 안의 한 박자 — 차례(b)대로 들어온다 */
function Beat({ b, className, children }: { b: number; className?: string; children: ReactNode }) {
  return (
    <div className={['cs-beat', className].filter(Boolean).join(' ')} style={{ '--b': b } as CSSProperties}>
      {children}
    </div>
  )
}

export default function SearchWizard() {
  const { profile, loading } = useConsumer()
  if (loading)
    return (
      <div className="cs-wz cs-wz--boot" role="status">
        <NightStage variant="wizard" className="cs-wz__stage" />
        <div className="cs-wrap cs-wz__boot">
          <i className="cs-btn__spin" aria-hidden="true" />
          저장한 조건을 확인하고 있어요…
        </div>
      </div>
    )
  return <WizardForm initial={profile} />
}

function WizardForm({ initial }: { initial: SearchProfile | null }) {
  const { refresh } = useConsumer()
  const router = useRouter()
  const [step, setStep] = useState(0)

  const [regions, setRegions] = useState<string[]>(initial?.regions ?? [])
  const [deposit, setDeposit] = useState(initial?.maxDeposit ?? 8000)
  const [rent, setRent] = useState(initial?.maxMonthlyRent ?? 40)
  const [area, setArea] = useState(initial?.minArea ?? 28)
  /** 사용자가 "아직 정하지 않았어요"를 고른 항목 — 임의값으로 바꾸지 않는다 */
  const [unknown, setUnknown] = useState<Record<string, boolean>>({ deposit: initial?.unknownFields.includes('maxDeposit') ?? false, rent: initial?.unknownFields.includes('maxMonthlyRent') ?? false, area: initial?.unknownFields.includes('minArea') ?? false })
  const [household, setHousehold] = useState(initial?.householdType ?? '')
  const [types, setTypes] = useState<HousingType[]>(initial?.housingTypes ?? [])

  /* ── 4단계: 자격·가점 항목. 고르지 않으면 null 을 지킨다 ── */
  const [ownership, setOwnership] = useState<Homeownership | ''>(initial?.homeownership ?? '')
  const [homelessYears, setHomelessYears] = useState(initial?.homelessYears ?? 0)
  const [residencyYears, setResidencyYears] = useState(initial?.residencyYears ?? 0)
  const [accountYears, setAccountYears] = useState(initial?.accountYears ?? 0)
  const [dependents, setDependents] = useState(initial?.dependents ?? 0)
  /** 자격 항목을 건드렸는지. 손대지 않았으면 0 이 아니라 "모름"으로 보낸다 */
  const [touchedQual, setTouchedQual] = useState(false)

  const [busy, setBusy] = useState(false)
  /** 결과 화면으로 넘겨주는 중 — 장면이 앞으로 빨려 들어간다 */
  const [leaving, setLeaving] = useState(false)
  /** 지금 실제로 하고 있는 단계 — 기다림 카드에 그대로 적는다 */
  const [stage, setStage] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const [error, setError] = useState<string | null>(null)

  /** 지금 모집 중인 공고의 지역별 건수. 못 받아오면 그냥 건수를 안 적는다 */
  const [counts, setCounts] = useState<Record<string, number> | null>(null)

  const { motion, turn, settle } = useSceneMotion()
  const rootRef = useRef<HTMLDivElement>(null)
  /** 사람이 넘긴 장면인지 — 임시 저장을 되살린 경우에는 초점을 옮기지 않는다 */
  const navRef = useRef(false)

  useEffect(() => {
    let alive = true
    fetch('/api/notices?limit=1', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((json: { regions?: { name: string; count: number }[] } | null) => {
        if (!alive || !json?.regions) return
        const map: Record<string, number> = {}
        for (const { name, count } of json.regions) {
          // LH 는 '전남·광주' 처럼 둘을 묶어 적는다. 양쪽에 다 얹는다.
          for (const one of name.split('·')) map[one.trim()] = (map[one.trim()] ?? 0) + count
        }
        setCounts(map)
      })
      .catch(() => {
        /* 건수는 곁들이는 정보다. 못 받았다고 지역을 못 고르게 하지 않는다 */
      })
    return () => {
      alive = false
    }
  }, [])

  /** 공고가 있는 곳을 위로. 건수를 모르는 동안에는 적어 둔 차례 그대로 둔다 */
  const regionList = useMemo(() => {
    if (!counts) return REGIONS
    return [...REGIONS].sort((a, b) => (counts[b.name] ?? 0) - (counts[a.name] ?? 0))
  }, [counts])

  useEffect(() => {
    const raw = sessionStorage.getItem('ci-search-draft')
    if (!raw) return
    try {
      const d = JSON.parse(raw)
      queueMicrotask(() => { setRegions(d.regions); setDeposit(d.deposit); setRent(d.rent); setArea(d.area); setUnknown(d.unknown); setHousehold(d.household); setTypes(d.types); setStep(d.step) })
    } catch { sessionStorage.removeItem('ci-search-draft') }
  }, [])
  useEffect(() => {
    sessionStorage.setItem('ci-search-draft', JSON.stringify({ regions, deposit, rent, area, unknown, household, types, step }))
  }, [regions, deposit, rent, area, unknown, household, types, step])

  /** 장면을 넘긴다 — 나가는 장면은 방향대로 밀려나고, 들어오는 장면이 차례로 선다 */
  const go = (to: number) => {
    if (to === step) return
    turn(step, to)
    navRef.current = true
    setStep(to)
  }

  // 새 장면의 질문으로 초점을 옮긴다. 아래까지 내려와 '다음'을 눌렀다면 무대 머리로 데려간다
  useEffect(() => {
    if (!navRef.current) return
    navRef.current = false
    const q = document.getElementById('cs-wz-q')
    q?.focus({ preventScroll: true })
    const root = rootRef.current
    if (root && root.getBoundingClientRect().top < 0) {
      const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      root.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' })
    }
  }, [step])

  const toggleRegion = (name: string) =>
    setRegions(prev =>
      prev.includes(name) ? prev.filter(r => r !== name) : prev.length >= 3 ? prev : [...prev, name],
    )

  const toggleType = (t: HousingType) =>
    setTypes(prev => (prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]))

  const pickHousehold = (h: (typeof HOUSEHOLDS)[number]) => {
    setHousehold(h.name)
    setTypes(h.types)
  }

  const markUnknown = (field: string) => setUnknown(prev => ({ ...prev, [field]: !prev[field] }))

  const submit = async () => {
    // 두 번 눌러도 요청은 하나 — 앞의 것을 거둔다
    abortRef.current?.abort()
    const ctl = new AbortController()
    abortRef.current = ctl
    setBusy(true)
    setError(null)
    setStage('조건에 맞는 공고를 대조하고 있어요')
    try {
      const res = await fetch('/api/search', {
        signal: ctl.signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          regions,
          householdType: household || null,
          housingTypes: types,
          // 정하지 않은 항목은 보내지 않는다. 서버가 UNKNOWN 으로 보존한다.
          maxDeposit: unknown.deposit ? null : deposit,
          maxMonthlyRent: unknown.rent ? null : rent,
          minArea: unknown.area ? null : area,
          // 손대지 않은 자격 항목은 0 이 아니라 "모름"이다. 0 으로 보내면
          // 화면이 "무주택 0년"을 사실처럼 보여주게 된다.
          homeownership: ownership || null,
          homelessYears: touchedQual ? homelessYears : null,
          residencyYears: touchedQual ? residencyYears : null,
          accountYears: touchedQual ? accountYears : null,
          dependents: touchedQual ? dependents : null,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? '후보를 찾지 못했어요.')
      if (ctl.signal.aborted) return
      setStage('저장한 조건을 불러오고 있어요')
      sessionStorage.removeItem('ci-search-draft')
      await refresh()
      if (ctl.signal.aborted) return
      setStage('결과 화면으로 넘어가고 있어요')
      setLeaving(true)
      router.push('/results')
    } catch (err) {
      // 사용자가 거둔 요청은 오류가 아니다. 입력은 그대로 남아 있다
      if (ctl.signal.aborted) return
      setError(err instanceof Error ? err.message : '후보를 찾지 못했어요.')
      setBusy(false)
    }
  }

  // 넘겨주는 장면이 길어지면(이동이 늦거나 막히면) 무대를 다시 세운다
  useEffect(() => {
    if (!leaving) return
    const id = window.setTimeout(() => setLeaving(false), 2400)
    return () => window.clearTimeout(id)
  }, [leaving])

  const cancel = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setBusy(false)
    setLeaving(false)
  }

  /* ── 지금까지 고른 조건 — 옆자리의 표. 정하지 않은 것은 '미정'으로 적는다 ── */
  const ticket: { k: string; v: string | null; at: number }[] = [
    { k: '지역', v: regions.length ? regions.join(' · ') : null, at: 0 },
    {
      k: '주거비',
      v:
        step < 1
          ? null
          : [unknown.deposit ? '보증금 미정' : `보증금 ${manToKorean(deposit)}`, unknown.rent ? '월세 미정' : `월세 ${rent.toLocaleString()}만원`].join(' · '),
      at: 1,
    },
    {
      k: '가구·유형',
      v: step < 2 ? null : [household || '가구 미선택', types.length ? types.join(', ') : '유형 미선택'].join(' · '),
      at: 2,
    },
    {
      k: '자격 항목',
      v: step < 3 ? null : touchedQual || ownership ? '입력함 · 가점 계산에 써요' : '건너뛰어도 괜찮아요',
      at: 3,
    },
  ]

  const onSettled = useCallback((n: number) => settle(n), [settle])

  /* ── 장면 — ghost 는 나가는 그림자. id 처럼 겹치면 안 되는 것은 빼고 그린다 ── */
  const renderStep = (i: number, ghost: boolean) => {
    const id = (s: string) => (ghost ? undefined : s)

    const head = (q: string, sub: ReactNode) => (
      <>
        <Beat b={0}>
          <p className="cs-wz-kicker">
            <span className="cs-num">{String(i + 1).padStart(2, '0')}</span>
            {KICKER[i]}
          </p>
        </Beat>
        <Beat b={1}>
          <h1 className="cs-wz-q" id={id('cs-wz-q')} tabIndex={ghost ? undefined : -1}>
            {q}
          </h1>
        </Beat>
        <Beat b={2}>
          <p className="cs-wz-sub">{sub}</p>
        </Beat>
      </>
    )

    const nav = (b: number, next: ReactNode) => (
      <Beat b={b} className="cs-wz-nav">
        {i > 0 ? (
          <button type="button" className="cs-wz-back" onClick={() => go(i - 1)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5M11 6l-6 6 6 6" />
            </svg>
            이전
          </button>
        ) : (
          <span />
        )}
        {next}
      </Beat>
    )

    const nextBtn = (to: number, label = '다음', disabled = false) => (
      <button type="button" className="cs-btn cs-btn--primary cs-wz-next" onClick={() => go(to)} disabled={disabled}>
        {label}
        {!disabled && (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        )}
      </button>
    )

    /* ── 1단계 지역 ─────────────────────────── */
    if (i === 0)
      return (
        <div className="cs-wz-scene">
          {head(
            '어느 지역을 찾고 계세요?',
            <>
              시·도 기준으로 최대 3곳까지 고를 수 있어요. <b>먼저 고른 곳을 더 중요하게</b> 봅니다.
            </>,
          )}
          <Beat b={3}>
            <div className="cs-wz-tiles cs-wz-tiles--region" role="group" aria-label="지역 (최대 3곳)">
              {regionList.map((r, ti) => {
                const idx = regions.indexOf(r.name)
                const on = idx >= 0
                // 건수를 받아온 뒤라면 표에 없는 지역은 0 건이다. `counts?.[name]` 로
                // 두면 0 건이 "아직 안 받아옴"과 구별되지 않아 힌트가 나온다.
                const n = counts ? (counts[r.name] ?? 0) : undefined
                return (
                  <button
                    key={r.name}
                    type="button"
                    className="cs-wz-tile"
                    data-on={on ? 'true' : 'false'}
                    data-rank={on ? idx + 1 : undefined}
                    data-has={n !== undefined && n > 0 ? 'true' : undefined}
                    style={{ '--t': ti } as CSSProperties}
                    onClick={() => toggleRegion(r.name)}
                    disabled={!on && regions.length >= 3}
                    aria-pressed={on}
                  >
                    {on && (
                      <>
                        <span className="cs-wz-tile__rank cs-num" aria-hidden="true">
                          {idx + 1}
                        </span>
                        <span className="cs-sr">{idx + 1}순위,</span>
                      </>
                    )}
                    <span className="cs-wz-tile__name">{r.name}</span>
                    {/* 건수를 모르는 동안에는 지역 설명을 보여 준다. 0 건도 적는다 —
                        지금 없다는 사실을 숨기면 고르고 나서 알게 된다 */}
                    <span className="cs-wz-tile__sub">
                      {n === undefined ? r.hint : n > 0 ? `모집 중 ${n}건` : '지금은 공고 없음'}
                    </span>
                  </button>
                )
              })}
            </div>
          </Beat>
          <Beat b={4}>
            <p className="cs-wz-count" aria-live={ghost ? undefined : 'polite'}>
              <span className="cs-wz-count__dots" aria-hidden="true">
                {[0, 1, 2].map(d => (
                  <i key={d} data-on={d < regions.length || undefined} />
                ))}
              </span>
              {regions.length === 0
                ? '아직 고른 지역이 없어요'
                : regions.length >= 3
                  ? '3곳을 다 골랐어요 · 바꾸려면 고른 칸을 다시 누르세요'
                  : `${regions.length}곳 골랐어요 · ${3 - regions.length}곳 더 고를 수 있어요`}
            </p>
          </Beat>
          {nav(5, nextBtn(1, regions.length === 0 ? '지역을 골라주세요' : '다음', regions.length === 0))}
        </div>
      )

    /* ── 2단계 주거비 ───────────────────────── */
    if (i === 1)
      return (
        <div className="cs-wz-scene">
          {head('주거비는 어느 정도 생각하세요?', '입력하신 금액을 넘는 공고는 따로 구분해서 보여드려요.')}

          <Beat b={3} className="cs-wz-field">
            <div className="cs-wz-field__row">
              <label className="cs-wz-field__label" htmlFor={id('deposit')}>
                보증금 상한
              </label>
              <span className="cs-wz-val" data-unset={unknown.deposit || undefined}>
                {unknown.deposit ? '미정' : manToKorean(deposit)}
              </span>
            </div>
            {!unknown.deposit && (
              <>
                <div className="cs-wz-amount">
                  <button
                    type="button"
                    className="cs-wz-step"
                    onClick={() => setDeposit(v => Math.max(0, v - 500))}
                    aria-label="보증금 상한 500만원 줄이기"
                  >
                    −
                  </button>
                  <div className="cs-wz-amount__box">
                    <input
                      id={id('deposit')}
                      className="cs-wz-amount__input"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={100}
                      value={deposit}
                      onChange={e => setDeposit(Math.max(0, Number(e.target.value)))}
                    />
                    <span className="cs-wz-amount__unit">만원</span>
                  </div>
                  <button
                    type="button"
                    className="cs-wz-step"
                    onClick={() => setDeposit(v => v + 500)}
                    aria-label="보증금 상한 500만원 늘리기"
                  >
                    +
                  </button>
                </div>
                <input
                  className="cs-wz-range"
                  type="range"
                  min={1000}
                  max={30000}
                  step={500}
                  value={Math.min(30000, deposit)}
                  style={fill(Math.min(30000, deposit), 1000, 30000)}
                  onChange={e => setDeposit(Number(e.target.value))}
                  aria-label="보증금 상한 조절"
                />
                <div className="cs-wz-scale" aria-hidden="true">
                  <span>1,000만원</span>
                  <span>3억원</span>
                </div>
              </>
            )}
            <button type="button" className="cs-wz-skip" onClick={() => markUnknown('deposit')}>
              {unknown.deposit ? '금액 입력할게요' : '아직 정하지 않았어요'}
            </button>
          </Beat>

          <Beat b={4} className="cs-wz-field">
            <div className="cs-wz-field__row">
              <label className="cs-wz-field__label" htmlFor={id('rent')}>
                월 임대료 상한
              </label>
              <span className="cs-wz-val" data-unset={unknown.rent || undefined}>
                {unknown.rent ? '미정' : `${rent.toLocaleString()}만원`}
              </span>
            </div>
            {!unknown.rent && (
              <>
                <div className="cs-wz-amount">
                  <button
                    type="button"
                    className="cs-wz-step"
                    onClick={() => setRent(v => Math.max(0, v - 5))}
                    aria-label="월 임대료 상한 5만원 줄이기"
                  >
                    −
                  </button>
                  <div className="cs-wz-amount__box">
                    <input
                      id={id('rent')}
                      className="cs-wz-amount__input"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={rent}
                      onChange={e => setRent(Math.max(0, Number(e.target.value)))}
                    />
                    <span className="cs-wz-amount__unit">만원</span>
                  </div>
                  <button
                    type="button"
                    className="cs-wz-step"
                    onClick={() => setRent(v => v + 5)}
                    aria-label="월 임대료 상한 5만원 늘리기"
                  >
                    +
                  </button>
                </div>
                <input
                  className="cs-wz-range"
                  type="range"
                  min={0}
                  max={150}
                  step={1}
                  value={Math.min(150, rent)}
                  style={fill(Math.min(150, rent), 0, 150)}
                  onChange={e => setRent(Number(e.target.value))}
                  aria-label="월 임대료 상한 조절"
                />
                <div className="cs-wz-scale" aria-hidden="true">
                  <span>0만원</span>
                  <span>150만원</span>
                </div>
              </>
            )}
            <button type="button" className="cs-wz-skip" onClick={() => markUnknown('rent')}>
              {unknown.rent ? '금액 입력할게요' : '아직 정하지 않았어요'}
            </button>
          </Beat>

          {nav(5, nextBtn(2))}
        </div>
      )

    /* ── 3단계 가구·선호 ────────────────────── */
    if (i === 2)
      return (
        <div className="cs-wz-scene">
          {head('어떤 가구이신가요?', '선택은 건너뛰어도 괜찮아요. 가구 선택만으로 지원 자격이 확정되지는 않아요.')}

          <Beat b={3}>
            <div className="cs-wz-tiles" role="group" aria-label="가구 형태">
              {HOUSEHOLDS.map((h, ti) => (
                <button
                  key={h.name}
                  type="button"
                  className="cs-wz-tile"
                  data-on={household === h.name ? 'true' : 'false'}
                  style={{ '--t': ti } as CSSProperties}
                  onClick={() => pickHousehold(h)}
                  aria-pressed={household === h.name}
                >
                  <span className="cs-wz-tile__name">{h.name}</span>
                  <span className="cs-wz-tile__sub">{h.hint}</span>
                </button>
              ))}
            </div>
          </Beat>

          <Beat b={4} className="cs-wz-field">
            <span className="cs-wz-field__label" id={id('cs-wz-types')}>
              관심 있는 주택 유형
            </span>
            <div className="cs-wz-tiles cs-wz-tiles--wide" role="group" aria-labelledby={id('cs-wz-types')}>
              {HOUSING_TYPES.map((t, ti) => (
                <button
                  key={t}
                  type="button"
                  className="cs-wz-tile cs-wz-tile--check"
                  data-on={types.includes(t) ? 'true' : 'false'}
                  style={{ '--t': ti } as CSSProperties}
                  onClick={() => toggleType(t)}
                  aria-pressed={types.includes(t)}
                >
                  <span className="cs-wz-tile__name">{t}</span>
                  <span className="cs-wz-tile__sub">{TYPE_HINT[t]}</span>
                </button>
              ))}
            </div>
          </Beat>

          <Beat b={5} className="cs-wz-field">
            <div className="cs-wz-field__row">
              <label className="cs-wz-field__label" htmlFor={id('area')}>
                희망 최소 면적
              </label>
              <span className="cs-wz-val" data-unset={unknown.area || undefined}>
                {unknown.area ? (
                  '미정'
                ) : (
                  <>
                    {area}㎡ <small>약 {Math.round(area / 3.3)}평</small>
                  </>
                )}
              </span>
            </div>
            {!unknown.area && (
              <>
                <input
                  id={id('area')}
                  className="cs-wz-range"
                  type="range"
                  min={15}
                  max={85}
                  step={1}
                  value={area}
                  style={fill(area, 15, 85)}
                  onChange={e => setArea(Number(e.target.value))}
                  aria-label="희망 최소 면적 조절"
                />
                <div className="cs-wz-scale" aria-hidden="true">
                  <span>15㎡ · 약 5평</span>
                  <span>85㎡ · 약 26평</span>
                </div>
              </>
            )}
            <button type="button" className="cs-wz-skip" onClick={() => markUnknown('area')}>
              {unknown.area ? '면적 입력할게요' : '아직 정하지 않았어요'}
            </button>
          </Beat>

          {nav(6, nextBtn(3))}
        </div>
      )

    /* ── 4단계 자격·가점 ─────────────────────── */
    return (
      <div className="cs-wz-scene">
        {head(
          '자격을 가르는 항목도 알려주시겠어요?',
          <>
            무주택 여부와 거주기간은 공고마다 요건이 다릅니다. 적어두시면 공고를 볼 때 무엇을 더 확인해야
            하는지 함께 짚어 드리고, 가점 계산도 이 값으로 열려요. 전부 건너뛰셔도 후보는 그대로 보실 수 있어요.
          </>,
        )}

        <Beat b={3} className="cs-wz-field">
          <span className="cs-wz-field__label" id={id('cs-wz-own')}>
            주택 소유
          </span>
          <div className="cs-wz-tiles cs-wz-tiles--three" role="group" aria-labelledby={id('cs-wz-own')}>
            {OWNERSHIP.map((o, ti) => (
              <button
                key={o.v}
                type="button"
                className="cs-wz-tile"
                data-on={ownership === o.v ? 'true' : 'false'}
                aria-pressed={ownership === o.v}
                style={{ '--t': ti } as CSSProperties}
                onClick={() => {
                  setOwnership(ownership === o.v ? '' : (o.v as Homeownership))
                  setTouchedQual(true)
                }}
              >
                <span className="cs-wz-tile__name">{o.name}</span>
                <span className="cs-wz-tile__sub">{o.hint}</span>
              </button>
            ))}
          </div>
        </Beat>

        <Beat b={4} className="cs-wz-quals">
          {(
            [
              { key: 'homeless', label: '무주택 기간', unit: '년', max: 16, v: homelessYears, set: setHomelessYears, hint: '가점 32점 항목 · 1년당 2점' },
              { key: 'residency', label: '해당지역 거주기간', unit: '년', max: 30, v: residencyYears, set: setResidencyYears, hint: '순위·우선공급을 가르는 기준이에요' },
              { key: 'account', label: '청약통장 가입기간', unit: '년', max: 17, v: accountYears, set: setAccountYears, hint: '가점 17점 항목 · 1년당 1점' },
              { key: 'dependents', label: '부양가족 수', unit: '명', max: 6, v: dependents, set: setDependents, hint: '가점 35점 항목 · 본인 제외' },
            ] as const
          ).map(f => (
            <div className="cs-wz-field cs-wz-field--qual" key={f.key}>
              <div className="cs-wz-field__row">
                <label className="cs-wz-field__label" htmlFor={id(`q-${f.key}`)}>
                  {f.label}
                </label>
                <span className="cs-wz-val cs-wz-val--sm">
                  {f.v}
                  <small>{f.unit}</small>
                </span>
              </div>
              <input
                id={id(`q-${f.key}`)}
                type="range"
                className="cs-wz-range"
                min={0}
                max={f.max}
                step={1}
                value={f.v}
                style={fill(f.v, 0, f.max)}
                onChange={e => {
                  f.set(Number(e.target.value))
                  setTouchedQual(true)
                }}
              />
              <p className="cs-wz-hint">{f.hint}</p>
            </div>
          ))}
        </Beat>

        {/* 찾기에 실패하면 누른 단추 바로 위에 적는다 — 긴 단계의 맨 위에 두면 아래에서 누른 사람은 못 본다 */}
        {error && !ghost && (
          <div className="cs-wz-error" role="alert">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7.5v5.5M12 16.5v.01" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {nav(
          5,
          <button
            type="button"
            className="cs-btn cs-btn--primary cs-wz-next cs-wz-submit"
            onClick={submit}
            disabled={busy}
            aria-busy={busy}
          >
            {busy && <i className="cs-btn__spin" aria-hidden="true" />}
            {busy ? '찾는 중…' : '내 후보 확인하기'}
            {!busy && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            )}
          </button>,
        )}
      </div>
    )
  }

  return (
    <>
      <div
        ref={rootRef}
        className="cs-wz"
        data-step={step}
        data-busy={busy || undefined}
        data-leaving={leaving || undefined}
      >
        <NightStage variant="wizard" className="cs-wz__stage" />

        <div className="cs-wrap cs-wz__inner">
          <StepRail steps={STEPS} current={step} busy={busy} />

          <div className="cs-wz__grid">
            <div className="cs-wz__main">
              <SceneSwitch index={step} motion={motion} onSettled={onSettled} render={renderStep} />
              <p className="cs-wz-foot">
                소득·자산 같은 공식 자격요건은 이 단계에서 묻지 않습니다. 결과를 보신 뒤 필요할 때 확인해요.
              </p>
            </div>

            <aside className="cs-wz__side" aria-label="지금까지 고른 조건">
              <LitMap picked={regions} counts={counts} />
              <dl className="cs-wz-ticket">
                {ticket.map(t => (
                  <div key={t.k} className="cs-wz-ticket__row" data-filled={t.v ? 'true' : undefined} data-now={t.at === step || undefined}>
                    <dt>{t.k}</dt>
                    <dd>{t.v ?? (t.at > step ? '다음 단계에서 물어요' : '아직 고르지 않았어요')}</dd>
                  </div>
                ))}
              </dl>
              {counts && <p className="cs-wz-source">지도의 데운 곳 · 칸의 건수는 지금 모집 중인 공고 집계예요</p>}
            </aside>
          </div>

        </div>
      </div>

      <YouthDiscoveryLoader active={busy} stage={stage} onCancel={cancel} onRetry={submit} />
    </>
  )
}
