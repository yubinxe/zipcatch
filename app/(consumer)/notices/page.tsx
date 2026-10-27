import NoticeBrowser from '@/components/consumer/NoticeBrowser'

export const metadata = { title: '모집 중인 공고 — 집캐치' }

/**
 * 모집 중인 공고.
 *
 * 첫 화면 지도에서 지역을 골라 들어오면(?region=) 그 지역이 이미 골라져 있어야 한다.
 * 주소의 값은 브라우저에서 읽는다 — 서버에서 읽으면 이 화면이 매 요청 새로 그려진다.
 * 그 읽기는 NoticeBrowser 안의 작은 조각이 따로 기다리므로, 무대와 거르기 판은
 * 서버가 그린 그대로 첫 그림에 선다.
 */
export default function NoticesPage() {
  return <NoticeBrowser />
}
