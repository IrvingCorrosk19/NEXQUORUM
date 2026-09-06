# Analisis — Acreditacion masiva (remediacion final)

Fecha: 2026-09-06  
Estado previo: IMPLEMENTED — PARTIAL CERTIFIED  
Estado objetivo post-remediacion: ver CERTIFICACION (sigue parcial hasta VPS + movil humano).

## Correcciones de esta remediacion

1. **Autoacreditacion**: eliminada de redeem/claim. Solo enrola. Acreditacion = accion explicita (`check-in` / mesa) con metodo `SelfCheckIn` o `VerifiedJoinLink` (flag de sesion tras redeem).
2. **Ausentes**: `AllEligible` ya no incluye `Registered` por defecto. Acreditar ausentes exige `attendance:force-absent` + frase `ACREDITAR AUSENTES` + motivo. Accion principal UI: **Acreditar seleccionados verificados**.
3. **Batch 300**: un SaveChanges, claims en bulk, quorum una vez, auditoria WriteMany. Objetivo <5s cumplido en tests.
4. **Deacreditacion batch**: `deaccredit-bulk` + preview; UI una sola peticion.
5. **Representaciones**: solo `IsActive=false` en snapshots de asamblea; ownerships/powers intactos; reacreditacion reconstruye.
6. **Confirmados**: eliminado contador ficticio (opcion A).
7. **Operadores 0%**: resumen separa propietarios vs personal de mesa / coeficiente.
8. **Padron 381**: mensaje claro "suma es X%, debe ser 100%" + UI "CONFIGURACION INVALIDA" sin mostrar 190.50 como quorum legal.

## No desplegado a VPS en esta fase

Pendiente autorizacion tras checklist CERTIFICACION.