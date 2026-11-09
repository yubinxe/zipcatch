
/**
 * 이 공고에 대해 공간을 어디까지 정직하게 그릴 수 있는가.
 *
 * 전국 어느 공고에서든 공간 탐험으로 들어갈 수 있어야 하지만, 들어간 자리에서
 * 보여 줄 수 있는 것은 공고마다 다르다. 없는 정밀도를 지어내면 그 화면 전체가
 * 거짓이 되므로, 무엇을 그릴 수 있는지를 먼저 한 곳에서 정한다.
 *
 * 등급은 '가진 자료'로만 정한다. 화면은 이 등급을 보고 무엇을 그릴지 고르고,
 * 사용자에게는 등급의 한계를 그대로 적는다.
 *
 *   L1 VERIFIED_MODEL   원문 대조를 마친 공고 + 현장 자료 — 주택형·동·가격까지
 *   L2 VERIFIED_SOURCE  원문 대조는 마쳤으나 현장 자료 없음 — 원문 수치까지
 *   L3 POINT            지오코딩된 좌표 — 그 자리의 지리적 맥락까지
 *   L4 REGION           시·군·구 또는 광역 기준점 — 지역 수준까지
 *   L5 UNKNOWN          위치를 정할 수 없음 — 공간 화면 대신 그 사실을 적는다
 *
 * 이 파일은 '정책'만 담는다 — 등록부를 찾고 좌표를 푸는 일은 부르는 쪽(complex-visualization ·
 * geo)이 하고, 여기서는 그 결과만 보고 등급을 정한다. 가져다 쓰는 것이 없어야 같은 입력에
 * 같은 등급이 나오는지 그 자리에서 시험할 수 있다.
 */

/** geo.ts 의 CoordSource 와 같은 값. 묶어 두면 이 파일이 다시 무거워진다 */
export type CoordKind = 'GEOCODED' | 'DISTRICT' | 'PROVINCE'
export type SpatialLevel =
  | 'VERIFIED_MODEL'
  | 'VERIFIED_SOURCE'
  | 'POINT'
  | 'REGION'
  | 'UNKNOWN'

export interface SpatialInput {
  /** 원문 대조를 마친 공고인가 */
  verified?: boolean
  /** 그 공고에 현장 자료(동·주택형)가 있는가 */
  hasSite?: boolean
  /** 좌표를 어디서 얻었는가. 못 얻었으면 null */
  coord?: CoordKind | null
}

export interface SpatialCapability {
  level: SpatialLevel
  /** 이 등급에서 그려도 되는 것 */
  can: {
    /** 주택형·동 단위의 입체 모형 */
    model: boolean
    /** 건물 하나를 짚는 표식 */
    pinpoint: boolean
    /** 지역 수준의 지리 맥락 */
    regionContext: boolean
  }
  /** 화면에 그대로 적을 위치 정확도 — 짧게 */
  accuracy: string
  /** 이 등급이 '세울 수 없는 것' — 사용자에게 밝힌다 */
  limitation: string
}

const LEVEL_TEXT: Record<SpatialLevel, { accuracy: string; limitation: string }> = {
  VERIFIED_MODEL: {
    accuracy: '공고 원문 대조 · 단지 위치',
    limitation:
      '입체 덩어리는 공개 지도의 동 윤곽에 공고의 최고층을 세운 매스 모형입니다. 실제 외관·창·색은 표현하지 않습니다.',
  },
  VERIFIED_SOURCE: {
    accuracy: '공고 원문 대조 · 현장 도면 없음',
    limitation: '원문의 수치는 확인했지만 동·호 배치 자료가 없어 입체 모형은 세우지 않습니다.',
  },
  POINT: {
    accuracy: '주소 좌표 기준 · 건물 단위 미확인',
    limitation: '좌표는 주소를 옮긴 것이고, 개별 동의 자리와 형상은 확인하지 않았습니다.',
  },
  REGION: {
    accuracy: '지역 기준점 · 정확한 위치 미확인',
    limitation: '표식은 지역의 기준점이며 이 공고의 실제 자리가 아닙니다. 정확한 위치는 공고 원문을 보세요.',
  },
  UNKNOWN: {
    accuracy: '위치 정보 없음',
    limitation: '공고에서 위치를 정할 수 있는 값을 찾지 못했습니다. 공고 원문에서 확인해 주세요.',
  },
}

/** 가진 자료만 보고 등급을 정한다. 추정하지 않는다. */
export function resolveSpatial(input: SpatialInput): SpatialCapability {
  const coord = input.coord ?? null
  const level: SpatialLevel = input.verified
    ? input.hasSite
      ? 'VERIFIED_MODEL'
      : 'VERIFIED_SOURCE'
    : coord === 'GEOCODED'
      ? 'POINT'
      : coord
        ? 'REGION'
        : 'UNKNOWN'

  return {
    level,
    can: {
      model: level === 'VERIFIED_MODEL',
      pinpoint: level === 'VERIFIED_MODEL' || level === 'POINT',
      regionContext: level !== 'UNKNOWN',
    },
    ...LEVEL_TEXT[level],
  }
}

/** 공간 탐험을 열 수 있는가 — UNKNOWN 이어도 연다(그 사실을 알리는 것도 답이다) */
export const canExplore = (c: SpatialCapability) => c.level !== 'UNKNOWN'
