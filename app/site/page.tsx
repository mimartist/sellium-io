'use client'
import { useEffect, useRef, useState } from 'react'

/* ═══════════════════════════════════════════════════════════
   SELLOMETRIX.IO — LANDING PAGE v2
   Dark, cinematic, data-driven one-page site
   ═══════════════════════════════════════════════════════════ */

// ─── Intersection Observer ───
function useInView(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); obs.disconnect() } }, { threshold })
    obs.observe(el); return () => obs.disconnect()
  }, [threshold])
  return { ref, inView }
}

// ─── Animated counter ───
function Counter({ end, suffix = '', prefix = '' }: { end: number; suffix?: string; prefix?: string }) {
  const [val, setVal] = useState(0)
  const { ref, inView } = useInView(0.3)
  useEffect(() => {
    if (!inView) return
    let start = 0; const dur = 2200
    const step = (ts: number) => { if (!start) start = ts; const p = Math.min((ts - start) / dur, 1); setVal(Math.floor(p * end)); if (p < 1) requestAnimationFrame(step) }
    requestAnimationFrame(step)
  }, [inView, end])
  return <span ref={ref}>{prefix}{val.toLocaleString()}{suffix}</span>
}

// ─── Live data ticker (scrolling numbers) ───
function DataTicker() {
  const items = [
    { label: 'Orders processed', value: '2.4M+', icon: '📦' },
    { label: 'Revenue tracked', value: '€127M+', icon: '💰' },
    { label: 'AI predictions', value: '98.7%', icon: '🎯' },
    { label: 'Avg response', value: '<200ms', icon: '⚡' },
    { label: 'Active sellers', value: '3,200+', icon: '🚀' },
    { label: 'Markets covered', value: '12+', icon: '🌍' },
    { label: 'Orders processed', value: '2.4M+', icon: '📦' },
    { label: 'Revenue tracked', value: '€127M+', icon: '💰' },
    { label: 'AI predictions', value: '98.7%', icon: '🎯' },
    { label: 'Avg response', value: '<200ms', icon: '⚡' },
    { label: 'Active sellers', value: '3,200+', icon: '🚀' },
    { label: 'Markets covered', value: '12+', icon: '🌍' },
  ]
  return (
    <div style={{ overflow: 'hidden', padding: '20px 0', borderTop: '1px solid rgba(255,255,255,.06)', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
      <div style={{ display: 'flex', gap: 48, animation: 'marquee 30s linear infinite', width: 'max-content' }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 20 }}>{it.icon}</span>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{it.value}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em' }}>{it.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Animated bar chart ───
function AnimatedChart({ inView }: { inView: boolean }) {
  const bars = [35, 52, 41, 68, 55, 72, 48, 82, 61, 90, 75, 95]
  const months = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 140, padding: '0 4px' }}>
      {bars.map((h, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: '100%', borderRadius: 4,
            height: inView ? `${h}%` : '0%',
            background: `linear-gradient(180deg, #818CF8 0%, #5B5FC7 100%)`,
            boxShadow: inView ? '0 0 12px rgba(129,140,248,.3)' : 'none',
            transition: `height 1s cubic-bezier(.4,0,.2,1) ${i * 80}ms, box-shadow .5s ease ${i * 80 + 600}ms`,
          }} />
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,.3)', fontWeight: 600 }}>{months[i]}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Animated line chart ───
function AnimatedLine({ inView }: { inView: boolean }) {
  const points = [20, 35, 28, 52, 45, 60, 48, 72, 65, 85, 78, 92]
  const w = 280, h = 100, px = w / (points.length - 1)
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${i * px} ${h - (p / 100) * h}`).join(' ')
  const area = `${path} L ${w} ${h} L 0 ${h} Z`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 100, overflow: 'visible' }}>
      <defs>
        <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10B981" stopOpacity=".3" />
          <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#lineGrad)" style={{ opacity: inView ? 1 : 0, transition: 'opacity 1.5s ease .5s' }} />
      <path d={path} fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        style={{ strokeDasharray: 1000, strokeDashoffset: inView ? 0 : 1000, transition: 'stroke-dashoffset 2s cubic-bezier(.4,0,.2,1) .3s' }} />
      {points.map((p, i) => (
        <circle key={i} cx={i * px} cy={h - (p / 100) * h} r="3" fill="#10B981"
          style={{ opacity: inView ? 1 : 0, transition: `opacity .3s ease ${i * 100 + 800}ms`, filter: 'drop-shadow(0 0 4px rgba(16,185,129,.5))' }} />
      ))}
    </svg>
  )
}

// ─── Live order feed ───
function OrderFeed({ inView }: { inView: boolean }) {
  const orders = [
    { sku: 'MMS2001M', qty: 3, total: '€84.90', market: '🇩🇪 DE', time: '2s ago' },
    { sku: 'MMS2490S', qty: 1, total: '€31.90', market: '🇪🇸 ES', time: '8s ago' },
    { sku: 'MMS2491M', qty: 2, total: '€63.80', market: '🇫🇷 FR', time: '15s ago' },
    { sku: 'MMS3390L', qty: 5, total: '€149.50', market: '🇮🇹 IT', time: '23s ago' },
    { sku: 'MMS1120S', qty: 1, total: '€28.90', market: '🇩🇪 DE', time: '31s ago' },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {orders.map((o, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,.04)',
          border: '1px solid rgba(255,255,255,.06)',
          opacity: inView ? 1 : 0, transform: inView ? 'translateX(0)' : 'translateX(20px)',
          transition: `all .5s cubic-bezier(.4,0,.2,1) ${i * 150 + 300}ms`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981', boxShadow: '0 0 8px rgba(16,185,129,.5)', animation: 'pulse 2s ease infinite' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{o.sku}</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,.4)' }}>x{o.qty}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,.5)' }}>{o.market}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#10B981' }}>{o.total}</span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,.25)' }}>{o.time}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── AI Insight bubble ───
function AIBubble({ text, delay, inView }: { text: string; delay: number; inView: boolean }) {
  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start',
      opacity: inView ? 1 : 0, transform: inView ? 'translateY(0)' : 'translateY(15px)',
      transition: `all .6s cubic-bezier(.4,0,.2,1) ${delay}ms`,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 10, flexShrink: 0,
        background: 'linear-gradient(135deg, #818CF8, #5B5FC7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 0 20px rgba(129,140,248,.3)',
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2a8 8 0 0 0-8 8c0 6 8 12 8 12s8-6 8-12a8 8 0 0 0-8-8z" stroke="#fff" strokeWidth="2" /><circle cx="12" cy="10" r="3" stroke="#fff" strokeWidth="2" /></svg>
      </div>
      <div style={{
        background: 'rgba(129,140,248,.08)', border: '1px solid rgba(129,140,248,.15)',
        borderRadius: '4px 14px 14px 14px', padding: '10px 14px',
        fontSize: 13, lineHeight: 1.5, color: 'rgba(255,255,255,.8)',
      }}>{text}</div>
    </div>
  )
}

// ─── Navbar ───
function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', h, { passive: true })
    return () => window.removeEventListener('scroll', h)
  }, [])
  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, padding: '14px 0',
      background: scrolled ? 'rgba(8,10,25,.85)' : 'transparent',
      backdropFilter: scrolled ? 'blur(20px) saturate(1.5)' : 'none',
      borderBottom: scrolled ? '1px solid rgba(255,255,255,.06)' : '1px solid transparent',
      transition: 'all .4s ease',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg, #818CF8, #5B5FC7)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 17, boxShadow: '0 0 20px rgba(129,140,248,.3)' }}>S</div>
          <span style={{ fontSize: 19, fontWeight: 800, color: '#fff' }}>Sellometrix</span>
        </div>
        <div className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          {['Features', 'How it Works', 'Pricing'].map(l => (
            <a key={l} href={`#${l.toLowerCase().replace(/\s/g, '-')}`} style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,.5)', textDecoration: 'none', transition: 'color .2s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#fff')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,.5)')}>{l}</a>
          ))}
          <a href="/login" style={{
            padding: '9px 22px', borderRadius: 10, fontSize: 13, fontWeight: 700,
            background: 'linear-gradient(135deg, #818CF8, #5B5FC7)', color: '#fff',
            textDecoration: 'none', boxShadow: '0 0 20px rgba(129,140,248,.25)',
            transition: 'transform .2s, box-shadow .2s',
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 0 30px rgba(129,140,248,.4)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 0 20px rgba(129,140,248,.25)' }}
          >Start Free</a>
        </div>
      </div>
    </nav>
  )
}

// ─── Grid background ───
function GridBg() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {/* Grid pattern */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
        maskImage: 'radial-gradient(ellipse 80% 60% at 50% 40%, black 30%, transparent 100%)',
        WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 40%, black 30%, transparent 100%)',
      }} />
      {/* Glow orbs */}
      <div style={{ position: 'absolute', width: 700, height: 700, borderRadius: '50%', background: 'radial-gradient(circle, rgba(129,140,248,.12) 0%, transparent 65%)', top: -300, left: '50%', transform: 'translateX(-50%)', animation: 'breathe 8s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(16,185,129,.08) 0%, transparent 65%)', bottom: -100, right: -100, animation: 'breathe 10s ease-in-out infinite 3s' }} />
      <div style={{ position: 'absolute', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(249,115,22,.06) 0%, transparent 65%)', top: '60%', left: -50, animation: 'breathe 12s ease-in-out infinite 5s' }} />
    </div>
  )
}

// ─── Feature card ───
function FeatureCard({ icon, title, desc, delay, gradient }: { icon: React.ReactNode; title: string; desc: string; delay: number; gradient: string }) {
  const { ref, inView } = useInView(0.12)
  const [hovered, setHovered] = useState(false)
  return (
    <div ref={ref} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.03)',
        borderRadius: 20, padding: '32px 24px', position: 'relative', overflow: 'hidden',
        border: `1px solid ${hovered ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.05)'}`,
        opacity: inView ? 1 : 0, transform: inView ? (hovered ? 'translateY(-6px)' : 'translateY(0)') : 'translateY(25px)',
        transition: `all .6s cubic-bezier(.4,0,.2,1) ${delay}ms`,
        cursor: 'default',
      }}>
      {/* Glow on hover */}
      <div style={{
        position: 'absolute', top: -40, right: -40, width: 120, height: 120, borderRadius: '50%',
        background: gradient, opacity: hovered ? .15 : 0, filter: 'blur(40px)', transition: 'opacity .4s ease',
      }} />
      <div style={{
        width: 48, height: 48, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: gradient, marginBottom: 18, boxShadow: `0 0 20px ${gradient.includes('#818CF8') ? 'rgba(129,140,248,.2)' : gradient.includes('#10B981') ? 'rgba(16,185,129,.2)' : 'rgba(249,115,22,.2)'}`,
        transform: hovered ? 'scale(1.1)' : 'scale(1)', transition: 'transform .3s ease',
      }}>{icon}</div>
      <h3 style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 8 }}>{title}</h3>
      <p style={{ fontSize: 14, lineHeight: 1.7, color: 'rgba(255,255,255,.5)', margin: 0 }}>{desc}</p>
    </div>
  )
}

// ─── Pricing ───
function PricingCard({ name, price, desc, features, popular, delay }: { name: string; price: string; desc: string; features: string[]; popular?: boolean; delay: number }) {
  const { ref, inView } = useInView(0.12)
  const [hovered, setHovered] = useState(false)
  return (
    <div ref={ref} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        background: popular ? 'linear-gradient(135deg, rgba(129,140,248,.15), rgba(91,95,199,.1))' : 'rgba(255,255,255,.03)',
        borderRadius: 24, padding: '36px 28px', position: 'relative', overflow: 'hidden',
        border: `1px solid ${popular ? 'rgba(129,140,248,.3)' : 'rgba(255,255,255,.06)'}`,
        boxShadow: popular ? '0 0 40px rgba(129,140,248,.1)' : 'none',
        opacity: inView ? 1 : 0, transform: inView ? (hovered ? 'translateY(-6px)' : 'translateY(0)') : 'translateY(25px)',
        transition: `all .6s cubic-bezier(.4,0,.2,1) ${delay}ms`,
      }}>
      {popular && <div style={{ position: 'absolute', top: 18, right: 18, background: 'linear-gradient(135deg, #818CF8, #5B5FC7)', color: '#fff', fontSize: 10, fontWeight: 800, padding: '4px 12px', borderRadius: 100, textTransform: 'uppercase', letterSpacing: '.08em' }}>Most Popular</div>}
      <div style={{ fontSize: 13, fontWeight: 700, color: popular ? '#818CF8' : 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>{name}</div>
      <div style={{ fontSize: 44, fontWeight: 900, color: '#fff', marginBottom: 4 }}>{price}<span style={{ fontSize: 15, fontWeight: 500, color: 'rgba(255,255,255,.3)' }}>{price !== 'Free' ? '/mo' : ''}</span></div>
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,.4)', marginBottom: 28 }}>{desc}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
        {features.map((f, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'rgba(255,255,255,.7)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke={popular ? '#818CF8' : '#10B981'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            {f}
          </div>
        ))}
      </div>
      <a href="/login" style={{
        display: 'block', textAlign: 'center', padding: '13px 0', borderRadius: 12,
        fontSize: 14, fontWeight: 700, textDecoration: 'none',
        background: popular ? 'linear-gradient(135deg, #818CF8, #5B5FC7)' : 'rgba(255,255,255,.06)',
        color: '#fff', border: popular ? 'none' : '1px solid rgba(255,255,255,.1)',
        boxShadow: popular ? '0 0 20px rgba(129,140,248,.25)' : 'none',
        transition: 'transform .2s, box-shadow .2s',
      }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)' }}
      >{popular ? 'Start Free Trial' : 'Get Started'}</a>
    </div>
  )
}

// ═══════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════
export default function LandingPage() {
  const heroChart = useInView(0.1)
  const dashSection = useInView(0.1)
  const aiSection = useInView(0.1)

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", background: '#080A19', color: '#fff', overflowX: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        html { scroll-behavior: smooth; }
        * { box-sizing: border-box; }

        @keyframes breathe { 0%, 100% { transform: translateX(-50%) scale(1); opacity: 1; } 50% { transform: translateX(-50%) scale(1.15); opacity: .7; } }
        @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .4; } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes gradientFlow { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        @keyframes glow { 0%, 100% { box-shadow: 0 0 20px rgba(129,140,248,.2); } 50% { box-shadow: 0 0 40px rgba(129,140,248,.4); } }
        @keyframes typewriter { from { width: 0; } to { width: 100%; } }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes scanline { 0% { top: -4px; } 100% { top: 100%; } }

        .hero-glow-text {
          background: linear-gradient(135deg, #818CF8 0%, #c084fc 30%, #818CF8 50%, #22d3ee 70%, #818CF8 100%);
          background-size: 300% 100%;
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          animation: gradientFlow 6s ease infinite;
        }

        @media (max-width: 768px) {
          .hero-title { font-size: 32px !important; line-height: 1.15 !important; }
          .hero-sub { font-size: 16px !important; }
          .features-grid { grid-template-columns: 1fr !important; }
          .dash-grid { grid-template-columns: 1fr !important; }
          .pricing-grid { grid-template-columns: 1fr !important; }
          .steps-grid { grid-template-columns: 1fr !important; gap: 32px !important; }
          .stats-row { grid-template-columns: repeat(2, 1fr) !important; gap: 24px !important; }
          .nav-links { display: none !important; }
          .hero-buttons { flex-direction: column !important; }
          .footer-grid { grid-template-columns: 1fr !important; gap: 32px !important; }
          .cta-title { font-size: 28px !important; }
        }
      `}</style>

      <Navbar />

      {/* ═══════ HERO ═══════ */}
      <section style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', overflow: 'hidden' }}>
        <GridBg />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 1200, margin: '0 auto', padding: '140px 24px 60px', textAlign: 'center' }}>
          {/* Badge */}
          <div style={{ animation: 'fadeUp .7s ease both', marginBottom: 28 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 18px', borderRadius: 100,
              background: 'rgba(129,140,248,.08)', border: '1px solid rgba(129,140,248,.15)',
              fontSize: 12, fontWeight: 700, color: '#818CF8',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', animation: 'pulse 2s ease infinite' }} />
              AI-Powered Analytics — Now Live
            </div>
          </div>

          {/* Title */}
          <h1 className="hero-title" style={{ fontSize: 68, fontWeight: 900, lineHeight: 1.08, margin: '0 0 24px', animation: 'fadeUp .7s ease .1s both' }}>
            See Everything.<br />
            <span className="hero-glow-text">Before Everyone.</span>
          </h1>

          {/* Subtitle */}
          <p className="hero-sub" style={{ fontSize: 19, lineHeight: 1.7, color: 'rgba(255,255,255,.45)', margin: '0 auto 40px', maxWidth: 580, animation: 'fadeUp .7s ease .2s both' }}>
            Orders, profits, ads, inventory, AI predictions — processed in real-time. Spot problems before they cost you. Scale faster with data.
          </p>

          {/* CTA buttons */}
          <div className="hero-buttons" style={{ display: 'flex', gap: 14, justifyContent: 'center', animation: 'fadeUp .7s ease .3s both' }}>
            <a href="/login" style={{
              padding: '15px 32px', borderRadius: 12, fontSize: 15, fontWeight: 700,
              background: 'linear-gradient(135deg, #818CF8, #5B5FC7)', color: '#fff',
              textDecoration: 'none', boxShadow: '0 0 30px rgba(129,140,248,.3)',
              transition: 'transform .2s, box-shadow .2s', display: 'inline-flex', alignItems: 'center', gap: 8,
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 0 50px rgba(129,140,248,.5)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 0 30px rgba(129,140,248,.3)' }}
            >
              Start Free — No Card Required
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M12 5l7 7-7 7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </a>
            <a href="#features" style={{
              padding: '15px 32px', borderRadius: 12, fontSize: 15, fontWeight: 700,
              background: 'rgba(255,255,255,.04)', color: 'rgba(255,255,255,.7)', textDecoration: 'none',
              border: '1px solid rgba(255,255,255,.1)', transition: 'all .2s',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.08)'; e.currentTarget.style.color = '#fff' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,.04)'; e.currentTarget.style.color = 'rgba(255,255,255,.7)' }}
            >Watch Demo</a>
          </div>

          {/* Mini dashboard preview */}
          <div ref={heroChart.ref} style={{
            marginTop: 60, maxWidth: 800, marginInline: 'auto', borderRadius: 20, overflow: 'hidden',
            background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)',
            boxShadow: '0 40px 100px rgba(0,0,0,.3)',
            opacity: heroChart.inView ? 1 : 0, transform: heroChart.inView ? 'perspective(1200px) rotateX(0deg)' : 'perspective(1200px) rotateX(8deg)',
            transition: 'all 1s cubic-bezier(.4,0,.2,1) .4s',
          }}>
            {/* Titlebar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF5F57' }} />
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FEBC2E' }} />
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28C840' }} />
              <div style={{ flex: 1, textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,.25)' }}>app.sellometrix.io</div>
            </div>
            <div style={{ padding: 24 }}>
              {/* KPI row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
                {[
                  { l: 'Revenue', v: '€47,892', c: '+12.4%', color: '#818CF8' },
                  { l: 'Net Profit', v: '€8,234', c: '+8.7%', color: '#10B981' },
                  { l: 'Units', v: '2,847', c: '+15.2%', color: '#F97316' },
                  { l: 'ROAS', v: '4.2x', c: '+0.8x', color: '#22D3EE' },
                ].map((k, i) => (
                  <div key={i} style={{
                    background: 'rgba(255,255,255,.03)', borderRadius: 12, padding: '14px 12px',
                    border: '1px solid rgba(255,255,255,.04)',
                    opacity: heroChart.inView ? 1 : 0, transform: heroChart.inView ? 'translateY(0)' : 'translateY(10px)',
                    transition: `all .5s ease ${i * 100 + 600}ms`,
                  }}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>{k.l}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{k.v}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: k.color, marginTop: 2 }}>{k.c}</div>
                  </div>
                ))}
              </div>
              {/* Chart + side */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                <div style={{ background: 'rgba(255,255,255,.03)', borderRadius: 12, padding: '16px 14px', border: '1px solid rgba(255,255,255,.04)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.5)', marginBottom: 12 }}>Monthly Revenue</div>
                  <AnimatedChart inView={heroChart.inView} />
                </div>
                <div style={{ background: 'rgba(255,255,255,.03)', borderRadius: 12, padding: '16px 14px', border: '1px solid rgba(255,255,255,.04)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.5)', marginBottom: 12 }}>Profit Trend</div>
                  <AnimatedLine inView={heroChart.inView} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ DATA TICKER ═══════ */}
      <DataTicker />

      {/* ═══════ LIVE DASHBOARD ═══════ */}
      <section ref={dashSection.ref} style={{ position: 'relative', padding: '100px 24px', overflow: 'hidden' }}>
        <GridBg />
        <div style={{ maxWidth: 1200, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#818CF8', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: 12 }}>Real-Time Processing</div>
            <h2 style={{ fontSize: 40, fontWeight: 900, margin: '0 0 14px' }}>Every Order. Every Metric. <span style={{ color: '#10B981' }}>Instantly.</span></h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,.4)', maxWidth: 550, margin: '0 auto' }}>Your data flows in real-time. No delays, no manual imports. See your business pulse as it happens.</p>
          </div>
          <div className="dash-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Live orders */}
            <div style={{ background: 'rgba(255,255,255,.03)', borderRadius: 20, padding: '24px 20px', border: '1px solid rgba(255,255,255,.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10B981', animation: 'pulse 1.5s ease infinite', boxShadow: '0 0 10px rgba(16,185,129,.5)' }} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Live Order Feed</span>
                </div>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,.25)', fontWeight: 600 }}>STREAMING</span>
              </div>
              <OrderFeed inView={dashSection.inView} />
            </div>
            {/* Stats grid */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {[
                  { label: 'Avg Processing', value: '<200ms', icon: '⚡', color: '#F97316' },
                  { label: 'Accuracy', value: '99.97%', icon: '🎯', color: '#818CF8' },
                  { label: 'Uptime', value: '99.99%', icon: '🛡️', color: '#10B981' },
                  { label: 'Data Points/sec', value: '14,200', icon: '📊', color: '#22D3EE' },
                ].map((s, i) => (
                  <div key={i} style={{
                    background: 'rgba(255,255,255,.03)', borderRadius: 14, padding: '18px 16px',
                    border: '1px solid rgba(255,255,255,.06)',
                    opacity: dashSection.inView ? 1 : 0, transform: dashSection.inView ? 'translateY(0)' : 'translateY(15px)',
                    transition: `all .5s ease ${i * 120 + 200}ms`,
                  }}>
                    <div style={{ fontSize: 20, marginBottom: 8 }}>{s.icon}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,.35)', fontWeight: 600, marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              {/* Alert preview */}
              <div style={{
                background: 'rgba(249,115,22,.06)', borderRadius: 14, padding: '16px 18px',
                border: '1px solid rgba(249,115,22,.15)',
                opacity: dashSection.inView ? 1 : 0, transform: dashSection.inView ? 'translateY(0)' : 'translateY(15px)',
                transition: 'all .6s ease .8s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 16 }}>⚠️</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#F97316' }}>Stockout Alert</span>
                </div>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', margin: 0, lineHeight: 1.5 }}>MMS2001M has 12 units left with 8.4 days of stock. Current velocity: 1.4 units/day. Reorder recommended.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ AI SECTION ═══════ */}
      <section ref={aiSection.ref} style={{ position: 'relative', padding: '100px 24px', overflow: 'hidden' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#818CF8', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: 12 }}>AI Intelligence</div>
            <h2 style={{ fontSize: 40, fontWeight: 900, margin: '0 0 14px' }}>Your AI Co-Pilot for <span className="hero-glow-text">Smarter Decisions</span></h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,.4)', maxWidth: 550, margin: '0 auto' }}>Ask anything about your business. Get instant answers backed by your real data.</p>
          </div>
          <div className="dash-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, maxWidth: 900, margin: '0 auto' }}>
            {/* AI chat preview */}
            <div style={{
              background: 'rgba(255,255,255,.03)', borderRadius: 20, padding: '24px 20px',
              border: '1px solid rgba(255,255,255,.06)', display: 'flex', flexDirection: 'column', gap: 14,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, #818CF8, #5B5FC7)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 15px rgba(129,140,248,.3)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 2a8 8 0 0 0-8 8c0 6 8 12 8 12s8-6 8-12a8 8 0 0 0-8-8z" stroke="#fff" strokeWidth="2" /><circle cx="12" cy="10" r="3" stroke="#fff" strokeWidth="2" /></svg>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>AI Assistant</span>
                <span style={{ fontSize: 10, color: '#10B981', fontWeight: 600, marginLeft: 'auto' }}>Online</span>
              </div>
              <AIBubble inView={aiSection.inView} delay={200} text="Your MMS2490S has 23% lower margin than last month. The root cause is a €2.40 increase in FBA fees since Jan 15." />
              <AIBubble inView={aiSection.inView} delay={600} text="Recommend increasing price by €1.50 or switching to FBM for orders under 2 units. Projected margin recovery: +18%." />
              <AIBubble inView={aiSection.inView} delay={1000} text="3 competitors ran out of stock on similar items in DE marketplace. This is an opportunity to capture +40% more impressions this week." />
            </div>
            {/* AI capabilities */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { icon: '🔮', title: 'Predictive Analytics', desc: 'Forecast stockouts, demand spikes, and margin erosion before they happen' },
                { icon: '🧠', title: 'Root Cause Analysis', desc: 'Automatically identifies why metrics changed and suggests actions' },
                { icon: '📈', title: 'Opportunity Detection', desc: 'Spots market gaps, competitor stockouts, and pricing opportunities' },
                { icon: '⚡', title: 'Instant Answers', desc: 'Ask questions in plain language and get data-backed answers in seconds' },
              ].map((cap, i) => (
                <div key={i} style={{
                  background: 'rgba(255,255,255,.03)', borderRadius: 14, padding: '18px 16px',
                  border: '1px solid rgba(255,255,255,.06)', display: 'flex', gap: 14, alignItems: 'flex-start',
                  opacity: aiSection.inView ? 1 : 0, transform: aiSection.inView ? 'translateX(0)' : 'translateX(20px)',
                  transition: `all .5s ease ${i * 150 + 400}ms`,
                }}>
                  <span style={{ fontSize: 24, flexShrink: 0 }}>{cap.icon}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{cap.title}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', lineHeight: 1.5 }}>{cap.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ FEATURES ═══════ */}
      <section id="features" style={{ position: 'relative', padding: '100px 24px', overflow: 'hidden' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#818CF8', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: 12 }}>Features</div>
            <h2 style={{ fontSize: 40, fontWeight: 900, margin: '0 0 14px' }}>Built for Serious Sellers</h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,.4)', maxWidth: 500, margin: '0 auto' }}>Every tool you need to dominate your marketplace.</p>
          </div>
          <div className="features-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
            <FeatureCard delay={0} gradient="linear-gradient(135deg, #818CF8, #5B5FC7)"
              icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></svg>}
              title="Real-Time P&L" desc="Automated COGS, fee breakdowns, margin analysis. Know your true profit on every single order." />
            <FeatureCard delay={100} gradient="linear-gradient(135deg, #F97316, #EA580C)"
              icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M18 20V10M12 20V4M6 20v-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></svg>}
              title="Ad Intelligence" desc="PPC campaigns dissected: ACOS, ROAS, TACoS across SP, SB, SD. Optimize spend with AI recommendations." />
            <FeatureCard delay={200} gradient="linear-gradient(135deg, #10B981, #059669)"
              icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></svg>}
              title="Smart Inventory" desc="Stockout predictions, meltable tracking, reorder alerts. Never lose a sale to empty shelves." />
            <FeatureCard delay={300} gradient="linear-gradient(135deg, #22D3EE, #0891B2)"
              icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 22c5.5 0 10-4.5 10-10S17.5 2 12 2 2 6.5 2 12s4.5 10 10 10z" stroke="#fff" strokeWidth="2" /><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10A15.3 15.3 0 0112 2" stroke="#fff" strokeWidth="2" /></svg>}
              title="Multi-Marketplace" desc="EU, NA, and beyond. One dashboard for all your Amazon markets. Compare performance across regions." />
            <FeatureCard delay={400} gradient="linear-gradient(135deg, #EC4899, #DB2777)"
              icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></svg>}
              title="Performance Reports" desc="Automated daily, weekly, monthly reports. Identify bestsellers, losers, and trends at a glance." />
            <FeatureCard delay={500} gradient="linear-gradient(135deg, #FBBF24, #D97706)"
              icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 2l3 6.3L22 9.3l-5 4.8 1.2 6.9L12 17.8l-6.2 3.2L7 14.1 2 9.3l6.9-1L12 2z" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></svg>}
              title="Competitor Monitor" desc="Track competitor pricing, stock levels, and BSR. Get alerted when opportunities emerge." />
          </div>
        </div>
      </section>

      {/* ═══════ HOW IT WORKS ═══════ */}
      <section id="how-it-works" style={{ position: 'relative', padding: '100px 24px', overflow: 'hidden' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#818CF8', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: 12 }}>How It Works</div>
            <h2 style={{ fontSize: 40, fontWeight: 900, margin: 0 }}>Live in Under 5 Minutes</h2>
          </div>
          <div className="steps-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 40 }}>
            {[
              { num: '01', title: 'Connect', desc: 'Link your Amazon Seller Central via secure OAuth. Zero passwords shared.', icon: '🔗' },
              { num: '02', title: 'Sync', desc: 'We pull your entire history — sales, ads, inventory, fees. Real-time sync starts immediately.', icon: '⚡' },
              { num: '03', title: 'Dominate', desc: 'AI starts analyzing. Get insights, predictions, and actionable alerts from day one.', icon: '🚀' },
            ].map((s, i) => {
              const obs = useInView(0.15)
              return (
                <div key={i} ref={obs.ref} style={{
                  textAlign: 'center',
                  opacity: obs.inView ? 1 : 0, transform: obs.inView ? 'translateY(0)' : 'translateY(25px)',
                  transition: `all .6s cubic-bezier(.4,0,.2,1) ${i * 200}ms`,
                }}>
                  <div style={{ fontSize: 40, marginBottom: 16 }}>{s.icon}</div>
                  <div style={{ fontSize: 48, fontWeight: 900, color: 'rgba(129,140,248,.15)', marginBottom: -20, position: 'relative', zIndex: 0 }}>{s.num}</div>
                  <h3 style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 8, position: 'relative', zIndex: 1 }}>{s.title}</h3>
                  <p style={{ fontSize: 14, lineHeight: 1.7, color: 'rgba(255,255,255,.4)', margin: 0, maxWidth: 280, marginInline: 'auto' }}>{s.desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ═══════ STATS ═══════ */}
      <section style={{ padding: '80px 24px', borderTop: '1px solid rgba(255,255,255,.06)', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
        <div className="stats-row" style={{ maxWidth: 1000, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 40, textAlign: 'center' }}>
          {[
            { end: 3200, suffix: '+', label: 'Active Sellers' },
            { end: 127, prefix: '€', suffix: 'M', label: 'Revenue Tracked' },
            { end: 24, suffix: 'M', label: 'Orders Processed' },
            { end: 99, suffix: '.99%', label: 'Uptime SLA' },
          ].map((s, i) => (
            <div key={i}>
              <div style={{ fontSize: 42, fontWeight: 900, color: '#fff' }}>
                <Counter end={s.end} suffix={s.suffix} prefix={s.prefix} />
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.3)', fontWeight: 600, marginTop: 6, textTransform: 'uppercase', letterSpacing: '.08em' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════ PRICING ═══════ */}
      <section id="pricing" style={{ position: 'relative', padding: '100px 24px', overflow: 'hidden' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#818CF8', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: 12 }}>Pricing</div>
            <h2 style={{ fontSize: 40, fontWeight: 900, margin: '0 0 14px' }}>Start Free. Scale When Ready.</h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,.4)', maxWidth: 450, margin: '0 auto' }}>No hidden fees. No contracts. Cancel anytime.</p>
          </div>
          <div className="pricing-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
            <PricingCard delay={0} name="Starter" price="Free" desc="For getting started"
              features={['1 Marketplace', '50 SKUs', 'Basic P&L', 'Weekly Reports']} />
            <PricingCard delay={150} name="Pro" price="€49" desc="For growing sellers" popular
              features={['5 Marketplaces', 'Unlimited SKUs', 'AI Assistant', 'Ad Analytics', 'Priority Support']} />
            <PricingCard delay={300} name="Enterprise" price="€149" desc="For large operations"
              features={['Unlimited Markets', 'Custom Integrations', 'Dedicated Manager', 'API Access', 'SLA Guarantee']} />
          </div>
        </div>
      </section>

      {/* ═══════ CTA ═══════ */}
      <section style={{ padding: '100px 24px' }}>
        <div style={{
          maxWidth: 900, margin: '0 auto', borderRadius: 28, padding: '80px 40px',
          background: 'linear-gradient(135deg, rgba(129,140,248,.1), rgba(91,95,199,.05))',
          border: '1px solid rgba(129,140,248,.15)', textAlign: 'center', position: 'relative', overflow: 'hidden',
          boxShadow: '0 0 80px rgba(129,140,248,.08)',
        }}>
          <div style={{ position: 'absolute', top: -100, right: -100, width: 300, height: 300, borderRadius: '50%', background: 'rgba(129,140,248,.06)', filter: 'blur(60px)' }} />
          <div style={{ position: 'absolute', bottom: -80, left: -80, width: 250, height: 250, borderRadius: '50%', background: 'rgba(16,185,129,.04)', filter: 'blur(50px)' }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <h2 className="cta-title" style={{ fontSize: 42, fontWeight: 900, margin: '0 0 14px' }}>Stop Guessing. Start Knowing.</h2>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,.4)', margin: '0 0 36px', maxWidth: 480, marginInline: 'auto' }}>Join 3,200+ Amazon sellers who use Sellometrix to see what others can't.</p>
            <a href="/login" style={{
              display: 'inline-flex', alignItems: 'center', gap: 10, padding: '16px 36px', borderRadius: 14,
              fontSize: 16, fontWeight: 700, background: 'linear-gradient(135deg, #818CF8, #5B5FC7)', color: '#fff',
              textDecoration: 'none', boxShadow: '0 0 30px rgba(129,140,248,.3)', animation: 'glow 3s ease infinite',
              transition: 'transform .2s',
            }}
              onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-3px)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
            >
              Start Free Trial
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M12 5l7 7-7 7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </a>
          </div>
        </div>
      </section>

      {/* ═══════ FOOTER ═══════ */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,.06)', padding: '60px 24px 40px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div className="footer-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 48, marginBottom: 48 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #818CF8, #5B5FC7)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 16 }}>S</div>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>Sellometrix</span>
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.7, color: 'rgba(255,255,255,.3)', maxWidth: 260, margin: 0 }}>AI-powered analytics for Amazon sellers. See everything. Before everyone.</p>
            </div>
            {[
              { title: 'Product', links: ['Features', 'Pricing', 'Integrations', 'Changelog'] },
              { title: 'Company', links: ['About', 'Blog', 'Careers', 'Contact'] },
              { title: 'Legal', links: ['Privacy', 'Terms', 'Security', 'GDPR'] },
            ].map((col, i) => (
              <div key={i}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.25)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 14 }}>{col.title}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {col.links.map(l => (
                    <a key={l} href="#" style={{ fontSize: 13, color: 'rgba(255,255,255,.35)', textDecoration: 'none', transition: 'color .2s' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#fff')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,.35)')}>{l}</a>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,.06)', paddingTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,.2)' }}>&copy; 2026 Sellometrix. All rights reserved.</span>
            <div style={{ display: 'flex', gap: 12 }}>
              {[
                <path key="x" d="M4 4l11.7 16H20L8.3 4H4zm1.2 1h2.5l11.1 14h-2.5L5.2 5z" />,
                <path key="li" d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-4 0v7h-4v-7a6 6 0 016-6zM2 9h4v12H2zM4 2a2 2 0 110 4 2 2 0 010-4z" />,
              ].map((path, i) => (
                <a key={i} href="#" style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .2s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.1)')} onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,.04)')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(255,255,255,.4)">{path}</svg>
                </a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
