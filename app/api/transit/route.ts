import { NextRequest } from 'next/server'
import { odsayKey } from '@/lib/config/data-portal-key'

export const maxDuration = 20

/**
 * 대중교통 경로 — ODsay searchPubTransPathT.
 *
 * 키는 웹 플랫폼(URI 등록)으로 발급돼 있어 서버에서 부를 때도 등록한 주소를 Referer 로 싣는다.
 * 사용자가 '경로 보기'를 눌렀을 때만 부르고, 같은 출발·도착은 하루 동안 다시 묻지 않는다.
 * 키는 요청 주소에만 들어가므로 주소·원문 오류를 응답에 남기지 않는다.
 */
const ENDPOINT = 'https://api.odsay.com/v1/api/searchPubTransPathT'
const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://zipcatch.vercel.app').replace(/\/$/, '')

interface Lane {
  name?: string
  busNo?: string
}
interface SubPath {
  trafficType: number
  sectionTime: number
  distance?: number
  stationCount?: number
  startName?: string
  endName?: string
  lane?: Lane[]
}
interface Path {
  pathType: number
  info: { totalTime: number; payment: number; busTransitCount: number; subwayTransitCount: number; totalWalk: number }
  subPath: SubPath[]
}

const num = (v: string | null) => (v !== null && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null)

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const sx = num(p.get('sx')), sy = num(p.get('sy')), ex = num(p.get('ex')), ey = num(p.get('ey'))
  if (sx === null || sy === null || ex === null || ey === null) {
    return Response.json({ ok: false, status: 'BAD_REQUEST' }, { status: 400 })
  }
  const key = odsayKey()
  if (!key) return Response.json({ ok: false, status: 'NOT_CONFIGURED' })

  const q = new URLSearchParams({ SX: String(sx), SY: String(sy), EX: String(ex), EY: String(ey), apiKey: key })
  let json: { result?: { path?: Path[] }; error?: unknown } | null = null
  try {
    const res = await fetch(`${ENDPOINT}?${q}`, {
      headers: { Referer: `${SITE}/`, Origin: SITE },
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(12_000),
    })
    json = await res.json().catch(() => null)
  } catch {
    return Response.json({ ok: false, status: 'ERROR' }, { status: 502 })
  }

  if (!json || json.error) {
    const e = Array.isArray(json?.error) ? (json!.error as Record<string, unknown>[])[0] : (json?.error as Record<string, unknown> | undefined)
    const code = String(e?.code ?? '')
    const msg = String(e?.msg ?? e?.message ?? '')
    // -98 출·도착이 700m 이내 · -99 검색 결과 없음 → 경로가 없는 것이지 고장이 아니다
    if (code === '-98' || code === '-99' || code === '3' || code === '4' || code === '5' || code === '6') {
      return Response.json({ ok: true, status: 'EMPTY', near: code === '-98' })
    }
    const auth = code === '500' || /key|apikey|인증|platform|referer|uri/i.test(msg)
    // 원인은 서버 기록에만 — 키는 담기지 않는다
    console.warn('[transit] ODsay error', code, msg.slice(0, 120))
    // ODsay 오류 코드는 키를 담지 않는다 — 운영에서 원인을 가리기 위해 코드만 싣는다(화면에는 내지 않는다)
    return Response.json({ ok: false, status: auth ? 'AUTH_FAILED' : 'ERROR', code: code || null }, { status: 502 })
  }

  const paths = (json.result?.path ?? []).slice().sort((a, b) => a.info.totalTime - b.info.totalTime)
  if (!paths.length) return Response.json({ ok: true, status: 'EMPTY' })

  const best = paths[0]
  return Response.json({
    ok: true,
    status: 'OK',
    totalTime: best.info.totalTime,
    payment: best.info.payment,
    transfers: Math.max(0, best.info.busTransitCount + best.info.subwayTransitCount - 1),
    walk: best.info.totalWalk,
    legs: best.subPath
      .filter(s => s.trafficType !== 3 || s.sectionTime > 0)
      .map(s => ({
        mode: s.trafficType === 1 ? 'SUBWAY' : s.trafficType === 2 ? 'BUS' : 'WALK',
        minutes: s.sectionTime,
        line: s.trafficType === 1 ? s.lane?.[0]?.name ?? null : s.trafficType === 2 ? s.lane?.map(l => l.busNo).filter(Boolean).slice(0, 3).join('·') || null : null,
        from: s.startName ?? null,
        to: s.endName ?? null,
        stops: s.stationCount ?? null,
      })),
    alternatives: paths.length - 1,
    source: 'ODsay 대중교통 길찾기',
  })
}
