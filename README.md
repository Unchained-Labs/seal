# seal

Simple Kanban frontend for Otter jobs (Todo -> Running -> Done).

## Stack

- Node 22
- Vite
- React + TypeScript
- Tailwind CSS

## Setup

```bash
cp .env.example .env
# optional: edit VITE_OTTER_URL
```

Use Node 22 (recommended):

```bash
nvm use 22
```

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

## Features

- Create new jobs from a workspace and prompt.
- View queue rank in Todo.
- Live updates through Otter SSE endpoint (`/v1/events/stream`).
- Card result details for completed jobs.
