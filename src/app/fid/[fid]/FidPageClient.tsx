'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { usePrivy } from '@privy-io/react-auth'
import { useAccount, useReadContract } from 'wagmi'
import { fetchProfileByFid, fetchFidStats, truncateAddress, DEFAULT_PFP } from '@/lib/farcaster'
import { getListingByFid, getOffersByFid } from '@/lib/supabase'
import { FidActions } from './FidActions'
import { OffersList } from './OffersList'
import { formatEthDisplay, formatRelativeTime, cn } from '@/lib/utils'
import { ID_REGISTRY_ABI, ID_REGISTRY_ADDRESS } from '@/lib/contract'
import type { FarcasterProfile, Listing, Offer } from '@/types'
import type { Address } from 'viem'

const POLL_MS = 10_000

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toLocaleString()
}

export function FidPageClient({ fid }: { fid: number }) {
  const { login, authenticated } = usePrivy()
  const { address } = useAccount()

  const [profile, setProfile] = useState<FarcasterProfile | null>(null)
  const [listing, setListing] = useState<Listing | null>(null)
  const [offers, setOffers]   = useState<Offer[]>([])
  const [stats, setStats]     = useState({ followerCount: 0, followingCount: 0 })
  const [loading, setLoading] = useState(true)

  const pollRef = useRef<ReturnType<typeof setInterval>>()

  const { data: userFid } = useReadContract({
    address: ID_REGISTRY_ADDRESS,
    abi: ID_REGISTRY_ABI,
    functionName: 'idOf',
    args: address ? [address as Address] : undefined,
    query: { enabled: !!address, refetchInterval: POLL_MS },
  })

  const fetchAll = useCallback(async () => {
    const [p, l, o, s] = await Promise.all([
      fetchProfileByFid(fid),
      getListingByFid(fid),
      getOffersByFid(fid),
      fetchFidStats(fid),
    ])
    setProfile(p)
    setListing(l)
    setOffers(o)
    setStats(s)
    setLoading(false)
  }, [fid])

  useEffect(() => {
    fetchAll()
    pollRef.current = setInterval(fetchAll, POLL_MS)
    return () => clearInterval(pollRef.current)
  }, [fetchAll])

  const isListed  = listing?.status === 'active'
  const isAuction = listing?.listing_type === 'auction'

  if (loading) return <PageSkeleton />

  return (
    <div className="min-h-screen">
      {/* Back */}
      <div className="mx-auto max-w-3xl px-4 pt-6 pb-2">
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group">
          <svg className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Link>
      </div>

      <div className="mx-auto max-w-3xl px-4 pb-24 md:pb-10 space-y-3">

        {/* ── Profile Card ── */}
        <div className="card overflow-hidden">
          {/* Top accent */}
          <div className={cn('h-1 w-full', isListed ? 'bg-primary/60' : 'bg-border')} />

          <div className="p-5 sm:p-6">
            {/* Avatar + name row */}
            <div className="flex items-start gap-4 mb-5">
              <div className="relative shrink-0">
                <img
                  src={profile?.pfpUrl || DEFAULT_PFP}
                  alt={profile?.displayName || `FID ${fid}`}
                  className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl object-cover ring-2 ring-border"
                  onError={e => { (e.target as HTMLImageElement).src = DEFAULT_PFP }}
                />
                {isListed && (
                  <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-green-500 border-2 border-card" />
                )}
              </div>

              <div className="flex-1 min-w-0 pt-0.5">
                <h1 className="text-lg sm:text-xl font-semibold leading-tight mb-0.5 truncate">
                  {profile?.displayName || `FID ${fid}`}
                </h1>
                {profile?.username && (
                  <p className="text-sm text-muted-foreground mb-2">@{profile.username}</p>
                )}
                {profile?.bio && (
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{profile.bio}</p>
                )}
              </div>

              {/* FID badge */}
              <div className="shrink-0 text-right">
                <p className="stat-label mb-0.5">FID</p>
                <p className="fid-num text-lg sm:text-xl">#{fid.toLocaleString()}</p>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2 mb-5">
              <div className="rounded-xl bg-muted/50 px-3 py-2.5 text-center">
                <p className="text-base font-semibold">{fmt(stats.followerCount)}</p>
                <p className="stat-label mt-0.5">Followers</p>
              </div>
              <div className="rounded-xl bg-muted/50 px-3 py-2.5 text-center">
                <p className="text-base font-semibold">{fmt(stats.followingCount)}</p>
                <p className="stat-label mt-0.5">Following</p>
              </div>
              <div className="rounded-xl bg-muted/50 px-3 py-2.5 text-center">
                <p className="text-base font-semibold">
                  {isListed
                    ? <span className="text-green-400 text-sm font-semibold">Listed</span>
                    : <span className="text-muted-foreground text-sm">—</span>
                  }
                </p>
                <p className="stat-label mt-0.5">Status</p>
              </div>
            </div>

            {/* Details */}
            <div className="space-y-2 border-t border-border pt-4">
              {profile?.ethAddress && (
                <div className="flex items-center justify-between gap-3">
                  <span className="stat-label">Custody</span>
                  <a
                    href={`https://optimistic.etherscan.io/address/${profile.ethAddress}`}
                    target="_blank" rel="noopener noreferrer"
                    className="font-mono text-xs text-primary hover:underline truncate max-w-[180px]">
                    {truncateAddress(profile.ethAddress)}
                  </a>
                </div>
              )}
              {isListed && listing && (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <span className="stat-label">Price</span>
                    <span className="font-semibold text-sm">{formatEthDisplay(listing.price)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="stat-label">Type</span>
                    <span className={isAuction ? 'badge-auction' : 'badge-active'}>{isAuction ? 'Auction' : 'Fixed'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="stat-label">Listed</span>
                    <span className="text-xs text-muted-foreground">{formatRelativeTime(listing.created_at)}</span>
                  </div>
                  {isAuction && listing.highest_bid && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="stat-label">Top Bid</span>
                      <span className="font-semibold text-sm text-primary">{formatEthDisplay(listing.highest_bid)}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Actions ── */}
        <FidActions fid={fid} listing={listing} ownerAddress={profile?.ethAddress} />

        {/* ── Offers ── */}
        {offers.length > 0 && (
          <div className="card p-5">
            <h2 className="text-sm font-semibold mb-4">
              Active Offers
              <span className="ml-2 text-xs font-normal text-muted-foreground">({offers.length})</span>
            </h2>
            <OffersList offers={offers} ownerAddress={profile?.ethAddress} fid={fid} />
          </div>
        )}

        {/* Not listed notice */}
        {!isListed && (
          <div className="rounded-2xl border border-dashed border-border px-5 py-4 text-center">
            <p className="text-xs text-muted-foreground">
              Not listed for sale. You can still make an offer to the owner.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function PageSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 space-y-3">
      <div className="skeleton h-4 w-12 rounded mb-4" />
      <div className="card p-5 space-y-4">
        <div className="flex items-start gap-4">
          <div className="skeleton h-16 w-16 rounded-2xl shrink-0" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="skeleton h-4 w-36 rounded" />
            <div className="skeleton h-3 w-24 rounded" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[1,2,3].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}
        </div>
      </div>
      <div className="skeleton h-48 rounded-2xl" />
    </div>
  )
}