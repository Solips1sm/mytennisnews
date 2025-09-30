import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const enable = searchParams.get('enable') === 'true'
  const res = NextResponse.redirect(new URL('/', req.url))
  // We use a simple env flag for server components
  if (enable) {
    res.cookies.set('next-preview', '1', { httpOnly: true, sameSite: 'lax', path: '/' })
  } else {
    res.cookies.set('next-preview', '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 })
  }
  return res
}