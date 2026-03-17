import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const q     = req.nextUrl.searchParams.get('q')
  const limit = req.nextUrl.searchParams.get('limit') ?? '5'
  if (!q) return NextResponse.json({ error: 'q required' }, { status: 400 })

  try {
    const res = await fetch(
      `https://api.warpcast.com/v2/user-search?q=${encodeURIComponent(q)}&limit=${limit}`,
      { headers: { 'Accept': 'application/json' }, next: { revalidate: 60 } }
    )
    if (!res.ok) return NextResponse.json({ error: 'not found' }, { status: res.status })
    const data = await res.json()
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, max-age=60' },
    })
  } catch {
    return NextResponse.json({ error: 'fetch failed' }, { status: 500 })
  }
}
