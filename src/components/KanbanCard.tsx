import type { JobResponse } from "../types";
import { DoneIcon, FailedIcon, RunningIcon, TodoIcon } from "./icons";

interface KanbanCardProps {
  item: JobResponse;
  onCancel?: (jobId: string) => void;
  onTogglePaused?: (jobId: string, paused: boolean) => void;
  onOpen?: (jobId: string) => void;
  hasVoice?: boolean;
  isVoicePlaying?: boolean;
  onToggleVoice?: (jobId: string) => void;
  draggable?: boolean;
  onDragStart?: (jobId: string) => void;
  onDropOnCard?: (targetJobId: string) => void;
  liveOutputPreview?: string;
}

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

function formatCreatedAt(iso: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) {
    return "Unknown time";
  }
  return new Date(parsed).toLocaleString();
}

export function KanbanCard({
  item,
  onCancel,
  onTogglePaused,
  onOpen,
  hasVoice = false,
  isVoicePlaying = false,
  onToggleVoice,
  draggable = false,
  onDragStart,
  onDropOnCard,
  liveOutputPreview
}: KanbanCardProps) {
  const { job, queue_rank } = item;
  const createdAtLabel = formatCreatedAt(job.created_at);
  const createdMs = Date.parse(job.created_at);
  const updatedMs = Date.parse(job.updated_at);
  const nowMs = Date.now();
  const runningStartMs = Number.isFinite(updatedMs)
    ? updatedMs
    : Number.isFinite(createdMs)
      ? createdMs
      : NaN;
  const elapsedForRunning = Number.isFinite(runningStartMs)
    ? formatDuration(nowMs - runningStartMs)
    : null;
  const elapsedToDone =
    Number.isFinite(createdMs) && Number.isFinite(updatedMs) ? formatDuration(updatedMs - createdMs) : null;
  const statusMeta =
    job.status === "queued"
      ? {
          label: job.is_paused ? "Paused" : "In queue",
          bubbleClass: "app-status-bubble--queued",
          icon: <TodoIcon className="h-4 w-4" />,
          durationLabel: job.is_paused ? "Paused in queue" : (null as string | null)
        }
      : job.status === "running"
        ? {
            label: "Running",
            bubbleClass: "app-status-bubble--running",
            icon: <RunningIcon className="h-4 w-4" />,
            durationLabel: elapsedForRunning ? `Running for ${elapsedForRunning}` : null
          }
        : job.status === "failed"
          ? {
              label: "Failed",
              bubbleClass: "app-status-bubble--failed",
              icon: <FailedIcon className="h-4 w-4" />,
              durationLabel: elapsedToDone ? `Failed after ${elapsedToDone}` : null
            }
          : job.status === "cancelled"
            ? {
                label: "Failed",
                bubbleClass: "app-status-bubble--failed",
                icon: <FailedIcon className="h-4 w-4" />,
                durationLabel: elapsedToDone ? `Cancelled after ${elapsedToDone}` : "Cancelled"
              }
          : {
              label: "Done",
              bubbleClass: "app-status-bubble--done",
              icon: <DoneIcon className="h-4 w-4" />,
              durationLabel: elapsedToDone ? `Finished in ${elapsedToDone}` : null
            };

  return (
    <article
      className="app-card min-w-0 overflow-hidden p-3"
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
      <header className="mb-2 flex min-w-0 items-start justify-between gap-2">
        <p className="line-clamp-2 min-w-0 break-words text-sm font-medium text-[var(--app-heading)]">{job.prompt}</p>
        {queue_rank ? (
          <span className="app-count-badge rounded px-2 py-0.5 text-xs">
            #{queue_rank}
          </span>
        ) : null}
      </header>
      <p className="text-[11px] text-[var(--app-muted-text)]">Created: {createdAtLabel}</p>
      <div className="mt-1">
        <span className={`app-status-bubble ${statusMeta.bubbleClass}`}>
          {statusMeta.icon}
          {statusMeta.label}
        </span>
      </div>
      {statusMeta.durationLabel ? (
        <p className="mt-1 text-[11px] text-[var(--app-subtle)]">{statusMeta.durationLabel}</p>
      ) : null}
      {liveOutputPreview ? (
        <p className="mt-1 rounded border border-[var(--app-muted-border)] bg-[var(--app-result-bg)] px-2 py-1 font-mono text-[11px] text-[var(--app-subtle)] line-clamp-2">
          {liveOutputPreview}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {job.status === "queued" || job.status === "running" ? (
          <button
            className="app-theme-toggle rounded px-2 py-1 text-xs font-medium"
            onClick={() => onTogglePaused?.(job.id, job.is_paused)}
            type="button"
          >
            {job.is_paused ? "Resume" : "Hold"}
          </button>
        ) : null}
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
