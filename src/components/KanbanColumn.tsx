import type { JobResponse } from "../types";
import { KanbanCard } from "./KanbanCard";

interface KanbanColumnProps {
  title: string;
  items: JobResponse[];
  onCancel?: (jobId: string) => void;
}

export function KanbanColumn({ title, items, onCancel }: KanbanColumnProps) {
  return (
    <section className="flex min-h-[18rem] flex-col gap-3 rounded-xl bg-slate-800/60 p-3">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-200">{title}</h2>
        <span className="rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-100">{items.length}</span>
      </header>
      <div className="flex flex-1 flex-col gap-2">
        {items.length === 0 ? (
          <div className="rounded border border-dashed border-slate-600 p-3 text-xs text-slate-400">
            No jobs
          </div>
        ) : (
          items.map((item) => <KanbanCard key={item.job.id} item={item} onCancel={onCancel} />)
        )}
      </div>
    </section>
  );
}
