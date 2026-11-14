import React from "react";
import { InboxIcon } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ElementType;
}

export function EmptyState({ title, description, action, icon: Icon = InboxIcon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
      <Icon size={28} className="text-ink-faint" strokeWidth={1.25} />
      <div>
        <p className="text-sm font-medium text-ink-muted">{title}</p>
        {description && <p className="text-xs text-ink-faint mt-1 max-w-xs">{description}</p>}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
