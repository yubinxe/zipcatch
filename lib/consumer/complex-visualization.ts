/**
 * 단지 탐험(PROPERTY EXPERIENCE)의 데이터 계층.
 *
 * 순수 함수와 자료만 둔다 — `node --test` 가 그대로 불러 검사한다(별칭 import 없음).
 *
 * 네 층을 섞지 않는다.
 *  - official         공고 상세 API(청약홈 주택형별 공급)의 값 그대로. 화면의 숫자는 전부 여기서 온다
 *  - verifiedAssets   사람이 원문을 열어 확인한 공식 자료(조감도·배치도·평면도…)와 쓸 수 있는 방식
 *  - verifiedGeometry 실제 동 위치·높이·층수. 확인된 것이 없으면 null — 그때 건물 모양을 만들지 않는다
 *  - presentation     카메라·시간 같은 연출 값. 사실이 아니다
 */

/* ── official ─────────────────────────────────────────── */

/** 공고 상세 API 의 주택형 한 줄 (lib/adapters/applyhome-models 와 같은 모양) */
export interface OfficialModel {
  /** 청약홈 주택형 표기 그대로 — '059.0000B' */
  name: string
  /** 공급면적 ㎡ (주거전용+주거공용) */
  supplyArea: number | null
  /** 전용면적 ㎡ — 주택형 표기에서 읽은 값 */
  exclusiveArea: number | null
  /** 공급 세대수 (일반+특별) */
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

export type AssetKind = '단지조감도' | '단지배치도' | '동·호수 배치도' | '단위세대 평면도'

export interface VerifiedAsset {
  kind: AssetKind
  /** 원문(공고문 PDF)의 쪽 — 1 부터 */
  pages: number[]
  /** 이 자료를 화면에서 어떻게 쓰는가 */
  use: 'EMBED' | 'LINK_ONLY'
  /** 왜 그렇게 쓰는가 */
  useNote: string
  /** 평면도면 어느 주택형인지 (공고문 표기, 예: '49C') */
  typeLabel?: string
}

export interface VerifiedSource {
  /** 원문 문서 */
  documentTitle: string
  documentUrl: string
  /** 사업주체 */
  developer: string
  developerUrl: string | null
  /** 사람이 원문과 대조한 날 */
  checkedAt: string
  /** 대조한 내용 */
  checkNote: string
  assets: VerifiedAsset[]
  /** 확인된 동 배치·층수 — 없으면 null */
  verifiedGeometry: null
  geometryNote: string
}

const PLAN_NOTE =
  '사업주체 저작물이고 공고문에 재사용 허락 조건이 적혀 있지 않습니다. 복제해 싣지 않고 원문의 해당 쪽으로 연결합니다.'

/**
 * 확인을 마친 공고만 여기 적는다. 공고 id(청약홈 주택관리번호-공고번호)로 찾는다.
 *
 * 2026000373 — 고덕강일지구 3단지 토지임대부(본청약), 사업주체 서울주택도시공사(SH)
 * 2026-10-30 대조: 청약홈 공고 상세(공급대상·공급금액 표)와 공고 상세 API(주택형 20종)의
 * 공급면적·일반/특별/계·최고금액이 모두 일치, 합계 713세대. 공고문 PDF(136쪽)의 텍스트층에서
 * 조감도·배치도·동호수배치도·평면도 쪽과 평면도별 주택형 표기(49A…59I)를 확인했다.
 */
export const VERIFIED: Record<string, VerifiedSource> = {
  '2026000373-2026000373': {
    documentTitle: '고덕강일지구 3단지 토지임대부(본청약) 입주자모집공고문',
    documentUrl:
      'https://static.applyhome.co.kr/ai/aia/getAtchmnfl.do?houseManageNo=2026000373&pblancNo=2026000373&atchmnflSeqNo=2001204&atchmnflSn=3',
    developer: '서울주택도시공사(SH)',
    developerUrl: 'https://www.i-sh.co.kr/main/index.do',
    checkedAt: '2026-10-30',
    checkNote:
      '청약홈 공고 상세의 공급대상·공급금액 표와 공고 상세 API 의 20개 주택형(공급면적·일반/특별/계·최고금액)을 한 줄씩 대조해 모두 일치. 합계 713세대(단지 공급규모 1,305세대와는 다른 값).',
    assets: [
      { kind: '단지조감도', pages: [8], use: 'LINK_ONLY', useNote: PLAN_NOTE },
      { kind: '단지배치도', pages: [9], use: 'LINK_ONLY', useNote: PLAN_NOTE },
      { kind: '동·호수 배치도', pages: [10, 11, 12, 13, 14], use: 'LINK_ONLY', useNote: PLAN_NOTE },
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
        useNote: PLAN_NOTE,
      })),
    ],
    verifiedGeometry: null,
    geometryNote:
      '동·호수 배치도는 원문에 있지만 동 위치·층수를 기계로 옮겨 검증하지 않았습니다. 그래서 건물 모양·배치를 그리지 않고, 동 선택·층 선택도 열지 않습니다.',
  },
}

export function verifiedFor(announcementId: string | null | undefined): VerifiedSource | null {
  return (announcementId && VERIFIED[announcementId]) || null
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

/** 원문 PDF 의 쪽으로 가는 주소 (브라우저 PDF 보기의 #page) */
export function pageUrl(src: VerifiedSource, page: number): string {
  return `${src.documentUrl}#page=${page}`
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
  { key: 'households', label: '공급 세대수' },
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

/** 전용면적으로 묶는다 — '49'·'59' 줄 */
export function groupByArea(models: OfficialModel[]): { area: string; models: OfficialModel[] }[] {
  const map = new Map<string, OfficialModel[]>()
  for (const m of models) {
    const k = m.exclusiveArea === null ? '기타' : String(m.exclusiveArea)
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
  /** 내려다보는 자리에서 다가가는 시간 */
  arriveMs: 1500,
  /** 이름·수치가 차례로 오르는 간격 */
  revealStepMs: 120,
  /** 1㎡ 를 장면에서 얼마로 그리나 — 면적은 넓이 그대로(정사각 한 변 = √넓이) */
  metre: 0.12,
  /** 공급 세대 1세대를 높이 얼마로 */
  perHousehold: 0.022,
} as const
