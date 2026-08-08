# Asambleas.Domain

Enterprise domain model for virtual assemblies (EO-001).

## Responsibility

- Own business entities, enums, and invariants for tenancy, property horizontal, ownership, assembly lifecycle, attendance, quorum, agenda, motions, voting, speakers, and audit.
- Expose pure domain services (`AssemblyLifecycle`, `QuorumEngine`, `IDecisionRule`) with no infrastructure or UI dependencies.
- Remain free of EF Core, HTTP, and framework package references so Application and Infrastructure can depend inward.

## Non-goals

- Persistence mappings, migrations, or seed data.
- API DTOs (see `Asambleas.Contracts`).
- Application orchestration / authorization policies.
