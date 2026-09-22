import type { SpecialRead, SpecialType } from '@/lib/adapters/applyhome-special'

/**
 * 특별공급 접수 결과 — 접수가 아직 열려 있는 공고에도 붙는다.
 *
 * ── 왜 이 자리에 숫자를 놓을 수 있나 ──
 *
 * 다른 화면에서는 "접수 중인 공고의 경쟁률은 없다"고 못을 박았다. 여기만 다르다.
 * 특별공급이 하루 먼저 접수되고 그 결과가 1·2순위 접수 사이에 공개되기 때문이다.
 * 그래서 이건 앞일을 점친 값이 아니라 **이미 일어난 일**이다.
 *
 * ── 그래서 무엇이라고 말하나 ──
 *
 * 배수를 크게 적고 끝내지 않는다. 특별공급이 붐볐다고 일반공급이 붐비는 것도,
 * 미달이라고 일반공급이 미달인 것도 아니다. 자격 요건이 아예 다르다.
 * 이 화면이 하는 말은 하나다 — **"같은 단지에 이번 주 사람이 얼마나 왔나."**
 * 그 이상은 화면에 적힌 주의 문구가 막는다.
 */

/** 넘쳤나 남았나 — 색과 말을 한 곳에서 정한다 */
function verdict(t: SpecialType): { tone: 'HOT' | 'EVEN' | 'UNDER'; text: string } {
  if (t.shortBy > 0) return { tone: 'UNDER', text: `${t.shortBy}세대 남음` }
  if (t.rate !== null && t.rate >= 2) return { tone: 'HOT', text: `${t.rate}배` }
  return { tone: 'EVEN', text: t.rate === null ? '—' : `${t.rate}배` }
}

export default function SpecialSupply({
  data,
  open,
}: {
  data: SpecialRead
  /** 일반공급 접수가 아직 열려 있는가 — 같은 숫자라도 쓰임이 다르다 */
  open: boolean
}) {
  const { types, supply, applied, byArea, institutional } = data
  if (types.length === 0 && !institutional) return null

  const filled = supply > 0 ? applied / supply : null
  const left = Math.max(0, supply - applied)

  // 가장 뜨거운 유형이 막대 한 칸을 다 쓴다. 전부 미달이면 1배를 끝으로 둬서
  // 짧은 막대들이 억지로 길어지지 않게 한다.
  const maxRate = Math.max(1, ...types.map(t => t.rate ?? 0))
  /** 1배(딱 맞게 찬 지점)가 막대 어디쯤인지. 눈금이 끝에 붙으면 그리지 않는다 */
  const evenMark = maxRate > 1 ? Math.round((1 / maxRate) * 100) : null

  return (
    <section style={{ marginTop: 32 }}>
      <h2 className="cs-section-title" style={{ fontSize: 24 }}>
        특별공급은 이미 접수가 끝났습니다
      </h2>
      <p className="cs-note" style={{ marginTop: 8, marginBottom: 18 }}>
        {open
          ? '특별공급은 1·2순위보다 하루 먼저 접수하고, 그 결과가 일반공급 접수 사이에 공개됩니다. 그래서 아직 접수 중인 이 공고도 같은 주에 사람이 얼마나 왔는지는 이미 알 수 있습니다.'
          : '같은 공고의 특별공급 접수 결과입니다. 일반공급보다 하루 먼저 접수한 자리입니다.'}
      </p>

      <div className="cs-card cs-spsply">
        {supply > 0 && (
          <div className="cs-spsply__head" data-tone={filled !== null && filled >= 1 ? 'HOT' : 'UNDER'}>
            <div className="cs-spsply__figure">
              <span className="cs-spsply__big cs-num">{applied.toLocaleString()}</span>
              <span className="cs-spsply__unit">건 접수</span>
            </div>
            <p className="cs-spsply__line">
              특별공급 <b>{supply.toLocaleString()}세대</b>에 접수 {applied.toLocaleString()}건.{' '}
              {left > 0 ? (
                <>
                  <b>{left.toLocaleString()}세대가 남았습니다.</b> 특별공급에서 남은 물량은
                  일반공급으로 넘어갑니다.
                </>
              ) : (
                <b>모두 찼습니다.</b>
              )}
            </p>
          </div>
        )}

        {types.length > 0 && (
          <ul className="cs-spsply__list">
            {types.map(t => {
              const v = verdict(t)
              /*
               * 막대 길이는 **이 공고 안에서의 상대 온도**다.
               *
               * 처음에는 접수/공급을 100%에서 잘라 그렸는데, 네 유형이 모두
               * 넘친 공고에서는 막대 네 개가 똑같이 꽉 차서 아무 말도 하지
               * 못했다. 그래서 가장 뜨거운 유형을 한 칸 끝으로 두고 나머지를
               * 그 비율로 재고, 1배 자리에 눈금을 세운다. 눈금 왼쪽이면 미달,
               * 오른쪽이면 넘쳤다는 뜻이라 길이와 경계를 한 번에 읽는다.
               *
               * 막대는 짧게 둔다. 길면 눈이 끝까지 따라가는 사이 정작 중요한
               * 숫자를 지나친다. 막대는 곁눈질용이고 값은 글자다.
               */
              const pct = maxRate > 0 ? Math.round(((t.rate ?? 0) / maxRate) * 100) : 0
              return (
                <li key={t.label} className="cs-spsply__row" data-tone={v.tone}>
                  <span className="cs-spsply__name">{t.label}</span>
                  <span className="cs-spsply__bar" aria-hidden="true">
                    <span className="cs-spsply__fill" style={{ width: `${pct}%` }} />
                    {evenMark !== null && (
                      <span className="cs-spsply__tick" style={{ left: `${evenMark}%` }} />
                    )}
                  </span>
                  <span className="cs-spsply__verdict cs-num">{v.text}</span>
                  <span className="cs-spsply__meta cs-num">
                    {t.supply.toLocaleString()}세대 · {t.applied.toLocaleString()}건
                  </span>
                </li>
              )
            })}
          </ul>
        )}

        {byArea.length > 1 && (
          <p className="cs-spsply__area">
            접수한 곳 —{' '}
            {byArea.map((a, i) => (
              <span key={a.label}>
                {i > 0 && ' · '}
                {a.label} <b>{a.applied.toLocaleString()}건</b>
              </span>
            ))}
          </p>
        )}

        {institutional && (
          // 기관추천은 청약자가 접수해 경쟁하는 자리가 아니다. 같은 표에 넣고
          // 배수를 매기면 경쟁하지 않은 자리를 경쟁한 것처럼 보여주게 된다.
          <p className="cs-spsply__inst">
            기관추천 <b>{institutional.supply.toLocaleString()}세대</b>는 기관이 대상자를 추천해
            채우는 자리라 접수 경쟁이 아닙니다. 위 집계에서 뺐습니다.
          </p>
        )}

        <p className="cs-note cs-spsply__warn">
          특별공급과 일반공급은 자격 요건이 다릅니다(무주택 기간·소득·자녀 등). 특별공급이 미달이라고
          일반공급도 미달인 것은 아니고, 그 반대도 마찬가지입니다. 이 숫자는 <b>이 단지에 같은 주에
          들어온 접수</b>일 뿐, 일반공급 결과를 미리 알려주지 않습니다.
        </p>
        <p className="cs-note" style={{ marginTop: 8 }}>
          청약홈 특별공급 접수 현황 · 주택형 {data.houseTypes}개 합계
          {evenMark !== null && ' · 막대의 세로선이 공급과 접수가 딱 맞는 1배 자리입니다'}
        </p>
      </div>
    </section>
  )
}
