'use client'

import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, CardHead } from '@/components/ui'
import {
  Chip,
  Drawer,
  Empty,
  ErrorBox,
  KeyValues,
  PageHead,
  Person,
  ScoreBadge,
  Section,
  TableSkeleton,
} from './primitives'
import { shortDate, useSnapshot, won } from './useSnapshot'
import { STAGE_LABEL } from '@/lib/crm/types'

export default function CustomersView() {
  const { data, loading, error, reload } = useSnapshot()
  const params = useSearchParams()
  const [query, setQuery] = useState('')
  const [focusId, setFocusId] = useState<string | null>(params.get('focus'))

  const rows = useMemo(() => {
    if (!data) return []
    const appCount = new Map<string, number>()
    for (const a of data.applications) appCount.set(a.customerId, (appCount.get(a.customerId) ?? 0) + 1)
    const bestScore = new Map<string, number>()
    for (const m of data.matches) {
      const cur = bestScore.get(m.customerId) ?? 0
      if (m.preferenceScore > cur) bestScore.set(m.customerId, m.preferenceScore)
    }
    const q = query.trim()
    return data.customers
      .filter(c => !q || c.name.includes(q) || c.id.includes(q.toUpperCase()) || c.preferredRegions.some(r => r.includes(q)))
      .map(c => ({
        customer: c,
        applications: appCount.get(c.id) ?? 0,
        bestScore: bestScore.get(c.id) ?? null,
      }))
      .sort((a, b) => b.applications - a.applications || a.customer.id.localeCompare(b.customer.id))
  }, [data, query])

  const focus = data?.customers.find(c => c.id === focusId) ?? null
  const focusApps = data?.applications.filter(a => a.customerId === focusId) ?? []
  const focusMatches = data?.matches.filter(m => m.customerId === focusId).slice(0, 5) ?? []
  const propertyById = new Map((data?.properties ?? []).map(p => [p.id, p]))

  if (error) {
    return (
      <>
        <PageHead title="고객관리" />
        <ErrorBox message={error} onRetry={reload} />
      </>
    )
  }

  return (
    <>
      <PageHead
        title="고객관리"
        sub="연락처 관리가 아닙니다. 조건·자격·관심물건·지원이력·일정이 고객 단위로 누적되어 재상담 원가를 낮춥니다."
        right={
          data ? (
            <Chip tone="accent">
              재지원 {data.kpi.repeatApplicants}명 · 재지원률 {data.kpi.repeatRate}%
            </Chip>
          ) : undefined
        }
      />

      <Card>
        <CardHead
          title={`등록 고객 ${data?.customers.length ?? 0}명`}
          sub="지원 횟수 내림차순"
          right={
            <input
              className="an-input"
              style={{ width: 240, height: 38 }}
              placeholder="성명 · 고객번호 · 지역"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          }
        />

        {loading ? (
          <TableSkeleton rows={8} />
        ) : rows.length === 0 ? (
          <Empty title="검색 결과 없음">다른 성명 또는 지역으로 조회하십시오.</Empty>
        ) : (
          <div className="crm-table-wrap">
            <table className="crm-table">
              <thead>
                <tr>
                  <th>고객</th>
                  <th>가구</th>
                  <th>희망지역</th>
                  <th>대상유형</th>
                  <th className="num">예산(보증금/월)</th>
                  <th className="num">최소전용</th>
                  <th className="num">지원이력</th>
                  <th className="num">최고점</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map(({ customer, applications, bestScore }) => (
                  <tr key={customer.id} data-click="true" onClick={() => setFocusId(customer.id)}>
                    <td>
                      <Person name={customer.name} id={customer.id} />
                    </td>
                    <td className="muted">{customer.householdType} · {customer.age}세</td>
                    <td>{customer.preferredRegions.join(', ')}</td>
                    <td className="muted">{customer.preferredHousingTypes.join(', ')}</td>
                    <td className="num tnums">{won(customer.maxDeposit)} / {customer.maxMonthlyRent}만</td>
                    <td className="num tnums">{customer.minArea}㎡</td>
                    <td className="num">
                      {applications >= 2 ? <Chip tone="pos">{applications}회</Chip> : `${applications}회`}
                    </td>
                    <td className="num">{bestScore === null ? <span className="muted">—</span> : <ScoreBadge score={bestScore} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Drawer
        open={!!focus}
        onClose={() => setFocusId(null)}
        title={focus ? `${focus.name} (${focus.id})` : ''}
        subtitle={focus ? `${focus.householdType} · ${focus.age}세 · 소득 ${focus.incomeBand}` : ''}
      >
        {focus && (
          <>
            <Section title="등록 조건">
              <KeyValues
                items={[
                  { k: '희망지역', v: focus.preferredRegions.join(', ') },
                  { k: '대상유형', v: focus.preferredHousingTypes.join(', ') },
                  { k: '최대 보증금', v: `${won(focus.maxDeposit)}원` },
                  { k: '최대 월세', v: `${focus.maxMonthlyRent}만원` },
                  { k: '최소 전용면적', v: `${focus.minArea}㎡` },
                  { k: '희망 입주시기', v: focus.moveInPeriod },
                ]}
              />
            </Section>

            <Section title={`지원 이력 ${focusApps.length}회`}>
              {focusApps.length === 0 ? (
                <Empty title="지원 이력 없음" icon="calendar" />
              ) : (
                <div className="crm-table-wrap" style={{ margin: 0, padding: 0 }}>
                  <table className="crm-table">
                    <tbody>
                      {focusApps.map(a => {
                        const p = propertyById.get(a.propertyId)
                        return (
                          <tr key={a.id}>
                            <td>{p?.name ?? a.propertyId}</td>
                            <td className="num">
                              <Chip tone={a.stage === 'WON' || a.stage === 'CONTRACT' ? 'pos' : a.stage === 'LOST' ? 'default' : 'accent'}>
                                {STAGE_LABEL[a.stage]}
                              </Chip>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {focusApps.length >= 2 && (
                <div className="crm-note" style={{ marginTop: 12 }}>
                  재지원 고객입니다. 등록 조건과 구비서류 이력이 승계되어 차기 지원 준비 시간이 단축됩니다.
                </div>
              )}
            </Section>

            <Section title="현재 매칭 건">
              {focusMatches.length === 0 ? (
                <Empty title="매칭 건 없음" icon="spark">
                  종합현황에서 공실 이벤트 발생 시
                  <br />
                  본 고객 조건과 자동 대조됩니다.
                </Empty>
              ) : (
                <div className="crm-table-wrap" style={{ margin: 0, padding: 0 }}>
                  <table className="crm-table">
                    <tbody>
                      {focusMatches.map(m => {
                        const p = propertyById.get(m.propertyId)
                        return (
                          <tr key={m.id}>
                            <td>
                              {p?.name ?? m.propertyId}
                              <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>
                                {p ? `${p.region} · ${p.area}㎡ · 접수 ~${shortDate(p.applicationEnd)}` : ''}
                              </div>
                            </td>
                            <td className="num"><ScoreBadge score={m.preferenceScore} /></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </>
        )}
      </Drawer>
    </>
  )
}
