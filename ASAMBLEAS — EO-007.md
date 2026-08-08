# ASAMBLEAS — EO-007
# AGENDA, MOTIONS, SPEAKER MANAGEMENT & MEETING ORCHESTRATION EXCELLENCE
## END-TO-END ASSEMBLY CONDUCTION + REALTIME + UIX/UIA + EVIDENCE

**Execution Order:** EO-007  
**Producto:** ASAMBLEAS  
**Dominio:** Meeting Orchestration  
**Prioridad:** P0 — CORE ASSEMBLY EXPERIENCE  
**Dependencias:** EO-001 → EO-006  
**Stack:** .NET Core + PostgreSQL + HTML + CSS + ECMAScript 2025 + SignalR + LiveKit/infraestructura existente  
**Regla:** CONTINUAMOS PERFECCIONANDO EXCLUSIVAMENTE EL MÓDULO ASAMBLEA.

---

# 0. MISIÓN

Convertir ASAMBLEAS en una plataforma desde la cual Presidente y Secretario puedan conducir una Asamblea completa.

La cadena operacional debe quedar integrada:

```text
PREPARATION
     ↓
ACCREDITATION
     ↓
QUORUM
     ↓
START ASSEMBLY
     ↓
AGENDA
     ↓
DISCUSSION
     ↓
SPEAKER REQUEST
     ↓
SPEAKER QUEUE
     ↓
INTERVENTION
     ↓
MOTION
     ↓
DISCUSSION
     ↓
VOTING
     ↓
DECISION
     ↓
NEXT AGENDA ITEM
     ↓
...
     ↓
CLOSE ASSEMBLY
```

El sistema debe convertirse en:

# THE OPERATIONAL CONTROL PLANE OF THE ASSEMBLY.

---

# 1. PRINCIPIO FUNDAMENTAL

No queremos simplemente:

```text
Agenda CRUD
Motion CRUD
Speaker CRUD
```

Queremos:

# MEETING ORCHESTRATION.

Cada elemento debe entender:

```text
Assembly
Current State
Current Agenda Item
Current Speaker
Speaker Queue
Current Motion
Voting State
Quorum State
Permissions
```

y actuar coherentemente.

---

# 2. AUDIT FIRST

Antes de modificar:

```text
RUN APPLICATION
RUN BUILD
RUN TESTS
OPEN BROWSER
START REAL ASSEMBLY
```

Usar:

```text
President
Secretary
6 Owners
```

Recorrer el flujo actual completo.

Documentar:

```text
docs/AUDIT/EO-007/00-AS-IS.md
```

Identificar:

```text
WORKING
PARTIAL
BROKEN
MISSING
HARDCODED
MOCKED
CONFUSING
```

---

# 3. NO BLIND REWRITE

No reescribir funcionalidades que ya funcionan.

Para cada defecto:

```text
Observed behavior
Expected behavior
Root cause
Fix
Regression test
```

---

# 4. MEETING STATE MACHINE

Auditar/formalizar estado de Asamblea.

Conceptualmente:

```text
DRAFT
  ↓
READY
  ↓
CHECK_IN
  ↓
LIVE
  ↓
PAUSED
  ↓
LIVE
  ↓
CLOSING
  ↓
CLOSED
```

Adaptar a modelo existente.

---

# 5. STATE TRANSITIONS

Todas las transiciones importantes:

```text
SERVER AUTHORITY
```

No confiar en frontend.

---

# 6. INVALID TRANSITIONS

Probar:

```text
CLOSED → LIVE
DRAFT → CLOSED
LIVE → DRAFT
```

Debe rechazarse salvo proceso explícito existente.

---

# 7. START ASSEMBLY

Antes de comenzar:

backend debe evaluar readiness existente.

Ejemplo:

```text
Assembly configured
Agenda available
Participants configured
Accreditation state
Quorum state
Representation conflicts
Open blocking issues
```

---

# 8. START ASSEMBLY PRECHECK UI

Presidente debe recibir una pantalla clara:

```text
LISTA PARA INICIAR

Quórum
72.84% ✓

Participantes presentes
21

Agenda
6 puntos ✓

Conflictos críticos
0 ✓

[ INICIAR ASAMBLEA ]
```

---

# 9. BLOCKERS

Si existe problema crítico:

```text
NO INICIAR SILENCIOSAMENTE.
```

Mostrar:

```text
NO SE PUEDE INICIAR

2 conflictos de representación requieren revisión.

[ REVISAR ]
```

Aplicar reglas existentes.

No inventar requisitos jurídicos.

---

# 10. START TRANSACTION

Conceptualmente:

```text
VALIDATE
 ↓
TRANSITION
 ↓
PERSIST
 ↓
AUDIT
 ↓
COMMIT
 ↓
SIGNALR EVENT
```

---

# 11. AGENDA DOMAIN

Agenda debe pertenecer inequívocamente a:

```text
Tenant
PH
Assembly
```

---

# 12. AGENDA ITEM MODEL

Auditar/modelar:

```text
Id
Assembly
Sequence
Title
Description
Type
Status
StartedAt
CompletedAt
```

solo donde sea compatible con arquitectura actual.

---

# 13. AGENDA ORDER

Orden debe ser persistente.

No depender del DOM.

---

# 14. AGENDA STATES

Conceptualmente:

```text
PENDING
CURRENT
COMPLETED
SKIPPED
```

No agregar estados sin necesidad.

---

# 15. ONE CURRENT ITEM

P0.

Solo debe existir:

```text
ONE CURRENT AGENDA ITEM
```

por Asamblea.

Proteger server-side.

---

# 16. AGENDA ACTIVATION

Cuando Presidente activa punto:

```text
Persist
Audit
Commit
Broadcast
```

Todos los participantes reciben actualización.

---

# 17. OWNER EXPERIENCE

Owner ve inmediatamente:

```text
PUNTO ACTUAL

03 / 06

PRESUPUESTO ANUAL 2027
```

---

# 18. PROJECTOR

Projector actualiza automáticamente.

No refresh.

---

# 19. AGENDA HISTORY

Persistir:

```text
StartedAt
CompletedAt
Duration
```

cuando arquitectura lo permita.

---

# 20. NEXT ITEM

No debe ser simplemente:

```text
index++
```

Debe respetar estado persistido.

---

# 21. COMPLETE ITEM

Presidente puede marcar punto completado.

Antes de avanzar:

validar operaciones incompatibles.

---

# 22. ACTIVE VOTING BLOCK

Si Voting está OPEN:

no avanzar silenciosamente al siguiente punto.

Mostrar:

```text
HAY UNA VOTACIÓN ABIERTA

Cierra la votación antes de avanzar.
```

---

# 23. ACTIVE SPEAKER

Si hay intervención activa:

definir UX.

No necesariamente bloquear.

Pero advertir cuando corresponda.

---

# 24. ACTIVE MOTION

Si existe Motion sin resolver:

mostrar claramente.

No perderla al cambiar agenda.

---

# 25. SKIP ITEM

Si funcionalidad existe:

permitir `SKIP` con razón/auditoría.

Si no existe:

no agregarla automáticamente.

Documentar backlog si necesaria.

---

# 26. REOPEN ITEM

No permitir reabrir silenciosamente punto completado.

Si producto ya lo permite:

acción explícita + auditoría.

---

# 27. AGENDA UI — OPERATOR

Debe funcionar como control operacional.

Ejemplo conceptual:

```text
ORDEN DEL DÍA

✓ 01 Verificación de quórum
✓ 02 Apertura

● 03 Presupuesto anual
     00:18:42

○ 04 Elección Junta Directiva
○ 05 Asuntos varios
○ 06 Cierre
```

---

# 28. CURRENT ITEM VISUAL

El punto actual debe ser obvio en menos de 1 segundo.

---

# 29. OWNER AGENDA

Owner necesita:

```text
CURRENT
NEXT
PROGRESS
```

No controles administrativos.

---

# 30. MOTION DOMAIN

Motion debe pertenecer a:

```text
Tenant
Assembly
Agenda Item
```

cuando aplique.

---

# 31. MOTION MODEL

Auditar/modelar:

```text
Motion Number
Title
Text
ProposedBy
SecondedBy
AgendaItem
Status
CreatedAt
PresentedAt
ResolvedAt
```

según reglas existentes.

---

# 32. MOTION ≠ AGENDA ITEM

P0 UX.

Nunca confundir:

```text
WHAT WE ARE DISCUSSING
```

con:

```text
WHAT WE ARE DECIDING.
```

---

# 33. MOTION STATES

Conceptualmente:

```text
DRAFT
PRESENTED
UNDER_DISCUSSION
READY_FOR_VOTE
VOTING
RESOLVED
WITHDRAWN
```

Adaptar.

---

# 34. PRESENT MOTION

Solo rol autorizado.

Server validation.

---

# 35. MOTION NUMBER

Generación server-side.

No confiar en navegador.

Ejemplo:

```text
MOT-003
```

---

# 36. MOTION TEXT

Debe soportar texto razonablemente largo.

Probar:

```text
50
250
500
1000+
characters
```

UI no debe romperse.

---

# 37. MOTION CREATION UX

Presidente/Secretario autorizado:

```text
NUEVA MOCIÓN

Título
[...]

Texto
[...]

Proponente
[...]

[ CANCELAR ]

[ PRESENTAR MOCIÓN ]
```

según funcionalidad existente.

---

# 38. MOTION REVIEW

Antes de presentar:

mostrar resumen.

Evitar publicar texto accidentalmente.

---

# 39. MOTION PRESENTED

Todos reciben realtime:

```text
NUEVA MOCIÓN PRESENTADA

MOT-003

Aprobar presupuesto extraordinario...
```

---

# 40. MOTION OWNER UX

Motion gana prioridad.

No modal destructivo que bloquee video permanentemente.

---

# 41. MOTION PROJECTOR

Mostrar texto público.

Nunca metadata privada.

---

# 42. MOTION → VOTING

Integración con EO-005.

No crear VotingSession desconectada de Motion.

Debe existir trazabilidad:

```text
Agenda Item
 ↓
Motion
 ↓
Voting Session
 ↓
Result
 ↓
Decision
```

---

# 43. MOTION RESOLUTION

Después de votación:

Motion recibe resolución correspondiente.

No confiar en frontend.

---

# 44. DECISION DISPLAY

Ejemplo:

```text
MOT-003

APROBADA

68.42% a favor

20:42
```

---

# 45. MULTIPLE MOTIONS

Auditar comportamiento.

No asumir que solo existirá una moción por punto.

Debe poder existir historial.

---

# 46. ONE ACTIVE MOTION

Si reglas actuales requieren una sola moción activa:

enforce server-side.

---

# 47. SPEAKER REQUEST DOMAIN

Solicitud debe pertenecer a:

```text
Tenant
Assembly
Participant
Agenda Item
```

cuando corresponda.

---

# 48. SPEAKER REQUEST STATES

Conceptualmente:

```text
REQUESTED
QUEUED
GRANTED
SPEAKING
COMPLETED
CANCELLED
REJECTED
```

Adaptar al modelo existente.

---

# 49. REQUEST SPEAK

Owner:

```text
[ SOLICITAR PALABRA ]
```

Debe ser una acción clara y accesible.

---

# 50. DUPLICATE REQUEST

Owner toca 5 veces.

Resultado:

```text
ONE ACTIVE REQUEST.
```

---

# 51. REQUEST CONFIRMATION

Después:

```text
SOLICITUD ENVIADA

Estás en la lista de intervenciones.

Posición
3
```

---

# 52. POSITION

Calcular server-side.

No confiar en índice frontend.

---

# 53. REALTIME QUEUE

Cuando cambia:

President/Secretary reciben actualización sin refresh.

---

# 54. OWNER QUEUE STATUS

Owner debe conocer:

```text
Request status
Queue position
```

cuando sea apropiado.

No revelar información innecesaria.

---

# 55. CANCEL REQUEST

Si permitido:

Owner puede cancelar antes de recibir palabra.

---

# 56. SPEAKER QUEUE UI

Operator:

```text
SOLICITUDES DE PALABRA

AHORA

María González
Unidad 8B
02:14

SIGUIENTES

01 Carlos Pérez    3C    espera 01:42
02 Ana Rodríguez   9A    espera 01:13
03 José Martínez   2B    espera 00:48
```

---

# 57. QUEUE ORDER

Orden debe ser server-side.

No depender del DOM.

---

# 58. CONCURRENT REQUESTS

Dos personas solicitan simultáneamente.

Orden determinístico.

Usar:

```text
CreatedAt server
Sequence
```

o estrategia equivalente.

---

# 59. GRANT SPEAKER

Presidente:

```text
CONCEDER PALABRA
```

Server valida:

```text
Assembly LIVE
Participant valid
Request active
No incompatible state
```

---

# 60. ONE ACTIVE SPEAKER

Normalmente:

```text
ONE ACTIVE SPEAKER
```

salvo modelo existente.

Enforce backend.

---

# 61. OWNER GRANTED UX

Owner recibe:

```text
TIENES LA PALABRA

Tu micrófono está habilitado.

Tiempo
00:00
```

según integración media.

---

# 62. MEDIA INTEGRATION

LiveKit/media layer puede controlar micrófono.

Pero:

```text
SPEAKER GOVERNANCE STATE
```

debe seguir siendo backend authority.

---

# 63. MEDIA FAILURE

Si micrófono no puede habilitarse:

NO perder solicitud.

Mostrar incidente.

---

# 64. SPEAKER TIMER

Timer basado en timestamps server-side.

No crear timers independientes que diverjan.

---

# 65. TIME LIMIT

Si existe configuración:

mostrar límite.

No cortar mic automáticamente salvo regla existente.

---

# 66. WARNING

Ejemplo:

```text
00:30 restantes
```

si política lo requiere.

---

# 67. END INTERVENTION

Presidente:

```text
FINALIZAR INTERVENCIÓN
```

Después:

```text
SpeakerRequest → COMPLETED
ActiveSpeaker → null
Next queue remains
```

---

# 68. OWNER END

Si producto permite:

```text
TERMINAR INTERVENCIÓN
```

desde Owner.

Si no existe, no agregar automáticamente.

---

# 69. QUEUE HISTORY

Persistir:

```text
RequestedAt
GrantedAt
StartedAt
EndedAt
Duration
Status
```

---

# 70. SPEAKER EVIDENCE

Acta/evidence podrá reconstruir:

```text
Who requested
Who spoke
When
For how long
Under which agenda item
```

---

# 71. SECRETARY EXPERIENCE

Secretary debe poder apoyar operación.

No duplicar todo el poder del Presidente sin RBAC.

---

# 72. RBAC

Auditar acciones:

```text
Start Assembly
Advance Agenda
Present Motion
Manage Queue
Grant Speaker
End Speaker
Open Voting
Close Voting
Publish Result
End Assembly
```

---

# 73. UI HIDING ≠ SECURITY

Intentar endpoints directamente.

Backend debe rechazar.

---

# 74. ACTION COMMAND BAR

Operator Cockpit debe mostrar acciones relevantes al estado.

Ejemplo durante discusión:

```text
[ SIGUIENTE PUNTO ]

[ PRESENTAR MOCIÓN ]

[ GESTIONAR INTERVENCIONES ]
```

Durante Motion:

```text
[ ABRIR VOTACIÓN ]
```

No mostrar 20 botones permanentemente.

---

# 75. CONTEXTUAL COMMANDS

La UI debe responder:

```text
WHAT CAN I VALIDLY DO NOW?
```

---

# 76. INVALID ACTIONS

Preferir no mostrar acciones imposibles.

Cuando sea útil mostrar disabled:

explicar razón.

---

# 77. COMMAND CONFIRMATION

Acciones críticas:

```text
Start Assembly
Open Voting
Close Voting
End Assembly
```

requieren UX proporcional al riesgo.

---

# 78. NO CONFIRMATION FATIGUE

No poner modal para cada click trivial.

---

# 79. MEETING TIMELINE

Crear/optimizar timeline operacional.

No analytics.

Evidencia de eventos importantes:

```text
19:00 Asamblea iniciada
19:03 Quórum alcanzado
19:05 Punto 01 iniciado
19:08 Punto 02 iniciado
19:12 María solicitó palabra
19:14 María inició intervención
19:17 Moción MOT-001 presentada
19:22 Votación abierta
19:25 Votación cerrada
19:26 MOT-001 aprobada
```

---

# 80. TIMELINE AUTHORITY

Generada desde eventos persistidos/auditables.

No solo desde estado frontend.

---

# 81. OWNER TIMELINE

No necesita ver toda auditoría.

Mostrar únicamente contexto útil si ya existe UX para ello.

---

# 82. OPERATOR TIMELINE

Debe permitir comprender qué ocurrió sin abandonar Cockpit.

Drawer/panel contextual.

---

# 83. REALTIME EVENTS

Auditar eventos:

```text
AssemblyStarted
AgendaItemStarted
AgendaItemCompleted
MotionPresented
MotionResolved
SpeakerRequested
SpeakerGranted
SpeakerStarted
SpeakerEnded
VotingOpened
VotingClosed
ResultPublished
AssemblyPaused
AssemblyResumed
AssemblyEnded
```

Adaptar a implementación.

---

# 84. EVENT CONSISTENCY

Todo evento importante:

```text
Persist
Commit
Publish
```

---

# 85. EVENT IDEMPOTENCY

Reprocesar evento no debe crear estados duplicados.

---

# 86. UI REALTIME

No usar:

```text
location.reload()
```

para sincronizar.

Actualizar componentes específicos.

---

# 87. FOCUS PRESERVATION

Evento realtime no debe:

```text
close modal unexpectedly
reset form
steal keyboard focus
reset scroll
```

---

# 88. RECONNECT

Después de reconnect:

consultar estado autoritativo.

Recuperar:

```text
Assembly state
Current agenda
Current motion
Speaker
Queue
Voting
Quorum
Participant state
```

---

# 89. REFRESH

F5 durante cualquier estado debe reconstruir correctamente.

---

# 90. REFRESH MATRIX

Probar:

```text
Discussion
Motion presented
Speaker active
Voting open
Voting closed
Result published
Paused
```

---

# 91. MULTI-TAB OPERATOR

Dos tabs del Presidente.

Evitar transiciones duplicadas.

Backend garantiza consistencia.

---

# 92. CONCURRENT OPERATORS

President + Secretary intentan misma acción.

Ejemplo:

```text
NEXT AGENDA
```

simultáneamente.

Debe existir un solo resultado consistente.

---

# 93. OPTIMISTIC CONCURRENCY

Evaluar:

```text
row version
xmin
version token
state transition check
```

según arquitectura.

---

# 94. STALE COMMAND

Si UI cree:

```text
Agenda = 3
```

pero servidor ya está en:

```text
Agenda = 4
```

rechazar/actualizar correctamente.

---

# 95. OPERATIONAL INCIDENT

Mostrar:

```text
El estado de la Asamblea cambió.

Actualizamos la pantalla con la información más reciente.
```

No error técnico.

---

# 96. PAUSE / RECESS

Si funcionalidad existe:

perfeccionarla.

State:

```text
LIVE
 ↓
PAUSED
 ↓
LIVE
```

---

# 97. PAUSE UI

Owner/Projector:

```text
RECESO

La Asamblea continuará en breve.
```

---

# 98. PAUSE TIMER

Si existe hora de retorno:

mostrarla.

No inventar.

---

# 99. DURING PAUSE

Definir qué acciones quedan permitidas según reglas existentes.

---

# 100. END ASSEMBLY

P0.

No debe ser un botón normal.

---

# 101. PRE-CLOSE CHECK

Antes de finalizar:

```text
AGENDA
6 / 6

VOTACIONES ABIERTAS
0

MOCIONES PENDIENTES
0

INTERVENCIÓN ACTIVA
No

QUÓRUM
72.84%

[ FINALIZAR ASAMBLEA ]
```

---

# 102. BLOCK OPEN VOTE

No cerrar Asamblea con Voting OPEN.

---

# 103. UNRESOLVED MOTION

Mostrar advertencia/bloqueo según reglas.

No desaparecerla.

---

# 104. CLOSE CONFIRMATION

Mostrar impacto.

Ejemplo:

```text
FINALIZAR ASAMBLEA

Después de finalizar no podrán
registrarse nuevas intervenciones
ni votaciones.

[ CANCELAR ]

[ FINALIZAR ]
```

---

# 105. CLOSE TRANSACTION

```text
VALIDATE
 ↓
TRANSITION
 ↓
PERSIST
 ↓
FINAL SNAPSHOT
 ↓
AUDIT
 ↓
COMMIT
 ↓
BROADCAST
```

---

# 106. FINAL STATE

Todos reciben:

```text
ASAMBLEA FINALIZADA
```

---

# 107. OWNER CLOSED UX

Mostrar:

```text
ASAMBLEA FINALIZADA

Duración
02:18:42

Puntos tratados
6

Decisiones
4

Gracias por participar.
```

Solo datos reales.

---

# 108. PROJECTOR CLOSED

Pantalla sobria:

```text
ASAMBLEA FINALIZADA

20:58
```

---

# 109. OPERATOR POST-ASSEMBLY

Redirigir/mostrar resumen.

No dejar Cockpit aparentando que sigue LIVE.

---

# 110. SUMMARY INTEGRATION

Preparar datos para siguiente EO de acta/evidence:

```text
Start
End
Agenda
Motions
Speakers
Voting
Decisions
Quorum history
Attendance
```

---

# 111. UIX — PRESIDENT

Debe sentirse como:

# COMMAND CENTER

pero sin sobrecarga.

---

# 112. UIX — SECRETARY

Debe sentirse como:

# OPERATIONAL DESK.

---

# 113. UIX — OWNER

Debe sentirse como:

# PARTICIPATION ROOM.

---

# 114. CONTEXT PRIORITY

Durante discusión:

```text
Agenda + Speaker
```

ganan prioridad.

Durante Motion:

```text
Motion
```

gana prioridad.

Durante Voting:

```text
Voting
```

gana prioridad.

---

# 115. OWNER ACTION PRIORITY

Solo una acción primaria cuando sea posible.

Ejemplo:

```text
SOLICITAR PALABRA
```

o:

```text
VOTAR AHORA
```

según estado.

---

# 116. MOBILE OWNER

P0.

Probar:

```text
375x667
390x844
430x932
```

---

# 117. MOBILE DISCUSSION

Debe mostrar:

```text
LIVE
Current Agenda
Active Speaker
Current Motion
Request Speak
```

con jerarquía correcta.

---

# 118. MOBILE VOTING

EO-005 continúa teniendo prioridad.

Voting takeover debe seguir funcionando.

---

# 119. TABLET SECRETARY

Probar:

```text
768x1024
820x1180
```

---

# 120. DESKTOP PRESIDENT

Probar:

```text
1366x768
1440x900
1920x1080
```

---

# 121. PROJECTOR

Probar:

```text
1920x1080
```

desde distancia visual.

---

# 122. ACCESSIBILITY

WCAG 2.2 AA.

Especialmente:

```text
Agenda
Motion
Speaker Queue
Realtime status
Dialogs
Command Bar
Timers
```

---

# 123. KEYBOARD PRESIDENT

Debe poder operar controles principales sin mouse.

---

# 124. KEYBOARD OWNER

Debe poder:

```text
Request speak
Cancel request
Vote
```

según estado.

---

# 125. SCREEN READER EVENTS

Anunciar prioritariamente:

```text
Agenda changed
Motion presented
You are next
You have the floor
Voting opened
Assembly paused
Assembly ended
```

---

# 126. NO ANNOUNCEMENT SPAM

No anunciar cada segundo de timer.

---

# 127. TIMER ACCESSIBILITY

No live-region por cada tick.

---

# 128. LONG TEXT

Probar:

```text
Long PH name
Long assembly name
Long agenda title
1000-char motion
Long participant name
```

---

# 129. PERFORMANCE

Medir:

```text
Agenda transition
Motion publish
Speaker request
Queue update
Grant speaker
End speaker
```

---

# 130. SIGNALR PERFORMANCE

No broadcast global innecesario.

Usar grupos correctos:

```text
Tenant
Assembly
Role
Participant
```

según arquitectura.

---

# 131. TENANT ISOLATION

P0.

Tenant A nunca recibe eventos de Tenant B.

---

# 132. ASSEMBLY ISOLATION

Dos Asambleas simultáneas del mismo PH/tenant no deben cruzar:

```text
Agenda
Motions
Speakers
Voting
Events
```

---

# 133. SECURITY TEST

Intentar:

```text
Owner → Start Assembly
Owner → Next Agenda
Owner → Present Motion
Owner → Grant Speaker
Owner → End Assembly
```

Backend:

```text
REJECTED
```

---

# 134. IDOR

Manipular:

```text
AssemblyId
AgendaItemId
MotionId
SpeakerRequestId
ParticipantId
```

Rechazar contexto inválido.

---

# 135. XSS

Probar en:

```text
Agenda title
Agenda description
Motion title
Motion text
Speaker notes
```

si editables.

---

# 136. AUDIT

Registrar operaciones críticas:

```text
AssemblyStarted
AgendaChanged
MotionPresented
MotionWithdrawn
SpeakerGranted
SpeakerEnded
AssemblyPaused
AssemblyResumed
AssemblyEnded
```

---

# 137. AUDIT ACTOR

Registrar:

```text
Actor
Role
Timestamp UTC
Assembly
Action
Correlation
```

---

# 138. 8-USER E2E

Obligatorio.

```text
President
Secretary
Owner01
Owner02
Owner03
Owner04
Owner05
Owner06
```

---

# 139. MASTER E2E

Ejecutar desde Browser:

```text
LOGIN ALL
 ↓
CHECK-IN
 ↓
VERIFY QUORUM
 ↓
START ASSEMBLY
 ↓
AGENDA ITEM 1
 ↓
NEXT
 ↓
AGENDA ITEM 2
 ↓
OWNER03 REQUESTS SPEAK
 ↓
OWNER05 REQUESTS SPEAK
 ↓
VERIFY QUEUE ORDER
 ↓
GRANT OWNER03
 ↓
END INTERVENTION
 ↓
GRANT OWNER05
 ↓
PRESENT MOTION
 ↓
VERIFY ALL USERS SEE MOTION
 ↓
OPEN VOTING
 ↓
ALL ELIGIBLE USERS VOTE
 ↓
CLOSE VOTING
 ↓
PUBLISH RESULT
 ↓
VERIFY MOTION RESOLUTION
 ↓
NEXT AGENDA
 ↓
DISCONNECT OWNER04
 ↓
RECONNECT OWNER04
 ↓
VERIFY STATE
 ↓
CONTINUE AGENDA
 ↓
FINAL ITEM
 ↓
PRE-CLOSE CHECK
 ↓
END ASSEMBLY
 ↓
VERIFY ALL USERS
```

---

# 140. CONCURRENCY TESTS

Probar:

```text
2 speaker requests simultaneously
2 operator agenda transitions
2 grant attempts
2 motion submissions
President + Secretary same command
```

---

# 141. DATABASE VERIFICATION

Después:

comparar:

```text
Assembly
Agenda
Motions
Speaker Requests
Voting
Decisions
Audit
Timeline
```

con UI.

---

# 142. REALTIME ASSERTIONS

Cada transición debe aparecer en browsers correctos.

Sin refresh.

---

# 143. SCREENSHOT EVIDENCE

Capturar:

```text
Pre-Start
Discussion
Speaker Queue
Active Speaker
Motion
Voting
Result
Pause if supported
Pre-Close
Closed
Mobile Owner
Tablet Secretary
Desktop President
Projector
```

---

# 144. BROWSER CONSOLE

```text
Unexpected errors = 0
Unhandled Promise Rejection = 0
```

---

# 145. NETWORK

```text
Unexpected 404 = 0
Unexpected 500 = 0
```

---

# 146. NO DEAD BUTTONS

Todos los botones visibles:

```text
WORK
```

o no deben mostrarse.

---

# 147. NO MOCK STATE

Prohibido:

```text
Fake agenda
Fake motion
Fake queue
Fake timer
Fake result
Fake speaker
```

---

# 148. HUMAN TEST

Preparar una Asamblea piloto con 8 personas.

No explicar interfaz salvo login inicial.

Observar.

---

# 149. HUMAN METRICS

Medir:

```text
Did President know what to do next?
Did Owners understand current agenda?
Could Owners request speak?
Did queue make sense?
Was Motion understandable?
Was transition to Voting obvious?
Did everyone understand result?
Did President know how to continue?
```

---

# 150. UX FAILURE SIGNAL

Si Presidente pregunta repetidamente:

> "¿Ahora dónde tengo que darle?"

La UX necesita mejorar.

---

# 151. OWNER FAILURE SIGNAL

Si Owner pregunta:

> "¿Qué estamos haciendo?"

La jerarquía de estado necesita mejorar.

---

# 152. DOCUMENTATION

Crear:

```text
docs/AUDIT/EO-007/
```

con:

```text
00-AS-IS.md
01-MEETING-STATE-MACHINE.md
02-AGENDA.md
03-MOTIONS.md
04-SPEAKER-MANAGEMENT.md
05-ORCHESTRATION.md
06-REALTIME.md
07-CONCURRENCY.md
08-SECURITY.md
09-UIX-UIA.md
10-RESPONSIVE.md
11-ACCESSIBILITY.md
12-PERFORMANCE.md
13-E2E.md
14-DATABASE-EVIDENCE.md
15-HUMAN-TEST.md
16-KNOWN-LIMITATIONS.md
EO-007-COMPLETION-REPORT.md
```

---

# 153. CERTIFICATION MATRIX

Reportar:

```text
Meeting State Machine
Start Precheck
Start Assembly
Agenda
Agenda Ordering
Current Item
Agenda Realtime
Motion
Motion Lifecycle
Motion → Voting
Motion → Decision
Speaker Request
Duplicate Request Protection
Speaker Queue
Queue Ordering
Concurrent Requests
Grant Speaker
Active Speaker
Speaker Timer
End Intervention
Secretary Experience
President Experience
Owner Experience
Projector
Pause/Recess
Reconnect
Refresh
Concurrent Operators
Stale Commands
End Precheck
End Assembly
Timeline
SignalR
Multi-Tenant
Assembly Isolation
RBAC
IDOR
XSS
Audit
Database
Mobile
Tablet
Desktop
Accessibility
Performance
E2E 8 Users
Human Test
```

Estados:

```text
PASS
FAIL
BLOCKED
NOT EXECUTED
MANUAL ACCEPTANCE REQUIRED
```

---

# 154. ZERO-TOLERANCE GATE

Para certificar:

```text
Two current agenda items              0
Duplicate active speaker              0
Duplicate speaker requests            0
Cross-tenant events                   0
Cross-assembly events                 0
Unauthorized commands                 0
Lost motions                          0
Lost agenda state                     0
Lost speaker state                    0
Broken reconnect                      0
Refresh state corruption              0
Unexpected 500                        0
Unexpected 404                        0
Unhandled JS errors                   0
Dead critical controls                0
```

---

# 155. INTEGRATION GATE

Debemos demostrar:

```text
ATTENDANCE
 ↓
QUORUM
 ↓
START
 ↓
AGENDA
 ↓
SPEAKER
 ↓
MOTION
 ↓
VOTING
 ↓
DECISION
 ↓
NEXT ITEM
 ↓
CLOSE
```

como una sola experiencia.

---

# 156. EVIDENCE CHAIN

Para una decisión seleccionada aleatoriamente debemos poder reconstruir:

```text
Assembly
 ↓
Agenda Item
 ↓
Motion
 ↓
Discussion Context
 ↓
Voting Session
 ↓
Eligible Representation
 ↓
Votes
 ↓
Result
 ↓
Decision
 ↓
Timeline
 ↓
Audit
```

---

# 157. CLIENT DEMO GATE

Realizar una Asamblea completa desde UI.

Prohibido utilizar:

```text
SQL
Developer Console
Manual API calls
Page refresh to fix state
Code changes during demo
```

---

# 158. PRESIDENT TEST

Presidente debe poder dirigir la Asamblea sin ayuda del desarrollador.

Debe poder responder siempre:

```text
Where are we?
Who is speaking?
What are we discussing?
Is there a motion?
Are we voting?
What happened?
What can I do next?
```

---

# 159. OWNER TEST

Owner debe saber siempre:

```text
What are we discussing?
Who is speaking?
Can I participate?
Is there a motion?
Do I need to vote?
Was my vote accepted?
```

---

# 160. PRODUCT QUESTION

Al terminar EO-007, ejecutar una Asamblea completa y preguntarse:

> ¿Podríamos sentar mañana a un administrador de PH, un Presidente y seis propietarios frente a esta aplicación y realizar una Asamblea sin intervenir como desarrolladores?

Si la respuesta es:

```text
NO
```

EO-007:

# NOT CERTIFIED.

---

# 161. FINAL EXECUTION COMMAND

Empieza ahora.

Primero:

# RUN A COMPLETE ASSEMBLY WITH THE CURRENT SYSTEM.

No programes primero.

Observa primero.

Después:

```text
AUDIT
 ↓
STATE MACHINE
 ↓
AGENDA
 ↓
MOTIONS
 ↓
SPEAKER QUEUE
 ↓
ORCHESTRATION
 ↓
REALTIME
 ↓
CONCURRENCY
 ↓
SECURITY
 ↓
UIX/UIA
 ↓
MOBILE
 ↓
ACCESSIBILITY
 ↓
8-USER E2E
 ↓
DATABASE VERIFICATION
 ↓
HUMAN TEST
 ↓
CERTIFICATION
```

No expandas scope.

No agregues módulos administrativos.

No agregues IA.

No cambies stack.

No conviertas esto en CRUD.

No hardcodees estados.

No uses refresh como sincronización.

No confíes en timers del navegador como autoridad.

No permitas dos puntos actuales.

No permitas dos speakers activos.

No pierdas una Motion.

No permitas avanzar ignorando una votación abierta.

No confundas una Motion con Agenda.

No declares realtime probando un navegador.

No declares E2E si no realizaste la Asamblea.

No declares PASS por leer código.

# PRESIDENT CONTROLS THE ASSEMBLY.

# SECRETARY SUPPORTS THE OPERATION.

# OWNERS PARTICIPATE.

# BACKEND CONTROLS THE STATE.

# POSTGRESQL PRESERVES THE TRUTH.

# SIGNALR SYNCHRONIZES THE ROOM.

# THE UI EXPLAINS WHAT IS HAPPENING.

---

# 162. DEFINITION OF DONE

EO-007 solamente termina cuando podamos realizar desde Browser:

```text
START ASSEMBLY
 ↓
ADVANCE AGENDA
 ↓
REQUEST SPEAK
 ↓
MANAGE QUEUE
 ↓
GRANT SPEAKER
 ↓
END INTERVENTION
 ↓
PRESENT MOTION
 ↓
DISCUSS
 ↓
OPEN VOTING
 ↓
VOTE
 ↓
CLOSE VOTING
 ↓
PUBLISH DECISION
 ↓
CONTINUE AGENDA
 ↓
END ASSEMBLY
```

con 8 participantes independientes,

sin:

```text
manual refresh
database intervention
developer console
external spreadsheet
WhatsApp coordination
paper queue
manual vote counting
manual quorum calculation
```

y manteniendo:

```text
Correct state
Correct permissions
Correct realtime
Correct evidence
Correct audit
Correct responsive UX
Correct accessibility
```

El Presidente debe sentir que ASAMBLEAS:

# LE AYUDA A DIRIGIR LA REUNIÓN.

No que simplemente:

# REGISTRA COSAS SOBRE LA REUNIÓN.

Ese es el estándar de EO-007.

# ORCHESTRATE THE MEETING.
# REMOVE OPERATIONAL CHAOS.
# MAKE THE CURRENT STATE OBVIOUS.
# MAKE THE NEXT ACTION OBVIOUS.
# PRESERVE EVERY IMPORTANT EVENT.
# PROVE EVERYTHING IN THE BROWSER.