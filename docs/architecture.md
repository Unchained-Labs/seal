# Software Architecture

## Architectural Goals

seal is designed around:

- fast interaction loops,
- clear execution state visibility,
- control operations without context switching.

## Main UI Domains

### Prompt domain

- voice recording and replay,
- text/voice composition modes,
- submission to backend orchestration APIs.

### Board domain

- queued/running/done/failed segmentation,
- drag-and-drop or priority control semantics,
- pause/resume/cancel actions.

### Modal domain

- output stream tail and lifecycle context,
- browser preview for generated apps,
- runtime shell and logs access.

## Data Synchronization Strategy

seal combines:

- snapshot polling (`/v1/queue`, `/v1/history`, `/v1/jobs/{id}`),
- streaming lifecycle updates (`/v1/events/stream`).

This hybrid model balances resilience and low-latency UX.

## Runtime Control Architecture

Runtime controls are delegated to otter endpoints:

- status inspection
- start/stop/restart actions
- logs retrieval
- shell websocket execution

seal keeps runtime controls close to job context to reduce operational overhead.
