# CERTIFICACIÓN — Llamadas + Quórum + Contraste + Propietarios/Unidades

- Fecha: 2026-09-14
- Entorno: https://localhost:7188
- Commit base previo: `12d89db` (+ cambios de esta entrega)

## 1. Causa raíz del quórum > 100 %

`QuorumService.CalculateInternalAsync` sumaba `CoefficientSnapshot` de **todas** las filas `AssemblyRepresentations` activas de usuarios presentes **sin agrupar por `UnitId`**.

Si existían filas duplicadas (co-propietarios / materialización imperfecta / datos legacy), el mismo coeficiente de unidad se sumaba más de una vez → valores > 100 %.

Adicionalmente, `QuorumEngine` no limitaba el presente al total elegible del padrón cuando Σ unidades ≠ 100.

### Corrección

1. `GroupBy(UnitId)` + `Max(CoefficientSnapshot)` antes de sumar.
2. En `QuorumEngine`: `current` nunca supera `eligibleTotal`; defensa extra a 100.00 cuando el padrón está ~completo.
3. Diagnóstico existente de padrón inválido (Σ ≠ 100) se mantiene.

## 2. Avisar para unirse

- API: `POST .../attendance/participants/{userId}/summon`
- API: `POST .../attendance/summon-absent`
- Servicio: `AssemblySummonService` (cooldown 60 s, no avisa conectados, auditoría `PARTICIPANT_JOIN_SUMMONED`)
- SignalR: `joinSummonRequested` / `joinSummonStatusChanged`
- UI sala: botón por ausente + **Avisar ausentes**
- UI lobby: modal “Unirme ahora” / “Ahora no” + chime + vibración + Notification API

## 3. Propietarios ↔ Unidades (N:N)

- Listado propietarios: chips de unidades + contador + “+N más” → detalle
- Listado unidades: chips de propietarios/copropietarios + contador
- Menú: “Administrar propietarios” / “Agregar copropietario” (ya no “Cambiar” como si fuera 1:1)

## 4. Contraste

- Tokens reforzados en `ux-remediation.css` para superficies claras / choice cards / sheets
- Modal de aviso con colores del tema oscuro legibles

## 5. Archivos principales

- `QuorumService.cs`, `QuorumEngine.cs`
- `AssemblySummonService.cs`, `AttendanceController.cs`, `SignalRAssemblyRealtimePublisher.cs`
- `JoinSummonDtos.cs`, `RealtimeEventNames.cs`, `AuditEventType.cs`
- `ph-app.js`, `ph-units-hub.js`, `ph.css`
- `join-summon.js`, `room-app.js`, `lobby-app.js`, `assembly.html`, `signalr-client.js`
- `ux-remediation.css`

## 6. Resultado

Build Release: **OK**

Pendiente de evidencia Browser Tab en esta corrida: validar visualmente PH Ocean + summon en sala tras reinicio del host.

RESULTADO FUNCIONAL LOCAL: **APROBADO CON OBSERVACIONES** (UI N:N + quórum + avisar implementados; certificar pantallas con Browser Tab en despliegue local tras restart).
