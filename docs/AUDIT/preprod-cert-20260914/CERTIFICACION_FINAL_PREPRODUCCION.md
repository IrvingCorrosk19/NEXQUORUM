# CERTIFICACIÓN FINAL PREPRODUCCIÓN — ASAMBLEAS

- **Fecha:** 2026-09-14 / 2026-09-15 (UTC-5)
- **Entorno:** `https://localhost:7188` (Development)
- **Commit inicial:** `75c6836642a0cb2ceaddfdd13b58ee3dcbca7115`
- **Commit final (esta certificación):** *(pendiente al cerrar el commit `fix: certificación…`)*
- **Rama:** `master`
- **Rol Browser Tab principal:** Presidente (`president@ocean.demo`)
- **PH usado:** OMC2 196148 (`c6c486e9-4ea8-456c-a733-fa3701b0d0f9`)
- **Asamblea creada:** Cert Preprod (`09773352-76e4-47a4-8f66-e77731f2c4a3`) → Scheduled → Check-in → InProgress

## Resumen ejecutivo

Se ejecutó una certificación real con Browser Tab + build + unit tests. Se corrigieron dos defectos P1 descubiertos en caliente (quórum DTO sin total elegible en lectura por snapshot; desactivar unidad dejando ownerships activos).

**No se declara GO.** Quedan flujos críticos sin prueba multi-sesión real en Browser Tab (cookies compartidas), suite Integration/Security no ejecutable en este host por configuración de fixture DB, y áreas de votación móvil / video multiparticipante / acta sin revalidación completa en esta corrida.

## Build y pruebas automatizadas

| Suite | Resultado | Notas |
|---|---|---|
| `dotnet build` Release/Debug | **PASS** | 2 warnings conocidos (ASPDEPR005, CS8602) |
| UnitTests (100) | **PASS** | Release |
| Quorum filter (15) | **PASS** | Debug tras fixes |
| ArchitectureTests (3) | **PASS** | |
| SecurityTests (17) | **FAIL / BLOCKED** | Fixture WebApplicationFactory: `NpgsqlException` sin password en SASL |
| IntegrationTests (76) | **FAIL / BLOCKED** | Misma causa de fixture DB |
| E2E .NET | **NOT RUN** | Bloqueado por fixture |

## Evidencia Browser Tab

Carpeta: `tools/e2e/preprod-cert-results/`

| Archivo | Contenido |
|---|---|
| `01-ph-after-login.png` | Login presidente → listado PH |
| `02-assembly-room-live.png` / `page-…02-03-20…` | Sala EN VIVO, ACREDITADOS/PRESENTES, Avisar ausentes |
| `03-assembly-mobile-390.png` | Quórum 0.00% / requerido 50.00% en 390×844 |
| Capturas units hub | Modal unidad 101 con 2 copropietarios 50/50 |

## Funciones realmente probadas

### Autenticación
- Login UI presidente con loading “Iniciando sesión” → PH admin. **PASS**

### PH / propietarios / unidades
- Listado PH, abrir OMC2, tabs Propietarios/Unidades/Asambleas. **PASS (parcial)**
- Chips de unidades en propietarios. **PASS**
- Chips/conteo de propietarios en unidades. **PASS**
- Modal unidad: listar 2 copropietarios, CTA “Agregar copropietario”. **PASS**
- API: asociar segundo copropietario (equal split 50/50). **PASS**
- Padón inválido detectado (Σ=101) y corregido desactivando unidad CERT. **PASS (datos)**
- Escenarios NO cubiertos: 3+ unidades por propietario, representante, import masivo, paginación 300, eliminar, XSS. **NOT TESTED**

### Asambleas
- Crear/programar vía `POST /api/assemblies` → Scheduled. **PASS**
- start-checkin → start → InProgress. **PASS**
- Cancelar/reprogramar/completadas. **NOT TESTED**
- PH Draft no marca “ready” por ownership→unidad inactiva (bloqueo legítimo). **PASS (hallazgo)**

### Quórum
- API `/quorum` en vivo: current 0, required 50, eligibleUnits 1, **eligibleCoefficientTotal 100** (tras fix), invalid=false. **PASS**
- UI sala: “Sin quórum 0.00% / Mínimo 50.00%”. **PASS**
- Presidente acreditado no suma unidad (sin representación) → 0% correcto. **PASS**
- >100% no observado en esta corrida. Máximo requerido mostrado: **50.00%**. **PASS (esta corrida)**
- Reconexión / doble dispositivo / acta. **NOT TESTED**

### Avisar para unirse
- Botón `#btn-summon-absent` visible (“Avisar ausentes”). **PASS**
- `POST …/summon-absent` → 200, skippedConnected=1 (presidente). **PASS**
- Modal Unirme ahora en lobby propietario. **NOT TESTED** (sin segunda sesión aislada)

### Realtime multi-sesión
- **NOT TESTED** en Browser Tab: pestañas comparten cookies; no hay segundo contexto aislado.
- Evidencia previa externa: `tools/e2e/signalr-assembly-realtime-results/` (no revalidada hoy).

### Contraste
- Guías contextuales dark (`cx-guide`) OK.
- Empty-state video: estilos corregidos en entrega previa; empty medido sobre stage transparente en un frame. **PARTIAL**
- Resoluciones obligatorias: solo **390×844** y **1366×768** muestreadas. Resto **NOT TESTED**

### Seguridad
- Acceso a PH inexistente → 400 “Property horizontal not found.” **PASS (smoke)**
- Manipulación ID / CSRF / XSS / fuga real entre dos PH con datos. **NOT TESTED**
- SecurityTests automatizados **BLOCKED**

### Votaciones / Video / Acta
- **NOT TESTED** en esta corrida Browser Tab.

## Defectos

Ver `REGISTRO_DEFECTOS_PREPRODUCCION.md`.

## Matriz de lanzamiento

| Área | Funcional | UI/UX | Móvil | Seguridad | Realtime | Resultado |
|---|---|---|---|---|---|---|
| Autenticación | PASS | PASS | PARTIAL | NOT TESTED | N/A | PARTIAL |
| PH y tenant | PARTIAL | PARTIAL | PARTIAL | PARTIAL | N/A | PARTIAL |
| Unidades | PASS | PASS | PARTIAL | NOT TESTED | N/A | PARTIAL |
| Propietarios | PARTIAL | PASS | PARTIAL | NOT TESTED | N/A | PARTIAL |
| Asambleas | PARTIAL | PARTIAL | PARTIAL | NOT TESTED | PARTIAL | PARTIAL |
| Convocatorias | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | N/A | NOT TESTED |
| Acreditación | PARTIAL | PARTIAL | NOT TESTED | NOT TESTED | NOT TESTED | PARTIAL |
| Quórum | PASS* | PASS | PASS | NOT TESTED | NOT TESTED | PARTIAL |
| Agenda | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Mociones | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Votaciones | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Video | NOT TESTED | PARTIAL | PARTIAL | NOT TESTED | NOT TESTED | NOT TESTED |
| Finalización | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Acta | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | N/A | NOT TESTED |
| Históricos | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | N/A | NOT TESTED |

\*Quórum: no >100% en corrida; fix lectura snapshot verificado.

## Riesgos residuales

1. Integration/Security/E2E .NET no corren en este entorno (fixture DB).
2. Multi-sesión Browser Tab no aislable con cookies compartidas.
3. Demo Ocean seed ausente en DB local (solo PHs de cert previas).
4. Ownerships huérfanos previos a fix de desactivación pueden quedar en datos viejos.
5. Cobertura de votación móvil / acta / LiveKit multi-usuario incompleta esta noche.

## Recomendación

**NO-GO** para producción mañana hasta completar: (a) multi-sesión SignalR+voto+acta con evidencia, (b) Security/Integration verdes o entorno de CI equivalente, (c) matriz de resoluciones completa, (d) smoke convocatorias/enlaces.

No se realizó push ni despliegue.
