# Assembly Readiness

Server-driven checklist for assembly preparation. Source of truth: `AssemblyReadinessService`.

## Response shape

- `overallStatus`: `Blocking` | `Warning` | `Ready`
- `readyToStart`: all **blocking** checks complete
- `checks[]`: keyed items with severity, description, optional action
- `nextAction`: first actionable blocking item, else first warning

## Check keys

| Key | Severity | Rule |
|-----|----------|------|
| participants | Blocking | ≥1 assembly participant |
| coefficients | Blocking | all PH units have coefficient > 0 |
| agenda | Blocking | ≥1 agenda item |
| documents | Warning | ≥1 convocation |
| voting | Blocking/Warning | quorum > 0; motions/surveys recommended |
| meeting | Warning | LiveKit for virtual modality |
| communications | Warning | email channel enabled (role-gated) |

## RBAC

`canAct` on each check respects user permissions. Owners see status without admin actions.
