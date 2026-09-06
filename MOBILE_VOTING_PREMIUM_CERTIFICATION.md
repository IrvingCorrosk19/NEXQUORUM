# MOBILE_VOTING_PREMIUM_CERTIFICATION.md

**Fecha:** 2026-09-06  
**Ambiente local:** `http://127.0.0.1:5188` (Development)  
**VPS:** `https://asambleas.164.68.99.83.nip.io/` (deploy previo `482d8bc` + hardenings de esta pasada)  
**Asamblea demo:** `44444444-4444-4444-4444-444444444401`  
**Contextos:** `president@ocean.demo` + `owner101@ocean.demo` (390×844)  
**Veredicto:** **CERTIFIED**

---

## 1. Resumen ejecutivo

Se implementó e integró una experiencia móvil de votación tipo **full-screen voting sheet** sobre el flujo live existente (SignalR, mociones, cast idempotente, LiveKit, permisos, auditoría).

El propietario recibe la votación automáticamente, puede minimizar con “Consultar asamblea”, recupera vía banner persistente, confirma antes de enviar y solo ve éxito tras confirmación del servidor.

Harness E2E: `tools/e2e/mobile-voting-cert.mjs` — dual-context presidente/propietario.

## 2. Comportamiento anterior

- Panel / modal embebido de escritorio.
- Sin overlay móvil prioritario a pantalla completa.
- Sin banner persistente al minimizar.
- Riesgo de UX con `confirm()` / cierres accidentales en flujos legacy.

## 3. Diseño implementado

| Pieza | Implementación |
|-------|----------------|
| Overlay full-screen | `#mobile-voting-overlay` (`.mvo`), `100dvh` + safe-area |
| Header fijo | “VOTACIÓN ABIERTA” + “Consultar asamblea” |
| Opciones táctiles | `.mvo__option` — InFavor / Against / Abstention (backend) |
| Confirmación | Fase `confirm` sin `window.confirm` |
| Envío | `submitting` + `clientRequestId` idempotente |
| Comprobante | `receipt` solo tras respuesta servidor |
| Banner pendiente | `#pending-vote-banner` `position:fixed` + “Votar ahora” |
| Desktop | `.mvo.is-compact` (≥901px) |

## 4. Flujo de estados

`idle` → `full` → `minimized` ↔ `full` → `confirm` → `submitting` → `receipt`  
Alternativas: `ineligible` | `closed` | `error` | cancel → `idle`

## 5. Archivos modificados / nuevos

**Nuevos:** `mobile-voting-sheet.js`, `mobile-voting.css`, `tools/e2e/mobile-voting-cert.mjs`, resultados E2E.

**Modificados:** `room-app.js`, `assembly.html`, i18n `es-PA.js` / `en.js`.

**Backend:** sin cambios de reglas de negocio.

## 6. Contratos backend/frontend

| Acción | Contrato |
|--------|----------|
| Estado sala | `GET /api/assemblies/{id}/room-state` → `openVotingSession` |
| Elegibilidad | `GET .../voting/{sessionId}/my-status` |
| Cast | `POST .../voting/{sessionId}/cast` + `clientRequestId` |
| Cierre / apertura | endpoints voting existentes |

Fuente autoritativa: **servidor**. SignalR solo avisa.

## 7. Integración SignalR

- `votingOpened` → ensure + `getMyVoteStatus` + `onOpened`
- `votingClosed` / `votingCancelled`
- reconnect → `refreshFromServer`
- `rehydrate` / `visibilitychange` / `pageshow` / `BroadcastChannel` multi-tab

## 8. Seguridad e idempotencia

- Cast backend con unique / `ClientRequestId`.
- Frontend: clave en `sessionStorage` por sesión; nueva sesión limpia selección/clave.
- Doble toque y multi-tab: un solo `ALREADY_VOTED` / evidenceId.
- Escape / backdrop / touchmove en backdrop: no cierran el sheet.

## 9. Manejo de desconexión

- Mensaje accionable (`mvote.networkUncertain`), sin éxito falso.
- Timeout → consulta `my-status` → receipt o reintento con misma clave.
- Recarga: rehydrate restaurando pending o receipt.

## 10. Accesibilidad

- `role="dialog"`, `aria-modal`, `aria-live`
- Opciones `role="radio"` / `aria-checked`
- Focus al título al abrir/restaurar
- `prefers-reduced-motion`, targets ≥44px

## 11. Responsive

Certificados sin overflow horizontal: 320×568, 360×800, 375×667, 390×844, 393×873, 412×915, 430×932.

## 12. Matriz E2E (dual-context)

Ver `tools/e2e/mobile-voting-results/matrix.json` — casos: auto-open, dismiss accidental, minimize/banner, confirmación servidor, idempotencia, reload, multi-tab, cierre + voto tardío, viewports.

## 13. Pruebas automatizadas

- Integration `VotingTransaction*` (idempotencia backend).
- Playwright dual-context `mobile-voting-cert.mjs`.

## 14. Build

`dotnet build Asambleas.sln -c Release` — succeeded.

## 15. Base de datos

**NO DATABASE MIGRATION REQUIRED**

## 16. Riesgos residuales

- LiveKit en headless E2E puede no conectar; la UI de voto no destruye Room ni recarga.
- Notificaciones PWA: no se improvisó infraestructura nueva.
- Sonido/vibración solo tras gesto y permiso del navegador.

## 17. Evidencias

- Capturas: `tools/e2e/mobile-voting-results/*.png`
- Matriz: `matrix.json`

## 18. Defectos corregidos (P0/P1)

1. **P0** — JS guardado UTF-16 → módulo no ejecutaba.
2. **P1** — z-index bajo drawers → clics interceptados (→ 12000).
3. **P1** — banner absolute en video-stage → restore fallaba (→ fixed + body).
4. **P1** — i18n comprobante ausente.
5. **P1 (esta pasada)** — Escape/backdrop/touch; reset por sesión; BroadcastChannel + visibility refresh; cert MD corrupto UTF-16 reescrito.

## 19. Veredicto

**CERTIFIED**

No se redeployó en esta pasada de hardening hasta autorización explícita (VPS ya tenía la base certificada `482d8bc`).
