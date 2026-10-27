'use client'

import Link from 'next/link'
import { Fragment, type CSSProperties, type RefObject, type UIEvent } from 'react'
import { AlertGlyph, ArrowGlyph, AssistantGlyph, ChevronGlyph, RetryGlyph } from './glyphs'
import { formatClock, formatDay } from './deviceStores'
import type { ChatMsg } from './types'

interface Props {
  msgs: ChatMsg[]
  busy: boolean
  /** 아직 한 마디도 하지 않았을 때 인사 아래에 펼쳐 두는 자주 묻는 질문 */
  starters: string[]
  feedRef: RefObject<HTMLDivElement | null>
  onScroll: (e: UIEvent<HTMLDivElement>) => void
  onAsk: (q: string) => void
  onRetry: (m: ChatMsg) => void
  onNavigate: () => void
}

const dayOf = (at: number) => formatDay(new Date(at))
const clockOf = (at: number) => formatClock(new Date(at))

/**
 * 대화 — One UI 메시지 앱의 결을 따른다.
 *
 * 같은 사람이 같은 분에 이어 보낸 말은 한 덩어리로 묶고, 시각은 덩어리의
 * 마지막 말풍선 옆에만 단다(받은 말은 오른쪽, 보낸 말은 왼쪽). 상담 프로필은
 * 덩어리의 첫 말풍선 옆에만 둔다. 날짜가 바뀌면 가운데 구분선을 넣는다.
 */
export default function Thread({ msgs, busy, starters, feedRef, onScroll, onAsk, onRetry, onNavigate }: Props) {
  const sameRun = (a?: ChatMsg, b?: ChatMsg) =>
    !!a && !!b && a.role === b.role && clockOf(a.at) === clockOf(b.at) && !a.failed && !b.failed

  return (
    <div
      ref={feedRef}
      className="cs-phone__feed cs-phone__in"
      style={{ '--i': 3 } as CSSProperties}
      role="log"
      aria-label="상담 대화"
      tabIndex={0}
      onScroll={onScroll}
    >
      {msgs.map((m, i) => {
        const prev = msgs[i - 1]
        const next = msgs[i + 1]
        const newDay = !prev || dayOf(prev.at) !== dayOf(m.at)
        const first = newDay || !sameRun(prev, m)
        const last = !sameRun(m, next)
        const isBot = m.role === 'bot'

        return (
          <Fragment key={m.id}>
            {newDay && (
              <div className="cs-phone__day">
                <span>{dayOf(m.at)}</span>
              </div>
            )}

            <div
              className="cs-phone__row"
              data-role={m.role}
              data-first={first || undefined}
              data-last={last || undefined}
              data-failed={m.failed || undefined}
            >
              {isBot && (
                <span className="cs-phone__ava" aria-hidden="true">
                  {first && <AssistantGlyph size={15} />}
                </span>
              )}

              <div className="cs-phone__stack">
                <div className="cs-phone__line">
                  <p className="cs-phone__bubble">
                    <span className="cs-sr">{isBot ? '집캐치 상담: ' : '나: '}</span>
                    {m.failed && (
                      <span className="cs-phone__alert">
                        <AlertGlyph />
                      </span>
                    )}
                    {m.text}
                  </p>
                  {last && (
                    <time className="cs-phone__time" dateTime={new Date(m.at).toISOString()}>
                      {clockOf(m.at)}
                    </time>
                  )}
                </div>

                {isBot && m.actions && m.actions.length > 0 && (
                  <div className="cs-phone__actions">
                    {m.actions.map(a => (
                      <Link key={a.href} href={a.href} className="cs-phone__action" onClick={onNavigate}>
                        {a.label}
                        <ArrowGlyph />
                      </Link>
                    ))}
                  </div>
                )}

                {m.retry && (
                  <button
                    type="button"
                    className="cs-phone__retry"
                    onClick={() => onRetry(m)}
                    disabled={busy}
                  >
                    <RetryGlyph />
                    다시 보내기
                  </button>
                )}
              </div>
            </div>

            {i === 0 && starters.length > 0 && (
              <div className="cs-phone__faq" role="group" aria-labelledby="cs-phone-faq-title">
                <p id="cs-phone-faq-title" className="cs-phone__faq-title">
                  자주 묻는 질문
                </p>
                {starters.map(q => (
                  <button key={q} type="button" className="cs-phone__faq-item" onClick={() => onAsk(q)} disabled={busy}>
                    <span>{q}</span>
                    <ChevronGlyph />
                  </button>
                ))}
              </div>
            )}
          </Fragment>
        )
      })}

      {busy && (
        <div className="cs-phone__row" data-role="bot" data-first data-last data-typing>
          <span className="cs-phone__ava" aria-hidden="true">
            <AssistantGlyph size={15} />
          </span>
          <div className="cs-phone__stack">
            <div className="cs-phone__bubble cs-phone__typing">
              <span className="cs-sr">답변 준비 중…</span>
              <i aria-hidden="true" />
              <i aria-hidden="true" />
              <i aria-hidden="true" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
