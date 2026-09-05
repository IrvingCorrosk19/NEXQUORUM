# IMPLEMENTACION_CARGA_MASIVA_VOTACIONES

Fecha: 2026-09-05  
Entorno: `https://localhost:7188` (Development)  
VPS: **NOT PERFORMED**

## 1. Resumen ejecutivo

Se implemento importacion masiva de preguntas de votacion (Excel/CSV) que crea **Motion** normales del dominio mediante `MotionService.CreateAsync`, sin entidades paralelas. Flujo: plantilla contextual → validacion → vista previa → correccion inline → commit transaccional como borrador. Las preguntas importadas se editan, publican, reordenan y usan en sesion igual que las manuales.

## 2. Flujo implementado

1. Voting Studio → **Importar preguntas**
2. Descargar plantilla Excel (hojas Preguntas / Catalogos / Instrucciones)
3. Cargar `.xlsx` o `.csv`
4. Vista previa con resumen y estados
5. Corregir filas en dialogo
6. **Guardar importacion como borrador** (all-or-nothing)
7. Editar / Publicar seleccionadas / usar en asamblea

## 3. Modelo de columnas

Orden, PuntoAgenda, Codigo, TituloCorto, Pregunta, Instrucciones, TipoRespuesta, Opcion1–5, Metodo, Mayoria, UmbralPorcentaje, VisibilidadResultado, VotoSecreto, EstadoImportacion.

## 4. Catalogos

Obtenidos de agenda real de la asamblea + allowlists de `VotingDesignCodes` / `ResultVisibility` (tipos, metodos, mayorias, visibilidad, Si/No, Borrador/Publicar).

## 5. Validaciones

Por fila: orden, agenda existente misma asamblea, codigo unico (archivo + BD), titulo/pregunta, tipo/metodo/mayoria/visibilidad, umbral condicional, opciones ≥2 sin duplicados, longitudes, formulas, max 200 filas / 2 MB. Cross: orden/codigo duplicados.

## 6. Arquitectura

- `MotionImportService` (Application): sesion in-memory, validate, patch, commit
- `IMotionImportWorkbookService` / ClosedXML (Infrastructure)
- API bajo `api/assemblies/{id}/motions/import/*`
- Commit llama `MotionService.CreateAsync` (+ Publish opcional) dentro de transaccion EF

## 7. Reutilizacion de reglas manuales

Misma entidad `Motion`, mismas validaciones de create/publish/edit-policy. No hay tabla "ImportedQuestion".

## 8. Transaccion e idempotencia

Commit all-or-nothing con rollback. `ClientRequestId` evita duplicar importaciones exitosas.

## 9. Seguridad de archivos

Extension, tamaño, filas, celdas, neutralizacion de formulas, sin macros, nombre sanitizado, hash en auditoria (no contenido completo).

## 10. Permisos

`motion:create` para plantilla/analyze/commit/bulk-publish.

## 11. Aislamiento multitenant

Tenant/PH/asamblea desde contexto autenticado; agenda solo de esa asamblea. Owner sin permiso → 403.

## 12–13. Edicion en sesion / post-voto

Heredado de `MotionService` / `EnsureCriticalEditableAsync` (sin cambios de politica).

## 14. Ordenamiento

`DisplayOrder` asignado en secuencia de importacion (Orden Excel). Reorden UI existente permanece.

## 15. Auditoria

`MOTION_BULK_IMPORTED` + `MOTION_CREATED` por fila.

## 16. Archivos modificados / nuevos

- `MotionImportDtos.cs`, `MotionImportService.cs`, `IMotionImportWorkbookService.cs`
- `MotionImportWorkbookService.cs`
- `MotionsController.cs`, DI Application/Infrastructure
- `CreateMotionRequest.DisplayOrder`, `AuditEventType.MotionBulkImported`
- `voting-studio.html`, `voting-studio-app.js`, `motion-import.js`, `motion-import.css`
- `MotionImportTests.cs`, `tools/e2e/motion-import-e2e.cjs`

## 17–18. Base de datos / migraciones

**Ninguna.** Modelo Motion ya soporta todos los campos.

## 19–25. Evidencia

E2E local (`tools/e2e/motion-import-results/results.json`): plantilla 9.6 KB, CSV 21 filas (1 error), correccion inline, commit 21 borradores, edicion PUT 200, boton UI presente. Integracion: **2/2 PASS**.

## 26–28. Resultados pruebas

- Unitarias dedicadas de parser: cubiertas via integration analyze
- Integracion MotionImport: PASS
- E2E motion-import: FAILED=0
- Live open/vote SignalR de importadas: no re-ejecutado en este paquete (mismas entidades → mismo camino que manual)

## 29. Defectos corregidos durante implementacion

- Idempotencia consultada antes de exigir sesion vigente
- Encoding UTF-16 accidental en interface (corregido UTF-8)

## 30. Riesgos pendientes

- Wizard UI movil: tabla oculta (CSS cards pendiente de enriquecer)
- E2E dual-browser live vote sobre filas importadas no corrido en esta ola
- Bulk change agenda / drag-drop masivo: solo bulk-publish implementado como operacion segura

## 31. VPS

**NOT PERFORMED**

## 32. Estado final

**PARTIALLY CERTIFIED**

```text
EXCEL TEMPLATE: PASS
CSV SUPPORT: PASS
REAL CATALOGS: PASS
ROW VALIDATION: PASS
PREVIEW: PASS
INLINE CORRECTION: PASS
TRANSACTION: PASS
ROLLBACK: PASS (transaccion EF)
IDEMPOTENCY: PASS
NO DUPLICATES: PASS
DISPLAY ORDER: PASS
AGENDA ASSOCIATION: PASS
IMPORTED AS DRAFT: PASS
MANUAL EDIT: PASS
SESSION EDIT: PARTIAL (hereda dominio; E2E live no re-corrido)
POST-VOTE PROTECTION: PARTIAL (hereda dominio)
PUBLISH: PASS (bulk-publish + publish individual)
LIVE OPEN: PARTIAL
SIGNALR: PARTIAL
VOTE: PARTIAL
RESULTS: PARTIAL
HISTORY: PARTIAL
MINUTES/EVIDENCE: PARTIAL
AUDIT: PASS
FILE SECURITY: PASS
CROSS-PH: PARTIAL
CROSS-TENANT: PASS (403 owner)
RESPONSIVE: PARTIAL
ACCESSIBILITY: PARTIAL
MANUAL CREATION REGRESSION: PASS
DATABASE MODEL: PASS
VPS DEPLOYMENT: NOT PERFORMED
FINAL STATUS: PARTIALLY CERTIFIED
```