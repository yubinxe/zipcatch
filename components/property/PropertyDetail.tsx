'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import SiteHeader from '@/components/layout/SiteHeader'
import { Card, StatusPill, Icon } from '@/components/ui'
import { InkTag, PrimaryButton } from '@/components/ui/interactive'
import WinnerPredictionSlideover from '@/components/prediction/WinnerPredictionSlideover'
import { formatDate, formatMonth } from '@/lib/format'
import {
  getDday,
  getSubscriptionStatus,
  toHeroAnnouncement,
} from '@/lib/announcement-helpers'
import type { Announcement, CompetitionItem, SpecialSupplyItem } from '@/lib/types'

const SPECIAL_LABELS: Record<string, string> = {
  MNYCH_HSHLDCO: '다자녀',
  NWWDS_NMTW_HSHLDCO: '신혼부부',
  LFE_FRST_HSHLDCO: '생애최초',
  YGMN_HSHLDCO: '청년',
  OLD_PARNTS_SUPORT_HSHLDCO: '노부모부양',
  NWBB_NWBBSHR_HSHLDCO: '신생아',
  INSTT_RECOMEND_HSHLDCO: '기관추천',
}

interface PropertyPayload {
  announcement: Announcement
  competition: CompetitionItem[]
  specialSupply: SpecialSupplyItem[]
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-cell">
      <div className="info-cell-label">{label}</div>
      <div className="info-cell-value">{value}</div>
    </div>
  )
}

function TimelineRow({ label, value, active }: { label: string; value: string; active?: boolean }) {
  return (
    <div className={`timeline-row${active ? ' timeline-row--active' : ''}`}>
      <div className="timeline-dot" />
      <div style={{ flex: 1 }}>
        <div className="timeline-label">{label}</div>
        <div className="timeline-value tnum">{value}</div>
      </div>
    </div>
  )
}

export default function PropertyDetail({ id }: { id: string }) {
  const [dark, setDark] = useState(false)
  const [predictOpen, setPredictOpen] = useState(false)

  /**
   * 받아 온 것이 **어느 공고의** 결과인지 함께 들고 있는다.
   *
   * 예전에는 효과 첫 줄에서 setLoading(true) 를 불러 화면을 한 번 더 그렸고,
   * 그 사이 주소가 바뀌면 이전 공고의 내용이 새 공고 자리에 잠깐 남았다.
   * 결과에 공고 번호를 붙여 두면 '불러오는 중'은 견주어 알 수 있고,
   * 남의 공고를 보여줄 일도 없다.
   */
  const [got, setGot] = useState<{ id: string; payload: PropertyPayload | null; error: string }>({
    id: '',
    payload: null,
    error: '',
  })
  const loading = got.id !== id
  const payload = loading ? null : got.payload
  const error = loading ? '' : got.error

  useEffect(() => {
    let alive = true
    fetch(`/api/property/${encodeURIComponent(id)}`)
      .then(async res => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error || '로드 실패')
        }
        return res.json() as Promise<PropertyPayload>
      })
      .then(p => {
        if (alive) setGot({ id, payload: p, error: '' })
      })
      .catch(e => {
        if (alive) {
          setGot({ id, payload: null, error: e instanceof Error ? e.message : '오류가 발생했습니다' })
        }
      })
    return () => {
      alive = false
    }
  }, [id])

  const toggleDark = () => {
    const next = !dark
    setDark(next)
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light')
  }

  const ann = payload?.announcement
  const hero = ann ? toHeroAnnouncement(ann) : null
  const status = ann ? getSubscriptionStatus(ann) : 'closed'
  const dday = ann ? getDday(ann.RCEPT_ENDDE) : 0

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-sub)' }}>
      <SiteHeader dark={dark} onToggleTheme={toggleDark} backHref="/" />

      <main className="dash-main" style={{ maxWidth: 1240, margin: '0 auto', padding: '32px 32px 80px' }}>
        <nav className="breadcrumb rise" aria-label="경로">
          <Link href="/">홈</Link>
          <span aria-hidden>/</span>
          <span>단지 상세</span>
        </nav>

        {loading ? (
          <div className="detail-skeleton rise" style={{ marginTop: 24 }}>
            <div style={{ height: 48, width: '55%', borderRadius: 12, background: 'var(--track)' }} />
            <div style={{ height: 200, marginTop: 24, borderRadius: 'var(--r-lg)', background: 'var(--track)' }} />
          </div>
        ) : error || !ann || !hero ? (
          <Card className="rise" style={{ marginTop: 24, textAlign: 'center', padding: 48 }}>
            <p style={{ margin: '0 0 20px', color: 'var(--ink-2)', fontSize: 15 }}>{error || '단지를 찾을 수 없습니다'}</p>
            <Link href="/" className="btn-ink" style={{ display: 'inline-flex' }}>
              목록으로 돌아가기
            </Link>
          </Card>
        ) : (
          <>
            <header className="detail-hero rise" style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                    <StatusPill status={status} pulse={status === 'soon'} />
                    <InkTag>{ann.HOUSE_DTL_SECD_NM || ann.HOUSE_SECD_NM}</InkTag>
                  </div>
                  <h1 style={{ margin: 0, fontSize: 36, fontWeight: 760, letterSpacing: '-0.035em', lineHeight: 1.1, color: 'var(--ink)' }}>
                    {ann.HOUSE_NM}
                  </h1>
                  <p style={{ margin: '12px 0 0', fontSize: 15, color: 'var(--ink-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="pin" size={15} />
                    {ann.HSSPLY_ADRES || `${hero.sido} ${hero.gu}`} · {hero.builder}
                  </p>
                </div>
                {(status === 'open' || status === 'soon') && (
                  <div className="dday-badge">
                    <span className="dday-badge-label">마감까지</span>
                    <span className="dday-badge-value tnum">D-{dday}</span>
                  </div>
                )}
              </div>
            </header>

            <button
              type="button"
              className="predict-banner rise"
              style={{ animationDelay: '40ms', marginTop: 'var(--gap)' }}
              onClick={() => setPredictOpen(true)}
            >
              <div className="predict-banner-icon">
                <Icon name="spark" size={22} />
              </div>
              <div className="predict-banner-text">
                <strong>내 가점 비교</strong>
                <span>이 단지의 최근 당첨 가점 통계와 내 조건을 비교해 볼 수 있습니다</span>
              </div>
              <span className="predict-banner-arrow" aria-hidden>→</span>
            </button>

            <div className="detail-grid rise" style={{ animationDelay: '60ms', marginTop: 'var(--gap)' }}>
              <Card>
                <h2 className="section-title">기본 정보</h2>
                <div className="info-grid">
                  <InfoCell label="공급지역" value={ann.SUBSCRPT_AREA_CODE_NM || '-'} />
                  <InfoCell label="총 공급세대" value={ann.TOT_SUPLY_HSHLDCO ? `${Number(ann.TOT_SUPLY_HSHLDCO).toLocaleString()}세대` : '-'} />
                  <InfoCell label="사업주체" value={ann.BSNS_MBY_NM || '-'} />
                  <InfoCell label="분양가상한제" value={ann.NSPRC_NM === '해당' ? '해당' : '미해당'} />
                  <InfoCell label="문의처" value={ann.MDHS_TELNO || '-'} />
                  <InfoCell label="공고번호" value={ann.PBLANC_NO} />
                </div>
              </Card>

              <Card delay={40}>
                <h2 className="section-title">청약 일정</h2>
                <div className="timeline">
                  <TimelineRow
                    label="모집공고일"
                    value={ann.RCRIT_PBLANC_DE ? formatDate(ann.RCRIT_PBLANC_DE) : '-'}
                  />
                  <TimelineRow
                    label="청약접수"
                    value={
                      ann.RCEPT_BGNDE && ann.RCEPT_ENDDE
                        ? `${formatDate(ann.RCEPT_BGNDE)} ~ ${formatDate(ann.RCEPT_ENDDE)}`
                        : '-'
                    }
                    active={status === 'open' || status === 'soon'}
                  />
                  <TimelineRow
                    label="특별공급 접수"
                    value={
                      ann.SPSPLY_RCEPT_BGNDE && ann.SPSPLY_RCEPT_ENDDE
                        ? `${formatDate(ann.SPSPLY_RCEPT_BGNDE)} ~ ${formatDate(ann.SPSPLY_RCEPT_ENDDE)}`
                        : '-'
                    }
                  />
                  <TimelineRow
                    label="당첨자 발표"
                    value={ann.PRZWNER_PRESNATN_DE ? formatDate(ann.PRZWNER_PRESNATN_DE) : '-'}
                  />
                  <TimelineRow
                    label="계약 체결"
                    value={
                      ann.CNTRCT_CNCLS_BGNDE && ann.CNTRCT_CNCLS_ENDDE
                        ? `${formatDate(ann.CNTRCT_CNCLS_BGNDE)} ~ ${formatDate(ann.CNTRCT_CNCLS_ENDDE)}`
                        : '-'
                    }
                  />
                  <TimelineRow label="입주예정" value={ann.MVN_PREARNGE_YM ? formatMonth(ann.MVN_PREARNGE_YM) : '-'} />
                </div>
              </Card>
            </div>

            {payload.competition.length > 0 && (
              <Card className="rise" delay={80} style={{ marginTop: 'var(--gap)' }}>
                <h2 className="section-title">주택형별 경쟁률</h2>
                <div style={{ overflowX: 'auto' }}>
                  <table className="detail-table">
                    <thead>
                      <tr>
                        {['주택형', '공급', '거주구분', '신청', '경쟁률'].map(h => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {payload.competition.map((row, i) => {
                        const rate = parseFloat(row.CMPET_RATE)
                        return (
                          <tr key={i} className="rowhover">
                            <td style={{ fontWeight: 650, color: 'var(--ink)' }}>{row.HOUSE_TY}</td>
                            <td className="tnum">{Number(row.SUPLY_HSHLDCO).toLocaleString()}</td>
                            <td>{row.RESIDE_SENM}</td>
                            <td className="tnum">{Number(row.REQ_CNT).toLocaleString()}</td>
                            <td className="tnum" style={{ fontWeight: 700, color: 'var(--ink)' }}>
                              {row.CMPET_RATE === '-' ? '-' : `${rate.toFixed(2)}:1`}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {payload.specialSupply.length > 0 && (
              <Card className="rise" delay={120} style={{ marginTop: 'var(--gap)' }}>
                <h2 className="section-title">특별공급 신청 현황</h2>
                <div style={{ overflowX: 'auto' }}>
                  <table className="detail-table">
                    <thead>
                      <tr>
                        <th>주택형</th>
                        <th>특별공급</th>
                        {Object.values(SPECIAL_LABELS).map(l => (
                          <th key={l}>{l}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {payload.specialSupply.map((row, i) => (
                        <tr key={i} className="rowhover">
                          <td style={{ fontWeight: 650, color: 'var(--ink)' }}>{row.HOUSE_TY}</td>
                          <td className="tnum">{Number(row.SPSPLY_HSHLDCO).toLocaleString()}</td>
                          {Object.keys(SPECIAL_LABELS).map(key => (
                            <td key={key} className="tnum">
                              {row[key as keyof SpecialSupplyItem] || '-'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            <div className="rise detail-cta" style={{ animationDelay: '160ms', marginTop: 'var(--gap)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button type="button" className="btn-ink" onClick={() => setPredictOpen(true)}>
                내 가점 비교 →
              </button>
              {ann.PBLANC_URL && (
                <PrimaryButton href={ann.PBLANC_URL}>
                  청약홈 공고 바로가기 →
                </PrimaryButton>
              )}
              {ann.HMPG_ADRES && (
                <PrimaryButton href={ann.HMPG_ADRES.startsWith('http') ? ann.HMPG_ADRES : `https://${ann.HMPG_ADRES}`}>
                  분양 홈페이지 →
                </PrimaryButton>
              )}
              <Link href="/" className="btn-ghost">
                목록으로
              </Link>
            </div>
          </>
        )}
      </main>

      {ann && (
        <WinnerPredictionSlideover
          open={predictOpen}
          onClose={() => setPredictOpen(false)}
          regionCode={ann.SUBSCRPT_AREA_CODE}
          regionName={ann.SUBSCRPT_AREA_CODE_NM}
          complexName={ann.HOUSE_NM}
        />
      )}
    </div>
  )
}
