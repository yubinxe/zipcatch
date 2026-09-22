'use client'

/**
 * 지역 마크.
 *
 * ── 왜 지자체 CI 를 쓰지 않는가 ──
 *
 * 시·군·구 로고(CI)는 각 지자체가 저작권을 갖고 사용 규정을 따로 둔다.
 * 대부분 "행정 목적 외 사용 시 사전 승인" 을 요구하고, 민간 서비스가 임의로
 * 내려받아 붙이는 것은 승인 대상이다. 250여 곳의 승인을 받아둔 게 아니라면
 * 박람회에 들고 나가는 화면에 얹을 수 없다.
 *
 * 대신 지역 이름 자체를 마크로 만든다. 글자 한두 자와 지역마다 고정된 색을
 * 쓰므로 실제 로고와 같은 일을 한다 — 카드 오른쪽에서 "어디인지"를 즉시 알린다.
 * 게다가 전국 어느 지역이 들어와도 빈칸이 생기지 않는다.
 */

/** 이름에서 지역색을 만든다. 같은 지역은 언제나 같은 색이다 */
function hueOf(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return h
}

/** "서울특별시 관악구" → "관악", "충청남도" → "충남" */
function shortName(raw: string) {
  const s = (raw ?? '').trim()
  if (!s) return ''
  const last = s.split(/\s+/).pop() ?? s
  // 행정 단위 꼬리를 떼면 두 글자가 남는다 — 마크에 들어갈 만한 길이다
  const core = last.replace(/(특별자치도|특별자치시|광역시|특별시|[시군구읍면동])$/u, '')
  return (core || last).slice(0, 3)
}

export default function RegionMark({
  region,
  district,
}: {
  region: string
  /** 광역명. 있으면 마크 아래에 작게 적는다 */
  district?: string
}) {
  const label = shortName(region)
  if (!label) return null

  const hue = hueOf(region)

  return (
    <span
      className="cs-regionmark"
      aria-hidden="true"
      style={
        {
          '--mark-h': hue,
        } as React.CSSProperties
      }
    >
      <span className="cs-regionmark__ring" />
      <span className="cs-regionmark__text">{label}</span>
      {district && district !== region && (
        <span className="cs-regionmark__sub">{shortName(district)}</span>
      )}
    </span>
  )
}
