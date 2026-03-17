export type FarcasterProfile = {
  fid: number
  username: string
  displayName: string
  bio: string
  pfpUrl: string
  ethAddress: string
  solanaAddress?: string
}

export type ListingType = 'fixed' | 'auction'
export type ListingStatus = 'active' | 'sold' | 'cancelled'
export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired'

export type Listing = {
  id: string
  fid: number
  seller: string
  price: string
  listing_type: ListingType
  status: ListingStatus
  auction_end_time?: string
  reserve_price?: string
  highest_bidder?: string
  highest_bid?: string
  created_at: string
  profile?: FarcasterProfile | null
}

export type Offer = {
  id: string
  offer_id: number
  fid: number
  buyer: string
  amount: string
  status: OfferStatus
  expires_at: string
  created_at: string
  profile?: FarcasterProfile | null
}

export type Transaction = {
  id: string
  fid: number
  seller: string
  buyer: string
  amount: string
  tx_hash: string
  listing_type: ListingType
  created_at: string
  profile?: FarcasterProfile | null
}

export type WatchlistItem = {
  id: string
  user_address: string
  fid: number
  created_at: string
  profile?: FarcasterProfile | null
}

export type User = {
  id: string
  wallet_address: string
  privy_id: string
  created_at: string
}