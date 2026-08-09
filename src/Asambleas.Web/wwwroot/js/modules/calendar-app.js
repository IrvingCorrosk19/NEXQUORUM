import { api } from "./api.js";
import { logout, me, hasPermission } from "./auth.js";
import { escapeHtml, qs, showToast } from "./ui.js";

const state = {
  user: null,
  view: matchMedia("(max-width: 768px)").matches ? "agenda" : "month",
  cursor: startOfMonth(new Date()),
  events: [],
  selected: null,
  phId: null
};

function startOfMonth(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function addMonths(d, n) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

function startOfWeek(d) {
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
}

function toLocalInputValue(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(v) {
  return new Date(v).toISOString();
}

function formatInTz(iso, timeZone) {
  try {
    return new Intl.DateTimeFormat("es-PA", {
      timeZone: timeZone || undefined,
      dateStyle: "full",
      timeStyle: "short"
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString("es-PA");
  }
}

function timeShort(iso, timeZone) {
  try {
    return new Intl.DateTimeFormat("es-PA", {
      timeZone: timeZone || undefined,
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit" });
  }
}

function setLoading(on, msg) {
  const el = qs("#calendar-loading");
  if (!el) return;
  el.hidden = !on;
  if (msg) el.textContent = msg;
}

function showError(message) {
  const el = qs("#page-alert");
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || "";
}

function rangeForView() {
  const c = state.cursor;
  if (state.view === "week") {
    const from = startOfWeek(c);
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 7);
    return { from: from.toISOString(), to: to.toISOString(), label: `Semana del ${from.toLocaleDateString("es-PA")}` };
  }
  if (state.view === "agenda" || state.view === "upcoming") {
    const from = new Date();
    from.setUTCHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + (state.view === "upcoming" ? 90 : 21));
    return { from: from.toISOString(), to: to.toISOString(), label: state.view === "upcoming" ? "Próximos 90 días" : "Agenda" };
  }
  const from = startOfMonth(c);
  const to = addMonths(from, 1);
  const label = new Intl.DateTimeFormat("es-PA", { month: "long", year: "numeric", timeZone: "UTC" }).format(from);
  return { from: from.toISOString(), to: to.toISOString(), label };
}

async function loadEvents() {
  setLoading(true, "Cargando calendario…");
  showError("");
  try {
    const { from, to, label } = rangeForView();
    qs("#range-label").textContent = label;
    const status = qs("#filter-status")?.value || "";
    const modality = qs("#filter-modality")?.value || "";
    const q = new URLSearchParams({ from, to });
    if (status) q.set("status", status);
    if (modality) q.set("modality", modality);
    const data = await api(`/api/calendar/events?${q}`);
    state.events = data.events || [];
    render();
  } catch (e) {
    showError(e.message || "No se pudo cargar el calendario");
  } finally {
    setLoading(false);
  }
}

async function loadNextBanner() {
  const el = qs("#next-assembly-banner");
  if (!el) return;
  try {
    const data = await api("/api/calendar/next");
    const n = data.next;
    if (!n) {
      el.classList.add("empty");
      el.innerHTML = `<p class="next-kicker">Próxima asamblea</p><h2>No tienes Asambleas programadas próximamente.</h2>`;
      return;
    }
    el.classList.remove("empty");
    const live = n.calendarStatus === "LIVE";
    el.innerHTML = `
      <p class="next-kicker">${live ? "● EN VIVO" : "Tu próxima Asamblea"}</p>
      <h2>${escapeHtml(n.title)}</h2>
      <p class="next-meta">${escapeHtml(n.propertyHorizontalName)} · ${escapeHtml(n.modality)} · ${escapeHtml(formatInTz(n.scheduledAtUtc, n.timeZoneId))}</p>
      <p><strong>${escapeHtml(n.countdownLabel || "")}</strong></p>
      <div class="cluster" style="margin-top:0.75rem">
        ${n.canJoin ? `<a class="btn btn-primary" href="/lobby.html?assemblyId=${n.assemblyId}">${live ? "Entrar ahora" : "Entrar a la asamblea"}</a>` : `<span class="muted">Disponible a las ${escapeHtml(timeShort(n.joinOpensAtUtc, n.timeZoneId))}</span>`}
        <a class="btn btn-secondary" href="/dashboard.html?assemblyId=${n.assemblyId}">Ver asamblea</a>
        <button type="button" class="btn btn-ghost" data-open-event="${n.assemblyId}">Detalle</button>
      </div>`;
    el.querySelector("[data-open-event]")?.addEventListener("click", () => openEvent(n.assemblyId));
  } catch {
    el.hidden = true;
  }
}

function eventsOnDay(dayUtc) {
  const start = Date.UTC(dayUtc.getUTCFullYear(), dayUtc.getUTCMonth(), dayUtc.getUTCDate());
  const end = start + 86400000;
  return state.events.filter((e) => {
    const t = new Date(e.scheduledAtUtc).getTime();
    return t >= start && t < end;
  });
}

function renderMonth() {
  const root = qs("#calendar-root");
  const monthStart = startOfMonth(state.cursor);
  const gridStart = startOfWeek(monthStart);
  const dows = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  let html = dows.map((d) => `<div class="cal-dow">${d}</div>`).join("");
  for (let i = 0; i < 42; i++) {
    const day = new Date(gridStart);
    day.setUTCDate(gridStart.getUTCDate() + i);
    const outside = day.getUTCMonth() !== monthStart.getUTCMonth();
    const today = new Date();
    const isToday =
      day.getUTCFullYear() === today.getUTCFullYear() &&
      day.getUTCMonth() === today.getUTCMonth() &&
      day.getUTCDate() === today.getUTCDate();
    const items = eventsOnDay(day);
    html += `<div class="cal-day ${outside ? "is-outside" : ""} ${isToday ? "is-today" : ""}">
      <div class="cal-day-num">${day.getUTCDate()}</div>
      ${items
        .map(
          (e) => `<button type="button" class="cal-chip" data-id="${e.assemblyId}">
        <span class="t">${escapeHtml(timeShort(e.scheduledAtUtc, e.timeZoneId))} · ${escapeHtml(e.title)}</span>
        <span class="s">${escapeHtml(e.propertyHorizontalName)}</span>
      </button>`
        )
        .join("")}
    </div>`;
  }
  root.innerHTML = `<div class="cal-month">${html}</div>${renderAgendaFallback()}`;
  root.dataset.view = "month";
  wireChips(root);
}

function renderWeek() {
  const root = qs("#calendar-root");
  const from = startOfWeek(state.cursor);
  let html = "";
  for (let i = 0; i < 7; i++) {
    const day = new Date(from);
    day.setUTCDate(from.getUTCDate() + i);
    const items = eventsOnDay(day);
    html += `<div class="cal-week-col">
      <strong>${day.toLocaleDateString("es-PA", { weekday: "short", day: "numeric", timeZone: "UTC" })}</strong>
      ${items
        .map(
          (e) => `<button type="button" class="cal-chip" data-id="${e.assemblyId}" style="margin-top:0.35rem">
        <span class="t">${escapeHtml(timeShort(e.scheduledAtUtc, e.timeZoneId))}</span>
        <span class="s">${escapeHtml(e.title)}</span>
      </button>`
        )
        .join("") || `<p class="muted" style="margin-top:0.5rem;font-size:0.85rem">Sin eventos</p>`}
    </div>`;
  }
  root.innerHTML = `<div class="cal-week">${html}</div>${renderAgendaFallback()}`;
  root.dataset.view = "week";
  wireChips(root);
}

function renderAgendaFallback() {
  return `<div class="cal-agenda cal-agenda-mobile" hidden></div>`;
}

function renderAgenda() {
  const root = qs("#calendar-root");
  const sorted = [...state.events].sort((a, b) => new Date(a.scheduledAtUtc) - new Date(b.scheduledAtUtc));
  if (!sorted.length) {
    root.innerHTML = emptyState();
    return;
  }
  const groups = new Map();
  for (const e of sorted) {
    const key = new Date(e.scheduledAtUtc).toLocaleDateString("es-PA", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: e.timeZoneId || undefined
    });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  let html = `<div class="cal-agenda">`;
  for (const [day, items] of groups) {
    html += `<section class="cal-agenda-group"><h3>${escapeHtml(day)}</h3>`;
    for (const e of items) {
      html += `<article class="cal-agenda-item" tabindex="0" data-id="${e.assemblyId}">
        <div class="time">${escapeHtml(timeShort(e.scheduledAtUtc, e.timeZoneId))}</div>
        <div>
          <strong>${escapeHtml(e.title)}</strong>
          <div class="muted">${escapeHtml(e.propertyHorizontalName)} · ${escapeHtml(e.modality)}</div>
          <div class="muted">${escapeHtml(e.countdownLabel || "")}</div>
        </div>
        <span class="status-pill ${escapeHtml(e.calendarStatus)}">${escapeHtml(e.calendarStatus)}</span>
      </article>`;
    }
    html += `</section>`;
  }
  html += `</div>`;
  root.innerHTML = html;
  root.dataset.view = state.view;
  wireChips(root);
}

function emptyState() {
  const canSchedule = hasPermission(state.user, "assembly:schedule") || hasPermission(state.user, "assembly:manage");
  return `<div class="calendar-empty">
    <p>No tienes Asambleas programadas próximamente.</p>
    ${canSchedule ? `<button type="button" class="btn btn-primary" id="empty-schedule">Agendar asamblea</button>` : ""}
  </div>`;
}

function wireChips(root) {
  root.querySelectorAll("[data-id]").forEach((el) => {
    el.addEventListener("click", () => openEvent(el.getAttribute("data-id")));
    el.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        openEvent(el.getAttribute("data-id"));
      }
    });
  });
  qs("#empty-schedule")?.addEventListener("click", () => openDialog("schedule-dialog"));
}

function render() {
  if (state.view === "month") renderMonth();
  else if (state.view === "week") renderWeek();
  else renderAgenda();
}

async function openEvent(id) {
  setLoading(true, "Cargando detalle…");
  try {
    const ev = await api(`/api/calendar/events/${id}`);
    state.selected = ev;
    const drawer = qs("#event-drawer");
    qs("#drawer-status").innerHTML = `<span class="status-pill ${escapeHtml(ev.calendarStatus)}">${escapeHtml(ev.calendarStatus)}</span>`;
    qs("#drawer-title").textContent = ev.title;
    qs("#drawer-body").innerHTML = `
      <div><strong>${escapeHtml(ev.propertyHorizontalName)}</strong></div>
      <div>${escapeHtml(formatInTz(ev.scheduledAtUtc, ev.timeZoneId))}</div>
      <div>Modalidad: <strong>${escapeHtml(ev.modality)}</strong></div>
      <div>Estado: <strong>${escapeHtml(ev.status)}</strong>${ev.wasRescheduled ? " · Reprogramada" : ""}</div>
      <div>Convocatoria: <strong>${escapeHtml(ev.convocationStatus || "Pendiente")}</strong></div>
      <div>Confirmados: <strong>${ev.confirmedCount}</strong> / ${ev.participantCount}</div>
      <div>${escapeHtml(ev.countdownLabel || "")}</div>
      ${ev.locationText ? `<div>Ubicación: ${escapeHtml(ev.locationText)}</div>` : ""}`;
    const actions = [];
    actions.push(`<a class="btn btn-secondary" href="/dashboard.html?assemblyId=${ev.assemblyId}">Ver asamblea</a>`);
    if (ev.canJoin) {
      const live = ev.calendarStatus === "LIVE";
      actions.push(`<a class="btn btn-primary" href="/lobby.html?assemblyId=${ev.assemblyId}">${live ? "Entrar ahora" : "Entrar"}</a>`);
    }
    if (ev.canReschedule) actions.push(`<button type="button" class="btn btn-ghost" id="act-reschedule">Reagendar</button>`);
    if (ev.canCancel) actions.push(`<button type="button" class="btn btn-danger" id="act-cancel">Cancelar</button>`);
    actions.push(`<a class="btn btn-ghost" href="/api/assemblies/${ev.assemblyId}/calendar.ics">Descargar .ics</a>`);
    actions.push(`<button type="button" class="btn btn-ghost" id="act-links">Google / Outlook</button>`);
    qs("#drawer-actions").innerHTML = actions.join("");
    drawer.hidden = false;
    drawer.setAttribute("aria-hidden", "false");
    qs("#act-reschedule")?.addEventListener("click", () => openReschedule(ev));
    qs("#act-cancel")?.addEventListener("click", () => openCancel(ev));
    qs("#act-links")?.addEventListener("click", async () => {
      const links = await api(`/api/assemblies/${ev.assemblyId}/calendar-links`);
      window.open(links.googleCalendarUrl, "_blank", "noopener");
    });
  } catch (e) {
    showToast(e.message || "No se pudo abrir el evento", "error");
  } finally {
    setLoading(false);
  }
}

function closeDrawer() {
  const drawer = qs("#event-drawer");
  drawer.hidden = true;
  drawer.setAttribute("aria-hidden", "true");
  state.selected = null;
}

function openDialog(id) {
  qs(`#${id}`).hidden = false;
}

function closeDialog(id) {
  qs(`#${id}`).hidden = true;
}

function openReschedule(ev) {
  qs("#reschedule-current").textContent = `Actual: ${formatInTz(ev.scheduledAtUtc, ev.timeZoneId)}`;
  qs("#reschedule-form").dataset.assemblyId = ev.assemblyId;
  qs("#reschedule-form").elements.newScheduledAtUtc.value = toLocalInputValue(ev.scheduledAtUtc);
  qs("#reschedule-impact").hidden = true;
  openDialog("reschedule-dialog");
}

function openCancel(ev) {
  qs("#cancel-form").dataset.assemblyId = ev.assemblyId;
  openDialog("cancel-dialog");
}

function wireChrome() {
  document.querySelectorAll(".view-toggle [data-view]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      state.view = btn.dataset.view;
      document.querySelectorAll(".view-toggle [data-view]").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      await loadEvents();
    });
  });
  qs("#btn-prev")?.addEventListener("click", async () => {
    if (state.view === "week") state.cursor = new Date(state.cursor.getTime() - 7 * 86400000);
    else state.cursor = addMonths(state.cursor, -1);
    await loadEvents();
  });
  qs("#btn-next")?.addEventListener("click", async () => {
    if (state.view === "week") state.cursor = new Date(state.cursor.getTime() + 7 * 86400000);
    else state.cursor = addMonths(state.cursor, 1);
    await loadEvents();
  });
  qs("#btn-today")?.addEventListener("click", async () => {
    state.cursor = startOfMonth(new Date());
    await loadEvents();
  });
  qs("#filter-status")?.addEventListener("change", () => loadEvents());
  qs("#filter-modality")?.addEventListener("change", () => loadEvents());
  qs("#drawer-close")?.addEventListener("click", closeDrawer);
  qs("#event-drawer")?.addEventListener("click", (e) => {
    if (e.target.id === "event-drawer") closeDrawer();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeDrawer();
      closeDialog("schedule-dialog");
      closeDialog("reschedule-dialog");
      closeDialog("cancel-dialog");
    }
  });
  document.querySelectorAll("[data-close]").forEach((b) =>
    b.addEventListener("click", () => closeDialog(b.getAttribute("data-close")))
  );
  qs("#btn-schedule")?.addEventListener("click", () => {
    if (state.phId) qs("#schedule-form").elements.propertyHorizontalId.value = state.phId;
    openDialog("schedule-dialog");
  });
  qs("#btn-logout")?.addEventListener("click", () => logout());

  qs("#schedule-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    setLoading(true, "Agendando Asamblea…");
    try {
      const body = {
        propertyHorizontalId: f.propertyHorizontalId.value.trim(),
        title: f.title.value.trim(),
        modality: f.modality.value,
        assemblyKind: f.assemblyKind.value,
        scheduledAtUtc: fromLocalInputValue(f.scheduledAtUtc.value),
        estimatedEndAtUtc: f.estimatedEndAtUtc.value ? fromLocalInputValue(f.estimatedEndAtUtc.value) : null,
        requiredQuorumPercent: 50,
        locationText: f.locationText.value || null,
        notes: f.notes.value || null,
        joinWindowMinutesBefore: Number(f.joinWindowMinutesBefore.value || 30),
        publishAsScheduled: true
      };
      await api("/api/assemblies", { method: "POST", body });
      showToast("Asamblea agendada", "success");
      closeDialog("schedule-dialog");
      f.reset();
      await loadEvents();
      await loadNextBanner();
    } catch (err) {
      showToast(err.message || "No se pudo agendar", "error");
    } finally {
      setLoading(false);
    }
  });

  qs("#btn-review-impact")?.addEventListener("click", async () => {
    const f = qs("#reschedule-form");
    const id = f.dataset.assemblyId;
    const when = fromLocalInputValue(f.newScheduledAtUtc.value);
    setLoading(true, "Validando disponibilidad…");
    try {
      const impact = await api(
        `/api/assemblies/${id}/reschedule/impact?newScheduledAtUtc=${encodeURIComponent(when)}`
      );
      const box = qs("#reschedule-impact");
      box.hidden = false;
      box.classList.toggle("warn", (impact.conflicts || []).length > 0);
      box.innerHTML = `
        <strong>Impacto</strong>
        <div>${impact.participantCount} participantes</div>
        <div>${impact.convocationsAffected} convocatorias afectadas</div>
        <div>${impact.pendingReminders} recordatorios pendientes</div>
        <div>${impact.virtualRooms} sala virtual</div>
        ${(impact.notes || []).map((n) => `<div>• ${escapeHtml(n)}</div>`).join("")}
        ${(impact.conflicts || [])
          .map(
            (c) =>
              `<div>⚠ Conflicto: ${escapeHtml(c.title)} ${escapeHtml(timeShort(c.scheduledAtUtc))}</div>`
          )
          .join("")}`;
    } catch (err) {
      showToast(err.message || "No se pudo calcular impacto", "error");
    } finally {
      setLoading(false);
    }
  });

  qs("#reschedule-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    setLoading(true, "Reprogramando…");
    try {
      await api(`/api/assemblies/${f.dataset.assemblyId}/reschedule`, {
        method: "POST",
        body: {
          newScheduledAtUtc: fromLocalInputValue(f.newScheduledAtUtc.value),
          reason: f.reason.value.trim(),
          notifyParticipants: Boolean(f.notifyParticipants.checked)
        }
      });
      showToast("Asamblea reprogramada", "success");
      closeDialog("reschedule-dialog");
      closeDrawer();
      await loadEvents();
      await loadNextBanner();
    } catch (err) {
      showToast(err.message || "No se pudo reagendar", "error");
    } finally {
      setLoading(false);
    }
  });

  qs("#cancel-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    setLoading(true, "Cancelando…");
    try {
      await api(`/api/assemblies/${f.dataset.assemblyId}/cancel`, {
        method: "POST",
        body: { reason: f.reason.value.trim(), notifyParticipants: false }
      });
      showToast("Asamblea cancelada", "success");
      closeDialog("cancel-dialog");
      closeDrawer();
      await loadEvents();
      await loadNextBanner();
    } catch (err) {
      showToast(err.message || "No se pudo cancelar", "error");
    } finally {
      setLoading(false);
    }
  });
}

function wireNav(assemblyId) {
  const q = assemblyId ? `?assemblyId=${assemblyId}` : "";
  const map = {
    "#nav-comms": `/communications.html${q}`,
    "#nav-convocation": `/convocation.html${q}`,
    "#nav-checkin": `/checkin.html${q}`,
    "#nav-lobby": `/lobby.html${q}`,
    "#nav-assembly": `/assembly.html${q}`,
    "#nav-evidence": `/evidence.html${q}`,
    "#nav-minutes": `/minutes.html${q}`
  };
  for (const [sel, href] of Object.entries(map)) {
    const a = qs(sel);
    if (a) a.href = href;
  }
}

async function init() {
  try {
    state.user = await me();
  } catch {
    location.href = "/";
    return;
  }
  qs("#user-chip").textContent = state.user.displayName || state.user.email;
  qs("#nav-tenant").textContent = state.user.tenantName || "Gobernanza";
  state.phId = state.user.propertyHorizontalId || null;
  const canSchedule = hasPermission(state.user, "assembly:schedule") || hasPermission(state.user, "assembly:manage");
  if (canSchedule) qs("#btn-schedule").hidden = false;
  document.querySelectorAll(".view-toggle [data-view]").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.view === state.view));
  });
  wireChrome();
  const assemblies = await api("/api/assemblies").catch(() => []);
  const first = Array.isArray(assemblies) ? assemblies[0] : null;
  if (first?.propertyHorizontalId) state.phId = first.propertyHorizontalId;
  wireNav(first?.id);
  await loadNextBanner();
  await loadEvents();
}

init();
