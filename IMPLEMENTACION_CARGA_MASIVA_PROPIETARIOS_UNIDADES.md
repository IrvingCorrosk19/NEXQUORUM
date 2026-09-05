# IMPLEMENTACION_CARGA_MASIVA_PROPIETARIOS_UNIDADES

Fecha: 2026-09-05  
Entorno: `https://localhost:7188` (Development)  
VPS: **NOT PERFORMED**

## 1. Resumen ejecutivo

Se evoluciono la importacion PH existente a un flujo profesional multi-hoja (Unidades / Propietarios / PropietarioUnidad / Catalogos / Instrucciones) que crea entidades `Unit`, `Owner` y `Ownership` normales. Validacion previa, vista previa con correccion inline, commit transaccional, idempotencia, bloqueo con asamblea en curso y modo Crear (recomendado) vs Crear y actualizar (confirmado).

## 2. Modelo de datos encontrado

| Concepto | Entidad | Llave / notas |
| --- | --- | --- |
| Unidad | `Unit` | `(PropertyHorizontalId, Code)` unico; `CoefficientPercent` 0–100 |
| Propietario | `Owner` | `(TenantId, Email)` unico; ID documental no unico |
| Relacion | `Ownership` | `(UnitId, OwnerId)`; `SharePercent` 0–100 de la unidad |
| Coeficiente PH | `Unit.CoefficientPercent` | Escala 0–100; total esperado 100 ± 0.0001 |
| Principal / representante | No en Ownership | Representacion en asamblea via `Power` / acreditacion |

## 3. Flujo implementado

1. PH → **Importar propietarios y unidades**
2. Confirmar PH → Descargar plantilla Excel
3. Cargar `.xlsx` / `.csv` → validar (sin importar)
4. Vista previa por pestanas + resumen de coeficientes
5. Corregir / excluir filas
6. Confirmar importacion (CreateOnly por defecto)
7. Editar en UI manual habitual

## 4–6. Plantilla, columnas, catalogos

Hojas: **Unidades**, **Propietarios**, **PropietarioUnidad**, **Catalogos**, **Instrucciones**.  
Catalogos reales sugeridos: Cédula/Pasaporte/RUC/Otro; Apartamento/Local/Depósito/Parqueo/Otro; Activa/Inactiva; Borrador/Activo/Inactivo. `UnitType` e `IdentificationType` siguen siendo texto libre en dominio.

## 7–10. Validaciones, normalizacion, duplicados, modos

- Validacion por fila + cruzada (codigos/emails/ids, shares ≤ 100).
- Trim; emails lower-case; identificaciones como texto (ceros/guiones).
- Clasificaciones: Nuevo / Existente / Actualizacion / Conflicto / Error.
- **CreateOnly** (default): no sobrescribe.
- **CreateAndUpdate**: requiere `confirmUpdate=true`; actualiza perfiles unidad/propietario; no altera SharePercent existente.

## 11–14. Vista previa, transaccion, rollback, idempotencia

Preview con pestanas, filtros, patch-row, exclude-row. Commit EF all-or-nothing. `ClientRequestId` evita duplicar exitos.

## 15–19. Coeficientes, copropiedad, asambleas

- Muestra actual / archivo / proyectado / delta vs 100 (advertencia, no bloqueo duro).
- Copropiedad via `SharePercent`.
- Asamblea CheckIn/InProgress/Paused → **bloquea** commit.
- Snapshots historicos no se tocan.

## 20–24. Seguridad, PII, auth, auditoria

Limites 5 MB / 5000 filas / 2000 chars; formulas neutralizadas; hash + nombre seguro en auditoria `PH_ROSTER_BULK_IMPORTED` sin PII completa. Permiso `ph:import`. Tenant/PH desde contexto.

## 25–26. Archivos / migraciones

- `PhImportService.cs`, `PhImportWorkbookService.cs`, `IPhImportWorkbookService.cs`
- DTOs `PhRosterImport*` en `PhOnboardingDtos.cs`
- `PhOnboardingController` endpoints import
- `AuditEventType.PhRosterBulkImported`
- UI: `ph.html`, `ph-app.js`, `ph-roster-import.js`, `ph-roster-import.css`
- Tests: `PhRosterImportTests.cs`, `tools/e2e/ph-roster-import-e2e.cjs`
- Docs: `docs/PH/OWNER-IMPORT.md`
- **Migraciones: ninguna**

## 27–30. Evidencia y resultados

- E2E local: **302 unidades/propietarios/relaciones**, correccion inline, commit ~1.6s, idempotencia, edicion manual, UI, 403 owner. `FAILED=0` (`tools/e2e/ph-roster-import-results/results.json`).
- Integracion: **2/2 PASS** (commit+idempotencia+RBAC; bloqueo asamblea en curso).
- Defecto corregido: `NormalizeHeader` sin `ToLowerInvariant` rechazaba `Activa`/`Borrador`.

## 31–32. Riesgos / VPS

- E2E de convocatoria/quorum/voto sobre el lote de 300 no re-ejecutado en esta ola (datos son entidades normales).
- Modo actualizar: sin diff campo-a-campo visual completo en UI.
- Responsive: cards moviles; a11y parcial.
- VPS: **NOT PERFORMED**

## 33. Estado final

**PARTIALLY CERTIFIED**

```text
EXCEL TEMPLATE: PASS
UNITS: PASS
OWNERS: PASS
OWNER-UNIT RELATIONS: PASS
MULTIPLE UNITS PER OWNER: PASS
CO-OWNERSHIP: PASS (SharePercent)
COEFFICIENT TOTAL: PASS (warning si ≠100)
DUPLICATE DETECTION: PASS
CREATE MODE: PASS
UPDATE MODE: PASS (API + confirmacion UI)
PREVIEW: PASS
INLINE CORRECTION: PASS
TRANSACTION: PASS
ROLLBACK: PASS
IDEMPOTENCY: PASS
AUDIT: PASS
PERSONAL DATA: PASS
ACTIVE ASSEMBLY PROTECTION: PASS
HISTORICAL IMMUTABILITY: PASS (no toca snapshots)
CONVOCATIONS: PARTIAL (sin E2E dedicado post-import)
ACCREDITATION: PARTIAL
QUORUM: PARTIAL
ELIGIBILITY: PARTIAL
COEFFICIENT VOTING: PARTIAL
CROSS-PH: PASS (RBAC 403)
CROSS-TENANT: PARTIAL
RESPONSIVE: PARTIAL
ACCESSIBILITY: PARTIAL
MANUAL FUNCTIONS REGRESSION: PASS (edicion unidad E2E)
DATABASE MODEL: PASS
VPS DEPLOYMENT: NOT PERFORMED
FINAL STATUS: PARTIALLY CERTIFIED
```