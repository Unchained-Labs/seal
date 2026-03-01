import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cancelJob, enqueuePrompt, getJob, listQueue } from "./api/otter";
import { KanbanBoard } from "./components/KanbanBoard";
import { MicrophoneIcon, StopIcon, TerminalIcon, ThemeDarkIcon, ThemeLightIcon } from "./components/icons";
import { type OtterEventPayload, useOtterEvents } from "./hooks/useOtterEvents";
import type { JobResponse } from "./types";

interface SpeechRecognitionResultAlternative {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  0: SpeechRecognitionResultAlternative;
}

interface SpeechRecognitionEventLike extends Event {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

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
  const [prompt, setPrompt] = useState("");
  const [priority, setPriority] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

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

  useEffect(() => {
    void refreshQueue().catch((err: unknown) => setError(String(err)));
  }, [refreshQueue]);

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

  useEffect(() => {
    const speechCtor = (
      window as unknown as {
        SpeechRecognition?: SpeechRecognitionCtor;
        webkitSpeechRecognition?: SpeechRecognitionCtor;
      }
    ).SpeechRecognition ??
      (
        window as unknown as {
          SpeechRecognition?: SpeechRecognitionCtor;
          webkitSpeechRecognition?: SpeechRecognitionCtor;
        }
      ).webkitSpeechRecognition;

    if (!speechCtor) {
      setVoiceSupported(false);
      return;
    }

    setVoiceSupported(true);
    const recognition = new speechCtor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const spoken = event.results[0]?.[0]?.transcript?.trim();
      if (!spoken) {
        return;
      }
      setPrompt((prev) => (prev ? `${prev} ${spoken}` : spoken));
    };
    recognition.onerror = () => {
      setIsListening(false);
    };
    recognition.onend = () => {
      setIsListening(false);
    };
    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
      recognitionRef.current = null;
    };
  }, []);

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
      const job = await enqueuePrompt({
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

  const toggleVoiceInput = () => {
    setError(null);
    const recognition = recognitionRef.current;
    if (!recognition) {
      setError("Voice input is not supported by this browser.");
      return;
    }
    if (isListening) {
      recognition.stop();
      setIsListening(false);
      return;
    }
    try {
      recognition.start();
      setIsListening(true);
    } catch {
      setError("Unable to start voice input.");
      setIsListening(false);
    }
  };

  return (
    <main className="app-root min-h-screen px-4 py-4 sm:px-6">
      <div className="app-shell mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-[1600px] flex-col gap-4 p-4 sm:p-6">
        <header className="app-header">
          <div className="space-y-1">
            <p className="app-label">Seal</p>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-[var(--app-heading)] sm:text-3xl">
              <TerminalIcon className="h-6 w-6 text-[var(--app-accent)]" />
              Builder Board
            </h1>
            <p className="text-sm text-[var(--app-subtle)]">Minimal control surface for Otter queue orchestration.</p>
          </div>
          <button
            className="app-theme-toggle rounded-lg px-3 py-2 text-xs font-semibold"
            onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
            type="button"
          >
            {theme === "dark" ? (
              <>
                <ThemeLightIcon className="h-4 w-4" />
                Light
              </>
            ) : (
              <>
                <ThemeDarkIcon className="h-4 w-4" />
                Dark
              </>
            )}
          </button>
        </header>

        <section className="app-toolbar app-panel">
          <form className="grid w-full gap-3 md:grid-cols-[2fr_140px_150px]" onSubmit={handleEnqueue}>
            <div className="app-input-stack">
              <input
                className="app-input rounded-lg px-3 py-2 text-sm"
                placeholder="Describe your task..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                required
              />
              {voiceSupported ? (
                <button
                  className={`app-mic-button ${isListening ? "app-mic-button--active" : ""}`}
                  onClick={toggleVoiceInput}
                  title={isListening ? "Stop voice input" : "Start voice input"}
                  type="button"
                >
                  {isListening ? <StopIcon className="h-4 w-4" /> : <MicrophoneIcon className="h-4 w-4" />}
                </button>
              ) : null}
            </div>
            <input
              className="app-input rounded-lg px-3 py-2 text-sm"
              type="number"
              min={1}
              max={100000}
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
            />
            <button
              className="app-button-primary rounded-lg px-3 py-2 text-sm font-semibold"
              type="submit"
            >
              Add Task
            </button>
          </form>
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

        <div className="flex-1">
          <KanbanBoard jobs={jobList} onCancel={handleCancel} />
        </div>
      </div>
    </main>
  );
}
