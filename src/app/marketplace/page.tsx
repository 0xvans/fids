'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { fetchProfilesBatch, fetchFidStats, DEFAULT_PFP, type FidStats, truncateAddress } from '@/lib/farcaster'
import { getActiveListings, supabase } from '@/lib/supabase'
import { formatEthDisplay, cn } from '@/lib/utils'
import type { Listing, FarcasterProfile } from '@/types'

type FilterType = 'all' | 'fixed' | 'auction'
type SortType = 'newest' | 'price_asc' | 'price_desc' | 'fid_asc'
type BrowseProfile = FarcasterProfile & Partial<FidStats>
type EnrichedListing = Listing & { profile: BrowseProfile | null }

export default function MarketplacePage() {
  const [listings, setListings]   = useState<EnrichedListing[]>([])
  const [loading, setLoading]     = useState(true)
  const [filter, setFilter]       = useState<FilterType>('all')
  const [sortBy, setSortBy]       = useState<SortType>('newest')
  const [search, setSearch]       = useState('')

  const fetchListings = useCallback(async () => {
    const raw = await getActiveListings(96)
    if (raw.length === 0) { setListings([]); setLoading(false); return }
    const fids = raw.map(l => l.fid)
    const profileMap = await fetchProfilesBatch(fids)
    const statsResults = await Promise.allSettled(fids.map(fid => fetchFidStats(fid)))
    const enriched: EnrichedListing[] = raw.map((l, i) => {
      const p = profileMap.get(l.fid) ?? null
      const s = statsResults[i].status === 'fulfilled' ? statsResults[i].value : { followerCount: 0, followingCount: 0 }
      return { ...l, profile: p ? { ...p, ...s } : null }
    })
    setListings(enriched)
    setLoading(false)
  }, [])

  // Initial fetch + Realtime + polling
  useEffect(() => {
    fetchListings()
    const channel = supabase
      .channel('marketplace-listings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'listings' }, () => {
        fetchListings()
      })
      .subscribe()
    const poll = setInterval(fetchListings, 5_000)
    return () => { supabase.removeChannel(channel); clearInterval(poll) }
  }, [fetchListings])

  const filtered = listings
    .filter(l => {
      if (filter !== 'all' && l.listing_type !== filter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        return (
          String(l.fid).includes(q) ||
          l.profile?.username?.toLowerCase().includes(q) ||
          l.profile?.displayName?.toLowerCase().includes(q)
        )
      }
      return true
    })
    .sort((a, b) => {
      if (sortBy === 'price_asc')  return parseFloat(a.price) - parseFloat(b.price)
      if (sortBy === 'price_desc') return parseFloat(b.price) - parseFloat(a.price)
      if (sortBy === 'fid_asc')    return a.fid - b.fid
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 pb-24 md:pb-10">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-semibold mb-1">Marketplace</h1>
        <p className="text-sm text-muted-foreground">All active Farcaster ID listings</p>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center">
            <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
          </div>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search FID or username..."
            className="input pl-10"
          />
        </div>
        <div className="flex gap-2">
          <div className="flex gap-1">
            {(['all','fixed','auction'] as FilterType[]).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={cn('px-3 py-2 rounded-xl text-xs font-medium capitalize transition-colors',
                  filter === f ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground')}>
                {f}
              </button>
            ))}
          </div>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as SortType)}
            className="input w-auto text-xs py-2 px-3 cursor-pointer">
            <option value="newest">Newest</option>
            <option value="price_asc">Price: Low</option>
            <option value="price_desc">Price: High</option>
            <option value="fid_asc">FID: Low</option>
          </select>
        </div>
      </div>

      {/* Results count */}
      {!loading && (
        <p className="text-xs text-muted-foreground mb-4">
          {filtered.length} listing{filtered.length !== 1 ? 's' : ''}
          {filter !== 'all' && ` · ${filter}`}
          {search && ` · "${search}"`}
        </p>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="card p-3.5 space-y-2.5">
              <div className="skeleton h-3 w-8 rounded" />
              <div className="skeleton h-12 w-12 rounded-full mx-auto" />
              <div className="skeleton h-2.5 w-full rounded" />
              <div className="skeleton h-2 w-14 rounded mx-auto" />
              <div className="skeleton h-3 w-16 rounded mx-auto" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
          <div className="h-14 w-14 rounded-2xl bg-muted border border-border mb-2" />
          <p className="text-sm font-medium">No listings found</p>
          <p className="text-xs text-muted-foreground">
            {listings.length === 0
              ? 'No FIDs have been listed for sale yet.'
              : `No listings match your search.`}
          </p>
          {search && (
            <button onClick={() => setSearch('')} className="btn-secondary text-xs mt-1">
              Clear search
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {filtered.map(l => (
            <ListingCard key={l.fid} listing={l} />
          ))}
        </div>
      )}
    </div>
  )
}

function ListingCard({ listing }: { listing: EnrichedListing }) {
  const p = listing.profile
  const followers = p?.followerCount
  const following = p?.followingCount

  return (
    <Link href={`/fid/${listing.fid}`} className="card-hover group flex flex-col overflow-hidden">
      <div className="h-0.5 bg-primary/70 rounded-t-2xl" />
      <div className="p-3.5 flex flex-col gap-2 flex-1">
        <div className="flex items-center justify-between">
          <span className="fid-num text-xs">#{listing.fid}</span>
          <span className={listing.listing_type === 'auction' ? 'badge-auction text-[10px] px-1.5 py-0.5' : 'badge-active text-[10px] px-1.5 py-0.5'}>
            {listing.listing_type === 'auction' ? 'Auction' : 'Fixed'}
          </span>
        </div>

        <div className="flex justify-center">
          <img
            src={p?.pfpUrl || DEFAULT_PFP}
            alt={p?.displayName || `FID ${listing.fid}`}
            className="h-12 w-12 rounded-full object-cover ring-2 ring-border group-hover:ring-primary/30 transition-all"
            onError={e => { (e.target as HTMLImageElement).src = DEFAULT_PFP }}
          />
        </div>

        <div className="text-center min-w-0 w-full">
          <p className="text-xs font-medium truncate">{p?.displayName || `FID ${listing.fid}`}</p>
          {p?.username
            ? <p className="text-[10px] text-muted-foreground truncate">@{p.username}</p>
            : <p className="text-[10px] text-muted-foreground">—</p>}
        </div>

        {/* Followers + Following */}
        {((followers ?? 0) > 0 || (following ?? 0) > 0) && (
          <div className="flex items-center justify-center gap-1.5 flex-wrap">
            {(followers ?? 0) > 0 && (
              <span className="text-[10px] text-muted-foreground">
                <span className="font-medium text-foreground">{fmt(followers!)}</span> followers
              </span>
            )}
            {(followers ?? 0) > 0 && (following ?? 0) > 0 && (
              <span className="text-[10px] text-border">·</span>
            )}
            {(following ?? 0) > 0 && (
              <span className="text-[10px] text-muted-foreground">
                <span className="font-medium text-foreground">{fmt(following!)}</span> following
              </span>
            )}
          </div>
        )}

        <p className="text-center text-xs font-semibold text-primary mt-auto pt-1">
          {formatEthDisplay(listing.price)}
        </p>
      </div>
    </Link>
  )
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n/1_000).toFixed(1)}k`
  return n.toString()
}