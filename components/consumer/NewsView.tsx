'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { PillChoice } from './Choose'

/**
 * 청약뉴스.
 *
 * 기사를 옮겨 적지 않는다. 제목과 매체, 시각만 두고 클릭은 원문으로 보낸다 —
 * 본문은 매체의 것이고, 우리가 요약해 얹으면 그 요약이 기사처럼 읽힌다.
 * 요약이 틀리면 매체가 틀린 것으로 읽히므로 아예 만들지 않는다.
 *
 * 무엇으로 모았는지도 화면에 적는다. 뉴스를 '골라 준' 것처럼 보이면
 * 고르지 않은 기사가 없는 것처럼 읽힌다.
 */

interface NewsItem {
  title: string
  link: string
  source: string
  publishedAt: string | null
  /** 매체 로고. 기사 사진이 아니다 — 지어낸 이미지를 얹지 않는다 */
  logo: string | null
}

const TABS = [
  { key: 'subscription', label: '청약', hint: '모집공고·분양 일정·경쟁률 소식' },
  { key: 'policy', label: '주거정책', hint: '제도 변경과 정부 발표' },
  { key: 'supply', label: '공급대책', hint: '공급 물량과 신규 택지' },
  { key: 'rent', label: '공공임대', hint: '임대 공고와 입주 소식' },
  { key: 'market', label: '부동산 시장', hint: '시세·거래·금리 흐름' },
]

/**
 * 주요 언론사.
 *
 * 구글 뉴스는 매체를 가리지 않고 모아 준다. 덕분에 작은 매체의 단독도 걸리지만,
 * 같은 사안을 서른 곳이 받아쓴 목록이 되기도 한다. 읽는 쪽이 고를 수 있게
 * 한 겹을 둔다 — 기본은 전체다. 걸러내는 것을 기본으로 삼으면 우리가 고른
 * 목록을 전부인 것처럼 보이게 된다.
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

/** 며칠 전인지로 적는다. 날짜만 적으면 얼마나 묵은 소식인지 셈해야 한다 */
function ago(iso: string | null) {
  if (!iso) return '시각 미상'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '시각 미상'
  const min = Math.round((Date.now() - t) / 60000)
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}시간 전`
  const day = Math.round(hr / 24)
  if (day <= 14) return `${day}일 전`
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
}

/**
 * 매체 표식.
 *
 * 로고를 못 불러오면 깨진 그림 아이콘이 남는다. 기사마다 구멍이 뚫린 것처럼
 * 보이므로, 실패하면 매체 첫 글자로 조용히 갈음한다.
 */
function SourceMark({ logo, source, rank }: { logo: string | null; source: string; rank: number }) {
  const [failed, setFailed] = useState(false)
  const show = logo && !failed

  return (
    <span className="cs-news__logo" aria-hidden="true">
      {show ? (
        // next/image 를 쓰지 않는다. 40px 파비콘 서른 장을 이미지 최적화기에
        // 태우면 변환 비용만 늘고 얻는 게 없다.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt=""
          loading="lazy"
          width={40}
          height={40}
          // 파비콘은 구글에서 받아 온다. 기본값으로 두면 우리 주소가
          // 매체마다 한 번씩 구글로 함께 나간다. 그림 한 장 받자고
          // 사용자가 무엇을 읽는지까지 알려 줄 이유는 없다.
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="cs-news__initial">{source.slice(0, 1)}</span>
      )}
      <span className="cs-news__rank cs-num">{String(rank).padStart(2, '0')}</span>
    </span>
  )
}

export default function NewsView() {
  const [topic, setTopic] = useState(TABS[0].key)
  /** 전체 / 주요 언론사. 기본은 전체다 */
  const [outlet, setOutlet] = useState<'all' | 'major'>('all')
  /** 어떤 주제의 결과인지 함께 담아, 로딩 여부를 파생값으로 계산한다 */
  const [result, setResult] = useState<{
    key: string
    items: NewsItem[]
    query: string
    error: string | null
  } | null>(null)

  const loading = result?.key !== topic
  const fetched = result?.key === topic ? result.items : []
  const items = outlet === 'major' ? fetched.filter(n => isMajor(n.source)) : fetched
  const majorCount = fetched.filter(n => isMajor(n.source)).length
  const error = result?.key === topic ? result.error : null
  const query = result?.key === topic ? result.query : ''
  const current = TABS.find(t => t.key === topic) ?? TABS[0]

  useEffect(() => {
    let alive = true
    fetch(`/api/news?topic=${topic}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('뉴스를 불러오지 못했어요.'))))
      .then((json: { items: NewsItem[]; query?: string; error: string | null }) => {
        if (!alive) return
        setResult({ key: topic, items: json.items ?? [], query: json.query ?? '', error: json.error })
      })
      .catch((err: unknown) => {
        if (!alive) return
        setResult({
          key: topic,
          items: [],
          query: '',
          error: err instanceof Error ? err.message : '뉴스를 불러오지 못했어요.',
        })
      })
    return () => {
      alive = false
    }
  }, [topic])

  return (
    <div className="cs-wrap" style={{ paddingTop: 44 }}>
      <header>
        <h1 className="cs-page-title">청약뉴스</h1>
        <p className="cs-sub" style={{ marginTop: 12 }}>
          청약을 가운데 두고 주거정책·공급대책·부동산 시장까지 한 자리에 모았어요. 제목을 누르면 쓴
          매체의 원문으로 이동합니다.
        </p>
      </header>

      <div className="cs-news__topics">
        <PillChoice
          label="주제"
          value={topic}
          onChange={setTopic}
          items={TABS.map(t => ({ value: t.key, label: t.label }))}
        />
        {/* 주제 오른쪽이 비어 있던 자리. 읽는 쪽이 매체를 고를 수 있게 둔다 */}
        <PillChoice
          label="언론사"
          value={outlet}
          onChange={v => setOutlet(v as 'all' | 'major')}
          items={[
            { value: 'all', label: '전체', count: fetched.length },
            { value: 'major', label: '주요 언론사', count: majorCount },
          ]}
        />
      </div>

      {/* 고른 주제를 제목으로 한 번 더 세운다. 알약만으로는 스크롤을 내린 뒤
          지금 무엇을 보고 있는지 잊는다. */}
      <div className="cs-news__head">
        <h2 className="cs-news__now">{current.label}</h2>
        <p className="cs-news__hint">{current.hint}</p>
        {query && <p className="cs-note">검색어: {query}</p>}
      </div>

      {error ? (
        <div className="cs-error" style={{ marginTop: 28 }}>
          <span>{error}</span>
          <button className="cs-btn cs-btn--sm cs-btn--ghost" onClick={() => setResult(null)}>
            다시 시도
          </button>
        </div>
      ) : loading ? (
        <div style={{ marginTop: 28, display: 'grid', gap: 10 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="cs-skel" style={{ height: 78 }} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="cs-vacancy" style={{ marginTop: 28 }}>
          <span className="cs-vacancy__eyebrow">기사 0건</span>
          <p className="cs-vacancy__title">
            {outlet === 'major'
              ? '주요 언론사가 쓴 기사가 아직 없습니다'
              : '이 주제의 최근 기사를 찾지 못했습니다'}
          </p>
          <p className="cs-vacancy__desc">
            {outlet === 'major'
              ? `전체로 보시면 ${fetched.length}건이 있습니다.`
              : '다른 주제를 눌러보시거나 잠시 뒤 다시 확인해 주세요.'}
          </p>
        </div>
      ) : (
        <ol className="cs-news">
          {items.map((n, i) => (
            <li key={n.link} className="cs-news__item">
              <SourceMark logo={n.logo} source={n.source} rank={i + 1} />
              <div className="cs-news__body">
                <a
                  className="cs-news__title"
                  href={n.link}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                >
                  {n.title}
                </a>
                <div className="cs-news__meta">
                  <span className="cs-news__source">{n.source}</span>
                  <span aria-hidden="true">·</span>
                  <time dateTime={n.publishedAt ?? undefined}>{ago(n.publishedAt)}</time>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      <section style={{ marginTop: 52 }}>
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

      <p className="cs-note" style={{ marginTop: 32 }}>
        기사 제목과 매체명, 발행 시각만 정리해 보여드리며 본문은 옮기지 않습니다. 함께 보이는 그림은
        기사 사진이 아니라 그 기사를 쓴 매체의 로고입니다. 저작권은 각 매체에 있고, 제목을 누르면
        원문으로 이동합니다. 집계 출처: Google 뉴스.
      </p>
    </div>
  )
}
