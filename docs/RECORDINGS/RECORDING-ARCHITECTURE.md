# Recording Architecture

ASAMBLEAS stores **metadata in PostgreSQL** and **media bytes in object/file storage**.

## Components

| Piece | Role |
|-------|------|
| `AssemblyRecording` | Metadata (status, size, checksum, provider, egress id) |
| `PropertyRecordingPolicy` | Mode, visibility, retention, notice |
| `IMeetingRecordingProvider` | LiveKit Egress (preferred) or `SyntheticPilotMp4` fallback |
| `IAssemblyRecordingStorage` | Local filesystem now; S3-compatible later |
| `RecordingService` | Start/stop/refresh/authorize/stream |
| `EvidencePackageExportService` | ZIP expediente **without** video |

## Status machine

`Starting → Recording → Processing → Ready | Failed`

## Storage key

`{tenantId:N}/{assemblyId:N}/{recordingId:N}.mp4`

Never expose raw storage keys to browsers. Playback/download always go through authorized API with range support.
