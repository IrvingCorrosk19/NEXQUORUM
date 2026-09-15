# CERTIFICACIÓN MULTISESIÓN — TEAMS ↔ ASAMBLEAS

**Fecha:** 2026-09-15  
**Entorno:** Development · `https://localhost:7188`  
**Runner:** `tools/e2e/multisession-teams-cert.cjs` (Playwright, contextos independientes)  
**Resultados crudos:** `tools/e2e/multisession-teams-results/results.json`  
**Última corrida:** 44 PASS / 0 FAIL · `quorumMax=100` · `livekit=BLOCKED` · `externalOffline=OfflineNoChannel`

## Usuarios demo locales (sandbox)

Creados por el runner en PH aislado (no usuarios reales de producción):

| Rol | Email patrón | Notas |
|---|---|---|
| Presidente | `president@ocean.demo` | Sesión desktop |
| Propietario 1 (multi-unidad) | `ms.a.{stamp}@sandbox.test` | A-101 + A-103 · viewport móvil |
| Propietario 2 | `ms.b.{stamp}@sandbox.test` | A-102 |
| Copropietario misma unidad | `ms.co.{stamp}@sandbox.test` | A-101 (conflicto de representación) |
| Offline / sin hub | `ms.off.{stamp}@sandbox.test` | Nunca abre plataforma |
| Otro PH | `ms.xph.{stamp}@sandbox.test` | PH separado; no mezclado |
| Secretario / Representante | invite API no disponible en este entorno | `sec=false` / `rep=false` → P1 |

Contraseñas: solo desde `Demo.Password` en `appsettings.Development.json`. **No se imprimen en logs.**

## Escenarios ejecutados

### 1 — Aviso individual
- Presidente en `assembly.html`; propietario 1 en `lobby.html` (otra sesión).
- `POST .../summon` → `Notified`.
- Modal `#join-summon-dialog` con PH, asamblea, mensaje, **Unirme ahora** / **Ahora no**.
- Unirme ahora → navega a asamblea/lobby correcta sin recarga forzada del presidente.
- Quórum sin duplicidad.

### 2 — Rechazo (Ahora no)
- Propietario 2 recibe modal; dismiss.
- No queda `Admitted`; `summon-response` Dismissed 200.
- Asistencia no marcada presente por el dismiss.

### 3 — Aviso masivo
- `summon-absent` con conteo notified/skipped.
- Cooldown 60s → `SkippedCooldown`.
- No re-aviso a conectados en sala.

### 4 — Offline sin canal externo
- Usuario sin hub tras cooldown.
- Respuesta honesta: **`OfflineNoChannel`** — *"El participante no tiene la plataforma abierta y no existe un canal externo configurado."*
- **No** se declaró Notified. Sin correo/SMS/WhatsApp/push configurado → **BLOCKED** canal externo.

### 5 — Admisión
- RequestEntry → Waiting; lista espera ≥1.
- Reject → Rejected; re-request → Waiting; Admit → Admitted.
- Admitir todos autorizados 200.
- Lobby hub con `markPresence: false` (no inventa presencia legal).

### 6 — Copropiedad
- Acreditado Owner One en A-101.
- Intento acreditar Co Owner → *"La unidad A-101 ya está siendo representada por Owner One MS."*
- Quórum ≤100; unidades únicas (máx. 3 presentes en la corrida).

### 7 — Varias unidades + votación móvil
- Owner One: A-101 + A-103; reconnect sin inflar quórum (100→100).
- Viewport 390×844: UI de voto visible; `cast` `InFavor` 200.

### 8 — LiveKit
- **BLOCKED:** no hubo aceptación humana de audio/video real. No se declara PASS.

## Correcciones aplicadas en esta pasada

1. `JoinAssembly(assemblyId, markPresence)` + lobby/presence con `{ markPresence: false }`.
2. Summon offline honesto (`OfflineNoChannel`) y cooldown respetado en cert.
3. Acreditación selectiva para evitar conflicto de representación entre co-owners antes de S6.
4. Matriz: inconsistencias PASS con móvil Parcial corregidas a PARTIAL.

## Scorecard final

```
AVISO INDIVIDUAL: PASS
AVISO MASIVO: PASS
MODAL PROPIETARIO: PASS
UNIRME AHORA: PASS
LOBBY: PASS
ADMITIR: PASS
RECHAZAR: PASS
ACTUALIZACIÓN SIN RECARGAR: PASS
COPROPIEDAD SIN DUPLICIDAD: PASS
VARIAS UNIDADES: PASS
QUÓRUM MÁXIMO OBSERVADO: 100
VOTACIÓN MÓVIL: PASS
CHAT ENTRE DOS USUARIOS: PASS
LIVEKIT MULTIUSUARIO: BLOCKED
CANAL EXTERNO OFFLINE: BLOCKED
P0 ABIERTOS: (ninguno en flujo aviso/lobby/admit/quórum)
P1 ABIERTOS: LiveKit A/V humano; canal externo offline; invite Secretario/Representante en seed; UI estados Avisando/Avisado (T-SUM-08); calendario/cola/poderes/votación sheet móvil aún PARTIAL en matriz
RESULTADO: NO-GO
```

**NO-GO** porque LiveKit multi-usuario y canal externo offline permanecen **BLOCKED**, y la matriz aún tiene PARTIALes móviles obligatorios. El flujo presidente↔propietario de **avisar / modal / unirme / lobby / admitir / rechazar / quórum** sí cerró en multi-sesión real.
