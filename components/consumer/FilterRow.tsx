'use client'

import { useId } from 'react'

export interface FilterOption {
  name: string
  count: number
}

/**
 * 조건 한 줄.
 *
 * 칩만 두 줄 늘어놓으면 무엇을 고르는 줄인지 알 수 없다.
 * 왼쪽에 이름을 붙이고, 각 선택지에 건수를 함께 적어
 * 누르기 전에 어디에 공고가 몰려 있는지 보이게 한다.
 */
export default function FilterRow({
  label,
  options,
  value,
  total,
  onChange,
}: {
  label: string
  options: FilterOption[]
  value: string
  /** '전체' 칩에 적을 건수 */
  total?: number
  onChange: (next: string) => void
}) {
  // 같은 화면에 같은 이름의 줄이 둘 놓여도(홈의 띠와 목록) 이름표가 엇갈리지 않게
  const id = useId()

  if (options.length === 0) return null

  const items: FilterOption[] = [{ name: '전체', count: total ?? 0 }, ...options]

  return (
    <div className="cs-filter">
      <span className="cs-filter__label" id={id}>
        {label}
      </span>
      <div className="cs-filter__chips" role="group" aria-labelledby={id}>
        {items.map(opt => {
          const on = value === opt.name
          return (
            <button
              key={opt.name}
              type="button"
              className="cs-chip"
              data-on={on}
              onClick={() => onChange(opt.name)}
              aria-pressed={on}
            >
              <span className="cs-chip__t">{opt.name}</span>
              {opt.count > 0 && <span className="cs-chip__n">{opt.count}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
