import { beforeEach, describe, expect, it, vi } from "vitest";

import { checkBackendHealth, enqueuePrompt, listHistory, listQueue } from "./otter";

/** Minimal `fetch` stand-in returning a canned response. */
function mockFetch(response: Partial<Response> & { jsonBody?: unknown }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    text: async () => (response.text ? await response.text() : ""),
    json: async () => response.jsonBody ?? {}
  } as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("checkBackendHealth", () => {
  it("is healthy when the endpoint returns ok", async () => {
    mockFetch({ ok: true, text: async () => "ok" });
    await expect(checkBackendHealth()).resolves.toBe(true);
  });

  it("tolerates surrounding whitespace and casing", async () => {
    mockFetch({ ok: true, text: async () => "  OK \n" });
    await expect(checkBackendHealth()).resolves.toBe(true);
  });

  it("is unhealthy on a non-2xx response", async () => {
    mockFetch({ ok: false, status: 503, text: async () => "ok" });
    await expect(checkBackendHealth()).resolves.toBe(false);
  });

  it("is unhealthy when the body is not the health token", async () => {
    // A proxy returning an HTML error page must not read as healthy.
    mockFetch({ ok: true, text: async () => "<html>gateway</html>" });
    await expect(checkBackendHealth()).resolves.toBe(false);
  });

  it("is unhealthy when the request throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(checkBackendHealth()).resolves.toBe(false);
  });

  it("never rejects, so a health probe cannot break the UI", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    await expect(checkBackendHealth()).resolves.toBe(false);
  });

  it("requests with no-store so a cached ok cannot mask an outage", async () => {
    const fetchMock = mockFetch({ ok: true, text: async () => "ok" });
    await checkBackendHealth();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
  });
});

describe("listQueue", () => {
  it("requests the default page size", async () => {
    const fetchMock = mockFetch({ jsonBody: [] });
    await listQueue();
    expect(fetchMock.mock.calls[0][0]).toContain("/v1/queue?limit=200&offset=0");
  });

  it("passes through an explicit limit and offset", async () => {
    const fetchMock = mockFetch({ jsonBody: [] });
    await listQueue(10, 20);
    expect(fetchMock.mock.calls[0][0]).toContain("/v1/queue?limit=10&offset=20");
  });

  it("returns the parsed body", async () => {
    mockFetch({ jsonBody: [{ job_id: "a" }] });
    await expect(listQueue()).resolves.toEqual([{ job_id: "a" }]);
  });
});

describe("listHistory", () => {
  it("requests the history endpoint with a limit", async () => {
    const fetchMock = mockFetch({ jsonBody: [] });
    await listHistory(50);
    expect(fetchMock.mock.calls[0][0]).toContain("/v1/history?limit=50");
  });
});

describe("enqueuePrompt", () => {
  it("posts json", async () => {
    const fetchMock = mockFetch({ jsonBody: { id: "job-1" } });
    await enqueuePrompt({ prompt: "build a thing" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/v1/prompts");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({ prompt: "build a thing" });
  });

  it("surfaces the status and body when the API rejects the request", async () => {
    mockFetch({ ok: false, status: 422, text: async () => "prompt too long" });
    // The operator needs the reason, not a generic failure.
    await expect(enqueuePrompt({ prompt: "x" })).rejects.toThrow(/422.*prompt too long/);
  });

  it("propagates network errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(enqueuePrompt({ prompt: "x" })).rejects.toThrow("offline");
  });
});
