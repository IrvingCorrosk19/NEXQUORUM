# ASAMBLEAS — ULTRA PREMIUM UI/UX/UIA REDESIGN
## COMPLETE VISUAL TRANSFORMATION · DESIGN SYSTEM · ASSEMBLY COMMAND CENTER · RESPONSIVE · ACCESSIBILITY · ZERO FUNCTIONAL REGRESSION

**PRIORIDAD:** P0 PRODUCT EXPERIENCE  
**SCOPE:** TODA LA APLICACIÓN ASAMBLEAS  
**MODO:** AUDIT → DESIGN SYSTEM → REDESIGN → IMPLEMENT → BROWSER TEST → REFINE → DEPLOY  
**REGLA:** NO QUIERO UN MOCKUP. QUIERO LA APLICACIÓN REAL REDISEÑADA.

---

# 1. OBJETIVO

La aplicación funciona, pero visualmente todavía parece:

- prototipo;
- formulario administrativo;
- aplicación interna;
- MVP;
- interfaz genérica.

Eso debe terminar.

Quiero transformar ASAMBLEAS en una plataforma que visualmente pueda competir con software SaaS premium internacional.

La experiencia debe transmitir inmediatamente:

**GOBERNANZA · SEGURIDAD · CONFIANZA · AUTORIDAD · TRANSPARENCIA · TECNOLOGÍA · TIEMPO REAL**

---

# 2. REGLA FUNDAMENTAL

NO REDISEÑES ÚNICAMENTE EL LOGIN.

Audita y transforma TODA la experiencia:

```text
Login
Dashboard
Asambleas
Crear/Configurar Asamblea
Detalle
Acreditación
Asistencia
Representaciones/Poderes
Quórum
Lobby
Sala virtual
Agenda
Intervenciones
Mociones
Votaciones
Resultados
Decisiones
Participantes
Videoconferencia
Evidencias
Timeline
Actas
Reportes
Cierre
Estados vacíos
Errores
Loading
Reconnect
Mobile
Tablet
Desktop
```

Debe sentirse como **UN SOLO PRODUCTO**.

---

# 3. NO ROMPER FUNCIONALIDAD

P0:

NO modificar innecesariamente:

```text
Business Rules
Quorum Engine
Voting Engine
Tenant Isolation
Authorization
Assembly State Machine
SignalR Contracts
LiveKit Contracts
Database Schema
Evidence Integrity
Audit
```

El rediseño NO puede romper funcionalidad ya existente.

Antes de modificar una vista, entiende:

```text
qué hace
quién la usa
qué acciones contiene
qué endpoints consume
qué estados maneja
qué permisos requiere
```

---

# 4. VISUAL DIRECTION

Quiero una estética:

**Executive Governance SaaS**

No quiero una copia literal de ninguna plataforma.

Características:

```text
Dark premium navy
Deep blue/charcoal surfaces
Elegant teal/cyan interaction accents
Subtle warm gold accents for authority/important states
Soft gradients
Controlled glass effects
Excellent typography
Generous spacing
Elegant shadows
Premium borders
Subtle glow
Strong hierarchy
Microinteractions
Excellent data visualization
```

Evitar apariencia:

```text
Bootstrap default
AdminLTE
generic dashboard template
cheap gradient
casino
gaming
crypto
neon overload
huge cards everywhere
excessive glassmorphism
```

---

# 5. DESIGN TOKENS

Crear sistema centralizado de tokens.

Ejemplo conceptual:

```css
--surface-base
--surface-elevated
--surface-overlay

--text-primary
--text-secondary
--text-muted

--accent-primary
--accent-secondary
--accent-authority

--success
--warning
--danger
--info

--border-subtle
--border-strong

--shadow-sm
--shadow-md
--shadow-lg

--radius-sm
--radius-md
--radius-lg
--radius-xl

--space-1 ...
--space-12
```

NO dispersar colores arbitrarios por cientos de CSS.

---

# 6. TYPOGRAPHY

Crear jerarquía tipográfica consistente:

```text
Display
H1
H2
H3
Section Title
Body
Secondary
Caption
Label
Metric
Status
```

El nombre:

# ASAMBLEAS

puede conservar un tratamiento institucional/editorial distintivo.

El resto debe utilizar tipografía moderna altamente legible.

---

# 7. APP SHELL

Crear shell profesional.

Desktop:

```text
┌──────────────────────────────────────────────────────────────┐
│ Brand          Search              Notifications   User      │
├─────────────┬────────────────────────────────────────────────┤
│             │                                                │
│ Navigation  │                Workspace                       │
│             │                                                │
│             │                                                │
└─────────────┴────────────────────────────────────────────────┘
```

Pero durante una Asamblea activa, usar una experiencia especializada.

---

# 8. SIDEBAR

Sidebar premium:

- logo;
- tenant/PH;
- navegación agrupada;
- estado activo claro;
- iconografía consistente;
- tooltips;
- collapse;
- keyboard navigation.

No llenar la navegación de opciones irrelevantes.

---

# 9. TOP BAR

Debe manejar:

```text
Context
Assembly
Search
Realtime connection
Notifications
User
Role
```

sin saturación.

---

# 10. LOGIN — REDISEÑO TOTAL

Eliminar apariencia actual de formulario blanco básico.

Desktop:

```text
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│       BRAND / VALUE                    LOGIN                 │
│                                                              │
│       ASAMBLEAS                        Bienvenido             │
│       Gobernanza                       Correo                 │
│       Quórum                           Contraseña             │
│       Decisiones                       Entrar                 │
│                                                              │
│       Seguridad · Tiempo real          Demo accounts         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

Debe verse extraordinario.

---

# 11. DEMO ACCOUNTS

Actualmente las cuentas demo dominan visualmente el login.

Corregir.

Moverlas a:

```text
Modo demostración
```

mediante:

- accordion;
- drawer;
- modal;
- panel secundario.

No deben competir con el login principal.

Y JAMÁS mostrar password en URL.

---

# 12. LOGIN SECURITY UX

Mostrar confianza mediante diseño, no mediante párrafos técnicos.

Ejemplo conceptual:

```text
🔒 Conexión segura
```

No llenar login con explicaciones de implementación.

---

# 13. DASHBOARD

Debe responder rápidamente:

```text
¿Qué Asamblea viene?
¿Cuál está activa?
¿Cuántos propietarios están acreditados?
¿Tenemos quórum?
¿Qué decisiones están pendientes?
```

No simplemente mostrar tarjetas decorativas.

---

# 14. METRICS

Diseñar métricas premium.

Ejemplo:

```text
QUÓRUM ACTUAL
72.84%

████████████████░░░░

Requerido 66.67%
+6.17 pp sobre mínimo

38 / 52 unidades representadas
```

La visualización debe ayudar a tomar decisiones.

---

# 15. QUORUM HERO

El quórum es una de las funciones estrella.

Debe tener un componente visual distintivo.

Mostrar:

```text
percentage
threshold
represented coefficient
units
participants
status
last update
```

No solo un número grande.

---

# 16. REALTIME

Cuando cambie:

```text
Attendance
Quorum
Agenda
Speaker
Motion
Voting
Decision
```

usar microanimaciones discretas.

No refresh completo.

---

# 17. ASSEMBLY COMMAND CENTER

La pantalla más importante NO debe parecer otro CRUD.

Crear:

# ASSEMBLY COMMAND CENTER

Conceptualmente:

```text
┌──────────────────────────────────────────────────────────────┐
│ ASAMBLEA ORDINARIA          ● EN VIVO      01:42:18         │
│ PH Ocean Residences                                         │
├──────────────────────────────────────────────┬───────────────┤
│                                              │ QUÓRUM        │
│                                              │ 72.84%        │
│             MAIN STAGE                       │               │
│                                              │ PRESENTES 38  │
│ Agenda / Video / Motion / Voting             │               │
│                                              │ CONNECTION ●  │
├──────────────────────────────────────────────┼───────────────┤
│ Punto actual                                 │ INTERVENCIONES│
│ 03 · Presupuesto 2027                        │ 1 Ana         │
│                                              │ 2 Carlos      │
├──────────────────────────────────────────────┴───────────────┤
│             CONTEXTUAL ACTION BAR                            │
└──────────────────────────────────────────────────────────────┘
```

---

# 18. ROLE-AWARE COMMAND CENTER

President, Secretary y Owner NO necesitan exactamente la misma interfaz.

## President

Priorizar:

```text
Quorum
Current Agenda
Speaker Queue
Motion
Voting Control
Decision
Next Action
```

## Secretary

Priorizar:

```text
Attendance
Evidence
Agenda
Motion
Decision
Timeline
Minutes
```

## Owner

Priorizar:

```text
Current Agenda
Video
Request to Speak
Queue Position
Motion
Vote
Result
```

---

# 19. NEXT BEST ACTION

La interfaz debe orientar.

Ejemplo:

```text
Estado:
Punto 4 en discusión

Siguiente acción disponible:
[ Abrir votación ]
```

No obligar al Presidente a adivinar qué hacer.

---

# 20. AGENDA TIMELINE

Transformar agenda en timeline visual.

```text
✓ 01 Apertura
✓ 02 Informe financiero
● 03 Presupuesto
○ 04 Elección Junta Directiva
○ 05 Cierre
```

Estados claros.

---

# 21. SPEAKER QUEUE

Diseñar cola visual premium:

```text
INTERVENCIONES

🎙 EN USO
María Rodríguez
Unidad 302
01:48

EN ESPERA

1  Carlos Pérez       U-504
2  Ana Martínez       U-208
3  José Gómez         U-701
```

---

# 22. REQUEST TO SPEAK

Para Owner:

botón prominente:

```text
🎙 SOLICITAR LA PALABRA
```

Después:

```text
✓ Solicitud recibida
Posición #3
```

---

# 23. VOTING EXPERIENCE

La votación debe ser una experiencia excelente.

Ejemplo:

```text
VOTACIÓN ABIERTA

Aprobación presupuesto extraordinario

Mayoría requerida
66.67%

Tu coeficiente
2.381%

[ A FAVOR ]

[ EN CONTRA ]

[ ABSTENCIÓN ]
```

---

# 24. VOTE CONFIRMATION

Después:

```text
✓ VOTO REGISTRADO

Tu participación fue recibida correctamente.

Esperando cierre de votación…
```

No permitir doble envío.

---

# 25. VOTING RESULTS

Resultados premium.

Mostrar:

```text
APROBADO

A favor       71.23%
En contra     21.15%
Abstención     7.62%

Mayoría requerida
66.67%
```

y representación visual accesible.

---

# 26. SECRET VOTING

Cuando voto sea secreto:

NO mostrar información que permita inferir selección individual.

UX debe indicarlo claramente:

```text
🔒 Votación secreta
```

---

# 27. DECISIONS

Crear Decision Cards:

```text
DECISIÓN #004

Presupuesto extraordinario

APROBADO

71.23% a favor

Adoptada
9 Ago 2026 · 7:42 PM

Ver evidencia →
```

---

# 28. VIDEO CONFERENCE

La videoconferencia debe integrarse naturalmente al Command Center.

No parecer:

```text
iframe agregado al final
```

Diseñar:

```text
Main speaker
Participant grid
Speaker indicator
Mute/camera
Connection quality
Fullscreen
Screen share if supported
```

---

# 29. GOVERNANCE OVER VIDEO

Nunca permitir que el video domine la gobernanza.

Siempre debe ser fácil saber:

```text
Agenda
Quorum
Motion
Voting
Decision
```

aunque la videoconferencia esté activa.

---

# 30. PARTICIPANT CARDS

Mostrar solo información útil:

```text
Name
Unit
Role
Attendance
Representation
Speaking state
Connection state
```

No saturar.

---

# 31. CONNECTION STATUS

Crear indicador elegante:

```text
● En vivo
● Sincronizado
◐ Reconectando
○ Sin conexión
```

---

# 32. LOADING SYSTEM

Implementar el Premium Loading System ya solicitado.

Debe existir:

```text
Global Loader
Section Loader
Skeleton
Button Loader
Realtime State
Reconnect State
Video Connection State
```

---

# 33. BRAND LOADER

Crear animación ligera inspirada en:

```text
participants
assembly circle
quorum
decision
```

No spinner genérico.

---

# 34. EMPTY STATES

No:

```text
No records found
```

Crear estados útiles.

Ejemplo:

```text
Aún no hay solicitudes de palabra.

Cuando un participante solicite intervenir,
aparecerá aquí automáticamente.
```

---

# 35. ERROR STATES

No mostrar:

```text
Error 500
Something went wrong
```

Diseñar estados comprensibles y recuperables.

---

# 36. TOASTS

Sistema uniforme:

```text
Success
Info
Warning
Error
Realtime
```

No `alert()` JavaScript.

---

# 37. MODALS

Eliminar modales innecesarios.

Para acciones críticas:

```text
Cerrar votación
Finalizar Asamblea
Eliminar
Invalidar
```

usar confirmación clara.

---

# 38. DANGEROUS ACTIONS

Ejemplo:

```text
FINALIZAR ASAMBLEA

Esta acción cerrará definitivamente la sesión.

Después del cierre no podrán registrarse nuevos votos.

[ Cancelar ]

[ Finalizar Asamblea ]
```

---

# 39. FORMS

Mejorar todos:

```text
labels
help text
validation
errors
spacing
focus
required states
```

---

# 40. VALIDATION UX

No mostrar errores visualmente pobres.

Usar:

```text
field-level validation
summary when useful
clear corrective message
focus management
```

---

# 41. TABLES

Tablas administrativas deben ser modernas.

Incluir según necesidad:

```text
search
filter
sort
pagination
sticky header
status
responsive behavior
```

No meter 15 columnas en móvil.

---

# 42. MOBILE FIRST FOR OWNERS

El propietario probablemente participará desde teléfono.

Por tanto Owner UX debe ser extraordinaria en móvil.

Priorizar:

```text
Join
Video
Agenda
Speak
Vote
Result
```

---

# 43. MOBILE BOTTOM ACTION BAR

Durante Asamblea:

considerar:

```text
Agenda
Hablar
Votar
Participantes
Más
```

según estado y rol.

---

# 44. TOUCH TARGETS

Mínimo apropiado para interacción táctil.

---

# 45. RESPONSIVE BREAKPOINTS

Probar al menos:

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

# 46. NO HORIZONTAL SCROLL

En páginas principales:

```text
unexpected horizontal scroll = 0
```

---

# 47. ACCESSIBILITY

Target:

# WCAG 2.2 AA

Verificar:

```text
contrast
keyboard
focus
ARIA
screen reader semantics
dialogs
forms
live regions
reduced motion
touch targets
```

---

# 48. COLOR IS NOT STATE

Nunca depender solo de:

```text
green
red
yellow
```

Agregar:

```text
text
icon
shape
status
```

---

# 49. MICROINTERACTIONS

Agregar donde mejoren comprensión:

```text
button press
vote confirmed
quorum change
speaker granted
agenda transition
decision created
reconnect
```

No animar por decorar.

---

# 50. PERFORMANCE

El rediseño NO debe convertir la aplicación en algo pesado.

Evitar:

```text
huge JS frameworks if unnecessary
massive animation libraries
large videos
oversized images
unoptimized assets
```

---

# 51. ECMASCRIPT

Mantener arquitectura frontend actual y utilizar ECMAScript moderno soportado por el target.

No introducir framework completo únicamente para conseguir estética.

---

# 52. CSS ARCHITECTURE

Organizar estilos.

No crear:

```text
5000-line overrides.css
```

Crear componentes/tokens/utilidades coherentes con la arquitectura actual.

---

# 53. ICONOGRAPHY

Una sola familia visual.

No mezclar:

```text
emoji
Bootstrap icons
FontAwesome
random SVG
material
```

sin criterio.

---

# 54. REMOVE VISUAL DEBT

Buscar:

```text
inline style
duplicate CSS
!important
hardcoded colors
random margins
random font sizes
Bootstrap defaults
```

Refactorizar prudentemente.

---

# 55. DEMO VS PRODUCTION

La experiencia demo debe estar claramente separada.

Las cuentas demo NO deben parecer parte del producto de producción.

---

# 56. SCREENSHOT BASELINE

ANTES de modificar:

capturar screenshots de todas las vistas principales.

Crear baseline.

---

# 57. VISUAL INVENTORY

Crear:

```text
docs/UIUX/AS-IS-VISUAL-INVENTORY.md
```

con:

```text
Route
Role
Current issue
Severity
Redesign action
Status
```

---

# 58. DESIGN SYSTEM DOCUMENT

Crear:

```text
docs/UIUX/ASAMBLEAS-DESIGN-SYSTEM.md
```

Documentar:

```text
colors
typography
spacing
radius
elevation
buttons
forms
cards
tables
modals
status
loading
skeleton
navigation
charts
responsive
accessibility
```

---

# 59. COMPONENT INVENTORY

Evitar crear cinco versiones diferentes del mismo componente.

Reutilizar:

```text
Button
Input
Select
Card
Metric
Badge
Avatar
Status
Dialog
Toast
Skeleton
Loader
EmptyState
Timeline
DataTable
```

según stack existente.

---

# 60. BROWSER IMPLEMENTATION REVIEW

Después de cada área importante:

ABRIRLA EN BROWSER.

No aceptar que CSS compile como prueba de calidad.

---

# 61. VISUAL QA

Revisar:

```text
alignment
spacing
typography
contrast
overflow
truncation
responsive
focus
hover
active
disabled
loading
empty
error
success
```

---

# 62. REAL DATA QA

No probar únicamente:

```text
John Doe
Test
Lorem ipsum
```

Usar dataset realista:

```text
long PH names
long owner names
multiple units
large agenda
many participants
long motion titles
```

---

# 63. 8-PERSON ASSEMBLY UX TEST

Con dataset piloto:

```text
1 President
1 Secretary
6 Owners
```

ejecutar visualmente el flujo completo.

---

# 64. PRESIDENT UX E2E

Desde Browser:

```text
Login
Dashboard
Assembly
Accreditation
Quorum
Start
Agenda
Speaker
Motion
Voting
Result
Decision
Close
Evidence
Minutes
```

---

# 65. OWNER MOBILE UX E2E

Desde viewport móvil:

```text
Login
Join
Lobby
Assembly
Video
Agenda
Request Speak
Vote
Confirmation
Result
Reconnect
```

---

# 66. SECRETARY UX E2E

Validar su flujo real.

---

# 67. LOADING QA

Cada operación async debe tener feedback apropiado.

No:

```text
click
nothing happens
2 seconds
page suddenly changes
```

---

# 68. PERCEIVED PERFORMANCE

Usar:

```text
optimistic UI ONLY where safe
skeletons
progressive rendering
realtime updates
```

Pero:

# NUNCA OPTIMISTIC SUCCESS PARA VOTOS.

El voto se considera registrado solamente después de confirmación backend.

---

# 69. SECURITY MUST REMAIN

Después del rediseño volver a comprobar:

```text
credentials in URL = 0
password in browser storage = 0
authorization regression = 0
cross-tenant leakage = 0
```

---

# 70. NO FAKE UI

Todo componente que parezca funcional:

# DEBE SER FUNCIONAL.

No crear:

```text
fake search
fake notifications
fake filters
fake settings
fake video controls
fake metrics
fake buttons
```

Si no existe backend/función:

no mostrarlo como operativo.

---

# 71. NO FAKE METRICS

Cada número mostrado debe tener fuente real.

---

# 72. DATA CONSISTENCY

Quorum mostrado en:

```text
Dashboard
Command Center
President
Secretary
Projector
Owner
```

debe representar el mismo estado autorizado.

---

# 73. PROJECTOR / PRESENTATION MODE

Si ya existe o está dentro del scope implementado:

darle diseño excepcional.

Debe poder proyectarse en pantalla grande mostrando:

```text
Assembly
Agenda
Quorum
Motion
Voting
Result
Decision
```

sin información administrativa innecesaria.

---

# 74. PRESENTATION MODE

Optimizar para:

```text
1920x1080
```

y lectura a distancia.

---

# 75. VISUAL SIGNATURE

ASAMBLEAS necesita identidad propia.

Quiero que al ver una captura alguien pueda reconocer:

# “ESO ES ASAMBLEAS.”

No un dashboard genérico.

Crear una firma visual basada en:

```text
Assembly circle
Governance
Consensus
Quorum
Decision
Institutional authority
```

de forma elegante y original.

---

# 76. QUALITY BAR

Antes de declarar terminado, pregúntate:

```text
¿Parece un MVP?
¿Parece una plantilla?
¿Parece un proyecto universitario?
¿Parece un CRUD administrativo?
```

Si cualquiera es YES:

# NO TERMINASTE.

---

# 77. COMPARATIVE QUALITY BAR

Sin copiar diseños, evalúa la calidad contra productos SaaS modernos de primer nivel en:

```text
visual hierarchy
clarity
spacing
interaction
navigation
feedback
responsive
accessibility
perceived quality
```

Nuestro objetivo:

# ENTERPRISE PREMIUM.

---

# 78. NO BEAUTY WITHOUT USABILITY

No sacrificar:

```text
readability
speed
discoverability
accessibility
information density
```

por estética.

---

# 79. REDESIGN LOOP

Para cada pantalla:

```text
INSPECT
 ↓
IDENTIFY USER GOAL
 ↓
REDESIGN
 ↓
IMPLEMENT
 ↓
OPEN IN BROWSER
 ↓
TEST
 ↓
SCREENSHOT
 ↓
CRITIQUE
 ↓
REFINE
```

Mínimo una iteración de crítica visual después de implementación.

---

# 80. DO NOT STOP AFTER FIRST PASS

La primera versión NO se considera final.

Revisar nuevamente toda la aplicación buscando inconsistencias.

---

# 81. GLOBAL CONSISTENCY PASS

Al finalizar:

comparar todas las vistas simultáneamente.

Detectar:

```text
different button styles
different card radius
different headings
different spacing
different status colors
different table styles
different form styles
```

Corregir.

---

# 82. SCREENSHOT EVIDENCE

Crear evidencia BEFORE / AFTER para vistas principales.

No incluir secretos.

---

# 83. FUNCTIONAL REGRESSION

Después del rediseño ejecutar:

```text
dotnet build -c Release
dotnet test -c Release
Playwright
Browser E2E
```

---

# 84. ZERO FUNCTIONAL REGRESSION

Target:

```text
Broken workflows = 0
Dead buttons = 0
New console errors = 0
Unexpected 404 = 0
Unexpected 500 = 0
```

---

# 85. DEPLOY TO VPS

Una vez aprobado localmente:

```text
BUILD
TEST
PUBLISH
BACKUP
DEPLOY
RESTART
HEALTH
BROWSER VPS TEST
```

Desplegar sobre el VPS actual de ASAMBLEAS.

No destruir DB.

---

# 86. VPS VISUAL QA

IMPORTANTE:

abrir la URL REAL desplegada.

No asumir que porque local se ve bien producción también.

Probar Desktop + Mobile.

---

# 87. CACHE

Después de deployment:

manejar correctamente versionado/cache de CSS/JS para evitar que usuarios reciban diseño viejo.

---

# 88. FINAL UX SCORECARD

Evaluar honestamente 0-100:

```text
Brand Identity
Visual Design
Information Architecture
Navigation
President UX
Secretary UX
Owner UX
Assembly Command Center
Voting UX
Quorum UX
Video UX
Loading UX
Realtime UX
Mobile UX
Responsive
Accessibility
Consistency
Error Handling
Perceived Performance
Enterprise Readiness
```

---

# 89. NO INFLATED SCORES

95+ requiere evidencia.

100 significa que no encontraste ningún gap relevante dentro del alcance evaluado.

---

# 90. FINAL REPORT

Crear:

```text
docs/UIUX/
ASAMBLEAS-PREMIUM-REDESIGN-CERTIFICATION.md
```

---

# 91. FINAL RESPONSE

Responder:

```text
ASAMBLEAS — PREMIUM UI/UX REDESIGN

DESIGN SYSTEM
PASS / FAIL

LOGIN
PASS / FAIL

APP SHELL
PASS / FAIL

DASHBOARD
PASS / FAIL

ASSEMBLY COMMAND CENTER
PASS / FAIL

ACCREDITATION
PASS / FAIL

ATTENDANCE
PASS / FAIL

QUORUM UX
PASS / FAIL

AGENDA
PASS / FAIL

SPEAKER UX
PASS / FAIL

MOTIONS
PASS / FAIL

VOTING UX
PASS / FAIL

DECISIONS
PASS / FAIL

VIDEO UX
PASS / FAIL

EVIDENCE
PASS / FAIL

MINUTES
PASS / FAIL

LOADING
PASS / FAIL

REALTIME UX
PASS / FAIL

MOBILE
PASS / FAIL

TABLET
PASS / FAIL

DESKTOP
PASS / FAIL

ACCESSIBILITY
PASS / FAIL

VISUAL CONSISTENCY
PASS / FAIL

SECURITY REGRESSION
PASS / FAIL

FUNCTIONAL REGRESSION
PASS / FAIL

BROWSER E2E
PASS / FAIL

VPS DEPLOYMENT
PASS / FAIL

P0 UX:
P1 UX:
P2 UX:

FINAL UI/UX SCORE:
XX/100

PUBLIC URL:
<URL WITHOUT CREDENTIALS>

COMMIT:
<sha>

FINAL VERDICT:
ENTERPRISE PREMIUM / REQUIRES REMEDIATION
```

---

# 92. EXECUTE

NO me entregues Figma.

NO me entregues solamente screenshots.

NO me entregues otro plan.

NO rediseñes solamente Login.

NO instales una plantilla administrativa y digas que terminaste.

NO copies literalmente otro producto.

NO sacrifiques funcionalidad por estética.

NO inventes botones que no funcionan.

NO inventes métricas.

NO rompas seguridad.

NO rompas multitenancy.

NO rompas SignalR.

NO rompas LiveKit.

# REDISEÑA LA APLICACIÓN REAL.

# CREA EL DESIGN SYSTEM.

# TRANSFORMA EL LOGIN.

# TRANSFORMA EL DASHBOARD.

# CONSTRUYE UN ASSEMBLY COMMAND CENTER EXCEPCIONAL.

# HAZ QUE VOTAR SEA EXCELENTE.

# HAZ QUE EL QUÓRUM SEA VISUALMENTE INCONFUNDIBLE.

# HAZ QUE EL PRESIDENTE PUEDA DIRIGIR LA ASAMBLEA SIN CONFUSIÓN.

# HAZ QUE EL PROPIETARIO PUEDA PARTICIPAR PERFECTAMENTE DESDE SU TELÉFONO.

# HAZ QUE VIDEO + GOBERNANZA SE SIENTAN COMO UNA SOLA EXPERIENCIA.

# IMPLEMENTA LOADING PREMIUM.

# PRUÉBALO TODO EN BROWSER.

# CRITICA TU PROPIO RESULTADO.

# REFINA.

# EJECUTA REGRESIÓN.

# DESPLIEGA AL VPS.

Cuando termine, la captura actual debe parecer claramente la versión antigua del producto.

ASAMBLEAS debe verse y sentirse como una plataforma comercial seria, moderna y premium.

EXECUTE NOW.