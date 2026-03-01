import type { JobResponse } from "../types";
import { DoneIcon, FailedIcon, RunningIcon, TodoIcon } from "./icons";

interface KanbanCardProps {
  item: JobResponse;
  onCancel?: (jobId: string) => void;
}

export function KanbanCard({ item, onCancel }: KanbanCardProps) {
  const { job, output, queue_rank } = item;
  const statusIcon =
    job.status === "queued" ? (
      <TodoIcon className="h-3.5 w-3.5" />
    ) : job.status === "running" ? (
      <RunningIcon className="h-3.5 w-3.5" />
    ) : job.status === "failed" ? (
      <FailedIcon className="h-3.5 w-3.5" />
    ) : (
      <DoneIcon className="h-3.5 w-3.5" />
    );

  return (
    <article className="app-card p-3">
      <header className="mb-2 flex items-start justify-between gap-2">
        <p className="line-clamp-3 text-sm font-medium text-[var(--app-heading)]">{job.prompt}</p>
        {queue_rank ? (
          <span className="app-count-badge rounded px-2 py-0.5 text-xs">
            #{queue_rank}
          </span>
        ) : null}
      </header>
      <p className="flex items-center gap-1.5 text-xs text-[var(--app-subtle)]">
        {statusIcon}
        Status: <span className="text-[var(--app-text)]">{job.status}</span>
      </p>
      <p className="text-xs text-[var(--app-subtle)]">Priority: <span className="text-[var(--app-text)]">{job.priority}</span></p>
      {output?.assistant_output ? (
        <details className="mt-2 text-xs text-[var(--app-text)]">
          <summary className="cursor-pointer text-[var(--app-accent)]">Result</summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-[var(--app-muted-border)] bg-[var(--app-result-bg)] p-2">
            {output.assistant_output}
          </pre>
        </details>
      ) : null}
      {job.status === "queued" || job.status === "running" ? (
        <button
          className="app-button-danger mt-2 rounded px-2 py-1 text-xs font-medium"
          onClick={() => onCancel?.(job.id)}
          type="button"
        >
          Cancel
        </button>
      ) : null}
    </article>
  );
}
