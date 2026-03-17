'use client'

import { useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useAccount, useReadContract, useWriteContract, usePublicClient } from 'wagmi'
import { parseEther, formatEther, type Address, type Hash } from 'viem'
import toast from 'react-hot-toast'
import { cn, formatEthDisplay, formatCountdown } from '@/lib/utils'
import {
  MARKETPLACE_ABI,
  MARKETPLACE_ADDRESS,
  ID_REGISTRY_ABI,
  ID_REGISTRY_ADDRESS,
  ID_REGISTRY_EIP712_DOMAIN,
  TRANSFER_TYPES,
  getDeadline,
  getOptimscanUrl,
} from '@/lib/contract'
import {
  createListing,
  updateListingStatus,
  createOffer,
  createTransaction,
} from '@/lib/supabase'
import type { Listing } from '@/types'

type FidActionsProps = {
  fid: number
  listing: Listing | null
  ownerAddress?: string
}

type ActionTab = 'buy' | 'offer' | 'bid' | 'list'

type TxStatus = {
  hash: Hash
  status: 'pending' | 'success' | 'failed' | 'cancelled'
  action: string
}

export function FidActions({ fid, listing: supabaseListing, ownerAddress }: FidActionsProps) {
  const { login, authenticated } = usePrivy()
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()

  const [activeTab, setActiveTab]       = useState<ActionTab>('buy')
  const [loading, setLoading]           = useState(false)
  const [listType, setListType]         = useState<'fixed' | 'auction'>('fixed')
  const [listPrice, setListPrice]       = useState('')
  const [reservePrice, setReservePrice] = useState('')
  const [auctionDays, setAuctionDays]   = useState('3')
  const [offerAmount, setOfferAmount]   = useState('')
  const [offerExpiry, setOfferExpiry]   = useState('3')
  const [bidAmount, setBidAmount]       = useState('')
  const [txHistory, setTxHistory]       = useState<TxStatus[]>([])

  // ── Read on-chain listing (source of truth) ───────────────────────────────
  const { data: onChainListing, refetch: refetchOnChain } = useReadContract({
    address: MARKETPLACE_ADDRESS,
    abi: MARKETPLACE_ABI,
    functionName: 'getListing',
    args: [BigInt(fid)],
    query: { refetchInterval: 8_000 },
  })

  const { data: listingFee } = useReadContract({
    address: MARKETPLACE_ADDRESS,
    abi: MARKETPLACE_ABI,
    functionName: 'getListingFee',
    query: { refetchInterval: 60_000 },
  })

  const { data: userFid } = useReadContract({
    address: ID_REGISTRY_ADDRESS,
    abi: ID_REGISTRY_ABI,
    functionName: 'idOf',
    args: address ? [address as Address] : undefined,
    query: { enabled: !!address, refetchInterval: 10_000 },
  })

  const connectedUserOwnsFid = userFid !== undefined && Number(userFid) === fid

  // On-chain listing fields (named tuple from wagmi)
  const onChainActive  = !!(onChainListing &&
    onChainListing.seller !== '0x0000000000000000000000000000000000000000' &&
    Number(onChainListing.status) === 0)
  const onChainIsAuction = !!(onChainListing && Number(onChainListing.listingType) === 1)
  const onChainPrice     = onChainListing?.price ?? BigInt(0)
  const onChainEndTime   = onChainListing ? Number(onChainListing.auctionEndTime) : 0
  const onChainHighBid   = onChainListing?.highestBid ?? BigInt(0)

  const isListed  = onChainActive
  const isAuction = onChainIsAuction

  // ── TX History ─────────────────────────────────────────────────────────────
  function addTx(hash: Hash, action: string) {
    setTxHistory(prev => [{ hash, action, status: 'pending' }, ...prev.slice(0, 4)])
  }
  function updateTx(hash: Hash, status: TxStatus['status']) {
    setTxHistory(prev => prev.map(t => t.hash === hash ? { ...t, status } : t))
  }

  // ── EIP-712 Transfer signature ─────────────────────────────────────────────
  async function signTransfer(to: Address): Promise<{ sig: `0x${string}`; deadline: bigint } | null> {
    if (!publicClient) return null
    try {
      const deadline = getDeadline(3600)
      const nonce = await publicClient.readContract({
        address: ID_REGISTRY_ADDRESS,
        abi: ID_REGISTRY_ABI,
        functionName: 'nonces',
        args: [to],
      }) as bigint

      const sig = await (window as any).ethereum.request({
        method: 'eth_signTypedData_v4',
        params: [to, JSON.stringify({
          domain: { ...ID_REGISTRY_EIP712_DOMAIN, chainId: Number(ID_REGISTRY_EIP712_DOMAIN.chainId) },
          types: {
            EIP712Domain: [
              { name: 'name', type: 'string' },
              { name: 'version', type: 'string' },
              { name: 'chainId', type: 'uint256' },
              { name: 'verifyingContract', type: 'address' },
            ],
            ...TRANSFER_TYPES,
          },
          primaryType: 'Transfer',
          message: {
            fid: fid.toString(),
            to,
            nonce: nonce.toString(),
            deadline: deadline.toString(),
          },
        })],
      })
      return { sig, deadline }
    } catch {
      return null
    }
  }

  // ── Generic TX executor with full error handling ───────────────────────────
  async function executeTx(opts: {
    action: string
    toastMsg: string
    run: () => Promise<Hash>
    onSuccess: (hash: Hash) => Promise<void>
  }) {
    setLoading(true)
    const toastId = toast.loading(opts.toastMsg)
    let hash: Hash | null = null
    try {
      hash = await opts.run()
      addTx(hash, opts.action)

      toast.loading(
        <span>
          {opts.action}...{' '}
          <a href={getOptimscanUrl(hash)} target="_blank" rel="noopener noreferrer" className="underline text-primary text-xs">
            View on Optimism
          </a>
        </span>,
        { id: toastId }
      )

      const receipt = await publicClient?.waitForTransactionReceipt({ hash })

      if (receipt?.status === 'reverted') {
        updateTx(hash, 'failed')
        toast.error(
          <span>
            Transaction failed.{' '}
            <a href={getOptimscanUrl(hash)} target="_blank" rel="noopener noreferrer" className="underline text-xs">
              See details
            </a>
          </span>,
          { id: toastId, duration: 8000 }
        )
        return
      }

      updateTx(hash, 'success')
      await opts.onSuccess(hash)

      toast.success(
        <span>
          {opts.action} success!{' '}
          <a href={getOptimscanUrl(hash)} target="_blank" rel="noopener noreferrer" className="underline text-xs">
            View tx
          </a>
        </span>,
        { id: toastId, duration: 6000 }
      )
      refetchOnChain()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      const isCancel = msg.includes('user rejected') || msg.includes('User denied') || msg.includes('cancelled')
      if (hash) updateTx(hash, isCancel ? 'cancelled' : 'failed')
      if (isCancel) {
        toast.dismiss(toastId)
      } else {
        let reason = 'Transaction failed'
        if (msg.includes('Already listed'))           reason = 'FID is already listed'
        if (msg.includes('Not FID owner'))            reason = 'You do not own this FID'
        if (msg.includes('Insufficient listing fee')) reason = 'Insufficient listing fee'
        if (msg.includes('Listing not active'))       reason = 'Listing is no longer active'
        if (msg.includes('Insufficient ETH'))         reason = 'Not enough ETH'
        if (msg.includes('Bid too low'))              reason = 'Bid is too low'
        if (msg.includes('Auction ended'))            reason = 'Auction has ended'
        if (msg.includes('Stale price feed'))         reason = 'Price feed stale — try again'
        toast.error(
          hash ? (
            <span>
              {reason}.{' '}
              <a href={getOptimscanUrl(hash)} target="_blank" rel="noopener noreferrer" className="underline text-xs">
                View on Optimism
              </a>
            </span>
          ) : reason,
          { id: toastId, duration: 8000 }
        )
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Buy fixed ──────────────────────────────────────────────────────────────
  async function handleBuyFixed() {
    if (!authenticated) { login(); return }
    if (!address) return
    const signed = await signTransfer(address as Address)
    if (!signed) { toast.error('Signature cancelled'); return }
    await executeTx({
      action: 'Buy FID',
      toastMsg: 'Confirm purchase...',
      run: () => writeContractAsync({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: 'buyFixed',
        args: [BigInt(fid), signed.deadline, signed.sig],
        value: onChainPrice,
      }),
      onSuccess: async (hash) => {
        const priceEth = formatEther(onChainPrice)
        await Promise.all([
          updateListingStatus(fid, 'sold'),
          createTransaction({
            fid,
            seller: ownerAddress ?? '',
            buyer: address,
            amount: priceEth,
            tx_hash: hash,
            listing_type: 'fixed',
          }),
        ])
        setTimeout(() => window.location.reload(), 1500)
      },
    })
  }

  // ── Place bid ──────────────────────────────────────────────────────────────
  async function handlePlaceBid() {
    if (!authenticated) { login(); return }
    if (!bidAmount) return
    await executeTx({
      action: 'Place Bid',
      toastMsg: 'Placing bid...',
      run: () => writeContractAsync({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: 'placeBid',
        args: [BigInt(fid)],
        value: parseEther(bidAmount),
      }),
      onSuccess: async () => { setBidAmount('') },
    })
  }

  // ── Make offer ─────────────────────────────────────────────────────────────
  async function handleMakeOffer() {
    if (!authenticated) { login(); return }
    if (!offerAmount || !address) return
    const expiresInSeconds = parseInt(offerExpiry) * 24 * 60 * 60
    await executeTx({
      action: 'Make Offer',
      toastMsg: 'Submitting offer...',
      run: () => writeContractAsync({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: 'makeOffer',
        args: [BigInt(fid), BigInt(expiresInSeconds)],
        value: parseEther(offerAmount),
      }),
      onSuccess: async () => {
        await createOffer({
          offer_id: 0,
          fid,
          buyer: address!,
          amount: offerAmount,
          status: 'pending',
          expires_at: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
        })
        setOfferAmount('')
      },
    })
  }

  // ── List FID ───────────────────────────────────────────────────────────────
  async function handleList() {
    if (!authenticated) { login(); return }
    if (!listPrice || !address) return
    const fee     = listingFee ?? BigInt(0)
    const reserve = reservePrice || listPrice
    const durationSecs = BigInt(parseInt(auctionDays) * 24 * 60 * 60)

    await executeTx({
      action: 'List FID',
      toastMsg: 'Creating listing...',
      run: () => listType === 'fixed'
        ? writeContractAsync({
            address: MARKETPLACE_ADDRESS,
            abi: MARKETPLACE_ABI,
            functionName: 'listFixed',
            args: [BigInt(fid), parseEther(listPrice)],
            value: fee,
          })
        : writeContractAsync({
            address: MARKETPLACE_ADDRESS,
            abi: MARKETPLACE_ABI,
            functionName: 'listAuction',
            args: [BigInt(fid), parseEther(listPrice), parseEther(reserve), durationSecs],
            value: fee,
          }),
      onSuccess: async () => {
        const endTime = listType === 'auction'
          ? new Date(Date.now() + parseInt(auctionDays) * 24 * 60 * 60 * 1000).toISOString()
          : undefined

        const result = await createListing({
          fid,
          seller: address!,
          price: listPrice,
          listing_type: listType,
          status: 'active',
          auction_end_time: endTime,
          reserve_price: listType === 'auction' ? reserve : undefined,
        })

        console.log('[FidActions] createListing result:', result)

        if (result) {
          setListPrice('')
          setTimeout(() => window.location.reload(), 1500)
        } else {
          toast.error('Listing saved on-chain but database sync failed. Refresh the page.')
        }
      },
    })
  }

  // ── Cancel listing ─────────────────────────────────────────────────────────
  async function handleCancelListing() {
    await executeTx({
      action: 'Cancel Listing',
      toastMsg: 'Cancelling listing...',
      run: () => writeContractAsync({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: 'cancelListing',
        args: [BigInt(fid)],
      }),
      onSuccess: async () => {
        await updateListingStatus(fid, 'cancelled')
        setTimeout(() => window.location.reload(), 1500)
      },
    })
  }

  // ── TX History Panel ───────────────────────────────────────────────────────
  function TxHistoryPanel() {
    if (txHistory.length === 0) return null
    return (
      <div className="mt-4 space-y-1.5">
        <p className="stat-label">Recent</p>
        {txHistory.map(tx => (
          <a key={tx.hash} href={getOptimscanUrl(tx.hash)} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 hover:border-primary/30 transition-colors">
            <div className="flex items-center gap-2 min-w-0">
              <span className={cn('h-2 w-2 rounded-full shrink-0',
                tx.status === 'success'   && 'bg-green-500',
                tx.status === 'pending'   && 'bg-amber-400 animate-pulse',
                tx.status === 'failed'    && 'bg-red-500',
                tx.status === 'cancelled' && 'bg-muted-foreground',
              )} />
              <span className="text-xs font-medium truncate">{tx.action}</span>
            </div>
            <span className={cn('text-[10px] font-medium shrink-0',
              tx.status === 'success'   && 'text-green-400',
              tx.status === 'pending'   && 'text-amber-400',
              tx.status === 'failed'    && 'text-red-400',
              tx.status === 'cancelled' && 'text-muted-foreground',
            )}>
              {tx.status === 'pending' ? 'Pending...' : tx.status}
            </span>
          </a>
        ))}
      </div>
    )
  }

  // ── Owner: List form ───────────────────────────────────────────────────────
  if (connectedUserOwnsFid && !isListed) {
    return (
      <div className="card p-6">
        <h2 className="text-base font-semibold mb-5">List This FID</h2>

        <div className="flex gap-2 mb-5">
          {(['fixed', 'auction'] as const).map(t => (
            <button key={t} onClick={() => setListType(t)}
              className={cn('btn flex-1 capitalize', listType === t ? 'btn-primary' : 'btn-secondary')}>
              {t === 'fixed' ? 'Fixed Price' : 'Auction'}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div>
            <label className="stat-label mb-1.5 block">
              {listType === 'fixed' ? 'Sale Price (ETH)' : 'Starting Bid (ETH)'}
            </label>
            <input type="number" placeholder="0.00" min="0" step="0.001"
              value={listPrice} onChange={e => setListPrice(e.target.value)} className="input" />
          </div>

          {listType === 'auction' && (
            <>
              <div>
                <label className="stat-label mb-1.5 block">Reserve Price (ETH)</label>
                <input type="number" placeholder="Minimum acceptable bid" min="0" step="0.001"
                  value={reservePrice} onChange={e => setReservePrice(e.target.value)} className="input" />
              </div>
              <div>
                <label className="stat-label mb-1.5 block">Duration</label>
                <select value={auctionDays} onChange={e => setAuctionDays(e.target.value)} className="input">
                  {[1,3,5,7,14,30].map(d => (
                    <option key={d} value={d}>{d} {d === 1 ? 'day' : 'days'}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {listingFee && (
            <p className="text-xs text-muted-foreground">
              Listing fee: {formatEthDisplay(listingFee)} (~$0.20)
            </p>
          )}

          <button onClick={handleList} disabled={loading || !listPrice} className="btn-primary w-full">
            {loading ? 'Processing...' : 'Create Listing'}
          </button>
        </div>

        <TxHistoryPanel />
      </div>
    )
  }

  // ── Owner: Manage listing ──────────────────────────────────────────────────
  if (connectedUserOwnsFid && isListed) {
    return (
      <div className="card p-6">
        <h2 className="text-base font-semibold mb-4">Manage Listing</h2>

        <div className="rounded-xl bg-muted/40 border border-border p-4 mb-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{isAuction ? 'Starting bid' : 'Listed at'}</span>
            <span className="font-semibold">{formatEthDisplay(onChainPrice)}</span>
          </div>
          {isAuction && onChainEndTime > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Time remaining</span>
              <span className="fid-num text-sm">{formatCountdown(new Date(onChainEndTime * 1000).toISOString())}</span>
            </div>
          )}
          {isAuction && onChainHighBid > BigInt(0) && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Highest bid</span>
              <span className="font-semibold text-primary">{formatEthDisplay(onChainHighBid)}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <span className="badge-active">Active on-chain</span>
          </div>
        </div>

        <button onClick={handleCancelListing} disabled={loading} className="btn-destructive w-full">
          {loading ? 'Processing...' : 'Cancel Listing'}
        </button>
        <p className="text-xs text-muted-foreground text-center mt-2">Cancelling refunds any active bids</p>

        <TxHistoryPanel />
      </div>
    )
  }

  // ── Buyer view ─────────────────────────────────────────────────────────────
  const tabs = [
    ...(isListed && !isAuction ? [{ id: 'buy' as ActionTab, label: 'Buy Now' }] : []),
    ...(isListed && isAuction  ? [{ id: 'bid' as ActionTab, label: 'Place Bid' }] : []),
    { id: 'offer' as ActionTab, label: 'Make Offer' },
  ]

  return (
    <div className="card p-6">
      <div className="flex gap-1 mb-5 bg-muted rounded-xl p-1">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={cn('flex-1 rounded-lg py-2 text-sm font-medium transition-all duration-150',
              activeTab === tab.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Buy Now */}
      {activeTab === 'buy' && isListed && !isAuction && (
        <div className="space-y-4">
          <div className="rounded-xl bg-muted/40 border border-border p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Price</span>
              <span className="text-xl font-bold">{formatEthDisplay(onChainPrice)}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">ETH on Optimism. Atomic and trustless.</p>
          </div>
          {!authenticated
            ? <button onClick={() => login()} className="btn-primary w-full">Connect Wallet to Buy</button>
            : <button onClick={handleBuyFixed} disabled={loading} className="btn-primary w-full">
                {loading ? 'Processing...' : `Buy for ${formatEthDisplay(onChainPrice)}`}
              </button>
          }
        </div>
      )}

      {/* Place Bid */}
      {activeTab === 'bid' && isListed && isAuction && (
        <div className="space-y-4">
          <div className="rounded-xl bg-muted/40 border border-border p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Min bid</span>
              <span className="font-semibold">
                {onChainHighBid > BigInt(0) ? formatEthDisplay(onChainHighBid) : formatEthDisplay(onChainPrice)}
              </span>
            </div>
            {onChainEndTime > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Ends in</span>
                <span className="fid-num text-sm">{formatCountdown(new Date(onChainEndTime * 1000).toISOString())}</span>
              </div>
            )}
          </div>
          <div>
            <label className="stat-label mb-1.5 block">Your Bid (ETH)</label>
            <input type="number" placeholder="0.00" min="0" step="0.001"
              value={bidAmount} onChange={e => setBidAmount(e.target.value)} className="input" />
          </div>
          {!authenticated
            ? <button onClick={() => login()} className="btn-primary w-full">Connect Wallet to Bid</button>
            : <button onClick={handlePlaceBid} disabled={loading || !bidAmount} className="btn-primary w-full">
                {loading ? 'Processing...' : 'Place Bid'}
              </button>
          }
        </div>
      )}

      {/* Make Offer */}
      {activeTab === 'offer' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            ETH locked in contract until owner accepts or rejects.
          </p>
          <div>
            <label className="stat-label mb-1.5 block">Offer Amount (ETH)</label>
            <input type="number" placeholder="0.00" min="0" step="0.001"
              value={offerAmount} onChange={e => setOfferAmount(e.target.value)} className="input" />
          </div>
          <div>
            <label className="stat-label mb-1.5 block">Expires In</label>
            <select value={offerExpiry} onChange={e => setOfferExpiry(e.target.value)} className="input">
              <option value="1">1 day</option>
              <option value="3">3 days</option>
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
            </select>
          </div>
          {!authenticated
            ? <button onClick={() => login()} className="btn-primary w-full">Connect Wallet</button>
            : <button onClick={handleMakeOffer} disabled={loading || !offerAmount} className="btn-outline w-full">
                {loading ? 'Processing...' : 'Submit Offer'}
              </button>
          }
        </div>
      )}

      <TxHistoryPanel />
    </div>
  )
}