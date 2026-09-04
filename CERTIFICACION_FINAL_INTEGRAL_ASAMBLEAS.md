# Certificacion final integral - Asambleas

**Fecha:** 2026-09-03 (hora local) / 2026-09-04 UTC
**Entorno:** Development local - https://localhost:7188
**PostgreSQL:** local (asambleas / asambleas_tests)
**VPS:** NOT PERFORMED
**SHA base probado:** 17ac25eb65648f0766c4f3ab34b050954149dfb1
**Estado final:** CERTIFIED

## 1. Resumen ejecutivo

Se certifico votacion en vivo, acceso passwordless desde convocatoria, aislamiento del listado por PH activo, seguridad de tokens y composicion de roles. Se corrigieron defectos durante la prueba (scope PH, redaccion de tokens, UX listado) y se revalido con suites automatizadas + E2E en artifacts/cert-integral/.

## 2. Estado inicial y final

| Momento | Estado |
|---------|--------|
| Antes | PARTIALLY CERTIFIED |
| Despues | CERTIFIED |

## 3. SHA base

17ac25eb65648f0766c4f3ab34b050954149dfb1

## 4. Worktree (resumen)

Relacionados (sin commit): passwordless + EO020, votacion UX, aislamiento PH, redaccion /ingresar, tests Join/PhIsolation/RBAC.
Ajenos respetados: deploy VPS, docs/AUDIT, tools e2e historicos.

## 5. Migraciones

- 20260904023050_EO020_AccessLinkRedeemTracking (RedeemCount, FirstRedeemedAtUtc)
- EF has-pending-model-changes: sin cambios pendientes

## 6. Comandos ejecutados

```
git rev-parse HEAD ; git status -sb
dotnet ef migrations has-pending-model-changes --project src/Asambleas.Infrastructure --startup-project src/Asambleas.Web
dotnet build src/Asambleas.Web -c Debug
dotnet run --urls https://localhost:7188
dotnet test tests/Asambleas.UnitTests -c Release
dotnet test tests/Asambleas.ArchitectureTests -c Release
dotnet test tests/Asambleas.SecurityTests -c Release
dotnet test tests/Asambleas.IntegrationTests -c Release
node artifacts/cert-integral/e2e-integral.cjs
node artifacts/cert-integral/e2e-email-sandbox.cjs
node artifacts/cert-integral/e2e-resend.cjs
node artifacts/cert-integral/e2e-cancel-link.cjs
```

## 7. Compilacion

PASS (warnings preexistentes nullable Join; ForwardedHeaders Obsolete).

## 8. Resultado completo de pruebas

| Suite | Resultado |
|-------|-----------|
| UnitTests | 65/65 PASS |
| ArchitectureTests | 3/3 PASS |
| SecurityTests | 16/16 PASS |
| IntegrationTests | 42/42 PASS |

## 9. Matriz PASS/FAIL

| Gate | Resultado | Evidencia |
|------|-----------|-----------|
| Build | PASS | build Debug/Release |
| Automated tests | PASS | artifacts/cert-integral/trx |
| Asamblea creada y visible | PASS | results.json + UI |
| Filtro PH | PASS | list/UI aislados |
| Switch PH | PASS | create B + UI B |
| Transiciones estado | PASS | Draft->Scheduled; cancel |
| Passwordless email | PASS | sandbox mailbox + /ingresar |
| Token security | PASS | probe=0; /ingresar/[REDACTED] |
| Revocacion resend | PASS | resend-flow.json 6/6 |
| Revocacion cancel | PASS | cancel-link.json 6/6 |
| Cross-PH | PASS | spoof + mismatch |
| Cross-tenant | PASS | OTHER GUID 400 |
| Live vote | PASS | ballot + confirmacion |
| Realtime tally | PASS | mesa sin reload |
| Role composition | PASS | owner/prez/phadmin |
| Responsive | PASS | 390/768/1366/1920 |
| Regresion | PASS | integration+security |
| EF model | PASS | no pending |
| VPS | NOT PERFORMED | - |

## 10. Evidencia listado por PH

API create Draft visible inmediato; query otro PH con claim A -> PH_CONTEXT_MISMATCH.
UI: ph-a-assemblies.png / ph-b-assemblies.png.
Test: PhAssembliesListIsolationTests PASS.

## 11. Evidencia estados

Draft=Borrador; publish=Programada; cancel revoca enlace.

## 12. Evidencia passwordless

sandboxMode=true; CTA /ingresar/{token}; sesion Owner sin ph:manage/vote:open; URL limpia a lobby.

## 13. Evidencia correo

POST send + GET /api/dev/mock-mailbox; email-sandbox.json; resend-flow.json.

## 14. Evidencia revocacion

Resend: A 400/401, B 200.
Cancel asamblea: INVALID_OR_EXPIRED, sin cookie.

## 15. Evidencia aislamiento

Cross-tenant 400. Cross-PH create/list rechazados. UI sin contaminacion.

## 16. Evidencia token no filtrado

Serilog MessageTemplate RedactedRequestPath.
OpenTelemetry EnrichWithHttpRequest.
Probe tokencertleak: 0 hits crudos; logs muestran /ingresar/[REDACTED].
Cache-Control: no-store; Referrer-Policy: no-referrer.

## 17. Evidencia votacion realtime

Owner: 3 opciones en viewport sin reload; confirmacion "Tu voto fue registrado correctamente".
Mesa: contador incremento sin reload. Duplicado: 400.

## 18. Evidencia responsive

390/768/1366/1920 overflowX=false; owner-*.png.

## 19. Defectos y correcciones

| Defecto | Correccion |
|---------|------------|
| Listado mezclaba PH | Scope PH claim/query |
| Create con PHId ajeno | ResolveCreatePropertyHorizontalId |
| GET GUID cross-PH | Acceso ligado a PH activo |
| Token en logs | Redaccion Serilog + OTLP |
| Mailbox vacio | sandboxMode en prueba |
| UX listado | ph-app.js + titulos |

## 20. Riesgos pendientes

- Cooldown reenvio 45s (intencional).
- testRecipientOverride redirige correo pero el token sigue ligado al destinatario original del lote.
- Verificar sinks de telemetria en staging.

## 21. VPS

Confirmado: no se desplego al VPS.

## 22. Estado exacto

CERTIFIED

```
BUILD: PASS
AUTOMATED TESTS: PASS (Unit 65, Arch 3, Security 16, Integration 42)
ASSEMBLY CREATED AND VISIBLE: PASS
PH FILTER: PASS
PH SWITCH: PASS
STATUS TRANSITIONS: PASS
PASSWORDLESS EMAIL ACCESS: PASS
TOKEN SECURITY: PASS
CANCEL/RESEND REVOCATION: PASS
CROSS-PH: PASS
CROSS-TENANT: PASS
LIVE VOTE: PASS
REALTIME TALLY: PASS
ROLE COMPOSITION: PASS
RESPONSIVE: PASS
REGRESSION: PASS
DATABASE MODEL: PASS (no pending changes)
VPS DEPLOYMENT: NOT PERFORMED
FINAL STATUS: CERTIFIED
```