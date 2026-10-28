import { fetchHugProgress, hugToProgressRows } from '@/lib/adapters/hug'
import { readProgress } from '@/lib/consumer/build-progress'

export const dynamic = 'force-dynamic'
// 지역 19곳을 나란히 묻고 한 곳당 10초까지 기다린다
export const maxDuration = 30

/**
 * 지역별 분양아파트 공정률 — HUG 빅데이터 개방 포털 Open API(분양아파트 공정률(지역별)).
 *
 * 예전에는 공공데이터포털 파일데이터(odcloud 15083037)를 공용 키(DATA_GO_KR_API_KEY)로
 * 불렀다. 그 키에는 이 서비스가 연결돼 있지 않아 '등록되지 않은 서비스'가 돌아왔고,
 * 그 원문이 화면에 그대로 나갔다. 이제 HUG 포털이 승인한 키(HUG_API_KEY)로 HUG 를 직접 부른다.
 * (레거시 odcloud 경로와 HUG_PROGRESS_PATH 는 걷었다)
 *
 * status — 화면이 상태별로 다른 말을 하도록 원문 대신 넘긴다:
 *   OK 승인완료·자료 있음 · EMPTY 승인완료·공사 중 사업장 없음 · NOT_CONFIGURED 미연동(키 없음)
 *   · AUTH_FAILED 인증 실패 · ERROR 일시 오류(응답 없음)
 * 오류와 빈 자료를 섞지 않는다 — EMPTY 만 ok:true 이고 provinces 가 빈 배열이다.
 */
export async function GET() {
  const hug = await fetchHugProgress()

  if (hug.status === 'NOT_CONFIGURED' || hug.status === 'AUTH_FAILED' || hug.status === 'ERROR') {
    return Response.json(
      { ok: false, status: hug.status, reason: hug.reason },
      { status: hug.status === 'NOT_CONFIGURED' ? 503 : 502 },
    )
  }

  const read = readProgress(hugToProgressRows(hug.sites))
  if (hug.status === 'OK' && (!read.columns.progress || !read.columns.region)) {
    return Response.json(
      { ok: false, status: 'ERROR', reason: 'HUG 응답에서 공정률·주소 칸을 찾지 못했습니다.' },
      { status: 502 },
    )
  }

  return Response.json({
    ok: true,
    status: read.provinces.length ? 'OK' : 'EMPTY',
    ...read,
    codes: hug.byCode,
    source: 'HUG 빅데이터 개방 포털 · 분양아파트 공정률(지역별)',
  })
}
