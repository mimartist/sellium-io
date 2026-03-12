// AI Icons — used across all pages

// 4-pointed gradient star (used in AI sections of Dashboard, COGS, Stok, Reklam)
export function AIIcon({ s = 16 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id="ai-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#5B5FC7" />
          <stop offset="50%" stopColor="#EC4899" />
          <stop offset="100%" stopColor="#10B981" />
        </linearGradient>
      </defs>
      <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" fill="url(#ai-grad)" />
    </svg>
  );
}

// Google Gemini-style star (used in AI Öneriler page chat)
export function GeminiLogo({ s = 28 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 28 28" fill="none">
      <defs>
        <linearGradient id="gem-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4285F4" />
          <stop offset="30%" stopColor="#9B72CB" />
          <stop offset="60%" stopColor="#D96570" />
          <stop offset="100%" stopColor="#D96570" />
        </linearGradient>
      </defs>
      <path d="M14 0C14 7.732 7.732 14 0 14C7.732 14 14 20.268 14 28C14 20.268 20.268 14 28 14C20.268 14 14 7.732 14 0Z" fill="url(#gem-grad)" />
    </svg>
  );
}
