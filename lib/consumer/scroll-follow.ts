/**
 * 스크롤 진행률을 따라가는 공용 규칙 — 홈의 장면(ScrollStage)과 지면(Reveal scrub)이 함께 쓴다.
 *
 * 진행률을 스크롤 위치에 그대로 꽂으면 빠르게 굴리는 한 프레임에 장면이 0.3씩 건너뛴다 —
 * 깊이·빛·크기가 툭 바뀌고, 역방향으로 굴려도 같다. 목표값은 그대로 재되, 화면에 적는 값은
 * 시간상수 FOLLOW_MS 로 쫓아가게 한다. 천천히 굴리면 지연이 거의 없고(한 프레임에 1/7 쯤),
 * 휙 굴리면 한두 프레임에 걸쳐 이어진다. 프레임이 늦게 와도 경과 시간으로 계산해 속도가 같다.
 */
export const FOLLOW_MS = 110

/** 지난 값에서 목표로 dtMs 만큼 다가간 값. 충분히 가까우면 목표에 붙인다 */
export function follow(current: number, target: number, dtMs: number): number {
  const a = 1 - Math.exp(-Math.min(dtMs, 100) / FOLLOW_MS)
  const next = current + (target - current) * a
  return Math.abs(target - next) < 0.0015 ? target : next
}
