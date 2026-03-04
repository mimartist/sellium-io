'use client'

import { useRouter } from 'next/navigation'

export default function LogoutButton() {
  const router = useRouter()

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <button onClick={handleLogout} style={{
      width: '100%', padding: '7px 0', background: 'transparent', border: '1px solid #333',
      borderRadius: 8, color: '#6b7280', fontSize: 12, cursor: 'pointer', transition: 'color 0.2s',
    }}
      onMouseEnter={(e) => e.currentTarget.style.color = '#f43f5e'}
      onMouseLeave={(e) => e.currentTarget.style.color = '#6b7280'}
    >
      Çıkış Yap
    </button>
  )
}
