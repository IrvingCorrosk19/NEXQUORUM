/** Premium assembly scheduling helpers (PH-local wall clock ↔ UTC). */

const TIME_OPTIONS = [
  "06:00", "06:30", "07:00", "07:30", "08:00", "08:30", "09:00", "09:30",
  "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30",
  "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00"
];

export function fillTimeSelect(selectEl, selected = "19:00") {
  if (!selectEl) return;
  selectEl.innerHTML = TIME_OPTIONS.map((t) => {
    const label = formatTimeLabel(t);
    return `<option value="${t}" ${t === selected ? "selected" : ""}>${label}</option>`;
  }).join("");
}

export function formatTimeLabel(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return new Intl.DateTimeFormat("es-PA", { hour: "numeric", minute: "2-digit" }).format(d);
}

/** Convert PH wall-clock (Y-M-D + HH:mm) in IANA tz to UTC ISO. */
export function phLocalToUtcIso(dateYmd, timeHm, timeZoneId) {
  const [y, mo, d] = dateYmd.split("-").map(Number);
  const [hh, mm] = timeHm.split(":").map(Number);
  const tz = timeZoneId || "America/Panama";
  const utcGuess = new Date(Date.UTC(y, mo - 1, d, hh, mm, 0));
  const asUtc = zonedPartsToUtcMs(utcGuess, tz);
  const offset = asUtc - utcGuess.getTime();
  return new Date(utcGuess.getTime() - offset).toISOString();
}

function zonedPartsToUtcMs(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const parts = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
}

export function utcIsoToPhLocalParts(iso, timeZoneId) {
  const tz = timeZoneId || "America/Panama";
  const d = new Date(iso);
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
  const parts = {};
  for (const p of dtf.formatToParts(d)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`
  };
}

export function kindLabel(kind) {
  if (kind === "EXTRAORDINARY") return "Extraordinaria";
  if (kind === "OTHER") return "Otra";
  return "Ordinaria";
}

export function suggestTitle(kind, dateYmd) {
  const label = kindLabel(kind);
  if (!dateYmd) return `Asamblea ${label}`;
  const [y, m] = dateYmd.split("-").map(Number);
  const month = new Intl.DateTimeFormat("es-PA", { month: "long" }).format(new Date(y, m - 1, 1));
  const monthCap = month.charAt(0).toUpperCase() + month.slice(1);
  return `Asamblea ${label} — ${monthCap} ${y}`;
}

export function formatHumanRange(startIso, endIso, timeZoneId) {
  const tz = timeZoneId || "America/Panama";
  const start = new Date(startIso);
  const end = endIso ? new Date(endIso) : null;
  const date = new Intl.DateTimeFormat("es-PA", {
    timeZone: tz,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(start);
  const t0 = new Intl.DateTimeFormat("es-PA", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(start);
  const t1 = end
    ? new Intl.DateTimeFormat("es-PA", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(end)
    : null;
  return t1 ? `${date} · ${t0} – ${t1}` : `${date} · ${t0}`;
}

export function modalityLabel(m) {
  if (m === "PRESENCIAL") return "Presencial";
  if (m === "HIBRIDA") return "Híbrida";
  return "Virtual";
}

export { TIME_OPTIONS };
