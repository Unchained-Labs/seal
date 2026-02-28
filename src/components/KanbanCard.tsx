import type { JobResponse } from "../types";

interface KanbanCardProps {
  item: JobResponse;
  onCancel?: (jobId: string) => void;
}

export function KanbanCard({ item, onCancel }: KanbanCardProps) {
  const { job, output, queue_rank } = item;
  return (
    <article className="rounded-lg border border-slate-700 bg-slate-900 p-3 text-slate-100">
      <header className="mb-2 flex items-start justify-between gap-2">
        <p className="line-clamp-3 text-sm font-medium">{job.prompt}</p>
        {queue_rank ? (
          <span className="rounded bg-slate-700 px-2 py-0.5 text-xs">#{queue_rank}</span>
        ) : null}
      </header>
      <p className="text-xs text-slate-400">Status: {job.status}</p>
      <p className="text-xs text-slate-400">Priority: {job.priority}</p>
      {output?.assistant_output ? (
        <details className="mt-2 text-xs text-slate-300">
          <summary className="cursor-pointer text-slate-200">Result</summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-slate-950 p-2">
            {output.assistant_output}
          </pre>
        </details>
      ) : null}
      {job.status === "queued" || job.status === "running" ? (
        <button
          className="mt-2 rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-500"
          onClick={() => onCancel?.(job.id)}
          type="button"
        >
          Cancel
        </button>
      ) : null}
    </article>
  );
}
