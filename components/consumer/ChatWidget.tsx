'use client'

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type UIEvent } from 'react'
import StatusBar from './phone/StatusBar'
import Thread from './phone/Thread'
import Composer from './phone/Composer'
import { AssistantGlyph, BackGlyph, ChatGlyph, CloseGlyph, InfoGlyph } from './phone/glyphs'
import { hasFinePointer, useNarrow, useOnline, useReducedMotion } from './phone/deviceStores'
import { useDialogFocus } from './phone/useDialogFocus'
import type { ChatMsg } from './phone/types'

/**
 * 상담 챗봇 — 삼성 갤럭시(One UI) 폰.
 *
 * 데스크톱에서는 떠 있는 버튼 자리에서 기기가 들려 올라오고, 화면이 켜지며
 * (검은 화면 → 빛 → 내용) 대화가 뜬다. 처음 여는 순간에만 부팅 로고를 보이고,
 * 다시 열 때는 잠금 해제처럼 짧게 깨어난다. 760px 이하에서는 테두리 없이
 * 화면 전체가 One UI 화면이 된다.
 *
 * 요청(/api/chat)과 오류 문구, 두 줄의 안내(자격 판정 안 함 · 연락처 저장)는
 * 이전 그대로다. 바뀐 것은 껍데기와 다루는 손맛뿐이다.
 */

type Phase = 'closed' | 'open' | 'closing'

/** 닫히는 연출의 길이 — consumer-phone.css 의 cs-phone-sleep 과 맞춘다 */
const CLOSE_MS = 340

const GREETING: Pick<ChatMsg, 'role' | 'text' | 'actions'> = {
  role: 'bot',
  text:
    '안녕하세요, 집캐치예요.\n원하시는 지역과 예산을 알려주시면 지금 지원 가능한 공고부터 찾아드릴게요.',
  actions: [{ label: '내 조건으로 집 찾기', href: '/analyze' }],
}

const QUICK = ['내 조건에 맞는 공고 있어요?', '자격이 되는지 궁금해요', '알림은 어떻게 받나요?', '접수 마감이 언제예요?']

export default function ChatWidget() {
  const [phase, setPhase] = useState<Phase>('closed')
  /** 이번 방문에서 처음 켜는가 — 처음이면 부팅 로고, 아니면 짧게 깨어난다 */
  const [boot, setBoot] = useState<'cold' | 'warm'>('cold')
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)

  const pending = useRef(false)
  const nextId = useRef(1)
  /** 닫힌 뒤 떠 있는 버튼으로 초점을 돌려줄지 — 열었던 적이 있을 때만 */
  const returnFocus = useRef(false)

  const fabRef = useRef<HTMLButtonElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const deviceRef = useRef<HTMLDivElement>(null)
  const screenRef = useRef<HTMLDivElement>(null)
  const feedRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const narrow = useNarrow()
  const reduced = useReducedMotion()
  const online = useOnline()

  const uid = useId()
  const titleId = `${uid}-title`
  const noticeId = `${uid}-notice`
  const noteId = `${uid}-note`

  const shown = phase !== 'closed'

  /* ── 열고 닫기 ─────────────────────────────────────── */

  const openPhone = () => {
    // 닫히는 중에 다시 누르면 그 자리에서 다시 켠다
    if (phase === 'open') return
    returnFocus.current = true
    // 인사는 처음 여는 순간의 시각을 단다
    setMsgs(prev => (prev.length ? prev : [{ ...GREETING, id: 0, at: Date.now() }]))
    setPhase('open')
  }

  const close = useCallback(() => {
    setPhase(p => (p === 'open' ? 'closing' : p))
    // 한 번 켠 뒤로는 부팅 로고 없이 짧게 깨어난다
    setBoot('warm')
  }, [])

  // 닫히는 연출이 끝나면 내린다. 움직임 줄이기면 바로
  useEffect(() => {
    if (phase !== 'closing') return
    const t = setTimeout(() => setPhase('closed'), reduced ? 0 : CLOSE_MS)
    return () => clearTimeout(t)
  }, [phase, reduced])

  // 닫히면 초점을 떠 있는 버튼으로 돌려준다(링크로 떠난 경우는 새 화면에 맡긴다)
  useEffect(() => {
    if (phase !== 'closed' || !returnFocus.current) return
    returnFocus.current = false
    const active = document.activeElement
    if (active === null || active === document.body) fabRef.current?.focus({ preventScroll: true })
  }, [phase])

  // 열리면 — 마우스 환경은 입력칸에 바로 커서, 터치 환경은 자판이 화면을 덮지 않게 폰 자체에
  useEffect(() => {
    if (phase !== 'open') return
    if (hasFinePointer()) inputRef.current?.focus({ preventScroll: true })
    else deviceRef.current?.focus({ preventScroll: true })
    const feed = feedRef.current
    if (feed) feed.scrollTop = feed.scrollHeight
  }, [phase])

  useDialogFocus(phase === 'open', deviceRef, close)

  // 좁은 화면 — 뒤 페이지가 따라 스크롤되지 않게 잠근다
  useEffect(() => {
    if (!shown || !narrow) return
    const { documentElement: html, body } = document
    const prev = [html.style.overflow, body.style.overflow]
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    return () => {
      html.style.overflow = prev[0]
      body.style.overflow = prev[1]
    }
  }, [shown, narrow])

  // 좁은 화면 — 자판이 올라오면 보이는 높이에 맞춰 화면을 줄인다(입력줄이 자판 뒤로 숨지 않게)
  useEffect(() => {
    const layer = layerRef.current
    const vv = window.visualViewport
    if (!shown || !narrow || !layer || !vv) return
    const sync = () => {
      layer.style.setProperty('--vvh', `${vv.height}px`)
      layer.style.setProperty('--vvt', `${vv.offsetTop}px`)
    }
    sync()
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
      layer.style.removeProperty('--vvh')
      layer.style.removeProperty('--vvt')
    }
  }, [shown, narrow])

  // 데스크톱 — 폰 위의 휠이 뒤 페이지를 굴리지 않게. 대화 목록·입력칸만 스스로 스크롤한다
  useEffect(() => {
    const device = deviceRef.current
    if (!shown || !device) return
    const onWheel = (e: WheelEvent) => {
      const t = e.target as Element | null
      const scroller = t?.closest('.cs-phone__feed, .cs-phone__input, .cs-phone__quick')
      if (scroller?.classList.contains('cs-phone__quick')) {
        // 칩 줄은 세로 휠을 가로로 돌린다
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) scroller.scrollLeft += e.deltaY
        e.preventDefault()
        return
      }
      if (!scroller) e.preventDefault()
    }
    device.addEventListener('wheel', onWheel, { passive: false })
    return () => device.removeEventListener('wheel', onWheel)
  }, [shown])

  /* ── 대화 ──────────────────────────────────────────── */

  // 새 말이 붙으면 맨 아래로
  useEffect(() => {
    const feed = feedRef.current
    if (!feed) return
    feed.scrollTo({ top: feed.scrollHeight, behavior: reduced ? 'auto' : 'smooth' })
  }, [msgs, busy, reduced])

  const push = (m: Omit<ChatMsg, 'id' | 'at'>) => {
    const id = nextId.current++
    const at = Date.now()
    setMsgs(prev => [...prev, { ...m, id, at }])
  }

  /** 칩·다시 보내기처럼 누른 버튼이 사라지는 경우 초점을 잃지 않게 */
  const refocus = () => {
    if (hasFinePointer()) inputRef.current?.focus({ preventScroll: true })
    else feedRef.current?.focus({ preventScroll: true })
  }

  const send = async (text: string, from: 'input' | 'chip' | 'retry', retryOf?: number) => {
    const message = text.trim()
    if (!message || pending.current) return
    pending.current = true

    if (retryOf !== undefined) setMsgs(prev => prev.filter(m => m.id !== retryOf))
    else push({ role: 'user', text: message })
    // 칩이나 다시 보내기로 나간 경우 쓰던 글은 지우지 않는다
    if (from === 'input') setInput('')
    setBusy(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      const json = await res.json()
      push(
        res.ok
          ? { role: 'bot', text: json.text, actions: json.actions }
          : {
              role: 'bot',
              text: json.error ?? '답변을 만들지 못했어요.',
              failed: true,
              // 입력이 잘못된 4xx 는 다시 보내도 같다 — 서버 쪽 실패만 다시 보낼 수 있게
              retry: res.status >= 500 ? message : undefined,
            },
      )
    } catch {
      push({ role: 'bot', text: '연결이 불안정해요. 잠시 후 다시 시도해 주세요.', failed: true, retry: message })
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  const asked = new Set(msgs.filter(m => m.role === 'user').map(m => m.text))
  const started = asked.size > 0
  const remaining = QUICK.filter(q => !asked.has(q))

  const ask = (q: string) => {
    void send(q, 'chip')
    refocus()
  }

  const retry = (m: ChatMsg) => {
    if (!m.retry) return
    void send(m.retry, 'retry', m.id)
    refocus()
  }

  const onNavigate = () => {
    returnFocus.current = false
    close()
  }

  // 대화를 내리면 머리줄 아래에 얇은 경계가 생긴다(One UI 앱 막대)
  const onFeedScroll = (e: UIEvent<HTMLDivElement>) => {
    const screen = screenRef.current
    if (!screen) return
    const scrolled = e.currentTarget.scrollTop > 4
    if ((screen.dataset.scrolled === 'true') !== scrolled) screen.dataset.scrolled = String(scrolled)
  }

  const stagger = (i: number) => ({ '--i': i }) as CSSProperties

  return (
    <>
      <button
        ref={fabRef}
        type="button"
        className="cs-chat-fab cs-phone-fab"
        onClick={openPhone}
        data-hidden={phase === 'open' || undefined}
        aria-haspopup="dialog"
        aria-expanded={shown}
        aria-label="집캐치에게 물어보기"
      >
        <ChatGlyph />
        <span className="cs-phone-fab__label" aria-hidden="true">
          무엇이든 물어보세요
        </span>
      </button>

      {shown && (
        <div ref={layerRef} className="cs-chat cs-phone" data-state={phase} data-boot={boot}>
          <div className="cs-phone__scrim" onClick={close} aria-hidden="true" />

          <div
            ref={deviceRef}
            className="cs-phone__device"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={noticeId}
            tabIndex={-1}
          >
            <div className="cs-phone__bezel">
              <div ref={screenRef} className="cs-phone__screen" data-scrolled="false">
                <div className="cs-phone__in" style={stagger(0)}>
                  <StatusBar />
                </div>

                <header className="cs-phone__bar cs-phone__in" style={stagger(1)}>
                  <button type="button" className="cs-phone__icon cs-phone__back" onClick={close} aria-label="상담 닫기">
                    <BackGlyph />
                  </button>
                  <span className="cs-phone__avatar" aria-hidden="true">
                    <AssistantGlyph size={21} />
                    <i data-online={online} />
                  </span>
                  <div className="cs-phone__who">
                    <h2 id={titleId} className="cs-phone__name">
                      집캐치 상담
                    </h2>
                    <p className="cs-phone__presence" data-online={online}>
                      {online ? '자동 응답 · 온라인' : '오프라인 · 연결을 확인해 주세요'}
                    </p>
                  </div>
                  <button type="button" className="cs-phone__icon cs-phone__close" onClick={close} aria-label="상담 닫기">
                    <CloseGlyph />
                  </button>
                </header>

                <p id={noticeId} className="cs-phone__notice cs-phone__in" style={stagger(2)}>
                  <InfoGlyph />
                  자격 판정은 하지 않아요 · 공식 공고문 확인 필요
                </p>

                <Thread
                  msgs={msgs}
                  busy={busy}
                  starters={started ? [] : QUICK}
                  feedRef={feedRef}
                  onScroll={onFeedScroll}
                  onAsk={ask}
                  onRetry={retry}
                  onNavigate={onNavigate}
                />

                <div className="cs-phone__dock cs-phone__in" style={stagger(4)}>
                  {/* 글을 쓰기 시작하면 칩 줄은 비켜선다(스마트 답장 줄의 손버릇) */}
                  {started && remaining.length > 0 && input.trim() === '' && (
                    <div className="cs-phone__quick" role="group" aria-label="자주 묻는 질문">
                      {remaining.map(q => (
                        <button key={q} type="button" className="cs-phone__chip" onClick={() => ask(q)} disabled={busy}>
                          {q}
                        </button>
                      ))}
                    </div>
                  )}

                  <Composer
                    value={input}
                    onChange={setInput}
                    onSubmit={() => void send(input, 'input')}
                    busy={busy}
                    inputRef={inputRef}
                    noteId={noteId}
                  />

                  <p id={noteId} className="cs-phone__note">
                    남겨주신 연락처·조건은 맞춤 안내를 위해 저장됩니다.
                  </p>

                  <span className="cs-phone__gesture" aria-hidden="true" />
                </div>

                <div className="cs-phone__power" aria-hidden="true">
                  <span className="cs-phone__boot">
                    <AssistantGlyph size={34} />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
