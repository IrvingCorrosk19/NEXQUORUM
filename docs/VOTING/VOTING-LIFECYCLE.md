# Voting Lifecycle

1. Assembly `InProgress`
2. Motion `Presented`
3. President opens voting (`vote:open`) with `ResultVisibilityPolicy`
4. Eligibility snapshot frozen; session `Open`
5. SignalR `votingOpened` → owners see VOTE NOW
6. Eligible accredited owners cast (`vote:cast`) once
7. Participation pulse via `voteTallyUpdated` (trend per policy)
8. President closes (`vote:close`)
9. Server applies frozen decision rule → motion Approved/Rejected
10. SignalR `votingClosed` with full tally
11. Evidence + minutes consume closed session aggregates

## Close race

If a cast arrives after close starts:

- Session status check fails → `VOTING_CLOSED`
- Concurrent close returns existing closed tally (idempotent)

Cast that wins DB insert before close status flip is included in close tally; late casts after closed status are rejected.
