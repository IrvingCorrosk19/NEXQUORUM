# ASAMBLEAS — EO-010
# FULL ASSEMBLY FUNCTIONAL CERTIFICATION & ADVERSARIAL TESTING
## BROWSER E2E + SECURITY + MULTITENANT + CONCURRENCY + REALTIME + UX + RECOVERY + CERTIFICATION

**Execution Order:** EO-010  
**Producto:** ASAMBLEAS  
**Dominio:** Full Assembly Certification  
**Prioridad:** P0 — RELEASE GATE  
**Dependencias:** EO-001 → EO-009  
**Stack:** .NET Core + PostgreSQL + HTML/CSS + ECMAScript 2025 + SignalR + WebRTC/LiveKit + infraestructura existente  
**Piloto funcional:** 8 participantes  
**Escala sintética:** hasta 300 participantes donde aplique  
**Objetivo:** INTENTAR ROMPER EL PRODUCTO.

---

# 0. MISIÓN

No desarrollar nuevas funcionalidades.

No embellecer superficialmente.

No declarar PASS leyendo código.

La misión es:

# PROBAR LA ASAMBLEA COMPLETA COMO PRODUCTO REAL.

Debemos demostrar:

```text
AUTHENTICATION
 ↓
ASSEMBLY ACCESS
 ↓
ACCREDITATION
 ↓
ATTENDANCE
 ↓
REPRESENTATION
 ↓
QUORUM
 ↓
LOBBY
 ↓
VIRTUAL ROOM
 ↓
START ASSEMBLY
 ↓
AGENDA
 ↓
SPEAKER REQUEST
 ↓
INTERVENTION
 ↓
MOTION
 ↓
VOTING
 ↓
DECISION
 ↓
NEXT AGENDA
 ↓
CLOSURE
 ↓
EVIDENCE
 ↓
MINUTES
 ↓
FINAL RECORD
```

Todo debe funcionar como UNA experiencia.

---

# 1. GOLDEN RULE

Para cada función:

```text
OBSERVE
 ↓
TEST
 ↓
BREAK
 ↓
FIX
 ↓
RETEST
 ↓
REGRESSION
 ↓
EVIDENCE
```

---

# 2. FAIL MEANS FIX

Todo FAIL reproducible debe:

```text
1. Documentarse
2. Encontrar root cause
3. Corregirse
4. Tener regression test
5. Ejecutarse nuevamente
6. Demostrar PASS
```

No dejar:

```text
KNOWN ISSUE
```

para P0/P1 corregible.

---

# 3. NO FALSE CERTIFICATION

Prohibido declarar:

```text
PASS
CERTIFIED
100%
PRODUCTION READY
WORLD CLASS
```

sin evidencia ejecutada.

---

# 4. TEST INVENTORY FIRST

Antes de ejecutar:

crear:

```text
docs/AUDIT/EO-010/00-TEST-INVENTORY.md
```

Inventariar:

```text
Pages
Routes
Controllers
Endpoints
Commands
Queries
Dialogs
Buttons
Forms
Realtime events
Roles
Assembly states
Voting states
Media states
Responsive states
```

---

# 5. ROUTE CRAWL

Enumerar todas las rutas del módulo Assembly.

Probar:

```text
GET
POST
PUT
PATCH
DELETE
```

según corresponda.

---

# 6. UI INVENTORY

Enumerar todos:

```text
Buttons
Links
Dropdowns
Tabs
Drawers
Dialogs
Forms
Switches
Menus
Context actions
```

Cada elemento visible debe tener prueba.

---

# 7. DEAD CONTROL RULE

Target:

```text
Dead buttons = 0
Dead links = 0
Fake controls = 0
```

---

# 8. MASTER TEST PERSONAS

Crear/usar:

```text
PRESIDENT
SECRETARY
OWNER01
OWNER02
OWNER03
OWNER04
OWNER05
OWNER06
UNAUTHORIZED USER
SECOND TENANT USER
```

---

# 9. TEST DATA

Crear dataset determinístico.

Debe permitir conocer resultados esperados.

Ejemplo:

```text
Owner01  coefficient 10%
Owner02  coefficient 12%
Owner03  coefficient 8%
...
```

No depender de datos ambiguos.

---

# 10. SECOND TENANT

Crear:

```text
Tenant A
Tenant B
```

con Assemblies simultáneas.

---

# 11. SAME-TENANT MULTI-ASSEMBLY

Crear:

```text
Assembly A1
Assembly A2
```

para verificar aislamiento por Assembly.

---

# 12. TEST MATRIX

Cubrir:

```text
ROLE
×
ASSEMBLY STATE
×
DEVICE
×
CONNECTION STATE
×
ACTION
```

priorizando riesgos reales.

---

# 13. AUTHENTICATION

Probar:

```text
Valid login
Invalid password
Locked/disabled account
Expired session
Logout
Direct route after logout
```

---

# 14. SESSION EXPIRATION

Expirar sesión durante Asamblea.

No permitir acciones con identidad inválida.

---

# 15. MULTI-TENANT AUTH

Usuario Tenant A:

no puede operar Tenant B.

---

# 16. IDOR MASTER TEST

Manipular:

```text
TenantId
PHId
AssemblyId
ParticipantId
UnitId
PowerId
AgendaItemId
MotionId
VotingSessionId
VoteId
DecisionId
MinutesId
EvidenceId
```

---

# 17. IDOR TARGET

```text
Cross-context unauthorized success = 0
```

---

# 18. ACCREDITATION

Probar:

```text
Valid participant
Invalid participant
Already accredited
Revoked
Representation
Proxy/power
Duplicate accreditation
Concurrent accreditation
```

---

# 19. DOUBLE CLICK

Hacer doble click rápido en acciones críticas.

Ejemplos:

```text
Accredit
Join
Request Speak
Open Vote
Cast Vote
Close Vote
End Assembly
```

No debe duplicar transacciones.

---

# 20. ATTENDANCE

Probar:

```text
Enter
Leave
Return
Reconnect
Multiple devices
Physical
Virtual
Hybrid
```

---

# 21. ATTENDANCE DUPLICATION

Un Owner con:

```text
Laptop
Phone
Tablet
```

continúa siendo una identidad lógica.

---

# 22. REPRESENTATION

Probar:

```text
Own unit
Represented unit
Multiple represented units
Power revoked
Conflict
Duplicate representation
```

---

# 23. COEFFICIENT

Verificar cálculo exacto.

Comparar:

```text
DB
Service
API
UI
```

---

# 24. QUORUM

Probar:

```text
0%
Below threshold
Exactly threshold
Above threshold
100%
```

---

# 25. QUORUM BOUNDARY

Especialmente:

```text
49.999...
50.000...
50.001...
```

según regla configurada.

---

# 26. DECIMAL PRECISION

No usar floating point inadecuado para coeficientes críticos.

Verificar tipos PostgreSQL/.NET.

---

# 27. QUORUM CONCURRENCY

Dos participantes entran simultáneamente.

Resultado debe ser determinístico.

---

# 28. QUORUM DROP

Durante LIVE:

un participante deja de cumplir presencia según política.

Verificar:

```text
Presence
Quorum
Operator alert
Voting implications
Audit
```

---

# 29. LOBBY

Probar:

```text
Camera allowed
Camera denied
No camera
Mic allowed
Mic denied
No mic
Bad network
Assembly not started
Assembly started
```

---

# 30. MEDIA TOKENS

Intentar:

```text
Expired token
Wrong room
Wrong assembly
Wrong tenant
Modified identity
Modified permission
```

---

# 31. MEDIA SECRET

Buscar secretos en:

```text
JS
HTML
Network response
Git
Logs
Config committed
```

Target:

```text
Provider secrets exposed = 0
```

---

# 32. VIRTUAL ROOM

Probar 8 participantes.

Verificar:

```text
Join
Audio
Video
Mute
Camera
Active speaker
Leave
Reconnect
```

---

# 33. MEDIA FAILURE

Cortar media sin cortar governance.

Assembly debe seguir operativa.

---

# 34. GOVERNANCE FAILURE

Cortar SignalR temporalmente.

Media puede seguir.

Al recuperar:

resync obligatorio.

---

# 35. TOTAL CONNECTION LOSS

Simular offline.

Después volver.

No refresh manual.

---

# 36. RECONNECT MATRIX

Probar reconexión durante:

```text
Lobby
Discussion
Speaker queue
Active intervention
Motion
Voting open
Vote confirmed
Result published
Pause
```

---

# 37. REFRESH MATRIX

F5 durante los mismos estados.

Estado debe reconstruirse desde backend.

---

# 38. TAB CLOSE

Cerrar navegador y volver.

No depender de frontend para verdad crítica.

---

# 39. MULTIPLE TABS

Mismo Owner:

```text
Tab A
Tab B
```

No duplicar:

```text
Attendance
Vote
Speaker request
Representation
```

---

# 40. START ASSEMBLY

Probar:

```text
Valid start
Double start
Unauthorized start
Start without readiness
Concurrent President/Secretary start
```

---

# 41. ASSEMBLY STATE MACHINE

Intentar transiciones inválidas.

Ejemplo:

```text
DRAFT → CLOSED
CLOSED → LIVE
LIVE → DRAFT
```

Backend debe rechazar.

---

# 42. AGENDA

Probar:

```text
First item
Next item
Last item
Complete item
Refresh
Reconnect
```

---

# 43. DOUBLE NEXT

President y Secretary presionan NEXT simultáneamente.

No saltar dos puntos.

---

# 44. TWO CURRENT ITEMS

Intentar crear estado inválido.

Target:

```text
Current agenda items > 1 = NEVER
```

---

# 45. STALE AGENDA COMMAND

UI vieja intenta modificar punto anterior.

Rechazar/resync.

---

# 46. LONG AGENDA

Probar títulos:

```text
10 chars
100 chars
250 chars
500+ chars
```

No romper UI.

---

# 47. SPEAKER REQUEST

Probar:

```text
Request
Cancel
Request again
Queue
Grant
Speak
Complete
```

---

# 48. REQUEST SPAM

Click 20 veces.

Target:

```text
Active requests per participant = 1
```

---

# 49. CONCURRENT SPEAKER REQUESTS

6 Owners solicitan simultáneamente.

Queue debe tener orden determinístico.

---

# 50. ONE ACTIVE SPEAKER

Intentar conceder palabra a dos simultáneamente.

Backend debe impedir estado inconsistente.

---

# 51. SPEAKER DISCONNECT

Active speaker pierde red.

Estado debe preservarse/controlarse correctamente.

---

# 52. SPEAKER MEDIA FAILURE

Mic falla.

No perder governance state.

---

# 53. MOTION

Probar:

```text
Create
Present
Discuss
Vote
Resolve
Withdraw if supported
```

---

# 54. MOTION XSS

Intentar:

```html
<script>alert(1)</script>
```

y payloads equivalentes.

---

# 55. MOTION LONG TEXT

Probar:

```text
100
500
1000
5000 characters
```

según límites.

---

# 56. MOTION INTEGRITY

Una Motion votada no cambia silenciosamente.

---

# 57. MOTION TRACEABILITY

Debe existir:

```text
Assembly
 ↓
Agenda
 ↓
Motion
 ↓
Voting
 ↓
Decision
```

---

# 58. VOTING — CRITICAL

Crear matriz completa.

---

# 59. VOTE ELIGIBILITY

Probar:

```text
Eligible
Not eligible
Represented
Representative
Revoked
Disconnected
Wrong tenant
Wrong assembly
```

---

# 60. VOTE ONCE

Click repetido.

Múltiples tabs.

Requests simultáneos.

Target:

```text
Duplicate accepted vote = 0
```

---

# 61. CONCURRENT VOTE

Enviar dos opciones simultáneamente para mismo voter.

Debe existir una sola verdad según reglas.

---

# 62. LATE VOTE

Enviar voto después de cierre.

Backend:

```text
REJECT
```

---

# 63. EARLY VOTE

Enviar antes de OPEN.

```text
REJECT
```

---

# 64. WRONG SESSION

Votar en otra VotingSession.

```text
REJECT
```

---

# 65. SECRET VOTE

Verificar que no se exponga selección individual.

Buscar en:

```text
UI
API
HTML
SignalR
Logs
Minutes
Evidence UI
PDF
```

---

# 66. VOTING CALCULATION

Calcular manualmente dataset conocido.

Comparar resultado exacto.

---

# 67. ROUNDING

Verificar:

```text
raw value
calculation precision
display precision
decision precision
```

Display rounding nunca debe cambiar decisión.

---

# 68. EXACT THRESHOLD

Crear resultado exactamente igual al threshold.

Verificar regla.

---

# 69. ONE VOTE MISSING

Cerrar con un participante sin votar.

Verificar comportamiento esperado.

---

# 70. ZERO VOTES

Intentar cerrar con cero votos.

Verificar regla configurada.

---

# 71. CLOSE VOTING

Probar:

```text
Authorized
Unauthorized
Double close
Concurrent close
Close + vote race
```

---

# 72. VOTE/CLOSE RACE

Un Owner vota exactamente cuando President cierra.

Backend debe producir estado consistente.

No resultado ambiguo.

---

# 73. RESULT

Comparar:

```text
DB
API
President UI
Owner UI
Projector
Evidence
Minutes
```

---

# 74. DECISION

Verificar:

```text
Rule
Threshold
Result
Decision
Timestamp
Motion
Agenda
```

---

# 75. RESULT IMMUTABILITY

Después de publicar:

no cambiar por refresh/recalculation accidental.

---

# 76. DECISION IMMUTABILITY

Igual.

---

# 77. NEXT AGENDA AFTER VOTE

Verificar continuidad.

No quedar atrapado en Voting state.

---

# 78. PROJECTOR

Probar estados:

```text
Waiting
Quorum
Agenda
Speaker
Motion
Voting
Result
Pause
Closed
```

---

# 79. PROJECTOR PRIVACY

No mostrar:

```text
private power docs
secret vote
internal audit
private contact data
```

---

# 80. PAUSE / RECESS

Si existe:

probar:

```text
Pause
Refresh
Reconnect
Resume
```

---

# 81. END ASSEMBLY

Probar:

```text
Normal close
Double close
Unauthorized close
Close while vote open
Close with unresolved state
Concurrent close
```

---

# 82. POST-CLOSE ATTACK

Después de CLOSED intentar:

```text
Accredit
Request Speak
Present Motion
Open Vote
Cast Vote
Change Agenda
```

Target:

```text
Accepted critical mutations = 0
```

---

# 83. FINAL SNAPSHOT

Verificar snapshot histórico.

---

# 84. MUTATE MASTER DATA

Después de cerrar cambiar:

```text
Owner name
Coefficient
Unit
Representation
```

La Asamblea histórica no debe reescribirse incorrectamente.

---

# 85. EVIDENCE CENTER

Verificar:

```text
Attendance
Representation
Quorum
Agenda
Speakers
Motions
Voting
Decisions
Timeline
```

---

# 86. MINUTES

Generar acta.

Comparar datos.

---

# 87. MINUTES FACT PROTECTION

Intentar modificar:

```text
Quorum
Vote result
Decision
Motion identity
```

mediante editor.

Debe respetar protección definida.

---

# 88. MINUTES VERSIONING

Probar:

```text
Generate
Edit
Save
Review
Finalize
Attempt edit after final
```

---

# 89. PRINT

Abrir Print Preview.

Inspección visual obligatoria.

---

# 90. PDF

Si soportado:

generar y abrir.

No certificar por status HTTP.

---

# 91. PDF CROSS-CHECK

Comparar:

```text
Quorum
Attendance
Motions
Voting
Decisions
Dates
```

contra DB.

---

# 92. XSS FULL MODULE

Probar inputs editables relevantes:

```text
Assembly
Agenda
Motion
Notes
Minutes narrative
Participant-visible fields
```

---

# 93. CSRF

Revisar todas las mutaciones browser-based.

Aplicar protección apropiada al stack.

---

# 94. MASS ASSIGNMENT

Revisar DTOs/binding.

Owner no debe poder modificar campos privilegiados agregándolos al request.

---

# 95. OVERPOSTING

Probar requests manipulados.

---

# 96. AUTHORIZATION MATRIX

Crear tabla:

```text
Action × Role
```

y probar server-side.

---

# 97. PRESIDENT

Probar permisos reales.

---

# 98. SECRETARY

Probar límites.

---

# 99. OWNER

Intentar acciones administrativas directamente.

---

# 100. ANONYMOUS

Intentar endpoints.

---

# 101. SECOND TENANT ATTACK

Usar sesión válida Tenant B contra IDs Tenant A.

---

# 102. SECURITY LOGGING

Eventos críticos deben quedar auditados.

---

# 103. SENSITIVE LOGGING

Buscar:

```text
passwords
tokens
secrets
secret vote selections
sensitive documents
```

No deben aparecer indebidamente.

---

# 104. SQL INJECTION

Probar inputs relevantes.

Confirmar parameterization/ORM seguro.

---

# 105. FILE SECURITY

Si poderes/documentos existen:

probar:

```text
wrong tenant
wrong assembly
anonymous
direct URL
invalid file type
oversized upload
```

según funcionalidades existentes.

---

# 106. SIGNALR ISOLATION

Tenant A no recibe eventos Tenant B.

---

# 107. ASSEMBLY GROUP ISOLATION

Assembly A1 no recibe A2.

---

# 108. PARTICIPANT-SPECIFIC EVENT

Eventos privados deben llegar únicamente al participante correcto.

---

# 109. EVENT DUPLICATION

Reconnect no debe duplicar handlers.

---

# 110. EVENT ORDER

Probar secuencias rápidas.

Frontend debe terminar consistente con backend.

---

# 111. SERVER AUTHORITY

Modificar state local desde DevTools.

No debe alterar verdad del sistema.

---

# 112. RESPONSIVE CERTIFICATION

No simplemente redimensionar una vez.

Probar flujos completos.

---

# 113. MOBILE OWNER

Ejecutar Assembly flow en:

```text
375x667
390x844
430x932
```

---

# 114. TABLET

```text
768x1024
820x1180
```

---

# 115. DESKTOP

```text
1366x768
1440x900
1920x1080
```

---

# 116. MOBILE CRITICAL FLOW

Ejecutar:

```text
Login
Lobby
Join
Agenda
Request Speak
Vote
Result
Reconnect
Minutes read
```

---

# 117. LANDSCAPE

Probar orientación.

---

# 118. OVERFLOW

Target:

```text
Critical horizontal scroll = 0
```

---

# 119. MODALS

No deben quedar fuera de viewport.

---

# 120. KEYBOARD

Probar operación crítica sin mouse.

---

# 121. ACCESSIBILITY

Auditar WCAG 2.2 AA.

---

# 122. ACCESSIBILITY TARGETS

Verificar:

```text
Keyboard
Focus
Labels
Headings
ARIA
Contrast
Status communication
Dialogs
Tables
Realtime announcements
Touch targets
```

---

# 123. FOCUS TRAPS

Dialogs/drawers deben manejar focus correctamente.

---

# 124. REALTIME FOCUS

Evento SignalR no roba focus.

---

# 125. SCREEN READER

Estados críticos comprensibles.

---

# 126. COLOR

Nunca usar solo color para:

```text
Approved
Rejected
Connected
Disconnected
Quorum reached
```

---

# 127. UX AUDIT — PRESIDENT

Sin instrucciones externas debe poder:

```text
Start
Understand state
Advance agenda
Manage speaker
Present motion
Open vote
Close vote
See result
Continue
End assembly
```

---

# 128. UX AUDIT — OWNER

Debe poder:

```text
Join
Understand current topic
Request speak
Know queue state
Speak
Vote
Confirm vote
See result
Recover connection
```

---

# 129. UX AUDIT — SECRETARY

Debe poder apoyar operación y posteriormente revisar acta.

---

# 130. NO TECHNICAL LANGUAGE

Buscar UI con términos:

```text
SignalR
WebRTC
LiveKit
HTTP 500
DbUpdateException
NullReferenceException
```

Target:

```text
Visible technical errors = 0
```

---

# 131. ERROR UX

Toda falla esperable debe responder:

```text
What happened?
What can I do?
Was my action saved?
```

---

# 132. LOADING UX

Toda acción > perceptible latency debe tener feedback apropiado.

---

# 133. DOUBLE-SUBMIT UX

Botones críticos deben evitar envío repetido sin depender solo de disabled frontend.

---

# 134. EMPTY STATES

Auditar todos.

---

# 135. SUCCESS STATES

No usar toast genérico para todo.

---

# 136. PERFORMANCE BASELINE

Medir backend endpoints críticos.

---

# 137. DATABASE QUERY AUDIT

Buscar:

```text
N+1
SELECT *
Unbounded queries
Missing indexes
Repeated queries
Client-side evaluation
```

---

# 138. EXPLAIN ANALYZE

Para queries críticas usar PostgreSQL:

```text
EXPLAIN (ANALYZE, BUFFERS)
```

en ambiente seguro de prueba.

---

# 139. INDEX REVIEW

Índices relevantes:

```text
Tenant
Assembly
Participant
Attendance
Voting
Motion
Decision
Audit
```

según queries reales.

---

# 140. NO BLIND INDEXING

No agregar índices sin demostrar beneficio.

---

# 141. 300-PARTICIPANT SYNTHETIC DATASET

Crear dataset:

```text
300 participants
300 units
representations
20 agenda items
30 motions
30 voting sessions
```

---

# 142. 300 ≠ MEDIA CERTIFICATION

P0.

Dataset 300 prueba:

```text
Database
Quorum
Voting
UI lists
Evidence
Minutes
```

No prueba videoconferencia de 300 usuarios.

---

# 143. LOAD TARGETS

Medir:

```text
Quorum calculation
Vote submission
Vote result
Participant list
Evidence generation
Minutes generation
```

---

# 144. PAGINATION / VIRTUALIZATION

Si listas grandes degradan UI:

implementar estrategia apropiada.

---

# 145. LARGE OWNER LIST

No renderizar 300 video tiles.

Eso pertenece a arquitectura media futura.

---

# 146. MEMORY

Revisar frontend durante sesión prolongada.

---

# 147. EVENT HANDLERS

Buscar duplicaciones tras reconnect.

---

# 148. DATABASE CONNECTIONS

Revisar uso correcto de DbContext/connection pooling.

---

# 149. TRANSACTIONS

Acciones críticas deben tener boundaries correctos.

---

# 150. OPTIMISTIC CONCURRENCY

Revisar operaciones críticas:

```text
Agenda
Voting
Assembly state
Speaker
Minutes
```

---

# 151. CHAOS TESTING

Introducir fallas controladas.

---

# 152. DB TEMPORARY FAILURE

Si entorno lo permite:

simular fallo.

No mostrar falsa confirmación.

---

# 153. SIGNALR TEMPORARY FAILURE

Recuperar.

---

# 154. MEDIA TEMPORARY FAILURE

Recuperar.

---

# 155. CLIENT OFFLINE

Recuperar.

---

# 156. SLOW NETWORK

Verificar feedback.

---

# 157. STALE CLIENT

Dejar browser abierto mientras otro operador avanza varios estados.

Después intentar acción antigua.

Debe resync/rechazar.

---

# 158. CLOCK DIFFERENCE

Modificar reloj cliente.

Resultados críticos no deben depender del reloj local.

---

# 159. TIMEZONE

Verificar presentación correcta de timestamps.

Persistencia UTC.

---

# 160. TEST AUTOMATION

Crear/fortalecer suite:

```text
Unit
Integration
Functional
Playwright E2E
Security regression
Concurrency regression
```

---

# 161. PLAYWRIGHT

Obligatorio para flujo crítico.

---

# 162. BROWSER TAB CERTIFICATION

Además de automatización:

# USAR BROWSER/TAB REAL.

No aceptar exclusivamente headless.

---

# 163. VISUAL INSPECTION

Abrir cada vista principal.

Inspeccionar:

```text
Alignment
Spacing
Typography
Hierarchy
Overflow
Responsive
Disabled states
Loading
Error
Success
Realtime transitions
```

---

# 164. SCREENSHOT EVIDENCE

Capturar evidencia de estados principales.

---

# 165. CONSOLE

En cada flujo:

```text
Unexpected console errors = 0
Unhandled Promise Rejections = 0
```

---

# 166. NETWORK

```text
Unexpected 404 = 0
Unexpected 500 = 0
```

---

# 167. AUTOMATIC REMEDIATION LOOP

Cursor NO debe detenerse en primer FAIL.

Usar:

```text
TEST
 ↓
FAIL
 ↓
ROOT CAUSE
 ↓
FIX
 ↓
BUILD
 ↓
TARGETED TEST
 ↓
FULL REGRESSION
```

continuamente.

---

# 168. REGRESSION RULE

Corregir Voting obliga a revalidar:

```text
Quorum
Motion
Decision
Evidence
Minutes
```

cuando dependan de él.

---

# 169. BUILD GATE

Después de cada lote:

```text
dotnet build
```

Debe quedar:

```text
0 errors
```

Warnings nuevos relevantes deben analizarse.

---

# 170. DATABASE MIGRATION GATE

Si hay cambios:

```text
Migration applies
Rollback strategy documented
Fresh DB works
Existing DB upgrade works
```

---

# 171. NO DESTRUCTIVE MIGRATION

Sin justificación y estrategia.

---

# 172. HUMAN PILOT

Después de suite técnica:

# EJECUTAR ASAMBLEA REAL CON 8 PERSONAS.

---

# 173. HUMAN PILOT RULE

El desarrollador no explica qué botón tocar.

Solo:

```text
Aquí está su usuario.
Realicen la Asamblea.
```

---

# 174. OBSERVE

Registrar:

```text
Confusion
Misclicks
Questions
Delays
Errors
Unexpected behavior
```

---

# 175. UX DEFECT

Si múltiples personas preguntan cómo hacer una acción esencial:

tratarlo como defecto UX.

---

# 176. PILOT SCENARIO

```text
8 users
 ↓
Accreditation
 ↓
Quorum
 ↓
Virtual join
 ↓
Start
 ↓
3+ agenda items
 ↓
3 speaker requests
 ↓
2+ motions
 ↓
2+ votes
 ↓
1 disconnect/reconnect
 ↓
1 temporary media problem
 ↓
Final agenda
 ↓
Close
 ↓
Evidence
 ↓
Minutes
```

---

# 177. PILOT RESULT

Registrar:

```text
PASS
FAIL
OBSERVATION
UX ISSUE
TECHNICAL ISSUE
```

---

# 178. NO MANUAL DB FIX

Durante piloto:

```text
SQL manual fix = FAILURE
```

---

# 179. NO DEVTOOLS FIX

```text
Developer Console fix = FAILURE
```

---

# 180. NO REFRESH FIX

Si refresh es necesario para recuperar estado normal:

investigar como defecto.

---

# 181. NO EXTERNAL TOOLS

Para operación de Asamblea no usar:

```text
Excel
WhatsApp
Paper
Manual calculator
External vote tool
External video app
```

---

# 182. DATA CROSS-CHECK

Después del piloto:

comparar:

```text
Attendance
Representation
Quorum
Agenda
Motions
Votes
Results
Decisions
Timeline
Minutes
```

contra DB.

---

# 183. TEST EVIDENCE STRUCTURE

Crear:

```text
docs/AUDIT/EO-010/EVIDENCE/
```

organizado por:

```text
AUTH
ATTENDANCE
QUORUM
MEDIA
AGENDA
SPEAKER
MOTIONS
VOTING
DECISIONS
CLOSURE
MINUTES
SECURITY
RESPONSIVE
PERFORMANCE
```

---

# 184. DEFECT REGISTER

Crear:

```text
docs/AUDIT/EO-010/DEFECT-REGISTER.md
```

Campos:

```text
ID
Severity
Area
Steps
Expected
Actual
Root Cause
Fix
Regression Test
Status
Evidence
```

---

# 185. SEVERITY

Usar:

```text
P0
P1
P2
P3
```

---

# 186. P0 EXAMPLES

```text
Cross-tenant leakage
Wrong vote result
Duplicate vote
Wrong quorum
Secret vote exposure
Unauthorized critical action
Lost confirmed vote
Evidence corruption
```

---

# 187. P1 EXAMPLES

```text
Reconnect failure
Broken critical mobile flow
Speaker queue corruption
Incorrect decision display
Critical accessibility blocker
```

---

# 188. CERTIFICATION BLOCKERS

```text
P0 open > 0 → FAIL
P1 open > 0 → FAIL
```

---

# 189. P2/P3

Pueden quedar únicamente si:

```text
Documented
Non-critical
Accepted explicitly
No integrity/security impact
```

No esconderlos.

---

# 190. CERTIFICATION REPORT

Crear:

```text
docs/AUDIT/EO-010/
EO-010-FINAL-CERTIFICATION.md
```

---

# 191. REPORT MUST INCLUDE

```text
Executive Summary
Scope
Environment
Commit SHA
Database version
Browser versions
Test accounts
Test inventory
Tests planned
Tests executed
PASS
FAIL
BLOCKED
NOT EXECUTED
P0/P1/P2/P3
Security results
Multi-tenant results
Realtime results
Concurrency results
Responsive results
Accessibility results
Performance results
Human pilot results
Known limitations
Final verdict
```

---

# 192. CERTIFICATION MATRIX

Como mínimo:

```text
Authentication
Authorization
Tenant Isolation
Assembly Isolation
Accreditation
Attendance
Representation
Powers
Quorum
Lobby
Media
Reconnect
Hybrid
Agenda
Speaker Requests
Speaker Queue
Active Speaker
Motions
Voting
Vote Integrity
Secret Voting
Results
Decisions
Projector
Closure
Evidence
Timeline
Minutes
PDF/Print
Audit
SignalR
Concurrency
IDOR
XSS
CSRF
Responsive
Accessibility
Performance
Database
8-User Pilot
300 Synthetic Dataset
```

---

# 193. STATUS VALUES

Solo:

```text
PASS
FAIL
BLOCKED
NOT EXECUTED
MANUAL ACCEPTANCE REQUIRED
```

---

# 194. ABSOLUTE ZERO-TOLERANCE

Antes de certificar:

```text
Wrong quorum                         0
Wrong voting result                  0
Duplicate accepted votes             0
Cross-tenant data leakage            0
Cross-assembly leakage               0
Secret vote leakage                  0
Unauthorized critical commands       0
Lost confirmed votes                 0
Two current agenda items             0
Two active official speakers         0
Duplicate active speaker requests    0
Historical evidence corruption       0
Post-close critical mutations        0
Unhandled critical JS errors         0
Unexpected critical 500s             0
Dead critical controls               0
```

---

# 195. DO NOT GAME THE METRICS

No aumentar número de tests con asserts triviales.

Queremos:

# RISK COVERAGE.

No:

# TEST COUNT THEATER.

---

# 196. FINAL MASTER E2E

La última prueba debe ejecutarse DESPUÉS de todas las correcciones.

Desde estado limpio:

```text
CREATE/RESET TEST ASSEMBLY
 ↓
LOGIN 8 USERS
 ↓
ACCREDIT
 ↓
VERIFY REPRESENTATION
 ↓
VERIFY QUORUM
 ↓
LOBBY
 ↓
JOIN VIRTUAL ROOM
 ↓
START
 ↓
AGENDA
 ↓
REQUEST SPEAK
 ↓
GRANT SPEAK
 ↓
END SPEAK
 ↓
MOTION
 ↓
OPEN VOTE
 ↓
CAST VOTES
 ↓
CLOSE
 ↓
RESULT
 ↓
DECISION
 ↓
NEXT AGENDA
 ↓
SECOND MOTION
 ↓
SECOND VOTE
 ↓
DISCONNECT OWNER
 ↓
RECONNECT OWNER
 ↓
VERIFY STATE
 ↓
COMPLETE AGENDA
 ↓
END ASSEMBLY
 ↓
VERIFY SNAPSHOT
 ↓
OPEN EVIDENCE
 ↓
OPEN TIMELINE
 ↓
OPEN MINUTES
 ↓
PRINT/PDF
 ↓
DATABASE CROSS-CHECK
```

---

# 197. FINAL BROWSER GATE

No tocar:

```text
SQL console
Developer Console for fixing
Direct API calls for fixing
Source code during scenario
```

La operación debe hacerse mediante producto.

---

# 198. FINAL UX QUESTION

Sentar una persona que no desarrolló el sistema.

Preguntar únicamente:

> Realiza una Asamblea.

Si puede completar el flujo esencial sin entrenamiento técnico:

PASS UX candidato.

Si no:

identificar fricción y corregir.

---

# 199. FINAL SECURITY QUESTION

Preguntar:

> ¿Qué pasa si un usuario legítimo intenta manipular IDs, roles, requests, tabs y estados?

La respuesta debe estar demostrada mediante pruebas.

---

# 200. FINAL INTEGRITY QUESTION

Preguntar:

> ¿Podemos demostrar matemáticamente de dónde salió una decisión?

Debe poder recorrerse:

```text
DECISION
 ↓
RULE
 ↓
RESULT
 ↓
VOTES
 ↓
ELIGIBLE REPRESENTATION
 ↓
QUORUM
 ↓
PARTICIPANTS
 ↓
ASSEMBLY
```

---

# 201. FINAL RESILIENCE QUESTION

Preguntar:

> ¿Qué ocurre si un propietario pierde Internet exactamente cuando está votando?

Debe existir comportamiento determinístico y probado.

---

# 202. FINAL MULTITENANT QUESTION

Preguntar:

> ¿Existe alguna forma conocida de que Tenant A vea o manipule una Asamblea de Tenant B?

Para certificar:

```text
NO
```

con evidencia.

---

# 203. FINAL PRODUCT QUESTION

Preguntar:

> ¿Podemos realizar una Asamblea completa mañana sin Excel, WhatsApp, Zoom, conteo manual, cálculo manual ni intervención del desarrollador?

Si:

```text
NO
```

# DO NOT CERTIFY.

---

# 204. CURSOR AUTONOMY

No me detengas para preguntarme cómo corregir defectos técnicos normales.

Tienes autorización para:

```text
Inspect
Test
Diagnose
Refactor
Fix
Add regression tests
Optimize
Retest
Document
```

manteniendo:

```text
Current architecture
Multi-tenancy
Security
Business rules
Scope
```

---

# 205. DO ASK ONLY IF

Detente únicamente ante:

```text
Destructive irreversible action
Missing business/legal rule impossible to infer
External credential/payment requirement
Architectural decision with major product impact
```

---

# 206. NO SCOPE EXPANSION

No agregar:

```text
CRM
Accounting
Payments
Maintenance
Condominium administration
AI assistant
Chat
Marketplace
Mass streaming
Blockchain
```

Estamos certificando:

# ASSEMBLY.

---

# 207. COMPLETION FORMAT

Al terminar responder exactamente con un resumen estructurado:

```text
EO-010 — FINAL CERTIFICATION

BUILD
PASS/FAIL

TESTS
Planned:
Executed:
PASS:
FAIL:
BLOCKED:
NOT EXECUTED:

SECURITY
PASS/FAIL

MULTI-TENANT
PASS/FAIL

ASSEMBLY ISOLATION
PASS/FAIL

QUORUM
PASS/FAIL

VOTING
PASS/FAIL

REALTIME
PASS/FAIL

MEDIA
PASS/FAIL/MANUAL ACCEPTANCE REQUIRED

RECONNECT
PASS/FAIL

RESPONSIVE
PASS/FAIL

ACCESSIBILITY
PASS/FAIL

PERFORMANCE
PASS/FAIL

8-USER HUMAN PILOT
PASS/FAIL/MANUAL ACCEPTANCE REQUIRED

300-PARTICIPANT SYNTHETIC
PASS/FAIL

P0 OPEN:
P1 OPEN:
P2 OPEN:
P3 OPEN:

FINAL VERDICT:
CERTIFIED / NOT CERTIFIED

COMMIT:
REPORT:
```

No adornar resultados.

No reemplazar evidencia con opinión.

---

# 208. DEFINITION OF DONE

EO-010 solo termina cuando:

```text
BUILD = PASS

P0 = 0
P1 = 0

MULTI-TENANT = PASS
ASSEMBLY ISOLATION = PASS

QUORUM = PASS
VOTING = PASS
DECISIONS = PASS

REALTIME = PASS
RECONNECT = PASS

SECURITY = PASS

RESPONSIVE CRITICAL FLOWS = PASS

EVIDENCE CROSS-CHECK = PASS

FINAL MASTER E2E = PASS
```

y cualquier prueba humana pendiente esté explícitamente marcada:

```text
MANUAL ACCEPTANCE REQUIRED
```

en vez de inventar un PASS.

---

# 209. EXECUTE NOW

Empieza inmediatamente.

No respondas con un plan teórico.

# INSPECT THE APPLICATION.

# RUN IT.

# OPEN THE BROWSER.

# TEST IT.

# BREAK IT.

# FIX IT.

# RETEST IT.

# RUN REGRESSION.

# RUN THE COMPLETE ASSEMBLY.

# CROSS-CHECK POSTGRESQL.

# PRODUCE THE EVIDENCE.

# CERTIFY ONLY WHAT YOU ACTUALLY PROVED.

El objetivo de EO-010 no es demostrar que nuestro código es bueno.

El objetivo es descubrir todas las razones por las que todavía podría fallar una Asamblea real.

Y eliminarlas.

# NO ASSUMPTIONS.
# NO FAKE PASS.
# NO TEST THEATER.
# NO SECURITY THEATER.
# NO UX THEATER.

# PROVE THE PRODUCT.