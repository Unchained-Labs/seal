import type { Ref } from "react";

export interface RuntimeTerminalEntry {
  id: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  createdAt: string;
  workingDirectory: string;
}

interface RuntimeTerminalProps {
  history: RuntimeTerminalEntry[];
  historyRef?: Ref<HTMLDivElement>;
  formatClock: (iso: string) => string;
  emptyLabel?: string;
}

export function RuntimeTerminal({
  history,
  historyRef,
  formatClock,
  emptyLabel = "No command history yet."
}: RuntimeTerminalProps) {
  return (
    <div ref={historyRef} className="app-terminal-shell h-full overflow-auto">
      {history.length ? (
        history.map((entry) => (
          <div key={entry.id} className="app-terminal-entry">
            <p className="app-terminal-entry__command">
              <span className="app-terminal-entry__time">[{formatClock(entry.createdAt)}]</span>{" "}
              <span className="app-terminal-entry__cwd">({entry.workingDirectory})</span>{" "}
              <span className="app-terminal-entry__prompt">$</span> {entry.command}
            </p>
            {entry.stdout ? <pre className="app-terminal-entry__output">{entry.stdout}</pre> : null}
            {entry.stderr ? <pre className="app-terminal-entry__error">{entry.stderr}</pre> : null}
            <p className="app-terminal-entry__status">
              exit {entry.exitCode ?? "N/A"}
              {entry.timedOut ? " (timed out)" : ""}
            </p>
          </div>
        ))
      ) : (
        <p className="text-xs text-[var(--app-muted-text)]">{emptyLabel}</p>
      )}
    </div>
  );
}
