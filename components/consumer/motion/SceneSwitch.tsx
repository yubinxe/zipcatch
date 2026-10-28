'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'

/**
 * 장면 넘기기 — 나가는 장면과 들어오는 장면을 한 칸에 겹쳐 세운다.
 *
 * 들어오는 장면은 열쇠(index)가 바뀔 때마다 새로 붙어 CSS 가 제 박자(`.cs-beat`)를
 * 차례로 들인다. 나가는 장면은 같은 상태로 한 번 더 그려(ghost) 방향대로 밀려나며
 * 흐려지고, 애니메이션이 끝나면 걷힌다.
 *
 * 둘은 같은 격자 칸(grid-area 1/1)에 겹친다. 절대 위치로 띄우지 않으니 나가는
 * 동안에는 둘 중 더 큰 키를 지키고, 아래 글이 그 사이에 위로 끌려 올라오지 않는다.
 *
 * 나가는 장면은 `inert` · `aria-hidden` — 손도, 초점도, 화면 읽기도 닿지 않는다.
 * 움직임을 줄이면 CSS 가 나가는 장면을 아예 그리지 않고, 걷는 일은 타이머가 맡는다.
 */

export type SceneEnter = 'rise' | 'fwd' | 'back'

export interface SceneMotion {
  /** 지금 들어와 있는 장면이 어느 쪽에서 왔는지 — 걷힌 뒤에도 바꾸지 않는다 */
  enter: SceneEnter
  /** 나가는 중인 장면. n 은 매번 새로 붙는 번호 */
  leave: { from: number; n: number } | null
  n: number
}

/** 넘기는 손잡이. 앞으로 가면 왼쪽으로, 뒤로 가면 오른쪽으로 밀어낸다 */
export function useSceneMotion() {
  const [motion, setMotion] = useState<SceneMotion>({ enter: 'rise', leave: null, n: 0 })

  /** from → to 로 넘어갈 때 부른다(같은 장면이면 아무 일도 없다) */
  const turn = useCallback((from: number, to: number) => {
    if (from === to) return
    setMotion(m => ({ enter: to > from ? 'fwd' : 'back', leave: { from, n: m.n + 1 }, n: m.n + 1 }))
  }, [])

  /** 나가는 장면이 다 빠졌을 때 — 그 사이 다시 넘겼다면 새 것은 두고 간다 */
  const settle = useCallback((n: number) => {
    setMotion(m => (m.leave && m.leave.n === n ? { ...m, leave: null } : m))
  }, [])

  return { motion, turn, settle }
}

/** 나가는 장면이 애니메이션 끝 소식을 못 주는 경우(움직임 줄이기 등)의 안전판 */
const LEAVE_FALLBACK_MS = 900

export default function SceneSwitch({
  index,
  motion,
  onSettled,
  render,
  className,
}: {
  index: number
  motion: SceneMotion
  onSettled: (n: number) => void
  /** ghost 가 참이면 나가는 그림자다 — id 처럼 겹치면 안 되는 것은 빼고 그린다 */
  render: (index: number, ghost: boolean) => ReactNode
  className?: string
}) {
  const { leave, enter } = motion

  useEffect(() => {
    if (!leave) return
    const id = window.setTimeout(() => onSettled(leave.n), LEAVE_FALLBACK_MS)
    return () => window.clearTimeout(id)
  }, [leave, onSettled])

  return (
    <div className={['cs-scenes', className].filter(Boolean).join(' ')} data-enter={enter}>
      <div key={`in-${index}`} className="cs-scenes__layer" data-layer="in">
        {render(index, false)}
      </div>
      {leave && leave.from !== index && (
        <div
          key={`out-${leave.n}`}
          className="cs-scenes__layer"
          data-layer="out"
          aria-hidden="true"
          inert
          onAnimationEnd={e => {
            // 안쪽 요소의 애니메이션 끝 소식도 거품처럼 올라온다 — 제 것만 듣는다
            if (e.target === e.currentTarget) onSettled(leave.n)
          }}
        >
          {render(leave.from, true)}
        </div>
      )}
    </div>
  )
}
