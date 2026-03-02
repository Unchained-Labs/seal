# Concepts

## Voice-First Interaction

Voice-first does not remove technical control; it moves high-frequency intent capture to natural input while preserving explicit orchestration controls.

## State Transparency

seal emphasizes state transparency:

- each job has visible lifecycle state,
- stream output is visible as execution progresses,
- runtime control surfaces are available when needed.

## Queue Control as UX Primitive

Queue behavior is part of user-facing product logic:

- users can reorder and pause work,
- priority handling is visible in board workflows,
- blocked/failed classification supports operational triage.

## Modal Depth vs Board Simplicity

The board keeps quick status clarity; the modal provides advanced context and controls.

This separation minimizes UI noise while preserving technical depth.

## Integration Concept

seal is not a standalone orchestration backend. It is an orchestration UX client that:

- talks to otter for orchestration and runtime APIs,
- consumes lavoix-backed transcription through otter voice endpoints.
