import type { Metadata } from 'next'
import { Toaster } from 'react-hot-toast'
import { Providers } from '@/lib/providers'
import { Navbar } from '@/components/layout/Navbar'
import './globals.css'

export const metadata: Metadata = {
  title: 'Farcaster ID Buy & Sell FIDs',
  description: 'The trustless marketplace for Farcaster IDs on Optimism.',
  keywords: ['farcaster', 'fid', 'marketplace', 'optimism', 'web3'],
  icons: {
    icon: '/favicon.png',
    apple: '/logo192.png',
  },
  openGraph: {
    title: 'Farcaster ID Marketplace',
    description: 'Buy and sell Farcaster IDs trustlessly on Optimism.',
    type: 'website',
    images: [{ url: '/logo.png', width: 512, height: 512 }],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.png" type="image/png" />
      </head>
      <body>
        <Providers>
          <div className="relative flex min-h-screen flex-col">
            <Navbar />
            <main className="flex-1 relative z-10">
              {children}
            </main>
            <footer className="border-t border-border py-8 mt-16 relative z-10">
              <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
                  <div className="flex items-center gap-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/logo.png" alt="Farcaster ID" className="h-6 w-6 rounded-full" />
                    <span className="text-sm font-semibold">Farcaster ID</span>
                    <span className="text-muted-foreground text-xs">Marketplace</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Deployed on Optimism. Powered by Farcaster Id Registry.
                  </p>
                </div>
              </div>
            </footer>
          </div>
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: 'hsl(222 16% 9%)',
                color: 'hsl(210 20% 94%)',
                border: '1px solid hsl(222 14% 16%)',
                borderRadius: '12px',
                fontSize: '13px',
                fontFamily: 'Syne, system-ui, sans-serif',
              },
              success: { iconTheme: { primary: '#8B5CF6', secondary: '#fff' } },
            }}
          />
        </Providers>
      </body>
    </html>
  )
}
