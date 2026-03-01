import type { JobResponse } from "../types";
import { DoneIcon, FailedIcon, RunningIcon, TodoIcon } from "./icons";

interface KanbanCardProps {
  item: JobResponse;
  onCancel?: (jobId: string) => void;
  onOpen?: (jobId: string) => void;
  hasVoice?: boolean;
  isVoicePlaying?: boolean;
  onToggleVoice?: (jobId: string) => void;
  draggable?: boolean;
  onDragStart?: (jobId: string) => void;
  onDropOnCard?: (targetJobId: string) => void;
}

export function KanbanCard({
  item,
  onCancel,
  onOpen,
  hasVoice = false,
  isVoicePlaying = false,
  onToggleVoice,
  draggable = false,
  onDragStart,
  onDropOnCard
}: KanbanCardProps) {
  const { job, queue_rank } = item;
  const statusMeta =
    job.status === "queued"
      ? { label: "In queue", bubbleClass: "app-status-bubble--queued", icon: <TodoIcon className="h-4 w-4" /> }
      : job.status === "running"
        ? {
            label: "Running",
            bubbleClass: "app-status-bubble--running",
            icon: <RunningIcon className="h-4 w-4" />
          }
        : job.status === "failed"
          ? { label: "Failed", bubbleClass: "app-status-bubble--failed", icon: <FailedIcon className="h-4 w-4" /> }
          : { label: "Done", bubbleClass: "app-status-bubble--done", icon: <DoneIcon className="h-4 w-4" /> };

  return (
    <article
      className="app-card p-3"
      draggable={draggable}
      onDragStart={() => onDragStart?.(job.id)}
      onDragOver={(event) => {
        if (draggable) {
          event.preventDefault();
        }
      }}
      onDrop={(event) => {
        if (!draggable) {
          return;
        }
        event.preventDefault();
        onDropOnCard?.(job.id);
      }}
    >
      <header className="mb-2 flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-sm font-medium text-[var(--app-heading)]">{job.prompt}</p>
        {queue_rank ? (
          <span className="app-count-badge rounded px-2 py-0.5 text-xs">
            #{queue_rank}
          </span>
        ) : null}
      </header>
      <div className="mt-1">
        <span className={`app-status-bubble ${statusMeta.bubbleClass}`}>
          {statusMeta.icon}
          {statusMeta.label}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        {job.status === "queued" || job.status === "running" ? (
          <button
            className="app-button-danger rounded px-2 py-1 text-xs font-medium"
            onClick={() => onCancel?.(job.id)}
            type="button"
          >
            Cancel
          </button>
        ) : null}
        <button
          className="app-theme-toggle rounded px-2 py-1 text-xs font-medium"
          onClick={() => onOpen?.(job.id)}
          type="button"
        >
          Open
        </button>
        {hasVoice ? (
          <button
            className="app-theme-toggle rounded px-2 py-1 text-xs font-medium"
            onClick={() => onToggleVoice?.(job.id)}
            type="button"
          >
            {isVoicePlaying ? "Pause Voice" : "Play Voice"}
          </button>
        ) : null}
      </div>
    </article>
  );
}
