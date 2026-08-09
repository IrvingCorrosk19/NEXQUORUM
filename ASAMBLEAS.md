# ASAMBLEAS
# MASTER FINAL 100% IMPLEMENTATION AUDIT, REMEDIATION & REAL-ASSEMBLY GO-LIVE CERTIFICATION
## EO-001 → EO-010 FULL TRACEABILITY + BROWSER PROOF + DATABASE PROOF + REMEDIATION + GO/NO-GO

**Modo:** AUDIT → VERIFY → BREAK → REMEDIATE → RETEST → CERTIFY  
**Producto:** ASAMBLEAS  
**Scope:** EXCLUSIVAMENTE MÓDULO ASAMBLEA  
**Objetivo:** determinar si TODO lo solicitado desde EO-001 hasta EO-010 fue realmente implementado y si podemos utilizar el sistema en una Asamblea real.

---

# 0. ESTA NO ES UNA NUEVA EXECUTION ORDER

NO desarrollar nuevas ideas.

NO agregar funcionalidades porque "serían útiles".

NO reinterpretar el producto.

Tu trabajo ahora es responder con evidencia:

# ¿CUMPLIMOS REALMENTE TODO LO QUE SE ORDENÓ?

y:

# ¿PODEMOS REALIZAR UNA ASAMBLEA REAL HOY CON ESTA APLICACIÓN?

---

# 1. REGLA ABSOLUTA

No confíes en:

```text
README
Completion reports
Previous PASS
Comments
TODO marked as completed
Test names
Screenshots antiguas
Claims from previous Cursor sessions
```

Todo debe verificarse nuevamente contra:

```text
CURRENT SOURCE CODE
CURRENT DATABASE
CURRENT MIGRATIONS
CURRENT APPLICATION
CURRENT BROWSER EXPERIENCE
CURRENT TEST SUITE
CURRENT RUNTIME
```

---

# 2. RECONSTRUIR TODOS LOS REQUISITOS

Antes de tocar código:

buscar TODOS los documentos relacionados con:

```text
EO-001
EO-002
EO-003
EO-004
EO-005
EO-006
EO-007
EO-008
EO-009
EO-010
```

incluyendo:

```text
prompts
audit documents
completion reports
requirements
ADRs
test reports
screenshots/evidence
known limitations
```

---

# 3. CREAR MASTER REQUIREMENTS TRACEABILITY MATRIX

Crear:

```text
docs/AUDIT/FINAL-CERTIFICATION/
MASTER-REQUIREMENTS-TRACEABILITY.md
```

Cada requisito debe tener:

```text
Requirement ID
Source EO
Requirement
Expected Behavior
Implementation Location
Database Dependency
API/Endpoint
UI Location
Role
Automated Test
Browser Test
Evidence
Status
```

Status permitido:

```text
PASS
PARTIAL
FAIL
MISSING
BLOCKED
NOT TESTED
NOT APPLICABLE
```

---

# 4. PROHIBIDO AGRUPAR PARA OCULTAR GAPS

No escribir:

```text
EO-006 = PASS
```

sin comprobar sus requisitos individuales.

Quiero trazabilidad granular.

---

# 5. CODE TRUTH AUDIT

Buscar globalmente:

```text
TODO
FIXME
HACK
TEMP
TEMPORARY
MOCK
FAKE
STUB
PLACEHOLDER
HARDCODED
NOT IMPLEMENTED
NotImplementedException
throw new Exception
```

Clasificar cada resultado.

---

# 6. FRONTEND TRUTH AUDIT

Buscar:

```text
fake data
mock data
hardcoded percentages
hardcoded quorum
hardcoded votes
hardcoded participants
hardcoded assembly states
fake timers
fake realtime
fake success
```

---

# 7. DEAD UI AUDIT

Recorrer TODAS las vistas de Assembly.

Todo:

```text
Button
Menu
Tab
Link
Dropdown
Modal
Drawer
Form
Action
```

debe funcionar.

Target:

```text
Dead controls = 0
```

---

# 8. ROUTE AUDIT

Enumerar rutas/endpoints del módulo.

Verificar:

```text
Authentication
Authorization
Tenant
Assembly
State
Validation
Error handling
```

---

# 9. DATABASE AUDIT

Inspeccionar PostgreSQL.

Verificar:

```text
Schema
Tables
Foreign Keys
Unique Constraints
Indexes
TenantId
AssemblyId
Relationships
Historical snapshots
Concurrency protections
Audit
```

---

# 10. MIGRATION AUDIT

Desde DB limpia:

```text
apply migrations
seed minimum test data
start application
```

Debe funcionar.

También verificar upgrade sobre DB existente cuando sea aplicable.

---

# 11. TENANT ISOLATION AUDIT

Crear:

```text
TENANT A
TENANT B
```

Ambos con datos reales.

Intentar acceso cruzado en:

```text
PH
Assemblies
Participants
Units
Powers
Attendance
Quorum
Agenda
Motions
Votes
Decisions
Evidence
Minutes
Documents
```

Target:

```text
Cross-tenant leakage = 0
```

---

# 12. ASSEMBLY ISOLATION

Dentro del mismo Tenant:

```text
ASSEMBLY A
ASSEMBLY B
```

No mezclar:

```text
Participants
Quorum
Agenda
Motions
Speaker queue
Voting
SignalR
Decisions
Evidence
```

---

# 13. ROLE MATRIX

Verificar al menos:

```text
President
Secretary
Owner
Unauthorized User
```

contra cada acción crítica.

No basta ocultar botones.

Probar backend.

---

# 14. REAL PILOT DATASET

Preparar una Asamblea determinística con:

```text
1 President
1 Secretary
6 Owners
```

Total:

```text
8 participants
```

Asignar unidades y coeficientes conocidos.

---

# 15. CALCULATE EXPECTED RESULTS FIRST

Antes de ejecutar:

calcular manualmente:

```text
Expected attendance
Expected represented coefficient
Expected quorum
Expected voting eligibility
Expected voting results
Expected decisions
```

Guardar:

```text
EXPECTED-RESULTS.md
```

Así evitamos aceptar resultados simplemente porque "parecen correctos".

---

# 16. MASTER REAL-ASSEMBLY TEST

Ahora realizar la Asamblea ENTERA desde Browser.

No APIs manuales para completar el flujo.

No SQL para corregir datos.

No DevTools para arreglar estado.

---

# 17. LOGIN

Abrir sesiones independientes para:

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

# 18. ACCREDITATION

Ejecutar acreditación real.

Verificar:

```text
identity
unit
representation
power
coefficient
status
```

---

# 19. ATTENDANCE

Registrar entrada.

Comparar Browser/API/DB.

---

# 20. QUORUM

Comprobar matemáticamente.

No aceptar:

```text
"UI shows 72.84%"
```

como prueba suficiente.

Reconstruir exactamente:

```text
participants
units
representation
coefficients
formula
result
```

---

# 21. QUORUM BOUNDARIES

Probar:

```text
Below threshold
Exactly threshold
Above threshold
```

---

# 22. LOBBY

Cada participante debe poder llegar a Lobby.

Verificar:

```text
identity
assembly
accreditation
camera
microphone
connection
join
```

---

# 23. VIDEO CONFERENCE

Con 8 usuarios:

probar realmente:

```text
Join
Audio
Video
Mute
Unmute
Camera
Participant visibility
Leave
Rejoin
```

Si no se puede hacer prueba física completa:

marcar:

```text
MANUAL ACCEPTANCE REQUIRED
```

NO inventar PASS.

---

# 24. START ASSEMBLY

President inicia.

Verificar:

```text
state
timestamp
audit
SignalR
all browsers
```

---

# 25. AGENDA

Recorrer varios puntos.

Todos los browsers deben sincronizarse sin refresh.

---

# 26. SPEAKER QUEUE

Ejecutar:

```text
Owner03 request
Owner05 request
Owner01 request
```

Verificar orden.

---

# 27. DUPLICATE REQUEST

Owner03 presiona varias veces.

Debe existir:

```text
ONE ACTIVE REQUEST
```

---

# 28. GRANT SPEAKER

President concede palabra.

Verificar:

```text
governance state
owner UI
president UI
secretary UI
projector
media integration
```

---

# 29. COMPLETE SPEAKER

Finalizar.

Queue debe continuar correctamente.

---

# 30. MOTION

Crear Motion real.

Ejemplo:

```text
Aprobar presupuesto extraordinario.
```

Verificar propagación.

---

# 31. VOTING

Abrir votación.

Cada Owner autorizado vota desde su propia sesión.

---

# 32. VOTE CONFIRMATION

Cada usuario debe conocer:

```text
Vote received
```

sin revelar información indebida.

---

# 33. DUPLICATE VOTE ATTACK

Intentar:

```text
double click
refresh
multiple tabs
repeated request
```

Target:

```text
Accepted duplicate votes = 0
```

---

# 34. CLOSE VOTE

President cierra.

---

# 35. CALCULATE RESULT INDEPENDENTLY

No confiar en sistema.

Calcular resultado desde dataset esperado.

Comparar con:

```text
DB
API
President UI
Owner UI
Projector
```

---

# 36. DECISION

Verificar:

```text
Motion
Rule
Threshold
Result
Decision
Timestamp
```

---

# 37. SECOND VOTING SCENARIO

Realizar otra Motion con resultado diferente.

Ejemplo:

```text
REJECTED
```

para demostrar ambos caminos.

---

# 38. EXACT THRESHOLD SCENARIO

Crear prueba de boundary.

---

# 39. SECRET VOTE

Si soportado:

ejecutarlo.

Después buscar mapping individual en:

```text
UI
API
SignalR
Logs
Evidence
Minutes
PDF
```

No debe filtrarse.

---

# 40. CONNECTION LOSS

Durante Asamblea:

desconectar Owner04.

---

# 41. RECONNECT

Reconectar.

Verificar:

```text
Agenda
Motion
Quorum
Vote state
Speaker state
Attendance
```

---

# 42. DISCONNECT DURING VOTING

Repetir específicamente durante voto.

Confirmar que:

```text
confirmed vote is not lost
```

---

# 43. REFRESH TEST

F5 en varios estados.

No corrupción.

---

# 44. MULTI-TAB

Abrir dos tabs del mismo Owner.

No duplicar:

```text
presence
vote
speaker request
coefficient
```

---

# 45. HYBRID TEST

Si soportado:

combinar participantes:

```text
physical
virtual
```

Verificar:

```text
ONE QUORUM
ONE VOTING ENGINE
NO DOUBLE COUNT
```

---

# 46. COMPLETE AGENDA

Recorrer puntos restantes.

---

# 47. END ASSEMBLY

President finaliza.

Verificar pre-close.

---

# 48. POST-CLOSE ATTACK

Intentar después:

```text
Check-in
Change agenda
Request speak
Present motion
Open vote
Cast vote
```

Backend debe rechazar.

---

# 49. EVIDENCE CENTER

Abrir expediente.

Debe reconstruir:

```text
Attendance
Representation
Quorum
Agenda
Interventions
Motions
Voting
Decisions
Timeline
```

---

# 50. MINUTES

Generar acta.

---

# 51. MINUTES CROSS-CHECK

Comparar:

```text
Attendance
Quorum
Motion
Voting Result
Decision
Times
```

contra PostgreSQL.

---

# 52. HISTORICAL IMMUTABILITY

Después de cerrar:

modificar datos maestros de prueba.

Ejemplo:

```text
Owner name
Unit
Coefficient
```

El expediente histórico no debe cambiar incorrectamente.

---

# 53. PRINT

Abrir Browser Print Preview.

Inspección visual.

---

# 54. PDF

Si soportado:

generar.

Abrir archivo.

Inspeccionarlo.

Comparar datos.

---

# 55. MOBILE TEST

Ejecutar flujo crítico Owner en:

```text
375x667
390x844
430x932
```

No simplemente screenshot.

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
```

---

# 56. TABLET

Probar:

```text
768x1024
820x1180
```

---

# 57. DESKTOP

Probar:

```text
1366x768
1440x900
1920x1080
```

---

# 58. ACCESSIBILITY

Revalidar WCAG 2.2 AA.

Especialmente:

```text
Keyboard
Focus
Dialogs
ARIA
Labels
Realtime status
Voting
Speaker request
Touch targets
```

---

# 59. JAVASCRIPT CONSOLE

Durante MASTER E2E:

```text
Unexpected console errors = 0
Unhandled Promise Rejections = 0
```

---

# 60. NETWORK

```text
Unexpected 404 = 0
Unexpected 500 = 0
```

---

# 61. SECURITY ADVERSARIAL TEST

Intentar manipular:

```text
TenantId
AssemblyId
ParticipantId
PowerId
AgendaItemId
MotionId
VotingSessionId
DecisionId
MinutesId
```

---

# 62. OWNER PRIVILEGE ESCALATION

Owner intenta:

```text
Start Assembly
Advance Agenda
Grant Speaker
Open Vote
Close Vote
End Assembly
```

usando requests directos.

Target:

```text
Successful unauthorized operations = 0
```

---

# 63. PRESIDENT CROSS-TENANT ATTACK

Incluso President Tenant A no controla Tenant B.

---

# 64. XSS

Probar inputs relevantes.

---

# 65. CSRF

Verificar mutaciones.

---

# 66. OVERPOSTING

Manipular payloads.

---

# 67. SQL INJECTION

Revalidar inputs relevantes.

---

# 68. TOKEN SECURITY

Buscar:

```text
LiveKit secret
API secrets
JWT signing secrets
passwords
connection credentials
```

en frontend/logs/repository cuando corresponda.

---

# 69. SIGNALR SECURITY

Verificar:

```text
Tenant groups
Assembly groups
Participant-specific events
```

---

# 70. CONCURRENCY

Ejecutar simultáneamente:

```text
2 check-ins
6 speaker requests
2 agenda transitions
2 vote submissions same user
vote + close race
2 assembly close attempts
```

---

# 71. DATABASE CONSTRAINTS

No confiar únicamente en application service.

Revisar constraints donde sean apropiados.

---

# 72. PERFORMANCE

No necesitamos aún afirmar 300 videos simultáneos.

Pero sí probar dataset sintético:

```text
300 participants
300 units
20 agenda items
30 motions
30 voting sessions
```

---

# 73. 300-PARTICIPANT TEST

Probar:

```text
Participant loading
Quorum
Voting calculation
Results
Evidence
Minutes
Search/filter if applicable
```

---

# 74. DATABASE PERFORMANCE

Buscar:

```text
N+1
Unbounded queries
Missing indexes
Repeated DB calls
```

---

# 75. EXPLAIN ANALYZE

Usar en queries críticas.

No agregar índices ciegamente.

---

# 76. LONG-RUN TEST

Mantener Asamblea activa un tiempo razonable.

Buscar:

```text
memory growth
duplicated SignalR handlers
duplicated media tracks
timer drift
stale state
```

---

# 77. FAILURE RECOVERY

Simular:

```text
Network temporary failure
SignalR disconnect
Media disconnect
Slow request
```

No destruir estado.

---

# 78. UX PRESIDENT TEST

El President debe poder responder siempre:

```text
Where are we?
What are we discussing?
Who has the floor?
What motion is active?
Are we voting?
What was decided?
What can I do next?
```

---

# 79. UX OWNER TEST

Owner debe saber:

```text
Am I in the Assembly?
What is happening?
Can I speak?
What is my queue position?
Do I need to vote?
Was my vote accepted?
What was the result?
```

---

# 80. UX SECRETARY TEST

Secretary debe poder apoyar y después revisar el expediente sin necesitar Excel/Word manual para reconstruir la Asamblea.

---

# 81. HUMAN PILOT GATE

La certificación definitiva requiere:

# 8-PERSON HUMAN PILOT.

Si no puedes ejecutarlo físicamente:

NO inventes.

Reportar:

```text
TECHNICAL CERTIFICATION = ...
HUMAN PILOT = MANUAL ACCEPTANCE REQUIRED
```

---

# 82. CRITICAL REMEDIATION RULE

Aquí está la diferencia fundamental:

# SI ENCUENTRAS ALGO INCOMPLETO, NO TERMINES EL INFORME TODAVÍA.

Primero intenta corregirlo.

---

# 83. REMEDIATION LOOP

Para cada:

```text
PARTIAL
FAIL
MISSING
```

ejecutar:

```text
REPRODUCE
 ↓
ROOT CAUSE
 ↓
IMPLEMENT/FIX
 ↓
BUILD
 ↓
TARGETED TEST
 ↓
REGRESSION
 ↓
BROWSER TEST
 ↓
UPDATE TRACEABILITY
```

---

# 84. DO NOT ASK FOR NORMAL FIXES

No preguntarme:

```text
"¿Quieres que corrija esto?"
```

Corrígelo.

---

# 85. STOP CONDITIONS

Solo detenerse por:

```text
Missing external credentials
Missing legal/business rule impossible to infer
Irreversible destructive operation
External infrastructure unavailable
Human physical test requirement
```

---

# 86. BUILD GATE

Final:

```text
dotnet build
```

Debe quedar:

```text
ERRORS = 0
```

---

# 87. TEST GATE

Ejecutar:

```text
Unit
Integration
Functional
Security regression
Playwright
Browser E2E
```

---

# 88. TEST ACCOUNTING

Quiero números REALES:

```text
Planned
Executed
Passed
Failed
Blocked
Skipped
Not Executed
```

No ocultar skipped.

---

# 89. REQUIREMENTS ACCOUNTING

También:

```text
Total requirements
PASS
PARTIAL
FAIL
MISSING
BLOCKED
NOT TESTED
```

---

# 90. ZERO-TOLERANCE

Para GO:

```text
P0 open = 0
P1 open = 0

Wrong quorum = 0
Wrong decisions = 0
Duplicate accepted votes = 0
Lost confirmed votes = 0
Cross-tenant leakage = 0
Cross-assembly leakage = 0
Secret vote leakage = 0
Unauthorized critical mutations = 0
Historical corruption = 0
Dead critical controls = 0
Unexpected critical 500 = 0
```

---

# 91. REQUIREMENT COMPLETION

Para decir:

```text
100% IMPLEMENTED
```

debe cumplirse:

```text
PASS requirements = 100%
PARTIAL = 0
FAIL = 0
MISSING = 0
BLOCKED = 0
NOT TESTED = 0
```

excepto requerimientos explícitamente:

```text
NOT APPLICABLE
```

con justificación.

---

# 92. IMPORTANT DISTINCTION

Separar:

```text
IMPLEMENTATION COMPLETENESS
```

de:

```text
GO-LIVE READINESS
```

Podemos tener:

```text
Implementation 100%
```

pero:

```text
Human media test pending
```

Entonces no inventar certificación humana.

---

# 93. GO/NO-GO LEVELS

Solo tres posibles:

```text
GO
CONDITIONAL GO
NO-GO
```

---

# 94. GO

Solo si:

```text
P0 = 0
P1 = 0
Core E2E PASS
Security PASS
Multi-Tenant PASS
Quorum PASS
Voting PASS
Evidence PASS
Reconnect PASS
Critical UX PASS
```

y pruebas humanas requeridas completadas.

---

# 95. CONDITIONAL GO

Solo para piloto controlado cuando:

```text
Technical core PASS
P0 = 0
P1 = 0
```

pero queda algo como:

```text
Human media validation
Browser/device validation
Operational acceptance
```

sin comprometer integridad.

---

# 96. NO-GO

Cualquier problema en:

```text
Quorum integrity
Voting integrity
Tenant isolation
Authorization
Evidence integrity
Critical reconnect
Critical assembly flow
```

implica:

# NO-GO.

---

# 97. FINAL MASTER DEMO

Después de TODAS las correcciones:

crear una Asamblea nueva desde cero.

Ejecutar nuevamente:

```text
LOGIN
 ↓
ACCREDITATION
 ↓
ATTENDANCE
 ↓
QUORUM
 ↓
LOBBY
 ↓
JOIN
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
RESULT
 ↓
DECISION
 ↓
RECONNECT
 ↓
CONTINUE
 ↓
CLOSE
 ↓
EVIDENCE
 ↓
MINUTES
```

Esta ejecución debe ser limpia.

---

# 98. FINAL DATABASE CROSS-CHECK

Después:

seleccionar aleatoriamente:

```text
3 participants
3 representations
2 quorum snapshots
2 motions
2 votes/results
2 decisions
```

Comparar contra UI.

---

# 99. FINAL SCREENSHOT EVIDENCE

Capturar estados principales.

No screenshots únicamente de páginas vacías.

---

# 100. FINAL REPORT

Crear:

```text
docs/AUDIT/FINAL-CERTIFICATION/
ASAMBLEAS-FINAL-GO-LIVE-CERTIFICATION.md
```

---

# 101. FINAL RESPONSE FORMAT

Al terminar, responder exactamente:

```text
ASAMBLEAS — FINAL GO-LIVE CERTIFICATION

IMPLEMENTATION COMPLETENESS
XX.XX%

TOTAL REQUIREMENTS:
PASS:
PARTIAL:
FAIL:
MISSING:
BLOCKED:
NOT TESTED:
NOT APPLICABLE:

BUILD
PASS / FAIL

UNIT TESTS
PASS / FAIL

INTEGRATION TESTS
PASS / FAIL

FUNCTIONAL TESTS
PASS / FAIL

BROWSER E2E
PASS / FAIL

SECURITY
PASS / FAIL

MULTI-TENANT
PASS / FAIL

ASSEMBLY ISOLATION
PASS / FAIL

ATTENDANCE
PASS / FAIL

REPRESENTATION
PASS / FAIL

QUORUM
PASS / FAIL

AGENDA
PASS / FAIL

SPEAKER MANAGEMENT
PASS / FAIL

MOTIONS
PASS / FAIL

VOTING
PASS / FAIL

DECISIONS
PASS / FAIL

REALTIME
PASS / FAIL

VIDEO CONFERENCE
PASS / FAIL / MANUAL ACCEPTANCE REQUIRED

RECONNECT
PASS / FAIL

HYBRID
PASS / FAIL

CLOSURE
PASS / FAIL

EVIDENCE
PASS / FAIL

MINUTES
PASS / FAIL

PRINT/PDF
PASS / FAIL

RESPONSIVE
PASS / FAIL

ACCESSIBILITY
PASS / FAIL

PERFORMANCE
PASS / FAIL

300-PARTICIPANT SYNTHETIC
PASS / FAIL

8-PERSON HUMAN PILOT
PASS / FAIL / MANUAL ACCEPTANCE REQUIRED

P0 OPEN:
P1 OPEN:
P2 OPEN:
P3 OPEN:

REMEDIATIONS PERFORMED:
<number>

REMAINING LIMITATIONS:
<list>

FINAL VERDICT:
GO / CONDITIONAL GO / NO-GO

CAN WE RUN A REAL ASSEMBLY TODAY?
YES / YES, CONTROLLED PILOT / NO

WHY:
<maximum 10 concrete lines>

NEXT REQUIRED ACTION:
<only if necessary>

COMMIT:
<sha>

REPORT:
<path>
```

---

# 102. DO NOT GIVE ME MARKETING

No quiero:

```text
"The platform is robust."
"The architecture is enterprise."
"The system appears ready."
```

Quiero:

```text
PROVED
NOT PROVED
PASS
FAIL
```

---

# 103. DO NOT GIVE ME 99% WITHOUT EXPLANATION

Si resultado:

```text
99.2%
```

listar exactamente el 0.8% pendiente.

---

# 104. DO NOT CALL 100% IF HUMAN TEST IS MISSING

Puedes decir:

```text
TECHNICAL IMPLEMENTATION = 100%
```

pero no:

```text
FULL OPERATIONAL CERTIFICATION = 100%
```

si la validación humana requerida sigue pendiente.

---

# 105. FINAL QUESTION YOU MUST ANSWER

Después de toda la auditoría y remediation:

# SI MAÑANA TENEMOS UNA ASAMBLEA DE PH CON 8 PERSONAS, ¿PODEMOS UTILIZAR ESTA APLICACIÓN DE PRINCIO A FIN SIN EXCEL, WHATSAPP, ZOOM, CÁLCULOS MANUALES NI INTERVENCIÓN DEL DESARROLLADOR?

La respuesta debe ser únicamente una de:

```text
YES
YES — CONTROLLED PILOT
NO
```

y estar respaldada por evidencia.

---

# 106. EXECUTE NOW

No me entregues otro plan.

No me preguntes si quieres comenzar.

# COMIENZA LA AUDITORÍA AHORA.

# REVISA EO-001 → EO-010.

# RECONSTRUYE LOS REQUISITOS.

# INSPECCIONA EL CÓDIGO.

# INSPECCIONA POSTGRESQL.

# LEVANTA LA APLICACIÓN.

# ABRE EL BROWSER.

# EJECUTA LOS FLUJOS.

# INTENTA ROMPERLOS.

# CORRIGE TODO FAIL/PARTIAL/MISSING CORREGIBLE.

# VUELVE A PROBAR.

# EJECUTA REGRESIÓN.

# EJECUTA LA ASAMBLEA COMPLETA.

# COMPARA CONTRA POSTGRESQL.

# GENERA EVIDENCIA.

# Y SOLO ENTONCES DIME SI PODEMOS USARLA.

No quiero confianza.

# QUIERO PRUEBAS.

No quiero "debería funcionar".

# QUIERO SABER SI FUNCIONA.

No quiero otro módulo.

# QUIERO TERMINAR ASAMBLEAS.