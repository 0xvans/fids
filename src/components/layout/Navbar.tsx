'use client'

import { useState, useEffect, useRef } from 'react'
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
  <ProfileDropdown
                    address={address}
                    profile={profile}
                    fidNum={fidNum}
                    onLogout={logout}
                  />
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

// ─── Profile Dropdown ─────────────────────────────────────────────────────────
function ProfileDropdown({ address, profile, fidNum, onLogout }: {
  address: string
  profile: any
  fidNum: number
  onLogout: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div className="relative" ref={ref}>
      {/* Avatar button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="relative flex items-center justify-center rounded-full ring-2 ring-border hover:ring-primary/40 transition-all"
      >
        <img
          src={profile?.pfpUrl || DEFAULT_PFP}
          alt=""
          className="h-8 w-8 rounded-full object-cover"
          onError={e => { (e.target as HTMLImageElement).src = DEFAULT_PFP }}
        />
        {fidNum > 0 && (
          <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-green-500 border-2 border-background" />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 animate-slide-down z-50">
          <div className="glass rounded-2xl border border-border overflow-hidden shadow-xl">
            {/* Profile info */}
            <div className="px-4 py-3 border-b border-border">
              <div className="flex items-center gap-3">
                <img
                  src={profile?.pfpUrl || DEFAULT_PFP}
                  alt=""
                  className="h-9 w-9 rounded-full object-cover shrink-0"
                  onError={e => { (e.target as HTMLImageElement).src = DEFAULT_PFP }}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {profile?.displayName || truncateAddress(address)}
                  </p>
                  {profile?.username && (
                    <p className="text-xs text-muted-foreground truncate">@{profile.username}</p>
                  )}
                  {fidNum > 0 && (
                    <p className="fid-num text-xs mt-0.5">#{fidNum.toLocaleString()}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="p-1.5 space-y-0.5">
              <Link
                href="/profile"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm hover:bg-muted/60 transition-colors w-full"
              >
                <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Profile
              </Link>
              {fidNum > 0 && (
                <Link
                  href={`/fid/${fidNum}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm hover:bg-muted/60 transition-colors w-full"
                >
                  <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a2 2 0 012-2z" />
                  </svg>
                  My FID #{fidNum}
                </Link>
              )}
              <button
                onClick={() => { onLogout(); setOpen(false) }}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-red-400 hover:bg-red-500/10 transition-colors w-full"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
