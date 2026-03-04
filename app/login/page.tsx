'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      if (res.ok) {
        router.push('/')
        router.refresh()
      } else {
        setError('Yanlış şifre')
        setPassword('')
      }
    } catch {
      setError('Bağlantı hatası')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0d0f14',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
    }}>
      <div style={{
        width: 400,
        maxWidth: '90vw',
        background: '#13161e',
        border: '1px solid #222636',
        borderRadius: 16,
        padding: '48px 40px',
        animation: 'fadeInUp 0.6s ease-out',
        boxSizing: 'border-box',
      }}>
        {/* Logo / Başlık */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 56,
            height: 56,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            borderRadius: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            fontSize: 24,
          }}>
            ◈
          </div>
          <h1 style={{
            color: '#fff',
            fontSize: 24,
            fontWeight: 700,
            margin: 0,
          }}>
            Sellium.io
          </h1>
          <p style={{
            color: '#6b7280',
            fontSize: 14,
            marginTop: 8,
          }}>
            Dashboard&apos;a erişmek için şifrenizi girin
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 20 }}>
            <label style={{
              display: 'block',
              color: '#9ca3af',
              fontSize: 13,
              marginBottom: 8,
              fontWeight: 500,
            }}>
              Şifre
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoFocus
              style={{
                width: '100%',
                padding: '12px 16px',
                background: '#0d0f14',
                border: `1px solid ${error ? '#f43f5e' : '#222636'}`,
                borderRadius: 10,
                color: '#fff',
                fontSize: 15,
                outline: 'none',
                transition: 'border-color 0.2s',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => {
                if (!error) e.currentTarget.style.borderColor = '#6366f1'
              }}
              onBlur={(e) => {
                if (!error) e.currentTarget.style.borderColor = '#222636'
              }}
            />
          </div>

          {error && (
            <div style={{
              color: '#f43f5e',
              fontSize: 13,
              marginBottom: 16,
              padding: '8px 12px',
              background: 'rgba(244,63,94,0.1)',
              borderRadius: 8,
              border: '1px solid rgba(244,63,94,0.2)',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            style={{
              width: '100%',
              padding: '12px 0',
              background: loading || !password
                ? '#374151'
                : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              border: 'none',
              borderRadius: 10,
              color: '#fff',
              fontSize: 15,
              fontWeight: 600,
              cursor: loading || !password ? 'not-allowed' : 'pointer',
              transition: 'opacity 0.2s',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
          </button>
        </form>

        {/* Footer */}
        <p style={{
          textAlign: 'center',
          color: '#374151',
          fontSize: 12,
          marginTop: 32,
          marginBottom: 0,
        }}>
          Sellium.io Dashboard v0.1
        </p>
      </div>
    </div>
  )
}
