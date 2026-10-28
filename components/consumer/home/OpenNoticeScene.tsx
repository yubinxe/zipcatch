'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Property } from '@/lib/crm/types'
import { formatManOr, type UrgencyInfo } from '@/lib/crm/services/scoring'
import { shortDate } from '../NoticeCard'
import ScrollStage from './ScrollStage'

/**
 * 장면 2 — 카드 한 장이 공고 한 장으로 열린다.
 *
 * 네 박자로 읽힌다(스크롤 진행률 `--p`, 계산은 전부 CSS).
 *
 *   A 0~18%   작은 카드 — 출처·유형 / 제목 / 지역·마감. 그 자체로 완성된 카드다.
 *   B 18~58%  카드가 화면으로 넓어진다. 카드의 얼굴은 40% 즈음 다 걷히고, 두 제목이 한
 *             프레임에 겹치지 않도록 문서의 제목은 그 뒤(48~50%)에 들어온다.
 *   C 48~80%  문서가 위계 순서로 선다 — 제목 → 상태·마감 → 지역·출처 → 핵심 조건.
 *   D 78~100% 움직임이 멈추고 '이 공고 자세히 보기'만 남는다. 한 번 나타난 단추는 다시 숨지 않는다.
 *
 * 넓어지는 판(sheet)은 화면 크기로 그려 두고 transform 으로만 줄였다 키운다. 처음 크기의
 * 비율(--sx0·--sy0)은 칸의 실제 크기에서 재어 적는다 — 카드 모양이 화면 비율에 끌려가지
 * 않게(휴대폰에서 세로로 길쭉한 카드가 되지 않게) 가로·세로를 따로 줄인다.
 *
 * 보여주는 공고는 지금 마감이 가장 가까운 실제 공고 하나다. 공고가 없으면 장면을 세우지 않는다.
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
  const frame = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ctl = new AbortController()
    fetch('/api/notices?limit=1', { signal: ctl.signal })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((d: { notices: Row[] }) => setRow(d.notices[0] ?? null))
      .catch(() => setRow(null))
    return () => ctl.abort()
  }, [])

  /*
   * 작은 카드의 크기 ÷ 다 열린 크기. CSS 는 길이끼리 나눌 수 없어 여기서 한 번 재어 적는다.
   * 크기가 바뀔 때만 다시 잰다 — 스크롤마다 React 가 돌지 않는다.
   */
  useEffect(() => {
    const el = frame.current
    if (!el) return
    const card = el.querySelector<HTMLElement>('.cs-open__face')
    if (!card) return
    const ro = new ResizeObserver(() => {
      const W = el.clientWidth
      const H = el.clientHeight
      if (!W || !H) return
      el.style.setProperty('--sx0', (card.offsetWidth / W).toFixed(4))
      el.style.setProperty('--sy0', (card.offsetHeight / H).toFixed(4))
    })
    ro.observe(el)
    ro.observe(card)
    return () => ro.disconnect()
  }, [row])

  if (row === null) return null

  const p = row?.property
  const where = p ? (p.district && p.district !== p.region ? `${p.region} ${p.district}` : p.region) : ''
  const due = p?.applicationEnd ? shortDate(p.applicationEnd) : '미정'
  const hot = row ? row.urgency.daysLeft !== null && row.urgency.daysLeft >= 0 && row.urgency.daysLeft <= 3 : false
  const facts = p
    ? [
        { k: '보증금', v: formatManOr(p.deposit) },
        { k: '월 임대료', v: formatManOr(p.monthlyRent) },
        { k: '공급 세대', v: p.supplyCount ? `${p.supplyCount.toLocaleString()}세대` : '공고문 확인' },
        { k: '접수 마감', v: due },
      ]
    : []

  return (
    <ScrollStage length={3} className="cs-scene cs-scene--open" label="공고 한 장이 열리는 모습">
      <div className="cs-wrap cs-open__head">
        <span className="cs-sec-eyebrow">Open a Notice</span>
        <h2 className="cs-section-title">카드 한 장이, 공고 한 장으로.</h2>
      </div>

      <div className="cs-open__frame" ref={frame}>
        {/* 넓어지는 판 — 장식이라 읽지 않는다 */}
        <div className="cs-open__sheet" aria-hidden="true" />

        {/* 닫힌 카드의 얼굴. 같은 내용을 아래 문서가 읽어 주므로 보조기술에는 숨긴다 */}
        <div className="cs-open__face" aria-hidden="true">
          <div className="cs-open__face-top">
            <span className="cs-open__src">
              {p?.source ?? '모집공고'}
              {p?.housingType ? ` · ${p.housingType}` : ''}
            </span>
            {row && (
              <span className="cs-open__dday cs-num" data-hot={hot || undefined}>
                {dday(row.urgency)}
              </span>
            )}
          </div>
          <p className="cs-open__face-name">{p?.name ?? ' '}</p>
          <p className="cs-open__face-foot cs-num">
            <span>{where}</span>
            <span>마감 {due}</span>
          </p>
        </div>

        {/* 열린 공고 — 위계 순서대로 선다 */}
        <article className="cs-open__doc" aria-busy={!p}>
          <p className="cs-open__crumb cs-open__r" style={{ '--at': 0.5 } as CSSProperties}>
            {p?.source ?? '모집공고'}
            {p?.housingType ? ` · ${p.housingType}` : ''}
          </p>
          <h3 className="cs-open__title cs-open__r" title={p?.name} style={{ '--at': 0.5 } as CSSProperties}>
            {p?.name ?? ' '}
          </h3>
          <div className="cs-open__status cs-open__r" style={{ '--at': 0.55 } as CSSProperties}>
            {row && (
              <span className="cs-open__dday cs-num" data-hot={hot || undefined}>
                {dday(row.urgency)}
              </span>
            )}
            <span className="cs-num">접수 마감 {due}</span>
          </div>
          <p className="cs-open__addr cs-open__r" style={{ '--at': 0.58 } as CSSProperties}>
            {p?.address || where}
          </p>
          <dl className="cs-open__facts">
            {facts.map((f, i) => (
              <div key={f.k} className="cs-open__fact cs-open__r" style={{ '--at': 0.61 + i * 0.03 } as CSSProperties}>
                <dt>{f.k}</dt>
                <dd className="cs-num">{f.v}</dd>
              </div>
            ))}
          </dl>
          {p && (
            <Link href={`/notices/${p.id}`} className="cs-btn cs-btn--primary cs-open__go cs-open__r" style={{ '--at': 0.78 } as CSSProperties}>
              이 공고 자세히 보기
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
          )}
        </article>
      </div>
    </ScrollStage>
  )
}
