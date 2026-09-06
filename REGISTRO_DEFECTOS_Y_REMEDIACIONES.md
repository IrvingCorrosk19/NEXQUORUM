# Registro de defectos y remediaciones

**Stamp:** E2E-CERT-MASTER-20260906_142448

| ID | Sev | Flujo | Causa raíz | Remediación | Estado |
|---|---|---|---|---|---|
| DEF-OWN-04 (falso positivo) | P1 | OWN-04 | Expectativa 4xx; producto es idempotente por email | Ajuste assert idempotente sameId | CERRADO |
| DEF-VOTE-01 (fixture) | P0 | VOTE-01 | Abrir voto sin convocatoria/inscripción/acreditación | Orden invite→activate→convocation→check-in→open | CERRADO |
| DEF-VOTE-02 (fixture) | P0 | VOTE-02 | Choice `Favor`/`A favor` inválido | Usar `InFavor` | CERRADO |
| DEF-ACC-01 (fixture) | P0 | ACC-01 | Check-in sin AssemblyParticipant | Enroll vía convocatoria | CERRADO |

No se debilitaron validaciones de negocio. Defectos de producto nuevos abiertos: **0** en esta ola.
