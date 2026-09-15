# TEAMS ↔ ASAMBLEAS — Feature Parity Matrix

**Date (local):** 2026-09-15 (recalc multi-sesión)  
**App:** https://localhost:7188 (Development)  
**Method:** Playwright multi-context (`tools/e2e/multisession-teams-cert.cjs`) + Browser Tab + code inventory.  
**Rule:** Una capacidad **no puede ser PASS** si alguna dimensión obligatoria es Parcial / No probado / Pendiente / Bloqueado.  
**LiveKit A/V:** BLOCKED hasta aceptación humana de audio/video real.

**Legend — Estado:** `PASS` | `PARTIAL` | `FAIL` | `MISSING` | `BLOCKED` | `NOT APPLICABLE` | `ROADMAP`

| ID | Capacidad | Existe | Funciona | Desktop | Móvil | Realtime | Seguridad | Estado | Acción |
|---|---|---|---|---|---|---|---|---|---|
| T-PRE-01 | Crear asamblea | Sí | Sí | Sí | Sí | N/A | Auth+PH | PASS | Mantener |
| T-PRE-02 | Editar asamblea | Sí | Sí | Sí | Sí | N/A | Auth+PH | PASS | Mantener |
| T-PRE-03 | Programar | Sí | Sí | Sí | Sí | N/A | Auth+PH | PASS | Mantener |
| T-PRE-04 | Reprogramar | Sí | Sí | Sí | Sí | Evento schedule | Auth+PH | PASS | Mantener |
| T-PRE-05 | Cancelar | Sí | Sí | Sí | Sí | Sí | Auth+PH | PASS | Mantener |
| T-PRE-06 | Calendario | Sí | Sí | Sí | Parcial | N/A | Auth | PARTIAL | Mejorar móvil calendario (antes PASS inconsistente) |
| T-PRE-07 | Zona horaria correcta | Sí | Sí | Sí | Sí | N/A | N/A | PASS | Mantener |
| T-PRE-08 | Convocatorias | Sí | Sí | Sí | Sí | N/A | Auth | PASS | Mantener |
| T-PRE-09 | Recordatorios | Sí | Parcial | Sí | Sí | N/A | Auth | PARTIAL | Verificar canales reales configurados |
| T-PRE-10 | Enlace individual seguro | Sí | Sí | Sí | Sí | N/A | Token+tenant | PASS | Mantener |
| T-PRE-11 | Reenvío de enlace | Sí | Sí | Sí | Sí | N/A | Auth | PASS | Mantener |
| T-PRE-12 | Invalidar enlace anterior al regenerar | Sí | Sí | N/A | N/A | N/A | Auth | PASS | Mantener |
| T-PRE-13 | Enlace vigente post-fecha programada | Sí | Parcial | N/A | N/A | N/A | Auth | PARTIAL | Certificar ventana join explícita |
| T-PRE-14 | Prueba de cámara (lobby) | Sí | Sí* | Sí | Sí | N/A | Permisos browser | PARTIAL | *LiveKit humano BLOCKED |
| T-PRE-15 | Prueba de micrófono (lobby) | Sí | Sí* | Sí | Sí | N/A | Permisos | PARTIAL | Idem |
| T-PRE-16 | Selección de cámara | Sí | Sí | Sí | Sí | N/A | Local | PASS | Mantener |
| T-PRE-17 | Selección de micrófono | Sí | Sí | Sí | Sí | N/A | Local | PASS | Mantener |
| T-PRE-18 | Selección de altavoz | Sí | Parcial | Sí | Limitado | N/A | Browser | PARTIAL | Depende de `setSinkId` |
| T-PRE-19 | Indicador nivel de mic | Sí | Sí | Sí | Sí | N/A | Local | PASS | Mantener |
| T-PRE-20 | Vista previa de video | Sí | Sí | Sí | Sí | N/A | Local | PASS | Mantener |
| T-PRE-21 | Toggle cam antes de entrar | Sí | Sí | Sí | Sí | N/A | Local | PASS | Mantener |
| T-PRE-22 | Toggle mic antes de entrar | Sí | Sí | Sí | Sí | N/A | Local | PASS | Mantener |
| T-PRE-23 | Fondo desenfocado / virtual | No | — | — | — | — | — | ROADMAP | Evaluar LiveKit processors; no simular |
| T-PRE-24 | Info clara de la reunión | Sí | Sí | Sí | Sí | Sí | Auth | PASS | Mantener |
| T-PRE-25 | Estado de acreditación | Sí | Sí | Sí | Sí | Sí | Auth | PASS | Mantener |
| T-PRE-26 | Estado de conexión | Sí | Parcial | Sí | Sí | Sí | Auth | PARTIAL | Distinguir hub vs asistencia legal |
| T-PRE-27 | Sala de espera (pre-inicio) | Sí | Sí | Sí | Sí | Sí | Auth | PASS | Banner waiting |
| T-PRE-28 | Mensajes de error comprensibles | Sí | Parcial | Sí | Sí | N/A | N/A | PARTIAL | Unificar copy |
| T-PRE-29 | Reintento de dispositivos | Sí | Sí | Sí | Sí | N/A | Local | PASS | Mantener |
| T-PRE-30 | Entrada sin recargar | Sí | Sí | Sí | Sí | Auto-enter | Auth | PASS | Softnav + auto-enter live |
| T-LOB-01 | Lista espera (presidente) | Sí | Sí | Sí | Sí | Sí | Auth | PASS | Multi-sesión cert 2026-09-15 |
| T-LOB-02 | Ver acreditados / conectados / presentes / ausentes | Sí | Parcial | Sí | Parcial | Sí | Auth | PARTIAL | Unificar filtros tipo Teams |
| T-LOB-03 | Ver rechazados | Sí | Sí | Sí | Sí | Sí | Auth | PASS | RoomEntryStatus=Rejected multi-sesión |
| T-LOB-04 | Problemas de conexión | Parcial | Parcial | Sí | Sí | Sí | Auth | PARTIAL | `TemporarilyDisconnected` |
| T-LOB-05 | Unidades / coeficiente representado | Sí | Sí | Sí | Sí | Sí | Auth | PASS | Quórum panel |
| T-LOB-06 | Admitir individualmente | Sí | Sí | Sí | Sí | Sí | Permisos | PASS | Multi-sesión: Waiting→Admitted |
| T-LOB-07 | Admitir todos autorizados | Sí | Sí | Sí | Sí | Sí | Permisos | PASS | `admit-authorized` 200 |
| T-LOB-08 | Rechazar entrada | Sí | Sí | Sí | Sí | Sí | Permisos+motivo | PASS | Reject→re-request→Admit |
| T-LOB-09 | Motivo de bloqueo | Sí | Sí | Sí | Sí | N/A | Auth | PASS | Acreditación / rechazo |
| T-LOB-10 | Acreditar desde sala | Sí | Sí | Sí | Parcial | Sí | Permisos | PARTIAL | Mesa OK; móvil parcial (antes PASS) |
| T-LOB-11 | Avisar para unirse (individual) | Sí | Sí | Sí | Sí | SignalR | Permisos | PASS | Multi-sesión: Notified + modal |
| T-LOB-12 | Avisar a todos los ausentes | Sí | Sí | Sí | Sí | SignalR | Permisos | PASS | Mass + skip connected + cooldown |
| T-LOB-13 | Participante: esperando admisión | Sí | Sí | Sí | Sí | Sí | Auth | PASS | Lobby wait + RequestEntry |
| T-LOB-14 | Entrada automática al admitir | Sí | Sí | Sí | Sí | Sí | Auth | PASS | SignalR `roomEntryChanged` |
| T-LOB-15 | Cancelar solicitud de entrada | Sí | Sí | Sí | Sí | Sí | Auth | PASS | `#btn-cancel-entry` |
| T-SUM-01 | Validar auth/PH/asamblea al avisar | Sí | Sí | N/A | N/A | N/A | Sí | PASS | Mantener |
| T-SUM-02 | No avisar si ya conectado | Sí | Sí | N/A | N/A | N/A | Sí | PASS | Hub presence + RoomEntry Admitted |
| T-SUM-03 | Cooldown / anti-duplicado | Sí | Sí | N/A | N/A | N/A | Sí | PASS | 60s SkippedCooldown |
| T-SUM-04 | Evento SignalR + auditoría | Sí | Sí | N/A | N/A | Sí | Sí | PASS | Mantener |
| T-SUM-05 | Modal Unirme ahora / Ahora no | Sí | Sí | Sí | Sí | Sí | User match | PASS | 2ª sesión Browser Tab cert |
| T-SUM-06 | Sonido / vibración / Notification | Sí | Sí | Sí | Sí | N/A | Permisos | PASS | Opcional graceful |
| T-SUM-07 | Canal externo si offline | Sí | Sí* | Sí | Sí | Email | Auth+SMTP/Mock | PARTIAL | *Email via PH SMTP/mock + access link; SMS/push N/A |
| T-SUM-08 | Estados Avisando/Avisado/No respondió | Parcial | Parcial | Sí | Sí | Parcial | Auth | PARTIAL | Completar proyección UI presidente |
| T-MTG-01 | Entrar / Salir | Sí | Sí | Sí | Sí | Hub | Auth | PASS | Mantener |
| T-MTG-02 | Finalizar para todos (gobierno) | Sí | Sí | Sí | Sí | Sí | Confirm+permiso | PASS | Confirmación FINALIZAR existe |
| T-MTG-03 | Kick SFU / desconectar medios todos | No | — | — | — | — | — | MISSING | ROADMAP LiveKit room delete |
| T-MTG-04 | Micrófono local | Sí | Sí* | Sí | Sí | N/A | Publish gate | PARTIAL | *LiveKit humano |
| T-MTG-05 | Cámara local | Sí | Sí* | Sí | Sí | N/A | Publish gate | PARTIAL | *LiveKit humano |
| T-MTG-06 | Cambiar dispositivos en sala | Sí | Parcial | Sí | Sí | N/A | Local | PARTIAL | Completar UI dispositivos en sala |
| T-MTG-07 | Compartir pantalla | Sí | Sí* | Sí | Limitado | Sí | Claim+perm | PARTIAL | *humano; móvil limitado |
| T-MTG-08 | Detener / ver pantalla compartida | Sí | Sí | Sí | Sí | Sí | Auth | PASS | Mantener |
| T-MTG-09 | Solicitar control remoto | No | — | — | — | — | — | NOT APPLICABLE | LiveKit no expone control seguro |
| T-MTG-10 | Indicador quién habla | Parcial | Parcial | Sí | Sí | Media | N/A | PARTIAL | Mejorar active speaker |
| T-MTG-11 | Vista galería | Sí | Sí | Sí | Parcial | N/A | N/A | PARTIAL | Mejorar móvil |
| T-MTG-12 | Vista orador | Sí | Sí | Sí | Parcial | N/A | N/A | PARTIAL | Mejorar móvil |
| T-MTG-13 | Fijar participante (local) | No | — | — | — | — | — | MISSING | Implementar pin local |
| T-MTG-14 | Destacar para todos (moderador) | No | — | — | — | — | — | MISSING | Implementar spotlight |
| T-MTG-15 | Pantalla completa | Sí | Sí | Sí | Limitado | N/A | N/A | PASS | Mantener |
| T-MTG-16 | Calidad de conexión | Parcial | Parcial | Sí | Sí | Media | N/A | PARTIAL | Exponer métricas LiveKit |
| T-MTG-17 | Reconexión automática | Sí | Parcial | Sí | Sí | Sí | Auth | PARTIAL | Certificar A/V + estado |
| T-MTG-18 | Recuperación de estado | Sí | Sí | Sí | Sí | REST+hub | Auth | PASS | room-state |
| T-MTG-19 | Modo solo gobierno si falla LiveKit | Sí | Sí | Sí | Sí | N/A | Auth | PASS | leave-media / governance |
| T-MTG-20 | Controles adaptados a teléfono | Sí | Parcial | — | Sí | N/A | N/A | PARTIAL | Continuar UX móvil |
| T-MOD-01 | Silenciar participante (remoto force) | No | — | — | — | — | — | NOT APPLICABLE | Solicitud visible |
| T-MOD-02 | Solicitar activar micrófono | Sí | Sí | Sí | Sí | Sí | Permisos | PARTIAL | Diálogo; no force remoto |
| T-MOD-03 | Silenciar a todos (solicitud) | Sí | Sí | Sí | Sí | Sí | Permisos | PARTIAL | `#btn-request-mute-all` |
| T-MOD-04 | Permitir/bloquear cámara (policy) | Parcial | Parcial | N/A | N/A | Token | Server canPublish | PARTIAL | Via floor/publish |
| T-MOD-05 | Permitir compartir pantalla | Sí | Sí | Sí | Limitado | Sí | Perm+claim | PASS | Mantener |
| T-MOD-06 | Retirar participante | No | — | — | — | — | — | MISSING | Implementar remove+audit |
| T-MOD-07 | Cambiar función en reunión | No | — | — | — | — | — | ROADMAP | Roles dinámicos |
| T-MOD-08 | Conceder / revocar palabra | Sí | Sí | Sí | Sí | Sí | Permisos | PASS | Speaker queue |
| T-MOD-09 | Ver acreditación / unidades / poderes | Sí | Sí | Sí | Parcial | Sí | Permisos | PARTIAL | Móvil parcial (antes PASS) |
| T-HND-01 | Pedir la palabra | Sí | Sí | Sí | Sí | Sí | Auth | PASS | Mantener |
| T-HND-02 | Cancelar propia solicitud | Sí | Sí | Sí | Sí | Sí | Auth | PASS | Mantener |
| T-HND-03 | Cola visible + orden + hora | Sí | Sí | Sí | Parcial | Sí | Auth | PARTIAL | Móvil parcial (antes PASS) |
| T-HND-04 | Unidad / motivo opcional | Parcial | Parcial | Sí | Sí | Sí | Auth | PARTIAL | Motivo UI |
| T-HND-05 | Conceder / rechazar / saltar / terminar | Sí | Sí | Sí | Sí | Sí | Permisos | PASS | Mantener |
| T-HND-06 | Tiempo / cronómetro / aviso | Parcial | Parcial | Sí | Sí | N/A | N/A | PARTIAL | Completar timer UX |
| T-HND-07 | Mic según permisos al conceder | Sí | Sí | Sí | Sí | Token | Server | PASS | Mantener |
| T-HND-08 | Auditoría | Sí | Sí | N/A | N/A | N/A | Sí | PASS | Mantener |
| T-CHT-01 | Chat general | Sí | Sí | Sí | Parcial | Sí | Auth+sanitize | PARTIAL | 2 usuarios API OK; UI móvil parcial |
| T-CHT-02 | Mensajes sistema / presidente / anuncios | Sí | Parcial | Sí | Parcial | Sí | Auth | PARTIAL | Kind President/Announcement |
| T-CHT-03 | Reacciones | No | — | — | — | — | — | ROADMAP | Tras chat base |
| T-CHT-04 | Q&A moderado | No | — | — | — | — | — | ROADMAP | Distinto de moción |
| T-CHT-05 | Moderación / borrar / deshabilitar | Sí | Parcial | Sí | Parcial | Sí | Moderate | PARTIAL | DELETE; flag disable pendiente |
| T-CHT-06 | XSS / length / rate limit | Sí | Sí | N/A | N/A | N/A | Sí | PASS | Strip tags + 1000 + rate |
| T-CHT-07 | Chat ≠ voto/poder/decisión | Sí | Sí | N/A | N/A | N/A | Diseño | PASS | Tests + copy UI |
| T-REC-01 | Iniciar / detener grabación | Sí | Sí* | Sí | Sí | Sí | Permisos | PARTIAL | *archivo real env-dependent |
| T-REC-02 | Indicador visible / quién inició | Sí | Sí | Sí | Sí | Sí | Auth | PASS | Banner |
| T-REC-03 | Archivo ligado a asamblea | Sí | Sí | N/A | N/A | N/A | Auth | PASS | Expediente |
| T-REC-04 | Consentimiento / aviso | Sí | Sí | Sí | Sí | N/A | Ack | PASS | Notice ack |
| T-REC-05 | Transcripción | No | — | — | — | — | — | BLOCKED | Sin proveedor; no PASS |
| T-A11Y-01 | Subtítulos en vivo | No | — | — | — | — | — | BLOCKED | Sin proveedor |
| T-A11Y-02 | Contraste / focus / labels / aria-live | Parcial | Parcial | Sí | Sí | N/A | N/A | PARTIAL | WCAG AA continuo |
| T-A11Y-03 | Touch 44×44 / zoom / adultos mayores | Parcial | Parcial | — | Sí | N/A | N/A | PARTIAL | Auditoría móvil |
| T-BRK-01 | Salas secundarias / breakouts | No | — | — | — | — | — | NOT APPLICABLE | Riesgo quórum/voto; no copiar Teams |
| T-PH-01 | Propietario → múltiples unidades | Sí | Sí | Sí | Sí | N/A | Auth | PASS | Multi-sesión: unit1+unit3 |
| T-PH-02 | Unidad → múltiples propietarios | Sí | Sí | Sí | Sí | N/A | Auth | PASS | Co-owners + mensaje conflicto |
| T-PH-03 | Quórum por unidad única | Sí | Sí | N/A | N/A | Sí | Domain | PASS | GroupBy UnitId; máx 100 observado |
| T-PH-04 | Voto sin duplicar coeficiente | Sí | Sí | N/A | N/A | N/A | Domain | PASS | Cast InFavor multi-sesión |
| T-PH-05 | Representación / poderes | Sí | Sí | Sí | Parcial | Sí | Auth | PARTIAL | Móvil parcial (antes PASS implícito) |
| T-PH-06 | Agenda / mociones / votación ponderada | Sí | Sí | Sí | Parcial | Sí | Auth | PARTIAL | Voto móvil UI observada; sheet parcial |
| T-PH-07 | Decisiones / auditoría / acta / evidencias | Sí | Parcial | Sí | Sí | N/A | Auth | PARTIAL | PDF sí; finalize/versionar verificar |
| T-PH-08 | Históricos | Sí | Sí | Sí | Sí | N/A | Auth | PASS | Mantener |
| T-AV-01 | LiveKit multi-participante humano | Config local | No cert | — | — | — | Creds | BLOCKED | Aceptación humana obligatoria |

## Correcciones de inconsistencia (2026-09-15)

| ID | Antes | Ahora | Motivo |
|---|---|---|---|
| T-PRE-06 | PASS | PARTIAL | Móvil = Parcial |
| T-LOB-10 | PASS | PARTIAL | Móvil = Parcial |
| T-HND-03 | PASS | PARTIAL | Móvil = Parcial |
| T-MOD-09 | PASS | PARTIAL | Móvil = Parcial |
| T-PH-05/06 | PASS-ish | PARTIAL | Móvil = Parcial |
| T-LOB-11/12, T-SUM-05/07 | PARTIAL | PASS / BLOCKED | Multi-sesión real |

## Decisiones de producto

1. **Breakouts = NOT APPLICABLE** para votación/quórum oficial.
2. **Force remote mute/camera = NOT APPLICABLE**.
3. **Admisión lobby** complementa (no reemplaza) acreditación legal.
4. **Chat** nunca genera voto, poder, acreditación ni decisión.
5. **Lobby SignalR** usa `markPresence: false` — no inventa asistencia legal.
6. **Offline sin canal externo** = `OfflineNoChannel` (nunca Notified).

## Evidencia multi-sesión

- Runner: `tools/e2e/multisession-teams-cert.cjs`
- Resultados: `tools/e2e/multisession-teams-results/results.json`
- Certificación: `docs/AUDIT/CERTIFICACION_MULTISESION_TEAMS_ASAMBLEAS.md`
- Fix presencia lobby: `JoinAssembly(assemblyId, markPresence)`, `lobby-app.js` / `join-summon-presence.js` con `{ markPresence: false }`
