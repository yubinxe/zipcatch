'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { Property } from '@/lib/crm/types'
import { ELIGIBILITY_CAUTION, type UrgencyInfo } from '@/lib/crm/services/scoring'
import NoticeCard from './NoticeCard'
import FilterRow, { type FilterOption } from './FilterRow'
import SampleOnlyNotice from './SampleOnlyNotice'
import Carousel from './home/Carousel'

interface NoticeRow {
  property: Property
  urgency: UrgencyInfo
}

export default function HomeNoticeStrip() {
  const [region, setRegion] = useState('전체')
  const [type, setType] = useState('전체')
  const [attempt, setAttempt] = useState(0)
  /** 어떤 조건의 결과인지 함께 담아, 로딩 여부를 파생값으로 계산한다 */
  const [result, setResult] = useState<{ key: string; rows: NoticeRow[]; error: string | null } | null>(null)
  // 선택지는 실제 데이터에서 온다. 고정 목록이면 없는 지역을 고르게 된다.
  const [regions, setRegions] = useState<FilterOption[]>([])
  const [types, setTypes] = useState<FilterOption[]>([])
  const [matched, setMatched] = useState(0)

  const key = `${region}|${type}|${attempt}`
  const loading = result?.key !== key
  const rows = result?.rows ?? []
  const error = result?.key === key ? result.error : null

  // 예시만 남았는지는 응답의 dataOrigin 으로 센다. 필터를 바꾸면 그대로 따라온다.
  const officialCount = rows.filter(r => r.property.dataOrigin === 'OFFICIAL').length
  const filterScope = [region === '전체' ? '' : region, type === '전체' ? '' : type]
    .filter(Boolean)
    .join(' · ')

  useEffect(() => {
    let alive = true
    // 옆으로 넘기는 띠라 한 번에 넉넉히 싣는다
    const params = new URLSearchParams({ limit: '12' })
    if (region !== '전체') params.set('region', region)
    if (type !== '전체') params.set('housingType', type)

    // 칩을 빠르게 연달아 누르면 앞의 요청은 쓸모가 없다. 기다리지 않고 거둔다
    const ctl = new AbortController()
    fetch(`/api/notices?${params}`, { cache: 'no-store', signal: ctl.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('불러오지 못했어요'))))
      .then((data: {
        notices: NoticeRow[]
        regions?: FilterOption[]
        housingTypes?: FilterOption[]
        matched?: number
      }) => {
        if (!alive) return
        setResult({ key, rows: data.notices, error: null })
        // 홈은 훑어보는 자리다. 선택지를 앞에서부터 6개만 보여준다.
        if (data.regions) setRegions(data.regions.slice(0, 6))
        if (data.housingTypes) setTypes(data.housingTypes.slice(0, 6))
        setMatched(data.matched ?? data.notices.length)
      })
      .catch((err: unknown) => {
        if (alive) {
          setResult({ key, rows: [], error: err instanceof Error ? err.message : '불러오지 못했어요' })
        }
      })
    return () => {
      alive = false
      ctl.abort()
    }
  }, [region, type, key])

  return (
    <section className="cs-wrap cs-section">
      {/* 홈 섹션은 01부터 번호가 이어진다 */}
      <div className="cs-sec-head">
        <span className="cs-sec-index" aria-hidden="true">
          01
        </span>
        <div className="cs-sec-head__body">
          <span className="cs-sec-eyebrow">Open Now</span>
          <h2 className="cs-section-title">지금 살펴볼 모집공고</h2>
          <p className="cs-sub" style={{ marginTop: 12 }}>
            분양을 먼저, 그 안에서 접수 마감이 가까운 순으로 보여드려요.
          </p>
        </div>
        <Link href="/notices" className="cs-btn cs-btn--text">
          모두 보기
        </Link>
      </div>

      <div style={{ margin: '24px 0 26px' }}>
        <FilterRow label="지역" options={regions} value={region} total={matched} onChange={setRegion} />
        <FilterRow label="유형" options={types} value={type} total={matched} onChange={setType} />
      </div>

      {/* 로딩과 0건은 다른 상태다 */}
      {loading ? (
        <div className="cs-carousel">
          <div className="cs-carousel__track">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="cs-skel" style={{ height: 320 }} />
            ))}
          </div>
        </div>
      ) : error ? (
        <div className="cs-error">
          <span>{error}</span>
          <button className="cs-btn cs-btn--sm cs-btn--ghost" onClick={() => setAttempt(a => a + 1)}>
            다시 시도
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="cs-empty">
          <div className="cs-empty__title">선택하신 조건의 모집공고가 없어요</div>
          <p className="cs-empty__desc">지역이나 유형을 바꿔서 다시 살펴보세요.</p>
        </div>
      ) : (
        <>
          {officialCount === 0 && (
            <SampleOnlyNotice
              scope={filterScope ? `${filterScope} 조건으로` : undefined}
              sampleCount={rows.length}
              actions={
                <Link href="/analyze" className="cs-btn cs-btn--ghost">
                  내 조건으로 찾아보기
                </Link>
              }
            />
          )}
          <div style={officialCount === 0 ? { marginTop: 26 } : undefined}>
          {/* 지역·유형을 바꾸면 새로 붙여 첫 장부터 다시 보인다 */}
          <Carousel key={`${region}|${type}`} label="지금 살펴볼 모집공고">
          {rows.map((row, i) => (
            <NoticeCard
              key={row.property.id}
              index={i}
              property={row.property}
              candidate={{
                propertyId: row.property.id,
                fit: { regionScore: 0, areaScore: null, housingTypeScore: 0, preferenceScore: 0 },
                // 조건 없이 둘러보는 화면이라 예산을 비교하지 않았다는 뜻이다
                budget: {
                  depositOver: 0,
                  rentOver: 0,
                  depositRoom: 0,
                  rentRoom: 0,
                  withinBudget: true,
                  unverified: [],
                },
                urgency: row.urgency,
                eligibility: 'UNKNOWN',
                confidence: 'PARTIAL' as const,
                reasons: [],
                cautions: [ELIGIBILITY_CAUTION],
                tier: 'PRIMARY',
                excludedBy: [],
              }}
              showReasons={false}
            />
          ))}
          </Carousel>
          </div>
        </>
      )}

      {officialCount > 0 && (
        <p className="cs-note" style={{ marginTop: 18 }}>
          공공데이터포털 청약홈·LH 청약플러스에서 모은 실제 모집공고입니다.
        </p>
      )}
    </section>
  )
}
