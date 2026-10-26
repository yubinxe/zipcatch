'use client'

import Link from 'next/link'
import YouthDiscoveryLoader from './YouthDiscoveryLoader'
import { useEffect, useState } from 'react'
import type { Candidate } from '@/lib/crm/services/scoring'
import { formatMan } from '@/lib/crm/services/scoring'
import type { Property, SearchProfile } from '@/lib/crm/types'
import NoticeCard from './NoticeCard'
import SampleOnlyNotice from './SampleOnlyNotice'
import { useConsumer } from './ConsumerProvider'
import { useSignupGate } from './SignupGate'

interface Row {
  property: Property
  candidate: Candidate
}

interface SearchResponse {
  profile: SearchProfile
  primary: Row[]
  relaxed: Row[]
  insight: string
}

export default function ResultsView() {
  const { profile, alerts, loading: meLoading } = useConsumer()
  const gate = useSignupGate()
  const [data, setData] = useState<SearchResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const hasNewNoticeAlert = alerts.some(a => a.scope === 'NEW_NOTICE')

  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    if (!profile) return
    // 화면을 떠나거나 다시 시도하면 앞의 요청을 거둔다. 늦게 온 옛 결과가 새 화면을 덮지 않게
    const ctl = new AbortController()

    fetch('/api/search', {
      signal: ctl.signal,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        readOnly: true,
        regions: profile.regions,
        householdType: profile.householdType,
        housingTypes: profile.housingTypes,
        maxDeposit: profile.unknownFields.includes('maxDeposit') ? null : profile.maxDeposit,
        maxMonthlyRent: profile.unknownFields.includes('maxMonthlyRent') ? null : profile.maxMonthlyRent,
        minArea: profile.unknownFields.includes('minArea') ? null : profile.minArea,
      }),
    })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('후보를 불러오지 못했어요.'))))
      .then((json: SearchResponse) => {
        if (alive) setData(json)
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : '후보를 불러오지 못했어요.')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
      ctl.abort()
    }
  }, [profile, attempt])

  // 조건이 없으면 입력부터
  if (meLoading) return <div className="cs-wrap" role="status" style={{ paddingTop: 48 }}>저장한 조건을 확인하고 있어요…</div>
  if (!profile) {
    return (
      <div className="cs-wrap" style={{ paddingTop: 64, maxWidth: 620 }}>
        <div className="cs-empty">
          <div className="cs-empty__title">먼저 조건을 알려주세요</div>
          <p className="cs-empty__desc">희망 지역과 주거비만 입력하면 후보를 정리해 드려요.</p>
          <Link href="/analyze" className="cs-btn cs-btn--primary" style={{ marginTop: 24 }}>
            내 조건으로 공고 찾기
          </Link>
        </div>
      </div>
    )
  }

  const OWNERSHIP_LABEL: Record<string, string> = {
    NONE: '무주택',
    ONE: '1주택',
    MANY: '2주택 이상',
  }

  const unknownLabel: Record<string, string> = {
    maxDeposit: '보증금 미정',
    maxMonthlyRent: '월세 미정',
    minArea: '면적 미정',
    housingTypes: '유형 전체',
  }

  // 조건에 맞는 후보가 있어도 전부 예시일 수 있다. 그때는 "N건 찾았다"는 제목이
  // 사실과 어긋나므로, 목록 위에 없다는 사실을 먼저 세운다.
  const officialPrimary = data?.primary.filter(r => r.property.dataOrigin === 'OFFICIAL').length ?? 0

  return (
    <div className="cs-wrap" style={{ paddingTop: 44 }}>
      <header>
        <h1 className="cs-page-title">이 조건에서 먼저 살펴볼 공고예요</h1>

        <div className="cs-summary">
          <span className="cs-summary__chip">
            <span>지역</span> {profile.regions.join(' · ')}
          </span>
          {!profile.unknownFields.includes('maxDeposit') && (
            <span className="cs-summary__chip">
              <span>보증금</span> {formatMan(profile.maxDeposit ?? 0)} 이하
            </span>
          )}
          {!profile.unknownFields.includes('maxMonthlyRent') && (
            <span className="cs-summary__chip">
              <span>월세</span> {profile.maxMonthlyRent}만원 이하
            </span>
          )}
          {!profile.unknownFields.includes('minArea') && (
            <span className="cs-summary__chip">
              <span>면적</span> {profile.minArea}㎡ 이상
            </span>
          )}
          {/* 자격 항목은 적어주신 것만 붙인다 — 비운 칸은 비운 채로 보인다 */}
          {profile.homeownership && (
            <span className="cs-summary__chip">
              <span>주택</span> {OWNERSHIP_LABEL[profile.homeownership]}
            </span>
          )}
          {profile.homelessYears !== null && (
            <span className="cs-summary__chip">
              <span>무주택</span> {profile.homelessYears}년
            </span>
          )}
          {profile.residencyYears !== null && (
            <span className="cs-summary__chip">
              <span>거주</span> {profile.residencyYears}년
            </span>
          )}
          {profile.unknownFields.map(f => (
            <span key={f} className="cs-summary__chip" style={{ color: 'var(--muted)' }}>
              {unknownLabel[f] ?? f}
            </span>
          ))}
          <Link href="/analyze" className="cs-btn cs-btn--text">
            조건 바꾸기
          </Link>
        </div>
      </header>

      <YouthDiscoveryLoader
        active={loading}
        title="저장한 조건으로 후보를 정리하는 중이에요"
        stage="접수 중인 공고와 조건을 대조하고 있어요"
        onRetry={() => {
          setError(null)
          setLoading(true)
          setAttempt(a => a + 1)
        }}
      />
      {loading ? (
        <div className="cs-notice-grid" style={{ marginTop: 36 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="cs-skel" style={{ height: 340 }} />
          ))}
        </div>
      ) : error ? (
        <div className="cs-error" style={{ marginTop: 32 }}>
          <span>{error}</span>
          <Link href="/analyze" className="cs-btn cs-btn--sm cs-btn--ghost">
            조건 다시 입력
          </Link>
        </div>
      ) : !data ? null : (
        <>
          {data.insight && (
            <div className="cs-card" style={{ marginTop: 28 }}>
              <p style={{ margin: 0, fontSize: 18, lineHeight: 1.6, color: 'var(--title)', fontWeight: 500 }}>
                {data.insight}
              </p>
            </div>
          )}

          <section style={{ marginTop: 36 }}>
            <h2 className="cs-section-title" style={{ fontSize: 24 }}>
              조건에 맞는 공고 {data.primary.length}건
            </h2>

            {data.primary.length === 0 ? (
              <SampleOnlyNotice
                scope={`${profile.regions.join(' · ')} 조건으로`}
                sampleCount={0}
                actions={
                  <>
                    <Link href="/analyze" className="cs-btn cs-btn--ghost">
                      조건 바꾸기
                    </Link>
                    <button
                      className="cs-btn cs-btn--primary"
                      onClick={() => gate.open({ kind: 'ALERT_NEW', propertyId: null })}
                    >
                      새 공고 알림 받기
                    </button>
                  </>
                }
              />
            ) : (
              <>
                {/* 후보는 있는데 전부 예시인 경우. 카드 배지만으로는 놓치기 쉽다. */}
                {officialPrimary === 0 && (
                  <SampleOnlyNotice
                    scope={`${profile.regions.join(' · ')} 조건으로`}
                    sampleCount={data.primary.length}
                    actions={
                      <button
                        className="cs-btn cs-btn--primary"
                        onClick={() => gate.open({ kind: 'ALERT_NEW', propertyId: null })}
                      >
                        새 공고 열리면 알림 받기
                      </button>
                    }
                  />
                )}
                <div className="cs-notice-grid" style={{ marginTop: 22 }}>
                  {data.primary.map((row, i) => (
                    <NoticeCard
                      key={row.property.id}
                      property={row.property}
                      candidate={row.candidate}
                      index={i}
                    />
                  ))}
                </div>
              </>
            )}
          </section>

          {/* 조건을 벗어난 후보는 지우지 않되, 같은 층에 두지도 않는다.
              지면 톤을 한 단 내린 판 위에 올려 "참고"임을 배치로 말한다. */}
          {data.relaxed.length > 0 && (
            <section className="cs-nearby" style={{ marginTop: 52 }}>
              <span className="cs-nearby__eyebrow">참고 후보</span>
              <h2 className="cs-nearby__title">조건을 조금 벗어나지만, 눈여겨볼 만한 곳</h2>
              <p className="cs-nearby__desc">
                입력하신 상한을 넘거나 조건에서 비껴간 공고입니다. 얼마나 벗어나는지 카드마다 적어
                두었으니, 넓혀볼지는 직접 정해 주세요.
              </p>
              <div className="cs-notice-grid">
                {data.relaxed.map(row => (
                  <NoticeCard
                    key={row.property.id}
                    property={row.property}
                    candidate={row.candidate}
                    variant="nearby"
                  />
                ))}
              </div>
            </section>
          )}

          {/* 결과를 충분히 보여준 뒤에 알림을 권한다 */}
          {data.primary.length > 0 && (
            <section style={{ marginTop: 52 }}>
              <div className="cs-cta-band">
                {hasNewNoticeAlert ? (
                  <>
                    <h2 className="cs-section-title" style={{ fontSize: 24 }}>
                      이 조건으로 새 공고를 확인할게요
                    </h2>
                    <p className="cs-sub" style={{ marginTop: 12 }}>
                      알림 설정은 관심공고에서 언제든 해제할 수 있어요.
                    </p>
                    <Link href="/saved" className="cs-btn cs-btn--ghost" style={{ marginTop: 22 }}>
                      관심공고 보기
                    </Link>
                  </>
                ) : (
                  <>
                    <h2 className="cs-section-title" style={{ fontSize: 24 }}>
                      새 공고 알림을 준비해둘까요?
                    </h2>
                    <p className="cs-sub" style={{ marginTop: 12, maxWidth: '44ch', margin: '12px auto 0' }}>
                      동의하시면 {profile.regions.join(' · ')} 조건에 맞는 공고를 지금 한 통 보내드리고, 이후 새 공고가
                      열릴 때마다 이어서 알려드려요.
                    </p>
                    <button
                      className="cs-btn cs-btn--primary"
                      style={{ marginTop: 24 }}
                      onClick={() => {
                        gate.open({ kind: 'ALERT_NEW', propertyId: null })
                      }}
                    >
                      새 공고 알림 받기
                    </button>
                  </>
                )}
              </div>
            </section>
          )}

          <p className="cs-note" style={{ marginTop: 28 }}>
            소득·자산·거주기간 등 공식 자격요건은 확인하지 않았습니다. 지원 전 반드시 공식 모집공고문을
            확인해 주세요.
          </p>
        </>
      )}
    </div>
  )
}
