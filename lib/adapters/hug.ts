/**
 * HUG 빅데이터 개방 포털 — 분양아파트 공정률(지역별) Open API.
 *
 * 공식 사양(프로그램ID RateOfBuildingDistributionApt, 포털 글 34673 · 가이드 23_openapi_download.docx)
 *   요청  https://www.khug.or.kr/rateOfBuildingDistributionApt.do?API_KEY=인증키&AREA_DCD=지역코드
 *   응답  <response><header><resultCode>00</resultCode>…</header><body><items><item>
 *           BUNO(사업장번호) · AREA_DCD(지역코드) · BSU_NM(사업장명) · TPOW_RT(공정률)
 *           · CUST_NM1(시행사) · CUST_NM2(시공사) · ADDR(주소)
 *   오류  [{"ERROR_CODE":"31","ERROR_MSG":"EXPIRED API_KEY."}] 같은 JSON 배열
 *
 * 공정률은 HUG 포털이 직접 승인한 키(HUG_API_KEY)로 부른다. 공공데이터포털 키
 * (DATA_GO_KR_API_KEY — 청약홈·LH)와는 별개다. 서버에서만 읽고 NEXT_PUBLIC_ 을 붙이지 않는다.
 * 요청 주소에 키가 들어가므로 주소를 응답·로그·오류 문구에 남기지 않는다.
 *
 * 지역코드표는 공식 문서에 전체가 실려 있지 않다(예시로 01 서울 · 02 부산만 확인된다).
 * 그래서 코드표를 지어내 지역을 정하지 않는다 — 코드 01~19 를 모두 묻고, 각 사업장의
 * 시·도는 그 행의 주소(ADDR) 첫 단어로 정한다. 코드는 사업장을 빠짐없이 모으는 데만 쓴다.
 */

const ENDPOINT = 'https://www.khug.or.kr/rateOfBuildingDistributionApt.do'
/** 01~19 — 광역 17개에 여유를 둔다. 없는 코드는 빈 결과로 돌아온다 */
export const HUG_AREA_CODES = Array.from({ length: 19 }, (_, i) => String(i + 1).padStart(2, '0'))

export function hugKey(): string {
  return (process.env.HUG_API_KEY ?? '').trim()
}

export interface HugSite {
  BUNO: string
  AREA_DCD: string
  BSU_NM: string
  TPOW_RT: string
  CUST_NM1: string
  CUST_NM2: string
  ADDR: string
}

/** 승인완료(자료 있음) · 미연동(키 없음) · 인증실패 · 자료없음 · 일시오류 */
export type HugStatus = 'OK' | 'NOT_CONFIGURED' | 'AUTH_FAILED' | 'EMPTY' | 'ERROR'

export interface HugResult {
  status: HugStatus
  sites: HugSite[]
  /** 코드별 받은 사업장 수 — 코드표를 실측으로 검증하는 데 쓴다 */
  byCode: Record<string, number>
  /** 사람이 읽는 사유 — 키·주소를 담지 않는다 */
  reason: string | null
}

const tag = (block: string, name: string) =>
  block.match(new RegExp(`<${name}>\\s*(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?\\s*</${name}>`))?.[1]?.trim() ?? ''

type One = { kind: 'ok'; items: HugSite[] } | { kind: 'auth'; msg: string } | { kind: 'err'; msg: string }

/** 응답 한 장을 읽는다 — 정상은 XML, 오류는 JSON 배열로 온다 */
export function parseHug(text: string): One {
  const t = text.trim()
  if (t.startsWith('[') || t.startsWith('{')) {
    try {
      const j = JSON.parse(t) as unknown
      const first = Array.isArray(j) ? (j[0] as Record<string, unknown> | undefined) : (j as Record<string, unknown>)
      const code = String(first?.ERROR_CODE ?? '')
      const msg = String(first?.ERROR_MSG ?? '')
      if (code || msg) return /API_KEY|KEY|인증/i.test(msg) ? { kind: 'auth', msg } : { kind: 'err', msg: msg || `오류 ${code}` }
      // JSON 으로 정상 자료가 오는 경우(items 배열)도 받아 둔다
      const items = (Array.isArray(j) ? j : []) as HugSite[]
      return { kind: 'ok', items: items.filter(x => x && x.BUNO) }
    } catch {
      return { kind: 'err', msg: '응답을 읽지 못했습니다.' }
    }
  }
  const code = tag(t, 'resultCode')
  if (code && code !== '00') {
    const msg = tag(t, 'resultMsg') || `결과 코드 ${code}`
    return /KEY|인증|SERVICE KEY/i.test(msg) ? { kind: 'auth', msg } : { kind: 'err', msg }
  }
  const items = [...t.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => ({
    BUNO: tag(m[1], 'BUNO'),
    AREA_DCD: tag(m[1], 'AREA_DCD'),
    BSU_NM: tag(m[1], 'BSU_NM'),
    TPOW_RT: tag(m[1], 'TPOW_RT'),
    CUST_NM1: tag(m[1], 'CUST_NM1'),
    CUST_NM2: tag(m[1], 'CUST_NM2'),
    ADDR: tag(m[1], 'ADDR'),
  }))
  if (!code && !items.length && !/<response/i.test(t)) return { kind: 'err', msg: '예상과 다른 응답 형식입니다.' }
  return { kind: 'ok', items }
}

export async function fetchHugProgress(): Promise<HugResult> {
  const key = hugKey()
  if (!key) return { status: 'NOT_CONFIGURED', sites: [], byCode: {}, reason: 'HUG_API_KEY 가 설정되지 않았습니다.' }
  const scrub = (s: string) => s.split(key).join('***')

  const results = await Promise.all(
    HUG_AREA_CODES.map(async code => {
      try {
        const q = new URLSearchParams({ API_KEY: key, AREA_DCD: code })
        // 월간 갱신 자료라 하루 동안 다시 묻지 않는다
        // 잘못된 키에는 오류 대신 응답 없이 멈춘다(실측) — 한 요청에 10초까지만 기다린다
        const res = await fetch(`${ENDPOINT}?${q}`, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(10_000) })
        const buf = await res.arrayBuffer()
        // HUG 사이트는 EUC-KR 을 섞어 쓴다 — 머리글 charset 을 따르고, 없으면 UTF-8 로 읽는다
        const charset = (res.headers.get('content-type') ?? '').match(/charset=([\w-]+)/i)?.[1] ?? 'utf-8'
        let text: string
        try {
          text = new TextDecoder(charset).decode(buf)
        } catch {
          text = new TextDecoder('utf-8').decode(buf)
        }
        return { code, one: parseHug(text) }
      } catch (err) {
        return { code, one: { kind: 'err', msg: scrub(err instanceof Error ? err.message : String(err)) } as One }
      }
    }),
  )

  const byCode: Record<string, number> = {}
  const seen = new Map<string, HugSite>()
  let auth: string | null = null
  let errors = 0
  for (const { code, one } of results) {
    if (one.kind === 'auth') auth = scrub(one.msg)
    else if (one.kind === 'err') errors++
    else {
      byCode[code] = one.items.length
      for (const s of one.items) if (s.BUNO && !seen.has(s.BUNO)) seen.set(s.BUNO, s)
    }
  }

  if (auth && seen.size === 0) return { status: 'AUTH_FAILED', sites: [], byCode, reason: `HUG 인증 실패: ${auth}` }
  if (errors === results.length) return { status: 'ERROR', sites: [], byCode, reason: 'HUG 응답을 받지 못했습니다.' }
  const sites = [...seen.values()]
  return { status: sites.length ? 'OK' : 'EMPTY', sites, byCode, reason: null }
}

/** 기존 readProgress 모델로 옮긴다 — 머리글 이름(사업장명·공정률·주소·시행사)으로 칸을 찾는다 */
export function hugToProgressRows(sites: HugSite[]): Record<string, unknown>[] {
  return sites.map(s => ({
    사업장번호: s.BUNO,
    사업장명: s.BSU_NM,
    공정률: s.TPOW_RT,
    주소: s.ADDR,
    시행사: s.CUST_NM1,
    시공사: s.CUST_NM2,
    지역코드: s.AREA_DCD,
  }))
}
