import { parseEther, formatEther, type Address, type Hash } from 'viem'
import { optimism } from 'viem/chains'

export const MARKETPLACE_ABI = [
  // Read
  { name: 'getListingFee', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'getPlatformFee', type: 'function', stateMutability: 'pure', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { name: 'getListing', type: 'function', stateMutability: 'view', inputs: [{ name: 'fid', type: 'uint256' }], outputs: [{ type: 'tuple', components: [{ name: 'fid', type: 'uint256' }, { name: 'seller', type: 'address' }, { name: 'price', type: 'uint256' }, { name: 'listingType', type: 'uint8' }, { name: 'status', type: 'uint8' }, { name: 'auctionEndTime', type: 'uint256' }, { name: 'reservePrice', type: 'uint256' }, { name: 'highestBidder', type: 'address' }, { name: 'highestBid', type: 'uint256' }, { name: 'createdAt', type: 'uint256' }] }] },
  { name: 'getOffer', type: 'function', stateMutability: 'view', inputs: [{ name: 'offerId', type: 'uint256' }], outputs: [{ type: 'tuple', components: [{ name: 'fid', type: 'uint256' }, { name: 'buyer', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'status', type: 'uint8' }, { name: 'expiresAt', type: 'uint256' }, { name: 'createdAt', type: 'uint256' }] }] },
  { name: 'getFidOffers', type: 'function', stateMutability: 'view', inputs: [{ name: 'fid', type: 'uint256' }], outputs: [{ type: 'uint256[]' }] },
  { name: 'getBuyerOffers', type: 'function', stateMutability: 'view', inputs: [{ name: 'buyer', type: 'address' }], outputs: [{ type: 'uint256[]' }] },
  { name: 'isAuctionActive', type: 'function', stateMutability: 'view', inputs: [{ name: 'fid', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { name: 'accumulatedFees', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'owner', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  // Write
  { name: 'listFixed', type: 'function', stateMutability: 'payable', inputs: [{ name: 'fid', type: 'uint256' }, { name: 'price', type: 'uint256' }], outputs: [] },
  { name: 'listAuction', type: 'function', stateMutability: 'payable', inputs: [{ name: 'fid', type: 'uint256' }, { name: 'startPrice', type: 'uint256' }, { name: 'reservePrice', type: 'uint256' }, { name: 'duration', type: 'uint256' }], outputs: [] },
  { name: 'cancelListing', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'fid', type: 'uint256' }], outputs: [] },
  { name: 'buyFixed', type: 'function', stateMutability: 'payable', inputs: [{ name: 'fid', type: 'uint256' }, { name: 'deadline', type: 'uint256' }, { name: 'sig', type: 'bytes' }], outputs: [] },
  { name: 'makeOffer', type: 'function', stateMutability: 'payable', inputs: [{ name: 'fid', type: 'uint256' }, { name: 'expiresIn', type: 'uint256' }], outputs: [] },
  { name: 'acceptOffer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'offerId', type: 'uint256' }, { name: 'deadline', type: 'uint256' }, { name: 'sig', type: 'bytes' }], outputs: [] },
  { name: 'rejectOffer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'offerId', type: 'uint256' }], outputs: [] },
  { name: 'cancelOffer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'offerId', type: 'uint256' }], outputs: [] },
  { name: 'reclaimExpiredOffer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'offerId', type: 'uint256' }], outputs: [] },
  { name: 'placeBid', type: 'function', stateMutability: 'payable', inputs: [{ name: 'fid', type: 'uint256' }], outputs: [] },
  { name: 'settleAuction', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'fid', type: 'uint256' }, { name: 'deadline', type: 'uint256' }, { name: 'sig', type: 'bytes' }], outputs: [] },
  { name: 'withdrawFees', type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  // Events
  { name: 'Listed', type: 'event', inputs: [{ name: 'fid', type: 'uint256', indexed: true }, { name: 'seller', type: 'address', indexed: true }, { name: 'price', type: 'uint256' }, { name: 'listingType', type: 'uint8' }, { name: 'auctionEndTime', type: 'uint256' }] },
  { name: 'Sold', type: 'event', inputs: [{ name: 'fid', type: 'uint256', indexed: true }, { name: 'seller', type: 'address', indexed: true }, { name: 'buyer', type: 'address', indexed: true }, { name: 'price', type: 'uint256' }] },
  { name: 'OfferMade', type: 'event', inputs: [{ name: 'offerId', type: 'uint256', indexed: true }, { name: 'fid', type: 'uint256', indexed: true }, { name: 'buyer', type: 'address', indexed: true }, { name: 'amount', type: 'uint256' }, { name: 'expiresAt', type: 'uint256' }] },
] as const

export const ID_REGISTRY_ABI = [
  { name: 'custodyOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'fid', type: 'uint256' }], outputs: [{ type: 'address' }] },
  { name: 'idOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'nonces', type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'transfer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'deadline', type: 'uint256' }, { name: 'sig', type: 'bytes' }], outputs: [] },
] as const

export const ID_REGISTRY_ADDRESS = '0x00000000fc6c5f01fc30151999387bb99a9f489b' as Address

export const MARKETPLACE_ADDRESS = (process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS ?? '0x0000000000000000000000000000000000000000') as Address

export const OPTIMISM_CHAIN = optimism

// EIP-712 domain for Farcaster Id Registry
export const ID_REGISTRY_EIP712_DOMAIN = {
  name: 'Farcaster IdRegistry',
  version: '1',
  chainId: optimism.id,
  verifyingContract: ID_REGISTRY_ADDRESS,
} as const

export const TRANSFER_TYPES = {
  Transfer: [
    { name: 'fid', type: 'uint256' },
    { name: 'to', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const

export function formatEthAmount(wei: bigint): string {
  const eth = formatEther(wei)
  const num = parseFloat(eth)
  if (num === 0) return '0 ETH'
  if (num < 0.001) return '< 0.001 ETH'
  return `${num.toFixed(4).replace(/\.?0+$/, '')} ETH`
}

export function parseEthAmount(eth: string): bigint {
  return parseEther(eth)
}

export function getDeadline(seconds = 3600): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + seconds)
}

export function getOptimscanUrl(hash: Hash): string {
  return `https://optimistic.etherscan.io/tx/${hash}`
}

export function getOptimscanAddressUrl(address: string): string {
  return `https://optimistic.etherscan.io/address/${address}`
}
