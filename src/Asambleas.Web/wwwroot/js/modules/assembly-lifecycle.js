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

export function renderHistoricalBanner(status, { cancelReason } = {}) {
  if (status === "Completed") {
    return `<div class="ia-historical-banner" role="status" data-testid="historical-banner">
      <strong>ASAMBLEA FINALIZADA</strong>
      <p>Esta asamblea ha finalizado. La información se encuentra en modo consulta.</p>
    </div>`;
  }
  if (status === "Cancelled") {
    const reason = cancelReason
      ? `<p class="muted">Motivo: ${cancelReason}</p>`
      : "";
    return `<div class="ia-historical-banner ia-historical-banner--cancelled" role="status" data-testid="historical-banner">
      <strong>ASAMBLEA CANCELADA</strong>
      <p>Esta asamblea fue cancelada. Solo consulta de historial e información disponible.</p>
      ${reason}
    </div>`;
  }
  return "";
}
