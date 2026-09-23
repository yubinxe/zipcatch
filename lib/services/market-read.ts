import { fetchAllPages, APPLYHOME_TABLES } from '@/lib/adapters/applyhome-bulk'
import { cascadeRank, parseRate } from '@/lib/adapters/applyhome-competition'

/**
 * 분양 시장 판독 — 사업을 벌이는 쪽에서 묻는 것들.
 *
 * 소비자 화면은 "내가 넣을 자리가 있나"를 묻는다. 시행사·분양대행사·
 * 감정평가사가 묻는 것은 다르다.
 *
 *   1) 이 동네에 지금 **평당 얼마**에 내고 있나           (분양가 산정·감정평가 근거)
 *   2) 그 값에 **팔렸나**                                (사업성)
 *   3) 값을 낮추면 팔리나                                (통념 점검)
 *   4) 앞으로 **경쟁 물량**이 얼마나 나오나              (분양 시기)
 *
 * 네 가지 다 청약홈 공개 표 안에 있는데, 표가 나뉘어 있어서 아무도 붙여 보지
 * 않는다. 공고 표에 시행사·시공사·지역이, 주택형 표에 면적과 분양 최고금액이,
 * 경쟁률 표에 미달이 있다. 공고번호로 셋을 잇는다.
 *
 * ── 말하지 않는 것 ──
 *
 * 여기 나오는 것은 전부 **이미 공개된 기록의 집계**다. 앞으로 얼마에 내면
 * 팔린다는 말은 하지 않는다. 특히 값과 결과의 관계는 인과가 아니다 —
 * 비싼 동네가 대체로 좋은 입지라서, 값이 결과를 만든 것처럼 보일 뿐이다.
 * 그 한계는 화면에도 적는다.
 */

/** 1평 = 3.3058㎡ */
const PYEONG = 3.3058

/** 감정평가가 사례를 고를 때 쓰는 만큼의 최근 기록 */
const MONTHS_BACK = 12

/** 이보다 적은 표본으로는 지역·시공사를 한 줄로 말하지 않는다 */
const MIN_NOTICES_REGION = 3
const MIN_NOTICES_BUILDER = 4

interface RawAnnouncement {
  PBLANC_NO?: string | number
  HOUSE_NM?: string
  HOUSE_DTL_SECD_NM?: string
  SUBSCRPT_AREA_CODE_NM?: string
  HSSPLY_ADRES?: string
  BSNS_MBY_NM?: string
  CNSTRCT_ENTRPS_NM?: string
  RCRIT_PBLANC_DE?: string
  RCEPT_BGNDE?: string
  TOT_SUPLY_HSHLDCO?: string | number
  NSPRC_NM?: string | null
  SPECLT_RDN_EARTH_AT?: string
  MDAT_TRGET_AREA_SECD?: string
}

interface RawModel {
  PBLANC_NO?: string | number
  HOUSE_TY?: string
  SUPLY_AR?: string | number
  LTTOT_TOP_AMOUNT?: string | number
}

interface RawCompetition {
  PBLANC_NO?: string | number
  HOUSE_TY?: string
  RESIDE_SECD?: string | number
  RESIDE_SENM?: string
  SUBSCRPT_RANK_CODE?: string | number
  CMPET_RATE?: string
}

export interface Spread {
  /** 만원/평 */
  median: number
  p25: number
  p75: number
  /** 이 값을 만든 표본 수 */
  samples: number
}

export interface RegionRow {
  name: string
  notices: number
  units: number
  price: Spread
  /** 미달이 난 주택형 / 결과가 있는 주택형 */
  shortTypes: number
  ratedTypes: number
  /** 한 주택형도 미달나지 않은 공고 수 */
  soldOut: number
  /** 결과가 붙은 공고 수 — 위 두 값의 분모다 */
  settled: number
  /**
   * 이 지역의 면적대별 평당가.
   *
   * 전국을 한 표로 묶으면 '60㎡ 이하'가 '60~85㎡'보다 비싸게 나온다. 작은
   * 평형이 비싼 게 아니라 서울 소형이 표본에 섞여서다. 면적대는 지역을
   * 고정해야 비로소 뜻이 생긴다 — 감정평가가 사례를 고르는 방식도 그렇다.
   */
  sizes: SizeRow[]
}

export interface SizeRow {
  label: string
  price: Spread
}

export interface PriceSplit {
  region: string
  notices: number
  cheap: { price: number; shortPct: number }
  pricey: { price: number; shortPct: number }
}

export interface BuilderRow {
  name: string
  notices: number
  units: number
  /** 이 시공사가 지은 곳의 미달 주택형 비율 */
  shortPct: number
  /**
   * 같은 지역들의 평균 미달 비율. 시공사가 어디에 지었는지를 빼고 보려면
   * 이 값과 견주어야 한다 — 지방에만 지은 곳이 나빠 보이는 것을 막는다.
   */
  benchPct: number
  /** 주로 지은 광역 (많은 순 세 곳) */
  where: string[]
}

export interface PipelineRow {
  /** YYYY-MM */
  month: string
  notices: number
  units: number
  /** 아직 접수가 시작되지 않은 달인가 */
  ahead: boolean
}

export interface MarketSlice {
  kind: string
  notices: number
  units: number
  price: Spread | null
  regions: RegionRow[]
  sizes: SizeRow[]
  splits: PriceSplit[]
  /** 시공사별 성적 */
  builders: BuilderRow[]
  /** 시행사(사업주체)별 성적 — 디벨로퍼가 먼저 묻는 축이다 */
  developers: BuilderRow[]
}

export interface MarketRead {
  ok: boolean
  reason: string | null
  /** 훑은 행 수 — 표본을 숨기지 않는다 */
  scanned: { announcements: number; models: number; competition: number }
  /** 집계 구간의 시작 (YYYY-MM-DD) */
  since: string
  asOf: string
  private: MarketSlice
  public: MarketSlice
  pipeline: PipelineRow[]
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

function spread(values: number[]): Spread | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  return {
    median: Math.round(quantile(s, 0.5)),
    p25: Math.round(quantile(s, 0.25)),
    p75: Math.round(quantile(s, 0.75)),
    samples: s.length,
  }
}

/**
 * 회사 이름을 하나로 모은다.
 *
 * 같은 회사가 `(주)포스코이앤씨` 와 `㈜포스코이앤씨` 로 따로 들어와 한 회사가
 * 두 줄로 갈라져 있었다. 괄호 모양과 '주식회사' 표기를 맞추고 공백·마침표를
 * 털어 낸다. 화면에는 가장 많이 쓰인 원문 표기를 그대로 적는다 —
 * 우리가 다듬은 이름을 회사 이름인 것처럼 내보내지 않는다.
 */
function companyKey(raw: string | undefined): string {
  return String(raw ?? '')
    .replace(/㈜/g, '(주)')
    .replace(/주식회사/g, '(주)')
    .replace(/[()\s.,]/g, '')
    .replace(/^주/, '')
    .trim()
}

/** '059.9200A' → 59.92. 못 읽으면 null — 그럴듯한 수를 만들지 않는다 */
function exclusiveArea(houseTy: string): number | null {
  const m = houseTy.match(/(\d{2,3}(?:\.\d+)?)/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

const SIZE_BANDS: { label: string; max: number }[] = [
  { label: '60㎡ 이하', max: 60 },
  { label: '60~85㎡', max: 85 },
  { label: '85~135㎡', max: 135 },
  { label: '135㎡ 초과', max: Infinity },
]

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 공고 한 건의 접수 결과 — 미달난 주택형이 몇 개인가 */
interface Outcome {
  ratedTypes: number
  shortTypes: number
}

/** 한 공고의 주택형별 평당가와 전용면적 */
interface Priced {
  perPyeong: number
  exclusive: number | null
}

export async function readMarket(): Promise<MarketRead> {
  const now = new Date()
  const since = new Date(now.getFullYear(), now.getMonth() - MONTHS_BACK, 1)
  const sinceStr = ymd(since)

  const [ann, mdl, cmp] = await Promise.all([
    fetchAllPages<RawAnnouncement>(APPLYHOME_TABLES.announcements.path, {
      perPage: APPLYHOME_TABLES.announcements.perPage,
    }),
    fetchAllPages<RawModel>(APPLYHOME_TABLES.models.path, {
      perPage: APPLYHOME_TABLES.models.perPage,
    }),
    fetchAllPages<RawCompetition>(APPLYHOME_TABLES.competition.path, {
      perPage: APPLYHOME_TABLES.competition.perPage,
    }),
  ])

  const scanned = {
    announcements: ann.rows.length,
    models: mdl.rows.length,
    competition: cmp.rows.length,
  }

  const empty = (kind: string): MarketSlice => ({
    kind,
    notices: 0,
    units: 0,
    price: null,
    regions: [],
    sizes: [],
    splits: [],
    builders: [],
    developers: [],
  })

  // 공고 표가 없으면 아무것도 이을 수 없다. 반쪽짜리 집계를 내놓지 않는다.
  if (!ann.ok && ann.rows.length === 0) {
    return {
      ok: false,
      reason: ann.reason,
      scanned,
      since: sinceStr,
      asOf: now.toISOString(),
      private: empty('민영'),
      public: empty('국민'),
      pipeline: [],
    }
  }

  // ── 주택형 표 → 공고별 평당가 ──────────────────────────────────────
  const priced = new Map<string, Priced[]>()
  for (const m of mdl.rows) {
    const amount = num(m.LTTOT_TOP_AMOUNT)
    const area = num(m.SUPLY_AR)
    // 분양가나 면적이 없는 행이 있다. 0으로 채우면 평당 0원짜리 사례가 생긴다.
    if (amount <= 0 || area <= 0) continue
    const key = String(m.PBLANC_NO ?? '')
    if (!key) continue
    const list = priced.get(key) ?? []
    list.push({
      perPyeong: amount / (area / PYEONG),
      exclusive: exclusiveArea(String(m.HOUSE_TY ?? '')),
    })
    priced.set(key, list)
  }

  // ── 경쟁률 표 → 공고별 미달 주택형 수 ──────────────────────────────
  // 한 주택형은 구역마다 한 줄씩 실리고, 최종 잔여는 연쇄의 마지막 줄에만 있다.
  const lastRow = new Map<string, RawCompetition>()
  for (const r of cmp.rows) {
    if (num(r.SUBSCRPT_RANK_CODE) !== 1) continue
    const key = `${r.PBLANC_NO}|${r.HOUSE_TY}`
    const cur = lastRow.get(key)
    const side = { resideCode: String(r.RESIDE_SECD ?? ''), reside: String(r.RESIDE_SENM ?? '') }
    if (!cur) {
      lastRow.set(key, r)
      continue
    }
    const curSide = {
      resideCode: String(cur.RESIDE_SECD ?? ''),
      reside: String(cur.RESIDE_SENM ?? ''),
    }
    if (cascadeRank(side) >= cascadeRank(curSide)) lastRow.set(key, r)
  }

  const outcome = new Map<string, Outcome>()
  for (const r of lastRow.values()) {
    const key = String(r.PBLANC_NO ?? '')
    if (!key) continue
    const o = outcome.get(key) ?? { ratedTypes: 0, shortTypes: 0 }
    o.ratedTypes++
    if (parseRate(r.CMPET_RATE).shortBy > 0) o.shortTypes++
    outcome.set(key, o)
  }

  // ── 셋을 잇는다 ────────────────────────────────────────────────────
  interface Joined {
    no: string
    kind: string
    region: string
    units: number
    builderKey: string
    builderName: string
    developerKey: string
    developerName: string
    perPyeong: number
    models: Priced[]
    outcome: Outcome | null
    noticedOn: string
    opensOn: string
  }

  const joined: Joined[] = []
  for (const a of ann.rows) {
    const no = String(a.PBLANC_NO ?? '')
    const models = priced.get(no)
    if (!no || !models || models.length === 0) continue

    const noticedOn = String(a.RCRIT_PBLANC_DE ?? '')
    if (!noticedOn || noticedOn < sinceStr) continue

    const perPyeong = spread(models.map(m => m.perPyeong))
    if (!perPyeong) continue

    joined.push({
      no,
      kind: String(a.HOUSE_DTL_SECD_NM ?? '').trim() || '기타',
      region: String(a.SUBSCRPT_AREA_CODE_NM ?? '').trim() || '기타',
      units: num(a.TOT_SUPLY_HSHLDCO),
      builderKey: companyKey(a.CNSTRCT_ENTRPS_NM),
      builderName: String(a.CNSTRCT_ENTRPS_NM ?? '').trim(),
      developerKey: companyKey(a.BSNS_MBY_NM),
      developerName: String(a.BSNS_MBY_NM ?? '').trim(),
      perPyeong: perPyeong.median,
      models,
      outcome: outcome.get(no) ?? null,
      noticedOn,
      opensOn: String(a.RCEPT_BGNDE ?? ''),
    })
  }

  // ── 조각 하나 만들기 ───────────────────────────────────────────────
  function slice(kind: string): MarketSlice {
    const rows = joined.filter(r => r.kind === kind)
    if (rows.length === 0) return empty(kind)

    const settled = rows.filter(r => r.outcome !== null)

    // 지역 — 면적대 계산을 먼저 정의해 두고 쓴다
    const byRegion = new Map<string, Joined[]>()
    for (const r of rows) {
      byRegion.set(r.region, [...(byRegion.get(r.region) ?? []), r])
    }
    const regions: RegionRow[] = []
    for (const [name, list] of byRegion) {
      if (list.length < MIN_NOTICES_REGION) continue
      const price = spread(list.map(r => r.perPyeong))
      if (!price) continue
      const done = list.filter(r => r.outcome !== null)
      regions.push({
        name,
        notices: list.length,
        units: list.reduce((a, r) => a + r.units, 0),
        price,
        shortTypes: done.reduce((a, r) => a + (r.outcome?.shortTypes ?? 0), 0),
        ratedTypes: done.reduce((a, r) => a + (r.outcome?.ratedTypes ?? 0), 0),
        soldOut: done.filter(r => (r.outcome?.shortTypes ?? 0) === 0).length,
        settled: done.length,
        // 지역 안에서는 표본이 적으므로 문턱을 낮춘다. 대신 n 을 화면에 적는다.
        sizes: sizesOf(list, 5),
      })
    }
    regions.sort((a, b) => b.price.median - a.price.median)

    // 면적대 — 감정평가가 사례를 고를 때 쓰는 구간
    // 함수 선언으로 둔다 — 지역 표를 만들 때 이미 쓰이므로 위로 끌어올려져야 한다
    function sizesOf(list: Joined[], minSamples: number): SizeRow[] {
      const out: SizeRow[] = []
      SIZE_BANDS.forEach((band, i) => {
        const lo = i === 0 ? 0 : SIZE_BANDS[i - 1].max
        const vals: number[] = []
        for (const r of list) {
          for (const m of r.models) {
            if (m.exclusive === null) continue
            if (m.exclusive > lo && m.exclusive <= band.max) vals.push(m.perPyeong)
          }
        }
        const price = spread(vals)
        if (price && price.samples >= minSamples) out.push({ label: band.label, price })
      })
      return out
    }
    const sizes = sizesOf(rows, 10)

    /*
     * 값을 낮추면 팔리나 — 같은 지역 안에서 싼 절반과 비싼 절반을 갈라 본다.
     *
     * 지역을 섞으면 "서울은 비싸고 안 미달난다"가 그대로 나와 아무 말도 못 한다.
     * 같은 광역 안에서 갈라야 그나마 입지 차이를 줄일 수 있다. 그래도 완전히
     * 걷어내지는 못한다 — 그 한계는 화면에 적는다.
     */
    const splits: PriceSplit[] = []
    for (const [name, list] of byRegion) {
      const done = list.filter(r => r.outcome !== null).sort((a, b) => a.perPyeong - b.perPyeong)
      if (done.length < 10) continue
      const half = Math.floor(done.length / 2)
      const side = (part: Joined[]) => {
        const rated = part.reduce((a, r) => a + (r.outcome?.ratedTypes ?? 0), 0)
        const short = part.reduce((a, r) => a + (r.outcome?.shortTypes ?? 0), 0)
        return {
          price: Math.round(quantile(part.map(r => r.perPyeong).sort((x, y) => x - y), 0.5)),
          shortPct: rated === 0 ? 0 : Math.round((short / rated) * 100),
        }
      }
      splits.push({
        region: name,
        notices: done.length,
        cheap: side(done.slice(0, half)),
        pricey: side(done.slice(half)),
      })
    }
    splits.sort((a, b) => b.notices - a.notices)

    // 시공사 — 지은 곳의 평균과 견준다
    const regionShort = new Map<string, { short: number; rated: number }>()
    for (const r of settled) {
      const acc = regionShort.get(r.region) ?? { short: 0, rated: 0 }
      acc.short += r.outcome?.shortTypes ?? 0
      acc.rated += r.outcome?.ratedTypes ?? 0
      regionShort.set(r.region, acc)
    }

    /**
     * 회사별 성적. 시공사로도, 시행사(사업주체)로도 낸다.
     *
     * 디벨로퍼가 궁금해하는 것은 대개 시행사 쪽이고, 실무에서 이름이 먼저
     * 오르내리는 것은 시공사 쪽이다. 같은 계산을 두 축으로 돌린다.
     */
    function companies(pick: (r: Joined) => { key: string; name: string }): BuilderRow[] {
    const byBuilder = new Map<string, Joined[]>()
    for (const r of settled) {
      const { key } = pick(r)
      if (!key) continue
      byBuilder.set(key, [...(byBuilder.get(key) ?? []), r])
    }
    const builders: BuilderRow[] = []
    for (const list of byBuilder.values()) {
      if (list.length < MIN_NOTICES_BUILDER) continue
      const rated = list.reduce((a, r) => a + (r.outcome?.ratedTypes ?? 0), 0)
      if (rated === 0) continue
      const short = list.reduce((a, r) => a + (r.outcome?.shortTypes ?? 0), 0)

      // 이 시공사가 지은 지역들의 평균. 그 시공사가 그 지역에서 낸 주택형 수로
      // 가중한다 — 한 건 지은 지역과 열 건 지은 지역을 같이 칠 수 없다.
      let benchShort = 0
      let benchRated = 0
      const where = new Map<string, number>()
      for (const r of list) {
        const weight = r.outcome?.ratedTypes ?? 0
        const region = regionShort.get(r.region)
        if (region && region.rated > 0) {
          benchShort += (region.short / region.rated) * weight
          benchRated += weight
        }
        where.set(r.region, (where.get(r.region) ?? 0) + 1)
      }

      // 화면에는 가장 많이 쓰인 원문 표기를 적는다
      const names = new Map<string, number>()
      for (const r of list) {
        const n = pick(r).name
        names.set(n, (names.get(n) ?? 0) + 1)
      }

      builders.push({
        name: [...names.entries()].sort((a, b) => b[1] - a[1])[0][0],
        notices: list.length,
        units: list.reduce((a, r) => a + r.units, 0),
        shortPct: Math.round((short / rated) * 100),
        benchPct: benchRated === 0 ? 0 : Math.round((benchShort / benchRated) * 100),
        where: [...where.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k),
      })
    }
    builders.sort((a, b) => b.notices - a.notices || b.units - a.units)
    return builders.slice(0, 14)
    }

    return {
      kind,
      notices: rows.length,
      units: rows.reduce((a, r) => a + r.units, 0),
      price: spread(rows.map(r => r.perPyeong)),
      regions,
      sizes,
      splits: splits.slice(0, 4),
      builders: companies(r => ({ key: r.builderKey, name: r.builderName })),
      developers: companies(r => ({ key: r.developerKey, name: r.developerName })),
    }
  }

  // ── 물량 추이 ──────────────────────────────────────────────────────
  // 공고일이 아니라 **접수 시작일**로 센다. 경쟁 물량은 같은 달에 접수받는
  // 단지이지, 같은 달에 공고문이 나온 단지가 아니다.
  const today = ymd(now)
  const byMonth = new Map<string, { notices: number; units: number; ahead: boolean }>()
  for (const r of joined) {
    const opens = r.opensOn
    if (!opens || opens.length < 7) continue
    const month = opens.slice(0, 7)
    const acc = byMonth.get(month) ?? { notices: 0, units: 0, ahead: false }
    acc.notices++
    acc.units += r.units
    if (opens > today) acc.ahead = true
    byMonth.set(month, acc)
  }
  const pipeline: PipelineRow[] = [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, v]) => ({ month, notices: v.notices, units: v.units, ahead: v.ahead }))

  // 한 표라도 실패했으면 성공이라 말하지 않는다. 어느 표가 왜 모자랐는지 적는다.
  const failures = [
    !ann.ok ? `공고 표: ${ann.reason}` : null,
    !mdl.ok ? `주택형 표: ${mdl.reason}` : null,
    !cmp.ok ? `경쟁률 표: ${cmp.reason}` : null,
  ].filter(Boolean)

  return {
    ok: failures.length === 0,
    reason: failures.length ? failures.join(' · ') : null,
    scanned,
    since: sinceStr,
    asOf: now.toISOString(),
    private: slice('민영'),
    public: slice('국민'),
    pipeline,
  }
}
