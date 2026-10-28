import { hugSeoulKey } from '@/lib/config/data-portal-key'
import { readSeoulSupply, type SeoulRow } from '@/lib/consumer/seoul-supply'

export const dynamic = 'force-dynamic'

/**
 * 서울 분양아파트 기본현황 — 주택도시보증공사, 공공데이터포털 15152174(파일데이터 API, 연간).
 * 1,432행이라 한 번에 받는다(perPage 2000). 연간 자료라 하루 동안 다시 묻지 않는다.
 *
 * status: OK · EMPTY · NOT_CONFIGURED(키 없음) · AUTH_FAILED(-401 등) · ERROR — 오류와 빈 자료를 섞지 않는다.
 * 키는 응답·오류에 남기지 않는다.
 */
const URL_ = 'https://api.odcloud.kr/api/15152174/v1/uddi:115e5fbb-ce76-4943-a644-8cf8f6dc25c8'
const SOURCE = '주택도시보증공사 · 서울특별시 분양아파트 기본현황 (공공데이터포털 15152174)'

export async function GET() {
  const key = hugSeoulKey()
  if (!key) return Response.json({ ok: false, status: 'NOT_CONFIGURED', reason: '서울 분양 현황 인증키가 설정되지 않았습니다.' }, { status: 503 })

  try {
    const q = new URLSearchParams({ page: '1', perPage: '2000', serviceKey: key })
    const res = await fetch(`${URL_}?${q}`, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(15_000) })
    const json = (await res.json().catch(() => null)) as { data?: SeoulRow[]; totalCount?: number; code?: number; msg?: string } | null
    if (!json) return Response.json({ ok: false, status: 'ERROR', reason: '응답을 읽지 못했습니다.' }, { status: 502 })
    if (!Array.isArray(json.data)) {
      const auth = json.code === -401 || /인증키/.test(json.msg ?? '')
      return Response.json(
        { ok: false, status: auth ? 'AUTH_FAILED' : 'ERROR', reason: json.msg ?? `HTTP ${res.status}` },
        { status: 502 },
      )
    }
    const read = readSeoulSupply(json.data)
    return Response.json({
      ok: true,
      status: read.sites ? 'OK' : 'EMPTY',
      rows: json.data.length,
      totalCount: json.totalCount ?? json.data.length,
      ...read,
      source: SOURCE,
    })
  } catch {
    return Response.json({ ok: false, status: 'ERROR', reason: '제공처 응답이 없습니다.' }, { status: 502 })
  }
}
