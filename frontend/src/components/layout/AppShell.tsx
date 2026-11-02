import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileNavigationOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileNavigationOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileNavigationOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileNavigationOpen]);

  return (
    <div className="min-h-screen bg-canvas">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <div className="hidden lg:fixed lg:inset-y-0 lg:z-40 lg:flex lg:w-64">
        <Sidebar />
      </div>

      {mobileNavigationOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-950/50"
            aria-hidden="true"
            onClick={() => setMobileNavigationOpen(false)}
          />
          <div
            id="mobile-navigation"
            className="absolute inset-y-0 left-0 w-64 shadow-xl"
          >
            <Sidebar
              onNavigate={() => setMobileNavigationOpen(false)}
              onClose={() => setMobileNavigationOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <Topbar
          navigationOpen={mobileNavigationOpen}
          onOpenNavigation={() => setMobileNavigationOpen(true)}
        />
        <main
          id="main-content"
          className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
