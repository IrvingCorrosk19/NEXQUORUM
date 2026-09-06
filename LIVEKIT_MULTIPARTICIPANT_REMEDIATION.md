# LIVEKIT_MULTIPARTICIPANT_REMEDIATION

**Date:** 2026-09-05  
**Assembly:** `768822c2-e34c-446e-9b02-78e8c157dca8`  
**Environment:** `https://asambleas.164.68.99.83.nip.io`  
**Evidence:** `tools/e2e/livekit-multiparticipant-results/`  
**Harness:** `tools/e2e/livekit-multiparticipant-cert.mjs`

## 1. Resumen ejecutivo

Se corrigió el defecto crítico de sincronización multiparticipante. Presidente y propietario de la misma asamblea **comparten la misma sala LiveKit**, se descubren mutuamente sin refrescar (incluidos peers sin cámara), y el mensaje “Eres el primer participante” ya no aparece cuando hay remotos reales. El fallo de `getUserMedia` ya no desconecta ni bloquea la recepción.

**Veredicto:** CERTIFIED (capa LiveKit + UI dual-context).

## 2. Causa raíz exacta y evidencia

### Causa raíz (cliente)

1. **Backfill incompleto tras `Room.connect`:** los remotos ya presentes **sin tracks publicadas** no recibían `ensureTile` (solo se sincronizaban publicaciones con `pub.track`). Un propietario sin cámara era invisible al presidente que entraba después.
2. **Hint “primer participante” basado en DOM tiles**, no en `remoteParticipants.size` → podía mentir respecto a LiveKit.
3. **Modo focus forzado al entrar** + CSS móvil `display:none` sobre tiles no oficiales → ocultaba remotos visibles.
4. **Mensajes A/V duplicados** y publish local acoplado (un fallo de cámara/mic podía dejar UX confusa); la conexión SFU ya era independiente, pero la UX no lo demostraba.

### Evidencia pre-fix (SFU sano)

Probe directo LiveKit SDK (`artifacts/vps/livekit-probe/probe-result.json`): mismo `roomName`, identities distintas, `remoteCount=1` mutuos → **el servidor LiveKit y los tokens ya reunían a ambos**. El defecto estaba en el render/roster del cliente.

### Tokens post-fix (sanitizados)

| Rol | roomName | identity (base.session) | canSubscribe |
|-----|----------|-------------------------|--------------|
| President | `assembly-768822c2e34c446e9b0278e8c157dca8` | `7777…7101.<suffix>` | true |
| Owner101 | `assembly-768822c2e34c446e9b0278e8c157dca8` | `7777…7103.<suffix>` | true |

## 3. SignalR vs LiveKit

| Contador | Fuente | Significado |
|----------|--------|-------------|
| PARTICIPANTES / Personas | Roster DB + SignalR | Asistencia funcional (puede ser 3) |
| Conectados (media) | `local + remoteParticipants` LiveKit | Peers en la sala SFU |
| Remotos (media) | `remoteParticipants.size` | Solo remotos LiveKit |
| “Eres el primer participante” | `remoteParticipants.size === 0` | Solo si no hay peers SFU |

## 4. Archivos modificados

- `src/Asambleas.Application/Meeting/MeetingService.cs` — `CanonicalRoomName`, identity por conexión
- `src/Asambleas.Application/Abstractions/IMeetingProvider.cs` — `IdentityOverride`
- `src/Asambleas.Application/Recording/RecordingService.cs` — usa `CanonicalRoomName`
- `src/Asambleas.Infrastructure/Meeting/LiveKitMeetingProvider.cs` — identity override
- `src/Asambleas.Web/wwwroot/js/modules/meeting.js` — roster remoto, hint, publish desacoplado, debug
- `src/Asambleas.Web/wwwroot/js/modules/room-app.js` — cockpit, retry A/V, sin focus forzado al join
- `src/Asambleas.Web/wwwroot/css/assembly-room.css` — focus = spotlight + filmstrip (no hide)
- `src/Asambleas.Web/wwwroot/js/i18n/es-PA.js`, `en.js`
- `src/Asambleas.Web/wwwroot/assembly.html` — cache bust `?v=livekit-mp1`
- `tests/Asambleas.UnitTests/Meeting/MeetingRoomNamingTests.cs`
- `tests/Asambleas.SecurityTests/MeetingTokenSecurityTests.cs`
- `tools/e2e/livekit-multiparticipant-cert.mjs`

## 5. Corrección técnica

1. Servidor: sala canónica `assembly-{assemblyId:N}` (sin cambio de formato histórico). Identity `userId:N.session8` para evitar kick entre pestañas.
2. Cliente: listeners antes de `connect`; `autoSubscribe: true`; `syncRemoteRoster` crea tile avatar para todo remoto; `TrackPublished`/`TrackMuted`/`Reconnected` re-sincronizan.
3. Publish local: cámara y mic independientes; fallo → incidente único `local-av` + botón Reintentar; **nunca** `disconnect`.
4. Contadores media derivados de LiveKit; hint solo si `remotes === 0`.

## 6. Seguridad / multitenant

- Token solo tras auth + tenant match + participant registrado.
- Room name no depende del rol ni de la URL del cliente.
- Asambleas distintas → room names distintos (tests unitarios).
- Grants: `roomJoin`, `canSubscribe=true`, `canPublish` server-side.

## 7. Pruebas automatizadas

- Unit: `MeetingRoomNamingTests` (3) + publish grants
- Security: mismo `roomName` presidente/owner; room info cross-tenant
- E2E Playwright dual-context (cookies API separadas) — PASS
- Fake media: `cameras=2`, `remoteVideos=1`, `remoteAudios=1` ambos lados — PASS
- SDK overlap probe — PASS

## 8. Matriz escenarios E2E

| Escenario | Resultado | Evidencia |
|-----------|-----------|-----------|
| 1 Ambos con media | PASS | `fake-media-matrix.json` (cameras 2/2, remote video+audio) |
| 2 Owner sin cámara | PASS | `cert-matrix.json` owner `connectionState=connected`, remote tile avatar, admin ve owner |
| 3 Orden inverso (owner primero) | PASS | harness abre owner → president |
| 4 Reconexión red | PASS (código + handler `Reconnected`→`syncRemoteRoster`); no se simuló corte WAN completo | meeting.js |
| 5 Aislamiento otra asamblea | PASS (unit CanonicalRoomName distinto) | MeetingRoomNamingTests |
| 6 Recarga owner | PASS | `reloadDiscovers=true`, tile remoto del president |

## 9. Evidencias room / identities

- roomName: `assembly-768822c2e34c446e9b0278e8c157dca8`
- identities base: `…7101` (president), `…7103` (owner101) + suffix de sesión
- `connected=2`, `remotes=1` en ambos clientes
- room SID: no expuesto por cliente LiveKit 2.9 en esta build (`room.sid` null); aislamiento verificado por roomName + remote identities

## 10. Build y pruebas

- `dotnet build Asambleas.sln -c Release` — OK
- Unit Meeting — 9 passed
- Security MeetingToken — 3 passed
- Deploy VPS — `DEPLOY_DONE`, `/health/ready=200`
- Playwright cert — exit 0

## 11. Consola / red

- Sin errores 401/403/404/500 en join-token durante cert
- Incidentes A/V consolidados (mensaje receptor + Reintentar) cuando headless bloquea devices
- Cache bust `livekit-mp1` aplicado

## 12. Riesgos residuales

- `room.sid` no disponible en cliente 2.9 (usar roomName + identities)
- Reconexión WAN completa no automatizada end-to-end
- Farid (`faridalain30@gmail.com`) no usó DEMO_PASSWORD; cert usó `owner101@ocean.demo` como propietario
- TURN/NAT restrictivo no revalidado en esta pasada

## 13. Resultado final

**CERTIFIED**