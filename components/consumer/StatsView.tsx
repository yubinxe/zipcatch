'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { PillChoice } from './Choose'
import PageMasthead from './PageMasthead'

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
 * 길이는 transform 으로 — 달을 바꿀 때 막대가 왼쪽에서 자란다.
 */
function Bar({ ratio, tone }: { ratio: number; tone?: 'accent' }) {
  return (
    <span className="cs-sb-pbar" aria-hidden="true" data-tone={tone}>
      <i style={{ '--r': Math.max(0.02, Math.min(1, ratio)) } as CSSProperties} />
    </span>
  )
}

/** 0~84점 자 위에 최저~최고 띠와 평균 눈금. 값은 공개 통계 그대로다 */
function ScoreRuler({ min, avg, max }: { min: number; avg: number; max: number }) {
  const at = (n: number) => `${(Math.min(84, Math.max(0, n)) / 84) * 100}%`
  return (
    <span className="cs-sb-ruler" aria-hidden="true">
      <span className="cs-sb-ruler__band" style={{ left: at(min), right: `calc(100% - ${at(max)})` }} />
      <span className="cs-sb-ruler__avg" style={{ left: at(avg) }} />
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
  /** 불러오지 못했을 때 다시 누르는 횟수 — 같은 달을 한 번 더 받는다 */
  const [attempt, setAttempt] = useState(0)
  const want = `${month}:${attempt}`

  /** 어떤 달의 결과인지 함께 담아, 로딩 여부를 파생값으로 계산한다 */
  const [result, setResult] = useState<{
    key: string
    comp: CompetitionRow[]
    scores: ScoreRow[]
    ages: { applicants: AgeRow[]; winners: AgeRow[] }
    error: string | null
  } | null>(null)

  const loading = result?.key !== want
  const comp = result?.key === want ? result.comp : null
  const scores = result?.key === want ? result.scores : null
  const ages = result?.key === want ? result.ages : null
  const error = result?.key === want ? result.error : null

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
          key: want,
          comp: Array.isArray(c?.data) ? c.data : [],
          scores: Array.isArray(s?.data) ? s.data : [],
          ages: { applicants: a?.applicants ?? [], winners: a?.winners ?? [] },
          error: null,
        })
      })
      .catch((err: unknown) => {
        if (!alive) return
        setResult({
          key: want,
          comp: [],
          scores: [],
          ages: empty,
          error: err instanceof Error ? err.message : '통계를 불러오지 못했어요.',
        })
      })

    return () => {
      alive = false
    }
  }, [month, want])

  const ageTotals = useMemo(() => {
    if (!ages) return null
    const sum = (rows: AgeRow[], k: keyof AgeRow) => rows.reduce((t, r) => t + (Number(r[k]) || 0), 0)
    const applicants = AGE_LABEL.map(a => ({ ...a, n: sum(ages.applicants, a.key) }))
    const winners = AGE_LABEL.map(a => ({ ...a, n: sum(ages.winners, a.key) }))
    const aTotal = applicants.reduce((t, x) => t + x.n, 0)
    const wTotal = winners.reduce((t, x) => t + x.n, 0)
    return { applicants, winners, aTotal, wTotal }
  }, [ages])

  /** 단말기 머리의 읽음값 — 받은 표에서 그대로 센다. 없는 값을 만들지 않는다 */
  const readout = useMemo(() => {
    if (!comp || comp.length === 0) return null
    let top: { name: string; rate: number } | null = null
    let under = 0
    for (const r of comp) {
      const p = parseRate(r.SUPLY_CMPET_RATE)
      if (p?.kind === 'UNDER') under += 1
      if (p?.kind === 'RATE') {
        // 카드가 1 미만을 '미달'로 적으므로 여기서도 같이 센다
        if (p.value < 1) under += 1
        if (!top || p.value > top.rate) top = { name: r.SUBSCRPT_AREA_CODE_NM, rate: p.value }
      }
    }
    return { regions: comp.length, top, under }
  }, [comp])

  const status: 'busy' | 'err' | 'ok' | 'idle' = loading
    ? 'busy'
    : error
      ? 'err'
      : (comp?.length ?? 0) + (scores?.length ?? 0) > 0
        ? 'ok'
        : 'idle'

  return (
    <div className="cs-wrap cs-sb cs-sb--stats">
      <PageMasthead
        eyebrow="Competition Stats"
        title="경쟁률 · 당첨 통계"
        lead="청약홈에 공개된 지난 달 집계입니다. 지역마다 경쟁이 얼마나 달랐는지, 어느 가점에서 당첨이 갈렸는지 그대로 옮겨 드려요."
      >
        <ul className="cs-sb-mfacts">
          <li>
            출처 <b>청약홈 공개 통계</b>
          </li>
          <li>
            당첨 확률 <b>산출하지 않음</b>
          </li>
        </ul>
      </PageMasthead>

      {/* 단말기 머리 — 기준 월과 지금 상태, 받은 표에서 센 읽음값 */}
      <section className="cs-sb-sheet cs-sb-term" aria-label="기준 월과 요약">
        <div className="cs-sb-term__bar">
          <span className="cs-sb-term__lamp" data-state={status} aria-hidden="true" />
          <span className="cs-sb-term__status" aria-live="polite">
            {status === 'busy'
              ? `${monthLabel(month)} 집계를 불러오는 중`
              : status === 'err'
                ? '불러오지 못했습니다'
                : status === 'idle'
                  ? `${monthLabel(month)} — 집계 0건`
                  : `${monthLabel(month)} 집계`}
          </span>
          <span className="cs-sb-term__src">청약홈 · 공공데이터포털</span>
        </div>

        {/* 열두 달을 접어두면 고르는 데 두 번 누른다. 펼쳐 두고 가로로 민다 */}
        <div className="cs-sb-term__pick">
          <PillChoice
            label="기준 월"
            scroll
            value={month}
            onChange={setMonth}
            items={months.map(m => ({ value: m, label: monthLabel(m) }))}
          />
        </div>

        <dl className="cs-sb-kpis" data-state={status}>
          <div>
            <dt>집계 지역</dt>
            <dd className="cs-num">
              {readout ? readout.regions : '—'}
              {readout && <small>곳</small>}
            </dd>
          </div>
          <div>
            <dt>가장 붐빈 곳</dt>
            <dd className="cs-num">
              {readout?.top ? (
                <>
                  {readout.top.rate.toFixed(1)}
                  <small>: 1 · {readout.top.name}</small>
                </>
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt>미달 지역</dt>
            <dd className="cs-num">
              {readout ? readout.under : '—'}
              {readout && <small>곳</small>}
            </dd>
          </div>
          <div>
            <dt>당첨가점 집계</dt>
            <dd className="cs-num">
              {scores && scores.length > 0 ? scores.length : '—'}
              {scores && scores.length > 0 && <small>줄</small>}
            </dd>
          </div>
        </dl>
      </section>

      {error ? (
        <div className="cs-sb-sec">
          <div className="cs-sb-fail" role="alert">
            <span>{error} 잠시 뒤 다시 불러오거나, 기준 월을 옮겨 보세요.</span>
            <button type="button" className="cs-btn cs-btn--ghost" onClick={() => setAttempt(a => a + 1)}>
              다시 불러오기
            </button>
          </div>
        </div>
      ) : loading ? (
        <div className="cs-sb-sec cs-sb-wait" aria-hidden="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="cs-skel" />
          ))}
        </div>
      ) : (
        <div key={want} className="cs-sb-swap">
          {/* ── 지역별 경쟁률 ───────────────────────────── */}
          <section className="cs-sb-sec" aria-labelledby="st-comp">
            <div className="cs-sb-head">
              <span className="cs-sb-head__no">01</span>
              <h2 id="st-comp" className="cs-sb-head__t">
                지역별 청약 경쟁률
              </h2>
              <p className="cs-sb-head__p">
                일반공급 기준입니다. 공급세대보다 신청이 적으면 경쟁률 대신 미달 세대수를 적습니다.
              </p>
            </div>

            {comp && comp.length > 0 ? (
              <>
                <ul className="cs-sb-heatkey" aria-label="단계 읽는 법">
                  <li data-heat="UNDER">미달</li>
                  <li data-heat="CALM">여유 · 5 미만</li>
                  <li data-heat="WARM">보통 · 20 미만</li>
                  <li data-heat="HOT">치열 · 50 미만</li>
                  <li data-heat="BLAZE">과열 · 50 이상</li>
                </ul>
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
                          style={{ '--i': i } as CSSProperties}
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
              </>
            ) : (
              <div className="cs-sb-void">
                <span className="cs-sb-void__mark" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="cs-sb-void__k">집계 0건</span>
                <p className="cs-sb-void__t">이 달의 경쟁률 집계가 없습니다</p>
                <p className="cs-sb-void__d">통계는 보통 두어 달 늦게 올라옵니다. 기준 월을 앞으로 옮겨 보세요.</p>
              </div>
            )}
          </section>

          {/* ── 당첨 가점 ───────────────────────────────── */}
          <section className="cs-sb-sec" aria-labelledby="st-score">
            <div className="cs-sb-head">
              <span className="cs-sb-head__no">02</span>
              <h2 id="st-score" className="cs-sb-head__t">
                지역별 당첨 가점
              </h2>
              <p className="cs-sb-head__p">
                평균과 최저를 함께 봅니다. 최저 당첨가점이 실제로 넘어야 했던 선입니다. 막대는 0~84점 자 위의
                최저~최고 폭, 눈금은 평균입니다.
              </p>
            </div>

            {scores && scores.length > 0 ? (
              <div className="cs-sb-scores">
                {scores.slice(0, 18).map((r, i) => (
                  <div
                    key={`${r.SUBSCRPT_AREA_CODE_NM}-${r.RESIDE_SECD_NM}-${i}`}
                    className="cs-sb-scorecard"
                    style={{ '--i': i } as CSSProperties}
                  >
                    <div className="cs-sb-scorecard__head">
                      <span className="cs-sb-scorecard__name">{r.SUBSCRPT_AREA_CODE_NM}</span>
                      <span className="cs-sb-scorecard__tag">{r.RESIDE_SECD_NM}</span>
                    </div>
                    <div className="cs-sb-scorecard__avg cs-num">
                      {Number(r.AVRG_SCORE).toFixed(1)}
                      <span>점 평균</span>
                    </div>
                    <ScoreRuler min={Number(r.LWET_SCORE)} avg={Number(r.AVRG_SCORE)} max={Number(r.TOP_SCORE)} />
                    <p className="cs-sb-scorecard__meta cs-num">
                      최저 <b>{Number(r.LWET_SCORE).toFixed(1)}</b> · 최고 <b>{Number(r.TOP_SCORE).toFixed(1)}</b>
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="cs-sb-void">
                <span className="cs-sb-void__mark" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="cs-sb-void__k">집계 0건</span>
                <p className="cs-sb-void__t">이 달의 당첨가점 집계가 없습니다</p>
                <p className="cs-sb-void__d">기준 월을 앞으로 옮겨 보세요.</p>
              </div>
            )}
          </section>

          {/* ── 연령대 ──────────────────────────────────── */}
          {ageTotals && ageTotals.aTotal > 0 && (
            <section className="cs-sb-sec" aria-labelledby="st-age">
              <div className="cs-sb-head">
                <span className="cs-sb-head__no">03</span>
                <h2 id="st-age" className="cs-sb-head__t">
                  연령대별 신청자와 당첨자
                </h2>
                <p className="cs-sb-head__p">
                  신청은 30대가 가장 많지만, 당첨 비중은 다르게 나타납니다. 두 줄을 나란히 둡니다.
                </p>
              </div>

              <div className="cs-sb-ages">
                <p className="cs-sb-ages__key" aria-hidden="true">
                  <span data-k="a">신청 비중</span>
                  <span data-k="w">당첨 비중</span>
                </p>
                {AGE_LABEL.map((a, i) => {
                  const ap = ageTotals.applicants[i].n
                  const wn = ageTotals.winners[i].n
                  return (
                    <div key={a.key} className="cs-sb-ages__row">
                      <span className="cs-sb-ages__name">{a.label}</span>
                      <div className="cs-sb-ages__pair">
                        <div>
                          <Bar ratio={ageTotals.aTotal ? ap / ageTotals.aTotal : 0} />
                          <span className="cs-sb-ages__meta cs-num">
                            신청 {ap.toLocaleString()}명 (
                            {ageTotals.aTotal ? Math.round((ap / ageTotals.aTotal) * 100) : 0}%)
                          </span>
                        </div>
                        <div>
                          <Bar ratio={ageTotals.wTotal ? wn / ageTotals.wTotal : 0} tone="accent" />
                          <span className="cs-sb-ages__meta cs-num">
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
        </div>
      )}

      <section className="cs-sb-close" aria-labelledby="st-close">
        <p className="cs-sb-close__k">Next</p>
        <h2 id="st-close" className="cs-sb-close__t">
          내 가점은 어디쯤일까요?
        </h2>
        <p className="cs-sb-close__p">세 항목만 맞추면 이 통계와 바로 견줘 볼 수 있어요.</p>
        <div className="cs-sb-close__acts">
          <Link href="/score" className="cs-btn cs-btn--primary">
            가점 계산하기
          </Link>
        </div>
      </section>

      <p className="cs-sb-foot">
        출처: 공공데이터포털 청약홈 «청약접수 경쟁률 및 특별공급 신청현황», «당첨자 정보» 통계.
        집계 시점에 따라 값이 갱신될 수 있으며, 당첨 확률을 산출하지는 않습니다.
      </p>
    </div>
  )
}
