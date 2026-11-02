import type { ComponentType, SVGProps } from "react";
import { NavLink } from "react-router-dom";

import { useAsOf } from "../../hooks/useAsOf";
import { cx } from "../../lib/cx";
import {
  ActionsIcon,
  AnomaliesIcon,
  AuditsIcon,
  CloseIcon,
  DashboardIcon,
  FindingsIcon,
} from "../ui/icons";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

interface NavItem {
  to: string;
  label: string;
  icon: IconComponent;
  end?: boolean;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [{ to: "/", label: "Dashboard", icon: DashboardIcon, end: true }],
  },
  {
    label: "Registers",
    items: [
      { to: "/audits", label: "Audits", icon: AuditsIcon },
      { to: "/findings", label: "Risk findings", icon: FindingsIcon },
      { to: "/actions", label: "Action plans", icon: ActionsIcon },
    ],
  },
  {
    label: "Analytics",
    items: [{ to: "/anomalies", label: "Anomalies", icon: AnomaliesIcon }],
  },
];

interface SidebarProps {
  onNavigate?: () => void;
  onClose?: () => void;
}

export function Sidebar({ onNavigate, onClose }: SidebarProps) {
  const { asOf, isDefault } = useAsOf();

  return (
    <aside className="flex h-full w-full flex-col bg-navy-950 text-slate-300">
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-accent-600 text-xs font-bold tracking-wide text-white">
          RL
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold tracking-tight text-white">
            RiskLens AI
          </p>
          <p className="truncate text-[10px] uppercase tracking-[0.16em] text-slate-400">
            Internal audit
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            autoFocus
            onClick={onClose}
            aria-label="Close navigation"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 py-5">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="mb-6 last:mb-0">
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              {section.label}
            </p>
            <ul className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const target = isDefault
                  ? item.to
                  : `${item.to}?as_of=${encodeURIComponent(asOf)}`;

                return (
                  <li key={item.to}>
                    <NavLink
                      to={target}
                      end={item.end}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cx(
                          "flex items-center gap-3 border-l-2 px-3 py-2 text-sm font-medium transition-colors",
                          isActive
                            ? "border-accent-400 bg-white/10 text-white"
                            : "border-transparent text-slate-300 hover:bg-white/5 hover:text-white",
                        )
                      }
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 px-5 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Synthetic dataset
        </p>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          Read-only view of generated audit records. Anomalies are advisory, not
          findings of fraud.
        </p>
      </div>
    </aside>
  );
}
