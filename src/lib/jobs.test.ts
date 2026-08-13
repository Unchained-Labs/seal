import { describe, expect, it } from "vitest";

import type { HistoryItem } from "../types";
import { toHistoryJobResponse, toQueuedJobResponse } from "./jobs";

const FIXED_NOW = "2026-08-12T10:00:00.000Z";
const now = () => FIXED_NOW;

describe("toQueuedJobResponse", () => {
  it("builds a queued placeholder carrying the prompt", () => {
    const response = toQueuedJobResponse("job-1", "build a dashboard", 3, now);
    expect(response.job.id).toBe("job-1");
    expect(response.job.prompt).toBe("build a dashboard");
    expect(response.job.status).toBe("queued");
    expect(response.queue_rank).toBe(3);
  });

  it("uses the rank as the priority", () => {
    expect(toQueuedJobResponse("job-1", "p", 7, now).job.priority).toBe(7);
  });

  it("falls back to the default priority when rank is unknown", () => {
    const response = toQueuedJobResponse("job-1", "p", null, now);
    expect(response.job.priority).toBe(100);
    expect(response.queue_rank).toBeNull();
  });

  it("starts with no output, no preview, and no dependencies", () => {
    const response = toQueuedJobResponse("job-1", "p", null, now);
    expect(response.output).toBeNull();
    expect(response.job.preview_url).toBeNull();
    expect(response.dependency_job_ids).toEqual([]);
  });

  it("stamps created_at and updated_at with the same instant", () => {
    const response = toQueuedJobResponse("job-1", "p", null, now);
    expect(response.job.created_at).toBe(FIXED_NOW);
    expect(response.job.updated_at).toBe(FIXED_NOW);
  });

  it("defaults to the real clock when no clock is injected", () => {
    const response = toQueuedJobResponse("job-1", "p", null);
    expect(Number.isFinite(Date.parse(response.job.created_at))).toBe(true);
  });
});

describe("toHistoryJobResponse", () => {
  const item: HistoryItem = {
    job_id: "job-9",
    workspace_id: "ws-1",
    prompt: "build an api",
    status: "succeeded",
    assistant_output: "all done",
    created_at: "2026-08-12T09:00:00.000Z"
  };

  it("carries identity and status across", () => {
    const response = toHistoryJobResponse(item);
    expect(response.job.id).toBe("job-9");
    expect(response.job.workspace_id).toBe("ws-1");
    expect(response.job.status).toBe("succeeded");
    expect(response.job.prompt).toBe("build an api");
  });

  it("wraps assistant output in an output record", () => {
    const response = toHistoryJobResponse(item);
    expect(response.output?.assistant_output).toBe("all done");
    expect(response.output?.job_id).toBe("job-9");
    expect(response.output?.id).toBe("job-9-history-output");
  });

  it("omits the output record when there is no assistant output", () => {
    expect(toHistoryJobResponse({ ...item, assistant_output: null }).output).toBeNull();
  });

  it("omits the output record for empty-string output", () => {
    // Empty output is absence, not an empty transcript to render.
    expect(toHistoryJobResponse({ ...item, assistant_output: "" }).output).toBeNull();
  });

  it("has no queue rank, since history items are not queued", () => {
    expect(toHistoryJobResponse(item).queue_rank).toBeNull();
  });

  it.each([["failed"], ["cancelled"], ["running"], ["queued"]] as const)(
    "preserves %s status",
    (status) => {
      expect(toHistoryJobResponse({ ...item, status }).job.status).toBe(status);
    }
  );
});
