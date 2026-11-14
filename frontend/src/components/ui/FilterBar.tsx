import React from "react";
import { X } from "lucide-react";

interface FilterBarProps {
  children: React.ReactNode;
  onReset?: () => void;
  hasActiveFilters?: boolean;
}

export function FilterBar({ children, onReset, hasActiveFilters }: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 py-3 px-3 border-b border-border-subtle bg-surface/60">
      {children}
      {hasActiveFilters && onReset && (
        <button
          onClick={onReset}
          className="flex items-center gap-1 text-xs text-ink-muted hover:text-loss transition-colors ml-auto"
        >
          <X size={12} />
          Clear filters
        </button>
      )}
    </div>
  );
}

interface FilterSelectProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}

export function FilterSelect({ label, value, options, onChange }: FilterSelectProps) {
  return (
    <div className="flex items-center gap-1.5">
      <label className="text-2xs text-ink-faint font-mono uppercase tracking-wider shrink-0">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs bg-elevated border border-border rounded px-2 py-1 text-ink-muted
          focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent
          appearance-none cursor-pointer pr-6"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B736A' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 6px center" }}
      >
        <option value="">All</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  );
}

interface FilterInputProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function FilterInput({ label, value, onChange, placeholder }: FilterInputProps) {
  return (
    <div className="flex items-center gap-1.5">
      {label && (
        <label className="text-2xs text-ink-faint font-mono uppercase tracking-wider shrink-0">
          {label}
        </label>
      )}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="text-xs bg-elevated border border-border rounded px-2 py-1 text-ink-muted
          placeholder-ink-faint focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent
          w-44"
      />
    </div>
  );
}
