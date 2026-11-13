'use client'

import { useEffect, useRef, useState } from 'react'
import { KOREA_MAP_VIEWBOX, KOREA_PROVINCES } from '@/lib/korea-map-data'
import { projectToMap } from '@/lib/consumer/geo-projection'
import type { GeoScene } from './geo-scene'

/**
 * 입체 지리 무대 — 전국·지역 단계. 동네 자료가 없거나 그릴 수 없는 기기에서의 물러설 자리이기도 하다.
 *
 * three 는 무겁다. 이 무대가 화면에 들어온 뒤에야 받는다. 받기 전과 받지 못했을 때는
 * 같은 경계 자료로 그린 평면 그림이 그대로 선다 — 장면이 비어 보이는 순간을 만들지 않는다.
 *
 * 공고가 바뀔 때마다: 상태를 처음으로 되돌리고, 앞 장면을 거두고, 늦게 도착한 앞 공고의 장면이
 * 새 공고 위에 올라서지 않게 한다(세대 번호). 떠날 때 WebGL 맥락을 반드시 거둔다.
 */
export default function GeoStage({
  regionCode,
  point,
  pinpoint,
  approximate = false,
  label,
  onScene,
}: {
  regionCode: string | null
  point: { lat: number; lng: number } | null
  pinpoint: boolean
  approximate?: boolean
  label: string
  /** 카메라 단추가 쓸 장면 손잡이 — 장면이 서면 넘기고, 거둘 때 null */
  onScene?: (s: GeoScene | null) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [state, setState] = useState<{ key: string; live: boolean; failed: boolean }>({ key: '', live: false, failed: false })
  const lat = point?.lat ?? null
  const lng = point?.lng ?? null
  const key = `${regionCode}|${lat}|${lng}|${pinpoint}|${approximate}`
  const onSceneRef = useRef(onScene)
  useEffect(() => {
    onSceneRef.current = onScene
  }, [onScene])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let scene: GeoScene | null = null
    let cancelled = false
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // 낡은 실패·완료 표시를 지우고 이 공고로 다시 시작한다
    const raf = requestAnimationFrame(() => !cancelled && setState({ key, live: false, failed: false }))

    import('./geo-scene')
      .then(m => {
        if (cancelled || !canvasRef.current) return
        try {
          scene = m.createGeoScene(canvasRef.current, {
            regionCode,
            point: lat !== null && lng !== null ? { lat, lng } : null,
            pinpoint,
            approximate,
            reducedMotion: reduced,
          })
        } catch {
          // WebGL 을 못 여는 기기 — 평면 그림으로 남는다
          return !cancelled && setState({ key, live: false, failed: true })
        }
        onSceneRef.current?.(scene)
        setState({ key, live: true, failed: false })
      })
      .catch(() => !cancelled && setState({ key, live: false, failed: true }))

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      onSceneRef.current?.(null)
      scene?.dispose()
      scene = null
    }
  }, [key, regionCode, lat, lng, pinpoint, approximate])

  const live = state.key === key && state.live
  const failed = state.key === key && state.failed
  const flat = lat !== null && lng !== null && (pinpoint || approximate) ? projectToMap(lat, lng) : null

  return (
    <div className="cs-geo" data-live={live || undefined} data-failed={failed || undefined}>
      <canvas ref={canvasRef} className="cs-geo__canvas" aria-hidden="true" />

      {/* 받기 전·실패 시의 같은 자료 평면 그림. 읽는 쪽에는 이것이 그림의 설명이다 */}
      <svg className="cs-geo__flat" viewBox={KOREA_MAP_VIEWBOX} role="img" aria-label={label}>
        {KOREA_PROVINCES.map(p => (
          <path key={p.code} d={p.path} data-on={p.code === regionCode || undefined} />
        ))}
        {flat && approximate && !pinpoint && <circle className="cs-geo__area" cx={flat.x} cy={flat.y} r={7} />}
        {flat && pinpoint && <circle className="cs-geo__pin" cx={flat.x} cy={flat.y} r={3} />}
      </svg>

      {!live && !failed && (
        <span className="cs-geo__wait" role="status">
          입체 지형을 불러오는 중
        </span>
      )}
      {failed && <span className="cs-geo__wait">이 기기에서는 입체 무대를 열 수 없어 평면 지도로 보여 드립니다</span>}
    </div>
  )
}
