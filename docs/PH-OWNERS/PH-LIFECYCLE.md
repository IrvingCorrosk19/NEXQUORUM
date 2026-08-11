# PH lifecycle

Statuses (`PhLifecycleStatus`): Draft → ReadyForAssembly → Active → **Inactive**.

## Deactivate

Stores `StatusBeforeDeactivate`, sets `Inactive`. Blocks mutations and new assemblies.

## Reactivate

Restores previous status (fallback Draft).

## Delete

`EvaluatePhDeleteAsync` counts assemblies, votes, recordings, quorum snapshots.

- With history → **blocked** + message to deactivate.
- Empty PH (no assembly history) → hard delete removes units, ownerships, invitations, memberships, orphan draft owners.
