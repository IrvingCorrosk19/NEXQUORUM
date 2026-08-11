# Recording Integration

Reuses LiveKit recording service + local object/file storage metadata in PostgreSQL (no large blobs in DB).

States: Starting / Recording / Processing / Ready / Failed.

Authorized play/download endpoints under `/api/assemblies/{id}/recording/...`.
