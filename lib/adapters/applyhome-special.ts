import { dataPortalKey, hasDataPortalKey } from '@/lib/config/data-portal-key'

/**
 * 청약홈 특별공급 접수 현황 — 일반공급 접수가 **끝나기 전에** 볼 수 있는 유일한 수요.
 *
 * ── 왜 이것이 다른 숫자와 다른가 ──
 *
 * 경쟁률(getAPTLttotPblancCmpet)은 접수가 끝나야 생긴다. 그래서 "지금 넣을
 * 공고가 몇 대 일이 될까"에는 쓸 수 없고, 우리도 그렇게 쓰지 않는다.
 *
 * 그런데 특별공급은 순서가 다르다. 청약홈 일정은
 *
 *     1일차 특별공급 접수 → 2일차 1순위 → 3일차 2순위
 *
 * 로 짜이고, **특별공급 접수 결과는 그 사이에 공개된다.** 그래서 1·2순위를
 * 넣을지 오늘 정하는 사람이 같은 단지의 특별공급이 어떻게 끝났는지를
 * 이미 볼 수 있다. 실제로 확인했다 — 접수 중인 청약홈 공고 여덟 건 가운데
 * 일곱 건에 특별공급 기록이 이미 올라와 있었다.
 *
 * 이건 예측이 아니다. **이미 일어난 일**이고, 같은 단지에 같은 주에 들어온
 * 접수다. 앞일을 점치지 않고도 오늘 쓸 수 있는 자료는 이것뿐이다.
 *
 * ── 말하지 않는 것 ──
 *
 * 특별공급이 미달이라고 일반공급이 미달인 것은 아니다. 자격 요건이 아예 다르다
 * (특별공급은 무주택·소득·자녀 요건이 붙는다). 그래서 여기서는 숫자를 그대로
 * 옮기고, 그것이 일반공급 결과를 뜻하지 않는다고 화면에 적는다.
 *
 * ── 기관추천은 왜 따로 두나 ──
 *
 * 기관추천은 청약자가 접수해서 경쟁하는 자리가 아니라 기관이 대상자를 추천해
 * 채우는 자리다. 표에도 '접수'가 아니라 '결정 인원'으로 온다. 같은 칸에 넣고
 * 배수를 매기면 경쟁하지 않은 자리를 경쟁한 것처럼 보여주게 된다.
 */

const BASE = 'https://api.odcloud.kr/api'
const ENDPOINT = `${BASE}/ApplyhomeInfoCmpetRtSvc/v1/getAPTSpsplyReqstStus`

/** 접수 구역 — 해당지역 · 해당 시·도 · 기타지역 */
const AREAS = ['CRSPAREA', 'CTPRVN', 'ETC_AREA'] as const

/**
 * 특별공급 유형.
 *
 * `supply` 는 공급 세대 칸, `applied` 는 구역별 접수 칸의 가운데 토막이다.
 * (`CRSPAREA_MNYCH_CNT` · `CTPRVN_MNYCH_CNT` · `ETC_AREA_MNYCH_CNT`)
 */
const TYPES = [
  { key: 'NWWDS_NMTW', label: '신생아', supply: 'NWWDS_NMTW_HSHLDCO' },
  { key: 'NWBB_NWBBSHR', label: '신혼부부', supply: 'NWBB_NWBBSHR_HSHLDCO' },
  { key: 'LFE_FRST', label: '생애최초', supply: 'LFE_FRST_HSHLDCO' },
  { key: 'MNYCH', label: '다자녀', supply: 'MNYCH_HSHLDCO' },
  { key: 'OPS', label: '노부모부양', supply: 'OLD_PARNTS_SUPORT_HSHLDCO' },
  { key: 'YGMN', label: '청년', supply: 'YGMN_HSHLDCO' },
] as const

type RawRow = Record<string, string | number | undefined>

function n(v: unknown): number {
  const x = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(x) ? x : 0
}

export interface SpecialType {
  label: string
  /** 특별공급 세대 */
  supply: number
  /** 접수 건수 (구역 합계) */
  applied: number
  /**
   * 배수. 공급이 0이면 null — 0으로 나눈 값을 '경쟁 없음'처럼 보여주지 않는다.
   */
  rate: number | null
  /** 접수가 공급에 못 미친 세대. 넘쳤으면 0 */
  shortBy: number
}

export interface SpecialRead {
  ok: boolean
  reason: string | null
  /** 특별공급 기록이 아직 없으면 false — 접수 전이거나 특별공급이 없는 공고다 */
  hasData: boolean
  /** 경쟁 접수가 있는 유형만. 공급·접수가 모두 0인 유형은 뺀다 */
  types: SpecialType[]
  /** 경쟁 유형 합계 */
  supply: number
  applied: number
  /** 구역별 접수 구성 — 기타지역에 틈이 있었는지 */
  byArea: { label: string; applied: number }[]
  /**
   * 기관추천 — 경쟁 접수가 아니므로 배수를 매기지 않는다.
   * 공급이 0이면 null 이고 화면에서 그 줄이 사라진다.
   */
  institutional: { supply: number; decided: number } | null
  /** 훑은 주택형 수 — 표본을 숨기지 않는다 */
  houseTypes: number
}

const NONE: SpecialRead = {
  ok: true,
  reason: null,
  hasData: false,
  types: [],
  supply: 0,
  applied: 0,
  byArea: [],
  institutional: null,
  houseTypes: 0,
}

const AREA_LABEL: Record<(typeof AREAS)[number], string> = {
  CRSPAREA: '해당지역',
  CTPRVN: '해당 시·도',
  ETC_AREA: '기타지역',
}

function summarize(rows: RawRow[]): SpecialRead {
  const types = TYPES.map(t => {
    const supply = rows.reduce((a, r) => a + n(r[t.supply]), 0)
    const applied = rows.reduce(
      (a, r) => a + AREAS.reduce((b, area) => b + n(r[`${area}_${t.key}_CNT`]), 0),
      0,
    )
    return {
      label: t.label,
      supply,
      applied,
      rate: supply > 0 ? Math.round((applied / supply) * 100) / 100 : null,
      shortBy: Math.max(0, supply - applied),
    }
  }).filter(t => t.supply > 0 || t.applied > 0)

  const byArea = AREAS.map(area => ({
    label: AREA_LABEL[area],
    applied: rows.reduce(
      (a, r) => a + TYPES.reduce((b, t) => b + n(r[`${area}_${t.key}_CNT`]), 0),
      0,
    ),
  })).filter(a => a.applied > 0)

  const instSupply = rows.reduce((a, r) => a + n(r.INSTT_RECOMEND_HSHLDCO), 0)
  const instDecided = rows.reduce((a, r) => a + n(r.INSTT_RECOMEND_DCSN_CNT), 0)

  const supply = types.reduce((a, t) => a + t.supply, 0)
  const applied = types.reduce((a, t) => a + t.applied, 0)

  return {
    ok: true,
    reason: null,
    // 표는 있는데 전부 0인 공고가 있다 — 특별공급 배정이 없는 경우다.
    // 빈 표를 '결과'로 내놓지 않는다.
    hasData: supply > 0 || applied > 0 || instSupply > 0,
    types,
    supply,
    applied,
    byArea,
    institutional: instSupply > 0 ? { supply: instSupply, decided: instDecided } : null,
    houseTypes: rows.length,
  }
}

/**
 * 공고 한 건의 특별공급 접수 결과.
 *
 * `announcementId` 는 `${HOUSE_MANAGE_NO}-${PBLANC_NO}` 로 만들어 두었다.
 * 실패해도 던지지 않는다 — 곁들이는 자료 때문에 공고 상세를 잃을 수는 없다.
 */
export async function fetchSpecialSupply(announcementId: string | null): Promise<SpecialRead> {
  const id = (announcementId ?? '').trim()
  if (!id || !hasDataPortalKey()) return NONE

  const pblancNo = id.includes('-') ? id.slice(id.indexOf('-') + 1) : id
  if (!pblancNo) return NONE

  const params = new URLSearchParams({
    serviceKey: dataPortalKey(),
    page: '1',
    perPage: '100',
    returnType: 'JSON',
    'cond[PBLANC_NO::EQ]': pblancNo,
  })

  try {
    const res = await fetch(`${ENDPOINT}?${params}`, {
      // 접수가 끝난 뒤에는 바뀌지 않지만, 접수 주간에는 하루 사이에 처음 올라온다.
      // 30분이면 그날 안에 따라잡는다.
      next: { revalidate: 1800 },
    })
    if (!res.ok) return { ...NONE, ok: false, reason: `특별공급 조회 응답 ${res.status}` }

    const json = await res.json()
    if (json?.code !== undefined && json.code < 0) {
      return { ...NONE, ok: false, reason: `공공데이터포털 응답: ${json.msg ?? json.code}` }
    }
    if (!Array.isArray(json?.data)) return { ...NONE, ok: false, reason: '예상과 다른 응답 형식' }
    if (json.data.length === 0) return NONE

    return summarize(json.data as RawRow[])
  } catch (err) {
    return {
      ...NONE,
      ok: false,
      reason: `호출 실패: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/**
 * 목록 카드에 붙일 한 줄 요약.
 *
 * 상세를 열어야만 보이는 신호는 없는 것과 비슷하다. 목록에서 "이 단지는
 * 특별공급이 이미 다섯 배로 끝났다"가 보여야 어느 공고를 열지 정할 수 있다.
 * 그래서 값을 줄여 카드에 실을 만큼만 남긴다.
 */
export interface SpecialBrief {
  supply: number
  applied: number
  /** 배수. 공급이 0이면 null */
  rate: number | null
  /** 남은 세대. 넘쳤으면 0 */
  shortBy: number
}

export function briefOf(read: SpecialRead): SpecialBrief | null {
  if (!read.hasData || read.supply <= 0) return null
  return {
    supply: read.supply,
    applied: read.applied,
    rate: Math.round((read.applied / read.supply) * 100) / 100,
    shortBy: Math.max(0, read.supply - read.applied),
  }
}
