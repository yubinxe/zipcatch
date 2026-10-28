'use client'

import { useEffect, useRef, useState } from 'react'
import { KOREA_PROVINCES } from '@/lib/korea-map-data'
import { KOREA_REGIONS } from '@/lib/korea-regions'
import { canUse3D, onMotionPreference, whenIdle } from './support'
import type { AtlasHandle, AtlasProvinceInput, AtlasState } from './atlas-scene'

/**
 * 첫 화면 입체 지도의 껍데기.
 *
 * 이 파일은 three 를 부르지 않는다. 첫 화면이 다 그려지고 브라우저가 한가해진
 * 뒤에야 `atlas-scene`(three 포함)을 따로 받아 온다. 그동안, 그리고 WebGL 이
 * 없거나 움직임을 줄여 달라고 한 사람에게는 HeroAtlas 의 평면 지도가 그대로
 * 남는다. 같은 칸을 겹쳐 쓰므로 바뀌는 순간 화면이 밀리지 않는다.
 */

const NAMES = new Map(KOREA_REGIONS.map(r => [r.code, r.name]))
const INPUT: AtlasProvinceInput[] = KOREA_PROVINCES.map(p => ({
  code: p.code,
  name: NAMES.get(p.code) ?? p.name,
  path: p.path,
}))

interface Props {
  state: AtlasState
  onHover: (code: string | null) => void
  onPick: (code: string) => void
  /** 입체가 첫 장을 그렸으면 true, 내려가거나 맥락을 잃으면 false */
  onLive: (live: boolean) => void
}

export default function Atlas3D({ state, onHover, onPick, onLive }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<AtlasHandle | null>(null)
  const stateRef = useRef(state)
  const cbRef = useRef({ onHover, onPick, onLive })
  /** 움직임 설정이 바뀔 때마다 늘어난다 — 아래 장면을 내렸다가(또는 다시) 세운다 */
  const [motion, setMotion] = useState(0)

  useEffect(() => onMotionPreference(() => setMotion(m => m + 1)), [])

  useEffect(() => {
    cbRef.current = { onHover, onPick, onLive }
  }, [onHover, onPick, onLive])

  useEffect(() => {
    stateRef.current = state
    handleRef.current?.update(state)
  }, [state])

  useEffect(() => {
    if (!canUse3D()) return
    let cancelled = false
    let handle: AtlasHandle | null = null
    const drop = () => {
      handle?.dispose()
      handle = null
      handleRef.current = null
    }
    const cancelIdle = whenIdle(() => {
      import('./atlas-scene')
        .then(mod => {
          const host = hostRef.current
          if (cancelled || !host) return
          handle = mod.mountAtlas(host, INPUT, {
            onHover: c => cbRef.current.onHover(c),
            onPick: c => cbRef.current.onPick(c),
            onReady: () => cbRef.current.onLive(true),
            onLost: () => {
              cbRef.current.onLive(false)
              drop()
            },
          })
          handleRef.current = handle
          handle.update(stateRef.current)
        })
        .catch(() => {
          // 받아 오지 못하면 평면 지도가 그대로 남는다
        })
    })
    return () => {
      cancelled = true
      cancelIdle()
      if (handle) cbRef.current.onLive(false)
      drop()
    }
  }, [motion])

  return <div ref={hostRef} className="cs3d-host" aria-hidden="true" />
}
