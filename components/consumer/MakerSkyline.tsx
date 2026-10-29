/**
 * 바닥글 뒤의 도시 — 해가 막 진 하늘 아래 아파트 단지의 실루엣.
 *
 * 꾸밈이다. 동의 수·높이·불 켜진 창은 아무 수치도 담지 않는다(aria-hidden).
 * 매번 같은 그림이 나오도록 씨앗으로 정해진 난수를 쓴다 — 서버와 브라우저가 같은
 * 그림을 그려야 수화가 어긋나지 않는다.
 *
 * 앞·뒤 두 겹으로 세워 깊이를 낸다. 뒤 겹은 하늘색에 묻히고, 앞 겹은 밤에 가깝다.
 */

function rand(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

interface Tower {
  x: number
  w: number
  h: number
  lit: { x: number; y: number }[]
}

function towers(seed: number, count: number, minH: number, maxH: number, width: number): Tower[] {
  const r = rand(seed)
  const out: Tower[] = []
  let x = -10
  for (let i = 0; i < count && x < width; i++) {
    const w = 34 + Math.round(r() * 34)
    const h = Math.round(minH + r() * (maxH - minH))
    const lit: { x: number; y: number }[] = []
    // 창 격자 — 층마다 몇 집만 불이 켜져 있다
    for (let fy = 12; fy < h - 8; fy += 11) {
      for (let fx = 6; fx < w - 6; fx += 9) {
        if (r() < 0.16) lit.push({ x: x + fx, y: fy })
      }
    }
    out.push({ x, w, h, lit })
    x += w + 4 + Math.round(r() * 18)
  }
  return out
}

const W = 1600
const H = 260
const BACK = towers(7, 40, 70, 170, W)
const FRONT = towers(29, 34, 40, 120, W)

export default function MakerSkyline() {
  return (
    <svg className="cs-maker__city" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <g className="cs-maker__city-back">
        {BACK.map((t, i) => (
          <rect key={i} x={t.x} y={H - t.h} width={t.w} height={t.h} rx={2} />
        ))}
      </g>
      <g className="cs-maker__city-front">
        {FRONT.map((t, i) => (
          <rect key={i} x={t.x} y={H - t.h} width={t.w} height={t.h} rx={2} />
        ))}
      </g>
      <g className="cs-maker__city-lit">
        {FRONT.flatMap((t, i) =>
          t.lit.map((l, j) => <rect key={`${i}-${j}`} x={l.x} y={H - t.h + l.y} width={4} height={5} rx={0.6} />),
        )}
      </g>
    </svg>
  )
}
