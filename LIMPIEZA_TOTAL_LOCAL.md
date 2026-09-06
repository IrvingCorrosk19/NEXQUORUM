# LIMPIEZA TOTAL LOCAL - ASAMBLEAS

**Fecha UTC:** 2026-09-06  
**Alcance:** exclusivo entorno local de desarrollo (`https://localhost:7188`)  
**Estado:** COMPLETADA y certificada (Browser Tab + SQL)

---

## 1. Identificacion y gate anti-produccion

| Campo | Valor |
|---|---|
| Connection source | `src/Asambleas.Web/appsettings.Development.json` -> `ConnectionStrings:DefaultConnection` |
| Host | `127.0.0.1` (loopback) |
| Port | `5432` |
| Database | `asambleas` |
| Gate | Script rechaza hosts fuera de `{127.0.0.1, localhost, ::1}` y DB fuera de `{asambleas}` |
| VPS / produccion | **NO tocados** |

Confirmacion tecnica: host loopback + DB allow-list -> no hay riesgo de apuntar a base externa en esta ejecucion.

---

## 2. Mecanismo seguro (Development)

| Artefacto | Ruta |
|---|---|
| Script transaccional | `tools/local-dev-reset/reset_local_asambleas.py` |
| Certificacion browser (smoke crear PH) | `tools/local-dev-reset/browser_cert_superadmin.cjs` |
| Verificacion final vacia (sin crear datos) | `tools/local-dev-reset/browser_final_empty.cjs` |
| Evidencias | `tools/local-dev-reset/evidence/` |
| Backups | `tools/local-dev-reset/backups/` |

### Controles de seguridad del script

- Solo se ejecuta contra host loopback y DB allow-listed.
- Verifica que exista exactamente un usuario `president@ocean.demo` **antes** de borrar.
- Genera `pg_dump` comprimido **antes** del truncate.
- `TRUNCATE ... RESTART IDENTITY CASCADE` de tablas operativas en una sola sentencia (orden de FKs resuelto por CASCADE).
- `COMMIT` / `ROLLBACK` completo ante error.
- **No** usa `EnsureDeleted`, **no** recrea la base, **no** toca migraciones EF ni el esquema.
- Desactiva reseed demo: `Demo.Enabled=false`, `Demo.SeedUsers=false`.
- No imprime credenciales.

### Ejecucion

```bash
python tools/local-dev-reset/reset_local_asambleas.py
```

---

## 3. Respaldos locales

| Archivo | Tamano aprox. | Notas |
|---|---|---|
| `tools/local-dev-reset/backups/asambleas_local_20260906_215639.sql.gz` | ~1.1 MB | Respaldo **inicial** (estado previo a la limpieza total con datos demo/E2E) |
| `tools/local-dev-reset/backups/asambleas_local_20260906_215825.sql.gz` | ~16 KB | Tras smoke de certificacion |
| `tools/local-dev-reset/backups/asambleas_local_20260906_215853.sql.gz` | ~16 KB | Respaldo previo al wipe final de entrega |

Evidencia de ruta del ultimo backup: `tools/local-dev-reset/evidence/backup-path.txt`

---

## 4. Tablas limpiadas (operativas)

Lista exacta usada por el script (`TRUNCATE ... CASCADE`):

1. votes
2. voting_eligibility_snapshots
3. voting_sessions
4. motions
5. agenda_items
6. speaker_requests
7. attendance_records
8. assembly_participants
9. assembly_votes
10. quorum_snapshots
11. assembly_recordings
12. recording_notice_acceptances
13. property_recording_policies
14. survey_responses
15. survey_questions
16. survey_forms
17. communication_delivery_events
18. communication_deliveries
19. communication_batches
20. convocation_recipients
21. convocations
22. assembly_access_links
23. portal_notifications
24. reminder_rules
25. message_templates
26. channel_configurations
27. communication_profiles
28. assembly_schedule_changes
29. assembly_reminder_occurrences
30. audit_events
31. powers
32. ownerships
33. owner_invitations
34. owner_password_resets
35. user_property_memberships
36. assemblies
37. units
38. owners
39. property_horizontals

Adicionalmente (Identity, sin tocar esquema):

- Eliminacion de usuarios distintos de `president@ocean.demo` y sus tokens/logins/claims/roles.
- Eliminacion de claims `property_horizontal_id` del usuario conservado.
- Conservacion de **1** tenant + **1** organization estructurales (`PLATFORM`) requeridos por el modelo (TenantId/OrganizationId no nulos en Identity).
- Asignacion de rol Identity `PlatformAdmin`.

Evidencia: `tools/local-dev-reset/evidence/tables-truncated.json`

---

## 5. Conservado

- Usuario `president@ocean.demo` (credencial valida de Development).
- Rol global `PlatformAdmin`.
- Esquema + historial de migraciones EF.
- Catalogos / tablas Identity estructurales (`AspNetRoles`, etc.).
- Tenant/org estructurales `PLATFORM` (no es una propiedad horizontal ni demo PH).

---

## 6. Ajustes de codigo (autorizacion / UX)

- `AuthController.BuildClaims`: **eliminada** la asignacion silenciosa de PH demo; solo se propaga claim PH explicito almacenado.
- `ph.html` / `ph-app.js`: mensaje vacio obligatorio:  
  "Primero debes crear o seleccionar una propiedad horizontal para continuar."
- `appsettings.Development.json`: demo seed desactivado para evitar rehidratacion de datos tras restart.

La autorizacion global se basa en rol Identity `PlatformAdmin` + permisos/policies existentes (no hardcode de email en logica de autorizacion).

---

## 7. Conteos finales (entrega)

```json
{
  "AspNetUsers": 1,
  "property_horizontals": 0,
  "assemblies": 0,
  "units": 0,
  "owners": 0,
  "votes": 0,
  "tenants": 1,
  "organizations": 1,
  "memberships": 0,
  "claims_ph": 0
}
```

Usuarios: `["president@ocean.demo"]`  
Roles: `["PlatformAdmin"]`

Evidencia: `tools/local-dev-reset/evidence/counts-after.json`, `users-after.json`, `keep-user-roles.json`

---

## 8. Build

- `dotnet build src/Asambleas.Web/Asambleas.Web.csproj -c Release` -> **succeeded** (0 errors).

---

## 9. Resultado

Base local funcional y vacia de datos operativos. Un solo usuario operativo global `PlatformAdmin`, sin pertenencia a PH, listo para configurar ASAMBLEAS desde cero.