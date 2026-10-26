'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import BrandMark from '@/components/consumer/BrandMark'

/**
 * 업무 순서대로 배열한다 — 조건 진단 → 매칭 → 고객 → 물건 → 지원 → 시장.
 * 내부 조직도(사용자/운영)가 아니라 실무 동선이 기준이다.
 */
const NAV = [
  { href: '/admin/dashboard', label: '종합현황' },
  { href: '/admin/matches', label: '매칭현황' },
  { href: '/admin/customers', label: '고객관리' },
  { href: '/admin/properties', label: '물건관리' },
  { href: '/admin/applications', label: '지원관리' },
  { href: '/admin/routines', label: '루틴' },
  { href: '/insights', label: '시장통계' },
]

export function ThemeToggle() {
  // layout.tsx 가 data-theme="light" 로 렌더링하므로 초기값은 항상 light 다.
  const [dark, setDark] = useState(false)

  const toggle = () => {
    const next = !dark
    setDark(next)
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light')
  }

  return (
    <button type="button" onClick={toggle} aria-label="테마 전환" className="theme-btn">
      {dark ? (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="4.5" />
          <path
            d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M20 14.5A8 8 0 1 1 9.5 4a6.3 6.3 0 0 0 10.5 10.5Z" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
}

export default function CrmShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)

  return (
    <div className="crm-shell">
      <nav className="crm-nav">
        <div className="crm-nav__inner">
          <Link href="/admin/dashboard" className="crm-nav__brand">
            <span className="crm-nav__mark">
              <BrandMark size={26} />
            </span>
            집캐치 <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-3)' }}>운영</span>
          </Link>

          <div className="crm-nav__links">
            {NAV.map(l => (
              <Link
                key={l.href}
                href={l.href}
                className="crm-nav__link"
                data-active={isActive(l.href) ? 'true' : 'false'}
              >
                {l.label}
              </Link>
            ))}
          </div>

          <div className="crm-nav__right">
            <Link href="/" className="crm-nav__link">
              소비자 화면
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </nav>

      <main className="crm-main">{children}</main>

      <footer className="crm-foot">
        <p>
          내부 운영 화면입니다. 표시되는 고객·물건·공실 이벤트는 시연용 합성 데이터이며 실제 고객 정보가 아닙니다.
        </p>
      </footer>
    </div>
  )
}
