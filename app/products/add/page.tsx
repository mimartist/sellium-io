'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { COLORS, CARD_STYLE } from '@/lib/design-tokens'
import { useTranslation } from '@/lib/i18n'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function AddProductsPage() {
  const { t } = useTranslation()
  const [asinInput, setAsinInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [existingAsins, setExistingAsins] = useState<Set<string>>(new Set())
  const [recentlyAdded, setRecentlyAdded] = useState<string[]>([])
  const [showSuccess, setShowSuccess] = useState(false)
  const [showError, setShowError] = useState(false)

  useEffect(() => {
    async function loadExisting() {
      const { data } = await supabase.from('product_registry').select('asin')
      setExistingAsins(new Set((data || []).map((r: any) => r.asin)))
    }
    loadExisting()
  }, [])

  const parsedAsins = asinInput
    .split(/[\n,;\s]+/)
    .map(s => s.trim().toUpperCase())
    .filter(s => /^B[0-9A-Z]{9}$/.test(s))

  const uniqueAsins = [...new Set(parsedAsins)]
  const newAsins = uniqueAsins.filter(a => !existingAsins.has(a))
  const dupeAsins = uniqueAsins.filter(a => existingAsins.has(a))

  const [webhookStatus, setWebhookStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')

  const triggerN8nWebhook = async (asins: string[]): Promise<boolean> => {
    setWebhookStatus('sending')
    try {
      const asinParam = encodeURIComponent(asins.join(','))
      const res = await fetch(`https://mimosso.app.n8n.cloud/webhook/add-products?asins=${asinParam}`)
      if (res.ok) {
        setWebhookStatus('success')
        return true
      } else {
        setWebhookStatus('error')
        return false
      }
    } catch {
      setWebhookStatus('error')
      return false
    }
  }

  const handleAddAsins = useCallback(async () => {
    if (newAsins.length === 0 || saving) return
    setSaving(true)
    setMessage(null)
    setWebhookStatus('idle')
    setShowSuccess(false)
    setShowError(false)

    setMessage({ text: t('productsAdd.fetchingAsins', { count: newAsins.length }), type: 'success' })
    setAsinInput('')

    const success = await triggerN8nWebhook(newAsins)
    setSaving(false)

    if (success) {
      setRecentlyAdded(prev => [...newAsins, ...prev])
      setExistingAsins(prev => {
        const next = new Set(prev)
        newAsins.forEach(a => next.add(a))
        return next
      })
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 3000)
    } else {
      setMessage({ text: t('productsAdd.failedToRegister', { count: newAsins.length }), type: 'error' })
      setShowError(true)
      setTimeout(() => setShowError(false), 5000)
    }
  }, [newAsins, saving])

  return (
    <>
      {/* SUCCESS POP-UP */}
      {showSuccess && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 9999,
          padding: '14px 24px', borderRadius: 12,
          background: '#fff', border: `1px solid ${COLORS.greenLight}`,
          boxShadow: '0 8px 30px rgba(16,185,129,0.15)',
          display: 'flex', alignItems: 'center', gap: 10,
          animation: 'slideIn 0.3s ease',
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: COLORS.greenLight,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16,
          }}>✓</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text }}>{t('productsAdd.registrationSuccess')}</div>
            <div style={{ fontSize: 12, color: COLORS.sub }}>{t('productsAdd.fetchingFromAmazon')}</div>
          </div>
          <button onClick={() => setShowSuccess(false)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 16, color: COLORS.sub, marginLeft: 8,
          }}>✕</button>
        </div>
      )}

      {/* ERROR POP-UP */}
      {showError && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 9999,
          padding: '14px 24px', borderRadius: 12,
          background: '#fff', border: `1px solid ${COLORS.redLight}`,
          boxShadow: '0 8px 30px rgba(239,68,68,0.15)',
          display: 'flex', alignItems: 'center', gap: 10,
          animation: 'slideIn 0.3s ease',
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: COLORS.redLight,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, color: COLORS.red,
          }}>✕</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text }}>{t('productsAdd.registrationFailed')}</div>
            <div style={{ fontSize: 12, color: COLORS.sub }}>{t('productsAdd.serverUnreachable')}</div>
          </div>
          <button onClick={() => setShowError(false)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 16, color: COLORS.sub, marginLeft: 8,
          }}>✕</button>
        </div>
      )}

      {/* HEADER */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: COLORS.text }}>{t('productsLayout.addProducts')}</h1>
        <p style={{ fontSize: 13, color: COLORS.sub, marginTop: 2, margin: 0 }}>
          {t('productsAdd.subtitle')}
        </p>
      </div>

      {/* INPUT CARD */}
      <div style={{ ...CARD_STYLE, padding: '24px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.accent }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>{t('productsAdd.bulkAsinEntry')}</span>
        </div>

        <textarea
          value={asinInput}
          onChange={e => { setAsinInput(e.target.value); setMessage(null) }}
          placeholder={t('productsAdd.placeholder')}
          style={{
            width: '100%', minHeight: 140, padding: '14px 16px', borderRadius: 10,
            border: `1px solid ${COLORS.border}`, fontSize: 13, fontFamily: 'monospace',
            outline: 'none', resize: 'vertical', color: COLORS.text, lineHeight: 1.7,
            background: '#FAFBFC',
          }}
        />

        {/* Live counter */}
        {asinInput.trim() && (
          <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: COLORS.green, fontWeight: 500 }}>
              ✓ {newAsins.length} {t('common.new').toLowerCase()}
            </span>
            {dupeAsins.length > 0 && (
              <span style={{ fontSize: 12, color: COLORS.orange, fontWeight: 500 }}>
                ⟳ {dupeAsins.length} {t('productsAdd.alreadyRegistered')}
              </span>
            )}
            {uniqueAsins.length !== parsedAsins.length && (
              <span style={{ fontSize: 12, color: COLORS.sub }}>
                {parsedAsins.length - uniqueAsins.length} {t('productsAdd.duplicatesInInput')}
              </span>
            )}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
          <button
            onClick={handleAddAsins}
            disabled={saving || newAsins.length === 0}
            style={{
              padding: '10px 24px', fontSize: 13, fontWeight: 600, borderRadius: 8,
              background: newAsins.length > 0 ? COLORS.accent : '#E2E8F0',
              border: 'none', color: '#fff',
              cursor: newAsins.length > 0 ? 'pointer' : 'default',
              transition: 'all 0.2s',
            }}
          >
            {saving ? t('productsAdd.saving') : t('productsAdd.addAsins', { count: newAsins.length > 0 ? newAsins.length : '' })}
          </button>

          {asinInput.trim() && newAsins.length === 0 && uniqueAsins.length > 0 && (
            <span style={{ fontSize: 12, color: COLORS.orange }}>{t('productsAdd.allAlreadyRegistered')}</span>
          )}
        </div>

        {/* Message */}
        {message && (
          <div style={{
            marginTop: 14, padding: '10px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500,
            background: message.type === 'success' ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
            color: message.type === 'success' ? COLORS.green : COLORS.red,
          }}>
            {message.text}
          </div>
        )}

        {/* Webhook / Data Fetch Status */}
        {webhookStatus !== 'idle' && (
          <div style={{
            marginTop: 10, padding: '10px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500,
            display: 'flex', alignItems: 'center', gap: 8,
            background: webhookStatus === 'sending' ? 'rgba(91,95,199,0.06)' :
                        webhookStatus === 'success' ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)',
            color: webhookStatus === 'sending' ? COLORS.accent :
                   webhookStatus === 'success' ? COLORS.green : COLORS.red,
          }}>
            {webhookStatus === 'sending' && (
              <>
                <span style={{ display: 'inline-block', width: 14, height: 14, border: `2px solid ${COLORS.border}`, borderTopColor: COLORS.accent, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                {t('productsAdd.fetchingFromAmazonStatus')}
              </>
            )}
            {webhookStatus === 'success' && `✓ ${t('productsAdd.webhookSuccess')}`}
            {webhookStatus === 'error' && `⚠ ${t('productsAdd.webhookError')}`}
          </div>
        )}
      </div>

      {/* RECENTLY ADDED */}
      {recentlyAdded.length > 0 && (
        <div style={{ ...CARD_STYLE, padding: '18px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.green }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>{t('productsAdd.recentlyAdded')}</span>
            <span style={{ fontSize: 11, color: COLORS.sub, marginLeft: 4 }}>{t('productsAdd.asinsThisSession', { count: recentlyAdded.length })}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {recentlyAdded.map(asin => (
              <span key={asin} style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                fontFamily: 'monospace', background: 'rgba(16,185,129,0.08)', color: COLORS.green,
              }}>
                {asin}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* HELP */}
      <div style={{ ...CARD_STYLE, padding: '18px 24px', marginTop: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, marginBottom: 10 }}>{t('productsAdd.howItWorks')}</div>
        <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.8 }}>
          <div><span style={{ fontWeight: 600, color: COLORS.text }}>1.</span> {t('productsAdd.step1')}</div>
          <div><span style={{ fontWeight: 600, color: COLORS.text }}>2.</span> {t('productsAdd.step2pre')} <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: 'rgba(245,158,11,0.1)', color: '#F59E0B' }}>{t('products.pendingStatus')}</span> {t('productsAdd.step2post')}</div>
          <div><span style={{ fontWeight: 600, color: COLORS.text }}>3.</span> {t('productsAdd.step3pre')} <span style={{ fontWeight: 600, color: COLORS.accent }}>{t('productsAdd.step3auto')}</span> {t('productsAdd.step3post')}</div>
          <div><span style={{ fontWeight: 600, color: COLORS.text }}>4.</span> {t('productsAdd.step4pre')} <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: 'rgba(16,185,129,0.1)', color: '#10B981' }}>{t('products.activeStatus')}</span> {t('productsAdd.step4mid')} <span style={{ fontWeight: 600, color: COLORS.accent }}>{t('products.title')}</span> {t('productsAdd.step4post')}</div>
        </div>
      </div>
    </>
  )
}
