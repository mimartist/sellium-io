"use client";

import { useState, useEffect, ReactNode } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import { COLORS } from "@/lib/design-tokens";

const NO_LAYOUT_ROUTES = ["/login"];

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

  // Skip layout for auth pages
  if (NO_LAYOUT_ROUTES.includes(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen" style={{ background: COLORS.bg, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} mobile={mobile} />

      <main className={`flex-1 min-w-0 ${mobile ? "p-4" : "p-7"}`}>
        {/* Mobile hamburger */}
        {mobile && (
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="mb-4 bg-white border border-[#E2E8F0] rounded-lg p-2 cursor-pointer flex flex-col gap-[3px]"
          >
            <span className="w-[18px] h-[2px] rounded-sm" style={{ background: COLORS.text }} />
            <span className="w-[18px] h-[2px] rounded-sm" style={{ background: COLORS.text }} />
            <span className="w-[18px] h-[2px] rounded-sm" style={{ background: COLORS.text }} />
          </button>
        )}

        {children}
      </main>
    </div>
  );
}
