import type { ReactNode } from 'react'
import ConsumerProvider from '@/components/consumer/ConsumerProvider'
import SignupGate from '@/components/consumer/SignupGate'
import ConsumerShell from '@/components/consumer/ConsumerShell'
import ChatWidget from '@/components/consumer/ChatWidget'
import DiveHost from '@/components/consumer/dive/DiveHost'

export default function ConsumerLayout({ children }: { children: ReactNode }) {
  return (
    <ConsumerProvider>
      <SignupGate>
        <ConsumerShell>{children}</ConsumerShell>
        {/* 탐험은 어느 화면에서든 열린다. 홈에만 두었더니 공고 상세·목록에서 단추를
            눌러도 받는 곳이 없어 아무 일도 일어나지 않았다 */}
        <DiveHost />
        <ChatWidget />
      </SignupGate>
    </ConsumerProvider>
  )
}
