---
layout: home

hero:
  name: "seal"
  text: "Voice-First Frontend for Orchestration Workflows"
  tagline: "Kanban-driven execution UX with live runtime feedback and operator controls."
  actions:
    - theme: brand
      text: Get Started
      link: /tutorials/getting-started
    - theme: alt
      text: Architecture
      link: /architecture
    - theme: alt
      text: API and Events
      link: /api/index

features:
  - title: Voice Prompt UX
    details: Capture, replay, and submit voice intent with low-friction operator flows.
  - title: Queue Control Board
    details: Prioritize, pause, resume, and inspect work through status-aware lanes.
  - title: Runtime Visibility
    details: Stream output chunks and lifecycle transitions into board and modal views.
  - title: Shell and Browser Tabs
    details: Operate runtime shell sessions and preview app output without leaving context.
  - title: Integration-Oriented APIs
    details: Built around otter orchestration endpoints and event stream contracts.
  - title: Production Operator Focus
    details: Supports technical interventions while preserving user-level simplicity.
---

## Product Context

seal acts as the orchestration UI layer:

- user intent capture and command refinement,
- queue and execution state management,
- runtime diagnostics and preview loops.

It integrates directly with `otter` orchestration APIs and consumes `lavoix`-powered transcription flows via otter voice endpoints.

## Explore the Documentation

- [Architecture](/architecture)
- [Concepts](/concepts)
- [Tutorials](/tutorials/getting-started)
- [API and Events](/api/index)
