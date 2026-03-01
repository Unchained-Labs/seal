import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  cancelJob,
  checkBackendHealth,
  enqueuePrompt,
  enqueueVoicePrompt,
  getJob,
  getWorkspaceFile,
  getWorkspaceTree,
  listHistory,
  listProjects,
  listQueue,
  runWorkspaceCommand,
  listWorkspaces,
  updateQueuePriority
} from "./api/otter";
import { KanbanBoard } from "./components/KanbanBoard";
import { MicrophoneIcon, PulseIcon, StopIcon, ThemeDarkIcon, ThemeLightIcon } from "./components/icons";
import { type OtterEventPayload, useOtterEvents } from "./hooks/useOtterEvents";
import type {
  HistoryItem,
  JobResponse,
  Project,
  QueueItem,
  Workspace,
  WorkspaceCommandResponse,
  WorkspaceFileResponse,
  WorkspaceTreeResponse
} from "./types";
type BackendHealth = "checking" | "online" | "offline";
const JOB_CACHE_KEY = "seal-job-cache-v1";
const VOICE_AUDIO_CACHE_KEY = "seal-voice-audio-v1";

async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read blob."));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(blob);
  });
}

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

function toHistoryJobResponse(item: HistoryItem): JobResponse {
  return {
    job: {
      id: item.job_id,
      workspace_id: item.workspace_id,
      prompt: item.prompt,
      status: item.status,
      priority: 100,
      schedule_at: null,
      attempts: 0,
      max_attempts: 0,
      error: null,
      created_at: item.created_at,
      updated_at: item.created_at
    },
    output: item.assistant_output
      ? {
          id: `${item.job_id}-history-output`,
          job_id: item.job_id,
          assistant_output: item.assistant_output,
          raw_json: null,
          created_at: item.created_at
        }
      : null,
    queue_rank: null
  };
}

function detectFirstUrl(input: string): string | null {
  const match = input.match(/https?:\/\/[^\s)]+/);
  return match?.[0] ?? null;
}

function isMarkdownLikeFile(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.endsWith(".md") ||
    lower.endsWith(".markdown") ||
    lower.endsWith(".mdx") ||
    lower.endsWith("readme")
  );
}

export default function App() {
  const [jobs, setJobs] = useState<Record<string, JobResponse>>({});
  const [liveOutputByJob, setLiveOutputByJob] = useState<Record<string, string[]>>({});
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitFeedback, setSubmitFeedback] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [isRecording, setIsRecording] = useState(false);
  const [isVoiceProcessing, setIsVoiceProcessing] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [voiceAudioByJob, setVoiceAudioByJob] = useState<Record<string, string>>({});
  const [playingVoiceJobId, setPlayingVoiceJobId] = useState<string | null>(null);
  const [backendHealth, setBackendHealth] = useState<BackendHealth>("checking");
  const [projects, setProjects] = useState<Project[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("");
  const [workspaceTree, setWorkspaceTree] = useState<WorkspaceTreeResponse | null>(null);
  const [selectedFile, setSelectedFile] = useState<WorkspaceFileResponse | null>(null);
  const [workspaceCommand, setWorkspaceCommand] = useState("ls -la");
  const [workspaceCommandResult, setWorkspaceCommandResult] = useState<WorkspaceCommandResponse | null>(null);
  const [workspaceCommandRunning, setWorkspaceCommandRunning] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [modalFullscreen, setModalFullscreen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [modalCommand, setModalCommand] = useState("ls -la");
  const [modalCommandRunning, setModalCommandRunning] = useState(false);
  const [modalCommandResult, setModalCommandResult] = useState<WorkspaceCommandResponse | null>(null);
  const [draggedTodoJobId, setDraggedTodoJobId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const healthCheckInFlightRef = useRef(false);
  const voiceSupported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined";

  const refreshJobs = useCallback(async () => {
    const [queueResult, historyResult] = await Promise.allSettled([listQueue(300, 0), listHistory(1000)]);
    const queue = queueResult.status === "fulfilled" ? queueResult.value : [];
    const history = historyResult.status === "fulfilled" ? historyResult.value : [];
    if (queueResult.status === "rejected" && historyResult.status === "rejected") {
      throw new Error("Unable to load queue and history from backend.");
    }
    const queueById = new Map<string, QueueItem>(queue.map((item) => [item.job_id, item]));
    const historyById = new Map<string, HistoryItem>(history.map((item) => [item.job_id, item]));
    const jobIds = Array.from(new Set([...queueById.keys(), ...historyById.keys()]));
    const mapped = await Promise.all(
      jobIds.map(async (jobId) => {
        try {
          const detail = await getJob(jobId);
          const queuedItem = queueById.get(jobId);
          return [jobId, { ...detail, queue_rank: queuedItem?.queue_rank ?? detail.queue_rank }] as const;
        } catch {
          const queuedItem = queueById.get(jobId);
          if (queuedItem) {
            return [jobId, toQueuedJobResponse(jobId, queuedItem.prompt, queuedItem.queue_rank)] as const;
          }
          const historyItem = historyById.get(jobId);
          if (historyItem) {
            return [jobId, toHistoryJobResponse(historyItem)] as const;
          }
          return null;
        }
      })
    );
    const entries = mapped.filter((entry): entry is readonly [string, JobResponse] => entry !== null);
    setJobs((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    setBackendHealth("online");
    setError(null);
    setSubmitFeedback((prev) => (prev?.includes("Queued") ? prev : null));
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(JOB_CACHE_KEY);
      if (raw) {
        setJobs(JSON.parse(raw) as Record<string, JobResponse>);
      }
    } catch {
      // Ignore malformed cache.
    }
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(VOICE_AUDIO_CACHE_KEY);
      if (raw) {
        setVoiceAudioByJob(JSON.parse(raw) as Record<string, string>);
      }
    } catch {
      // Ignore malformed cache.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(JOB_CACHE_KEY, JSON.stringify(jobs));
    } catch {
      // Ignore quota/storage issues.
    }
  }, [jobs]);

  useEffect(() => {
    try {
      window.localStorage.setItem(VOICE_AUDIO_CACHE_KEY, JSON.stringify(voiceAudioByJob));
    } catch {
      // Ignore quota/storage issues.
    }
  }, [voiceAudioByJob]);

  useEffect(() => {
    void refreshJobs().catch((err: unknown) => {
      setBackendHealth("offline");
      setError(String(err));
    });
  }, [refreshJobs]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshJobs().catch((err: unknown) => {
        setBackendHealth("offline");
        setError(String(err));
      });
    }, 5000);
    return () => {
      window.clearInterval(interval);
    };
  }, [refreshJobs]);

  useEffect(() => {
    const refreshMetadata = async () => {
      const [projectsResult, workspacesResult] = await Promise.allSettled([
        listProjects(),
        listWorkspaces()
      ]);
      if (projectsResult.status === "fulfilled") {
        setProjects(projectsResult.value);
      }
      if (workspacesResult.status === "fulfilled") {
        setWorkspaces(workspacesResult.value);
      }
    };
    void refreshMetadata();
  }, []);

  useEffect(() => {
    let isCancelled = false;
    const refreshHealth = async (initial = false) => {
      if (healthCheckInFlightRef.current) {
        return;
      }
      if (initial) {
        setBackendHealth("checking");
      }
      healthCheckInFlightRef.current = true;
      const alive = await checkBackendHealth(2500);
      healthCheckInFlightRef.current = false;
      if (!isCancelled) {
        setBackendHealth(alive ? "online" : "offline");
      }
    };
    void refreshHealth(true);
    const interval = window.setInterval(() => {
      void refreshHealth();
    }, 5000);
    return () => {
      isCancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const preferredTheme = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    const savedTheme = window.localStorage.getItem("seal-theme");
    const nextTheme = savedTheme === "light" || savedTheme === "dark" ? savedTheme : preferredTheme;
    setTheme(nextTheme);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("seal-theme", theme);
  }, [theme]);

  const handleEvent = useCallback((event: OtterEventPayload) => {
    if (event.event_type === "output_chunk") {
      const payload = event.payload as { stream?: string; line?: string } | undefined;
      const line = payload?.line?.trim();
      if (line) {
        setLiveOutputByJob((prev) => ({
          ...prev,
          [event.job_id]: [...(prev[event.job_id] ?? []), `[${payload?.stream ?? "stdout"}] ${line}`]
        }));
      }
    } else {
      console.info("[seal-events]", event.event_type, { jobId: event.job_id });
    }
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
    setSubmitFeedback("Submitting task...");
    setIsSubmitting(true);
    try {
      const job = await enqueuePrompt({
        workspace_id: selectedWorkspaceId || undefined,
        prompt
      });
      setPrompt("");
      setSubmitFeedback(`Queued task ${job.id.slice(0, 8)}...`);
      setJobs((prev) => ({
        ...prev,
        [job.id]: {
          job,
          output: null,
          queue_rank: null
        }
      }));
      await refreshJobs();
    } catch (err: unknown) {
      setBackendHealth("offline");
      setError(String(err));
      setSubmitFeedback("Failed to submit task.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async (jobId: string) => {
    setError(null);
    try {
      await cancelJob(jobId);
      const refreshed = await getJob(jobId);
      setJobs((prev) => ({ ...prev, [jobId]: refreshed }));
    } catch (err: unknown) {
      setBackendHealth("offline");
      setError(String(err));
    }
  };

  const handleSelectWorkspace = async (workspaceId: string) => {
    setSelectedWorkspaceId(workspaceId);
    if (!workspaceId) {
      setWorkspaceTree(null);
      setSelectedFile(null);
      return;
    }
    try {
      const tree = await getWorkspaceTree(workspaceId, "", 2);
      setWorkspaceTree(tree);
      setSelectedFile(null);
    } catch (err: unknown) {
      setError(String(err));
    }
  };

  const handleOpenFile = async (relativePath: string) => {
    if (!selectedWorkspaceId) {
      return;
    }
    try {
      const file = await getWorkspaceFile(selectedWorkspaceId, relativePath);
      setSelectedFile(file);
    } catch (err: unknown) {
      setError(String(err));
    }
  };

  const handleVoiceBlob = useCallback(
    async (audioBlob: Blob) => {
      if (!audioBlob.size) {
        setError("Captured audio is empty.");
        return;
      }
      const dataUrl = await blobToDataUrl(audioBlob);
      setRecordedAudioUrl(dataUrl);
      setIsVoiceProcessing(true);
      setSubmitFeedback("Transcribing voice command...");
      setError(null);
      try {
        const response = await enqueueVoicePrompt(audioBlob, {
          workspace_id: selectedWorkspaceId || undefined
        });
        setVoiceTranscript(response.transcript);
        setPrompt(response.transcript);
        setVoiceAudioByJob((prev) => ({ ...prev, [response.job.id]: dataUrl }));
        setSubmitFeedback(`Queued voice task ${response.job.id.slice(0, 8)}...`);
        setJobs((prev) => ({
          ...prev,
          [response.job.id]: {
            job: response.job,
            output: null,
            queue_rank: null
          }
        }));
        await refreshJobs();
      } catch (err: unknown) {
        setBackendHealth("offline");
        setError(String(err));
        setSubmitFeedback("Voice command failed.");
      } finally {
        setIsVoiceProcessing(false);
      }
    },
    [refreshJobs, selectedWorkspaceId]
  );

  const handleRunWorkspaceCommand = async () => {
    if (!workspaceCommand.trim()) {
      return;
    }
    setWorkspaceCommandRunning(true);
    setError(null);
    try {
      const result = await runWorkspaceCommand(selectedWorkspaceId || undefined, {
        workspace_id: selectedWorkspaceId || undefined,
        command: workspaceCommand,
        timeout_seconds: 120
      });
      setWorkspaceCommandResult(result);
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setWorkspaceCommandRunning(false);
    }
  };

  const jobList = useMemo(() => Object.values(jobs), [jobs]);
  const todoList = useMemo(
    () =>
      jobList
        .filter((item) => item.job.status === "queued")
        .sort((a, b) => (a.queue_rank ?? Number.MAX_SAFE_INTEGER) - (b.queue_rank ?? Number.MAX_SAFE_INTEGER)),
    [jobList]
  );
  const stats = useMemo(
    () => ({
      total: jobList.length,
      queued: jobList.filter((item) => item.job.status === "queued").length,
      running: jobList.filter((item) => item.job.status === "running").length,
      done: jobList.filter((item) => item.job.status === "succeeded" || item.job.status === "cancelled").length,
      blocked: jobList.filter((item) => item.job.status === "failed").length
    }),
    [jobList]
  );

  const toggleVoiceInput = async () => {
    setError(null);
    if (!voiceSupported) {
      setError("Voice recording is not supported by this browser.");
      return;
    }
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordedChunksRef.current = [];
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        const audioBlob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        void handleVoiceBlob(audioBlob);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setSubmitFeedback("Recording... tap mic again to send voice command.");
    } catch {
      setError("Unable to start microphone recording.");
      setIsRecording(false);
    }
  };

  const handleTodoDropOnTarget = async (targetJobId: string) => {
    if (!draggedTodoJobId || draggedTodoJobId === targetJobId) {
      setDraggedTodoJobId(null);
      return;
    }
    const orderedIds = todoList.map((item) => item.job.id);
    const fromIndex = orderedIds.indexOf(draggedTodoJobId);
    const toIndex = orderedIds.indexOf(targetJobId);
    if (fromIndex === -1 || toIndex === -1) {
      setDraggedTodoJobId(null);
      return;
    }
    const nextIds = [...orderedIds];
    const [moved] = nextIds.splice(fromIndex, 1);
    nextIds.splice(toIndex, 0, moved);

    setSubmitFeedback("Updating todo order...");
    try {
      await Promise.all(nextIds.map((jobId, index) => updateQueuePriority(jobId, index + 1)));
      await refreshJobs();
      setSubmitFeedback("Todo order updated.");
    } catch (err: unknown) {
      setError(String(err));
      setSubmitFeedback("Failed to update todo order.");
    } finally {
      setDraggedTodoJobId(null);
    }
  };

  const selectedJob = useMemo(
    () => (selectedJobId ? jobs[selectedJobId] ?? null : null),
    [jobs, selectedJobId]
  );
  const selectedLiveOutput = useMemo(
    () => (selectedJobId ? liveOutputByJob[selectedJobId] ?? [] : []),
    [liveOutputByJob, selectedJobId]
  );
  useEffect(() => {
    setModalCommandResult(null);
    setModalCommand("ls -la");
  }, [selectedJobId]);
  const autoDetectedUrl = useMemo(() => {
    const output = selectedJob?.output?.assistant_output ?? "";
    const live = selectedLiveOutput.join("\n");
    return detectFirstUrl(`${output}\n${live}`) ?? "";
  }, [selectedJob, selectedLiveOutput]);
  const workspaceNameById = useMemo(
    () => new Map(workspaces.map((workspace) => [workspace.id, workspace.name])),
    [workspaces]
  );
  const selectedWorkspaceLabel = selectedWorkspaceId ? "Selected workspace" : "Auto workspace (default)";

  const handleRunTaskTerminalCommand = async () => {
    const workspaceId = selectedJob?.job.workspace_id || selectedWorkspaceId || undefined;
    if (!modalCommand.trim()) {
      return;
    }
    setModalCommandRunning(true);
    setError(null);
    try {
      const result = await runWorkspaceCommand(workspaceId, {
        workspace_id: workspaceId,
        command: modalCommand,
        timeout_seconds: 120
      });
      setModalCommandResult(result);
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setModalCommandRunning(false);
    }
  };

  const setJobAudioRef = (jobId: string, element: HTMLAudioElement | null) => {
    audioRefs.current[jobId] = element;
  };

  const handleToggleVoicePlayback = async (jobId: string) => {
    const audio = audioRefs.current[jobId];
    if (!audio) {
      return;
    }
    if (playingVoiceJobId === jobId && !audio.paused) {
      audio.pause();
      setPlayingVoiceJobId(null);
      return;
    }
    if (playingVoiceJobId && playingVoiceJobId !== jobId) {
      const previous = audioRefs.current[playingVoiceJobId];
      previous?.pause();
    }
    try {
      await audio.play();
      setPlayingVoiceJobId(jobId);
    } catch {
      setError("Unable to start audio playback.");
    }
  };

  return (
    <main className="app-root min-h-screen px-4 py-4 sm:px-6">
      <div className="app-shell mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-[1800px] flex-col gap-4 p-4 sm:p-6">
        <header className="app-header">
          <div className="space-y-1">
            <p className="app-label">Seal</p>
            <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-[var(--app-heading)] sm:text-3xl">
              <PulseIcon className="h-6 w-6 text-[var(--app-accent)]" />
              Voice Ops Board
            </h1>
            <p className="text-sm text-[var(--app-subtle)]">
              Minimal control surface for voice-first Otter orchestration.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`app-health-indicator app-health-indicator--${backendHealth}`}
              data-tooltip={`Backend: ${backendHealth}`}
              aria-label={`Backend: ${backendHealth}`}
            />
            <button
              className="app-theme-toggle rounded-lg px-3 py-2 text-xs font-semibold"
              onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
              type="button"
            >
              {theme === "dark" ? (
                <>
                  <ThemeLightIcon className="h-5 w-5" />
                  Light
                </>
              ) : (
                <>
                  <ThemeDarkIcon className="h-5 w-5" />
                  Dark
                </>
              )}
            </button>
          </div>
        </header>

        <section className="app-toolbar app-panel mx-auto w-full max-w-5xl">
          <form
            ref={formRef}
            className="grid w-full gap-3"
            onSubmit={handleEnqueue}
          >
            <div className="app-input-stack">
              <textarea
                className="app-input rounded-lg px-5 py-4 text-lg"
                placeholder="Describe what you want built. Voice-first: record command, then refine text here if needed."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    formRef.current?.requestSubmit();
                  }
                }}
                rows={7}
                required
              />
              {voiceSupported ? (
                <button
                  className={`app-mic-button ${isRecording ? "app-mic-button--active app-mic-button--recording" : ""}`}
                  onClick={toggleVoiceInput}
                  title={isRecording ? "Stop & send voice command" : "Record voice command"}
                  type="button"
                  disabled={isVoiceProcessing}
                >
                  {isRecording ? <StopIcon className="h-6 w-6" /> : <MicrophoneIcon className="h-6 w-6" />}
                </button>
              ) : null}
            </div>
            {isRecording ? (
              <div className="app-voice-wave" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
            ) : null}
            <div className="flex items-center justify-center gap-3">
              <button
                className="app-button-primary rounded-lg px-4 py-2 text-sm font-semibold"
                type="submit"
                disabled={isSubmitting || isVoiceProcessing}
              >
                {isSubmitting ? "Submitting..." : "Add Task"}
              </button>
              <span className="text-xs text-[var(--app-subtle)]">{selectedWorkspaceLabel}</span>
            </div>
            <select
              className="app-input mx-auto w-full max-w-3xl rounded-lg px-3 py-2 text-sm"
              value={selectedWorkspaceId}
              onChange={(event) => {
                void handleSelectWorkspace(event.target.value);
              }}
            >
              <option value="">Auto workspace (server default)</option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name} — {workspace.root_path}
                </option>
              ))}
            </select>
          </form>
          {recordedAudioUrl ? (
            <div className="space-y-1">
              <p className="text-xs text-[var(--app-subtle)]">Last voice capture</p>
              <audio controls src={recordedAudioUrl} className="app-audio-player" />
            </div>
          ) : null}
          {voiceTranscript ? (
            <p className="text-xs text-[var(--app-subtle)]">
              Voice transcript: <span className="text-[var(--app-text)]">{voiceTranscript}</span>
            </p>
          ) : null}
          {submitFeedback ? (
            <p className="text-sm text-[var(--app-subtle)]">{submitFeedback}</p>
          ) : null}
          <div className="app-stats-grid">
            <div className="app-stat"><span>Total</span><strong>{stats.total}</strong></div>
            <div className="app-stat"><span>Todo</span><strong>{stats.queued}</strong></div>
            <div className="app-stat"><span>Running</span><strong>{stats.running}</strong></div>
            <div className="app-stat"><span>Done</span><strong>{stats.done}</strong></div>
            <div className="app-stat"><span>Blocked</span><strong>{stats.blocked}</strong></div>
          </div>
        </section>

        {error ? (
          <div className="rounded-lg border border-red-700 bg-red-950/30 p-3 text-sm text-red-300">{error}</div>
        ) : null}

        <div className="grid flex-1 gap-4 xl:grid-cols-[360px_1fr]">
          <aside className="app-panel flex min-h-[22rem] flex-col gap-3 p-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--app-subtle)]">Projects</h2>
            <div className="flex max-h-32 flex-col gap-2 overflow-auto">
              {projects.length === 0 ? (
                <p className="text-xs text-[var(--app-muted-text)]">No projects</p>
              ) : (
                projects.map((project) => (
                  <div key={project.id} className="rounded border border-[var(--app-muted-border)] p-2 text-xs">
                    <p className="font-semibold text-[var(--app-heading)]">{project.name}</p>
                    {project.description ? <p className="text-[var(--app-subtle)]">{project.description}</p> : null}
                  </div>
                ))
              )}
            </div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--app-subtle)]">Workspace files</h2>
            <div className="flex max-h-40 flex-col gap-2 overflow-auto">
              {workspaceTree?.entries?.length ? (
                workspaceTree.entries.map((entry) => (
                  <button
                    key={entry.relative_path}
                    className="rounded border border-[var(--app-muted-border)] px-2 py-1 text-left text-xs"
                    onClick={() => {
                      if (entry.kind === "file") {
                        void handleOpenFile(entry.relative_path);
                      }
                    }}
                    type="button"
                  >
                    <span className="font-semibold">{entry.kind === "directory" ? "DIR" : "FILE"}</span> {entry.relative_path}
                  </button>
                ))
              ) : (
                <p className="text-xs text-[var(--app-muted-text)]">Select a workspace to browse files.</p>
              )}
            </div>
            {selectedFile ? (
              <div className="rounded border border-[var(--app-muted-border)] bg-[var(--app-result-bg)] p-2">
                <p className="mb-1 text-xs font-semibold text-[var(--app-heading)]">{selectedFile.relative_path}</p>
                {isMarkdownLikeFile(selectedFile.relative_path) ? (
                  <div className="app-markdown max-h-64 overflow-auto text-xs">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {selectedFile.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-[11px] text-[var(--app-text)]">
                    {selectedFile.content}
                  </pre>
                )}
              </div>
            ) : null}
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--app-subtle)]">Workspace shell</h2>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  className="app-input flex-1 rounded px-2 py-1 text-xs"
                  value={workspaceCommand}
                  placeholder="npm run dev"
                  onChange={(event) => setWorkspaceCommand(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleRunWorkspaceCommand();
                    }
                  }}
                  disabled={workspaceCommandRunning}
                />
                <button
                  type="button"
                  className="app-button-primary rounded px-2 py-1 text-xs font-semibold"
                  disabled={workspaceCommandRunning}
                  onClick={() => {
                    void handleRunWorkspaceCommand();
                  }}
                >
                  {workspaceCommandRunning ? "Running..." : "Run"}
                </button>
              </div>
              <p className="text-xs text-[var(--app-muted-text)]">
                Runs in {selectedWorkspaceId ? "selected workspace" : "auto workspace"}.
              </p>
              {workspaceCommandResult ? (
                <div className="rounded border border-[var(--app-muted-border)] bg-[var(--app-result-bg)] p-2">
                  <p className="text-[11px] text-[var(--app-subtle)]">
                    Exit: {workspaceCommandResult.exit_code ?? "N/A"} {workspaceCommandResult.timed_out ? " (timed out)" : ""}
                  </p>
                  <pre className="max-h-44 overflow-auto whitespace-pre-wrap text-[11px] text-[var(--app-text)]">
                    {workspaceCommandResult.stdout || workspaceCommandResult.stderr || "(no output)"}
                  </pre>
                </div>
              ) : null}
            </div>
          </aside>

          <div className="flex-1 min-h-0 overflow-hidden">
            <KanbanBoard
              jobs={jobList}
              onCancel={handleCancel}
              onOpen={setSelectedJobId}
              hasVoiceForJob={(jobId) => Boolean(voiceAudioByJob[jobId])}
              isVoicePlayingForJob={(jobId) => playingVoiceJobId === jobId}
              onToggleVoice={(jobId) => {
                void handleToggleVoicePlayback(jobId);
              }}
              onTodoDragStart={setDraggedTodoJobId}
              onReorderTodo={(target) => {
                void handleTodoDropOnTarget(target);
              }}
            />
            {Object.entries(voiceAudioByJob).map(([jobId, src]) => (
              <audio
                key={jobId}
                ref={(element) => setJobAudioRef(jobId, element)}
                src={src}
                onPlay={() => setPlayingVoiceJobId(jobId)}
                onPause={() => {
                  setPlayingVoiceJobId((current) => (current === jobId ? null : current));
                }}
                onEnded={() => {
                  setPlayingVoiceJobId((current) => (current === jobId ? null : current));
                }}
                preload="metadata"
                className="hidden"
              />
            ))}
          </div>
        </div>
      </div>

      {selectedJob ? (
        <div className={`fixed inset-0 z-50 bg-black/60 p-4 ${modalFullscreen ? "" : "md:p-8"}`}>
          <div
            className={`mx-auto flex h-full flex-col gap-3 overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-4 ${
              modalFullscreen ? "w-full" : "max-w-6xl"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[var(--app-heading)]">
                {selectedJob.job.prompt}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  className="app-theme-toggle rounded px-2 py-1 text-xs"
                  onClick={() => setModalFullscreen((prev) => !prev)}
                  type="button"
                >
                  {modalFullscreen ? "Windowed" : "Fullscreen"}
                </button>
                <button
                  className="app-button-danger rounded px-2 py-1 text-xs"
                  onClick={() => setSelectedJobId(null)}
                  type="button"
                >
                  Close
                </button>
              </div>
            </div>
            <p className="text-xs text-[var(--app-subtle)]">
              Status: {selectedJob.job.status} • Workspace: {workspaceNameById.get(selectedJob.job.workspace_id) ?? selectedJob.job.workspace_id}
            </p>
            {voiceAudioByJob[selectedJob.job.id] ? (
              <div className="app-audio-panel">
                <p className="text-xs font-semibold text-[var(--app-subtle)]">Voice Command Audio</p>
                <div className="flex items-center gap-2">
                  <button
                    className="app-theme-toggle rounded px-2 py-1 text-xs"
                    type="button"
                    onClick={() => {
                      void handleToggleVoicePlayback(selectedJob.job.id);
                    }}
                  >
                    {playingVoiceJobId === selectedJob.job.id ? "Pause Voice" : "Play Voice"}
                  </button>
                  <audio
                    className="app-audio-player"
                    controls
                    src={voiceAudioByJob[selectedJob.job.id]}
                    onPlay={() => setPlayingVoiceJobId(selectedJob.job.id)}
                    onPause={() =>
                      setPlayingVoiceJobId((current) => (current === selectedJob.job.id ? null : current))
                    }
                    onEnded={() =>
                      setPlayingVoiceJobId((current) => (current === selectedJob.job.id ? null : current))
                    }
                  />
                </div>
              </div>
            ) : null}
            <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-2">
              <section className="rounded border border-[var(--app-muted-border)] bg-[var(--app-result-bg)] p-2">
                <p className="mb-1 text-xs font-semibold">Live terminal output</p>
                <pre className="h-full max-h-[30rem] overflow-auto whitespace-pre-wrap text-[11px]">
                  {selectedLiveOutput.length ? selectedLiveOutput.join("\n") : "No live chunks yet."}
                </pre>
              </section>
              <section className="rounded border border-[var(--app-muted-border)] bg-[var(--app-result-bg)] p-2">
                <p className="mb-1 text-xs font-semibold">Result</p>
                <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-[11px]">
                  {selectedJob.output?.assistant_output ?? "No final output yet."}
                </pre>
                <div className="mt-2 flex gap-2">
                  <input
                    className="app-input flex-1 rounded px-2 py-1 text-xs"
                    placeholder="https://localhost:3000"
                    value={previewUrl || autoDetectedUrl}
                    onChange={(event) => setPreviewUrl(event.target.value)}
                  />
                </div>
                {(previewUrl || autoDetectedUrl) ? (
                  <iframe
                    className="mt-2 h-64 w-full rounded border border-[var(--app-muted-border)] bg-white"
                    src={previewUrl || autoDetectedUrl}
                    title="Workspace app preview"
                  />
                ) : (
                  <p className="mt-2 text-xs text-[var(--app-muted-text)]">
                    No preview URL detected yet. Paste one from output/logs to run browser-in-browser.
                  </p>
                )}
                <div className="mt-3 rounded border border-[var(--app-muted-border)] bg-[var(--app-result-bg)] p-2">
                  <p className="mb-1 text-xs font-semibold">Task terminal</p>
                  <div className="flex gap-2">
                    <input
                      className="app-input flex-1 rounded px-2 py-1 text-xs"
                      value={modalCommand}
                      onChange={(event) => setModalCommand(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void handleRunTaskTerminalCommand();
                        }
                      }}
                      placeholder="npm run dev"
                    />
                    <button
                      className="app-button-primary rounded px-2 py-1 text-xs font-semibold"
                      type="button"
                      onClick={() => {
                        void handleRunTaskTerminalCommand();
                      }}
                      disabled={modalCommandRunning}
                    >
                      {modalCommandRunning ? "Running..." : "Run"}
                    </button>
                  </div>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[11px]">
                    {modalCommandResult
                      ? `${modalCommandResult.stdout}${modalCommandResult.stderr ? `\n${modalCommandResult.stderr}` : ""}`
                      : "No command run yet."}
                  </pre>
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
