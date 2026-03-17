'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { usePrivy } from '@privy-io/react-auth'
import { useAccount, useReadContract } from 'wagmi'
import { cn, truncateAddress } from '@/lib/utils'
import { ID_REGISTRY_ABI, ID_REGISTRY_ADDRESS } from '@/lib/contract'
import { fetchProfileByFid, DEFAULT_PFP } from '@/lib/farcaster'
import type { FarcasterProfile } from '@/types'
import type { Address } from 'viem'

const NAV = [
  { href: '/',           label: 'Explore',  icon: <IconExplore /> },
  { href: '/marketplace',label: 'Listings', icon: <IconList /> },
  { href: '/profile',    label: 'Profile',  icon: <IconUser />, authRequired: true },
]

export function Navbar() {
  const pathname = usePathname()
  const { login, logout, authenticated } = usePrivy()
  const { address } = useAccount()
  const [profile, setProfile] = useState<FarcasterProfile | null>(null)
  const [scrolled, setScrolled] = useState(false)

  const { data: fid } = useReadContract({
    address: ID_REGISTRY_ADDRESS,
    abi: ID_REGISTRY_ABI,
    functionName: 'idOf',
    args: address ? [address as Address] : undefined,
    query: { enabled: !!address },
  })

  useEffect(() => {
    if (fid && Number(fid) > 0) fetchProfileByFid(Number(fid)).then(setProfile)
    else setProfile(null)
  }, [fid])

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 6)
    window.addEventListener('scroll', h)
    return () => window.removeEventListener('scroll', h)
  }, [])

  const fidNum = fid ? Number(fid) : 0

  return (
    <>
      {/* ─── Desktop Navbar ─── */}
      <header className={cn(
        'sticky top-0 z-50 w-full transition-all duration-300 hidden md:block',
        scrolled ? 'glass border-b border-border' : 'bg-transparent border-b border-transparent'
      )}>
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex items-center justify-between gap-6" style={{ height: 60 }}>

            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
              <img src="/logo.png" alt="FID" width={28} height={28}
                className="rounded-full ring-1 ring-primary/25 group-hover:ring-primary/55 transition-all" />
              <div className="flex flex-col leading-none">
                <span className="text-sm font-semibold tracking-tight">Farcaster ID</span>
                <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">Marketplace</span>
              </div>
            </Link>

            {/* Nav */}
            <nav className="flex items-center gap-1">
              {NAV.filter(n => !n.authRequired || authenticated).map(link => (
                <Link key={link.href} href={link.href}
                  className={cn(
                    'px-3.5 py-2 rounded-xl text-sm font-medium transition-colors',
                    pathname === link.href
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                  )}>
                  {link.label}
                </Link>
              ))}
            </nav>

            {/* Right */}
            <div className="flex items-center gap-2">
              {authenticated && address ? (
                <>
                  <Link href="/profile"
                    className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-1.5 hover:border-primary/30 hover:bg-muted transition-all">
                    <img
                      src={profile?.pfpUrl || DEFAULT_PFP}
                      alt=""
                      className="h-6 w-6 rounded-full object-cover ring-1 ring-primary/20"
                      onError={e => { (e.target as HTMLImageElement).src = DEFAULT_PFP }}
                    />
                    <span className="text-xs font-medium text-muted-foreground">
                      {profile?.username ? `@${profile.username}` : truncateAddress(address)}
                    </span>
                    {fidNum > 0 && <span className="fid-num text-[10px]">#{fidNum}</span>}
                  </Link>
                  <button onClick={() => logout()} className="btn-ghost text-xs px-3 py-1.5">
                    Disconnect
                  </button>
                </>
              ) : (
                <button onClick={() => login()} className="btn-primary text-xs px-4 py-2">
                  Connect Wallet
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ─── Mobile Top Bar ─── */}
      <header className={cn(
        'sticky top-0 z-50 w-full md:hidden transition-all duration-300',
        scrolled ? 'glass border-b border-border' : 'bg-transparent border-b border-transparent'
      )}>
        <div className="flex h-14 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo.png" alt="FID" width={26} height={26} className="rounded-full" />
            <span className="text-sm font-semibold">Farcaster ID</span>
          </Link>
          {authenticated && address ? (
            <Link href="/profile" className="flex items-center gap-1.5 rounded-xl border border-border bg-muted/40 px-2.5 py-1.5">
              <img
                src={profile?.pfpUrl || DEFAULT_PFP}
                alt=""
                className="h-5 w-5 rounded-full object-cover"
                onError={e => { (e.target as HTMLImageElement).src = DEFAULT_PFP }}
              />
              {fidNum > 0 && <span className="fid-num text-[10px]">#{fidNum}</span>}
            </Link>
          ) : (
            <button onClick={() => login()} className="btn-primary text-xs px-3 py-1.5">Connect</button>
          )}
        </div>
      </header>

      {/* ─── Mobile Bottom Nav ─── */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden glass border-t border-border">
        <div className="flex items-center justify-around px-2" style={{ paddingTop: 10, paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          {NAV.map(item => {
            const isActive = pathname === item.href
            if (item.authRequired && !authenticated) return (
              <button key={item.href} onClick={() => login()}
                className="flex flex-col items-center gap-1 px-4 py-1 text-muted-foreground">
                <span className="w-5 h-5">{item.icon}</span>
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            )
            return (
              <Link key={item.href} href={item.href}
                className={cn(
                  'flex flex-col items-center gap-1 px-4 py-1 rounded-xl transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                )}>
                <span className={cn('w-5 h-5 transition-transform', isActive && 'scale-110')}>{item.icon}</span>
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            )
          })}
          {/* Search shortcut */}
          <button
            onClick={() => document.getElementById('search-input')?.focus()}
            className="flex flex-col items-center gap-1 px-4 py-1 text-muted-foreground hover:text-foreground transition-colors">
            <span className="w-5 h-5"><IconSearch /></span>
            <span className="text-[10px] font-medium">Search</span>
          </button>
        </div>
      </nav>

      {/* Mobile bottom spacer */}
      <div className="md:hidden h-20" />
    </>
  )
}

function IconExplore() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="8"/><path d="M13.5 6.5l-2 4-4 2 2-4 4-2z"/>
    </svg>
  )
}
function IconList() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="14" height="3" rx="1.5"/><rect x="3" y="9" width="14" height="3" rx="1.5"/><rect x="3" y="14" width="9" height="3" rx="1.5"/>
    </svg>
  )
}
function IconUser() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="7" r="3.5"/><path d="M3 17c0-3.3 3.1-6 7-6s7 2.7 7 6"/>
    </svg>
  )
}
function IconSearch() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="9" r="5.5"/><path d="M16 16l-3-3"/>
    </svg>
  )
}