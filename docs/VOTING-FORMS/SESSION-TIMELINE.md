# Session Timeline

Expediente timeline is built from audit events with optional `offsetSecondsFromRecordingStart` relative to the earliest recording start.

When offset ≥ 0 and a recording exists, UI offers **Ver en grabación** (seek). Negative offsets (events before recording) do not claim false correlation.
