'use client'

import { useEffect, useRef, useState } from 'react'
import { canUse3D, onMotionPreference, whenIdle } from './support'
import type { SkyHandle, SkyTower } from './skyline-scene'

/**
 * 공사 중인 도시(입체)의 껍데기.
 *
 * 이 파일은 three 를 부르지 않는다. 칸이 화면에 가까워지고 브라우저가 한가해진
 * 뒤에야 `skyline-scene`(three 포함)을 따로 받아 온다 — 끝까지 내려오지 않는
 * 사람은 WebGL 맥락도, 셰이더도 만들지 않는다. 그때까지, 그리고 WebGL 이 없거나
 * 움직임을 줄여 달라고 한 사람에게는 BuildProgress 의 평면 그림이 그대로 남는다.
 */

interface Props {
  towers: SkyTower[]
  highlight: string | null
  onHover: (province: string | null) => void
  onPick: (province: string | null, pointerType: string) => void
  /** 입체가 첫 장을 그렸으면 true, 내려가거나 맥락을 잃으면 false */
  onLive: (live: boolean) => void
}

export default function Skyline3D({ towers, highlight, onHover, onPick, onLive }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<SkyHandle | null>(null)
  const hlRef = useRef(highlight)
  const cbRef = useRef({ onHover, onPick, onLive })
  /** 움직임 설정이 바뀔 때마다 늘어난다 — 아래 장면을 내렸다가(또는 다시) 세운다 */
  const [motion, setMotion] = useState(0)

  useEffect(() => onMotionPreference(() => setMotion(m => m + 1)), [])

  useEffect(() => {
    cbRef.current = { onHover, onPick, onLive }
  }, [onHover, onPick, onLive])

  useEffect(() => {
    hlRef.current = highlight
    handleRef.current?.setHighlight(highlight)
  }, [highlight])

  useEffect(() => {
    const host = hostRef.current
    if (!host || !towers.length || !canUse3D()) return
    let cancelled = false
    let handle: SkyHandle | null = null
    let cancelIdle: (() => void) | null = null
    const drop = () => {
      handle?.dispose()
      handle = null
      handleRef.current = null
    }
    const mount = () => {
      cancelIdle = whenIdle(() => {
        import('./skyline-scene')
          .then(mod => {
            if (cancelled || !hostRef.current) return
            handle = mod.mountSkyline(hostRef.current, towers, {
              onHover: p => cbRef.current.onHover(p),
              onPick: (p, type) => cbRef.current.onPick(p, type),
              onReady: () => cbRef.current.onLive(true),
              onLost: () => {
                cbRef.current.onLive(false)
                drop()
              },
            })
            handleRef.current = handle
            handle.setHighlight(hlRef.current)
          })
          .catch(() => {
            // 받아 오지 못하면 평면 그림이 그대로 남는다
          })
      })
    }
    // 화면 가까이 오면 그때 짓는다
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return
        io.disconnect()
        mount()
      },
      { rootMargin: '600px 0px' },
    )
    io.observe(host)
    return () => {
      cancelled = true
      io.disconnect()
      cancelIdle?.()
      if (handle) cbRef.current.onLive(false)
      drop()
    }
  }, [towers, motion])

  return <div ref={hostRef} className="cs3d-host" aria-hidden="true" />
}
