/**
 * 단지 탐험(PROPERTY EXPERIENCE)의 데이터 계층.
 *
 * 순수 함수와 자료만 둔다 — `node --test` 가 그대로 불러 검사한다(별칭 import 없음).
 *
 * 네 층을 섞지 않는다.
 *  - official         공고 상세 API(청약홈 주택형별 공급)의 값 그대로. 화면의 숫자는 전부 여기서 온다
 *  - verifiedAssets   사람이 원문을 열어 확인한 공식 자료(조감도·배치도·평면도…)와 쓸 수 있는 정도(LICENSED·LINK_ONLY·UNAVAILABLE)
 *  - verifiedGeometry SH 가 확인한 외관·배치. 없으면 null — 그때 실제 외관을 그리지 않는다
 *                     (지도 기여자의 동 윤곽은 site 로 따로 두고, 화면에 출처와 한계를 적는다)
 *  - presentation     카메라·시간 같은 연출 값. 사실이 아니다
 */

/* ── official ─────────────────────────────────────────── */

/** 공고 상세 API 의 주택형 한 줄 (lib/adapters/applyhome-models 와 같은 모양) */
export interface OfficialModel {
  /** 청약홈 주택형 표기 그대로 — '059.0000B' */
  name: string
  /** 공급면적 ㎡ (주거전용+주거공용) */
  supplyArea: number | null
  /** 전용면적 ㎡ — 청약홈은 주택형 표기에서 읽은 값(59). 확인된 공고는 officialModel 이 공고문 값(59.97)으로 바꾼다 */
  exclusiveArea: number | null
  /** 이번 청약 세대수 (특별+일반). 사전청약 당첨자 배정분은 들지 않는다 */
  households: number | null
  /** 분양 최고금액 (만원) */
  topAmount: number | null
  /** 공급면적 기준 평당가 (만원) — 어댑터가 센 값 */
  perPyeong: number | null
}

export interface OfficialNotice {
  propertyId: string
  announcementId: string
  name: string
  source: string
  sourceUrl: string | null
  models: OfficialModel[]
}

/* ── verifiedAssets · verifiedGeometry ───────────────── */

export type AssetKind =
  | '단지조감도'
  | '단지배치도'
  | '동·호수 배치도'
  | '단위세대 평면도'
  | '건축 3D 모델'
  | '동 윤곽(지도)'

/**
 * 자료를 화면에서 쓸 수 있는 정도.
 *  - LICENSED     재사용·표시(필요한 변형 포함)가 허락된 자료
 *  - LINK_ONLY    원문으로 연결만 한다. 복제·변형 허락을 확인하지 못했다
 *  - UNAVAILABLE  구하지 못했다
 */
export type AssetUse = 'LICENSED' | 'LINK_ONLY' | 'UNAVAILABLE'

export interface VerifiedAsset {
  kind: AssetKind
  /** 원문(공고문 PDF)의 쪽 — 1 부터. 원문 밖 자료는 빈 배열 */
  pages: number[]
  use: AssetUse
  /** 왜 그렇게 쓰는가 — 화면의 출처 서랍에 그대로 적는다 */
  useNote: string
  /** 평면도면 어느 주택형인지 (공고문 표기, 예: '49C') */
  typeLabel?: string
  /** 정정 공고에서 바뀐 자료면 무엇이 바뀌었는지 */
  corrected?: string
}

/** 공고문 「2. 공급대상」 세부타입 한 줄 — 면적은 ㎡, 그대로 옮긴다 */
export interface SubType {
  label: string
  exclusive: number
  residentialCommon: number
  otherCommon: number
  parking: number
  contract: number
  land: number
  /** 이 세부타입의 전체 세대 (사전청약 당첨자 포함) */
  total: number
  maxFloor: number
  /** 1층 세대수 — 공고에 '-' 면 0 */
  firstFloor: number
  /** 발코니 확장비용(원, 부가세 포함) — 공급금액과 별도 */
  balcony: number
}

/** 공고문 「2. 공급대상」 대표타입 한 줄 */
export interface TypeRow {
  /** 청약홈 표기 '059.0000B' */
  type: string
  subs: SubType[]
  total: number
  preWinners: number
  /** 본청약자 계 = 특별 + 일반 (청약홈의 '공급세대수 계') */
  main: number
  youth: number
  newlywed: number
  firstHome: number
  newborn: number
  general: number
}

export interface SupplySummary {
  /** 단지 총 건설호수 */
  total: number
  preWinners: number
  special: number
  general: number
  /** 이번에 새로 청약받는 세대 = 특별 + 일반 */
  main: number
  page: number
}

export interface LandLease {
  /** 월 토지임대료(원) — 전용면적 줄('49'·'59')마다. 공고가 줄 전체에 같은 값을 준 경우에만 적는다 */
  monthlyByArea: Record<string, number>
  note: string
  page: number
}

export interface NoticeDocument {
  title: string
  url: string
  /** 원문 파일이 만들어진 때 (PDF 메타데이터, KST) */
  fileDate: string
  role: 'CORRECTED' | 'ORIGINAL' | 'CORRECTION_NOTE' | 'BOARD'
  note: string
}

export interface Correction {
  what: string
  detail: string
  /** 화면 숫자(면적·세대·가격·일정·임대료)에 영향이 있는가 */
  affectsNumbers: boolean
}

export interface ScheduleItem {
  label: string
  date: string
}

export interface VerifiedSource {
  /** 청약홈 공고명 그대로 */
  name: string
  address: string
  /** 광역 지역 이름(KOREA_REGIONS.name) */
  region: string
  /** 청약홈 공고 상세 */
  sourceUrl: string
  /** 운영 DB 의 공고 id — 상세 화면으로 이어 줄 때만 쓴다(없는 환경이면 청약홈으로) */
  propertyIds: string[]
  documentTitle: string
  developer: string
  developerUrl: string | null
  /** 사람이 원문과 대조한 날 */
  checkedAt: string
  checkNote: string
  /** 첫째가 지금 유효한 원문 */
  documents: NoticeDocument[]
  corrections: Correction[]
  supply: SupplySummary
  types: TypeRow[]
  landLease: LandLease | null
  schedule: ScheduleItem[]
  assets: VerifiedAsset[]
  /** 현장 장면 데이터의 열쇠 — lib/consumer/sites/<key>.ts. 없으면 null */
  siteKey: string | null
  /** SH 가 확인한 동 형상(외관·배치). 없으면 null — 그때 실제 외관을 그리지 않는다 */
  verifiedGeometry: null
  geometryNote: string
}

/* ── 현장(site) — 지도 기여자의 동 윤곽 + 공고 가격표의 동·호 ── */

export interface SiteDong {
  id: number
  /** OpenStreetMap way id */
  osm: number
  /** origin 기준 미터 [x 동쪽, z 남쪽] */
  footprint: [number, number][]
  /** 공고 가격표의 가장 높은 층 */
  floors: number
  lowest: number
  units: number
  lines: number[]
  /** 주택형(청약홈 표기)별 세대 */
  types: Record<string, number>
}

export interface SiteData {
  origin: { lat: number; lng: number }
  boundary: [number, number][]
  dongs: SiteDong[]
  context: {
    /** h: 지도에 적힌 높이(m). 없으면 null — 높이를 지어내지 않고 바닥 윤곽만 그린다 */
    buildings: { f: [number, number][]; h: number | null; n?: string }[]
    /** k: 1 큰길 · 0 골목 */
    roads: { k: number; p: [number, number][] }[]
    water: [number, number][][]
    rivers: { n: string | null; p: [number, number][] }[]
    parks: [number, number][][]
    labels: { n: string; k: string; x: number; z: number }[]
  }
  types: string[]
  plans: string[]
  /** [동, 호, types 번호, plans 번호, 주택가격(천원)] — 공고 가격표 한 줄 */
  units: [number, number, number, number, number][]
  osmSnapshot: string
}

const SH_NOTE =
  'SH(서울주택도시개발공사) 저작물입니다. 공고 게시물·공고문에 공공누리 표시나 재사용 조건이 없고, 누리집 하단은 "All rights reserved" 입니다. 복제·변형하지 않고 원문 해당 쪽으로 연결합니다.'
const SH_POST = 'https://www.i-sh.co.kr/main/lay2/program/S1T294C295/www/brd/m_241/view.do?seq=312005'

/** 정정 안내문(2026.10.23)에 적힌 평면도 수정 — 공고문 표기 */
const PLAN_FIX: Record<string, string> = {
  '49B': '냉장고장 모양',
  '49C': '건식 세면대 바닥(49C1·C2·C3)',
  '49D': '냉장고장 모양',
  '49E': '냉장고장 모양',
  '49F': '주방 가구 배치, 건식 세면대 바닥',
  '49G': '건식 세면대 바닥',
  '49H': '주방 가구 배치',
  '49I': '침실 문',
  '49J': '냉장고장 모양',
  '59A': '하단 유의사항 문구',
  '59B': '냉장고장 모양',
  '59C': '하단 유의사항 문구(59C2)',
  '59F': '다용도실 출입문',
  '59G': '냉장고장 모양',
  '59H': '현관 문·주방 창호 위치(59H1), 주방 창호 위치(59H2)',
  '59I': '주방 창호 위치',
}

type Sub = [string, number, number, number, number, number, number, number, number, number, number]
const sub = ([label, exclusive, residentialCommon, otherCommon, parking, contract, land, total, maxFloor, firstFloor, balcony]: Sub): SubType => ({
  label,
  exclusive,
  residentialCommon,
  otherCommon,
  parking,
  contract,
  land,
  total,
  maxFloor,
  firstFloor,
  balcony,
})
type Row = [string, Sub[], number, number, number, number, number, number, number, number]
const row = ([type, subs, total, preWinners, main, youth, newlywed, firstHome, newborn, general]: Row): TypeRow => ({
  type,
  subs: subs.map(sub),
  total,
  preWinners,
  main,
  youth,
  newlywed,
  firstHome,
  newborn,
  general,
})

/**
 * 확인을 마친 공고만 여기 적는다. 공고 id(청약홈 주택관리번호-공고번호)로 찾는다.
 *
 * 2026000373 — 고덕강일지구 3단지 토지임대부(본청약), 사업주체 서울주택도시개발공사(SH)
 * 2026-10-31 대조: SH 누리집 정정본 공고문(137쪽 PDF, 2026-10-23 생성) 51·52·81·82쪽과
 * 청약홈 공고 상세·API(주택형 20종). 표의 숫자는 51쪽(공급대상)·81쪽(발코니·토지임대료)을 옮긴 것이고,
 * 합계(1,305 · 592 · 713 · 특별 566 · 일반 147)와 면적 줄 합계(49㎡ 590 · 59㎡ 715)로 다시 맞췄다.
 */
export const VERIFIED: Record<string, VerifiedSource> = {
  '2026000373-2026000373': {
    name: '고덕강일지구 3단지 토지임대부(본청약)',
    address: '서울특별시 강동구 강일동 174 일원(고덕강일공공주택지구 3단지)',
    region: '서울',
    sourceUrl: 'https://www.applyhome.co.kr/ai/aia/selectAPTLttotPblancDetail.do?houseManageNo=2026000373&pblancNo=2026000373',
    propertyIds: ['27a3affe-adf8-4289-9225-123c89d152e9'],
    documentTitle: '고덕강일지구 3단지 토지임대부 분양주택 입주자모집공고(정정)',
    developer: '서울주택도시개발공사(SH)',
    developerUrl: 'https://www.i-sh.co.kr/main/index.do',
    checkedAt: '2026-10-31',
    checkNote:
      '정정본 공고문 51쪽 공급대상 표(세부타입 27줄)를 옮겨 합계·면적 줄 합계로 검산했고, 52~80쪽 동·호별 가격표 1,305행을 읽어 주택형별 세대수(사전청약 포함)와 최고가가 51쪽·청약홈과 같음을 확인했습니다. 청약홈의 최고금액은 천원 단위 가격을 만원으로 내림한 값입니다(49H 295,676천원 → 29,567만원).',
    documents: [
      {
        title: 'SH 공고 게시물 — [정정] 고덕강일지구 3단지 토지임대부 분양주택 입주자모집공고',
        url: SH_POST,
        fileDate: '게시판 등록일 2026-10-16 · 첨부 정정본 PDF 2026-10-23 12:55',
        role: 'CORRECTED',
        note: '지금 유효한 원문입니다. 정정본 공고문 PDF 와 「세대별 평면도 수정사항 알림」이 첨부되어 있습니다.',
      },
      {
        title: '세대별 평면도 수정사항 알림',
        url: SH_POST,
        fileDate: '2026-10-23 14:59',
        role: 'CORRECTION_NOTE',
        note: '16개 주택타입 평면도 일부 수정. 면적·세대·가격은 바뀌지 않았습니다.',
      },
      {
        title: '청약홈 첨부 공고문 (정정 전)',
        url: 'https://static.applyhome.co.kr/ai/aia/getAtchmnfl.do?houseManageNo=2026000373&pblancNo=2026000373&atchmnflSeqNo=2001204&atchmnflSn=3',
        fileDate: '2026-10-15 14:57',
        role: 'ORIGINAL',
        note: '2026-10-31 현재 청약홈 첨부는 정정 전 파일입니다. 평면도는 이 파일이 아니라 SH 정정본으로 확인하세요.',
      },
    ],
    corrections: [
      {
        what: '단위세대 평면도(15~39쪽)',
        detail: '49B·49C1~C3·49D·49E·49F·49G·49H·49I·49J·59A·59B·59C2·59F·59G·59H1·59H2·59I — 냉장고장·세면대 바닥·주방 가구·문·창호 위치, 유의 문구',
        affectsNumbers: false,
      },
      {
        what: '테라스 세대 유의 문구(28·31쪽)',
        detail: '59A 의 307동 303~305호, 59C 전 세대: "테라스는 집합건물법상 공용부분이며 특정 세대가 소유권을 주장할 수 없음" 이 더해짐',
        affectsNumbers: false,
      },
      {
        what: '예비입주자 일반공급 기준(109쪽)',
        detail: '"동일 순위 내 서울 2년 이상 거주자 우선" → "예비입주자에는 <표2> 지역우선 공급기준을 적용하지 않음"',
        affectsNumbers: false,
      },
      {
        what: '공급 세대·면적·가격·일정·토지임대료(1·51~82쪽)',
        detail: '정정 전·후 텍스트 대조 결과 바뀐 곳 없음',
        affectsNumbers: false,
      },
    ],
    supply: { total: 1305, preWinners: 592, special: 566, general: 147, main: 713, page: 51 },
    // [세부타입, 주거전용, 주거공용, 기타공용, 지하주차장, 계약면적, 대지지분, 세대(사전 포함), 최고층, 1층 세대, 발코니확장(원)]
    // [대표타입, 세부, 총계, 사전청약 당첨자, 본청약 계, 청년, 신혼부부, 생애최초, 신생아, 일반]
    types: (
      [
        ['049.0000A', [['49A', 49.96, 22.58, 4.69, 44.75, 121.98, 35.65, 44, 27, 1, 987800]], 44, 21, 23, 3, 3, 3, 9, 5],
        ['049.0000B', [['49B', 49.97, 22.59, 4.69, 44.76, 122.01, 35.66, 15, 8, 1, 1342000]], 15, 7, 8, 1, 1, 1, 3, 2],
        [
          '049.0000C',
          [
            ['49C1', 49.97, 22.22, 4.69, 44.76, 121.64, 35.66, 115, 29, 8, 1465200],
            ['49C2', 49.32, 22.64, 4.62, 44.18, 120.76, 35.2, 36, 24, 0, 1402500],
            ['49C3', 49.19, 22.72, 4.62, 44.06, 120.59, 35.1, 27, 29, 0, 1329900],
          ],
          178, 85, 93, 14, 14, 14, 32, 19,
        ],
        ['049.0000D', [['49D', 49.96, 22.25, 4.69, 44.75, 121.65, 35.65, 24, 10, 1, 4694800]], 24, 11, 13, 2, 2, 2, 4, 3],
        ['049.0000E', [['49E', 49.92, 22.4, 4.68, 44.72, 121.72, 35.62, 46, 12, 1, 2233000]], 46, 22, 24, 4, 4, 4, 8, 4],
        ['049.0000F', [['49F', 49.95, 22.69, 4.68, 44.74, 122.06, 35.65, 138, 29, 0, 2506900]], 138, 66, 72, 11, 11, 11, 25, 14],
        ['049.0000G', [['49G', 49.98, 22.07, 4.68, 44.77, 121.5, 35.67, 14, 9, 0, 5634200]], 14, 7, 7, 1, 1, 1, 2, 2],
        ['049.0000H', [['49H', 49.97, 23.53, 4.69, 44.76, 122.95, 35.66, 74, 8, 1, 506000]], 74, 35, 39, 6, 6, 6, 13, 8],
        ['049.0000I', [['49I', 49.99, 23.27, 4.69, 44.78, 122.73, 35.67, 18, 8, 0, 1292500]], 18, 9, 9, 1, 1, 1, 4, 2],
        ['049.0000J', [['49J', 49.69, 22.69, 4.66, 44.51, 121.55, 35.46, 13, 8, 1, 1837000]], 13, 6, 7, 1, 1, 1, 2, 2],
        ['049.0000K', [['49K', 49.77, 22.47, 4.67, 44.58, 121.49, 35.52, 26, 8, 2, 1080200]], 26, 12, 14, 2, 2, 2, 5, 3],
        ['059.0000A', [['59A', 59.92, 26.62, 5.62, 53.67, 145.83, 42.76, 42, 13, 1, 2113100]], 42, 18, 24, 3, 3, 3, 9, 6],
        ['059.0000B', [['59B', 59.97, 26.79, 5.62, 53.72, 146.1, 42.8, 107, 29, 0, 5825600]], 107, 47, 60, 9, 9, 9, 21, 12],
        [
          '059.0000C',
          [
            ['59C1', 59.91, 27.28, 5.62, 53.66, 146.47, 42.75, 3, 1, 3, 2759900],
            ['59C2', 59.97, 27.18, 5.62, 53.72, 146.49, 42.8, 3, 2, 0, 3338500],
          ],
          6, 3, 3, 0, 0, 0, 2, 1,
        ],
        [
          '059.0000D',
          [
            ['59D1', 59.94, 27.25, 5.62, 53.69, 146.5, 42.77, 107, 27, 1, 6647300],
            ['59D2', 59.93, 27.25, 5.63, 53.68, 146.49, 42.77, 27, 29, 0, 6606600],
          ],
          134, 58, 76, 11, 11, 11, 27, 16,
        ],
        ['059.0000E', [['59E', 59.98, 27.17, 5.62, 53.73, 146.5, 42.8, 78, 15, 3, 6826600]], 78, 34, 44, 7, 7, 7, 14, 9],
        ['059.0000F', [['59F', 59.97, 26.69, 5.62, 53.72, 146, 42.8, 81, 15, 6, 1175900]], 81, 35, 46, 7, 7, 7, 16, 9],
        ['059.0000G', [['59G', 59.7, 27.24, 5.59, 53.48, 146.01, 42.6, 213, 14, 14, 1959100]], 213, 93, 120, 18, 18, 18, 41, 25],
        [
          '059.0000H',
          [
            ['59H1', 59.84, 26.72, 5.61, 53.6, 145.77, 42.7, 22, 24, 0, 1133000],
            ['59H2', 59.79, 26.75, 5.61, 53.56, 145.71, 42.67, 20, 29, 0, 1133000],
          ],
          42, 18, 24, 4, 4, 4, 8, 4,
        ],
        ['059.0000I', [['59I', 59.99, 28.62, 5.63, 53.74, 147.98, 42.81, 12, 12, 0, 4714600]], 12, 5, 7, 1, 1, 1, 3, 1],
      ] as Row[]
    ).map(row),
    landLease: {
      monthlyByArea: { '49': 426000, '59': 511500 },
      note: '공고 81쪽 「5. 토지임대료」: 전용 49㎡·59㎡ 각 줄의 전체 주택형에 같은 금액을 적용한다고 적혀 있습니다. 건물 분양가와 별도로 매달 냅니다. 최대 60%까지 보증금 전환 가능(전환이율은 계약 전 안내 예정, 82쪽).',
      page: 81,
    },
    schedule: [
      { label: '입주자모집공고', date: '2026-10-16' },
      { label: '사전청약 당첨자 접수', date: '2026-10-26 ~ 10-27' },
      { label: '특별공급 접수', date: '2026-11-02 ~ 11-03' },
      { label: '일반공급 1순위(서울 2년 이상)', date: '2026-11-04' },
      { label: '일반공급 1순위(그 밖) ', date: '2026-11-05' },
      { label: '일반공급 2순위', date: '2026-11-06' },
      { label: '당첨자 발표', date: '2026-11-26 16:00 이후' },
      { label: '계약', date: '2027-03-22 ~ 04-02' },
      { label: '입주(예정)', date: '2027-05-28 ~ 07-26' },
    ],
    assets: [
      { kind: '단지조감도', pages: [8], use: 'LINK_ONLY', useNote: SH_NOTE },
      { kind: '단지배치도', pages: [9], use: 'LINK_ONLY', useNote: SH_NOTE },
      { kind: '동·호수 배치도', pages: [10, 11, 12, 13, 14], use: 'LINK_ONLY', useNote: SH_NOTE },
      ...(
        [
          ['49A', [15]],
          ['49B', [16]],
          ['49C', [17, 18, 19]],
          ['49D', [20]],
          ['49E', [21]],
          ['49F', [22]],
          ['49G', [23]],
          ['49H', [24]],
          ['49I', [25]],
          ['49J', [26]],
          ['49K', [27]],
          ['59A', [28]],
          ['59B', [29]],
          ['59C', [30, 31]],
          ['59D', [32, 33]],
          ['59E', [34]],
          ['59F', [35]],
          ['59G', [36]],
          ['59H', [37, 38]],
          ['59I', [39]],
        ] as [string, number[]][]
      ).map(([typeLabel, pages]) => ({
        kind: '단위세대 평면도' as const,
        pages,
        typeLabel,
        use: 'LINK_ONLY' as const,
        useNote: SH_NOTE,
        ...(PLAN_FIX[typeLabel] ? { corrected: PLAN_FIX[typeLabel] } : {}),
      })),
      {
        kind: '건축 3D 모델',
        pages: [],
        use: 'UNAVAILABLE',
        useNote: 'SH 가 공개한 3D 모델·BIM 자료를 찾지 못했습니다(공고 게시물·사이버 견본주택 안내 확인). 사용 허락 요청 목록은 docs/SH_ASSET_REQUEST.md.',
      },
      {
        kind: '동 윤곽(지도)',
        pages: [],
        use: 'LICENSED',
        useNote:
          '© OpenStreetMap 기여자, ODbL 1.0. 301~317동 윤곽은 공사 중 상태로 지도 기여자가 그린 것이며 SH 가 확인한 형상이 아닙니다. 높이는 공고 가격표의 최고층 × 3m 로 가정했습니다.',
      },
    ],
    siteKey: 'godeok-gangil-3',
    verifiedGeometry: null,
    geometryNote:
      '실제 외관(조감도·투시도·3D 모델)은 사용 허락이 없어 그리지 않습니다. 건축 모드의 덩어리는 지도 기여자의 동 윤곽(ODbL)에 공고의 동별 최고층을 세운 매스 모형이며, 창·색·지붕·높이 차이(층고)는 표현하지 않습니다.',
  },
}

export function verifiedFor(announcementId: string | null | undefined): VerifiedSource | null {
  return (announcementId && VERIFIED[announcementId]) || null
}

/**
 * 공고 목록의 한 줄이 확인된 공고인가 — 청약홈 id 가 있으면 그것으로, 없으면 운영 id 나 공고명 그대로.
 * 이름이 조금이라도 다르면 아니라고 본다(비슷한 이름의 다른 공고에 탐험을 붙이지 않게).
 */
export function verifiedForNotice(n: { id?: string | null; name?: string | null; announcementId?: string | null }): { id: string; src: VerifiedSource } | null {
  for (const [id, src] of Object.entries(VERIFIED)) {
    if (n.announcementId === id || (n.id && src.propertyIds.includes(n.id)) || (n.name && n.name.trim() === src.name)) return { id, src }
  }
  return null
}

/**
 * 확인된 공고의 주택형 줄을 원문 값만으로 세운다 — DB 나 청약홈 API 가 없는 환경(Preview)에서도
 * 같은 숫자를 보이기 위해서다. 청약홈 API 의 값과 같아야 한다(테스트로 묶었다).
 *  - 공급면적  대표 세부타입의 주거전용 + 주거공용 (청약홈과 같은 셈)
 *  - 세대수    본청약(특별 + 일반) — 청약홈 '공급세대수 계'
 *  - 최고금액  가격표 최고가(천원)를 만원으로 내림
 */
export function verifiedModels(src: VerifiedSource, site: SiteData): OfficialModel[] {
  return src.types
    .map(t => {
      const rep = t.subs[0]
      const supplyArea = Math.round((rep.exclusive + rep.residentialCommon) * 100) / 100
      const top = priceRange(site, t.type)?.max ?? null
      return {
        name: t.type,
        supplyArea,
        exclusiveArea: rep.exclusive,
        households: t.main,
        topAmount: top,
        perPyeong: top === null ? null : Math.round(top / (supplyArea / 3.3058)),
      }
    })
    .sort((a, b) => (a.supplyArea ?? 0) - (b.supplyArea ?? 0))
}

/* ── 계산 — 화면에 쓰는 수는 공식 값에서만 ──────────────── */

/**
 * 청약홈 표기 → 공고문 표기. '059.0000B' → '59B', '084.9500A' → '84.95A'.
 * 소수가 모두 0 이면 버린다. 읽지 못하면 원래 표기를 돌려준다(지어내지 않는다).
 */
export function shortType(name: string): string {
  const m = /^0*(\d+)(?:\.(\d+))?([A-Za-z0-9-]*)$/.exec(name.trim())
  if (!m) return name
  const frac = (m[2] ?? '').replace(/0+$/, '')
  return `${m[1]}${frac ? `.${frac}` : ''}${m[3] ?? ''}`
}

/** 주택형의 평면도 자료 (확인된 경우만) */
export function planFor(src: VerifiedSource | null, model: Pick<OfficialModel, 'name'>): VerifiedAsset | null {
  if (!src) return null
  const label = shortType(model.name)
  return src.assets.find(a => a.kind === '단위세대 평면도' && a.typeLabel === label) ?? null
}

/** 지금 유효한 원문 (정정본이 있으면 정정본) */
export function currentDocument(src: VerifiedSource): NoticeDocument {
  return src.documents[0]
}

/** 공고문 대표타입 줄 */
export function typeRowFor(src: VerifiedSource | null, model: Pick<OfficialModel, 'name'>): TypeRow | null {
  return src?.types.find(t => t.type === model.name) ?? null
}

/** 월 토지임대료(원) — 공고가 그 면적 줄 전체에 준 값만. 없으면 null(추정하지 않는다) */
export function landRentFor(src: VerifiedSource | null, model: Pick<OfficialModel, 'exclusiveArea'>): number | null {
  if (!src?.landLease || model.exclusiveArea === null) return null
  return src.landLease.monthlyByArea[String(Math.trunc(model.exclusiveArea))] ?? null
}

/**
 * 청약홈 주택형 값을 공고문 값으로 바로잡는다.
 * 청약홈의 전용면적은 표기('059.0000B')에서 읽은 59 지만 공고문의 주거전용은 59.97㎡ 다.
 * 세부타입이 여럿이면 청약홈 공급면적과 같은 세부타입(대표값)을 쓴다.
 */
export function officialModel(src: VerifiedSource | null, model: OfficialModel): OfficialModel {
  const row = typeRowFor(src, model)
  if (!row) return model
  const rep =
    row.subs.find(s => model.supplyArea !== null && Math.abs(s.exclusive + s.residentialCommon - model.supplyArea) < 0.006) ?? row.subs[0]
  return { ...model, exclusiveArea: rep.exclusive }
}

/* ── 현장 계산 ── */

export interface DongShare {
  dong: number
  count: number
  lowest: number
  highest: number
}

/** 한 주택형이 어느 동 몇 층에 있는가 — 공고 가격표 그대로 */
export function dongsForType(site: SiteData, type: string): DongShare[] {
  const ti = site.types.indexOf(type)
  const map = new Map<number, DongShare>()
  for (const [dong, ho, t] of site.units) {
    if (t !== ti) continue
    const f = Math.floor(ho / 100)
    const d = map.get(dong) ?? { dong, count: 0, lowest: f, highest: f }
    d.count++
    d.lowest = Math.min(d.lowest, f)
    d.highest = Math.max(d.highest, f)
    map.set(dong, d)
  }
  return [...map.values()].sort((a, b) => a.dong - b.dong)
}

/** 주택형의 건물 분양가 범위(만원, 천원 단위를 만원으로 내림 — 청약홈과 같은 셈) */
export function priceRange(site: SiteData, type: string): { min: number; max: number; units: number } | null {
  const ti = site.types.indexOf(type)
  let min = Infinity
  let max = -Infinity
  let n = 0
  for (const u of site.units) {
    if (u[2] !== ti) continue
    min = Math.min(min, u[4])
    max = Math.max(max, u[4])
    n++
  }
  return n ? { min: Math.floor(min / 10), max: Math.floor(max / 10), units: n } : null
}

export interface UnitCell {
  ho: number
  floor: number
  line: number
  type: string
  plan: string
  /** 천원 */
  price: number
}

/** 한 동의 층 × 호 — 위층이 먼저 */
export function stackOf(site: SiteData, dong: number): { floors: number[]; lines: number[]; cells: Map<string, UnitCell> } {
  const cells = new Map<string, UnitCell>()
  const floors = new Set<number>()
  const lines = new Set<number>()
  for (const [d, ho, t, p, price] of site.units) {
    if (d !== dong) continue
    const floor = Math.floor(ho / 100)
    const line = ho % 100
    floors.add(floor)
    lines.add(line)
    cells.set(`${floor}-${line}`, { ho, floor, line, type: site.types[t], plan: site.plans[p], price })
  }
  return { floors: [...floors].sort((a, b) => b - a), lines: [...lines].sort((a, b) => a - b), cells }
}

export interface ModelDiff {
  key: 'exclusiveArea' | 'supplyArea' | 'topAmount' | 'perPyeong' | 'households'
  label: string
  a: number
  b: number
  /** b − a */
  diff: number
  /** b 가 a 의 몇 배인지 (a 가 0 이면 null) */
  ratio: number | null
}

const DIFF_FIELDS: { key: ModelDiff['key']; label: string }[] = [
  { key: 'exclusiveArea', label: '전용면적' },
  { key: 'supplyArea', label: '공급면적' },
  { key: 'topAmount', label: '분양 최고금액' },
  { key: 'perPyeong', label: '평당가(공급면적 기준)' },
  { key: 'households', label: '신규 공급 세대(특별+일반)' },
]

/** 두 주택형의 차이 — 두 값이 모두 있는 항목만 */
export function compareModels(a: OfficialModel, b: OfficialModel): ModelDiff[] {
  const out: ModelDiff[] = []
  for (const f of DIFF_FIELDS) {
    const x = a[f.key]
    const y = b[f.key]
    if (x === null || y === null) continue
    out.push({ key: f.key, label: f.label, a: x, b: y, diff: Math.round((y - x) * 100) / 100, ratio: x ? y / x : null })
  }
  return out
}

/** 전용면적 정수 줄로 묶는다 — '49'·'59' */
export function groupByArea(models: OfficialModel[]): { area: string; models: OfficialModel[] }[] {
  const map = new Map<string, OfficialModel[]>()
  for (const m of models) {
    // 주택형 표기 줄(49·59)로 — 공고문 주거전용(49.96·49.97…)으로 나누면 줄이 흩어진다
    const k = m.exclusiveArea === null ? '기타' : String(Math.trunc(m.exclusiveArea))
    const list = map.get(k) ?? []
    list.push(m)
    map.set(k, list)
  }
  return [...map.entries()]
    .map(([area, list]) => ({ area, models: list.sort((x, y) => shortType(x.name).localeCompare(shortType(y.name), 'en')) }))
    .sort((x, y) => Number(x.area) - Number(y.area))
}

/* ── presentation — 연출 값(사실이 아니다) ─────────────── */

export const PRESENTATION = {
  /** 처음 어둠에서 떠오르는 시간 */
  fadeMs: 400,
  /** 넓은 화면에서 대상 위치로 다가가는 시간 */
  arriveMs: 1400,
  /** 이름·수치가 차례로 오르는 간격 */
  revealStepMs: 120,
  /** 카메라가 서고 패널이 오르는 시간 */
  panelMs: 500,
  /** 주택형을 바꿀 때 숫자가 흐르는 시간 */
  numberMs: 350,
  /** 비교로 들어갈 때 두 주택형이 갈라서는 시간 */
  splitMs: 600,
  /** 현장 장면 1 단위 = 10m */
  siteUnit: 10,
  /** 층 하나의 가정 높이(m) — 실제 층고가 아니다 */
  floorM: 3,
  /** 1㎡ 를 장면에서 얼마로 그리나 — 면적은 넓이 그대로(정사각 한 변 = √넓이) */
  metre: 0.12,
  /** 공급 세대 1세대를 높이 얼마로 */
  perHousehold: 0.022,
} as const
