import { describe, expect, it } from "vitest";

import {
  detectFirstUrl,
  formatLiveOutputLine,
  formatStreamingLine,
  pickTextField,
  shouldSuppressLiveLine,
  stringifyUnknownJson
} from "./output";

describe("detectFirstUrl", () => {
  it("finds a bare url", () => {
    expect(detectFirstUrl("preview at http://localhost:4173 now")).toBe("http://localhost:4173");
  });

  it("returns null when there is no url", () => {
    expect(detectFirstUrl("no link here")).toBeNull();
  });

  it("returns the first url when several are present", () => {
    expect(detectFirstUrl("see http://a.test and http://b.test")).toBe("http://a.test");
  });

  it.each([
    ["trailing period", "visit http://localhost:3000.", "http://localhost:3000"],
    ["parenthesised", "(http://localhost:3000)", "http://localhost:3000"],
    ["quoted", 'url: "http://localhost:3000"', "http://localhost:3000"],
    ["markdown-ish", "[preview](http://localhost:3000).", "http://localhost:3000"],
    ["multiple trailing marks", "http://localhost:3000?!", "http://localhost:3000"]
  ])("trims %s", (_label, input, expected) => {
    expect(detectFirstUrl(input)).toBe(expected);
  });

  it("keeps meaningful path and query characters", () => {
    expect(detectFirstUrl("http://localhost:3000/api/v1?x=1&y=2 done")).toBe(
      "http://localhost:3000/api/v1?x=1&y=2"
    );
  });

  it("matches https as well as http", () => {
    expect(detectFirstUrl("https://example.test/app")).toBe("https://example.test/app");
  });
});

describe("stringifyUnknownJson", () => {
  it("passes strings through unchanged", () => {
    expect(stringifyUnknownJson("hello")).toBe("hello");
  });

  it.each([
    ["null", null],
    ["undefined", undefined]
  ])("renders %s as an empty string", (_label, value) => {
    expect(stringifyUnknownJson(value)).toBe("");
  });

  it("serialises plain objects", () => {
    expect(stringifyUnknownJson({ a: 1 })).toBe('{"a":1}');
  });

  it("does not throw on cyclic objects", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => stringifyUnknownJson(cyclic)).not.toThrow();
  });

  it("coerces primitives", () => {
    expect(stringifyUnknownJson(42)).toBe("42");
    expect(stringifyUnknownJson(true)).toBe("true");
  });
});

describe("pickTextField", () => {
  it("reads a plain string", () => {
    expect(pickTextField("  hi  ")).toBe("hi");
  });

  it("returns null for a whitespace-only string", () => {
    expect(pickTextField("   ")).toBeNull();
  });

  it("joins an array of string parts", () => {
    expect(pickTextField(["a", "b", "c"])).toBe("abc");
  });

  it("joins an array of text objects", () => {
    expect(pickTextField([{ text: "one " }, { text: "two" }])).toBe("one two");
  });

  it("reads a nested text object", () => {
    expect(pickTextField({ text: "nested" })).toBe("nested");
  });

  it("returns null for shapes it does not understand", () => {
    expect(pickTextField({ other: 1 })).toBeNull();
    expect(pickTextField(42)).toBeNull();
    expect(pickTextField(null)).toBeNull();
  });

  it("returns null for an array that yields no text", () => {
    expect(pickTextField([])).toBeNull();
  });
});

describe("formatStreamingLine", () => {
  it("returns plain text untouched", () => {
    expect(formatStreamingLine("  building image  ")).toBe("building image");
  });

  it("returns an empty string for a blank line", () => {
    expect(formatStreamingLine("   ")).toBe("");
  });

  it("extracts assistant content", () => {
    expect(formatStreamingLine('{"role":"assistant","content":"done"}')).toBe("done");
  });

  it.each([["system"], ["user"]])("suppresses %s turns entirely", (role) => {
    expect(formatStreamingLine(`{"role":"${role}","content":"prompt scaffolding"}`)).toBe("");
  });

  it("prefixes other roles with the role name", () => {
    expect(formatStreamingLine('{"role":"tool","content":"result"}')).toBe("tool: result");
  });

  it("reads content nested under message", () => {
    expect(formatStreamingLine('{"message":{"content":"from message"}}')).toBe("from message");
  });

  it("reads content nested under delta", () => {
    expect(formatStreamingLine('{"delta":{"content":"from delta"}}')).toBe("from delta");
  });

  it("falls back to an event label when there is no content", () => {
    expect(formatStreamingLine('{"type":"tool_use"}')).toBe("event:tool_use");
  });

  it("returns the raw line when json is malformed", () => {
    // A line that opens like JSON but does not parse must still be visible.
    expect(formatStreamingLine('{"broken": ')).toBe('{"broken":');
  });

  it("does not attempt to parse text that merely contains a brace", () => {
    expect(formatStreamingLine("wrote config {a: 1}")).toBe("wrote config {a: 1}");
  });
});

describe("shouldSuppressLiveLine", () => {
  it.each([
    "System Requirements: do the thing",
    "USER TASK: build an app",
    "Work in a project-specific subfolder",
    "Always create a setup script"
  ])("suppresses prompt scaffolding: %s", (line) => {
    expect(shouldSuppressLiveLine(line)).toBe(true);
  });

  it("keeps ordinary output", () => {
    expect(shouldSuppressLiveLine("writing src/App.tsx")).toBe(false);
  });
});

describe("formatLiveOutputLine", () => {
  it("renders stdout as-is", () => {
    expect(formatLiveOutputLine("stdout", "building")).toBe("building");
  });

  it("marks stderr", () => {
    expect(formatLiveOutputLine("stderr", "warning: slow")).toBe("stderr> warning: slow");
  });

  it("drops suppressed scaffolding even on stderr", () => {
    expect(formatLiveOutputLine("stderr", "System requirements: xyz")).toBe("");
  });

  it("drops blank lines", () => {
    expect(formatLiveOutputLine("stdout", "   ")).toBe("");
  });

  it("drops system turns", () => {
    expect(formatLiveOutputLine("stdout", '{"role":"system","content":"x"}')).toBe("");
  });

  it("treats an undefined stream as stdout", () => {
    expect(formatLiveOutputLine(undefined, "hello")).toBe("hello");
  });
});
