/**
 * HUG 공정률 표를 화면이 읽을 모양으로 바꾼다 — 바깥 호출 없는 순수 함수만.
 *
 * 원자료: HUG 빅데이터 개방 포털 Open API '분양아파트 공정률(지역별)'
 * (lib/adapters/hug.ts 가 사업장명·공정률·주소·시행사 머리글로 옮겨 넘긴다).
 * 머리글은 원자료마다 '공정률'·'공정율'처럼 조금씩 흔들리므로 이름을 하나로
 * 못 박지 않고 뜻으로 찾는다. 찾지 못한 칸은
 * 비워 두고, 무엇을 찾았는지 응답에 함께 적는다 — 칸을 잘못 짚었을 때
 * 화면에서 바로 드러나게.
 *
 * 공정률은 보증 사업장의 공사 진척을 HUG 가 집계한 값이다. 입주일을 약속하는
 * 숫자가 아니므로 '언제 들어간다'로 바꿔 말하지 않는다.
 */

export interface ProgressSite {
  name: string
  province: string
  developer: string | null
  households: number | null
  /** 0~100 */
  progress: number
  /** YYYY-MM. 원자료에 없으면 null */
  inspection: string | null
}

export interface ProvinceProgress {
  province: string
  sites: number
  households: number
  median: number
  /** 공정률 구간별 사업장 수 — 착공 초기 / 골조 / 마감 */
  buckets: { early: number; middle: number; late: number }
  /** 사용검사 예정이 기준월부터 6개월 안인 곳 */
  soon: number
  /** 공정률 높은 순 상위 몇 곳 */
  top: ProgressSite[]
}

export interface ProgressColumns {
  name: string | null
  region: string | null
  progress: string | null
  developer: string | null
  households: string | null
  inspection: string | null
  kind: string | null
  month: string | null
}

const PROVINCE: Record<string, string> = {
  서울: '서울', 서울시: '서울', 서울특별시: '서울',
  부산: '부산', 부산시: '부산', 부산광역시: '부산',
  대구: '대구', 대구시: '대구', 대구광역시: '대구',
  인천: '인천', 인천시: '인천', 인천광역시: '인천',
  광주: '광주', 광주시: '광주', 광주광역시: '광주',
  대전: '대전', 대전시: '대전', 대전광역시: '대전',
  울산: '울산', 울산시: '울산', 울산광역시: '울산',
  세종: '세종', 세종시: '세종', 세종특별자치시: '세종',
  경기: '경기', 경기도: '경기',
  강원: '강원', 강원도: '강원', 강원특별자치도: '강원',
  충북: '충북', 충청북도: '충북',
  충남: '충남', 충청남도: '충남',
  전북: '전북', 전라북도: '전북', 전북특별자치도: '전북',
  전남: '전남', 전라남도: '전남',
  경북: '경북', 경상북도: '경북',
  경남: '경남', 경상남도: '경남',
  제주: '제주', 제주도: '제주', 제주특별자치도: '제주',
}

/** "서울특별시 강남구 …" · "경기" · "충청남도" → 광역 두 글자. 모르면 null */
export function toProvince(raw: unknown): string | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const [first, second = ''] = s.split(/[\s(·,]+/)
  // 2026 출범 전남광주통합특별시 — 지도는 광주·전남을 따로 그린다. 통합시 안에서
  // '…구'로 끝나는 곳은 옛 광주광역시 자치구뿐이라 그 규칙으로만 가른다
  if (/^전남광주/.test(first)) return /구$/.test(second) ? '광주' : '전남'
  return PROVINCE[first] ?? PROVINCE[s] ?? null
}

/** 머리글 목록에서 뜻으로 칸을 찾는다. 앞의 규칙이 먼저다 */
export function detectColumns(keys: string[]): ProgressColumns {
  const pick = (...tests: RegExp[]) => {
    for (const t of tests) {
      const hit = keys.find(k => t.test(k.replace(/\s+/g, '')))
      if (hit) return hit
    }
    return null
  }
  return {
    progress: pick(/공정[률율]/, /공정/),
    name: pick(/사업장명/, /사업장/, /단지명/, /현장명/),
    region: pick(/^지역명?$/, /시도/, /지역/, /소재지/, /주소/),
    developer: pick(/시행사/, /사업주체/, /시행자/),
    households: pick(/보증세대/, /세대수/, /세대/),
    inspection: pick(/사용검사/, /준공/, /입주예정/),
    kind: pick(/건물구분/, /건물유형/, /건물종류/, /용도/, /사업장구분/, /구분/, /유형/),
    month: pick(/기준년?월/, /기준일/, /조사/, /기준/),
  }
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(String(v).replace(/[,%\s]/g, ''))
  return Number.isFinite(n) ? n : null
}

/** 202703 · 2027-03 · 2027.03.15 · 2027년 3월 → "2027-03". 못 읽으면 null */
export function toMonth(v: unknown): string | null {
  const s = String(v ?? '').trim()
  if (!s) return null
  let m = s.match(/^(\d{4})(\d{2})(\d{2})?$/)
  if (m) return `${m[1]}-${m[2]}`
  m = s.match(/(\d{4})\s*[-./년]\s*(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`
  return null
}

function monthsBetween(a: string, b: string) {
  const [ay, am] = a.split('-').map(Number)
  const [by, bm] = b.split('-').map(Number)
  return (by - ay) * 12 + (bm - am)
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export interface ProgressRead {
  provinces: ProvinceProgress[]
  columns: ProgressColumns
  /** 원자료 행 수 */
  rows: number
  /** 아파트만 남겼는지 — 구분 칸이 없으면 상가가 섞여 있을 수 있다 */
  apartmentsOnly: boolean
  /** 원자료가 밝힌 기준월. 없으면 null */
  baseMonth: string | null
  /** 공정률·지역을 읽지 못해 뺀 행 */
  skipped: number
}

/**
 * 행을 광역별로 묶는다.
 *
 * `today` 는 기준월이 표에 없을 때 '6개월 안'을 셀 바탕이다. 표에 기준월이 있으면
 * 그것을 쓴다 — 지난달 표를 오늘 기준으로 세면 이미 지난 사용검사가 '곧'이 된다.
 */
export function readProgress(raw: Record<string, unknown>[], today = new Date()): ProgressRead {
  const columns = detectColumns(raw.length ? Object.keys(raw[0]) : [])
  // '구분' 칸이 보증 종류(분양보증·조합주택시공보증)일 수도 있다. 값에 아파트·상가가
  // 실제로 보일 때만 건물 구분으로 믿는다 — 아니면 그 칸으로 거르지 않는다.
  if (columns.kind && !raw.some(r => /아파트|상가/.test(String(r[columns.kind!] ?? '')))) columns.kind = null
  const kindCol = columns.kind
  const apartmentsOnly = !!kindCol

  const months = columns.month
    ? raw.map(r => toMonth(r[columns.month!])).filter((m): m is string => !!m).sort()
    : []
  const baseMonth = months.length ? months[months.length - 1] : null
  const ref = baseMonth ?? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  const by = new Map<string, ProgressSite[]>()
  let skipped = 0
  for (const r of raw) {
    if (kindCol && !/아파트/.test(String(r[kindCol] ?? ''))) continue
    const p = columns.progress ? num(r[columns.progress]) : null
    const province = columns.region ? toProvince(r[columns.region]) : null
    if (p === null || p < 0 || p > 100 || !province) {
      skipped++
      continue
    }
    const site: ProgressSite = {
      name: columns.name ? String(r[columns.name] ?? '').trim() || '이름 미표기 사업장' : '이름 미표기 사업장',
      province,
      developer: columns.developer ? String(r[columns.developer] ?? '').trim() || null : null,
      households: columns.households ? num(r[columns.households]) : null,
      progress: p,
      inspection: columns.inspection ? toMonth(r[columns.inspection]) : null,
    }
    const list = by.get(province) ?? []
    list.push(site)
    by.set(province, list)
  }

  const provinces: ProvinceProgress[] = [...by.entries()]
    .map(([province, list]) => {
      const ps = list.map(s => s.progress)
      return {
        province,
        sites: list.length,
        households: list.reduce((s, x) => s + (x.households ?? 0), 0),
        median: Math.round(median(ps) * 10) / 10,
        buckets: {
          early: ps.filter(p => p < 30).length,
          middle: ps.filter(p => p >= 30 && p < 70).length,
          late: ps.filter(p => p >= 70).length,
        },
        soon: list.filter(s => {
          if (!s.inspection) return false
          const d = monthsBetween(ref, s.inspection)
          return d >= 0 && d <= 6
        }).length,
        top: [...list].sort((a, b) => b.progress - a.progress).slice(0, 6),
      }
    })
    .sort((a, b) => b.sites - a.sites || a.province.localeCompare(b.province, 'ko'))

  return { provinces, columns, rows: raw.length, apartmentsOnly, baseMonth, skipped }
}
