import type { EnqueuePromptRequest, JobResponse, QueueItem, Workspace } from "../types";

const OTTER_URL = import.meta.env.VITE_OTTER_URL ?? "http://localhost:8080";

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${OTTER_URL}${path}`, init);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Otter API ${response.status}: ${body}`);
  }
  return (await response.json()) as T;
}

export async function listQueue(limit = 200, offset = 0): Promise<QueueItem[]> {
  return jsonRequest<QueueItem[]>(`/v1/queue?limit=${limit}&offset=${offset}`);
}

export async function listWorkspaces(): Promise<Workspace[]> {
  return jsonRequest<Workspace[]>("/v1/workspaces");
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
  const response = await fetch(`${OTTER_URL}/v1/jobs/${jobId}/cancel`, {
    method: "POST"
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Otter API ${response.status}: ${body}`);
  }
}
