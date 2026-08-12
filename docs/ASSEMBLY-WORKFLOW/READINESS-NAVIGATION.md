# Readiness Navigation

## Destination keys (whitelist)

Frontend maps server `destinationKey` to internal routes — never arbitrary URLs.

| Key | Module |
|-----|--------|
| assembly-overview | Dashboard |
| assembly-agenda | `/agenda.html` |
| assembly-participants | Acreditación |
| ph-units | PH → Unidades |
| assembly-voting | Votaciones studio |
| assembly-convocation | Convocatoria |
| ph-comms | Comunicaciones PH |
| assembly-lobby | Sala previa |

## Click flow

1. Dashboard checklist row or “Siguiente paso”
2. Module opens with `returnTo=assembly-readiness&assemblyId=…`
3. User completes task
4. **Guardar y volver** → dashboard with `refresh=1`
5. Readiness refetched; next action recalculated
