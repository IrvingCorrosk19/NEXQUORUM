# Voting & Forms Architecture

## Reuse (no parallel stack)

Formal votes continue to flow:

`Assembly → AgendaItem → Motion → VotingSession → Vote → Result → Minutes/Expediente`

Surveys are a **separate** instrument (`SurveyForm` / `SurveyQuestion` / `SurveyResponse`) and **do not** create a Motion decision.

## Studio

UI: `/voting-studio.html?assemblyId={id}`

APIs:

- `POST/PUT /api/assemblies/{id}/motions` (+ publish / duplicate / archive)
- `POST /api/assemblies/{id}/agenda`
- `POST/PUT /api/assemblies/{id}/surveys` (+ publish / close / responses / results)

## Rule engine

- `SimpleMajority` — InFavor > Against
- `QualifiedMajority` — InFavor ≥ RequiredThresholdPercent (decimal precision 4)

Rules are snapshotted on `VotingSession` at open (`AppliedDecisionRule`, `RequiredThresholdPercent`, `CalculationMethod`, `BallotKind`, `RuleSnapshotJson`).

## Coefficient

Client never supplies weight. Eligibility snapshots and cast path resolve Owner/Unit/Representation server-side.

## Visibility

`HiddenUntilClose` (default formal) | `PresidentOnlyLive` | `LiveResults` — enforced in API, not CSS.
