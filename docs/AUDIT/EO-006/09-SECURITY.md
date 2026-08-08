# EO-006 — Security

- Tenant filters on Power / AssemblyRepresentation
- Client UnitId validated against claims; never coefficient authority
- Cross-tenant unit check-in rejected
- Operator accredit requires `attendance:manage`
- Unique DB index prevents duplicate unit representation

XSS / full IDOR matrix: partial — existing security tests + new attendance tests.
