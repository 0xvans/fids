import type { FarcasterProfile } from '@/types'

const PINATA_HUB = 'https://hub.pinata.cloud'
const FNAME_REGISTRY = 'https://fnames.farcaster.xyz'
const WARPCAST_API = 'https://api.warpcast.com/v2'

export const DEFAULT_PFP = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='20' fill='%23262626'/%3E%3Ccircle cx='20' cy='15' r='7' fill='%23525252'/%3E%3Cellipse cx='20' cy='35' rx='13' ry='9' fill='%23525252'/%3E%3C/svg%3E`

export type FidStats = {
  followerCount: number
  followingCount: number
}

// ─── In-memory cache (persists for entire browser session) ────────────────────
const profileCache = new Map<number, { data: FarcasterProfile; ts: number }>()
const statsCache   = new Map<number, { data: FidStats; ts: number }>()
const pendingProfile = new Map<number, Promise<FarcasterProfile | null>>()
const pendingStats   = new Map<number, Promise<FidStats>>()

const PROFILE_TTL = 30 * 60 * 1000  // 30 min — stable data
const STATS_TTL   = 10 * 60 * 1000  // 10 min — followers change more often

function profileFromCache(fid: number): FarcasterProfile | null {
  const hit = profileCache.get(fid)
  if (!hit) return null
  if (Date.now() - hit.ts > PROFILE_TTL) { profileCache.delete(fid); return null }
  return hit.data
}

function statsFromCache(fid: number): FidStats | null {
  const hit = statsCache.get(fid)
  if (!hit) return null
  if (Date.now() - hit.ts > STATS_TTL) { statsCache.delete(fid); return null }
  return hit.data
}

// ─── Hub types ────────────────────────────────────────────────────────────────
type HubMessage = {
  data: { userDataBody: { type: string; value: string }; fid: number }
}

const DATA_TYPE_MAP: Record<string, keyof FarcasterProfile> = {
  USER_DATA_TYPE_USERNAME: 'username',
  USER_DATA_TYPE_DISPLAY: 'displayName',
  USER_DATA_TYPE_BIO: 'bio',
  USER_DATA_TYPE_PFP: 'pfpUrl',
  USER_DATA_PRIMARY_ADDRESS_ETHEREUM: 'ethAddress',
  USER_DATA_PRIMARY_ADDRESS_SOLANA: 'solanaAddress',
}

// ─── Raw fetchers ─────────────────────────────────────────────────────────────

// Fetch from Warpcast API — primary source (works for all FIDs including new ones)
async function fetchFromWarpcast(fid: number): Promise<FarcasterProfile | null> {
  try {
    // Use proxy API route to avoid CORS issues in browser
    const isServer = typeof window === 'undefined'
    const url = isServer
      ? `https://api.warpcast.com/v2/user?fid=${fid}`
      : `/api/warpcast?fid=${fid}`
    const res = await fetch(url, {
      cache: 'no-store',
      headers: isServer ? { 'Accept': 'application/json' } : {},
    })
    if (!res.ok) return null
    const data = await res.json()
    const user = data?.result?.user
    if (!user) return null
    return {
      fid,
      username: user.username ?? '',
      displayName: user.displayName ?? user.username ?? `FID ${fid}`,
      bio: user.profile?.bio?.text ?? '',
      pfpUrl: user.pfp?.url || DEFAULT_PFP,
      ethAddress: user.verifications?.[0] ?? '',
    }
  } catch {
    return null
  }
}

// Fetch from Pinata Hub — fallback for older FIDs
async function fetchFromHub(fid: number): Promise<FarcasterProfile | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${PINATA_HUB}/v1/userDataByFid?fid=${fid}`, {
        cache: 'no-store',
      })
      if (!res.ok) {
        if (attempt < 2) { await sleep(400 * (attempt + 1)); continue }
        return null
      }
      const data: { messages: HubMessage[] } = await res.json()
      if (!data.messages?.length) return null

      const p: Partial<FarcasterProfile> = { fid }
      for (const msg of data.messages) {
        const key = DATA_TYPE_MAP[msg.data.userDataBody.type]
        if (key) (p as Record<string, unknown>)[key] = msg.data.userDataBody.value
      }

      return {
        fid,
        username: p.username ?? '',
        displayName: p.displayName ?? p.username ?? `FID ${fid}`,
        bio: p.bio ?? '',
        pfpUrl: p.pfpUrl || DEFAULT_PFP,
        ethAddress: p.ethAddress ?? '',
        solanaAddress: p.solanaAddress,
      }
    } catch {
      if (attempt < 2) await sleep(400 * (attempt + 1))
    }
  }
  return null
}

async function fetchStatsRaw(fid: number): Promise<FidStats> {
  // 1. Try Warpcast API — use proxy on client to avoid CORS
  try {
    const isServer = typeof window === 'undefined'
    const url = isServer
      ? `${WARPCAST_API}/user?fid=${fid}`
      : `/api/warpcast?fid=${fid}`
    const res = await fetch(url, {
      cache: 'no-store',
      headers: isServer ? { 'Accept': 'application/json' } : {},
    })
    if (res.ok) {
      const data = await res.json()
      const user = data?.result?.user
      if (user) {
        return {
          followerCount: user.followerCount ?? 0,
          followingCount: user.followingCount ?? 0,
        }
      }
    }
  } catch {}

  // 2. Fallback: Warpcast v2 user-by-username endpoint
  try {
    // First get username from profile cache
    const cached = profileFromCache(fid)
    if (cached?.username) {
      const res = await fetch(
        `${WARPCAST_API}/user-by-username?username=${cached.username}`,
        { cache: 'no-store', headers: { 'Accept': 'application/json' } }
      )
      if (res.ok) {
        const data = await res.json()
        const user = data?.result?.user
        if (user) {
          return {
            followerCount: user.followerCount ?? 0,
            followingCount: user.followingCount ?? 0,
          }
        }
      }
    }
  } catch {}

  return { followerCount: 0, followingCount: 0 }
}

// ─── Public API — cache-first, dedup concurrent requests ─────────────────────

export async function fetchProfileByFid(fid: number): Promise<FarcasterProfile | null> {
  // 1. Memory cache hit
  const cached = profileFromCache(fid)
  if (cached) return cached

  // 2. Dedup: if already fetching this FID, wait for that promise
  if (pendingProfile.has(fid)) return pendingProfile.get(fid)!

  // 3. Fetch
  const promise = (async () => {
    // Try Warpcast first (works for all FIDs including new ones)
    let profile = await fetchFromWarpcast(fid)
    // Fallback to Pinata Hub if Warpcast fails
    if (!profile) profile = await fetchFromHub(fid)
    pendingProfile.delete(fid)
    if (profile) profileCache.set(fid, { data: profile, ts: Date.now() })
    return profile
  })().catch(() => {
    pendingProfile.delete(fid)
    return null
  })

  pendingProfile.set(fid, promise)
  return promise
}

export async function fetchFidStats(fid: number): Promise<FidStats> {
  const cached = statsFromCache(fid)
  if (cached) return cached

  if (pendingStats.has(fid)) return pendingStats.get(fid)!

  const promise = fetchStatsRaw(fid).then(stats => {
    pendingStats.delete(fid)
    statsCache.set(fid, { data: stats, ts: Date.now() })
    return stats
  }).catch(() => {
    pendingStats.delete(fid)
    return { followerCount: 0, followingCount: 0 }
  })

  pendingStats.set(fid, promise)
  return promise
}

// ─── Batch fetch — parallel with cache + dedup ────────────────────────────────

export async function fetchProfilesBatch(
  fids: number[]
): Promise<Map<number, (FarcasterProfile & FidStats) | null>> {
  const result = new Map<number, (FarcasterProfile & FidStats) | null>()

  // Split into cached vs needs-fetch
  const toFetch: number[] = []
  for (const fid of fids) {
    const p = profileFromCache(fid)
    const s = statsFromCache(fid)
    if (p && s) {
      result.set(fid, { ...p, ...s })
    } else {
      toFetch.push(fid)
    }
  }

  if (toFetch.length === 0) return result

  // Fetch missing in parallel, max 6 at a time
  const CHUNK = 3
  for (let i = 0; i < toFetch.length; i += CHUNK) {
    const chunk = toFetch.slice(i, i + CHUNK)
    await Promise.all(chunk.map(async fid => {
      const [profile, stats] = await Promise.all([
        fetchProfileByFid(fid),
        fetchFidStats(fid),
      ])
      result.set(fid, profile ? { ...profile, ...stats } : null)
    }))
  }

  return result
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function searchFids(query: string): Promise<FarcasterProfile[]> {
  const trimmed = query.trim()

  // Numeric FID
  const numeric = parseInt(trimmed)
  if (!isNaN(numeric) && numeric > 0) {
    const profile = await fetchProfileByFid(numeric)
    return profile ? [profile] : []
  }

  const username = trimmed.replace(/^@/, '').toLowerCase()
  if (!username) return []

  // 1. Warpcast search — partial match
  try {
    const isServer = typeof window === 'undefined'
    const searchUrl = isServer
      ? `${WARPCAST_API}/user-search?q=${encodeURIComponent(username)}&limit=5`
      : `/api/warpcast-search?q=${encodeURIComponent(username)}&limit=5`
    const res = await fetch(searchUrl, { cache: 'no-store' })
    if (res.ok) {
      const data = await res.json()
      const users = data?.result?.users ?? []
      if (users.length > 0) {
        return users.map((u: {
          fid: number
          username?: string
          displayName?: string
          profile?: { bio?: { text?: string } }
          pfp?: { url?: string }
        }) => {
          const profile: FarcasterProfile = {
            fid: u.fid,
            username: u.username ?? '',
            displayName: u.displayName ?? u.username ?? `FID ${u.fid}`,
            bio: u.profile?.bio?.text ?? '',
            pfpUrl: u.pfp?.url || DEFAULT_PFP,
            ethAddress: '',
          }
          // Cache search results
          if (!profileFromCache(u.fid)) {
            profileCache.set(u.fid, { data: profile, ts: Date.now() })
          }
          return profile
        })
      }
    }
  } catch {}

  // 2. FName Registry — exact match fallback
  try {
    const res = await fetch(`${FNAME_REGISTRY}/transfers?name=${username}`, { cache: 'no-store' })
    if (res.ok) {
      const data = await res.json()
      if (data.transfers?.length) {
        const latest = data.transfers[data.transfers.length - 1]
        const profile = await fetchProfileByFid(latest.id)
        return profile ? [profile] : []
      }
    }
  } catch {}

  // 3. Pinata Hub username lookup
  try {
    const res = await fetch(`${PINATA_HUB}/v1/userDataByUsername?name=${username}`, { cache: 'no-store' })
    if (res.ok) {
      const data = await res.json()
      const fid = data?.data?.fid
      if (fid) {
        const profile = await fetchProfileByFid(fid)
        return profile ? [profile] : []
      }
    }
  } catch {}

  return []
}

export async function fetchProfileByUsername(username: string): Promise<FarcasterProfile | null> {
  const results = await searchFids(username)
  return results[0] ?? null
}

// ─── Cache utils ──────────────────────────────────────────────────────────────

export function invalidateProfile(fid: number): void {
  profileCache.delete(fid)
  statsCache.delete(fid)
}

export function getCacheSize(): { profiles: number; stats: number } {
  return { profiles: profileCache.size, stats: statsCache.size }
}

// ─── Utils ────────────────────────────────────────────────────────────────────

export function truncateAddress(address: string): string {
  if (!address || address.length < 10) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function formatFid(fid: number): string {
  return `#${fid.toLocaleString()}`
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}
