import type { NotificationProvider, NotificationPayload, SendOutcome } from './provider'
import { GUARD_NOTE, isGuardedDeploy } from '@/lib/runtime/deploy-guard'

/**
 * 이메일 알림 어댑터 (기본 채널).
 *
 * 텔레그램은 사용자가 chat id 를 직접 알아내 입력해야 해서 접근성이 떨어진다.
 * 이메일은 가입 시 이미 받으므로 추가 단계가 없다.
 *
 * RESEND_API_KEY 가 없으면 발송하지 않고 PREVIEW 로 돌려준다. 앱은 죽지 않는다.
 * 키는 서버에서만 읽는다.
 */

function fromAddress() {
  return (process.env.NOTIFICATION_FROM ?? '집캐치 <onboarding@resend.dev>').trim()
}

/**
 * 배달될 수 없는 주소.
 *
 * 시연용 시드 고객은 전부 `@example.com` 이고 알림 수신 동의까지 켜져 있다.
 * 발송 키가 들어온 순간 정기 루틴이 이 주소들로 매일 수백 번 발송을 시도하는데,
 * 전부 거절당하면서 발송 계정의 평판만 깎는다. 보내기 전에 걸러낸다.
 *
 * RFC 2606·6761 이 문서·테스트용으로 예약해 둔 도메인만 넣는다.
 * 진짜 주소를 실수로 막지 않으려면 목록은 좁아야 한다.
 */
const UNDELIVERABLE =
  /@(?:example\.(?:com|org|net)|localhost)$|@[^@]*\.(?:test|example|invalid|localhost|local)$/i

export function isUndeliverable(address: string) {
  return UNDELIVERABLE.test(address.trim())
}

/** 알림 본문(평문)을 이메일 HTML 로 감싼다 */
export function renderEmailHtml(payload: NotificationPayload): string {
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const body = escape(payload.body)
    .split('\n')
    .map(line => (line.trim() === '' ? '<div style="height:12px"></div>' : `<div>${line}</div>`))
    .join('')

  const button = payload.linkUrl
    ? `<div style="margin-top:28px">
         <a href="${payload.linkUrl}"
            style="display:inline-block;background:#14110C;color:#ffffff;text-decoration:none;
                   padding:14px 26px;border-radius:12px;font-weight:600;font-size:16px">
           ${escape(payload.linkLabel ?? '자세히 보기')}
         </a>
       </div>`
    : ''

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#F4F1EB;
             font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;
             color:#3B352C;line-height:1.65;font-size:16px">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #E2DBCF;
              border-radius:20px;padding:32px">
    <div style="font-size:20px;font-weight:700;color:#14110C;margin-bottom:20px">집캐치</div>
    ${body}
    ${button}
    <div style="margin-top:32px;padding-top:20px;border-top:1px solid #E2DBCF;
                font-size:13px;color:#6F6859;line-height:1.6">
      이 메일은 알림 수신에 동의하신 주소로 발송됩니다.
      관심공고 화면에서 언제든 수신을 해제하실 수 있습니다.
    </div>
  </div>
</body></html>`
}

export const emailProvider: NotificationProvider = {
  channel: 'EMAIL',
  label: '이메일',

  isConfigured() {
    return Boolean((process.env.RESEND_API_KEY ?? '').trim())
  },

  async send(payload: NotificationPayload): Promise<SendOutcome> {
    const key = (process.env.RESEND_API_KEY ?? '').trim()

    if (!key) {
      return { status: 'PREVIEW', detail: '이메일 발송 키가 없어 발송하지 않고 원문만 보관했습니다.' }
    }
    if (isGuardedDeploy()) return { status: 'PREVIEW', detail: GUARD_NOTE }
    if (!payload.to) {
      return { status: 'PREVIEW', detail: '고객 이메일 주소가 없어 발송하지 않고 원문만 보관했습니다.' }
    }
    if (isUndeliverable(payload.to)) {
      return {
        status: 'PREVIEW',
        detail: '배달할 수 없는 예약 도메인(시연용 주소)이라 발송하지 않고 원문만 보관했습니다.',
      }
    }

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddress(),
          to: [payload.to],
          subject: payload.title,
          html: renderEmailHtml(payload),
          text: payload.linkUrl ? `${payload.body}\n\n${payload.linkUrl}` : payload.body,
        }),
      })

      if (!res.ok) {
        const text = await res.text()
        return { status: 'FAILED', detail: `이메일 API ${res.status}: ${text.slice(0, 180)}` }
      }
      return { status: 'SENT', detail: '이메일로 발송했습니다.' }
    } catch (err) {
      return {
        status: 'FAILED',
        detail: `이메일 발송 실패: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  },
}
