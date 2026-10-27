import { Suspense } from 'react'
import LoginView from '@/components/consumer/LoginView'

export const metadata = { title: '로그인 — 집캐치' }

export default function LoginPage() {
  // LoginView 는 ?next= 를 읽어 보던 자리로 돌려보낸다.
  // useSearchParams 를 쓰므로 정적 렌더가 여기서 한 번 끊겨야 한다.
  return (
    // 기다리는 동안에도 밤 무대를 먼저 깐다 — 밝은 지면이 번쩍였다 꺼지지 않게
    <Suspense
      fallback={
        <div className="cs-wrap cs-sb cs-sb--login">
          <div className="cs-sb-gate cs-sb-gate--wait" />
        </div>
      }
    >
      <LoginView />
    </Suspense>
  )
}
