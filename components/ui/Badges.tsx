import { STOCK_STATUS, COLORS } from "@/lib/design-tokens";
import { useTranslation } from "@/lib/i18n";

const STATUS_KEYS: Record<string, string> = {
  out: "status.out",
  critical: "status.critical",
  warning: "status.warning",
  healthy: "status.healthy",
  overstock: "status.overstock",
  dead: "status.dead",
  inactive: "status.inactive",
};

// Stock status badge — dot + label pill
export function StockStatusBadge({ status }: { status: keyof typeof STOCK_STATUS }) {
  const { t } = useTranslation();
  const s = STOCK_STATUS[status] || STOCK_STATUS.inactive;
  const label = STATUS_KEYS[status] ? t(STATUS_KEYS[status]) : s.label;
  return (
    <span
      className="inline-flex items-center gap-[5px] rounded-[20px]"
      style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", background: s.bg, color: s.color, whiteSpace: "nowrap" }}
    >
      <span className="rounded-full shrink-0" style={{ width: 6, height: 6, background: s.dot }} />
      {label}
    </span>
  );
}

// Campaign/ad status badge
export function CampaignStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const statusMap: Record<string, { bg: string; c: string; key: string }> = {
    Active: { bg: "#ECFDF5", c: COLORS.green, key: "common.active" },
    Paused: { bg: "#FFFBEB", c: "#D97706", key: "common.paused" },
    Archived: { bg: "#F8FAFC", c: "#64748B", key: "common.archived" },
  };
  const x = statusMap[status] || statusMap.Archived;
  return (
    <span
      className="rounded-xl"
      style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", background: x.bg, color: x.c, whiteSpace: "nowrap" }}
    >
      ● {t(x.key)}
    </span>
  );
}

// ACOS pill badge
export function AcosBadge({ value }: { value: number }) {
  const color = value <= 25 ? COLORS.green : value <= 40 ? "#F59E0B" : value <= 60 ? "#FB923C" : COLORS.red;
  return (
    <span
      className="rounded-[20px]"
      style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", background: `${color}18`, color }}
    >
      {value > 0 ? `%${value}` : "—"}
    </span>
  );
}

// Image placeholder — used in tables/lists where product image will go
export function ImgPlaceholder({ size = 28 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center shrink-0"
      style={{ width: size, height: size, borderRadius: 6, background: "#F1F5F9" }}
    >
      <svg width={size * 0.4} height={size * 0.4} viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
    </div>
  );
}
