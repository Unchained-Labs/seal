/**
 * Formatting for agent output streamed from Otter.
 *
 * The worker forwards raw agent stdout/stderr line by line. Those lines are
 * sometimes plain text and sometimes JSON in one of several provider shapes,
 * so everything the board renders passes through here first.
 *
 * All functions are pure, so they are unit tested directly.
 */

/** Extracts the first URL from a line, trimming trailing punctuation. */
export function detectFirstUrl(input: string): string | null {
  const match = input.match(/https?:\/\/[^\s)]+/);
  if (!match?.[0]) {
    return null;
  }
  let candidate = match[0];
  // Trim common trailing punctuation / quoting artifacts from chat output.
  while (candidate.length > 0 && /[)\]}>.,;:'"!?]+$/.test(candidate)) {
    candidate = candidate.replace(/[)\]}>.,;:'"!?]+$/, "");
  }
  return candidate || null;
}

/** Best-effort string coercion that never throws, including on cyclic input. */
export function stringifyUnknownJson(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/**
 * Pulls human-readable text out of a provider `content` field, which may be a
 * bare string, an array of parts, or an object carrying `text`.
 */
export function pickTextField(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim() || null;
  }
  if (Array.isArray(value)) {
    const joined = value
      .map((entry) => {
        if (typeof entry === "string") {
          return entry;
        }
        if (entry && typeof entry === "object" && "text" in entry) {
          return stringifyUnknownJson((entry as { text?: unknown }).text);
        }
        return stringifyUnknownJson(entry);
      })
      .join("")
      .trim();
    return joined || null;
  }
  if (value && typeof value === "object" && "text" in value) {
    const text = stringifyUnknownJson((value as { text?: unknown }).text).trim();
    return text || null;
  }
  return null;
}

/**
 * Renders one transcript line for display. Returns an empty string for lines
 * that should not be shown at all (system and user turns).
 */
export function formatStreamingLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) {
    return "";
  }
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return trimmed;
  }
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const role = typeof parsed.role === "string" ? parsed.role : undefined;
    const content =
      pickTextField(parsed.content) ??
      (parsed.message && typeof parsed.message === "object"
        ? pickTextField((parsed.message as { content?: unknown }).content)
        : null) ??
      (parsed.delta && typeof parsed.delta === "object"
        ? pickTextField((parsed.delta as { content?: unknown }).content)
        : null);
    if (role === "system" || role === "user") {
      return "";
    }
    if (role === "assistant" && content) {
      return content;
    }
    if (role && content) {
      return `${role}: ${content}`;
    }
    if (content) {
      return content;
    }
    if (typeof parsed.type === "string") {
      return `event:${parsed.type}`;
    }
    return trimmed;
  } catch {
    return trimmed;
  }
}

/**
 * Hides the system prompt scaffolding Otter wraps around every user prompt.
 * Without this the board would replay the whole instruction preamble back at
 * the operator on every job.
 */
export function shouldSuppressLiveLine(line: string): boolean {
  const probe = line.toLowerCase();
  return (
    probe.includes("system requirements") ||
    probe.includes("user task:") ||
    probe.includes("work in a project-specific subfolder") ||
    probe.includes("always create a setup script")
  );
}

/** Full pipeline for a live output chunk. Empty string means "do not render". */
export function formatLiveOutputLine(stream: string | undefined, line: string): string {
  const normalized = formatStreamingLine(line);
  if (!normalized) {
    return "";
  }
  if (shouldSuppressLiveLine(normalized)) {
    return "";
  }
  if (stream === "stderr") {
    return `stderr> ${normalized}`;
  }
  return normalized;
}
