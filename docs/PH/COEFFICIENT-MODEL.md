# Coefficient Model

- Precision: `decimal(7,4)` on `Unit.CoefficientPercent`
- Validator: `CoefficientValidator` (scale 4, tolerance `0.0001`)
- Draft PH may be ≠ 100%
- Ready-for-assembly requires complete total + integrity checks
- Quorum/voting read unit coefficients from DB snapshots — not client vote payload
