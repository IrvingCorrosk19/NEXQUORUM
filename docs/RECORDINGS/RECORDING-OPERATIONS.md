# Recording Operations

1. Sala: `/assembly.html?assemblyId=` → **Iniciar grabación** (requires `recording:control`)
2. Banner visible: **ESTA SESIÓN ESTÁ SIENDO GRABADA**
3. **Detener grabación** → Processing → Ready
4. Expediente: `/expediente.html?assemblyId=` → Reproducir / Descargar / ZIP

Pilot note: if LiveKit Egress is not deployed, `ASAMBLEAS_RECORDING_SYNTHETIC=true` writes a tiny certified MP4 so auth/stream/download paths are real. Provider name will be `SyntheticPilotMp4` (never claimed as LiveKit capture).
