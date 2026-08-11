# Voting Versioning

- `Motion.RootMotionId` / `PreviousMotionId` / `VersionNumber`
- `VotingSession.RootVotingSessionId` / `PreviousVotingSessionId` / `VersionNumber`
- Cancel preserves ballots on V1 (`Status=Cancelled`)
- `POST .../motions/{id}/versions` clones config into Draft V2
- V1 ballots never migrate; owners must vote again on V2
