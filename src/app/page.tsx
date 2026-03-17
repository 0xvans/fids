import { Suspense } from 'react'
import { getActiveListings, getTransactionsByAddress } from '@/lib/supabase'
import { fetchProfileByFid } from '@/lib/farcaster'
import { HomepageClient } from './HomepageClient'

export default async function HomePage() {
  // Fetch recent listings and recent transactions for stats
  const [recentListings] = await Promise.all([
    getActiveListings(48),
  ])

  const listingsWithProfiles = await Promise.all(
    recentListings.slice(0, 48).map(async (l) => ({
      ...l,
      profile: await fetchProfileByFid(l.fid),
    }))
  )

  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="skeleton h-8 w-48 rounded" /></div>}>
      <HomepageClient listings={listingsWithProfiles} />
    </Suspense>
  )
}
