# Coefficient Voting

- Method `Coefficient` (default): eligibility snapshot stores unit/representation coefficient from authority sources.
- Method `PerPerson`: each eligible voter weight = 1 at open snapshot.
- Method `PerUnit`: uses representation/unit coefficients (same authority path).

Cast path never trusts `coefficient` or `eligible` from the browser.
