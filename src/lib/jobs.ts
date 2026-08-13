/**
 * Adapters that widen the narrower shapes returned by the queue and history
 * endpoints into the full `JobResponse` the board renders.
 *
 * `GET /v1/queue` and `GET /v1/history` deliberately return summaries rather
 * than whole jobs, so the board can show a card immediately and hydrate the
 * detail lazily. These fill in the gaps with explicit placeholders instead of
 * letting the UI branch on partially-populated objects everywhere.
 */

import type { HistoryItem, JobResponse } from "../types";

/**
 * Builds a placeholder job for a prompt that was just enqueued, so the card
 * appears on the board before the first poll returns.
 */
export function toQueuedJobResponse(
  jobId: string,
  prompt: string,
  rank: number | null,
  now: () => string = () => new Date().toISOString()
): JobResponse {
  const timestamp = now();
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
      created_at: timestamp,
      updated_at: timestamp
    },
    output: null,
    queue_rank: rank,
    dependency_job_ids: []
  };
}

/** Widens a history summary into a full job response. */
export function toHistoryJobResponse(item: HistoryItem): JobResponse {
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
    queue_rank: null,
    dependency_job_ids: []
  };
}
