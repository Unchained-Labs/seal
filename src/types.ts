export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface Job {
  id: string;
  workspace_id: string;
  prompt: string;
  status: JobStatus;
  priority: number;
  schedule_at: string | null;
  attempts: number;
  max_attempts: number;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobOutput {
  id: string;
  job_id: string;
  assistant_output: string;
  raw_json: unknown;
  created_at: string;
}

export interface JobResponse {
  job: Job;
  output: JobOutput | null;
  queue_rank: number | null;
}

export interface QueueItem {
  job_id: string;
  workspace_id: string;
  prompt: string;
  priority: number;
  schedule_at: string | null;
  queue_rank: number;
  created_at: string;
}

export interface HistoryItem {
  job_id: string;
  workspace_id: string;
  prompt: string;
  status: JobStatus;
  assistant_output: string | null;
  created_at: string;
}

export interface Workspace {
  id: string;
  project_id: string;
  name: string;
  root_path: string;
  isolated_vibe_home: string;
  created_at: string;
}

export interface EnqueuePromptRequest {
  workspace_id?: string;
  prompt: string;
  priority?: number;
}
