import type { Metadata } from 'next'
import { gmarket, jalnan, pretendard } from './fonts'
import './globals.css'
import './consumer.css'
import './crm.css'

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
  creator: { '@type': 'Person', '@id': PORTFOLIO + '#person', name: '김유빈', alternateName: 'Yubin Kim', url: PORTFOLIO },
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
      className={`${jalnan.variable} ${gmarket.variable} ${pretendard.variable}`}
      suppressHydrationWarning
    >
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
        {children}
      </body>
    </html>
  )
}
