'use client'

import { useEffect, useState, useCallback } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useAccount, useBalance, useReadContract } from 'wagmi'
import { optimism } from 'viem/chains'
import { formatEther, type Address } from 'viem'
import Link from 'next/link'
import { ID_REGISTRY_ABI, ID_REGISTRY_ADDRESS } from '@/lib/contract'
import { fetchProfileByFid, fetchFidStats, fetchProfilesBatch, truncateAddress, DEFAULT_PFP, type FidStats } from '@/lib/farcaster'
import { getListingsByAddress, getTransactionsByAddress, getOffersByAddress, supabase } from '@/lib/supabase'
import { formatEthDisplay, formatRelativeTime, cn } from '@/lib/utils'
import type { FarcasterProfile, Listing, Transaction, Offer } from '@/types'

type BrowseProfile = FarcasterProfile & Partial<FidStats>
type TabType = 'listings' | 'owned' | 'offers' | 'history'

export default function ProfilePage() {
  const { login, authenticated, ready } = usePrivy()
  const { address } = useAccount()

  const [profile, setProfile]             = useState<BrowseProfile | null>(null)
  const [listings, setListings]           = useState<Listing[]>([])
  const [transactions, setTransactions]   = useState<Transaction[]>([])
  const [offers, setOffers]               = useState<Offer[]>([])
  const [ownedFids, setOwnedFids]         = useState<number[]>([])
  const [ownedProfiles, setOwnedProfiles] = useState<Map<number, BrowseProfile | null>>(new Map())
  const [ownedLoading, setOwnedLoading]   = useState(false)
  const [activeTab, setActiveTab]         = useState<TabType>('listings')
  const [loading, setLoading]             = useState(true)

  const { data: ethBalance } = useBalance({
    address: address as Address,
    chainId: optimism.id,
    query: { enabled: !!address, refetchInterval: 15_000 },
  })

  // Read FID on-chain
  const { data: fidRaw } = useReadContract({
    address: ID_REGISTRY_ADDRESS,
    abi: ID_REGISTRY_ABI,
    functionName: 'idOf',
    args: address ? [address as Address] : undefined,
    query: { enabled: !!address, refetchInterval: 15_000 },
  })

  const fidNum = fidRaw ? Number(fidRaw) : 0

  // ── Fetch profile + supabase data ──────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (!address) return
    const currentFid = fidRaw ? Number(fidRaw) : 0
    const [prof, st, lsts, txs, offs] = await Promise.all([
      currentFid > 0 ? fetchProfileByFid(currentFid) : Promise.resolve(null),
      currentFid > 0 ? fetchFidStats(currentFid) : Promise.resolve({ followerCount: 0, followingCount: 0 }),
      getListingsByAddress(address),
      getTransactionsByAddress(address),
      getOffersByAddress(address),
    ])
    setProfile(prof ? { ...prof, ...st } : null)
    setListings(lsts)
    setTransactions(txs)
    setOffers(offs)
    setLoading(false)
  }, [address, fidRaw])

  // ── Fetch owned FIDs ───────────────────────────────────────────────────────
  const fetchOwned = useCallback(async (lsts: Listing[], txs: Transaction[]) => {
    if (!address) return
    setOwnedLoading(true)
    const currentFid = fidRaw ? Number(fidRaw) : 0
    const allOwned: number[] = []

    // 1. On-chain FID
    if (currentFid > 0) allOwned.push(currentFid)

    // 2. Bought via marketplace (minus sold)
    const sold = new Set(txs.filter(tx => tx.seller.toLowerCase() === address.toLowerCase()).map(tx => tx.fid))
    for (const tx of txs.filter(tx => tx.buyer.toLowerCase() === address.toLowerCase())) {
      if (!sold.has(tx.fid)) allOwned.push(tx.fid)
    }

    // 3. Active listings (still owned)
    for (const l of lsts.filter(l => l.status === 'active')) allOwned.push(l.fid)

    const unique = Array.from(new Set(allOwned))
    setOwnedFids(unique)

    if (unique.length > 0) {
      const profileMap = await fetchProfilesBatch(unique)
      const enriched = new Map<number, BrowseProfile | null>()
      profileMap.forEach((p, f) => {
        enriched.set(f, p as BrowseProfile | null)
      })
      setOwnedProfiles(enriched)
    }
    setOwnedLoading(false)
  }, [address, fidRaw])

  useEffect(() => {
    if (!address) return
    fetchAll()
  }, [fetchAll])

  // Once listings/txs are loaded, compute owned
  useEffect(() => {
    if (listings.length > 0 || transactions.length > 0 || fidNum > 0) {
      fetchOwned(listings, transactions)
    }
  }, [listings, transactions, fidNum]) // eslint-disable-line

  // ── Supabase Realtime ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!address) return
    const addr = address.toLowerCase()

    const ch1 = supabase
      .channel(`prof-lst-${addr}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'listings', filter: `seller=eq.${addr}` }, () => {
        getListingsByAddress(address).then(setListings)
      })
      .subscribe()

    const ch2 = supabase
      .channel(`prof-txs-${addr}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions' }, () => {
        getTransactionsByAddress(address).then(setTransactions)
      })
      .subscribe()

    const ch3 = supabase
      .channel(`prof-offers-${addr}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'offers', filter: `buyer=eq.${addr}` }, () => {
        getOffersByAddress(address).then(setOffers)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(ch1)
      supabase.removeChannel(ch2)
      supabase.removeChannel(ch3)
    }
  }, [address])

  if (!ready) return null

  if (!authenticated || !address) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-5 px-4 text-center">
        <div className="h-16 w-16 rounded-2xl bg-muted border border-border flex items-center justify-center mb-2">
          <svg className="h-7 w-7 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-semibold mb-2">Your Profile</h1>
          <p className="text-sm text-muted-foreground mb-5 max-w-xs">Connect wallet to view your identity, balances, and history.</p>
          <button onClick={() => login()} className="btn-primary px-7 py-2.5">Connect Wallet</button>
        </div>
      </div>
    )
  }

  const ethFmt = ethBalance ? parseFloat(formatEther(ethBalance.value)).toFixed(6) : '—'
  const activeListings = listings.filter(l => l.status === 'active')
  const totalSold    = listings.filter(l => l.status === 'sold').length
  const totalBought  = transactions.filter(tx => tx.buyer.toLowerCase() === address.toLowerCase()).length

  type HistoryItem =
    | { kind: 'listing'; data: Listing; ts: number }
    | { kind: 'tx';      data: Transaction; ts: number }

  const historyItems: HistoryItem[] = [
    ...listings.map(l  => ({ kind: 'listing' as const, data: l,  ts: new Date(l.created_at).getTime() })),
    ...transactions.map(tx => ({ kind: 'tx' as const,      data: tx, ts: new Date(tx.created_at).getTime() })),
  ].sort((a, b) => b.ts - a.ts)

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8 pb-24 md:pb-8">

      {/* ── Header ── */}
      <div className="card p-5 mb-5 animate-fade-in">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="relative shrink-0">
            <img
              src={profile?.pfpUrl || DEFAULT_PFP}
              alt={profile?.displayName || 'Profile'}
              className="h-16 w-16 rounded-full object-cover ring-4 ring-border"
              onError={e => { (e.target as HTMLImageElement).src = DEFAULT_PFP }}
            />
            <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-green-500 border-2 border-card" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold mb-0.5">
              {profile?.displayName || (fidNum > 0 ? `FID #${fidNum.toLocaleString()}` : truncateAddress(address))}
            </h1>
            {profile?.username && <p className="text-sm text-muted-foreground mb-1">@{profile.username}</p>}
            <p className="font-mono text-xs text-muted-foreground truncate">{address}</p>
            {((profile?.followerCount ?? 0) > 0 || (profile?.followingCount ?? 0) > 0) && (
              <div className="flex items-center gap-3 mt-2">
                <span className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{fmt(profile?.followerCount ?? 0)}</span> followers
                </span>
                <span className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{fmt(profile?.followingCount ?? 0)}</span> following
                </span>
              </div>
            )}
          </div>
          {fidNum > 0 && (
            <Link href={`/fid/${fidNum}`} className="shrink-0">
              <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-center hover:border-primary/60 transition-colors">
                <p className="stat-label mb-0.5">Your FID</p>
                <p className="fid-num text-2xl">#{fidNum.toLocaleString()}</p>
              </div>
            </Link>
          )}
        </div>
        <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div><p className="stat-label mb-1">ETH on Optimism</p><p className="font-mono text-base font-semibold">{ethFmt}</p></div>
          <div><p className="stat-label mb-1">Active Listings</p><p className="text-lg font-semibold">{activeListings.length}</p></div>
          <div><p className="stat-label mb-1">Total Sold</p><p className="text-lg font-semibold">{totalSold}</p></div>
          <div><p className="stat-label mb-1">Total Bought</p><p className="text-lg font-semibold">{totalBought}</p></div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-muted/60 rounded-2xl p-1 mb-5 overflow-x-auto no-scrollbar">
        {([
          { id: 'listings' as TabType, label: `Listings (${activeListings.length})` },
          { id: 'owned'    as TabType, label: `Owned (${ownedFids.length})` },
          { id: 'offers'   as TabType, label: `Offers (${offers.length})` },
          { id: 'history'  as TabType, label: `History (${historyItems.length})` },
        ]).map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150 whitespace-nowrap',
              activeTab === tab.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card p-3.5 space-y-2.5">
              <div className="skeleton h-3 w-8 rounded" />
              <div className="skeleton h-12 w-12 rounded-full mx-auto" />
              <div className="skeleton h-2.5 w-full rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="animate-fade-in">

          {/* Listings: active only */}
          {activeTab === 'listings' && (
            activeListings.length === 0 ? (
              <Empty title="No active listings" body="FIDs you list for sale appear here"
                action={fidNum > 0 ? { href: `/fid/${fidNum}`, label: 'List My FID' } : undefined} />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {activeListings.map(l => <ListingCard key={l.id} listing={l} />)}
              </div>
            )
          )}

          {/* Owned FIDs */}
          {activeTab === 'owned' && (
            ownedLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="card p-3.5 space-y-2.5">
                    <div className="skeleton h-3 w-8 rounded" />
                    <div className="skeleton h-12 w-12 rounded-full mx-auto" />
                    <div className="skeleton h-2.5 w-full rounded" />
                  </div>
                ))}
              </div>
            ) : ownedFids.length === 0 ? (
              <Empty title="No owned FIDs" body="FIDs you own will appear here" />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {ownedFids.map(f => (
                  <OwnedCard key={f} fid={f}
                    profile={ownedProfiles.get(f) ?? null}
                    listing={listings.find(l => l.fid === f && l.status === 'active') ?? null}
                  />
                ))}
              </div>
            )
          )}

          {/* Offers */}
          {activeTab === 'offers' && (
            offers.length === 0 ? (
              <Empty title="No offers" body="Offers you make appear here" />
            ) : (
              <div className="card overflow-hidden divide-y divide-border">
                {offers.map(o => <OfferRow key={o.id} offer={o} />)}
              </div>
            )
          )}

          {/* History: all listings + all txs combined */}
          {activeTab === 'history' && (
            historyItems.length === 0 ? (
              <Empty title="No history" body="Your listings, sales, and cancellations appear here" />
            ) : (
              <div className="card overflow-hidden divide-y divide-border">
                <div className="hidden sm:grid grid-cols-12 gap-3 px-5 py-2.5 bg-muted/30">
                  <span className="col-span-2 stat-label">Event</span>
                  <span className="col-span-2 stat-label">FID</span>
                  <span className="col-span-3 stat-label">Detail</span>
                  <span className="col-span-2 stat-label">Amount</span>
                  <span className="col-span-3 stat-label">Time</span>
                </div>
                {historyItems.map(item =>
                  item.kind === 'listing'
                    ? <ListingHistoryRow key={`l-${item.data.id}`} listing={item.data} />
                    : <TxHistoryRow key={`t-${item.data.id}`} tx={item.data} address={address} />
                )}
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}

// ─── Listing Card (active) ────────────────────────────────────────────────────
function ListingCard({ listing }: { listing: Listing }) {
  const [profile, setProfile] = useState<FarcasterProfile | null>(null)
  useEffect(() => { fetchProfileByFid(listing.fid).then(setProfile) }, [listing.fid])
  return (
    <Link href={`/fid/${listing.fid}`} className="card-hover group flex flex-col overflow-hidden">
      <div className="h-0.5 bg-primary/70 rounded-t-2xl" />
      <div className="p-3.5 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="fid-num text-xs">#{listing.fid.toLocaleString()}</span>
          <span className="badge-active text-[10px] px-1.5 py-0.5">Active</span>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <img src={profile?.pfpUrl || DEFAULT_PFP} alt={`FID ${listing.fid}`}
            className="h-12 w-12 rounded-full object-cover ring-2 ring-border group-hover:ring-primary/30 transition-all"
            onError={e => { (e.target as HTMLImageElement).src = DEFAULT_PFP }} />
          <p className="text-xs font-medium truncate w-full text-center">{profile?.displayName || `FID ${listing.fid}`}</p>
          {profile?.username && <p className="text-[10px] text-muted-foreground truncate w-full text-center">@{profile.username}</p>}
        </div>
        <p className="text-center text-xs font-semibold text-primary">{formatEthDisplay(listing.price)}</p>
        <p className="text-center text-[10px] text-muted-foreground">{formatRelativeTime(listing.created_at)}</p>
      </div>
    </Link>
  )
}

// ─── Owned Card ───────────────────────────────────────────────────────────────
function OwnedCard({ fid, profile, listing }: {
  fid: number; profile: BrowseProfile | null; listing: Listing | null
}) {
  const isListed = listing?.status === 'active'
  return (
    <div className="card-hover group flex flex-col overflow-hidden">
      {isListed
        ? <div className="h-0.5 bg-primary/70 rounded-t-2xl" />
        : <div className="h-0.5 bg-border rounded-t-2xl" />
      }
      <div className="p-3.5 flex flex-col gap-2 flex-1">
        <div className="flex items-center justify-between">
          <span className="fid-num text-xs">#{fid.toLocaleString()}</span>
          {isListed
            ? <span className="badge-active text-[10px] px-1.5 py-0.5">Sale</span>
            : <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-medium">Owned</span>
          }
        </div>
        <Link href={`/fid/${fid}`} className="flex flex-col items-center gap-1.5">
          <img src={profile?.pfpUrl || DEFAULT_PFP} alt={`FID ${fid}`}
            className="h-12 w-12 rounded-full object-cover ring-2 ring-border group-hover:ring-primary/30 transition-all"
            onError={e => { (e.target as HTMLImageElement).src = DEFAULT_PFP }} />
          <p className="text-xs font-medium truncate w-full text-center">{profile?.displayName || `FID ${fid}`}</p>
          {profile?.username && <p className="text-[10px] text-muted-foreground truncate w-full text-center">@{profile.username}</p>}
        </Link>
        {(profile?.followerCount ?? 0) > 0 && (
          <p className="text-center text-[10px] text-muted-foreground">{fmt(profile!.followerCount!)} followers</p>
        )}
        {isListed && listing && (
          <p className="text-center text-xs font-semibold text-primary">{formatEthDisplay(listing.price)}</p>
        )}
        <div className="mt-auto pt-1">
          <Link href={`/fid/${fid}`}
            className={cn(
              'block w-full text-center text-[10px] font-semibold py-1.5 rounded-lg transition-colors',
              isListed
                ? 'bg-muted hover:bg-muted/70 text-muted-foreground'
                : 'bg-primary/10 hover:bg-primary/20 text-primary'
            )}>
            {isListed ? 'Manage Listing' : 'List for Sale'}
          </Link>
        </div>
      </div>
    </div>
  )
}

// ─── Offer Row ────────────────────────────────────────────────────────────────
function OfferRow({ offer }: { offer: Offer }) {
  return (
    <Link href={`/fid/${offer.fid}`}
      className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-muted/20 transition-colors">
      <div className="flex items-center gap-3">
        <span className="fid-num text-sm">#{offer.fid.toLocaleString()}</span>
        <span className={offer.status === 'pending' ? 'badge-offer' : 'badge-cancelled'}>{offer.status}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-semibold text-sm">{formatEthDisplay(offer.amount)}</span>
        <span className="text-xs text-muted-foreground">{formatRelativeTime(offer.created_at)}</span>
      </div>
    </Link>
  )
}

// ─── History Rows ─────────────────────────────────────────────────────────────
function ListingHistoryRow({ listing }: { listing: Listing }) {
  const label = { active: 'Listed', sold: 'Sold', cancelled: 'Cancelled' }[listing.status] ?? listing.status
  const color = {
    active:    'bg-green-500/10 text-green-400',
    sold:      'bg-primary/10 text-primary',
    cancelled: 'bg-muted text-muted-foreground',
  }[listing.status] ?? 'bg-muted text-muted-foreground'

  return (
    <Link href={`/fid/${listing.fid}`}
      className="grid grid-cols-12 gap-3 px-5 py-3.5 items-center hover:bg-muted/20 transition-colors">
      <span className="col-span-2"><span className={cn('badge text-[10px]', color)}>{label}</span></span>
      <span className="col-span-2 fid-num text-sm">#{listing.fid}</span>
      <span className="col-span-3 text-xs text-muted-foreground capitalize">{listing.listing_type} price</span>
      <span className="col-span-2 font-semibold text-sm">{formatEthDisplay(listing.price)}</span>
      <span className="col-span-3 text-xs text-muted-foreground">{formatRelativeTime(listing.created_at)}</span>
    </Link>
  )
}

function TxHistoryRow({ tx, address }: { tx: Transaction; address: string }) {
  const isBuy = tx.buyer.toLowerCase() === address.toLowerCase()
  return (
    <a href={`https://optimistic.etherscan.io/tx/${tx.tx_hash}`} target="_blank" rel="noopener noreferrer"
      className="grid grid-cols-12 gap-3 px-5 py-3.5 items-center hover:bg-muted/20 transition-colors">
      <span className="col-span-2">
        <span className={cn('badge text-[10px]', isBuy ? 'bg-sky-500/10 text-sky-400' : 'bg-green-500/10 text-green-400')}>
          {isBuy ? 'Bought' : 'Sold'}
        </span>
      </span>
      <span className="col-span-2 fid-num text-sm">#{tx.fid}</span>
      <span className="col-span-3 font-mono text-xs text-muted-foreground">{truncateAddress(isBuy ? tx.seller : tx.buyer)}</span>
      <span className="col-span-2 font-semibold text-sm">{formatEthDisplay(tx.amount)}</span>
      <span className="col-span-3 text-xs text-muted-foreground">{formatRelativeTime(tx.created_at)}</span>
    </a>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n/1_000).toFixed(1)}k`
  return n.toLocaleString()
}

function Empty({ title, body, action }: { title: string; body: string; action?: { href: string; label: string } }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center gap-2">
      <div className="h-10 w-10 rounded-xl bg-muted border border-border mb-2" />
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground max-w-xs">{body}</p>
      {action && <Link href={action.href} className="btn-primary text-xs px-4 py-2 mt-2">{action.label}</Link>}
    </div>
  )
}