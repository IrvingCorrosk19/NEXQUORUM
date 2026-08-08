# Asambleas.Infrastructure

EF Core, PostgreSQL, ASP.NET Identity stores, LiveKit meeting provider, and demo seed for ASAMBLEAS EO-001.

## Responsibility

- Persist domain entities via `AsambleasDbContext` (`IAsambleasDbContext`) on PostgreSQL.
- Enforce tenant isolation with EF global query filters driven by scoped `CurrentTenant` (`ICurrentTenant`).
- Host Identity (`ApplicationUser` / `ApplicationRole`) and demo seed (Development only).
- Mint LiveKit participant JWTs through `LiveKitMeetingProvider` (`IMeetingProvider`) when credentials are configured.

## Non-goals

- HTTP middleware, cookie auth wiring, and SignalR hubs live in `Asambleas.Web`.
- `IAssemblyRealtimePublisher` is implemented in Web, not Infrastructure.
- Domain invariants stay in `Asambleas.Domain`; use-cases stay in `Asambleas.Application`.

## Configuration

| Key | Source | Notes |
|-----|--------|-------|
| `ConnectionStrings:DefaultConnection` | appsettings / env | Required |
| `LiveKit:Url` / `LIVEKIT_URL` | config / env | Optional; AV blocked when missing |
| `LiveKit:ApiKey` / `LIVEKIT_API_KEY` | config / env | Never hardcode |
| `LiveKit:ApiSecret` / `LIVEKIT_API_SECRET` | config / env | Never hardcode |

## DI

```csharp
builder.Services.AddAsambleasInfrastructure(builder.Configuration);
```

## Migrations

```bash
dotnet ef migrations add 20260808_InitialEO001 \
  --project src/Asambleas.Infrastructure \
  --startup-project src/Asambleas.Infrastructure \
  --output-dir Persistence/Migrations
```

Design-time factory: `Persistence/DesignTimeDbContextFactory.cs`.
