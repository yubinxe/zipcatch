'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardHead } from '@/components/ui'
import SupplyPanel from './SupplyPanel'
import { Chip, DemoFlag, Empty, ErrorBox, PageHead, Person, Spinner, Stat, TableSkeleton } from './primitives'

interface Snapshot {
  storage: 'supabase' | 'memory'
  integrations: { applyhome: boolean; email: boolean }
  config: { notifyThreshold: number }
  metrics: Record<string, number | null>
  events: {
    id: string
    event_type: string
    previous_value: string | null
    current_value: string | null
    occurred_at: string
    is_demo: boolean
    opportunityTitle: string | null
  }[]
  behaviors: {
    id: string
    event_type: string
    created_at: string
    customerName: string | null
    opportunityTitle: string | null
  }[]
  topMatches: {
    id: string
    opportunity_score: number
    reason: string
    within_budget: boolean
    customerName: string | null
    opportunityTitle: string | null
  }[]
  hotLeads: { id: string; name: string | null; leadScore: number; stage: string; stageLabel: string }[]
  latestNotification: { id: string; status: string; message: string; detail: string | null } | null
}

const EVENT_LABEL: Record<string, string> = {
  NEW_ANNOUNCEMENT: '신규 공고',
  NEW_PROPERTY: '신규 물건',
  VACANCY_CREATED: '공실 발생',
  VACANCY_INCREASED: '공실 증가',
  VACANCY_DECREASED: '공실 감소',
  VACANCY_CLOSED: '공실 마감',
  APPLICATION_OPEN: '접수 시작',
  DEADLINE_APPROACHING: '마감 임박',
  PRICE_CHANGED: '금액 변경',
  STATUS_CHANGED: '상태 변경',
}

const BEHAVIOR_LABEL: Record<string, string> = {
  NOTIFICATION_SENT: '알림 생성',
  NOTIFICATION_CLICKED: '알림 클릭',
  DETAIL_VIEWED: '상세 조회',
  FAVORITED: '관심 등록',
  UNFAVORITED: '관심 해제',
  APPLICATION_STARTED: '지원 시작',
  APPLICATION_SUBMITTED: '지원 제출',
  INQUIRY_CREATED: '문의 접수',
  RETURN_VISIT: '재방문',
  SEARCH_COMPLETED: '조건 재검색',
  PREFERENCE_SAVED: '조건 저장',
}

function clock(iso: string) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function CrmDashboard() {
  const [data, setData] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [flash, setFlash] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/crm', { cache: 'no-store' })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? '불러오지 못했습니다.')
      setData(await res.json())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let alive = true
    fetch('/api/admin/crm', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('불러오지 못했습니다.'))))
      .then((d: Snapshot) => alive && setData(d))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : '불러오지 못했습니다.'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  const run = async (key: string, url: string, describe: (json: Record<string, unknown>) => string) => {
    setBusy(key)
    setNotice(null)
    try {
      const res = await fetch(url, { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as { error?: string }).error ?? '실패했습니다.')
      setNotice(describe(json))
      setFlash(true)
      setTimeout(() => setFlash(false), 1200)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '실패했습니다.')
    } finally {
      setBusy(null)
    }
  }

  if (error && !data) {
    return (
      <>
        <PageHead title="CRM 종합현황" />
        <ErrorBox message={error} onRetry={load} />
      </>
    )
  }

  if (loading || !data) {
    return (
      <>
        <PageHead title="CRM 종합현황" sub="불러오는 중입니다." />
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

  const m = data.metrics

  return (
    <>
      <PageHead
        title="CRM 종합현황"
        sub="탐지 → 매칭 → 알림 → 반응 → 전환까지 한 화면에서 확인합니다."
        right={
          <>
            <button
              className="crm-btn"
              disabled={busy !== null}
              onClick={() =>
                run('seed', '/api/admin/seed', j => `시연 데이터 생성 — 고객 ${j.customers}명 · 기회 ${j.opportunities}건`)
              }
            >
              {busy === 'seed' ? <Spinner /> : '시연 데이터 생성'}
            </button>
            <button
              className="crm-btn"
              disabled={busy !== null}
              onClick={() =>
                run('sync', '/api/admin/sync', j => {
                  // 출처별로 따로 보고한다. 한쪽이 실패해도 다른 쪽 결과를 숨기지 않는다.
                  const sources = (j.sources ?? []) as {
                    label: string
                    ok: boolean
                    reason: string | null
                    inserted: number
                    updated: number
                  }[]
                  if (!sources.length) return `공고 동기화 — 신규 ${j.inserted} · 갱신 ${j.updated}`
                  return sources
                    .map(s =>
                      s.ok
                        ? `${s.label} 신규 ${s.inserted} · 갱신 ${s.updated}`
                        : `${s.label} 실패: ${s.reason}`,
                    )
                    .join(' / ')
                })
              }
            >
              {busy === 'sync' ? <Spinner /> : '공고 동기화 (청약홈 · LH)'}
            </button>
            <button
              className="crm-btn crm-btn--accent crm-btn--lg"
              disabled={busy !== null}
              onClick={() =>
                run('event', '/api/admin/demo-event', j => {
                  const o = j.opportunity as { title?: string } | undefined
                  return `${o?.title ?? '공고'} 공실 발생 — 매칭 ${j.matchCount}명 · 알림 ${
                    (j.notified as unknown[])?.length ?? 0
                  }건`
                })
              }
            >
              {busy === 'event' ? <Spinner /> : '데모 신규 공실 발생'}
            </button>
          </>
        }
      />

      <div className="crm-filter-row" style={{ marginBottom: 16 }}>
        <Chip tone={data.storage === 'supabase' ? 'pos' : 'warn'} dot>
          저장소 {data.storage === 'supabase' ? 'Supabase' : '메모리 (재시작 시 소멸)'}
        </Chip>
        <Chip tone={data.integrations.applyhome ? 'pos' : 'default'} dot>
          청약홈 {data.integrations.applyhome ? '연동됨' : 'API 키 없음'}
        </Chip>
        <Chip tone={data.integrations.email ? 'pos' : 'default'} dot>
          이메일 발송 {data.integrations.email ? '연동됨' : '키 없음 · 초안만 저장'}
        </Chip>
        <Chip>알림 임계치 {data.config.notifyThreshold}점</Chip>
      </div>

      {notice && (
        <div className="crm-note crm-note--accent" style={{ marginBottom: 16 }}>
          {notice}
        </div>
      )}
      {error && (
        <div style={{ marginBottom: 16 }}>
          <ErrorBox message={error} onRetry={load} />
        </div>
      )}

      {/* 팔 물건이 먼저다. 공고 수집이 깨지면 고객 지표는 한참 뒤에야 떨어지고,
          그때는 이미 사람들이 빈 화면을 본 뒤다. */}
      <SupplyPanel />

      <div className="crm-stat-grid" style={{ marginTop: 'var(--s6, 32px)' }}>
        <Stat label="등록 고객" value={m.customers ?? 0} unit="명" hint="조건이 저장된 고객" />
        <Stat
          label="관리 기회"
          value={m.opportunities ?? 0}
          unit="건"
          hint={`실데이터 ${m.realOpportunities ?? 0} · 예시 ${m.demoOpportunities ?? 0}`}
        />
        <Stat label="오늘 매칭" value={m.matchesToday ?? 0} unit="건" live flash={flash} />
        <Stat
          label="알림 발송"
          value={m.notificationsSent ?? 0}
          unit="건"
          live
          flash={flash}
          hint={`초안 ${m.notificationsPreview ?? 0}건은 발송에서 제외`}
        />
        <Stat
          label="알림 클릭률"
          value={m.clickRate === null ? '—' : `${m.clickRate}%`}
          hint={`클릭 ${m.notificationsClicked ?? 0}건`}
        />
        <Stat label="Hot Lead" value={m.hotLeads ?? 0} unit="명" hot={(m.hotLeads ?? 0) > 0} />
      </div>

      <div className="crm-stat-grid" style={{ marginBottom: 'var(--s5)' }}>
        <Stat label="관심 등록" value={m.favorites ?? 0} unit="건" />
        <Stat label="진행중 지원" value={m.activeApplications ?? 0} unit="건" />
        <Stat label="문의·상담" value={m.inquiries ?? 0} unit="건" />
        <Stat label="오늘 신규 기회" value={m.newOpportunitiesToday ?? 0} unit="건" />
      </div>

      <div className="crm-2col">
        <Card>
          <CardHead
            title="이벤트 스트림"
            sub="탐지 → 매칭 → 알림 → 반응 → 전환"
            right={<DemoFlag label="예시 이벤트 포함" />}
            wrapRight
          />
          {data.events.length === 0 && data.behaviors.length === 0 ? (
            <Empty title="아직 기록이 없습니다" icon="spark">
              <strong>데모 신규 공실 발생</strong>을 누르면 전 과정이 기록됩니다.
            </Empty>
          ) : (
            <div className="crm-stream">
              {data.behaviors.slice(0, 12).map(b => (
                <div key={b.id} className="crm-stream__row">
                  <span className="crm-stream__time">{clock(b.created_at)}</span>
                  <span className="crm-stream__rail">
                    <span className="crm-stream__dot" data-kind="MATCH" />
                  </span>
                  <span className="crm-stream__msg">
                    <span className="crm-stream__kind">{BEHAVIOR_LABEL[b.event_type] ?? b.event_type}</span>
                    {b.customerName ?? '방문자'}
                    {b.opportunityTitle ? ` · ${b.opportunityTitle}` : ''}
                  </span>
                </div>
              ))}
              {data.events.map(e => (
                <div key={e.id} className="crm-stream__row">
                  <span className="crm-stream__time">{clock(e.occurred_at)}</span>
                  <span className="crm-stream__rail">
                    <span className="crm-stream__dot" data-kind="EVENT" />
                  </span>
                  <span className="crm-stream__msg">
                    <span className="crm-stream__kind">{EVENT_LABEL[e.event_type] ?? e.event_type}</span>
                    {e.opportunityTitle ?? '공고'}
                    {e.previous_value !== null && ` · ${e.previous_value} → ${e.current_value}`}
                    {e.is_demo && ' (예시)'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="crm-stack">
          <Card>
            <CardHead title="지금 뜨거운 고객" sub="Lead Score 상위" />
            {data.hotLeads.length === 0 ? (
              <Empty title="아직 Hot Lead 가 없습니다" icon="spark" />
            ) : (
              <div className="crm-table-wrap" style={{ margin: 0, padding: 0 }}>
                <table className="crm-table">
                  <tbody>
                    {data.hotLeads.map(l => (
                      <tr key={l.id}>
                        <td>
                          <Person name={l.name ?? '고객'} id={l.id.slice(0, 8)} />
                        </td>
                        <td className="num">
                          <Chip tone="hot">{l.stageLabel}</Chip>
                        </td>
                        <td className="num tnums" style={{ fontWeight: 700 }}>
                          {l.leadScore}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <CardHead
              title="최근 알림"
              sub={
                data.integrations.email
                  ? '이메일 발송 연동됨'
                  : '이메일 발송 키가 없어 보내지 않고 원문만 보관합니다'
              }
              right={
                data.latestNotification ? (
                  <Chip tone={data.latestNotification.status === 'SENT' ? 'pos' : 'warn'} dot>
                    {data.latestNotification.status === 'SENT' ? '발송' : '초안'}
                  </Chip>
                ) : undefined
              }
              wrapRight
            />
            {!data.latestNotification ? (
              <Empty title="생성된 알림이 없습니다" icon="bell" />
            ) : (
              <>
                <pre
                  style={{
                    margin: 0,
                    padding: 16,
                    background: 'var(--surface-2)',
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--r-sm)',
                    fontFamily: 'inherit',
                    fontSize: 14,
                    lineHeight: 1.65,
                    whiteSpace: 'pre-wrap',
                    maxHeight: 320,
                    overflowY: 'auto',
                  }}
                >
                  {data.latestNotification.message}
                </pre>
                {data.latestNotification.detail && (
                  <div className="crm-note" style={{ marginTop: 12 }}>
                    {data.latestNotification.detail}
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      </div>

      <div style={{ marginTop: 'var(--s5)' }}>
        <Card>
          <CardHead title="최근 매칭" sub="Opportunity Score 순 · 당첨확률이 아닙니다" />
          {data.topMatches.length === 0 ? (
            <Empty title="매칭 기록이 없습니다" icon="spark" />
          ) : (
            <div className="crm-table-wrap">
              <table className="crm-table">
                <thead>
                  <tr>
                    <th>고객</th>
                    <th>기회</th>
                    <th>추천 이유</th>
                    <th className="num">적합도</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topMatches.map(mt => (
                    <tr key={mt.id}>
                      <td>{mt.customerName ?? '—'}</td>
                      <td className="muted">{mt.opportunityTitle ?? '—'}</td>
                      <td style={{ maxWidth: 460, fontSize: 14, lineHeight: 1.55 }}>{mt.reason}</td>
                      <td className="num">
                        <span className="score-badge" data-tier={mt.opportunity_score >= 85 ? 'high' : 'mid'}>
                          {mt.opportunity_score}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
