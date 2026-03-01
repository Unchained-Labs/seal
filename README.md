# Seal

Seal is the frontend control room for Otter job orchestration. It focuses on fast task creation, live execution visibility, and queue management through a Kanban board.

## Stack

- Node 22
- Vite
- React + TypeScript
- Tailwind CSS + custom CSS design tokens

## Setup

```bash
cp .env.example .env
# optional: edit VITE_OTTER_URL
nvm use 22
npm install
npm run dev
```

## Current UX + Product Flow

1. User writes a task in the large composer (or dictation via mic).
2. Submit with `Enter` (use `Shift+Enter` for newline).
3. Task is sent to Otter (`POST /v1/prompts`) and appears in Todo.
4. Worker claims queued job and status moves to Running.
5. Live output streams to Seal via SSE `output_chunk` events.
6. Job moves to Done or Blocked/Failed with detail modal + output/preview.

## Data Sources

- Polling snapshots:
  - `GET /v1/queue`
  - `GET /v1/history`
- Per-job hydration:
  - `GET /v1/jobs/{id}`
- Live stream:
  - `GET /v1/events/stream` (named events + `output_chunk`)

## Queue Priority Model

- Composer no longer asks for manual numeric priority.
- Todo column order is the user-facing priority model.
- Drag/drop in Todo triggers `PATCH /v1/queue/{job_id}` updates.

## Workspace Model in UI

- Default mode is `Auto workspace (server default)`.
- Optional workspace picker is still available for explicit routing.
- Workspace explorer calls:
  - `GET /v1/workspaces/{id}/tree`
  - `GET /v1/workspaces/{id}/file`

## Observability

- API exchange logs in browser console (`[seal-api] ...`) with method/path/status/latency.
- SSE event logs in browser console (`[seal-events] ...`).
- Backend health indicator in header with hover status.

## Theming

- Light/dark themes with persistent preference.
- Palette-driven style system (custom CSS vars in `src/index.css`).
- Styled scrollbars for app containers and code/output panes.
