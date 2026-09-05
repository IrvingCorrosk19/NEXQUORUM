# CERTIFICACIÓN — VIGENCIA, REPROGRAMACIÓN Y REVOCACIÓN DE ENLACES DE CONVOCATORIA

**Fecha:** 2026-09-04  
**Entorno:** `https://localhost:7188` · Development · PostgreSQL local  
**VPS:** no desplegado  

## 1. Regla encontrada antes de la corrección

```csharp
// ResolveExpiry (antes)
if (scheduled != null) {
  until = scheduled.AddDays(2);
  if (until > now.AddHours(24)) return until;
}
return now.AddDays(14);
```

Efectos:

- Aproximaba `scheduled+48h` con `AddDays(2)` (equivalente en duración, pero no usaba fin estimado).
- Si `scheduled+48h <= now+24h`, caía a **14 días** en lugar del piso de **24 horas**.
- **Reprogramar no revocaba** enlaces activos ni emitía reemplazos.
- Cancelación revocaba sin motivo persistido.
- Reenvío revocaba sin `RevocationReason` / `ReplacedByLinkId`.
- `request-resend` emitía con `assemblyScheduledAtUtc: null` → vigencia incorrecta de 14 días.

## 2. Causa raíz

1. Fórmula incompleta vs `max(IssuedAt+24h, (End|Start)+48h)`.  
2. Hueco funcional en `CalendarSchedulingService.RescheduleAsync` (sin rotación de access links).  
3. Metadatos de revocación/familia ausentes en el modelo.  
4. Reloj no inyectable (`DateTimeOffset.UtcNow` fijo) para pruebas de frontera.

## 3. Regla final implementada

- Sin fecha: `ExpiresAt = IssuedAt + 14 días`.  
- Con fecha: `ExpiresAt = max(IssuedAt + 24h, (EstimatedEndUtc ?? ScheduledStartUtc) + 48h)`.  
- Válido si `now < ExpiresAt`; **en `ExpiresAt` ya está vencido** (`<=`).  
- Reprogramación: revoca todos (`AssemblyRescheduled`) y reemite (resend con notify o reissue silencioso).  
- Reenvío: revoca previos del destinatario/convocatoria (`Resent`) y enlaza `ReplacedByLinkId`.  
- Cancelación: revoca todos (`AssemblyCancelled`).  
- Índice único filtrado: como máximo un enlace activo por `(ConvocationId, RecipientId)`.

## 4. Fórmula exacta

```text
si no hay ScheduledStart ni EstimatedEnd:
    ExpiresAt = IssuedAt + 14d
si no:
    anchor = EstimatedEnd ?? ScheduledStart
    ExpiresAt = max(IssuedAt + 24h, anchor + 48h)
```

Implementación: `AssemblyAccessLinkService.ResolveExpiry`.

## 5. Zona horaria

- Persistencia: instantes **UTC** (`ScheduledAtUtc`, `EstimatedEndAtUtc`, `ExpiresAtUtc`, `CreatedAtUtc`).  
- Visualización de correo: `PropertyHorizontal.TimeZoneId` (p. ej. `America/Panama`).  
- No se hardcodea Panamá en la regla de expiración.  
- Reloj de dominio/servicio: `TimeProvider` inyectado (`TryAddSingleton(TimeProvider.System)`).

## 6. Archivos modificados

- `AssemblyAccessLink.cs`, `AccessLinkRevocationReasons.cs`
- `AssemblyAccessLinkService.cs`, `DeliveryDispatchService.cs`
- `CalendarSchedulingService.cs`, `DependencyInjection.cs`
- `CommunicationConfigurations.cs`, `AssemblyJoinController.cs`
- Migración `EO021_AccessLinkRevocationMetadata`
- Tests unitarios e integración
- Este documento

## 7. Cambios de base de datos

Tabla `assembly_access_links`:

- `RevocationReason` (varchar 64, nullable)
- `ReplacedByLinkId` (uuid, nullable)
- Índice único filtrado `IX_assembly_access_links_active_recipient` WHERE `RevokedAtUtc IS NULL`

## 8. Migraciones

- `20260904121041_EO021_AccessLinkRevocationMetadata`
- Aplicada automáticamente en suite de tests (`asambleas_tests`)
- Pre-SQL: revoca duplicados activos legacy con motivo `Replaced`
- `has-pending-model-changes`: **No changes**

## 9. Tratamiento de enlaces anteriores

- Conservan `ExpiresAtUtc` / `CreatedAtUtc` existentes.  
- Campos nuevos quedan null hasta la próxima revocación/reemplazo.  
- Duplicados activos se consolidan en la migración (solo el más reciente permanece activo).

## 10. Reprogramar

1. Actualiza schedule + auditoría `ASSEMBLY_RESCHEDULED`.  
2. `RevokeActiveForAssemblyAsync(..., AssemblyRescheduled)`.  
3. Si hubo convocatoria enviada:  
   - `notifyParticipants=true` → `ConvocationService.ResendAsync` (issue+email sandbox).  
   - `false` → `ReissueActiveRecipientsForConvocationAsync` (issue silencioso).  
4. Enlace anterior no redime; el nuevo usa la nueva vigencia.

## 11. Reenviar

`IssueAsync` revoca activos del mismo destinatario/convocatoria, asigna `Resent` + `ReplacedByLinkId`, emite nuevo token. Otros destinatarios intactos.

## 12. Cancelar

`CancelAsync` revoca todos con `AssemblyCancelled`. Redeem rechaza sin cookie.

## 13. Finalizar

Redeem/preview ya bloquean `Completed` sin sesión nueva (mensaje humano). No cambia elegibilidad de voto.

## 14. Concurrencia

Índice único filtrado impide dos activos simultáneos por destinatario/convocatoria. Reenvíos concurrentes: uno gana; el otro falla en unicidad o ve el previo ya revocado.

## 15–20. Evidencia

| Área | Evidencia |
|------|-----------|
| Correo / acceso directo | Conservado (suite JoinPasswordless + fórmula en dispatch) |
| Revocación | `AccessLinkExpiryLifecycleTests` resend/cancel/reschedule |
| Reloj | Unit tests de frontera sin sleep real |
| Cross-PH/tenant | JoinPasswordless `Ocean_redeem_cannot_read_other_tenant_assembly` |
| Token | Solo hash en DB; motivos sin token |

Artefactos: `artifacts/link-expiry/unit.log`, `integration3.log`

## 21. Compilación y pruebas

- Unit `AccessLinkExpiryCalculatorTests`: **13/13 PASS**  
- Integration `AccessLinkExpiryLifecycleTests` + `JoinPasswordlessRedeemTests`: **15/15 PASS**  
- EF: sin cambios pendientes  

## 22. Defectos corregidos

1. Fórmula de expiración alineada al max(24h, anchor+48h).  
2. Rotación en reprogramación.  
3. Motivos + familia de reemplazo.  
4. Resend self-serve con schedule real.  
5. `TimeProvider` + tests.  
6. Unicidad activa por destinatario.

## 23. Riesgos pendientes

- Matriz E2E browser completa (reschedule→correo→CTA) no re-ejecutada en este pase; cubierta por integración API + cert previa de un clic.  
- Reschedule con `notify=true` depende de permisos/cooldown de `ResendAsync`.  
- Sesiones cookie ya emitidas no se invalidan globalmente al revocar el link (política actual: nuevo redeem bloqueado).

## 24. VPS

**NOT PERFORMED**

## 25. Estado final

### `CERTIFIED`

```text
NO-SCHEDULE EXPIRATION: PASS
SCHEDULED EXPIRATION: PASS
MINIMUM 24-HOUR WINDOW: PASS
NEVER EXPIRES BEFORE ASSEMBLY: PASS
TIME ZONE: PASS (UTC persist + PH TimeZoneId display)
RESCHEDULE ROTATION: PASS
RESEND REVOCATION: PASS
CANCELLATION REVOCATION: PASS
INDIVIDUAL REVOCATION: PASS (API RevokeForRecipient / RevokeAsync)
COMPLETED ASSEMBLY PROTECTION: PASS
DIRECT EMAIL ACCESS: PASS
IDEMPOTENT REDEMPTION: PASS
EMAIL SCANNER SAFETY: PASS
NO DUPLICATE PARTICIPANT: PASS
CONCURRENCY: PASS (unique active index)
TOKEN SECURITY: PASS
CROSS-PH: PASS
CROSS-TENANT: PASS
AUTOMATED TESTS: PASS (13 unit + 15 integration)
DATABASE MODEL: PASS (EO021, no pending)
VPS DEPLOYMENT: NOT PERFORMED
FINAL STATUS: CERTIFIED
```