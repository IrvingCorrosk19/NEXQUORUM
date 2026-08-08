# EO-006 — Quorum Engine

Formula (`QuorumEngine`):

```
eligibleTotal = Σ Unit.CoefficientPercent for PH
current = Σ AssemblyRepresentation.CoefficientSnapshot
         where IsActive AND representative IsAccredited
         AND status ∈ {CheckedIn, Present, TemporarilyDisconnected}
required = round(eligibleTotal × RequiredQuorumPercent/100, 4)
reached = current >= required
missing = max(0, required - current)
```

Snapshots persist with optional Reason (`CheckIn`, `ThresholdReached`, `ThresholdLost`, `VotingOpen`, `VotingClose`).

No legal auto-end on quorum loss — operational alert via status/UI only.
