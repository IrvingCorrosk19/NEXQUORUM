# Return to Context

## Query parameters

- `assemblyId` — required assembly scope
- `returnTo=assembly-readiness` — only allowed return token
- `refresh=1` — dashboard refetches readiness on load

## Security

- No open redirect: `returnTo` validated against allowlist in `return-context.js`
- Backend still enforces tenant/RBAC on every API call
- PH/assembly IDs validated server-side

## Sticky bar

Modules in readiness flow show:

- Volver a preparación
- Guardar (optional)
- Guardar y volver (optional)

Unsaved changes prompt before leaving when dirty.
