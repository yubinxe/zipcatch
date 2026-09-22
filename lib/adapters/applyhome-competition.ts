import { dataPortalKey } from '@/lib/config/data-portal-key'

/**
 * 청약홈 접수 경쟁률 — 끝난 공고가 남긴 기록.
 *
 * ── 이 자료를 언제 쓸 수 있는지부터 ──
 *
 * 경쟁률은 **접수가 끝나야** 생긴다. 지금 접수 중인 공고에 대고 물으면 0건이
 * 돌아온다. 그러니 "이번에 넣을 공고가 몇 대 일이 될까"에는 쓸 수 없다.
 * 쓸 수 있는 자리는 하나뿐이다 — **끝난 공고들을 모아 그 동네의 온도를 읽는 것.**
 * 이 구분을 흐리면 지난 기록을 앞일처럼 말하게 된다.
 *
 * ── 실무자가 이 표에서 실제로 찾는 것 ──
 *
 * 평균 경쟁률이 아니다. `(△209)` — **미달**이다.
 * 미달은 그 타입에 1순위가 다 안 찼다는 뜻이고, 물량이 2순위와 기타지역으로
 * 넘어갔다는 뜻이다. 가점이 낮은 사람에게는 미달 난 자리가 유일한 자리다.
 * 5만 행짜리 표에서 이걸 손으로 찾는 사람은 없다. 그래서 기계가 찾는다.
 */

const BASE = 'https://api.odcloud.kr/api'
const ENDPOINT = `${BASE}/ApplyhomeInfoCmpetRtSvc/v1/getAPTLttotPblancCmpet`

export interface CompetitionRow {
  /** 공고번호 */
  pblancNo: string
  houseManageNo: string
  /** 주택형 (084.8786A) */
  houseTy: string
  /** 공급 세대수 */
  supply: number
  /** 접수 건수 */
  applied: number
  /** 해당지역 / 기타경기 / 기타지역 */
  reside: string
  /**
   * 구역 코드. 01 해당지역 · 03 기타경기 · 02 기타지역.
   *
   * 번호 순서가 곧 배정 순서가 **아니다** — 물량은 01 → 03 → 02 로 흐른다.
   * 이 순서를 모르면 미달 세대를 엉뚱한 줄에서 읽게 된다(cascadeRank 참고).
   */
  resideCode: string
  /** 1 | 2 순위 */
  rank: number
  /**
   * 경쟁률 배수. 미달이면 null 이다 — 0 으로 적지 않는다.
   * 0 은 "아무도 안 넣었다"로 읽히지만 미달은 "덜 찼다"이다.
   */
  rate: number | null
  /** 미달 세대수. 미달이 아니면 0 */
  shortBy: number
}

/**
 * 물량이 구역을 건너가는 순서.
 *
 * 수도권 대규모택지의 우선공급은 세 단계다 —
 * **해당 주택건설지역(01) → 기타경기(03) → 기타지역(02).**
 * 앞 단계에서 남은 물량이 다음 단계로 얹혀 내려가므로, 한 주택형이 최종적으로
 * 몇 세대 남았는지는 **마지막 단계 줄 하나**에만 적혀 있다.
 *
 * 실제 표로 확인한 모양 (공고 2026000438 · 084.0000A · 공급 635):
 *
 *   해당지역  접수 25 → (△166)     635×30% = 191,  191 − 25 = 166
 *   기타경기  접수 20 → (△273)     635×20% = 127,  127 + 166 − 20 = 273
 *   기타지역  접수 18 → (△572)     635×50% = 317,  317 + 273 − 18 = 572
 *
 * 세 줄을 나란히 놓고 작은 값을 고르면 166 이 나오지만, 실제로 남은 것은 572 다.
 * 코드 번호 순으로 정렬해도 02 가 03 보다 앞서서 역시 틀린다. 그래서 번호가
 * 아니라 이 순서를 따로 적어 둔다.
 *
 * 표에 없는 코드가 나오면 기타지역보다 앞에 세운다 — '기타지역'은 남은 사람을
 * 전부 받는 가장 넓은 구역이라 마지막 자리를 내주지 않는다.
 */
export function cascadeRank(row: Pick<CompetitionRow, 'resideCode' | 'reside'>): number {
  if (row.resideCode === '01' || row.reside === '해당지역') return 0
  if (row.resideCode === '02' || row.reside === '기타지역') return 2
  return 1
}

/** `"(△209)"` → 209세대 미달 · `"5.23"` → 5.23배 */
export function parseRate(raw: unknown): { rate: number | null; shortBy: number } {
  const s = String(raw ?? '').trim()
  const short = s.match(/△\s*([\d,]+)/)
  if (short) return { rate: null, shortBy: Number(short[1].replace(/,/g, '')) || 0 }
  const n = Number(s.replace(/[^\d.]/g, ''))
  return { rate: Number.isFinite(n) && n > 0 ? n : null, shortBy: 0 }
}

interface RawRow {
  PBLANC_NO?: string
  HOUSE_MANAGE_NO?: string
  HOUSE_TY?: string
  SUPLY_HSHLDCO?: number | string
  REQ_CNT?: number | string
  RESIDE_SENM?: string
  RESIDE_SECD?: string | number
  SUBSCRPT_RANK_CODE?: number | string
  CMPET_RATE?: string
}

function normalize(rows: RawRow[]): CompetitionRow[] {
  return rows
    .filter(r => r.PBLANC_NO && r.HOUSE_TY)
    .map(r => {
      const { rate, shortBy } = parseRate(r.CMPET_RATE)
      return {
        pblancNo: String(r.PBLANC_NO),
        houseManageNo: String(r.HOUSE_MANAGE_NO ?? ''),
        houseTy: String(r.HOUSE_TY),
        supply: Number(r.SUPLY_HSHLDCO) || 0,
        applied: Number(r.REQ_CNT) || 0,
        reside: String(r.RESIDE_SENM ?? '').trim(),
        resideCode: String(r.RESIDE_SECD ?? '').trim(),
        rank: Number(r.SUBSCRPT_RANK_CODE) || 0,
        rate,
        shortBy,
      }
    })
}

export interface FetchCompetitionResult {
  rows: CompetitionRow[]
  ok: boolean
  reason: string | null
  /** 실제로 훑은 행 수 — 화면에 그대로 적어 표본 크기를 숨기지 않는다 */
  scanned: number
}

/**
 * 여러 쪽을 이어 받는다.
 *
 * 한 쪽(perPage 최대)만 보면 5만 행 가운데 앞머리만 보게 되고, 그 앞머리가
 * 어떤 순서인지는 우리가 정하지 않는다. 표본이 치우친 줄 모르고 "미달이 많다"고
 * 말하게 된다. 그래서 쪽수를 밝히고, 훑은 행 수를 결과에 함께 싣는다.
 */
export async function fetchCompetition(
  opts: { pblancNo?: string; pages?: number; perPage?: number } = {},
): Promise<FetchCompetitionResult> {
  const key = dataPortalKey()
  if (!key) {
    return { rows: [], ok: false, reason: 'DATA_GO_KR_API_KEY 가 설정되지 않았습니다.', scanned: 0 }
  }

  const { pblancNo, pages = 6, perPage = 500 } = opts
  const out: CompetitionRow[] = []
  let scanned = 0

  try {
    for (let page = 1; page <= pages; page++) {
      const params = new URLSearchParams({
        serviceKey: key,
        page: String(page),
        perPage: String(perPage),
        returnType: 'JSON',
      })
      if (pblancNo) params.set('cond[PBLANC_NO::EQ]', pblancNo)

      const res = await fetch(`${ENDPOINT}?${params}`, { next: { revalidate: 1800 } })
      const json = await res.json()

      if (json?.code !== undefined && json.code < 0) {
        return { rows: out, ok: false, reason: `공공데이터포털 응답: ${json.msg ?? json.code}`, scanned }
      }
      const data: RawRow[] = Array.isArray(json?.data) ? json.data : []
      scanned += data.length
      out.push(...normalize(data))

      // 마지막 쪽이면 더 부르지 않는다
      if (data.length < perPage) break
    }
    return { rows: out, ok: true, reason: null, scanned }
  } catch (err) {
    return {
      rows: out,
      ok: false,
      reason: `호출 실패: ${err instanceof Error ? err.message : String(err)}`,
      scanned,
    }
  }
}
