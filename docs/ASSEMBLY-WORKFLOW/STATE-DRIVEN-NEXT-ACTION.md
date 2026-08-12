# State-Driven Next Action

## Rules

1. If `readyToStart` → show assembly status CTA (e.g. Abrir acreditación)
2. Else if `nextAction.canAct` → deep-link to resolving module
3. Else → show description + permission note

## Blocking vs workspace

Readiness workflow guides preparation. “Espacio de trabajo” groups direct links (Preparación / Durante / Después) without competing with next-action card.
