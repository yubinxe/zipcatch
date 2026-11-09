/**
 * 뜨거운 키워드 — 가져온 기사 제목에서만 뽑는다.
 *
 * 본문은 매체의 것이라 받아 오지 않는다. 그래서 여기서 세는 것은 언제나
 * '최근 기사 제목에서 자주 등장한 부동산 용어'이고, 화면에도 그렇게 적는다.
 * 외부 인기 지수나 검색량이 아니다.
 *
 * 셈의 단위는 '서로 다른 기사'다. 같은 사건을 여러 매체가 같은 제목으로 실어
 * 나르므로(연합 기사), 제목을 정규화해 중복을 먼저 걷어낸 뒤 센다.
 *
 * 모형을 쓰지 않는다. 사전 + 최장 일치 + 설명 가능한 가중치뿐이다 —
 * 같은 입력에 늘 같은 순위가 나와야 하고, 왜 1위인지 말할 수 있어야 한다.
 */

export interface NewsLike {
  title: string
  source?: string | null
  publishedAt?: string | null
}

export interface HotKeyword {
  /** 화면에 적는 말 */
  term: string
  /** 이 말이 나온 서로 다른 기사 수 */
  articles: number
  /** 이 말을 실은 서로 다른 매체 수 */
  outlets: number
  /** 설명 가능한 순위 점수 — 외부 지수가 아니다 */
  score: number
  /** 사전에서의 갈래 */
  kind: KeywordKind
}

export type KeywordKind = '정책' | '공급' | '금융' | '지역' | '교통' | '기관' | '시장'

/**
 * 부동산 사전. 여기 적힌 말이라도 기사에 실제로 나오지 않으면 순위에 오르지 않는다.
 *
 * `aliases` 는 같은 것을 가리키는 다른 표기다. 뜻이 다른 말을 묶지 않는다 —
 * 이를테면 주택 '청약'과 증권 '공모주 청약'은 서로 다른 일이라 묶지 않는다.
 */
interface Entry {
  term: string
  kind: KeywordKind
  aliases?: string[]
  /** 사전 밖의 흔한 말보다 얼마나 더 도메인에 붙어 있는가 (1.0 = 보통) */
  weight?: number
}

const DICT: Entry[] = [
  // 정책·제도
  { term: '분양가상한제', kind: '정책', weight: 1.3 },
  { term: '토지거래허가구역', kind: '정책', aliases: ['토허제', '토지거래허가'], weight: 1.3 },
  { term: '재건축초과이익환수', kind: '정책', aliases: ['재초환'], weight: 1.3 },
  { term: '전매제한', kind: '정책' },
  { term: '실거주의무', kind: '정책', aliases: ['실거주 의무'] },
  { term: '투기과열지구', kind: '정책', weight: 1.2 },
  { term: '조정대상지역', kind: '정책', weight: 1.2 },
  { term: '부동산대책', kind: '정책', aliases: ['부동산 대책'] },
  { term: '주택공급대책', kind: '정책', aliases: ['공급대책', '주택공급 대책'] },

  // 공급·공고
  { term: '특별공급', kind: '공급', weight: 1.25 },
  { term: '일반공급', kind: '공급', weight: 1.2 },
  { term: '사전청약', kind: '공급', weight: 1.2 },
  { term: '무순위청약', kind: '공급', aliases: ['무순위 청약', '줍줍'], weight: 1.3 },
  { term: '신혼희망타운', kind: '공급', weight: 1.25 },
  { term: '공공임대주택', kind: '공급', aliases: ['공공임대'], weight: 1.2 },
  { term: '행복주택', kind: '공급', weight: 1.15 },
  { term: '매입임대', kind: '공급', weight: 1.15 },
  { term: '전세임대', kind: '공급', weight: 1.15 },
  { term: '토지임대부', kind: '공급', weight: 1.3 },
  { term: '미분양주택', kind: '공급', aliases: ['미분양'], weight: 1.2 },
  { term: '청약경쟁률', kind: '공급', aliases: ['경쟁률'], weight: 1.2 },
  { term: '당첨가점', kind: '공급', aliases: ['가점', '청약가점'], weight: 1.2 },
  { term: '입주자모집공고', kind: '공급', aliases: ['모집공고'], weight: 1.2 },
  { term: '재개발', kind: '공급' },
  { term: '재건축', kind: '공급' },
  { term: '리모델링', kind: '공급' },

  // 금융
  { term: '주택담보대출', kind: '금융', aliases: ['주담대'], weight: 1.3 },
  { term: '스트레스 DSR', kind: '금융', aliases: ['스트레스DSR'], weight: 1.35 },
  { term: 'DSR', kind: '금융', weight: 1.2 },
  { term: 'LTV', kind: '금융', weight: 1.2 },
  { term: '전세자금대출', kind: '금융', aliases: ['전세대출'], weight: 1.25 },
  { term: '디딤돌대출', kind: '금융', aliases: ['디딤돌 대출'], weight: 1.25 },
  { term: '보금자리론', kind: '금융', weight: 1.25 },
  { term: '중도금대출', kind: '금융', aliases: ['중도금 대출'], weight: 1.2 },
  { term: '기준금리', kind: '금융', weight: 1.15 },

  // 시장
  { term: '전세사기', kind: '시장', weight: 1.35 },
  { term: '역전세', kind: '시장', weight: 1.25 },
  { term: '갭투자', kind: '시장', weight: 1.2 },
  { term: '실거래가', kind: '시장', weight: 1.15 },
  { term: '매매가격', kind: '시장', aliases: ['매맷값'] },
  { term: '전셋값', kind: '시장', aliases: ['전세가격', '전세값'] },
  { term: '월세', kind: '시장' },
  { term: '분양권', kind: '시장', weight: 1.15 },

  // 교통
  { term: 'GTX', kind: '교통', weight: 1.3 },
  { term: '광역급행철도', kind: '교통', weight: 1.2 },
  { term: '신안산선', kind: '교통', weight: 1.2 },

  // 기관
  { term: '국토교통부', kind: '기관', aliases: ['국토부'], weight: 1.1 },
  { term: '한국토지주택공사', kind: '기관', aliases: ['LH'], weight: 1.15 },
  { term: '서울주택도시개발공사', kind: '기관', aliases: ['SH공사', 'SH'], weight: 1.15 },
  { term: 'HUG', kind: '기관', aliases: ['주택도시보증공사'], weight: 1.15 },
  { term: '한국부동산원', kind: '기관', weight: 1.1 },

  // 지역 — 광역 17
  ...(
    [
      '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
      '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
    ] as const
  ).map(term => ({ term, kind: '지역' as KeywordKind, weight: 0.9 })),
]

/** 주택 청약과 증권 청약을 가르는 말 — 제목에 이것이 있으면 '청약'을 세지 않는다 */
const SECURITIES = ['공모주', '유상증자', '상장', '코스닥', '코스피', 'IPO', '증권', '수요예측']

/**
 * 제목 정규화 — 같은 기사를 두 번 세지 않기 위한 열쇠.
 *
 * 유니코드를 합치고(NFKC), 매체가 붙이는 꼬리표([단독]·<속보>·"- 매체명")를 떼고,
 * 문장부호와 공백을 지운다. 떼고 나서도 뜻은 남으므로 셈의 단위로 쓸 수 있다.
 */
export function normalizeTitle(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/[\[(<【][^\])>】]{0,12}[\])>】]/g, ' ')
    .replace(/\s[-–—|]\s[^-–—|]{1,20}$/u, ' ')
    .replace(/[“”"'‘’`…·,.!?:;~^*_/\\]/g, ' ')
    .replace(/\s+/g, '')
    .toLowerCase()
}

/** 서로 다른 기사만 남긴다 — 연합 기사가 순위를 부풀리지 않게 */
export function dedupe<T extends NewsLike>(items: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const it of items) {
    const key = normalizeTitle(it.title ?? '')
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(it)
  }
  return out
}

/** 사전을 '긴 말 먼저' 로 펼친다 — 최장 일치. '공공임대주택' 이 '임대' 로 쪼개지지 않게 */
const SURFACES: { surface: string; entry: Entry }[] = DICT.flatMap(e =>
  [e.term, ...(e.aliases ?? [])].map(surface => ({ surface, entry: e })),
).sort((a, b) => b.surface.length - a.surface.length)

const hay = (title: string) => title.normalize('NFKC').replace(/\s+/g, ' ').toLowerCase()

/** 한 제목에 어떤 사전 항목이 들어 있는가 (최장 일치, 같은 항목은 한 번만) */
export function termsIn(title: string): Entry[] {
  let rest = hay(title)
  const securities = SECURITIES.some(w => rest.includes(w.toLowerCase()))
  const found = new Map<string, Entry>()
  for (const { surface, entry } of SURFACES) {
    const s = surface.toLowerCase()
    if (!rest.includes(s)) continue
    // 증권 기사에서는 주택 청약 계열 용어를 세지 않는다
    if (securities && (entry.kind === '공급' || entry.term === '청약')) continue
    found.set(entry.term, entry)
    // 찾은 자리를 비워 더 짧은 말이 같은 글자를 다시 집지 않게 한다
    rest = rest.split(s).join(' ')
  }
  return [...found.values()]
}

const DAY = 86_400_000

/** 최신일수록 무겁게 — 사흘이면 절반 (설명 가능한 단순 감쇠) */
function recency(publishedAt: string | null | undefined, now: number): number {
  const t = publishedAt ? Date.parse(publishedAt) : NaN
  if (!Number.isFinite(t)) return 0.6 // 시각을 모르면 중간값. 버리지도, 밀어 주지도 않는다
  const days = Math.max(0, (now - t) / DAY)
  return Math.pow(0.5, days / 3)
}

export interface ExtractOptions {
  now?: number
  /** 몇 개까지 */
  limit?: number
  /** 적어도 이만큼의 기사에 나와야 순위에 올린다 */
  minArticles?: number
}

/**
 * 순위 = 서로 다른 기사 수 × 최신도 × 도메인 가중치 × 매체 다양성
 *
 * 매체 다양성을 곱하는 이유: 한 매체가 비슷한 제목으로 다섯 번 쓴 말보다
 * 다섯 매체가 한 번씩 쓴 말이 '지금 이야기되는 것'에 가깝다.
 */
export function extractHotKeywords(itemsRaw: NewsLike[], opts: ExtractOptions = {}): HotKeyword[] {
  const now = opts.now ?? Date.now()
  const limit = opts.limit ?? 12
  const minArticles = opts.minArticles ?? 2

  const items = dedupe(itemsRaw)
  const acc = new Map<string, { entry: Entry; articles: number; outlets: Set<string>; recency: number }>()

  for (const it of items) {
    const r = recency(it.publishedAt, now)
    for (const entry of termsIn(it.title ?? '')) {
      const cur = acc.get(entry.term) ?? { entry, articles: 0, outlets: new Set<string>(), recency: 0 }
      cur.articles += 1
      cur.recency += r
      if (it.source) cur.outlets.add(it.source)
      acc.set(entry.term, cur)
    }
  }

  const out: HotKeyword[] = []
  for (const [term, v] of acc) {
    if (v.articles < minArticles) continue
    const outlets = v.outlets.size
    const diversity = 1 + Math.log2(Math.max(1, outlets)) / 4
    const score = v.recency * (v.entry.weight ?? 1) * diversity
    out.push({ term, articles: v.articles, outlets, score: Math.round(score * 1000) / 1000, kind: v.entry.kind })
  }

  return out
    .sort((a, b) => b.score - a.score || b.articles - a.articles || a.term.localeCompare(b.term, 'ko'))
    .slice(0, limit)
}

/** 어떤 기사가 이 키워드에 걸리는가 — 화면의 '걸러 보기'와 같은 판정을 쓴다 */
export function matchesKeyword(title: string, term: string): boolean {
  return termsIn(title).some(e => e.term === term)
}
