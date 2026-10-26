import { dataPortalKey } from '@/lib/config/data-portal-key'
import { readProgress } from '@/lib/consumer/build-progress'

export const dynamic = 'force-dynamic'

/**
 * 지역별 분양아파트 공정률 — 주택도시보증공사(HUG).
 *
 * 공공데이터포털 파일데이터 15083037 「월별 집합건물(아파트·상가) 사업장 공정율 현황」.
 * 파일데이터는 회차(월)마다 새 uddi 를 받을 수 있어서 경로를 환경변수로 바꿀 수
 * 있게 둔다. 바꾸지 않으면 처음 받은 회차를 읽는다.
 *
 * 월간 자료라 하루 동안 다시 묻지 않는다.
 */
const BASE = 'https://api.odcloud.kr/api'
const PATH = (process.env.HUG_PROGRESS_PATH ?? '15083037/v1/uddi:a2b6e776-8c13-49a8-ba61-4697027e6730').replace(/^\/+/, '')
const PER_PAGE = 1000
const MAX_PAGES = 10

export async function GET() {
  const key = dataPortalKey()
  if (!key) {
    return Response.json({ ok: false, reason: '공공데이터포털 인증키가 설정되지 않았습니다.' }, { status: 503 })
  }

  const rows: Record<string, unknown>[] = []
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const params = new URLSearchParams({
        serviceKey: key,
        page: String(page),
        perPage: String(PER_PAGE),
        returnType: 'JSON',
      })
      const res = await fetch(`${BASE}/${PATH}?${params}`, { next: { revalidate: 86400 } })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json || (typeof json.code === 'number' && json.code < 0)) {
        const msg = json?.msg ?? `HTTP ${res.status}`
        return Response.json({ ok: false, reason: `공공데이터포털 응답: ${msg}` }, { status: 502 })
      }
      const data: Record<string, unknown>[] = Array.isArray(json.data) ? json.data : []
      rows.push(...data)
      if (data.length < PER_PAGE) break
    }
  } catch (err) {
    return Response.json(
      { ok: false, reason: `호출 실패: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    )
  }

  const read = readProgress(rows)
  if (!read.columns.progress || !read.columns.region) {
    // 칸을 못 찾았는데 0건이라고 말하면 '공사 중인 곳이 없다'로 읽힌다. 사유를 그대로 낸다
    return Response.json(
      { ok: false, reason: '원자료에서 공정률·지역 칸을 찾지 못했습니다.', columns: read.columns, rows: read.rows },
      { status: 502 },
    )
  }
  return Response.json({ ok: true, ...read, source: 'HUG 주택도시보증공사 · 공공데이터포털 15083037' })
}
