import type { JobResponse } from "../types";
import type { ReactNode } from "react";
import { KanbanCard } from "./KanbanCard";

interface KanbanColumnProps {
  title: string;
  items: JobResponse[];
  onCancel?: (jobId: string) => void;
  onTogglePaused?: (jobId: string, paused: boolean) => void;
  onOpen?: (jobId: string) => void;
  hasVoiceForJob?: (jobId: string) => boolean;
  isVoicePlayingForJob?: (jobId: string) => boolean;
  onToggleVoice?: (jobId: string) => void;
  enableDragSort?: boolean;
  onDragStart?: (jobId: string) => void;
  onDropOnCard?: (targetJobId: string) => void;
  icon?: ReactNode;
  liveOutputPreviewForJob?: (jobId: string) => string;
}

export function KanbanColumn({
  title,
  items,
  onCancel,
  onTogglePaused,
  onOpen,
  hasVoiceForJob,
  isVoicePlayingForJob,
  onToggleVoice,
  enableDragSort = false,
  onDragStart,
  onDropOnCard,
  icon,
  liveOutputPreviewForJob
}: KanbanColumnProps) {
  return (
    <section className="app-column flex min-h-0 min-w-0 flex-col gap-3 p-3">
      <header className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em]">
          {icon ? <span className="text-[var(--app-accent)]">{icon}</span> : null}
          {title}
        </h2>
        <span className="app-count-badge rounded px-2 py-0.5 text-xs">
          {items.length}
        </span>
      </header>
      <div className="app-column-scroll flex min-h-0 min-w-0 flex-1 flex-col gap-2 pr-1">
        {items.length === 0 ? (
          <div className="rounded border border-dashed border-[var(--app-muted-border)] p-3 text-xs text-[var(--app-muted-text)]">
            No jobs
          </div>
        ) : (
          items.map((item) => (
            <KanbanCard
              key={item.job.id}
              item={item}
              onCancel={onCancel}
              onTogglePaused={onTogglePaused}
              onOpen={onOpen}
              hasVoice={hasVoiceForJob?.(item.job.id) ?? false}
              isVoicePlaying={isVoicePlayingForJob?.(item.job.id) ?? false}
              onToggleVoice={onToggleVoice}
              draggable={enableDragSort}
              onDragStart={onDragStart}
              onDropOnCard={onDropOnCard}
              liveOutputPreview={liveOutputPreviewForJob?.(item.job.id)}
            />
          ))
        )}
      </div>
    </section>
  );
}
