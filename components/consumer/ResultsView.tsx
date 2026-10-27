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
import PageMasthead from './PageMasthead'

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
  if (meLoading || !profile) {
    return (
      <div className="cs-wrap cs-sa cs-sa--results">
        <PageMasthead
          eyebrow="YOUR SHORTLIST"
          title={meLoading ? '저장한 조건을 확인하고 있어요' : '먼저 조건을 알려주세요'}
          lead={
            meLoading
              ? '조건이 있으면 곧바로 후보를 정리해 드려요.'
              : '희망 지역과 주거비만 입력하면 접수 중인 공고와 대조해 후보를 정리해 드려요.'
          }
        >
          {!meLoading && (
            <div className="cs-sa-acts">
              <Link href="/analyze" className="cs-btn cs-btn--primary">
                내 조건으로 공고 찾기
              </Link>
              <Link href="/notices" className="cs-btn cs-btn--ghost">
                조건 없이 둘러보기
              </Link>
            </div>
          )}
        </PageMasthead>
        {meLoading ? (
          <div className="cs-sa-deck" role="status">
            <div className="cs-sa-deck__skel" aria-hidden="true">
              <span />
              <span />
            </div>
            <span className="cs-sr">저장한 조건을 확인하고 있어요</span>
          </div>
        ) : (
          <ol className="cs-sa-deck cs-sa-steps" aria-label="후보를 정리하는 순서">
            <li>
              <span className="cs-sa-steps__n">01</span>
              <b>지역 고르기</b>
              <span>살고 싶은 시·군·구를 차례대로 고릅니다.</span>
            </li>
            <li>
              <span className="cs-sa-steps__n">02</span>
              <b>주거비 적기</b>
              <span>보증금·월세 상한을 적거나 &lsquo;미정&rsquo;으로 둡니다.</span>
            </li>
            <li>
              <span className="cs-sa-steps__n">03</span>
              <b>후보 받기</b>
              <span>접수 중인 공고와 대조해 맞는 것과 참고할 것을 나눠 드립니다.</span>
            </li>
          </ol>
        )}
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
  const retry = () => {
    setError(null)
    setLoading(true)
    setAttempt(a => a + 1)
  }

  return (
    <div className="cs-wrap cs-sa cs-sa--results">
      <PageMasthead
        eyebrow="YOUR SHORTLIST"
        title="이 조건에서 먼저 살펴볼 공고예요"
        lead={
          <>
            저장한 조건으로 접수 중인 공고를 대조했어요. <b>조건에 맞는 공고</b>를 먼저 놓고, 조금
            벗어나는 공고는 따로 모아 둡니다.
          </>
        }
      >
        <div className="cs-sa-mrow cs-sa-mrow--facts">
          <ul className="cs-sa-facts" aria-label="저장한 조건">
            <li>
              <span>지역</span> <b>{profile.regions.join(' · ')}</b>
            </li>
            {!profile.unknownFields.includes('maxDeposit') && (
              <li>
                <span>보증금</span> <b>{formatMan(profile.maxDeposit ?? 0)} 이하</b>
              </li>
            )}
            {!profile.unknownFields.includes('maxMonthlyRent') && (
              <li>
                <span>월세</span> <b>{profile.maxMonthlyRent}만원 이하</b>
              </li>
            )}
            {!profile.unknownFields.includes('minArea') && (
              <li>
                <span>면적</span> <b>{profile.minArea}㎡ 이상</b>
              </li>
            )}
            {/* 자격 항목은 적어주신 것만 붙인다 — 비운 칸은 비운 채로 보인다 */}
            {profile.homeownership && (
              <li>
                <span>주택</span> <b>{OWNERSHIP_LABEL[profile.homeownership]}</b>
              </li>
            )}
            {profile.homelessYears !== null && (
              <li>
                <span>무주택</span> <b>{profile.homelessYears}년</b>
              </li>
            )}
            {profile.residencyYears !== null && (
              <li>
                <span>거주</span> <b>{profile.residencyYears}년</b>
              </li>
            )}
            {profile.unknownFields.map(f => (
              <li key={f} data-dim="true">
                {unknownLabel[f] ?? f}
              </li>
            ))}
          </ul>
          <Link href="/analyze" className="cs-sa-mlink">
            조건 바꾸기 <i aria-hidden="true">→</i>
          </Link>
        </div>
      </PageMasthead>

      <YouthDiscoveryLoader
        active={loading}
        title="저장한 조건으로 후보를 정리하는 중이에요"
        stage="접수 중인 공고와 조건을 대조하고 있어요"
        onRetry={retry}
      />
      {loading ? (
        <>
          <div className="cs-sa-deck" aria-hidden="true">
            <div className="cs-sa-deck__skel">
              <span />
              <span />
            </div>
          </div>
          <div className="cs-notice-grid cs-sa-grid cs-sa-gap" aria-hidden="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="cs-skel cs-sa-skel" />
            ))}
          </div>
        </>
      ) : error ? (
        <div className="cs-sa-deck cs-sa-deck--plain">
          <div className="cs-error cs-sa-error" role="alert">
            <span>{error} 잠시 뒤 다시 시도하거나 조건을 다시 입력해 주세요.</span>
            <button type="button" className="cs-btn cs-btn--sm cs-btn--primary" onClick={retry}>
              다시 시도
            </button>
            <Link href="/analyze" className="cs-btn cs-btn--sm cs-btn--ghost">
              조건 다시 입력
            </Link>
          </div>
        </div>
      ) : !data ? null : (
        <>
          {/* 한 줄 판독 — 무대 바닥 위로 떠오른 첫 장 */}
          <section className="cs-sa-deck cs-sa-brief" aria-label="한 줄 판독">
            <div className="cs-sa-brief__body">
              <span className="cs-sa-kicker">Brief</span>
              <p className="cs-sa-brief__text">
                {data.insight ||
                  (data.primary.length > 0
                    ? `조건에 맞는 공고 ${data.primary.length}건을 마감이 가까운 순으로 놓았어요.`
                    : '지금은 조건에 꼭 맞는 공고가 없어요.')}
              </p>
            </div>
            <dl className="cs-sa-brief__nums">
              <div>
                <dt>조건에 맞음</dt>
                <dd className="cs-num">{data.primary.length}</dd>
              </div>
              <div>
                <dt>참고 후보</dt>
                <dd className="cs-num">{data.relaxed.length}</dd>
              </div>
            </dl>
          </section>

          <section className="cs-sa-sec">
            <header className="cs-sa-head">
              <div className="cs-sa-head__t">
                <span className="cs-sa-kicker">Matched</span>
                <h2 className="cs-sa-h2">
                  조건에 맞는 공고 <span className="cs-num">{data.primary.length}</span>건
                </h2>
              </div>
              {data.primary.length > 0 && (
                <span className="cs-sa-resbar__sort">마감 가까운 순</span>
              )}
            </header>

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
                <div className="cs-notice-grid cs-sa-grid" data-after-note={officialPrimary === 0 ? 'true' : undefined}>
                  {data.primary.map((row, i) => (
                    <NoticeCard
                      key={row.property.id}
                      property={row.property}
                      candidate={row.candidate}
                      index={i}
                      depth
                    />
                  ))}
                </div>
              </>
            )}
          </section>

          {/* 조건을 벗어난 후보는 지우지 않되, 같은 층에 두지도 않는다.
              지면 톤을 한 단 내린 판 위에 올려 "참고"임을 배치로 말한다. */}
          {data.relaxed.length > 0 && (
            <section className="cs-nearby cs-sa-lower">
              <span className="cs-nearby__eyebrow">참고 후보 · {data.relaxed.length}건</span>
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
            <section className="cs-sa-cta">
              {hasNewNoticeAlert ? (
                <>
                  <span className="cs-sa-kicker">Alerts</span>
                  <h2 className="cs-sa-cta__t">이 조건으로 새 공고를 확인할게요</h2>
                  <p className="cs-sa-cta__d">알림 설정은 관심공고에서 언제든 해제할 수 있어요.</p>
                  <div className="cs-sa-cta__acts">
                    <Link href="/saved" className="cs-btn cs-btn--ghost">
                      관심공고 보기
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <span className="cs-sa-kicker">Alerts</span>
                  <h2 className="cs-sa-cta__t">새 공고 알림을 준비해둘까요?</h2>
                  <p className="cs-sa-cta__d">
                    동의하시면 {profile.regions.join(' · ')} 조건에 맞는 공고를 지금 한 통 보내드리고, 이후 새 공고가
                    열릴 때마다 이어서 알려드려요.
                  </p>
                  <div className="cs-sa-cta__acts">
                    <button
                      className="cs-btn cs-btn--primary"
                      onClick={() => {
                        gate.open({ kind: 'ALERT_NEW', propertyId: null })
                      }}
                    >
                      새 공고 알림 받기
                    </button>
                  </div>
                </>
              )}
            </section>
          )}

          <p className="cs-sa-foot">
            소득·자산·거주기간 등 공식 자격요건은 확인하지 않았습니다. 지원 전 반드시 공식 모집공고문을
            확인해 주세요.
          </p>
        </>
      )}
    </div>
  )
}
