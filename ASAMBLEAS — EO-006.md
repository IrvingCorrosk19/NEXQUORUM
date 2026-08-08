# ASAMBLEAS — EO-006
# ATTENDANCE, ACCREDITATION, POWERS & QUORUM EXCELLENCE
## IDENTITY + REPRESENTATION + CHECK-IN + REALTIME QUORUM + UIX/UIA + EVIDENCE

**Execution Order:** EO-006  
**Producto:** ASAMBLEAS  
**Dominio:** Attendance / Accreditation / Representation / Powers / Quorum  
**Prioridad:** P0 — CRITICAL GOVERNANCE CORE  
**Dependencias:** EO-001 → EO-005  
**Stack:** .NET Core + PostgreSQL + HTML + CSS + ECMAScript 2025 + SignalR + stack existente  
**Regla:** NO EXPANDIR FUERA DEL MÓDULO ASAMBLEA.

---

# 0. MISIÓN

Construir, endurecer y certificar la cadena:

# PARTICIPANT
# ↓
# IDENTITY
# ↓
# UNIT
# ↓
# REPRESENTATION
# ↓
# POWER / PROXY
# ↓
# ACCREDITATION
# ↓
# CHECK-IN
# ↓
# PRESENCE
# ↓
# EFFECTIVE COEFFICIENT
# ↓
# QUORUM

Esta cadena debe convertirse en una fuente confiable de verdad para toda la Asamblea.

EO-005 depende directamente de ella.

No puede existir una votación confiable si no podemos demostrar correctamente:

> quién estaba acreditado, qué representaba y cuál era su peso efectivo.

---

# 1. PRINCIPIO FUNDAMENTAL

NO confiar en frontend para determinar:

```text
Identity
Ownership
Representation
Power validity
Accreditation
Presence
Coefficient
Quorum
Voting eligibility
```

Frontend solicita y representa.

Backend valida.

PostgreSQL persiste.

SignalR distribuye.

---

# 2. AUDIT FIRST

Antes de modificar:

1. ejecutar aplicación;
2. ejecutar build;
3. ejecutar tests;
4. abrir Browser;
5. revisar flujo actual;
6. revisar PostgreSQL;
7. revisar entidades;
8. revisar APIs;
9. revisar SignalR;
10. revisar UI;
11. probar check-in;
12. probar quórum;
13. probar representación;
14. probar múltiples usuarios.

Crear:

```text
docs/AUDIT/EO-006/
00-AS-IS.md
```

---

# 3. INVENTARIO REAL

Documentar qué existe actualmente:

```text
PH
Units
Owners
Participants
Ownership
Coefficient
Representation
Powers
Accreditation
CheckIn
Presence
Quorum
QuorumSnapshots
Audit
```

Clasificar:

```text
WORKING
PARTIAL
BROKEN
MISSING
MOCKED
HARDCODED
```

---

# 4. NO REWRITE WITHOUT EVIDENCE

No reemplazar funcionalidad válida.

Primero:

```text
OBSERVE
TEST
PROVE
```

Después:

```text
FIX
```

---

# 5. SOURCE OF TRUTH

Definir claramente cuál es la autoridad de:

```text
Owner
Unit
Coefficient
Power
Representation
Accreditation
Presence
Quorum
```

Documentarlo.

Evitar múltiples cálculos contradictorios.

---

# 6. PARTICIPANT MODEL

Un participante de Asamblea debe poder representar correctamente:

```text
Person
Assembly
Role
Accreditation Status
Presence Status
Representation
Effective Coefficient
Voting Eligibility
```

Adaptar al dominio existente.

---

# 7. PERSON ≠ UNIT

No asumir:

```text
1 person = 1 unit
```

Una persona puede potencialmente:

```text
Own Unit A
Own Unit B
Represent Unit C
Represent Unit D
```

según reglas configuradas.

---

# 8. UNIT ≠ PERSON

Una unidad puede tener múltiples propietarios.

El modelo no debe romperse ante copropiedad.

Auditar implementación actual.

---

# 9. COEFFICIENT AUTHORITY

Coeficiente debe provenir del registro de unidad/propiedad correspondiente.

Nunca aceptar desde browser:

```text
coefficient = 4.82
```

como verdad.

---

# 10. DECIMAL PRECISION

Utilizar precisión adecuada:

```text
.NET decimal
PostgreSQL numeric/decimal
```

No `float`.

No `double`.

---

# 11. OWNERSHIP

Auditar:

```text
Owner
Unit
Ownership
Ownership percentage
Effective coefficient
```

si el modelo actual utiliza participación entre copropietarios.

No inventar reglas.

---

# 12. REPRESENTATION

Crear una representación inequívoca de:

```text
WHO
REPRESENTS
WHICH UNIT
IN WHICH ASSEMBLY
UNDER WHICH AUTHORITY
```

---

# 13. POWER / PROXY

Si un propietario representa a otro mediante poder:

debe existir evidencia estructurada.

Como mínimo:

```text
Principal
Representative
Unit
Assembly
Status
CreatedAt
ValidatedAt
ValidatedBy
Evidence reference
```

adaptado al modelo real.

---

# 14. POWER STATES

Formalizar estados.

Conceptualmente:

```text
DRAFT
PENDING_REVIEW
APPROVED
REJECTED
REVOKED
EXPIRED
```

No agregar estados innecesarios si modelo actual ya tiene equivalente.

---

# 15. POWER SCOPE

Un poder debe estar ligado a:

```text
Tenant
PH
Assembly
Principal
Representative
Unit / Representation
```

según diseño.

No crear poder global reutilizable accidentalmente.

---

# 16. POWER DUPLICATION

P0.

La misma representación no puede estar activa simultáneamente en dos personas cuando reglas lo prohíben.

PostgreSQL/backend deben protegerlo.

---

# 17. SELF CONFLICT

Detectar conflictos como:

```text
Owner physically present
+
another participant claims proxy for same voting representation
```

Resolver según regla configurada.

Nunca sumar dos veces.

---

# 18. REPRESENTATION GRAPH

Backend debe poder responder:

```text
Participant María

Own:
8B → 1.284%

Represents:
12C → 0.942%
15A → 1.105%

Effective:
3.331%
```

sin cálculo frontend.

---

# 19. EFFECTIVE REPRESENTATION SNAPSHOT

Al acreditarse:

evaluar persistir snapshot de representación efectiva para esa Asamblea.

Objetivo:

que historia no cambie si posteriormente se edita una unidad.

---

# 20. ACCREDITATION

Accreditation significa:

> La plataforma verificó que esta persona puede participar bajo determinada representación.

No confundir con:

```text
LOGIN
```

ni con:

```text
PRESENCE
```

---

# 21. ACCREDITATION STATES

Conceptualmente:

```text
NOT_STARTED
PENDING
ACCREDITED
REJECTED
REVOKED
```

Adaptar al modelo existente.

---

# 22. ACCREDITATION EVIDENCE

Guardar:

```text
Who was accredited
Representations
Effective coefficient
When
By whom
Assembly
Method
```

---

# 23. CHECK-IN

Check-in significa:

> La persona se registra como asistente para esta Asamblea.

No debe depender exclusivamente de conexión de video.

---

# 24. CHECK-IN METHODS

Arquitectura debe permitir distinguir cuando aplique:

```text
Operator Check-In
Self Check-In
QR Check-In
```

NO implementar métodos nuevos si no existen/requieren ahora.

Mantener extensibilidad.

---

# 25. CHECK-IN SEARCH

UI optimizada para:

```text
Name
Unit
Identification
```

si esos campos existen.

---

# 26. CHECK-IN TABLET UX

P0.

Optimizar:

```text
768x1024
820x1180
```

Flujo:

```text
SEARCH
 ↓
SELECT
 ↓
VERIFY
 ↓
ACCREDIT
 ↓
CHECK-IN
 ↓
SUCCESS
 ↓
NEXT
```

---

# 27. CHECK-IN SEARCH RESULT

No mostrar tabla administrativa gigante.

Ejemplo:

```text
MARÍA GONZÁLEZ

Unidad
8B

Propietaria

Coeficiente
1.284%

Representaciones
2

[ REVISAR ]
```

---

# 28. ACCREDITATION REVIEW

Mostrar:

```text
MARÍA GONZÁLEZ

PROPIEDAD

8B
1.284%

REPRESENTACIÓN

12C
0.942%

15A
1.105%

TOTAL EFECTIVO

3.331%

ESTADO

HABILITADA
```

---

# 29. CONFLICT UI

Si existe problema:

```text
NO ACREDITAR SILENCIOSAMENTE.
```

Ejemplo:

```text
CONFLICTO DE REPRESENTACIÓN

La unidad 12C ya está siendo
representada por Carlos Pérez.

[ REVISAR ]
```

---

# 30. CHECK-IN SUCCESS

Después:

```text
✓

ACREDITACIÓN COMPLETADA

María González
Unidad 8B

Representación efectiva
3.331%
```

Después preparar siguiente búsqueda.

---

# 31. SPEED

Check-in debe poder operar con fila de personas.

Minimizar clicks.

No sacrificar verificación.

---

# 32. DUPLICATE CHECK-IN

Intentar acreditar misma persona dos veces.

Resultado:

```text
ALREADY CHECKED IN
```

No duplicar presencia.

---

# 33. CONCURRENT CHECK-IN

Dos operadores acreditan simultáneamente la misma persona.

P0.

Solo una transición efectiva.

---

# 34. DATABASE PROTECTION

No confiar en:

```text
if (!checkedIn)
```

únicamente.

Agregar constraints/transacción apropiados.

---

# 35. PRESENCE

Separar:

```text
ACCREDITED
```

de:

```text
PRESENT
```

Una persona acreditada puede no estar presente todavía.

---

# 36. PRESENCE MODES

Preparar modelo para distinguir cuando corresponda:

```text
IN_PERSON
VIRTUAL
HYBRID
```

sin sobreingeniería.

---

# 37. VIRTUAL PRESENCE

No considerar automáticamente:

```text
SignalR connected = legally present
```

Definir semántica de presencia según producto.

SignalR es señal técnica, no necesariamente verdad jurídica.

---

# 38. VIDEO PRESENCE

Igualmente:

```text
LiveKit connected
```

no debe ser la única fuente de asistencia.

---

# 39. PRESENCE SESSION

Auditar posibilidad de registrar:

```text
PresentFrom
PresentUntil
Reconnected
Left
Returned
```

para trazabilidad.

---

# 40. LEAVE ASSEMBLY

Si participante sale:

actualizar presencia según regla.

No borrar historial.

---

# 41. RETURN

Si vuelve:

crear continuidad auditable.

No duplicar participante.

---

# 42. QUORUM ENGINE

P0.

Debe ser una única autoridad backend.

No calcular quórum independientemente en múltiples vistas.

---

# 43. QUORUM INPUT

El motor recibe únicamente representaciones efectivas válidas y presentes según regla.

Conceptualmente:

```text
Eligible Representation
+
Accredited
+
Present
+
Valid
=
Quorum Contribution
```

---

# 44. QUORUM FORMULA

Documentar fórmula exacta.

No esconder lógica en LINQ disperso.

Crear servicio/dominio claramente identificable.

---

# 45. EXAMPLE

Si:

```text
Unit 8B     1.284%
Unit 12C    0.942%
Unit 15A    1.105%
```

María aporta:

```text
3.331%
```

una sola vez.

---

# 46. NO DOUBLE COUNT

P0.

Una unidad/representación no puede contribuir dos veces al quórum.

---

# 47. QUORUM PRECISION

Calcular con precisión completa.

Display:

```text
72.84%
```

Backend puede conservar más decimales.

---

# 48. QUORUM THRESHOLD

Threshold debe provenir de configuración/regla.

No hardcode:

```text
50%
```

en UI.

---

# 49. QUORUM STATUS

Backend debe poder devolver:

```text
Current
Required
Reached
Missing
```

Ejemplo:

```text
Current
47.821%

Required
50.000%

Missing
2.179%
```

---

# 50. QUORUM UI

Diseñar componente premium.

```text
QUÓRUM ACTUAL

72.84%

REQUERIDO
50.00%

✓ QUÓRUM ALCANZADO
```

---

# 51. BEFORE THRESHOLD

```text
QUÓRUM ACTUAL

47.82%

FALTA

2.18%
```

Debe ser comprensible inmediatamente.

---

# 52. THRESHOLD CROSSING

Cuando:

```text
49.98%
→
50.21%
```

todos los clientes autorizados reciben actualización realtime.

Mostrar transición sobria:

```text
QUÓRUM ALCANZADO
```

No confetti.

---

# 53. QUORUM LOSS

Si quórum cae:

```text
52.31%
→
48.72%
```

mostrar:

```text
QUÓRUM POR DEBAJO DEL REQUERIDO
```

según regla.

---

# 54. DO NOT INVENT LEGAL CONSEQUENCE

No asumir automáticamente:

```text
Assembly must end
```

porque cae quórum.

Aplicar regla configurada.

Mostrar alerta operacional.

---

# 55. QUORUM SNAPSHOTS

Persistir snapshots relevantes.

Como mínimo considerar:

```text
Initial
Assembly Start
Threshold Reached
Threshold Lost
Voting Open
Voting Close
Assembly End
```

según arquitectura/reglas.

---

# 56. SNAPSHOT CONTENT

Debe permitir reconstruir:

```text
Timestamp
Current Quorum
Required Threshold
Present Participants
Effective Representations
Reason/Event
```

sin exponer información innecesaria.

---

# 57. QUORUM HISTORY

Operador puede consultar timeline compacto.

Ejemplo:

```text
18:52   42.18%
18:57   49.92%
19:01   51.21%   Quórum alcanzado
19:24   54.87%
20:03   52.11%
```

No crear analytics avanzado.

Es evidencia operacional.

---

# 58. REALTIME

Eventos conceptuales:

```text
ParticipantAccredited
ParticipantCheckedIn
ParticipantPresent
ParticipantLeft
ParticipantReturned
RepresentationChanged
QuorumChanged
QuorumReached
QuorumLost
```

Normalizar nombres según arquitectura.

---

# 59. EVENT ORDER

Persistir primero.

Después SignalR.

Nunca broadcast antes de commit.

---

# 60. MULTIPLE CLIENTS

Abrir:

```text
President
Secretary
6 Owners
```

Cuando Owner06 entra:

President y Secretary deben ver actualización sin refresh.

---

# 61. OWNER QUORUM

Owner puede ver quórum actual.

No necesita ver información privada de otros participantes.

---

# 62. PROJECTOR QUORUM

Mostrar:

```text
QUÓRUM

72.84%

REQUERIDO

50.00%
```

sin datos privados.

---

# 63. PARTICIPANT LIST

Operator:

```text
PRESENTES
7 / 8
```

con acceso a detalles.

---

# 64. PARTICIPANT STATUS

Estados visuales claros:

```text
Accredited
Present
Temporarily Disconnected
Left
```

No depender solo del color.

---

# 65. VIRTUAL DISCONNECT

Una caída breve de SignalR/LiveKit no debe provocar cambios jurídicos destructivos instantáneos sin política.

Separar:

```text
Technical connectivity
```

de:

```text
Attendance state
```

---

# 66. GRACE PERIOD

Si arquitectura/reglas lo justifican:

evaluar grace period configurable para problemas técnicos.

No inventar comportamiento jurídico.

Documentar.

---

# 67. RECONNECT

Cuando usuario vuelve:

reconstruir:

```text
Accreditation
Presence
Representation
Quorum
Voting eligibility
```

desde backend.

---

# 68. REFRESH

F5 no debe:

```text
duplicate attendance
duplicate representation
duplicate check-in
```

---

# 69. MULTI-TAB

Mismo usuario en dos tabs:

debe representar una sola presencia lógica según diseño.

No sumar coeficiente dos veces.

---

# 70. MULTI-DEVICE

Mismo Owner entra desde móvil y laptop.

No duplicar representación/quórum.

---

# 71. IDENTITY VS CONNECTION

P0.

Quórum se basa en identidad/representación efectiva.

No en cantidad de sockets.

---

# 72. SIGNALR CONNECTION COUNT

Nunca:

```text
connections = participants
```

para quórum.

---

# 73. LIVEKIT PARTICIPANT COUNT

Nunca:

```text
LiveKitParticipants = QuorumParticipants
```

como autoridad.

---

# 74. POWER REVOCATION

Si un poder es revocado antes de Asamblea:

no permitir acreditación bajo ese poder.

---

# 75. REVOCATION DURING ASSEMBLY

Si negocio actual lo permite:

debe requerir proceso explícito y auditable.

No cambiar silenciosamente representación.

Si no está definido:

documentar como requerimiento pendiente.

---

# 76. REPRESENTATION CHANGE

Toda modificación durante Asamblea:

```text
WHO
WHEN
WHY
BEFORE
AFTER
```

auditada.

---

# 77. QUORUM RECALCULATION

Después de cambio válido:

recalcular server-side.

Persistir snapshot cuando corresponda.

Publicar evento.

---

# 78. VOTING INTERACTION

EO-006 debe integrarse con EO-005.

Voting Engine consulta representación efectiva.

No recalcular representación independientemente.

---

# 79. SINGLE REPRESENTATION SOURCE

Crear interfaz/servicio central.

Conceptualmente:

```text
IAssemblyRepresentationService
```

o equivalente coherente con arquitectura.

---

# 80. VOTE SNAPSHOT

Al abrir Voting:

Voting Engine puede congelar universo/elegibilidad según regla.

Documentar integración.

---

# 81. QUORUM AT VOTE OPEN

Persistir snapshot correspondiente.

---

# 82. QUORUM AT VOTE CLOSE

Persistir snapshot correspondiente.

---

# 83. SECURITY

Verificar:

```text
Tenant
PH
Assembly
Role
Participant
Unit
Representation
Power
Accreditation
```

en servidor.

---

# 84. CROSS-TENANT ATTACK

Tenant A intenta:

```text
accredit Tenant B owner
use Tenant B unit
use Tenant B power
query Tenant B quorum
```

Resultado:

# REJECTED.

---

# 85. CROSS-ASSEMBLY ATTACK

Power/representation de Assembly A no puede reutilizarse accidentalmente en B.

---

# 86. IDOR

Manipular IDs:

```text
ParticipantId
UnitId
PowerId
AssemblyId
AccreditationId
```

Verificar contexto.

---

# 87. FRONTEND TAMPERING

Modificar mediante DevTools:

```text
coefficient
unit
representation
presence
```

Servidor debe ignorar/rechazar.

---

# 88. XSS

Probar campos textuales relacionados con poderes/observaciones/nombres cuando sean editables.

---

# 89. AUDIT TRAIL

Registrar:

```text
PowerCreated
PowerApproved
PowerRejected
PowerRevoked

ParticipantAccredited
ParticipantRejected

ParticipantCheckedIn
ParticipantMarkedPresent
ParticipantLeft
ParticipantReturned

RepresentationAssigned
RepresentationChanged

QuorumReached
QuorumLost
```

según funcionalidad existente.

---

# 90. AUDIT IMMUTABILITY

No permitir edición silenciosa del historial.

---

# 91. EVIDENCE

Crear expediente mínimo de asistencia:

```text
Assembly

Accredited Participants
Representations
Powers
Check-ins
Presence
Quorum snapshots
Quorum changes
Audit events
```

---

# 92. PRIVACY

No mostrar documentos de identidad/poderes completos en projector ni Owner UI.

---

# 93. POWER DOCUMENT

Si existe documento adjunto:

proteger autorización.

No usar URL pública predecible.

---

# 94. UIX CHECK-IN

Realizar auditoría Browser.

Debe ser:

```text
FAST
CLEAR
SAFE
TOUCH FRIENDLY
```

---

# 95. CHECK-IN OPERATOR DASHBOARD

Conceptualmente:

```text
CHECK-IN

QUÓRUM
47.82%

PRESENTES
21 / 45

ACREDITADOS
24 / 45

────────────────────────────

[ Buscar nombre, unidad... ]

────────────────────────────

Recent Check-ins

María González       8B      ✓
Carlos Pérez         3A      ✓
Ana Rodríguez       10C      ✓
```

---

# 96. CHECK-IN LIVE QUORUM

Después de acreditar/presencia válida:

el indicador se actualiza sin refresh.

---

# 97. CHECK-IN CONFIDENCE

Operador debe saber:

```text
Who did I just accredit?
What does this person represent?
What coefficient was added?
Did quorum change?
```

---

# 98. OWNER LOBBY

Mostrar:

```text
ACREDITACIÓN

✓ Verificada

REPRESENTAS

8B
12C

COEFICIENTE EFECTIVO

2.226%

QUÓRUM ACTUAL

68.42%
```

según privacidad/reglas.

---

# 99. CONFLICT CENTER

Dentro de preparación/check-in:

mostrar conflictos pendientes.

Ejemplo:

```text
2 conflictos requieren revisión
```

---

# 100. CONFLICT TYPES

Detectar cuando corresponda:

```text
Duplicate representation
Power not approved
Owner already present directly
Unit without coefficient
Invalid unit
Missing ownership
Representation overlap
```

---

# 101. DO NOT SILENTLY FIX DATA

No modificar automáticamente información crítica para hacer que cuadre.

Mostrar conflicto.

Requerir resolución autorizada.

---

# 102. PRE-ASSEMBLY VALIDATION

Antes de abrir check-in:

ejecutar validaciones.

---

# 103. READINESS

Incluir:

```text
Participants
Units
Coefficients
Powers
Representation conflicts
```

en readiness.

---

# 104. BLOCKERS

Ejemplo:

```text
3 units have no coefficient
```

puede ser P0 para iniciar según reglas.

No ocultarlo.

---

# 105. DATA QUALITY

Mostrar errores de configuración antes de la Asamblea.

No durante votación.

---

# 106. RESPONSIVE

Probar:

```text
375x667
390x844
430x932

768x1024
820x1180

1366x768
1440x900
1920x1080
```

---

# 107. MOBILE OWNER

Owner debe comprender:

```text
Accredited?
Present?
Representations?
Quorum?
```

sin tabla.

---

# 108. TABLET CHECK-IN

P0.

Botones grandes.

Search rápido.

Keyboard-friendly.

Touch-friendly.

---

# 109. ACCESSIBILITY

WCAG 2.2 AA.

Especialmente:

```text
Search
Participant selection
Accreditation
Conflict dialogs
Quorum status
Realtime changes
```

---

# 110. SCREEN READER

Anunciar cambios importantes:

```text
Accreditation successful
Quorum reached
Quorum lost
Conflict
```

sin saturar.

---

# 111. KEYBOARD

Operador puede:

```text
Search
Select
Review
Accredit
Continue
```

sin mouse.

---

# 112. PERFORMANCE

Medir:

```text
Participant search
Accreditation
Representation resolution
Check-in
Quorum recalculation
SignalR propagation
```

---

# 113. SEARCH PERFORMANCE

No cargar todos los propietarios al browser innecesariamente si escala.

---

# 114. DATABASE INDEXES

Auditar índices para:

```text
Tenant
Assembly
Participant
Unit
Owner
Power
Representation
Attendance
```

---

# 115. N+1

Buscar N+1 en:

```text
participant list
representation
powers
quorum calculation
```

---

# 116. CONCURRENCY TEST

Ejecutar múltiples check-ins casi simultáneos.

Resultado correcto.

---

# 117. 8-USER E2E

Usar:

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

# 118. E2E DATASET

Crear datos determinísticos.

Cada Owner con coeficiente conocido.

Algunos con representación.

Ejemplo conceptual:

```text
Owner01 → Unit A → 10%
Owner02 → Unit B → 15%
Owner03 → Unit C → 12%
Owner04 → Unit D → 8%
Owner05 → Unit E → 20%
Owner06 → Unit F → 5%

Owner02 additionally represents Unit G → 10%
Owner05 additionally represents Unit H → 20%
```

Ajustar para dataset válido.

---

# 119. E2E MASTER FLOW

```text
CREATE/LOAD ASSEMBLY
 ↓
VERIFY PARTICIPANTS
 ↓
VERIFY COEFFICIENTS
 ↓
VERIFY POWERS
 ↓
OPEN CHECK-IN
 ↓
ACCREDIT OWNER01
 ↓
VERIFY QUORUM
 ↓
ACCREDIT OWNER02 + PROXY
 ↓
VERIFY QUORUM
 ↓
CONCURRENT CHECK-IN TEST
 ↓
DUPLICATE CHECK-IN ATTEMPT
 ↓
REPRESENTATION CONFLICT ATTEMPT
 ↓
RESOLVE VALID DATA
 ↓
ALL PARTICIPANTS JOIN
 ↓
VERIFY PRESIDENT REALTIME
 ↓
VERIFY SECRETARY REALTIME
 ↓
START ASSEMBLY
 ↓
OWNER04 DISCONNECTS
 ↓
VERIFY TECHNICAL/PRESENCE POLICY
 ↓
OWNER04 RECONNECTS
 ↓
VERIFY NO DUPLICATE
 ↓
VERIFY QUORUM
 ↓
OPEN VOTING
 ↓
VERIFY EO-005 ELIGIBILITY
```

---

# 120. QUORUM ASSERTIONS

En cada check-in:

calcular expected value previamente.

Comparar:

```text
Expected
Backend
UI
Database snapshot
```

Deben coincidir.

---

# 121. PRECISION TEST

Usar coeficientes:

```text
0.333333
1.284731
2.999999
7.123456
```

Verificar cálculo exacto.

---

# 122. DUPLICATE REPRESENTATION TEST

Intentar sumar misma unidad dos veces.

Resultado:

```text
REJECTED
```

---

# 123. MULTI-TAB TEST

Owner abre 2 tabs.

Quórum no cambia.

---

# 124. MULTI-DEVICE TEST

Owner móvil + laptop.

Quórum no se duplica.

---

# 125. REFRESH TEST

F5.

Quórum no cambia.

---

# 126. SIGNALR RECONNECT TEST

Disconnect/reconnect.

No duplicar presencia.

---

# 127. SERVER RESTART RECOVERY

Cuando sea razonablemente posible:

reiniciar aplicación durante sesión de prueba.

Verificar que estado persistido pueda reconstruirse.

No depender exclusivamente de memoria.

---

# 128. DATABASE VERIFICATION

Después del E2E:

comprobar:

```text
Participants
Accreditations
Representations
Powers
Attendance
Quorum snapshots
Audit
```

---

# 129. CROSS-CHECK

Comparar:

```text
UI
API
DB
Audit
```

Todo debe concordar.

---

# 130. BROWSER CONSOLE

Objetivo:

```text
Unexpected console errors = 0
```

---

# 131. NETWORK

Objetivo:

```text
Unexpected 404 = 0
Unexpected 500 = 0
```

---

# 132. HUMAN CHECK-IN TEST

Preparar prueba física.

Una persona actúa como operador.

Otras 7 llegan consecutivamente.

Medir:

```text
Search time
Accreditation clarity
Check-in time
Errors
Confusion
Quorum update
```

---

# 133. HUMAN SUCCESS

Operador debe poder acreditar correctamente sin que desarrollador explique cada pantalla.

---

# 134. HUMAN QUORUM

Presidente debe poder mirar pantalla y responder inmediatamente:

```text
Do we have quorum?
How much?
How much is required?
```

---

# 135. DOCUMENTATION

Crear:

```text
docs/AUDIT/EO-006/
```

con:

```text
00-AS-IS.md
01-DOMAIN-MODEL.md
02-OWNERSHIP.md
03-POWERS.md
04-REPRESENTATION.md
05-ACCREDITATION.md
06-ATTENDANCE.md
07-QUORUM-ENGINE.md
08-REALTIME.md
09-SECURITY.md
10-UIX-UIA.md
11-PERFORMANCE.md
12-E2E.md
13-DATABASE-EVIDENCE.md
14-HUMAN-TEST.md
15-KNOWN-LIMITATIONS.md
EO-006-COMPLETION-REPORT.md
```

---

# 136. CERTIFICATION MATRIX

Reportar:

```text
Participant Model
Ownership
Unit Coefficient
Coefficient Precision
Powers
Power Validation
Power Conflicts
Representation
Representation Conflicts
Effective Coefficient
Accreditation
Check-In
Duplicate Check-In
Concurrent Check-In
Presence
Leave
Return
Multi-Tab
Multi-Device
Refresh
Reconnect
Quorum Engine
Quorum Precision
Quorum Threshold
Quorum Reached
Quorum Lost
Quorum Snapshots
SignalR
EO-005 Integration
Multi-Tenant
Cross-Assembly
Authorization
IDOR
XSS
Audit
Evidence
Mobile
Tablet
Desktop
Accessibility
Performance
Database
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

# 137. ZERO-TOLERANCE GATE

Para certificar:

```text
Duplicate representation accepted       0
Duplicate effective check-in            0
Coefficient double counting             0
Quorum calculation errors               0
Cross-tenant leakage                    0
Cross-assembly leakage                  0
Unauthorized accreditation             0
Lost attendance history                 0
Refresh duplication                     0
Reconnect duplication                   0
Multi-device quorum duplication         0
Unexpected 500                          0
Critical UI blockers                    0
```

---

# 138. FAIL → FIX → RETEST

Toda falla:

```text
FAIL
 ↓
ROOT CAUSE
 ↓
FIX
 ↓
TARGETED TEST
 ↓
CONCURRENCY TEST
 ↓
SECURITY TEST
 ↓
E2E REGRESSION
```

No esconder defectos.

---

# 139. DO NOT CHEAT

Prohibido:

```text
Hardcoded quorum
Hardcoded coefficients
Fake participants
Fake powers
Frontend-only validation
Ignoring duplicate representation
Removing failing tests
Changing expected result to match bug
Calling BLOCKED a PASS
```

---

# 140. INTEGRATION GATE — EO-005 + EO-006

Al finalizar debes demostrar esta cadena completa:

```text
OWNER
 ↓
UNIT
 ↓
COEFFICIENT
 ↓
POWER
 ↓
REPRESENTATION
 ↓
ACCREDITATION
 ↓
PRESENCE
 ↓
QUORUM
 ↓
VOTING ELIGIBILITY
 ↓
VOTE
 ↓
RESULT
```

No pueden existir dos fuentes contradictorias.

---

# 141. TRUST TEST

Para cualquier participante seleccionado aleatoriamente debemos poder responder:

```text
Who is this person?

Which unit does this person own?

Which units does this person represent?

Why can this person represent them?

Was the person accredited?

When?

Who accredited them?

Are they present?

What effective coefficient do they contribute?

Is that coefficient counted once?

Are they eligible for the current vote?
```

con evidencia.

---

# 142. QUORUM TRUST TEST

Para cualquier valor mostrado:

```text
QUORUM = 72.84%
```

debemos poder explicar exactamente de dónde salió.

No:

```text
"The system calculated it."
```

Sino:

```text
These effective representations
→ these coefficients
→ these presence states
→ this rule
→ 72.84%
```

---

# 143. CLIENT EXPERIENCE GATE

Realizar flujo completo desde UI.

No Developer Console.

No SQL manual.

No endpoints manuales.

El cliente debe observar:

```text
Owner arrives
 ↓
Operator finds owner
 ↓
Representation is verified
 ↓
Owner is accredited
 ↓
Check-in completes
 ↓
Quorum changes immediately
 ↓
Owner enters Assembly
```

y entender qué ocurrió.

---

# 144. PRODUCT QUALITY QUESTION

Antes de cerrar EO-006:

preguntar:

### OPERATOR

¿Puedo acreditar rápidamente sin miedo a equivocarme?

### PRESIDENT

¿Confío en el quórum mostrado?

### OWNER

¿Entiendo qué propiedades estoy representando?

### SYSTEM

¿Puede demostrar cada decimal del quórum?

### SECURITY

¿Puede alguien manipular su coeficiente desde el navegador?

### CONCURRENCY

¿Dos operadores pueden generar doble representación?

### REALTIME

¿Todos reciben el quórum correcto?

### RECOVERY

¿Refresh/reconnect conserva la verdad?

Si cualquiera falla:

# EO-006 NOT CERTIFIED.

---

# 145. FINAL EXECUTION COMMAND

Empieza ahora.

Primero:

# AUDIT THE CURRENT IMPLEMENTATION.

Después:

```text
DOMAIN
 ↓
OWNERSHIP
 ↓
POWERS
 ↓
REPRESENTATION
 ↓
ACCREDITATION
 ↓
CHECK-IN
 ↓
PRESENCE
 ↓
QUORUM
 ↓
REALTIME
 ↓
EO-005 INTEGRATION
 ↓
SECURITY
 ↓
UIX/UIA
 ↓
RESPONSIVE
 ↓
ACCESSIBILITY
 ↓
CONCURRENCY
 ↓
E2E 8 USERS
 ↓
DATABASE VERIFICATION
 ↓
HUMAN TEST
 ↓
CERTIFICATION
```

No expandas scope.

No agregues módulos.

No cambies stack.

No confundas login con acreditación.

No confundas conexión con presencia.

No confundas personas con unidades.

No confundas sockets con participantes.

No confíes en coeficientes enviados por frontend.

No sumes una representación dos veces.

No hardcodees el threshold.

No inventes consecuencias jurídicas.

No declares PASS sin ejecutar.

No declares realtime sin múltiples browsers.

No declares mobile sin dispositivo/viewport móvil.

No declares seguridad porque ocultaste un botón.

# ONE PERSON MAY REPRESENT MANY UNITS.

# ONE UNIT MUST NEVER BE COUNTED TWICE.

# ONE CONNECTION IS NOT ONE PARTICIPANT.

# ONE SOCKET IS NOT ONE VOTE.

# BACKEND DETERMINES REPRESENTATION.

# POSTGRESQL PRESERVES THE EVIDENCE.

# SIGNALR DISTRIBUTES THE STATE.

# UI EXPLAINS THE TRUTH.

---

# DEFINITION OF DONE

EO-006 solamente termina cuando podamos sentar a nuestros 8 participantes de prueba y demostrar:

```text
Correct identity
Correct ownership
Correct powers
Correct representation
Correct accreditation
Correct attendance
Correct effective coefficients
Correct quorum
Correct realtime propagation
Correct recovery
Correct voting eligibility
```

y cuando cualquier persona mirando el Cockpit pueda entender en segundos:

# CUÁNTAS PERSONAS ESTÁN PRESENTES.

# QUÉ REPRESENTAN.

# CUÁL ES EL QUÓRUM.

# CUÁNTO FALTA O CUÁNTO SUPERA EL MÍNIMO.

Mientras técnicamente podamos demostrar:

# EXACTAMENTE DE DÓNDE SALIÓ CADA DECIMAL.

Ese es el estándar de ASAMBLEAS.