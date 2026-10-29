'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

interface Item {
  id: string
  name: string
  region: string
  label: string
  days: number | null
  origin: 'OFFICIAL' | 'SYNTHETIC'
}

/**
 * 마감 티커.
 *
 * 이 서비스에서 시간이 가장 빨리 움직이는 값은 접수 마감이다.
 * 홈에 가만히 있는 배너를 두는 대신, 지금 마감이 가까운 공고를 흘려보낸다.
 * 장식이 아니라 가장 짧은 시간 안에 사라질 정보다.
 *
 * 지면 안을 흐르지 않고 화면 맨 아래에 고정한다(`.cs-ticker`). 마감은
 * 스크롤 위치를 기다려 주지 않으므로 어디를 보고 있든 발치에 남는다.
 * 챗봇 버튼은 이 막대 위로 비켜선다.
 */
export default function DeadlineTicker() {
  const [items, setItems] = useState<Item[]>([])

  useEffect(() => {
    let alive = true
    fetch('/api/notices?limit=12', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((json: { notices: { property: Record<string, string>; urgency: { label: string; daysLeft: number | null } }[] }) => {
        if (!alive) return
        const rows = json.notices
          // 이미 마감된 공고(음수)는 마감 임박 띠에 싣지 않는다 — "D--3" 같은 표기가 나오지 않게
          .filter(n => n.urgency.daysLeft !== null && n.urgency.daysLeft >= 0 && n.urgency.daysLeft <= 14)
          .slice(0, 8)
          .map(n => ({
            id: String(n.property.id),
            name: String(n.property.name),
            region: String(n.property.region),
            label: n.urgency.label,
            days: n.urgency.daysLeft,
            origin: (n.property.dataOrigin as 'OFFICIAL' | 'SYNTHETIC') ?? 'SYNTHETIC',
          }))
        setItems(rows)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  // 흐를 만큼 쌓이지 않으면 아예 그리지 않는다. 한두 건이 왕복하면 더 초라하다.
  if (items.length < 3) return null

  // 끊김 없이 이어지려면 같은 줄이 두 벌 필요하다
  const lane = [...items, ...items]

  return (
    <div className="cs-ticker" aria-label="마감이 가까운 공고">
      <span className="cs-ticker__tag">
        <span className="cs-ticker__pulse" aria-hidden="true" />
        마감 임박
      </span>
      <div className="cs-ticker__view">
        <div className="cs-ticker__lane">
          {lane.map((it, i) => (
            <Link
              key={`${it.id}-${i}`}
              href={`/notices/${it.id}`}
              className="cs-ticker__item"
              aria-hidden={i >= items.length}
              tabIndex={i >= items.length ? -1 : undefined}
            >
              <span className="cs-ticker__d" data-soon={it.days !== null && it.days <= 3}>
                {it.days === 0 ? 'D-DAY' : `D-${it.days}`}
              </span>
              <span className="cs-ticker__name">{it.name}</span>
              <span className="cs-ticker__region">{it.region}</span>
              {it.origin === 'SYNTHETIC' && <span className="cs-ticker__sample">예시</span>}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
