import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cancelJob,
  checkBackendHealth,
  enqueuePrompt,
  enqueueVoicePrompt,
  getJob,
  listHistory,
  listQueue,
  runWorkspaceCommand,
  updateQueuePriority
} from "./api/otter";
import { KanbanBoard } from "./components/KanbanBoard";
import { MicrophoneIcon, StopIcon, ThemeDarkIcon, ThemeLightIcon } from "./components/icons";
import { VoicePromptPlayer } from "./components/VoicePromptPlayer";
import { type OtterEventPayload, useOtterEvents } from "./hooks/useOtterEvents";
import type {
  HistoryItem,
  JobResponse,
  QueueItem,
  WorkspaceCommandResponse
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

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
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
  const [showWriteInput, setShowWriteInput] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const healthCheckInFlightRef = useRef(false);
  const pushToTalkActiveRef = useRef(false);
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
        setBackendHealth("offline");
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
  useEffect(() => {
    setModalCommandResult(null);
    setModalCommand("ls -la");
  }, [selectedJobId]);
  const autoDetectedUrl = useMemo(() => {
    const output = selectedJob?.output?.assistant_output ?? "";
    const live = selectedLiveOutput.join("\n");
    return detectFirstUrl(`${output}\n${live}`) ?? "";
  }, [selectedJob, selectedLiveOutput]);
  const handleRunTaskTerminalCommand = async () => {
    const workspaceId = selectedJob?.job.workspace_id || undefined;
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
              <div className="flex items-center justify-center gap-3">
                <button
                  className="app-theme-toggle rounded-lg px-4 py-2 text-sm font-semibold"
                  type="button"
                  onClick={() => setShowWriteInput((prev) => !prev)}
                >
                  {showWriteInput ? "Hide typing" : "Write instead"}
                </button>
              </div>
              {showWriteInput ? (
                <>
                  <div className="app-input-stack">
                    <textarea
                      className="app-input rounded-lg px-4 py-3 text-base"
                      placeholder="Optional typing mode: describe what you want built."
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          formRef.current?.requestSubmit();
                        }
                      }}
                      rows={5}
                      required
                    />
                  </div>
                  <div className="flex justify-center">
                    <button
                      className="app-button-primary rounded-lg px-5 py-2.5 text-sm font-semibold"
                      type="submit"
                      disabled={isSubmitting || isVoiceProcessing}
                    >
                      {isSubmitting ? "Submitting..." : "Send Typed Task"}
                    </button>
                  </div>
                </>
              ) : null}
            </form>
            {recordedAudioUrl ? (
              <div className="app-audio-panel space-y-2">
                <p className="text-sm font-semibold text-[var(--app-subtle)]">Last voice capture</p>
                <VoicePromptPlayer src={recordedAudioUrl} />
              </div>
            ) : null}
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
        </section>

        {error ? (
          <div className="rounded-lg border border-red-700 bg-red-950/30 p-3 text-sm text-red-300">{error}</div>
        ) : null}

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

        <footer className="app-footer">
          <p>
            Seal voice-first mode enabled. Primary action: talk to Otter. Secondary action: write with the
            <strong> Write instead</strong> button.
          </p>
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
            {voiceAudioByJob[selectedJob.job.id] ? (
              <div className="app-audio-panel">
                <p className="text-xs font-semibold text-[var(--app-subtle)]">Voice Command Audio</p>
                <div className="grid gap-2">
                  <button
                    className="app-theme-toggle rounded px-2 py-1 text-xs"
                    type="button"
                    onClick={() => {
                      void handleToggleVoicePlayback(selectedJob.job.id);
                    }}
                  >
                    {playingVoiceJobId === selectedJob.job.id ? "Pause Voice" : "Play Voice"}
                  </button>
                  <VoicePromptPlayer src={voiceAudioByJob[selectedJob.job.id]} />
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
