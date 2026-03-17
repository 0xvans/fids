'use client'

type FidAvatarProps = {
  pfpUrl?: string
  displayName?: string
  fid: number
  size?: number
  className?: string
}

export function FidAvatar({ pfpUrl, displayName, fid, size = 40, className = '' }: FidAvatarProps) {
  if (pfpUrl) {
    return (
      <img
        src={pfpUrl}
        alt={displayName || `FID ${fid}`}
        width={size}
        height={size}
        className={className}
        style={{ width: size, height: size, objectFit: 'cover' }}
        onError={(e) => {
          const target = e.currentTarget
          target.style.display = 'none'
          const parent = target.parentElement
          if (parent) {
            const fallback = document.createElement('div')
            fallback.style.cssText = `width:${size}px;height:${size}px;border-radius:9999px;background:hsl(262 83% 64% / 0.1);border:1px solid hsl(262 83% 64% / 0.3);display:flex;align-items:center;justify-content:center;`
            fallback.innerHTML = `<span style="font-family:monospace;font-size:${Math.floor(size * 0.28)}px;color:hsl(262 83% 64%);font-weight:700">${fid}</span>`
            parent.appendChild(fallback)
          }
        }}
      />
    )
  }

  return (
    <div
      style={{ width: size, height: size }}
      className={`rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 ${className}`}
    >
      <span style={{ fontSize: Math.floor(size * 0.28) }} className="font-mono text-primary font-bold">
        {fid > 9999 ? fid.toString().slice(0, 3) : fid}
      </span>
    </div>
  )
}