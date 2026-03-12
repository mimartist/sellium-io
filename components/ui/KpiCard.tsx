// KPI Card — Dashboard-standard: icon circle, big value, change badge, mini bars
// Usage: <KpiCard label="TOPLAM GELİR" value="€42.120" change="↑12%" up icon={...} bars={[...]} color="#10B981" light="#A7F3D0" iconBg="#ECFDF5" />

import MiniBars from "./MiniBars";
import { COLORS, CARD_STYLE } from "@/lib/design-tokens";
import { ReactNode } from "react";

interface KpiCardProps {
  label: string;
  value: string;
  change?: string;
  up?: boolean;
  icon: ReactNode;
  bars: number[];
  color: string;
  light: string;
  iconBg: string;
  onClick?: () => void;
  active?: boolean;
}

export default function KpiCard({
  label, value, change, up, icon, bars, color, light, iconBg, onClick, active,
}: KpiCardProps) {
  return (
    <div
      onClick={onClick}
      style={{
        ...CARD_STYLE,
        padding: "16px 18px",
        cursor: onClick ? "pointer" : "default",
        border: active ? `2px solid ${color}` : "2px solid transparent",
        transition: "border .2s",
      }}
    >
      {/* Top: label + icon */}
      <div className="flex justify-between items-start mb-2">
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: ".06em",
            color: COLORS.sub,
          }}
        >
          {label}
        </div>
        <div
          className="flex items-center justify-center rounded-full"
          style={{ width: 36, height: 36, background: iconBg, color }}
        >
          {icon}
        </div>
      </div>

      {/* Value */}
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: COLORS.text,
          marginBottom: 4,
        }}
      >
        {value}
      </div>

      {/* Bottom: change + bars */}
      <div className="flex justify-between items-end">
        {change && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: up ? COLORS.green : COLORS.red,
            }}
          >
            {change} {up ? "↗" : "↘"}
          </span>
        )}
        <div style={{ width: 70 }}>
          <MiniBars bars={bars} color={color} light={light} />
        </div>
      </div>
    </div>
  );
}
