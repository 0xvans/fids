import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { fetchProfileByFid } from '@/lib/farcaster'
import { FidPageClient } from './FidPageClient'

type Params = { fid: string }

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const fid = parseInt(params.fid)
  const profile = await fetchProfileByFid(fid)
  return {
    title: profile
      ? `${profile.displayName} (FID ${fid}) — Farcaster ID`
      : `FID ${fid} — Farcaster ID`,
    description: profile?.bio || `Trade FID #${fid} on the Farcaster ID Marketplace`,
  }
}

export default function FidPage({ params }: { params: Params }) {
  const fid = parseInt(params.fid)
  if (isNaN(fid) || fid <= 0) notFound()
  return <FidPageClient fid={fid} />
}