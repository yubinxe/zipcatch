/**
 * 가점제와 추첨제 — 이 주택형에서 어느 쪽 문이 더 넓은가.
 *
 * 민영주택 일반공급은 같은 공고 안에서도 면적에 따라 가점으로 뽑는 몫과 추첨으로
 * 뽑는 몫이 다르다. 그 비율은 지역의 규제 상태와 전용면적으로 정해진다.
 * 여기서는 그 표를 코드로 옮기고, 내 가점·주택 소유 상태를 얹어 어느 쪽을
 * 노려야 하는지 말한다. 말마다 근거 조문을 붙인다.
 *
 * 근거: 주택공급에 관한 규칙 제28조(2023.4.1. 시행 비율, 2026.6.15. 시행 현행본 유지 확인).
 * 조문 번호의 항·호 단위는 법령 원문 대조 전이므로 '제28조' 단위로만 적는다.
 *
 * 당첨 확률은 만들지 않는다. 공개된 당첨가점 통계와 내 가점의 거리, 그리고
 * 물량의 크기만 말한다.
 */

export type Zone = 'SPECULATION' | 'ADJUSTED' | 'NONE'
export type Ownership = 'NONE' | 'ONE' | 'MULTI'

export const ZONE_LABEL: Record<Zone, string> = {
  SPECULATION: '투기과열지구',
  ADJUSTED: '조정대상지역',
  NONE: '비규제지역',
}

export const OWNERSHIP_LABEL: Record<Ownership, string> = {
  NONE: '무주택',
  ONE: '1주택',
  MULTI: '2주택 이상',
}

const BASIS_RATIO_85 = '주택공급에 관한 규칙 제28조(85㎡ 이하 가점제 비율)'
const BASIS_RATIO_OVER = '주택공급에 관한 규칙 제28조(85㎡ 초과 가점제 비율)'
const BASIS_EXCLUDE = '주택공급에 관한 규칙 제28조·별표 1 비고(주택 소유 세대의 가점제 제외)'
const BASIS_LOTTERY = '주택공급에 관한 규칙 제28조(추첨 물량 75% 무주택자 우선)'
const BASIS_LOSER = '주택공급에 관한 규칙 제28조(가점제 낙첨자의 추첨제 자동 포함)'
const BASIS_RANK = '주택공급에 관한 규칙 제28조(규제지역 1순위 — 2주택 이상 세대 제외)'

/**
 * 규제지역 — 2025.10.15. 대책(10.16. 효력)과 2026.7.1. 추가 지정.
 * 지정된 곳은 모두 투기과열지구 겸 조정대상지역이다.
 * 지정·해제는 수시로 바뀐다. 그래서 이 값은 '추정'으로만 쓰고, 화면에서 바꿀 수 있게 둔다.
 */
const REGULATED_GYEONGGI = [
  '과천', '광명', '분당', '수정구', '중원구', '영통', '장안구', '팔달',
  '동안구', '수지', '의왕', '하남', '동탄', '기흥', '구리',
]
export const REGULATED_AS_OF = '2026.7.1. 지정 기준'

export function guessZone(text: string): Zone {
  const s = (text ?? '').replace(/\s+/g, ' ')
  if (/서울/.test(s)) return 'SPECULATION'
  if (/경기|과천|광명|성남|수원|안양|용인|의왕|하남|화성|구리/.test(s) && REGULATED_GYEONGGI.some(k => s.includes(k))) {
    return 'SPECULATION'
  }
  return 'NONE'
}

/** 가점 비율(%) — 비규제 85㎡ 이하는 '40% 이하에서 시장·군수·구청장이 공고'라 범위로 준다 */
export function scoreShare(zone: Zone, area: number): { min: number; max: number; basis: string } {
  if (area > 85) {
    if (zone === 'SPECULATION') return { min: 80, max: 80, basis: BASIS_RATIO_OVER }
    if (zone === 'ADJUSTED') return { min: 50, max: 50, basis: BASIS_RATIO_OVER }
    return { min: 0, max: 0, basis: BASIS_RATIO_OVER }
  }
  if (zone === 'NONE') return { min: 0, max: 40, basis: BASIS_RATIO_85 }
  return area <= 60 ? { min: 40, max: 40, basis: BASIS_RATIO_85 } : { min: 70, max: 70, basis: BASIS_RATIO_85 }
}

export type Route = 'SCORE' | 'BOTH' | 'DRAW' | 'DRAW_ONLY' | 'RANK2'

export interface Reference {
  avg: number
  min: number
  label: string
}

export interface Verdict {
  route: Route
  headline: string
  reasons: { text: string; basis: string }[]
  score: { min: number; max: number }
  draw: { min: number; max: number }
  /** 일반공급 세대수가 있으면 가점·추첨 세대수 */
  units: { score: [number, number]; draw: [number, number] } | null
}

export function judge(input: {
  zone: Zone
  area: number
  ownership: Ownership
  myScore: number
  ref: Reference | null
  households: number | null
}): Verdict {
  const { zone, area, ownership, myScore, ref, households } = input
  const s = scoreShare(zone, area)
  const draw = { min: 100 - s.max, max: 100 - s.min }
  const units = households
    ? {
        score: [Math.floor((households * s.min) / 100), Math.floor((households * s.max) / 100)] as [number, number],
        draw: [households - Math.floor((households * s.max) / 100), households - Math.floor((households * s.min) / 100)] as [number, number],
      }
    : null
  const reasons: Verdict['reasons'] = [
    {
      text:
        s.min === s.max
          ? `${ZONE_LABEL[zone]} 전용 ${area}㎡ — 가점 ${s.max}% · 추첨 ${100 - s.max}%`
          : `${ZONE_LABEL[zone]} 전용 85㎡ 이하 — 가점은 0~40% 안에서 공고문이 정하고, 나머지는 추첨`,
      basis: s.basis,
    },
  ]
  const regulated = zone !== 'NONE'
  const base = { score: { min: s.min, max: s.max }, draw, units }

  if (ownership === 'MULTI' && regulated) {
    reasons.push({ text: '규제지역에서 2주택 이상 세대는 1순위가 될 수 없어 2순위(추첨)로만 넣습니다.', basis: BASIS_RANK })
    return { ...base, route: 'RANK2', headline: '2순위 추첨만 가능합니다', reasons }
  }
  if (ownership !== 'NONE' && (regulated || area > 85)) {
    reasons.push({ text: '주택을 가진 세대는 이 물량의 가점제에서 빠지고 추첨제에만 들어갑니다.', basis: BASIS_EXCLUDE })
    if (regulated) {
      reasons.push({ text: '추첨 물량의 75%는 무주택자가 먼저 가져가고, 남은 몫을 무주택자와 함께 다툽니다.', basis: BASIS_LOTTERY })
    }
    return { ...base, route: 'DRAW_ONLY', headline: '추첨제만 노릴 수 있습니다', reasons }
  }
  if (ownership !== 'NONE') {
    reasons.push({ text: '비규제 85㎡ 이하는 주택을 가져도 가점제에 넣을 수 있지만 무주택기간은 0점입니다.', basis: BASIS_EXCLUDE })
  }
  if (s.max === 0) {
    reasons.push({ text: '가점 물량이 없어 전부 추첨으로 뽑습니다. 가점이 낮아도 불리하지 않습니다.', basis: s.basis })
    return { ...base, route: 'DRAW', headline: '전량 추첨 — 가점과 무관합니다', reasons }
  }
  if (ownership === 'NONE') {
    reasons.push({ text: '가점제에서 떨어지면 따로 신청하지 않아도 같은 순위 추첨에 들어갑니다.', basis: BASIS_LOSER })
    if (regulated) {
      reasons.push({ text: '추첨 물량의 75%는 무주택자에게 먼저 배정됩니다 — 추첨에서도 유주택자보다 앞섭니다.', basis: BASIS_LOTTERY })
    }
  }
  if (!ref) {
    return {
      ...base,
      route: 'BOTH',
      headline: '가점·추첨 둘 다 열려 있습니다',
      reasons: [...reasons, { text: '비교할 당첨가점 통계를 불러오지 못해 유불리는 말하지 않습니다.', basis: '청약홈 당첨가점 통계' }],
    }
  }
  const gapAvg = Math.round((myScore - ref.avg) * 10) / 10
  const gapMin = Math.round((myScore - ref.min) * 10) / 10
  if (myScore >= ref.avg) {
    reasons.push({ text: `내 가점 ${myScore}점은 ${ref.label} 평균 당첨가점 ${ref.avg}점보다 ${gapAvg}점 높습니다.`, basis: '청약홈 당첨가점 통계' })
    return { ...base, route: 'SCORE', headline: '가점제가 유리합니다', reasons }
  }
  if (myScore >= ref.min) {
    reasons.push({
      text: `내 가점은 최저 당첨가점 ${ref.min}점보다 ${gapMin}점 높지만 평균 ${ref.avg}점에는 ${Math.abs(gapAvg)}점 모자랍니다.`,
      basis: '청약홈 당첨가점 통계',
    })
    return { ...base, route: 'BOTH', headline: '가점으로 도전하고, 추첨이 받쳐 줍니다', reasons }
  }
  reasons.push({ text: `내 가점은 최저 당첨가점 ${ref.min}점보다 ${Math.abs(gapMin)}점 낮습니다.`, basis: '청약홈 당첨가점 통계' })
  return {
    ...base,
    route: 'DRAW',
    headline: draw.max >= 50 ? '추첨제가 유리합니다 — 추첨 물량이 넉넉합니다' : '추첨제가 유리하지만 추첨 물량이 적습니다',
    reasons,
  }
}
