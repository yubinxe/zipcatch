'use client'

import { useState } from 'react'
import { km, transitHubs, type Hub } from '@/lib/consumer/commute'


/**
 * 출퇴근 대중교통 — 공고 자리에서 주요 업무지구까지.
 *
 * ODsay 무료 등급은 하루 호출 수가 적어 화면을 열 때 일괄로 묻지 않는다.
 * 사람이 목적지를 눌렀을 때 그 한 곳만 묻는다. 좌표가 공고명으로 찾은 자리면 어림값이라고 적는다.
 */

interface Leg {
  mode: 'SUBWAY' | 'BUS' | 'WALK'
  minutes: number
  line: string | null
  from: string | null
  to: string | null
  stops: number | null
}
interface Route {
  ok: boolean
  status: string
  near?: boolean
  totalTime?: number
  payment?: number
  transfers?: number
  walk?: number
  legs?: Leg[]
}

export default function TransitRoutes({ lat, lng, province, approximate }: { lat: number; lng: number; province: string; approximate: boolean }) {
  // 통근 거리 밖(직선 60km 넘게)의 업무지구는 내놓지 않는다 — 목포에서 광주시청까지를 출퇴근이라 부를 수 없다
  const hubs = transitHubs(province).filter(h => km(lat, lng, h.y, h.x) <= 60)
  const [pick, setPick] = useState<string | null>(null)
  const [routes, setRoutes] = useState<Record<string, Route | 'loading'>>({})

  if (!hubs.length) return null

  const ask = (h: Hub) => {
    setPick(h.name)
    if (routes[h.name]) return
    setRoutes(r => ({ ...r, [h.name]: 'loading' }))
    const q = new URLSearchParams({ sx: String(lng), sy: String(lat), ex: String(h.x), ey: String(h.y) })
    fetch(`/api/transit?${q}`)
      .then(r => r.json())
      .then((j: Route) => setRoutes(r => ({ ...r, [h.name]: j })))
      .catch(() => setRoutes(r => ({ ...r, [h.name]: { ok: false, status: 'ERROR' } })))
  }

  const cur = pick ? routes[pick] : undefined

  return (
    <section className="cs-sa-doc__sec">
      <h2 className="cs-sa-doc__h">출퇴근 대중교통</h2>
      <div className="cs-sa-doc__body">
        <p className="cs-pro__p" style={{ marginBottom: 14 }}>
          이 공고 자리에서 업무지구까지 가장 빠른 대중교통 경로를 찾아 드립니다. 목적지를 눌러 보세요.
        </p>
        <div className="cs-transit__hubs" role="group" aria-label="목적지">
          {hubs.map(h => (
            <button key={h.name} type="button" className="cs-transit__hub" aria-pressed={pick === h.name} onClick={() => ask(h)}>
              {h.name}
            </button>
          ))}
        </div>

        <div className="cs-transit__out" aria-live="polite">
          {cur === 'loading' && <p className="cs-note">경로를 찾고 있어요…</p>}
          {cur && cur !== 'loading' && cur.status === 'OK' && (
            <>
              <div className="cs-transit__sum">
                <b className="cs-num">{cur.totalTime}</b>
                <span>분</span>
                <em>
                  환승 {cur.transfers}회 · 걷기 {Math.round((cur.walk ?? 0) / 10) * 10}m · 요금 {(cur.payment ?? 0).toLocaleString('ko-KR')}원
                </em>
              </div>
              <ol className="cs-transit__legs">
                {cur.legs!
                  .filter(l => l.mode !== 'WALK')
                  .map((l, i) => (
                    <li key={i} data-mode={l.mode}>
                      <span className="cs-transit__line">{l.line ?? (l.mode === 'BUS' ? '버스' : '지하철')}</span>
                      <span className="cs-transit__seg">
                        {l.from} → {l.to}
                        {l.stops ? ` · ${l.stops}개 역·정류장` : ''} · {l.minutes}분
                      </span>
                    </li>
                  ))}
              </ol>
            </>
          )}
          {cur && cur !== 'loading' && cur.status === 'EMPTY' && (
            <p className="cs-note">{cur.near ? '목적지가 걸어갈 만큼 가깝습니다.' : '대중교통 경로를 찾지 못했습니다.'}</p>
          )}
          {cur && cur !== 'loading' && cur.status !== 'OK' && cur.status !== 'EMPTY' && (
            <p className="cs-note">지금은 경로를 불러오지 못했어요. 잠시 뒤 다시 눌러 주세요.</p>
          )}
        </div>

        <p className="cs-note" style={{ marginTop: 12 }}>
          평일 기준 최단 경로 · 출처 ODsay 대중교통 길찾기.
          {approximate && ' 공고 좌표가 단지명으로 찾은 어림 위치라 실제와 몇 분 다를 수 있습니다.'}
        </p>
      </div>
    </section>
  )
}
