import { useCallback, useEffect, useMemo, useState } from "react";
import { cancelJob, enqueuePrompt, getJob, listQueue, listWorkspaces } from "./api/otter";
import { KanbanBoard } from "./components/KanbanBoard";
import { type OtterEventPayload, useOtterEvents } from "./hooks/useOtterEvents";
import type { JobResponse, Workspace } from "./types";

function toQueuedJobResponse(jobId: string, prompt: string, rank: number | null): JobResponse {
  return {
    job: {
      id: jobId,
      workspace_id: "",
      prompt,
      status: "queued",
      priority: rank ?? 100,
      schedule_at: null,
      attempts: 0,
      max_attempts: 0,
      error: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    output: null,
    queue_rank: rank
  };
}

export default function App() {
  const [jobs, setJobs] = useState<Record<string, JobResponse>>({});
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [priority, setPriority] = useState(100);
  const [error, setError] = useState<string | null>(null);

  const refreshQueue = useCallback(async () => {
    const queue = await listQueue(300, 0);
    const mapped = await Promise.all(
      queue.map(async (item) => {
        try {
          const detail = await getJob(item.job_id);
          return [item.job_id, { ...detail, queue_rank: item.queue_rank }] as const;
        } catch {
          return [item.job_id, toQueuedJobResponse(item.job_id, item.prompt, item.queue_rank)] as const;
        }
      })
    );
    setJobs((prev) => ({ ...prev, ...Object.fromEntries(mapped) }));
  }, []);

  const refreshWorkspaces = useCallback(async () => {
    const items = await listWorkspaces();
    setWorkspaces(items);
    if (items.length > 0 && !workspaceId) {
      setWorkspaceId(items[0].id);
    }
  }, [workspaceId]);

  useEffect(() => {
    void refreshWorkspaces().catch((err: unknown) => setError(String(err)));
    void refreshQueue().catch((err: unknown) => setError(String(err)));
  }, [refreshQueue, refreshWorkspaces]);

  const handleEvent = useCallback((event: OtterEventPayload) => {
    void getJob(event.job_id)
      .then((job) => {
        setJobs((prev) => ({ ...prev, [event.job_id]: job }));
      })
      .catch(() => {
        // Job may not be visible yet; ignore and wait for next event/poll.
      });
  }, []);

  useOtterEvents({ onEvent: handleEvent });

  const handleEnqueue = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    try {
      if (!workspaceId) {
        throw new Error("Select a workspace first.");
      }
      const job = await enqueuePrompt({
        workspace_id: workspaceId,
        prompt,
        priority
      });
      setPrompt("");
      setJobs((prev) => ({
        ...prev,
        [job.id]: {
          job,
          output: null,
          queue_rank: null
        }
      }));
      await refreshQueue();
    } catch (err: unknown) {
      setError(String(err));
    }
  };

  const handleCancel = async (jobId: string) => {
    setError(null);
    try {
      await cancelJob(jobId);
      const refreshed = await getJob(jobId);
      setJobs((prev) => ({ ...prev, [jobId]: refreshed }));
    } catch (err: unknown) {
      setError(String(err));
    }
  };

  const jobList = useMemo(() => Object.values(jobs), [jobs]);

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-slate-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold">Seal Kanban</h1>
          <p className="text-sm text-slate-400">
            Create Otter jobs and track live state transitions from todo to running to done.
          </p>
        </header>

        <form
          className="grid gap-3 rounded-xl border border-slate-700 bg-slate-900 p-4 md:grid-cols-[1fr_1fr_120px_120px]"
          onSubmit={handleEnqueue}
        >
          <select
            className="rounded border border-slate-700 bg-slate-950 p-2 text-sm"
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
          >
            <option value="">Select workspace</option>
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
          <input
            className="rounded border border-slate-700 bg-slate-950 p-2 text-sm"
            placeholder="Describe your task..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            required
          />
          <input
            className="rounded border border-slate-700 bg-slate-950 p-2 text-sm"
            type="number"
            min={1}
            max={100000}
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
          />
          <button
            className="rounded bg-emerald-600 px-3 py-2 text-sm font-semibold hover:bg-emerald-500"
            type="submit"
          >
            Add Task
          </button>
        </form>

        {error ? (
          <div className="rounded border border-red-700 bg-red-900/20 p-3 text-sm text-red-300">{error}</div>
        ) : null}

        <KanbanBoard jobs={jobList} onCancel={handleCancel} />
      </div>
    </main>
  );
}
