# Recording Security

- Cookie auth + antiforgery on mutations
- Tenant match on every recording access
- Visibility: `AdminOnly` / `BoardOnly` / `AuthorizedParticipants`
- No public `/recordings/{id}.mp4`
- Anonymous download must fail
- Path traversal blocked in local storage root resolution
- Audit: started/stopped/ready/failed/viewed/downloaded + package generated/downloaded
- Secret votes never expanded to Owner→Choice inside ZIP
