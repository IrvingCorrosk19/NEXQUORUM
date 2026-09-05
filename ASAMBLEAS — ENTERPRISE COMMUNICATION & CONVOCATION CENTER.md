# ASAMBLEAS — ENTERPRISE COMMUNICATION & CONVOCATION CENTER
## CONFIGURABLE MULTICHANNEL DELIVERY · EMAIL · WHATSAPP · SMS · PORTAL · PDF · QR · REMINDERS · TEMPLATES · EVIDENCE · SECURITY · MULTITENANT

**Execution Mode:** IMPLEMENT → TEST → BREAK → FIX → RETEST → DEPLOY  
**Producto:** ASAMBLEAS  
**Scope:** Convocatorias + Comunicaciones + Configuración  
**Prioridad:** P0/P1  
**Stack existente:** .NET Core + PostgreSQL + HTML/CSS + ECMAScript + SignalR + arquitectura actual  
**UX:** ASAMBLEAS Premium Design System  
**Tenancy:** OBLIGATORIO  
**Security:** OBLIGATORIO  

---

# 0. MISIÓN

Implementar un:

# COMMUNICATION & CONVOCATION CENTER

completamente configurable.

NO quiero:

```text
SMTP hardcoded
WhatsApp hardcoded
SMS hardcoded
credentials in source code
templates hardcoded
URLs hardcoded
sender hardcoded
reminder times hardcoded
```

Quiero que cada PH/Tenant pueda configurar sus propios canales de comunicación.

---

# 1. OBJETIVO FUNCIONAL

Desde ASAMBLEAS debemos poder:

```text
CREAR ASAMBLEA
      ↓
CREAR CONVOCATORIA
      ↓
SELECCIONAR DESTINATARIOS
      ↓
SELECCIONAR CANALES
      ↓
GENERAR DOCUMENTO
      ↓
VALIDAR
      ↓
PROGRAMAR / ENVIAR
      ↓
EMAIL
WHATSAPP
SMS
PORTAL
PDF / FÍSICO
      ↓
TRACKING
      ↓
RECORDATORIOS
      ↓
CONFIRMACIÓN
      ↓
EVIDENCIA
      ↓
AUDITORÍA
```

Todo desde una experiencia premium.

---

# 2. ARQUITECTURA

No acoplar convocatoria directamente a proveedores.

Implementar abstracciones equivalentes a:

```csharp
ICommunicationProvider
IEmailProvider
IWhatsAppProvider
ISmsProvider
INotificationProvider
IConvocationService
ITemplateService
IDeliveryTrackingService
IReminderService
ICommunicationConfigurationService
```

La lógica de Asamblea NO debe saber si usamos:

```text
SMTP
Microsoft
Google
Meta
Twilio
otro proveedor
```

Debe trabajar mediante interfaces.

---

# 3. PROVIDER PATTERN

Arquitectura:

```text
ASAMBLEAS
    │
    ▼
Communication Engine
    │
    ├── Email Provider
    ├── WhatsApp Provider
    ├── SMS Provider
    ├── Portal Provider
    ├── PDF Provider
    └── Future Providers
```

Debe ser extensible.

---

# 4. CONFIGURATION CENTER

Crear módulo:

# CONFIGURACIÓN → COMUNICACIONES

Con UI premium.

Debe incluir:

```text
General
Email
WhatsApp
SMS
Portal
Plantillas
Recordatorios
Remitentes
Seguridad
Pruebas
Auditoría
```

según funcionalidades implementadas.

---

# 5. CONFIGURACIÓN MULTI-TENANT

P0.

Cada Tenant/PH debe tener configuración independiente.

Ejemplo:

```text
PH OCEAN
Email → Provider A
WhatsApp → Provider A
SMS → Disabled

PH MADISON
Email → Provider B
WhatsApp → Disabled
SMS → Provider B
```

NUNCA mezclar configuración entre tenants.

---

# 6. CONFIGURATION INHERITANCE

Preparar arquitectura para:

```text
Platform Default
        ↓
Tenant Override
        ↓
Assembly Override
```

cuando corresponda.

Mostrar claramente de dónde viene cada valor.

---

# 7. EMAIL CONFIGURATION

Crear pantalla:

# CONFIGURACIÓN DE CORREO

Campos según provider:

```text
Provider
Enabled
Display Name
From Address
Reply-To

SMTP Host
SMTP Port
Encryption
Username
Password

Timeout
Retry Policy
Daily Limit
```

No todos los providers necesitan todos los campos.

UI debe adaptarse dinámicamente.

---

# 8. EMAIL PROVIDERS

Arquitectura preparada para diferentes proveedores.

Como mínimo soportar el mecanismo actual que resulte viable.

No construir integraciones ficticias.

Provider no implementado:

```text
COMING / NOT CONFIGURED
```

No botón falso.

---

# 9. PASSWORD/SECRET UX

Campos secretos:

```text
••••••••••••••
```

Nunca devolver el secreto real al browser después de guardarlo.

Debe poder:

```text
Replace credential
Test configuration
Delete credential
```

No:

```text
Show saved password
```

---

# 10. SECRET STORAGE

P0.

NO almacenar credenciales sensibles plaintext si la arquitectura permite protección.

Usar mecanismo seguro apropiado para ASP.NET Core/VPS.

Nunca:

```text
Git
appsettings committed
HTML
JavaScript
localStorage
URL
logs
audit payload
```

---

# 11. TEST EMAIL CONFIGURATION

Botón:

# ENVIAR CORREO DE PRUEBA

Flujo:

```text
Config
 ↓
Validate
 ↓
Send
 ↓
Provider Response
 ↓
User-friendly Result
```

Ejemplo:

```text
✓ Configuración verificada
Correo de prueba enviado correctamente.
```

o error comprensible.

Nunca mostrar password.

---

# 12. EMAIL TEMPLATE SYSTEM

Crear:

# PLANTILLAS DE COMUNICACIÓN

Tipos iniciales:

```text
Convocatoria inicial
Recordatorio
Cambio de fecha
Cambio de lugar
Asamblea próxima
Asamblea iniciada
Votación próxima
Asamblea finalizada
Acta disponible
```

Solo implementar envíos que correspondan al scope actual.

---

# 13. TEMPLATE VARIABLES

Soportar variables controladas.

Ejemplo:

```text
{{OwnerName}}
{{Unit}}
{{AssemblyName}}
{{AssemblyDate}}
{{AssemblyTime}}
{{AssemblyLocation}}
{{AssemblyType}}
{{PHName}}
{{JoinUrl}}
{{ConfirmationUrl}}
```

---

# 14. TEMPLATE SECURITY

No permitir template injection.

Variables deben estar:

```text
whitelisted
escaped
validated
```

según contexto.

---

# 15. TEMPLATE EDITOR

Crear editor premium:

```text
Subject
Preheader
Body
Variables
Preview
Desktop Preview
Mobile Preview
Test Send
```

No necesitamos un constructor visual gigantesco si no aporta valor.

Priorizar robustez.

---

# 16. PREVIEW

Antes de enviar:

# PREVISUALIZACIÓN OBLIGATORIA

Mostrar:

```text
Remitente
Destinatario de ejemplo
Asunto
Contenido
Fecha
Lugar
CTA
Adjuntos
```

---

# 17. WHATSAPP CONFIGURATION

Crear:

# CONFIGURACIÓN WHATSAPP

Arquitectura provider-based.

Preparar integración oficial mediante proveedor compatible.

Campos dinámicos según provider.

Nunca implementar automatización basada en scraping o WhatsApp Web como infraestructura empresarial.

---

# 18. WHATSAPP SETTINGS

Según provider:

```text
Enabled
Provider
Business Account
Phone Number
API configuration
Webhook configuration
Template mapping
Default country
Retry policy
```

Secrets protegidos.

---

# 19. WHATSAPP TEST

Botón:

# ENVIAR WHATSAPP DE PRUEBA

Solicitar número autorizado para test.

Registrar resultado.

---

# 20. WHATSAPP TEMPLATES

Mapear plantillas aprobadas cuando el proveedor lo requiera.

UI debe mostrar:

```text
Template
Language
Status
Provider ID
Last Sync
```

si la integración real lo soporta.

---

# 21. SMS CONFIGURATION

Crear configuración desacoplada.

```text
Enabled
Provider
Sender
API configuration
Default country
Max length
Retry policy
```

---

# 22. SMS TEST

Enviar mensaje de prueba.

No cobrar/enviar accidentalmente en automated tests.

Mock provider para tests.

---

# 23. PORTAL NOTIFICATIONS

Canal interno gratuito.

Cuando se genere convocatoria:

propietario debe poder verla dentro de ASAMBLEAS.

Mostrar:

```text
Nueva convocatoria
Assembly
Date
Time
Location / Virtual
Status
View
Confirm
```

---

# 24. NOTIFICATION CENTER

Crear campana/centro de notificaciones REAL si no existe.

No fake UI.

Debe manejar:

```text
Unread
Read
Date
Type
Assembly
Action
```

---

# 25. PDF CONVOCATION

Generar documento de convocatoria.

Debe contener según configuración/reglas existentes:

```text
PH
Assembly
Type
Date
Time
Location
Virtual information
Agenda
Instructions
Authorized signature information
QR
Unique document identifier
```

No inventar requisitos legales.

---

# 26. PDF TEMPLATE

Permitir configuración visual controlada:

```text
Logo
PH Name
Header
Footer
Contact information
Signature block
```

Sin permitir romper estructura legal/funcional.

---

# 27. QR

Generar QR seguro.

Puede apuntar a:

```text
Convocation portal
Assembly access flow
Confirmation flow
```

según diseño.

NUNCA incluir:

```text
password
secret
sensitive PII
```

directamente en QR.

---

# 28. SECURE LINKS

Links deben usar token:

```text
opaque
random
short-lived or policy-based
purpose-specific
revocable when required
```

No:

```text
?email=x&password=y
```

P0.

---

# 29. PHYSICAL DELIVERY

Agregar canal:

# ENTREGA FÍSICA

No significa que sistema envía físicamente.

Permite registrar:

```text
Printed
Delivered
Delivery Date
Delivered By
Received By
Evidence
Notes
```

según permisos.

---

# 30. BULK PRINT

Permitir generar:

```text
All convocations
Selected convocations
Pending physical delivery
```

para impresión.

---

# 31. RECIPIENT SELECTION

Wizard de destinatarios.

Permitir:

```text
All eligible owners
Specific units
Specific owners
Representatives
Custom eligible subset
```

respetando reglas de negocio.

---

# 32. RECIPIENT VALIDATION

Antes de enviar:

clasificar:

```text
READY
MISSING EMAIL
MISSING PHONE
INVALID EMAIL
INVALID PHONE
NO CHANNEL
DUPLICATE
```

---

# 33. PRE-SEND VALIDATION

Nunca iniciar envío masivo sin mostrar:

```text
Total recipients
Email
WhatsApp
SMS
Portal
Physical
Invalid
Missing contact information
```

---

# 34. CHANNEL PREFERENCE

Permitir configurar preferencia del propietario cuando aplique:

```text
Email
WhatsApp
SMS
Portal
Physical
```

y combinaciones.

---

# 35. LEGAL DELIVERY POLICY

Separar:

```text
Preferred Communication Channel
```

de:

```text
Official Convocation Channel
```

No asumir que WhatsApp sustituye legalmente otros mecanismos.

Debe ser configurable por PH/regla aplicable.

---

# 36. DELIVERY STRATEGY

Configurar:

```text
Send all enabled channels
```

o:

```text
Primary channel
        ↓ failure
Secondary channel
        ↓ failure
Fallback
```

---

# 37. FALLBACK

Ejemplo:

```text
EMAIL
 ↓ failure
WHATSAPP
 ↓ failure
SMS
 ↓
MANUAL ATTENTION
```

Configurable.

---

# 38. NO DUPLICATE CHAOS

Implementar idempotencia.

Repeated click no debe enviar convocatoria 5 veces.

---

# 39. COMMUNICATION BATCH

Cada envío masivo debe generar:

```text
Batch ID
Assembly
Convocation
Tenant
Created At
Created By
Channels
Recipient Count
Status
```

---

# 40. DELIVERY RECORD

Cada destinatario/canal:

```text
Queued
Processing
Sent
Delivered
Read
Failed
Bounced
Rejected
Unknown
```

SOLO usar estados soportados realmente por provider.

---

# 41. CRITICAL SEMANTIC RULE

# SENT ≠ DELIVERED ≠ READ.

Nunca falsificar.

Si proveedor solo confirma:

```text
accepted
```

no convertirlo en:

```text
READ
```

---

# 42. DELIVERY TIMELINE

Crear:

```text
Convocation created
Email queued
Email sent
Email delivered
Portal opened
Confirmation received
Reminder sent
```

con timestamps y fuente.

---

# 43. CONVOCATION DASHBOARD

Crear dashboard premium.

Ejemplo conceptual:

```text
CONVOCATORIA — ASAMBLEA ORDINARIA

247 destinatarios

Enviadas             247
Entregadas            231
Consultadas           184
Confirmadas            96
Con error               4
Sin contacto            8

EMAIL       220
WHATSAPP    196
PORTAL      247
FÍSICO       18

[ Ver incidencias ]
[ Reenviar fallidas ]
```

Usar únicamente métricas demostrables.

---

# 44. DELIVERY MATRIX

Tabla:

```text
Unidad | Propietario | Email | WhatsApp | SMS | Portal | Confirmación
```

con estados visuales.

---

# 45. FILTERS

Permitir:

```text
Pending
Failed
Delivered
Opened
Confirmed
No contact
Physical pending
```

según capacidades reales.

---

# 46. RETRY

Fallos transitorios:

retry controlado.

Implementar:

```text
retry count
backoff
maximum attempts
```

No loops infinitos.

---

# 47. DEAD LETTER

Después de retries:

```text
FAILED / REQUIRES ATTENTION
```

visible al operador.

---

# 48. MANUAL RETRY

Operador autorizado puede:

```text
Retry
Change channel
Mark physical delivery
Update contact if permitted
```

con auditoría.

---

# 49. REMINDER ENGINE

Crear:

# RECORDATORIOS

Completamente configurable.

---

# 50. REMINDER RULES

Ejemplos:

```text
7 days before
72 hours before
24 hours before
2 hours before
```

NO hardcodear.

---

# 51. REMINDER BUILDER

UI:

```text
WHEN
72 hours before Assembly

WHO
Not confirmed

CHANNEL
Email + WhatsApp

TEMPLATE
Reminder 72h

ACTIVE
Yes
```

---

# 52. REMINDER CONDITIONS

Permitir condiciones controladas:

```text
All
Not confirmed
Not opened
Missing accreditation
Virtual attendees
```

solo cuando datos soporten condición.

---

# 53. SCHEDULER

Usar mecanismo robusto existente o implementar scheduler apropiado.

No depender del browser abierto.

---

# 54. TIMEZONE

P0.

Programación debe considerar timezone del PH.

Persistencia temporal consistente, preferiblemente UTC internamente.

Mostrar hora local correctamente.

---

# 55. ASSEMBLY RESCHEDULE

Si cambia:

```text
Date
Time
Location
Virtual access
```

detectar impacto.

Permitir generar:

# ACTUALIZACIÓN DE CONVOCATORIA

con trazabilidad.

---

# 56. VERSIONING

Convocatoria debe tener versiones.

Ejemplo:

```text
V1 Original
V2 Cambio de hora
V3 Cambio de ubicación
```

No sobrescribir silenciosamente evidencia histórica.

---

# 57. CANCELLATION

Si Asamblea se cancela:

permitir comunicación de cancelación.

Registrar evidencia.

---

# 58. CONFIRMATION

Propietario puede:

```text
Confirm attendance
Cannot attend
Will send representative
Undecided
```

si reglas de negocio lo permiten.

---

# 59. REPRESENTATIVE BRIDGE

Si selecciona:

```text
Will send representative
```

conectar naturalmente al flujo de poder/representación existente.

No duplicar módulo.

---

# 60. CONVOCATION → ACCREDITATION

La información obtenida debe ayudar posteriormente a:

```text
Expected attendance
Representation
Accreditation
Quorum preparation
```

sin convertir confirmación previa en presencia real.

---

# 61. CRITICAL RULE

# CONFIRMED ATTENDANCE ≠ ACTUAL ATTENDANCE.

No contar para quórum hasta que regla de Asamblea lo determine.

---

# 62. AUDIT

Registrar:

```text
Who configured provider
Who changed configuration
Who changed template
Who generated convocation
Who sent
When
Channels
Batch
Retry
Failure
Manual override
Physical delivery
```

---

# 63. SECRET AUDIT

Audit debe registrar:

```text
SMTP credential changed
```

NO:

```text
SMTP password = ...
```

---

# 64. RBAC

Definir permisos granulares.

Ejemplo conceptual:

```text
communications:view
communications:configure
communications:test
templates:view
templates:manage
convocations:create
convocations:send
convocations:resend
convocations:view-evidence
physical-delivery:record
```

Integrar con RBAC actual.

---

# 65. SOD

Considerar separación apropiada entre:

```text
Configuration
Preparation
Approval
Sending
```

si arquitectura actual lo soporta.

No sobrediseñar si no existe requisito.

---

# 66. APPROVAL GATE

Para envío masivo real:

considerar estado:

```text
DRAFT
READY
APPROVED
SCHEDULED
SENDING
SENT
PARTIAL
FAILED
CANCELLED
```

según flujo final.

---

# 67. NO ACCIDENTAL SEND

P0.

En desarrollo/test:

NO enviar 300 emails/WhatsApps/SMS reales accidentalmente.

Implementar:

```text
Mock Provider
Sandbox Mode
Test Recipient Override
```

seguro.

---

# 68. ENVIRONMENT INDICATOR

Cuando esté en Sandbox:

mostrar claramente:

```text
MODO PRUEBA
```

---

# 69. TEST RECIPIENT OVERRIDE

En entorno no productivo:

todo envío puede redirigirse a destinatario controlado.

No usar esto silenciosamente en producción.

---

# 70. COST AWARENESS

Para canales pagos:

permitir mostrar cuando provider pueda proporcionar información:

```text
Estimated recipient count
Channel
```

No inventar precio.

---

# 71. SEND CONFIRMATION UX

Antes de envío:

```text
ENVIAR CONVOCATORIA

247 destinatarios

Email       220
WhatsApp    196
Portal      247

8 propietarios no tienen
un canal externo disponible.

[ Revisar incidencias ]

[ Cancelar ] [ Confirmar envío ]
```

---

# 72. HIGH-RISK CONFIRMATION

No usar confirmación trivial para envío masivo.

Mostrar impacto real.

---

# 73. LOADING UX

Integrar Premium Loading System.

Estados:

```text
Preparando convocatoria…
Generando documentos…
Validando destinatarios…
Programando comunicaciones…
Enviando…
Procesando respuestas…
```

basados en estado real.

---

# 74. ASYNC PROCESSING

Envíos masivos NO deben bloquear request web largo.

Implementar procesamiento background apropiado.

---

# 75. RESILIENCE

Si proceso reinicia:

no perder batch.

No duplicar envíos.

---

# 76. OUTBOX PATTERN

Evaluar e implementar transactional outbox si encaja con arquitectura actual.

Especialmente para evitar:

```text
DB saved
but notification lost
```

o:

```text
notification sent
but DB transaction rolled back
```

Documentar decisión.

---

# 77. IDEMPOTENCY

Cada delivery debe tener clave idempotente apropiada.

---

# 78. WEBHOOKS

Para proveedores que soporten callbacks:

crear endpoints seguros.

---

# 79. WEBHOOK SECURITY

Validar:

```text
signature
provider
timestamp/replay protection where supported
payload
tenant mapping
```

No aceptar webhook anónimo sin validación cuando proveedor ofrece firma.

---

# 80. WEBHOOK IDEMPOTENCY

Evento repetido no debe duplicar timeline.

---

# 81. PROVIDER EVENT STORAGE

Guardar:

```text
normalized event
provider event id
timestamp
delivery
```

No almacenar payload sensible innecesario.

---

# 82. PRIVACY

Minimizar PII.

No mostrar teléfonos/emails completos donde rol no lo necesite.

Considerar masking.

---

# 83. EXPORT

Permitir exportar reporte de convocatoria/evidencia según permisos.

Ejemplo:

```text
PDF
CSV/XLSX
```

solo si arquitectura actual soporta export seguro.

---

# 84. EVIDENCE PACKAGE

Convocatoria debe formar parte del expediente de Asamblea.

Debe poder demostrar:

```text
What was sent
Which version
To whom
When
Through which channel
Provider status
Failures
Retries
Confirmations
Manual deliveries
```

---

# 85. HISTORICAL IMMUTABILITY

Cambiar template mañana NO debe alterar convocatoria enviada ayer.

Guardar snapshot/version.

---

# 86. CONFIGURATION VERSIONING

Cambios críticos de configuración deben quedar auditados.

---

# 87. EMAIL DOMAIN READINESS

Si se usa dominio propio:

preparar diagnóstico/documentación para:

```text
SPF
DKIM
DMARC
```

No afirmar que están configurados sin comprobar DNS.

---

# 88. DELIVERABILITY

No tratar un SMTP exitoso como garantía de inbox.

Separar correctamente estados.

---

# 89. BOUNCE MANAGEMENT

Si provider lo soporta:

registrar:

```text
Hard Bounce
Soft Bounce
Complaint
Rejected
```

y evitar retries inútiles.

---

# 90. CONTACT QUALITY

Crear indicador:

```text
CONTACT READY
CONTACT INCOMPLETE
CONTACT INVALID
```

para convocatoria.

---

# 91. UI/UX PREMIUM

Todo debe seguir el Design System nuevo de ASAMBLEAS.

No crear otro mini-sistema visual.

---

# 92. CONFIGURATION HOME

Crear pantalla visual:

```text
COMUNICACIONES

Email
● Configurado
Última prueba: Exitosa

WhatsApp
● Configurado

SMS
○ Desactivado

Portal
● Activo

Recordatorios
4 reglas activas

Plantillas
9 disponibles
```

---

# 93. PROVIDER CARD

Cada canal debe mostrar:

```text
Status
Provider
Configuration health
Last test
Last successful delivery
Action
```

sin secretos.

---

# 94. CONFIGURATION HEALTH

Estados:

```text
HEALTHY
WARNING
INVALID
DISABLED
NOT CONFIGURED
```

---

# 95. TEST ALL CHANNELS

Crear:

# DIAGNÓSTICO DE COMUNICACIONES

que compruebe configuración.

No enviar comunicaciones reales salvo test explícito.

---

# 96. MOBILE

Operador debe poder:

```text
view status
view failures
retry
view recipient
```

desde tablet/móvil razonablemente.

Configuraciones complejas pueden priorizar desktop.

---

# 97. ACCESSIBILITY

WCAG 2.2 AA.

Especial atención a:

```text
status
tables
forms
dialogs
progress
errors
template editor
```

---

# 98. DATABASE MODEL

Diseñar modelo robusto.

Conceptualmente considerar:

```text
CommunicationConfigurations
CommunicationProviders
CommunicationTemplates
TemplateVersions

Convocations
ConvocationVersions
ConvocationRecipients

CommunicationBatches
CommunicationDeliveries
CommunicationEvents

ReminderRules
ScheduledCommunications

DeliveryEvidence
```

NO copiar estos nombres ciegamente.

Adaptarlos al dominio/DDD actual.

---

# 99. TENANT COLUMN

Toda entidad tenant-owned debe quedar correctamente aislada.

No confiar solamente en frontend.

---

# 100. UNIQUE CONSTRAINTS

Diseñar constraints para evitar duplicados críticos.

---

# 101. INDEXES

Indexar según queries reales:

```text
Tenant
Assembly
Convocation
Recipient
Batch
Delivery
Status
ScheduledAt
ProviderEventId
```

No blind indexing.

---

# 102. MIGRATIONS

Crear migraciones EF Core seguras.

Probar:

```text
Fresh DB
Existing DB upgrade
```

No destruir datos existentes.

---

# 103. API SECURITY

Cada endpoint:

```text
Authentication
Authorization
Tenant
Resource scope
Validation
Rate limits where relevant
```

---

# 104. MASS ASSIGNMENT

DTOs explícitos.

No bind directo de entidades sensibles.

---

# 105. XSS

Probar:

```text
Template subject
Template body
PH name
Assembly name
Agenda
Custom message
```

---

# 106. EMAIL HTML SECURITY

Sanitizar/limitar contenido según modelo de template.

No permitir contenido arbitrario inseguro.

---

# 107. URL SECURITY

Nunca generar enlaces con:

```text
password
email+password
raw identity
authorization role
tenant secret
```

---

# 108. RATE LIMIT

Aplicar protección a:

```text
test send
resend
bulk send
public confirmation endpoints
webhooks where appropriate
```

sin romper operaciones legítimas.

---

# 109. CONCURRENCY

Dos operadores no deben poder disparar accidentalmente el mismo batch.

---

# 110. DOUBLE CLICK

```text
SEND
SEND
SEND
```

debe producir:

```text
ONE INTENDED BATCH
```

---

# 111. RETRY CONCURRENCY

Dos retries simultáneos no duplican entrega.

---

# 112. TEST PROVIDERS

Crear providers fake/mock para automated tests.

Permitir simular:

```text
Success
Failure
Timeout
Delivered
Bounce
Webhook duplicate
```

---

# 113. UNIT TESTS

Cubrir:

```text
Template rendering
Recipient resolution
Channel selection
Fallback
Reminder rules
Idempotency
Status mapping
Tenant isolation logic
```

---

# 114. INTEGRATION TESTS

Cubrir:

```text
DB
Outbox/background processing
Configuration
Batch creation
Delivery state
Webhook processing
Reminder scheduling
```

---

# 115. SECURITY TESTS

Cubrir:

```text
Cross tenant
IDOR
Unauthorized config
Unauthorized send
Secret exposure
XSS
CSRF
Webhook forgery
```

---

# 116. BROWSER E2E

P0.

Ejecutar:

```text
LOGIN ADMIN
 ↓
CONFIGURATION
 ↓
EMAIL
 ↓
SAVE
 ↓
TEST
 ↓
CREATE TEMPLATE
 ↓
PREVIEW
 ↓
CREATE ASSEMBLY
 ↓
CREATE CONVOCATION
 ↓
SELECT RECIPIENTS
 ↓
VALIDATE
 ↓
PREVIEW
 ↓
SEND USING SAFE TEST PROVIDER
 ↓
TRACK DELIVERY
 ↓
CONFIRM
 ↓
VIEW EVIDENCE
```

---

# 117. SECOND TENANT E2E

Tenant B:

no puede:

```text
see provider config
see templates
see batches
see recipients
see delivery events
see evidence
```

de Tenant A.

---

# 118. REAL EMAIL PILOT

Después de mock tests:

configurar UNA cuenta real autorizada.

Enviar únicamente a destinatario de prueba controlado.

Verificar:

```text
Send
Receive
Link
PDF
Tracking if supported
```

No enviar masivamente todavía.

---

# 119. WHATSAPP PILOT

Solo cuando credenciales oficiales estén disponibles.

Si no:

```text
BLOCKED BY EXTERNAL PROVIDER CREDENTIALS
```

No inventar PASS.

---

# 120. SMS PILOT

Igual.

---

# 121. PORTAL

Este sí debe quedar completamente funcional sin proveedor externo.

---

# 122. PDF/PHYSICAL

Debe quedar funcional.

---

# 123. PERFORMANCE

Probar convocatoria sintética:

```text
300 recipients
```

con mock providers.

Medir:

```text
recipient resolution
batch creation
document generation
queueing
status dashboard
```

---

# 124. NO 300 REAL MESSAGES

No enviar 300 comunicaciones externas durante test.

---

# 125. OBSERVABILITY

Registrar métricas útiles:

```text
queued
sent
failed
retrying
delivered
processing latency
```

sin PII innecesaria.

---

# 126. ADMIN ALERTS

Si batch tiene fallos importantes:

mostrar alerta al operador.

---

# 127. ASSEMBLY INTEGRATION

Dentro de Asamblea:

mostrar:

```text
Convocation
Sent
Delivery
Confirmations
Issues
```

sin duplicar Configuration Center.

---

# 128. DASHBOARD INTEGRATION

Dashboard puede mostrar:

```text
Convocatoria
92% entregada
4 incidencias
```

si esas métricas son demostrables.

---

# 129. COMMAND CENTER

Durante Asamblea NO saturar con detalles de envío.

Convocatoria pertenece principalmente a fase previa/evidencia.

---

# 130. EVIDENCE CENTER

Después de cerrar Asamblea:

la convocatoria y su trazabilidad deben permanecer consultables.

---

# 131. CONFIGURATION EXPORT

NO exportar secretos.

Si existe diagnóstico/export:

mask obligatorio.

---

# 132. BACKUP

Nueva configuración/datos deben entrar en backup PostgreSQL actual.

---

# 133. DEPLOYMENT

Después de completar local:

```text
BUILD
 ↓
TEST
 ↓
MIGRATION
 ↓
BROWSER
 ↓
BACKUP VPS
 ↓
PUBLISH
 ↓
DEPLOY
 ↓
APPLY MIGRATION
 ↓
RESTART
 ↓
HEALTH
 ↓
BROWSER VPS
```

---

# 134. DO NOT BREAK CURRENT SYSTEM

Después del cambio volver a probar:

```text
Login
Assembly
Attendance
Quorum
Agenda
Speaker
Motion
Voting
Decision
Realtime
Evidence
Minutes
```

---

# 135. VPS SECRETS

Configuraciones reales deben quedar fuera de Git.

No mostrar secretos en respuesta final.

---

# 136. FINAL VISUAL QA

Abrir todas las nuevas pantallas en Browser.

No certificar únicamente por tests backend.

---

# 137. UX QUESTIONS

Un administrador debe poder responder sin documentación técnica:

```text
¿Tengo correo configurado?
¿Funciona?
¿Qué canal se usará?
¿A quién voy a convocar?
¿Quién no tiene contacto?
¿Qué se enviará?
¿Cuándo se enviará?
¿Qué falló?
¿Quién recibió?
¿Qué tengo que corregir?
```

Si no:

mejorar UX.

---

# 138. ZERO TOLERANCE

Para certificar:

```text
Cross-tenant config leakage        0
Cross-tenant recipient leakage     0
Secret exposed to browser          0
Secret exposed to logs             0
Credential in URL                  0
Duplicate unintended sends         0
Fake delivery status               0
Historical convocation mutation    0
Dead critical buttons              0
Unexpected critical 500            0
```

---

# 139. DOCUMENTATION

Crear:

```text
docs/COMMUNICATIONS/
```

con:

```text
ARCHITECTURE.md
PROVIDERS.md
CONFIGURATION.md
TEMPLATES.md
CONVOCATIONS.md
REMINDERS.md
DELIVERY-TRACKING.md
SECURITY.md
MULTITENANCY.md
OPERATIONS.md
TESTING.md
```

Sin secretos.

---

# 140. CERTIFICATION

Crear:

```text
docs/AUDIT/COMMUNICATIONS/
COMMUNICATION-CENTER-CERTIFICATION.md
```

---

# 141. FINAL RESPONSE

Al terminar responder:

```text
ASAMBLEAS — COMMUNICATION & CONVOCATION CENTER

BUILD
PASS / FAIL

DATABASE MIGRATION
PASS / FAIL

MULTI-TENANT
PASS / FAIL

CONFIGURATION CENTER
PASS / FAIL

EMAIL CONFIGURATION
PASS / FAIL

EMAIL TEST
PASS / FAIL / EXTERNAL CREDENTIAL REQUIRED

WHATSAPP CONFIGURATION
PASS / FAIL

WHATSAPP TEST
PASS / FAIL / EXTERNAL CREDENTIAL REQUIRED

SMS CONFIGURATION
PASS / FAIL

SMS TEST
PASS / FAIL / EXTERNAL CREDENTIAL REQUIRED

PORTAL NOTIFICATIONS
PASS / FAIL

PDF CONVOCATION
PASS / FAIL

QR
PASS / FAIL

SECURE LINKS
PASS / FAIL

TEMPLATES
PASS / FAIL

RECIPIENT MANAGEMENT
PASS / FAIL

BULK SEND
PASS / FAIL

IDEMPOTENCY
PASS / FAIL

DELIVERY TRACKING
PASS / FAIL

REMINDERS
PASS / FAIL

FALLBACK
PASS / FAIL

PHYSICAL DELIVERY
PASS / FAIL

CONFIRMATION
PASS / FAIL

REPRESENTATION INTEGRATION
PASS / FAIL

EVIDENCE
PASS / FAIL

AUDIT
PASS / FAIL

RBAC
PASS / FAIL

SECURITY
PASS / FAIL

SECRET PROTECTION
PASS / FAIL

BROWSER E2E
PASS / FAIL

300 RECIPIENT SYNTHETIC TEST
PASS / FAIL

FUNCTIONAL REGRESSION
PASS / FAIL

VPS DEPLOYMENT
PASS / FAIL

P0 OPEN:
P1 OPEN:
P2 OPEN:

EXTERNAL CONFIGURATION REQUIRED:
<list>

PUBLIC URL:
<without credentials>

COMMIT:
<sha>

FINAL VERDICT:
CERTIFIED / NOT CERTIFIED
```

---

# 142. EXECUTE NOW

NO me entregues solamente arquitectura.

NO me entregues solamente tablas.

NO me entregues mocks como producto terminado.

NO hardcodees SMTP.

NO hardcodees WhatsApp.

NO hardcodees SMS.

NO hardcodees remitentes.

NO hardcodees templates.

NO hardcodees recordatorios.

NO guardes secrets en Git.

NO expongas secrets al browser.

NO confundas SENT con DELIVERED.

NO confundas CONFIRMED con ATTENDED.

NO permitas duplicar envíos.

NO mezcles tenants.

NO rompas ASAMBLEAS.

# IMPLEMENTA EL COMMUNICATION & CONVOCATION CENTER COMPLETO.

# HAZ TODO CONFIGURABLE.

# EMAIL CONFIGURABLE.

# WHATSAPP CONFIGURABLE.

# SMS CONFIGURABLE.

# PORTAL CONFIGURABLE.

# PLANTILLAS CONFIGURABLES.

# RECORDATORIOS CONFIGURABLES.

# FALLBACK CONFIGURABLE.

# CANALES POR PH CONFIGURABLES.

# PREFERENCIAS CONFIGURABLES.

# EVIDENCIA AUTOMÁTICA.

# TRAZABILIDAD COMPLETA.

# SEGURIDAD DE NIVEL ENTERPRISE.

# MULTITENANT REAL.

# UI/UX PREMIUM.

# PRUEBAS REALES EN BROWSER.

# REGRESIÓN COMPLETA.

# DESPLIEGA AL VPS.

Al terminar no quiero simplemente poder decir:

“ASAMBLEAS envía correos.”

Quiero poder decir:

# ASAMBLEAS GESTIONA, DISTRIBUYE, RASTREA Y DEMUESTRA TODO EL CICLO DE UNA CONVOCATORIA.