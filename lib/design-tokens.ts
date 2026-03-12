// Sellometrix Design Tokens — Modernize UI Kit
// Single source of truth for all design values

export const COLORS = {
  // Base
  bg: "#F5F7FA",
  card: "#FFFFFF",
  text: "#1E293B",
  sub: "#94A3B8",
  muted: "#CBD5E1",
  border: "#F1F5F9",

  // Brand
  accent: "#5B5FC7",
  accentLight: "#EEF2FF",
  accentDark: "#4F46E5",

  // Semantic
  green: "#10B981",
  greenLight: "#ECFDF5",
  greenLighter: "#A7F3D0",
  red: "#EF4444",
  redLight: "#FEF2F2",
  redLighter: "#FECACA",
  orange: "#F59E0B",
  orangeLight: "#FFFBEB",
  orangeLighter: "#FDE68A",
  blue: "#7097A8",
  blueLight: "#F0F7FA",
  blueLighter: "#B0CDDA",

  // Cost bar chart palette (dark→light blue-gray)
  costBars: ["#4E6A8E", "#5A7FA8", "#6890B5", "#7097A8", "#85ABBC", "#9ABCCC", "#B0CDDA"],
  profitBar: "#1FD286",
} as const;

export const CARD_STYLE: React.CSSProperties = {
  background: COLORS.card,
  borderRadius: 12,
  boxShadow: "0 1px 3px rgba(0,0,0,.04)",
};

export const SELECT_STYLE: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: COLORS.text,
  padding: "8px 32px 8px 14px",
  borderRadius: 10,
  border: "1px solid #E2E8F0",
  background: "#fff",
  cursor: "pointer",
  outline: "none",
  appearance: "none" as const,
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394A3B8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 10px center",
};

// KPI label style
export const KPI_LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: ".06em",
  color: COLORS.sub,
};

// KPI value style
export const KPI_VALUE: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  letterSpacing: "-0.02em",
  color: COLORS.text,
};

// Table header style
export const TH_STYLE: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: COLORS.sub,
  letterSpacing: ".02em",
  whiteSpace: "nowrap" as const,
};

// ACOS color helper
export function acosColor(v: number): string {
  if (v <= 25) return COLORS.green;
  if (v <= 40) return "#F59E0B";
  if (v <= 60) return "#FB923C";
  return COLORS.red;
}

// CVR color helper
export function cvrColor(v: number): string {
  if (v >= 12) return COLORS.green;
  if (v >= 8) return COLORS.text;
  if (v >= 5) return COLORS.orange;
  return COLORS.red;
}

// Stock status config
export const STOCK_STATUS = {
  out: { label: "Out of Stock", bg: "#FEF2F2", color: "#EF4444", dot: "#EF4444" },
  critical: { label: "Critical", bg: "#FFFBEB", color: "#D97706", dot: "#F59E0B" },
  warning: { label: "Warning", bg: "#FFF7ED", color: "#EA580C", dot: "#FB923C" },
  healthy: { label: "Healthy", bg: "#ECFDF5", color: "#059669", dot: "#10B981" },
  overstock: { label: "Overstock", bg: "#EEF2FF", color: "#4F46E5", dot: "#5B5FC7" },
  dead: { label: "Dead Stock", bg: "#F8FAFC", color: "#64748B", dot: "#94A3B8" },
  inactive: { label: "Inactive", bg: "#F8FAFC", color: "#94A3B8", dot: "#CBD5E1" },
} as const;
