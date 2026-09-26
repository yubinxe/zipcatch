/**
 * 민영·국민 일반공급 가점 계산과 "과거 당첨가점 참고 비교".
 *
 * 당첨 확률은 산출하지 않는다.
 * 검증되지 않은 계수로 만든 확률(%)은 공식 예측처럼 읽히므로 제공하지 않으며,
 * 대신 공개 통계상의 평균·최저 당첨가점과 내 가점의 실제 차이만 보여준다.
 *
 * 가점 산식 자체의 공식 정확성은 별도 검증 전까지 확정하지 않는다.
 */

export interface ScoreInput {
  /** 무주택 기간 (년) */
  homelessYears: number
  /** 부양가족 수 (본인 제외, 0~6명) */
  dependents: number
  /** 청약통장 가입 기간 (년) */
  accountYears: number
}

export interface ScoreBreakdown {
  homeless: number
  dependents: number
  account: number
  total: number
}

export interface ReferenceStats {
  avg: number
  min: number
  max: number
  median: number
  regionName: string
  statMonth: string
  /** 집계에 사용한 공개 통계 행 수. 0이면 비교를 제공하지 않는다 */
  sampleCount: number
}

/**
 * 내 가점이 과거 당첨가점 분포의 어디쯤인지.
 * 확률이 아니라 위치다.
 */
export type ComparisonBand = 'above' | 'near' | 'below' | 'insufficient'

export interface ScoreComparison {
  band: ComparisonBand
  /** 자료가 부족하면 false — 이때 비교 문구를 분석처럼 표시하지 않는다 */
  dataSufficient: boolean
  headline: string
  insight: string
  detail: string
  /** 평균 당첨가점과의 차이 (양수면 내가 높음). 자료 부족 시 null */
  gapToAverage: number | null
  /** 최저 당첨가점과의 차이. 자료 부족 시 null */
  gapToCutline: number | null
  breakdown: ScoreBreakdown
  reference: ReferenceStats | null
}

export const SCORE_LIMITS = {
  homelessYearsMax: 16,
  dependentsMax: 6,
  accountYearsMax: 17,
} as const

export function clampHomelessYears(years: number) {
  return Math.min(SCORE_LIMITS.homelessYearsMax, Math.max(0, Math.floor(years)))
}

export function calculateSubscriptionScore(input: ScoreInput): ScoreBreakdown {
  const homeless = Math.min(Math.max(0, Math.floor(input.homelessYears)) * 2, 32)
  const dependents = Math.min(Math.max(0, Math.floor(input.dependents)) * 5, 35)
  const account = Math.min(Math.max(0, Math.floor(input.accountYears)), 17)
  return { homeless, dependents, account, total: homeless + dependents + account }
}

/**
 * 내 가점을 과거 당첨가점 통계와 비교한다.
 * ref 가 없거나 표본이 0이면 비교하지 않고 자료 부족으로 표시한다.
 */
export function compareToReference(
  userScore: number,
  ref: ReferenceStats | null,
  complexName?: string,
): Omit<ScoreComparison, 'breakdown'> {
  if (!ref || ref.sampleCount === 0) {
    return {
      band: 'insufficient',
      dataSufficient: false,
      headline: '비교할 공개 통계가 아직 없습니다',
      insight:
        '선택하신 조건에 해당하는 당첨가점 통계를 불러오지 못했습니다. 자료가 없는 상태에서 임의의 평균이나 확률을 만들어 보여드리지 않습니다.',
      detail: '지역이나 기간을 바꾸면 집계된 통계가 있을 수 있습니다.',
      gapToAverage: null,
      gapToCutline: null,
      reference: ref,
    }
  }

  /*
   * 아직 아무것도 입력하지 않은 상태.
   *
   * 0점으로도 비교식은 돌아간다 — "평균 48.3점이 내 가점 0점보다 48.3점
   * 높습니다". 틀린 말은 아니지만, 화면을 연 사람이 가장 먼저 읽는 문장이
   * "당신은 평균보다 낮습니다"가 된다. 아무것도 하지 않았는데 나쁜 소식을
   * 먼저 듣는 셈이라, 입력 전에는 비교하지 않고 기준값만 놓는다.
   */
  if (userScore <= 0) {
    return {
      band: 'insufficient',
      dataSufficient: true,
      headline: '세 항목을 움직여 보세요',
      insight: `${
        complexName ? `「${complexName}」` : `${ref.regionName} 최근 당첨 통계`
      } 기준 평균 당첨가점은 ${ref.avg.toFixed(1)}점, 최저 당첨가점은 ${ref.min.toFixed(1)}점입니다.`,
      detail: '왼쪽에서 무주택 기간·부양가족·통장 가입기간을 맞추면 내 점수가 어디쯤인지 함께 보여드려요.',
      gapToAverage: null,
      gapToCutline: null,
      reference: ref,
    }
  }

  const gapToAverage = Math.round((userScore - ref.avg) * 10) / 10
  const gapToCutline = Math.round((userScore - ref.min) * 10) / 10
  const absAvg = Math.abs(gapToAverage)

  const band: ComparisonBand = gapToAverage > 0.5 ? 'above' : gapToAverage < -0.5 ? 'below' : 'near'

  const target = complexName ? `「${complexName}」` : `${ref.regionName} 최근 당첨 통계`

  const insight =
    band === 'above'
      ? `${target} 기준, 내 가점(${userScore}점)이 평균 당첨가점 ${ref.avg.toFixed(1)}점보다 ${absAvg}점 높습니다.`
      : band === 'below'
        ? `${target} 기준, 평균 당첨가점 ${ref.avg.toFixed(1)}점이 내 가점(${userScore}점)보다 ${absAvg}점 높습니다.`
        : `${target} 기준, 내 가점(${userScore}점)은 평균 당첨가점 ${ref.avg.toFixed(1)}점과 비슷한 수준입니다.`

  const detail =
    gapToCutline >= 5
      ? `최저 당첨가점 ${ref.min.toFixed(1)}점보다 ${gapToCutline}점 높습니다.`
      : gapToCutline >= 0
        ? `최저 당첨가점 ${ref.min.toFixed(1)}점과 ${gapToCutline}점 차이입니다. 공고·면적별로 편차가 큽니다.`
        : `최저 당첨가점 ${ref.min.toFixed(1)}점보다 ${Math.abs(gapToCutline)}점 낮습니다. 특별공급 등 다른 경로도 함께 확인해 보세요.`

  const headline =
    band === 'above'
      ? '평균 당첨가점보다 높습니다'
      : band === 'below'
        ? '평균 당첨가점보다 낮습니다'
        : '평균 당첨가점과 비슷합니다'

  return { band, dataSufficient: true, headline, insight, detail, gapToAverage, gapToCutline, reference: ref }
}

export function buildComparison(
  input: ScoreInput,
  ref: ReferenceStats | null,
  complexName?: string,
): ScoreComparison {
  const breakdown = calculateSubscriptionScore(input)
  return { ...compareToReference(breakdown.total, ref, complexName), breakdown }
}

export function aggregateReferenceStats(
  rows: {
    AVRG_SCORE: string
    LWET_SCORE: string
    TOP_SCORE: string
    MED_SCORE?: string
    SUBSCRPT_AREA_CODE_NM?: string
    STAT_DE?: string
  }[],
  regionName: string,
): ReferenceStats | null {
  if (rows.length === 0) return null

  /**
   * 0 점은 집계에서 뺀다.
   *
   * 가점제로 0 점에 당첨되는 일은 사실상 없다. 청약홈 통계의 0 은
   * '가점제 당첨 없음' 또는 '미발표'를 뜻하는 자리표다. 그대로 세면
   * 최저 당첨가점이 0 점으로 떨어지고, 평균도 함께 끌려 내려간다.
   */
  const usable = (v: number) => Number.isFinite(v) && v > 0

  const avgs = rows.map(r => parseFloat(r.AVRG_SCORE)).filter(usable)
  const mins = rows.map(r => parseFloat(r.LWET_SCORE)).filter(usable)
  const maxs = rows.map(r => parseFloat(r.TOP_SCORE)).filter(usable)
  const meds = rows.map(r => parseFloat(r.MED_SCORE || r.AVRG_SCORE)).filter(usable)

  if (avgs.length === 0) return null

  const avg = avgs.reduce((a, b) => a + b, 0) / avgs.length
  // 없는 값을 추정으로 채우지 않는다. 실제로 집계된 값만 쓴다.
  if (mins.length === 0 || maxs.length === 0) return null

  const median = meds.length ? meds.reduce((a, b) => a + b, 0) / meds.length : avg
  // 열두 달을 모아 세므로 한 달을 적으면 거짓이 된다. 기간으로 적는다.
  const months = (rows.map(r => r.STAT_DE).filter(Boolean) as string[]).sort()
  const label = (m: string) => (m.length === 6 ? `${m.slice(0, 4)}.${m.slice(4, 6)}` : m)
  const first = months[0]
  const last = months[months.length - 1]
  const statMonth = !first ? '' : first === last ? label(first) : `${label(first)} ~ ${label(last)}`

  return {
    avg: Math.round(avg * 10) / 10,
    min: Math.round(Math.min(...mins) * 10) / 10,
    max: Math.round(Math.max(...maxs) * 10) / 10,
    median: Math.round(median * 10) / 10,
    regionName,
    statMonth,
    sampleCount: rows.length,
  }
}

export function clampDependents(n: number) {
  return Math.min(SCORE_LIMITS.dependentsMax, Math.max(0, Math.floor(n)))
}

export function clampAccountYears(years: number) {
  return Math.min(SCORE_LIMITS.accountYearsMax, Math.max(0, Math.floor(years)))
}
