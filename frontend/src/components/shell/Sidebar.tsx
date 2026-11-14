import React, { useState, useEffect } from "react";
import clsx from "clsx";
import {
  LayoutDashboard,
  TrendingDown,
  Package,
  Tag,
  Database,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
} from "lucide-react";
import { useLocation, Link } from "react-router-dom";
import { useSession } from "@/context/SessionContext";

const NAV_ITEMS = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/loss-explorer", label: "Loss Explorer", icon: TrendingDown },
  { to: "/products", label: "Product Performance", icon: Package },
  { to: "/discounts", label: "Discount Analysis", icon: Tag },
  { to: "/data", label: "Data Sources", icon: Database },
  { to: "/reports", label: "Reports", icon: FileText },
  { to: "/settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const location = useLocation();
  const { meta } = useSession();

  const nav = (
    <nav className="flex-1 overflow-y-auto py-3">
      <ul className="space-y-0.5 px-2">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
          const active =
            to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
          return (
            <li key={to}>
              <Link
                to={to}
                onClick={onMobileClose}
                className={clsx(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  active
                    ? "bg-elevated text-ink"
                    : "text-ink-muted hover:bg-surface hover:text-ink"
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon
                  size={16}
                  className={clsx(
                    "shrink-0 transition-colors",
                    active ? "text-accent" : "text-ink-faint group-hover:text-ink-muted"
                  )}
                />
                {!collapsed && (
                  <span className="truncate leading-none">{label}</span>
                )}
                {active && !collapsed && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );

  const wordmark = (
    <div className="flex items-center gap-2.5 px-4 py-4 border-b border-border-subtle">
      <img src="/mark.svg" alt="ProfitLeak" className="h-6 w-6 shrink-0" />
      {!collapsed && (
        <div className="overflow-hidden">
          <p className="text-sm font-semibold text-ink leading-tight tracking-tight">
            ProfitLeak
          </p>
          <p className="text-2xs text-ink-faint leading-tight font-mono">
            Profitability Intelligence
          </p>
        </div>
      )}
    </div>
  );

  const datasetIndicator = !collapsed && meta && (
    <div className="px-4 py-3 border-t border-border-subtle">
      <p className="text-2xs text-ink-faint font-mono uppercase tracking-widest mb-1">
        Active dataset
      </p>
      <p className="text-xs text-ink-muted truncate leading-snug">{meta.name}</p>
      <p className="text-2xs text-ink-faint font-mono mt-0.5">
        {meta.row_count.toLocaleString()} rows · {meta.status}
      </p>
    </div>
  );

  const collapseBtn = (
    <button
      onClick={onToggle}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      className={clsx(
        "hidden lg:flex items-center justify-center w-full py-3",
        "text-ink-faint hover:text-ink-muted transition-colors border-t border-border-subtle"
      )}
    >
      {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
    </button>
  );

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-canvas/80 backdrop-blur-sm lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      {/* Desktop sidebar */}
      <aside
        className={clsx(
          "hidden lg:flex flex-col h-screen sticky top-0",
          "bg-surface border-r border-border transition-all duration-200 ease-in-out",
          collapsed ? "w-14" : "w-52"
        )}
      >
        {wordmark}
        {nav}
        {datasetIndicator}
        {collapseBtn}
      </aside>

      {/* Mobile drawer */}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-40 flex flex-col lg:hidden",
          "bg-surface border-r border-border w-64 transition-transform duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-4">
          <div className="flex items-center gap-2.5">
            <img src="/mark.svg" alt="ProfitLeak" className="h-6 w-6" />
            <p className="text-sm font-semibold text-ink">ProfitLeak</p>
          </div>
          <button
            onClick={onMobileClose}
            aria-label="Close sidebar"
            className="text-ink-faint hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>
        {nav}
        {datasetIndicator}
      </aside>
    </>
  );
}

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Open navigation"
      className="lg:hidden p-2 text-ink-muted hover:text-ink"
    >
      <Menu size={18} />
    </button>
  );
}
