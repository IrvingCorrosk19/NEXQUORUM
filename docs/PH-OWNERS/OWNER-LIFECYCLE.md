# Owner lifecycle

Statuses (`OwnerLifecycleStatus`): Draft → Invited → Active → **Inactive**.

## Deactivate

- Sets `Status = Inactive`.
- Ends **active ownerships in the current PH only** (`IsActive=false`, `EffectiveToUtc` set).
- Does **not** delete the `Owner` row or Identity `User`.
- Does **not** affect ownerships in other PHs.
- Blocks new accreditation eligibility (`ResolveEligibleClaimsAsync` requires Active/Invited + active ownership).

## Reactivate

- Restores Draft (no user) or Active (has user).
- Does **not** auto-restore ended ownerships — re-link via ownership API/UI.
- Does **not** duplicate Owner/User.

## Delete

Hard delete only when evaluation finds **no** attendance/votes/participants/powers/representations for assemblies of that PH.

With history → blocked → offer deactivate.
