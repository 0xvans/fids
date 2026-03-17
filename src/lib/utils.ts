import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatDistanceToNow, format } from 'date-fns'
import { formatEther } from 'viem'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function truncateAddress(address: string): string {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function formatRelativeTime(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}

export function formatDate(date: string | Date): string {
  return format(new Date(date), 'MMM d, yyyy')
}

export function formatDateTime(date: string | Date): string {
  return format(new Date(date), 'MMM d, yyyy HH:mm')
}

export function formatCountdown(endTime: string | Date): string {
  const end = new Date(endTime).getTime()
  const now = Date.now()
  const diff = end - now

  if (diff <= 0) return 'Ended'

  const days    = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours   = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((diff % (1000 * 60)) / 1000)

  if (days > 0)  return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m ${seconds}s`
}

// Accepts ETH as string ("0.05"), bigint (wei), or number
export function formatEthDisplay(eth: string | bigint | number): string {
  let num: number

  if (typeof eth === 'bigint') {
    num = parseFloat(formatEther(eth))
  } else {
    num = parseFloat(String(eth))
  }

  if (isNaN(num) || num === 0) return '0 ETH'
  if (num < 0.0001) return '< 0.0001 ETH'
  return `${num.toFixed(4).replace(/\.?0+$/, '')} ETH`
}

export function shortenUsername(username: string, maxLen = 16): string {
  if (username.length <= maxLen) return username
  return username.slice(0, maxLen) + '...'
}