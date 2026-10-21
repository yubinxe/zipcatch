import type { ReactNode } from 'react'
import ConsumerProvider from '@/components/consumer/ConsumerProvider'
import SignupGate from '@/components/consumer/SignupGate'
import ConsumerShell from '@/components/consumer/ConsumerShell'
import ChatWidget from '@/components/consumer/ChatWidget'
import ScrollProgress from '@/components/consumer/ScrollProgress'

export default function ConsumerLayout({ children }: { children: ReactNode }) {
  return (
    <ConsumerProvider>
      <SignupGate>
        <ScrollProgress />
        <ConsumerShell>{children}</ConsumerShell>
        <ChatWidget />
      </SignupGate>
    </ConsumerProvider>
  )
}
