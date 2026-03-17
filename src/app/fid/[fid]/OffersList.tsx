'use client'

import { useState } from 'react'
import { useAccount, usePublicClient, useWriteContract } from 'wagmi'
import toast from 'react-hot-toast'
import { MARKETPLACE_ABI, MARKETPLACE_ADDRESS, ID_REGISTRY_EIP712_DOMAIN, TRANSFER_TYPES, getDeadline, getOptimscanUrl } from '@/lib/contract'
import { ID_REGISTRY_ABI, ID_REGISTRY_ADDRESS } from '@/lib/contract'
import { updateOfferStatus, updateListingStatus, createTransaction } from '@/lib/supabase'
import { truncateAddress, formatEthDisplay, formatRelativeTime } from '@/lib/utils'
import type { Offer } from '@/types'
import type { Address } from 'viem'

type OffersListProps = {
  offers: Offer[]
  ownerAddress?: string
  fid: number
}

export function OffersList({ offers, ownerAddress, fid }: OffersListProps) {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const [loadingId, setLoadingId] = useState<number | null>(null)

  const isOwner = address?.toLowerCase() === ownerAddress?.toLowerCase()

  async function signTransfer(to: Address, deadline: bigint): Promise<`0x${string}` | null> {
    if (!publicClient || !address) return null
    try {
      const nonce = await publicClient.readContract({
        address: ID_REGISTRY_ADDRESS,
        abi: ID_REGISTRY_ABI,
        functionName: 'nonces',
        args: [to],
      }) as bigint

    
      const sig = await window.ethereum.request({
        method: 'eth_signTypedData_v4',
        params: [
          address,
          JSON.stringify({
            domain: { ...ID_REGISTRY_EIP712_DOMAIN, chainId: Number(ID_REGISTRY_EIP712_DOMAIN.chainId) },
            types: { EIP712Domain: [{ name: 'name', type: 'string' }, { name: 'version', type: 'string' }, { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' }], ...TRANSFER_TYPES },
            primaryType: 'Transfer',
            message: { fid: fid.toString(), to, nonce: nonce.toString(), deadline: deadline.toString() },
          }),
        ],
      })
      return sig
    } catch {
      return null
    }
  }

  async function handleAccept(offer: Offer) {
    if (!address) return
    setLoadingId(offer.offer_id)
    const toastId = toast.loading('Sign to accept offer...')
    try {
      const deadline = getDeadline(3600)
      const sig = await signTransfer(offer.buyer as Address, deadline)
      if (!sig) throw new Error('Signature cancelled')

      toast.loading('Confirm transaction...', { id: toastId })
      const hash = await writeContractAsync({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: 'acceptOffer',
        args: [BigInt(offer.offer_id), deadline, sig],
      })

      await publicClient?.waitForTransactionReceipt({ hash })
      await Promise.all([
        updateOfferStatus(offer.offer_id, 'accepted'),
        updateListingStatus(fid, 'sold'),
        createTransaction({ fid, seller: address, buyer: offer.buyer, amount: offer.amount, tx_hash: hash, listing_type: 'fixed' }),
      ])

      toast.success(
        <span>
          Offer accepted!{' '}
          <a href={getOptimscanUrl(hash)} target="_blank" rel="noopener noreferrer" className="underline">View tx</a>
        </span>,
        { id: toastId, duration: 6000 }
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      toast.error(msg.includes('user rejected') ? 'Cancelled' : 'Failed to accept', { id: toastId })
    } finally {
      setLoadingId(null)
    }
  }

  async function handleReject(offer: Offer) {
    setLoadingId(offer.offer_id)
    const toastId = toast.loading('Rejecting offer...')
    try {
      const hash = await writeContractAsync({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: 'rejectOffer',
        args: [BigInt(offer.offer_id)],
      })
      await publicClient?.waitForTransactionReceipt({ hash })
      await updateOfferStatus(offer.offer_id, 'rejected')
      toast.success('Offer rejected', { id: toastId })
    } catch (err: unknown) {
      toast.error('Failed', { id: toastId })
    } finally {
      setLoadingId(null)
    }
  }

  async function handleCancel(offer: Offer) {
    setLoadingId(offer.offer_id)
    const toastId = toast.loading('Cancelling offer...')
    try {
      const hash = await writeContractAsync({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: 'cancelOffer',
        args: [BigInt(offer.offer_id)],
      })
      await publicClient?.waitForTransactionReceipt({ hash })
      await updateOfferStatus(offer.offer_id, 'cancelled')
      toast.success('Offer cancelled', { id: toastId })
    } catch {
      toast.error('Failed', { id: toastId })
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <div className="space-y-2">
      {offers.map(offer => {
        const isMyOffer = address?.toLowerCase() === offer.buyer.toLowerCase()
        const busy = loadingId === offer.offer_id
        return (
          <div key={offer.id} className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-8 w-8 rounded-full bg-primary/10 border border-border flex items-center justify-center shrink-0">
                <span className="font-mono text-[9px] text-primary">{offer.buyer.slice(2, 4).toUpperCase()}</span>
              </div>
              <div className="min-w-0">
                <p className="font-mono text-xs text-muted-foreground truncate">{truncateAddress(offer.buyer)}</p>
                <p className="text-[10px] text-muted-foreground">{formatRelativeTime(offer.created_at)}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <span className="font-bold text-sm">{formatEthDisplay(offer.amount)}</span>

              {isOwner && !isMyOffer && (
                <div className="flex gap-1.5">
                  <button onClick={() => handleAccept(offer)} disabled={busy} className="btn-primary px-3 py-1.5 text-xs">
                    Accept
                  </button>
                  <button onClick={() => handleReject(offer)} disabled={busy} className="btn-secondary px-3 py-1.5 text-xs">
                    Reject
                  </button>
                </div>
              )}

              {isMyOffer && (
                <button onClick={() => handleCancel(offer)} disabled={busy} className="btn-ghost px-3 py-1.5 text-xs text-destructive hover:text-destructive">
                  Cancel
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
