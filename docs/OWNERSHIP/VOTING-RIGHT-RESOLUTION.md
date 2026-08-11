# Voting right resolution

`AssemblyRepresentationService.ResolveEligibleClaimsAsync` loads active ownerships for the owner’s units and uses each unit’s `CoefficientPercent`.
Materialization enforces one active representation per unit (no double count).
Powers cannot duplicate an owned unit claim.
