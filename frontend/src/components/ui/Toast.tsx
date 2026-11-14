import React, { createContext, useCallback, useContext, useState } from "react";
import clsx from "clsx";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const id = ++nextId;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Portal-like fixed container */}
      <div
        aria-live="polite"
        aria-label="Notifications"
        className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={clsx(
              "flex items-start gap-2.5 rounded-lg border px-4 py-3 shadow-xl",
              "bg-elevated text-ink pointer-events-auto min-w-[280px] max-w-sm",
              t.type === "error"
                ? "border-loss/40"
                : t.type === "success"
                  ? "border-gain/40"
                  : "border-border"
            )}
          >
            {t.type === "success" && <CheckCircle2 size={15} className="text-gain mt-0.5 shrink-0" />}
            {t.type === "error" && <AlertCircle size={15} className="text-loss mt-0.5 shrink-0" />}
            {t.type === "info" && <Info size={15} className="text-accent mt-0.5 shrink-0" />}
            <p className="flex-1 text-xs text-ink-muted">{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="text-ink-faint hover:text-ink shrink-0"
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be inside ToastProvider");
  return ctx.showToast;
}

// Legacy named export for compat
export function Toast() {
  return null;
}
