import type { JobResponse } from "../types";
import { KanbanColumn } from "./KanbanColumn";

interface KanbanBoardProps {
  jobs: JobResponse[];
  onCancel: (jobId: string) => void;
}

export function KanbanBoard({ jobs, onCancel }: KanbanBoardProps) {
  const todo = jobs
    .filter((item) => item.job.status === "queued")
    .sort((a, b) => (a.queue_rank ?? Number.MAX_SAFE_INTEGER) - (b.queue_rank ?? Number.MAX_SAFE_INTEGER));
  const running = jobs.filter((item) => item.job.status === "running");
  const done = jobs.filter(
    (item) =>
      item.job.status === "succeeded" ||
      item.job.status === "failed" ||
      item.job.status === "cancelled"
  );

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <KanbanColumn title="Todo" items={todo} onCancel={onCancel} />
      <KanbanColumn title="Running" items={running} onCancel={onCancel} />
      <KanbanColumn title="Done" items={done} onCancel={onCancel} />
    </div>
  );
}
