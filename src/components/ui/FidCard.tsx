'use client'

import Link from 'next/link'
import Image from 'next/image'
import { cn, truncateAddress, formatEthDisplay } from '@/lib/utils'
import type { FarcasterProfile, Listing } from '@/types'

type FidCardProps = {
  fid: number
  profile?: FarcasterProfile | null
  listing?: Listing | null
  className?: string
  compact?: boolean
}

export function FidCard({ fid, profile, listing, className, compact = false }: FidCardProps) {
  const isListed = listing?.status === 'active'
  const isAuction = listing?.listing_type === 'auction'

  return (
    <Link
      href={`/fid/${fid}`}
      className={cn(
        'card-hover group block overflow-hidden transition-all duration-200',
        'hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/20',
        className
      )}
    >
      <div className="relative p-5">
        {/* Status badge */}
        <div className="absolute top-4 right-4">
          {isListed ? (
            isAuction ? (
              <span className="badge-auction">Auction</span>
            ) : (
              <span className="badge-active">For Sale</span>
            )
          ) : null}
        </div>

        {/* Profile section */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative shrink-0">
            {profile?.pfpUrl ? (
              <Image
                src={profile.pfpUrl}
                alt={profile.displayName}
                width={48}
                height={48}
                className="h-12 w-12 rounded-full object-cover ring-2 ring-border group-hover:ring-primary/30 transition-all"
              />
            ) : (
              <div className="h-12 w-12 rounded-full bg-primary/10 border-2 border-border group-hover:border-primary/30 transition-colors flex items-center justify-center">
                <span className="font-mono text-xs text-primary">
                  {fid.toString().slice(0, 3)}
                </span>
              </div>
            )}
            {isListed && (
              <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-green-500 border-2 border-card" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm text-foreground truncate">
              {profile?.displayName || truncateAddress(profile?.ethAddress || '')}
            </p>
            {profile?.username && (
              <p className="text-xs text-muted-foreground truncate">@{profile.username}</p>
            )}
          </div>
        </div>

        {/* FID number */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">FID</p>
            <p className="fid-number text-2xl leading-none">{fid.toLocaleString()}</p>
          </div>

          {/* Price */}
          {isListed && listing && (
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">
                {isAuction ? 'Starting bid' : 'Price'}
              </p>
              <p className="text-sm font-bold text-foreground">
                {formatEthDisplay(listing.price)}
              </p>
            </div>
          )}
        </div>

        {/* Bio (non-compact) */}
        {!compact && profile?.bio && (
          <p className="mt-3 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {profile.bio}
          </p>
        )}
      </div>
    </Link>
  )
}
