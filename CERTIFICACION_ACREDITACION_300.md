# Certificacion — Acreditacion 300 (remediacion)

Fecha: 2026-09-06  
**Veredicto: IMPLEMENTED — PARTIAL CERTIFIED**

No CERTIFIED pleno: falta VPS aislado, evidencia movil humana 390x844, matriz concurrencia 2 operadores exhaustiva, y algunos escenarios E2E de la lista 1–20.

## Autoacreditacion

| Paso | Acredita? |
|---|---|
| Recibir correo / convocatoria | No |
| Abrir / preview enlace | No |
| Redeem/claim | No (solo auth+enrol) |
| Registrar mi asistencia / check-in explicito | Si (mesa abierta + elegible) |
| Conexion SignalR | Solo presencia si ya acreditado |

Evidencia: JoinController sin TryAutoAccredit; tests de check-in explicito; session flag VerifiedJoinLink.

## Ausentes

AllEligible sin IncludeAbsent → 0 Registered. Force ausentes bloqueado sin `attendance:force-absent` (test Force_absent_without_permission).

## Batch

- Acreditacion + desacreditacion batch HTTP unica.
- Scale_300_selected_bulk_under_5_seconds: Passed.
- Deaccredit_bulk_and_reaccredit_preserves_power_eligibility: Passed (powers/ownerships vivos; reps historicas IsActive=false; reacredita 22%).

## Padron 381

Diagnostico: "La suma de coeficientes... es 381%. Debe ser 100%...". UI no presenta 190.50 como quorum legal cuando config invalida.

## Seguridad

SecurityTests: **17/17 Passed**. Cross-tenant/manipulated IDs cubiertos por suite existente.

## Build / regresion local

- Application + Web Release: OK
- BulkAccreditationTests: 6/6
- CoefficientConfigurationDiagnosticsTests: 3/3
- SecurityTests: 17/17
- (Voting/Attendance regression en curso / a confirmar en CI)

## VPS

**No ejecutado** — no desplegar hasta autorizacion.

## Riesgos restantes

1. Certificacion movil visual humana.
2. Concurrencia 2 operadores (constraints DB existen; prueba dedicada incompleta).
3. Export diagnostico padron (mensaje OK; export CSV no).
4. Virtualizacion 1000 filas (paginacion 250 si).
5. Deploy VPS + asamblea E2E aislada pendiente.

## Criterios CERTIFIED (checklist)

- [x] Batch 300 cumple objetivo rendimiento (<5s local)
- [x] No ausentes accidentales
- [x] Abrir enlace no acredita
- [x] Deacreditacion batch
- [x] Ownerships/powers intactos tras deacreditar
- [x] Cross-tenant suite seguridad
- [ ] Movil humano
- [ ] VPS aislado
- [~] Concurrencia 2 operadores (parcial / constraints)
- [~] Build completo + todas las suites listadas (parcial)

Por gaps movil/VPS/concurrencia documentados: **IMPLEMENTED — PARTIAL CERTIFIED**.