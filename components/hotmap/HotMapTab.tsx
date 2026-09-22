'use client'

import { useEffect, useState } from 'react'
import { Card, CardHead } from '@/components/ui'
import KoreaHotMap from '@/components/hotmap/KoreaHotMap'
import HotmapBottomSheet from '@/components/hotmap/BottomSheet'
import type { HotmapPayload, HotmapSpot } from '@/lib/hotmap-types'

function fmtMonth(ym: string) {
  if (!ym || ym.length < 6) return ym || '최신'
  return `${ym.slice(0, 4)}년 ${ym.slice(4, 6)}월`
}

export default function HotMapTab() {
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null)
  const [selectedSpot, setSelectedSpot] = useState<HotmapSpot | null>(null)
  const [months, setMonths] = useState<string[]>([])
  const [month, setMonth] = useState('')

  useEffect(() => {
    fetch('/api/competition/stats?month=')
      .then(r => r.json())
      .then(json => {
        const m = [...new Set(
          ((json.data ?? []) as { STAT_DE: string }[]).map(d => d.STAT_DE),
        )].sort().reverse() as string[]
        if (m.length) {
          setMonths(m)
          setMonth(prev => prev || m[0])
        }
      })
      .catch(() => {})
  }, [])

  /**
   * 어느 달의 결과인지 함께 들고 있는다 — '불러오는 중'은 그걸로 판단한다.
   * 효과 첫 줄에서 곧바로 setLoading(true) 를 부르면 달을 바꿀 때마다 화면을
   * 두 번 그리고, 먼저 낸 요청이 늦게 도착해 새 달의 지도를 덮을 수도 있다.
   */
  const [got, setGot] = useState<{ month: string | null; payload: HotmapPayload | null }>({
    // 아직 아무것도 받지 못했다. 어느 달과도 같지 않으므로 첫 그림은 '불러오는 중'이 된다
    month: null,
    payload: null,
  })
  const loading = got.month !== month
  const data = loading ? null : got.payload

  useEffect(() => {
    let alive = true
    fetch(`/api/hotmap?month=${encodeURIComponent(month)}`)
      .then(r => r.json())
      .then((payload: HotmapPayload) => {
        if (!alive) return
        setGot({ month, payload })
        if (!month && payload.statMonth) setMonth(payload.statMonth)
      })
      .catch(() => {
        if (alive) setGot({ month, payload: null })
      })
    return () => {
      alive = false
    }
  }, [month])

  const topHot = data?.regions
    .filter(r => r.avgComp > 0)
    .sort((a, b) => b.avgComp - a.avgComp)
    .slice(0, 3) ?? []

  return (
    <div className="hotmap-tab">
      <div className="predict-hero rise">
        <span className="predict-badge">Hot Map</span>
        <h2 className="predict-title">청약 핫플레이스</h2>
        <p className="predict-desc">
          분양 위치와 지역별 경쟁률을 한눈에. 지역을 클릭하거나 휠로 확대하면 해당 시·도를 자세히 볼 수 있으며, 마커를 누르면 단지 요약이 열립니다.
        </p>
      </div>

      {topHot.length > 0 && (
        <div className="hotmap-chips rise">
          {topHot.map(r => (
            <button
              key={r.code}
              type="button"
              className={`hotmap-chip${selectedRegion === r.code ? ' hotmap-chip--on' : ''}`}
              onClick={() => setSelectedRegion(selectedRegion === r.code ? null : r.code)}
            >
              <span className="hotmap-chip-dot" data-heat={r.heat} />
              {r.name}
              <strong className="tnum">{r.avgComp}:1</strong>
            </button>
          ))}
        </div>
      )}

      <Card className="rise hotmap-card">
        <CardHead
          title="전국 분양·경쟁률 지도"
          sub={data ? `기준 ${fmtMonth(data.statMonth)} · 전국 평균 ${data.nationalAvg}:1` : '데이터 로드 중'}
          right={
            months.length > 0 ? (
              <select
                className="predict-select field-focus"
                value={month}
                onChange={e => setMonth(e.target.value)}
                style={{ minWidth: 130 }}
              >
                {months.map(m => (
                  <option key={m} value={m}>{fmtMonth(m)}</option>
                ))}
              </select>
            ) : undefined
          }
        />

        {loading ? (
          <div className="hotmap-skeleton">
            <div style={{ height: 400, minHeight: 360, borderRadius: 'var(--r-md)', background: 'var(--track)' }} />
          </div>
        ) : data ? (
          <>
            <KoreaHotMap
              regions={data.regions}
              hotspots={data.hotspots}
              selectedCode={selectedRegion}
              onSelectRegion={setSelectedRegion}
              onSelectSpot={setSelectedSpot}
            />
            <p className="predict-disclaimer" style={{ marginTop: 16, textAlign: 'left' }}>
              * 마커는 시·도 경계 안 고정 배치입니다. 휠 확대·드래그 이동·우측 전국 버튼으로 지도를 조작할 수 있습니다.
              {selectedRegion && (
                <>
                  {' '}
                  <button
                    type="button"
                    className="link-ink"
                    style={{ fontSize: 'inherit' }}
                    onClick={() => setSelectedRegion(null)}
                  >
                    전국 보기
                  </button>
                </>
              )}
            </p>
          </>
        ) : (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink-3)' }}>지도 데이터를 불러올 수 없습니다</div>
        )}
      </Card>

      <HotmapBottomSheet spot={selectedSpot} onClose={() => setSelectedSpot(null)} />
    </div>
  )
}
