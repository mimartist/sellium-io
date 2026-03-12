'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n'

export default function LoginPage() {
  const { t } = useTranslation()
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
        setError(t("login.wrongPassword"))
        setPassword('')
      }
    } catch {
      setError(t("login.connectionError"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#F8FAFC',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Subtle background orbs */}
      <div style={{ position: 'absolute', top: '-20%', left: '-10%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(91,95,199,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '-20%', right: '-10%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />

      {/* Main content */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 36 }}>
        {/* AI-themed glowing card wrapper */}
        <div className="ai-chat-outer" style={{ width: 420, maxWidth: '92vw' }}>
          <div className="ai-chat-inner" style={{ background: '#fff' }}>
            <div className="ai-chat-bg" style={{ opacity: 0.4 }} />
            <div style={{ position: 'relative', padding: '48px 40px' }}>
              {/* Logo / Title */}
              <div style={{ textAlign: 'center', marginBottom: 36 }}>
                <div style={{
                  width: 56,
                  height: 56,
                  background: 'linear-gradient(135deg, #5B5FC7, #818CF8)',
                  borderRadius: 14,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                  boxShadow: '0 8px 24px rgba(91,95,199,0.25)',
                }}>
                  <span style={{ color: '#fff', fontSize: 24, fontWeight: 800, lineHeight: 1 }}>S</span>
                </div>
                <h1 style={{
                  color: '#1E293B',
                  fontSize: 24,
                  fontWeight: 700,
                  margin: 0,
                }}>
                  {t("login.title")}
                </h1>
                <p style={{
                  color: '#64748B',
                  fontSize: 14,
                  marginTop: 8,
                  marginBottom: 0,
                }}>
                  {t("login.subtitle")}
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: 20 }}>
                  <label style={{
                    display: 'block',
                    color: '#475569',
                    fontSize: 13,
                    marginBottom: 8,
                    fontWeight: 500,
                  }}>
                    {t("login.password")}
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t("login.placeholder")}
                    autoFocus
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      background: '#F8FAFC',
                      border: `1.5px solid ${error ? '#EF4444' : '#E2E8F0'}`,
                      borderRadius: 10,
                      color: '#1E293B',
                      fontSize: 15,
                      outline: 'none',
                      transition: 'border-color 0.2s, box-shadow 0.2s',
                      boxSizing: 'border-box',
                    }}
                    onFocus={(e) => {
                      if (!error) {
                        e.currentTarget.style.borderColor = '#5B5FC7'
                        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(91,95,199,0.1)'
                      }
                    }}
                    onBlur={(e) => {
                      if (!error) {
                        e.currentTarget.style.borderColor = '#E2E8F0'
                        e.currentTarget.style.boxShadow = 'none'
                      }
                    }}
                  />
                </div>

                {error && (
                  <div style={{
                    color: '#EF4444',
                    fontSize: 13,
                    marginBottom: 16,
                    padding: '8px 12px',
                    background: '#FEF2F2',
                    borderRadius: 8,
                    border: '1px solid #FECACA',
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
                      ? '#CBD5E1'
                      : 'linear-gradient(135deg, #5B5FC7, #7C3AED)',
                    border: 'none',
                    borderRadius: 10,
                    color: '#fff',
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: loading || !password ? 'not-allowed' : 'pointer',
                    transition: 'opacity 0.2s, transform 0.1s',
                    opacity: loading ? 0.7 : 1,
                    boxShadow: loading || !password ? 'none' : '0 4px 14px rgba(91,95,199,0.3)',
                  }}
                >
                  {loading ? t("login.signingIn") : t("login.signIn")}
                </button>
              </form>

              {/* Footer */}
              <p style={{
                textAlign: 'center',
                color: '#94A3B8',
                fontSize: 12,
                marginTop: 28,
                marginBottom: 0,
              }}>
                {t("login.version")}
              </p>
            </div>
          </div>
        </div>

        {/* Feature highlights */}
        <div style={{
          display: 'flex',
          gap: 32,
          maxWidth: 680,
          width: '100%',
          padding: '0 20px',
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}>
          {[
            { icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.58-3.25 3.93L12 22" />
                <path d="M12 2a4 4 0 0 0-4 4c0 1.95 1.4 3.58 3.25 3.93" />
                <path d="M16 16c-2.5-1.5-5.5-1.5-8 0" />
              </svg>
            ), title: t("login.feature1"), desc: t("login.feature1Desc") },
            { icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            ), title: t("login.feature2"), desc: t("login.feature2Desc") },
            { icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            ), title: t("login.feature3"), desc: t("login.feature3Desc") },
          ].map((f, i) => (
            <div key={i} style={{
              flex: '1 1 180px',
              maxWidth: 200,
              textAlign: 'center',
            }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: 'rgba(91,95,199,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 10px',
              }}>
                {f.icon}
              </div>
              <div style={{
                color: '#475569',
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 4,
              }}>
                {f.title}
              </div>
              <div style={{
                color: '#94A3B8',
                fontSize: 12,
                lineHeight: 1.5,
              }}>
                {f.desc}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
