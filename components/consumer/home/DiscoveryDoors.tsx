'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { KOREA_MAP_VIEWBOX, KOREA_PROVINCES } from '@/lib/korea-map-data'
import { KOREA_REGIONS } from '@/lib/korea-regions'
import { useJourney } from '@/lib/consumer/journey-store'

/**
 * 들어가는 두 문 — 전체 모집공고와 지도.
 *
 * 전에는 글자 고리 두 개였다. 첫 화면에서 가장 많이 눌리는 자리인데 가장 가볍게
 * 놓여 있었다. 지면을 주고, 지금 몇 건인지와 어느 지역을 고른 상태인지를 문에
 * 적는다 — 꾸밈이 아니라 누르기 전에 알아야 할 것이다.
 *
 * 숫자는 목록 API 가 세어 준 실제 값만 쓴다. 아직 오지 않았으면 비워 두고,
 * 0 건이면 0 건이라고 적는다. 지어낸 수를 문에 적지 않는다.
 */
export default function DiscoveryDoors() {
  const [count, setCount] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  const journey = useJourney()
  const mapRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    const ctl = new AbortController()
    fetch('/api/notices?limit=1', { signal: ctl.signal })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((d: { matched?: number; notices?: unknown[] }) =>
        setCount(typeof d.matched === 'number' ? d.matched : (d.notices?.length ?? 0)),
      )
      .catch(() => setFailed(true))
    return () => ctl.abort()
  }, [])

  /* 손끝을 따라 도는 테두리 빛 — 글자는 움직이지 않는다 */
  const follow = (e: React.PointerEvent<HTMLElement>) => {
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    el.style.setProperty('--dx', `${((e.clientX - r.left) / r.width) * 100}%`)
    el.style.setProperty('--dy', `${((e.clientY - r.top) / r.height) * 100}%`)
  }

  const region = journey.region ? (KOREA_REGIONS.find(r => r.code === journey.region) ?? null) : null

  return (
    <nav className="cs-doors" aria-label="공고 둘러보기">
      <Link href="/notices" className="cs-door cs-door--list" onPointerMove={follow}>
        <span className="cs-door__line" aria-hidden="true" />
        <span className="cs-door__body">
          <span className="cs-door__label">전체 모집공고</span>
          <span className="cs-door__sub">
            {failed ? (
              '청약홈 · LH 공고 목록'
            ) : count === null ? (
              <span className="cs-door__wait" aria-hidden="true" />
            ) : (
              <>
                지금 <b className="cs-num">{count.toLocaleString('ko-KR')}</b>건 · 마감 가까운 순
              </>
            )}
          </span>
        </span>
        <span className="cs-door__go" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </Link>

      <Link href={region ? `/map?region=${region.code}` : '/map'} className="cs-door cs-door--map" onPointerMove={follow} ref={mapRef}>
        <span className="cs-door__line" aria-hidden="true" />
        {/* 지도로 간다는 것을 글자가 아니라 모양으로 — 고른 지역이 있으면 그 지역에 불이 든다 */}
        <span className="cs-door__atlas" aria-hidden="true">
          <svg viewBox={KOREA_MAP_VIEWBOX}>
            {KOREA_PROVINCES.map(p => (
              <path key={p.code} d={p.path} data-on={region?.code === p.code || undefined} />
            ))}
          </svg>
        </span>
        <span className="cs-door__body">
          <span className="cs-door__label">지도로 보기</span>
          <span className="cs-door__sub">{region ? `${region.name} 중심으로 열기` : '전국에서 열려 있는 자리부터'}</span>
        </span>
        <span className="cs-door__go" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </Link>
    </nav>
  )
}
