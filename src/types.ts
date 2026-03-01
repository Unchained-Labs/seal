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

export interface Project {
  id: string;
  name: string;
  description: string | null;
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

export interface WorkspaceTreeEntry {
  name: string;
  relative_path: string;
  kind: "file" | "directory";
  size_bytes: number | null;
}

export interface WorkspaceTreeResponse {
  workspace_id: string;
  root_path: string;
  base_path: string;
  entries: WorkspaceTreeEntry[];
}

export interface WorkspaceFileResponse {
  workspace_id: string;
  relative_path: string;
  content: string;
  truncated: boolean;
}

export interface WorkspaceCommandRequest {
  workspace_id?: string;
  command: string;
  working_directory?: string;
  shell_session_id?: string;
  timeout_seconds?: number;
}

export interface WorkspaceCommandResponse {
  workspace_id: string;
  command: string;
  working_directory: string;
  shell_session_id?: string;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  timed_out: boolean;
}

export interface EnqueuePromptRequest {
  workspace_id?: string;
  prompt: string;
  priority?: number;
}

export interface VoiceEnqueueResponse {
  transcript: string;
  job: Job;
}

export type RuntimeContainerStatus = "running" | "stopped" | "missing";

export interface RuntimePortBinding {
  container_port: number;
  host_ip: string;
  host_port: number;
}

export interface RuntimeContainerInfo {
  workspace_id: string;
  container_name: string;
  image_tag: string;
  container_id: string | null;
  status: RuntimeContainerStatus;
  ports: RuntimePortBinding[];
  preferred_url: string | null;
}

export interface RuntimeLogsResponse {
  workspace_id: string;
  logs: string;
}

export interface RuntimeShellMessage {
  event: "result" | "error";
  command?: string;
  stdout?: string;
  stderr?: string;
  exit_code?: number;
  working_directory?: string;
  error?: string;
}
