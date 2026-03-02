# Event Stream Contract

seal consumes `GET /v1/events/stream` as a long-lived Server-Sent Events channel.

## Event categories

- lifecycle transitions (queued, running, completed, failed, cancelled),
- `output_chunk` streaming events for incremental output.

## Client-side handling strategy

1. hydrate initial state from snapshots,
2. apply stream events incrementally,
3. reconcile with periodic refresh to avoid drift.

## Reliability concerns

- reconnect behavior when stream drops,
- stale event ordering relative to snapshot refreshes,
- idempotent application of repeated events.

## UX implications

Event stream quality directly affects:

- perceived responsiveness,
- trust in execution progress,
- speed of operator intervention.
