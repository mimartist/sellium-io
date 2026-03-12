"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { SidebarIcons } from "./SidebarIcons";
import { COLORS } from "@/lib/design-tokens";
import { useTranslation } from "@/lib/i18n";
import LanguageSelector from "@/components/ui/LanguageSelector";

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
  mobile?: boolean;
}

const MENU_ITEMS = [
  { key: "sidebar.dashboard" as const, href: "/", icon: SidebarIcons.dashboard },
  { key: "sidebar.cogs" as const, href: "/cogs", icon: SidebarIcons.cogs },
  { key: "sidebar.ads" as const, href: "/ads", icon: SidebarIcons.ads },
  { key: "sidebar.products" as const, href: "/products", icon: SidebarIcons.performance },
  { key: "sidebar.inventory" as const, href: "/inventory", icon: SidebarIcons.stock, badge: 39 },
  { key: "sidebar.ai" as const, href: "/ai", icon: SidebarIcons.ai },
  { key: "sidebar.platforms" as const, href: "/platforms", icon: SidebarIcons.platform },
];

export default function Sidebar({ open, onClose, mobile }: SidebarProps) {
  const pathname = usePathname();
  const { t } = useTranslation();

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
              {t("sidebar.brand")}
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
                onClick={mobile ? onClose : undefined}
                className="flex items-center gap-[10px] px-[14px] py-[11px] my-[2px] rounded-[10px] text-sm no-underline"
                style={{
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? "#fff" : "#64748B",
                  background: isActive ? COLORS.accent : "transparent",
                }}
              >
                <span className="relative flex items-center shrink-0" style={{ opacity: isActive ? 1 : 0.6 }}>
                  {item.icon}
                  {item.badge && (
                    <span
                      className="absolute text-[8px] font-bold leading-none rounded-full flex items-center justify-center"
                      style={{
                        top: -5,
                        left: -6,
                        minWidth: 16,
                        height: 16,
                        padding: "0 3px",
                        background: isActive ? "rgba(255,255,255,.9)" : COLORS.red,
                        color: isActive ? COLORS.accent : "#fff",
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                </span>
                <span className="truncate">{t(item.key)}</span>
              </Link>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="mt-auto px-5 mb-4">
          {/* Language Selector */}
          <div className="pb-3">
            <LanguageSelector />
          </div>

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
            <button
              onClick={() => { localStorage.removeItem("sellometrix-auth"); window.location.href = "/login"; }}
              className="shrink-0 flex items-center justify-center rounded-lg hover:bg-[#F1F5F9] transition-colors"
              style={{ width: 32, height: 32, border: 'none', background: 'transparent', cursor: 'pointer' }}
              title="Sign out"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Pro card */}
        <div
          className="mx-4 mb-5 p-[18px] rounded-[14px] text-white text-center relative overflow-hidden"
          style={{ background: "linear-gradient(135deg,#5B5FC7,#7C3AED)" }}
        >
          <div className="absolute -top-5 -right-5 w-20 h-20 rounded-full bg-white/10" />
          <div className="relative">
            <div className="text-sm font-bold mb-1">{t("sidebar.pro")}</div>
            <div className="text-xs opacity-85 mb-3">{t("sidebar.proDesc")}</div>
            <div className="py-2 rounded-lg bg-white/20 text-[13px] font-semibold cursor-pointer">
              {t("sidebar.upgrade")}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
