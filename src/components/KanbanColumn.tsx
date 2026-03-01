import type { JobResponse } from "../types";
import type { ReactNode } from "react";
import { KanbanCard } from "./KanbanCard";

interface KanbanColumnProps {
  title: string;
  items: JobResponse[];
  onCancel?: (jobId: string) => void;
  icon?: ReactNode;
}

export function KanbanColumn({ title, items, onCancel, icon }: KanbanColumnProps) {
  return (
    <section className="app-column flex min-h-[22rem] flex-col gap-3 p-3">
      <header className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em]">
          {icon ? <span className="text-[var(--app-accent)]">{icon}</span> : null}
          {title}
        </h2>
        <span className="app-count-badge rounded px-2 py-0.5 text-xs">
          {items.length}
        </span>
      </header>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
        {items.length === 0 ? (
          <div className="rounded border border-dashed border-[var(--app-muted-border)] p-3 text-xs text-[var(--app-muted-text)]">
            No jobs
          </div>
        ) : (
          items.map((item) => <KanbanCard key={item.job.id} item={item} onCancel={onCancel} />)
        )}
      </div>
    </section>
  );
}
