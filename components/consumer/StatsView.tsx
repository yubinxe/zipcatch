'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { PillChoice } from './Choose'

/**
 * 경쟁률 · 신청자 · 당첨 통계.
 *
 * 청약홈 공개 통계를 그대로 옮긴다. 없는 달은 없다고 적고, 미달(△)은 숫자로
 * 바꾸지 않는다 — "경쟁률 0"과 "미달 121세대"는 다른 말이다.
 * 여기서도 확률은 만들지 않는다. 지난 달에 이랬다는 사실만 보여준다.
 */

interface CompetitionRow {
  SUBSCRPT_AREA_CODE_NM: string
  SUPLY_HSHLDCO: number
  SUPLY_REQ_CNT: number
  SUPLY_CMPET_RATE: string
  SPSPLY_HSHLDCO: number
  SPSPLY_REQ_CNT: number
  SPSPLY_CMPET_RATE: string
}

interface ScoreRow {
  SUBSCRPT_AREA_CODE_NM: string
  RESIDE_SECD_NM: string
  AVRG_SCORE: number
  LWET_SCORE: number
  TOP_SCORE: number
}

interface AgeRow {
  AGE_30: number
  AGE_40: number
  AGE_50: number
  AGE_60: number
}

const AGE_LABEL: { key: keyof AgeRow; label: string }[] = [
  { key: 'AGE_30', label: '30대 이하' },
  { key: 'AGE_40', label: '40대' },
  { key: 'AGE_50', label: '50대' },
  { key: 'AGE_60', label: '60대 이상' },
]

/** 최근 달부터 거슬러 12개월. 통계는 두어 달 늦게 올라오므로 현재 달은 빼둔다 */
function recentMonths(count = 12): string[] {
  const out: string[] = []
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 2)
  for (let i = 0; i < count; i++) {
    out.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`)
    d.setMonth(d.getMonth() - 1)
  }
  return out
}

function monthLabel(m: string) {
  return m.length === 6 ? `${m.slice(0, 4)}년 ${Number(m.slice(4))}월` : m
}

/** "1.78" 은 숫자, "(△121)" 은 미달이다. 섞어 세지 않는다 */
function parseRate(v: string): { kind: 'RATE'; value: number } | { kind: 'UNDER'; text: string } | null {
  const t = (v ?? '').trim()
  if (!t) return null
  if (t.startsWith('(')) return { kind: 'UNDER', text: t.replace(/[()]/g, '') }
  const n = Number(t)
  return Number.isFinite(n) ? { kind: 'RATE', value: n } : null
}

/**
 * 구성비 막대 — 전체 100%를 나눠 갖는 값에만 쓴다.
 *
 * 연령대별 신청·당첨 비중처럼 합이 정해진 값은 길이로 견주는 것이 맞다.
 * 경쟁률은 상한이 없어 72배가 4배를 눌러 버리므로 여기 쓰지 않는다.
 */
function Bar({ ratio, tone }: { ratio: number; tone?: 'accent' }) {
  return (
    <span className="cs-stat__bar" aria-hidden="true" data-tone={tone}>
      <span style={{ width: `${Math.max(2, Math.min(100, ratio * 100))}%` }} />
    </span>
  )
}

/**
 * 경쟁률의 단계.
 *
 * 72.16 과 4.23 을 같은 자로 재면 4.23 은 보이지 않는 토막이 된다.
 * 실무에서도 소수점 둘째 자리를 견주지 않는다 — "미달이냐, 한 자릿수냐,
 * 두 자릿수냐, 그 위냐"로 읽는다. 그 단계를 그대로 표시로 쓴다.
 */
type Heat = 'UNDER' | 'CALM' | 'WARM' | 'HOT' | 'BLAZE'

const HEAT: Record<Heat, { label: string; step: number }> = {
  UNDER: { label: '미달', step: 0 },
  CALM: { label: '여유', step: 1 },
  WARM: { label: '보통', step: 2 },
  HOT: { label: '치열', step: 3 },
  BLAZE: { label: '과열', step: 4 },
}

function heatOf(rate: number): Heat {
  if (rate < 1) return 'UNDER'
  if (rate < 5) return 'CALM'
  if (rate < 20) return 'WARM'
  if (rate < 50) return 'HOT'
  return 'BLAZE'
}

/** 네 칸짜리 단계 표시. 길이를 눈으로 재지 않고 칸 수로 센다 */
function HeatSteps({ heat }: { heat: Heat }) {
  const { step } = HEAT[heat]
  return (
    <span className="cs-heat" aria-hidden="true" data-heat={heat}>
      {[1, 2, 3, 4].map(i => (
        <span key={i} className="cs-heat__seg" data-on={i <= step} />
      ))}
    </span>
  )
}

export default function StatsView() {
  const months = useMemo(() => recentMonths(), [])
  const [month, setMonth] = useState(months[0])

  /** 어떤 달의 결과인지 함께 담아, 로딩 여부를 파생값으로 계산한다 */
  const [result, setResult] = useState<{
    key: string
    comp: CompetitionRow[]
    scores: ScoreRow[]
    ages: { applicants: AgeRow[]; winners: AgeRow[] }
    error: string | null
  } | null>(null)

  const loading = result?.key !== month
  const comp = result?.key === month ? result.comp : null
  const scores = result?.key === month ? result.scores : null
  const ages = result?.key === month ? result.ages : null
  const error = result?.key === month ? result.error : null

  useEffect(() => {
    let alive = true
    const j = (r: Response) => (r.ok ? r.json() : Promise.reject(new Error('통계를 불러오지 못했어요.')))
    const empty = { applicants: [], winners: [] }

    Promise.all([
      fetch(`/api/competition/stats?month=${month}`, { cache: 'no-store' }).then(j),
      fetch(`/api/winners/score?month=${month}`, { cache: 'no-store' }).then(j),
      fetch(`/api/winners/age?monthFrom=${month}&monthTo=${month}`, { cache: 'no-store' }).then(j),
    ])
      .then(([c, s, a]) => {
        if (!alive) return
        setResult({
          key: month,
          comp: Array.isArray(c?.data) ? c.data : [],
          scores: Array.isArray(s?.data) ? s.data : [],
          ages: { applicants: a?.applicants ?? [], winners: a?.winners ?? [] },
          error: null,
        })
      })
      .catch((err: unknown) => {
        if (!alive) return
        setResult({
          key: month,
          comp: [],
          scores: [],
          ages: empty,
          error: err instanceof Error ? err.message : '통계를 불러오지 못했어요.',
        })
      })

    return () => {
      alive = false
    }
  }, [month])

  const ageTotals = useMemo(() => {
    if (!ages) return null
    const sum = (rows: AgeRow[], k: keyof AgeRow) => rows.reduce((t, r) => t + (Number(r[k]) || 0), 0)
    const applicants = AGE_LABEL.map(a => ({ ...a, n: sum(ages.applicants, a.key) }))
    const winners = AGE_LABEL.map(a => ({ ...a, n: sum(ages.winners, a.key) }))
    const aTotal = applicants.reduce((t, x) => t + x.n, 0)
    const wTotal = winners.reduce((t, x) => t + x.n, 0)
    return { applicants, winners, aTotal, wTotal }
  }, [ages])

  return (
    <div className="cs-wrap" style={{ paddingTop: 44 }}>
      <header>
        <h1 className="cs-page-title">경쟁률 · 당첨 통계</h1>
        <p className="cs-sub" style={{ marginTop: 12 }}>
          청약홈에 공개된 지난 달 집계입니다. 지역마다 경쟁이 얼마나 달랐는지, 어느 가점에서 당첨이
          갈렸는지 그대로 옮겨 드려요.
        </p>

        {/* 열두 달을 접어두면 고르는 데 두 번 누른다. 펼쳐 두고 가로로 민다 */}
        <div style={{ marginTop: 26 }}>
          <PillChoice
            label="기준 월"
            scroll
            value={month}
            onChange={setMonth}
            items={months.map(m => ({ value: m, label: monthLabel(m) }))}
          />
        </div>
      </header>

      {error ? (
        <div className="cs-error" style={{ marginTop: 32 }}>
          <span>{error}</span>
        </div>
      ) : loading ? (
        <div style={{ marginTop: 32, display: 'grid', gap: 18 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="cs-skel" style={{ height: 220 }} />
          ))}
        </div>
      ) : (
        <>
          {/* ── 지역별 경쟁률 ───────────────────────────── */}
          <section style={{ marginTop: 40 }}>
            <h2 className="cs-section-title" style={{ fontSize: 24 }}>
              지역별 청약 경쟁률
            </h2>
            <p className="cs-sub" style={{ marginTop: 10, marginBottom: 20 }}>
              일반공급 기준입니다. 공급세대보다 신청이 적으면 경쟁률 대신 미달 세대수를 적습니다.
            </p>

            {comp && comp.length > 0 ? (
              <div className="cs-heatgrid">
                {comp
                  .slice()
                  .sort((a, b) => {
                    const pa = parseRate(a.SUPLY_CMPET_RATE)
                    const pb = parseRate(b.SUPLY_CMPET_RATE)
                    return (pb?.kind === 'RATE' ? pb.value : -1) - (pa?.kind === 'RATE' ? pa.value : -1)
                  })
                  .map((r, i) => {
                    const p = parseRate(r.SUPLY_CMPET_RATE)
                    const heat: Heat = p?.kind === 'RATE' ? heatOf(p.value) : 'UNDER'
                    return (
                      <article
                        key={r.SUBSCRPT_AREA_CODE_NM}
                        className="cs-heatcard"
                        data-heat={p ? heat : 'NONE'}
                      >
                        {/* 순위와 지역을 한 덩어리로. 눈이 옮겨다닐 거리를 없앤다 */}
                        <div className="cs-heatcard__top">
                          <span className="cs-heatcard__rank">{String(i + 1).padStart(2, '0')}</span>
                          <span className="cs-heatcard__region">{r.SUBSCRPT_AREA_CODE_NM}</span>
                        </div>

                        <div className="cs-heatcard__figure">
                          {p?.kind === 'RATE' ? (
                            <>
                              <b className="cs-heatcard__rate">{p.value.toFixed(1)}</b>
                              <span className="cs-heatcard__unit">: 1</span>
                            </>
                          ) : p?.kind === 'UNDER' ? (
                            <b className="cs-heatcard__under">미달 {p.text}</b>
                          ) : (
                            <b className="cs-heatcard__none">집계 없음</b>
                          )}
                        </div>

                        <div className="cs-heatcard__heat">
                          <HeatSteps heat={heat} />
                          <span className="cs-heatcard__label">
                            {p?.kind === 'RATE' ? HEAT[heat].label : '—'}
                          </span>
                        </div>

                        <p className="cs-heatcard__meta cs-num">
                          공급 {r.SUPLY_HSHLDCO?.toLocaleString() ?? '—'} · 신청{' '}
                          {r.SUPLY_REQ_CNT?.toLocaleString() ?? '—'}
                        </p>
                      </article>
                    )
                  })}
              </div>
            ) : (
              <div className="cs-vacancy">
                <span className="cs-vacancy__eyebrow">집계 0건</span>
                <p className="cs-vacancy__title">이 달의 경쟁률 집계가 없습니다</p>
                <p className="cs-vacancy__desc">
                  통계는 보통 두어 달 늦게 올라옵니다. 기준 월을 앞으로 옮겨 보세요.
                </p>
              </div>
            )}
          </section>

          {/* ── 당첨 가점 ───────────────────────────────── */}
          <section style={{ marginTop: 52 }}>
            <h2 className="cs-section-title" style={{ fontSize: 24 }}>
              지역별 당첨 가점
            </h2>
            <p className="cs-sub" style={{ marginTop: 10, marginBottom: 20 }}>
              평균과 최저를 함께 봅니다. 최저 당첨가점이 실제로 넘어야 했던 선입니다.
            </p>

            {scores && scores.length > 0 ? (
              <div className="cs-stat__grid">
                {scores.slice(0, 18).map((r, i) => (
                  <div key={`${r.SUBSCRPT_AREA_CODE_NM}-${r.RESIDE_SECD_NM}-${i}`} className="cs-card">
                    <div className="cs-stat__card-head">
                      <span className="cs-stat__name">{r.SUBSCRPT_AREA_CODE_NM}</span>
                      <span className="cs-badge">{r.RESIDE_SECD_NM}</span>
                    </div>
                    <div className="cs-stat__score cs-num">
                      {Number(r.AVRG_SCORE).toFixed(1)}
                      <span className="cs-stat__unit">점 평균</span>
                    </div>
                    <p className="cs-stat__meta cs-num">
                      최저 {Number(r.LWET_SCORE).toFixed(1)} · 최고 {Number(r.TOP_SCORE).toFixed(1)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="cs-vacancy">
                <span className="cs-vacancy__eyebrow">집계 0건</span>
                <p className="cs-vacancy__title">이 달의 당첨가점 집계가 없습니다</p>
                <p className="cs-vacancy__desc">기준 월을 앞으로 옮겨 보세요.</p>
              </div>
            )}
          </section>

          {/* ── 연령대 ──────────────────────────────────── */}
          {ageTotals && ageTotals.aTotal > 0 && (
            <section style={{ marginTop: 52 }}>
              <h2 className="cs-section-title" style={{ fontSize: 24 }}>
                연령대별 신청자와 당첨자
              </h2>
              <p className="cs-sub" style={{ marginTop: 10, marginBottom: 20 }}>
                신청은 30대가 가장 많지만, 당첨 비중은 다르게 나타납니다. 두 줄을 나란히 둡니다.
              </p>

              <div className="cs-stat__list">
                {AGE_LABEL.map((a, i) => {
                  const ap = ageTotals.applicants[i].n
                  const wn = ageTotals.winners[i].n
                  return (
                    <div key={a.key} className="cs-stat__row cs-stat__row--pair">
                      <span className="cs-stat__name">{a.label}</span>
                      <div className="cs-stat__pair">
                        <div>
                          <Bar ratio={ageTotals.aTotal ? ap / ageTotals.aTotal : 0} />
                          <span className="cs-stat__meta cs-num">
                            신청 {ap.toLocaleString()}명 (
                            {ageTotals.aTotal ? Math.round((ap / ageTotals.aTotal) * 100) : 0}%)
                          </span>
                        </div>
                        <div>
                          <Bar ratio={ageTotals.wTotal ? wn / ageTotals.wTotal : 0} tone="accent" />
                          <span className="cs-stat__meta cs-num">
                            당첨 {wn.toLocaleString()}명 (
                            {ageTotals.wTotal ? Math.round((wn / ageTotals.wTotal) * 100) : 0}%)
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          <section style={{ marginTop: 52 }}>
            <div className="cs-cta-band">
              <h2 className="cs-section-title">
                내 가점은
                <br />
                어디쯤일까요?
              </h2>
              <p className="cs-sub" style={{ marginTop: 12 }}>
                세 항목만 맞추면 이 통계와 바로 견줘 볼 수 있어요.
              </p>
              <Link href="/score" className="cs-btn cs-btn--primary" style={{ marginTop: 26 }}>
                가점 계산하기
              </Link>
            </div>
          </section>
        </>
      )}

      <p className="cs-note" style={{ marginTop: 32 }}>
        출처: 공공데이터포털 청약홈 «청약접수 경쟁률 및 특별공급 신청현황», «당첨자 정보» 통계.
        집계 시점에 따라 값이 갱신될 수 있으며, 당첨 확률을 산출하지는 않습니다.
      </p>
    </div>
  )
}
