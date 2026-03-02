# Tutorial: Operating the Board

This guide covers day-to-day workflow for queue and runtime operations.

## Managing queued work

- Use filters (status, voice, text search) to isolate relevant tasks.
- Reorder tasks to adjust execution priority.
- Pause queued jobs when dependencies are not ready.

## Monitoring running jobs

- Watch live `output_chunk` updates.
- Track duration and status indicators.
- Open modal for deeper context and logs.

## Runtime operations

From task modal:

- inspect runtime status,
- start/stop/restart runtime,
- open shell tab and execute commands with persistent session context.

## Handling failures

- inspect error output in modal stream,
- classify as blocked/failed and decide resume/retry strategy,
- use preview and logs to determine root cause.
