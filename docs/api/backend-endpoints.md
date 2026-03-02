# Backend Endpoint Usage

This page documents how seal uses backend APIs in practice.

## Prompt and queue interactions

- Prompt submission enqueues work.
- Queue listing provides board hydration.
- Queue patching supports rank adjustments.

## Job detail hydration

`GET /v1/jobs/{id}` enriches task modal with:

- final output,
- queue rank (when queued),
- runtime metadata.

## Runtime management

seal calls runtime endpoints for:

- status checks,
- lifecycle control,
- shell and log operations.

This allows operator-level interventions directly from UI context.
