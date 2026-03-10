import type {
  EnqueuePromptRequest,
  HistoryItem,
  JobResponse,
  Project,
  QueueItem,
  RuntimeContainerInfo,
  RuntimeLaunchConfigRequest,
  RuntimeLogsResponse,
  VoiceEnqueueResponse,
  Workspace,
  WorkspaceCommandRequest,
  WorkspaceCommandResponse,
  WorkspaceFileResponse,
  WorkspaceTreeResponse
} from "../types";

function resolveOtterUrl(): string {
  const configured = import.meta.env.VITE_OTTER_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }
  // Default to same-origin proxy to avoid CORS/hostname drift across dev and Docker.
  return "/api";
}

function resolveOtterWsUrl(): string {
  const configured = import.meta.env.VITE_OTTER_URL?.trim();
  if (configured) {
    try {
      const parsed = new URL(configured);
      parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
      parsed.pathname = parsed.pathname.replace(/\/+$/, "");
      return parsed.toString().replace(/\/+$/, "");
    } catch {
      // Fall through to same-origin default.
    }
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api`;
}

const OTTER_URL = resolveOtterUrl();
const OTTER_WS_URL = resolveOtterWsUrl();
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
  if (response.status === 204) {
    return undefined as T;
  }
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

export async function runWorkspaceCommand(
  workspaceId: string | undefined,
  payload: WorkspaceCommandRequest
): Promise<WorkspaceCommandResponse> {
  const path = workspaceId ? `/v1/workspaces/${workspaceId}/command` : "/v1/workspaces/command";
  const body = workspaceId ? payload : { ...payload, workspace_id: payload.workspace_id ?? workspaceId };
  return jsonRequest<WorkspaceCommandResponse>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export async function getRuntimeStatus(workspaceId: string): Promise<RuntimeContainerInfo> {
  return jsonRequest<RuntimeContainerInfo>(`/v1/runtime/workspaces/${workspaceId}`);
}

export async function startRuntimeContainer(workspaceId: string): Promise<RuntimeContainerInfo> {
  return jsonRequest<RuntimeContainerInfo>(`/v1/runtime/workspaces/${workspaceId}/start`, {
    method: "POST"
  });
}

export async function stopRuntimeContainer(workspaceId: string): Promise<RuntimeContainerInfo> {
  return jsonRequest<RuntimeContainerInfo>(`/v1/runtime/workspaces/${workspaceId}/stop`, {
    method: "POST"
  });
}

export async function restartRuntimeContainer(workspaceId: string): Promise<RuntimeContainerInfo> {
  return jsonRequest<RuntimeContainerInfo>(`/v1/runtime/workspaces/${workspaceId}/restart`, {
    method: "POST"
  });
}

export async function getRuntimeLogs(workspaceId: string, tail = 300): Promise<RuntimeLogsResponse> {
  return jsonRequest<RuntimeLogsResponse>(`/v1/runtime/workspaces/${workspaceId}/logs?tail=${tail}`);
}

export function openRuntimeShellSocket(workspaceId: string): WebSocket {
  return new WebSocket(`${OTTER_WS_URL}/v1/runtime/workspaces/${workspaceId}/shell/ws`);
}

export async function enqueuePrompt(payload: EnqueuePromptRequest): Promise<JobResponse["job"]> {
  return jsonRequest<JobResponse["job"]>("/v1/prompts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function enqueueVoicePrompt(
  audioBlob: Blob,
  options?: { workspace_id?: string; language?: string; provider?: string; dependency_job_ids?: string[] }
): Promise<VoiceEnqueueResponse> {
  const form = new FormData();
  form.append("file", audioBlob, "voice-command.webm");
  if (options?.workspace_id) {
    form.append("workspace_id", options.workspace_id);
  }
  if (options?.language) {
    form.append("language", options.language);
  }
  if (options?.provider) {
    form.append("provider", options.provider);
  }
  if (options?.dependency_job_ids?.length) {
    for (const dependencyJobId of options.dependency_job_ids) {
      form.append("dependency_job_id", dependencyJobId);
    }
  }

  const startedAt = performance.now();
  logApi("request:start", { method: "POST", path: "/v1/voice/prompts" });
  const response = await fetch(`${OTTER_URL}/v1/voice/prompts`, {
    method: "POST",
    body: form
  });
  const elapsedMs = Math.round(performance.now() - startedAt);
  if (!response.ok) {
    const body = await response.text();
    logApi("request:error", {
      method: "POST",
      path: "/v1/voice/prompts",
      status: response.status,
      elapsedMs,
      body
    });
    throw new Error(`Otter API ${response.status}: ${body}`);
  }
  logApi("request:success", { method: "POST", path: "/v1/voice/prompts", status: response.status, elapsedMs });
  return (await response.json()) as VoiceEnqueueResponse;
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

export async function pauseJob(jobId: string): Promise<void> {
  const startedAt = performance.now();
  const path = `/v1/jobs/${jobId}/pause`;
  logApi("request:start", { method: "POST", path });
  const response = await fetch(`${OTTER_URL}${path}`, {
    method: "POST"
  });
  if (!response.ok) {
    const body = await response.text();
    logApi("request:error", {
      method: "POST",
      path,
      status: response.status,
      elapsedMs: Math.round(performance.now() - startedAt),
      body
    });
    throw new Error(`Otter API ${response.status}: ${body}`);
  }
  logApi("request:success", {
    method: "POST",
    path,
    status: response.status,
    elapsedMs: Math.round(performance.now() - startedAt)
  });
}

export async function holdJob(jobId: string): Promise<void> {
  const startedAt = performance.now();
  const path = `/v1/jobs/${jobId}/hold`;
  logApi("request:start", { method: "POST", path });
  const response = await fetch(`${OTTER_URL}${path}`, {
    method: "POST"
  });
  if (!response.ok) {
    const body = await response.text();
    logApi("request:error", {
      method: "POST",
      path,
      status: response.status,
      elapsedMs: Math.round(performance.now() - startedAt),
      body
    });
    throw new Error(`Otter API ${response.status}: ${body}`);
  }
  logApi("request:success", {
    method: "POST",
    path,
    status: response.status,
    elapsedMs: Math.round(performance.now() - startedAt)
  });
}

export async function resumeJob(jobId: string): Promise<void> {
  const startedAt = performance.now();
  const path = `/v1/jobs/${jobId}/resume`;
  logApi("request:start", { method: "POST", path });
  const response = await fetch(`${OTTER_URL}${path}`, {
    method: "POST"
  });
  if (!response.ok) {
    const body = await response.text();
    logApi("request:error", {
      method: "POST",
      path,
      status: response.status,
      elapsedMs: Math.round(performance.now() - startedAt),
      body
    });
    throw new Error(`Otter API ${response.status}: ${body}`);
  }
  logApi("request:success", {
    method: "POST",
    path,
    status: response.status,
    elapsedMs: Math.round(performance.now() - startedAt)
  });
}

export async function setJobProjectPath(jobId: string, projectPath: string): Promise<void> {
  await jsonRequest<void>(`/v1/jobs/${jobId}/project-path`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_path: projectPath })
  });
}

export async function setJobDependencies(jobId: string, dependencyJobIds: string[]): Promise<void> {
  await jsonRequest<void>(`/v1/jobs/${jobId}/dependencies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dependency_job_ids: dependencyJobIds })
  });
}

export async function setJobRuntimeLaunchConfig(
  jobId: string,
  payload: RuntimeLaunchConfigRequest
): Promise<void> {
  await jsonRequest<void>(`/v1/jobs/${jobId}/runtime-launch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function startJobRuntimeLaunch(jobId: string): Promise<WorkspaceCommandResponse> {
  return jsonRequest<WorkspaceCommandResponse>(`/v1/jobs/${jobId}/runtime-launch/start`, {
    method: "POST"
  });
}

export async function stopJobRuntimeLaunch(jobId: string): Promise<WorkspaceCommandResponse> {
  return jsonRequest<WorkspaceCommandResponse>(`/v1/jobs/${jobId}/runtime-launch/stop`, {
    method: "POST"
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
