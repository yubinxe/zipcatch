'use client'

import { useEffect, useRef, useState } from 'react'
import type { NeighborhoodData } from '@/lib/consumer/neighborhood'
import { isTileAsset, mergeTiles, type TileAsset } from '@/lib/consumer/spatial-tiles'
import type { NeighborhoodScene } from './neighborhood-scene'

/**
 * 동네 단계 — 공고 자리 둘레의 공개 지도(OSM) 건물·길을 입체로.
 *
 * 자산은 미리 만든 정적 타일이다(/spatial/v1/15/x/y.json, CDN). 바깥 지도 서버를 부르지 않는다.
 *
 * 상태  FETCHING_ASSET → RENDERING → READY
 *       ASSET_UNAVAILABLE  그 자리의 자산이 아직 없다 — 껍데기는 지역 무대로 둔다
 *       RENDER_FAILED      WebGL 을 열지 못했다 — 같은 물러섬
 * 실패한 공고는 잠깐(2분) 기억해 다시 열어도 같은 요청을 되풀이하지 않는다. 공고가 바뀌면 앞 요청을 끊는다.
 */
export type NeighborhoodStatus = 'FETCHING_ASSET' | 'RENDERING' | 'READY' | 'ASSET_UNAVAILABLE' | 'RENDER_FAILED'
export interface NeighborhoodInfo {
  attribution?: string
  build?: string
  counts?: NeighborhoodData['counts']
  reason?: string
}

const FAIL_TTL = 2 * 60 * 1000
const failed = new Map<string, { until: number; status: NeighborhoodStatus; reason: string }>()
/** 같은 타일은 한 번만 받는다(공고를 오가도) */
const tileCache = new Map<string, Promise<TileAsset | null>>()

function getTile(url: string, signal: AbortSignal): Promise<TileAsset | null> {
  const hit = tileCache.get(url)
  if (hit) return hit
  const p = fetch(url, { signal })
    .then(r => (r.ok ? r.json() : null))
    .then(j => (isTileAsset(j) ? j : null))
    .catch(() => null)
  tileCache.set(url, p)
  // 실패한 타일은 다음에 다시 받게 지운다
  p.then(t => !t && tileCache.delete(url))
  return p
}

export default function Neighborhood3D({
  noticeId,
  pinpoint,
  onStatus,
  onScene,
}: {
  noticeId: string
  pinpoint: boolean
  onStatus: (s: NeighborhoodStatus, info?: NeighborhoodInfo) => void
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
    const seen = failed.get(noticeId)
    if (seen && seen.until > Date.now()) {
      cb.current.onStatus(seen.status, { reason: seen.reason })
      return
    }
    const fail = (status: NeighborhoodStatus, reason: string) => {
      failed.set(noticeId, { until: Date.now() + FAIL_TTL, status, reason })
      if (!dead) cb.current.onStatus(status, { reason })
    }
    cb.current.onStatus('FETCHING_ASSET')
    ;(async () => {
      const r = await fetch(`/api/notices/${noticeId}/neighborhood`, { signal: ctl.signal })
      const j = await r.json().catch(() => null)
      if (!r.ok || !j) return fail('ASSET_UNAVAILABLE', j?.code ?? `HTTP ${r.status}`)
      if (!j.available) return fail('ASSET_UNAVAILABLE', 'NO_ASSET')
      const [tiles, m] = await Promise.all([
        Promise.all((j.tiles as string[]).map(k => getTile(`${j.base}/${k}.json`, ctl.signal))),
        import('./neighborhood-scene'),
      ])
      if (dead || !canvasRef.current) return
      const ok = tiles.filter((t): t is TileAsset => Boolean(t))
      if (!ok.length) return fail('ASSET_UNAVAILABLE', 'TILE_UNREADABLE')
      const data = mergeTiles(ok, j.origin, j.radiusM, { attribution: j.attribution, fetchedAt: j.build })
      if (!data.buildings.length && !data.roads.length) return fail('ASSET_UNAVAILABLE', 'EMPTY')
      cb.current.onStatus('RENDERING')
      const nav = navigator as Navigator & { deviceMemory?: number }
      const lowPower = (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4
      try {
        scene = m.createNeighborhoodScene(canvasRef.current, {
          data,
          pinpoint,
          uncertaintyM: j.uncertaintyM,
          reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
          lowPower,
        })
      } catch {
        return fail('RENDER_FAILED', 'WEBGL')
      }
      if (dead) {
        scene.dispose()
        scene = null
        return
      }
      cb.current.onScene?.(scene)
      setLive(noticeId)
      cb.current.onStatus('READY', { attribution: data.attribution, build: j.build, counts: data.counts })
    })().catch(err => {
      if (dead || (err instanceof DOMException && err.name === 'AbortError')) return
      fail('ASSET_UNAVAILABLE', 'NETWORK')
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
