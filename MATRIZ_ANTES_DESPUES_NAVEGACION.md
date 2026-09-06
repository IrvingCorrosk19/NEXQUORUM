# Matriz antes / después — Navegación

Contexto fijo: PH `33333333-3333-3333-3333-333333333301`, asamblea `44444444-4444-4444-4444-444444444401`, `president@ocean.demo` / `owner101@ocean.demo`, viewport 1440×900 (admin) y 390×844 (owner).

## Antes (forense MPA — REVISION_FORENSE)

| Hop | Recarga documento | Wall típico | `/api/auth/me` | Notas |
|-----|-------------------|-------------|------------------|-------|
| Dashboard ↔ PH ↔ Agenda ↔ Check-in ↔ Votaciones | Sí | ~2500–5400 ms | Casi siempre 1 | Shell destruido |
| PH hash tabs | No | ~1 API | 0 | Ya soft |
| Sala boot | Sí | alto | 1+ | 2× `/recordings` |

Fuente: `REVISION_FORENSE_OPTIMIZACION_NAVEGACION.md` / `tools/e2e/forensic-nav-results` histórico.

## Después (2026-09-06)

Evidencia: `tools/e2e/forensic-nav-results/hybrid-soft.json`, `matrix.json`.

| Hop | Recarga | Soft ms | Shell estable | me | API |
|-----|---------|---------|---------------|----|-----|
| Dashboard → PH | No | 53 | Sí | 0 | 4 |
| PH → Dashboard | No | 28 | Sí | 0 | 1 |
| Dashboard → Agenda | No | 35 | Sí | 0 | 3 |
| Agenda → Check-in | No | 47 | Sí | 0 | 4 |
| Check-in → Votaciones | No | 148 | Sí | 0 | 5 |
| Votaciones → Dashboard | No | 38 | Sí | 0 | 1 |
| Owner remount soft | No | 28 | Sí | 0 | — |
| Dashboard → Sala (hard) | Sí | ~2847 wall | n/a | 1 | esperado |
| Owner → Sala (hard) | Sí | ~2814 wall | n/a | 1 | esperado |

Promedio soft cluster: **~54 ms** (atributo `asamLastSoftNavMs`).  
Objetivo caliente ≤500 ms: **cumplido**.  
Objetivo frío soft ≤1200 ms: **cumplido** en hops medidos.

## Transferencia / estáticos

- Soft hops calientes: 0 CSS retransmitidos tras warm; JS solo para módulos aún no importados en el documento.
- HTML shells: `Cache-Control: no-cache`.
- JS/CSS versionados `?v=`: immutable long-cache.

## `/recordings`

Antes: 2 GET. Después: **1 GET** en boot de sala (`cachedGet` TTL 2s).