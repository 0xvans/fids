import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const fid = req.nextUrl.searchParams.get('fid')
  if (!fid) return NextResponse.json({ error: 'fid required' }, { status: 400 })

  try {
    const res = await fetch(`https://api.warpcast.com/v2/user?fid=${fid}`, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 300 }, // cache 5 min server-side
    })
    if (!res.ok) return NextResponse.json({ error: 'not found' }, { status: res.status })
    const data = await res.json()
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    })
  } catch {
    return NextResponse.json({ error: 'fetch failed' }, { status: 500 })
  }
}
