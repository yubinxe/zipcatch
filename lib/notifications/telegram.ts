import type { NotificationProvider, NotificationPayload, SendOutcome } from './provider'
import { GUARD_NOTE, isGuardedDeploy } from '@/lib/runtime/deploy-guard'

/**
 * Telegram Bot API 어댑터.
 *
 * TELEGRAM_BOT_TOKEN 이 없거나 수신자(chat id)가 없으면 발송하지 않고
 * PREVIEW 로 돌려준다. 앱은 절대 죽지 않는다.
 * 토큰은 서버에서만 읽는다.
 */
export const telegramProvider: NotificationProvider = {
  channel: 'TELEGRAM',
  label: '텔레그램',

  isConfigured() {
    return Boolean((process.env.TELEGRAM_BOT_TOKEN ?? '').trim())
  },

  async send(payload: NotificationPayload): Promise<SendOutcome> {
    const token = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim()

    if (!token) {
      return { status: 'PREVIEW', detail: '텔레그램 봇 토큰이 없어 발송하지 않고 원문만 보관했습니다.' }
    }
    if (!payload.to) {
      return {
        status: 'PREVIEW',
        detail: '고객의 텔레그램 수신자 ID가 없어 발송하지 않고 원문만 보관했습니다.',
      }
    }
    if (isGuardedDeploy()) return { status: 'PREVIEW', detail: GUARD_NOTE }

    const text = payload.linkUrl
      ? `${payload.body}\n\n${payload.linkLabel ?? '자세히 보기'}: ${payload.linkUrl}`
      : payload.body

    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: payload.to,
          text,
          disable_web_page_preview: false,
        }),
      })

      if (!res.ok) {
        const body = await res.text()
        return { status: 'FAILED', detail: `텔레그램 API ${res.status}: ${body.slice(0, 180)}` }
      }
      return { status: 'SENT', detail: '텔레그램으로 발송했습니다.' }
    } catch (err) {
      return {
        status: 'FAILED',
        detail: `텔레그램 발송 실패: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  },
}
