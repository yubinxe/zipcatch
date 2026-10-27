import type { ReactNode } from 'react'

/**
 * 하위 화면의 첫 장면 — 머리글에서 끊기지 않고 이어지는 밤 무대.
 *
 * 홈의 "One Map" 장면처럼, 어느 화면에 들어서든 먼저 밤의 도시 같은 무대가 열리고
 * 그 아래로 밝은 작업 지면이 이어진다. 화면마다 다른 것은 눈썹·제목·한 줄뿐이고
 * 무대의 틀은 같다 — 그래야 어디를 눌러도 같은 건물 안이라고 느낀다.
 *
 * 무대는 감싸는 cs-wrap 의 폭을 넘어 화면 끝까지 칠한다(box-shadow + clip-path).
 * 글자는 cs-wrap 의 격자에 그대로 선다.
 */
export default function PageMasthead({
  eyebrow,
  title,
  lead,
  children,
}: {
  /** 영문 소제목 — 화면의 이름표 */
  eyebrow: string
  title: ReactNode
  lead?: ReactNode
  /** 제목 아래에 놓일 요약 칩·단추 */
  children?: ReactNode
}) {
  return (
    <header className="cs-mast">
      <div className="cs-mast__sky" aria-hidden="true">
        <span />
        <span />
      </div>
      <p className="cs-mast__eyebrow">{eyebrow}</p>
      <h1 className="cs-mast__title">{title}</h1>
      {lead && <p className="cs-mast__lead">{lead}</p>}
      {children && <div className="cs-mast__extra">{children}</div>}
    </header>
  )
}
