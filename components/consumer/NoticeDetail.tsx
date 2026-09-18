'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { Candidate, UrgencyInfo } from '@/lib/crm/services/scoring'
import { formatMan } from '@/lib/crm/services/scoring'
import type { Property, Task } from '@/lib/crm/types'
import { statusBadge } from './NoticeCard'
import SaveButton from './SaveButton'
import NoticeCalendar, { marksFrom } from './NoticeCalendar'
import { useConsumer } from './ConsumerProvider'
import { useSignupGate } from './SignupGate'

interface SupplyModel {
  name: string
  supplyArea: number | null
  exclusiveArea: number | null
  households: number | null
  topAmount: number | null
  perPyeong: number | null
}

interface TradeStat {
  sameDong: { count: number; medianPerPyeong: number | null }
  sameSigungu: { count: number; medianPerPyeong: number | null }
  monthly: { month: string; medianPerPyeong: number; count: number }[]
  months: number
  ok: boolean
  reason: string | null
  dong: string | null
  sigungu: string | null
  presale: { count: number; medianPerPyeong: number | null; months: number } | null
}

interface RegionStat {
  province: string
  months: number
  competition: { rate: number; supply: number; applied: number; monthly: { month: string; rate: number; supply: number }[] } | null
  scores: { kind: string; lowest: number | null; average: number | null; highest: number | null; months: number }[]
}

interface NearbyItem {
  name: string
  kind: string
  area: string
  resultDate: string | null
  scope: 'REGION' | 'PROVINCE'
  supply: number
  applied: number
  rate: number
  under: boolean
}

interface RentBand {
  key: string
  jeonse: { count: number; deposit: number | null }
  wolse: { count: number; deposit: number | null; rent: number | null }
}

interface RentStat {
  scope: string
  months: number
  total: number
  bands: RentBand[]
}

interface DetailResponse {
  property: Property
  urgency: UrgencyInfo
  candidate: Candidate | null
  schedule: Task[]
  supplyModels?: SupplyModel[]
  rent?: RentStat | null
  trade?: TradeStat | null
}

export default function NoticeDetail({ id }: { id: string }) {
  const { alerts } = useConsumer()
  const gate = useSignupGate()
  const [data, setData] = useState<DetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** 이 지역이 요즘 어느 정도로 붐비는지. 공고 본문과 별개로 늦게 와도 된다 */
  const [region, setRegion] = useState<RegionStat | null>(null)
  /** 근처에서 최근에 끝난 청약 — 지역 평균보다 가까운 참고다 */
  const [nearby, setNearby] = useState<NearbyItem[]>([])

  useEffect(() => {
    let alive = true
    fetch(`/api/notices/${id}`, { cache: 'no-store' })
      .then(async r => {
        if (r.status === 404) throw new Error('공고를 찾을 수 없어요.')
        if (!r.ok) throw new Error('공고를 불러오지 못했어요.')
        return r.json()
      })
      .then((json: DetailResponse) => {
        if (alive) setData(json)
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : '공고를 불러오지 못했어요.')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [id])

  const province = data?.property.district?.trim() || data?.property.region?.trim() || ''
  useEffect(() => {
    if (!province) return
    let alive = true
    fetch(`/api/competition/region?province=${encodeURIComponent(province)}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((json: RegionStat | null) => {
        if (alive && json && !('error' in json)) setRegion(json)
      })
      .catch(() => {
        /* 곁들이는 통계다. 없다고 본문을 막지 않는다 */
      })
    return () => {
      alive = false
    }
  }, [province])

  const sigungu = data?.property.region?.trim() ?? ''
  const pblancNo = (data?.property.announcementId ?? '').split('-').pop() ?? ''
  useEffect(() => {
    if (!province && !sigungu) return
    let alive = true
    const q = new URLSearchParams()
    if (sigungu) q.set('region', sigungu)
    if (province) q.set('province', province)
    if (pblancNo) q.set('exclude', pblancNo)
    fetch(`/api/competition/nearby?${q}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((json: { items?: NearbyItem[] } | null) => {
        if (alive && json?.items) setNearby(json.items)
      })
      .catch(() => {
        /* 곁들이는 참고다 */
      })
    return () => {
      alive = false
    }
  }, [province, sigungu, pblancNo])

  if (loading) {
    return (
      <div className="cs-wrap" style={{ paddingTop: 44, maxWidth: 860 }}>
        <div className="cs-skel" style={{ height: 40, width: '60%', marginBottom: 20 }} />
        <div className="cs-skel" style={{ height: 260 }} />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="cs-wrap" style={{ paddingTop: 64, maxWidth: 620 }}>
        <div className="cs-empty">
          <div className="cs-empty__title">{error ?? '공고를 불러오지 못했어요'}</div>
          <Link href="/notices" className="cs-btn cs-btn--primary" style={{ marginTop: 24 }}>
            공고 목록으로
          </Link>
        </div>
      </div>
    )
  }

  const { property, urgency, candidate, schedule } = data
  const supplyModels = data.supplyModels ?? []
  const trade = data.trade ?? null
  const rent = data.rent ?? null

  /**
   * 견줌자 — 주변 전용 평당가 중앙값.
   *
   * 같은 동에 표본이 얇으면 시군구로 물러선다. 표본이 몇 건인지 함께 적어야
   * 읽는 사람이 이 숫자를 얼마나 믿을지 스스로 정할 수 있다.
   */
  const bench = (() => {
    if (!trade) return null
    if (trade.sameDong.medianPerPyeong !== null && trade.sameDong.count >= 3) {
      return { per: trade.sameDong.medianPerPyeong, count: trade.sameDong.count, scope: trade.dong ?? '같은 동' }
    }
    if (trade.sameSigungu.medianPerPyeong !== null && trade.sameSigungu.count >= 3) {
      return { per: trade.sameSigungu.medianPerPyeong, count: trade.sameSigungu.count, scope: trade.sigungu ?? '같은 시군구' }
    }
    return null
  })()

  /**
   * 주택형 표에서 뽑은 요약.
   *
   * 표에 분양가와 면적이 다 있는데 바로 위 카드가 '공고문 확인'이라고 말하고
   * 있었다. 같은 화면에서 한쪽은 모른다 하고 다른 쪽은 답을 적고 있으면,
   * 읽는 사람은 어느 쪽을 믿어야 할지 모른다.
   */
  const span = (() => {
    const amounts = supplyModels.map(m => m.topAmount).filter((n): n is number => n !== null)
    const areas = supplyModels.map(m => m.exclusiveArea).filter((n): n is number => n !== null)
    const range = (ns: number[], fmt: (n: number) => string) => {
      if (ns.length === 0) return null
      const lo = Math.min(...ns)
      const hi = Math.max(...ns)
      return lo === hi ? fmt(lo) : `${fmt(lo)} ~ ${fmt(hi)}`
    }
    return {
      price: range(amounts, formatMan),
      area: range(areas, n => `${n}㎡`),
    }
  })()
  /**
   * 예시 공고인가.
   *
   * 화면이 이 값을 읽지 않고 늘 '예시 데이터' 를 찍고 있었다. 청약홈에서
   * 받아온 진짜 공고에도 붙어, 가장 믿어야 할 자리에서 서비스가 스스로를
   * 의심하게 만들었다.
   */
  const isSample = property.dataOrigin !== 'OFFICIAL'
  const badge = statusBadge(urgency)
  const closed = urgency.level === 'CLOSED'
  const hasDeadlineAlert = alerts.some(a => a.scope === 'DEADLINE' && a.propertyId === property.id)

  const official = schedule.filter(t => t.source === 'OFFICIAL')
  const recommended = schedule.filter(t => t.source === 'RECOMMENDED')

  return (
    <div className="cs-wrap" style={{ paddingTop: 32, maxWidth: 860 }}>
      <Link href="/results" className="cs-btn cs-btn--text" style={{ paddingLeft: 0, marginBottom: 12 }}>
        ← 후보 목록으로
      </Link>

      <div className="cs-badge-row" style={{ marginBottom: 14 }}>
        <span className="cs-badge cs-badge--brand">{property.housingType}</span>
        <span className={`cs-badge ${badge.cls}`}>{badge.text}</span>
        {/* 예시일 때만 예시라고 적는다. 예전에는 조건 없이 늘 찍혀서, 청약홈에서
            받아온 진짜 공고에도 '예시 데이터' 가 붙어 있었다. 데이터를 의심하게
            만드는 표시는 틀렸을 때 가장 비싸다. */}
        {isSample ? (
          <span className="cs-sample">예시 데이터</span>
        ) : (
          <span className="cs-badge">{property.source}</span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="cs-page-title">{property.name}</h1>
          <p className="cs-sub" style={{ marginTop: 10 }}>
            {property.address}
          </p>
        </div>
        <SaveButton propertyId={property.id} />
      </div>

      {/* 비용 */}
      <div className="cs-card" style={{ marginTop: 28 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 24 }}>
          <div>
            {/* 분양 공고에 '보증금' 을 묻는 것부터 어긋난다. 분양가가 있으면
                그것을 적고, 이름도 분양가로 바꾼다 */}
            <div className="cs-note">
              {property.deposit === null && span.price ? '분양가' : '보증금'}
            </div>
            <div className="cs-num" style={{ fontSize: 26, fontWeight: 700, color: 'var(--title)', marginTop: 6 }}>
              {property.deposit !== null ? (
                formatMan(property.deposit)
              ) : span.price ? (
                <span style={{ fontSize: 22 }}>{span.price}</span>
              ) : (
                <span style={{ fontSize: 17, fontWeight: 600, color: 'var(--muted)' }}>공고문 확인</span>
              )}
            </div>
          </div>
          {/* 분양가가 잡힌 공고에 '월 임대료 공고문 확인' 은 답이 없는 칸이
              아니라 물음 자체가 틀린 칸이다. 접는다. */}
          {!(property.monthlyRent === null && span.price) && (
            <div>
              <div className="cs-note">월 임대료</div>
              <div className="cs-num" style={{ fontSize: 26, fontWeight: 700, color: 'var(--title)', marginTop: 6 }}>
                {property.monthlyRent === null ? (
                  <span style={{ fontSize: 17, fontWeight: 600, color: 'var(--muted)' }}>공고문 확인</span>
                ) : (
                  `${property.monthlyRent.toLocaleString()}만원`
                )}
              </div>
            </div>
          )}
          <div>
            <div className="cs-note">전용면적</div>
            <div className="cs-num" style={{ fontSize: 26, fontWeight: 700, color: 'var(--title)', marginTop: 6 }}>
              {property.area !== null ? (
                `${property.area}㎡`
              ) : span.area ? (
                span.area
              ) : (
                <span style={{ fontSize: 17, fontWeight: 600, color: 'var(--muted)' }}>공고문 확인</span>
              )}
            </div>
          </div>
          <div>
            <div className="cs-note">공급 세대</div>
            <div className="cs-num" style={{ fontSize: 26, fontWeight: 700, color: 'var(--title)', marginTop: 6 }}>
              {property.supplyCount}세대
            </div>
          </div>
        </div>

        {candidate && (candidate.budget.depositOver > 0 || candidate.budget.rentOver > 0) && (
          <div className="cs-notice__caution" style={{ marginTop: 20 }}>
            입력하신 예산보다
            {candidate.budget.depositOver > 0 && ` 보증금 ${formatMan(candidate.budget.depositOver)}`}
            {candidate.budget.rentOver > 0 && ` 월세 ${candidate.budget.rentOver}만원`} 높습니다.
          </div>
        )}
      </div>

      {/* 주택형별 공급 — 총계만으로는 "내가 넣을 평형이 몇 세대이고 얼마인가"에
          답할 수 없다. 답하지 못하면 결국 공고문 PDF 를 열게 된다. */}
      {supplyModels.length > 0 && (
        <section style={{ marginTop: 32 }}>
          <h2 className="cs-section-title" style={{ fontSize: 24 }}>
            주택형별 공급
          </h2>
          <div className="cs-card cs-models" style={{ marginTop: 18 }}>
            <table className="cs-table">
              <thead>
                <tr>
                  <th>주택형</th>
                  <th>공급면적</th>
                  <th className="cs-table__r">분양가</th>
                  <th className="cs-table__r">평당</th>
                  <th className="cs-table__r">세대</th>
                </tr>
              </thead>
              <tbody>
                {supplyModels.map(m => (
                  <tr key={m.name}>
                    <td className="cs-table__key">{m.name}</td>
                    <td className="cs-num">
                      {/* 원자료는 83.978 처럼 소수가 길다. 그대로 적으면 정밀해
                          보이지만 읽히지 않는다 — 한 자리로 줄인다 */}
                      {m.supplyArea === null ? '—' : `${m.supplyArea.toFixed(1)}㎡`}
                      {m.exclusiveArea !== null && (
                        <span className="cs-table__sub">전용 {m.exclusiveArea}㎡</span>
                      )}
                    </td>
                    <td className="cs-num cs-table__r">
                      {m.topAmount === null ? '공고문 확인' : formatMan(m.topAmount)}
                    </td>
                    <td className="cs-num cs-table__r">
                      {m.perPyeong === null ? '—' : `${m.perPyeong.toLocaleString()}만원`}
                    </td>
                    <td className="cs-num cs-table__r">
                      {m.households === null ? '—' : `${m.households.toLocaleString()}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="cs-note" style={{ marginTop: 14 }}>
              분양가는 주택형별 최고가 기준이고, 평당은 공급면적으로 나눈 값입니다. 층·동별 금액과
              옵션은 공고문에서 확인해 주세요.
            </p>
          </div>
        </section>
      )}

      {/* 주변 전월세 — 임대 공고는 금액을 내놓지 않는다. 공고의 값을 알 수 없다면
          적어도 그 동네가 얼마인지는 말해 줄 수 있다. */}
      {rent && (
        <section style={{ marginTop: 32 }}>
          <h2 className="cs-section-title" style={{ fontSize: 24 }}>
            주변 전월세 시세
          </h2>
          <div className="cs-card" style={{ marginTop: 18 }}>
            <p className="cs-pro__p" style={{ marginBottom: 18 }}>
              <strong>{rent.scope}</strong> 최근 {rent.months}개월 <strong>{rent.total.toLocaleString()}건</strong>의
              전월세 신고를 면적대로 나눠 셌습니다.
            </p>

            <div className="cs-models">
              <table className="cs-table">
                <thead>
                  <tr>
                    <th>전용면적</th>
                    <th className="cs-table__r">전세 보증금</th>
                    <th className="cs-table__r">월세 (보증금 / 월)</th>
                  </tr>
                </thead>
                <tbody>
                  {rent.bands.map(b => (
                    <tr key={b.key}>
                      <td className="cs-table__key">{b.key}</td>
                      <td className="cs-num cs-table__r">
                        {b.jeonse.deposit === null ? (
                          <span style={{ color: 'var(--muted)' }}>—</span>
                        ) : (
                          <>
                            {formatMan(b.jeonse.deposit)}
                            <span className="cs-table__sub">{b.jeonse.count}건</span>
                          </>
                        )}
                      </td>
                      <td className="cs-num cs-table__r">
                        {b.wolse.rent === null ? (
                          <span style={{ color: 'var(--muted)' }}>—</span>
                        ) : (
                          <>
                            {formatMan(b.wolse.deposit ?? 0)} / {b.wolse.rent.toLocaleString()}만원
                            <span className="cs-table__sub">{b.wolse.count}건</span>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="cs-note" style={{ marginTop: 16 }}>
              각 칸은 그 면적대의 중앙값이고, 전세와 월세를 갈라 셌습니다. 월세는 보증금과 월세를
              서로 맞바꿀 수 있어 한 숫자로 묶지 않고 따로 적었습니다. 공공임대는 이 시세보다 낮게
              공급되는 것이 일반적이지만, 이 공고의 실제 조건은 모집공고문에서 확인해 주세요.
              출처: 국토교통부 전월세 실거래.
            </p>
          </div>
        </section>
      )}

      {/* 주변 실거래 — 분양가가 싼지 비싼지는 그 숫자만 봐서는 알 수 없다 */}
      {bench && (
        <section style={{ marginTop: 32 }}>
          <h2 className="cs-section-title" style={{ fontSize: 24 }}>
            주변 아파트 매매 실거래
          </h2>
          <div className="cs-card" style={{ marginTop: 18 }}>
            <p className="cs-pro__p" style={{ marginBottom: 18 }}>
              <strong>{bench.scope}</strong> 최근 {trade!.months}개월 <strong>{bench.count}건</strong>의 전용 평당
              중앙값은 <strong>{bench.per.toLocaleString()}만원</strong>입니다.
            </p>

            {supplyModels.length > 0 && (
              <div className="cs-models">
                <table className="cs-table">
                  <thead>
                    <tr>
                      <th>주택형</th>
                      <th className="cs-table__r">분양가</th>
                      <th className="cs-table__r">주변 시세 환산액</th>
                      <th className="cs-table__r">차이</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplyModels.map(m => {
                      if (m.exclusiveArea === null || m.topAmount === null) return null
                      const around = Math.round(bench.per * (m.exclusiveArea / 3.3058))
                      const gap = m.topAmount - around
                      return (
                        <tr key={m.name}>
                          <td className="cs-table__key">
                            {m.name}
                            <span className="cs-table__sub">전용 {m.exclusiveArea}㎡</span>
                          </td>
                          <td className="cs-num cs-table__r">{formatMan(m.topAmount)}</td>
                          <td className="cs-num cs-table__r">{formatMan(around)}</td>
                          <td className="cs-num cs-table__r">
                            <span className="cs-gap" data-over={gap > 0}>
                              {gap > 0 ? '+' : gap < 0 ? '−' : ''}
                              {formatMan(Math.abs(gap))}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {trade!.presale?.medianPerPyeong && (
              <div className="cs-bench">
                <div className="cs-bench__k">분양권 전매와 견주면</div>
                <p className="cs-pro__p" style={{ margin: '0 0 12px' }}>
                  같은 시·군·구에서 최근 {trade!.presale.months}개월 <strong>{trade!.presale.count}건</strong>의
                  분양권·입주권이 손바뀜했고, 전용 평당 중앙값은{' '}
                  <strong>{trade!.presale.medianPerPyeong.toLocaleString()}만원</strong>입니다.
                </p>
                <div className="cs-models">
                  <table className="cs-table">
                    <thead>
                      <tr>
                        <th>주택형</th>
                        <th className="cs-table__r">분양가</th>
                        <th className="cs-table__r">전매 시세 환산액</th>
                        <th className="cs-table__r">차이</th>
                      </tr>
                    </thead>
                    <tbody>
                      {supplyModels.map(m => {
                        if (m.exclusiveArea === null || m.topAmount === null) return null
                        const around = Math.round(trade!.presale!.medianPerPyeong! * (m.exclusiveArea / 3.3058))
                        const gap = m.topAmount - around
                        return (
                          <tr key={`ps-${m.name}`}>
                            <td className="cs-table__key">{m.name}</td>
                            <td className="cs-num cs-table__r">{formatMan(m.topAmount)}</td>
                            <td className="cs-num cs-table__r">{formatMan(around)}</td>
                            <td className="cs-num cs-table__r">
                              <span className="cs-gap" data-over={gap > 0}>
                                {gap > 0 ? '+' : gap < 0 ? '−' : ''}
                                {formatMan(Math.abs(gap))}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="cs-note" style={{ marginTop: 12 }}>
                  매매 실거래에는 지은 지 오래된 단지도 섞여 있어, 새로 분양하는 집을 그것과만 견주면
                  대체로 비싸게 나옵니다. 분양권은 아직 짓는 중인 물건이라 같은 줄에 섭니다. 두 값이
                  크게 다를 수 있으니 무엇과 견준 숫자인지 함께 보아 주세요.
                </p>
              </div>
            )}

            {trade!.monthly.length >= 3 && (
              <div className="cs-trend">
                <div className="cs-trend__head">
                  <span className="cs-note">전용 평당 중앙값 {trade!.months}개월</span>
                  <span className="cs-num cs-trend__delta" data-up={
                    trade!.monthly[trade!.monthly.length - 1].medianPerPyeong >= trade!.monthly[0].medianPerPyeong
                  }>
                    {trade!.monthly[0].month.replace('-', '.')} {trade!.monthly[0].medianPerPyeong.toLocaleString()}만
                    {' → '}
                    {trade!.monthly[trade!.monthly.length - 1].month.replace('-', '.')}{' '}
                    {trade!.monthly[trade!.monthly.length - 1].medianPerPyeong.toLocaleString()}만
                  </span>
                </div>
                {(() => {
                  const ms = trade!.monthly
                  const lo = Math.min(...ms.map(m => m.medianPerPyeong))
                  const hi = Math.max(...ms.map(m => m.medianPerPyeong))
                  const span = hi - lo || 1
                  return (
                    <div className="cs-trend__bars">
                      {ms.map(m => (
                        <div key={m.month} className="cs-trend__col" title={`${m.month} · ${m.medianPerPyeong.toLocaleString()}만원 · ${m.count}건`}>
                          <div
                            className="cs-trend__bar"
                            style={{ height: `${18 + ((m.medianPerPyeong - lo) / span) * 82}%` }}
                          />
                          <span className="cs-trend__m">{m.month.slice(5)}</span>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>
            )}

            <p className="cs-note" style={{ marginTop: 16 }}>
              환산액 = 주변 전용 평당 중앙값 × 이 주택형의 전용 평수. 해제된 거래는 뺐고, 거래가
              3건 미만인 달은 비웠습니다. 주변 단지의 연식·규모·브랜드 차이는 반영하지 않은 단순
              비교이므로, 차액이 곧 이익이나 손해를 뜻하지 않습니다. 출처: 국토교통부 실거래가.
            </p>
          </div>
        </section>
      )}

      {/* 이 지역의 최근 청약 결과 — 과거이고, 이 공고의 결과를 예측하지 않는다 */}
      {region && (region.competition || region.scores.length > 0) && (
        <section style={{ marginTop: 32 }}>
          <h2 className="cs-section-title" style={{ fontSize: 24 }}>
            이 지역의 최근 청약 결과
          </h2>
          <div className="cs-card" style={{ marginTop: 18 }}>
            {region.competition && (
              <>
                <div className="cs-rate">
                  <span className="cs-rate__n">{region.competition.rate.toLocaleString()} : 1</span>
                  <span className="cs-rate__k">
                    {region.province} 1순위 경쟁률 · 최근 {region.months}개월 합계
                  </span>
                  <span className="cs-note">
                    공급 {region.competition.supply.toLocaleString()}세대 · 신청{' '}
                    {region.competition.applied.toLocaleString()}건
                  </span>
                </div>

                {region.competition.monthly.length >= 3 && (() => {
                  const ms = region.competition.monthly
                  const hi = Math.max(...ms.map(m => m.rate), 1)
                  return (
                    <div className="cs-trend" style={{ marginTop: 22 }}>
                      <div className="cs-trend__head">
                        <span className="cs-note">달별 경쟁률 · 점선이 1 : 1(미달 경계)</span>
                      </div>
                      <div className="cs-trend__bars cs-trend__bars--line">
                        <span className="cs-trend__one" style={{ bottom: `${(1 / hi) * 100}%` }} />
                        {ms.map(m => (
                          <div
                            key={m.month}
                            className="cs-trend__col"
                            title={`${m.month} · ${m.rate} : 1 · 공급 ${m.supply.toLocaleString()}세대`}
                          >
                            <div
                              className="cs-trend__bar"
                              data-under={m.rate < 1}
                              style={{ height: `${Math.max(4, (m.rate / hi) * 100)}%` }}
                            />
                            <span className="cs-trend__m">{m.month.slice(5)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </>
            )}

            {region.scores.length > 0 && (
              <div className="cs-scores">
                <div className="cs-note" style={{ marginBottom: 10 }}>
                  가점제 당첨 가점 — 0점·미발표는 뺐습니다
                </div>
                {region.scores.map(sc => (
                  <div key={sc.kind} className="cs-scores__row">
                    <span className="cs-scores__k">{sc.kind}</span>
                    <span className="cs-num cs-scores__v">
                      최저 {sc.lowest ?? '—'} · 평균 {sc.average ?? '—'} · 최고 {sc.highest ?? '—'}점
                      <span className="cs-scores__n">({sc.months}개월)</span>
                    </span>
                  </div>
                ))}
                <Link href="/score" className="cs-btn cs-btn--sm cs-btn--ghost" style={{ marginTop: 14 }}>
                  내 가점 계산해 비교하기
                </Link>
              </div>
            )}

            {nearby.length > 0 && (
              <div className="cs-near">
                <div className="cs-note" style={{ marginBottom: 10 }}>
                  근처에서 최근에 끝난 청약 — 같은 시·군·구를 먼저, 모자라면 같은 시·도에서
                </div>
                <div className="cs-models">
                  <table className="cs-table">
                    <thead>
                      <tr>
                        <th>단지</th>
                        <th className="cs-table__r">1순위 경쟁률</th>
                        <th className="cs-table__r">공급 · 신청</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nearby.map(nb => (
                        <tr key={`${nb.name}-${nb.resultDate}`}>
                          <td className="cs-table__key">
                            {nb.name}
                            <span className="cs-table__sub">
                              {nb.area} · {nb.kind}
                              {nb.resultDate && ` · 발표 ${nb.resultDate}`}
                              {nb.scope === 'REGION' && ' · 같은 시·군·구'}
                            </span>
                          </td>
                          <td className="cs-num cs-table__r">
                            {/* 공급보다 신청이 적으면 경쟁률이 아니라 미달이다 */}
                            <span className="cs-gap" data-over={!nb.under}>
                              {nb.under ? `미달 ${nb.rate} : 1` : `${nb.rate} : 1`}
                            </span>
                          </td>
                          <td className="cs-num cs-table__r">
                            {nb.supply.toLocaleString()}세대 · {nb.applied.toLocaleString()}건
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <p className="cs-note" style={{ marginTop: 16 }}>
              청약홈 공공데이터 기준입니다. 경쟁률은 달마다 규모가 달라 신청 총합 ÷ 공급 총합으로
              셌습니다. 과거 결과이며 이 공고의 결과를 예측하지 않습니다.{' '}
              <Link href="/stats">지역별 통계 전체 보기</Link>
            </p>
          </div>
        </section>
      )}

      {/* 내 조건과의 비교 */}
      {candidate && (
        <section style={{ marginTop: 32 }}>
          <h2 className="cs-section-title" style={{ fontSize: 24 }}>
            내 조건과 비교하면
          </h2>
          <div className="cs-card" style={{ marginTop: 18 }}>
            {candidate.reasons.length > 0 && (
              <ul className="cs-notice__reasons" style={{ marginTop: 0 }}>
                {candidate.reasons.map(r => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            <div style={{ marginTop: candidate.reasons.length ? 20 : 0 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--check)', marginBottom: 10 }}>
                지원 전 확인이 필요한 사항
              </div>
              <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8 }}>
                {candidate.cautions.map(c => (
                  <li key={c} style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--body)' }}>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* 공식 일정 */}
      <section style={{ marginTop: 32 }}>
        <h2 className="cs-section-title" style={{ fontSize: 24 }}>
          공고 일정{isSample && ' · 예시 데이터'}
        </h2>
        <div className="cs-card" style={{ marginTop: 18 }}>
          {/* 날짜를 읽는 일과 기간을 가늠하는 일은 다르다. 사람이 하려는 것은 뒤쪽이라
              목록 위에 달력을 둔다 */}
          <NoticeCalendar marks={marksFrom(property, recommended)} />

          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2 }}>
            {official.map(t => (
              <li
                key={t.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 16,
                  padding: '14px 0',
                  borderBottom: '1px solid var(--line)',
                }}
              >
                <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--title)' }}>{t.title}</span>
                <span className="cs-num" style={{ fontSize: 16, color: t.dueDate ? 'var(--body)' : 'var(--muted)' }}>
                  {t.dueDate ?? '미정'}{t.status === 'BLOCKED' && ' · 당첨 후 확인'}
                </span>
              </li>
            ))}
          </ul>
          <p className="cs-note" style={{ marginTop: 16 }}>
            시간대: 한국 표준시(Asia/Seoul).{isSample ? ' 예시 일정이며,' : ' 공고문에 적힌 날짜만 싣고,'}{' '}
            공개되지 않은 날짜는 &lsquo;공고 미공개&rsquo;로 표시합니다.
          </p>
        </div>
      </section>

      {/* 준비 권장일 */}
      <section style={{ marginTop: 32 }}>
        <h2 className="cs-section-title" style={{ fontSize: 24 }}>
          이렇게 준비하시면 좋아요
        </h2>
        <p className="cs-sub" style={{ marginTop: 10 }}>
          공식 기한이 아니라 저희가 제안하는 준비 일정입니다.
        </p>
        <div className="cs-card" style={{ marginTop: 18 }}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2 }}>
            {recommended.map(t => (
              <li
                key={t.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 16,
                  padding: '14px 0',
                  borderBottom: '1px solid var(--line)',
                }}
              >
                <span>
                  <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--title)' }}>{t.title}</span>
                  {t.hint && (
                    <span style={{ display: 'block', fontSize: 14, color: 'var(--muted)', marginTop: 2 }}>
                      {t.hint}
                    </span>
                  )}
                </span>
                <span className="cs-num" style={{ fontSize: 16, color: t.dueDate ? 'var(--body)' : 'var(--muted)' }}>
                  {t.dueDate ?? '기준일 미정'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 원문 */}
      <section style={{ marginTop: 32 }}>
        <div className="cs-card">
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--title)', marginBottom: 8 }}>공고 원문</div>
          {property.sourceUrl ? (
            <a
              href={property.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="cs-btn cs-btn--ghost cs-btn--sm"
            >
              원문 보기
            </a>
          ) : (
            <p className="cs-sub" style={{ fontSize: 16 }}>
              {isSample
                ? '이 공고는 예시 데이터라 연결할 원문이 없습니다. 실제 공고 연동 시 원문 링크를 함께 제공합니다.'
                : '이 공고는 원문 링크가 공개되지 않았습니다. 공급기관 누리집에서 공고번호로 찾아 주세요.'}
            </p>
          )}
          <p className="cs-note" style={{ marginTop: 12 }}>
            공급기관 {property.source} · 공고번호 {property.announcementId}
          </p>
        </div>
      </section>

      {/* 다음 행동 */}
      <section style={{ marginTop: 32, marginBottom: 24 }}>
        <div className="cs-cta-band">
          {closed ? (
            <>
              <h2 className="cs-section-title" style={{ fontSize: 22 }}>
                이 공고는 접수가 마감됐어요
              </h2>
              <p className="cs-sub" style={{ marginTop: 12 }}>
                같은 조건의 다른 후보를 다시 살펴보세요. 이메일 발송은 아직 연결 전입니다.
              </p>
              <button
                className="cs-btn cs-btn--primary"
                style={{ marginTop: 22 }}
                onClick={() => gate.open({ kind: 'ALERT_NEW', propertyId: null })}
              >
                새 공고 알림 받기
              </button>
            </>
          ) : hasDeadlineAlert ? (
            <>
              <h2 className="cs-section-title" style={{ fontSize: 22 }}>
                마감 알림을 설정했어요
              </h2>
              <p className="cs-sub" style={{ marginTop: 12 }}>
                수신 설정을 저장했어요. 이메일 발송은 아직 연결 전입니다.
              </p>
              <Link href="/saved" className="cs-btn cs-btn--ghost" style={{ marginTop: 22 }}>
                관심공고 보기
              </Link>
            </>
          ) : (
            <>
              <h2 className="cs-section-title" style={{ fontSize: 22 }}>
                이 공고 마감 알림 받기
              </h2>
              <p className="cs-sub" style={{ marginTop: 12 }}>
                {property.applicationEnd
                  ? `접수 마감 ${property.applicationEnd} · 수신 설정만 저장하며 이메일 발송은 연결 전입니다.`
                  : '마감일이 미정입니다. 수신 설정만 저장하며 이메일 발송은 연결 전입니다.'}
              </p>
              <button
                className="cs-btn cs-btn--primary"
                style={{ marginTop: 22 }}
                onClick={() =>
                  gate.open({ kind: 'ALERT_DEADLINE', propertyId: property.id, propertyName: property.name })
                }
              >
                마감 알림 받기
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
