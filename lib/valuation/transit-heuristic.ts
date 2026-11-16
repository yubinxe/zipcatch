/**
 * 역세권 가격 보정 가설 V0 — 연구용 계산기.
 *
 * 원문: docs/domain/transit-premium-hypothesis-v0.md
 * 증거 수준: 현업 경험칙, 검증 전. 공식 가격·공고 금액·감정평가에 쓰지 않는다.
 * 화면에 내보내지 않는다 — 실거래 검증이 끝나기 전까지 연구 시나리오에서만 부른다.
 *
 * 원문 계수는 바꾸지 않는다. 보정된 모형이 나오면 새 식별자로 따로 둔다.
 */

export const TRANSIT_HEURISTIC_ID = 'transit-premium-heuristic-v0' as const
export const TRANSIT_HEURISTIC_EVIDENCE = 'PRACTITIONER_HEURISTIC_UNVALIDATED' as const

/** 거리(m) → 계수. 원문의 네 기준점 그대로, 가까운 순 */
export const DISTANCE_ANCHORS: readonly { meters: number; factor: number }[] = Object.freeze([
  { meters: 100, factor: 1.2 },
  { meters: 200, factor: 1.17 },
  { meters: 500, factor: 1.1 },
  { meters: 1000, factor: 1.0 },
])

/** 운행 노선 수 → 계수. 원문은 1~3개만 말한다 */
export const LINE_FACTORS: Readonly<Record<1 | 2 | 3, number>> = Object.freeze({ 1: 1.0, 2: 1.05, 3: 1.08 })

/**
 * 거리 계수를 읽는 방식.
 * - ANCHOR_ONLY: 원문 기준점과 정확히 같은 거리만 답한다. 그 밖은 null.
 * - LINEAR_BETWEEN_ANCHORS: 기준점 사이를 곧게 잇는 시나리오. 원문이 준 함수가 아니다 —
 *   199m 와 201m 가 계단처럼 갈리지 않게 하려는 가정이며, 결과에 그 사실을 함께 싣는다.
 * 어느 방식도 100m 안·1,000m 밖으로 외삽하지 않는다.
 */
export type DistanceMode = 'ANCHOR_ONLY' | 'LINEAR_BETWEEN_ANCHORS'

export interface FactorResult {
  factor: number | null
  /** factor 가 null 인 이유, 또는 값에 붙는 가정 */
  note: string
}

export function distanceFactor(meters: number, mode: DistanceMode = 'ANCHOR_ONLY'): FactorResult {
  if (!Number.isFinite(meters) || meters < 0) return { factor: null, note: '거리가 올바르지 않습니다.' }
  const first = DISTANCE_ANCHORS[0]
  const last = DISTANCE_ANCHORS[DISTANCE_ANCHORS.length - 1]
  if (meters < first.meters) return { factor: null, note: '원문 범위(100m) 안쪽은 정해지지 않았습니다 — 외삽하지 않습니다.' }
  if (meters > last.meters) return { factor: null, note: '원문 범위(1,000m) 밖은 정해지지 않았습니다 — 감가를 지어내지 않습니다.' }

  const exact = DISTANCE_ANCHORS.find(a => a.meters === meters)
  if (exact) return { factor: exact.factor, note: '원문 기준점' }
  if (mode === 'ANCHOR_ONLY') return { factor: null, note: '원문 기준점(100·200·500·1,000m)이 아닙니다.' }

  for (let i = 0; i < DISTANCE_ANCHORS.length - 1; i++) {
    const a = DISTANCE_ANCHORS[i]
    const b = DISTANCE_ANCHORS[i + 1]
    if (meters > a.meters && meters < b.meters) {
      const t = (meters - a.meters) / (b.meters - a.meters)
      return { factor: round4(a.factor + (b.factor - a.factor) * t), note: '기준점 사이 직선 보간 — 원문에 없는 가정' }
    }
  }
  return { factor: null, note: '범위를 찾지 못했습니다.' }
}

export function lineFactor(uniqueOperatingLines: number): FactorResult {
  if (!Number.isInteger(uniqueOperatingLines) || uniqueOperatingLines < 1) {
    return { factor: null, note: '운행 노선이 없거나 수가 올바르지 않습니다.' }
  }
  if (uniqueOperatingLines > 3) return { factor: null, note: '원문은 3개 노선까지만 말합니다 — 외삽하지 않습니다.' }
  return { factor: LINE_FACTORS[uniqueOperatingLines as 1 | 2 | 3], note: '원문 계수' }
}

export interface ScenarioInput {
  distanceMeters: number
  uniqueOperatingLines: number
  mode?: DistanceMode
}

export interface Scenario {
  model: typeof TRANSIT_HEURISTIC_ID
  evidence: typeof TRANSIT_HEURISTIC_EVIDENCE
  distance: FactorResult
  lines: FactorResult
  /** 두 계수의 곱. 어느 하나라도 정해지지 않으면 null */
  factor: number | null
  /** 이 숫자를 읽을 때 반드시 함께 적는 단서 */
  caveats: string[]
}

const CAVEATS = [
  '현업 경험칙이며 실거래로 검증되지 않았습니다.',
  '두 계수를 곱하는 것은 거리와 노선 수의 효과가 서로 독립이라고 가정하는 것입니다.',
  '기준 물건과 시장(지역)을 정하지 않으면 이 숫자는 의미가 없습니다.',
  '감정평가가 아니며 공고문의 공식 금액을 바꾸지 않습니다.',
]

/** 연구 시나리오: 거리 계수 × 노선 계수 */
export function heuristicScenario({ distanceMeters, uniqueOperatingLines, mode = 'ANCHOR_ONLY' }: ScenarioInput): Scenario {
  const distance = distanceFactor(distanceMeters, mode)
  const lines = lineFactor(uniqueOperatingLines)
  const factor = distance.factor !== null && lines.factor !== null ? round4(distance.factor * lines.factor) : null
  return { model: TRANSIT_HEURISTIC_ID, evidence: TRANSIT_HEURISTIC_EVIDENCE, distance, lines, factor, caveats: CAVEATS }
}

/**
 * 비교 사례 맞추기(실험). 사례가에는 이미 사례 자신의 역세권 효과가 들어 있으므로
 * 대상 계수 전부가 아니라 두 계수의 비만 곱한다 — 중복 보정을 막는다.
 */
export function adjustComparable(comparablePrice: number, subjectFactor: number, comparableFactor: number): number | null {
  if (![comparablePrice, subjectFactor, comparableFactor].every(Number.isFinite)) return null
  if (comparablePrice <= 0 || subjectFactor <= 0 || comparableFactor <= 0) return null
  return Math.round(comparablePrice * (subjectFactor / comparableFactor))
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000
}
