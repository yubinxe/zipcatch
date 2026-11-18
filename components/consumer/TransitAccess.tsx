'use client'

import { useEffect, useState } from 'react'
import { FEATURES } from '@/lib/features'
import type { NearbyStation, TransitAccessibility } from '@/lib/geo/transit-accessibility'

type TransitPayload = TransitAccessibility & {
  enabled: boolean
  attribution?: string | null
}

function formatMeters(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)}km` : `${m.toLocaleString()}m`
}

function StationRow({ station, primary = false }: { station: NearbyStation; primary?: boolean }) {
  const dist =
    station.walkingMeters !== null
      ? `${formatMeters(station.walkingMeters)}${station.walkMinutes !== null ? ` · 도보 약 ${station.walkMinutes}분` : ''}`
      : `${formatMeters(station.straightMeters)}`
  const methodLabel =
    station.method === 'WALK_NETWORK_VERIFIED'
      ? '보행 경로'
      : '직선거리 추정'

  return (
    <li className={primary ? 'tx-row tx-row--primary' : 'tx-row'}>
      <div className="tx-row__head">
        <strong className="tx-row__name">{station.name}역</strong>
        {station.isTransfer && (
          <span className="tx-badge">환승 · {station.uniqueOperatingLineCount}개 노선</span>
        )}
      </div>
      <div className="tx-row__lines" aria-label="운행 중인 노선">
        {station.lines.map(l => (
          <span key={l.lineId} className="tx-line">
            {l.lineName}
          </span>
        ))}
      </div>
      <div className="tx-row__dist">
        <b className="cs-num">{dist}</b>
        <small>
          {methodLabel}
          {station.measuredTo === 'ENTRANCE' ? ' · 출입구 기준' : ' · 역 기준점'}
        </small>
      </div>
    </li>
  )
}

/**
 * 공고 기준 가까운 도시철도·광역전철 역 안내.
 *
 * - 주소 이상(`PARCEL_CONFIRMED`, `ADDRESS_GEOCODED`)으로 확인된 자리에 한해 거리를 산출한다.
 * - 경험칙 가격 보정 계수는 화면에 노출하지 않는다.
 */
export default function TransitAccess({ id }: { id: string }) {
  const [data, setData] = useState<TransitPayload | null>(null)
  const [loading, setLoading] = useState(FEATURES.transitAccess)

  useEffect(() => {
    if (!FEATURES.transitAccess) return
    let alive = true
    fetch(`/api/notices/${id}/transit`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((j: TransitPayload | null) => {
        if (alive && j) setData(j)
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [id])

  if (!FEATURES.transitAccess) return null
  if (!loading && (!data || !data.enabled)) return null

  return (
    <div className="tx">
      <h2 className="cs-sa-doc__h">가까운 지하철 · 전철역</h2>
      {loading ? (
        <p className="tx-msg">운행 중인 역과 노선을 확인하는 중입니다.</p>
      ) : !data ? (
        <p className="tx-msg">역세권 정보를 불러오지 못했습니다.</p>
      ) : data.status === 'NOT_AVAILABLE' ? (
        <p className="tx-msg">{data.reason ?? '정확한 위치가 확인되지 않아 역 거리를 산정할 수 없습니다.'}</p>
      ) : data.status === 'NO_STATION_IN_RANGE' || !data.nearest ? (
        <p className="tx-msg">반경 {(data.searchRadiusM / 1000).toFixed(1)}km 안에 운행 중인 도시철도·광역전철 역이 없습니다.</p>
      ) : (
        <>
          <ul className="tx-list" aria-live="polite">
            <StationRow station={data.nearest} primary />
            {data.alternatives.map(st => (
              <StationRow key={st.stationId} station={st} />
            ))}
          </ul>
          <p className="tx-note">
            운행 중인 도시철도·광역전철 노선만 집계합니다(공사·계획 노선 제외).
            {data.method === 'STRAIGHT_LINE_ESTIMATE' && ' 직선거리는 보행 시간이나 실제 도보 거리가 아닙니다.'}
            {data.attribution ? ` 출처: ${data.attribution}.` : ''}
          </p>
        </>
      )}
    </div>
  )
}
