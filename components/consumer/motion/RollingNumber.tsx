import type { CSSProperties } from 'react'

/**
 * 굴러가는 숫자 — 자리마다 0~9 띠를 세워 두고 띠만 올렸다 내린다.
 *
 * 글자를 갈아 끼우면 숫자가 '바뀐다'. 띠를 굴리면 숫자가 '넘어간다' —
 * 단계가 앞뒤로 움직였다는 것이 방향까지 함께 읽힌다. 움직이는 것은
 * transform 하나라 레이아웃을 건드리지 않는다.
 *
 * 화면 읽기 프로그램에는 숨긴다. 값은 부르는 쪽이 progressbar 같은
 * 제 자리에서 읽어 준다 — 띠의 숫자 열 개를 다 읽게 두면 소음이다.
 */

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

export default function RollingNumber({
  value,
  digits = 2,
  className,
}: {
  value: number
  /** 앞을 0 으로 채울 자릿수 — 자릿수가 바뀌면 띠의 개수가 바뀌어 덜컥거린다 */
  digits?: number
  className?: string
}) {
  const str = String(Math.max(0, Math.floor(value))).padStart(digits, '0')
  return (
    <span className={['cs-roll', className].filter(Boolean).join(' ')} aria-hidden="true">
      {str.split('').map((ch, i) => (
        // 오른쪽 끝에서부터 센 자리를 열쇠로 — 자릿수가 늘어도 일의 자리 띠는 그대로 남는다
        <span key={str.length - i} className="cs-roll__col" style={{ '--d': Number(ch) } as CSSProperties}>
          <span className="cs-roll__strip">
            {DIGITS.map(d => (
              <span key={d}>{d}</span>
            ))}
          </span>
        </span>
      ))}
    </span>
  )
}
