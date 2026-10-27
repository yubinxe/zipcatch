import RollingNumber from './RollingNumber'

/**
 * 단계 레일 — 굴러가는 단계 번호와 차오르는 마디.
 *
 * 마디는 이름을 달고 선다. "2/4"만 적어 두면 앞으로 무엇을 더 묻는지 모른 채
 * 다음을 누르게 된다. 지난 마디는 주황으로 채워 두고, 지금 마디는 빛이 차오르며,
 * 남은 마디는 흐린 선으로 기다린다. 채우는 일은 transform(scaleX) 하나로 한다.
 *
 * 접근성: 레일 전체가 progressbar 다. 안의 숫자·이름은 장식이라 읽지 않고,
 * aria-valuetext 가 "4단계 중 2단계 · 주거비" 처럼 한 번에 읽어 준다.
 */
export default function StepRail({
  steps,
  current,
  busy = false,
}: {
  steps: string[]
  current: number
  /** 마지막 단계에서 결과를 찾는 중 — 지금 마디에 빛이 흐른다(진행률을 꾸며 내지 않는다) */
  busy?: boolean
}) {
  const total = steps.length
  const now = Math.min(total, Math.max(1, current + 1))
  return (
    <div className="cs-rail" data-busy={busy ? 'true' : undefined}>
      <div className="cs-rail__count" aria-hidden="true">
        <span className="cs-rail__eyebrow">Step</span>
        <span className="cs-rail__num">
          <RollingNumber value={now} />
          <span className="cs-rail__of">/{String(total).padStart(2, '0')}</span>
        </span>
      </div>
      <div
        className="cs-rail__bar"
        role="progressbar"
        aria-valuenow={now}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-label={`${total}단계 중 ${now}단계`}
        aria-valuetext={`${total}단계 중 ${now}단계, ${steps[now - 1]}`}
      >
        {steps.map((label, i) => (
          <span
            key={label}
            className="cs-rail__seg"
            data-state={i < current ? 'done' : i === current ? 'current' : 'todo'}
          >
            <span className="cs-rail__track">
              <i />
            </span>
            <span className="cs-rail__label">
              <b className="cs-num">{String(i + 1).padStart(2, '0')}</b>
              {label}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}
