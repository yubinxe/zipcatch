'use client'

import Link from 'next/link'
import ScrollChrome from './ScrollChrome'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { useConsumer } from './ConsumerProvider'

/**
 * 메뉴 이름은 **화면 제목이 아니라 이름표**다.
 *
 * 화면 제목을 그대로 옮겨 적었더니 아홉 개가 1440px 에 들어가지 않아
 * 마지막 항목이 "청'" 으로 잘렸다. 가로로 밀리게는 해 두었지만, 데스크톱에서
 * 잘린 글자는 '더 있다'가 아니라 '망가졌다'로 읽힌다.
 *
 * 그래서 이름표는 줄이고 뜻은 화면 제목이 받는다 — '통계'를 누르면
 * "경쟁률 · 당첨 통계"가, '사업성'을 누르면 "사업성 판독"이 뜬다.
 */
const NAV = [
  // 처음 온 사람은 무엇을 고를지보다 무엇인지를 먼저 묻는다. 가이드를 앞에 둔다.
  { href: '/guide', label: '가이드' },
  { href: '/notices', label: '공고 찾기' },
  // 목록 맨 아래 붙여 두면 끝까지 내린 사람만 본다. "어디인지"부터 묻는 사람이 많다
  { href: '/map', label: '지도' },
  { href: '/saved', label: '관심공고' },
  { href: '/score', label: '가점 계산' },
  { href: '/stats', label: '통계' },
  // 공고문을 읽다 막히는 말들 — 가이드가 '무엇을 고르나'라면 여기는 '이 말이 무슨 뜻인가'
  { href: '/pro', label: '공급 판독' },
  // 집을 구하는 쪽이 아니라 짓고 파는 쪽이 묻는 것. 소비자 메뉴 끝에 붙여
  // 두되 이름으로 대상을 밝힌다 — 잘못 들어온 사람이 헤매지 않게.
  { href: '/biz', label: '사업성' },
  // 뉴스는 읽고 나가는 자리다. 공고·조건·통계를 먼저 세우고 맨 끝에 둔다.
  { href: '/news', label: '뉴스' },
]

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
      <ScrollChrome />
      <a href="#consumer-main" className="cs-skip">본문으로 건너뛰기</a>
      <header className="cs-header">
        <div className="cs-wrap cs-header__inner">
          <Link href="/" className="cs-logo">
            <span className="cs-logo__mark" aria-hidden="true">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 11.5 12 4l9 7.5" />
                <path d="M5 10v9.5h14V10" />
              </svg>
            </span>
            집캐치
          </Link>

          <nav className="cs-nav" aria-label="주요 메뉴">
            {NAV.map(l => (
              <Link
                key={l.href}
                href={l.href}
                className="cs-nav__link"
                data-active={pathname.startsWith(l.href) ? 'true' : 'false'}
              >
                {l.label}
                {l.href === '/saved' && savedCount > 0 && (
                  <span className="cs-num"> {savedCount}</span>
                )}
              </Link>
            ))}
          </nav>

          <div className="cs-header__right">
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

      <footer className="cs-footer">
        <div className="cs-wrap">
          <p>
            집캐치는 공개된 공고 정보를 정리해 보여드리는 참고 서비스입니다. 자격 판정과 당첨 여부를
            확정하지 않으며, 신청 전 반드시 공식 모집공고문을 확인해 주세요.
            <br />
            공고·통계 출처: 공공데이터포털 청약홈 OpenAPI · LH 청약플러스 · 한국부동산원.
          </p>
        </div>
      </footer>
    </div>
  )
}
