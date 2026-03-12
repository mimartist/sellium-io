"use client";

import { useState, useEffect, ReactNode } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import { COLORS } from "@/lib/design-tokens";
import { LanguageProvider } from "@/lib/i18n";

const NO_LAYOUT_ROUTES = ["/login", "/site"];

export default function MainLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobile, setMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Skip layout for auth pages but still provide i18n
  if (NO_LAYOUT_ROUTES.includes(pathname)) {
    return <LanguageProvider>{children}</LanguageProvider>;
  }

  return (
    <LanguageProvider>
      <div className="flex min-h-screen" style={{ background: COLORS.bg, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} mobile={mobile} />

        <main className={`flex-1 min-w-0 ${mobile ? "p-4 pt-[56px]" : "p-7"}`}>
          {/* Mobile hamburger — sticky */}
          {mobile && (
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="fixed top-0 left-0 z-[80] bg-white border-b border-[#E2E8F0] p-3 cursor-pointer flex flex-col gap-[3px]"
              style={{ width: '100%', alignItems: 'flex-start' }}
            >
              <span className="w-[18px] h-[2px] rounded-sm" style={{ background: COLORS.text }} />
              <span className="w-[18px] h-[2px] rounded-sm" style={{ background: COLORS.text }} />
              <span className="w-[18px] h-[2px] rounded-sm" style={{ background: COLORS.text }} />
            </button>
          )}

          {children}
        </main>
      </div>
    </LanguageProvider>
  );
}
