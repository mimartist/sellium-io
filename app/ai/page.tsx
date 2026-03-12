'use client'

import { useState, useEffect, useRef } from 'react'
import { COLORS, CARD_STYLE } from '@/lib/design-tokens'
import { useTranslation } from '@/lib/i18n'

/* Gemini-style 4-pointed star */
const GeminiLogo = ({ s = 28 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 28 28" fill="none">
    <defs>
      <linearGradient id="gem1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#4285F4" />
        <stop offset="30%" stopColor="#9B72CB" />
        <stop offset="60%" stopColor="#D96570" />
        <stop offset="100%" stopColor="#D96570" />
      </linearGradient>
    </defs>
    <path d="M14 0C14 7.732 7.732 14 0 14C7.732 14 14 20.268 14 28C14 20.268 20.268 14 28 14C20.268 14 14 7.732 14 0Z" fill="url(#gem1)" />
  </svg>
)

const GeminiLogoSmall = ({ s = 16 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 28 28" fill="none">
    <defs>
      <linearGradient id="gem3" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#4285F4" />
        <stop offset="50%" stopColor="#9B72CB" />
        <stop offset="100%" stopColor="#D96570" />
      </linearGradient>
    </defs>
    <path d="M14 0C14 7.732 7.732 14 0 14C7.732 14 14 20.268 14 28C14 20.268 20.268 14 28 14C20.268 14 14 7.732 14 0Z" fill="url(#gem3)" />
  </svg>
)

interface InsightItem {
  type: string
  title: string
  desc: string
  color: string
  status: 'new' | 'applied' | 'skipped'
}

interface InsightGroup {
  id: string
  title: string
  titleKey?: string
  borderColor: string
  items: InsightItem[]
}

const GROUPS: InsightGroup[] = [
  {
    id: 'ads', titleKey: 'ai.adRecommendations', title: 'Ad Recommendations', borderColor: '#5B5FC7', items: [
      { type: 'WASTED SPEND', title: '€36 wasted spend — 20 negative keyword candidates', desc: '20 search terms like bio baumwolle, sport-bh, unterhemden spent €36 total with 0 sales. Add as negative keywords.', color: '#EF4444', status: 'new' },
      { type: 'CAMPAIGN', title: '3 campaigns ACOS 100%+ — pause or optimize', desc: "DE-Hipster AI-SP-KW (228.8%), Boxer_09_12-Auto_ata (304.3%), Brazilian (198.3%). Reduce bids by 50% or pause.", color: '#F59E0B', status: 'new' },
      { type: 'EFFICIENCY', title: 'MMS2001M ROAS 13.74x — increase budget', desc: 'MMS2001M €12.47 spend with €171.40 sales (ACOS 7.3%). Increase daily budget by 50%.', color: '#10B981', status: 'applied' },
      { type: 'SEARCH TERM', title: "71 converting terms — add to exact match", desc: "71 out of 878 terms generated sales. Best: b00fusjxnm (CVR 60%, ACOS 11.6%).", color: '#5B5FC7', status: 'new' },
      { type: 'BRAND', title: 'SB campaign ACOS 71.5% — above target', desc: "124,046 impressions, €252 spend. NTB orders 0. Reduce bids or switch to automatic bidding.", color: '#64748B', status: 'skipped' },
    ]
  },
  {
    id: 'stock', titleKey: 'ai.stockRecommendations', title: 'Stock Recommendations', borderColor: '#EF4444', items: [
      { type: 'URGENT', title: '39 SKUs out of stock — €158/day loss!', desc: 'MMS2390M (CVR 19.1%), MMS2001M (510 yearly sales). 32 units inbound but no inbound stock for MMS2001M.', color: '#EF4444', status: 'new' },
      { type: 'CRITICAL STOCK', title: '14 SKUs will run out within 14 days', desc: 'MMS2490L (2 days, CVR 16.9%), MMS2460L (6 days, CVR 34%!). Highest converting products are running out.', color: '#F59E0B', status: 'new' },
      { type: 'SIZE ANALYSIS', title: 'M sizes running out, XXL accumulating', desc: 'M: 1,753 sales but 19 SKUs out of stock. XXL: 648 sales but 672 units in stock. Shift ratios in favor of M.', color: '#5B5FC7', status: 'applied' },
      { type: 'STORAGE', title: '158 overstock + 3 dead products — €39/month storage', desc: 'MMS2420XL, MMS2461XXL, MMS2504XXL have zero sales — should be removed from FBA.', color: '#64748B', status: 'new' },
    ]
  },
  {
    id: 'profitability', titleKey: 'ai.profitRecommendations', title: 'Profitability Recommendations', borderColor: '#10B981', items: [
      { type: 'MARGIN', title: 'Average margin 18.4% — target should be 25%', desc: 'MMS2001 series most profitable at 22% margin. MMS2504 series at 8% margin, near loss threshold.', color: '#F59E0B', status: 'new' },
      { type: 'COMMISSION', title: '10% commission advantage on products under €20', desc: 'MMS2383M (€19.90) at price threshold. Set to €19.99, commission 15%→10%, margin +5%.', color: '#10B981', status: 'new' },
      { type: 'DISCOUNT', title: '3 products lose money at 20% discount', desc: 'MMS2504S, MMS2503M, MMS2504L — 20% discount drops below breakeven. Max 12% discount.', color: '#EF4444', status: 'new' },
    ]
  },
  {
    id: 'general', titleKey: 'ai.generalRecommendations', title: 'General Recommendations', borderColor: '#F59E0B', items: [
      { type: 'MARKET', title: 'DE market 78% of revenue — diversification needed', desc: 'FR, ES, IT total 15%. IT has 30% growth potential — start Italian listing optimization.', color: '#5B5FC7', status: 'new' },
      { type: 'SEASONALITY', title: 'Q4 sales 45% higher than Q2', desc: 'Stock planning for Nov-Dec should start in August. Lead time 45 days → order by end of July.', color: '#F59E0B', status: 'new' },
    ]
  },
]

const STATUS_MAP: Record<string, { lKey: string; bg: string; c: string }> = {
  new: { lKey: 'common.new', bg: '#EEF2FF', c: '#5B5FC7' },
  applied: { lKey: 'common.applied', bg: '#ECFDF5', c: '#10B981' },
  skipped: { lKey: 'common.skipped', bg: '#F8FAFC', c: '#94A3B8' },
}

const SUGGESTION_KEYS = [
  'ai.suggestion1',
  'ai.suggestion2',
  'ai.suggestion3',
  'ai.suggestion4',
  'ai.suggestion5',
  'ai.suggestion6',
]

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export default function AiOnerilerPage() {
  const { t } = useTranslation()
  const [activeGroup, setActiveGroup] = useState('all')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatRef = useRef<HTMLDivElement>(null)
  const initializedRef = useRef(false)

  // Set initial welcome message with translated text
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true
      setMessages([{ role: 'assistant', content: t('ai.chatWelcome') }])
    }
  }, [t])

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [messages, chatLoading])

  const sendMessage = async (text?: string) => {
    const msg = text || input.trim()
    if (!msg || chatLoading) return
    setInput('')
    const newMsgs: ChatMessage[] = [...messages, { role: 'user', content: msg }]
    setMessages(newMsgs)
    setChatLoading(true)
    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMsgs.map(m => ({ role: m.role, content: m.content })) }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply || t('ai.chatError') }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: t('ai.chatConnError') }])
    }
    setChatLoading(false)
  }

  const filteredGroups = activeGroup === 'all' ? GROUPS : GROUPS.filter(g => g.id === activeGroup)
  const totalInsights = GROUPS.reduce((s, g) => s + g.items.length, 0)
  const newCount = GROUPS.reduce((s, g) => s + g.items.filter(i => i.status === 'new').length, 0)

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: COLORS.text, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <GeminiLogo s={30} /> {t('ai.title')}
          </h1>
          <p style={{ fontSize: 13, color: COLORS.sub, margin: '2px 0 0' }}>{t('ai.subtitle', { total: String(totalInsights), new: String(newCount) })}</p>
        </div>
      </div>

      {/* AI Chat */}
      <div className="ai-chat-outer" style={{ marginBottom: 28 }}>
        <div className="ai-chat-inner">
          <div className="ai-chat-bg" />
          <div style={{ position: 'relative', zIndex: 1 }}>
            {/* Chat header */}
            <div style={{ padding: '20px 24px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                background: 'linear-gradient(135deg,#667eea,#764ba2,#f093fb)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 15px rgba(118,75,162,.3)',
              }}>
                <GeminiLogo s={24} />
              </div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: COLORS.text }}>{t('ai.chatName')}</div>
                <div style={{ fontSize: 11, color: COLORS.sub }}>{t('ai.chatDesc')}</div>
              </div>
              <div style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 600, padding: '4px 14px', borderRadius: 20, background: 'rgba(16,185,129,.1)', color: COLORS.green }}>● {t('ai.chatActive')}</div>
            </div>

            {/* Messages */}
            <div ref={chatRef} style={{ padding: '0 24px', maxHeight: 380, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {messages.map((m, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  {m.role === 'assistant' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <GeminiLogoSmall s={12} />
                      <span style={{ fontSize: 10, fontWeight: 600, color: COLORS.sub }}>{t('ai.chatName')}</span>
                    </div>
                  )}
                  <div className={m.role === 'user' ? 'ai-msg-user' : 'ai-msg-bot'} style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                </div>
              ))}
              {chatLoading && (
                <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                  <div className="ai-msg-bot">
                    <div className="ai-typing"><span /><span /><span /></div>
                  </div>
                </div>
              )}
            </div>

            {/* Suggestions */}
            {messages.length <= 2 && (
              <div style={{ padding: '14px 24px 0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {SUGGESTION_KEYS.map((key, i) => (
                  <button key={i} onClick={() => sendMessage(t(key))} style={{
                    padding: '7px 16px', borderRadius: 20,
                    border: '1px solid rgba(91,95,199,.15)', background: 'rgba(255,255,255,.7)',
                    backdropFilter: 'blur(4px)', fontSize: 11, fontWeight: 500,
                    color: '#64748B', cursor: 'pointer', transition: 'all .2s',
                  }}>{t(key)}</button>
                ))}
              </div>
            )}

            {/* Input */}
            <div style={{ padding: '16px 24px 20px', display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                placeholder={t('ai.chatPlaceholder')}
                disabled={chatLoading}
                style={{
                  flex: 1, padding: '13px 20px', borderRadius: 16,
                  border: '1px solid rgba(91,95,199,.12)', fontSize: 13,
                  outline: 'none', background: 'rgba(255,255,255,.8)',
                  backdropFilter: 'blur(8px)', transition: 'all .2s',
                }}
              />
              <button onClick={() => sendMessage()} disabled={chatLoading || !input.trim()} style={{
                width: 44, height: 44, borderRadius: 14, border: 'none',
                background: input.trim() ? 'linear-gradient(135deg,#5B5FC7,#764ba2)' : '#E2E8F0',
                color: '#fff', cursor: input.trim() ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all .2s', flexShrink: 0,
                boxShadow: input.trim() ? '0 4px 12px rgba(91,95,199,.3)' : 'none',
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" /></svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Group filters */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {[{ id: 'all', l: `${t('common.all')} (${totalInsights})` }, ...GROUPS.map(g => ({ id: g.id, l: `${(g.titleKey ? t(g.titleKey) : g.title).replace(` ${t('ai.recommendations')}`, '')} (${g.items.length})` }))].map(f => (
          <button key={f.id} onClick={() => setActiveGroup(f.id)} style={{
            padding: '7px 16px', borderRadius: 8,
            border: '1px solid #E2E8F0',
            background: activeGroup === f.id ? '#1E293B' : '#fff',
            color: activeGroup === f.id ? '#fff' : '#64748B',
            fontSize: 12, fontWeight: 500, cursor: 'pointer',
          }}>{f.l}</button>
        ))}
      </div>

      {/* Grouped insight cards */}
      {filteredGroups.map((group, gi) => (
        <div key={gi} style={{ ...CARD_STYLE, marginBottom: 20, overflow: 'hidden', borderTop: `1px solid ${group.borderColor}30`, borderRight: `1px solid ${group.borderColor}30`, borderBottom: `1px solid ${group.borderColor}30`, borderLeft: `2px solid ${group.borderColor}`, boxShadow: `0 2px 12px ${group.borderColor}08` }}>
          {/* Group header */}
          <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid #F1F5F9' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.text }}>{group.titleKey ? t(group.titleKey) : group.title}</div>
            <div style={{ fontSize: 12, color: COLORS.sub, marginTop: 2 }}>{group.items.length} {t('ai.recommendations')} · {group.items.filter(i => i.status === 'new').length} {t('common.new').toLowerCase()}</div>
          </div>

          {/* Items */}
          <div style={{ padding: '4px 0' }}>
            {group.items.map((item, ii) => {
              const st = STATUS_MAP[item.status]
              return (
                <div key={ii} style={{ padding: '14px 24px', borderBottom: ii < group.items.length - 1 ? '1px solid #F8FAFC' : 'none', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  <div style={{ width: 3, minHeight: 40, borderRadius: 2, background: item.color, marginTop: 2, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: item.color, letterSpacing: '.04em' }}>{item.type}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 600, padding: '2px 10px', borderRadius: 12, background: st.bg, color: st.c, flexShrink: 0 }}>{t(st.lKey)}</span>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.text, lineHeight: 1.4, marginBottom: 4 }}>{item.title}</div>
                    <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.5 }}>{item.desc}</div>
                    {item.status === 'new' && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <button style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: COLORS.accent, color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{t('common.apply')}</button>
                        <button style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid #E2E8F0', background: '#fff', color: '#64748B', fontSize: 11, fontWeight: 500, cursor: 'pointer' }}>{t('common.skip')}</button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
