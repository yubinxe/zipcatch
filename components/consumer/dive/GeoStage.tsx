'use client'

import { useEffect, useRef, useState } from 'react'
import { KOREA_MAP_VIEWBOX, KOREA_PROVINCES } from '@/lib/korea-map-data'
import type { GeoScene } from './geo-scene'

/**
 * 입체 지리 무대 — 공고의 자리를 깊이 있는 장면으로.
 *
 * three 는 무겁다. 이 무대가 화면에 들어온 뒤에야 받는다. 받기 전과 받지 못했을 때는
 * 같은 경계 자료로 그린 평면 그림이 그대로 선다 — 장면이 비어 보이는 순간을 만들지 않는다.
 *
 * 창을 여닫을 때마다 WebGL 맥락이 쌓이지 않도록 떠날 때 반드시 거둔다.
 */
export default function GeoStage({
  regionCode,
  point,
  pinpoint,
  label,
}: {
  regionCode: string | null
  point: { lat: number; lng: number } | null
  pinpoint: boolean
  label: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [live, setLive] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let scene: GeoScene | null = null
    let cancelled = false
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    import('./geo-scene')
      .then(m => {
        if (cancelled || !canvasRef.current) return
        scene = m.createGeoScene(canvasRef.current, { regionCode, point, pinpoint, reducedMotion: reduced })
        setLive(true)
      })
      .catch(() => !cancelled && setFailed(true))

    return () => {
      cancelled = true
      scene?.dispose()
      scene = null
    }
  }, [regionCode, point, pinpoint])

  return (
    <div className="cs-geo" data-live={live || undefined}>
      <canvas ref={canvasRef} className="cs-geo__canvas" aria-hidden="true" />

      {/* 받기 전·실패 시의 같은 자료 평면 그림. 읽는 쪽에는 이것이 그림의 설명이다 */}
      <svg className="cs-geo__flat" viewBox={KOREA_MAP_VIEWBOX} role="img" aria-label={label}>
        {KOREA_PROVINCES.map(p => (
          <path key={p.code} d={p.path} data-on={p.code === regionCode || undefined} />
        ))}
      </svg>

      {!live && !failed && (
        <span className="cs-geo__wait" role="status">
          입체 지형을 불러오는 중
        </span>
      )}
    </div>
  )
}
