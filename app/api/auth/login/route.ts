import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { password } = await request.json()

  if (password === process.env.SITE_PASSWORD) {
    const response = NextResponse.json({ success: true })
    response.cookies.set('sellometrix-auth', process.env.SITE_AUTH_TOKEN!, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 gün
    })
    return response
  }

  return NextResponse.json(
    { success: false, error: 'Yanlış şifre' },
    { status: 401 }
  )
}
