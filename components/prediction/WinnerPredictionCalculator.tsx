'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card } from '@/components/ui'
import { usePredictAutoAdvance } from '@/components/prediction/usePredictAutoAdvance'
import {
  buildComparison,
  calculateSubscriptionScore,
  clampAccountYears,
  clampDependents,
  clampHomelessYears,
  SCORE_LIMITS,
  type ReferenceStats,
  type ScoreInput,
  type ScoreComparison,
} from '@/lib/subscription-score'

const STEPS = [
  { id: 'homeless', title: '무주택 기간', desc: '만 30세 이후 무주택 기간을 선택하세요 (2점/년, 최대 32점)' },
  { id: 'dependents', title: '부양가족', desc: '본인을 제외한 부양가족 수 (5점/인, 최대 35점)' },
  { id: 'account', title: '청약통장', desc: '통장 가입 후 경과 연수 (1점/년, 최대 17점)' },
] as const

const REGIONS = [
  { code: '', name: '전국 평균' },
  { code: '100', name: '서울' },
  { code: '410', name: '경기' },
  { code: '400', name: '인천' },
  { code: '600', name: '부산' },
  { code: '700', name: '대구' },
  { code: '500', name: '광주' },
  { code: '300', name: '대전' },
  { code: '680', name: '울산' },
]

interface Props {
  regionCode?: string
  regionName?: string
  complexName?: string
  compact?: boolean
  onClose?: () => void
}

export default function WinnerPredictionCalculator({
  regionCode = '',
  regionName,
  complexName,
  compact = false,
  onClose,
}: Props) {
  const [step, setStep] = useState(0)
  const [input, setInput] = useState<ScoreInput>({ homelessYears: 5, dependents: 2, accountYears: 7 })
  /**
   * 지역은 prop 이 우선이고, prop 이 없을 때만 사용자가 고른 값을 쓴다.
   * prop 을 state 로 복사해 effect 에서 동기화하지 않는다 (연쇄 렌더 방지).
   */
  const [pickedRegion, setPickedRegion] = useState('')
  const region = regionCode || pickedRegion
  const setRegion = setPickedRegion

  /** 어떤 지역의 통계인지 함께 담아 로딩 여부를 파생값으로 계산한다 */
  const [refState, setRefState] = useState<{ key: string; stats: ReferenceStats | null } | null>(null)
  const refLoading = refState?.key !== region
  const reference = refState?.key === region ? refState.stats : null

  const [result, setResult] = useState<ScoreComparison | null>(null)
  const [calculating, setCalculating] = useState(false)
  const [quickHint, setQuickHint] = useState('')

  useEffect(() => {
    let alive = true
    fetch(`/api/prediction/reference?region=${encodeURIComponent(region)}`)
      .then(res => res.json())
      .then((data: { stats: ReferenceStats | null; regionName?: string }) => {
        if (!alive) return
        // 통계가 없으면 기본값으로 채우지 않고 null 로 둔다.
        setRefState({
          key: region,
          stats: data.stats
            ? { ...data.stats, regionName: regionName || data.stats.regionName || data.regionName || '' }
            : null,
        })
      })
      .catch(() => {
        if (alive) setRefState({ key: region, stats: null })
      })
    return () => {
      alive = false
    }
  }, [region, regionName])

  const breakdown = calculateSubscriptionScore(input)
  const isLastStep = step === STEPS.length - 1
  const showResult = result !== null

  const runAnalysis = useCallback(() => {
    setCalculating(true)
    requestAnimationFrame(() => {
      const pred = buildComparison(input, reference, complexName)
      setResult(pred)
      setCalculating(false)
    })
  }, [complexName, input, reference])

  const advanceFromStep = useCallback(() => {
    setQuickHint('')
    if (step >= STEPS.length - 1) {
      runAnalysis()
    } else {
      setStep(s => s + 1)
    }
  }, [runAnalysis, step])

  const autoAdvance = usePredictAutoAdvance(advanceFromStep)

  const handleNext = useCallback(() => {
    autoAdvance.cancel()
    setQuickHint('')
    if (isLastStep) {
      runAnalysis()
    } else {
      setStep(s => s + 1)
    }
  }, [autoAdvance, isLastStep, runAnalysis])

  const bumpHomeless = useCallback(
    (add: number) => {
      setInput(p => {
        const next = clampHomelessYears(p.homelessYears + add)
        setQuickHint(
          add > 0
            ? `+${add}년 반영 · 총 ${next}년 (연속 탭 시 누적, 잠시 후 다음 단계)`
            : `총 ${next}년`,
        )
        return { ...p, homelessYears: next }
      })
      autoAdvance.schedule()
    },
    [autoAdvance],
  )

  const setHomelessTotalAndNext = useCallback(
    (total: number) => {
      autoAdvance.cancel()
      const next = clampHomelessYears(total)
      setInput(p => ({ ...p, homelessYears: next }))
      setQuickHint(`${next}년으로 설정 · 다음 단계`)
      setStep(1)
    },
    [autoAdvance],
  )

  const bumpDependents = useCallback(
    (add: number) => {
      setInput(p => {
        const next = clampDependents(p.dependents + add)
        setQuickHint(`부양가족 ${next}명 · 잠시 후 다음 단계`)
        return { ...p, dependents: next }
      })
      autoAdvance.schedule()
    },
    [autoAdvance],
  )

  const setDependentsAndNext = useCallback(
    (total: number) => {
      autoAdvance.cancel()
      const next = clampDependents(total)
      setInput(p => ({ ...p, dependents: next }))
      setStep(2)
    },
    [autoAdvance],
  )

  const bumpAccount = useCallback(
    (add: number) => {
      setInput(p => {
        const next = clampAccountYears(p.accountYears + add)
        setQuickHint(`+${add}년 반영 · 총 ${next}년 · 잠시 후 분석`)
        return { ...p, accountYears: next }
      })
      autoAdvance.schedule()
    },
    [autoAdvance],
  )

  const setAccountTotalAndNext = useCallback(
    (total: number) => {
      autoAdvance.cancel()
      const next = clampAccountYears(total)
      setInput(p => {
        const merged = { ...p, accountYears: next }
        requestAnimationFrame(() => {
          setResult(buildComparison(merged, reference, complexName))
        })
        return merged
      })
      setQuickHint(`${next}년으로 설정 · 분석 시작`)
    },
    [autoAdvance, complexName, reference],
  )

  const handleBack = () => {
    autoAdvance.cancel()
    setQuickHint('')
    if (showResult) {
      setResult(null)
      setStep(STEPS.length - 1)
    } else if (step > 0) setStep(s => s - 1)
  }

  const reset = () => {
    autoAdvance.cancel()
    setQuickHint('')
    setResult(null)
    setStep(0)
    setInput({ homelessYears: 5, dependents: 2, accountYears: 7 })
  }

  return (
    <div className={`predict-calc${compact ? ' predict-calc--compact' : ''}`}>
      {!compact && (
        <div className="predict-hero rise">
          <span className="predict-badge">AI Prediction</span>
          <h2 className="predict-title">내 가점 비교</h2>
          <p className="predict-desc">
            청약홈 당첨자 가점 통계를 바탕으로, 입력하신 조건의 예상 당첨 가능성을 분석합니다.
            {complexName && (
              <>
                <br />
                <strong style={{ color: 'var(--ink)', fontWeight: 650 }}>분석 대상: {complexName}</strong>
              </>
            )}
          </p>
        </div>
      )}

      {!showResult ? (
        <>
          <div className="predict-stepper" role="tablist" aria-label="입력 단계">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={i === step}
                className="predict-step-dot"
                data-done={i < step ? 'true' : 'false'}
                data-active={i === step ? 'true' : 'false'}
                onClick={() => i <= step && setStep(i)}
              >
                <span className="predict-step-num">{i + 1}</span>
                <span className="predict-step-label">{s.title}</span>
              </button>
            ))}
          </div>

          <Card className="predict-card rise">
            <h3 className="predict-step-title">{STEPS[step].title}</h3>
            <p className="predict-step-desc">{STEPS[step].desc}</p>

            {step === 0 && (
              <div className="predict-control">
                <div className="predict-value-row">
                  <span className="predict-value tnum" key={input.homelessYears}>
                    {input.homelessYears}
                  </span>
                  <span className="predict-unit">년</span>
                  <span className="predict-points tnum">+{breakdown.homeless}점</span>
                </div>

                <div className="predict-quick-section">
                  <p className="predict-quick-label">빠른 입력 · 탭할 때마다 더해집니다</p>
                  <div className="predict-quick-chips">
                    {[1, 2, 3, 5].map(y => (
                      <button
                        key={`add-${y}`}
                        type="button"
                        className="predict-quick-chip predict-quick-chip--add"
                        onClick={() => bumpHomeless(y)}
                      >
                        +{y}년
                      </button>
                    ))}
                    <button
                      type="button"
                      className="predict-quick-chip predict-quick-chip--ghost"
                      onClick={() => {
                        autoAdvance.cancel()
                        setInput(p => ({ ...p, homelessYears: 0 }))
                        setQuickHint('초기화했습니다')
                      }}
                    >
                      초기화
                    </button>
                  </div>
                  <div className="predict-quick-chips predict-quick-chips--next">
                    {[2, 3, 5, 10].map(y => (
                      <button
                        key={`set-${y}`}
                        type="button"
                        className="predict-quick-chip predict-quick-chip--go"
                        onClick={() => setHomelessTotalAndNext(y)}
                      >
                        {y}년 · 다음
                      </button>
                    ))}
                  </div>
                </div>

                <input
                  type="range"
                  min={0}
                  max={SCORE_LIMITS.homelessYearsMax}
                  step={1}
                  value={input.homelessYears}
                  onChange={e => {
                    autoAdvance.cancel()
                    setInput(p => ({
                      ...p,
                      homelessYears: Number(e.target.value),
                    }))
                  }}
                  className="predict-range"
                />
                <div className="predict-range-labels">
                  <span>0년</span>
                  <span>{SCORE_LIMITS.homelessYearsMax}년+</span>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="predict-control">
                <div className="predict-stepper-btns">
                  <button
                    type="button"
                    className="predict-step-btn"
                    aria-label="감소"
                    disabled={input.dependents <= 0}
                    onClick={() => {
                      autoAdvance.cancel()
                      setInput(p => ({
                        ...p,
                        dependents: clampDependents(p.dependents - 1),
                      }))
                    }}
                  >
                    −
                  </button>
                  <div className="predict-stepper-value">
                    <span className="tnum predict-big-num">{input.dependents}</span>
                    <span style={{ fontSize: 15, color: 'var(--ink-3)', fontWeight: 500 }}>명</span>
                    <span className="predict-points tnum" style={{ marginTop: 8 }}>+{breakdown.dependents}점</span>
                  </div>
                  <button
                    type="button"
                    className="predict-step-btn"
                    aria-label="증가"
                    disabled={input.dependents >= SCORE_LIMITS.dependentsMax}
                    onClick={() => bumpDependents(1)}
                  >
                    +
                  </button>
                </div>
                <div className="predict-quick-section">
                  <p className="predict-quick-label">빠른 입력</p>
                  <div className="predict-quick-chips">
                    {[1, 2, 3].map(n => (
                      <button
                        key={`dep-add-${n}`}
                        type="button"
                        className="predict-quick-chip predict-quick-chip--add"
                        onClick={() => bumpDependents(n)}
                      >
                        +{n}명
                      </button>
                    ))}
                  </div>
                  <div className="predict-quick-chips predict-quick-chips--next">
                    {[0, 1, 2, 3].map(n => (
                      <button
                        key={`dep-set-${n}`}
                        type="button"
                        className="predict-quick-chip predict-quick-chip--go"
                        onClick={() => setDependentsAndNext(n)}
                      >
                        {n}명 · 다음
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="predict-control">
                <div className="predict-value-row">
                  <span className="predict-value tnum" key={input.accountYears}>
                    {input.accountYears}
                  </span>
                  <span className="predict-unit">년</span>
                  <span className="predict-points tnum">+{breakdown.account}점</span>
                </div>
                <div className="predict-quick-section">
                  <p className="predict-quick-label">빠른 입력 · 탭할 때마다 더해집니다</p>
                  <div className="predict-quick-chips">
                    {[1, 2, 3, 5].map(y => (
                      <button
                        key={`acc-add-${y}`}
                        type="button"
                        className="predict-quick-chip predict-quick-chip--add"
                        onClick={() => bumpAccount(y)}
                      >
                        +{y}년
                      </button>
                    ))}
                  </div>
                  <div className="predict-quick-chips predict-quick-chips--next">
                    {[2, 3, 5, 7, 10].map(y => (
                      <button
                        key={`acc-set-${y}`}
                        type="button"
                        className="predict-quick-chip predict-quick-chip--go"
                        onClick={() => setAccountTotalAndNext(y)}
                      >
                        {y}년 · 분석
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={SCORE_LIMITS.accountYearsMax}
                  step={1}
                  value={input.accountYears}
                  onChange={e => {
                    autoAdvance.cancel()
                    setInput(p => ({
                      ...p,
                      accountYears: Number(e.target.value),
                    }))
                  }}
                  className="predict-range"
                />
                <div className="predict-range-labels">
                  <span>0년</span>
                  <span>{SCORE_LIMITS.accountYearsMax}년+</span>
                </div>
              </div>
            )}

            {quickHint && (
              <p className="predict-quick-hint" role="status" aria-live="polite">
                {quickHint}
              </p>
            )}

            <div className="predict-score-preview">
              <span>예상 총 가점</span>
              <strong className="tnum">{breakdown.total}</strong>
              <span>/ 84점</span>
            </div>

            {!regionCode && step === 0 && (
              <div style={{ marginTop: 20 }}>
                <label className="info-cell-label">비교 지역 (당첨 통계)</label>
                <select
                  className="predict-select field-focus"
                  value={region}
                  onChange={e => setRegion(e.target.value)}
                  disabled={refLoading}
                >
                  {REGIONS.map(r => (
                    <option key={r.code} value={r.code}>{r.name}</option>
                  ))}
                </select>
              </div>
            )}
          </Card>

          <div className="predict-actions">
            {(step > 0 || onClose) && (
              <button type="button" className="btn-ghost" onClick={step > 0 ? handleBack : onClose}>
                {step > 0 ? '이전' : '닫기'}
              </button>
            )}
            <button
              type="button"
              className="btn-ink predict-next-btn"
              onClick={handleNext}
              disabled={calculating || refLoading}
            >
              {calculating ? '계산 중…' : isLastStep ? '내 가점 비교하기' : '다음'}
            </button>
          </div>
        </>
      ) : (
        <div className="predict-result rise">
          {/* 당첨 확률은 산출하지 않는다. 내 가점과 공개 통계의 실제 차이만 보여준다. */}
          <div className="predict-big-num tnum">
            {result.breakdown.total}
            <span className="predict-unit">점</span>
          </div>
          <p className="predict-desc">{result.headline}</p>

          <div className="predict-insight">
            <p className="predict-insight-main">{result.insight}</p>
            <p className="predict-insight-sub">{result.detail}</p>
          </div>

          {result.reference && (
            <div className="predict-compare-grid">
              <CompareCell label="내 가점" value={result.breakdown.total} highlight />
              <CompareCell label="평균 당첨" value={result.reference.avg} />
              <CompareCell label="최저 당첨" value={result.reference.min} />
              <CompareCell label="최고 가점" value={result.reference.max} />
            </div>
          )}

          <div className="predict-breakdown">
            <div className="predict-breakdown-row">
              <span>무주택</span>
              <span className="tnum">{result.breakdown.homeless}점</span>
            </div>
            <div className="predict-breakdown-row">
              <span>부양가족</span>
              <span className="tnum">{result.breakdown.dependents}점</span>
            </div>
            <div className="predict-breakdown-row">
              <span>청약통장</span>
              <span className="tnum">{result.breakdown.account}점</span>
            </div>
          </div>

          <p className="predict-disclaimer">
            * 당첨 확률이 아니라 <strong>과거 당첨가점과의 비교</strong>입니다. 공고·면적·순위별로 편차가 크며
            실제 결과와 다를 수 있습니다. 가점 산식의 공식 정확성은 별도 검증 전입니다.
            {result.reference
              ? ` (출처: 청약홈 공개 당첨자 가점 통계 · ${result.reference.regionName}${
                  result.reference.statMonth ? ` · ${result.reference.statMonth}` : ''
                } · 표본 ${result.reference.sampleCount}건)`
              : ' (비교할 공개 통계를 불러오지 못했습니다)'}
          </p>

          <div className="predict-actions">
            <button type="button" className="btn-ghost" onClick={reset}>
              다시 계산
            </button>
            {onClose && (
              <button type="button" className="btn-ink" onClick={onClose}>
                완료
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function CompareCell({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`predict-compare-cell${highlight ? ' predict-compare-cell--hi' : ''}`}>
      <div className="predict-compare-label">{label}</div>
      <div className="predict-compare-value tnum">{typeof value === 'number' ? value.toFixed(1) : value}</div>
    </div>
  )
}
