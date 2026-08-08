# ASAMBLEAS — EO-008
# MINUTES, EVIDENCE, DECISIONS & ASSEMBLY CLOSURE EXCELLENCE
## AUTOMATED MINUTES + EVIDENCE CHAIN + DECISION REGISTER + CLOSURE + UIX/UIA

**Execution Order:** EO-008  
**Producto:** ASAMBLEAS  
**Dominio:** Assembly Closure / Minutes / Evidence / Decisions  
**Prioridad:** P0 — CORE ASSEMBLY PRODUCT  
**Dependencias:** EO-001 → EO-007  
**Stack:** .NET Core + PostgreSQL + HTML + CSS + ECMAScript 2025 + SignalR + infraestructura existente  
**Regla:** NO EXPANDIR FUERA DEL MÓDULO ASAMBLEA.

---

# 0. MISIÓN

Convertir todo lo ocurrido durante una Asamblea en un expediente estructurado, verificable y comprensible.

La cadena completa debe terminar así:

```text
PREPARATION
 ↓
ACCREDITATION
 ↓
ATTENDANCE
 ↓
REPRESENTATION
 ↓
QUORUM
 ↓
AGENDA
 ↓
INTERVENTIONS
 ↓
MOTIONS
 ↓
VOTING
 ↓
DECISIONS
 ↓
CLOSURE
 ↓
MINUTES
 ↓
EVIDENCE
```

El objetivo es que al terminar una Asamblea NO exista la necesidad de reconstruir manualmente:

- quién asistió;
- qué representaba;
- cuál era el quórum;
- qué puntos fueron tratados;
- qué mociones se presentaron;
- qué se votó;
- cuál fue el resultado;
- qué decisiones quedaron aprobadas;
- cuándo ocurrió cada evento.

ASAMBLEAS debe preservar esa información automáticamente.

---

# 1. PRINCIPIO FUNDAMENTAL

# MINUTES MUST BE GENERATED FROM VERIFIED SYSTEM FACTS.

Nunca inventar información.

Nunca completar silenciosamente datos faltantes.

Nunca usar texto generado como sustituto de evidencia estructurada.

El acta debe derivarse principalmente de:

```text
Assembly
Attendance
Accreditation
Representation
Powers
QuorumSnapshots
Agenda
SpeakerEvents
Motions
VotingSessions
VotingResults
Decisions
Timeline
Audit
```

---

# 2. AUDIT FIRST

Antes de programar:

ejecutar una Asamblea completa.

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

Realizar:

```text
CHECK-IN
 ↓
START
 ↓
AGENDA
 ↓
SPEAKER
 ↓
MOTION
 ↓
VOTE
 ↓
DECISION
 ↓
NEXT ITEMS
 ↓
END
```

Después inspeccionar qué información queda realmente persistida.

Crear:

```text
docs/AUDIT/EO-008/00-AS-IS.md
```

---

# 3. DATA COMPLETENESS AUDIT

Responder:

```text
Can we reconstruct attendance?
Can we reconstruct representation?
Can we reconstruct quorum?
Can we reconstruct agenda?
Can we reconstruct motions?
Can we reconstruct interventions?
Can we reconstruct voting?
Can we reconstruct decisions?
Can we reconstruct timeline?
Can we identify critical actors?
```

Clasificar:

```text
COMPLETE
PARTIAL
MISSING
UNRELIABLE
```

---

# 4. DO NOT GENERATE FIRST

No comenzar creando un PDF bonito.

Primero:

# BUILD THE EVIDENCE MODEL.

Después:

# BUILD THE MINUTES.

---

# 5. ASSEMBLY EVIDENCE MODEL

Crear/refinar una capa conceptual:

```text
AssemblyEvidence
```

No necesariamente una sola tabla.

Puede ser un servicio/agregado/proyección.

Debe reunir información verificable.

---

# 6. EVIDENCE SECTIONS

Como mínimo:

```text
Assembly Identity
Assembly Timing
Attendance
Accreditation
Representation
Powers
Quorum
Agenda
Interventions
Motions
Voting
Decisions
Timeline
Audit References
```

---

# 7. ASSEMBLY IDENTITY

Debe contener:

```text
PH
Assembly
Assembly Type
Assembly Identifier
Date
Start Time
End Time
Location / Virtual / Hybrid
Status
```

según datos reales existentes.

---

# 8. SERVER TIME

Tiempos críticos provienen del servidor.

No del reloj del browser.

Persistir UTC.

Convertir para display.

---

# 9. ATTENDANCE EVIDENCE

Debe poder reconstruir:

```text
Participant
Unit
Role
Accreditation
Presence
Entry
Exit
Return
```

según información disponible.

---

# 10. REPRESENTATION EVIDENCE

Para cada participante:

```text
Own Units
Represented Units
Power / authority
Effective coefficient
```

basado en snapshots históricos.

---

# 11. HISTORICAL STABILITY

P0.

Una Asamblea cerrada NO puede cambiar porque mañana alguien modifica:

```text
Owner name
Unit coefficient
Power
Representation
```

Los datos históricos críticos deben conservar snapshot apropiado.

---

# 12. QUORUM EVIDENCE

Incluir:

```text
Initial Quorum
Quorum at Start
Threshold
Threshold Reached
Relevant Changes
Quorum at Vote Open
Quorum at Vote Close
Final Quorum
```

cuando existan.

---

# 13. QUORUM EXPLANATION

Debe ser posible explicar:

```text
72.84%
```

mediante representación efectiva persistida.

---

# 14. AGENDA EVIDENCE

Por punto:

```text
Sequence
Title
StartedAt
CompletedAt
Duration
Status
```

---

# 15. AGENDA RELATIONSHIPS

Relacionar:

```text
Agenda Item
 ↓
Interventions
 ↓
Motions
 ↓
Voting
 ↓
Decisions
```

---

# 16. INTERVENTION EVIDENCE

Registrar:

```text
Participant
Unit
RequestedAt
GrantedAt
StartedAt
EndedAt
Duration
Agenda Item
```

según EO-007.

---

# 17. DO NOT TRANSCRIBE SPEECH AUTOMATICALLY

No agregar speech-to-text en este EO.

Eso sería expansión.

Aquí preservamos metadata existente.

---

# 18. MOTION EVIDENCE

Para cada Motion:

```text
Motion Number
Title
Exact Text
ProposedBy
Agenda Item
PresentedAt
Status
Voting Session
Resolution
```

---

# 19. MOTION TEXT IMMUTABILITY

Después de ser votada/resuelta:

no modificar silenciosamente texto histórico.

Si existe mecanismo de corrección:

debe ser explícito y auditado.

---

# 20. VOTING EVIDENCE

Integrar EO-005.

Debe incluir:

```text
Voting Session
Motion
Voting Mode
OpenedAt
ClosedAt
Eligible Universe
Participation
Vote Count
Coefficient Results
Rule
Decision
PublishedAt
```

---

# 21. SECRET VOTE

P0.

El expediente NO debe romper secreto.

No incluir:

```text
Participant → selected option
```

cuando modalidad sea secreta.

---

# 22. PUBLIC VOTE

Si modalidad pública:

solo mostrar información permitida.

---

# 23. DECISION REGISTER

Crear/refinar un registro estructurado de decisiones.

Cada decisión debe tener:

```text
Decision Number
Assembly
Agenda Item
Motion
Result
Rule
Status
DecidedAt
Evidence Reference
```

---

# 24. DECISION NUMBER

Generado server-side.

Ejemplo conceptual:

```text
DEC-2026-0004
```

No depender de browser.

---

# 25. RESULT ≠ DECISION

Mantener separación:

```text
RESULT

68.42% A FAVOR
```

vs:

```text
DECISION

APROBADA
```

---

# 26. DECISION EXPLAINABILITY

Debe poder mostrar:

```text
DECISIÓN

APROBADA

Resultado favorable
68.42%

Umbral configurado
50.00%

Regla aplicada
Mayoría requerida
```

---

# 27. NO LEGAL OVERCLAIM

No mostrar:

```text
LEGALMENTE VÁLIDA
```

salvo que exista fundamento/regla explícita para hacerlo.

Preferir:

```text
Resultado determinado según la regla configurada.
```

---

# 28. DECISION DETAIL UI

Crear vista premium.

Conceptualmente:

```text
DEC-2026-0004

APROBADA

Aprobar presupuesto extraordinario
de B/.25,000 para elevadores.

────────────────────────

AGENDA
03 — Presupuesto anual

MOCIÓN
MOT-003

RESULTADO

A favor       68.42%
En contra     23.10%
Abstención     8.48%

Participación
7 / 8

────────────────────────

Decidida
20:42:17
```

---

# 29. DECISION LIST

Después de Asamblea:

```text
DECISIONES

✓ DEC-001
  Presupuesto anual
  APROBADA

✕ DEC-002
  Cambio de proveedor
  RECHAZADA

✓ DEC-003
  Reparación elevadores
  APROBADA
```

No depender solo de color.

---

# 30. ASSEMBLY CLOSURE

EO-007 controla transición.

EO-008 debe capturar estado final.

---

# 31. FINAL SNAPSHOT

Al cerrar:

generar/persistir snapshot final apropiado.

Debe contener referencias a:

```text
Attendance
Representation
Quorum
Agenda
Motions
Voting
Decisions
Timeline
```

---

# 32. CLOSURE TRANSACTION

Evaluar arquitectura para garantizar consistencia.

Conceptualmente:

```text
VALIDATE
 ↓
CLOSE
 ↓
FINAL SNAPSHOT
 ↓
DECISION REGISTER
 ↓
EVIDENCE
 ↓
AUDIT
 ↓
COMMIT
```

No generar artefactos inconsistentes antes de commit.

---

# 33. POST-CLOSE IMMUTABILITY

Después de CLOSED:

bloquear operaciones normales como:

```text
Check-In
Change Agenda
Present Motion
Request Speak
Open Voting
Cast Vote
```

backend.

---

# 34. FRONTEND IS NOT ENOUGH

Aunque botones desaparezcan:

probar APIs directamente.

---

# 35. MINUTES DOMAIN

Crear/refinar:

```text
AssemblyMinutes
```

con estados apropiados.

Conceptualmente:

```text
GENERATED
UNDER_REVIEW
APPROVED
FINAL
```

Adaptar a reglas existentes.

---

# 36. MINUTES GENERATION

El primer borrador debe generarse automáticamente desde datos estructurados.

No manualmente desde cero.

---

# 37. MINUTES STRUCTURE

Como mínimo:

```text
1. Encabezado
2. Datos de Asamblea
3. Apertura
4. Asistencia
5. Representación
6. Quórum
7. Orden del Día
8. Desarrollo
9. Mociones
10. Votaciones
11. Decisiones
12. Cierre
13. Anexos / Evidencias
```

Adaptar a requisitos reales del producto.

---

# 38. MINUTES HEADER

Ejemplo:

```text
ACTA DE ASAMBLEA GENERAL ORDINARIA

PH OCEAN TOWER

Fecha:
8 de agosto de 2026

Hora de inicio:
7:05 p.m.

Hora de cierre:
9:18 p.m.
```

Datos reales.

---

# 39. ATTENDANCE SECTION

Generar desde evidencia.

No escribir manualmente cifras diferentes a DB.

---

# 40. QUORUM SECTION

Generar:

```text
Quórum al inicio
72.84%

Quórum requerido
50.00%
```

y cambios relevantes cuando corresponda.

---

# 41. AGENDA SECTION

Cada punto debe generarse automáticamente.

---

# 42. DEVELOPMENT SECTION

Por cada punto:

mostrar:

```text
Agenda
Interventions metadata
Motions
Voting
Decision
```

---

# 43. MOTION SECTION

Texto exacto.

No resumir automáticamente en esta fase.

---

# 44. VOTING SECTION

Generar resultados exactos.

---

# 45. DECISION SECTION

Generar decisiones.

---

# 46. CLOSURE SECTION

Usar:

```text
Assembly End Time
Final Quorum
```

y demás datos existentes.

---

# 47. NO AI HALLUCINATION

P0.

No utilizar IA generativa para inventar narrativa oficial.

Si posteriormente agregamos IA:

debe ser asistiva y claramente separada.

No en EO-008.

---

# 48. STRUCTURED FACTS FIRST

Cada párrafo generado debe derivar de hechos estructurados conocidos.

---

# 49. EDITABLE MINUTES

Si producto permite revisión:

Secretario puede editar narrativa permitida.

Pero:

# STRUCTURED FACTS MUST REMAIN PROTECTED.

---

# 50. PROTECTED FACTS

Ejemplos:

```text
Vote result
Coefficient
Quorum
Voting timestamps
Motion identifier
Decision
```

No deben poder modificarse libremente mediante editor.

---

# 51. EDITABLE NARRATIVE

Puede existir espacio para:

```text
Observations
Discussion notes
Secretary notes
```

si modelo lo soporta.

---

# 52. FACT VS NARRATIVE

Visualmente diferenciar:

```text
SYSTEM VERIFIED
```

de:

```text
SECRETARY NOTE
```

---

# 53. MINUTES EDITOR UX

No usar textarea gigante.

Diseñar secciones.

Ejemplo:

```text
ACTA

[ Datos Generales ]      ✓ Verificado

[ Asistencia ]           ✓ Sistema

[ Quórum ]               ✓ Sistema

[ Punto 01 ]
    Narrative             Editable

    Motion MOT-001        Locked

    Voting Result         Locked

    Decision              Locked
```

---

# 54. AUTOSAVE

Si existe edición:

implementar autosave seguro o estrategia apropiada.

No perder trabajo.

---

# 55. CONCURRENT EDITING

Si Presidente y Secretario pueden revisar simultáneamente:

evitar overwrite silencioso.

Usar optimistic concurrency.

---

# 56. VERSIONING

Mantener versiones del acta cuando cambie.

Ejemplo:

```text
v1 Generated
v2 Secretary Review
v3 President Review
v4 Final
```

---

# 57. VERSION HISTORY

Mostrar:

```text
Version
Actor
Timestamp
Status
```

---

# 58. FINALIZATION

Cuando acta se marca FINAL:

no editar silenciosamente.

---

# 59. CORRECTION AFTER FINAL

Si producto soporta:

debe crear nueva versión/adenda.

Nunca overwrite silencioso.

Si no existe:

documentar backlog.

---

# 60. APPROVAL WORKFLOW

No inventar firmas o aprobaciones legales.

Auditar qué existe.

Si ya existen roles:

usar flujo existente.

---

# 61. PRESIDENT REVIEW

Si modelo contempla:

```text
Secretary → Review
President → Approve
```

perfeccionarlo.

Si no:

no introducir burocracia arbitraria.

---

# 62. EVIDENCE CENTER

Dentro de la Asamblea cerrada crear/refinar una vista:

# EVIDENCE CENTER

No nuevo módulo externo.

Es parte del expediente de Asamblea.

---

# 63. EVIDENCE CENTER UI

Conceptualmente:

```text
EXPEDIENTE DE ASAMBLEA

Estado
CERRADA

────────────────────

ASISTENCIA
24 participantes

REPRESENTACIÓN
72.84%

QUÓRUM
✓ Alcanzado

AGENDA
6 / 6

MOCIONES
4

VOTACIONES
4

DECISIONES
4

────────────────────

[ VER ACTA ]
[ VER LÍNEA DE TIEMPO ]
[ VER EVIDENCIA ]
```

---

# 64. EVIDENCE NAVIGATION

Permitir navegar:

```text
Overview
Attendance
Representation
Quorum
Agenda
Motions
Voting
Decisions
Timeline
Audit
Minutes
```

sin perder contexto.

---

# 65. TIMELINE

Construir timeline desde eventos persistidos.

Ejemplo:

```text
19:01
Quórum alcanzado — 51.21%

19:05
Asamblea iniciada

19:12
Punto 02 iniciado

19:21
MOT-001 presentada

19:24
Votación abierta

19:27
Votación cerrada

19:27
DEC-001 aprobada

19:29
Punto 03 iniciado

...

21:18
Asamblea finalizada
```

---

# 66. TIMELINE FILTER

Filtros simples:

```text
All
Agenda
Motions
Voting
Attendance
System
```

No analytics avanzado.

---

# 67. EVENT DETAIL

Seleccionar evento puede abrir drawer.

Mostrar metadata autorizada.

---

# 68. AUDIT ≠ TIMELINE

Separar:

```text
USER-FRIENDLY TIMELINE
```

de:

```text
TECHNICAL AUDIT TRAIL
```

---

# 69. AUDIT TRAIL

Debe conservar eventos de seguridad/administración.

No mostrar todos al Owner.

---

# 70. EVIDENCE REFERENCES

Cada decisión debe enlazar a:

```text
Motion
Voting
Result
Quorum snapshot
Audit
```

cuando aplique.

---

# 71. TRACEABILITY GRAPH

No es necesario dibujar grafo complejo.

Pero internamente debe existir relación clara:

```text
DECISION
 ├── Agenda Item
 ├── Motion
 ├── Voting Session
 ├── Result
 ├── Rule
 └── Evidence
```

---

# 72. EXPORT STRATEGY

Auditar export actual.

Como mínimo evaluar:

```text
HTML Print View
PDF
```

si ya forma parte del producto.

No agregar 15 formatos.

---

# 73. PRINT-FIRST HTML

Crear vista imprimible limpia.

Debe funcionar bien antes de PDF.

---

# 74. PRINT CSS

Implementar:

```css
@media print
```

correctamente.

Eliminar:

```text
navigation
buttons
interactive controls
video
```

del documento impreso.

---

# 75. PAGE BREAKS

Evitar:

```text
motion title
```

al final de página y resultado en siguiente página sin contexto.

Usar reglas de impresión apropiadas.

---

# 76. PDF

Si infraestructura actual soporta PDF:

generar desde datos estructurados/vista estable.

---

# 77. PDF MUST MATCH DATA

Comparar:

```text
UI
API
DB
PDF
```

Valores críticos deben coincidir.

---

# 78. PDF SECURITY

No incluir datos privados innecesarios.

---

# 79. SECRET VOTE PDF

No revelar ballot mapping.

---

# 80. FILE NAME

Nombre consistente.

Ejemplo:

```text
PH-Ocean-Tower_Asamblea-Ordinaria_2026-08-08_Acta.pdf
```

Sanitizar correctamente.

---

# 81. DOCUMENT IDENTIFIER

Cada acta final debe tener identificador estable.

No necesariamente secuencial público.

---

# 82. HASH

Evaluar hash SHA-256 del artefacto final o snapshot de evidencia.

Objetivo:

detectar alteraciones.

No blockchain.

---

# 83. HASH DISPLAY

Si se implementa:

mostrar en sección técnica/evidence.

No saturar acta principal.

---

# 84. DOWNLOAD AUDIT

Si se registra descarga:

hacerlo razonablemente.

No crear ruido excesivo.

---

# 85. ACCESS CONTROL

Definir quién puede ver:

```text
Minutes Draft
Final Minutes
Evidence
Audit
Voting details
Powers
```

según roles existentes.

---

# 86. OWNER ACCESS

Owner puede consultar información autorizada de la Asamblea.

No exponer:

```text
private documents
secret ballot mapping
internal audit metadata
security logs
```

---

# 87. MULTI-TENANT

P0.

Tenant A nunca puede acceder:

```text
Minutes
Evidence
Decision
Voting
Attendance
PDF
```

de Tenant B.

---

# 88. CROSS-ASSEMBLY

Manipular AssemblyId.

Rechazar.

---

# 89. DOCUMENT IDOR

Manipular:

```text
MinutesId
DecisionId
EvidenceId
DocumentId
```

Rechazar contexto inválido.

---

# 90. DIRECT FILE URL

Si archivos existen:

no depender de URLs públicas predecibles.

---

# 91. AUTHORIZATION SERVER-SIDE

Ocultar botón no cuenta como seguridad.

---

# 92. XSS

Probar:

```text
Secretary notes
Agenda
Motion
Observations
```

en HTML/print/PDF.

---

# 93. HTML ENCODING

No introducir XSS al renderizar acta.

---

# 94. AUDIT

Registrar:

```text
MinutesGenerated
MinutesEdited
MinutesReviewed
MinutesApproved
MinutesFinalized
MinutesExported
```

según funciones reales.

---

# 95. EVIDENCE IMMUTABILITY

No permitir modificar evidencia base desde editor de acta.

---

# 96. REGENERATION

Si acta está en borrador y datos permitidos cambian:

definir comportamiento.

No sobrescribir notas humanas silenciosamente.

---

# 97. CLOSED ASSEMBLY DATA

Idealmente datos críticos ya no cambian.

---

# 98. UIX — POST ASSEMBLY

Después de cerrar:

no enviar al usuario a una tabla CRUD.

Mostrar:

# ASSEMBLY COMPLETION EXPERIENCE.

---

# 99. COMPLETION SCREEN

Ejemplo:

```text
✓ ASAMBLEA FINALIZADA

PH OCEAN TOWER

Duración
02:18:42

Quórum final
72.84%

Puntos tratados
6 / 6

Mociones
4

Decisiones
4

────────────────────

EXPEDIENTE

✓ Asistencia
✓ Quórum
✓ Agenda
✓ Votaciones
✓ Decisiones
✓ Línea de tiempo

ACTA

Borrador generado

[ REVISAR ACTA ]
```

---

# 100. NO FALSE SUCCESS

Si falta evidencia:

mostrar:

```text
EXPEDIENTE INCOMPLETO
```

No check verde falso.

---

# 101. COMPLETENESS ENGINE

Crear verificación de integridad.

Conceptualmente:

```text
Attendance complete?
Representation complete?
Quorum evidence complete?
Agenda complete?
Voting complete?
Decision complete?
Timeline complete?
```

---

# 102. COMPLETENESS ≠ LEGAL VALIDITY

No confundir.

Puede decir:

```text
EXPEDIENTE COMPLETO
```

No:

```text
LEGALMENTE VÁLIDO
```

---

# 103. INCONSISTENCY DETECTION

Detectar cosas como:

```text
Voting without Motion
Decision without Result
Motion without Agenda
Missing close timestamp
Quorum snapshot missing
```

cuando deberían existir.

---

# 104. EVIDENCE HEALTH

Mostrar:

```text
COMPLETE
WARNING
INCOMPLETE
```

con explicación.

---

# 105. REPAIR

No inventar evidencia.

Si falta:

mostrar exactamente qué falta.

---

# 106. UIX — MINUTES

Debe sentirse como documento profesional.

No como formulario administrativo.

---

# 107. READING MODE

Crear modo lectura limpio.

---

# 108. EDIT MODE

Solo mostrar controles cuando se edita.

---

# 109. STICKY OUTLINE

En desktop considerar navegación lateral:

```text
General
Attendance
Quorum
Agenda
Motions
Voting
Decisions
Closure
```

---

# 110. MOBILE MINUTES

Probar:

```text
375x667
390x844
430x932
```

Lectura debe ser excelente.

Edición razonablemente usable.

---

# 111. TABLET

Probar:

```text
768x1024
820x1180
```

---

# 112. DESKTOP

Probar:

```text
1366x768
1440x900
1920x1080
```

---

# 113. PRINT

Probar:

```text
A4
Letter
```

cuando soporte existente lo permita.

---

# 114. ACCESSIBILITY

WCAG 2.2 AA.

Especialmente:

```text
Document navigation
Headings
Tables
Decision status
Timeline
Editor
Dialogs
```

---

# 115. SEMANTIC HTML

Acta debe utilizar estructura:

```html
main
article
section
h1
h2
h3
table
```

apropiadamente.

---

# 116. KEYBOARD

Todo editor/navegación debe funcionar sin mouse.

---

# 117. SCREEN READER

Estructura de headings coherente.

---

# 118. STATUS WITHOUT COLOR

APROBADA/RECHAZADA debe incluir texto/iconografía.

---

# 119. PERFORMANCE

No hacer 100 consultas para construir expediente.

---

# 120. EVIDENCE QUERY

Diseñar proyección/query eficiente.

---

# 121. N+1

Buscar N+1 en:

```text
Attendance
Representations
Agenda
Motions
Voting
Decisions
```

---

# 122. LARGE ASSEMBLY DATASET

Aunque piloto sea 8 personas:

probar generación con dataset mayor sintético.

Ejemplo:

```text
300 participants
20 agenda items
30 motions
30 voting sessions
```

Objetivo:

detectar problemas de generación/render.

NO afirmar por esto que videoconferencia soporta 300.

---

# 123. GENERATION PERFORMANCE

Medir:

```text
Evidence build
Minutes generation
HTML rendering
PDF generation
```

si PDF existe.

---

# 124. ASYNC GENERATION

Solo usar procesamiento asíncrono si realmente necesario.

No complicar piloto sin evidencia.

---

# 125. 8-USER E2E

Ejecutar nuevamente una Asamblea completa.

---

# 126. E2E CLOSURE FLOW

```text
LOGIN 8 USERS
 ↓
CHECK-IN
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
VOTE
 ↓
DECISION
 ↓
MULTIPLE AGENDA ITEMS
 ↓
END ASSEMBLY
 ↓
VERIFY FINAL SNAPSHOT
 ↓
OPEN COMPLETION SCREEN
 ↓
OPEN EVIDENCE
 ↓
OPEN TIMELINE
 ↓
OPEN DECISIONS
 ↓
GENERATE MINUTES
 ↓
REVIEW MINUTES
 ↓
VERIFY SYSTEM FACTS
 ↓
PRINT
 ↓
PDF IF SUPPORTED
 ↓
VERIFY DATABASE
```

---

# 127. DATA CROSS-CHECK

Seleccionar aleatoriamente:

```text
3 participants
2 quorum snapshots
2 motions
2 voting sessions
2 decisions
```

Comparar:

```text
DB
API
Evidence
Minutes
PDF
```

Todo debe coincidir.

---

# 128. SECRET VOTE TEST

Crear voto secreto.

Después buscar selección individual en:

```text
Minutes
Evidence
Timeline
Audit UI
PDF
Logs
```

No debe aparecer donde esté prohibido.

---

# 129. POST-CLOSE ATTACK TEST

Intentar:

```text
CastVote
OpenVoting
ChangeAgenda
Accredit
PresentMotion
```

después de CLOSED.

Backend debe rechazar.

---

# 130. CONCURRENT MINUTES EDIT

Si aplica:

President + Secretary editan.

No overwrite silencioso.

---

# 131. VERSION TEST

Crear cambios.

Verificar historial.

---

# 132. FINALIZATION TEST

Marcar FINAL.

Intentar editar.

Debe respetar política.

---

# 133. BROWSER CONSOLE

Objetivo:

```text
Unexpected errors = 0
Unhandled Promise Rejections = 0
```

---

# 134. NETWORK

Objetivo:

```text
Unexpected 404 = 0
Unexpected 500 = 0
```

---

# 135. PDF TEST

Si existe:

abrir archivo generado.

No basta verificar HTTP 200.

Revisar visualmente:

```text
Typography
Page breaks
Tables
Long text
Motion
Results
Footer
Headers
```

---

# 136. PRINT TEST

Usar Browser Print Preview.

Revisar visualmente.

---

# 137. HUMAN TEST

Después de Asamblea piloto:

dar expediente a una persona que no participó.

Preguntar:

```text
¿Puedes entender qué ocurrió?

¿Quién asistió?

¿Hubo quórum?

¿Qué se discutió?

¿Qué se votó?

¿Qué decisiones se tomaron?

¿En qué orden ocurrió?
```

---

# 138. SUCCESS CRITERION

La persona debe reconstruir razonablemente la Asamblea sin explicación del desarrollador.

---

# 139. DOCUMENTATION

Crear:

```text
docs/AUDIT/EO-008/
```

con:

```text
00-AS-IS.md
01-EVIDENCE-MODEL.md
02-CLOSURE.md
03-ATTENDANCE-EVIDENCE.md
04-QUORUM-EVIDENCE.md
05-AGENDA-EVIDENCE.md
06-MOTION-EVIDENCE.md
07-VOTING-EVIDENCE.md
08-DECISION-REGISTER.md
09-MINUTES.md
10-VERSIONING.md
11-EVIDENCE-CENTER.md
12-TIMELINE.md
13-EXPORT-PRINT-PDF.md
14-SECURITY.md
15-UIX-UIA.md
16-ACCESSIBILITY.md
17-PERFORMANCE.md
18-E2E.md
19-DATABASE-CROSSCHECK.md
20-HUMAN-TEST.md
21-KNOWN-LIMITATIONS.md
EO-008-COMPLETION-REPORT.md
```

---

# 140. CERTIFICATION MATRIX

Reportar:

```text
Assembly Closure
Final Snapshot
Post-Close Protection

Attendance Evidence
Representation Evidence
Power Evidence
Quorum Evidence
Agenda Evidence
Speaker Evidence
Motion Evidence
Voting Evidence
Decision Evidence

Decision Register
Decision Traceability

Minutes Generation
Minutes Structure
Protected Facts
Editable Narrative
Versioning
Finalization

Evidence Center
Timeline
Audit Separation
Completeness Check

HTML Print
PDF
Secret Vote Privacy

Multi-Tenant
Cross-Assembly
IDOR
Authorization
XSS

Mobile
Tablet
Desktop
Print
Accessibility

Performance
Large Dataset

E2E 8 Users
Database Cross-Check
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

# 141. ZERO-TOLERANCE GATE

Para certificar:

```text
Incorrect vote result in minutes        0
Incorrect quorum in minutes             0
Incorrect decision                      0
Lost motion                             0
Lost voting evidence                    0
Secret vote leakage                     0
Cross-tenant evidence leakage           0
Cross-assembly evidence leakage         0
Editable protected facts                0
Silent overwrite of final minutes       0
Post-close vote accepted                 0
Post-close agenda change accepted        0
Unexpected 500                           0
Critical print/PDF corruption            0
```

---

# 142. FULL TRACEABILITY TEST

Seleccionar:

```text
DEC-003
```

y reconstruir:

```text
DEC-003
 ↓
Voting Result
 ↓
Voting Session
 ↓
Motion MOT-003
 ↓
Agenda Item 04
 ↓
Quorum Snapshot
 ↓
Eligible Representation
 ↓
Assembly
```

Debe ser posible sin adivinar.

---

# 143. REVERSE TRACEABILITY

Seleccionar:

```text
Agenda Item 04
```

y encontrar:

```text
Interventions
Motions
Voting Sessions
Decisions
Timeline Events
```

---

# 144. TRUST QUESTION

Para cualquier cifra mostrada en acta debemos poder responder:

> ¿De dónde salió?

Ejemplo:

```text
72.84%
```

Debe tener origen verificable.

---

# 145. NO COPY-PASTE MINUTES

El Secretario NO debería tener que copiar manualmente:

```text
attendance
quorum
motion
vote results
decisions
```

del sistema al acta.

El sistema ya posee esos datos.

Debe utilizarlos.

---

# 146. PRODUCT DIFFERENTIATOR

La experiencia deseada es:

```text
END ASSEMBLY
      ↓
FINAL SNAPSHOT
      ↓
EVIDENCE READY
      ↓
DECISIONS READY
      ↓
MINUTES DRAFT READY
```

No:

```text
END ASSEMBLY
      ↓
SECRETARY SPENDS 4 HOURS REBUILDING EVERYTHING
```

---

# 147. CLIENT DEMO GATE

Realizar una demo completa.

Al finalizar Asamblea:

hacer click en:

```text
FINALIZAR ASAMBLEA
```

y demostrar inmediatamente:

```text
Attendance
Quorum
Agenda
Motions
Voting
Decisions
Timeline
Minutes Draft
```

sin intervención técnica.

---

# 148. PRESIDENT GATE

Presidente debe poder revisar rápidamente:

```text
What was decided?
What was the result?
What evidence supports it?
```

---

# 149. SECRETARY GATE

Secretario debe poder abrir el borrador y encontrar:

```text
Attendance already populated
Quorum already populated
Agenda already populated
Motions already populated
Voting already populated
Decisions already populated
```

---

# 150. OWNER GATE

Owner autorizado debe poder consultar posteriormente información pública/permitida sin comprender estructura técnica.

---

# 151. PRODUCT QUALITY QUESTION

Después de ejecutar EO-008:

pregúntate:

> ¿Puede el sistema demostrar qué ocurrió durante la Asamblea sin depender de la memoria de una persona?

Si:

```text
NO
```

# EO-008 NOT CERTIFIED.

---

# 152. SECOND QUALITY QUESTION

> ¿Puede una persona que no estuvo en la Asamblea leer el expediente y entender razonablemente qué ocurrió y qué se decidió?

Si:

```text
NO
```

# EO-008 NOT CERTIFIED.

---

# 153. THIRD QUALITY QUESTION

> ¿Coinciden los datos críticos entre PostgreSQL, API, UI, expediente, acta y PDF?

Si:

```text
NO
```

# EO-008 NOT CERTIFIED.

---

# 154. FINAL EXECUTION COMMAND

Empieza ahora.

Primero:

# RUN A COMPLETE ASSEMBLY.

Después:

# INSPECT WHAT THE SYSTEM ACTUALLY KNOWS.

Luego:

```text
AUDIT
 ↓
EVIDENCE MODEL
 ↓
HISTORICAL SNAPSHOTS
 ↓
CLOSURE
 ↓
DECISION REGISTER
 ↓
TIMELINE
 ↓
MINUTES GENERATION
 ↓
MINUTES REVIEW
 ↓
VERSIONING
 ↓
EVIDENCE CENTER
 ↓
PRINT
 ↓
PDF
 ↓
SECURITY
 ↓
UIX/UIA
 ↓
ACCESSIBILITY
 ↓
PERFORMANCE
 ↓
8-USER E2E
 ↓
DATABASE CROSS-CHECK
 ↓
HUMAN REVIEW
 ↓
CERTIFICATION
```

NO agregues IA.

NO inventes narrativas.

NO agregues blockchain.

NO agregues nuevos módulos empresariales.

NO cambies stack.

NO hardcodees resultados.

NO recalcules historia con datos actuales.

NO permitas editar hechos estructurados críticos.

NO expongas voto secreto.

NO declares PDF PASS sin abrirlo.

NO declares Evidence PASS sin comparar DB.

NO declares Minutes PASS porque el HTML se ve bonito.

NO declares 100/100 si faltan pruebas.

# THE DATABASE PRESERVES FACTS.

# THE EVIDENCE MODEL CONNECTS THEM.

# THE MINUTES EXPLAIN THEM.

# THE TIMELINE ORDERS THEM.

# THE DECISION REGISTER MAKES THEM ACTIONABLE.

# THE UI MAKES THEM UNDERSTANDABLE.

---

# 155. DEFINITION OF DONE

EO-008 termina únicamente cuando una Asamblea completa pueda finalizar y automáticamente producir un expediente coherente que permita demostrar:

```text
WHO ATTENDED
WHAT THEY REPRESENTED
WHAT QUORUM EXISTED
WHAT WAS DISCUSSED
WHO INTERVENED
WHAT MOTIONS WERE PRESENTED
WHAT WAS VOTED
WHAT RESULTS OCCURRED
WHAT DECISIONS WERE MADE
WHEN EVERYTHING HAPPENED
```

y cuando:

```text
PostgreSQL
API
UI
Evidence
Minutes
PDF
```

muestren la misma verdad.

El Secretario debe pasar de:

# RECONSTRUIR LA ASAMBLEA

a:

# REVISAR LA ASAMBLEA QUE EL SISTEMA YA DOCUMENTÓ.

Ese es el estándar de EO-008.

# CAPTURE THE FACTS.
# PRESERVE THE EVIDENCE.
# CONNECT EVERY DECISION.
# GENERATE THE MINUTES.
# PROTECT THE HISTORY.
# PROVE THE RESULT.