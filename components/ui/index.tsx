import type { CSSProperties, ReactNode } from 'react'

export function Card({
  children,
  pad = true,
  className = '',
  style = {},
  delay = 0,
}: {
  children: ReactNode
  pad?: boolean
  className?: string
  style?: CSSProperties
  delay?: number
}) {
  return (
    <div
      className={`rise ${className}`.trim()}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-lg)',
        boxShadow: 'var(--shadow)',
        padding: pad ? 'var(--pad-card)' : 0,
        animationDelay: `${delay}ms`,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function CardHead({
  title,
  sub,
  right,
  wrapRight = false,
}: {
  title: string
  sub?: string
  right?: ReactNode
  wrapRight?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        marginBottom: 22,
        flexWrap: wrapRight ? 'wrap' : undefined,
      }}
    >
      <div>
        <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{title}</div>
        {sub && (
          <div style={{ fontSize: 14.5, color: 'var(--ink-3)', marginTop: 5, fontWeight: 450 }}>{sub}</div>
        )}
      </div>
      {right && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: wrapRight ? 'wrap' : undefined }}>
          {right}
        </div>
      )}
    </div>
  )
}

const STATUS = {
  soon: { label: '마감 임박', color: 'var(--hot)', soft: 'var(--hot-soft)' },
  open: { label: '접수중', color: 'var(--accent)', soft: 'var(--accent-soft)' },
  upcoming: { label: '접수 예정', color: 'var(--ink-2)', soft: 'var(--track)' },
  closed: { label: '마감', color: 'var(--ink-3)', soft: 'var(--track)' },
} as const

export function StatusPill({
  status,
  pulse = false,
}: {
  status: keyof typeof STATUS
  pulse?: boolean
}) {
  const s = STATUS[status]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 11px 4px 9px',
        borderRadius: 99,
        background: s.soft,
        color: s.color,
        fontSize: 13.5,
        fontWeight: 650,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 99,
          background: s.color,
          animation: pulse ? 'pulseDot 1.6s ease-in-out infinite' : 'none',
        }}
      />
      {s.label}
    </span>
  )
}

const ICON_PATHS: Record<string, ReactNode> = {
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  chevron: <path d="m6 9 6 6 6-6" />,
  pin: (
    <>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="2.6" />
    </>
  ),
  home: (
    <>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v9.5h14V10" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M22 20H2" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
      <path d="M16 5.2A3.2 3.2 0 0 1 16 11M21 20c0-2.6-1.5-4.5-3.6-5.2" />
    </>
  ),
  spark: <path d="M12 3l2.2 6.2L20 11l-5.8 1.8L12 19l-2.2-6.2L4 11l5.8-1.8z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  x: (
    <>
      <path d="M6 6l12 12" />
      <path d="m18 6-12 12" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </>
  ),
}

export function Icon({ name, size = 18 }: { name: keyof typeof ICON_PATHS; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICON_PATHS[name]}
    </svg>
  )
}
