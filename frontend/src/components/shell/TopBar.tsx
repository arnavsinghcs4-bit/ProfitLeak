import React from "react";
import { useNavigate } from "react-router-dom";
import { Upload, RefreshCw } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { fmtDate } from "@/lib/format";
import { MobileMenuButton } from "./Sidebar";

interface TopBarProps {
  onMobileMenuOpen: () => void;
}

export function TopBar({ onMobileMenuOpen }: TopBarProps) {
  const navigate = useNavigate();
  const { meta, summary } = useSession();

  return (
    <header className="sticky top-0 z-20 flex items-center gap-4 px-4 lg:px-6 py-2.5 bg-canvas border-b border-border-subtle">
      <MobileMenuButton onClick={onMobileMenuOpen} />

      {/* Dataset context */}
      <div className="flex-1 min-w-0">
        {meta ? (
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-sm text-ink-muted truncate font-medium">{meta.name}</span>
            <span
              className={[
                "text-2xs font-mono px-1.5 py-0.5 rounded border shrink-0",
                meta.status === "analyzed"
                  ? "text-gain border-gain/30 bg-gain/10"
                  : meta.status === "error"
                    ? "text-loss border-loss/30 bg-loss/10"
                    : meta.status === "processing"
                      ? "text-warn border-warn/30 bg-warn/10"
                      : "text-ink-faint border-border",
              ].join(" ")}
            >
              {meta.status}
            </span>
            {summary && meta.status === "analyzed" && (
              <span className="text-2xs text-ink-faint font-mono hidden sm:block shrink-0">
                Analyzed {fmtDate(meta.analyzed_at)}
              </span>
            )}
          </div>
        ) : (
          <span className="text-sm text-ink-faint">No dataset loaded</span>
        )}
      </div>

      {/* Primary action */}
      <button
        onClick={() => navigate("/data")}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
          bg-accent text-canvas hover:bg-accent-dim transition-colors
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent shrink-0"
      >
        <Upload size={13} />
        <span className="hidden sm:inline">Import data</span>
      </button>
    </header>
  );
}
