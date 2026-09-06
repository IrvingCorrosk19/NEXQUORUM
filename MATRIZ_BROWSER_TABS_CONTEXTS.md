# Matriz browser — contextos y pestanas

**Stamp:** E2E-CERT-MASTER-20260906_142448  
**Initial SHA:** 8e5c74f23d54a8f3c4be2f6ae146dfaece9546ef  
**Evidence:** tools/e2e/master-cert-results/20260906_142448/  
**Estado global:** PENDING (suite no ejecutada)

## Contextos independientes (storage/sesion aislada)

| ID | Rol / persona | Uso principal | Fixture | Estado |
|---|---|---|---|---|
| **A** | PlatformAdmin | Admin plataforma, gates seguridad | Seed / demo admin | PENDING |
| **B** | TenantAdmin | Admin tenant Ocean (ops PH) | Seed Tenant Ocean | PENDING |
| **C** | Presidente (AssemblyPresident) | Lifecycle asamblea, mociones, abrir/cerrar voto | PH E2E-CERT-MASTER-* | PENDING |
| **D** | Operador acreditacion (AssemblyOperator) | Mesa check-in, bulk accredit, quorum | Misma asamblea E2E | PENDING |
| **E** | Propietario A (Owner) | Join, check-in, voto, sala | Owner unidad E2E | PENDING |
| **F** | Propietario B (Owner) | Segundo votante / LiveKit 2P | Owner segunda unidad | PENDING |
| **G** | Apoderado | Representacion / voto en nombre (si fixture) | Representation activa E2E | PENDING |
| **H** | Usuario otro tenant | Ataques cross-tenant | Seed TenantOther | PENDING |
| **I** | Usuario no autorizado | 401/403, deep links | Sin membership / rol insuficiente | PENDING |

Crear con rowser.newContext() (no solo 
ewPage() en el mismo context) para A–I.

## Escenarios multi-pestana (mismo contexto)

| ID | Contexto | Escenario | Que valida | Estado |
|---|---|---|---|---|
| TAB-01 | C | Mismo usuario, 2 pestanas dashboard/ph | Consistencia sesion; no race UI destructiva | PENDING |
| TAB-02 | C | Dos asambleas abiertas (2 tabs) | Aislamiento ssemblyId en hydrate/SignalR | PENDING |
| TAB-03 | B/C | Cambio de PH en tab1; tab2 refresca | Sin leak de datos del PH anterior | PENDING |
| TAB-04 | D | Doble envio accredit (double-click / 2 tabs) | Idempotencia / un solo efecto neto | PENDING |
| TAB-05 | E+F | Votacion simultanea | Dos votos; sin doble conteo por usuario | PENDING |
| TAB-06 | D+E | Concurrencia acreditacion + self check-in | Quorum coherente post-race | PENDING |
| TAB-07 | E | Reconexion: kill hub / reload mid-room | Rehydrate room-state + SignalR | PENDING |
| TAB-08 | E | Cambio de usuario en otro context vs tab | Context A no contamina E | PENDING |

## Mapa Phase → contextos tipicos

| Phase | Contextos minimos |
|---|---|
| 1 Auth/Sec | A, E, H, I |
| 2–6 CRUD PH/padron | B o PHAdmin, H |
| 7–9 Asamblea/convocatoria | C, E |
| 10 Acreditacion | C, D, E, F, G |
| 11 Sala | C, E, F (+ UAT humano BLOCKED) |
| 12–13 Voto | C, E, F, G, I |
| 14–17 UX | C, D, E |
| 18 Cleanup | B/C sobre fixtures E2E only |

## Notas

- Preferir VPS https://asambleas.164.68.99.83.nip.io (health 200). Localhost no estaba arriba al inicio de Phase 0.
- Camara/mic real: no marcar PASS automatico; fila ROOM-14 = BLOCKED hasta UAT humano.
