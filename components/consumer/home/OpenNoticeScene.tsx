'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Property } from '@/lib/crm/types'
import { formatManOr, type UrgencyInfo } from '@/lib/crm/services/scoring'
import { shortDate } from '../NoticeCard'
import ScrollStage from './ScrollStage'
import SitePlanArt from './SitePlanArt'

/**
 * 장면 2 — 카드 한 장이 공고 한 장으로 열린다.
 *
 * 한 장의 카드가 끊기지 않고 문서가 된다(스크롤 진행률 `--p`, 계산은 전부 CSS).
 *
 *   A 0%       비스듬히 놓여 그림자를 드리운 공고 카드 — 단지 배치도, 출처·유형, D-day, 제목, 지역·마감.
 *   B 0~30%    카드가 기울기를 풀고 바로 선다.
 *     8~50%    카드가 화면으로 넓어진다. 배치도는 문서의 머리 그림이 되고, 제목은 카드 속 자리에서
 *              문서의 제목 자리로 그대로 옮겨 가며 커진다 — 같은 요소 하나라 어느 프레임에도 글이 있다.
 *   C 42~66%   문서가 위계 순서로 선다 — 상태·마감 → 주소 → 핵심 조건 넷.
 *   D 70~100%  움직임이 멈추고 '이 공고 자세히 보기'가 남는다.
 *
 * 판(sheet)과 머리 그림은 다 열린 크기로 그려 두고 transform 으로만 줄였다 키운다. 제목도
 * 문서 자리에 놓고 카드 자리까지의 거리·배율(--tdx·--tdy·--ts)만 재어 적는다(FLIP).
 * 재는 일은 크기가 바뀔 때만 한다 — 스크롤마다 React 가 돌지 않는다.
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

/** 배치도에 눕혀 쓸 이름 — 공고명의 블록 표기(A-3블록 등)가 있으면 그것, 없으면 지역 */
function plotLabel(p: Property | undefined) {
  if (!p) return ''
  const m = p.name.match(/([A-Z]{1,2}\s?-?\s?\d{1,3})\s?블록/i)
  if (m) return `${m[1].replace(/\s/g, '').toUpperCase()}블록`
  const m2 = p.name.match(/(\d{1,2})\s?단지/)
  if (m2) return `${m2[1]}단지`
  return `${p.district || p.region} 단지`
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
   * 카드와 문서 사이의 거리를 잰다. CSS 는 길이끼리 나눌 수 없어 여기서 한 번 적는다.
   *   --fh          무대 높이
   *   --sx0 --sy0   카드 ÷ 다 열린 판
   *   --ts          카드 속 제목 폭 ÷ 문서 제목 폭 — 줄바꿈이 같은 채로 줄어든다
   *   --slot-h      카드 속 제목 자리 높이
   *   --tdx --tdy   문서 제목 자리 → 카드 속 제목 자리
   * transform 은 offset 값에 영향을 주지 않으므로 장면이 어느 진행률에 있든 같은 값이 나온다.
   */
  useEffect(() => {
    const el = frame.current
    if (!el) return
    const face = el.querySelector<HTMLElement>('.cs-open__face')
    const slot = el.querySelector<HTMLElement>('.cs-open__slot')
    const title = el.querySelector<HTMLElement>('.cs-open__title')
    const doc = el.querySelector<HTMLElement>('.cs-open__doc')
    if (!face || !slot || !title || !doc) return
    const put = (k: string, v: string) => {
      if (el.style.getPropertyValue(k) !== v) el.style.setProperty(k, v)
    }
    const pin = el.parentElement
    const header = document.querySelector<HTMLElement>('.cs-header')
    const measure = () => {
      // 좁은 화면의 머리글은 메뉴 줄까지 두 줄이라 --header-h 보다 높다 — 실제 높이 아래에서 연다
      if (pin && header?.offsetHeight) {
        const v = `${header.offsetHeight}px`
        if (pin.style.getPropertyValue('--open-top') !== v) pin.style.setProperty('--open-top', v)
      }
      const W = el.clientWidth
      const H = el.clientHeight
      if (!W || !H) return
      put('--fh', `${H}px`)
      put('--sx0', (face.offsetWidth / W).toFixed(4))
      const ts = title.offsetWidth ? slot.clientWidth / title.offsetWidth : 1
      put('--ts', ts.toFixed(4))
      put('--slot-h', `${Math.ceil(title.offsetHeight * ts)}px`)
      // 위 값이 카드 높이를 바꾸므로, 여기서 읽는 값은 바뀐 배치에서 나온다
      put('--sy0', (face.offsetHeight / H).toFixed(4))
      const tx = doc.offsetLeft + title.offsetLeft
      const ty = doc.offsetTop + title.offsetTop
      const cx = face.offsetLeft + face.clientLeft + slot.offsetLeft
      const cy = face.offsetTop + face.clientTop + slot.offsetTop
      put('--tdx', `${(cx - tx).toFixed(1)}px`)
      put('--tdy', `${(cy - ty).toFixed(1)}px`)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    ro.observe(title)
    ro.observe(face)
    measure()
    return () => ro.disconnect()
  }, [row])

  if (row === null) return null

  const p = row?.property
  const where = p ? (p.district && p.district !== p.region ? `${p.region} ${p.district}` : p.region) : ''
  const due = p?.applicationEnd ? shortDate(p.applicationEnd) : '미정'
  const hot = row ? row.urgency.daysLeft !== null && row.urgency.daysLeft >= 0 && row.urgency.daysLeft <= 3 : false
  const kind = `${p?.source ?? '모집공고'}${p?.housingType ? ` · ${p.housingType}` : ''}`
  const facts = p
    ? [
        { k: '보증금', v: formatManOr(p.deposit) },
        { k: '월 임대료', v: formatManOr(p.monthlyRent) },
        { k: '공급 세대', v: p.supplyCount ? `${p.supplyCount.toLocaleString()}세대` : '공고문 확인' },
        { k: '접수 마감', v: due },
      ]
    : []
  // 카드에 한 줄로 — 값이 있는 것만
  const brief = p
    ? [
        p.deposit ? `보증금 ${formatManOr(p.deposit)}` : null,
        p.monthlyRent ? `월 ${formatManOr(p.monthlyRent)}` : null,
        p.supplyCount ? `${p.supplyCount.toLocaleString()}세대` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : ''
  const at = (v: number) => ({ '--at': v }) as CSSProperties

  return (
    <ScrollStage length={2.2} className="cs-scene cs-scene--open" label="공고 한 장이 열리는 모습">
      <div className="cs-wrap cs-open__head">
        <span className="cs-sec-eyebrow">Open a Notice</span>
        <h2 className="cs-section-title">카드 한 장이, 공고 한 장으로.</h2>
      </div>

      <div className="cs-open__frame" ref={frame}>
        {/* 카드 전체가 함께 기울었다 바로 선다 */}
        <div className="cs-open__rig">
          {/* 바닥에 드리운 그림자 · 넓어지는 판 · 머리 그림 — 장식이라 읽지 않는다 */}
          <div className="cs-open__shadow" aria-hidden="true" />
          <div className="cs-open__sheet" aria-hidden="true" />
          <div className="cs-open__band" aria-hidden="true">
            {p && <SitePlanArt seed={p.id} label={plotLabel(p)} />}
          </div>

          {/* 열린 공고 — 위계 순서대로 선다 */}
          <article className="cs-open__doc" aria-busy={!p}>
            <p className="cs-open__crumb cs-open__r" style={at(0.42)}>
              <span className="cs-open__in">{kind}</span>
            </p>
            {/* 카드의 제목과 같은 요소 — 처음부터 끝까지 화면에 있다 */}
            <h3 className="cs-open__title" title={p?.name}>
              {p?.name ?? ' '}
            </h3>
            <div className="cs-open__status cs-open__r" style={at(0.46)}>
              <span className="cs-open__in">
                {row && (
                  <span className="cs-open__dday cs-num" data-hot={hot || undefined}>
                    {dday(row.urgency)}
                  </span>
                )}
                <span className="cs-num">접수 마감 {due}</span>
              </span>
            </div>
            <p className="cs-open__addr cs-open__r" style={at(0.5)}>
              <span className="cs-open__in">{p?.address || where}</span>
            </p>
            <dl className="cs-open__facts">
              {facts.map((f, i) => (
                <div key={f.k} className="cs-open__fact cs-open__r" style={at(0.54 + i * 0.035)}>
                  <dt>
                    <span className="cs-open__in">{f.k}</span>
                  </dt>
                  <dd className="cs-num">
                    <span className="cs-open__in">{f.v}</span>
                  </dd>
                </div>
              ))}
            </dl>
            {p && (
              <Link href={`/notices/${p.id}`} className="cs-btn cs-btn--primary cs-open__go cs-open__r" style={at(0.7)}>
                이 공고 자세히 보기
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            )}
          </article>

          {/* 닫힌 카드의 겉 — 같은 내용을 위 문서가 읽어 주므로 보조기술에는 숨긴다 */}
          <div className="cs-open__face" aria-hidden="true">
            <div className="cs-open__face-band">
              <span className="cs-open__src">{kind}</span>
              {row && (
                <span className="cs-open__dday cs-num" data-hot={hot || undefined}>
                  {dday(row.urgency)}
                </span>
              )}
            </div>
            <div className="cs-open__face-body">
              <div className="cs-open__slot" />
              {brief && <p className="cs-open__face-facts cs-num">{brief}</p>}
              <p className="cs-open__face-foot cs-num">
                <span>{where}</span>
                <span>마감 {due}</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </ScrollStage>
  )
}
