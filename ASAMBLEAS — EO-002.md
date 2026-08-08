# ASAMBLEAS — EO-002
# ASSEMBLY EXPERIENCE EXCELLENCE
## ULTRA PREMIUM FUNCTIONAL + UI/UX/UIA + REALTIME CERTIFICATION

**Execution Order:** EO-002  
**Prioridad:** P0  
**Producto:** ASAMBLEAS  
**Scope:** EXCLUSIVAMENTE EL MÓDULO DE ASAMBLEA  
**Objetivo:** Convertir el flujo completo de una asamblea en una experiencia comercial premium, funcional, segura, realtime, responsive y demostrable con 8 participantes.

---

# 0. DIRECTIVA ABSOLUTA

A partir de este momento:

# STOP FEATURE EXPANSION.

NO continúes agregando módulos empresariales externos.

NO desarrollar:

- CRM;
- contabilidad;
- mantenimiento;
- proveedores;
- billing SaaS;
- IA;
- analytics corporativo;
- ERP;
- app móvil nativa;
- blockchain;
- microservicios;
- módulos administrativos no necesarios para ejecutar una asamblea.

Nuestro objetivo actual es uno solo:

# CONSTRUIR LA MEJOR EXPERIENCIA POSIBLE PARA REALIZAR UNA ASAMBLEA.

No queremos breadth.

Queremos:

# DEPTH + QUALITY + UX + RELIABILITY.

---

# 1. MISIÓN

Actúa como:

- Principal Product Architect;
- Senior .NET Engineer;
- PostgreSQL Architect;
- Realtime Engineer;
- WebRTC Integration Engineer;
- Principal UI/UX Designer;
- UI Architect;
- Accessibility Engineer;
- Security Engineer;
- QA Automation Engineer;
- Performance Engineer;
- Product Auditor.

Tu misión es tomar el estado actual de ASAMBLEAS y llevar el módulo de ejecución de asambleas a nivel:

# COMMERCIAL DEMO READY

No quiero solamente backend correcto.

No quiero solamente una UI bonita.

No quiero solamente videoconferencia.

Quiero:

# FUNCTIONAL + VISUAL + REALTIME + SECURE + AUDITABLE + INTUITIVE.

---

# 2. NO REESCRIBIR SIN AUDITAR

Antes de modificar código:

1. inspecciona el repositorio completo;
2. lee EO-001;
3. lee ADR existentes;
4. lee completion reports;
5. inspecciona backend;
6. inspecciona frontend;
7. inspecciona PostgreSQL;
8. inspecciona SignalR;
9. inspecciona LiveKit;
10. inspecciona Playwright;
11. ejecuta build;
12. ejecuta tests;
13. ejecuta aplicación;
14. abre la aplicación con Browser;
15. recorre todas las vistas existentes.

Generar:

```text
docs/AUDIT/EO-002-AS-IS-ASSESSMENT.md
```

antes de comenzar cambios importantes.

---

# 3. PRIMER GATE

Documentar:

```text
Existing functionality
Working functionality
Broken functionality
Mocked functionality
Hardcoded functionality
Missing functionality
UX problems
UI problems
Realtime problems
Responsive problems
Accessibility problems
Security problems
Performance problems
Technical debt
```

Clasificar:

```text
P0
P1
P2
P3
```

Todo P0 relacionado con el flujo principal deberá resolverse.

---

# 4. FLUJO QUE DEBEMOS PERFECCIONAR

El producto debe ejecutar impecablemente:

```text
LOGIN
   ↓
ASSEMBLY DASHBOARD
   ↓
PREPARATION
   ↓
CHECK-IN
   ↓
ACCREDITATION
   ↓
LOBBY
   ↓
JOIN VIRTUAL ROOM
   ↓
ATTENDANCE
   ↓
QUORUM
   ↓
START ASSEMBLY
   ↓
AGENDA
   ↓
REQUEST TO SPEAK
   ↓
MOTION
   ↓
OPEN VOTING
   ↓
CAST VOTE
   ↓
CLOSE VOTING
   ↓
RESULT
   ↓
NEXT AGENDA ITEM
   ↓
CLOSE ASSEMBLY
   ↓
MINUTES
   ↓
EVIDENCE
```

No puede existir ningún dead-end.

---

# 5. DEMO TARGET

La aplicación deberá soportar una demostración real con:

```text
8 USERS

1 President
1 Secretary / Operator
6 Owners
```

Cada usuario deberá poder utilizar un navegador/contexto independiente.

---

# 6. PRINCIPIO UI

Eliminar mentalidad:

```text
ADMIN CRUD
```

La interfaz debe sentirse como:

```text
DIGITAL GOVERNANCE CONTROL ROOM
```

Inspiración conceptual:

- broadcast control room;
- premium conferencing;
- modern fintech;
- mission control;
- executive SaaS;
- real-time operations.

NO copiar diseños de terceros.

---

# 7. DESIGN SYSTEM

Auditar y perfeccionar:

# ASAMBLEAS DESIGN SYSTEM

Crear/normalizar:

```text
Color Tokens
Typography
Spacing
Radius
Elevation
Borders
States
Motion
Icons
Grid
Breakpoints
Z-index
Focus
Accessibility
```

Todo mediante design tokens.

---

# 8. CONSISTENCIA

No permitir:

- 5 estilos diferentes de botones;
- radios distintos;
- tablas inconsistentes;
- modales improvisados;
- colores arbitrarios;
- tamaños de fuente aleatorios;
- loaders distintos;
- cards incompatibles;
- sombras arbitrarias.

Crear componentes reutilizables.

---

# 9. IDENTIDAD VISUAL

ASAMBLEAS debe transmitir:

```text
TRUST
CONTROL
LEGAL SERIOUSNESS
TRANSPARENCY
TECHNOLOGY
PREMIUM
CALM
```

No usar una interfaz visualmente saturada.

---

# 10. ASSEMBLY DASHBOARD

Crear/perfeccionar una vista previa a la asamblea.

Debe mostrar:

```text
Assembly Name
PH
Date
Time
Mode
Status

Preparation Progress

Participants
Units
Powers
Agenda
Documents
Voting Configuration
Meeting Configuration

Readiness
```

CTA principal contextual:

```text
PREPARAR
INICIAR CHECK-IN
INICIAR ASAMBLEA
CONTINUAR ASAMBLEA
VER RESULTADOS
```

según estado.

---

# 11. ASSEMBLY READINESS

Implementar un readiness operacional mínimo.

Ejemplo:

```text
ASSEMBLY READINESS

Participants             READY
Coefficients             READY
Agenda                   READY
Meeting                  READY
Voting Rules             READY

READY TO START
```

No implementar todavía un motor empresarial complejo.

Debe detectar bloqueadores reales.

---

# 12. CHECK-IN EXPERIENCE

Debe ser extremadamente rápida.

Buscar por:

```text
Owner Name
Unit
Identification
```

Si existe QR ya implementado, integrarlo.

Si no existe, no detener EO-002 por QR.

---

# 13. ACCREDITATION CARD

Mostrar:

```text
OWNER

María González

Unit
8B

Coefficient
1.284%

Representation
12C

Total represented coefficient
2.226%

STATUS
ELIGIBLE

[ ACCREDIT ]
```

Información clara.

No tablas administrativas gigantes.

---

# 14. CHECK-IN REALTIME

Al acreditar:

```text
ParticipantCount++
PresentCoefficient changes
Quorum changes
```

Todos los clientes autorizados deben recibir actualización.

---

# 15. LOBBY

Antes de entrar:

```text
ASSEMBLY LOBBY
```

Mostrar:

- PH;
- Assembly;
- participant;
- unit;
- accreditation;
- microphone;
- camera;
- connection;
- current quorum;
- meeting status.

---

# 16. DEVICE PREVIEW

Permitir:

```text
Camera Preview
Microphone Selection
Camera Selection
Speaker Selection when supported
Camera On/Off
Mic On/Off
```

Mostrar estado comprensible.

---

# 17. CONNECTION UX

Mostrar:

```text
Excellent
Good
Unstable
Reconnecting
Disconnected
```

No mostrar terminología técnica WebRTC al usuario.

---

# 18. JOIN EXPERIENCE

CTA:

```text
ENTER ASSEMBLY
```

Mostrar loading premium:

```text
Verifying accreditation
Connecting securely
Preparing audio/video
Synchronizing assembly
```

Nunca pantalla congelada.

---

# 19. ASSEMBLY ROOM — P0

Esta es la pantalla más importante del producto.

Debe recibir máxima atención.

Diseñar dos experiencias:

```text
OPERATOR / PRESIDENT VIEW
```

y:

```text
OWNER VIEW
```

No reutilizar exactamente la misma interfaz para ambos roles.

---

# 20. OPERATOR COCKPIT

Debe contener sin saturación:

```text
Assembly Header

LIVE status
Duration
Quorum
Participants

Main Video

Agenda
Current Agenda Item

Current Motion

Voting Status

Speaker Queue

Participants

Incidents / Connection warnings

Controls
```

---

# 21. INFORMATION HIERARCHY

Prioridad visual:

```text
1. Current Assembly State
2. Quorum
3. Current Agenda
4. Active Motion
5. Active Voting
6. Main Speaker
7. Requests to Speak
8. Participants
9. Secondary Controls
```

No dar la misma importancia visual a todo.

---

# 22. OWNER ROOM

Simplificar.

Mostrar principalmente:

```text
Main Video
Assembly Status
Quorum
Current Agenda Item
Current Motion
Voting
Request to Speak
Documents if available
```

Ocultar controles administrativos.

---

# 23. VIDEO LAYOUT

Para 8 personas:

Principal:

```text
ACTIVE SPEAKER
```

Secundario:

thumbnails.

No hacer grid rígido de ocho cámaras permanentemente si destruye la UX.

---

# 24. PARTICIPANT CARD

Mostrar de forma discreta:

```text
Name
Unit
Role
Mic
Camera
Connection
Speaking
```

Nunca exponer información sensible innecesaria.

---

# 25. QUORUM COMPONENT

Crear un componente visual premium.

Mostrar:

```text
CURRENT QUORUM
72.84%

Required
50.00%

STATUS
QUORUM REACHED
```

Agregar progress visualization.

Debe ser accesible.

No depender únicamente del color.

---

# 26. QUORUM REALTIME

Cuando entra/sale/cambia presencia:

SignalR deberá actualizar.

Persistir snapshots conforme al diseño existente.

No recalcular únicamente en frontend.

Backend es autoridad.

---

# 27. AGENDA

Siempre debe quedar claro:

```text
WHERE ARE WE?
```

Ejemplo:

```text
01 Verification            DONE
02 Opening                 DONE
03 Financial Report        ACTIVE
04 Budget                  PENDING
05 Elections               PENDING
06 Closing                 PENDING
```

---

# 28. AGENDA TRANSITION

Cuando operador cambia punto:

todos los participantes reciben:

```text
AgendaItemChanged
```

Animación sutil.

No recargar página.

---

# 29. REQUEST TO SPEAK

Owner:

```text
REQUEST TO SPEAK
```

Después:

```text
REQUEST SENT

Position 3
```

Si es concedida:

```text
YOUR TURN TO SPEAK
```

---

# 30. SPEAKER QUEUE

Operador:

```text
1 María González     8B      02:14
2 Carlos Ruiz        3C      01:41
3 Ana Pérez          10A     00:52
```

Acciones:

```text
GRANT
SKIP
REJECT
```

Todas auditadas.

---

# 31. SPEAKER TIMER

Cuando se concede:

```text
MARÍA GONZÁLEZ
Unit 8B

03:00
```

Cronómetro.

Acciones:

```text
END
+30 SEC
```

si permisos/configuración lo permiten.

---

# 32. MOTION UX

No usar formulario administrativo como experiencia principal.

Operador crea/presenta:

```text
MOTION #003

Approve extraordinary budget
B/.25,000

Proposed by
...

[ PRESENT MOTION ]
```

---

# 33. MOTION STATE

Estados visuales:

```text
DRAFT
PRESENTED
VOTING
DECIDED
```

Todos reciben cambios realtime.

---

# 34. VOTING EXPERIENCE — P0

Esta experiencia debe ser extraordinariamente clara.

No utilizar:

```text
HTML radio + Submit
```

como UX final.

Crear tarjetas accesibles:

```text
┌─────────────────┐
│   A FAVOR       │
└─────────────────┘

┌─────────────────┐
│   EN CONTRA     │
└─────────────────┘

┌─────────────────┐
│   ABSTENCIÓN    │
└─────────────────┘
```

Seleccionables mediante:

- mouse;
- touch;
- keyboard.

---

# 35. VOTE CONFIRMATION

Antes de persistir:

```text
CONFIRM YOUR VOTE

You selected:

A FAVOR

This action cannot be repeated after confirmation.

[ CANCEL ]
[ CONFIRM VOTE ]
```

El texto final debe adecuarse a las reglas reales del Voting Engine.

---

# 36. VOTE SUBMISSION

Durante envío:

```text
Registering vote...
```

Deshabilitar double-submit visualmente.

Pero la seguridad real debe permanecer en backend/DB.

---

# 37. VOTE RECEIPT

Después:

```text
VOTE REGISTERED

20:42:17

Evidence
VT-XXXX
```

No revelar contenido del voto posteriormente cuando la modalidad sea secreta.

---

# 38. DOUBLE VOTE

Probar:

- double click;
- refresh;
- browser back;
- API replay;
- concurrent request;
- second tab.

Resultado:

```text
EXACTLY ONE VALID VOTE
```

---

# 39. VOTING OPERATOR VIEW

Mostrar:

```text
VOTING OPEN

Votes received
6 / 8

Participation
75%
```

No mostrar tendencias parciales si configuración lo prohíbe.

---

# 40. VOTING TIMER

Permitir opcionalmente:

```text
02:00
```

con:

```text
+30 sec
Close Voting
```

No cerrar automáticamente sin configuración explícita.

---

# 41. RESULT EXPERIENCE

Al cerrar:

presentar resultado premium.

Mostrar claramente:

```text
VOTE COUNT
```

y:

```text
COEFFICIENT
```

como conceptos diferentes.

---

# 42. RESULT EXAMPLE

```text
OFFICIAL RESULT

MOTION #003

A FAVOR

Votes          5
Coefficient    68.42%

EN CONTRA

Votes          2
Coefficient    23.10%

ABSTENTION

Votes          1
Coefficient     8.48%

RESULT

APPROVED
```

---

# 43. DECISION EXPLANATION

Mostrar:

```text
Required threshold
Calculated result
Rule applied
```

Sin presentar asesoría jurídica falsa.

---

# 44. RESULT ANIMATION

Utilizar transición elegante.

NO:

confetti.

Es una plataforma de gobernanza.

Mantener seriedad.

---

# 45. RECONNECT EXPERIENCE — P0

Cuando se pierde conexión:

NO expulsar inmediatamente de toda la experiencia.

Mostrar:

```text
CONNECTION LOST

Trying to reconnect...

Your previously registered actions remain محفوظ.
```

Usar texto localizado correctamente.

---

# 46. RECONNECT RESTORE

Después de volver:

sincronizar desde backend:

```text
Assembly state
Agenda
Motion
Voting
Vote status
Quorum
Speaker state
```

Nunca confiar en estado viejo del browser.

---

# 47. REFRESH RECOVERY

Probar F5 durante:

- lobby;
- assembly;
- active agenda;
- active motion;
- active voting;
- after voting.

El usuario debe recuperar el estado correcto.

---

# 48. MULTI-TAB

Probar mismo usuario en dos tabs.

No permitir inconsistencias ni doble voto.

Documentar política de sesión.

---

# 49. PRESIDENT CONTROLS

Controles críticos deben requerir:

- authorization;
- confirmation cuando corresponda;
- audit.

Ejemplos:

```text
START ASSEMBLY
OPEN VOTING
CLOSE VOTING
END ASSEMBLY
```

---

# 50. DANGEROUS ACTION UX

No colocar:

```text
END ASSEMBLY
```

junto a botones rutinarios sin protección.

Usar jerarquía visual y confirmación.

---

# 51. ASSEMBLY STATE MACHINE

Auditar y endurecer.

No permitir:

```text
DRAFT → COMPLETED
```

arbitrariamente.

Definir transiciones válidas.

---

# 52. EMPTY STATES

Diseñar estados vacíos para:

```text
No participants
No speaker requests
No active motion
No active voting
No documents
```

No mostrar áreas rotas.

---

# 53. LOADING STATES

Cada operación asíncrona relevante debe tener feedback.

No spinner global eterno.

Usar:

- skeleton;
- inline progress;
- optimistic UI solamente cuando sea seguro;
- disabled states;
- success states.

---

# 54. ERROR STATES

Diseñar:

```text
Network error
Meeting unavailable
Vote rejected
Session expired
Permission denied
Assembly closed
Invalid transition
Database/API temporary failure
```

Mensaje para humanos.

Detalles técnicos → logs.

---

# 55. TOASTS

Utilizar únicamente para información secundaria.

Acciones críticas como voto/resultados no deben depender de toast que desaparece.

---

# 56. MOBILE EXPERIENCE — P0

La vista Owner debe ser excelente en teléfono.

Certificar:

```text
375x667
390x844
430x932
```

No simplemente reducir desktop.

---

# 57. MOBILE VOTING

Botones suficientemente grandes.

No scroll accidental entre opción y confirmación.

Safe areas.

Touch targets accesibles.

---

# 58. TABLET

Certificar:

```text
768x1024
820x1180
```

Importante para operador/check-in.

---

# 59. DESKTOP

Certificar:

```text
1366x768
1440x900
1920x1080
```

---

# 60. PROJECTOR MODE

Crear una vista pública segura para proyección.

Mostrar solamente:

```text
Assembly
Current Quorum
Current Agenda
Current Motion
Voting State
Published Result
Timer
```

Nunca:

- emails;
- identificación;
- información privada;
- controles.

---

# 61. ACCESSIBILITY

Objetivo:

# WCAG 2.2 AA

Probar realmente:

- keyboard;
- tab order;
- focus;
- screen reader semantics;
- dialogs;
- voting;
- contrast;
- zoom;
- reduced motion.

---

# 62. KEYBOARD

Debe ser posible votar sin mouse.

Ejemplo:

```text
TAB
SPACE/ENTER
CONFIRM
```

Focus nunca debe desaparecer.

---

# 63. COLOR

No utilizar únicamente:

```text
green = approved
red = rejected
```

Agregar:

- icon;
- text;
- semantic label.

---

# 64. LOCALIZATION

Toda la nueva UI debe utilizar recursos.

Idiomas base:

```text
es-PA
en
```

No hardcodear textos visibles.

Revisar especialmente:

- JavaScript;
- modals;
- validation;
- realtime messages;
- LiveKit states.

---

# 65. SECURITY

Revalidar:

```text
Authentication
Authorization
Tenant
Assembly access
Role
Permission
Vote eligibility
Operator controls
SignalR authorization
Meeting token generation
```

---

# 66. LIVEKIT SECURITY

Token:

- backend generated;
- short lived;
- room scoped;
- identity scoped;
- permissions minimal.

Nunca enviar API Secret al browser.

---

# 67. SIGNALR SECURITY

Cada Hub debe validar:

```text
authenticated user
tenant
assembly
permission
```

No aceptar AssemblyId arbitrario y confiar en frontend.

---

# 68. POSTGRESQL

Auditar consultas utilizadas durante reunión.

Especialmente:

```text
Attendance
Participants
Quorum
Agenda
Motion
Voting
Vote
Audit
```

Eliminar N+1.

---

# 69. VOTING DATABASE CONSTRAINT

Debe existir protección DB para impedir duplicidad según el modelo.

No aceptar únicamente:

```text
if (!alreadyVoted)
```

en C#.

---

# 70. TRANSACTIONS

Revisar atomicidad de:

```text
CastVote
OpenVoting
CloseVoting
CheckIn
Quorum snapshot
Assembly transitions
```

---

# 71. AUDIT TRAIL

Cada operación crítica:

```text
Who
When
Tenant
Assembly
Action
Entity
Result
Correlation
```

No registrar secretos.

---

# 72. REALTIME EVENTS

Normalizar eventos.

Evitar strings arbitrarios dispersos.

Documentar:

```text
ParticipantCheckedIn
ParticipantConnected
ParticipantDisconnected
QuorumChanged
AgendaChanged
SpeakerRequested
SpeakerGranted
SpeakerEnded
MotionPresented
VotingOpened
VoteAccepted
VotingClosed
ResultPublished
AssemblyEnded
```

---

# 73. BROWSER E2E

Crear escenario real con:

```text
8 browser contexts
```

No una sola sesión reutilizada.

---

# 74. E2E MASTER SCENARIO

Ejecutar:

```text
President Login

Secretary Login

Owner101 Login
Owner102 Login
Owner103 Login
Owner104 Login
Owner105 Login
Owner106 Login

↓

Check-in

↓

Lobby

↓

Join

↓

Quorum Update

↓

Start Assembly

↓

Agenda 01

↓

Agenda 02

↓

Agenda 03

↓

Owner103 Requests Speak

↓

President Grants

↓

Speaker Ends

↓

Present Motion

↓

Open Voting

↓

All Eligible Users Vote

↓

Attempt Duplicate Vote

↓

Close Voting

↓

Publish Result

↓

Advance Agenda

↓

Disconnect Owner104

↓

Reconnect Owner104

↓

Verify State Recovery

↓

End Assembly

↓

Verify Audit
```

---

# 75. REALTIME ASSERTIONS

No basta comprobar DB.

Playwright debe verificar cuando sea posible que otros browsers reciben cambios sin refresh.

---

# 76. VISUAL QA

Usar Browser para inspeccionar todas las vistas.

Capturar evidencia/screenshot de:

```text
Dashboard
Check-in
Lobby
Operator Cockpit
Owner Room
Voting
Result
Reconnect
Projector
Mobile
```

Guardar evidencia de auditoría.

---

# 77. UI REVIEW LOOP

Para cada pantalla:

```text
IMPLEMENT
 ↓
OPEN IN BROWSER
 ↓
VISUAL REVIEW
 ↓
FIND UX/UI ISSUES
 ↓
FIX
 ↓
REOPEN
 ↓
RESPONSIVE REVIEW
 ↓
ACCESSIBILITY REVIEW
```

No diseñar exclusivamente leyendo HTML/CSS.

---

# 78. HUMAN VIDEO TEST

Preparar:

```text
docs/TESTING/EO-002-HUMAN-VIDEO-TEST.md
```

Checklist para 8 personas reales:

```text
Join
Camera
Microphone
Mute
Unmute
Active Speaker
Request Speak
Grant Speak
Reconnect
Mobile
Headphones
Echo
Audio quality
Video quality
```

No declarar PASS hasta realizarlo humanamente.

---

# 79. PERFORMANCE

Con 8 usuarios medir:

```text
Login
Assembly load
Check-in
Vote persistence
Quorum calculation
SignalR propagation
Result calculation
```

Guardar valores reales.

---

# 80. DATABASE PERFORMANCE

Registrar SQL lento encontrado.

No optimización imaginaria.

Utilizar evidencia.

---

# 81. BROWSER CONSOLE

Durante E2E:

```text
Console Errors = 0
Unhandled JS Errors = 0
```

Warnings importantes deben analizarse.

---

# 82. NETWORK

Buscar:

```text
404
401 unexpected
403 unexpected
500
failed fetch
SignalR disconnect loops
LiveKit token errors
```

No ignorarlos.

---

# 83. BUILD

Resultado obligatorio:

```text
Build Errors = 0
```

---

# 84. TESTS

Todos los tests requeridos deben pasar.

No eliminar tests porque fallan.

No cambiar assertion para ocultar bug.

---

# 85. FAIL → FIX → RETEST

Obligatorio:

```text
FAIL
 ↓
ROOT CAUSE
 ↓
FIX
 ↓
TARGETED RETEST
 ↓
FULL REGRESSION
```

---

# 86. NO MOCK CERTIFICATION

Si LiveKit real no está configurado:

marcar:

```text
BLOCKED
```

No:

```text
PASS
```

Si cámara humana no se probó:

```text
MANUAL ACCEPTANCE REQUIRED
```

---

# 87. NO FALSE CLAIMS

Prohibido:

```text
World Class
100%
Production Ready
Enterprise Certified
```

sin evidencia correspondiente.

---

# 88. POLISH PASS

Después de funcionalidad completa hacer una pasada exclusiva de polish.

Buscar:

```text
Misalignment
Whitespace
Typography
Icons
Hover
Focus
Transitions
Loading
Empty States
Error States
Mobile
Long Text
Localization
Overflow
Scrolling
Modals
Tooltips
```

Corregir.

---

# 89. COPY UX

Revisar todos los textos.

Evitar mensajes técnicos.

Ejemplo incorrecto:

```text
HubConnection state = Reconnecting
```

Correcto:

```text
Estamos restableciendo tu conexión…
```

---

# 90. CONFIDENCE UX

Durante operaciones críticas el usuario debe saber:

```text
WHAT IS HAPPENING?
DID IT WORK?
WHAT HAPPENS NEXT?
```

Especialmente:

- check-in;
- entrar;
- votar;
- reconectar;
- cerrar votación;
- finalizar asamblea.

---

# 91. NO DEAD BUTTONS

Auditar todos los:

```text
buttons
links
menus
tabs
dropdowns
actions
```

Todo elemento interactivo visible debe:

- funcionar;
- estar disabled con razón;
- o eliminarse.

No placeholders engañosos.

---

# 92. NO FAKE DATA

Eliminar datos hardcoded usados para aparentar:

```text
quorum
participants
votes
results
timers
```

La UI debe provenir del backend real.

---

# 93. REFRESH TEST

F5 no debe destruir la reunión.

Probar sistemáticamente.

---

# 94. BROWSER BACK/FORWARD

Verificar que navegación del navegador no permita acciones inconsistentes.

---

# 95. SESSION EXPIRATION

Si sesión expira:

mostrar experiencia segura y recuperable.

No perder silenciosamente un voto confirmado.

---

# 96. ASSEMBLY END

Antes de cerrar:

mostrar resumen:

```text
Agenda completed
Open voting sessions
Pending motions
Active speaker
Participants
```

Si existen operaciones críticas abiertas:

advertir/bloquear según regla.

---

# 97. FINAL ASSEMBLY SUMMARY

Después de cierre mostrar:

```text
Assembly completed

Start
End
Duration

Peak participants
Final quorum

Agenda items
Motions
Voting sessions
Results
```

---

# 98. MINUTES POC

Generar borrador estructurado usando datos reales.

No IA.

Incluir:

```text
Assembly identification
Date/time
Participants
Quorum
Agenda
Motions
Voting results
Decisions
Closing
```

---

# 99. EVIDENCE POC

Mostrar expediente mínimo:

```text
Attendance
Quorum snapshots
Motions
Voting sessions
Results
Audit events
Minutes
```

---

# 100. OUTPUT DE AUDITORÍA

Crear:

```text
docs/AUDIT/EO-002/
```

con:

```text
00-AS-IS.md
01-UX-AUDIT.md
02-UI-AUDIT.md
03-REALTIME-AUDIT.md
04-SECURITY-AUDIT.md
05-DATABASE-AUDIT.md
06-ACCESSIBILITY-AUDIT.md
07-E2E-RESULTS.md
08-PERFORMANCE.md
09-VISUAL-EVIDENCE.md
10-KNOWN-LIMITATIONS.md
EO-002-COMPLETION-REPORT.md
```

---

# 101. CERTIFICATION MATRIX

El completion report debe contener:

```text
Build
Unit
Integration
Architecture
Security
Multi-Tenant
Database
Authentication
Check-In
Accreditation
Lobby
Meeting
Attendance
Quorum
Agenda
Speaker Queue
Motion
Voting
Vote Integrity
Decision Calculation
Realtime
Reconnect
Refresh Recovery
Operator UI
Owner UI
Projector
Responsive
Accessibility
Localization ES
Localization EN
Audit
Minutes
Evidence
E2E Browser
Performance
Human Video
```

Estados permitidos:

```text
PASS
FAIL
BLOCKED
NOT EXECUTED
MANUAL ACCEPTANCE REQUIRED
```

---

# 102. DEFINITION OF DONE

EO-002 NO está terminado hasta que podamos realizar:

# UNA ASAMBLEA COMPLETA DE PRINCIPIO A FIN.

Con 8 sesiones:

```text
PREPARE
CHECK-IN
JOIN
QUORUM
START
DISCUSS
REQUEST SPEAK
MOTION
VOTE
RESULT
RECONNECT
CONTINUE
CLOSE
MINUTES
EVIDENCE
```

---

# 103. EXPERIENCE GATE

Pregúntate para cada vista:

> ¿Le enseñaría esta pantalla hoy a un cliente pagando?

Si la respuesta es:

```text
NO
```

todavía no está terminada.

---

# 104. SIMPLICITY GATE

Pregúntate:

> ¿Una persona sin entrenamiento técnico entiende qué hacer?

Si:

```text
NO
```

mejora UX.

---

# 105. OPERATOR GATE

Pregúntate:

> ¿El presidente puede operar la asamblea sin navegar constantemente entre páginas?

Si:

```text
NO
```

mejora Cockpit.

---

# 106. OWNER GATE

Pregúntate:

> ¿El propietario puede entrar, entender, escuchar, solicitar palabra y votar desde su teléfono sin explicación?

Si:

```text
NO
```

mejora Owner Experience.

---

# 107. INTEGRITY GATE

Pregúntate:

> ¿Podemos demostrar qué ocurrió durante la asamblea?

Si:

```text
NO
```

mejora Audit/Evidence.

---

# 108. PRIORIDAD DE CORRECCIÓN

Prioridad absoluta:

```text
P0 Voting Integrity
P0 Tenant/Security
P0 Assembly State
P0 Quorum
P0 Realtime
P0 Reconnect
P0 Functional Flow

P1 UX
P1 Mobile
P1 Accessibility
P1 Visual Quality

P2 Polish
```

Una UI preciosa con votos incorrectos:

# FAIL.

---

# 109. REGLA FINAL DE ALCANCE

Si durante EO-002 descubres una idea nueva que no es necesaria para ejecutar mejor la asamblea:

# DOCUMENT IT.

NO IMPLEMENT IT.

Agregar a:

```text
docs/BACKLOG/FUTURE-SCOPE.md
```

y continuar EO-002.

---

# 110. ORDEN DE EJECUCIÓN

Ejecutar exactamente:

```text
AUDIT
 ↓
BASELINE TEST
 ↓
P0 FIXES
 ↓
ASSEMBLY FLOW
 ↓
REALTIME
 ↓
VOTING INTEGRITY
 ↓
RECONNECT
 ↓
OPERATOR UX
 ↓
OWNER UX
 ↓
MOBILE
 ↓
ACCESSIBILITY
 ↓
VISUAL POLISH
 ↓
E2E 8 USERS
 ↓
SECURITY REGRESSION
 ↓
FULL REGRESSION
 ↓
DOCUMENTATION
 ↓
CERTIFICATION
```

---

# 111. INSTRUCCIÓN FINAL

Empieza ahora.

NO me preguntes qué pantalla hacer primero.

Audita el estado real del repositorio y determina la secuencia correcta siguiendo las prioridades establecidas.

No destruyas funcionalidad válida.

No reescribas por gusto.

No agregues tecnología por moda.

No expandas scope.

Corrige lo que falle.

Prueba lo que corrijas.

Abre cada vista en Browser.

Inspecciona visualmente.

Prueba diferentes resoluciones.

Ejecuta los 8 contextos de navegador.

Verifica PostgreSQL real.

Verifica SignalR real.

Verifica LiveKit real cuando existan credenciales.

No inventes evidencia.

No declares PASS sin ejecutar.

El objetivo de EO-002 no es entregar más software.

El objetivo es entregar:

# UNA ASAMBLEA DIGITAL EXCEPCIONAL.

Cuando EO-002 finalice, la aplicación debe ser suficientemente clara, sólida y visualmente profesional para sentar frente a ella:

- un presidente;
- un secretario;
- seis propietarios;

y realizar una asamblea virtual completa sin explicarles cómo funciona cada pantalla.

# BUILD LESS.
# PERFECT THE CORE.
# TEST EVERYTHING.
# CERTIFY ONLY WHAT YOU CAN PROVE.