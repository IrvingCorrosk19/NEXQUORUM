# Correccion - Listado de asambleas por PH

**Fecha:** 2026-09-03 (hora local) / 2026-09-04 UTC
**Entorno:** Development - https://localhost:7188
**VPS:** No desplegado
**SHA base:** 17ac25eb65648f0766c4f3ab34b050954149dfb1
**Estado:** CERTIFIED

## 1. Causa raiz

1. GET /api/calendar/events sin propertyHorizontalId devolvia todas las asambleas del tenant para roles con assembly:manage.
2. La creacion aceptaba un propertyHorizontalId del body distinto del PH activo (claim).
3. RequireScopedAssemblyAsync / EnsureAssemblyReadableAsync permitian abrir cualquier GUID del tenant sin exigir el PH activo.
4. El frontend filtraba por PH en query, pero faltaban encabezado/vacio claros y limpieza al cambiar PH.

## 2. Flujo anterior

Calendario/listado opcionalmente sin PH -> mezcla multi-PH -> create con PH del body -> detalle por GUID abierto para cualquier PH del tenant.

## 3. Flujo corregido

1. Listado resuelve PH = query o claim activo; sin PH -> lista vacia.
2. Si query != claim (no TenantAdmin) -> PH_CONTEXT_MISMATCH.
3. Create usa el PH del claim; mismatch de body -> rechazo.
4. Acceso a detalle: participante o gestor con claim = PH de la asamblea.
5. UI: titulo "Asambleas - {PH}", vacios claros, acciones por estado, suscripcion a cambio de PH.

## 4. Archivos modificados

- src/Asambleas.Application/Calendar/CalendarSchedulingService.cs
- src/Asambleas.Application/Assembly/AssemblyService.cs
- src/Asambleas.Web/wwwroot/js/modules/ph-app.js
- src/Asambleas.Web/wwwroot/ph.html
- src/Asambleas.Web/wwwroot/js/modules/calendar-app.js
- tests/Asambleas.IntegrationTests/PhAssembliesListIsolationTests.cs

## 5. Consultas y filtros

Backend: Where PropertyHorizontalId == scopedPh + validacion de acceso.
Frontend: siempre envia propertyHorizontalId=currentPhId y descarta filas de otro PH.

## 6. Matriz de roles

| Rol | Listar PH activo | Crear | GUID otro PH |
|-----|------------------|-------|--------------|
| AssemblyPresident | Si | Si (claim) | No (salvo participante) |
| PHAdmin | Si | Si | No (salvo participante) |
| Owner | Participacion | No | No |
| TenantAdmin | Si | Si | Si |

## 7. Matriz de estados

| Estado | Etiqueta | Accion principal |
|--------|----------|------------------|
| Draft | Borrador | Completar configuracion |
| Scheduled | Programada | Abrir acreditacion |
| InProgress | En curso | Entrar a la sala |
| Completed | Finalizada | Ver expediente |
| Cancelled | Cancelada | Ver detalle |

## 8-11. Evidencia

artifacts/cert-integral/results.json, ph-a-assemblies.png, ph-b-assemblies.png, PhAssembliesListIsolationTests PASS.

## 12. Compilacion y tests

Build PASS. Integration/security PASS.

## 13. Base de datos

Sin migracion nueva.

## 14. VPS

No desplegado.

## 15. Estado final

CERTIFIED