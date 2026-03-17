'use client'

import { PrivyProvider } from '@privy-io/react-auth'
import { WagmiProvider, createConfig } from '@privy-io/wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { optimism } from 'viem/chains'
import { http } from 'viem'

const wagmiConfig = createConfig({
  chains: [optimism],
  transports: { [optimism.id]: http('https://mainnet.optimism.io') },
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 10,   // 10 minutes
    },
  },
})

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId="cmm7a2knj05vt0blasxazskap"
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#8B5CF6',
          walletChainType: 'ethereum-only',
          walletList: ['metamask', 'rainbow', 'wallet_connect', 'coinbase_wallet'],
        },
        defaultChain: optimism,
        supportedChains: [optimism],
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig} reconnectOnMount={true}>
          {children}
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  )
}
