import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { password } = await request.json()

  console.log('ENV CHECK:', JSON.stringify({ hasPassword: !!process.env.SITE_PASSWORD, envLength: process.env.SITE_PASSWORD?.length, inputLength: password?.length }))

  if (password === process.env.SITE_PASSWORD) {
    const response = NextResponse.json({ success: true })
    response.cookies.set('sellium-auth', process.env.SITE_AUTH_TOKEN!, {
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
