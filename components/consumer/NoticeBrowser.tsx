'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ELIGIBILITY_CAUTION, type UrgencyInfo } from '@/lib/crm/services/scoring'
import type { Property } from '@/lib/crm/types'
import NoticeCard from './NoticeCard'
import FilterRow, { type FilterOption } from './FilterRow'
import NoticeMap from './NoticeMap'
import SampleOnlyNotice from './SampleOnlyNotice'

interface Row {
  property: Property
  urgency: UrgencyInfo
}

export default function NoticeBrowser() {
  const [region, setRegion] = useState('전체')
  const [type, setType] = useState('전체')
  const [nonce, setNonce] = useState(0)
  const [result, setResult] = useState<{ key: string; rows: Row[]; error: string | null } | null>(null)
  // 칩 목록은 응답에서 온다. 고정 목록을 두면 실제 공고 지역·유형을 고를 수 없다.
  const [types, setTypes] = useState<FilterOption[]>([])
  const [regions, setRegions] = useState<FilterOption[]>([])
  const [matched, setMatched] = useState(0)

  const key = `${region}|${type}|${nonce}`
  const loading = result?.key !== key
  const rows = result?.rows ?? []
  const error = result?.key === key ? result.error : null

  // 목록에 실제 공고가 한 건도 없으면 예시만 남은 것이다. 응답의 dataOrigin 을
  // 그대로 세므로, 필터를 바꿀 때마다 별도 상태 없이 따라온다.
  const officialCount = rows.filter(r => r.property.dataOrigin === 'OFFICIAL').length
  const filterScope = [region === '전체' ? '' : region, type === '전체' ? '' : type]
    .filter(Boolean)
    .join(' · ')

  useEffect(() => {
    let alive = true
    const params = new URLSearchParams({ limit: '30' })
    if (region !== '전체') params.set('region', region)
    if (type !== '전체') params.set('housingType', type)

    fetch(`/api/notices?${params}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('공고를 불러오지 못했어요.'))))
      .then((json: {
        notices: Row[]
        housingTypes?: FilterOption[]
        regions?: FilterOption[]
        matched?: number
      }) => {
        if (!alive) return
        setResult({ key, rows: json.notices, error: null })
        if (json.housingTypes) setTypes(json.housingTypes)
        if (json.regions) setRegions(json.regions)
        setMatched(json.matched ?? json.notices.length)
      })
      .catch((err: unknown) => {
        if (alive) {
          setResult({
            key,
            rows: [],
            error: err instanceof Error ? err.message : '공고를 불러오지 못했어요.',
          })
        }
      })

    return () => {
      alive = false
    }
  }, [region, type, key])

  return (
    <div className="cs-wrap" style={{ paddingTop: 44 }}>
      <h1 className="cs-page-title">모집 중인 공고</h1>
      <p className="cs-sub" style={{ marginTop: 12 }}>
        분양을 먼저, 그 안에서 접수 마감이 가까운 순으로 보여드려요.{' '}
        <Link href="/analyze" className="cs-btn cs-btn--text" style={{ padding: 0 }}>
          내 조건으로 좁혀보기
        </Link>
      </p>

      <div style={{ margin: '26px 0 30px' }}>
        <FilterRow
          label="지역"
          options={regions}
          value={region}
          total={matched}
          onChange={setRegion}
        />
        <FilterRow label="유형" options={types} value={type} total={matched} onChange={setType} />
      </div>

      {loading ? (
        <div className="cs-notice-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="cs-skel" style={{ height: 300 }} />
          ))}
        </div>
      ) : error ? (
        <div className="cs-error">
          <span>{error}</span>
          <button className="cs-btn cs-btn--sm cs-btn--ghost" onClick={() => setNonce(n => n + 1)}>
            다시 시도
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="cs-empty">
          <div className="cs-empty__title">선택하신 조건의 공고가 없어요</div>
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
          <div className="cs-notice-grid" style={officialCount === 0 ? { marginTop: 26 } : undefined}>
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
          </div>
        </>
      )}

      {/* 목록을 내려오면 같은 공고가 지도 위에 있다.
          nav 의 /map 은 지도부터 보려는 사람을 위한 문이고, 여기는
          목록을 훑다 "어디쯤인지" 궁금해진 사람을 위한 자리다.
          한쪽만 두면 다른 쪽 사람이 지도를 못 찾는다. */}
      <div id="map" className="cs-notices__map">
        <NoticeMap />
      </div>

      {officialCount > 0 && (
        <p className="cs-note" style={{ marginTop: 24 }}>
          공공데이터포털 청약홈·LH 청약플러스에서 모은 실제 모집공고입니다. 카드의 지자체 상징은
          각 지자체가 공표한 공공저작물(Public domain)이며 위키미디어 공용에서 받았습니다. 분양을 앞에 두고, 그 안에서
          접수 마감이 가까운 순으로 보여드려요.
        </p>
      )}
    </div>
  )
}
