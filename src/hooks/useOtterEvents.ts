import { useEffect } from "react";

import { resolveOtterBaseUrl } from "../api/otter";

export interface OtterEventPayload {
  id: string;
  job_id: string;
  event_type: string;
  payload: unknown;
  created_at: string;
}

interface UseOtterEventsArgs {
  onEvent: (event: OtterEventPayload) => void;
}

/**
 * Every event type Otter emits.
 *
 * The server sends named SSE events, and a named event never triggers
 * `EventSource.onmessage` — it only reaches listeners registered for that exact
 * name. Any type missing from this list is silently dropped by the UI, so it has
 * to stay in step with the `insert_job_event` calls in otter-core/otter-server.
 */
export const OTTER_EVENT_TYPES = [
  "accepted",
  "queued",
  "started",
  "output_chunk",
  "retry_queued",
  "completed",
  "failed",
  "cancelled",
  "paused",
  "resumed",
  "on_hold",
  "queue_priority_updated",
  "project_path_set",
  "dependencies_set",
  "preview_url_set",
  "runtime_launch_config_set",
  "runtime_container_ready",
  "runtime_setup_failed",
  "setup_failed"
] as const;

export function useOtterEvents({ onEvent }: UseOtterEventsArgs) {
  useEffect(() => {
    // Share the API client's resolution so the stream and the REST calls always
    // agree on an origin; they used to disagree whenever VITE_OTTER_URL was unset.
    const source = new EventSource(`${resolveOtterBaseUrl()}/v1/events/stream`);
    const handleMessage = (event: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(event.data) as OtterEventPayload;
        onEvent(parsed);
      } catch {
        // Ignore malformed payloads to keep stream alive
      }
    };

    // Fallback for default SSE "message" events.
    source.onmessage = handleMessage;
    // Otter sends named events; subscribe to each lifecycle event.
    for (const eventType of OTTER_EVENT_TYPES) {
      source.addEventListener(eventType, handleMessage as EventListener);
    }
    source.onerror = () => {
      // EventSource auto-reconnect handles transient failures.
    };
    return () => {
      for (const eventType of OTTER_EVENT_TYPES) {
        source.removeEventListener(eventType, handleMessage as EventListener);
      }
      source.close();
    };
  }, [onEvent]);
}
