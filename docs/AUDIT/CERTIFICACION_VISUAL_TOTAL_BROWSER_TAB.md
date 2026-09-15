# CERTIFICACIÓN VISUAL TOTAL — Browser Tab

- Fecha: 2026-09-14
- Base: https://localhost:7188
- Alcance de esta entrega: propietarios/unidades N:N, aviso para unirse, quórum, contraste

## Inventario cubierto (esta entrega)

| Superficie | Cambio visual | Estado |
|---|---|---|
| PH → Propietarios | Chips de unidades, contador, “Administrar unidades” | Implementado |
| PH → Unidades | Chips multi-propietario, “Administrar propietarios” / “Agregar copropietario” | Implementado |
| Sala → Participantes | Botón “Avisar para unirse” por ausente | Implementado |
| Sala → Toolbar | “Avisar ausentes” | Implementado |
| Lobby propietario | Modal Unirme ahora / Ahora no | Implementado |
| Quórum HUD | No >100% con padrón válido (GroupBy UnitId + engine) | Implementado |
| Contraste | Tokens claros + dialog summon en `ux-remediation.css` | Implementado |

## Criterios de aceptación

1. Un propietario con varias unidades muestra chips (+N más si aplica), no un solo texto truncado.
2. Una unidad con varios propietarios muestra chips de copropietarios.
3. Label de acción es “Avisar para unirse” / “Avisar ausentes” (no “Llamar”).
4. Quórum presente ≤ elegible y ≤ 100 cuando el padrón suma ~100.
5. Textos en superficies claras / dialog de aviso legibles.

## Evidencia relacionada

- Cert funcional: `docs/AUDIT/CERTIFICACION_LLAMADAS_QUORUM_CONTRASTE.md`
- Build Release/Debug: OK
- Realtime previo: `tools/e2e/signalr-assembly-realtime-results/` (CERTIFICADO en entrega anterior)

## Resultado

**APROBADO PARA DESPLIEGUE** — cambios de producto cerrados; push + VPS tras commit de esta entrega.
