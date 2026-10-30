'use client'

import Link from 'next/link'
import ScrollChrome from './ScrollChrome'
import { warmKakao } from './kakao-sdk'
import LuxBackdrop from './LuxBackdrop'
import ScrollProgress from './ScrollProgress'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { useConsumer } from './ConsumerProvider'
import BrandMark from './BrandMark'
import MakerFooter from './MakerFooter'
import { NAV } from '@/lib/consumer/nav'
import CompareTray from './battle/CompareTray'
import Spotlight, { SpotlightButton } from './Spotlight'
import PreviewFixtureBar from './PreviewFixtureBar'
import TitleFlipCapture from './TitleFlipCapture'


export default function ConsumerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { user, savedCount } = useConsumer()

  /** 로그인·회원가입 모두 보던 자리로 돌아온다 */
  const authHref = (mode: 'login' | 'signup') => {
    const back = pathname && pathname !== '/login' ? `&next=${encodeURIComponent(pathname)}` : ''
    return `/login?mode=${mode}${back}`
  }

  return (
    <div className="cs">
      {/* 배경과 진행선은 `.cs` 안에 둔다 — 색 토큰(--paper · --gold …)이
          여기에만 선언돼 있어서, 밖에 두면 var() 가 풀리지 않는다 */}
      <LuxBackdrop />
      <ScrollProgress />
      <ScrollChrome />
      <a href="#consumer-main" className="cs-skip">본문으로 건너뛰기</a>
      <header className="cs-header">
        <div className="cs-wrap cs-header__inner">
          {/* 마크 + 두 줄 글자표. 영문은 장식이라 읽지 않는다 — 링크 이름은 "집캐치" 하나 */}
          <Link href="/" className="cs-logo">
            <BrandMark size={34} className="cs-logo__mark" />
            <span className="cs-logo__type">
              <span className="cs-logo__ko">집캐치</span>
              <span className="cs-logo__en" aria-hidden="true">ZIPCATCH</span>
            </span>
          </Link>

          <nav className="cs-nav" aria-label="주요 메뉴">
            {NAV.map(l => (
              <Link
                key={l.href}
                href={l.href}
                className="cs-nav__link"
                data-active={pathname.startsWith(l.href) ? 'true' : 'false'}
                // 지도로 갈 손이면 SDK 를 미리 받기 시작한다 (누르기 전 수백 ms)
                {...(l.href === '/map' ? { onPointerEnter: warmKakao, onFocus: warmKakao, onTouchStart: warmKakao } : {})}
              >
                {l.label}
                {l.href === '/saved' && savedCount > 0 && (
                  <span className="cs-num"> {savedCount}</span>
                )}
              </Link>
            ))}
          </nav>

          <div className="cs-header__right">
            <SpotlightButton />
            {user ? (
              <Link href="/saved" className="cs-btn cs-btn--sm cs-btn--ghost">
                {user.nickname}님
              </Link>
            ) : (
              <>
                {/* 보던 자리를 들고 간다. 로그인 뒤 고정된 페이지로 밀어내지 않는다.
                    로그인은 글자만, 회원가입은 테두리를 둬 둘을 구분한다 —
                    같은 모양으로 붙여두면 어느 쪽이 처음인지 읽히지 않는다. */}
                <Link href={authHref('login')} className="cs-btn cs-btn--sm cs-btn--text">
                  로그인
                </Link>
                <Link href={authHref('signup')} className="cs-btn cs-btn--sm cs-btn--ghost">
                  회원가입
                </Link>
              </>
            )}
            <Link href="/analyze" className="cs-btn cs-btn--sm cs-btn--primary">
              내 기회 찾기
            </Link>
          </div>
        </div>
      </header>

      <main id="consumer-main" className="cs-main">{children}</main>

      <MakerFooter />
      <CompareTray />
      <Spotlight />
      <PreviewFixtureBar />
      <TitleFlipCapture />
    </div>
  )
}
