'use client'

import Link from 'next/link'
import { useEffect, useState, type CSSProperties } from 'react'
import type { Property } from '@/lib/crm/types'
import { formatManOr, type UrgencyInfo } from '@/lib/crm/services/scoring'
import ScrollStage from './ScrollStage'

/**
 * 장면 2 — 카드 한 장이 공고 한 장으로 열린다.
 *
 * 목록에서 보던 작은 카드가 내릴수록 커져 화면을 채우고, 모서리가 펴지면서
 * 안에서 상세 화면의 줄들(보증금·임대료·세대·일정)이 차례로 올라온다.
 * 보여주는 공고는 지금 마감이 가장 가까운 실제 공고 하나다 — 예시를 지어내지 않는다.
 * 끝에서 누르면 그 공고의 상세로 간다.
 */

interface Row {
  property: Property
  urgency: UrgencyInfo
}

function dday(u: UrgencyInfo) {
  if (u.daysLeft === null) return '마감일 미정'
  if (u.daysLeft < 0) return '접수 마감'
  if (u.daysLeft === 0) return 'D-DAY'
  return `D-${u.daysLeft}`
}

export default function OpenNoticeScene() {
  const [row, setRow] = useState<Row | null | undefined>(undefined)

  useEffect(() => {
    const ctl = new AbortController()
    fetch('/api/notices?limit=1', { signal: ctl.signal })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((d: { notices: Row[] }) => setRow(d.notices[0] ?? null))
      .catch(() => setRow(null))
    return () => ctl.abort()
  }, [])

  // 공고가 하나도 없으면 장면을 세우지 않는다. 빈 카드를 키워 보일 이유가 없다
  if (row === null) return null

  const p = row?.property
  const where = p ? (p.district && p.district !== p.region ? `${p.region} ${p.district}` : p.region) : ''
  const facts = p
    ? [
        { k: '보증금', v: formatManOr(p.deposit) },
        { k: '월 임대료', v: formatManOr(p.monthlyRent) },
        { k: '공급 세대', v: p.supplyCount ? `${p.supplyCount.toLocaleString()}세대` : '공고문 확인' },
        { k: '접수 마감', v: p.applicationEnd ?? '미정' },
      ]
    : []

  return (
    <ScrollStage length={2.6} className="cs-scene cs-scene--open" label="공고 한 장이 열리는 모습">
      <div className="cs-wrap cs-open__head">
        <span className="cs-sec-eyebrow">Open a Notice</span>
        <h2 className="cs-section-title">카드 한 장이, 공고 한 장으로.</h2>
      </div>

      <div className="cs-open__frame">
        <article className="cs-open__card" aria-busy={!p}>
          {/* 닫힌 카드의 얼굴 — 열리면서 걷힌다 */}
          <div className="cs-open__face">
            <div className="cs-open__tags">
              <span className="cs-open__tag">{p?.housingType ?? '모집공고'}</span>
              {row && <span className="cs-open__tag cs-open__tag--hot">{dday(row.urgency)}</span>}
            </div>
            <h3 className="cs-open__name">{p?.name ?? ' '}</h3>
            <p className="cs-open__where">{where}</p>
          </div>

          {/* 열린 공고의 몸 — 상세 화면의 줄들이 하나씩 올라온다 */}
          <div className="cs-open__body">
            <div className="cs-open__top">
              <span className="cs-open__crumb">모집공고 · {p?.source ?? ''}</span>
              {row && <span className="cs-open__dday cs-num">{dday(row.urgency)}</span>}
            </div>
            <h3 className="cs-open__title">{p?.name ?? ' '}</h3>
            <p className="cs-open__addr">{p?.address || where}</p>
            <dl className="cs-open__facts">
              {facts.map((f, i) => (
                <div key={f.k} className="cs-open__fact" style={{ '--i': i } as CSSProperties}>
                  <dt>{f.k}</dt>
                  <dd className="cs-num">{f.v}</dd>
                </div>
              ))}
            </dl>
            {p && (
              <Link href={`/notices/${p.id}`} className="cs-btn cs-btn--primary cs-open__go">
                이 공고 열어보기
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            )}
          </div>
        </article>
      </div>
    </ScrollStage>
  )
}
