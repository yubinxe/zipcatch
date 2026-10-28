/** 대화 한 줄. 요청·응답의 모양은 /api/chat 그대로이고, 화면에 필요한 것만 더한다. */
export interface ChatAction {
  label: string
  href: string
}

export interface ChatMsg {
  /** 목록 key — 순번 */
  id: number
  role: 'bot' | 'user'
  text: string
  actions?: ChatAction[]
  /** 말풍선 옆 시각(epoch ms). 보낸·받은 그 순간의 기기 시계 */
  at: number
  /**
   * 답을 받지 못한 경우에만 — 다시 보낼 원래 질문.
   * 연결이 끊겼거나 서버가 5xx 로 답했을 때만 단다(입력이 잘못된 4xx 는 다시 보내도 같다).
   */
  retry?: string
  /** 오류 안내 말풍선 */
  failed?: boolean
}
