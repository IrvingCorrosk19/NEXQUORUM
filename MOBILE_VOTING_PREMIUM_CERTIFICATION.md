# MOBILE_VOTING_PREMIUM_CERTIFICATION.md

**Fecha:** 2026-09-06  
**Ambiente:** local `http://127.0.0.1:5188` (Development)  
**Asamblea demo:** `44444444-4444-4444-4444-444444444401`  
**Contextos:** Presidente `president@ocean.demo` + Propietario `owner101@ocean.demo` (viewport 390×844)  
**Veredicto:** **CERTIFIED**

---

## 1. Resumen ejecutivo

Se implementó una experiencia móvil de votación tipo *full-screen voting sheet* integrada al flujo live existente (SignalR, mociones, cast idempotente, LiveKit). El propietario recibe la votación automáticamente, puede minimizar con “Consultar asamblea”, recuperar vía banner persistente, confirmar antes de enviar y solo ve éxito tras confirmación del servidor.

**E2E dual-context:** `tools/e2e/mobile-voting-cert.mjs` → **22/22 PASS** (`tools/e2e/mobile-voting-results/matrix.json`).

## 2. Comportamiento anterior

- Panel de votación embebido / modal de escritorio.
- Sin overlay móvil prioritario a pantalla completa.
- Sin banner persistente al minimizar.
- Riesgo de UX con `confirm()`/cierres accidentales en flujos legacy.

## 3. Diseño implementado

| Pieza | Implementación |
|-------|----------------|
| Overlay full-screen | `#mobile-voting-overlay` (`.mvo`), `100dvh` + safe-area |
| Header fijo | Estado + “Consultar asamblea” (`data-mvo-minimize`) |
| Opciones táctiles | `.mvo__option` (InFavor / Against / Abstention — opciones del backend) |
| Confirmación | Fase `confirm` sin `window.confirm` |
| Envío | Fase `submitting` + `clientRequestId` idempotente |
| Comprobante | Fase `receipt` tras respuesta servidor |
| Banner pendiente | `#pending-vote-banner` `position: fixed` + CTA “Votar ahora” |
| Desktop | `.mvo.is-compact` (≥901px) — hoja centrada, no bloquea consola completa |

## 4. Flujo de estados

`idle` → `full` (apertura) → `minimized` ↔ `full` → `confirm` → `submitting` → `receipt`  
Alternativas: `ineligible` | `closed` | `error` | cancelación → `idle`

## 5. Archivos modificados / nuevos

**Nuevos**
- `src/Asambleas.Web/wwwroot/js/modules/mobile-voting-sheet.js`
- `src/Asambleas.Web/wwwroot/css/mobile-voting.css`
- `tools/e2e/mobile-voting-cert.mjs`
- `tools/e2e/mobile-voting-results/*` (matriz + capturas)

**Modificados**
- `src/Asambleas.Web/wwwroot/js/modules/room-app.js` — wiring SignalR / rehydrate / reconnect
- `src/Asambleas.Web/wwwroot/assembly.html` — CSS/JS cache bust
- `src/Asambleas.Web/wwwroot/js/i18n/es-PA.js`, `en.js` — claves `mvote:*`

**Backend:** sin cambios de reglas de negocio.

## 6. Contratos backend/frontend

| Acción | Contrato |
|--------|----------|
| Estado sala | `GET /api/assemblies/{id}/room-state` → `openVotingSession` |
| Elegibilidad / ya votó | `GET .../voting/{sessionId}/my-status` |
| Cast | `POST .../voting/{sessionId}/cast` + `clientRequestId` |
| Cierre | `POST .../voting/{sessionId}/close` |
| Apertura | `POST .../voting/open` |

Fuente autoritativa: servidor. SignalR solo dispara refresh.

## 7. Integración SignalR

Handlers en `room-app.js`:
- `votingOpened` → `ensureMobileVoting()` + `getMyVoteStatus` + `onOpened()`
- `votingClosed` → `onClosed()`
- `votingCancelled` → `onCancelled()`
- reconnect → `refreshFromServer()`
- `rehydrate()` → restaura overlay/comprobante sin recargar la página a propósito del voto

## 8. Seguridad e idempotencia

- Cast reutiliza backend existente (unique / idempotency).
- Frontend genera `clientRequestId` en `sessionStorage` por sesión.
- Doble toque E2E: un solo `ALREADY_VOTED` / un `evidenceId`.
- Multitenant: sin cambios; aislamiento existente intacto.
- No se exponen votos ajenos en el comprobante (código sanitizado `VT-xxxxxx`).

## 9. Manejo de desconexión

- Errores de red → mensaje accionable (`mvote.networkUncertain`), sin éxito falso.
- Tras timeout: consulta `my-status`; si hay evidencia → receipt; si no y sigue abierta → reintento con misma clave.
- Recarga con voto pendiente / confirmado: rehydrate + sheet correcto (certificado).

## 10. Accesibilidad

- `role="dialog"`, `aria-modal`, `aria-live`
- Opciones `role="radio"` / `aria-checked`
- Focus al título al abrir; minimizar explícito (sin focus trap total)
- `prefers-reduced-motion` en CSS
- Targets ≥44px

## 11. Responsive

Viewports certificados sin overflow horizontal:  
320×568, 360×800, 375×667, 390×844, 393×873, 412×915, 430×932.

## 12. Matriz E2E (dual-context)

| Caso | Resultado |
|------|-----------|
| Apertura / overlay auto | PASS |
| Dismiss accidental (outside/Esc) | PASS |
| Minimizar + banner | PASS |
| Restaurar banner | PASS |
| Selección sin auto-envío | PASS |
| Confirmación | PASS |
| Confirmación servidor + comprobante | PASS |
| Idempotencia / status | PASS |
| Banner limpia tras voto | PASS |
| Recarga post-voto | PASS |
| Continuidad LiveKit (sin reload por UI voto) | PASS |
| Multi-tab | PASS |
| Cierre + voto tardío rechazado | PASS |
| Viewports | PASS (7/7) |

Harness: `node tools/e2e/mobile-voting-cert.mjs`  
Evidencias: `tools/e2e/mobile-voting-results/*.png`

## 13. Pruebas automatizadas

- Integration: `VotingTransaction*` — **3 passed** (Release).
- E2E Playwright dual-context — **22/22 PASS**.

## 14. Build

```
dotnet build Asambleas.sln -c Release
→ Build succeeded. 0 Warning(s). 0 Error(s).
```

## 15. Base de datos

**NO DATABASE MIGRATION REQUIRED**

Se reutilizan `voting_sessions`, votos, evidencias e índices/idempotencia existentes.

## 16. Riesgos residuales

- LiveKit en E2E headless puede no conectar (`hasRoom=false`); la UI de voto no destruye Room ni recarga la página.
- Sonido/vibración solo si el navegador lo permite tras gesto.
- Notificaciones PWA: no se improvisó infraestructura nueva.
- Usuarios Identity con lockout por intentos fallidos pueden devolver 429 hasta desbloqueo.

## 17. Evidencias visuales

- `01-owner-room.png` … `08-viewport-430.png` en `tools/e2e/mobile-voting-results/`
- Matriz: `matrix.json`

## 18. Defectos corregidos en esta pasada (P0/P1)

1. **P0** — `mobile-voting-sheet.js` guardado en UTF-16: el navegador no ejecutaba el módulo → overlay inexistente. Re-guardado UTF-8.
2. **P1** — z-index del overlay (80) bajo drawers (1100) → clics interceptados. Elevado a 12000.
3. **P1** — banner `absolute` dentro de video-stage → restore fallaba. Ahora `fixed` en `document.body`.
4. **P1** — claves i18n de comprobante (`voting.receiptCode`) ausentes → migradas a `mvote.receiptCode` / `mvote.castAt`.

## 19. Veredicto final

**CERTIFIED**

No se desplegó a producción (sin autorización expresa).
