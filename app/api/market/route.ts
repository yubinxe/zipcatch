import { readMarket } from '@/lib/services/market-read'

/**
 * 분양 시장 판독.
 *
 * 표 세 개를 통째로 받아 잇는 일이라 처음 한 번은 몇 초 걸린다. 그래서
 * 페이지가 서버에서 기다리지 않고 이 길로 따로 받아 간다 — 나머지 화면은
 * 먼저 그려지고 표만 늦게 채워진다.
 *
 * 지난 공고는 바뀌지 않으므로 바깥 호출은 여섯 시간 캐시다(applyhome-bulk).
 */
export const dynamic = 'force-dynamic'
/*
 * 표 셋을 통째로 받는다. 플랫폼 기본 제한 시간이 짧으면 처음 한 번은 끝나기 전에
 * 잘려 화면에 '불러오지 못했습니다'만 남는다. 공급 판독(/api/pro/read)과 같게 둔다.
 */
export const maxDuration = 60

export async function GET() {
  try {
    return Response.json(await readMarket())
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : '시장 판독에 실패했습니다.' },
      { status: 500 },
    )
  }
}
