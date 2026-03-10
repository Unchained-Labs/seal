import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cancelJob,
  checkBackendHealth,
  enqueuePrompt,
  enqueueVoicePrompt,
  getJob,
  getRuntimeLogs,
  getRuntimeStatus,
  holdJob,
  listHistory,
  listQueue,
  openRuntimeShellSocket,
  restartRuntimeContainer,
  resumeJob,
  runWorkspaceCommand,
  setJobProjectPath,
  setJobRuntimeLaunchConfig,
  startJobRuntimeLaunch,
  startRuntimeContainer,
  stopJobRuntimeLaunch,
  stopRuntimeContainer,
  updateQueuePriority
} from "./api/otter";
import { KanbanBoard } from "./components/KanbanBoard";
import {
  BrowserIcon,
  CompressIcon,
  ExpandIcon,
  MicrophoneIcon,
  StopIcon,
  TerminalIcon,
  TextModeIcon,
  ThemeDarkIcon,
  ThemeLightIcon
} from "./components/icons";
import { RuntimeTerminal, type RuntimeTerminalEntry } from "./components/RuntimeTerminal";
import { VoicePromptPlayer } from "./components/VoicePromptPlayer";
import { type OtterEventPayload, useOtterEvents } from "./hooks/useOtterEvents";
import type {
  HistoryItem,
  JobResponse,
  QueueItem,
  RuntimeContainerInfo,
  RuntimeShellMessage,
  WorkspaceCommandResponse
} from "./types";
type BackendHealth = "checking" | "online" | "offline";
const JOB_CACHE_KEY = "seal-job-cache-v1";
const VOICE_AUDIO_CACHE_KEY = "seal-voice-audio-v1";

type TerminalHistoryEntry = RuntimeTerminalEntry;

interface UiToast {
  id: string;
  message: string;
}

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
      preview_url: null,
      project_path: null,
      runtime_start_command: null,
      runtime_stop_command: null,
      runtime_command_cwd: null,
      is_paused: false,
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
      preview_url: null,
      project_path: null,
      runtime_start_command: null,
      runtime_stop_command: null,
      runtime_command_cwd: null,
      is_paused: false,
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

function stringifyUnknownJson(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function pickTextField(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim() || null;
  }
  if (Array.isArray(value)) {
    const joined = value
      .map((entry) => {
        if (typeof entry === "string") {
          return entry;
        }
        if (entry && typeof entry === "object" && "text" in entry) {
          return stringifyUnknownJson((entry as { text?: unknown }).text);
        }
        return stringifyUnknownJson(entry);
      })
      .join("")
      .trim();
    return joined || null;
  }
  if (value && typeof value === "object" && "text" in value) {
    const text = stringifyUnknownJson((value as { text?: unknown }).text).trim();
    return text || null;
  }
  return null;
}

function formatStreamingLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) {
    return "";
  }
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return trimmed;
  }
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const role = typeof parsed.role === "string" ? parsed.role : undefined;
    const content =
      pickTextField(parsed.content) ??
      (parsed.message && typeof parsed.message === "object"
        ? pickTextField((parsed.message as { content?: unknown }).content)
        : null) ??
      (parsed.delta && typeof parsed.delta === "object"
        ? pickTextField((parsed.delta as { content?: unknown }).content)
        : null);
    if (role === "system" || role === "user") {
      return "";
    }
    if (role === "assistant" && content) {
      return content;
    }
    if (role && content) {
      return `${role}: ${content}`;
    }
    if (content) {
      return content;
    }
    if (typeof parsed.type === "string") {
      return `event:${parsed.type}`;
    }
    return trimmed;
  } catch {
    return trimmed;
  }
}

function shouldSuppressLiveLine(line: string): boolean {
  const probe = line.toLowerCase();
  return (
    probe.includes("system requirements") ||
    probe.includes("user task:") ||
    probe.includes("work in a project-specific subfolder") ||
    probe.includes("always create a setup script")
  );
}

function formatLiveOutputLine(stream: string | undefined, line: string): string {
  const normalized = formatStreamingLine(line);
  if (!normalized) {
    return "";
  }
  if (shouldSuppressLiveLine(normalized)) {
    return "";
  }
  if (stream === "stderr") {
    return `stderr> ${normalized}`;
  }
  return normalized;
}

function formatHistoryClock(iso: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) {
    return "--:--:--";
  }
  return new Date(parsed).toLocaleTimeString();
}

function normalizePreviewUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const parsed = new URL(trimmed);
    const isTargetLocal =
      parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "::1";
    const browserHost = window.location.hostname;
    const browserIsLocal =
      browserHost === "localhost" || browserHost === "127.0.0.1" || browserHost === "::1";
    if (isTargetLocal && browserHost && !browserIsLocal) {
      parsed.hostname = browserHost;
    }
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

function FooterGithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        fill="currentColor"
        d="M12 2a10 10 0 0 0-3.16 19.49c.5.1.68-.22.68-.48v-1.7c-2.78.6-3.37-1.18-3.37-1.18-.46-1.17-1.11-1.48-1.11-1.48-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.9.82.09-.65.35-1.08.64-1.33-2.22-.25-4.56-1.1-4.56-4.9 0-1.09.4-1.98 1.03-2.67-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.7 9.7 0 0 1 5 0c1.9-1.29 2.74-1.02 2.74-1.02.55 1.38.2 2.4.1 2.65.64.69 1.02 1.58 1.02 2.67 0 3.8-2.34 4.65-4.57 4.89.36.3.68.9.68 1.82v2.7c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"
      />
    </svg>
  );
}

function FooterLinkedinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        fill="currentColor"
        d="M6.94 8.5a1.56 1.56 0 1 1 0-3.12 1.56 1.56 0 0 1 0 3.12ZM5.56 9.75h2.76V18H5.56V9.75Zm4.3 0h2.65v1.13h.04c.37-.7 1.28-1.44 2.63-1.44 2.81 0 3.33 1.85 3.33 4.26V18h-2.76v-3.83c0-.91-.02-2.08-1.27-2.08-1.27 0-1.46.99-1.46 2.01V18H9.86V9.75Z"
      />
    </svg>
  );
}

function FooterGlobeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        fill="currentColor"
        d="M12 2a10 10 0 1 0 10 10A10.01 10.01 0 0 0 12 2Zm6.92 9h-3.05a15.2 15.2 0 0 0-1.2-5.02A8.03 8.03 0 0 1 18.92 11Zm-6.92 9a13.1 13.1 0 0 1-2.03-5h4.06a13.1 13.1 0 0 1-2.03 5Zm-2.38-7a13.07 13.07 0 0 1 0-2h4.76a13.07 13.07 0 0 1 0 2H9.62Zm-5.54-2a8.03 8.03 0 0 1 4.25-5.02A15.2 15.2 0 0 0 7.13 11H4.08Zm0 2h3.05a15.2 15.2 0 0 0 1.2 5.02A8.03 8.03 0 0 1 4.08 13Zm10.59 5.02A15.2 15.2 0 0 0 15.87 13h3.05a8.03 8.03 0 0 1-4.25 5.02Zm1.2-7h-3.05a13.1 13.1 0 0 0-2.03-5h2.16a13.4 13.4 0 0 1 2.92 5ZM11.06 5a13.1 13.1 0 0 0-2.03 5H6a13.4 13.4 0 0 1 2.9-5h2.16Z"
      />
    </svg>
  );
}

export default function App() {
  const [jobs, setJobs] = useState<Record<string, JobResponse>>({});
  const [liveOutputByJob, setLiveOutputByJob] = useState<Record<string, string[]>>({});
  const [prompt, setPrompt] = useState("");
  const [projectPath, setProjectPath] = useState("");
  const [dependencyJobIdsInput, setDependencyJobIdsInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitFeedback, setSubmitFeedback] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [isRecording, setIsRecording] = useState(false);
  const [isVoiceProcessing, setIsVoiceProcessing] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceAudioByJob, setVoiceAudioByJob] = useState<Record<string, string>>({});
  const [playingVoiceJobId, setPlayingVoiceJobId] = useState<string | null>(null);
  const [backendHealth, setBackendHealth] = useState<BackendHealth>("checking");
  const [workspaceCommand, setWorkspaceCommand] = useState("ls -la");
  const [workspaceShellCwd, setWorkspaceShellCwd] = useState<string>("workspace root");
  const [workspaceTerminalHistory, setWorkspaceTerminalHistory] = useState<TerminalHistoryEntry[]>([]);
  const [workspaceCommandRunning, setWorkspaceCommandRunning] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [modalFullscreen, setModalFullscreen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [modalCommand, setModalCommand] = useState("ls -la");
  const [modalCommandRunning, setModalCommandRunning] = useState(false);
  const [modalCommandResult, setModalCommandResult] = useState<WorkspaceCommandResponse | null>(null);
  const [runtimeStartCommand, setRuntimeStartCommand] = useState("");
  const [runtimeStopCommand, setRuntimeStopCommand] = useState("");
  const [runtimeWorkingDirectory, setRuntimeWorkingDirectory] = useState("");
  const [runtimeCommandRunning, setRuntimeCommandRunning] = useState<"start" | "stop" | null>(null);
  const [modalShellCwdByJob, setModalShellCwdByJob] = useState<Record<string, string>>({});
  const [modalPreviewTab, setModalPreviewTab] = useState<"terminal" | "browser">("terminal");
  const [modalPreviewFullscreen, setModalPreviewFullscreen] = useState(false);
  const [modalTerminalHistoryByJob, setModalTerminalHistoryByJob] = useState<
    Record<string, TerminalHistoryEntry[]>
  >({});
  const [draggedTodoJobId, setDraggedTodoJobId] = useState<string | null>(null);
  const [composerMode, setComposerMode] = useState<"voice" | "text">("voice");
  const [toasts, setToasts] = useState<UiToast[]>([]);
  const [runtimeByWorkspace, setRuntimeByWorkspace] = useState<Record<string, RuntimeContainerInfo>>({});
  const [runtimeLogsByWorkspace, setRuntimeLogsByWorkspace] = useState<Record<string, string>>({});
  const [modalShellConnected, setModalShellConnected] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const healthCheckInFlightRef = useRef(false);
  const refreshSequenceRef = useRef(0);
  const pushToTalkActiveRef = useRef(false);
  const seenCompletedEventsRef = useRef<Set<string>>(new Set());
  const workspaceTerminalHistoryRef = useRef<HTMLDivElement | null>(null);
  const modalTerminalHistoryRef = useRef<HTMLDivElement | null>(null);
  const resultLiveStreamRef = useRef<HTMLPreElement | null>(null);
  const modalShellSocketRef = useRef<WebSocket | null>(null);
  const voiceSupported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined";

  const refreshJobs = useCallback(async () => {
    const refreshSequence = ++refreshSequenceRef.current;
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
    // Ignore stale refresh responses that completed out-of-order.
    if (refreshSequence !== refreshSequenceRef.current) {
      return;
    }
    // Replace cache with backend truth so fresh DB runs don't keep stale local jobs.
    setJobs(Object.fromEntries(entries));
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
      setError(String(err));
    });
  }, [refreshJobs]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshJobs().catch((err: unknown) => {
        setError(String(err));
      });
    }, 5000);
    return () => {
      window.clearInterval(interval);
    };
  }, [refreshJobs]);

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
      const alive = await checkBackendHealth(5000);
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
      const line = payload?.line;
      if (line) {
        const formatted = formatLiveOutputLine(payload?.stream, line);
        if (!formatted) {
          return;
        }
        setLiveOutputByJob((prev) => ({
          ...prev,
          [event.job_id]: [...(prev[event.job_id] ?? []), formatted]
        }));
      }
    } else {
      console.info("[seal-events]", event.event_type, { jobId: event.job_id });
    }
    if (event.event_type === "completed") {
      const dedupeKey = `${event.job_id}:${event.event_type}`;
      if (!seenCompletedEventsRef.current.has(dedupeKey)) {
        seenCompletedEventsRef.current.add(dedupeKey);
        const shortId = event.job_id.slice(0, 8);
        const toastId = `${Date.now()}-${shortId}`;
        const message = `Job ${shortId} completed`;
        setToasts((prev) => [...prev, { id: toastId, message }].slice(-4));
        window.setTimeout(() => {
          setToasts((prev) => prev.filter((toast) => toast.id !== toastId));
        }, 5000);
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification("Otter job completed", { body: message });
        }
      }
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
      const dependencyJobIds = dependencyJobIdsInput
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      const job = await enqueuePrompt({
        prompt,
        project_path: projectPath.trim() || undefined,
        dependency_job_ids: dependencyJobIds.length ? dependencyJobIds : undefined
      });
      if (projectPath.trim()) {
        await setJobProjectPath(job.id, projectPath.trim());
      }
      setPrompt("");
      setProjectPath("");
      setDependencyJobIdsInput("");
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
      setError(String(err));
    }
  };

  const handleTogglePaused = async (jobId: string, paused: boolean) => {
    setError(null);
    try {
      if (paused) {
        await resumeJob(jobId);
      } else {
        await holdJob(jobId);
      }
      const refreshed = await getJob(jobId);
      setJobs((prev) => ({ ...prev, [jobId]: refreshed }));
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
      setIsVoiceProcessing(true);
      setSubmitFeedback("Transcribing voice command...");
      setError(null);
      try {
        const response = await enqueueVoicePrompt(audioBlob, {
          workspace_id: undefined
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
        setError(String(err));
        setSubmitFeedback("Voice command failed.");
      } finally {
        setIsVoiceProcessing(false);
      }
    },
    [refreshJobs]
  );

  const handleRunWorkspaceCommand = async () => {
    if (!workspaceCommand.trim()) {
      return;
    }
    setWorkspaceCommandRunning(true);
    setError(null);
    try {
      const result = await runWorkspaceCommand(undefined, {
        workspace_id: undefined,
        command: workspaceCommand,
        shell_session_id: "workspace-shell",
        timeout_seconds: 120
      });
      setWorkspaceShellCwd(result.working_directory);
      const entry: TerminalHistoryEntry = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        command: workspaceCommand,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        exitCode: result.exit_code ?? null,
        timedOut: result.timed_out ?? false,
        createdAt: new Date().toISOString(),
        workingDirectory: result.working_directory
      };
      setWorkspaceTerminalHistory((prev) => [...prev, entry].slice(-120));
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
  const startVoiceRecording = useCallback(async () => {
    setError(null);
    if (!voiceSupported) {
      setError("Voice recording is not supported by this browser.");
      return;
    }
    if (isRecording || isVoiceProcessing) {
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
      setSubmitFeedback("Recording... release Shift+Space (or click mic) to send voice command.");
    } catch {
      setError("Unable to start microphone recording.");
      setIsRecording(false);
    }
  }, [handleVoiceBlob, isRecording, isVoiceProcessing, voiceSupported]);

  const stopVoiceRecording = useCallback(() => {
    if (!isRecording) {
      return;
    }
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }, [isRecording]);

  const toggleVoiceInput = async () => {
    if (isRecording) {
      stopVoiceRecording();
      return;
    }
    await startVoiceRecording();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }
      const isPushToTalk = event.shiftKey && event.code === "Space";
      const isToggleShortcut =
        (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "v";
      if (isPushToTalk) {
        event.preventDefault();
        if (!pushToTalkActiveRef.current) {
          pushToTalkActiveRef.current = true;
          void startVoiceRecording();
        }
        return;
      }
      if (isToggleShortcut) {
        event.preventDefault();
        if (isRecording) {
          stopVoiceRecording();
        } else {
          void startVoiceRecording();
        }
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const isPushToTalkRelease = event.code === "Space" && pushToTalkActiveRef.current;
      if (!isPushToTalkRelease) {
        return;
      }
      event.preventDefault();
      pushToTalkActiveRef.current = false;
      stopVoiceRecording();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [isRecording, startVoiceRecording, stopVoiceRecording]);

  useEffect(() => {
    return () => {
      if (isRecording) {
        mediaRecorderRef.current?.stop();
      }
    };
  }, [isRecording]);

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
  const selectedTerminalHistory = useMemo(
    () => (selectedJobId ? modalTerminalHistoryByJob[selectedJobId] ?? [] : []),
    [modalTerminalHistoryByJob, selectedJobId]
  );
  const selectedWorkspaceId = selectedJob?.job.workspace_id || "";
  const selectedRuntime = selectedWorkspaceId ? runtimeByWorkspace[selectedWorkspaceId] : undefined;
  const selectedRuntimeLogs = selectedWorkspaceId ? runtimeLogsByWorkspace[selectedWorkspaceId] ?? "" : "";
  useEffect(() => {
    setModalCommandResult(null);
    setModalCommand("ls -la");
    setRuntimeStartCommand(selectedJob?.job.runtime_start_command ?? "");
    setRuntimeStopCommand(selectedJob?.job.runtime_stop_command ?? "");
    setRuntimeWorkingDirectory(selectedJob?.job.runtime_command_cwd ?? "");
    setPreviewUrl("");
    setModalPreviewTab("terminal");
    setModalPreviewFullscreen(false);
  }, [selectedJobId, selectedJob?.job.runtime_command_cwd, selectedJob?.job.runtime_start_command, selectedJob?.job.runtime_stop_command]);
  useEffect(() => {
    if (!selectedWorkspaceId) {
      return;
    }
    void getRuntimeStatus(selectedWorkspaceId)
      .then((runtime) => {
        setRuntimeByWorkspace((prev) => ({ ...prev, [selectedWorkspaceId]: runtime }));
      })
      .catch(() => {
        // Ignore when runtime is disabled or unavailable.
      });
    void getRuntimeLogs(selectedWorkspaceId, 200)
      .then((payload) => {
        setRuntimeLogsByWorkspace((prev) => ({ ...prev, [selectedWorkspaceId]: payload.logs ?? "" }));
      })
      .catch(() => {
        // Keep UI usable even when runtime logs are unavailable.
      });
  }, [selectedWorkspaceId]);
  useEffect(() => {
    const existing = modalShellSocketRef.current;
    if (existing) {
      existing.close();
      modalShellSocketRef.current = null;
    }
    setModalShellConnected(false);
    if (!selectedWorkspaceId || !selectedJobId) {
      return;
    }
    const socket = openRuntimeShellSocket(selectedWorkspaceId);
    modalShellSocketRef.current = socket;
    socket.onopen = () => setModalShellConnected(true);
    socket.onclose = () => setModalShellConnected(false);
    socket.onerror = () => setModalShellConnected(false);
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data as string) as RuntimeShellMessage;
        if (payload.event !== "result" || !payload.command) {
          if (payload.error) {
            setError(payload.error);
          }
          return;
        }
        const entry: TerminalHistoryEntry = {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          command: payload.command,
          stdout: payload.stdout ?? "",
          stderr: payload.stderr ?? "",
          exitCode: payload.exit_code ?? null,
          timedOut: false,
          createdAt: new Date().toISOString(),
          workingDirectory: payload.working_directory ?? "workspace root"
        };
        setModalShellCwdByJob((prev) => ({
          ...prev,
          [selectedJobId]: entry.workingDirectory
        }));
        setModalTerminalHistoryByJob((prev) => ({
          ...prev,
          [selectedJobId]: [...(prev[selectedJobId] ?? []), entry].slice(-120)
        }));
      } catch {
        // Ignore malformed shell payloads.
      } finally {
        setModalCommandRunning(false);
      }
    };
    return () => {
      socket.close();
      if (modalShellSocketRef.current === socket) {
        modalShellSocketRef.current = null;
      }
    };
  }, [selectedWorkspaceId, selectedJobId]);
  useEffect(() => {
    const target = workspaceTerminalHistoryRef.current;
    if (target) {
      target.scrollTop = target.scrollHeight;
    }
  }, [workspaceTerminalHistory]);
  useEffect(() => {
    const target = modalTerminalHistoryRef.current;
    if (target) {
      target.scrollTop = target.scrollHeight;
    }
  }, [selectedTerminalHistory]);
  useEffect(() => {
    const target = resultLiveStreamRef.current;
    if (target) {
      target.scrollTop = target.scrollHeight;
    }
  }, [selectedLiveOutput]);
  const autoDetectedUrl = useMemo(() => {
    const output = selectedJob?.output?.assistant_output ?? "";
    const live = selectedLiveOutput.join("\n");
    return (
      selectedJob?.job.preview_url ??
      detectFirstUrl(`${output}\n${live}`) ??
      selectedRuntime?.preferred_url ??
      ""
    );
  }, [selectedJob, selectedLiveOutput, selectedRuntime?.preferred_url]);
  const activePreviewUrl = normalizePreviewUrl(previewUrl.trim() || autoDetectedUrl);
  const handleRunTaskTerminalCommand = async () => {
    if (!selectedJobId) {
      return;
    }
    const workspaceId = selectedJob?.job.workspace_id || undefined;
    if (!modalCommand.trim()) {
      return;
    }
    setModalCommandRunning(true);
    setError(null);
    const socket = modalShellSocketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN && workspaceId) {
      socket.send(
        JSON.stringify({
          command: modalCommand,
          shell_session_id: selectedJobId
        })
      );
      return;
    }
    try {
      const result = await runWorkspaceCommand(workspaceId, {
        workspace_id: workspaceId,
        command: modalCommand,
        shell_session_id: selectedJobId,
        timeout_seconds: 120
      });
      setModalCommandResult(result);
      setModalShellCwdByJob((prev) => ({
        ...prev,
        [selectedJobId]: result.working_directory
      }));
      const entry: TerminalHistoryEntry = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        command: modalCommand,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        exitCode: result.exit_code ?? null,
        timedOut: result.timed_out ?? false,
        createdAt: new Date().toISOString(),
        workingDirectory: result.working_directory
      };
      setModalTerminalHistoryByJob((prev) => ({
        ...prev,
        [selectedJobId]: [...(prev[selectedJobId] ?? []), entry].slice(-120)
      }));
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setModalCommandRunning(false);
    }
  };

  const handleRuntimeAction = async (action: "start" | "stop" | "restart") => {
    if (!selectedWorkspaceId) {
      return;
    }
    try {
      const runtime =
        action === "start"
          ? await startRuntimeContainer(selectedWorkspaceId)
          : action === "stop"
            ? await stopRuntimeContainer(selectedWorkspaceId)
            : await restartRuntimeContainer(selectedWorkspaceId);
      setRuntimeByWorkspace((prev) => ({ ...prev, [selectedWorkspaceId]: runtime }));
      const logs = await getRuntimeLogs(selectedWorkspaceId, 200);
      setRuntimeLogsByWorkspace((prev) => ({ ...prev, [selectedWorkspaceId]: logs.logs ?? "" }));
    } catch (err: unknown) {
      setError(String(err));
    }
  };

  const handleSaveRuntimeLaunchConfig = async () => {
    if (!selectedJobId) {
      return;
    }
    if (!runtimeStartCommand.trim()) {
      setError("Runtime start command is required.");
      return;
    }
    try {
      await setJobRuntimeLaunchConfig(selectedJobId, {
        start_command: runtimeStartCommand.trim(),
        stop_command: runtimeStopCommand.trim() || undefined,
        working_directory: runtimeWorkingDirectory.trim() || undefined
      });
      const refreshed = await getJob(selectedJobId);
      setJobs((prev) => ({ ...prev, [selectedJobId]: refreshed }));
    } catch (err: unknown) {
      setError(String(err));
    }
  };

  const handleRunSavedRuntimeCommand = async (action: "start" | "stop") => {
    if (!selectedJobId) {
      return;
    }
    setRuntimeCommandRunning(action);
    try {
      const result = action === "start" ? await startJobRuntimeLaunch(selectedJobId) : await stopJobRuntimeLaunch(selectedJobId);
      const entry: TerminalHistoryEntry = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        command: result.command,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        exitCode: result.exit_code ?? null,
        timedOut: result.timed_out ?? false,
        createdAt: new Date().toISOString(),
        workingDirectory: result.working_directory
      };
      setModalTerminalHistoryByJob((prev) => ({
        ...prev,
        [selectedJobId]: [...(prev[selectedJobId] ?? []), entry].slice(-120)
      }));
      const refreshed = await getJob(selectedJobId);
      setJobs((prev) => ({ ...prev, [selectedJobId]: refreshed }));
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setRuntimeCommandRunning(null);
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
        {toasts.length ? (
          <div className="fixed right-4 top-4 z-[90] flex w-full max-w-xs flex-col gap-2">
            {toasts.map((toast) => (
              <div
                key={toast.id}
                className="rounded border border-[var(--app-border)] bg-[var(--app-card)] px-3 py-2 text-sm text-[var(--app-heading)] shadow-lg"
              >
                {toast.message}
              </div>
            ))}
          </div>
        ) : null}
        <section className="grid gap-4 lg:grid-cols-[7fr_3fr]">
          <div className="app-toolbar app-panel">
            <div className="flex items-center justify-between gap-2">
              <p className="app-label">Seal</p>
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
            </div>
            <form
              ref={formRef}
              className="grid w-full gap-3"
              onSubmit={handleEnqueue}
            >
              <div className="flex items-center justify-center gap-3">
                <label className="app-mode-switch" title="Toggle between voice and text mode">
                  <span className={`app-mode-switch__icon ${composerMode === "voice" ? "is-active" : ""}`}>
                    <MicrophoneIcon className="h-4 w-4" />
                  </span>
                  <input
                    className="app-mode-switch__input"
                    type="checkbox"
                    checked={composerMode === "text"}
                    onChange={(event) => setComposerMode(event.target.checked ? "text" : "voice")}
                    aria-label="Toggle between voice and text mode"
                  />
                  <span className="app-mode-switch__track">
                    <span className="app-mode-switch__thumb" />
                  </span>
                  <span className={`app-mode-switch__icon ${composerMode === "text" ? "is-active" : ""}`}>
                    <TextModeIcon className="h-4 w-4" />
                  </span>
                </label>
              </div>
              <div className="app-composer-mode-panel">
                {composerMode === "voice" ? (
                  <div className="app-voice-stage">
                    <p className="app-label text-center">Develop at the speed of thought</p>
                    <p className="text-center text-sm text-[var(--app-subtle)]">
                      Hold <kbd>Shift</kbd> + <kbd>Space</kbd> to push-to-talk or use <kbd>Ctrl/Cmd</kbd> + <kbd>Shift</kbd> +
                      <kbd>V</kbd> to toggle recording.
                    </p>
                    <button
                      className={`app-mic-button app-mic-button--hero ${isRecording ? "app-mic-button--active app-mic-button--recording" : ""}`}
                      onClick={() => {
                        void toggleVoiceInput();
                      }}
                      title={isRecording ? "Stop & send voice command" : "Record voice command"}
                      type="button"
                      disabled={isVoiceProcessing || !voiceSupported}
                    >
                      {isRecording ? <StopIcon className="h-9 w-9" /> : <MicrophoneIcon className="h-9 w-9" />}
                    </button>
                    {isRecording ? (
                      <div className="app-voice-wave app-voice-wave--hero" aria-hidden="true">
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="app-text-stage">
                    <div className="app-input-stack">
                      <textarea
                        className="app-input rounded-lg px-4 py-3 text-base"
                        placeholder="Describe what you want built."
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            formRef.current?.requestSubmit();
                          }
                        }}
                        rows={5}
                        required={composerMode === "text"}
                      />
                      <input
                        className="app-input mt-2 rounded-lg px-3 py-2 text-sm"
                        placeholder="Project path in workspace (optional), e.g. apps/todo"
                        value={projectPath}
                        onChange={(event) => setProjectPath(event.target.value)}
                      />
                      <input
                        className="app-input mt-2 rounded-lg px-3 py-2 text-sm"
                        placeholder="Dependency job IDs (optional, comma-separated)"
                        value={dependencyJobIdsInput}
                        onChange={(event) => setDependencyJobIdsInput(event.target.value)}
                      />
                    </div>
                    <div className="mt-3 flex justify-center">
                      <button
                        className="app-button-primary rounded-lg px-5 py-2.5 text-sm font-semibold"
                        type="submit"
                        disabled={isSubmitting || isVoiceProcessing}
                      >
                        {isSubmitting ? "Submitting..." : "Send Typed Task"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </form>
            {voiceTranscript ? (
              <div className="app-transcript">
                <p className="text-sm text-[var(--app-subtle)]">Voice transcript sent</p>
                <p className="text-base text-[var(--app-text)]">{voiceTranscript}</p>
              </div>
            ) : null}
            {submitFeedback ? (
              <p className="text-base text-[var(--app-subtle)]">{submitFeedback}</p>
            ) : null}
          </div>

          <aside className="app-panel flex min-h-[18rem] flex-col gap-3 p-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--app-subtle)]">Workspace terminal</h2>
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
              <p className="text-xs text-[var(--app-muted-text)]">Runs in the default auto workspace.</p>
              <p className="text-[11px] text-[var(--app-subtle)]">
                cwd: <code>{workspaceShellCwd}</code>
              </p>
              <div className="max-h-56">
                <RuntimeTerminal
                  history={workspaceTerminalHistory}
                  historyRef={workspaceTerminalHistoryRef}
                  formatClock={formatHistoryClock}
                  emptyLabel="No command history yet. Run a command to build history."
                />
              </div>
            </div>
          </aside>
        </section>

        {error ? (
          <div className="rounded-lg border border-red-700 bg-red-950/30 p-3 text-sm text-red-300">{error}</div>
        ) : null}

        <div className="flex-1 min-h-0 overflow-hidden">
          <KanbanBoard
            jobs={jobList}
            onCancel={handleCancel}
            onTogglePaused={handleTogglePaused}
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
              liveOutputPreviewForJob={(jobId) => {
                const lines = liveOutputByJob[jobId];
                if (!lines?.length) {
                  return "";
                }
                return lines[lines.length - 1] ?? "";
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

        <footer className="app-footer">
          <p>
            Seal voice-first mode enabled. Switch between voice and text with the compact mode toggle.
          </p>
          <p>
            Developed by{" "}
            <a href="https://unchainedlabs.xyz" target="_blank" rel="noreferrer">
              unchainlabs.xyz
            </a>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <a
              href="https://github.com/Unchained-Labs"
              target="_blank"
              rel="noreferrer"
              className="app-theme-toggle inline-flex items-center gap-1 rounded px-2 py-1 text-xs"
              aria-label="Unchained Labs GitHub"
              title="Unchained Labs GitHub"
            >
              <FooterGithubIcon className="h-4 w-4" />
              <span>GitHub</span>
            </a>
            <a
              href="https://www.linkedin.com/company/unchained-labs-inc/"
              target="_blank"
              rel="noreferrer"
              className="app-theme-toggle inline-flex items-center gap-1 rounded px-2 py-1 text-xs"
              aria-label="Unchained Labs LinkedIn"
              title="Unchained Labs LinkedIn"
            >
              <FooterLinkedinIcon className="h-4 w-4" />
              <span>LinkedIn</span>
            </a>
            <a
              href="https://kymatics.vercel.app/"
              target="_blank"
              rel="noreferrer"
              className="app-theme-toggle inline-flex items-center gap-1 rounded px-2 py-1 text-xs"
              aria-label="Kymatics website"
              title="Kymatics website"
            >
              <FooterGlobeIcon className="h-4 w-4" />
              <span>Kymatics</span>
            </a>
          </div>
        </footer>
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
              Status: {selectedJob.job.status} • Workspace: {selectedJob.job.workspace_id || "auto"}
            </p>
            {selectedWorkspaceId ? (
              <div className="rounded border border-[var(--app-muted-border)] bg-[var(--app-card)] p-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--app-subtle)]">
                  <span>
                    Runtime: <strong>{selectedRuntime?.status ?? "unknown"}</strong>
                  </span>
                  {selectedRuntime?.preferred_url ? (
                    <span>
                      URL: <code>{selectedRuntime.preferred_url}</code>
                    </span>
                  ) : null}
                  <span>
                    Shell: <strong>{modalShellConnected ? "connected" : "offline"}</strong>
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="app-theme-toggle rounded px-2 py-1 text-xs"
                    onClick={() => {
                      void handleRuntimeAction("start");
                    }}
                  >
                    Start
                  </button>
                  <button
                    type="button"
                    className="app-theme-toggle rounded px-2 py-1 text-xs"
                    onClick={() => {
                      void handleRuntimeAction("restart");
                    }}
                  >
                    Restart
                  </button>
                  <button
                    type="button"
                    className="app-theme-toggle rounded px-2 py-1 text-xs"
                    onClick={() => {
                      void handleRuntimeAction("stop");
                    }}
                  >
                    Stop
                  </button>
                </div>
                <div className="mt-3 rounded border border-[var(--app-muted-border)] bg-[var(--app-surface)] p-2">
                  <p className="text-xs font-semibold text-[var(--app-subtle)]">Saved runtime launch commands</p>
                  <div className="mt-2 grid gap-2">
                    <input
                      className="app-input rounded px-2 py-1 text-xs"
                      placeholder="Start command (required), e.g. docker compose up -d"
                      value={runtimeStartCommand}
                      onChange={(event) => setRuntimeStartCommand(event.target.value)}
                    />
                    <input
                      className="app-input rounded px-2 py-1 text-xs"
                      placeholder="Stop command (optional), e.g. docker compose down"
                      value={runtimeStopCommand}
                      onChange={(event) => setRuntimeStopCommand(event.target.value)}
                    />
                    <input
                      className="app-input rounded px-2 py-1 text-xs"
                      placeholder="Working directory relative to workspace root (optional)"
                      value={runtimeWorkingDirectory}
                      onChange={(event) => setRuntimeWorkingDirectory(event.target.value)}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="app-theme-toggle rounded px-2 py-1 text-xs"
                      onClick={() => {
                        void handleSaveRuntimeLaunchConfig();
                      }}
                    >
                      Save runtime commands
                    </button>
                    <button
                      type="button"
                      className="app-theme-toggle rounded px-2 py-1 text-xs"
                      disabled={runtimeCommandRunning !== null}
                      onClick={() => {
                        void handleRunSavedRuntimeCommand("start");
                      }}
                    >
                      {runtimeCommandRunning === "start" ? "Starting..." : "Run saved start"}
                    </button>
                    <button
                      type="button"
                      className="app-theme-toggle rounded px-2 py-1 text-xs"
                      disabled={runtimeCommandRunning !== null}
                      onClick={() => {
                        void handleRunSavedRuntimeCommand("stop");
                      }}
                    >
                      {runtimeCommandRunning === "stop" ? "Stopping..." : "Run saved stop"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
            {voiceAudioByJob[selectedJob.job.id] ? (
              <div className="app-audio-panel">
                <p className="text-xs font-semibold text-[var(--app-subtle)]">Voice Command Audio</p>
                <VoicePromptPlayer src={voiceAudioByJob[selectedJob.job.id]} />
              </div>
            ) : null}
            <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[4fr_6fr]">
              <section className="flex min-h-0 flex-col rounded border border-[var(--app-muted-border)] bg-[var(--app-result-bg)] p-2">
                <p className="mb-1 text-xs font-semibold">Result</p>
                <pre className="app-terminal-output max-h-32 overflow-auto whitespace-pre-wrap text-[11px]">
                  {selectedJob.output?.assistant_output ?? "No final output yet."}
                </pre>
                <p className="mb-1 mt-2 text-xs font-semibold">Recent live build stream</p>
                <pre
                  ref={resultLiveStreamRef}
                  className="app-terminal-output min-h-0 flex-1 overflow-auto whitespace-pre-wrap text-[11px]"
                >
                  {selectedLiveOutput.length ? selectedLiveOutput.slice(-120).join("\n") : "No live chunks yet."}
                </pre>
                <p className="mt-2 text-xs text-[var(--app-muted-text)]">
                  Preview URLs using localhost are rewritten to this host when needed.
                </p>
              </section>
              <section
                className={`rounded border border-[var(--app-muted-border)] bg-[var(--app-result-bg)] ${
                  modalPreviewFullscreen
                    ? "fixed inset-5 z-[80] flex h-auto w-auto flex-col p-3 shadow-2xl"
                    : "flex min-h-[32rem] flex-col p-2"
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className={`app-tab-button ${modalPreviewTab === "terminal" ? "app-tab-button--active" : ""}`}
                      onClick={() => setModalPreviewTab("terminal")}
                    >
                      <TerminalIcon className="h-4 w-4" />
                      Workspace Shell
                    </button>
                    <button
                      type="button"
                      className={`app-tab-button ${modalPreviewTab === "browser" ? "app-tab-button--active" : ""}`}
                      onClick={() => setModalPreviewTab("browser")}
                    >
                      <BrowserIcon className="h-4 w-4" />
                      Browser
                    </button>
                  </div>
                  <button
                    type="button"
                    className="app-theme-toggle inline-flex items-center gap-1 rounded px-2 py-1 text-xs"
                    onClick={() => setModalPreviewFullscreen((prev) => !prev)}
                  >
                    {modalPreviewFullscreen ? <CompressIcon className="h-4 w-4" /> : <ExpandIcon className="h-4 w-4" />}
                    {modalPreviewFullscreen ? "Exit" : "Fullscreen"}
                  </button>
                </div>
                {modalPreviewTab === "terminal" ? (
                  <div className="flex min-h-0 flex-1 flex-col gap-2">
                    <div className="rounded border border-[var(--app-muted-border)] bg-[var(--app-card)] p-2">
                      <p className="mb-1 text-xs font-semibold text-[var(--app-subtle)]">Run command in workspace</p>
                      <p className="mb-1 text-[11px] text-[var(--app-subtle)]">
                        cwd: <code>{selectedJobId ? (modalShellCwdByJob[selectedJobId] ?? "workspace root") : "workspace root"}</code>
                      </p>
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
                      {modalCommandResult ? (
                        <p className="mt-1 text-[11px] text-[var(--app-subtle)]">
                          Last command exit: {modalCommandResult.exit_code ?? "N/A"}
                          {modalCommandResult.timed_out ? " (timed out)" : ""}
                        </p>
                      ) : null}
                    </div>
                    {selectedRuntimeLogs ? (
                      <div className="rounded border border-[var(--app-muted-border)] bg-[var(--app-card)] p-2">
                        <p className="mb-1 text-xs font-semibold text-[var(--app-subtle)]">Runtime container logs</p>
                        <pre className="app-terminal-output max-h-28 overflow-auto whitespace-pre-wrap text-[11px]">
                          {selectedRuntimeLogs}
                        </pre>
                      </div>
                    ) : null}
                    <div className="min-h-0 flex-1 rounded border border-[var(--app-muted-border)] bg-[var(--app-card)] p-2">
                      <p className="mb-1 text-xs font-semibold text-[var(--app-subtle)]">Workspace shell history</p>
                      <RuntimeTerminal
                        history={selectedTerminalHistory}
                        historyRef={modalTerminalHistoryRef}
                        formatClock={formatHistoryClock}
                        emptyLabel="No command history yet. Run a command to build history."
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col gap-2">
                    <div className="flex gap-2">
                      <input
                        className="app-input flex-1 rounded px-2 py-1 text-xs"
                        placeholder={autoDetectedUrl || "https://localhost:3000"}
                        value={previewUrl}
                        onChange={(event) => setPreviewUrl(event.target.value)}
                      />
                      {autoDetectedUrl ? (
                        <button
                          type="button"
                          className="app-theme-toggle rounded px-2 py-1 text-xs"
                          onClick={() => setPreviewUrl(autoDetectedUrl)}
                        >
                          Use detected URL
                        </button>
                      ) : null}
                    </div>
                    {activePreviewUrl ? (
                      <iframe
                        className="h-full min-h-[24rem] w-full flex-1 rounded border border-[var(--app-muted-border)] bg-white"
                        src={activePreviewUrl}
                        title="Workspace app preview"
                      />
                    ) : (
                      <div className="rounded border border-[var(--app-muted-border)] bg-[var(--app-card)] p-3">
                        <p className="text-xs text-[var(--app-muted-text)]">
                          No preview URL yet. Paste one above, or use a detected URL from output when available.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
