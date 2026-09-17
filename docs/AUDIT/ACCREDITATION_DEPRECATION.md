# Deprecación: proceso de acreditación

Fecha: 2026-09-17 (actualizado con flujo propietario simplificado)  
Estado: **retirado del flujo operativo** (convocatoria + presencia)

## Nueva regla

- **Convocado** = autorizado a participar (invitación válida).
- **Presente** = ingresó a la sala (`AttendanceStatus` Present / CheckedIn / TemporarilyDisconnected).
- El quórum y el voto dependen de **presencia real**, no de `IsAccredited`.
- Enviar convocatoria **no** marca presente.

## Flujo propietario simplificado

1. Abre `/ingresar/{token}` o se autentica (Google / Microsoft / OTP correo).
2. Tras identidad válida → **`/assembly.html?assemblyId=…`** (no lobby como destino por defecto).
3. Se enrolla en convocatorias abiertas; la presencia se registra al unirse al hub.
4. Sin acreditación, sin selección de PH/unidad, sin contraseña de correo.

## Endpoints retirados (HTTP 410 Gone)

- `POST .../attendance/check-in`
- `POST .../attendance/participants/{userId}/accredit`
- `POST .../attendance/participants/{userId}/deaccredit`
- `POST .../attendance/accredit-bulk` (+ `/preview`)
- `POST .../attendance/deaccredit-bulk` (+ `/preview`)

## Campos / columnas conservados (histórico)

No se eliminan datos ni columnas. Quedan deprecados para asambleas anteriores:

| Elemento | Tabla / tipo | Uso nuevo |
|----------|--------------|-----------|
| `IsAccredited` | `assembly_participants` | Solo histórico; no gatea quórum/voto |
| `AccreditedAtUtc` | `assembly_participants` | Histórico |
| `AccreditedByUserId` | `assembly_participants` | Histórico |
| `AccreditedAtUtc` / `AccreditedByUserId` | `assembly_representations` | Se rellenan al materializar en el join (auditoría de freeze) |
| Eventos `ParticipantAccredited` / `ParticipantDeaccredited` / `BulkAccreditation` | `audit_events` | Solo asambleas antiguas |
| DTO `IsAccredited`, `CanAccredit`, SignalR `accreditationChanged` | Contracts / Realtime | Compat API; UI no debe gatedarlos |
| Permiso `attendance:manage` | Roles | Sigue para mesa/participantes; ya no “acreditar” |

## Comportamiento actual

1. Convocatoria / invite link valida token, PH, propietario, vigencia.
2. Al unirse (SignalR `JoinAssembly` o `POST .../presence`) se materializan representaciones y se marca Present.
3. Quórum recalcula por representaciones de usuarios presentes (sin doble conteo por unidad).
4. Lobby: auto-admisión para convocados (sin aprobación del presidente); destino preferido = sala.

## Migración de esquema

- No migraciones destructivas de acreditación.
- OTP: migración aditiva `EO023_EmailLoginOtp` (`email_login_challenges`).

## Pruebas de referencia

- `AdminOnlyAccreditationTests` → presencia directa + 410 en endpoints viejos
- `AttendanceRepresentationTests` → materialización en join
- `BulkAccreditationTests` → 410
- `EmailLoginOtpTests` → OTP sin enumeración + redirect a sala
- `JoinPasswordlessRedeemTests` → redeem → `/assembly.html`
