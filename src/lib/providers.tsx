'use client'

import { PrivyProvider } from '@privy-io/react-auth'
import { WagmiProvider, createConfig } from '@privy-io/wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { optimism } from 'viem/chains'
import { http } from 'viem'

const wagmiConfig = createConfig({
  chains: [optimism],
  transports: {
    [optimism.id]: http(process.env.NEXT_PUBLIC_OPTIMISM_RPC ?? 'https://mainnet.optimism.io'),
  },
})

const queryClient = new QueryClient()

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#8B5CF6',
          logo: '/logo.png',
          showWalletLoginFirst: true,
        },
        defaultChain: optimism,
        supportedChains: [optimism],
        loginMethods: ['wallet'],
        embeddedWallets: {
          createOnLogin: 'off',
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          {children}
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  )
}