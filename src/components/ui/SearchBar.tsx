'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { searchFids } from '@/lib/farcaster'
import type { FarcasterProfile } from '@/types'
import Image from 'next/image'

type SearchBarProps = {
  className?: string
  placeholder?: string
  autoFocus?: boolean
}

export function SearchBar({ className, placeholder = 'Search by FID or username...', autoFocus }: SearchBarProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FarcasterProfile[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setQuery(val)

    clearTimeout(debounceRef.current)
    if (!val.trim()) {
      setResults([])
      setOpen(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      const found = await searchFids(val.trim())
      setResults(found)
      setOpen(true)
      setLoading(false)
    }, 400)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && query.trim()) {
      const numeric = parseInt(query.trim())
      if (!isNaN(numeric) && numeric > 0) {
        router.push(`/fid/${numeric}`)
        setOpen(false)
      } else if (results.length > 0) {
        router.push(`/fid/${results[0].fid}`)
        setOpen(false)
      }
    }
    if (e.key === 'Escape') setOpen(false)
  }

  function handleSelect(fid: number) {
    router.push(`/fid/${fid}`)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center">
          {loading ? (
            <svg className="h-4 w-4 animate-spin text-muted-foreground" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
          )}
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="input pl-10 pr-4"
        />
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1.5 glass rounded-xl shadow-2xl shadow-black/30 overflow-hidden z-50 animate-slide-down">
          {results.length === 0 && !loading ? (
            <div className="px-4 py-3 text-sm text-muted-foreground text-center">
              No results found
            </div>
          ) : (
            <div className="py-1.5">
              {results.map(profile => (
                <button
                  key={profile.fid}
                  onClick={() => handleSelect(profile.fid)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/60 transition-colors"
                >
                  {profile.pfpUrl ? (
                    <Image
                      src={profile.pfpUrl}
                      alt={profile.displayName}
                      width={32}
                      height={32}
                      className="h-8 w-8 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-primary/10 border border-border flex items-center justify-center shrink-0">
                      <span className="font-mono text-[10px] text-primary">{profile.fid}</span>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{profile.displayName}</p>
                    {profile.username && (
                      <p className="text-xs text-muted-foreground">@{profile.username}</p>
                    )}
                  </div>
                  <span className="fid-number text-xs shrink-0">#{profile.fid}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
