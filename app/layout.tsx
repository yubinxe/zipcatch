import type { Metadata } from 'next'
import { pretendard } from './fonts'
import './globals.css'
import './consumer.css'
/* 한지·먹·주묵 체계 위에 빛과 깊이만 얹는 층. 반드시 consumer.css 뒤에 온다 */
import './consumer-lux.css'
/* 첫 화면 지도 · 네 장면 · 주거비 환산. 같은 토큰을 쓰므로 lux 뒤에 둔다 */
import './consumer-atlas.css'
/* 밤 — 2.1 디자인. 토큰과 첫 화면·섹션 머리·띠를 다시 그린다. 반드시 맨 뒤 */
import './consumer-night.css'
/* 홈 — 끝까지 밤, 스크롤로 넘기는 장면·옆으로 넘기는 띠. night 뒤 */
import './consumer-immersive.css'
/* 3.0 — 주황 밤 무대 위의 브랜드·폰 챗봇·움직임·화면별 공간·바닥글. 각자 자기 파일만 고친다 */
import './consumer-masthead.css'
import './consumer-brand.css'
import './consumer-phone.css'
import './consumer-motion.css'
import './consumer-spaces.css'
import './consumer-spaces-b.css'
import './consumer-footer.css'
import './crm.css'
import './consumer-news.css'
import './consumer-3d.css'
/* 3.1 정밀 개선 — 챗봇 자리·캐러셀·지도 중심·제작자 장면·요금제. 반드시 맨 뒤 */
import './consumer-refine.css'
/* 4.0 — 공고 카드 · 지도 진입 · 서체 굵기(맨 뒤: 앞 층의 같은 규칙을 이긴다) */
import './consumer-cards.css'
import './consumer-mapintro.css'
import './consumer-scenes.css'
import './consumer-type.css'
import './consumer-explore.css'
import './consumer-battle.css'
import './consumer-playground.css'
import './consumer-spotlight.css'
import './consumer-universe.css'
import './consumer-commute.css'
import './consumer-share.css'

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://zipcatch.vercel.app').replace(/\/$/, '')

const PORTFOLIO = 'https://yubinxe.github.io/Portfolio/'

/** 제작자 연결 — 포트폴리오의 Person(@id)과 같은 사람으로 묶는다. */
const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: '집캐치 — 청약·공공임대 맞춤 추천',
  url: 'https://zipcatch.vercel.app/',
  applicationCategory: 'LifestyleApplication',
  operatingSystem: 'Web',
  inLanguage: 'ko-KR',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'KRW' },
  creator: {
    '@type': 'Person',
    '@id': PORTFOLIO + '#person',
    name: '김유빈',
    alternateName: 'Yubin Kim',
    url: PORTFOLIO,
    // 포트폴리오의 Person 과 같은 채널 — 검색엔진이 한 사람으로 잇는다
    sameAs: [
      'https://github.com/yubinxe',
      'https://www.instagram.com/yubinxe/',
      'https://yubinxe.tistory.com/',
      'https://blog.naver.com/yubinxe',
    ],
  },
}

const TITLE = '집캐치 — 내 조건에 맞는 청약·임대 공고 찾기'
const DESC =
  '복잡한 공고를 하나씩 비교하지 않아도 됩니다. 내 조건에 맞는 후보를 찾고 관심공고의 일정까지 챙겨보세요.'

export const metadata: Metadata = {
  /**
   * 링크 미리보기의 기준 주소.
   *
   * 이것이 없으면 `opengraph-image` 가 상대 경로로 나가고, 카카오톡·슬랙은
   * 상대 경로를 그림으로 받지 못한다. 그림 파일을 만들어 두고도 회색 칸만
   * 뜨는 흔한 이유다.
   */
  metadataBase: new URL(SITE),
  title: TITLE,
  description: DESC,
  applicationName: '집캐치',
  authors: [{ name: '김유빈 (Yubin Kim)', url: PORTFOLIO }],
  creator: '김유빈 (Yubin Kim)',
  openGraph: {
    type: 'website',
    siteName: '집캐치',
    locale: 'ko_KR',
    url: SITE,
    title: TITLE,
    description: DESC,
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESC,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ko"
      data-theme="light"
      data-density="regular"
      className={pretendard.variable}
      suppressHydrationWarning
    >
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
        {children}
      </body>
    </html>
  )
}
