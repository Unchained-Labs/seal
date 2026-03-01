import type { JobResponse } from "../types";
import { DoneIcon, FailedIcon, RunningIcon, TodoIcon } from "./icons";
import { KanbanColumn } from "./KanbanColumn";

interface KanbanBoardProps {
  jobs: JobResponse[];
  onCancel: (jobId: string) => void;
  onOpen: (jobId: string) => void;
  onReorderTodo: (targetJobId: string) => void;
  onTodoDragStart: (jobId: string) => void;
}

export function KanbanBoard({ jobs, onCancel, onOpen, onReorderTodo, onTodoDragStart }: KanbanBoardProps) {
  const todo = jobs
    .filter((item) => item.job.status === "queued")
    .sort((a, b) => (a.queue_rank ?? Number.MAX_SAFE_INTEGER) - (b.queue_rank ?? Number.MAX_SAFE_INTEGER));
  const running = jobs.filter((item) => item.job.status === "running");
  const done = jobs.filter((item) => item.job.status === "succeeded" || item.job.status === "cancelled");
  const blockedFailed = jobs.filter((item) => item.job.status === "failed");

  return (
    <div className="grid h-full gap-4 lg:grid-cols-2 2xl:grid-cols-4">
      <KanbanColumn
        title="Todo"
        items={todo}
        onCancel={onCancel}
        onOpen={onOpen}
        enableDragSort
        onDragStart={onTodoDragStart}
        onDropOnCard={(targetJobId) => {
          onReorderTodo(targetJobId);
        }}
        icon={<TodoIcon className="h-4 w-4" />}
      />
      <KanbanColumn
        title="Running"
        items={running}
        onCancel={onCancel}
        onOpen={onOpen}
        icon={<RunningIcon className="h-4 w-4" />}
      />
      <KanbanColumn
        title="Done"
        items={done}
        onCancel={onCancel}
        onOpen={onOpen}
        icon={<DoneIcon className="h-4 w-4" />}
      />
      <KanbanColumn
        title="Blocked / Failed"
        items={blockedFailed}
        onCancel={onCancel}
        onOpen={onOpen}
        icon={<FailedIcon className="h-4 w-4" />}
      />
    </div>
  );
}
