'use client'

import { useEffect, useState } from 'react'
import { ALL_HUBS, coordTrust, km, transitHubs, type Hub } from '@/lib/consumer/commute'
import { FEATURES } from '@/lib/features'

/**
 * 업무지구까지 — 공고 하나(상세) 또는 여럿(비교)을 같은 목적지 하나로 견준다.
 *
 * 경로 시간은 /api/transit(ODsay)이 답할 때만 적는다. 처음 한 번 물어 경로 서비스가 닫혀 있으면
 * (키 미설정·인증 실패) 그 뒤로는 묻지 않고 직선거리만 적는다. 한 화면에서 경로는 여섯 번까지만
 * 묻는다 — 바깥 호출에는 한도가 있다.
 */

export interface CommuteItem {
  id: string
  name: string
  province: string
  lat: number | null
  lng: number | null
  geoSource: string | null
}

type RouteRead = { status: 'OK'; minutes: number; transfers: number } | { status: 'NONE' } | { status: 'DOWN' } | 'loading'

let service: 'unknown' | 'ok' | 'down' = 'unknown'
let calls = 0
const MAX_CALLS = 6
/** 같은 (공고, 목적지)는 한 번만 묻는다 — 진행 중인 요청도 나눠 쓴다 */
const cache = new Map<string, Promise<Exclude<RouteRead, 'loading'>>>()
/** 첫 요청이 서비스가 열려 있는지 알려 줄 때까지 나머지는 기다린다 */
let probe: Promise<unknown> | null = null

async function ask(item: CommuteItem, hub: Hub): Promise<Exclude<RouteRead, 'loading'>> {
  if (service === 'down' || calls >= MAX_CALLS) return { status: 'DOWN' }
  calls++
  const q = new URLSearchParams({ sx: String(item.lng), sy: String(item.lat), ex: String(hub.x), ey: String(hub.y) })
  try {
    // 서비스가 닫혀 있으면 502 와 함께 상태를 JSON 으로 준다 — 본문을 읽는다
    const j = await fetch(`/api/transit?${q}`).then(r => r.json())
    if (j.status === 'OK') {
      service = 'ok'
      return { status: 'OK', minutes: j.totalTime, transfers: j.transfers }
    }
    if (j.status === 'EMPTY') {
      service = 'ok'
      return { status: 'NONE' }
    }
    service = 'down'
    return { status: 'DOWN' }
  } catch {
    return { status: 'DOWN' }
  }
}

function route(item: CommuteItem, hub: Hub): Promise<Exclude<RouteRead, 'loading'>> {
  const key = `${item.id}|${hub.name}`
  const hit = cache.get(key)
  if (hit) return hit
  const run =
    service === 'unknown' && probe
      ? probe.then(() => ask(item, hub))
      : ask(item, hub)
  if (service === 'unknown' && !probe) probe = run
  cache.set(key, run)
  return run
}

export default function CommuteExplorer({ items, heading = true }: { items: CommuteItem[]; heading?: boolean }) {
  // 목적지 후보: 좌표가 있으면 가까운 업무지구 넷, 없으면 광역의 업무지구
  const anchor = items.find(i => coordTrust(i.lat, i.lng, i.geoSource) !== 'NONE')
  const near = anchor
    ? [...ALL_HUBS].sort((a, b) => km(anchor.lat!, anchor.lng!, a.y, a.x) - km(anchor.lat!, anchor.lng!, b.y, b.x)).slice(0, 4)
    : transitHubs(items[0]?.province ?? '')
  const choices = near.length ? near : ALL_HUBS.slice(0, 4)
  const [hub, setHub] = useState<Hub>(choices[0] ?? ALL_HUBS[0])
  const [reads, setReads] = useState<Record<string, RouteRead>>({})

  const usable = items.filter(i => coordTrust(i.lat, i.lng, i.geoSource) !== 'NONE')

  useEffect(() => {
    let alive = true
    for (const it of usable) {
      route(it, hub).then(r => alive && setReads(prev => ({ ...prev, [`${it.id}|${hub.name}`]: r })))
    }
    return () => {
      alive = false
    }
    // 공고 목록이 같으면 다시 묻지 않는다(부르는 쪽이 매번 새 배열을 넘겨도)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub, items.map(i => i.id).join(',')])

  if (!FEATURES.commute || items.length === 0) return null

  const rows = items.map(it => {
    const trust = coordTrust(it.lat, it.lng, it.geoSource)
    const dist = trust === 'NONE' ? null : km(it.lat!, it.lng!, hub.y, hub.x)
    const r = reads[`${it.id}|${hub.name}`] ?? (trust === 'NONE' ? undefined : 'loading')
    return { it, trust, dist, r }
  })
  const maxDist = Math.max(1, ...rows.map(r => r.dist ?? 0))
  const down = rows.some(r => r.r && r.r !== 'loading' && r.r.status === 'DOWN')

  return (
    <div className="cx">
      {heading && <h2 className="cs-sa-doc__h">업무지구까지</h2>}
      <div className="cx-hubs" role="group" aria-label="목적지">
        {choices.map(h => (
          <button key={h.name} type="button" aria-pressed={hub.name === h.name} onClick={() => setHub(h)}>
            {h.name}
          </button>
        ))}
        <label className="cx-other">
          <span className="cs-sr">다른 목적지</span>
          <select
            value={choices.some(c => c.name === hub.name) ? '' : hub.name}
            onChange={e => {
              const h = ALL_HUBS.find(x => x.name === e.target.value)
              if (h) setHub(h)
            }}
          >
            <option value="">다른 곳…</option>
            {ALL_HUBS.filter(h => !choices.includes(h)).map(h => (
              <option key={h.name} value={h.name}>
                {h.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ul className="cx-rows" aria-live="polite">
        {rows.map(({ it, trust, dist, r }) => (
          <li key={it.id}>
            {items.length > 1 && <span className="cx-name">{it.name}</span>}
            {dist === null ? (
              <span className="cx-none">위치가 지역 기준이라 거리를 재지 않았어요 (주소가 원문에 없음)</span>
            ) : (
              <>
                <span className="cx-bar" aria-hidden="true">
                  <i style={{ width: `${(dist / maxDist) * 100}%` }} />
                </span>
                <span className="cx-val">
                  <b className="cs-num">{dist < 10 ? dist.toFixed(1) : Math.round(dist)}km</b>
                  <small>직선{trust === 'NAME' ? ' · 공고명으로 찾은 대략 위치' : ''}</small>
                </span>
                <span className="cx-route">
                  {r === 'loading' || r === undefined
                    ? '경로 확인 중'
                    : r.status === 'OK'
                      ? `대중교통 ${r.minutes}분 · 환승 ${r.transfers}회`
                      : r.status === 'NONE'
                        ? '대중교통 경로 없음'
                        : '경로 시간 미연동'}
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
      <p className="cx-note">
        {hub.name}까지. 직선거리는 길이 아니라 두 점 사이의 거리입니다.
        {down && ' 경로 시간 서비스(ODsay)가 지금 응답하지 않아 거리만 적었습니다.'}
      </p>
    </div>
  )
}
