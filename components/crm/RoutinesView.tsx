'use client'

import { useEffect, useState } from 'react'
import { Card, CardHead } from '@/components/ui'
import { Chip, Empty, PageHead, Spinner } from './primitives'

interface Routine {
  id: string
  key: string
  name: string
  purpose: string
  instruction: string
  schedule_cron: string
  schedule_label: string
  enabled: boolean
  last_run_at: string | null
  next_run_at: string | null
}

interface Run {
  id: string
  routine_id: string
  routine_key: string
  trigger: 'SCHEDULE' | 'MANUAL'
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED'
  started_at: string
  duration_ms: number | null
  summary: string | null
  detail: Record<string, unknown>
}

interface Snapshot {
  routines: Routine[]
  runs: Run[]
  storage: 'supabase' | 'memory'
  scheduler: boolean
}

const STATUS: Record<Run['status'], { label: string; tone: 'pos' | 'hot' | 'warn' | 'default' }> = {
  SUCCESS: { label: '성공', tone: 'pos' },
  FAILED: { label: '실패', tone: 'hot' },
  SKIPPED: { label: '건너뜀', tone: 'warn' },
  RUNNING: { label: '실행 중', tone: 'default' },
}

function when(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const hours = Math.floor(diff / 3600000)
  const stamp = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
  if (diff < 0) return stamp
  if (hours < 1) return `${stamp} · 방금`
  if (hours < 24) return `${stamp} · ${hours}시간 전`
  return stamp
}

export default function RoutinesView() {
  const [data, setData] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [focus, setFocus] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let alive = true
    fetch('/api/admin/routines', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('루틴을 불러오지 못했습니다.'))))
      .then((json: Snapshot) => {
        if (!alive) return
        setData(json)
        setFocus(prev => prev ?? json.routines[0]?.key ?? null)
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : '오류'))
    return () => {
      alive = false
    }
  }, [nonce])

  const run = async (key: string) => {
    setBusy(key)
    setNotice(null)
    try {
      const res = await fetch(`/api/admin/routines/${key}/run`, { method: 'POST' })
      const json = await res.json()
      // 응답 코드가 아니라 본문의 실제 상태로 적는다 — 일부 출처 실패는 '부분 실패'
      setNotice(`${json.partial ? '부분 실패' : (STATUS[json.status as Run['status']]?.label ?? json.status)} — ${json.summary ?? json.error ?? res.status}`)
      setNonce(n => n + 1)
    } catch {
      setNotice('실행하지 못했습니다.')
    } finally {
      setBusy(null)
    }
  }

  const toggle = async (key: string, enabled: boolean) => {
    setBusy(key)
    try {
      await fetch(`/api/admin/routines/${key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      setNonce(n => n + 1)
    } finally {
      setBusy(null)
    }
  }

  if (error) return <div className="crm-note crm-note--hot">{error}</div>
  if (!data) {
    return (
      <>
        <PageHead title="루틴" sub="불러오는 중입니다." />
        <div className="crm-skel" style={{ height: 380 }} />
      </>
    )
  }

  const current = data.routines.find(r => r.key === focus) ?? data.routines[0]
  const runs = current ? data.runs.filter(r => r.routine_id === current.id) : []
  const recent = runs.slice(0, 3)
  const ok = recent.filter(r => r.status === 'SUCCESS').length

  return (
    <>
      <PageHead
        title="루틴"
        sub="사람이 매일 손으로 하던 확인을 고정된 시각에 대신 돌립니다. 판단은 대신하지 않습니다."
      />

      <div className="crm-filter-row" style={{ marginBottom: 16 }}>
        <Chip tone={data.storage === 'supabase' ? 'pos' : 'warn'} dot>
          이력 {data.storage === 'supabase' ? 'Supabase 보관' : '메모리 (재시작 시 소멸)'}
        </Chip>
        <Chip tone={data.scheduler ? 'pos' : 'warn'} dot>
          {data.scheduler ? '예약 실행 켜짐' : '예약 미설정 · 수동 실행만'}
        </Chip>
      </div>

      {notice && (
        <div className="crm-note crm-note--accent" style={{ marginBottom: 16 }}>
          {notice}
        </div>
      )}

      {/* 루틴 고르기 */}
      <div className="crm-filter-row" style={{ marginBottom: 20 }}>
        {data.routines.map(r => (
          <button
            key={r.key}
            className="crm-btn"
            data-active={r.key === current?.key}
            onClick={() => setFocus(r.key)}
          >
            {r.name}
          </button>
        ))}
      </div>

      {!current ? (
        <Empty title="등록된 루틴이 없습니다" />
      ) : (
        <>
          {/* 머리 — 상태 한 줄 */}
          <Card>
            <div className="rt-head">
              <div>
                <h2 className="rt-title">{current.name}</h2>
                <p className="rt-purpose">{current.purpose}</p>
              </div>
              <button
                className="crm-btn crm-btn--accent crm-btn--lg"
                disabled={busy !== null}
                onClick={() => run(current.key)}
              >
                {busy === current.key ? <Spinner /> : '지금 실행'}
              </button>
            </div>

            <div className="rt-state">
              <Chip tone={current.enabled ? 'pos' : 'default'} dot>
                {current.enabled ? '활성' : '꺼짐'}
              </Chip>
              <span className="rt-state__item">다음 실행 {when(current.next_run_at)}</span>
              <span className="rt-state__item">마지막 실행 {when(current.last_run_at)}</span>
              <span className="rt-state__item">
                최근 {recent.length}회 중 {ok}회 성공
              </span>
            </div>
          </Card>

          <div className="rt-grid">
            {/* 왼쪽 — 구성 + 지침 */}
            <div>
              <Card>
                <CardHead title="구성" />
                <dl className="rt-conf">
                  <div className="rt-conf__row">
                    <dt>활성화</dt>
                    <dd>
                      <button
                        className="rt-switch"
                        role="switch"
                        aria-checked={current.enabled}
                        disabled={busy !== null}
                        onClick={() => toggle(current.key, !current.enabled)}
                      >
                        <span className="rt-switch__knob" />
                        <span className="cs-sr">{current.enabled ? '켜짐' : '꺼짐'}</span>
                      </button>
                    </dd>
                  </div>
                  <div className="rt-conf__row">
                    <dt>트리거</dt>
                    <dd>
                      {current.schedule_label}
                      <code className="rt-cron">{current.schedule_cron}</code>
                    </dd>
                  </div>
                  <div className="rt-conf__row">
                    <dt>데이터원</dt>
                    <dd className="rt-tags">
                      <span className="rt-tag">청약홈</span>
                      <span className="rt-tag">LH 청약플러스</span>
                      <span className="rt-tag">Supabase</span>
                      <span className="rt-tag">이메일</span>
                    </dd>
                  </div>
                  <div className="rt-conf__row">
                    <dt>알림</dt>
                    <dd className="muted">
                      결과는 이 화면에만 남습니다. 외부 발송은 루틴 안에서 처리합니다.
                    </dd>
                  </div>
                </dl>
              </Card>

              <Card style={{ marginTop: 16 }}>
                <CardHead title="지침" sub="사람이 읽고 검수할 수 있는 규칙으로 적습니다" />
                <pre className="rt-instruction">{current.instruction}</pre>
              </Card>
            </div>

            {/* 오른쪽 — 실행 이력 */}
            <Card>
              <CardHead
                title="실행"
                sub="성공만 남기지 않습니다. 실패와 사유를 같은 자리에 적습니다"
                right={<Chip>{runs.length}회</Chip>}
                wrapRight
              />
              {runs.length === 0 ? (
                <Empty title="아직 실행 기록이 없습니다" icon="clock" />
              ) : (
                <ul className="rt-runs">
                  {runs.map(r => {
                    const s = STATUS[r.status]
                    return (
                      <li key={r.id} className="rt-run" data-status={r.status}>
                        <span className="rt-run__mark" aria-hidden="true" />
                        <div className="rt-run__body">
                          <div className="rt-run__top">
                            <span className="rt-run__name">{current.name}</span>
                            <Chip tone={s.tone}>{s.label}</Chip>
                          </div>
                          <div className="rt-run__meta">
                            {when(r.started_at)} · {r.trigger === 'MANUAL' ? '수동' : '예약됨'}
                            {r.duration_ms !== null && ` · ${(r.duration_ms / 1000).toFixed(1)}초`}
                          </div>
                          {r.summary && <p className="rt-run__summary">{r.summary}</p>}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  )
}
