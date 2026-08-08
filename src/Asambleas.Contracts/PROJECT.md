# Asambleas.Contracts

Shared API and realtime contracts for EO-001.

## Responsibility

- Define DTOs and SignalR event name constants consumed by Web, Application, and clients.
- Remain free of domain entity types and infrastructure concerns so boundaries stay stable across layers.

## Non-goals

- Business rules or validation beyond simple DTO shape.
- Persistence models (those live in Domain + Infrastructure mappings).
