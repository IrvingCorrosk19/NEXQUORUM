# Voting Rule Engine

`DecisionRuleResolver` selects the rule frozen on the session.

| Code | Behavior |
|------|----------|
| SimpleMajority | Favor > Contra |
| QualifiedMajority | Favor ≥ threshold % |

Example (coeff): Favor 63, Contra 25, Abstención 12, threshold 66.67 → **Rejected**.
