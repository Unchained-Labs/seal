import { afterEach, describe, expect, it } from "vitest";

import { formatHistoryClock, isEditableTarget, normalizePreviewUrl } from "./browser";

/** Points `window.location.hostname` at a given host for one test. */
function setBrowserHost(hostname: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, hostname },
    writable: true
  });
}

describe("normalizePreviewUrl", () => {
  const originalLocation = window.location;

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
      writable: true
    });
  });

  it("returns an empty string for blank input", () => {
    expect(normalizePreviewUrl("   ")).toBe("");
  });

  it("leaves a localhost url alone when the board is also on localhost", () => {
    setBrowserHost("localhost");
    expect(normalizePreviewUrl("http://localhost:4173/")).toBe("http://localhost:4173/");
  });

  it.each([["localhost"], ["127.0.0.1"], ["::1"]])(
    "rewrites %s to the browser host when viewing remotely",
    (targetHost) => {
      setBrowserHost("nuc.local");
      // Bracket IPv6 literals so the URL parses.
      const host = targetHost === "::1" ? "[::1]" : targetHost;
      expect(normalizePreviewUrl(`http://${host}:4173/app`)).toBe("http://nuc.local:4173/app");
    }
  );

  it("does not rewrite a non-local target", () => {
    setBrowserHost("nuc.local");
    expect(normalizePreviewUrl("http://example.test:8080/")).toBe("http://example.test:8080/");
  });

  it("does not rewrite when the browser is itself on a loopback host", () => {
    setBrowserHost("127.0.0.1");
    expect(normalizePreviewUrl("http://localhost:4173/")).toBe("http://localhost:4173/");
  });

  it("preserves port, path, and query when rewriting", () => {
    setBrowserHost("nuc.local");
    expect(normalizePreviewUrl("http://localhost:9000/a/b?c=1")).toBe(
      "http://nuc.local:9000/a/b?c=1"
    );
  });

  it("returns unparseable input untouched rather than discarding it", () => {
    setBrowserHost("nuc.local");
    expect(normalizePreviewUrl("not a url")).toBe("not a url");
  });
});

describe("formatHistoryClock", () => {
  it("formats a valid timestamp", () => {
    const formatted = formatHistoryClock("2026-08-12T10:30:00.000Z");
    expect(formatted).not.toBe("--:--:--");
    expect(formatted).toMatch(/\d/);
  });

  it.each([["not-a-date"], [""]])("returns a placeholder for invalid input: %s", (value) => {
    expect(formatHistoryClock(value)).toBe("--:--:--");
  });

  it("matches the locale rendering of the same instant", () => {
    const iso = "2026-08-12T10:30:00.000Z";
    expect(formatHistoryClock(iso)).toBe(new Date(Date.parse(iso)).toLocaleTimeString());
  });
});

describe("isEditableTarget", () => {
  it.each([["INPUT"], ["TEXTAREA"]])("treats %s as editable", (tag) => {
    expect(isEditableTarget(document.createElement(tag))).toBe(true);
  });

  it("treats a contenteditable element as editable", () => {
    const element = document.createElement("div");
    // jsdom does not implement `isContentEditable`, so define it directly.
    Object.defineProperty(element, "isContentEditable", { value: true, configurable: true });
    expect(isEditableTarget(element)).toBe(true);
  });

  it("treats an ordinary element as not editable", () => {
    expect(isEditableTarget(document.createElement("div"))).toBe(false);
  });

  it.each([["null", null]])("treats %s as not editable", (_label, value) => {
    expect(isEditableTarget(value)).toBe(false);
  });

  it("treats a non-element event target as not editable", () => {
    // Guards the `instanceof` check — window is a valid EventTarget.
    expect(isEditableTarget(window)).toBe(false);
  });
});
