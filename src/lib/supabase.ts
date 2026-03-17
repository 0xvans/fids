import { createClient } from '@supabase/supabase-js'
import type { Listing, Offer, Transaction, WatchlistItem, User } from '@/types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ─── USERS ────────────────────────────────────────────────────────────────────

export async function upsertUser(walletAddress: string, privyId: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .upsert(
      { wallet_address: walletAddress.toLowerCase(), privy_id: privyId },
      { onConflict: 'wallet_address' }
    )
    .select()
    .single()
  if (error) { console.error('upsertUser:', error); return null }
  return data
}

// ─── LISTINGS ─────────────────────────────────────────────────────────────────

export async function createListing(
  listing: Omit<Listing, 'id' | 'created_at' | 'profile'>
): Promise<Listing | null> {
  const payload = {
    fid: listing.fid,
    seller: listing.seller.toLowerCase(),
    price: String(listing.price),
    listing_type: listing.listing_type,
    status: listing.status ?? 'active',
    auction_end_time: listing.auction_end_time ?? null,
    reserve_price: listing.reserve_price ? String(listing.reserve_price) : null,
  }
  console.log('[createListing] payload:', payload)
  const { data, error } = await supabase
    .from('listings')
    .insert(payload)
    .select()
    .single()
  if (error) { console.error('[createListing] error:', error); return null }
  console.log('[createListing] success:', data)
  return data
}

export async function getActiveListings(limit = 48, offset = 0): Promise<Listing[]> {
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) { console.error('[getActiveListings] error:', error); return [] }
  console.log('[getActiveListings] count:', data?.length, 'rows:', data)
  return data ?? []
}

export async function getListingByFid(fid: number): Promise<Listing | null> {
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('fid', fid)
    .eq('status', 'active')
    .maybeSingle()
  if (error) { console.error('getListingByFid:', error); return null }
  return data
}

export async function getListingsByAddress(address: string): Promise<Listing[]> {
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('seller', address.toLowerCase())
    .order('created_at', { ascending: false })
  if (error) { console.error('getListingsByAddress:', error); return [] }
  return data ?? []
}

export async function updateListingStatus(
  fid: number,
  status: 'active' | 'sold' | 'cancelled'
): Promise<void> {
  const { error } = await supabase
    .from('listings')
    .update({ status })
    .eq('fid', fid)
    .eq('status', 'active')
  if (error) console.error('updateListingStatus:', error)
}

export async function cancelListing(fid: number, seller: string): Promise<void> {
  const { error } = await supabase
    .from('listings')
    .update({ status: 'cancelled' })
    .eq('fid', fid)
    .eq('seller', seller.toLowerCase())
    .eq('status', 'active')
  if (error) console.error('cancelListing:', error)
}

// ─── OFFERS ───────────────────────────────────────────────────────────────────

export async function createOffer(
  offer: Omit<Offer, 'id' | 'created_at' | 'profile'>
): Promise<Offer | null> {
  const { data, error } = await supabase
    .from('offers')
    .insert({ ...offer, buyer: offer.buyer.toLowerCase() })
    .select()
    .single()
  if (error) { console.error('createOffer:', error); return null }
  return data
}

export async function getOffersByFid(fid: number): Promise<Offer[]> {
  const { data, error } = await supabase
    .from('offers')
    .select('*')
    .eq('fid', fid)
    .eq('status', 'pending')
    .order('amount', { ascending: false })
  if (error) { console.error('getOffersByFid:', error); return [] }
  return data ?? []
}

export async function getOffersByAddress(address: string): Promise<Offer[]> {
  const { data, error } = await supabase
    .from('offers')
    .select('*')
    .eq('buyer', address.toLowerCase())
    .order('created_at', { ascending: false })
  if (error) { console.error('getOffersByAddress:', error); return [] }
  return data ?? []
}

export async function getReceivedOffers(sellerFids: number[]): Promise<Offer[]> {
  if (sellerFids.length === 0) return []
  const { data, error } = await supabase
    .from('offers')
    .select('*')
    .in('fid', sellerFids)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error) { console.error('getReceivedOffers:', error); return [] }
  return data ?? []
}

export async function updateOfferStatus(
  offerId: number,
  status: 'accepted' | 'rejected' | 'cancelled' | 'expired'
): Promise<void> {
  const { error } = await supabase
    .from('offers')
    .update({ status })
    .eq('offer_id', offerId)
  if (error) console.error('updateOfferStatus:', error)
}

// ─── TRANSACTIONS ─────────────────────────────────────────────────────────────

export async function createTransaction(
  tx: Omit<Transaction, 'id' | 'created_at' | 'profile'>
): Promise<void> {
  const { error } = await supabase.from('transactions').insert({
    ...tx,
    seller: tx.seller.toLowerCase(),
    buyer: tx.buyer.toLowerCase(),
  })
  if (error) console.error('createTransaction:', error)
}

export async function getTransactionsByAddress(address: string): Promise<Transaction[]> {
  const addr = address.toLowerCase()
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .or(`seller.eq.${addr},buyer.eq.${addr}`)
    .order('created_at', { ascending: false })
  if (error) { console.error('getTransactionsByAddress:', error); return [] }
  return data ?? []
}

export async function getRecentTransactions(limit = 50): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) { console.error('getRecentTransactions:', error); return [] }
  return data ?? []
}

export async function getTransactionByHash(txHash: string): Promise<Transaction | null> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('tx_hash', txHash)
    .maybeSingle()
  if (error) { console.error('getTransactionByHash:', error); return null }
  return data
}

export async function getTransactionsByFid(fid: number): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('fid', fid)
    .order('created_at', { ascending: false })
  if (error) { console.error('getTransactionsByFid:', error); return [] }
  return data ?? []
}

// ─── WATCHLIST ────────────────────────────────────────────────────────────────

export async function addToWatchlist(address: string, fid: number): Promise<void> {
  const { error } = await supabase
    .from('watchlist')
    .upsert(
      { user_address: address.toLowerCase(), fid },
      { onConflict: 'user_address,fid' }
    )
  if (error) console.error('addToWatchlist:', error)
}

export async function removeFromWatchlist(address: string, fid: number): Promise<void> {
  const { error } = await supabase
    .from('watchlist')
    .delete()
    .eq('user_address', address.toLowerCase())
    .eq('fid', fid)
  if (error) console.error('removeFromWatchlist:', error)
}

export async function getWatchlist(address: string): Promise<WatchlistItem[]> {
  const { data, error } = await supabase
    .from('watchlist')
    .select('*')
    .eq('user_address', address.toLowerCase())
    .order('created_at', { ascending: false })
  if (error) { console.error('getWatchlist:', error); return [] }
  return data ?? []
}

export async function isWatchlisted(address: string, fid: number): Promise<boolean> {
  const { data } = await supabase
    .from('watchlist')
    .select('id')
    .eq('user_address', address.toLowerCase())
    .eq('fid', fid)
    .maybeSingle()
  return !!data
}

export async function toggleWatchlist(address: string, fid: number): Promise<boolean> {
  const watched = await isWatchlisted(address, fid)
  if (watched) {
    await removeFromWatchlist(address, fid)
    return false
  } else {
    await addToWatchlist(address, fid)
    return true
  }
}

// ─── FID PROFILES CACHE ───────────────────────────────────────────────────────

export async function upsertFidProfile(profile: {
  fid: number
  username?: string
  display_name?: string
  bio?: string
  pfp_url?: string
  eth_address?: string
  solana_address?: string
  follower_count?: number
  following_count?: number
}): Promise<void> {
  const { error } = await supabase
    .from('fid_profiles')
    .upsert(
      { ...profile, last_fetched_at: new Date().toISOString() },
      { onConflict: 'fid' }
    )
  if (error) console.error('upsertFidProfile:', error)
}

export async function getFidProfile(fid: number) {
  const { data } = await supabase
    .from('fid_profiles')
    .select('*')
    .eq('fid', fid)
    .maybeSingle()
  return data
}

export async function getFidProfilesBatch(fids: number[]) {
  if (fids.length === 0) return []
  const { data } = await supabase
    .from('fid_profiles')
    .select('*')
    .in('fid', fids)
  return data ?? []
}

export async function searchFidProfilesByUsername(username: string, limit = 5) {
  const { data } = await supabase
    .from('fid_profiles')
    .select('*')
    .ilike('username', `${username}%`)
    .limit(limit)
  return data ?? []
}

// ─── STATS ────────────────────────────────────────────────────────────────────

export async function getMarketplaceStats(): Promise<{
  totalListings: number
  totalVolume: number
  totalTrades: number
  lastSaleAmount: string
  lastSaleFid: number | null
}> {
  const [listingsRes, txRes] = await Promise.all([
    supabase.from('listings').select('price').eq('status', 'active'),
    supabase.from('transactions').select('amount, fid').order('created_at', { ascending: false }).limit(1),
  ])

  const listings = listingsRes.data ?? []
  const txs = txRes.data ?? []
  const totalVolume = listings.reduce((sum, l) => sum + parseFloat(l.price || '0'), 0)
  const lastTx = txs[0]

  const { count } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })

  return {
    totalListings: listings.length,
    totalVolume,
    totalTrades: count ?? 0,
    lastSaleAmount: lastTx?.amount ?? '0',
    lastSaleFid: lastTx?.fid ?? null,
  }
}