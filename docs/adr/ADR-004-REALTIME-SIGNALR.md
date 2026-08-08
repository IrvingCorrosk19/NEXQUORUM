# ADR-004 — Realtime SignalR

**Status:** Accepted  
**Date:** 2026-08-08  
**EO:** EO-001

## Context

Assembly room UX needs sub-second propagation of presence, quorum, agenda, speaker queue, motion, and voting state.

## Decision

- Use **ASP.NET Core SignalR** with assembly-scoped groups (`assembly:{id}`).
- Broadcast **aggregates and public state only** — never secret ballot content.
- Domain/application owns truth; SignalR is a projection channel.
- Clients reconnect and re-hydrate from REST after disconnect.

## Consequences

- No Redis backplane in EO-001 (single-node local/dev).
- Latency target for 8 clients: UI propagation &lt; 1s when local environment allows.
