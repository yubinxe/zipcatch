import type { Property } from '@/lib/crm/types'

/**
 * 공고를 화면에서 묶고 줄 세우는 기준.
 *
 * 출처마다 지역과 유형을 적는 방식이 달라서, 그대로 두면 분류표가 뒤섞인다.
 * 청약홈 분양은 `district='서울' region='성북구'` 로 오고, LH 임대는
 * `region='경기' district=null` 로 온다. 한 목록에 섞이면 "경기"와 "성북구"가
 * 같은 줄에 서고, 서울은 자치구로 흩어져 어디에도 없는 것처럼 보인다.
 */

/** 표기가 긴 광역명을 짧은 쪽으로 모은다. 확실한 것만 적는다. */
const PROVINCE_ALIAS: Record<string, string> = {
  서울특별시: '서울',
  부산광역시: '부산',
  대구광역시: '대구',
  인천광역시: '인천',
  광주광역시: '광주',
  대전광역시: '대전',
  울산광역시: '울산',
  세종특별자치시: '세종',
  경기도: '경기',
  강원도: '강원',
  강원특별자치도: '강원',
  충청북도: '충북',
  충청남도: '충남',
  전라북도: '전북',
  전북특별자치도: '전북',
  전라남도: '전남',
  경상북도: '경북',
  경상남도: '경남',
  제주특별자치도: '제주',
}

/**
 * 공고가 속한 광역.
 *
 * 광역이 따로 적혀 있으면 그것을, 없으면 지역명 자체를 광역으로 본다
 * (LH 는 지역본부 단위라 region 이 이미 광역이다).
 * 자치구를 그대로 쓰면 서울 공고 다섯 건이 다섯 개의 분류로 흩어진다.
 */
export function provinceOf(property: Pick<Property, 'region' | 'district'>): string {
  const d = (property.district ?? '').trim()
  if (d) return PROVINCE_ALIAS[d] ?? d
  const r = (property.region ?? '').trim()
  return PROVINCE_ALIAS[r] ?? r
}

/**
 * 임대로 볼 유형.
 *
 * 이름에 '임대'가 들어가면 임대다. 들어가지 않는데 임대인 것만 여기 적는다 —
 * 목록을 넓히면 분양이 임대로 넘어가므로 확실한 것만 둔다.
 */
const RENTAL_WITHOUT_NAME = new Set(['행복주택', '전세임대', '기숙사형', '기숙사형청년주택'])

export function isRental(housingType: string): boolean {
  const t = (housingType ?? '').trim()
  return t.includes('임대') || RENTAL_WITHOUT_NAME.has(t)
}

/**
 * 분양(민간 포함)을 임대보다 앞에 세운다.
 *
 * 임대 공고는 상시로 쏟아지고 분양은 드물게 열린다. 마감순으로만 줄을 세우면
 * 국민임대 쉰 건이 앞을 채우고, 정작 기다리던 분양 공고는 화면 밖으로 밀린다.
 * 0 이 먼저다.
 */
export function kindRank(housingType: string): number {
  return isRental(housingType) ? 1 : 0
}

/**
 * 지도의 칸 이름(17개 광역). 2026년 출범한 전남광주통합특별시는 자료에서 '전남·광주'
 * 하나로 오지만 지도는 광주와 전남을 따로 그린다. 통합시 안에서 '…구'로 끝나는 곳은
 * 옛 광주광역시의 자치구(동·서·남·북·광산구)뿐이라, 그 규칙으로만 가른다 —
 * 근거 없이 아무 칸에 두지 않는다.
 */
export function mapProvince(province: string, region?: string | null): string {
  if (province !== '전남·광주') return province
  return /구$/.test((region ?? '').trim()) ? '광주' : '전남'
}
