'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardHead } from '@/components/ui'
import {
  Chip,
  Empty,
  ErrorBox,
  PageHead,
  Person,
  ScoreBadge,
  ScoreBars,
  Spinner,
  TableSkeleton,
} from './primitives'
import { shortDate, useSnapshot, won } from './useSnapshot'
import { createApplicationReq } from '@/lib/crm/client'

export default function MatchesView() {
  const { data, loading, error, reload } = useSnapshot()
  const [openId, setOpenId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [minScore, setMinScore] = useState(70)

  const customerById = useMemo(() => new Map((data?.customers ?? []).map(c => [c.id, c])), [data])
  const propertyById = useMemo(() => new Map((data?.properties ?? []).map(p => [p.id, p])), [data])
  const appliedKeys = useMemo(
    () => new Set((data?.applications ?? []).map(a => `${a.customerId}|${a.propertyId}`)),
    [data],
  )

  const rows = useMemo(
    () => (data?.matches ?? []).filter(m => m.preferenceScore >= minScore),
    [data, minScore],
  )

  const apply = async (customerId: string, propertyId: string, key: string) => {
    setBusyId(key)
    setActionError(null)
    try {
      await createApplicationReq(customerId, propertyId)
      await reload()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '지원 등록에 실패했습니다.')
    } finally {
      setBusyId(null)
    }
  }

  if (error) {
    return (
      <>
        <PageHead title="매칭현황" />
        <ErrorBox message={error} onRetry={reload} />
      </>
    )
  }

  return (
    <>
      <PageHead
        title="매칭현황"
        sub="공실·신규공고 발생 시 자동 실행된 대조 결과입니다. 점수는 당첨확률이 아닌 지원 우선순위 지표입니다."
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            {[70, 80, 90].map(s => (
              <button
                key={s}
                type="button"
                className="an-toggle"
                data-on={minScore === s ? 'true' : 'false'}
                onClick={() => setMinScore(s)}
              >
                {s}점 이상
              </button>
            ))}
          </div>
        }
      />

      {actionError && (
        <div style={{ marginBottom: 16 }}>
          <ErrorBox message={actionError} />
        </div>
      )}

      <Card>
        <CardHead title={`매칭 ${rows.length}건`} sub="지원 우선순위 점수 내림차순" />

        {loading ? (
          <TableSkeleton rows={8} />
        ) : rows.length === 0 ? (
          <Empty title="매칭 이력 없음" icon="spark">
            <Link href="/dashboard" className="link-ink">
              종합현황
            </Link>
            에서 <strong>공실 이벤트 발생</strong> 실행 시
            <br />
            적격 고객이 우선순위순으로 적재됩니다.
          </Empty>
        ) : (
          <div className="crm-table-wrap">
            <table className="crm-table">
              <thead>
                <tr>
                  <th className="num">순위</th>
                  <th>고객</th>
                  <th>주택</th>
                  <th>산출 근거</th>
                  <th className="num">우선순위</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((m, i) => {
                  const c = customerById.get(m.customerId)
                  const p = propertyById.get(m.propertyId)
                  const key = `${m.customerId}|${m.propertyId}`
                  const already = appliedKeys.has(key)
                  return (
                    <tr key={m.id}>
                      <td className="num muted">{i + 1}</td>
                      <td>
                        <Person name={c?.name ?? m.customerId} id={m.customerId} />
                      </td>
                      <td style={{ minWidth: 170 }}>
                        <div style={{ fontWeight: 550 }}>{p?.name ?? m.propertyId}</div>
                        <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>
                          {p
                            ? [
                                p.region,
                                p.area === null ? null : `${p.area}㎡`,
                                p.deposit === null && p.monthlyRent === null
                                  ? '임대조건 미공개'
                                  : `${p.deposit === null ? '-' : won(p.deposit)}/${p.monthlyRent === null ? '-' : p.monthlyRent + '만'}`,
                                `~${shortDate(p.applicationEnd)}`,
                              ]
                                .filter(Boolean)
                                .join(' · ')
                            : ''}
                        </div>
                      </td>
                      <td style={{ maxWidth: 420, fontSize: 14, lineHeight: 1.55 }}>
                        {m.reasons.join(' · ')}
                        {openId === m.id && (
                          <div style={{ marginTop: 12 }}>
                            <ScoreBars breakdown={m} />
                          </div>
                        )}
                      </td>
                      <td className="num"><ScoreBadge score={m.preferenceScore} /></td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="crm-btn crm-btn--sm"
                            onClick={() => setOpenId(openId === m.id ? null : m.id)}
                          >
                            {openId === m.id ? '접기' : '근거'}
                          </button>
                          {already ? (
                            <Chip tone="pos">등록완료</Chip>
                          ) : (
                            <button
                              type="button"
                              className="crm-btn crm-btn--sm crm-btn--primary"
                              onClick={() => apply(m.customerId, m.propertyId, key)}
                              disabled={busyId === key}
                            >
                              {busyId === key ? <Spinner /> : '지원 등록'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}
