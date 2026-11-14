import React from "react";
import { AlertCircle } from "lucide-react";

interface ErrorStateProps {
  title?: string;
  message: string;
  retry?: () => void;
}

export function ErrorState({ title = "Something went wrong", message, retry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
      <AlertCircle size={28} className="text-loss" strokeWidth={1.25} />
      <div>
        <p className="text-sm font-medium text-ink-muted">{title}</p>
        <p className="text-xs text-ink-faint mt-1 max-w-sm font-mono">{message}</p>
      </div>
      {retry && (
        <button
          onClick={retry}
          className="text-xs text-accent hover:underline mt-1"
        >
          Try again
        </button>
      )}
    </div>
  );
}
