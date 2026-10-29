import { lookupLawd, lawdLabel } from '@/lib/consumer/lawd'
import { FLOW_MONTHS, readFlow, type FlowMonths, type FlowQuery } from '@/lib/market/flow'
import { AREA_BANDS, toCsv, type AreaBand, type DealKind, type HouseKind } from '@/lib/market/flow-core'

/**
 * 실거래 흐름 — GET /api/market/flow?lawd=11680&months=12&kind=trade&house=APT&band=all&dong=
 *
 * 입력은 모두 정해진 값 안에서만 받는다. 표에 없는 지역 코드로는 바깥 API 를 부르지
 * 않는다. 인증키는 서버에서만 쓴다. `format=csv` 면 조건에 맞는 거래 목록을 내려준다.
 *
 * 같은 조건은 CDN 에서 한 시간 동안 같은 답을 돌려준다(바깥 호출도 달마다 따로 캐시).
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const KINDS: DealKind[] = ['trade', 'jeonse', 'wolse']
const HOUSES: HouseKind[] = ['APT', 'ROW', 'OFFI']

function bad(msg: string) {
  return Response.json({ error: msg }, { status: 400 })
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  const lawd = (sp.get('lawd') ?? '').trim()
  if (!/^\d{5}$/.test(lawd) || !lookupLawd(lawd)) return bad('지역 코드가 올바르지 않습니다.')

  const months = Number(sp.get('months') ?? 12)
  if (!FLOW_MONTHS.includes(months as FlowMonths)) return bad('기간은 3·6·12·24개월 중에서 고릅니다.')

  const kind = (sp.get('kind') ?? 'trade') as DealKind
  if (!KINDS.includes(kind)) return bad('거래 종류가 올바르지 않습니다.')

  const house = (sp.get('house') ?? 'APT') as HouseKind
  if (!HOUSES.includes(house)) return bad('주택 유형이 올바르지 않습니다.')

  const band = (sp.get('band') ?? 'all') as AreaBand
  if (!AREA_BANDS.some(b => b.key === band)) return bad('면적 구간이 올바르지 않습니다.')

  // 동 이름은 응답에 나온 이름과 같은지로만 쓰인다 — 길이와 글자만 묶어 둔다
  const dongRaw = (sp.get('dong') ?? '').trim()
  if (dongRaw && !/^[가-힣0-9·.\s]{1,20}$/.test(dongRaw)) return bad('동 이름이 올바르지 않습니다.')
  const dong = dongRaw || null

  const q: FlowQuery = { lawd, months: months as FlowMonths, kind, house, band, dong }
  const csv = sp.get('format') === 'csv'

  try {
    const r = await readFlow(q, { withDeals: csv })
    const cache = r.status === 'ok' ? 'public, s-maxage=3600, stale-while-revalidate=600' : 'no-store'

    if (csv) {
      if (r.status === 'unconfigured' || r.status === 'error') {
        return Response.json({ error: '실거래 자료를 불러오지 못해 내보낼 것이 없습니다.' }, { status: 503 })
      }
      const kindLabel = kind === 'trade' ? '매매' : kind === 'jeonse' ? '전세' : '월세'
      const meta = [
        `집캐치 실거래 흐름 — ${lawdLabel(lawd)}${dong ? ` ${dong}` : ''} · ${r.source.label} · ${kindLabel}`,
        `기간: 최근 ${months}개월(계약 월 기준) · 면적: ${AREA_BANDS.find(b => b.key === band)?.label}`,
        `출처: ${r.source.agency} ${r.source.label} (${r.source.endpoint}) · 조회 ${r.fetchedAt}`,
        `해제 거래 ${r.quality.canceled}건 제외 · 중복 ${r.quality.duplicates}건 제외${r.status === 'partial' ? ` · 일부 달을 불러오지 못함(${r.quality.failedMonths}개월)` : ''}`,
        '금액 단위 만원 · 3.3㎡당은 전용면적 기준 · 최근 30일 계약은 신고가 덜 모였을 수 있음',
      ]
      const name = `zipcatch-flow-${lawd}-${kind}-${months}m.csv`
      return new Response(toCsv(r.deals ?? [], kind, meta), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${name}"`,
          'Cache-Control': cache,
        },
      })
    }

    return Response.json({ ...r, region: lawdLabel(lawd) }, { headers: { 'Cache-Control': cache } })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : '실거래 흐름을 불러오지 못했습니다.' },
      { status: 500 },
    )
  }
}
