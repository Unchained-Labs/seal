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
    source.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as OtterEventPayload;
        onEvent(parsed);
      } catch {
        // Ignore malformed payloads to keep stream alive
      }
    };
    source.onerror = () => {
      // EventSource auto-reconnect handles transient failures.
    };
    return () => source.close();
  }, [onEvent]);
}
