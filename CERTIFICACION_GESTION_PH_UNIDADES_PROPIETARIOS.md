# CERTIFICACION — Gestion PH, Unidades y Propietarios

**Fecha:** 2026-09-06  
**Entorno:** `https://localhost:7188`  
**Harness:** `tools/e2e/units-hub-cert.cjs`  
**Evidencias:** `tools/e2e/units-hub-results/`  
**Veredicto:** **100% PASS** (19/19)

## Casos ejecutados

| ID | Resultado | Notas |
|---|---|---|
| LOGIN | PASS | president@ocean.demo |
| OPEN_PH_UI | PASS | Entrada a detalle PH |
| HEADER_ACCIONES | PASS | Columna Acciones en tabla |
| ADMIN_PH_BTN | PASS | Boton Administrar PH |
| SEARCH_DARK | PASS | Fondo search tema oscuro `rgb(11,18,32)` |
| CREATE_UNIT_API | PASS | POST units |
| GESTIONAR_VISIBLE | PASS | Botones Gestionar renderizados |
| MODAL_OPEN | PASS | `#dlg-unit-hub` |
| CREATE_OWNER | PASS | Propietario vinculado a unidad |
| EDIT_UNIT | PASS | PUT unit |
| DEACTIVATE_UNIT / REACTIVATE_UNIT | PASS | POST .../active |
| OWNERSHIP_DETAIL_ENRICHED | PASS | unitType + fechas + owners |
| UNLINK | PASS | ownership end |
| DELETE_EVAL / DELETE_UNIT | PASS | evaluacion + hard delete sin historial |
| MOBILE_CARDS | PASS | cards visibles en 390px |
| NO_PAGE_ERRORS | PASS | sin pageerror |

## Responsive

- Desktop 1366: tabla + Acciones + Gestionar — PASS  
- Mobile 390: `#units-cards` visible — PASS (`03-mobile.png`)

## Permisos / multitenant

- Operaciones vía policies existentes (`unit:manage`, `owner:*`, `ph:manage`).
- Listados y mutations scoped por `propertyHorizontalId` en rutas `/api/ph/{phId}/...`.
- Bypass solo por roles/claims formales (PlatformAdmin / membership admin), no por email hardcode.

## Defectos encontrados y correcciones

1. Cert inicial no abría el PH (solo hash `#units` en listado) → corregido el harness para abrir detalle.  
2. Faltaba API delete unit → agregada evaluate + DELETE.  
3. Transfer/end durante asamblea viva → guard `UNIT_OWNERSHIP_LOCKED_LIVE_ASSEMBLY`.

## Build

`dotnet build src/Asambleas.Web/Asambleas.Web.csproj` → succeeded (0 errors).

## Conteos de certificacion Browser Tab

- failed: 0  
- passed: 19  
- total: 19  

## Criterio de terminacion

- Build exitoso  
- Funcionalidad conectada al backend real  
- Modal Gestionar operativo  
- Historial protegido (end/transfer no borran evidencia; delete bloqueado con historial)  
- Mobile cards  
- Certificacion Browser Tab 100% PASS  