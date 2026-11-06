'use client'

import { useCallback, useState } from 'react'
import NoticeMap from '../NoticeMap'
import TimeMachine from '../TimeMachine'

/**
 * 지도와 타임머신이 같은 날을 보게 묶는다.
 *
 * 둘은 여전히 따로 선다 — 지도는 날짜가 없으면 예전 그대로이고, 타임머신은 지도 없이도
 * 제 그림을 그린다. 이 감싸개는 고른 날 하나만 건넨다.
 */
export default function MapTimeScope() {
  const [day, setDay] = useState<string | null>(null)
  const [today, setToday] = useState<string | null>(null)
  const [jump, setJump] = useState<{ day: string; n: number } | null>(null)

  const onChange = useCallback((d: string, t: string) => {
    setDay(d)
    setToday(t)
  }, [])

  return (
    <>
      <NoticeMap
        heading={false}
        day={day}
        today={today}
        onToday={() => {
          if (!today) return
          setDay(today)
          setJump(j => ({ day: today, n: (j?.n ?? 0) + 1 }))
        }}
      />
      <TimeMachine jump={jump} onChange={onChange} />
    </>
  )
}
