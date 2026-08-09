# Recording Storage

Development/VPS pilot: `LocalFileAssemblyRecordingStorage` root =

- `Recording:StorageRoot` / `ASAMBLEAS_RECORDING_ROOT`
- Docker volume `asambleas_recordings` → `/data/recordings`

Production path: implement S3-compatible `IAssemblyRecordingStorage` with short-lived signed URLs (`TryCreateExpiringReadUrlAsync`). Until then the app **proxies** streams (no public bucket).

`pg_dump` does **not** back up video files — back up the recordings volume separately.
