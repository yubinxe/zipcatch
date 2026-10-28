import { KOREA_ISLAND_INSET, KOREA_ISLAND_PROVINCE } from '@/lib/korea-map-data'

/**
 * 울릉도·독도 — 지도의 오른쪽 위 작은 상자.
 *
 * 본토를 칸 가운데에 두려고 보는 틀에서 동쪽 끝을 걷어냈다. 섬을 지우지 않고,
 * 한국 지도가 흔히 하듯 상자 안에 따로 그린다. 평면(2D)·입체(3D) 어느 쪽이 떠 있어도
 * 같은 자리에 보이도록 지도 칸 위에 얹는다.
 */
export default function IslandInset({ level = 0, on = false }: { level?: number; on?: boolean }) {
  if (!KOREA_ISLAND_PROVINCE) return null
  return (
    <div className="cs-isle" aria-hidden="true">
      <svg viewBox={KOREA_ISLAND_INSET} className="cs-isle__map">
        <path d={KOREA_ISLAND_PROVINCE.path} className="cs-atlas__land" data-level={level} data-on={on || undefined} />
      </svg>
      <span className="cs-isle__label">울릉도·독도</span>
    </div>
  )
}
