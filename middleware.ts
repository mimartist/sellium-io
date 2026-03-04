import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const authToken = request.cookies.get('sellium-auth')?.value
  const expectedToken = process.env.SITE_AUTH_TOKEN

  if (authToken && authToken === expectedToken) {
    return NextResponse.next()
  }

  const loginUrl = new URL('/login', request.url)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: [
    '/((?!login|api/auth|_next/static|_next/image|favicon.ico|vercel.svg|next.svg).*)',
  ],
}
