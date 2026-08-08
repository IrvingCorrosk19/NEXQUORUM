# EO-006 — Powers

Entity `Power`: Tenant, PH, Assembly, PrincipalOwnerId, RepresentativeUserId, UnitId, Status, EvidenceReference, ValidatedAt/By.

States: Draft, PendingReview, Approved, Rejected, Revoked, Expired.

Only **Approved** powers materialize into representation.

Demo: Absentee107 → Owner102 (unit 107, 8%); Absentee108 → Owner105 (unit 108, 8%).

Revocation during assembly: **NOT fully implemented** as interactive UI — status can be set to Revoked in DB; re-accreditation blocked; mid-assembly revoke requires explicit process (KNOWN LIMITATION).
