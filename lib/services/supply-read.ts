import { fetchCompetition, type CompetitionRow } from '@/lib/adapters/applyhome-competition'
import * as repo from '@/lib/db/repo'

/**
 * 공급 판독 — 끝난 공고가 지금 넣을 사람에게 말해 주는 것.
 *
 * ── 왜 평균 경쟁률을 안 내놓는가 ──
 *
 * "이 동네 평균 12.4대 1"은 듣기엔 그럴듯하지만 아무 결정도 바꾸지 못한다.
 * 같은 공고 안에서도 59㎡가 30대 1일 때 84㎡가 미달인 일이 흔하다.
 * 평균은 그 둘을 뭉개서 둘 다 틀린 숫자 하나로 만든다.
 *
 * 실무자가 표에서 실제로 뽑아내는 것은 세 가지다.
 *
 *  1) **어디가 비었나** — 미달 난 주택형. 가점 낮은 사람의 유일한 자리다.
 *  2) **누가 가져갔나** — 해당지역이 다 먹었는지, 기타지역에 틈이 있었는지.
 *  3) **1순위에서 끝났나** — 2순위까지 내려온 공고는 다음에도 내려올 공산이 크다.
 *
 * 셋 다 우리가 이미 받아오는 표에 들어 있는데 지금껏 아무 화면도 쓰지 않았다.
 */

export interface ShortRow {
  pblancNo: string
  /** 공고명. 저장소에 없으면 null — 공고번호를 이름처럼 보여주지 않는다 */
  title: string | null
  region: string | null
  houseTy: string
  supply: number
  /** 모든 구역을 합친 접수 */
  applied: number
  /** 마지막 구역까지 가고도 남은 세대 */
  shortBy: number
  rank: number
}

export interface ResideSplit {
  name: string
  applied: number
  /** 전체 접수 가운데 이 구역이 차지한 몫(%) */
  share: number
}

export interface SupplyRead {
  ok: boolean
  reason: string | null
  /** 훑은 행 수 — 표본을 숨기지 않는다 */
  scanned: number
  notices: number
  /** 미달이 난 주택형 (부족 세대 많은 순) */
  shortages: ShortRow[]
  /** 미달 주택형 수 / 전체 주택형 수 */
  shortShare: { short: number; total: number } | null
  /** 해당지역 vs 기타지역 배분 */
  reside: ResideSplit[]
  /** 2순위까지 내려간 공고 수 */
  wentToRank2: number
  /** 가장 붐빈 주택형 */
  hottest: { pblancNo: string; houseTy: string; rate: number; supply: number }[]
}

/**
 * 지역 구성비.
 *
 * 공급세대(SUPLY_HSHLDCO)는 **지역 행마다 같은 값이 반복된다** — 한 주택형의
 * 총 공급이 해당지역 행에도, 기타지역 행에도 똑같이 적힌다. 이걸 그냥 더하면
 * 물량이 두 배로 부풀고, 거기서 나온 "기타지역 0.3배"는 아무 뜻도 없는 숫자다.
 *
 * 그래서 여기서는 공급을 합치지 않는다. **접수 건수의 구성비**만 낸다 —
 * "같은 물량을 두고 누가 얼마나 넣었나". 이건 왜곡 없이 말할 수 있다.
 */
function splitByReside(rows: CompetitionRow[]): ResideSplit[] {
  const acc = new Map<string, number>()
  for (const r of rows) {
    if (!r.reside) continue
    acc.set(r.reside, (acc.get(r.reside) ?? 0) + r.applied)
  }
  const total = [...acc.values()].reduce((a, b) => a + b, 0)
  if (total === 0) return []

  return [...acc.entries()]
    .map(([name, applied]) => ({
      name,
      applied,
      share: Math.round((applied / total) * 100),
    }))
    .sort((a, b) => b.applied - a.applied)
}

export async function readSupply(opts: { pages?: number } = {}): Promise<SupplyRead> {
  const res = await fetchCompetition({ pages: opts.pages ?? 6 })

  if (!res.ok && res.rows.length === 0) {
    return {
      ok: false,
      reason: res.reason,
      scanned: res.scanned,
      notices: 0,
      shortages: [],
      shortShare: null,
      reside: [],
      wentToRank2: 0,
      hottest: [],
    }
  }

  const rows = res.rows
  const notices = new Set(rows.map(r => r.pblancNo)).size

  /**
   * 미달은 구역 순서대로 깎여 나간다.
   *
   * 공급 941세대에 해당지역 85건이 들어오면 856세대가 남고, 이어서 기타지역
   * 5건이 들어오면 851세대가 남는다. 표에는 이 두 줄이 모두 실린다.
   * 그대로 늘어놓으면 같은 주택형이 구역 수만큼 반복되면서 서로 다른 미달처럼
   * 보인다. 실제로 남은 것은 **마지막 값 하나**뿐이다.
   */
  const perType = new Map<string, { row: CompetitionRow; applied: number; shortBy: number }>()
  for (const r of rows) {
    if (r.rank !== 1) continue // 1순위 잔여가 2순위로 넘어간다. 기준은 1순위다
    const key = `${r.pblancNo}|${r.houseTy}`
    const cur = perType.get(key)
    if (!cur) {
      perType.set(key, { row: r, applied: r.applied, shortBy: r.shortBy })
      continue
    }
    cur.applied += r.applied
    // 가장 적게 남은 값이 마지막 구역까지 간 결과다
    cur.shortBy = Math.min(cur.shortBy, r.shortBy)
  }

  const shortList = [...perType.values()]
    .filter(v => v.shortBy > 0)
    .sort((a, b) => b.shortBy - a.shortBy)
    .slice(0, 8)

  // 공고번호만 적으면 무슨 단지인지 알 수 없다. 저장소에서 이름을 붙인다.
  const titles = new Map<string, { title: string; region: string }>()
  try {
    for (const o of await repo.listOpportunities({ includeDemo: false, limit: 1000 })) {
      const no = (o.external_id ?? '').split('-').pop()
      if (no) titles.set(no, { title: o.title, region: o.region })
    }
  } catch {
    // 이름을 못 붙여도 판독 자체는 성립한다
  }

  const shortages: ShortRow[] = shortList.map(v => {
    const meta = titles.get(v.row.pblancNo)
    return {
      pblancNo: v.row.pblancNo,
      title: meta?.title ?? null,
      region: meta?.region ?? null,
      houseTy: v.row.houseTy,
      supply: v.row.supply,
      applied: v.applied,
      shortBy: v.shortBy,
      rank: v.row.rank,
    }
  })

  // 비율도 행이 아니라 **주택형 단위**로 센다. 행으로 세면 구역 수만큼 부풀려진다.
  const shortCount = [...perType.values()].filter(v => v.shortBy > 0).length

  const hottest = rows
    .filter(r => r.rate !== null && r.supply > 0)
    .sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0))
    .slice(0, 8)
    .map(r => ({ pblancNo: r.pblancNo, houseTy: r.houseTy, rate: r.rate as number, supply: r.supply }))

  // 2순위 '행'은 미달이 없어도 만들어진다. 실제로 **접수가 있었던** 공고만 센다 —
  // 행의 존재를 사건으로 읽으면 전부 2순위까지 갔다고 말하게 된다.
  const rank2Notices = new Set(
    rows.filter(r => r.rank === 2 && r.applied > 0).map(r => r.pblancNo),
  ).size

  return {
    ok: true,
    reason: res.ok ? null : res.reason,
    scanned: res.scanned,
    notices,
    shortages,
    shortShare: perType.size > 0 ? { short: shortCount, total: perType.size } : null,
    reside: splitByReside(rows),
    wentToRank2: rank2Notices,
    hottest,
  }
}
