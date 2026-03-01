import { useEffect } from "react";

const OTTER_URL = import.meta.env.VITE_OTTER_URL ?? "http://localhost:8080";

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

export function useOtterEvents({ onEvent }: UseOtterEventsArgs) {
  useEffect(() => {
    const source = new EventSource(`${OTTER_URL}/v1/events/stream`);
    const handleMessage = (event: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(event.data) as OtterEventPayload;
        onEvent(parsed);
      } catch {
        // Ignore malformed payloads to keep stream alive
      }
    };
    const eventTypes = [
      "accepted",
      "queued",
      "started",
      "retry_queued",
      "completed",
      "failed",
      "cancelled",
      "queue_priority_updated"
    ];

    // Fallback for default SSE "message" events.
    source.onmessage = handleMessage;
    // Otter sends named events; subscribe to each lifecycle event.
    for (const eventType of eventTypes) {
      source.addEventListener(eventType, handleMessage as EventListener);
    }
    source.onerror = () => {
      // EventSource auto-reconnect handles transient failures.
    };
    return () => {
      for (const eventType of eventTypes) {
        source.removeEventListener(eventType, handleMessage as EventListener);
      }
      source.close();
    };
  }, [onEvent]);
}
