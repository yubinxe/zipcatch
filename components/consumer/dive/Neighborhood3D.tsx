'use client'

import { useEffect, useRef, useState } from 'react'
import type { NeighborhoodData } from '@/lib/consumer/neighborhood'
import type { NeighborhoodScene } from './neighborhood-scene'

/**
 * 동네 단계 — 공고 자리 둘레의 공개 지도(OSM) 건물·길을 입체로.
 *
 * 자료는 서버가 받아 30일 동안 캐시한다(/api/notices/:id/neighborhood). 자료를 못 받았거나
 * 이 기기가 WebGL 을 열 수 없으면 onUnavailable 로 알리고, 껍데기는 지역 단계로 물러선다.
 * 늦게 도착한 앞 공고의 자료가 새 공고 위에 올라서지 않게, 요청은 공고가 바뀌면 끊는다.
 */
export type NeighborhoodStatus = 'loading' | 'ready' | 'unavailable'

export default function Neighborhood3D({
  noticeId,
  pinpoint,
  onStatus,
  onScene,
}: {
  noticeId: string
  pinpoint: boolean
  onStatus: (s: NeighborhoodStatus, info?: { attribution?: string; fetchedAt?: string; counts?: NeighborhoodData['counts']; reason?: string }) => void
  onScene?: (s: NeighborhoodScene | null) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [live, setLive] = useState<string | null>(null)
  const cb = useRef({ onStatus, onScene })
  useEffect(() => {
    cb.current = { onStatus, onScene }
  }, [onStatus, onScene])

  useEffect(() => {
    const ctl = new AbortController()
    let scene: NeighborhoodScene | null = null
    let dead = false
    cb.current.onStatus('loading')
    Promise.all([
      fetch(`/api/notices/${noticeId}/neighborhood`, { signal: ctl.signal }).then(async r => {
        const j = await r.json().catch(() => null)
        if (!r.ok) throw new Error(j?.code ?? `HTTP ${r.status}`)
        return j as NeighborhoodData & { uncertaintyM: number | null }
      }),
      import('./neighborhood-scene'),
    ])
      .then(([data, m]) => {
        if (dead || !canvasRef.current) return
        if (!data.buildings.length && !data.roads.length) {
          cb.current.onStatus('unavailable', { reason: 'EMPTY' })
          return
        }
        const nav = navigator as Navigator & { deviceMemory?: number }
        const lowPower = (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4
        try {
          scene = m.createNeighborhoodScene(canvasRef.current, {
            data,
            pinpoint,
            uncertaintyM: data.uncertaintyM,
            reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
            lowPower,
          })
        } catch {
          cb.current.onStatus('unavailable', { reason: 'WEBGL' })
          return
        }
        cb.current.onScene?.(scene)
        setLive(noticeId)
        cb.current.onStatus('ready', { attribution: data.attribution, fetchedAt: data.fetchedAt, counts: data.counts })
      })
      .catch(err => {
        if (dead) return
        cb.current.onStatus('unavailable', { reason: err instanceof Error ? err.message : 'ERROR' })
      })
    return () => {
      dead = true
      ctl.abort()
      cb.current.onScene?.(null)
      scene?.dispose()
      scene = null
    }
  }, [noticeId, pinpoint])

  return <canvas ref={canvasRef} className="zx-nb" data-live={live === noticeId || undefined} aria-hidden="true" />
}
