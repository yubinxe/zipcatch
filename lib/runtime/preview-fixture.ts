import type { Property, SearchProfile } from '@/lib/crm/types'
import { isGuardedDeploy } from './deploy-guard'

/**
 * 미리보기 검증용 픽스처 — 운영 DB 와 완전히 떨어진 **가상 공고**.
 *
 * 미리보기 배포에는 공고 저장소가 연결돼 있지 않아 지도·비교·결과 화면이 빈다. 운영 키를
 * 미리보기에 복사하지 않고 화면을 실제로 조작해 보려고 둔다.
 *  - 켜지는 곳: 운영이 아닌 배포(isGuardedDeploy)에서, 사용자가 /api/preview/fixture?on=1 로
 *    쿠키를 켰을 때만. 운영 배포에서는 쿠키가 있어도 무시한다.
 *  - 데이터: 전부 지어낸 공고다. 이름에 [검증용 가상] 을 달고, 출처도 '검증용 픽스처'로 적는다.
 *    실제 고객 정보·실제 공고 원문은 들어 있지 않다. 좌표는 각 지역의 공공시설 근처 임의 지점이다.
 *  - 구조: 실제 저장소의 두 갈래를 본뜬다 — 청약홈형(시작·마감일·주소·좌표·금액 있음)과
 *    LH 목록형(시작일·주소·금액 없음, 마감일만).
 */

export const FIXTURE_COOKIE = 'zc_fixture'

export async function fixtureActive(): Promise<boolean> {
  if (!isGuardedDeploy()) return false
  try {
    const { cookies } = await import('next/headers')
    return (await cookies()).get(FIXTURE_COOKIE)?.value === '1'
  } catch {
    // 요청 바깥(빌드·예약 작업)에서는 쿠키가 없다
    return false
  }
}

function ymd(d: Date) {
  const k = new Date(d.getTime() + 9 * 3_600_000)
  return k.toISOString().slice(0, 10)
}
function rel(today: Date, days: number) {
  return ymd(new Date(today.getTime() + days * 86_400_000))
}

interface Seed {
  key: string
  kind: 'APPLYHOME' | 'LH'
  name: string
  housingType: string
  region: string
  district: string
  address: string
  /** 오늘 기준 시작·마감 (일). LH 형은 시작 없음 */
  start: number | null
  end: number
  /** 집캐치가 처음 저장한 날 (오늘 기준 일) */
  seen: number
  lat: number | null
  lng: number | null
  deposit: number | null
  rent: number | null
  area: number | null
  supply: number
}

const SEEDS: Seed[] = [
  { key: '01', kind: 'APPLYHOME', name: '마포 강변 공공분양', housingType: '공공분양', region: '서울', district: '마포구', address: '서울특별시 마포구 (가상 주소)', start: -3, end: 2, seen: -12, lat: 37.5663, lng: 126.9019, deposit: 62000, rent: null, area: 59, supply: 420 },
  { key: '02', kind: 'APPLYHOME', name: '고양 창릉 신혼희망', housingType: '신혼희망', region: '경기', district: '고양시', address: '경기도 고양시 덕양구 (가상 주소)', start: 4, end: 9, seen: -2, lat: 37.6584, lng: 126.832, deposit: 38000, rent: null, area: 55, supply: 610 },
  { key: '03', kind: 'APPLYHOME', name: '수원 광교 민영', housingType: '민영', region: '경기', district: '수원시', address: '경기도 수원시 영통구 (가상 주소)', start: -20, end: -14, seen: -30, lat: 37.2849, lng: 127.0441, deposit: 71000, rent: null, area: 84, supply: 980 },
  { key: '04', kind: 'APPLYHOME', name: '인천 검단 국민', housingType: '국민', region: '인천', district: '서구', address: '인천광역시 서구 (가상 주소)', start: -1, end: 5, seen: -8, lat: 37.5454, lng: 126.6759, deposit: 31000, rent: null, area: 59, supply: 512 },
  { key: '05', kind: 'APPLYHOME', name: '부산 에코델타 공공분양', housingType: '공공분양', region: '부산', district: '강서구', address: '부산광역시 강서구 (가상 주소)', start: 12, end: 18, seen: -1, lat: 35.2122, lng: 128.9806, deposit: 33000, rent: null, area: 74, supply: 760 },
  { key: '06', kind: 'APPLYHOME', name: '대구 연경 민영', housingType: '민영', region: '대구', district: '북구', address: '대구광역시 북구 (가상 주소)', start: -40, end: -35, seen: -50, lat: 35.8858, lng: 128.5828, deposit: 45000, rent: null, area: 84, supply: 330 },
  { key: '07', kind: 'LH', name: '서울 은평 행복주택 예비입주자', housingType: '행복주택', region: '서울', district: '', address: '', start: null, end: 6, seen: -9, lat: null, lng: null, deposit: null, rent: null, area: null, supply: 0 },
  { key: '08', kind: 'LH', name: '경기 화성 국민임대 예비입주자', housingType: '국민임대', region: '경기', district: '', address: '', start: null, end: 1, seen: -15, lat: null, lng: null, deposit: null, rent: null, area: null, supply: 0 },
  { key: '09', kind: 'LH', name: '인천 미추홀 매입임대', housingType: '매입임대', region: '인천', district: '', address: '', start: null, end: 21, seen: -3, lat: null, lng: null, deposit: null, rent: null, area: null, supply: 0 },
  { key: '10', kind: 'LH', name: '대전 유성 영구임대', housingType: '영구임대', region: '대전', district: '', address: '', start: null, end: -6, seen: -26, lat: null, lng: null, deposit: null, rent: null, area: null, supply: 0 },
  { key: '11', kind: 'LH', name: '광주 첨단 행복주택', housingType: '행복주택', region: '광주', district: '', address: '', start: null, end: 3, seen: -11, lat: null, lng: null, deposit: null, rent: null, area: null, supply: 0 },
  { key: '12', kind: 'LH', name: '전북 전주 공공임대', housingType: '공공임대', region: '전북', district: '', address: '', start: null, end: 14, seen: -4, lat: null, lng: null, deposit: null, rent: null, area: null, supply: 0 },
  { key: '13', kind: 'APPLYHOME', name: '서울 강동 장기전세', housingType: '장기전세', region: '서울', district: '강동구', address: '서울특별시 강동구 (가상 주소)', start: 0, end: 4, seen: -5, lat: 37.5301, lng: 127.1238, deposit: 26000, rent: 0, area: 59, supply: 180 },
  { key: '14', kind: 'APPLYHOME', name: '경기 하남 행복주택', housingType: '행복주택', region: '경기', district: '하남시', address: '경기도 하남시 (가상 주소)', start: -2, end: 8, seen: -7, lat: 37.5392, lng: 127.2149, deposit: 4800, rent: 21, area: 36, supply: 260 },
  { key: '15', kind: 'LH', name: '충남 천안 국민임대', housingType: '국민임대', region: '충남', district: '', address: '', start: null, end: 30, seen: -1, lat: null, lng: null, deposit: null, rent: null, area: null, supply: 0 },
  { key: '16', kind: 'LH', name: '강원 원주 매입임대', housingType: '매입임대', region: '강원', district: '', address: '', start: null, end: -18, seen: -40, lat: null, lng: null, deposit: null, rent: null, area: null, supply: 0 },
]

export const FIXTURE_SOURCE = '검증용 픽스처 (가상 공고)'

export function fixtureProperties(today = new Date()): Property[] {
  const t = ymd(today)
  return SEEDS.map(s => {
    const start = s.start === null ? null : rel(today, s.start)
    const end = rel(today, s.end)
    const status: Property['status'] = t > end ? 'CLOSED' : start && t < start ? 'UPCOMING' : 'OPEN'
    return {
      // 실제 공고 id(uuid)와 겹치지 않게 접두사를 둔다
      id: `fx-${s.key}`,
      source: FIXTURE_SOURCE,
      announcementId: `FX-${s.key}`,
      name: `[검증용 가상] ${s.name}`,
      housingType: s.housingType,
      // 실제 저장소와 같은 자리: 청약홈은 region=시·군·구, district=광역 / LH 는 region=광역(지역본부)
      region: s.kind === 'APPLYHOME' ? s.district : s.region,
      district: s.kind === 'APPLYHOME' ? s.region : '',
      address: s.address,
      area: s.area,
      deposit: s.deposit,
      monthlyRent: s.rent,
      supplyCount: s.supply,
      vacancyCount: 0,
      applicationStart: start,
      applicationEnd: end,
      documentDeadline: null,
      resultDate: null,
      contractStart: null,
      sourceUrl: null,
      status,
      competitionRate: null,
      lat: s.lat,
      lng: s.lng,
      geoSource: s.lat === null ? null : 'ADDRESS',
      collectedAt: new Date(today.getTime() - 3_600_000).toISOString(),
      firstSeenAt: `${rel(today, s.seen)}T00:00:00.000Z`,
      dataOrigin: 'OFFICIAL',
    }
  })
}

/** 결과 화면(내 조건의 지도)을 열어 볼 가상 조건. 저장된 조건이 없을 때만 쓴다 */
export function fixtureProfile(): SearchProfile {
  return {
    regions: ['서울', '경기', '인천'],
    housingTypes: [],
    householdType: null,
    maxDeposit: 40000,
    maxMonthlyRent: 50,
    minArea: null,
    homeownership: null,
    homelessYears: null,
    residencyYears: null,
    accountYears: null,
    dependents: null,
    unknownFields: ['minArea', 'housingTypes'],
    updatedAt: new Date().toISOString(),
  }
}
