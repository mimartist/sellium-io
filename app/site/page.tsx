'use client'
import { useEffect, useRef, useState, useCallback } from 'react'

/* ═══════════════════════════════════════════════════════════
   SELLOMETRIX.IO — LANDING PAGE
   One-page animated marketing site
   ═══════════════════════════════════════════════════════════ */

// ─── Intersection Observer hook ───
function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); obs.disconnect() } }, { threshold })
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return { ref, inView }
}

// ─── Animated counter ───
function Counter({ end, suffix = '', prefix = '' }: { end: number; suffix?: string; prefix?: string }) {
  const [val, setVal] = useState(0)
  const { ref, inView } = useInView(0.3)
  useEffect(() => {
    if (!inView) return
    let start = 0
    const duration = 2000
    const step = (ts: number) => {
      if (!start) start = ts
      const p = Math.min((ts - start) / duration, 1)
      setVal(Math.floor(p * end))
      if (p < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [inView, end])
  return <span ref={ref}>{prefix}{val.toLocaleString()}{suffix}</span>
}

// ─── Floating orbs ───
function Orbs() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      <div style={{ position: 'absolute', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(91,95,199,.12) 0%, transparent 70%)', top: -200, right: -200, animation: 'floatOrb 20s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,.10) 0%, transparent 70%)', bottom: -150, left: -150, animation: 'floatOrb 25s ease-in-out infinite reverse' }} />
      <div style={{ position: 'absolute', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(234,88,12,.08) 0%, transparent 70%)', top: '40%', left: '60%', animation: 'floatOrb 18s ease-in-out infinite 3s' }} />
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
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      padding: '16px 0',
      background: scrolled ? 'rgba(255,255,255,.92)' : 'transparent',
      backdropFilter: scrolled ? 'blur(20px)' : 'none',
      borderBottom: scrolled ? '1px solid rgba(0,0,0,.06)' : '1px solid transparent',
      transition: 'all .4s cubic-bezier(.4,0,.2,1)',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #5B5FC7, #7C3AED)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 18 }}>S</div>
          <span style={{ fontSize: 20, fontWeight: 800, background: 'linear-gradient(135deg, #5B5FC7, #7C3AED)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Sellometrix</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          {['Features', 'How it Works', 'Pricing'].map(l => (
            <a key={l} href={`#${l.toLowerCase().replace(/\s/g, '-')}`} style={{ fontSize: 14, fontWeight: 600, color: '#475569', textDecoration: 'none', transition: 'color .2s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#5B5FC7')}
              onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
            >{l}</a>
          ))}
          <a href="/login" style={{
            padding: '10px 24px', borderRadius: 10, fontSize: 14, fontWeight: 700,
            background: 'linear-gradient(135deg, #5B5FC7, #7C3AED)', color: '#fff',
            textDecoration: 'none', boxShadow: '0 4px 14px rgba(91,95,199,.3)',
            transition: 'transform .2s, box-shadow .2s',
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 25px rgba(91,95,199,.4)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(91,95,199,.3)' }}
          >Get Started</a>
        </div>
      </div>
    </nav>
  )
}

// ─── Section wrapper with fade-in ───
function Section({ children, id, bg, style: s }: { children: React.ReactNode; id?: string; bg?: string; style?: React.CSSProperties }) {
  const { ref, inView } = useInView(0.1)
  return (
    <section id={id} ref={ref} style={{
      padding: '100px 24px', background: bg || 'transparent', position: 'relative',
      opacity: inView ? 1 : 0, transform: inView ? 'translateY(0)' : 'translateY(40px)',
      transition: 'opacity .8s cubic-bezier(.4,0,.2,1), transform .8s cubic-bezier(.4,0,.2,1)',
      ...s,
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>{children}</div>
    </section>
  )
}

// ─── Feature card ───
function FeatureCard({ icon, title, desc, delay, color }: { icon: React.ReactNode; title: string; desc: string; delay: number; color: string }) {
  const { ref, inView } = useInView(0.15)
  const [hovered, setHovered] = useState(false)
  return (
    <div ref={ref}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        background: '#fff', borderRadius: 20, padding: '36px 28px',
        border: '1px solid rgba(0,0,0,.06)',
        boxShadow: hovered ? `0 20px 60px ${color}20` : '0 4px 20px rgba(0,0,0,.04)',
        opacity: inView ? 1 : 0, transform: inView ? (hovered ? 'translateY(-8px)' : 'translateY(0)') : 'translateY(30px)',
        transition: `all .6s cubic-bezier(.4,0,.2,1) ${delay}ms`,
        cursor: 'default',
      }}
    >
      <div style={{
        width: 56, height: 56, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `${color}12`, color, marginBottom: 20, fontSize: 24,
        transform: hovered ? 'scale(1.1) rotate(-5deg)' : 'scale(1)', transition: 'transform .3s ease',
      }}>{icon}</div>
      <h3 style={{ fontSize: 20, fontWeight: 700, color: '#1E293B', marginBottom: 10 }}>{title}</h3>
      <p style={{ fontSize: 15, lineHeight: 1.7, color: '#64748B', margin: 0 }}>{desc}</p>
    </div>
  )
}

// ─── Step card ───
function StepCard({ num, title, desc, delay }: { num: number; title: string; desc: string; delay: number }) {
  const { ref, inView } = useInView(0.15)
  return (
    <div ref={ref} style={{
      textAlign: 'center', opacity: inView ? 1 : 0,
      transform: inView ? 'translateY(0) scale(1)' : 'translateY(30px) scale(.95)',
      transition: `all .7s cubic-bezier(.4,0,.2,1) ${delay}ms`,
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: '50%', margin: '0 auto 20px',
        background: 'linear-gradient(135deg, #5B5FC7, #7C3AED)', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 28, fontWeight: 800, boxShadow: '0 8px 30px rgba(91,95,199,.3)',
      }}>{num}</div>
      <h3 style={{ fontSize: 20, fontWeight: 700, color: '#1E293B', marginBottom: 8 }}>{title}</h3>
      <p style={{ fontSize: 15, lineHeight: 1.7, color: '#64748B', margin: 0, maxWidth: 300, marginInline: 'auto' }}>{desc}</p>
    </div>
  )
}

// ─── Pricing card ───
function PricingCard({ name, price, desc, features, popular, delay }: { name: string; price: string; desc: string; features: string[]; popular?: boolean; delay: number }) {
  const { ref, inView } = useInView(0.15)
  const [hovered, setHovered] = useState(false)
  return (
    <div ref={ref}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        background: popular ? 'linear-gradient(135deg, #5B5FC7, #7C3AED)' : '#fff',
        borderRadius: 24, padding: '40px 32px', position: 'relative', overflow: 'hidden',
        border: popular ? 'none' : '1px solid rgba(0,0,0,.06)',
        boxShadow: popular ? '0 20px 60px rgba(91,95,199,.25)' : '0 4px 20px rgba(0,0,0,.04)',
        opacity: inView ? 1 : 0,
        transform: inView ? (hovered ? 'translateY(-8px)' : 'translateY(0)') : 'translateY(30px)',
        transition: `all .6s cubic-bezier(.4,0,.2,1) ${delay}ms`,
      }}
    >
      {popular && <div style={{ position: 'absolute', top: 16, right: -32, background: '#FCD34D', color: '#92400E', fontSize: 11, fontWeight: 800, padding: '4px 40px', transform: 'rotate(45deg)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Popular</div>}
      <div style={{ fontSize: 16, fontWeight: 700, color: popular ? 'rgba(255,255,255,.8)' : '#5B5FC7', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>{name}</div>
      <div style={{ fontSize: 48, fontWeight: 800, color: popular ? '#fff' : '#1E293B', marginBottom: 4 }}>{price}<span style={{ fontSize: 16, fontWeight: 500, color: popular ? 'rgba(255,255,255,.6)' : '#94A3B8' }}>/mo</span></div>
      <p style={{ fontSize: 14, color: popular ? 'rgba(255,255,255,.7)' : '#64748B', marginBottom: 28 }}>{desc}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 32 }}>
        {features.map((f, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: popular ? 'rgba(255,255,255,.9)' : '#475569' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke={popular ? '#A5F3FC' : '#5B5FC7'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            {f}
          </div>
        ))}
      </div>
      <a href="/login" style={{
        display: 'block', textAlign: 'center', padding: '14px 0', borderRadius: 12,
        fontSize: 15, fontWeight: 700, textDecoration: 'none',
        background: popular ? '#fff' : 'linear-gradient(135deg, #5B5FC7, #7C3AED)',
        color: popular ? '#5B5FC7' : '#fff',
        boxShadow: popular ? '0 4px 14px rgba(0,0,0,.1)' : '0 4px 14px rgba(91,95,199,.3)',
        transition: 'transform .2s, box-shadow .2s',
      }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)' }}
      >Start Free Trial</a>
    </div>
  )
}

// ─── Floating dashboard mockup ───
function DashboardMockup() {
  const { ref, inView } = useInView(0.1)
  return (
    <div ref={ref} style={{
      position: 'relative', maxWidth: 900, margin: '0 auto',
      opacity: inView ? 1 : 0, transform: inView ? 'perspective(2000px) rotateX(0deg) translateY(0)' : 'perspective(2000px) rotateX(15deg) translateY(60px)',
      transition: 'all 1.2s cubic-bezier(.4,0,.2,1)',
    }}>
      {/* Browser frame */}
      <div style={{
        background: '#fff', borderRadius: 20, overflow: 'hidden',
        boxShadow: '0 40px 100px rgba(0,0,0,.12), 0 0 0 1px rgba(0,0,0,.06)',
      }}>
        {/* Title bar */}
        <div style={{ background: '#F8FAFC', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid rgba(0,0,0,.06)' }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#FF5F57' }} />
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#FEBC2E' }} />
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#28C840' }} />
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', background: '#fff', borderRadius: 8, padding: '6px 16px', fontSize: 12, color: '#94A3B8', border: '1px solid rgba(0,0,0,.06)' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ marginRight: 6 }}><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" stroke="#94A3B8" strokeWidth="2"/><path d="M2 12h20" stroke="#94A3B8" strokeWidth="2"/></svg>
              app.sellometrix.io/dashboard
            </div>
          </div>
        </div>
        {/* Dashboard content mockup */}
        <div style={{ padding: 32, background: 'linear-gradient(135deg, #F8FAFC, #EEF2FF)' }}>
          {/* KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
            {[
              { label: 'Revenue', value: '€47,892', change: '+12.4%', color: '#5B5FC7' },
              { label: 'Net Profit', value: '€8,234', change: '+8.7%', color: '#10B981' },
              { label: 'Units Sold', value: '2,847', change: '+15.2%', color: '#F97316' },
              { label: 'Ad ROAS', value: '4.2x', change: '+0.8x', color: '#8B5CF6' },
            ].map((k, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: 14, padding: '20px 18px', boxShadow: '0 2px 8px rgba(0,0,0,.04)' }}>
                <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>{k.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#1E293B' }}>{k.value}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#10B981', marginTop: 4 }}>{k.change}</div>
              </div>
            ))}
          </div>
          {/* Chart placeholder */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
            <div style={{ background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,.04)' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', marginBottom: 16 }}>Sales Trend</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
                {[40, 55, 45, 65, 50, 70, 85, 60, 75, 90, 80, 95].map((h, i) => (
                  <div key={i} style={{
                    flex: 1, height: `${h}%`, borderRadius: 6,
                    background: `linear-gradient(180deg, #5B5FC7, #7C3AED)`, opacity: 0.7 + (h / 300),
                    animation: inView ? `barGrow .8s cubic-bezier(.4,0,.2,1) ${i * 80}ms both` : 'none',
                  }} />
                ))}
              </div>
            </div>
            <div style={{ background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,.04)' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', marginBottom: 16 }}>Top Products</div>
              {['MMS2001M', 'MMS2490S', 'MMS2491M'].map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: ['#EA580C', '#F97316', '#FB923C'][i], color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* Floating elements */}
      <div style={{
        position: 'absolute', top: -20, right: -40, background: '#fff', borderRadius: 16, padding: '14px 20px',
        boxShadow: '0 10px 40px rgba(0,0,0,.1)', animation: 'floatCard 6s ease-in-out infinite',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600 }}>Profit Margin</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#10B981' }}>+32.1%</div>
        </div>
      </div>
      <div style={{
        position: 'absolute', bottom: 40, left: -50, background: '#fff', borderRadius: 16, padding: '14px 20px',
        boxShadow: '0 10px 40px rgba(0,0,0,.1)', animation: 'floatCard 7s ease-in-out infinite 2s',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: '#EDE9FE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2v20M2 12h20" stroke="#7C3AED" strokeWidth="2.5" strokeLinecap="round" /></svg>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600 }}>AI Insight</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B' }}>Increase SB budget</div>
        </div>
      </div>
    </div>
  )
}

// ─── Testimonial ───
function Testimonial({ quote, name, role, delay }: { quote: string; name: string; role: string; delay: number }) {
  const { ref, inView } = useInView(0.15)
  return (
    <div ref={ref} style={{
      background: '#fff', borderRadius: 20, padding: '32px 28px',
      border: '1px solid rgba(0,0,0,.06)', boxShadow: '0 4px 20px rgba(0,0,0,.04)',
      opacity: inView ? 1 : 0, transform: inView ? 'translateY(0)' : 'translateY(30px)',
      transition: `all .6s cubic-bezier(.4,0,.2,1) ${delay}ms`,
    }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {[1, 2, 3, 4, 5].map(i => (
          <svg key={i} width="18" height="18" viewBox="0 0 24 24" fill="#FCD34D"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
        ))}
      </div>
      <p style={{ fontSize: 15, lineHeight: 1.7, color: '#475569', margin: '0 0 20px', fontStyle: 'italic' }}>&ldquo;{quote}&rdquo;</p>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1E293B' }}>{name}</div>
        <div style={{ fontSize: 13, color: '#94A3B8' }}>{role}</div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════
export default function LandingPage() {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const h = (e: MouseEvent) => setMousePos({ x: e.clientX, y: e.clientY })
    window.addEventListener('mousemove', h, { passive: true })
    return () => window.removeEventListener('mousemove', h)
  }, [])

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", color: '#1E293B', overflowX: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

        html { scroll-behavior: smooth; }

        @keyframes floatOrb {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -30px) scale(1.05); }
          66% { transform: translate(-20px, 20px) scale(.95); }
        }

        @keyframes floatCard {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }

        @keyframes barGrow {
          from { transform: scaleY(0); transform-origin: bottom; }
          to { transform: scaleY(1); transform-origin: bottom; }
        }

        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: .5; }
        }

        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }

        @keyframes spinSlow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .hero-gradient {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 25%, #f093fb 50%, #5B5FC7 75%, #667eea 100%);
          background-size: 400% 400%;
          animation: gradientShift 8s ease infinite;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .cta-glow {
          position: relative;
        }
        .cta-glow::before {
          content: '';
          position: absolute;
          inset: -2px;
          border-radius: 14px;
          background: linear-gradient(135deg, #5B5FC7, #7C3AED, #F97316, #5B5FC7);
          background-size: 400% 400%;
          animation: gradientShift 4s ease infinite;
          z-index: -1;
          opacity: .6;
          filter: blur(8px);
        }

        @media (max-width: 768px) {
          .hero-title { font-size: 36px !important; }
          .features-grid { grid-template-columns: 1fr !important; }
          .steps-grid { grid-template-columns: 1fr !important; }
          .pricing-grid { grid-template-columns: 1fr !important; }
          .testimonials-grid { grid-template-columns: 1fr !important; }
          .stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .mockup-wrap { transform: scale(.8) !important; }
          .nav-links { display: none !important; }
          .hero-buttons { flex-direction: column !important; align-items: stretch !important; }
        }
      `}</style>

      <Navbar />

      {/* ═══ HERO ═══ */}
      <section style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: '#FAFBFF' }}>
        <Orbs />
        {/* Mouse follower glow */}
        <div style={{
          position: 'fixed', width: 400, height: 400, borderRadius: '50%', pointerEvents: 'none', zIndex: 0,
          background: 'radial-gradient(circle, rgba(91,95,199,.06) 0%, transparent 70%)',
          left: mousePos.x - 200, top: mousePos.y - 200, transition: 'left .3s ease, top .3s ease',
        }} />
        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 800, padding: '120px 24px 80px' }}>
          <div style={{ animation: 'fadeInUp .8s ease both' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 20px', borderRadius: 100,
              background: 'rgba(91,95,199,.08)', marginBottom: 28, fontSize: 13, fontWeight: 600, color: '#5B5FC7',
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981', animation: 'pulse 2s ease infinite' }} />
              Now with AI-Powered Insights
            </div>
          </div>
          <h1 className="hero-title" style={{ fontSize: 64, fontWeight: 900, lineHeight: 1.1, margin: '0 0 24px', animation: 'fadeInUp .8s ease .15s both' }}>
            Your Amazon Empire,{' '}
            <span className="hero-gradient">One Dashboard</span>
          </h1>
          <p style={{ fontSize: 20, lineHeight: 1.7, color: '#64748B', margin: '0 auto 40px', maxWidth: 600, animation: 'fadeInUp .8s ease .3s both' }}>
            Track profits, optimize ads, manage inventory, and get AI-driven recommendations — all in one powerful platform built for Amazon sellers.
          </p>
          <div className="hero-buttons" style={{ display: 'flex', gap: 16, justifyContent: 'center', animation: 'fadeInUp .8s ease .45s both' }}>
            <a href="/login" className="cta-glow" style={{
              padding: '16px 36px', borderRadius: 14, fontSize: 16, fontWeight: 700,
              background: 'linear-gradient(135deg, #5B5FC7, #7C3AED)', color: '#fff',
              textDecoration: 'none', boxShadow: '0 8px 30px rgba(91,95,199,.35)',
              transition: 'transform .2s', display: 'inline-flex', alignItems: 'center', gap: 8,
            }}
              onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-3px)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
            >
              Start Free Trial
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M12 5l7 7-7 7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </a>
            <a href="#features" style={{
              padding: '16px 36px', borderRadius: 14, fontSize: 16, fontWeight: 700,
              background: '#fff', color: '#5B5FC7', textDecoration: 'none',
              boxShadow: '0 4px 14px rgba(0,0,0,.06)', border: '1px solid rgba(91,95,199,.15)',
              transition: 'transform .2s',
            }}
              onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-3px)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
            >See How It Works</a>
          </div>
        </div>
      </section>

      {/* ═══ STATS BAR ═══ */}
      <Section bg="#fff" style={{ padding: '60px 24px' }}>
        <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 40, textAlign: 'center' }}>
          {[
            { end: 2500, suffix: '+', label: 'Active Sellers' },
            { end: 47, prefix: '€', suffix: 'M+', label: 'Revenue Tracked' },
            { end: 15, suffix: 'M+', label: 'Products Analyzed' },
            { end: 99, suffix: '%', label: 'Uptime SLA' },
          ].map((s, i) => (
            <div key={i}>
              <div style={{ fontSize: 40, fontWeight: 900, color: '#1E293B' }}>
                <Counter end={s.end} suffix={s.suffix} prefix={s.prefix} />
              </div>
              <div style={{ fontSize: 14, color: '#94A3B8', fontWeight: 600, marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* ═══ DASHBOARD MOCKUP ═══ */}
      <Section bg="#FAFBFF" style={{ paddingBottom: 60 }}>
        <div className="mockup-wrap">
          <DashboardMockup />
        </div>
      </Section>

      {/* ═══ FEATURES ═══ */}
      <Section id="features" bg="#fff">
        <div style={{ textAlign: 'center', marginBottom: 60 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#5B5FC7', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 12 }}>Features</div>
          <h2 style={{ fontSize: 40, fontWeight: 900, color: '#1E293B', margin: '0 0 16px' }}>Everything You Need to Scale</h2>
          <p style={{ fontSize: 18, color: '#64748B', maxWidth: 500, margin: '0 auto' }}>Powerful tools designed specifically for Amazon marketplace sellers.</p>
        </div>
        <div className="features-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
          <FeatureCard delay={0} color="#5B5FC7"
            icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            title="Real-Time P&L" desc="Track your profit and loss in real-time with automated COGS calculation, fee breakdowns, and margin analysis across all your products." />
          <FeatureCard delay={100} color="#F97316"
            icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M18 20V10M12 20V4M6 20v-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            title="Ad Analytics" desc="Deep dive into your PPC campaigns. Track ACOS, ROAS, and TACoS across Sponsored Products, Brands, and Display campaigns." />
          <FeatureCard delay={200} color="#10B981"
            icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            title="Inventory Manager" desc="Never run out of stock. Monitor inventory levels, track meltable items, and get restock alerts before it's too late." />
          <FeatureCard delay={300} color="#8B5CF6"
            icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 2a8 8 0 0 0-8 8c0 6 8 12 8 12s8-6 8-12a8 8 0 0 0-8-8z" stroke="currentColor" strokeWidth="2.5" /><circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="2.5" /></svg>}
            title="AI Insights" desc="Get actionable recommendations powered by AI. From budget optimization to pricing strategy, let data drive your decisions." />
          <FeatureCard delay={400} color="#EC4899"
            icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" stroke="currentColor" strokeWidth="2.5" /><path d="M2 12h20" stroke="currentColor" strokeWidth="2.5" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke="currentColor" strokeWidth="2.5" /></svg>}
            title="Multi-Marketplace" desc="Manage all your Amazon marketplaces from one dashboard. EU, NA, and beyond — your entire business at a glance." />
          <FeatureCard delay={500} color="#EAB308"
            icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            title="Product Performance" desc="Rank your products by revenue, identify bestsellers, and spot underperformers. Detailed analytics for every SKU in your catalog." />
        </div>
      </Section>

      {/* ═══ HOW IT WORKS ═══ */}
      <Section id="how-it-works" bg="#FAFBFF">
        <div style={{ textAlign: 'center', marginBottom: 60 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#5B5FC7', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 12 }}>How It Works</div>
          <h2 style={{ fontSize: 40, fontWeight: 900, color: '#1E293B', margin: 0 }}>Up and Running in Minutes</h2>
        </div>
        <div className="steps-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 48, position: 'relative' }}>
          {/* Connector line */}
          <div style={{ position: 'absolute', top: 36, left: '20%', right: '20%', height: 2, background: 'linear-gradient(90deg, #5B5FC7, #7C3AED)', opacity: .2 }} />
          <StepCard num={1} delay={0} title="Connect Your Account" desc="Link your Amazon Seller Central account with secure OAuth. No passwords shared, ever." />
          <StepCard num={2} delay={200} title="Import Your Data" desc="We automatically sync your sales, inventory, and advertising data in real-time." />
          <StepCard num={3} delay={400} title="Grow Your Business" desc="Make data-driven decisions with actionable insights and AI-powered recommendations." />
        </div>
      </Section>

      {/* ═══ TESTIMONIALS ═══ */}
      <Section bg="#fff">
        <div style={{ textAlign: 'center', marginBottom: 60 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#5B5FC7', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 12 }}>Testimonials</div>
          <h2 style={{ fontSize: 40, fontWeight: 900, color: '#1E293B', margin: 0 }}>Loved by Amazon Sellers</h2>
        </div>
        <div className="testimonials-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
          <Testimonial delay={0} quote="Sellometrix helped me identify which products were actually losing money after all fees. My margins improved 23% in the first month." name="Sarah M." role="7-Figure Amazon Seller" />
          <Testimonial delay={150} quote="The AI insights are like having a personal consultant. It suggested I reallocate my ad budget and my ROAS jumped from 2.8x to 4.1x." name="Marcus K." role="Private Label Brand Owner" />
          <Testimonial delay={300} quote="Managing inventory across 5 EU marketplaces was a nightmare. Now I see everything in one place. The stockout alerts alone paid for the subscription." name="Elena R." role="EU Marketplace Seller" />
        </div>
      </Section>

      {/* ═══ PRICING ═══ */}
      <Section id="pricing" bg="#FAFBFF">
        <div style={{ textAlign: 'center', marginBottom: 60 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#5B5FC7', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 12 }}>Pricing</div>
          <h2 style={{ fontSize: 40, fontWeight: 900, color: '#1E293B', margin: '0 0 16px' }}>Simple, Transparent Pricing</h2>
          <p style={{ fontSize: 18, color: '#64748B', maxWidth: 500, margin: '0 auto' }}>Start free. Scale when you're ready. No hidden fees.</p>
        </div>
        <div className="pricing-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, maxWidth: 960, margin: '0 auto' }}>
          <PricingCard delay={0} name="Starter" price="Free" desc="Perfect for getting started"
            features={['1 Marketplace', 'Up to 50 SKUs', 'Basic P&L Dashboard', 'Weekly Email Reports']} />
          <PricingCard delay={150} name="Pro" price="€49" desc="For growing businesses" popular
            features={['5 Marketplaces', 'Unlimited SKUs', 'AI Insights & Chat', 'Ad Analytics & COGS', 'Priority Support']} />
          <PricingCard delay={300} name="Enterprise" price="€149" desc="For large-scale operations"
            features={['Unlimited Marketplaces', 'Custom Integrations', 'Dedicated Account Manager', 'API Access', 'SLA Guarantee']} />
        </div>
      </Section>

      {/* ═══ CTA ═══ */}
      <Section style={{ padding: '120px 24px' }}>
        <div style={{
          background: 'linear-gradient(135deg, #5B5FC7, #7C3AED)', borderRadius: 32, padding: '80px 48px',
          textAlign: 'center', position: 'relative', overflow: 'hidden',
          boxShadow: '0 40px 100px rgba(91,95,199,.3)',
        }}>
          {/* Background decoration */}
          <div style={{ position: 'absolute', top: -100, right: -100, width: 300, height: 300, borderRadius: '50%', background: 'rgba(255,255,255,.05)', animation: 'spinSlow 30s linear infinite' }} />
          <div style={{ position: 'absolute', bottom: -80, left: -80, width: 250, height: 250, borderRadius: '50%', background: 'rgba(255,255,255,.03)', animation: 'spinSlow 25s linear infinite reverse' }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <h2 style={{ fontSize: 44, fontWeight: 900, color: '#fff', margin: '0 0 16px', lineHeight: 1.2 }}>Ready to Scale Your Amazon Business?</h2>
            <p style={{ fontSize: 18, color: 'rgba(255,255,255,.7)', margin: '0 0 40px', maxWidth: 500, marginInline: 'auto' }}>Join thousands of sellers who trust Sellometrix to grow their business.</p>
            <a href="/login" style={{
              display: 'inline-flex', alignItems: 'center', gap: 10, padding: '18px 40px', borderRadius: 14,
              fontSize: 17, fontWeight: 700, background: '#fff', color: '#5B5FC7',
              textDecoration: 'none', boxShadow: '0 8px 30px rgba(0,0,0,.15)',
              transition: 'transform .2s, box-shadow .2s',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,.2)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(0,0,0,.15)' }}
            >
              Get Started for Free
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M12 5l7 7-7 7" stroke="#5B5FC7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </a>
          </div>
        </div>
      </Section>

      {/* ═══ FOOTER ═══ */}
      <footer style={{ background: '#0F172A', padding: '60px 24px 40px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 48, marginBottom: 48 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #5B5FC7, #7C3AED)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 18 }}>S</div>
                <span style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>Sellometrix</span>
              </div>
              <p style={{ fontSize: 14, lineHeight: 1.7, color: '#64748B', maxWidth: 280, margin: 0 }}>The all-in-one analytics platform for Amazon sellers. Make smarter decisions, faster.</p>
            </div>
            {[
              { title: 'Product', links: ['Features', 'Pricing', 'Integrations', 'Changelog'] },
              { title: 'Company', links: ['About', 'Blog', 'Careers', 'Contact'] },
              { title: 'Legal', links: ['Privacy', 'Terms', 'Security', 'GDPR'] },
            ].map((col, i) => (
              <div key={i}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 16 }}>{col.title}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {col.links.map(l => (
                    <a key={l} href="#" style={{ fontSize: 14, color: '#64748B', textDecoration: 'none', transition: 'color .2s' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#64748B')}
                    >{l}</a>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#475569' }}>&copy; 2026 Sellometrix. All rights reserved.</span>
            <div style={{ display: 'flex', gap: 16 }}>
              {/* Social icons */}
              {[
                <path key="tw" d="M23 3a10.9 10.9 0 0 1-3.14 1.53A4.48 4.48 0 0 0 22.43.36a9 9 0 0 1-2.83 1.1A4.52 4.52 0 0 0 12 4.57v1A10.66 10.66 0 0 1 3 3.81s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z" />,
                <path key="li" d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2zM4 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" />,
                <path key="gh" d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77a5.07 5.07 0 0 0-.09-3.77S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />,
              ].map((path, i) => (
                <a key={i} href="#" style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .2s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.12)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,.06)')}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{path}</svg>
                </a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
