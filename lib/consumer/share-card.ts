/**
 * 공유 이미지 — 분석·비교·계산 결과를 한 장으로 그린다 (브라우저 Canvas, 새 라이브러리 없음).
 *
 * 그림에는 숫자와 함께 늘 출처·기준일을 넣고, 사용자가 넣은 가정값이 있으면 그것도 넣는다.
 * 이미지는 화면을 떠나 돌아다닌다 — 떼어 낸 숫자가 사실처럼 읽히지 않게 근거를 같이 싣는다.
 */

export type Ratio = '16:9' | '4:5' | '9:16'
export const RATIO_SIZE: Record<Ratio, [number, number]> = {
  '16:9': [1920, 1080],
  '4:5': [1080, 1350],
  '9:16': [1080, 1920],
}

export interface ShareRow {
  label: string
  value: string
  /** 0~1 — 있으면 막대를 그린다 */
  bar?: number | null
  /** 0~2 — 막대 색 (비교의 갈래) */
  tone?: number
  sub?: string
}

export interface ShareCard {
  kicker: string
  title: string
  rows: ShareRow[]
  /** 사용자가 넣은 가정값 — 예: '대출 금리 2.5%' */
  assumptions?: string[]
  /** 위 줄의 머리말. 기본 '가정값' */
  assumptionsLabel?: string
  source: string
  /** 기준일 (YYYY-MM-DD 또는 문장) */
  asOf: string
  /** 파일 이름에 쓸 짧은 이름 */
  slug: string
}

const C = {
  paper: '#F7F4EE',
  ink: '#14110C',
  body: '#3B352C',
  muted: '#5A5345',
  line: '#E2DBCF',
  tones: ['#14110C', '#A83A20', '#7D6320'],
}

/** 폭에 맞춰 줄을 나눈다 (한글은 글자 단위로 끊어도 읽힌다) */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines: number) {
  const lines: string[] = []
  let cur = ''
  for (const ch of text) {
    if (ctx.measureText(cur + ch).width > width && cur) {
      lines.push(cur)
      cur = ch.trimStart()
      if (lines.length === maxLines) break
    } else cur += ch
  }
  if (lines.length < maxLines && cur) lines.push(cur)
  if (lines.length === maxLines && lines.join('').length < text.length) {
    let last = lines[maxLines - 1]
    while (ctx.measureText(last + '…').width > width && last.length) last = last.slice(0, -1)
    lines[maxLines - 1] = last + '…'
  }
  return lines
}

export function drawShareCard(canvas: HTMLCanvasElement, card: ShareCard, ratio: Ratio, family: string) {
  const [W, H] = RATIO_SIZE[ratio]
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const wide = ratio === '16:9'
  const pad = wide ? 120 : 96
  const u = wide ? 1 : W / 1080 // 세로판은 폭 1080 기준
  const f = (w: number, s: number) => `${w} ${Math.round(s * u)}px ${family}`

  ctx.fillStyle = C.paper
  ctx.fillRect(0, 0, W, H)
  // 위 괘선 — 지면의 첫 줄
  ctx.fillStyle = C.ink
  ctx.fillRect(pad, pad, W - pad * 2, 4)

  let y = pad + 64 * u
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = C.tones[1]
  ctx.font = f(800, 26)
  ctx.fillText(card.kicker.toUpperCase().split('').join(' '), pad, y)

  y += 30 * u
  ctx.fillStyle = C.ink
  ctx.font = f(700, wide ? 60 : 64)
  const titleLines = wrap(ctx, card.title, W - pad * 2, wide ? 2 : 3)
  for (const l of titleLines) {
    y += (wide ? 72 : 80) * u
    ctx.fillText(l, pad, y)
  }

  // 본문 — 16:9 는 두 단, 세로판은 한 단
  y += 56 * u
  const footH = (card.assumptions?.length ? 150 : 110) * u
  const bodyBottom = H - pad - footH
  const cols = wide && card.rows.length > 4 ? 2 : 1
  const colW = (W - pad * 2 - (cols - 1) * 80) / cols
  const perCol = Math.ceil(card.rows.length / cols)
  const rowH = Math.min((wide ? 120 : 150) * u, (bodyBottom - y) / perCol)

  card.rows.forEach((r, i) => {
    const col = Math.floor(i / perCol)
    const x = pad + col * (colW + 80)
    const top = y + (i % perCol) * rowH
    ctx.fillStyle = C.line
    ctx.fillRect(x, top, colW, 2)
    ctx.fillStyle = C.muted
    ctx.font = f(600, 26)
    const lab = wrap(ctx, r.label, colW * 0.62, 1)[0] ?? ''
    ctx.fillText(lab, x, top + 44 * u)
    ctx.fillStyle = C.ink
    ctx.font = f(700, 40)
    const vw = ctx.measureText(r.value).width
    ctx.fillText(r.value, x + colW - vw, top + 50 * u)
    if (r.sub) {
      ctx.fillStyle = C.muted
      ctx.font = f(500, 22)
      const sw = ctx.measureText(r.sub).width
      ctx.fillText(r.sub, x + colW - sw, top + 82 * u)
    }
    if (r.bar !== undefined && r.bar !== null) {
      const by = top + (r.sub ? 98 : 74) * u
      ctx.fillStyle = C.line
      ctx.fillRect(x, by, colW * 0.62, 10 * u)
      ctx.fillStyle = C.tones[r.tone ?? 0]
      if (r.bar > 0) ctx.fillRect(x, by, Math.max(6, colW * 0.62 * Math.min(1, r.bar)), 10 * u)
    }
  })

  // 바닥 — 가정값 · 출처 · 기준일 · 이름
  let fy = H - pad - footH + 40 * u
  ctx.fillStyle = C.ink
  ctx.fillRect(pad, fy - 30 * u, W - pad * 2, 2)
  ctx.font = f(500, 22)
  ctx.fillStyle = C.body
  if (card.assumptions?.length) {
    const t = wrap(ctx, `${card.assumptionsLabel ?? '가정값'} · ${card.assumptions.join(' · ')}`, W - pad * 2, 1)[0]
    ctx.fillText(t, pad, fy + 6 * u)
    fy += 40 * u
  }
  const src = wrap(ctx, `출처 · ${card.source} · 기준 ${card.asOf}`, W - pad * 2 - 200 * u, 2)
  src.forEach((l, i) => ctx.fillText(l, pad, fy + 6 * u + i * 32 * u))
  ctx.fillStyle = C.ink
  ctx.font = f(800, 30)
  const brand = '집캐치'
  ctx.fillText(brand, W - pad - ctx.measureText(brand).width, fy + 6 * u)
  ctx.fillStyle = C.muted
  ctx.font = f(500, 18)
  const note = '참고용 · 공고문 원문이 기준'
  ctx.fillText(note, W - pad - ctx.measureText(note).width, fy + 36 * u)
}
