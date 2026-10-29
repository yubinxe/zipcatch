'use client'

import { useEffect, useRef, useState } from 'react'
import { KOREA_PROVINCES } from '@/lib/korea-map-data'
import { canUse3D, onMotionPreference, whenIdle } from './support'
import type { StatementDatum, StatementHandle, StatementInput } from './statement-scene'

/**
 * 장면 1(ONE MAP) 입체 지도의 껍데기.
 *
 * 이 파일은 three 를 부르지 않는다. 첫 화면이 다 그려지고 브라우저가 한가해진 뒤에야
 * `statement-scene`(three 포함)을 받아 온다. 그동안, 그리고 WebGL 이 없거나 움직임을
 * 줄여 달라고 했거나 좁은 화면(휴대폰)에서는 같은 칸의 CSS 입체 지도가 그대로 남는다.
 *
 * 진행 값은 무대(.cs-stage__pin)의 인라인 `--p` 를 매 장면 읽는다 — ScrollStage 가
 * 적는 바로 그 값이다. React 상태는 스크롤마다 바뀌지 않는다.
 */

const INPUT: StatementInput[] = KOREA_PROVINCES.map(p => ({ code: p.code, path: p.path }))
/** 이보다 좁으면 입체(WebGL)를 세우지 않는다 — 글 뒤에 깔리는 작은 지도에는 CSS 로 충분하다 */
const WIDE = '(min-width: 761px)'

interface Props {
  data: StatementDatum[] | null
  /** 입체가 첫 장을 그렸으면 true, 내려가거나 맥락을 잃으면 false */
  onLive: (live: boolean) => void
}

export default function Statement3D({ data, onLive }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<StatementHandle | null>(null)
  const dataRef = useRef(data)
  const liveRef = useRef(onLive)
  /** 움직임 설정·화면 폭이 바뀔 때마다 늘어난다 — 아래 장면을 내렸다가(또는 다시) 세운다 */
  const [epoch, setEpoch] = useState(0)

  useEffect(() => {
    const bump = () => setEpoch(e => e + 1)
    const off = onMotionPreference(bump)
    const mq = window.matchMedia(WIDE)
    mq.addEventListener('change', bump)
    return () => {
      off()
      mq.removeEventListener('change', bump)
    }
  }, [])

  useEffect(() => {
    liveRef.current = onLive
  }, [onLive])

  useEffect(() => {
    dataRef.current = data
    if (data) handleRef.current?.update(data)
  }, [data])

  useEffect(() => {
    if (!canUse3D() || !window.matchMedia(WIDE).matches) return
    let cancelled = false
    let handle: StatementHandle | null = null
    const drop = () => {
      handle?.dispose()
      handle = null
      handleRef.current = null
    }
    const cancelIdle = whenIdle(() => {
      import('./statement-scene')
        .then(mod => {
          const host = hostRef.current
          if (cancelled || !host) return
          const pin = host.closest<HTMLElement>('.cs-stage__pin')
          const getP = () => {
            const v = parseFloat(pin?.style.getPropertyValue('--p') ?? '')
            return Number.isFinite(v) ? v : 0
          }
          handle = mod.mountStatement(
            host,
            INPUT,
            {
              onReady: () => liveRef.current(true),
              onLost: () => {
                liveRef.current(false)
                drop()
              },
            },
            getP,
          )
          handleRef.current = handle
          if (dataRef.current) handle.update(dataRef.current)
        })
        .catch(() => {
          // 받아 오지 못하면 CSS 입체 지도가 그대로 남는다
        })
    }, 2000)
    return () => {
      cancelled = true
      cancelIdle()
      if (handle) liveRef.current(false)
      drop()
    }
  }, [epoch])

  return <div ref={hostRef} className="cs3d-host cs-sm-host" aria-hidden="true" />
}
