/** Assembly lifecycle helpers — domain statuses only (no invented Closed/Finalized enums). */

export function isTerminalStatus(status) {
  return status === "Completed" || status === "Cancelled";
}

export function isLiveOperationalStatus(status) {
  return status === "CheckIn" || status === "InProgress" || status === "Paused";
}

/** LiveKit tokens: CheckIn / InProgress / Paused only (Scheduled = lobby prep, not AV). */
export function allowsMeetingJoinToken(status) {
  return isLiveOperationalStatus(status);
}

export function historicalOverviewUrl(assemblyId, status) {
  const id = encodeURIComponent(assemblyId);
  if (status === "Cancelled") {
    return `/dashboard.html?assemblyId=${id}&mode=historical`;
  }
  return `/dashboard.html?assemblyId=${id}&mode=historical`;
}

/** Inner markup only — host element already has `.ia-historical-banner`. */
export function renderHistoricalBanner(status, { cancelReason } = {}) {
  if (status === "Completed") {
    return `<strong>ASAMBLEA FINALIZADA</strong>
      <p>Esta asamblea ha finalizado. La información se encuentra en modo consulta.</p>`;
  }
  if (status === "Cancelled") {
    const reason = cancelReason
      ? `<p class="muted">Motivo: ${cancelReason}</p>`
      : "";
    return `<strong>ASAMBLEA CANCELADA</strong>
      <p>Esta asamblea fue cancelada. Solo consulta de historial e información disponible.</p>
      ${reason}`;
  }
  return "";
}
