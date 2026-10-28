'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'

/**
 * 화면 들어서기 — 소비자 화면을 옮길 때마다 한 번.
 *
 * 화면은 어둠 속에서 떠오른다(투명도만). 나머지 움직임은 각 화면의 첫 장면이 맡는다 —
 * 하위 화면은 머리 무대(PageMasthead)의 바닥이 다가오고 집이 솟으며, 조건 찾기는
 * 장면이 차례로 선다. 여기서 transform 을 걸면 그 동안 안쪽의 fixed 요소(마감 티커,
 * 기다림 카드)가 이 상자를 기준으로 붙고 붙는 장면(sticky)이 풀린다. 그래서 투명도만,
 * 그리고 끝나면 아무 값도 남기지 않는다(consumer-motion.css 2절).
 *
 * 첫 방문의 첫 그림에는 걸지 않는다. 서버가 그린 화면이 곧바로 보여야 첫 화면이
 * 늦게 뜨지 않는다 — 움직임은 화면을 '옮겨 왔을 때'만이다.
 *
 * template 은 첫 단(공고·지도·가이드…)이 바뀔 때만 새로 붙는다. 공고 목록에서 공고
 * 하나로 들어가는 것처럼 같은 단 안에서 옮길 때도 들어서는 장면이 보이도록, 안쪽
 * 상자는 주소(pathname)를 열쇠로 다시 붙인다. 검색어(?…)만 바뀔 때는 그대로 둔다.
 */

/** 이 탭에서 한 번이라도 화면을 그렸는지 — 모듈에 둔다(화면을 옮겨도 남는다) */
let painted = false

export default function ConsumerTemplate({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  // 붙을 때의 값으로 고정한다 — 서버가 그린 첫 화면과 어긋나지 않게
  const [moved] = useState(() => painted)
  const [born] = useState(pathname)

  useEffect(() => {
    painted = true
  }, [])

  return (
    <div key={pathname} className="cs-enter" data-enter={moved || pathname !== born ? 'nav' : undefined}>
      {children}
    </div>
  )
}
