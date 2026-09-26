import { createRng } from './rng'
import type { HousingType, Property, PropertyStatus } from './types'

const REGION_DIST = [
  { value: '관악구', weight: 20 },
  { value: '동작구', weight: 16 },
  { value: '마포구', weight: 14 },
  { value: '영등포구', weight: 11 },
  { value: '성동구', weight: 10 },
  { value: '송파구', weight: 9 },
  { value: '서초구', weight: 8 },
  { value: '강남구', weight: 7 },
  { value: '금천구', weight: 3 },
  { value: '서대문구', weight: 2 },
]

const HOUSING_DIST: { value: HousingType; weight: number }[] = [
  { value: '청년매입임대', weight: 34 },
  { value: '행복주택', weight: 30 },
  { value: '공공임대', weight: 16 },
  { value: '공공지원민간임대', weight: 11 },
  { value: '신혼희망타운', weight: 9 },
]

/** 공급기관은 주택유형과 무관하게 섞이지 않는다 */
/**
 * 예시 공고의 출처 표기.
 *
 * 예전에는 'LH 청년매입임대' 처럼 실제 기관명을 적었다. 화면의 '예시' 배지를
 * 놓친 사람에게는 출처와 공고번호가 진짜라고 말하는 셈이라, 배지 하나에
 * 모든 구분을 걸어둔 상태였다. 데이터 자체가 시연용이라고 말하게 한다 —
 * 어디로 새어 나가든 그 자리에서 드러난다.
 */
const DEMO_SOURCE = '집캐치 예시 데이터 (시연용 · 실제 공고 아님)'

/** 유형별 표기는 남겨둔다. 시연 화면에서 유형을 구분해 읽기 위한 것뿐이다 */
const SOURCE_BY_TYPE: Record<HousingType, string[]> = {
  청년매입임대: [DEMO_SOURCE],
  행복주택: [DEMO_SOURCE],
  공공임대: [DEMO_SOURCE],
  공공지원민간임대: [DEMO_SOURCE],
  신혼희망타운: [DEMO_SOURCE],
}

const NAME_HEAD = [
  '행복', '청년', '새길', '도담', '한울', '온누리', '푸른', '해오름', '나래', '별빛',
  '소담', '가온', '다온', '누리', '한빛', '서온', '윤슬', '라온', '아람', '정다운',
]
const NAME_TAIL = ['주택', '스테이', '하우스', '타운', '빌리지', '레지던스']

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function shift(base: Date, days: number) {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}

function statusOf(today: Date, start: string | null, end: string | null): PropertyStatus {
  if (!start || !end) return 'UPCOMING'
  const t = iso(today)
  if (t < start) return 'UPCOMING'
  if (t > end) return 'CLOSED'
  return 'OPEN'
}

/**
 * 데모용 합성 주택 데이터.
 * 실제 공고가 아니며 모든 레코드는 dataOrigin: 'SYNTHETIC'.
 * 일부 레코드는 합성 고객 분포와 90점 이상 매칭이 발생하도록 의도적으로 설계되었다.
 */
export function generateProperties(count = 50, seed = 990911, now = new Date()): Property[] {
  const rng = createRng(seed)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const out: Property[] = []

  for (let i = 0; i < count; i++) {
    const idx = i + 1
    const id = `H${String(idx).padStart(3, '0')}`

    // 데모 히어로 매물: 합성 고객 선호 분포의 최빈 구간에 정확히 일치시킨다.
    const hero = idx === 23
    const region = hero ? '동작구' : rng.weighted(REGION_DIST)
    const housingType = hero ? '청년매입임대' : rng.weighted(HOUSING_DIST)
    const area = hero ? 29 : rng.int(20, 46)
    const deposit = hero ? 6500 : rng.int(28, 148) * 100
    const monthlyRent = hero ? 32 : rng.int(18, 72)

    // 접수 일정: 히어로는 마감 임박 상태로 고정
    const startOffset = hero ? -3 : rng.int(-40, 25)
    const duration = hero ? 6 : rng.int(7, 21)
    const start = shift(today, startOffset)
    const end = shift(start, duration)

    const applicationStart = iso(start)
    const applicationEnd = iso(end)

    // 실제 공고에도 일부 일자가 미공개인 경우가 많다 — 없으면 null 로 둔다.
    const resultDate = hero || rng.bool(0.72) ? iso(shift(end, rng.int(14, 40))) : null

    // 서류 마감은 접수 마감과 다른 날짜다. 미공개 공고가 더 흔하다.
    const documentDeadline = rng.bool(0.35) ? iso(shift(end, rng.int(2, 7))) : null

    // 계약일은 당첨자 발표 이후에 공고되며 대부분 공고 시점에는 미정이다.
    const contractStart =
      resultDate && rng.bool(0.3)
        ? iso(shift(new Date(`${resultDate}T00:00:00`), rng.int(10, 25)))
        : null

    const status = statusOf(today, applicationStart, applicationEnd)

    const supplyCount = hero ? 12 : rng.int(4, 90)

    // 데모 시작 시점의 정상상태: 공실 3건만 존재
    const vacancyCount = [7, 31, 44].includes(idx) ? 1 : 0

    const competitionRate = hero
      ? 6.8
      : Number((rng.next() * rng.next() * 60 + 1.2).toFixed(1))

    out.push({
      id,
      source: hero ? DEMO_SOURCE : rng.pick(SOURCE_BY_TYPE[housingType]),
      // 공고번호도 진짜 형식을 흉내 내지 않는다. 'DEMO-' 접두사가 붙으면
      // 검색창에 넣어보는 사람도 바로 안다.
      announcementId: `DEMO-${String(idx).padStart(4, '0')}`,
      name: hero ? '동작 청년 매입임대 (노량진)' : `${rng.pick(NAME_HEAD)}${rng.pick(NAME_TAIL)} ${region} ${idx}차`,
      housingType,
      region,
      district: '서울특별시',
      address: `서울특별시 ${region} ${rng.pick(['중앙로', '한강대로', '시흥대로', '봉천로', '노량진로', '월드컵로'])} ${rng.int(10, 480)}`,
      area,
      deposit,
      monthlyRent,
      supplyCount,
      vacancyCount,
      applicationStart,
      applicationEnd,
      documentDeadline,
      resultDate,
      contractStart,
      // 합성 데이터에는 진짜 원문이 없다. 링크를 만들어 원문인 척하지 않는다.
      sourceUrl: null,
      status,
      competitionRate,
      // 예시 공고는 좌표를 만들지 않는다. 지어낸 자리를 지도에 찍으면
      // 실제 공고와 구별되지 않는다.
      lat: null,
      lng: null,
      geoSource: null,
      dataOrigin: 'SYNTHETIC',
    })
  }

  return out
}
