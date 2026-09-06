# ANALISIS — Gestion PH, Unidades y Propietarios

## Arquitectura real reutilizada

| Capa | Artefacto |
|---|---|
| UI | `wwwroot/ph.html`, `ph-app.js`, nuevo `ph-units-hub.js`, `ph.css` |
| API | `PhOnboardingController` `/api/ph/*` |
| App | `PhOnboardingService` |
| Dominio | `PropertyHorizontal`, `Unit`, `Owner`, `Ownership` |

No se inventaron controladores ni entidades duplicadas.

## Capacidades ya existentes

- CRUD unidad (`POST/PUT .../units`, `POST .../active`)
- Ownership create / end / transfer / share
- Owner create/update/deactivate/delete + evaluation
- PH update / activate / deactivate / reactivate / delete-evaluation / delete
- Coeficientes (`GET .../coefficients`, tolerancia 0.0001)

## Brechas cerradas en esta remediacion

1. UI de `#units` solo tenia "Ver" e inline detail.
2. Faltaba modal premium, filtros, propietario en tabla, Acciones, dark search.
3. Faltaba delete unit API (solo deactivate).
4. Detalle de ownership no exponia identification/phone/status/otras unidades/fechas.
5. Transfer/end no bloqueaba durante asamblea activa.
6. Inconsistencia "Paso X de 7" vs 8 indicadores del wizard.
7. Acciones PH ambiguas sin tooltips ni menu "Administrar PH".

## Modelo / migraciones

- No se requirio migracion EF: `Unit.IsActive` y historial via `Ownership.IsActive/EffectiveToUtc` ya existen.
- "Archivar PH" = `DeactivatePh` (`Status=Inactive`); no hay enum Archive separado (documentado y reutilizado).

## Permisos

Se respetan policies existentes: `unit:manage`, `owner:manage`/`owner:view`, `ph:manage`, membership PHAdmin/PlatformAdmin. Sin hardcode de emails.