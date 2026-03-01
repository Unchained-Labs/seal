import { useMemo, useState } from "react";
import type { JobResponse } from "../types";
import { DoneIcon, FailedIcon, RunningIcon, TodoIcon } from "./icons";
import { KanbanColumn } from "./KanbanColumn";

interface KanbanBoardProps {
  jobs: JobResponse[];
  onCancel: (jobId: string) => void;
  onTogglePaused: (jobId: string, paused: boolean) => void;
  onOpen: (jobId: string) => void;
  hasVoiceForJob?: (jobId: string) => boolean;
  isVoicePlayingForJob?: (jobId: string) => boolean;
  onToggleVoice?: (jobId: string) => void;
  onReorderTodo: (targetJobId: string) => void;
  onTodoDragStart: (jobId: string) => void;
  liveOutputPreviewForJob?: (jobId: string) => string;
}

export function KanbanBoard({
  jobs,
  onCancel,
  onTogglePaused,
  onOpen,
  hasVoiceForJob,
  isVoicePlayingForJob,
  onToggleVoice,
  onReorderTodo,
  onTodoDragStart,
  liveOutputPreviewForJob
}: KanbanBoardProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "queued" | "running" | "done" | "failed">("all");
  const [voiceFilter, setVoiceFilter] = useState<"all" | "with_voice" | "without_voice">("all");
  const [sortMode, setSortMode] = useState<
    "workflow" | "created_desc" | "created_asc" | "updated_desc" | "updated_asc"
  >("workflow");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matchesDone = (item: JobResponse) => item.job.status === "succeeded";
    return jobs.filter((item) => {
      if (q && !item.job.prompt.toLowerCase().includes(q)) {
        return false;
      }
      if (statusFilter === "queued" && item.job.status !== "queued") {
        return false;
      }
      if (statusFilter === "running" && item.job.status !== "running") {
        return false;
      }
      if (
        statusFilter === "failed" &&
        item.job.status !== "failed" &&
        item.job.status !== "cancelled"
      ) {
        return false;
      }
      if (statusFilter === "done" && !matchesDone(item)) {
        return false;
      }
      if (voiceFilter !== "all" && hasVoiceForJob) {
        const hasVoice = hasVoiceForJob(item.job.id);
        if (voiceFilter === "with_voice" && !hasVoice) {
          return false;
        }
        if (voiceFilter === "without_voice" && hasVoice) {
          return false;
        }
      }
      return true;
    });
  }, [jobs, query, statusFilter, voiceFilter, hasVoiceForJob]);

  const sortItems = (items: JobResponse[]): JobResponse[] => {
    if (sortMode === "workflow") {
      return items;
    }
    const sorted = [...items];
    const parseMs = (iso: string) => {
      const parsed = Date.parse(iso);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    sorted.sort((a, b) => {
      if (sortMode === "created_desc") {
        return parseMs(b.job.created_at) - parseMs(a.job.created_at);
      }
      if (sortMode === "created_asc") {
        return parseMs(a.job.created_at) - parseMs(b.job.created_at);
      }
      if (sortMode === "updated_desc") {
        return parseMs(b.job.updated_at) - parseMs(a.job.updated_at);
      }
      return parseMs(a.job.updated_at) - parseMs(b.job.updated_at);
    });
    return sorted;
  };

  const todoRaw = filtered.filter((item) => item.job.status === "queued");
  const todo =
    sortMode === "workflow"
      ? [...todoRaw].sort((a, b) => (a.queue_rank ?? Number.MAX_SAFE_INTEGER) - (b.queue_rank ?? Number.MAX_SAFE_INTEGER))
      : sortItems(todoRaw);
  const running = sortItems(filtered.filter((item) => item.job.status === "running"));
  const done = sortItems(filtered.filter((item) => item.job.status === "succeeded"));
  const blockedFailed = sortItems(
    filtered.filter((item) => item.job.status === "failed" || item.job.status === "cancelled")
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="app-board-controls">
        <input
          className="app-input app-board-control"
          placeholder="Filter by prompt..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          className="app-input app-board-control"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
        >
          <option value="all">All statuses</option>
          <option value="queued">Queued</option>
          <option value="running">Running</option>
          <option value="done">Done</option>
          <option value="failed">Failed / Cancelled</option>
        </select>
        <select
          className="app-input app-board-control"
          value={voiceFilter}
          onChange={(event) => setVoiceFilter(event.target.value as typeof voiceFilter)}
        >
          <option value="all">All voice types</option>
          <option value="with_voice">With voice</option>
          <option value="without_voice">Without voice</option>
        </select>
        <select
          className="app-input app-board-control"
          value={sortMode}
          onChange={(event) => setSortMode(event.target.value as typeof sortMode)}
        >
          <option value="workflow">Workflow sort</option>
          <option value="created_desc">Created (newest)</option>
          <option value="created_asc">Created (oldest)</option>
          <option value="updated_desc">Updated (newest)</option>
          <option value="updated_asc">Updated (oldest)</option>
        </select>
        <button
          className="app-theme-toggle rounded px-3 py-1.5 text-xs font-semibold"
          type="button"
          onClick={() => {
            setQuery("");
            setStatusFilter("all");
            setVoiceFilter("all");
            setSortMode("workflow");
          }}
        >
          Reset
        </button>
      </div>
      <div className="grid h-full max-h-[calc(100vh-18rem)] min-h-0 gap-4 overflow-hidden lg:grid-cols-2 2xl:grid-cols-4">
        <KanbanColumn
          title="Todo"
          items={todo}
          onCancel={onCancel}
          onTogglePaused={onTogglePaused}
          onOpen={onOpen}
          hasVoiceForJob={hasVoiceForJob}
          isVoicePlayingForJob={isVoicePlayingForJob}
          onToggleVoice={onToggleVoice}
          enableDragSort
          onDragStart={onTodoDragStart}
          onDropOnCard={(targetJobId) => {
            onReorderTodo(targetJobId);
          }}
          icon={<TodoIcon className="h-4 w-4" />}
          liveOutputPreviewForJob={liveOutputPreviewForJob}
        />
        <KanbanColumn
          title="Running"
          items={running}
          onCancel={onCancel}
          onTogglePaused={onTogglePaused}
          onOpen={onOpen}
          hasVoiceForJob={hasVoiceForJob}
          isVoicePlayingForJob={isVoicePlayingForJob}
          onToggleVoice={onToggleVoice}
          icon={<RunningIcon className="h-4 w-4" />}
          liveOutputPreviewForJob={liveOutputPreviewForJob}
        />
        <KanbanColumn
          title="Done"
          items={done}
          onCancel={onCancel}
          onTogglePaused={onTogglePaused}
          onOpen={onOpen}
          hasVoiceForJob={hasVoiceForJob}
          isVoicePlayingForJob={isVoicePlayingForJob}
          onToggleVoice={onToggleVoice}
          icon={<DoneIcon className="h-3 w-3" />}
          liveOutputPreviewForJob={liveOutputPreviewForJob}
        />
        <KanbanColumn
          title="Blocked / Failed"
          items={blockedFailed}
          onCancel={onCancel}
          onTogglePaused={onTogglePaused}
          onOpen={onOpen}
          hasVoiceForJob={hasVoiceForJob}
          isVoicePlayingForJob={isVoicePlayingForJob}
          onToggleVoice={onToggleVoice}
          icon={<FailedIcon className="h-4 w-4" />}
          liveOutputPreviewForJob={liveOutputPreviewForJob}
        />
      </div>
    </div>
  );
}
