/**
 * 정정공고·재공고 정리 — 같은 단지의 같은 모집이 두 장으로 보이지 않게.
 *
 * 운영에서 실제로 본 두 경우(2026-11-18):
 *  - '인천논현2단지 … 모집 공고' 와 '[정정공고]인천논현2단지 … 모집 공고' 가 나란히 열려 있었다.
 *    정정공고가 나오면 원공고는 그 내용으로 바뀐다 — 원공고를 따로 보여 주면 틀린 금액·일정을 읽게 된다.
 *  - '제천 영천동 행복주택 추가(예비)입주자 모집공고' 가 두 장(마이홈 21477-1·18430-1). 주소·금액·마감이
 *    같고, 앞의 것은 2025-07 에 시작해 당첨 발표가 이미 지난 이전 회차였다.
 *
 * 원칙
 *  - 지우지 않는다. 목록·지도·달력에서는 최신 한 장만 세우고, 가려진 공고는 링크로 그대로 열리며
 *    상세 화면이 '정정공고가 있습니다'를 먼저 말한다.
 *  - 같은 모집이라고 볼 근거가 약하면 합치지 않는다. 정정 표시가 없으면 주소와 보증금·월 임대료까지
 *    같아야 한다 — 한 모집 안의 주택형이 금액만 달리 여러 줄로 실릴 수 있고, 주소 없는 LH 목록형
 *    공고는 이름만 같다고 묶지 않는다. 정정공고는 금액을 바꾸려고 내므로 금액을 보지 않는다.
 *  - 순수 함수만 둔다(경로 별칭 없음) — node --test 로 바로 시험한다.
 */

export interface SupersedeInput {
  id: string
  name: string
  address: string
  region: string
  housingType: string
  applicationStart: string | null
  firstSeenAt?: string | null
  announcementId: string
  /** 만 원. 재공고(정정 표시 없음)는 금액까지 같아야 같은 모집으로 본다 */
  deposit?: number | null
  monthlyRent?: number | null
}

export type SupersedeReason = 'CORRECTION' | 'REISSUE'

export interface SupersedeLink {
  id: string
  name: string
  reason: SupersedeReason
}

/** 정정·재공고 표시 — 괄호로 감싼 표기만 본다('[정정공고]'·'(재공고)'). 본문 속 '정정'이라는 낱말은 건드리지 않는다 */
const MARK = /[[(（【「〔]\s*(정정|재|변경|수정)\s*(공고)?\s*[\])）】」〕]/
const MARKS = new RegExp(MARK.source, 'g')

export function correctionMark(name: string): 'CORRECTION' | 'REISSUE' | null {
  const m = name.match(MARK)
  if (!m) return null
  return m[1] === '재' ? 'REISSUE' : 'CORRECTION'
}

/**
 * 화면용 제목 — 같은 표시가 겹쳐 실린 것('[정정공고][정정공고]…', 운영 실측)을 하나로.
 * 표시 자체는 지우지 않는다. 정정공고라는 사실은 읽는 사람이 알아야 한다.
 */
export function tidyTitle(name: string): string {
  return name.replace(new RegExp(`(${MARK.source})(?:\\s*\\1)+`, 'g'), '$1').trim()
}

/** 비교용 제목 — 정정 표시·공백·구두점 차이를 지운다 */
export function baseTitle(name: string): string {
  return name.replace(MARKS, '').replace(/[\s·.,:;'"‘’“”\-_/]+/g, '').toLowerCase()
}

const normAddr = (a: string) => a.replace(/\s+/g, '').replace(/번지/g, '').toLowerCase()

function groupKey(n: SupersedeInput): string | null {
  const title = baseTitle(n.name)
  if (!title) return null
  const addr = normAddr(n.address ?? '')
  // 주소가 없으면 지역으로 묶어 두고, 아래에서 정정 표시가 있는 무리만 합친다
  return [title, addr || `@${n.region}`, n.housingType.trim()].join('|')
}

const sameMoney = (a: SupersedeInput, b: SupersedeInput) =>
  (a.deposit ?? null) === (b.deposit ?? null) && (a.monthlyRent ?? null) === (b.monthlyRent ?? null)

/** 묶인 것 가운데 지금 유효한 한 장 — 정정 표시가 있는 쪽, 그다음 늦게 시작·늦게 실린 쪽 */
function rank(n: SupersedeInput): [number, string, string, string] {
  return [correctionMark(n.name) ? 1 : 0, n.applicationStart ?? '', n.firstSeenAt ?? '', n.announcementId]
}
function newer(a: SupersedeInput, b: SupersedeInput): boolean {
  const ra = rank(a)
  const rb = rank(b)
  for (let i = 0; i < ra.length; i++) {
    if (ra[i] !== rb[i]) return ra[i] > rb[i]
  }
  return a.id > b.id
}

export interface SupersedeResult {
  /** 목록에 세울 공고 id */
  keep: Set<string>
  /** 가려진 공고 → 대신 보여 줄 공고 */
  supersededBy: Map<string, SupersedeLink>
  /** 세운 공고 → 가린 공고들 */
  supersedes: Map<string, SupersedeLink[]>
}

export function supersede(items: readonly SupersedeInput[]): SupersedeResult {
  const groups = new Map<string, SupersedeInput[]>()
  for (const n of items) {
    const k = groupKey(n)
    if (!k) continue
    groups.set(k, [...(groups.get(k) ?? []), n])
  }

  const keep = new Set(items.map(n => n.id))
  const supersededBy = new Map<string, SupersedeLink>()
  const supersedes = new Map<string, SupersedeLink[]>()

  for (const g of groups.values()) {
    if (g.length < 2) continue
    // 주소 없는 목록형 공고는 이름만 같다고 묶지 않는다 — 정정 표시가 있을 때만
    if (!normAddr(g[0].address ?? '') && !g.some(n => correctionMark(n.name))) continue
    const winner = g.reduce((best, n) => (newer(n, best) ? n : best))
    const reason: SupersedeReason = correctionMark(winner.name) === 'CORRECTION' ? 'CORRECTION' : 'REISSUE'
    for (const n of g) {
      if (n.id === winner.id) continue
      // 정정 관계가 아니면 금액까지 같은 것만 같은 모집으로 본다
      if (!correctionMark(winner.name) && !correctionMark(n.name) && !sameMoney(n, winner)) continue
      keep.delete(n.id)
      supersededBy.set(n.id, { id: winner.id, name: winner.name, reason })
      supersedes.set(winner.id, [...(supersedes.get(winner.id) ?? []), { id: n.id, name: n.name, reason }])
    }
  }
  return { keep, supersededBy, supersedes }
}
