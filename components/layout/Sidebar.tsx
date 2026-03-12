"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { SidebarIcons } from "./SidebarIcons";
import { COLORS } from "@/lib/design-tokens";

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
  mobile?: boolean;
}

const MENU_ITEMS = [
  { label: "Dashboard", href: "/", icon: SidebarIcons.dashboard },
  { label: "COGS & Profitability", href: "/cogs", icon: SidebarIcons.cogs },
  { label: "Ad Performance", href: "/ads", icon: SidebarIcons.ads },
  { label: "Product Performance", href: "/products", icon: SidebarIcons.performance },
  { label: "Inventory Tracking", href: "/inventory", icon: SidebarIcons.stock, badge: 39 },
  { label: "AI Insights", href: "/ai", icon: SidebarIcons.ai },
  { label: "Platform Comparison", href: "/platforms", icon: SidebarIcons.platform },
];

export default function Sidebar({ open, onClose, mobile }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile overlay */}
      {mobile && open && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/30 z-[90]"
        />
      )}

      <aside
        className={`${mobile ? "fixed z-[100]" : "sticky"} top-0 h-screen w-[230px] bg-white border-r border-[#ECEEF2] flex flex-col transition-transform duration-300 ${
          mobile && !open ? "-translate-x-full" : "translate-x-0"
        }`}
        style={{ flexShrink: 0 }}
      >
        {/* Logo */}
        <div className="px-[22px] pb-[30px] pt-6 flex items-center gap-3">
          <div
            className="w-[42px] h-[42px] rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg,#5B5FC7,#818CF8)" }}
          >
            <span className="text-white text-xl font-extrabold">S</span>
          </div>
          <div>
            <div className="text-lg font-bold" style={{ color: COLORS.text }}>Sellometrix</div>
            <div className="text-[11px] font-medium tracking-wider" style={{ color: COLORS.sub }}>
              AI Commerce OS
            </div>
          </div>
        </div>

        {/* Menu */}
        <nav className="px-[14px]">
          {MENU_ITEMS.map((item) => {
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-[10px] px-[14px] py-[11px] my-[2px] rounded-[10px] text-sm no-underline"
                style={{
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? "#fff" : "#64748B",
                  background: isActive ? COLORS.accent : "transparent",
                }}
              >
                <span className="flex items-center shrink-0" style={{ opacity: isActive ? 1 : 0.6 }}>
                  {item.icon}
                </span>
                {item.label}
                {item.badge && (
                  <span
                    className="ml-auto text-[10px] font-bold px-2 py-[2px] rounded-[10px]"
                    style={{
                      background: isActive ? "rgba(255,255,255,.25)" : "#FEE2E2",
                      color: isActive ? "#fff" : COLORS.red,
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="mt-auto px-5 mb-4">
          {/* User */}
          <div className="flex items-center gap-[10px] py-3 border-t border-[#F1F5F9]">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white"
              style={{ background: "linear-gradient(135deg,#C7D2FE,#818CF8)" }}
            >
              AO
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold" style={{ color: COLORS.text }}>Atakan Ormanlı</div>
              <div className="text-[11px]" style={{ color: COLORS.sub }}>Mimosso</div>
            </div>
          </div>
        </div>

        {/* Pro card */}
        <div
          className="mx-4 mb-5 p-[18px] rounded-[14px] text-white text-center relative overflow-hidden"
          style={{ background: "linear-gradient(135deg,#5B5FC7,#7C3AED)" }}
        >
          <div className="absolute -top-5 -right-5 w-20 h-20 rounded-full bg-white/10" />
          <div className="relative">
            <div className="text-sm font-bold mb-1">Pro Version</div>
            <div className="text-xs opacity-85 mb-3">Discover all features</div>
            <div className="py-2 rounded-lg bg-white/20 text-[13px] font-semibold cursor-pointer">
              Upgrade →
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
