'use client'

import Link from 'next/link'
import { useEffect, useState, type CSSProperties } from 'react'
import DrawVsScore from './DrawVsScore'
import PageMasthead from './PageMasthead'
import TiltCard from './TiltCard'
import RollingNumber from './motion/RollingNumber'
import { guessZone } from '@/lib/consumer/draw-vs-score'
import {
  SCORE_LIMITS,
  buildComparison,
  type ReferenceStats,
  type ScoreComparison,
} from '@/lib/subscription-score'
import { GridChoice } from './Choose'
import { useConsumer } from './ConsumerProvider'

/**
 * 청약 가점 계산 — 84점 만점의 세 항목을 직접 맞춰보는 자리.
 *
 * 당첨 확률은 내지 않는다. 검증되지 않은 계수로 만든 확률(%)은 공식 예측처럼
 * 읽히기 때문이다. 대신 공개 통계상의 평균·최저 당첨가점과 내 점수의 실제
 * 차이만 보여준다 — 확률이 아니라 위치다.
 *
 * 조건을 저장해 둔 사람은 그 값으로 시작한다. 같은 것을 두 번 묻지 않는다.
 *
 * 화면은 계기판이다. 기울어진 원판 위에서 바늘이 84점 눈금을 따라 돌고,
 * 가운데 숫자는 띠를 굴려 넘어간다. 원판의 바깥 띠는 고른 지역의 **지난
 * 당첨가점 범위**(최저~최고)이고, 삼각 표지는 평균이다 — 내 바늘이 그 띠의
 * 어디쯤에 서는지만 보인다. 확률을 그리지 않는다.
 */

const REGIONS: { code: string; name: string }[] = [
  { code: '', name: '전국' },
  { code: '100', name: '서울' },
  { code: '410', name: '경기' },
  { code: '400', name: '인천' },
  { code: '600', name: '부산' },
  { code: '700', name: '대구' },
  { code: '300', name: '대전' },
  { code: '500', name: '광주' },
  { code: '680', name: '울산' },
  { code: '338', name: '세종' },
  { code: '200', name: '강원' },
  { code: '360', name: '충북' },
  { code: '312', name: '충남' },
  { code: '560', name: '전북' },
  { code: '513', name: '전남' },
  { code: '712', name: '경북' },
  { code: '621', name: '경남' },
  { code: '690', name: '제주' },
]

/** 항목마다 만점과 셈법이 다르다. 화면에 그대로 적어둔다 */
const ITEMS = [
  {
    key: 'homeless' as const,
    label: '무주택 기간',
    short: '무주택',
    unit: '년',
    max: SCORE_LIMITS.homelessYearsMax,
    points: 32,
    rule: '1년 미만 2점 · 1년마다 +2 · 15년 이상 32점',
  },
  {
    key: 'dependents' as const,
    label: '부양가족 수',
    short: '부양가족',
    unit: '명',
    max: SCORE_LIMITS.dependentsMax,
    points: 35,
    rule: '0명 5점 · 1명마다 +5 · 본인 제외',
  },
  {
    key: 'account' as const,
    label: '청약통장 가입기간',
    short: '통장',
    unit: '년',
    max: SCORE_LIMITS.accountYearsMax,
    points: 17,
    rule: '1년 3점 · 1년마다 +1 · 15년 이상 17점',
  },
]

const FULL = 84
/** 눈금이 도는 폭(도). 아래 120도는 비워 숫자와 범례를 둔다 */
const SWEEP = 240
/** 원판 중심과 반지름 — SVG 좌표 */
const C = 220

function angleOf(score: number) {
  const s = Math.min(FULL, Math.max(0, score))
  return -SWEEP / 2 + (SWEEP * s) / FULL
}

/** 12시 방향을 0도로, 시계 방향으로 잰 각의 원 위 점 */
function polar(r: number, deg: number) {
  const a = (deg * Math.PI) / 180
  return [round(C + r * Math.sin(a)), round(C - r * Math.cos(a))] as const
}

/** 서버와 브라우저가 소수를 다르게 적는다 — 둘째 자리에서 끊는다 */
function round(n: number) {
  return Math.round(n * 100) / 100
}

function arc(r: number, from: number, to: number) {
  const [x1, y1] = polar(r, from)
  const [x2, y2] = polar(r, to)
  const large = to - from > 180 ? 1 : 0
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`
}

const TICKS = Array.from({ length: FULL + 1 }, (_, i) => {
  const major = i % 10 === 0 || i === FULL
  const a = angleOf(i)
  const [x1, y1] = polar(major ? 150 : 160, a)
  const [x2, y2] = polar(178, a)
  return { i, major, x1, y1, x2, y2 }
})
const LABELS = [0, 10, 20, 30, 40, 50, 60, 70, 80].map(n => {
  const [x, y] = polar(132, angleOf(n))
  return { n, x, y }
})

/**
 * 계기판 원판.
 *
 * 켜질 때 바늘이 끝까지 한 번 돌았다 돌아온다(움직임을 줄인 사용자는 제외).
 * 눈금은 바늘이 지나는 순서대로 켜지고 꺼진다 — 지나간 거리만큼 지연을 준다.
 */
function ScoreDial({
  total,
  reference,
}: {
  total: number
  reference: { avg: number; min: number; max: number; label: string } | null
}) {
  const [boot, setBoot] = useState(false)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const on = window.setTimeout(() => setBoot(true), 420)
    const off = window.setTimeout(() => setBoot(false), 1320)
    return () => {
      window.clearTimeout(on)
      window.clearTimeout(off)
    }
  }, [])

  const shown = boot ? FULL : total
  // 바늘이 어디서 출발했는지 — 눈금이 그 자리부터 차례로 켜지게
  const [trail, setTrail] = useState({ from: shown, to: shown })
  if (trail.to !== shown) setTrail({ from: trail.to, to: shown })
  const span = Math.max(1, Math.abs(trail.to - trail.from))
  const step = Math.min(14, 640 / span)

  return (
    <div className="cs-sb-dial">
      <TiltCard className="cs-sb-dial__tilt" max={5}>
        <div className="cs-sb-dial__obj" data-boot={boot || undefined}>
          {/* 두께 — 원판 아래로 겹겹이 물러나는 테 */}
          {Array.from({ length: 7 }).map((_, i) => (
            <i key={i} className="cs-sb-dial__edge" style={{ '--z': i + 1 } as CSSProperties} aria-hidden="true" />
          ))}
          <div className="cs-sb-dial__face" aria-hidden="true" />
          <svg className="cs-sb-dial__svg" viewBox="0 0 440 440" aria-hidden="true">
            <circle className="cs-sb-dial__bezel" cx={C} cy={C} r={204} />
            <path className="cs-sb-dial__track" d={arc(169, -SWEEP / 2, SWEEP / 2)} />
            {reference && (
              <g className="cs-sb-dial__ref">
                <path className="cs-sb-dial__band" d={arc(192, angleOf(reference.min), angleOf(reference.max))} />
                {/* 최저 — 넘어야 했던 선 */}
                <line
                  className="cs-sb-dial__min"
                  x1={polar(184, angleOf(reference.min))[0]}
                  y1={polar(184, angleOf(reference.min))[1]}
                  x2={polar(200, angleOf(reference.min))[0]}
                  y2={polar(200, angleOf(reference.min))[1]}
                />
                {/* 평균 — 바깥에서 안을 가리키는 삼각 */}
                <polygon
                  className="cs-sb-dial__avg"
                  points="-7,-10 7,-10 0,2"
                  transform={`translate(${polar(194, angleOf(reference.avg)).join(' ')}) rotate(${round(angleOf(reference.avg) + 180)})`}
                />
              </g>
            )}
            <g className="cs-sb-dial__ticks">
              {TICKS.map(t => (
                <line key={t.i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} data-major={t.major || undefined} />
              ))}
            </g>
            <g className="cs-sb-dial__lit">
              {TICKS.map(t => (
                <line
                  key={t.i}
                  x1={t.x1}
                  y1={t.y1}
                  x2={t.x2}
                  y2={t.y2}
                  data-major={t.major || undefined}
                  data-on={shown > 0 && t.i <= shown}
                  style={{ transitionDelay: `${Math.round(Math.abs(t.i - trail.from) * step)}ms` }}
                />
              ))}
            </g>
            <g className="cs-sb-dial__nums">
              {LABELS.map(l => (
                <text key={l.n} x={l.x} y={l.y} data-past={shown >= l.n && shown > 0 ? true : undefined}>
                  {l.n}
                </text>
              ))}
            </g>
            {/* 바늘 — 눈금 바깥 띠에만 선다. 가운데는 숫자의 자리 */}
            <g className="cs-sb-dial__needle" style={{ transform: `rotate(${angleOf(shown)}deg)` }}>
              <path d={`M ${C - 3} ${C - 112} L ${C} ${C - 188} L ${C + 3} ${C - 112} Z`} />
              <circle cx={C} cy={C - 169} r={5} />
            </g>
          </svg>

          <div className="cs-sb-dial__read" aria-hidden="true">
            <span className="cs-sb-dial__k">내 가점</span>
            <span className="cs-sb-dial__n">
              <RollingNumber value={total} digits={2} />
            </span>
            <span className="cs-sb-dial__of">/ {FULL}점</span>
          </div>
        </div>
      </TiltCard>
      <span className="cs-sb-dial__floor" aria-hidden="true" />
    </div>
  )
}

/** 손잡이 한 줄 — 눈금 있는 미끄럼대와 한 칸씩 움직이는 단추 */
function Knob({
  label,
  unit,
  max,
  points,
  rule,
  value,
  earned,
  onChange,
}: {
  label: string
  unit: string
  max: number
  points: number
  rule: string
  value: number
  earned: number
  onChange: (v: number) => void
}) {
  const set = (v: number) => onChange(Math.min(max, Math.max(0, v)))
  const atMax = value >= max

  return (
    <div className="cs-sb-knob" style={{ '--p': value / max } as CSSProperties}>
      <div className="cs-sb-knob__top">
        <span className="cs-sb-knob__label">{label}</span>
        <span className="cs-sb-knob__earned">
          <RollingNumber value={earned} digits={1} />
          <span className="cs-sb-knob__of">/ {points}점</span>
          <span className="cs-sr">
            {earned}점 / {points}점
          </span>
        </span>
      </div>

      <div className="cs-sb-knob__ctl">
        <button
          type="button"
          className="cs-sb-knob__step"
          onClick={() => set(value - 1)}
          disabled={value <= 0}
          aria-label={`${label} 1${unit} 줄이기`}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M6 12h12" />
          </svg>
        </button>

        <div className="cs-sb-slide">
          <div className="cs-sb-slide__rail" aria-hidden="true">
            <span className="cs-sb-slide__fill" />
          </div>
          <div className="cs-sb-slide__ticks" aria-hidden="true">
            {Array.from({ length: max + 1 }).map((_, i) => (
              <span key={i} data-on={i <= value} data-major={i === 0 || i === max || i % 5 === 0 || undefined} />
            ))}
          </div>
          <input
            type="range"
            className="cs-sb-slide__input"
            min={0}
            max={max}
            step={1}
            value={value}
            onChange={e => set(Number(e.target.value))}
            aria-label={`${label} (${unit})`}
            aria-valuetext={`${value}${unit}${atMax ? ' 이상' : ''} · ${earned}점`}
          />
        </div>

        <button
          type="button"
          className="cs-sb-knob__step"
          onClick={() => set(value + 1)}
          disabled={atMax}
          aria-label={`${label} 1${unit} 늘리기`}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M6 12h12M12 6v12" />
          </svg>
        </button>

        <output className="cs-sb-knob__value" aria-hidden="true">
          <RollingNumber value={value} digits={1} />
          <span className="cs-sb-knob__unit">
            {unit}
            {atMax && <em>이상</em>}
          </span>
        </output>
      </div>

      <p className="cs-sb-knob__rule">{rule}</p>
    </div>
  )
}

export default function ScoreCalculator() {
  const { profile } = useConsumer()

  const [homeless, setHomeless] = useState(0)
  const [dependents, setDependents] = useState(0)
  const [account, setAccount] = useState(0)
  const [region, setRegion] = useState('')

  /** 어떤 조건의 결과인지 함께 담아, 로딩 여부를 파생값으로 계산한다 */
  const [refResult, setRefResult] = useState<{ key: string; stats: ReferenceStats | null } | null>(null)
  const refLoading = refResult?.key !== region
  const ref = refResult?.key === region ? refResult.stats : null

  // 저장한 조건에 자격 정보가 있으면 그 값으로 연다. 조건이 늦게 도착하므로
  // 초기값으로는 받을 수 없고, 도착한 뒤 한 번만 씨를 뿌린다.
  const [seeded, setSeeded] = useState<string | null>(null)
  if (profile && seeded !== profile.updatedAt) {
    setSeeded(profile.updatedAt)
    if (typeof profile.homelessYears === 'number') setHomeless(profile.homelessYears)
    if (typeof profile.dependents === 'number') setDependents(profile.dependents)
    if (typeof profile.accountYears === 'number') setAccount(profile.accountYears)
  }

  useEffect(() => {
    let alive = true
    fetch(`/api/prediction/reference${region ? `?region=${region}` : ''}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((json: { stats: ReferenceStats | null }) => {
        if (alive) setRefResult({ key: region, stats: json.stats ?? null })
      })
      .catch(() => {
        if (alive) setRefResult({ key: region, stats: null })
      })
    return () => {
      alive = false
    }
  }, [region])

  const comparison: ScoreComparison = buildComparison(
    { homelessYears: homeless, dependents, accountYears: account },
    ref,
  )
  const { breakdown } = comparison

  const earned = { homeless: breakdown.homeless, dependents: breakdown.dependents, account: breakdown.account }
  const setters = { homeless: setHomeless, dependents: setDependents, account: setAccount }
  const values = { homeless, dependents, account }

  const sufficient = Boolean(comparison.reference && comparison.dataSufficient)
  const dialRef =
    !refLoading && sufficient && comparison.reference
      ? {
          avg: comparison.reference.avg,
          min: comparison.reference.min,
          max: comparison.reference.max,
          label: comparison.reference.regionName,
        }
      : null

  return (
    <div className="cs-wrap cs-sb cs-sb--score">
      <PageMasthead
        eyebrow="Score Calculator"
        title="청약 가점 계산"
        lead="민영주택 일반공급 기준 84점 만점입니다. 세 항목을 맞춰보면 공개된 당첨가점 통계에서 내 점수가 어디쯤인지 함께 보여드려요."
      >
        <ul className="cs-sb-mfacts" aria-label="항목별 만점">
          {ITEMS.map(it => (
            <li key={it.key}>
              {it.short}
              <b>{it.points}점</b>
            </li>
          ))}
        </ul>
      </PageMasthead>

      <section className="cs-sb-sheet cs-sb-inst" aria-label="가점 계기판">
        {/* 왼쪽 — 원판 */}
        <div className="cs-sb-inst__bay">
          <p className="cs-sb-inst__tag">
            <span className="cs-sb-inst__lamp" aria-hidden="true" />
            가점 계기판
          </p>
          <ScoreDial total={breakdown.total} reference={dialRef} />
          <p className="cs-sr" aria-live="polite">
            내 가점 {breakdown.total}점, 84점 만점. 무주택 {breakdown.homeless}점, 부양가족 {breakdown.dependents}점, 통장{' '}
            {breakdown.account}점.
          </p>

          {/* 세 항목의 몫 — 만점 폭으로 나눈 한 줄 */}
          <div className="cs-sb-mix" aria-hidden="true">
            {ITEMS.map(it => (
              <div
                key={it.key}
                className="cs-sb-mix__seg"
                style={{ flexGrow: it.points, '--f': earned[it.key] / it.points } as CSSProperties}
              >
                <span className="cs-sb-mix__bar">
                  <i />
                </span>
                <span className="cs-sb-mix__k">
                  {it.short} <b className="cs-num">{earned[it.key]}</b>
                </span>
              </div>
            ))}
          </div>

          <p className="cs-sb-inst__legend">
            {refLoading ? (
              <span>지난 당첨가점 통계를 불러오는 중…</span>
            ) : dialRef ? (
              <>
                <span className="cs-sb-inst__key" data-k="band">
                  {dialRef.label} 당첨가점 범위 <b className="cs-num">{dialRef.min.toFixed(1)}~{dialRef.max.toFixed(1)}</b>
                </span>
                <span className="cs-sb-inst__key" data-k="avg">
                  평균 <b className="cs-num">{dialRef.avg.toFixed(1)}</b>
                </span>
              </>
            ) : (
              <span>비교할 공개 통계가 없어 내 점수만 표시합니다.</span>
            )}
          </p>
        </div>

        {/* 오른쪽 — 입력 */}
        <div className="cs-sb-inst__panel" aria-label="가점 항목" role="group">
          <div className="cs-sb-inst__head">
            <p className="cs-sb-kicker">Inputs</p>
            <h2 className="cs-sb-inst__t">세 항목을 맞춰 보세요</h2>
          </div>
          {ITEMS.map(it => (
            <Knob
              key={it.key}
              label={it.label}
              unit={it.unit}
              max={it.max}
              points={it.points}
              rule={it.rule}
              value={values[it.key]}
              earned={earned[it.key]}
              onChange={setters[it.key]}
            />
          ))}

          <p className="cs-sb-inst__note">
            가점 산식의 공식 정확성은 별도 검증 전까지 확정하지 않습니다. 실제 점수는 청약홈에서 최종
            확인해 주세요.
          </p>
        </div>
      </section>

      {/* 비교 — 어느 지역 통계와 견줄지, 그리고 그 결과 */}
      <section className="cs-sb-sec cs-sb-cmp" aria-labelledby="score-cmp">
        <div className="cs-sb-cmp__pick">
          <div className="cs-sb-head">
            <span className="cs-sb-head__no">01</span>
            <h2 id="score-cmp" className="cs-sb-head__t">
              어느 지역 통계와 견줄까요
            </h2>
            <p className="cs-sb-head__p">공개된 당첨가점 통계에서 내 점수의 자리만 봅니다. 확률이 아니라 위치예요.</p>
          </div>
          {/* 열일곱 개 시·도는 목록보다 지도에 가깝다. 한 화면에 펼쳐
              어디가 비었는지도 함께 보이게 한다 */}
          <GridChoice
            label="비교할 지역"
            value={region}
            onChange={setRegion}
            items={REGIONS.map(r => ({ value: r.code, label: r.name }))}
          />
        </div>

        <div className="cs-sb-verdict" data-band={refLoading ? 'loading' : comparison.band} aria-live="polite">
          {refLoading ? (
            <div className="cs-sb-verdict__wait" aria-label="통계를 불러오는 중">
              <span className="cs-skel" />
              <span className="cs-skel" />
              <span className="cs-skel" />
            </div>
          ) : (
            <div key={`${region}-${comparison.band}`} className="cs-sb-swap">
              <p className="cs-sb-verdict__k">
                <span className="cs-sb-verdict__lamp" aria-hidden="true" />
                {sufficient ? `${comparison.reference!.regionName} · 공개 통계 기준` : '공개 통계 없음'}
              </p>
              <h3 className="cs-sb-verdict__h">{comparison.headline}</h3>
              <p className="cs-sb-verdict__p">{comparison.insight}</p>
              <p className="cs-sb-verdict__d">{comparison.detail}</p>

              {comparison.reference && comparison.dataSufficient && (
                <dl className="cs-sb-verdict__ref">
                  <div>
                    <dt>평균</dt>
                    <dd className="cs-num">{comparison.reference.avg.toFixed(1)}</dd>
                  </div>
                  <div>
                    <dt>최저</dt>
                    <dd className="cs-num">{comparison.reference.min.toFixed(1)}</dd>
                  </div>
                  <div>
                    <dt>최고</dt>
                    <dd className="cs-num">{comparison.reference.max.toFixed(1)}</dd>
                  </div>
                  <div>
                    <dt>기준 기간</dt>
                    <dd className="cs-num">{comparison.reference.statMonth || '—'}</dd>
                  </div>
                </dl>
              )}
            </div>
          )}

          <div className="cs-sb-verdict__next">
            <Link href="/analyze" className="cs-btn cs-btn--primary">
              이 조건으로 공고 찾기
            </Link>
            <Link href="/stats" className="cs-btn cs-btn--ghost">
              경쟁률·당첨통계 보기
            </Link>
          </div>
        </div>
      </section>

      <DrawVsScore
        key={comparison.reference?.regionName ?? 'all'}
        myScore={breakdown.total}
        reference={
          comparison.reference && comparison.dataSufficient
            ? { avg: comparison.reference.avg, min: comparison.reference.min, label: comparison.reference.regionName }
            : null
        }
        defaultZone={guessZone(comparison.reference?.regionName ?? '')}
      />

      <p className="cs-sb-foot">
        당첨 확률은 산출하지 않습니다. 검증되지 않은 계수로 만든 확률은 공식 예측처럼 읽히기 때문입니다.
        공개 통계상의 평균·최저 당첨가점과 내 점수의 차이만 보여드립니다. 출처: 공공데이터포털 청약홈
        당첨자 가점 통계.
      </p>
    </div>
  )
}
