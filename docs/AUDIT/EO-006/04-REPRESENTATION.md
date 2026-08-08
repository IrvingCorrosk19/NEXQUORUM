# EO-006 — Representation

`IAssemblyRepresentationService` is the single authority.

`AssemblyRepresentation`: CoefficientSnapshot frozen at accreditation; IsActive; unique per assembly+unit when active.

Preview API: `GET .../attendance/participants/{userId}/preview` returns owned, represented, effective %, conflicts.
