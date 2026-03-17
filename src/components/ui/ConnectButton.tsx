'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useAccount } from 'wagmi'
import { cn } from '@/lib/utils'

type ConnectButtonProps = {
  className?: string
  size?: 'sm' | 'md' | 'lg'
  label?: string
}

export function ConnectButton({ className, size = 'md', label = 'Connect Wallet' }: ConnectButtonProps) {
  const { login, authenticated, ready } = usePrivy()
  const { address } = useAccount()

  if (!ready) return null
  if (authenticated && address) return null

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-6 py-3 text-base',
  }

  return (
    <button
      onClick={() => login()}
      className={cn('btn-primary', sizeClasses[size], className)}
    >
      {label}
    </button>
  )
}
