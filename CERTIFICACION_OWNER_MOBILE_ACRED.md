# Certificación — Experiencia propietario (acreditación admin-only + móvil)

**Fecha:** 2026-09-08  
**Entorno:** `https://localhost:7188`  
**Script:** `tools/e2e/owner-mobile-acred-cert.cjs`  
**Evidencia:** `tools/e2e/owner-mobile-acred-results/`  

## Resultado final

**CERTIFICADO** — 31 pass / 0 fail (`matrix.json`)

## Problemas corregidos

1. Copy exacto pendiente / aprobado (lobby + i18n + guía contextual).
2. Sin CTAs de auto-acreditación; tab “Acreditación/Participantes” oculto para owners; redirect desde `checkin.html`.
3. Actualización en vivo al acreditar (SignalR + poll de respaldo).
4. Overflow horizontal a 320 px (lobby owner CSS).
5. Opciones de voto táctiles ≥44 px, confirmación en 2 pasos, loading y bloqueo de duplicado.
6. Fixture E2E autónomo (DB local sin owners demo Ocean).

## Pruebas realizadas

| Check | Resultado |
|-------|-----------|
| Presidente acredita → owner actualiza sin reload | PASS |
| Sin “Acreditarme” / solicitar / check-in owner | PASS |
| API owner check-in 403 | PASS |
| Lobby overflow 320/360/390/412/tablet/desktop | PASS |
| Sala + sheet voto 390; overflow room 320/360/412 | PASS |
| Selección → confirmar → enviar; comprobante | PASS |
| Voto duplicado bloqueado | PASS |

## Capturas

- `01-lobby-390-pending.png`
- `02-lobby-390-approved.png`
- `lobby-320.png` … `lobby-desktop.png`
- `03-room-390.png`, `04-vote-sheet-390.png`, `05-vote-after-390.png`
- `room-320.png`, `room-360.png`, `room-412.png`
