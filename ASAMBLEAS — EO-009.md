# ASAMBLEAS — EO-009
# VIRTUAL & HYBRID ASSEMBLY EXPERIENCE EXCELLENCE
## VIDEO CONFERENCE + MEDIA RESILIENCE + LOBBY + DEVICE CONTROL + REALTIME GOVERNANCE

**Execution Order:** EO-009  
**Producto:** ASAMBLEAS  
**Dominio:** Virtual / Hybrid Assembly / Video Conference  
**Prioridad:** P0 — CORE EXPERIENCE  
**Dependencias:** EO-001 → EO-008  
**Proveedor inicial:** LiveKit o implementación existente mediante `IMeetingProvider`  
**Stack:** .NET Core + PostgreSQL + HTML + CSS + ECMAScript 2025 + SignalR + WebRTC/LiveKit  
**Objetivo piloto:** 8 participantes reales  
**Regla:** NO EXPANDIR FUERA DEL MÓDULO ASAMBLEA.

---

# 0. MISIÓN

Transformar la sala virtual existente en una experiencia profesional, resiliente y completamente integrada con la gobernanza de ASAMBLEAS.

No quiero:

# VIDEO CALL + VOTING PAGE.

Quiero:

# DIGITAL ASSEMBLY ROOM.

La experiencia debe integrar:

```text id="qes0js"
IDENTITY
 ↓
ACCREDITATION
 ↓
LOBBY
 ↓
DEVICE CHECK
 ↓
JOIN
 ↓
MEDIA
 ↓
PRESENCE
 ↓
QUORUM
 ↓
AGENDA
 ↓
SPEAKER MANAGEMENT
 ↓
MOTIONS
 ↓
VOTING
 ↓
DECISIONS
 ↓
CLOSURE
```

sin que el usuario perciba sistemas separados.

---

# 1. PRINCIPIO FUNDAMENTAL

Mantener estrictamente separados:

```text id="yavxmk"
MEDIA STATE
```

y

```text id="nbl225"
GOVERNANCE STATE
```

Ejemplo:

```text id="5dpvlm"
LiveKit disconnected
```

NO significa automáticamente:

```text id="qw7l98"
Owner removed from legal attendance
```

Ese significado lo determina Attendance/Presence Engine según reglas configuradas.

---

# 2. SECOND FUNDAMENTAL RULE

LiveKit/WebRTC NO controla:

```text id="c4tg5h"
Accreditation
Representation
Quorum
Voting eligibility
Vote
Decision
```

Es infraestructura audiovisual.

ASAMBLEAS conserva autoridad de negocio.

---

# 3. AUDIT FIRST

Antes de modificar:

ejecutar una reunión real actual.

Usar:

```text id="88c0d5"
1 President
1 Secretary
6 Owners
```

Abrir 8 sesiones cuando sea posible.

Probar:

```text id="kwas9x"
Lobby
Join
Camera
Microphone
Mute
Unmute
Leave
Reconnect
Speaker request
Voting
```

Crear:

```text id="ry5k5x"
docs/AUDIT/EO-009/00-VIRTUAL-AS-IS.md
```

---

# 4. AUDIT PROVIDER ABSTRACTION

Confirmar que existe una separación similar a:

```text id="5fakff"
IMeetingProvider
         │
         └── LiveKitMeetingProvider
```

Si no existe:

implementarla/refactorizar cuidadosamente.

No permitir llamadas LiveKit dispersas por Controllers y lógica de negocio.

---

# 5. MEETING PROVIDER RESPONSIBILITIES

El provider puede manejar:

```text id="nu5ydv"
Create/resolve room
Generate access token
Media permissions
Participant media identity
Provider callbacks/events
```

No debe manejar:

```text id="9jccnz"
Quorum
Voting
Decision
Powers
Representation
```

---

# 6. TOKEN SECURITY

P0.

Tokens se generan exclusivamente backend.

Nunca:

```text id="a6j8wr"
API_SECRET in JavaScript
```

Nunca secrets en Git.

---

# 7. TOKEN SCOPE

Token debe ser:

```text id="ds162h"
Short lived
Assembly scoped
Room scoped
Identity scoped
Permission scoped
```

---

# 8. MEDIA IDENTITY

La identidad enviada a LiveKit no debe convertirse en fuente de autorización.

Backend conoce:

```text id="5c9ayk"
UserId
ParticipantId
AssemblyId
TenantId
```

y genera identity/provider metadata segura.

---

# 9. WRONG ROOM ATTACK

Intentar usar token/URL de Assembly A para entrar B.

Debe fallar.

---

# 10. EXPIRED TOKEN

Debe manejarse con UX apropiado.

No mostrar error técnico.

---

# 11. LOBBY — P0

Antes de entrar:

crear/perfeccionar un Lobby premium.

Debe mostrar:

```text id="mf1467"
PH

Assembly

Participant

Unit

Accreditation

Representation

Current Quorum

Camera

Microphone

Connection

Meeting status
```

---

# 12. LOBBY DESIGN

Conceptualmente:

```text id="p4j643"
┌────────────────────────────────────┐
│ PH OCEAN TOWER                     │
│ Asamblea General Ordinaria         │
├────────────────────────────────────┤
│                                    │
│       CAMERA PREVIEW               │
│                                    │
├────────────────────────────────────┤
│ ✓ Acreditado                       │
│ Unidad 8B                          │
│ Representación 2.226%              │
│                                    │
│ Cámara       Integrada Camera   ▾  │
│ Micrófono    Default Mic        ▾  │
│                                    │
│ Mic level    ▂▄▆                   │
│                                    │
│ Conexión     Buena                 │
│                                    │
│ QUÓRUM       68.42%                │
│                                    │
│       [ ENTRAR A LA ASAMBLEA ]     │
└────────────────────────────────────┘
```

No copiar literalmente.

---

# 13. CAMERA PREVIEW

El usuario debe poder verse antes de entrar.

Estados:

```text id="me6gjr"
Camera available
Permission required
Permission denied
Camera unavailable
Camera disabled
```

---

# 14. MICROPHONE PREVIEW

Mostrar actividad de micrófono.

No necesidad de reproducir el audio local.

Mostrar indicador de nivel.

---

# 15. DEVICE ENUMERATION

Cuando browser lo permita:

mostrar dispositivos disponibles.

```text id="3xdhn0"
Camera
Microphone
Speaker
```

---

# 16. PERMISSION FLOW

No pedir permisos innecesariamente al cargar cualquier página de ASAMBLEAS.

Solicitarlos contextualizadamente en Lobby.

---

# 17. CAMERA DENIED

Mostrar:

```text id="zxurpg"
No pudimos acceder a tu cámara.

Puedes continuar sin video
o revisar los permisos del navegador.
```

No bloquear si video no es requisito configurado.

---

# 18. MICROPHONE DENIED

Mostrar explicación equivalente.

---

# 19. NO DEVICE

Si laptop no tiene cámara:

la Asamblea debe poder continuar según configuración.

---

# 20. AUDIO OUTPUT

Cuando browser/SDK soporte selección de speaker:

permitirla.

Si no:

no mostrar control falso.

---

# 21. DEVICE PERSISTENCE

Recordar selección durante la sesión cuando sea seguro.

No depender de device IDs permanentes incorrectamente.

---

# 22. JOIN BUTTON

Antes de habilitar:

validar:

```text id="6vyl7e"
Authenticated
Accredited
Assembly joinable
Valid meeting token available
```

según reglas.

---

# 23. JOIN EXPERIENCE

Al presionar:

```text id="4uznxy"
ENTRAR A LA ASAMBLEA
```

mostrar progreso real.

Ejemplo:

```text id="srfr0l"
Verificando acceso…
Conectando a la sala…
Sincronizando la Asamblea…
Preparando audio y video…
```

No loaders falsos con tiempos artificiales.

---

# 24. JOIN FAILURE

Distinguir:

```text id="ejlvo0"
Authentication failure
Not accredited
Assembly not started
Provider unavailable
Network problem
Token problem
Permission issue
```

con UX humana.

---

# 25. RETRY

Permitir reintento seguro cuando corresponda.

No duplicar presencia.

---

# 26. LIVE ROOM

Integrar EO-004.

Media vive dentro de:

# ASSEMBLY LIVE EXPERIENCE.

No crear otra página aislada que rompa la experiencia.

---

# 27. MAIN STAGE

Usar:

```text id="ghu6vi"
ACTIVE SPEAKER
```

como protagonista.

---

# 28. PARTICIPANT STRIP

Para piloto de 8 usuarios:

mostrar miniaturas compactas.

No grid gigante obligatorio.

---

# 29. PIN

Si ya existe:

permitir fijar presentador.

Si no existe:

no expandir scope innecesariamente.

---

# 30. ACTIVE SPEAKER DETECTION

Usar datos del provider.

Pero separar:

```text id="c5w72f"
Audio active speaker
```

de:

```text id="u55ud1"
Official speaker granted by President
```

---

# 31. OFFICIAL SPEAKER

EO-007 es autoridad para:

```text id="qa2jdu"
WHO HAS THE FLOOR.
```

LiveKit puede detectar audio.

No debe conceder formalmente la palabra.

---

# 32. VISUAL PRIORITY

Si María tiene oficialmente la palabra:

destacar María.

Incluso si otro mic accidentalmente detecta ruido.

---

# 33. MICROPHONE GOVERNANCE

Owner normal:

preferiblemente inicia:

```text id="usm1qf"
MUTED
```

según configuración.

---

# 34. GRANT SPEAK

Cuando Presidente concede:

integrar:

```text id="s0zvdi"
SpeakerRequest Granted
        ↓
Meeting Provider Permission
        ↓
Owner UI
        ↓
Microphone available
```

cuando la infraestructura lo permita.

---

# 35. REVOKE SPEAK

Al terminar intervención:

quitar/actualizar permiso según modelo.

---

# 36. MEDIA PERMISSION FAILURE

Si backend concede palabra pero provider falla al habilitar media:

crear incidente.

No marcar intervención completa automáticamente.

---

# 37. OWNER MUTE

Durante su intervención el Owner puede mutearse manualmente.

No significa que terminó su intervención.

---

# 38. PRESIDENT MUTE CONTROL

Si provider/configuración lo soporta:

permitir moderación.

Auditar acciones importantes cuando corresponda.

---

# 39. CAMERA

Owner puede activar/desactivar según permisos.

---

# 40. CAMERA OFF UX

Mostrar avatar profesional.

No cuadro negro.

---

# 41. PARTICIPANT LABEL

Mostrar:

```text id="zcqym5"
Name
Unit
```

y role cuando sea relevante.

---

# 42. MEDIA INDICATORS

Mostrar:

```text id="2fdnhm"
Mic muted
Camera off
Speaking
Connection quality
```

sin saturar.

---

# 43. CONNECTION QUALITY

Traducir calidad técnica a estados humanos:

```text id="i8kc93"
Excelente
Buena
Inestable
Muy inestable
```

No mostrar:

```text id="cxyacs"
packetLoss = 0.12
```

al usuario normal.

---

# 44. TECHNICAL DETAIL

Operator puede abrir drawer técnico cuando necesario.

No hacer visible siempre.

---

# 45. NETWORK QUALITY UX

Si Owner tiene mala conexión:

```text id="4r1ijn"
Tu conexión está inestable.

Estamos ajustando la calidad del video
para mantenerte conectado.
```

si provider lo soporta.

---

# 46. ADAPTIVE MEDIA

Priorizar:

# AUDIO STABILITY > VIDEO QUALITY.

Para Asamblea, escuchar correctamente es más importante que HD.

---

# 47. VIDEO QUALITY

Permitir provider adaptive streaming/simulcast cuando disponible.

No configurar manualmente bitrate sin evidencia.

---

# 48. LOW BANDWIDTH MODE

Diseñar degradación:

```text id="jh7q5x"
HD
 ↓
SD
 ↓
Low Video
 ↓
Audio Only
 ↓
Governance Only
```

No necesariamente exponer estos términos literalmente al Owner.

---

# 49. GOVERNANCE-ONLY MODE

P0 conceptual.

Si media falla pero API/SignalR continúan:

usuario debe poder seguir viendo:

```text id="jqt0fo"
Agenda
Motion
Quorum
Voting
Results
Speaker status
```

según procedimiento.

---

# 50. VIDEO FAILURE ≠ PAGE FAILURE

Nunca destruir toda Assembly Room porque video provider esté temporalmente caído.

---

# 51. SIGNALR FAILURE

Igualmente distinguir:

```text id="xxen15"
Governance connection lost
```

de:

```text id="93g8kv"
Media connection lost.
```

---

# 52. CONNECTION MODEL

Internamente mantener estados separados:

```text id="34vn78"
MediaConnectionState
GovernanceConnectionState
AttendanceState
```

---

# 53. USER-FACING CONNECTION

Simplificar mensajes.

Ejemplo:

```text id="6jrdyc"
Reuniendo conexión…
```

pero en diagnóstico técnico mantener separación.

---

# 54. RECONNECT — P0

Simular pérdida de Wi-Fi.

---

# 55. MEDIA RECONNECT

LiveKit/provider intenta reconectar.

Mostrar progreso.

No obligar manual refresh.

---

# 56. GOVERNANCE RESYNC

Después:

consultar backend y reconstruir:

```text id="fxi583"
Assembly
Presence
Quorum
Agenda
Motion
Voting
My vote status
Speaker request
```

---

# 57. MEDIA RESYNC

Reconstruir media tracks/participants según provider.

---

# 58. RECONNECT DURING SPEAKING

Caso:

Owner tiene la palabra y pierde conexión.

No asignar automáticamente a otro speaker sin regla.

Operator recibe:

```text id="qqhtx5"
María González perdió conexión durante su intervención.
```

---

# 59. SPEAKER RETURN

Cuando vuelve:

mostrar estado apropiado.

Presidente decide continuar/finalizar según flujo existente.

---

# 60. RECONNECT DURING VOTE

Integrar EO-005.

No perder estado de voto.

---

# 61. BACKGROUND MOBILE

P0.

En móviles, browser puede suspender recursos al cambiar app.

Probar:

```text id="mj0gxs"
Switch app
Lock/unlock
Background browser
Return
```

cuando posible.

---

# 62. MOBILE RECOVERY

Al regresar:

sincronizar.

No mostrar datos obsoletos.

---

# 63. ORIENTATION CHANGE

Probar portrait → landscape → portrait.

No perder video ni voting state.

---

# 64. MOBILE SAFE AREA

Soportar notch/home indicator.

---

# 65. IOS / SAFARI

Cuando entorno disponible:

probar Safari/iOS o documentar MANUAL ACCEPTANCE REQUIRED.

---

# 66. ANDROID / CHROME

Probar Android/Chrome cuando disponible.

---

# 67. DESKTOP BROWSERS

Al menos:

```text id="jzk48g"
Chrome
Edge
```

y otros según soporte objetivo.

---

# 68. BROWSER SUPPORT MATRIX

Crear:

```text id="yo115m"
docs/TESTING/BROWSER-SUPPORT.md
```

No afirmar soporte no probado.

---

# 69. AUTOPLAY

Manejar restricciones del navegador.

No asumir autoplay de audio.

---

# 70. USER GESTURE

Diseñar entrada para cumplir requisitos de autoplay.

---

# 71. ECHO

Prueba humana obligatoria.

No afirmar echo cancellation por código únicamente.

---

# 72. HEADPHONES

Probar al menos algunos usuarios con auriculares y otros con speaker.

---

# 73. MULTIPLE USERS SAME ROOM

Prueba física puede provocar eco.

Documentar recomendación operacional.

---

# 74. SCREEN SHARE

Si ya existe funcionalidad:

perfeccionarla.

Si no existe:

evaluar si es imprescindible para Asamblea.

Para EO-009:

solo implementarla si se requiere para demostrar documentos/presentaciones y el costo es razonable.

No sacrificar core por esta función.

---

# 75. SCREEN SHARE PERMISSION

Solo roles autorizados.

---

# 76. SCREEN SHARE UX

Si activa:

stage principal cambia.

Mostrar quién comparte.

---

# 77. SCREEN SHARE END

Volver correctamente a active speaker.

---

# 78. DOCUMENTS VS SHARE

No obligar a compartir pantalla si documento ya existe dentro de ASAMBLEAS.

Preferir documentos nativos cuando sea mejor UX.

---

# 79. CHAT

No agregar chat general salvo que ya exista o sea requisito definido.

Estamos evitando scope creep.

---

# 80. PARTICIPANT COUNT

Mostrar:

```text id="8ihrb0"
8 participantes
```

pero recordar:

media participants ≠ attendance.

---

# 81. MEDIA COUNT DISCREPANCY

Si:

```text id="85y42i"
Attendance = 8
Media = 7
```

Operator debe poder entender que 1 tiene problema técnico.

---

# 82. OPERATOR MEDIA CENTER

Dentro del Cockpit:

mostrar resumen compacto:

```text id="cvxjui"
MEDIA

Conectados      7 / 8
Con problema    1
Mic activos     2
Cámaras         5
```

---

# 83. INCIDENT CENTER

Integrar EO-004.

Ejemplos:

```text id="qh2hrz"
Owner04 — reconectando
Owner06 — micrófono bloqueado
Owner02 — video inestable
```

---

# 84. INCIDENT DOES NOT CHANGE QUORUM AUTOMATICALLY

P0.

Solo Presence Engine decide.

---

# 85. VIRTUAL PRESENCE HEARTBEAT

Auditar cómo se determina presencia virtual.

No basarla ingenuamente solo en SignalR socket.

---

# 86. PRESENCE POLICY

Documentar explícitamente:

```text id="x8xlb3"
What constitutes virtual presence?
What happens on temporary disconnect?
What is grace period?
When is participant considered left?
```

No inventar interpretación legal.

Configuración/product rule.

---

# 87. GRACE PERIOD

Si ya definido en EO-006:

integrarlo.

---

# 88. PRESENCE CHANGE EVENT

Cuando realmente cambia presencia:

quórum recalcula.

---

# 89. TECHNICAL DISCONNECT EVENT

Debe poder existir sin cambiar presencia inmediatamente.

---

# 90. HYBRID MODE

P0 arquitectónico.

Mismo Assembly.

Participantes:

```text id="cdamwx"
IN_PERSON
VIRTUAL
REPRESENTED
```

---

# 91. ONE QUORUM ENGINE

No crear:

```text id="rd84yq"
VirtualQuorumEngine
PhysicalQuorumEngine
```

Todos alimentan EO-006.

---

# 92. ONE VOTING ENGINE

Presencial y virtual usan EO-005.

---

# 93. PHYSICAL OWNER

Puede votar desde móvil/terminal.

No necesita estar conectado al video.

---

# 94. VIRTUAL OWNER

Video + governance.

---

# 95. HYBRID COCKPIT

Operator debe ver:

```text id="qf6pro"
PRESENTES

Presencial     4
Virtual        3
Representado   1

Total lógico   8

QUÓRUM
72.84%
```

---

# 96. DO NOT DOUBLE COUNT HYBRID

Owner físicamente presente y conectado desde móvil:

una sola presencia/representación efectiva.

---

# 97. DUPLICATE MEDIA SESSION

Mismo Owner conecta laptop + phone.

Media puede tener múltiples dispositivos según política.

Quórum:

# ONCE.

---

# 98. MEDIA DEVICE POLICY

Decidir si múltiples dispositivos son permitidos.

Documentar.

No permitir que cause duplicidad de voto/presencia.

---

# 99. WAITING ROOM

Si existe:

perfeccionarla.

Si no:

Lobby + Assembly state puede cubrirlo.

No crear duplicación innecesaria.

---

# 100. ASSEMBLY NOT STARTED

Owner puede estar en Lobby.

Mostrar:

```text id="y2fhvn"
La Asamblea aún no ha comenzado.

Tu acreditación está completa.

Quórum actual
68.42%
```

---

# 101. START EVENT

Cuando Presidente inicia:

Lobby recibe realtime.

Mostrar:

```text id="b995fa"
LA ASAMBLEA HA COMENZADO

[ ENTRAR ]
```

o entrada automática si UX/configuración lo define apropiadamente.

---

# 102. BREAK

Durante receso:

mantener media según política.

Mostrar overlay/estado.

---

# 103. ASSEMBLY CLOSED

Cerrar media room apropiadamente.

No dejar tokens/sesiones activas innecesariamente.

---

# 104. PROVIDER CALLBACKS

Si LiveKit usa webhooks:

validar firmas/autenticidad según documentación oficial.

No confiar en payload no verificado.

---

# 105. WEBHOOK IDEMPOTENCY

Eventos repetidos no deben duplicar estado.

---

# 106. WEBHOOK ≠ GOVERNANCE AUTHORITY

Provider event informa estado técnico.

No decide quórum automáticamente.

---

# 107. RECORDING

No implementar grabación automáticamente si no existe.

Evaluar costo/privacidad.

Documentar como:

```text id="tqxj57"
OPTIONAL / FUTURE / PLAN CONTROLLED
```

si no se implementa ahora.

---

# 108. IF RECORDING EXISTS

Auditar:

```text id="bcshwi"
Who starts it?
Consent/state?
Where stored?
Who accesses?
Retention?
```

---

# 109. RECORDING UI

Debe mostrar claramente:

```text id="vcxp76"
GRABACIÓN ACTIVA
```

cuando realmente exista.

---

# 110. NO FAKE RECORDING INDICATOR

P0.

---

# 111. PRIVACY

Media room puede contener:

```text id="866su4"
names
video
voice
```

Revisar exposición.

---

# 112. MINIMUM METADATA TO PROVIDER

No enviar más PII de la necesaria.

---

# 113. LOGS

Nunca loguear:

```text id="vw3zzk"
LiveKit secret
Access token
Full sensitive metadata
```

---

# 114. CSP

Revisar Content Security Policy compatible con WebRTC/provider.

No debilitarla a:

```text id="93313x"
*
```

sin necesidad.

---

# 115. PERMISSIONS POLICY

Configurar headers apropiados:

```text id="om0ogc"
camera
microphone
```

según aplicación.

---

# 116. HTTPS

WebRTC/permissions requieren contexto seguro en producción.

Documentar.

---

# 117. LOCAL DEVELOPMENT

Configurar ambiente dev apropiado sin comprometer producción.

---

# 118. UIX — LOBBY

Debe ser visualmente premium.

No formulario técnico.

---

# 119. UIX — LIVE MEDIA

Video debe sentirse integrado al Design System.

No iframe/SDK default que rompa identidad visual si se puede evitar.

---

# 120. PROVIDER BRANDING

Ocultar branding de proveedor cuando términos/plan lo permitan.

No falsificar.

---

# 121. EMPTY VIDEO STATE

Si nadie tiene cámara:

la Assembly Room todavía debe verse profesional.

---

# 122. ACTIVE SPEAKER NO VIDEO

Avatar/identity layout.

---

# 123. VOTING OVER MEDIA

Integrar EO-005.

Durante voting, Owner mobile prioriza voto sobre video.

---

# 124. PICTURE-IN-PICTURE-LIKE UX

No necesariamente browser PiP.

Conceptualmente permitir video compacto mientras se vota.

Implementar solo si mejora UX sin complejidad excesiva.

---

# 125. OPERATOR VOTING

Video permanece útil mientras monitorea vote count.

---

# 126. AGENDA OVER MEDIA

Agenda visible sin tapar speaker.

---

# 127. SCREEN REAL ESTATE

No llenar pantalla con:

```text id="10vgef"
video + agenda + motion + voting + participants + chat + settings
```

todos abiertos.

Usar contextual priority.

---

# 128. SETTINGS DRAWER

Media settings en drawer/panel.

No abandonar reunión.

---

# 129. DEVICE SWITCH LIVE

Cambiar cámara/mic durante reunión sin reconectar si SDK permite.

---

# 130. DEVICE DISCONNECTED

Si USB headset se desconecta:

manejar error.

---

# 131. CAMERA IN USE

Si otra app usa cámara:

mensaje humano.

---

# 132. MICROPHONE IN USE

Igual.

---

# 133. SCREEN LOCK / SLEEP

Probar recuperación razonable.

---

# 134. LONG SESSION

Probar sesión extendida:

mínimo técnico razonable.

Objetivo:

detectar:

```text id="ks4jt5"
memory leaks
duplicate listeners
timer drift
SignalR issues
provider reconnect issues
```

---

# 135. EVENT LISTENER AUDIT

ECMAScript:

asegurar cleanup.

No duplicar handlers tras reconexiones.

---

# 136. LIVEKIT TRACK CLEANUP

Unsubscribe/detach correctamente.

Evitar memoria/video DOM acumulado.

---

# 137. PAGE LEAVE

Al salir:

limpiar media resources.

No dejar cámara encendida.

---

# 138. BEFOREUNLOAD

No depender únicamente de beforeunload para persistir attendance.

---

# 139. TAB CLOSED

Servidor/presence system debe manejarlo de forma resiliente.

---

# 140. MEDIA PERFORMANCE

Con 8 personas medir:

```text id="mbhhe1"
Join latency
Time to first media
Reconnect time
CPU
Memory
Network
```

según herramientas disponibles.

---

# 141. GOVERNANCE PERFORMANCE

Mientras media funciona medir:

```text id="3azsnc"
Quorum update
Agenda update
Speaker request
Vote
Result
```

Asegurar que video no degrada UX crítica.

---

# 142. TEST 8 USERS

Obligatorio.

---

# 143. AUTOMATED TEST SCOPE

Playwright puede verificar:

```text id="q5u2k2"
Lobby
Token endpoint
Join UI states
Participant presence integration
SignalR
Governance
Reconnect UI
Permissions UI
```

---

# 144. CAMERA AUTOMATION LIMITATION

No declarar cámara real PASS solo por Playwright si no se realizó human test.

---

# 145. HUMAN MEDIA TEST — REQUIRED

Preparar prueba:

```text id="sr66b1"
1 President laptop
1 Secretary laptop
2 Owners laptops
4 Owners phones/tablets
```

---

# 146. HUMAN TEST ROOM

Idealmente no todos pegados físicamente para evitar eco artificial.

Si están en misma ubicación:

usar auriculares.

---

# 147. HUMAN TEST CASES

Probar:

```text id="f4bxk1"
Join Lobby
Camera preview
Mic preview
Join
Hear President
See President
Mute
Unmute
Camera off/on
Request speak
Grant speak
Speak
End intervention
Vote
Result
Switch device
Disconnect Wi-Fi
Reconnect
Background mobile
Rotate mobile
Leave
Rejoin
```

---

# 148. PRESIDENT HUMAN TEST

Debe poder identificar:

```text id="sbcc0z"
Who is connected?
Who has media problems?
Who has the floor?
Who requested speak?
```

sin Developer Console.

---

# 149. OWNER HUMAN TEST

Owner debe saber:

```text id="mgnbng"
Can they hear me?
Is my mic muted?
Do I have the floor?
Am I connected?
Do I need to vote?
```

---

# 150. MEDIA QUALITY FEEDBACK

Después preguntar:

```text id="bh2mkk"
Audio clear?
Video sufficient?
Any echo?
Any confusing controls?
Could you reconnect?
Could you vote while video continued?
```

---

# 151. HUMAN STATUS

Si no ejecutado:

```text id="260ei5"
MANUAL ACCEPTANCE REQUIRED
```

No PASS.

---

# 152. NETWORK CHAOS TEST

Simular:

```text id="vaxadf"
Temporary offline
High latency
Packet loss if tools available
Provider reconnect
SignalR reconnect
```

---

# 153. PARTIAL FAILURE MATRIX

Probar conceptualmente:

```text id="nk70mi"
MEDIA UP      / GOVERNANCE UP
MEDIA DOWN    / GOVERNANCE UP
MEDIA UP      / GOVERNANCE DOWN
MEDIA DOWN    / GOVERNANCE DOWN
```

UI debe representar correctamente cada caso.

---

# 154. RECOVERY MATRIX

Verificar qué se recupera en cada caso.

---

# 155. NO STATE CORRUPTION

Después de recovery:

```text id="ukrm6a"
Quorum correct
Agenda correct
Motion correct
Vote status correct
Speaker state correct
```

---

# 156. MULTI-TENANT

P0.

Tenant A nunca entra room de Tenant B.

---

# 157. CROSS-ASSEMBLY

Mismo tenant, Assembly A/B.

Tokens, SignalR groups y meeting rooms aislados.

---

# 158. RBAC

Owner no obtiene moderation token.

---

# 159. TOKEN TAMPERING

Intentar manipular:

```text id="4fxna0"
Room
Identity
Permissions
Assembly
```

debe fallar.

---

# 160. SIGNALR AUTHORIZATION

Revalidar EO anteriores.

Media integration no debe abrir bypass.

---

# 161. E2E GOVERNANCE + MEDIA FLOW

```text id="6alkjw"
8 USERS LOGIN
 ↓
8 USERS ACCREDITED
 ↓
8 USERS LOBBY
 ↓
DEVICE CHECK
 ↓
JOIN
 ↓
PRESIDENT STARTS
 ↓
VERIFY QUORUM
 ↓
AGENDA
 ↓
OWNER03 REQUESTS SPEAK
 ↓
PRESIDENT GRANTS
 ↓
OWNER03 SPEAKS
 ↓
END SPEAKER
 ↓
PRESENT MOTION
 ↓
OPEN VOTE
 ↓
8 USERS VOTE
 ↓
RESULT
 ↓
OWNER04 LOSES CONNECTION
 ↓
RECONNECT
 ↓
VERIFY STATE
 ↓
CONTINUE
 ↓
END ASSEMBLY
```

---

# 162. VISUAL EVIDENCE

Capturar:

```text id="7grfcq"
Lobby desktop
Lobby mobile
Camera denied
Mic denied
Joining
Live room
Active speaker
Speaker granted
Voting + video
Poor connection
Reconnect
Governance-only
Hybrid cockpit
Assembly closed
```

---

# 163. BROWSER CONSOLE

Target:

```text id="p5ho9a"
Unexpected JS errors = 0
```

---

# 164. NETWORK

Target:

```text id="8nn6o3"
Unexpected 404 = 0
Unexpected 500 = 0
```

---

# 165. PROVIDER ERRORS

No dejar errores LiveKit crudos en UI.

---

# 166. ACCESSIBILITY

WCAG 2.2 AA.

Especialmente:

```text id="2q8gzs"
Mute
Camera
Device selectors
Connection messages
Speaker indicators
Video labels
```

---

# 167. KEYBOARD

Controles media utilizables por teclado.

---

# 168. SCREEN READER

Botones deben anunciar:

```text id="qywuoa"
Silenciar micrófono
Activar micrófono
Apagar cámara
Encender cámara
```

no:

```text id="nfzw3y"
button icon microphone
```

---

# 169. FOCUS

Realtime/media changes no roban focus.

---

# 170. RESPONSIVE

Certificar:

```text id="sb464d"
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

# 171. MOBILE CONTROL BAR

Diseñar controles grandes y seguros.

---

# 172. TOUCH TARGETS

Accesibles.

---

# 173. VOTE PRIORITY MOBILE

Cuando Voting abre:

media controls no deben competir con voto.

---

# 174. ROTATION

No perder state.

---

# 175. LOADING

Diseñar todos:

```text id="b2v18m"
Device loading
Token loading
Room joining
Media connecting
Track loading
Reconnect
Governance resync
```

---

# 176. EMPTY STATES

Diseñar:

```text id="v8tibx"
No camera
No active speaker
No participant video
Meeting not started
```

---

# 177. INCIDENT UX

No toast fugaz para problemas persistentes.

---

# 178. DOCUMENTATION

Crear:

```text id="hjy77u"
docs/AUDIT/EO-009/
```

con:

```text id="zq8x99"
00-VIRTUAL-AS-IS.md
01-MEETING-PROVIDER-ARCHITECTURE.md
02-TOKEN-SECURITY.md
03-LOBBY.md
04-DEVICE-MANAGEMENT.md
05-LIVE-MEDIA.md
06-SPEAKER-MEDIA-INTEGRATION.md
07-CONNECTION-STATES.md
08-RECONNECT.md
09-GOVERNANCE-VS-MEDIA.md
10-VIRTUAL-PRESENCE.md
11-HYBRID.md
12-MOBILE.md
13-ACCESSIBILITY.md
14-SECURITY.md
15-PERFORMANCE.md
16-E2E.md
17-HUMAN-MEDIA-TEST.md
18-VISUAL-EVIDENCE.md
19-KNOWN-LIMITATIONS.md
EO-009-COMPLETION-REPORT.md
```

---

# 179. CERTIFICATION MATRIX

Reportar:

```text id="z83lzm"
Meeting Provider Abstraction
LiveKit Integration
Token Security
Room Isolation
Tenant Isolation
Lobby
Camera Preview
Microphone Preview
Device Selection
Camera Permission
Microphone Permission
Join Experience
Live Room
Active Speaker
Official Speaker Integration
Mute
Unmute
Camera On/Off
Participant Strip
Connection Quality
Media Reconnect
Governance Reconnect
State Resync
Vote During Media
Reconnect During Vote
Reconnect During Speaker
Background Mobile
Orientation
Hybrid Mode
No Double Count
Governance-only Mode
Media Failure Isolation
SignalR
Mobile
Tablet
Desktop
Accessibility
Performance
E2E 8 Users
Human Media Test
```

Estados:

```text id="tjobn3"
PASS
FAIL
BLOCKED
NOT EXECUTED
MANUAL ACCEPTANCE REQUIRED
```

---

# 180. ZERO-TOLERANCE GATE

Antes de certificar:

```text id="ngh0j4"
API secrets exposed                   0
Cross-tenant room access              0
Cross-assembly room access            0
Unauthorized moderation              0
Media session duplicates quorum       0
Multi-device duplicates quorum        0
Media failure destroys vote state     0
Reconnect loses confirmed vote        0
Reconnect corrupts agenda              0
Reconnect corrupts speaker state       0
Dead media controls                    0
Unhandled JS errors                    0
Unexpected 500                         0
```

---

# 181. FUNCTIONAL TRUTH

Debemos demostrar:

```text id="v6l3m1"
MEDIA CONNECTION
≠
ATTENDANCE

MEDIA PARTICIPANT
≠
VOTER

MEDIA IDENTITY
≠
AUTHORIZATION

MEDIA FAILURE
≠
VOTE FAILURE
```

---

# 182. HUMAN ACCEPTANCE GATE

Antes de declarar media completamente certificada:

# RUN THE 8-PERSON HUMAN TEST.

No acepto:

```text id="02r2dc"
"LiveKit docs say it should work."
```

Quiero:

```text id="01iepp"
We tested it.
```

---

# 183. PRODUCT DEMO

Al finalizar:

sentar 8 participantes.

Todos entran por ASAMBLEAS.

Nadie abre externamente:

```text id="ogxl0p"
Zoom
Meet
Teams
LiveKit UI
```

Todo ocurre dentro de nuestra experiencia.

---

# 184. CLIENT DEMO FLOW

Debe poder mostrarse:

```text id="zq7qh5"
Owner logs in
 ↓
Lobby
 ↓
Camera preview
 ↓
Mic preview
 ↓
Accreditation visible
 ↓
Join
 ↓
See President
 ↓
Hear meeting
 ↓
See agenda
 ↓
Request speak
 ↓
Receive floor
 ↓
Speak
 ↓
Vote
 ↓
Receive vote confirmation
 ↓
See result
 ↓
Lose connection
 ↓
Reconnect
 ↓
Continue
```

---

# 185. QUALITY QUESTION

Preguntar:

> ¿Parece que ASAMBLEAS tiene videoconferencia integrada o parece que metimos un SDK de video dentro de una página?

Si parece lo segundo:

# EO-009 NOT COMPLETE.

---

# 186. SECOND QUALITY QUESTION

> Si falla el video durante 20 segundos, ¿la plataforma pierde la verdad sobre la Asamblea?

Si:

```text id="zsb2v0"
YES
```

# EO-009 NOT COMPLETE.

---

# 187. THIRD QUALITY QUESTION

> ¿Puede un Owner desde su teléfono participar sin entender qué es WebRTC, SignalR o LiveKit?

Si:

```text id="bptdkc"
NO
```

# EO-009 NOT COMPLETE.

---

# 188. FOURTH QUALITY QUESTION

> ¿Puede el Presidente detectar y manejar problemas audiovisuales sin abrir DevTools?

Si:

```text id="d07so0"
NO
```

# EO-009 NOT COMPLETE.

---

# 189. FINAL EXECUTION COMMAND

Empieza ahora.

Primero:

# RUN THE EXISTING VIRTUAL ASSEMBLY.

Después:

```text id="zpv3e3"
AUDIT
 ↓
PROVIDER ABSTRACTION
 ↓
TOKEN SECURITY
 ↓
LOBBY
 ↓
DEVICE PREVIEW
 ↓
JOIN EXPERIENCE
 ↓
LIVE MEDIA
 ↓
SPEAKER INTEGRATION
 ↓
CONNECTION QUALITY
 ↓
MEDIA FAILURE ISOLATION
 ↓
RECONNECT
 ↓
GOVERNANCE RESYNC
 ↓
MOBILE
 ↓
HYBRID
 ↓
SECURITY
 ↓
ACCESSIBILITY
 ↓
8-USER E2E
 ↓
HUMAN MEDIA TEST
 ↓
CERTIFICATION
```

No expandas scope.

No agregues chat por moda.

No agregues grabación sin necesidad.

No agregues streaming masivo todavía.

No construyas WebRTC desde cero.

No acoples Voting a LiveKit.

No acoples Quorum a LiveKit.

No uses cantidad de sockets como asistencia.

No uses cantidad de video participants como quórum.

No expongas API Secret.

No declares audio PASS sin escucharlo.

No declares video PASS sin verlo.

No declares reconnect PASS sin cortar realmente conexión.

No declares mobile PASS mirando desktop reducido.

# VIDEO IS INFRASTRUCTURE.

# GOVERNANCE IS THE PRODUCT.

# MEDIA CAN FAIL.

# GOVERNANCE MUST PRESERVE THE TRUTH.

# THE USER SHOULD NEVER NEED TO KNOW WHAT LIVEKIT IS.

---

# 190. DEFINITION OF DONE

EO-009 termina cuando nuestros 8 participantes puedan realizar una Asamblea Virtual completa dentro de ASAMBLEAS:

```text id="diik8s"
LOBBY
 ↓
DEVICE CHECK
 ↓
JOIN
 ↓
AUDIO/VIDEO
 ↓
QUORUM
 ↓
AGENDA
 ↓
REQUEST SPEAK
 ↓
SPEAK
 ↓
MOTION
 ↓
VOTE
 ↓
RESULT
 ↓
DISCONNECT
 ↓
RECONNECT
 ↓
CONTINUE
 ↓
CLOSE
```

y podamos demostrar:

```text id="ukj2dw"
media stability
governance integrity
state recovery
mobile usability
security
privacy
accessibility
```

sin depender de una aplicación externa de videoconferencia.

Ese es el estándar de EO-009.

# ONE ASSEMBLY.
# ONE EXPERIENCE.
# ONE SOURCE OF GOVERNANCE TRUTH.