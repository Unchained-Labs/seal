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
# default uses /api with Vite proxy to Otter on localhost:8080
nvm use 22
npm install
npm run dev
```

### Connectivity mode

- Default: `VITE_OTTER_URL=/api` (same-origin API path)
- Dev proxy target: `VITE_OTTER_PROXY_TARGET=http://localhost:8080`
- Docker runtime proxy: Nginx forwards `/api/*` to `OTTER_UPSTREAM` (default `http://otter-server:8080`)

This avoids CORS and host mismatch issues between browser, Docker, and local CLI usage.

## Current UX + Product Flow

1. User can record a voice command from the centered composer (mic button).
2. Voice upload goes to Otter (`POST /v1/voice/prompts`), Otter uses Lavoix STT, and enqueues the transcript.
3. User can still refine/edit text and submit with `Enter` (`Shift+Enter` for newline).
4. Task appears in Todo.
5. Worker claims queued job and status moves to Running.
6. Live output streams to Seal via SSE `output_chunk` events.
7. Job moves to Done or Blocked/Failed with detail modal + output/preview + task terminal.

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
  - `POST /v1/workspaces/command` (supports auto workspace)

## Observability

- API exchange logs in browser console (`[seal-api] ...`) with method/path/status/latency.
- SSE event logs in browser console (`[seal-events] ...`).
- Backend health indicator in header with hover status.

## Theming

- Light/dark themes with persistent preference.
- Palette-driven style system (custom CSS vars in `src/index.css`).
- Styled scrollbars for app containers and code/output panes.
- Dark mode palette tuned to a deeper low-brightness theme.
