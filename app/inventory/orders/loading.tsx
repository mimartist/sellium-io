export default function OrdersLoading() {
  const shimmer = `
    @keyframes shimmer {
      0% { background-position: -400px 0; }
      100% { background-position: 400px 0; }
    }
  `
  const skeletonStyle: React.CSSProperties = {
    background: 'linear-gradient(90deg, var(--bg-elevated) 25%, var(--bg-card) 50%, var(--bg-elevated) 75%)',
    backgroundSize: '800px 100%',
    animation: 'shimmer 1.5s ease-in-out infinite',
    borderRadius: 8,
  }

  return (
    <div style={{ padding: 28, background: 'var(--bg-primary)', minHeight: '100vh' }}>
      <style>{shimmer}</style>

      {/* Header skeleton */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ ...skeletonStyle, width: 200, height: 22, marginBottom: 8 }} />
        <div style={{ ...skeletonStyle, width: 280, height: 14 }} />
      </div>

      {/* Sliders skeleton */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
        <div style={{ ...skeletonStyle, width: 100, height: 16, marginBottom: 16 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i}>
              <div style={{ ...skeletonStyle, width: '100%', height: 14, marginBottom: 8 }} />
              <div style={{ ...skeletonStyle, width: '100%', height: 6, marginBottom: 4 }} />
            </div>
          ))}
        </div>
      </div>

      {/* KPI skeleton */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14,
            padding: '14px 16px', height: 72,
          }}>
            <div style={{ ...skeletonStyle, width: 80, height: 10, marginBottom: 10 }} />
            <div style={{ ...skeletonStyle, width: 100, height: 16 }} />
          </div>
        ))}
      </div>

      {/* Charts skeleton */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: 20, height: 260 }}>
            <div style={{ ...skeletonStyle, width: 160, height: 16, marginBottom: 16 }} />
            <div style={{ ...skeletonStyle, width: '100%', height: 200 }} />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: 20 }}>
        <div style={{ ...skeletonStyle, width: '100%', height: 30, marginBottom: 8 }} />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ ...skeletonStyle, width: '100%', height: 36, marginBottom: 4 }} />
        ))}
      </div>
    </div>
  )
}
