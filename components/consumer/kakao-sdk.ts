/* eslint-disable @typescript-eslint/no-explicit-any */
export type KakaoNS = any

export const KAKAO_JS_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY ?? ''
const SCRIPT_ID = 'kakao-maps-sdk'

/** SDK 주소. 지도 화면이 미리 받아 두는(preload) 주소와 한 글자도 달라선 안 된다 — 다르면 두 번 받는다 */
export const KAKAO_SDK_URL = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&autoload=false`

/**
 * 지도 SDK 를 한 번만 싣는다.
 *
 * `autoload=false` 로 받아 `kakao.maps.load()` 안에서 시작한다. 카카오가 정한
 * 방법이고, "언제 준비됐는지"를 이벤트 순서로 짐작하지 않아도 되는 유일한
 * 길이다 — 그 판단을 신호로 대신하려다 지도 없는 화면을 여러 번 만들었다.
 *
 * 도메인이 콘솔에 등록돼 있지 않으면 스크립트가 401 로 떨어진다. 그때는
 * 무엇을 해야 하는지까지 화면에 적는다. 회색 판만 남기지 않는다.
 */
export function loadKakao(): Promise<KakaoNS> {
  if (typeof window === 'undefined') return Promise.reject(new Error('브라우저 전용'))
  const w = window as unknown as { kakao?: KakaoNS; __kakaoMapPromise?: Promise<KakaoNS> }
  if (w.kakao?.maps?.Map) return Promise.resolve(w.kakao)
  if (w.__kakaoMapPromise) return w.__kakaoMapPromise

  // 무엇을 등록해야 하는지 화면이 직접 말하게 한다. "도메인을 등록하세요"만
  // 적어두면, 무엇을 어디에 적어야 하는지는 여전히 사람이 찾아야 한다.
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const DOMAIN_HINT =
    `카카오 개발자 콘솔 › 내 애플리케이션 › 앱 설정 › 플랫폼 › Web › 사이트 도메인에 ` +
    `「${origin}」 를 그대로 등록해 주세요. ` +
    `Redirect URI 가 아니라 사이트 도메인 칸이고, 이 키(${KAKAO_JS_KEY.slice(0, 8)}…)를 발급한 그 앱이어야 합니다.`

  w.__kakaoMapPromise = new Promise<KakaoNS>((resolve, reject) => {
    if (!KAKAO_JS_KEY) {
      reject(new Error('지도 키가 설정되지 않았습니다.'))
      return
    }

    const start = () => {
      const k = (window as unknown as { kakao?: KakaoNS }).kakao
      if (!k?.maps) {
        reject(new Error(`지도를 불러오지 못했습니다. ${DOMAIN_HINT}`))
        return
      }
      k.maps.load(() => resolve(k))
    }

    const existing = document.getElementById(SCRIPT_ID)
    if (existing) {
      existing.addEventListener('load', start)
      return
    }

    const el = document.createElement('script')
    el.id = SCRIPT_ID
    el.async = true
    el.src = KAKAO_SDK_URL
    el.onload = start
    el.onerror = () => reject(new Error(`지도를 불러오지 못했습니다. ${DOMAIN_HINT}`))
    document.head.appendChild(el)

    setTimeout(() => reject(new Error('지도를 불러오는 데 너무 오래 걸립니다.')), 15000)
  }).catch(err => {
    // 실패한 약속을 캐시에 남기면 다시 들어와도 영영 지도가 없다.
    delete (window as unknown as { __kakaoMapPromise?: unknown }).__kakaoMapPromise
    throw err
  })

  return w.__kakaoMapPromise
}


/**
 * 지도로 갈 것 같을 때 미리 받기 시작한다 — '지도' 메뉴에 손이 올라간 순간.
 *
 * 누르고 나서 받기 시작하면 화면 전환 + SDK + 지도 그리기가 줄을 선다.
 * 손이 올라가 있는 수백 ms 동안 받아 두면 첫 줄 하나가 빠진다.
 * 실패해도 조용히 둔다 — 지도 화면이 다시 부르면서 그때 사정을 말한다.
 */
export function warmKakao() {
  if (!KAKAO_JS_KEY || typeof window === 'undefined') return
  loadKakao().catch(() => {})
}
