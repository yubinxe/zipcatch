'use client'

import Link from 'next/link'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ELIGIBILITY_CAUTION, type UrgencyInfo } from '@/lib/crm/services/scoring'
import type { Property } from '@/lib/crm/types'
import NoticeCard, { EmptyMark } from './NoticeCard'
import FilterRow, { type FilterOption } from './FilterRow'
import NoticeMap from './NoticeMap'
import SampleOnlyNotice from './SampleOnlyNotice'
import PageMasthead from './PageMasthead'
import RollingNumber from './motion/RollingNumber'
import type { SpecialBrief } from '@/lib/adapters/applyhome-special'

interface Row {
  property: Property
  urgency: UrgencyInfo
  special?: SpecialBrief
}

/**
 * 첫 화면 지도에서 지역을 골라 들어오면(?region=) 그 지역이 이미 골라져 있어야 한다.
 *
 * 주소의 값은 브라우저에서만 읽힌다. 화면 전체가 그것을 기다리면 서버가 그린 첫
 * 그림이 '불러오는 중' 한 줄이 되고, 수화하는 순간 무대가 통째로 갈아 끼워진다.
 * 읽는 일만 이 작은 조각에 맡겨 따로 기다리게 하고, 무대는 서버가 그린 그대로 둔다.
 */
function RegionFromUrl({ onRegion }: { onRegion: (region: string) => void }) {
  const region = useSearchParams().get('region')
  useEffect(() => {
    if (region) onRegion(region)
  }, [region, onRegion])
  return null
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
  /** 한 번이라도 답을 받았는지 — 그 전에는 건수를 0 으로 적지 않는다 */
  const answered = result !== null && !result.error

  // 목록에 실제 공고가 한 건도 없으면 예시만 남은 것이다. 응답의 dataOrigin 을
  // 그대로 세므로, 필터를 바꿀 때마다 별도 상태 없이 따라온다.
  const officialCount = rows.filter(r => r.property.dataOrigin === 'OFFICIAL').length
  const filterScope = [region === '전체' ? '' : region, type === '전체' ? '' : type]
    .filter(Boolean)
    .join(' · ')
  const filtered = region !== '전체' || type !== '전체'

  useEffect(() => {
    let alive = true
    const params = new URLSearchParams({ limit: '30' })
    if (region !== '전체') params.set('region', region)
    if (type !== '전체') params.set('housingType', type)

    // 칩을 빠르게 연달아 누르면 앞의 요청은 쓸모가 없다. 기다리지 않고 거둔다
    const ctl = new AbortController()
    fetch(`/api/notices?${params}`, { cache: 'no-store', signal: ctl.signal })
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
      ctl.abort()
    }
  }, [region, type, key])

  const reset = () => {
    setRegion('전체')
    setType('전체')
  }

  return (
    <div className="cs-wrap cs-sa cs-sa--notices">
      <Suspense fallback={null}>
        <RegionFromUrl onRegion={setRegion} />
      </Suspense>
      <PageMasthead
        eyebrow="OPEN NOTICES"
        title="모집 중인 공고"
        lead={
          <>
            분양을 먼저, 그 안에서 <b>접수 마감이 가까운 순</b>으로 보여드려요. 카드를 누르면 공고
            한 건을 문서처럼 펼쳐 봅니다.
          </>
        }
      >
        <div className="cs-sa-mrow">
          <p className="cs-sa-tally">
            <span className="cs-sa-tally__n">
              {answered ? <RollingNumber value={matched} digits={Math.max(2, String(matched).length)} /> : '—'}
            </span>
            <span className="cs-sa-tally__k">
              {answered ? (filterScope ? `${filterScope} 공고` : '지금 모집 중인 공고') : '공고를 세는 중'}
            </span>
            {answered && <span className="cs-sr">{matched}건</span>}
          </p>
          <div className="cs-sa-acts">
            <Link href="/analyze" className="cs-btn cs-btn--primary">
              내 조건으로 좁혀보기
            </Link>
            <a href="#map" className="cs-btn cs-btn--ghost">
              지도에서 보기
            </a>
          </div>
        </div>
      </PageMasthead>

      <section className="cs-sa-console" aria-label="공고 거르기">
        <div className="cs-sa-console__head">
          <span className="cs-sa-kicker">Filter</span>
          <span className="cs-sa-console__hint">칩의 숫자는 그 조건의 공고 수예요</span>
          {filtered && (
            <button type="button" className="cs-sa-reset" onClick={reset}>
              조건 지우기
            </button>
          )}
        </div>
        {regions.length === 0 && types.length === 0 && loading ? (
          <div className="cs-sa-console__skel" aria-hidden="true">
            <span />
            <span />
          </div>
        ) : regions.length === 0 && types.length === 0 ? (
          <p className="cs-sa-console__none">지금은 거를 지역·유형이 없어요. 공고가 열리면 여기에 칩이 생깁니다.</p>
        ) : (
          <>
            <FilterRow label="지역" options={regions} value={region} total={matched} onChange={setRegion} />
            <FilterRow label="유형" options={types} value={type} total={matched} onChange={setType} />
          </>
        )}
      </section>

      <div className="cs-sa-resbar" role="status" aria-live="polite">
        <span className="cs-sa-resbar__n cs-num">
          {loading ? '불러오는 중' : error ? '불러오지 못함' : `${rows.length}건`}
        </span>
        {!loading && !error && matched > rows.length && (
          <span className="cs-sa-resbar__k">전체 {matched}건 가운데 마감이 가까운 {rows.length}건</span>
        )}
        <span className="cs-sa-resbar__sort">분양 먼저 · 마감 가까운 순</span>
      </div>

      {loading ? (
        <div className="cs-notice-grid cs-sa-grid" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="cs-skel cs-sa-skel" />
          ))}
        </div>
      ) : error ? (
        <div className="cs-error cs-sa-error" role="alert">
          <span>{error} 잠시 뒤 다시 시도해 주세요.</span>
          <button className="cs-btn cs-btn--sm cs-btn--ghost" onClick={() => setNonce(n => n + 1)}>
            다시 시도
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="cs-empty cs-sa-empty">
          <EmptyMark />
          <div className="cs-empty__title">
            {filterScope ? `${filterScope} 조건의 공고가 없어요` : '지금 모집 중인 공고가 없어요'}
          </div>
          <p className="cs-empty__desc">
            {filtered
              ? '지역이나 유형을 바꿔서 다시 살펴보세요.'
              : '새 공고가 열리면 이 자리에 마감이 가까운 순으로 놓입니다.'}
          </p>
          <div className="cs-sa-empty__acts">
            {filtered && (
              <button type="button" className="cs-btn cs-btn--primary" onClick={reset}>
                조건 지우기
              </button>
            )}
            <Link href="/analyze" className="cs-btn cs-btn--ghost">
              내 조건으로 찾아보기
            </Link>
          </div>
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
          <div className="cs-notice-grid cs-sa-grid" data-after-note={officialCount === 0 ? 'true' : undefined}>
            {rows.map((row, i) => (
              <NoticeCard
                key={row.property.id}
                index={i}
                depth
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
                special={row.special}
              />
            ))}
          </div>
        </>
      )}

      {/* 목록을 내려오면 같은 공고가 지도 위에 있다.
          nav 의 /map 은 지도부터 보려는 사람을 위한 문이고, 여기는
          목록을 훑다 "어디쯤인지" 궁금해진 사람을 위한 자리다.
          한쪽만 두면 다른 쪽 사람이 지도를 못 찾는다. */}
      <div id="map" className="cs-notices__map cs-sa-mapdock">
        <NoticeMap />
      </div>

      {officialCount > 0 && (
        <p className="cs-note cs-sa-foot">
          공공데이터포털 청약홈·LH 청약플러스에서 모은 실제 모집공고입니다. 카드의 지자체 상징은
          각 지자체가 공표한 공공저작물(Public domain)이며 위키미디어 공용에서 받았습니다. 분양을 앞에 두고, 그 안에서
          접수 마감이 가까운 순으로 보여드려요.
        </p>
      )}
    </div>
  )
}
