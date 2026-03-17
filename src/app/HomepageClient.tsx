'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { usePrivy } from '@privy-io/react-auth'
import { useAccount } from 'wagmi'
import {
  fetchProfilesBatch, fetchProfileByFid, fetchFidStats,
  searchFids, truncateAddress, DEFAULT_PFP, type FidStats,
} from '@/lib/farcaster'
import { getActiveListings, getRecentTransactions, getTransactionsByAddress, supabase } from '@/lib/supabase'
import { formatEthDisplay, formatRelativeTime, cn } from '@/lib/utils'
import type { Listing, Transaction, FarcasterProfile } from '@/types'

type Tab = 'explore' | 'listings' | 'history'
type FilterType = 'all' | 'fixed' | 'auction'
type SortType = 'newest' | 'price_asc' | 'price_desc' | 'fid_asc'
type BrowseProfile = FarcasterProfile & Partial<FidStats>

// Combined history item
type HistoryItem =
  | { kind: 'tx';      data: Transaction; ts: number }
  | { kind: 'listing'; data: Listing & { profile: FarcasterProfile | null }; ts: number }

type Props = {
  listings: (Listing & { profile: FarcasterProfile | null })[]
}

const MAX_FID = 900_000

function randomFids(count: number): number[] {
  const set = new Set<number>()
  while (set.size < count) set.add(Math.floor(Math.random() * MAX_FID) + 1)
  return Array.from(set)
}

export function HomepageClient({ listings: initialListings }: Props) {
  const { login, authenticated } = usePrivy()
  const { address } = useAccount()

  const [tab, setTab]       = useState<Tab>('explore')
  const [filter, setFilter] = useState<FilterType>('all')
  const [sortBy, setSortBy] = useState<SortType>('newest')
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<FarcasterProfile[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [showSearch, setShowSearch] = useState(false)

  const [listings, setListings]       = useState(initialListings)
  const [exploreFids, setExploreFids] = useState<number[]>([])
  const [exploreMap, setExploreMap]   = useState<Map<number, BrowseProfile | null>>(new Map())
  const [exploreLoading, setExploreLoading] = useState(false)
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const exploreIntervalRef = useRef<ReturnType<typeof setInterval>>()

  // ── Fetch active listings ──────────────────────────────────────────────────
  const fetchListings = useCallback(async () => {
    const raw = await getActiveListings(48)
    const fids = raw.map(l => l.fid)
    const profileMap = await fetchProfilesBatch(fids)
    const statsResults = await Promise.allSettled(fids.map(fid => fetchFidStats(fid)))
    const enriched = raw.map((l, i) => {
      const profile = profileMap.get(l.fid) ?? null
      const stats = statsResults[i].status === 'fulfilled' ? statsResults[i].value : { followerCount: 0, followingCount: 0 }
      return { ...l, profile: profile ? { ...profile, ...stats } : null }
    })
    setListings(enriched)
  }, [])



  // ── Build combined history ─────────────────────────────────────────────────
  const buildHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      // Fetch txs and listings in parallel
      const [txs, lstRes] = await Promise.all([
        getRecentTransactions(50),
        supabase.from('listings').select('*').order('created_at', { ascending: false }).limit(100),
      ])

      const lsts = lstRes.data ?? []

      // Batch fetch profiles for all listing FIDs at once
      const fids = Array.from(new Set(lsts.map((l: any) => l.fid)))
      const profileMap = fids.length > 0 ? await fetchProfilesBatch(fids) : new Map()

      const items: HistoryItem[] = [
        ...txs.map(tx => ({ kind: 'tx' as const, data: tx, ts: new Date(tx.created_at).getTime() })),
        ...lsts.map((l: any) => ({
          kind: 'listing' as const,
          data: { ...l, profile: profileMap.get(l.fid) ?? null },
          ts: new Date(l.created_at).getTime(),
        })),
      ]

      items.sort((a, b) => b.ts - a.ts)
      setHistoryItems(items)
    } catch (e) {
      console.error('[buildHistory]', e)
    }
    setHistoryLoading(false)
  }, [])

  // ── Supabase Realtime ──────────────────────────────────────────────────────
  useEffect(() => {
    fetchListings()
    const channel = supabase
      .channel('listings-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'listings' }, () => {
        fetchListings()
        if (tab === 'history') buildHistory()
      })
      .subscribe()
    const poll = setInterval(fetchListings, 5_000)
    return () => { supabase.removeChannel(channel); clearInterval(poll) }
  }, [fetchListings, tab, buildHistory])

  useEffect(() => {
    const channel = supabase
      .channel('transactions-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions' }, () => {
        buildHistory()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [buildHistory])

  // ── Explore ────────────────────────────────────────────────────────────────
  const loadExplore = useCallback(async (fids?: number[]) => {
    setExploreLoading(true)
    const ids = fids ?? randomFids(24)
    setExploreFids(ids)
    const profileMap = await fetchProfilesBatch(ids)
    const statsResults = await Promise.allSettled(ids.map(fid => fetchFidStats(fid)))
    const enriched = new Map<number, BrowseProfile | null>()
    ids.forEach((fid, i) => {
      const p = profileMap.get(fid) ?? null
      const s = statsResults[i].status === 'fulfilled' ? statsResults[i].value : { followerCount: 0, followingCount: 0 }
      enriched.set(fid, p ? { ...p, ...s } : null)
    })
    setExploreMap(enriched)
    setExploreLoading(false)
  }, [])

  useEffect(() => {
    loadExplore()
    buildHistory()
    exploreIntervalRef.current = setInterval(() => loadExplore(), 120_000)
    return () => clearInterval(exploreIntervalRef.current)
  }, []) // eslint-disable-line

  // ── Search ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return }
    const t = setTimeout(async () => {
      setSearchLoading(true)
      const res = await searchFids(search.trim())
      setSearchResults(res)
      setSearchLoading(false)
    }, 350)
    return () => clearTimeout(t)
  }, [search])

  const filteredListings = listings
    .filter(l => filter === 'all' || l.listing_type === filter)
    .sort((a, b) => {
      if (sortBy === 'price_asc')  return parseFloat(a.price) - parseFloat(b.price)
      if (sortBy === 'price_desc') return parseFloat(b.price) - parseFloat(a.price)
      if (sortBy === 'fid_asc')    return a.fid - b.fid
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

  const totalVolume  = listings.reduce((s, l) => s + parseFloat(l.price || '0'), 0)
  const auctionCount = listings.filter(l => l.listing_type === 'auction').length
  const lastTx       = historyItems.find(h => h.kind === 'tx')
  const lastSaleAmount = lastTx?.kind === 'tx' ? lastTx.data.amount : null
  const lastSaleFid    = lastTx?.kind === 'tx' ? lastTx.data.fid : null

  return (
    <div className="relative min-h-screen">

      {/* Ticker */}
      {listings.length > 0 && (
        <div className="border-b border-border bg-card/50 overflow-hidden py-2">
          <div className="marquee-track">
            {[...listings, ...listings].map((l, i) => (
              <Link key={i} href={`/fid/${l.fid}`} className="inline-flex items-center gap-2 px-4 whitespace-nowrap group">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500/80 shrink-0" />
                <span className="fid-num text-xs">#{l.fid}</span>
                {l.profile?.username && <span className="text-xs text-muted-foreground">@{l.profile.username}</span>}
                <span className="text-xs font-semibold">{formatEthDisplay(l.price)}</span>
                <span className="mx-3 text-border">·</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* Hero */}
        <section className="py-10 sm:py-14 text-center relative">
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute left-1/2 top-0 h-96 w-[600px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-primary/5 blur-3xl" />
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3.5 py-1 mb-5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-medium text-primary">Optimism Mainnet</span>
          </div>
          <h1 className="text-4xl sm:text-6xl font-semibold tracking-tight leading-tight mb-3">
            Buy &amp; Sell <span className="text-gradient-primary">Farcaster IDs</span>
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-sm mx-auto mb-6">
            Every FID. Fixed price, offers, and auctions — all on-chain.
          </p>
          {!authenticated && (
            <button onClick={() => login()} className="btn-primary px-7 py-3">Connect Wallet</button>
          )}
        </section>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <StatCard label="Listings" value={listings.length.toString()} />
          <StatCard label="Volume" value={`${totalVolume.toFixed(3)} ETH`} accent />
          <StatCard label="Auctions" value={auctionCount.toString()} />
          <StatCard
            label="Last Sale"
            value={lastSaleAmount ? formatEthDisplay(lastSaleAmount) : '—'}
            sub={lastSaleFid ? `FID #${lastSaleFid}` : 'No sales yet'}
          />
        </div>

        {/* Tabs + Search + Controls */}
        <div className="flex flex-col gap-3 mb-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex gap-1 bg-muted/60 rounded-2xl p-1">
              {([
                { id: 'explore'  as Tab, label: 'Explore' },
                { id: 'listings' as Tab, label: `For Sale${listings.length > 0 ? ` (${listings.length})` : ''}` },
                { id: 'history'  as Tab, label: 'History' },
              ]).map(t => (
                <button key={t.id}
                  onClick={() => { setTab(t.id); setShowSearch(false); setSearch(''); if (t.id === 'history') buildHistory() }}
                  className={cn(
                    'px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150 whitespace-nowrap',
                    tab === t.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  )}>
                  {t.label}
                </button>
              ))}
            </div>

            <button
              onClick={() => { setShowSearch(v => !v); setTimeout(() => document.getElementById('search-input')?.focus(), 50) }}
              className={cn('btn-secondary gap-2 text-sm', showSearch && 'border-primary/40 text-primary')}>
              <IconSearch />
              Search FID
            </button>

            <div className="flex items-center gap-2 sm:ml-auto flex-wrap">
              {tab === 'listings' && (
                <>
                  <div className="flex gap-1">
                    {(['all','fixed','auction'] as FilterType[]).map(f => (
                      <button key={f} onClick={() => setFilter(f)}
                        className={cn('px-3 py-1.5 rounded-xl text-xs font-medium capitalize transition-colors',
                          filter === f ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground')}>
                        {f}
                      </button>
                    ))}
                  </div>
                  <select value={sortBy} onChange={e => setSortBy(e.target.value as SortType)} className="input w-auto text-xs py-1.5 px-2.5 cursor-pointer">
                    <option value="newest">Newest</option>
                    <option value="price_asc">Price: Low</option>
                    <option value="price_desc">Price: High</option>
                    <option value="fid_asc">FID: Low</option>
                  </select>
                </>
              )}
              {tab === 'explore' && (
                <button onClick={() => loadExplore()} className="btn-secondary text-xs gap-1.5">
                  <IconShuffle /> Shuffle
                </button>
              )}
            </div>
          </div>

          {/* Search panel */}
          {showSearch && (
            <div className="animate-slide-down">
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center">
                  {searchLoading
                    ? <svg className="h-4 w-4 animate-spin text-muted-foreground" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    : <IconSearch className="h-4 w-4 text-muted-foreground" />}
                </div>
                <input id="search-input" type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="FID number or @username..." className="input pl-10" />
              </div>
              {search.trim() && (
                <div className="mt-2">
                  {searchLoading ? (
                    <div className="space-y-2">{[1,2].map(i => <div key={i} className="skeleton h-16 rounded-2xl" />)}</div>
                  ) : searchResults.length === 0 ? (
                    <div className="card px-5 py-4 text-center"><p className="text-sm text-muted-foreground">No results for "{search}"</p></div>
                  ) : (
                    <div className="card overflow-hidden divide-y divide-border">
                      {searchResults.map(p => (
                        <Link key={p.fid} href={`/fid/${p.fid}`} onClick={() => { setShowSearch(false); setSearch('') }}
                          className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/40 transition-colors">
                          <Avatar pfpUrl={p.pfpUrl} displayName={p.displayName} fid={p.fid} size={40} />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">{p.displayName || `FID ${p.fid}`}</p>
                            <p className="text-xs text-muted-foreground">{p.username ? `@${p.username}` : truncateAddress(p.ethAddress || '')}</p>
                          </div>
                          <span className="fid-num text-sm shrink-0">#{p.fid}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Explore ── */}
        {tab === 'explore' && (
          <div className="pb-10">
            {exploreLoading ? <GridSkeleton /> : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {exploreFids.map(fid => (
                  <FidCard key={fid} fid={fid} profile={exploreMap.get(fid) ?? null} listing={listings.find(l => l.fid === fid) ?? null} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── For Sale ── */}
        {tab === 'listings' && (
          <div className="pb-10">
            {filteredListings.length === 0 ? (
              <Empty title="No listings" body={filter === 'all' ? 'No FIDs listed for sale yet.' : `No ${filter} listings.`} />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {filteredListings.map(l => (
                  <FidCard key={l.fid} fid={l.fid} profile={l.profile ?? null} listing={l} showPrice />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── History ── */}
        {tab === 'history' && (
          <div className="pb-10">
            {historyLoading && historyItems.length === 0 ? (
              <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="skeleton h-14 rounded-2xl" />)}</div>
            ) : historyItems.length === 0 ? (
              <Empty title="No history yet" body="Listings, sales, and cancellations appear here." />
            ) : (
              <div className="card overflow-hidden divide-y divide-border">
                {/* Header */}
                <div className="hidden sm:grid grid-cols-12 gap-3 px-5 py-2.5 bg-muted/30">
                  <span className="col-span-2 stat-label">Event</span>
                  <span className="col-span-2 stat-label">FID</span>
                  <span className="col-span-3 stat-label">Identity</span>
                  <span className="col-span-2 stat-label">Amount</span>
                  <span className="col-span-3 stat-label">Time</span>
                </div>
                {historyItems.map((item, i) => (
                  item.kind === 'tx'
                    ? <TxHistoryRow key={`tx-${item.data.id}`} tx={item.data} myAddress={address ?? ''} />
                    : <ListingHistoryRow key={`lst-${item.data.id}`} listing={item.data} />
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}

// ─── History Rows ─────────────────────────────────────────────────────────────

function TxHistoryRow({ tx, myAddress }: { tx: Transaction; myAddress: string }) {
  const isBuy = myAddress && tx.buyer.toLowerCase() === myAddress.toLowerCase()
  return (
    <a href={`https://optimistic.etherscan.io/tx/${tx.tx_hash}`} target="_blank" rel="noopener noreferrer"
      className="grid grid-cols-12 gap-3 px-5 py-3.5 items-center hover:bg-muted/20 transition-colors">
      <span className="col-span-2">
        <span className={cn('badge text-[10px]',
          isBuy ? 'bg-sky-500/10 text-sky-400' : 'bg-green-500/10 text-green-400')}>
          {isBuy ? 'Bought' : 'Sold'}
        </span>
      </span>
      <span className="col-span-2 fid-num text-sm">#{tx.fid}</span>
      <span className="col-span-3 font-mono text-xs text-muted-foreground truncate">
        {truncateAddress(isBuy ? tx.seller : tx.buyer)}
      </span>
      <span className="col-span-2 font-semibold text-sm">{formatEthDisplay(tx.amount)}</span>
      <span className="col-span-3 text-xs text-muted-foreground">{formatRelativeTime(tx.created_at)}</span>
    </a>
  )
}

function ListingHistoryRow({ listing }: { listing: Listing & { profile: FarcasterProfile | null } }) {
  const statusColor = {
    active:    'bg-green-500/10 text-green-400',
    sold:      'bg-primary/10 text-primary',
    cancelled: 'bg-muted text-muted-foreground',
  }[listing.status] ?? 'bg-muted text-muted-foreground'

  const eventLabel = {
    active:    'Listed',
    sold:      'Sold',
    cancelled: 'Cancelled',
  }[listing.status] ?? listing.status

  return (
    <Link href={`/fid/${listing.fid}`}
      className="grid grid-cols-12 gap-3 px-5 py-3.5 items-center hover:bg-muted/20 transition-colors">
      <span className="col-span-2">
        <span className={cn('badge text-[10px]', statusColor)}>{eventLabel}</span>
      </span>
      <span className="col-span-2 fid-num text-sm">#{listing.fid}</span>
      <div className="col-span-3 flex items-center gap-2 min-w-0">
        <Avatar pfpUrl={listing.profile?.pfpUrl} displayName={listing.profile?.displayName} fid={listing.fid} size={20} />
        <span className="text-xs text-muted-foreground truncate">
          {listing.profile?.username ? `@${listing.profile.username}` : truncateAddress(listing.seller)}
        </span>
      </div>
      <span className="col-span-2 font-semibold text-sm">{formatEthDisplay(listing.price)}</span>
      <span className="col-span-3 text-xs text-muted-foreground">{formatRelativeTime(listing.created_at)}</span>
    </Link>
  )
}

// ─── FID Card ─────────────────────────────────────────────────────────────────
function FidCard({ fid, profile, listing, showPrice }: {
  fid: number; profile: BrowseProfile | null; listing: Listing | null; showPrice?: boolean
}) {
  const isListed    = listing?.status === 'active'
  const displayName = profile?.displayName || `FID ${fid}`
  const followers   = profile?.followerCount
  const following   = profile?.followingCount

  return (
    <Link href={`/fid/${fid}`} className="card-hover group flex flex-col overflow-hidden">
      {isListed ? <div className="h-0.5 bg-primary/70 rounded-t-2xl" /> : <div className="h-0.5 bg-border rounded-t-2xl" />}
      <div className="p-3.5 flex flex-col gap-2 flex-1">
        <div className="flex items-center justify-between">
          <span className="fid-num text-xs">#{fid}</span>
          {isListed ? <span className="badge-active text-[10px] px-1.5 py-0.5">Sale</span> : <span className="h-1 w-1 rounded-full bg-border" />}
        </div>
        <div className="flex justify-center">
          <Avatar pfpUrl={profile?.pfpUrl} displayName={displayName} fid={fid} size={48}
            className="ring-2 ring-border group-hover:ring-primary/30 transition-all" />
        </div>
        <div className="text-center min-w-0 w-full">
          <p className="text-xs font-medium truncate leading-snug">{displayName}</p>
          {profile?.username
            ? <p className="text-[10px] text-muted-foreground truncate">@{profile.username}</p>
            : <p className="text-[10px] text-muted-foreground">—</p>}
        </div>
        {((followers ?? 0) > 0 || (following ?? 0) > 0) && (
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {(followers ?? 0) > 0 && (
              <span className="text-[10px] text-muted-foreground">
                <span className="font-medium text-foreground">{fmtCount(followers!)}</span> followers
              </span>
            )}
            {(followers ?? 0) > 0 && (following ?? 0) > 0 && <span className="text-[10px] text-border">·</span>}
            {(following ?? 0) > 0 && (
              <span className="text-[10px] text-muted-foreground">
                <span className="font-medium text-foreground">{fmtCount(following!)}</span> following
              </span>
            )}
          </div>
        )}
        {isListed && listing && (
          <p className="text-center text-xs font-semibold text-primary mt-auto pt-1">{formatEthDisplay(listing.price)}</p>
        )}
      </div>
    </Link>
  )
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n/1_000).toFixed(1)}k`
  return n.toString()
}

function StatCard({ label, value, accent, sub }: { label: string; value: string; accent?: boolean; sub?: string }) {
  return (
    <div className={cn('card p-4', accent && 'border-primary/20 bg-primary/5')}>
      <p className="stat-label mb-1.5">{label}</p>
      <p className={cn('text-xl font-semibold', accent ? 'text-gradient-primary' : '')}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

function Avatar({ pfpUrl, displayName, fid, size = 40, className = '' }: {
  pfpUrl?: string; displayName?: string; fid: number; size?: number; className?: string
}) {
  return (
    <img src={pfpUrl || DEFAULT_PFP} alt={displayName || `FID ${fid}`} width={size} height={size}
      className={cn('rounded-full object-cover shrink-0', className)} style={{ width: size, height: size }}
      onError={e => { (e.target as HTMLImageElement).src = DEFAULT_PFP }} />
  )
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
      {Array.from({ length: 24 }).map((_, i) => (
        <div key={i} className="card p-3.5 space-y-2.5">
          <div className="skeleton h-3 w-8 rounded" />
          <div className="skeleton h-12 w-12 rounded-full mx-auto" />
          <div className="skeleton h-2.5 w-full rounded" />
          <div className="skeleton h-2 w-14 rounded mx-auto" />
        </div>
      ))}
    </div>
  )
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-2">
      <div className="h-12 w-12 rounded-2xl bg-muted border border-border mb-2" />
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground max-w-xs">{body}</p>
    </div>
  )
}

function IconSearch({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
    </svg>
  )
}

function IconShuffle() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 3h5v5M4 20L21 3M16 21h5v-5M4 4l5 5" />
    </svg>
  )
}