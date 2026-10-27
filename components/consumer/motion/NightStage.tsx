'use client'

import { useRef, type CSSProperties } from 'react'
import { useStageParallax } from './useStageParallax'

/**
 * 밤 무대의 입체 — 화면 머리와 조건 찾기 뒤에 깔리는 공간.
 *
 * 홈의 "One Map" 장면이 지도 위에 불을 켰다면, 하위 화면은 그 지도 위로 내려선
 * 자리다. 발밑의 모눈 바닥이 지평선까지 물러나고, 지평선에는 도시의 빛이 번진다.
 * 그 위에 지붕 선만 또렷한 집 몇 채가 서 있고, 빛기둥이 깊이를 짚는다.
 *
 * 전부 CSS 3D 다. 그림 파일도 WebGL 도 쓰지 않는다 — 첫 화면에 그대로 서고,
 * 그래픽 가속이 없어도 깨지지 않는다. 움직이는 것은 transform · opacity 뿐이다.
 *
 * 좌표(px) — 눈높이(지평선)가 원점이다. x 오른쪽, y 아래, z 보는 사람 쪽.
 * 바닥은 눈 아래 `--ground` 만큼에 눕혀 있고, 집은 그 바닥 위에 선다.
 *
 * 그림은 꾸밈이다. 집의 수·높이·위치는 아무 수치도 담지 않는다(aria-hidden).
 */

interface House {
  x: number
  z: number
  /** 폭 · 깊이 · 벽 높이 · 지붕 높이 */
  w: number
  d: number
  h: number
  r: number
  /** 세로축 회전(도). 소실점 오른쪽 집은 +, 왼쪽 집은 − 로 돌려야 긴 옆벽이 보인다 */
  rot: number
  /** 문에 불이 켜진 집 */
  lit?: boolean
  /** 옆벽 창 띠 */
  band?: boolean
}

interface Beam {
  x: number
  z: number
  h: number
}

interface Scene {
  houses: House[]
  beams: Beam[]
}

/** 머리 무대의 동네 — 글이 서는 왼쪽을 비우고 오른쪽 깊이에 모은다 */
const MAST: Scene = {
  houses: [
    { x: 330, z: -470, w: 190, d: 250, h: 130, r: 84, rot: 30, lit: true, band: true },
    { x: 720, z: -1000, w: 170, d: 230, h: 112, r: 72, rot: 20, band: true },
    { x: 110, z: -1380, w: 150, d: 200, h: 96, r: 64, rot: 38, lit: true },
    { x: 1100, z: -1700, w: 150, d: 190, h: 92, r: 60, rot: 14 },
    { x: -400, z: -2050, w: 140, d: 180, h: 88, r: 58, rot: -22, band: true },
  ],
  beams: [
    { x: 540, z: -760, h: 440 },
    { x: -140, z: -1200, h: 520 },
    { x: 920, z: -1460, h: 580 },
  ],
}

/** 조건 찾기의 넓은 바닥 — 가운데는 비우고 가장자리 깊이에만 빛을 둔다 */
/* 집은 두지 않는다 — 입력 칸 뒤로 비쳐 글을 어지럽힌다. 바닥과 빛기둥만 */
const WIZARD: Scene = {
  houses: [],
  beams: [
    { x: -620, z: -1300, h: 560 },
    { x: 700, z: -1600, h: 640 },
    { x: 1260, z: -900, h: 480 },
  ],
}

/** 서버와 브라우저가 소수를 다르게 적는다 — 둘째 자리에서 끊어 같은 글자로 맞춘다 */
function round(n: number) {
  return Math.round(n * 100) / 100
}
function px(n: number) {
  return `${round(n)}px`
}
function deg(rad: number) {
  return round((rad * 180) / Math.PI)
}

function HouseModel({ house, i }: { house: House; i: number }) {
  const { x, z, w, d, h, r, rot, lit, band } = house
  const half = w / 2
  const eave = 14
  const slope = round(Math.hypot(half, r) + eave * 0.6)
  const tilt = deg(Math.atan2(half, r))
  const gable = `0,${h + r} 0,${r} ${half},0 ${w},${r} ${w},${h + r}`
  const doorW = Math.round(w * 0.17)
  const doorH = Math.round(h * 0.46)

  return (
    <div
      className="cs-ns__house"
      // 소실점 왼쪽의 집 — 글이 넓게 서는 폭에서는 글 뒤에 걸려 거둔다(CSS)
      data-side={x < 0 ? 'left' : undefined}
      style={{ transform: `translate3d(${px(x)}, var(--ground), ${px(z)}) rotateY(${rot}deg)`, '--i': i } as CSSProperties}
    >
      <div className="cs-ns__body">
        {/* 앞 박공 — 보는 쪽(+z) */}
        <div
          className="cs-ns__face cs-ns__face--gable"
          style={{ width: w, height: h + r, transform: `translate3d(${px(-half)}, ${px(-(h + r))}, ${px(d / 2)})` }}
        >
          <svg viewBox={`0 0 ${w} ${h + r}`} preserveAspectRatio="none">
            <polygon className="cs-ns__gable" points={gable} />
            <polyline className="cs-ns__rim" points={`0,${r} ${half},0 ${w},${r}`} />
            {lit && (
              <rect
                className="cs-ns__door"
                x={half - doorW / 2}
                y={h + r - doorH}
                width={doorW}
                height={doorH}
                rx={doorW / 2}
              />
            )}
          </svg>
        </div>
        {/* 뒤 박공 */}
        <div
          className="cs-ns__face cs-ns__face--gable cs-ns__face--back"
          style={{ width: w, height: h + r, transform: `translate3d(${px(half)}, ${px(-(h + r))}, ${px(-d / 2)}) rotateY(180deg)` }}
        >
          <svg viewBox={`0 0 ${w} ${h + r}`} preserveAspectRatio="none">
            <polygon className="cs-ns__gable" points={gable} />
          </svg>
        </div>
        {/* 옆벽 — 오른쪽(+x) · 왼쪽(-x) */}
        <div
          className="cs-ns__face cs-ns__face--wall cs-ns__face--shade"
          data-band={band || undefined}
          style={{ width: d, height: h, transform: `translate3d(${px(half)}, ${px(-h)}, ${px(d / 2)}) rotateY(90deg)` }}
        />
        <div
          className="cs-ns__face cs-ns__face--wall"
          data-band={band || undefined}
          style={{ width: d, height: h, transform: `translate3d(${px(-half)}, ${px(-h)}, ${px(-d / 2)}) rotateY(-90deg)` }}
        />
        {/* 지붕 두 장 — 용마루에서 처마로 */}
        <div
          className="cs-ns__face cs-ns__face--roof cs-ns__face--shade"
          style={{
            width: d + eave * 2,
            height: slope,
            transform: `translate3d(0px, ${px(-(h + r))}, ${px(d / 2 + eave)}) rotateY(90deg) rotateX(${tilt}deg)`,
          }}
        />
        <div
          className="cs-ns__face cs-ns__face--roof"
          style={{
            width: d + eave * 2,
            height: slope,
            transform: `translate3d(0px, ${px(-(h + r))}, ${px(-d / 2 - eave)}) rotateY(-90deg) rotateX(${tilt}deg)`,
          }}
        />
      </div>
      {/* 집 밑에 고인 빛 — 바닥과 나란히 눕힌다 */}
      <i
        className="cs-ns__pool"
        style={{
          width: round(w * 2.4),
          height: round(d * 2.2),
          transform: `translate3d(${px(-w * 1.2)}, -1px, ${px(d * 1.1)}) rotateX(-90deg)`,
        }}
      />
    </div>
  )
}

export default function NightStage({
  variant = 'mast',
  className,
}: {
  /** mast: 화면 머리(집이 선 동네) · wizard: 조건 찾기의 넓은 바닥 */
  variant?: 'mast' | 'wizard'
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useStageParallax(ref, { listen: variant === 'mast' ? '.cs-mast' : '.cs-wz' })
  const scene = variant === 'mast' ? MAST : WIZARD

  return (
    <div
      ref={ref}
      className={['cs-ns', `cs-ns--${variant}`, className].filter(Boolean).join(' ')}
      aria-hidden="true"
    >
      <div className="cs-ns__sky" />
      {/* 지평선은 세계보다 먼저 그린다 — 집이 빛줄 앞에 선다 */}
      <div className="cs-ns__horizon" />
      <div className="cs-ns__world">
        <div className="cs-ns__floor">
          <i />
        </div>
        {scene.beams.map((b, i) => (
          <div
            key={`b${i}`}
            className="cs-ns__beam"
            // 자리는 translate 로 — 솟는 장면의 scale 이 기둥 밑동을 축으로 늘어나게
            style={{ translate: `${px(b.x)} calc(var(--ground) - ${px(b.h)}) ${px(b.z)}`, height: b.h, '--i': i } as CSSProperties}
          />
        ))}
        {scene.houses.map((h, i) => (
          <HouseModel key={`h${i}`} house={h} i={i} />
        ))}
      </div>
      <div className="cs-ns__scrim" />
    </div>
  )
}
