# API and Integration Overview

seal primarily integrates with otter APIs and event streams.

## Snapshot endpoints consumed

- `GET /v1/queue`
- `GET /v1/history`
- `GET /v1/jobs/{id}`

## Control endpoints used

- `POST /v1/jobs/{id}/cancel`
- `POST /v1/jobs/{id}/pause`
- `POST /v1/jobs/{id}/resume`
- `PATCH /v1/queue/{id}`

## Runtime endpoints used

- `GET /v1/runtime/workspaces/{id}`
- `POST /v1/runtime/workspaces/{id}/start|stop|restart`
- `GET /v1/runtime/workspaces/{id}/logs`
- `GET /v1/runtime/workspaces/{id}/shell/ws`

## Event stream

- `GET /v1/events/stream` for lifecycle and incremental output.

See [Backend Endpoint Usage](/api/backend-endpoints) and [Event Stream Contract](/api/event-stream-contract).
