'use client'

import Link from 'next/link'
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import PageMasthead from './PageMasthead'

/**
 * 청약뉴스 — 뉴스룸.
 *
 * 기사를 옮겨 적지 않는다. 제목과 매체, 시각만 두고 클릭은 원문으로 보낸다 —
 * 본문은 매체의 것이고, 우리가 요약해 얹으면 그 요약이 기사처럼 읽힌다.
 * 요약이 틀리면 매체가 틀린 것으로 읽히므로 아예 만들지 않는다.
 *
 * 무엇으로 모았는지도 화면에 적는다. 뉴스를 '골라 준' 것처럼 보이면
 * 고르지 않은 기사가 없는 것처럼 읽힌다. 맨 앞에 크게 세우는 한 건도
 * '중요한 기사'가 아니라 '주요 언론사 기사 가운데 가장 최근 것'이라고 이름을 붙인다.
 */

interface NewsItem {
  title: string
  link: string
  source: string
  publishedAt: string | null
  /** 매체 로고. 기사 사진이 아니다 — 지어낸 이미지를 얹지 않는다 */
  logo: string | null
  /** 매체 누리집 주소. 예전 응답에는 없다 */
  domain?: string | null
}

interface Entry {
  items: NewsItem[]
  query: string
  fetchedAt: string | null
  error: string | null
  /** 몇 번째 요청으로 받은 것인지. 새로고침을 누르면 이보다 큰 값을 요구한다 */
  rev: number
}

const TABS = [
  { key: 'subscription', label: '청약', hint: '모집공고·분양 일정·경쟁률 소식' },
  { key: 'policy', label: '주거정책', hint: '제도 변경과 정부 발표' },
  { key: 'supply', label: '공급대책', hint: '공급 물량과 신규 택지' },
  { key: 'rent', label: '공공임대', hint: '임대 공고와 입주 소식' },
  { key: 'market', label: '부동산 시장', hint: '시세·거래·금리 흐름' },
] as const

type TopicKey = (typeof TABS)[number]['key']

/**
 * 주요 언론사.
 *
 * 구글 뉴스는 매체를 가리지 않고 모아 준다. 덕분에 작은 매체의 단독도 걸리지만,
 * 같은 사안을 서른 곳이 받아쓴 목록이 되기도 한다. 읽는 쪽이 고를 수 있게
 * 한 겹을 둔다 — 기본은 전체다. 걸러내는 것을 기본으로 삼으면 우리가 고른
 * 목록을 전부인 것처럼 보이게 된다. 기준은 화면 아래에 그대로 펼쳐 둔다.
 *
 * 매체명은 구글 뉴스가 적어 주는 표기를 그대로 맞춘다.
 */
const MAJOR_OUTLETS = [
  '조선일보', '중앙일보', '동아일보', '한국일보', '서울신문', '경향신문', '한겨레',
  '국민일보', '세계일보', '문화일보',
  '한국경제', '매일경제', '서울경제', '머니투데이', '이데일리', '파이낸셜뉴스',
  '헤럴드경제', '아시아경제',
  '연합뉴스', '뉴시스', '뉴스1',
  'KBS', 'MBC', 'SBS', 'YTN', 'JTBC', 'MBN', '채널A', 'TV조선',
]

/** 표기가 조금씩 다르다 — '한국경제TV', '조선비즈' 도 같은 집안으로 본다 */
function isMajor(source: string) {
  const t = (source ?? '').replace(/\s/g, '')
  return MAJOR_OUTLETS.some(m => t.includes(m.replace(/\s/g, '')))
}

/* ── 시각 ─────────────────────────────────────────────────── */

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

function parse(iso: string | null) {
  if (!iso) return null
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? null : t
}

function startOfDay(ms: number) {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** 주는 월요일에 시작한다 */
function startOfWeek(ms: number) {
  const d = new Date(startOfDay(ms))
  const dow = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dow)
  return d.getTime()
}

/** 얼마나 묵은 소식인지로 적는다. 날짜만 적으면 셈을 해야 한다 */
function ago(iso: string | null, now: number) {
  const t = parse(iso)
  if (t === null) return '시각 미상'
  const diff = now - t
  if (diff < MIN) return '방금'
  if (diff < HOUR) return `${Math.floor(diff / MIN)}분 전`
  if (diff < DAY) return `${Math.floor(diff / HOUR)}시간 전`
  const days = Math.round((startOfDay(now) - startOfDay(t)) / DAY)
  if (days <= 6) return `${Math.max(1, days)}일 전`
  return monthDay(t, new Date(t).getFullYear() !== new Date(now).getFullYear())
}

function monthDay(ms: number, withYear = false) {
  const d = new Date(ms)
  return `${withYear ? `${d.getFullYear()}년 ` : ''}${d.getMonth() + 1}월 ${d.getDate()}일`
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

/** 마우스를 올리면 정확한 시각이 보인다 */
function exact(iso: string | null) {
  const t = parse(iso)
  if (t === null) return undefined
  const d = new Date(t)
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY[d.getDay()]}) ${clock(t)}`
}

function clock(ms: number) {
  const d = new Date(ms)
  const h = d.getHours()
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${m}`
}

/* ── 날짜 묶음 ────────────────────────────────────────────── */

type GroupKey = 'today' | 'yesterday' | 'week' | 'lastweek' | 'earlier' | 'unknown'

const GROUP_LABEL: Record<GroupKey, string> = {
  today: '오늘',
  yesterday: '어제',
  week: '이번 주',
  lastweek: '지난주',
  earlier: '그 이전',
  unknown: '시각 미상',
}

function groupOf(iso: string | null, now: number): GroupKey {
  const t = parse(iso)
  if (t === null) return 'unknown'
  const today = startOfDay(now)
  if (t >= today) return 'today'
  if (t >= today - DAY) return 'yesterday'
  const week = startOfWeek(now)
  if (t >= week) return 'week'
  if (t >= week - 7 * DAY) return 'lastweek'
  return 'earlier'
}

/** 묶음 이름 옆에 실제 날짜를 적는다 — '이번 주'가 언제부터인지 셈하지 않게 */
function groupDates(items: NewsItem[]) {
  const ts = items.map(n => parse(n.publishedAt)).filter((x): x is number => x !== null)
  if (ts.length === 0) return ''
  const lo = Math.min(...ts)
  const hi = Math.max(...ts)
  const one = (ms: number) => `${monthDay(ms)} ${WEEKDAY[new Date(ms).getDay()]}요일`
  if (startOfDay(lo) === startOfDay(hi)) return one(hi)
  return `${monthDay(lo)} – ${monthDay(hi)}`
}

/* ── 매체 표식 ────────────────────────────────────────────── */

/** 로고가 없을 때의 머리글자. 'KBS'·'YTN' 같은 영문 약칭은 통째로 */
function monogram(source: string) {
  const s = (source ?? '').trim()
  const latin = s.match(/^[A-Z0-9]{2,4}\b/)
  if (latin) return latin[0]
  return s.slice(0, 1) || '·'
}

/**
 * 매체 표식.
 *
 * 머리글자를 먼저 깔고, 로고가 제대로 내려오면 그 위에 덮는다. 로고가 늦거나
 * 깨져도 칸이 비거나 깨진 그림이 남지 않는다. 구글 파비콘 서비스는 로고를
 * 못 찾으면 16px 지구본을 돌려주는데, 그것을 키우면 흐릿한 얼룩이 된다 —
 * 32px 보다 작게 오면 머리글자를 그대로 둔다.
 */
function SourceMark({
  logo,
  source,
  size = 'md',
}: {
  logo: string | null
  source: string
  size?: 'md' | 'lg'
}) {
  const [state, setState] = useState<'wait' | 'ok' | 'fail'>('wait')
  const mark = monogram(source)
  return (
    <span className="cs-nr-mark" data-size={size} data-long={mark.length > 2 ? 'true' : undefined} aria-hidden="true">
      <span className="cs-nr-mark__initial">{mark}</span>
      {logo && state !== 'fail' && (
        // next/image 를 쓰지 않는다. 파비콘 서른 장을 이미지 최적화기에
        // 태우면 변환 비용만 늘고 얻는 게 없다.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="cs-nr-mark__logo"
          data-on={state === 'ok' ? 'true' : 'false'}
          src={logo}
          alt=""
          loading="lazy"
          decoding="async"
          width={40}
          height={40}
          // 파비콘은 구글에서 받아 온다. 기본값으로 두면 우리 주소가
          // 매체마다 한 번씩 구글로 함께 나간다.
          referrerPolicy="no-referrer"
          onLoad={e => setState(e.currentTarget.naturalWidth >= 32 ? 'ok' : 'fail')}
          onError={() => setState('fail')}
        />
      )}
    </span>
  )
}

/* ── 아이콘 — 선 두께와 끝맺음을 한 벌로 ───────────────────── */

function IconArrow() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M6 14 14 6M7.5 6H14v6.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconRefresh() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M16 10a6 6 0 1 1-1.76-4.24M16 4v3.5h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconPaper() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" focusable="false">
      <rect x="6" y="6" width="17" height="21" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M23 11h2.5A1.5 1.5 0 0 1 27 12.5V24a3 3 0 0 1-3 3h-1M10 11h9M10 15.5h9M10 20h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function IconOffline() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" focusable="false">
      <path d="M5 12.5a16 16 0 0 1 22 0M9 17a10 10 0 0 1 14 0M13 21.5a4.5 4.5 0 0 1 6 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="16" cy="25.5" r="1.4" fill="currentColor" />
      <path d="M6 6l20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function IconFilter() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" focusable="false">
      <path d="M6 8h20l-7.5 9v7l-5 2.5V17z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

/* ── 본문 ─────────────────────────────────────────────────── */

export default function NewsView() {
  const uid = useId()
  const [topic, setTopic] = useState<TopicKey>(TABS[0].key)
  /** 전체 / 주요 언론사. 기본은 전체다 */
  const [majorOnly, setMajorOnly] = useState(false)
  /** 주제별로 받아 둔 결과. 다시 누르면 기다리지 않고 바로 보인다 */
  const [store, setStore] = useState<Partial<Record<TopicKey, Entry>>>({})
  /** 새로고침·다시 시도 때 올린다. 받아 둔 결과가 이보다 낡았으면 다시 받는다 */
  const [rev, setRev] = useState(0)
  /** '3시간 전'이 멈춰 있지 않게, 1분마다 지금을 갱신한다 */
  const [now, setNow] = useState(() => Date.now())

  const entry = store[topic]
  const current = TABS.find(t => t.key === topic) ?? TABS[0]
  const stale = !entry || entry.rev < rev
  /** 처음 받는 중 — 보여줄 것이 없다 */
  const loading = !entry || (stale && Boolean(entry.error))
  /** 이미 보이는 목록을 새로 받는 중 */
  const refreshing = Boolean(entry) && stale && !entry?.error

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    const have = store[topic]
    if (have && have.rev >= rev) return
    const ctrl = new AbortController()
    const want = rev
    const t0 = performance.now()
    // 다시 시도·새로고침은 너무 빨리 끝나면 누른 것이 먹혔는지 보이지 않는다.
    // 처음 불러올 때는 기다리게 하지 않고, 다시 받을 때만 잠깐 붙든다.
    const settle = <T,>(v: T) =>
      want === 0
        ? Promise.resolve(v)
        : new Promise<T>(res => window.setTimeout(() => res(v), Math.max(0, 520 - (performance.now() - t0))))
    fetch(`/api/news?topic=${topic}`, { cache: 'no-store', signal: ctrl.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`서버가 응답하지 않았습니다 (${r.status}).`))))
      .then(settle)
      .then((json: { items?: NewsItem[]; query?: string; fetchedAt?: string; error?: string | null }) => {
        if (ctrl.signal.aborted) return
        setNow(Date.now())
        setStore(s => ({
          ...s,
          [topic]: {
            items: Array.isArray(json.items) ? json.items : [],
            query: json.query ?? '',
            fetchedAt: json.fetchedAt ?? new Date().toISOString(),
            error: json.error ?? null,
            rev: want,
          },
        }))
      })
      .catch(async (err: unknown) => {
        if (ctrl.signal.aborted) return
        await settle(null)
        if (ctrl.signal.aborted) return
        setStore(s => ({
          ...s,
          [topic]: {
            items: [],
            query: '',
            fetchedAt: null,
            error: err instanceof Error && err.message ? err.message : '뉴스를 불러오지 못했습니다.',
            rev: want,
          },
        }))
      })
    return () => ctrl.abort()
  }, [topic, rev, store])

  const fetched = useMemo(() => entry?.items ?? [], [entry])
  const majorCount = useMemo(() => fetched.filter(n => isMajor(n.source)).length, [fetched])
  const items = useMemo(
    () => (majorOnly ? fetched.filter(n => isMajor(n.source)) : fetched),
    [fetched, majorOnly],
  )

  /** 맨 앞의 한 건 — 주요 언론사 기사 가운데 가장 최근 것. 없으면 그냥 가장 최근 것 */
  const leadIndex = useMemo(() => {
    const i = items.findIndex(n => isMajor(n.source))
    return i === -1 ? 0 : i
  }, [items])
  const lead = items[leadIndex] ?? null
  const rest = useMemo(() => items.filter((_, i) => i !== leadIndex), [items, leadIndex])

  const groups = useMemo(() => {
    const order: GroupKey[] = ['today', 'yesterday', 'week', 'lastweek', 'earlier', 'unknown']
    const map = new Map<GroupKey, NewsItem[]>()
    for (const n of rest) {
      const g = groupOf(n.publishedAt, now)
      map.set(g, [...(map.get(g) ?? []), n])
    }
    // 들어서는 순서 — 묶음을 건너도 이어서 센다
    let offset = 0
    return order
      .filter(k => map.has(k))
      .map(k => {
        const list = map.get(k)!
        const g = { key: k, items: list, offset }
        offset += list.length
        return g
      })
  }, [rest, now])

  const stats = useMemo(() => {
    const today = startOfDay(now)
    return {
      total: fetched.length,
      today: fetched.filter(n => (parse(n.publishedAt) ?? 0) >= today).length,
      outlets: new Set(fetched.map(n => n.source)).size,
      major: majorCount,
    }
  }, [fetched, majorCount, now])

  /* ── 붙는 주제 막대 ─────────────────────────────────────── */
  const rootRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const tabsRef = useRef<HTMLDivElement>(null)
  const inkRef = useRef<HTMLSpanElement>(null)
  const tabRefs = useRef<Partial<Record<TopicKey, HTMLButtonElement | null>>>({})

  // 머리글 높이만큼 내려 붙는다. 휴대폰에서는 메뉴가 둘째 줄로 내려와
  // 머리글이 두 배 가까이 높아지므로 숫자로 박지 않고 잰다.
  useEffect(() => {
    const root = rootRef.current
    const header = document.querySelector<HTMLElement>('.cs-header')
    if (!root || !header) return
    const apply = () => {
      const pos = getComputedStyle(header).position
      const h = pos === 'sticky' || pos === 'fixed' ? header.getBoundingClientRect().height : 0
      root.style.setProperty('--nr-top', `${Math.round(h)}px`)
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(header)
    return () => ro.disconnect()
  }, [])

  // 막대가 머리글 밑에 붙었는지. 붙으면 바탕을 깔고 그림자를 단다
  useEffect(() => {
    const sentinel = sentinelRef.current
    const bar = barRef.current
    const root = rootRef.current
    if (!sentinel || !bar || !root) return
    let io: IntersectionObserver | null = null
    const make = () => {
      io?.disconnect()
      const top = parseFloat(getComputedStyle(root).getPropertyValue('--nr-top')) || 0
      io = new IntersectionObserver(
        ([e]) => {
          bar.dataset.stuck = !e.isIntersecting && e.boundingClientRect.top < top + 1 ? 'true' : 'false'
        },
        { rootMargin: `-${top + 1}px 0px 0px 0px`, threshold: 0 },
      )
      io.observe(sentinel)
    }
    make()
    const ro = new ResizeObserver(make)
    ro.observe(document.querySelector('.cs-header') ?? document.body)
    return () => {
      io?.disconnect()
      ro.disconnect()
    }
  }, [])

  // 고른 주제 밑의 선. 너비를 바꾸지 않고 옮기고 늘이기만 한다(transform)
  const placeInk = useCallback((animate: boolean) => {
    const ink = inkRef.current
    const tab = tabRefs.current[topic]
    const strip = tabsRef.current
    if (!ink || !tab || !strip) return
    if (!animate) ink.dataset.instant = 'true'
    ink.style.setProperty('--x', `${tab.offsetLeft}px`)
    ink.style.setProperty('--w', String(tab.offsetWidth / 100))
    if (!animate) {
      void ink.offsetWidth
      delete ink.dataset.instant
    }
    // 휴대폰에서 옆으로 밀리는 탭 — 고른 것이 가려지지 않게 끌어온다
    const left = tab.offsetLeft - 24
    const right = tab.offsetLeft + tab.offsetWidth + 24 - strip.clientWidth
    if (strip.scrollLeft > left) strip.scrollTo({ left, behavior: animate ? 'smooth' : 'auto' })
    else if (strip.scrollLeft < right) strip.scrollTo({ left: right, behavior: animate ? 'smooth' : 'auto' })
  }, [topic])

  const firstInk = useRef(true)
  /** 크기 변화 감시는 한 번만 건다 — 최신 placeInk 는 여기로 건넨다 */
  const placeRef = useRef(placeInk)
  useLayoutEffect(() => {
    placeRef.current = placeInk
    placeInk(!firstInk.current)
    firstInk.current = false
  }, [placeInk])

  useEffect(() => {
    const strip = tabsRef.current
    if (!strip) return
    // 처음 한 번 부르는 것은 건너뛴다. 그때 제자리에 놓으면 막 시작한 미끄럼이 끊긴다
    let w = strip.clientWidth
    const ro = new ResizeObserver(() => {
      if (strip.clientWidth === w) return
      w = strip.clientWidth
      placeRef.current(false)
    })
    ro.observe(strip)
    // 글꼴이 늦게 붙으면 탭 너비가 바뀐다
    document.fonts?.ready.then(() => placeRef.current(false)).catch(() => {})
    return () => ro.disconnect()
  }, [])

  /** 막대가 붙은 채로 주제를 바꾸면, 새 목록의 처음으로 데려간다 */
  const toTop = useCallback(() => {
    const sentinel = sentinelRef.current
    const bar = barRef.current
    if (!sentinel || bar?.dataset.stuck !== 'true') return
    const top = parseFloat(getComputedStyle(rootRef.current!).getPropertyValue('--nr-top')) || 0
    const y = sentinel.getBoundingClientRect().top + window.scrollY - top
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' })
  }, [])

  const choose = useCallback(
    (key: TopicKey) => {
      if (key !== topic) {
        // 실패했던 주제로 돌아오면 다시 받아 본다
        if (store[key]?.error) setRev(r => r + 1)
        setTopic(key)
      }
      toTop()
    },
    [topic, store, toTop],
  )

  const onTabKey = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    const i = TABS.findIndex(t => t.key === topic)
    let next = -1
    if (e.key === 'ArrowRight') next = (i + 1) % TABS.length
    else if (e.key === 'ArrowLeft') next = (i - 1 + TABS.length) % TABS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = TABS.length - 1
    if (next === -1) return
    e.preventDefault()
    const key = TABS[next].key
    choose(key)
    tabRefs.current[key]?.focus()
  }

  const refresh = () => setRev(r => r + 1)

  const panelId = `${uid}-panel`
  /** 바뀔 때마다 목록이 새로 들어서도록 */
  const sceneKey = `${topic}:${majorOnly ? 'major' : 'all'}:${entry?.rev ?? -1}`

  const status = loading
    ? `${current.label} 기사를 불러오는 중입니다.`
    : entry?.error
      ? `${current.label} 기사를 불러오지 못했습니다.`
      : `${current.label} 기사 ${items.length}건을 보여드립니다.`

  return (
    <div className="cs-wrap cs-nr" ref={rootRef}>
      <PageMasthead
        eyebrow="NEWSROOM"
        title="청약뉴스"
        lead={
          <>
            청약을 가운데 두고 주거정책·공급대책·공공임대·부동산 시장 소식까지 한 자리에 모았어요.
            제목을 누르면 <b>기사를 쓴 매체의 원문</b>으로 이동합니다.
          </>
        }
      >
        <ul className="cs-nr-facts" aria-label="이 화면의 원칙">
          <li>
            <span className="cs-nr-facts__dot" aria-hidden="true" />
            주제 {TABS.length}개 · 최신순
          </li>
          <li>제목·매체·시각만, 본문은 원문에서</li>
          <li>집계 출처 Google 뉴스</li>
        </ul>
      </PageMasthead>

      <div ref={sentinelRef} className="cs-nr-sentinel" aria-hidden="true" />
      <div ref={barRef} className="cs-nr-bar" data-stuck="false">
        <div className="cs-nr-bar__inner">
          <div ref={tabsRef} className="cs-nr-tabs" role="tablist" aria-label="뉴스 주제">
            {TABS.map(t => {
              const on = t.key === topic
              return (
                <button
                  key={t.key}
                  ref={el => {
                    tabRefs.current[t.key] = el
                  }}
                  id={`${uid}-tab-${t.key}`}
                  type="button"
                  role="tab"
                  className="cs-nr-tab"
                  aria-selected={on}
                  aria-controls={panelId}
                  tabIndex={on ? 0 : -1}
                  onClick={() => choose(t.key)}
                  onKeyDown={onTabKey}
                >
                  {t.label}
                </button>
              )
            })}
            <span ref={inkRef} className="cs-nr-tabs__ink" aria-hidden="true" />
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={majorOnly}
            className="cs-nr-switch"
            // 휴대폰에서는 '주요'만 보인다. 이름은 보이는 글자로 시작해야 음성 조작이 닿는다
            aria-label="주요 언론사만 보기"
            onClick={() => setMajorOnly(v => !v)}
            disabled={loading || Boolean(entry?.error)}
          >
            <span className="cs-nr-switch__label" aria-hidden="true">
              <span className="cs-nr-switch__full">주요 언론사만</span>
              <span className="cs-nr-switch__short">주요</span>
            </span>
            {!loading && !entry?.error && (
              <span className="cs-nr-switch__count cs-num" aria-hidden="true">
                {majorCount}
              </span>
            )}
            <span className="cs-nr-switch__track" aria-hidden="true">
              <span className="cs-nr-switch__knob" />
            </span>
          </button>
        </div>
      </div>

      <section
        id={panelId}
        role="tabpanel"
        aria-labelledby={`${uid}-tab-${topic}`}
        className="cs-nr-panel"
        data-refreshing={refreshing ? 'true' : undefined}
      >
        <p className="cs-sr" role="status">
          {status}
        </p>

        {/* 고른 주제를 제목으로 한 번 더 세운다. 탭만으로는 스크롤을 내린 뒤
            지금 무엇을 보고 있는지 잊는다. */}
        <header className="cs-nr-head" key={`head-${topic}`}>
          <div className="cs-nr-head__title">
            <h2>{current.label}</h2>
            <p>{current.hint}</p>
          </div>
          {entry?.query && (
            <p className="cs-nr-head__query">
              <span>검색어</span>
              <code>{entry.query}</code>
            </p>
          )}
        </header>

        {loading ? (
          <NewsSkeleton />
        ) : entry?.error ? (
          <Vacancy
            tone="error"
            icon={<IconOffline />}
            eyebrow="연결 오류"
            title="뉴스를 불러오지 못했어요"
            desc="잠시 뒤 다시 시도해 주세요. 계속되면 뉴스 출처 쪽 연결이 원활하지 않은 것일 수 있어요."
            detail={entry.error}
          >
            <button type="button" className="cs-btn cs-btn--primary cs-nr-btn" onClick={refresh}>
              <IconRefresh />
              다시 시도
            </button>
          </Vacancy>
        ) : items.length === 0 ? (
          majorOnly && fetched.length > 0 ? (
            <Vacancy
              icon={<IconFilter />}
              eyebrow="주요 언론사 0건"
              title="주요 언론사가 쓴 기사가 아직 없어요"
              desc={`전체 매체로 보시면 ${fetched.length}건이 있어요.`}
            >
              <button type="button" className="cs-btn cs-btn--primary cs-nr-btn" onClick={() => setMajorOnly(false)}>
                전체 매체로 보기
              </button>
            </Vacancy>
          ) : (
            <Vacancy
              icon={<IconPaper />}
              eyebrow="기사 0건"
              title="이 주제의 최근 기사를 찾지 못했어요"
              desc="다른 주제를 보시거나 잠시 뒤 다시 확인해 주세요."
            >
              <div className="cs-nr-vacancy__topics">
                {TABS.filter(t => t.key !== topic).map(t => (
                  <button key={t.key} type="button" className="cs-nr-chip" onClick={() => choose(t.key)}>
                    {t.label}
                  </button>
                ))}
              </div>
              <button type="button" className="cs-nr-textbtn" onClick={refresh}>
                <IconRefresh />
                다시 불러오기
              </button>
            </Vacancy>
          )
        ) : (
          <div className="cs-nr-scene" key={sceneKey}>
            <div className="cs-nr-top">
              {lead && <LeadStory item={lead} now={now} major={isMajor(lead.source)} />}

              <aside className="cs-nr-edition" aria-label="이 목록 요약">
                <p className="cs-nr-edition__eyebrow">이 목록</p>
                <dl className="cs-nr-edition__grid">
                  <div>
                    <dt>기사</dt>
                    <dd className="cs-num">
                      {stats.total}
                      <small>건</small>
                    </dd>
                  </div>
                  <div>
                    <dt>오늘 발행</dt>
                    <dd className="cs-num">
                      {stats.today}
                      <small>건</small>
                    </dd>
                  </div>
                  <div>
                    <dt>매체</dt>
                    <dd className="cs-num">
                      {stats.outlets}
                      <small>곳</small>
                    </dd>
                  </div>
                  <div>
                    <dt>주요 언론사</dt>
                    <dd className="cs-num">
                      {stats.major}
                      <small>건</small>
                    </dd>
                  </div>
                </dl>
                <div className="cs-nr-edition__foot">
                  <span>
                    {entry?.fetchedAt ? (
                      <>
                        <time dateTime={entry.fetchedAt} title={exact(entry.fetchedAt)}>
                          {clock(parse(entry.fetchedAt) ?? now)}
                        </time>{' '}
                        기준 · 최대 30건
                      </>
                    ) : (
                      '최신순 · 최대 30건'
                    )}
                  </span>
                  <button
                    type="button"
                    className="cs-nr-refresh"
                    onClick={refresh}
                    disabled={refreshing}
                    aria-label={refreshing ? '새로 불러오는 중' : '목록 새로 불러오기'}
                  >
                    <IconRefresh />
                    <span>{refreshing ? '불러오는 중' : '새로고침'}</span>
                  </button>
                </div>
              </aside>
            </div>

            {groups.map(g => (
              <section key={g.key} className="cs-nr-group" aria-labelledby={`${uid}-g-${g.key}`}>
                <header className="cs-nr-group__head">
                  <h3 id={`${uid}-g-${g.key}`}>{GROUP_LABEL[g.key]}</h3>
                  <span className="cs-nr-group__date">{groupDates(g.items)}</span>
                  <span className="cs-nr-group__rule" aria-hidden="true" />
                  <span className="cs-nr-group__count cs-num">{g.items.length}건</span>
                </header>
                <ol className="cs-nr-list">
                  {g.items.map((n, i) => (
                    <li
                      key={n.link}
                      className="cs-nr-row"
                      style={{ '--i': Math.min(g.offset + i, 14) } as CSSProperties}
                    >
                      <a className="cs-nr-row__link" href={n.link} target="_blank" rel="noopener noreferrer nofollow">
                        <SourceMark logo={n.logo} source={n.source} />
                        <span className="cs-nr-row__body">
                          <span className="cs-nr-row__title">{n.title}</span>
                          <span className="cs-nr-row__meta">
                            <span className="cs-nr-row__source">{n.source}</span>
                            <span aria-hidden="true" className="cs-nr-dot" />
                            <time dateTime={n.publishedAt ?? undefined} title={exact(n.publishedAt)}>
                              {ago(n.publishedAt, now)}
                            </time>
                          </span>
                        </span>
                        <span className="cs-nr-row__go" aria-hidden="true">
                          <span className="cs-nr-row__golabel">원문 보기</span>
                          <IconArrow />
                        </span>
                        <span className="cs-sr"> — {n.source} 원문, 새 창에서 열림</span>
                      </a>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )}
      </section>

      <section className="cs-nr-rules" aria-labelledby={`${uid}-rules`}>
        <h2 id={`${uid}-rules`} className="cs-nr-rules__title">
          이 지면을 만드는 방식
        </h2>
        <ol className="cs-nr-rules__grid">
          <li>
            <span className="cs-nr-rules__no cs-num">01</span>
            <b>본문은 옮기지 않아요</b>
            <span>
              기사 제목과 매체명, 발행 시각만 정리해 보여드려요. 저작권은 각 매체에 있고, 제목을 누르면 원문으로
              이동합니다.
            </span>
          </li>
          <li>
            <span className="cs-nr-rules__no cs-num">02</span>
            <b>그림은 매체 로고예요</b>
            <span>
              기사 사진이 아니라 그 기사를 쓴 매체의 로고예요. 로고를 불러오지 못하면 매체 이름의 첫 글자로
              표시합니다.
            </span>
          </li>
          <li>
            <span className="cs-nr-rules__no cs-num">03</span>
            <b>골라 싣지 않아요</b>
            <span>
              주제별 검색어로 Google 뉴스에서 모은 결과를 최신순으로 정리해요. 같은 제목은 한 번만 싣고, 맨 앞 기사는
              주요 언론사 기사 가운데 가장 최근 것입니다.
            </span>
          </li>
        </ol>
        <details className="cs-nr-rules__more">
          <summary>주요 언론사 기준 보기</summary>
          <p>
            아래 매체(계열사 표기 포함)를 주요 언론사로 묶어요. 기본 보기는 전체 매체이고, 막대의 「주요 언론사만」을
            켤 때만 걸러냅니다.
          </p>
          <ul>
            {MAJOR_OUTLETS.map(m => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </details>
        <p className="cs-nr-rules__source">집계 출처: Google 뉴스</p>
      </section>

      <section style={{ marginTop: 'clamp(48px, 6vw, 80px)' }}>
        <div className="cs-cta-band">
          <h2 className="cs-section-title">
            정책이 바뀌면
            <br />
            내 조건도 달라집니다
          </h2>
          <p className="cs-sub" style={{ marginTop: 12 }}>
            조건을 저장해두시면 새 공고가 열릴 때 메일로 알려드려요.
          </p>
          <Link href="/analyze" className="cs-btn cs-btn--primary" style={{ marginTop: 26 }}>
            내 조건으로 공고 찾기
          </Link>
        </div>
      </section>
    </div>
  )
}

/* ── 맨 앞의 한 건 ────────────────────────────────────────── */

function LeadStory({ item, now, major }: { item: NewsItem; now: number; major: boolean }) {
  return (
    <a className="cs-nr-lead" href={item.link} target="_blank" rel="noopener noreferrer nofollow">
      <span className="cs-nr-lead__sky" aria-hidden="true" />
      <span className="cs-nr-lead__tag">
        <span className="cs-nr-lead__pulse" aria-hidden="true" />
        {major ? '주요 언론사 · 가장 최근' : '가장 최근 기사'}
      </span>
      <span className="cs-nr-lead__title">{item.title}</span>
      <span className="cs-nr-lead__foot">
        <span className="cs-nr-lead__by">
          <SourceMark logo={item.logo} source={item.source} size="lg" />
          <span className="cs-nr-lead__who">
            <span className="cs-nr-lead__source">{item.source}</span>
            <span className="cs-nr-lead__when">
              <time dateTime={item.publishedAt ?? undefined} title={exact(item.publishedAt)}>
                {ago(item.publishedAt, now)}
              </time>
              {item.domain && (
                <>
                  <span aria-hidden="true" className="cs-nr-dot" />
                  {item.domain}
                </>
              )}
            </span>
          </span>
        </span>
        <span className="cs-nr-lead__cta" aria-hidden="true">
          원문 보기
          <IconArrow />
        </span>
      </span>
      <span className="cs-sr"> — {item.source} 원문, 새 창에서 열림</span>
    </a>
  )
}

/* ── 비어 있음 · 오류 ─────────────────────────────────────── */

function Vacancy({
  tone,
  icon,
  eyebrow,
  title,
  desc,
  detail,
  children,
}: {
  tone?: 'error'
  icon: ReactNode
  eyebrow: string
  title: string
  desc: string
  detail?: string
  children?: ReactNode
}) {
  return (
    <div className="cs-nr-vacancy" data-tone={tone}>
      <span className="cs-nr-vacancy__icon">{icon}</span>
      <span className="cs-nr-vacancy__eyebrow">{eyebrow}</span>
      <p className="cs-nr-vacancy__title">{title}</p>
      <p className="cs-nr-vacancy__desc">{desc}</p>
      {detail && <p className="cs-nr-vacancy__detail">사유 · {detail}</p>}
      {children && <div className="cs-nr-vacancy__actions">{children}</div>}
    </div>
  )
}

/* ── 불러오는 중 — 실제 배치와 같은 뼈대 ─────────────────── */

function NewsSkeleton() {
  return (
    <div className="cs-nr-skel" aria-hidden="true">
      <div className="cs-nr-top">
        <div className="cs-nr-skel__lead">
          <i style={{ width: '34%', height: 14 }} />
          <i style={{ width: '92%', height: 30, marginTop: 26 }} />
          <i style={{ width: '64%', height: 30, marginTop: 12 }} />
          <span>
            <i style={{ width: 48, height: 48, borderRadius: 12 }} />
            <i style={{ width: 140, height: 14 }} />
          </span>
        </div>
        <div className="cs-nr-skel__edition">
          <i style={{ width: '30%', height: 12 }} />
          <span>
            {Array.from({ length: 4 }).map((_, i) => (
              <i key={i} style={{ height: 52 }} />
            ))}
          </span>
        </div>
      </div>
      <div className="cs-nr-skel__rows">
        <i className="cs-nr-skel__label" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="cs-nr-skel__row">
            <i style={{ width: 44, height: 44, borderRadius: 10 }} />
            <span>
              <i style={{ width: i % 2 ? '86%' : '94%', height: 15 }} />
              <i style={{ width: i % 3 ? '58%' : '70%', height: 15, marginTop: 8 }} />
              <i style={{ width: 112, height: 11, marginTop: 12 }} />
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
