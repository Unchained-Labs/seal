# Seal

[![CI](https://github.com/Unchained-Labs/seal/actions/workflows/ci.yml/badge.svg)](https://github.com/Unchained-Labs/seal/actions/workflows/ci.yml)

Seal is the voice-first frontend for Otter orchestration. It focuses on fast prompt capture, live execution feedback, and queue control through a Kanban board.

## Stack

- Node 22
- Vite
- React + TypeScript
- Tailwind CSS + custom CSS tokens

## Setup

```bash
cp .env.example .env
# default uses /api with Vite proxy to Otter on localhost:8080
nvm use 22
npm install
npm run dev
```

## Connectivity Mode

- Default: `VITE_OTTER_URL=/api` (same-origin API path)
- Dev proxy target: `VITE_OTTER_PROXY_TARGET=http://localhost:8080`
- Docker runtime proxy: Nginx forwards `/api/*` to `OTTER_UPSTREAM` (default `http://otter-server:8080`)

This avoids CORS and host mismatch issues between browser, Docker, and local CLI usage.

## UX Flow

1. User records a voice command in the prompt panel (`Shift+Space` push-to-talk supported).
2. Voice upload hits Otter `POST /v1/voice/prompts` and is transcribed via Lavoix.
3. Transcript is shown and the job is enqueued.
4. Todo ordering controls priority via drag/drop.
5. Running jobs stream live chunks into the board.
6. Completed/failed jobs keep modal details with output, preview, terminal, and voice replay.

## Runtime Feedback

- Live stream via `GET /v1/events/stream` with named lifecycle events and `output_chunk`.
- Card-level runtime feedback:
  - status bubbles with icons and color coding
  - running/completion duration labels
  - latest streamed output preview line
- Modal-level runtime feedback:
  - left result panel includes live build stream tail with normalized formatting
  - result panel
  - custom voice player component for recorded prompts (single control set)
  - icon-based tabbed preview panel (`Workspace Shell` / `Browser`) with fullscreen toggle
  - workspace shell sessions keep current working directory across commands

## Data Sources

- Polling snapshots:
  - `GET /v1/queue`
  - `GET /v1/history`
- Per-job hydration:
  - `GET /v1/jobs/{id}`
- Live events:
  - `GET /v1/events/stream`

## Workspace UX

- Main page runs commands in default auto workspace (`POST /v1/workspaces/command`).
- Prompting flow does not require manual workspace selection.
- Task modal terminal can execute in the job workspace when available.

## Observability

- API logs in browser console (`[seal-api] ...`) with method/path/status/latency.
- Event logs in browser console (`[seal-events] ...`).
- Backend health indicator with status tooltip.

## Theming

- Light/dark themes with persisted preference.
- Palette-driven system in `src/index.css`.
- Styled scrollbars and modern custom voice player styling.
