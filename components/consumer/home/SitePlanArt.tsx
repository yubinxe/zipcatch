import { memo } from 'react'

/**
 * 단지 배치도 한 장 — 공고 카드의 머리 그림.
 *
 * 사진을 쓰지 않고 공고 id 로 씨앗을 삼아 단지 하나를 축측(axonometric)으로 그린다.
 * 같은 공고는 언제 어디서 그려도 같은 그림이다(서버·브라우저가 같다 — 난수는 id 에서만 나온다).
 *
 *   · 가운데 대지 — 동(棟)을 채워 그린다. 왼쪽 앞면은 해 질 녘 빛을 받고, 오른쪽 옆면은
 *     밤이라 창 몇 개에만 불이 들어온다. 지붕에는 동 번호.
 *   · 둘레 — 주변 블록은 가는 선으로만(배치도의 '주변 현황'처럼) 그리고 양옆으로 사라진다.
 *   · 대지 경계 점선, 단지 안 길, 앞 변의 치수선, 방위표 — 도면의 말투.
 *
 * 장식이므로 보조기술에는 숨긴다. 넓은 화면에서는 둘레까지, 좁은 화면에서는 가운데 대지만
 * 보이도록 viewBox 를 넉넉하게 두고 `slice` 로 채운다.
 */

// 화면 좌표 = x 축은 완만하게 오른쪽 아래로, y 축은 가파르게 왼쪽 아래로, z 는 위로
const K = 1.17
const AX = 0.94 * K
const AY = 0.26 * K
const BX = 0.5 * K
const BY = 0.42 * K
const OX = 1000
const OY = 248
const FLOOR = 3.1

type P = [number, number]
const pt = (x: number, y: number, z = 0): P => [OX + x * AX - y * BX, OY + x * AY + y * BY - z * K]
const poly = (ps: P[]) => ps.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' ')
const line = (a: P, b: P) => `M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`

function seeded(id: string) {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  let s = h >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Box {
  x0: number
  x1: number
  y0: number
  y1: number
  h: number
  no?: number
  floors?: string
  lit?: string[]
}

/** 상자 하나의 보이는 세 면 — 앞(+y), 옆(+x), 지붕 */
function faces(b: Box) {
  const { x0, x1, y0, y1, h } = b
  return {
    front: poly([pt(x0, y1, 0), pt(x1, y1, 0), pt(x1, y1, h), pt(x0, y1, h)]),
    side: poly([pt(x1, y1, 0), pt(x1, y0, 0), pt(x1, y0, h), pt(x1, y1, h)]),
    top: poly([pt(x0, y0, h), pt(x1, y0, h), pt(x1, y1, h), pt(x0, y1, h)]),
  }
}

/** 지면에 눕힌 글자 — 글자의 가로가 세계의 x 축, 세로가 y 축을 따른다 */
const onGround = (x: number, y: number, z = 0) => {
  const [a, b] = pt(x, y, z)
  return `matrix(${AX} ${AY} ${-BX} ${BY} ${a.toFixed(1)} ${b.toFixed(1)})`
}

function build(seed: string) {
  const rnd = seeded(seed)
  const pick = (lo: number, hi: number) => lo + (hi - lo) * rnd()

  // ── 대지 안의 동 — 세 줄, 줄마다 너덧 칸. 몇 칸은 비워 마당을 남긴다
  const homes: Box[] = []
  const rows = [-78, -6, 66]
  const park = Math.floor(rnd() * 4) // 비워 둘 칸 하나(중앙 마당)
  let no = 101
  rows.forEach((ry, r) => {
    let x = -238 + pick(0, 14)
    let c = 0
    while (x < 222) {
      const tower = rnd() < 0.28
      const w = tower ? 24 : pick(58, 84)
      const d = tower ? 24 : 14
      if (x + w > 238) break
      const skip = r === 1 && c === park + 1
      if (!skip) {
        // 뒤 줄이 더 높다 — 앞을 가리지 않고 실루엣이 산처럼 선다
        const floors = Math.round((tower ? pick(26, 33) : pick(16, 24)) - r * 3)
        const jy = pick(-6, 6)
        homes.push({ x0: x, x1: x + w, y0: ry + jy, y1: ry + jy + d, h: floors * FLOOR, no: no++ })
      }
      x += w + pick(22, 34)
      c++
    }
  })

  // ── 둘레 블록 — 선으로만. 대지 좌우로 몇 블록씩
  const context: Box[] = []
  for (const bx of [-1180, -900, -620, 560, 840, 1120]) {
    for (const by of [-150, -30, 96]) {
      if (rnd() < 0.3) continue
      const w = pick(60, 150)
      const d = pick(18, 46)
      context.push({ x0: bx + pick(0, 60), x1: bx + pick(0, 60) + w, y0: by, y1: by + d, h: pick(10, 34) * FLOOR * 0.6 })
    }
  }
  // 앞 거리 건너편(대지 앞쪽) 낮은 블록
  for (let bx = -520; bx < 520; bx += pick(90, 140)) {
    if (rnd() < 0.35) continue
    context.push({ x0: bx, x1: bx + pick(50, 80), y0: 214, y1: 214 + pick(18, 30), h: pick(4, 9) * FLOOR })
  }
  for (const b of context) if (b.x1 < b.x0) [b.x0, b.x1] = [b.x1, b.x0]

  // 멀리 있는 것부터 — 화면에서 아래로 갈수록 가깝다
  const depth = (b: Box) => ((b.x0 + b.x1) / 2) * AY + ((b.y0 + b.y1) / 2) * BY
  homes.sort((a, b) => depth(a) - depth(b))
  context.sort((a, b) => depth(a) - depth(b))

  // ── 층 선(앞면)과 옆면 창 — 몇 개에만 불이 켜진다. 동마다 따로 들고 있어야 앞 동이 가린다
  for (const b of homes) {
    const n = Math.floor(b.h / FLOOR)
    const fl: string[] = []
    for (let f = 2; f < n; f += 2) fl.push(line(pt(b.x0, b.y1, f * FLOOR), pt(b.x1, b.y1, f * FLOOR)))
    b.floors = fl.join('')
    b.lit = []
    const bays = Math.max(2, Math.floor((b.y1 - b.y0) / 6))
    const bw = (b.y1 - b.y0) / bays
    for (let f = 0; f < n - 1; f++) {
      for (let k = 0; k < bays; k++) {
        if (rnd() > 0.11) continue
        const ya = b.y1 - k * bw - bw * 0.2
        const yb = b.y1 - (k + 1) * bw + bw * 0.2
        const za = f * FLOOR + FLOOR * 0.25
        const zb = za + FLOOR * 0.55
        b.lit.push(poly([pt(b.x1, ya, za), pt(b.x1, yb, za), pt(b.x1, yb, zb), pt(b.x1, ya, zb)]))
      }
    }
  }

  return { homes, context }
}

function SitePlanArt({ seed, label }: { seed: string; label: string }) {
  const { homes, context } = build(seed)
  const id = `sp-${seed.replace(/[^a-zA-Z0-9_-]/g, '')}`

  // 대지 경계와 단지 안 길
  const site = poly([pt(-262, -112), pt(262, -112), pt(262, 112), pt(-262, 112)])
  const lane = poly([pt(-232, -38), pt(232, -38), pt(232, 40), pt(-232, 40)])
  // 앞 변 치수선 — 대지 앞쪽으로 조금 떨어뜨려 긋는다
  const dimA = pt(-262, 136)
  const dimB = pt(262, 136)

  return (
    <svg className="cs-open__art" viewBox="0 0 2000 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-front`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#DE9A68" />
          <stop offset="0.5" stopColor="#8E5639" />
          <stop offset="1" stopColor="#2A2125" />
        </linearGradient>
        <linearGradient id={`${id}-side`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1E2737" />
          <stop offset="1" stopColor="#111722" />
        </linearGradient>
        <radialGradient id={`${id}-sun`} cx="0.36" cy="0.62" r="0.5">
          <stop offset="0" stopColor="#FF9A55" stopOpacity="0.32" />
          <stop offset="0.5" stopColor="#FF8A3D" stopOpacity="0.08" />
          <stop offset="1" stopColor="#FF8A3D" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-fade`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.24" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.76" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id={`${id}-m`}>
          <rect width="2000" height="400" fill={`url(#${id}-fade)`} />
        </mask>
      </defs>

      {/* 해 진 쪽 하늘빛 */}
      <rect width="2000" height="400" fill={`url(#${id}-sun)`} />

      <g mask={`url(#${id}-m)`} fill="none" vectorEffect="non-scaling-stroke">
        {/* 큰길 두 줄 — 대지 앞뒤로 x 축을 따라 끝까지 */}
        <g stroke="rgba(255,255,255,0.13)" strokeWidth="1">
          {[-190, -172, 180, 204].map(y => (
            <path key={y} d={line(pt(-1500, y), pt(1500, y))} vectorEffect="non-scaling-stroke" />
          ))}
          {[-330, -306, 318, 342].map(x => (
            <path key={x} d={line(pt(x, -700), pt(x, 700))} vectorEffect="non-scaling-stroke" />
          ))}
        </g>
        {/* 둘레 블록 — 밤빛으로 채워 뒤를 가리고, 모서리만 가늘게 */}
        <g stroke="rgba(255,255,255,0.16)" strokeWidth="1" strokeLinejoin="round">
          {context.map((b, i) => {
            const f = faces(b)
            return (
              <g key={i}>
                <polygon points={f.front} fill="#121926" vectorEffect="non-scaling-stroke" />
                <polygon points={f.side} fill="#0E131D" vectorEffect="non-scaling-stroke" />
                <polygon points={f.top} fill="#161E2B" vectorEffect="non-scaling-stroke" />
              </g>
            )
          })}
        </g>
      </g>

      {/* 대지 */}
      <polygon points={site} fill="rgba(255,178,122,0.045)" stroke="rgba(255,178,122,0.55)" strokeWidth="1" strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />
      <polygon points={lane} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <g stroke="rgba(255,178,122,0.5)" strokeWidth="1" fill="none">
        <path d={line(dimA, dimB)} vectorEffect="non-scaling-stroke" />
        <path d={line(pt(-262, 124), pt(-262, 146))} vectorEffect="non-scaling-stroke" />
        <path d={line(pt(262, 124), pt(262, 146))} vectorEffect="non-scaling-stroke" />
      </g>
      <text
        transform={onGround(-252, 152)}
        fontSize="17"
        fontWeight="700"
        letterSpacing="1"
        fill="rgba(255,178,122,0.85)"
      >
        {label}
      </text>

      {/* 그림자 — 해가 앞 왼쪽에 낮게 있어 뒤 오른쪽으로 길게 눕는다 */}
      <g fill="rgba(4,6,10,0.42)">
        {homes.map(b => {
          const L = b.h * 0.55
          const [dx, dy] = [L * 0.45, -L]
          return (
            <polygon
              key={b.no}
              points={poly([pt(b.x0, b.y0), pt(b.x0 + dx, b.y0 + dy), pt(b.x1 + dx, b.y0 + dy), pt(b.x1 + dx, b.y1 + dy), pt(b.x1, b.y1), pt(b.x0, b.y1)])}
            />
          )
        })}
      </g>

      {/* 동 — 앞면은 노을, 옆면은 밤 */}
      <g strokeLinejoin="round">
        {homes.map(b => {
          const f = faces(b)
          const [cx, cy] = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]
          const wide = b.x1 - b.x0 > 40
          return (
            <g key={b.no}>
              <polygon points={f.side} fill={`url(#${id}-side)`} stroke="rgba(255,214,184,0.22)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              <polygon points={f.front} fill={`url(#${id}-front)`} stroke="rgba(255,214,184,0.4)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              <path d={b.floors} stroke="rgba(30,16,14,0.26)" strokeWidth="1" fill="none" vectorEffect="non-scaling-stroke" />
              {b.lit?.map((q, i) => <polygon key={i} points={q} fill="#FFC28F" opacity="0.85" />)}
              <polygon points={f.top} fill="#2E3748" stroke="rgba(255,226,204,0.6)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              {wide && (
                <text transform={onGround(cx - 13, cy + 4, b.h)} fontSize="11" fontWeight="700" fill="rgba(255,255,255,0.55)">
                  {b.no}
                </text>
              )}
            </g>
          )
        })}
      </g>
      {/* 방위표 */}
      <g transform={`translate(${(pt(300, -150)[0]).toFixed(1)} ${(pt(300, -150)[1] - 30).toFixed(1)})`} stroke="rgba(255,255,255,0.4)" fill="none">
        <circle r="11" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d="M0 -15 L4 4 L0 1 L-4 4 Z" fill="rgba(255,178,122,0.8)" stroke="none" />
        <text y="-19" fontSize="10" fontWeight="700" textAnchor="middle" fill="rgba(255,255,255,0.55)" stroke="none">
          N
        </text>
      </g>
    </svg>
  )
}

export default memo(SitePlanArt)
