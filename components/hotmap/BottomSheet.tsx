'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { StatusPill } from '@/components/ui'
import { InkTag } from '@/components/ui/interactive'
import type { HotmapSpot } from '@/lib/hotmap-types'
import type { CompetitionItem } from '@/lib/types'
import { formatDate } from '@/lib/format'

interface SheetDetail {
  competition: CompetitionItem[]
  avgComp: number
  maxComp: number
}

export default function HotmapBottomSheet({
  spot,
  onClose,
}: {
  spot: HotmapSpot | null
  onClose: () => void
}) {
  const [got, setGot] = useState<{ pblancNo: string; detail: SheetDetail | null }>({
    pblancNo: '',
    detail: null,
  })
  /** 경쟁률을 못 받았을 때 대신 적을 값 — 지역 평균이다 */
  const fallbackRate = spot?.compRate ?? 0

  useEffect(() => {
    if (!spot) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [spot, onClose])

  /**
   * 받아 온 것이 **어느 공고의** 것인지 함께 들고 있는다.
   *
   * 예전에는 효과 첫 줄에서 setDetail(null) / setLoading(true) 를 불렀다.
   * 그러면 시트를 열 때마다 화면을 두 번 그렸고, 마커를 빠르게 옮겨 누르면
   * 먼저 낸 요청이 늦게 도착해 **다른 단지의 경쟁률**이 붙어 있기도 했다.
   * 공고 번호를 결과에 붙여 두면 두 문제가 함께 사라진다.
   */
  const pblancNo = spot?.pblancNo ?? ''
  const loading = pblancNo !== '' && got.pblancNo !== pblancNo
  const detail = got.pblancNo === pblancNo ? got.detail : null

  useEffect(() => {
    if (!pblancNo) return
    let alive = true
    fetch(`/api/property/${encodeURIComponent(pblancNo)}`)
      .then(r => r.json())
      .then(data => {
        if (!alive) return
        const comp = (data.competition as CompetitionItem[]) ?? []
        const rates = comp
          .map(c => parseFloat(c.CMPET_RATE))
          .filter(Number.isFinite)
        setGot({
          pblancNo,
          detail: {
            competition: comp.slice(0, 5),
            avgComp: rates.length
              ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 100) / 100
              : fallbackRate,
            maxComp: rates.length ? Math.max(...rates) : fallbackRate,
          },
        })
      })
      .catch(() => {
        if (alive) {
          setGot({
            pblancNo,
            detail: { competition: [], avgComp: fallbackRate, maxComp: fallbackRate },
          })
        }
      })
    return () => {
      alive = false
    }
  }, [pblancNo, fallbackRate])

  if (!spot) return null

  const status = spot.status as 'open' | 'soon' | 'upcoming' | 'closed'
  const displayComp = detail?.avgComp ?? spot.compRate
  const isHot = displayComp >= 10

  return (
    <div className="bottom-sheet-root" role="dialog" aria-modal="true" aria-label="단지 요약">
      <button type="button" className="bottom-sheet-backdrop" aria-label="닫기" onClick={onClose} />
      <div className="bottom-sheet-panel">
        <div className="bottom-sheet-grabber" aria-hidden />
        <header className="bottom-sheet-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <StatusPill status={status} pulse={status === 'soon'} />
              {isHot && <span className="hot-sheet-badge">고경쟁</span>}
            </div>
            <h3 className="bottom-sheet-title">{spot.name}</h3>
            <p className="bottom-sheet-sub">{spot.regionName} · {spot.builder}</p>
          </div>
          <button type="button" className="slideover-close" onClick={onClose} aria-label="닫기">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="bottom-sheet-body">
          <div className="bottom-sheet-stats">
            <StatBlock
              label="평균 경쟁률"
              value={loading ? '…' : `${displayComp.toFixed(1)}:1`}
              highlight={isHot}
            />
            <StatBlock
              label="특별공급"
              value={loading ? '…' : `${spot.specialComp.toFixed(1)}:1`}
            />
            <StatBlock label="공급세대" value={spot.units.toLocaleString()} />
          </div>

          <div className="bottom-sheet-premium">
            <div className="bottom-sheet-premium-row">
              <span>분양가상한제</span>
              <InkTag>{spot.nspc === '해당' ? '해당' : '미해당'}</InkTag>
            </div>
            {spot.address && (
              <div className="bottom-sheet-premium-row">
                <span>위치</span>
                <span style={{ fontSize: 13, color: 'var(--ink-2)', textAlign: 'right', maxWidth: '65%' }}>{spot.address}</span>
              </div>
            )}
            {(spot.openDate || spot.closeDate) && (
              <div className="bottom-sheet-premium-row">
                <span>청약접수</span>
                <span className="tnum" style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                  {spot.openDate ? formatDate(spot.openDate.replace(/-/g, '')) : '-'}
                  {' ~ '}
                  {spot.closeDate ? formatDate(spot.closeDate.replace(/-/g, '')) : '-'}
                </span>
              </div>
            )}
          </div>

          {loading ? (
            <div className="shimmer-bar" style={{ height: 80 }} />
          ) : detail && detail.competition.length > 0 ? (
            <div className="bottom-sheet-types">
              <div className="bottom-sheet-types-title">주택형별 경쟁률</div>
              {detail.competition.map((row, i) => {
                const rate = parseFloat(row.CMPET_RATE)
                return (
                  <div key={i} className="bottom-sheet-type-row">
                    <span style={{ fontWeight: 650, color: 'var(--ink)' }}>{row.HOUSE_TY}</span>
                    <span className="tnum" style={{ fontWeight: 700, color: rate >= 10 ? 'var(--hot)' : 'var(--ink)' }}>
                      {row.CMPET_RATE === '-' ? '-' : `${rate.toFixed(2)}:1`}
                    </span>
                  </div>
                )
              })}
              {detail.maxComp > displayComp && (
                <p className="bottom-sheet-insight">
                  최고 <strong className="tnum">{detail.maxComp.toFixed(1)}:1</strong>까지 확인됐어요. 인기 주택형은 별도로 따져보세요.
                </p>
              )}
            </div>
          ) : (
            <p className="bottom-sheet-insight">
              지역 평균 경쟁률 <strong className="tnum">{spot.compRate.toFixed(1)}:1</strong> 기준으로 표시 중입니다. 상세 페이지에서 주택형별 데이터를 확인하세요.
            </p>
          )}

          <div className="bottom-sheet-actions">
            <Link href={`/property/${encodeURIComponent(spot.pblancNo)}`} className="btn-ink" style={{ flex: 1, textAlign: 'center' }}>
              단지 상세 보기 →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatBlock({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`bottom-sheet-stat${highlight ? ' bottom-sheet-stat--hot' : ''}`}>
      <div className="bottom-sheet-stat-label">{label}</div>
      <div className="bottom-sheet-stat-value tnum">{value}</div>
    </div>
  )
}
