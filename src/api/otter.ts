import type {
  EnqueuePromptRequest,
  HistoryItem,
  JobResponse,
  Project,
  QueueItem,
  Workspace,
  WorkspaceFileResponse,
  WorkspaceTreeResponse
} from "../types";

function resolveOtterUrl(): string {
  const configured = import.meta.env.VITE_OTTER_URL?.trim();
  if (configured) {
    return configured;
  }
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:8080`;
  }
  return "http://localhost:8080";
}

const OTTER_URL = resolveOtterUrl();
const SEAL_DEBUG = import.meta.env.DEV || import.meta.env.VITE_SEAL_DEBUG === "1";

function logApi(message: string, extra?: Record<string, unknown>) {
  if (!SEAL_DEBUG) {
    return;
  }
  console.info(`[seal-api] ${message}`, extra ?? {});
}

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? "GET";
  const startedAt = performance.now();
  logApi("request:start", { method, path });
  const response = await fetch(`${OTTER_URL}${path}`, init);
  const elapsedMs = Math.round(performance.now() - startedAt);
  if (!response.ok) {
    const body = await response.text();
    logApi("request:error", { method, path, status: response.status, elapsedMs, body });
    throw new Error(`Otter API ${response.status}: ${body}`);
  }
  logApi("request:success", { method, path, status: response.status, elapsedMs });
  return (await response.json()) as T;
}

export async function listQueue(limit = 200, offset = 0): Promise<QueueItem[]> {
  return jsonRequest<QueueItem[]>(`/v1/queue?limit=${limit}&offset=${offset}`);
}

export async function listHistory(limit = 200): Promise<HistoryItem[]> {
  return jsonRequest<HistoryItem[]>(`/v1/history?limit=${limit}`);
}

export async function listProjects(): Promise<Project[]> {
  return jsonRequest<Project[]>("/v1/projects");
}

export async function listWorkspaces(): Promise<Workspace[]> {
  return jsonRequest<Workspace[]>("/v1/workspaces");
}

export async function checkBackendHealth(timeoutMs = 3000): Promise<boolean> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${OTTER_URL}/healthz`, { cache: "no-store", signal: controller.signal });
    if (!response.ok) {
      return false;
    }
    const body = (await response.text()).trim().toLowerCase();
    return body === "ok";
  } catch {
    return false;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export async function getWorkspaceTree(
  workspaceId: string,
  path = "",
  depth = 2
): Promise<WorkspaceTreeResponse> {
  const query = new URLSearchParams({ path, depth: String(depth) });
  return jsonRequest<WorkspaceTreeResponse>(`/v1/workspaces/${workspaceId}/tree?${query.toString()}`);
}

export async function getWorkspaceFile(
  workspaceId: string,
  relativePath: string
): Promise<WorkspaceFileResponse> {
  const query = new URLSearchParams({ path: relativePath });
  return jsonRequest<WorkspaceFileResponse>(`/v1/workspaces/${workspaceId}/file?${query.toString()}`);
}

export async function enqueuePrompt(payload: EnqueuePromptRequest): Promise<JobResponse["job"]> {
  return jsonRequest<JobResponse["job"]>("/v1/prompts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function getJob(jobId: string): Promise<JobResponse> {
  return jsonRequest<JobResponse>(`/v1/jobs/${jobId}`);
}

export async function cancelJob(jobId: string): Promise<void> {
  const startedAt = performance.now();
  logApi("request:start", { method: "POST", path: `/v1/jobs/${jobId}/cancel` });
  const response = await fetch(`${OTTER_URL}/v1/jobs/${jobId}/cancel`, {
    method: "POST"
  });
  if (!response.ok) {
    const body = await response.text();
    logApi("request:error", {
      method: "POST",
      path: `/v1/jobs/${jobId}/cancel`,
      status: response.status,
      elapsedMs: Math.round(performance.now() - startedAt),
      body
    });
    throw new Error(`Otter API ${response.status}: ${body}`);
  }
  logApi("request:success", {
    method: "POST",
    path: `/v1/jobs/${jobId}/cancel`,
    status: response.status,
    elapsedMs: Math.round(performance.now() - startedAt)
  });
}

export async function updateQueuePriority(jobId: string, priority: number): Promise<void> {
  const path = `/v1/queue/${jobId}`;
  const startedAt = performance.now();
  logApi("request:start", { method: "PATCH", path, priority });
  const response = await fetch(`${OTTER_URL}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ priority })
  });
  if (!response.ok) {
    const body = await response.text();
    logApi("request:error", {
      method: "PATCH",
      path,
      status: response.status,
      elapsedMs: Math.round(performance.now() - startedAt),
      body
    });
    throw new Error(`Otter API ${response.status}: ${body}`);
  }
  logApi("request:success", {
    method: "PATCH",
    path,
    status: response.status,
    elapsedMs: Math.round(performance.now() - startedAt),
    priority
  });
}
