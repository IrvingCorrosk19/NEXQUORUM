# CERTIFICACIÓN END-TO-END FINAL — ASAMBLEAS

## Conclusión inequívoca

# CERTIFICACIÓN BLOQUEADA

Hay **0 FAIL** en la corrida browser local aislada y las suites automatizadas pasaron tras correcciones, pero existen **bloqueos críticos** (Google OAuth, Microsoft OAuth, entrega SMTP real del OTP, LiveKit A/V multiparticipante, carga 300) que impiden declarar el sistema **CERTIFICADO** al 100 % según los criterios del prompt.

---

## Resumen

| Campo | Valor |
|--------|--------|
| Fecha | 2026-09-17 (UTC) |
| Ambiente | **Local aislado** — NO producción / NO VPS destructivo |
| Base de datos | PostgreSQL `127.0.0.1:5432` / **`asambleas_e2e_cert`** (creada para esta corrida) |
| App | `http://127.0.0.1:5188` (`dotnet run` Release, Demo seed Ocean) |
| Commit HEAD | `426aaae5b94a9ad36ccd5774c9a8d546eae1c9e5` |
| Working tree | **Dirty** — incluye OTP passwordless, redirect a sala, fix OAuth `[hidden]`, fix CrossTenant 410 (sin commit) |
| Navegadores | Playwright Chromium headless (contextos independientes) |
| Resoluciones | 320×568, 360×800, 375×812, 390×844, 412×915, 768×1024, 1024×768, 1366×768, 1920×1080 |
| Resultado global | **CERTIFICACIÓN BLOQUEADA** (0 FAIL · 27 PASS browser · 7 BLOCKED críticos) |

### Protección de datos

- No se usó la DB `asambleas` de desarrollo para resets destructivos.
- No se tocó el VPS ni datos de clientes.
- Credenciales demo de harness: solo entorno local E2E.
- OTP/códigos/tokens no se registran en este informe.
- Limpieza: se puede `DROP DATABASE asambleas_e2e_cert` cuando se autorice.

---

## Resultados técnicos (automatizado)

| Suite | Resultado |
|-------|-----------|
| Build `Asambleas.sln` Release | **PASS** (0 errores) |
| UnitTests | **PASS** 138 |
| ArchitectureTests | **PASS** 3 |
| IntegrationTests (sin Performance/Load/Bench) | **PASS** 73 |
| SecurityTests (tras fix CrossTenant) | **PASS** 32 |
| E2ETests (API meeting) | **PASS** 2 · **SKIP** 1 (LiveKit manual) |
| Browser ultra-cert (`tools/e2e/ultra-cert-local.cjs`) | **PASS** 27 · **FAIL** 0 · **BLOCKED** 7 |

Evidencia JSON: `tools/e2e/ultra-cert-results/matrix.json`  
Capturas: `tools/e2e/ultra-cert-results/*.png`

---

## Matriz (corrida browser + API local)

| ID | Módulo | Caso | Resultado | Evidencia | Observación |
|----|--------|------|-----------|-----------|-------------|
| AUTH-UI-01 | Auth | Mensaje passwordless + Recibir código | PASS | 01-login.png | OTP visible |
| AUTH-UI-02 | Auth | OAuth oculto sin secrets | PASS | 01-login.png | Fix CSS `[hidden]` |
| AUTH-OAUTH-CFG | Auth | Google/Microsoft configurados | BLOCKED | | `google:false, microsoft:false` |
| OTP-01 | OTP | Correo desconocido genérico | PASS | | status 200, sin enumeración |
| OTP-02 | OTP | Código incorrecto | PASS | | status 400 |
| OTP-03 | OTP | Request propietario | PASS | | accepted; envío real SMTP BLOCKED |
| OTP-04 | OTP | Verify + redirect sala | BLOCKED | | Sin buzón Mock en app viva; cubierto por IntegrationTests |
| LOGIN-PREZ | Auth | Login presidente demo | PASS | | |
| ACRED-01 | Acreditación | POST accredit → 410 | PASS | | antiforgery + Ocean id |
| ACRED-02 | Acreditación | POST check-in → 410 | PASS | | |
| ROOM-PREZ-01 | Sala | Presidente en assembly.html | PASS | 03-prez-room.png | sin texto acreditar |
| ROOM-OWNER-01 | Acceso | Owner en sala sin acreditación | PASS | 05-owner-room.png | |
| PRESENCE-01 | Presencia | POST presence | PASS | | 200 |
| QUORUM-01 | Quórum | GET quorum | PASS | | presencia ≠ acreditación |
| LIFE-01 | Ciclo | start-checkin/start | PASS | | 200/400 según estado ya iniciado |
| ROOM-OWNER-02 | Acreditación UI | Sin pedir acreditación | PASS | 06-owner-after-start.png | |
| PORTAL-01 | Portal | CTA → assembly.html | PASS | 07-owner-portal.png | |
| RESP-* | Responsive | 9 viewports | PASS | vp-*.png | sin overflow X |
| SEC-01 | Seguridad | Cross-tenant assembly | PASS | | 400 sin leak |
| SEC-02 | Seguridad | returnUrl externo OAuth | PASS | | 503 sin secrets |
| LK-01 | LiveKit | A/V real multiparticipante | BLOCKED | | headless + deps |
| LOAD-01 | Carga | 10→300 | BLOCKED | | no ejecutado |
| OAUTH-G | Auth | Gmail Google real | BLOCKED | | faltan ClientId/Secret |
| OAUTH-M | Auth | Outlook Microsoft real | BLOCKED | | faltan ClientId/Secret |
| SMTP-01 | SMTP | OTP a buzón real | BLOCKED | | SMTP PH no configurado |
| CONS-01 | Calidad | Consola login | PASS | | |

### Cubierto por Integration/Security/E2E (no solo inspección)

| Área | Evidencia |
|------|-----------|
| OTP happy path + reuse + max attempts + redirect assembly | `EmailLoginOtpTests` (7) |
| Join passwordless → assembly.html | `JoinPasswordlessRedeemTests` |
| Presencia sin acreditación / quórum | `AdminOnlyAccreditationTests` |
| Cross-tenant presence + 410 retired | `CrossTenantAttackTests` (corregido) |
| Meeting flow API (speaker, vote, tenant) | `AssemblyMeetingE2ETests` |

### No ejecutado / incompleto en browser real (marcar BLOCKED o pendiente)

Creación completa PH desde UI, import masivo, agenda UI completa, votación confirmación multi-pestaña, cancelación asamblea UI, chat/reacciones LiveKit, 300 load, lectores de pantalla formales, Google/Microsoft cuentas reales.

---

## Correcciones realizadas durante la certificación

### 1. CrossTenant esperaba 403 en check-in retirado (410)
- **Severidad:** Media (regresión de tests de seguridad)
- **Causa:** Endpoint check-in ahora retorna 410 Gone
- **Archivos:** `tests/Asambleas.SecurityTests/CrossTenantAttackTests.cs`
- **Solución:** Ataque vía `presence`; test dedicado 410 sin leak
- **Retest:** SecurityTests **32 PASS**

### 2. Botones OAuth visibles sin ClientId (CSS override de `[hidden]`)
- **Severidad:** Alta UX/seguridad percibida
- **Causa:** `.oauth-providers { display:grid }` y `.btn-oauth { display:inline-flex }` anulaban el atributo `hidden`
- **Archivos:** `wwwroot/css/components.css`, `wwwroot/index.html` (box inicia `hidden`)
- **Solución:** `[hidden] { display:none !important }` para oauth
- **Retest:** AUTH-UI-02 **PASS**

### 3. Harness E2E: login/antiforgery/assembly id
- **Severidad:** Media (falsos FAIL)
- **Causa:** selector “Entrar” pegaba OTP verify; POST sin CSRF; assembly id incorrecto
- **Archivos:** `tools/e2e/ultra-cert-local.cjs`
- **Retest:** matriz 0 FAIL

---

## Variables / configuración pendiente (bloqueos)

```
Authentication__Google__ClientId=
Authentication__Google__ClientSecret=
Authentication__Microsoft__ClientId=
Authentication__Microsoft__ClientSecret=
Authentication__Microsoft__TenantId=common
Authentication__EmailOtp__Pepper=   # o ASAMBLEAS_EMAIL_OTP_PEPPER
App__PublicBaseUrl=https://<host-publico>
```

**Callbacks OAuth:**
- `{PublicBaseUrl}/signin-google`
- `{PublicBaseUrl}/signin-microsoft`

**SMTP:** canal Email del PH habilitado (sandbox) para OTP real.

**Migración:** `EO023_EmailLoginOtp` debe aplicarse en cada ambiente (local E2E la aplicó vía `ASAMBLEAS_APPLY_MIGRATIONS=true`).

---

## Evidencias clave

- Login passwordless UI: `tools/e2e/ultra-cert-results/01-login.png`
- Sala presidente: `03-prez-room.png`
- Sala propietario: `05-owner-room.png`
- Portal CTAs: `07-owner-portal.png`
- Responsive: `vp-320x568.png` … `vp-1920x1080.png`
- Quórum API (muestra): `presentUnits=1`, `currentCoefficient≈14`, `quorumReached=false` tras un owner presente
- Endpoints acreditación: HTTP **410** `ACCREDITATION_REMOVED`
- HTML assembly/lobby: sin cadenas “acreditar/Acreditación”

---

## Pendientes reales

1. Credenciales Google/Microsoft de prueba → desbloquear OAUTH-G/M  
2. SMTP sandbox por PH → desbloquear OTP-04 / SMTP-01 en browser  
3. LiveKit + permisos media (no headless) → LK-01  
4. Plan de carga controlado 10→300 → LOAD-01  
5. Flujo UI completo crear PH/unidades/import (parcialmente cubierto por suites previas / no re-ejecutado todo en esta corrida)  
6. Commit/push/deploy de cambios OTP + fixes **solo con autorización expresa**

---

## Criterio de salida

| Pregunta | Respuesta |
|----------|-----------|
| ¿0 FAIL en corrida certificada? | Sí |
| ¿Build + tests auto OK? | Sí |
| ¿Acreditación operativa eliminada (410 + UI)? | Sí (probado) |
| ¿Owner entra a sala sin acreditación? | Sí (probado) |
| ¿Google real? | **NO — BLOCKED** |
| ¿Microsoft real? | **NO — BLOCKED** |
| ¿OTP correo entrega real? | **NO — BLOCKED** (API request sí; verify en IntegrationTests) |
| ¿LiveKit real multiparticipante? | **NO — BLOCKED** |
| ¿Certificación total 100 %? | **NO → CERTIFICACIÓN BLOQUEADA** |

---

*Informe generado por corrida local aislada. No commit / no push / no deploy sin autorización.*
