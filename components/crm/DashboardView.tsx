'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { Card, CardHead } from '@/components/ui'
import {
  Chip,
  DemoFlag,
  Drawer,
  Empty,
  ErrorBox,
  KeyValues,
  PageHead,
  Person,
  ScoreBadge,
  ScoreBars,
  Section,
  Spinner,
  Stat,
  TableSkeleton,
} from './primitives'
import { clockTime, ddayLabel, shortDate, useSnapshot, won } from './useSnapshot'
import { resetDemo, triggerVacancy, type TriggerResponse } from '@/lib/crm/client'

/** Event Stream 라벨은 한국어 우선 */
const KIND_LABEL: Record<string, string> = {
  EVENT: '공실감지',
  MATCH: '대상추출',
  SCORE: '우선순위',
  NOTIFICATION: '통보',
  APPLICATION: '지원등록',
  TASK: '일정편성',
  SYSTEM: '시스템',
}

const GUIDE_STEPS = [
  {
    name: '공실 발생',
    desc: '관리 물건 중 1건에 공실이 발생한 상황을 생성합니다.',
  },
  {
    name: '대상 고객 추출',
    desc: '등록 고객 100명의 조건과 전수 대조하여 적격 고객을 선별합니다.',
  },
  {
    name: '통보 및 일정 편성',
    desc: '우선순위 상위 고객 대상 알림과 지원 절차 일정을 자동 생성합니다.',
  },
]

export default function DashboardView() {
  const { data, loading, error, reload } = useSnapshot()
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [result, setResult] = useState<TriggerResponse | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(true)

  const onTrigger = useCallback(async () => {
    setBusy(true)
    setActionError(null)
    try {
      const res = await triggerVacancy()
      setResult(res)
      setDrawerOpen(true)
      setFlash(true)
      setTimeout(() => setFlash(false), 1300)
      await reload()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '이벤트 처리에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }, [reload])

  const onReset = useCallback(async () => {
    setBusy(true)
    setActionError(null)
    try {
      await resetDemo()
      setResult(null)
      await reload()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '초기화에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }, [reload])

  if (error) {
    return (
      <>
        <PageHead title="종합현황" />
        <ErrorBox message={error} onRetry={reload} />
      </>
    )
  }

  if (loading || !data) {
    return (
      <>
        <PageHead title="종합현황" sub="데이터를 불러오는 중입니다." />
        <div className="crm-stat-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="crm-skel" style={{ height: 108 }} />
          ))}
        </div>
        <Card>
          <TableSkeleton />
        </Card>
      </>
    )
  }

  const { kpi, funnel, activity, upcomingTasks, notifications, notificationAdapter } = data
  const customerById = new Map(data.customers.map(c => [c.id, c]))
  const latestNotification = notifications[0]
  const funnelMax = Math.max(...funnel.map(f => f.value), 1)
  const hasRun = activity.length > 1

  return (
    <>
      <PageHead
        title="종합현황"
        sub="공실 발생 시점부터 대상 추출·통보·지원 절차 편성까지 전 과정을 단일 화면에서 관제합니다."
        right={
          <>
            <button className="crm-btn" onClick={onReset} disabled={busy}>
              초기화
            </button>
            <button className="crm-btn crm-btn--accent crm-btn--lg" onClick={onTrigger} disabled={busy}>
              {busy ? (
                <>
                  <Spinner />
                  처리 중
                </>
              ) : (
                <>
                  공실 이벤트 발생
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </>
              )}
            </button>
          </>
        }
      />

      {/* 처음 보는 사람에게 버튼이 무슨 일을 하는지 먼저 알려준다 */}
      {guideOpen && !hasRun && (
        <div className="crm-guide">
          <div className="crm-guide__head">
            <div className="crm-guide__title">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
시연 안내 &mdash; 우측 상단 <strong>공실 이벤트 발생</strong> 실행 시 아래 절차가 순차 처리됩니다
            </div>
            <button className="crm-guide__close" onClick={() => setGuideOpen(false)}>
              닫기
            </button>
          </div>
          <div className="crm-guide__steps">
            {GUIDE_STEPS.map((s, i) => (
              <div key={s.name} className="crm-guide__step">
                <span className="crm-guide__num">{i + 1}</span>
                <div>
                  <div className="crm-guide__name">{s.name}</div>
                  <div className="crm-guide__desc">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {actionError && (
        <div style={{ marginBottom: 16 }}>
          <ErrorBox message={actionError} onRetry={onTrigger} />
        </div>
      )}

      <div className="crm-stat-grid">
        <Stat label="등록 고객" value={kpi.customers} unit="명" hint="조건 등록 완료" />
        <Stat label="관리 물건" value={kpi.properties} unit="건" hint="공고·공실 감시 대상" />
        <Stat
          label="현재 공실"
          value={kpi.currentVacancy}
          unit="건"
          hot={kpi.currentVacancy > 0}
          flash={flash}
          hint="즉시 지원 가능"
        />
        <Stat
          label="금일 신규"
          value={kpi.newVacancyToday}
          unit="건"
          live
          flash={flash}
          hint="금일 감지 이벤트"
        />
        <Stat
          label="추출 대상"
          value={kpi.matchedCustomers}
          unit="명"
          live
          flash={flash}
          hint="우선순위 70점 이상"
        />
        <Stat
          label="지원 진행"
          value={kpi.activeApplications}
          unit="건"
          hint={`재지원 ${kpi.repeatApplicants}명 · ${kpi.repeatRate}%`}
        />
      </div>

      <div className="crm-2col">
        <Card>
          <CardHead
            title="처리 로그"
            sub="공실감지 → 대상추출 → 우선순위 → 통보 → 지원등록 → 일정편성"
            right={<DemoFlag />}
            wrapRight
          />
          {activity.length === 0 ? (
            <Empty title="처리 이력 없음" icon="spark">
              <strong>공실 이벤트 발생</strong> 실행 시
              <br />
              처리 절차가 순차적으로 기록됩니다.
            </Empty>
          ) : (
            <div className="crm-stream">
              {activity.map(a => (
                <div key={a.id} className="crm-stream__row">
                  <span className="crm-stream__time">{clockTime(a.at)}</span>
                  <span className="crm-stream__rail">
                    <span className="crm-stream__dot" data-kind={a.kind} />
                  </span>
                  <span className="crm-stream__msg">
                    <span className="crm-stream__kind">{KIND_LABEL[a.kind] ?? a.kind}</span>
                    {a.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="crm-stack">
          <Card>
            <CardHead title="전환 퍼널" sub="핵심 지표 : 2회 이상 재지원률" />
            <div className="crm-funnel">
              {funnel.map(step => (
                <div key={step.key} className="crm-funnel__row" title={step.hint}>
                  <span className="crm-funnel__label">{step.label}</span>
                  <span className="crm-funnel__track">
                    <span
                      className="crm-funnel__fill"
                      data-star={step.key === 'repeat' ? 'true' : 'false'}
                      style={{ width: `${Math.max(3, (step.value / funnelMax) * 100)}%` }}
                    />
                  </span>
                  <span className="crm-funnel__val">{step.value}</span>
                </div>
              ))}
            </div>
            <div className="crm-note" style={{ marginTop: 16 }}>
재지원률 <strong>{kpi.repeatRate}%</strong> — 등록 조건과 구비서류 이력이 유지되므로
              2회차부터 조건 재확인 및 공고 탐색 절차가 생략됩니다.
            </div>
          </Card>

          <Card>
            <CardHead
              title="통보 내역"
              sub={notificationAdapter.label}
              right={
                latestNotification ? (
                  <Chip tone={latestNotification.status === 'TEST_SENT' ? 'warn' : 'default'} dot>
                    {latestNotification.status === 'TEST_SENT' ? '운영자 테스트 전송' : '초안 · 미발송'}
                  </Chip>
                ) : undefined
              }
              wrapRight
            />
            {!latestNotification ? (
              <Empty title="통보 이력 없음" icon="bell">
                공실 발생 시 우선순위 상위 고객 대상
                <br />
                알림 원문이 자동 생성됩니다.
              </Empty>
            ) : (
              <>
                <div className="kakao-head">
                  <Chip tone="accent">
                    수신 : {customerById.get(latestNotification.customerId)?.name ?? latestNotification.customerId}
                  </Chip>
                  <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>
                    {clockTime(latestNotification.createdAt)}
                  </span>
                </div>
                <div className="kakao-phone">
                  <div className="kakao-sender">
                    <span className="kakao-avatar">🏠</span>
                    집캐치
                  </div>
                  <div className="kakao-bubble">{latestNotification.body}</div>
                </div>
                {latestNotification.detail && (
                  <div className="crm-note" style={{ marginTop: 12 }}>
                    {latestNotification.detail}
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      </div>

      <div style={{ marginTop: 'var(--s5)' }}>
        <Card>
          <CardHead
            title="마감 임박 일정"
            sub="지원 건별 자동 편성 항목"
            right={
              <Link href="/applications" className="crm-btn crm-btn--sm">
                전체 보기
              </Link>
            }
            wrapRight
          />
          {upcomingTasks.length === 0 ? (
            <Empty title="예정 일정 없음" icon="calendar" />
          ) : (
            <div className="crm-table-wrap">
              <table className="crm-table">
                <thead>
                  <tr>
                    <th>고객</th>
                    <th>물건</th>
                    <th>처리 항목</th>
                    <th>마감일</th>
                    <th className="num">잔여</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingTasks.map(t => (
                    <tr key={t.id}>
                      <td>
                        <Person name={t.customerName} id={t.customerId} />
                      </td>
                      <td className="muted">{t.propertyName}</td>
                      <td>{t.title}</td>
                      <td className="muted tnums">{t.dueDate ?? '날짜 미정'}</td>
                      <td className="num">
                        {t.dueDate === null ? (
                          <Chip>일정 미정</Chip>
                        ) : (
                          <Chip
                            tone={
                              t.dday !== null && t.dday < 0
                                ? 'default'
                                : t.dday !== null && t.dday <= 3
                                  ? 'hot'
                                  : t.dday !== null && t.dday <= 7
                                    ? 'warn'
                                    : 'default'
                            }
                          >
                            {ddayLabel(t.dday)}
                          </Chip>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Drawer
        open={drawerOpen && !!result}
        onClose={() => setDrawerOpen(false)}
        title={result ? `공실 발생 — ${result.property.name}` : ''}
        subtitle={
          result
            ? `${result.property.id} · 공실 ${result.event.previousVacancy}건 → ${result.event.currentVacancy}건`
            : ''
        }
      >
        {result && (
          <>
            <div className="crm-chip-row">
              <Chip tone="hot" dot>
                신규 공실
              </Chip>
              <Chip>{result.property.housingType}</Chip>
              <Chip>{result.property.region}</Chip>
              <DemoFlag label="시연용 합성 이벤트" />
            </div>

            <KeyValues
              items={[
                { k: '전용면적', v: result.property.area === null ? '공고 미공개' : `${result.property.area}㎡` },
                { k: '공급세대', v: `${result.property.supplyCount}세대` },
                { k: '보증금', v: result.property.deposit === null ? '공고 미공개' : `${won(result.property.deposit)}원` },
                { k: '월 임대료', v: result.property.monthlyRent === null ? '공고 미공개' : `${result.property.monthlyRent}만원` },
                {
                  k: '접수 기간',
                  v: `${shortDate(result.property.applicationStart)} ~ ${shortDate(result.property.applicationEnd)}`,
                },
                { k: '결과 발표', v: result.property.resultDate ?? '미정' },
              ]}
            />

            <Section title={`적격 고객 ${result.matches.length}명 추출`}>
              {result.matches.length === 0 ? (
                <Empty title="적격 고객 없음" />
              ) : (
                <div className="crm-table-wrap" style={{ margin: 0, padding: 0 }}>
                  <table className="crm-table">
                    <thead>
                      <tr>
                        <th>고객</th>
                        <th>희망지역</th>
                        <th className="num">우선순위</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.matches.slice(0, 8).map(m => {
                        const c = customerById.get(m.customerId)
                        return (
                          <tr key={m.id}>
                            <td>
                              <Person name={c?.name ?? m.customerId} id={m.customerId} />
                            </td>
                            <td className="muted">{c?.preferredRegions.join(', ') ?? '-'}</td>
                            <td className="num">
                              <ScoreBadge score={m.preferenceScore} />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {result.matches.length > 8 && (
                    <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: '12px 0 0' }}>
                      외 {result.matches.length - 8}명 ·{' '}
                      <Link href="/matches" className="link-ink">
                        매칭현황에서 전체 조회
                      </Link>
                    </p>
                  )}
                </div>
              )}
            </Section>

            {result.topCustomer && result.matches[0] && (
              <Section title={`1순위 대상 · ${result.topCustomer.name} (${result.topCustomer.id})`}>
                <ScoreBars breakdown={result.matches[0]} />
                <div className="crm-note crm-note--accent" style={{ marginTop: 12 }}>
                  {result.matches[0].reasons.join(' · ')}
                </div>
              </Section>
            )}

            {result.notification && (
              <Section
                title="생성된 통보 원문"
                right={
                  <Chip tone={result.notification.status === 'TEST_SENT' ? 'warn' : 'default'} dot>
                    {result.notification.status === 'TEST_SENT' ? '운영자 테스트 전송' : '초안 · 미발송'}
                  </Chip>
                }
              >
                <div className="kakao-phone">
                  <div className="kakao-sender">
                    <span className="kakao-avatar">🏠</span>
                    집캐치
                  </div>
                  <div className="kakao-bubble">{result.notification.body}</div>
                </div>
                {result.notification.detail && (
                  <div className="crm-note" style={{ marginTop: 10 }}>
                    {result.notification.detail}
                  </div>
                )}
              </Section>
            )}

            <div className="crm-note" style={{ marginTop: 4 }}>
              이벤트는 후보와 알림 초안까지만 만듭니다. 실제 지원은 고객이 직접 선택할 때만 생성됩니다.
            </div>

            <div className="crm-filter-row">
              <Link href="/matches" className="crm-btn crm-btn--sm">
                매칭현황
              </Link>
              <Link href="/applications" className="crm-btn crm-btn--sm">
                지원 관리
              </Link>
              {result.topCustomer && (
                <Link href={`/customers?focus=${result.topCustomer.id}`} className="crm-btn crm-btn--sm">
                  고객 상세
                </Link>
              )}
            </div>
          </>
        )}
      </Drawer>
    </>
  )
}
