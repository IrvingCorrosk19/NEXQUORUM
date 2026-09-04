# IMPLEMENTACIÓN — Votación en vivo y acceso passwordless

**Fecha:** 2026-09-03 (hora local) / 2026-09-04 UTC  
**Entorno:** Development local — `https://localhost:7188`  
**VPS:** **No desplegado**  
**Commit base (HEAD):** `17ac25eb65648f0766c4f3ab34b050954149dfb1`  
**Estado final:** `PARTIALLY CERTIFIED`

---

## Resumen de cambios

### OLA 1 — Votación en vivo
- Separación estructural: `#vote-panel` (boleta activa) vs `#questionnaire-wrap` / `#questionnaire-panel` (historial colapsado).
- El cuestionario **ya no se inserta encima** de la boleta abierta.
- Para propietario con votación abierta: opciones (A favor / En contra / Abstención) + Confirmar tienen prioridad de viewport.
- En móvil (≤767px) se muestra una **hoja fija de votación** sobre la barra de controles (antes el sidebar estaba `display:none` y obligaba a “Más → Votación”).
- Copy humano de elegibilidad; errores de cast mapeados sin códigos técnicos.
- Confirmación de UI: **“Tu voto fue registrado correctamente”**.
- Contraste medido ≈ **13.98:1** en tarjetas.

### OLA 2 — Acceso directo desde convocatoria
- CTA / URL: `/ingresar/{token}` → sirve `join.html`, limpia la URL con `history.replaceState`, `POST /api/join/redeem`.
- Redeem passwordless: asegura identidad Owner, cookie de sesión, claim de participante, redirect limpio a lobby/sala.
- Preview usa **Peek** (no consume el enlace por scanners).
- ICS/calendario: ya no dirige a lobby desnudo solo con `assemblyId`; apunta a flujo personal / `/join.html`.
- Migración local `EO020_AccessLinkRedeemTracking` (`RedeemCount`, `FirstRedeemedAtUtc`).

---

## Causa raíz corregida

| Problema | Causa confirmada (diagnóstico) | Corrección |
|---|---|---|
| Propietario no veía opciones | `renderQuestionnaire()` hacía `prepend` sobre `#vote-panel` + `max-height` | Contenedor dedicado + colapso; boleta primero |
| Opciones fuera de viewport | Meta/participación antes de choices; agenda/moción ocupaban rail; móvil ocultaba sidebar | Reorden boleta; ocultar agenda/moción en owner+open; sheet móvil |
| Login obligatorio en convocatoria | Claim exigía sesión previa con contraseña | `POST /api/join/redeem` passwordless |
| ICS inseguro | URL desnuda `/lobby.html?assemblyId=…` | Texto/enlace a flujo personal |

**Backend de votación (`VotingService`)** no reescrito: elegibilidad, snapshots, coeficientes y anti-doble-voto intactos.

---

## Archivos modificados (relevantes)

### Frontend
- `src/Asambleas.Web/wwwroot/assembly.html`
- `src/Asambleas.Web/wwwroot/js/modules/room-app.js`
- `src/Asambleas.Web/wwwroot/js/modules/voting.js`
- `src/Asambleas.Web/wwwroot/js/modules/live-voting-workspace.js`
- `src/Asambleas.Web/wwwroot/js/modules/join-app.js`
- `src/Asambleas.Web/wwwroot/css/assembly-room.css`
- `src/Asambleas.Web/wwwroot/css/live-voting.css`
- `src/Asambleas.Web/wwwroot/js/i18n/es-PA.js`, `en.js`
- `src/Asambleas.Web/wwwroot/join.html`

### Backend / acceso
- `src/Asambleas.Web/Controllers/AssemblyJoinController.cs`
- `src/Asambleas.Web/Controllers/AuthController.cs` (composición Owner + presidente)
- `src/Asambleas.Application/Communications/AssemblyAccessLinkService.cs`
- `src/Asambleas.Application/Calendar/CalendarSchedulingService.cs`
- `src/Asambleas.Application/Abstractions/IOwnerPortalIdentityService.cs`
- `src/Asambleas.Infrastructure/Identity/OwnerPortalIdentityService.cs`
- `src/Asambleas.Domain/Entities/Communications/AssemblyAccessLink.cs`
- `src/Asambleas.Infrastructure/Persistence/Configurations/CommunicationConfigurations.cs`
- `src/Asambleas.Infrastructure/Persistence/Migrations/20260904023050_EO020_AccessLinkRedeemTracking.cs`
- Snapshot EF actualizado

### Evidencia / harness (local, no producto)
- `artifacts/impl-vote-access/e2e-impl.cjs`
- `artifacts/impl-vote-access/results.json`
- Capturas `owner-*-open.png`, `magic-ingresar.png`

---

## Cambios de base de datos

Migración: **`EO020_AccessLinkRedeemTracking`** (aplicada solo en PostgreSQL local).

```sql
ALTER TABLE assembly_access_links
  ADD "FirstRedeemedAtUtc" timestamp with time zone NULL;
ALTER TABLE assembly_access_links
  ADD "RedeemCount" integer NOT NULL DEFAULT 0;
```

Verificación: `dotnet ef migrations has-pending-model-changes` → **No changes**.  
No se eliminaron columnas ni se reconstruyeron tablas. Invitaciones existentes conservadas.

---

## Flujo final del participante

1. Recibe correo con CTA **“Ingresar a la asamblea”** → `/ingresar/{token}`.
2. `join-app.js` lee el token (path o `#token=`), limpia la barra, `POST /api/join/redeem`.
3. Servidor valida hash, crea/recupera usuario passwordless Owner, emite cookie, enrolla participante.
4. Redirect a lobby o sala según estado de asamblea (**sin formulario de login** en camino válido).
5. Si la mesa abre votación: SignalR / rehydrate muestra boleta automáticamente.
6. Propietario elegible ve 3 opciones + Confirmar; confirma; ve “Tu voto fue registrado correctamente”.
7. Segundo cast → rechazado (`ALREADY_VOTED`).

Enlace vencido/revocado → mensaje humano + **“Solicitar nuevo enlace”** (sin códigos HTTP al usuario).

---

## Decisiones de seguridad

1. **Token individual** por destinatario (tenant/PH/asamblea/convocatoria/recipient), hash SHA-256 en BD; raw nunca en logs (solo prefijo).
2. Preferencia de path `/ingresar/{token}` frente a solo `#fragment` porque muchos clientes de correo **no preservan fragmentos** al abrir el CTA.
3. Tras cargar, `replaceState` a `/join.html` y redeem por POST (reduce exposición en historial/Referer posteriores).
4. Sesión cookie Identity (`HttpOnly` / `Secure` en HTTPS) con claims mínimos; se **recortan** permisos de abrir/cerrar votación y admin PH en redeem.
5. Entrar a la sala **no** otorga voto: sigue `my-status` + acreditación + snapshot.
6. Peek vs Resolve: preview no invalida; reenvío (`IssueAsync`) revoca enlaces previos activos del mismo recipient.
7. Rate limiting `auth-login` en preview/redeem/resend.
8. Multitenant: claim/redeem amarrados al link; no se acepta `assemblyId` del cliente para elevar PH.

### Presidente + propietario (punto 5)

- `AssemblyPresident` **no** tiene `vote:cast` globalmente (`RolePermissionMap`).
- Si el usuario está vinculado en `Owners.UserId`, Auth/redeem **unen** el rol `Owner` → conserva `vote:cast`.
- Evidencia E2E: `president@ocean.demo` → roles `["Owner","AssemblyPresident"]`, `voteCast=true`, `voteOpen=true`.
- Un presidente **no** propietario no gana `vote:cast` por esta composición.

---

## Evidencia de pruebas

### Dual-browser votación (PASS)
| Paso | Resultado |
|---|---|
| Mesa abre votación | PASS |
| Propietario recibe sin reload | PASS (`cards=3`, `inView=true`, `qInPanel=false`) |
| Cast UI + confirmación | PASS — “Tu voto fue registrado correctamente” |
| Duplicado rechazado | PASS `ALREADY_VOTED` |
| Contraste | PASS 13.98 |

### Responsive (PASS) — boleta abierta, 3 opciones en viewport
| Viewport | Resultado |
|---|---|
| 390×844 | PASS |
| 768×1024 | PASS |
| 1366×768 | PASS |
| 1920×1080 | PASS |

Capturas: `artifacts/impl-vote-access/owner-{390,768,1366,1920}-open.png`

### Enlace mágico (PASS parcial ampliado)
| Caso | Resultado |
|---|---|
| Token válido → lobby sin password | PASS |
| Token inválido (mensaje humano) | PASS |
| Token vencido | PASS (API probe) |
| Token revocado | PASS (API probe) |
| Recarga / reingreso | PASS |
| Re-redeem mientras vigente | PASS (política multi-uso hasta expiry/revoke) |
| Claim anónimo | PASS 401 |
| Cancelar asamblea / reenvío SMTP real / cross-PH browser | **No ejecutado E2E completo** |
| Propietario sin contraseña (EnsurePasswordless) | Cubierto por redeem (camino feliz) |

Resultados JSON: `artifacts/impl-vote-access/results.json`

### Unitarios / integración
- No se ejecutó suite `dotnet test` completa en esta corrida.
- Existen tests previos de votación (`VotingTransactionTests`, `VotingResultPolicyTests`) **sin** casos nuevos del redeem passwordless.

---

## Defectos encontrados (durante la implementación)

1. Cuestionario prependido ocultaba boleta — corregido.
2. `scrollIntoView` insuficiente + restauración de `sidebar.scrollTop` deshacía el foco — corregido.
3. Móvil ocultaba todo el sidebar (`display:none`) — sheet de votación — corregido.
4. Hash de prueba en minúsculas vs `HashToken` en mayúsculas — harness de E2E alineado.
5. Encoding “â€”” en título de asamblea demo — cosmético, fuera de alcance.

---

## Riesgos pendientes

1. `request-resend` emite enlace / mensaje genérico; el disparo SMTP real según cola de deliveries debe validarse en un envío de convocatoria completo.
2. Falta E2E de: cancelar asamblea → revoca; reenviar convocatoria → revoca previos; token de PH A contra PH B en browser.
3. Actualización de tally en mesa tras voto no assertada en el harness dual-browser (cast + dup sí).
4. Worktree contiene otros cambios no relacionados (`ia.css`, dashboard histórico, etc.) — no desplegados; no mezclar en commit sin revisión.
5. Fragment-only `#token=` sigue soportado en JS, pero el correo usa path por compatibilidad con clientes de correo.

---

## Confirmaciones operativas

- **No se desplegó al VPS.**
- **No se eliminaron datos** ni se limpió la BD.
- **No se hizo commit automático.**
- Migración aplicada **solo en local**.
- SHA de referencia del tree base: `17ac25eb65648f0766c4f3ab34b050954149dfb1` (cambios de esta ola aún sin commit).

---

## Estado final

### `PARTIALLY CERTIFIED`

**Por qué no `CERTIFIED`:** faltan pruebas críticas de revocación por cancelación/reenvío y aislamiento cross-PH en E2E browser, más suite unitaria/integración del nuevo redeem.  

**Por qué no `NOT CERTIFIED`:** el camino feliz de votación en vivo (incl. móvil) y el acceso passwordless sin login quedaron demostrados en local con evidencia.

Cuando se completen cancel/resend/cross-PH E2E + tests automatizados del redeem, el estado podrá subir a `CERTIFIED`.
