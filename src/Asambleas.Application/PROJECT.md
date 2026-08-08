# Asambleas.Application

Application use-cases, ports, and permission constants for ASAMBLEAS EO-001.

## Responsibility

- Orchestrate assembly lifecycle, attendance, quorum, agenda, speaker queue, motions, voting, and meeting join flows.
- Define outbound ports (`IAsambleasDbContext`, `IMeetingProvider`, `IAuditService`, `IAssemblyRealtimePublisher`, `ICurrentTenant`) implemented by Infrastructure / Web.
- Enforce tenant-scoped mutation checks on top of EF global filters.
- Map POC roles to fine-grained permissions for authorization at the host layer.

## Non-goals

- Persistence, Identity, SignalR hubs, and LiveKit clients live in Infrastructure / Web.
- Domain invariants and decision rules stay in `Asambleas.Domain`.
