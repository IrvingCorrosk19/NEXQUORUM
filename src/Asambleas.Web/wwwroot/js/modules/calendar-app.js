import { api } from "./api.js";
import { logout, me, hasPermission } from "./auth.js";
import { isOwnerPortalUser } from "./roles.js?v=rbac2";
import { escapeHtml, qs, showToast } from "./ui.js";
import { bootIaPage } from "./ia-page.js";
import {
  fillTimeSelect,
  phLocalToUtcIso,
  utcIsoToPhLocalParts,
  suggestTitle,
  formatHumanRange,
  modalityLabel
} from "./schedule-time.js";

const state = {
  user: null,
  view: matchMedia("(max-width: 768px)").matches ? "agenda" : "month",
  cursor: startOfMonth(new Date()),
  events: [],
  selected: null,
  phId: null,
  schedulablePhs: [],
  scheduleDirty: false,
  scheduleSubmitting: false,
  titleTouched: false,
  editingAssemblyId: null
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
  const canSchedule = canScheduleAssemblies(state.user);
  return `<div class="calendar-empty">
    <p>No tienes Asambleas programadas próximamente.</p>
    ${canSchedule ? `<button type="button" class="btn btn-primary" id="empty-schedule">Nueva asamblea</button>` : ""}
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
  qs("#empty-schedule")?.addEventListener("click", () => openScheduleDialog());
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
    if (ev.canEdit && canScheduleAssemblies(state.user)) {
      actions.push(`<button type="button" class="btn btn-ghost" id="act-edit">Editar</button>`);
    }
    if (ev.canReschedule && canScheduleAssemblies(state.user)) {
      actions.push(`<button type="button" class="btn btn-ghost" id="act-reschedule">Reagendar</button>`);
    }
    if (ev.canCancel && hasPermission(state.user, "assembly:cancel") && !isOwnerPortalUser(state.user)) {
      actions.push(`<button type="button" class="btn btn-danger" id="act-cancel">Cancelar asamblea</button>`);
    }
    actions.push(`<a class="btn btn-ghost" href="/api/assemblies/${ev.assemblyId}/calendar.ics" download>Descargar .ics</a>`);
    actions.push(`<button type="button" class="btn btn-ghost" id="act-links">Añadir al calendario</button>`);
    qs("#drawer-actions").innerHTML = actions.join("");
    drawer.hidden = false;
    drawer.setAttribute("aria-hidden", "false");
    qs("#act-edit")?.addEventListener("click", () => openEditDialog(ev));
    qs("#act-reschedule")?.addEventListener("click", () => openReschedule(ev));
    qs("#act-cancel")?.addEventListener("click", () => openCancel(ev));
    qs("#act-links")?.addEventListener("click", async () => {
      try {
        const links = await api(`/api/assemblies/${ev.assemblyId}/calendar-links`);
        const lobbyUrl = `${location.origin}/lobby.html?assemblyId=${ev.assemblyId}`;
        const panel = document.createElement("div");
        panel.className = "calendar-link-sheet";
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-label", "Añadir al calendario");
        panel.innerHTML = `
          <div class="calendar-link-sheet__card">
            <h3>Añadir al calendario</h3>
            <p class="muted">Si Google Calendar no abre (DNS/red), use <strong>Descargar .ics</strong> o copie el enlace del lobby.</p>
            <div class="cluster">
              <a class="btn btn-secondary" href="${escapeHtml(links.googleCalendarUrl)}" target="_blank" rel="noopener">Google Calendar</a>
              <a class="btn btn-secondary" href="${escapeHtml(links.outlookCalendarUrl)}" target="_blank" rel="noopener">Outlook</a>
              <a class="btn btn-primary" href="${escapeHtml(links.icsDownloadPath)}" download>Descargar .ics</a>
              <button type="button" class="btn btn-ghost" data-copy-lobby>Copiar enlace lobby</button>
              <button type="button" class="btn btn-ghost" data-close-sheet>Cerrar</button>
            </div>
            <p class="muted" style="word-break:break-all;margin-top:0.75rem">${escapeHtml(lobbyUrl)}</p>
          </div>`;
        document.body.appendChild(panel);
        const close = () => panel.remove();
        panel.querySelector("[data-close-sheet]")?.addEventListener("click", close);
        panel.addEventListener("click", (e) => {
          if (e.target === panel) close();
        });
        panel.querySelector("[data-copy-lobby]")?.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(lobbyUrl);
            showToast("Enlace del lobby copiado", "success");
          } catch {
            showToast(lobbyUrl, "info");
          }
        });
      } catch (err) {
        showToast(err.message || "No se pudieron obtener enlaces de calendario", "error");
      }
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
  qs("#reschedule-current").textContent = `Fecha actual: ${formatInTz(ev.scheduledAtUtc, ev.timeZoneId)}`;
  qs("#reschedule-form").dataset.assemblyId = ev.assemblyId;
  qs("#reschedule-form").dataset.timeZoneId = ev.timeZoneId || "America/Panama";
  fillTimeSelect(qs("#re-time"), "19:00");
  const parts = utcIsoToPhLocalParts(ev.scheduledAtUtc, ev.timeZoneId);
  qs("#re-date").value = parts.date;
  const reTime = qs("#re-time");
  if ([...reTime.options].some((o) => o.value === parts.time)) {
    reTime.value = parts.time;
  } else {
    const opt = document.createElement("option");
    opt.value = parts.time;
    opt.textContent = parts.time;
    opt.selected = true;
    reTime.appendChild(opt);
  }
  qs("#reschedule-impact").hidden = true;
  openDialog("reschedule-dialog");
}

function openCancel(ev) {
  qs("#cancel-form").dataset.assemblyId = ev.assemblyId;
  openDialog("cancel-dialog");
}

function clearFieldErrors() {
  ["err-ph", "err-title", "err-date", "err-time", "err-end", "err-location"].forEach((id) => {
    const el = qs(`#${id}`);
    if (el) {
      el.hidden = true;
      el.textContent = "";
    }
  });
}

function setFieldError(id, message) {
  const el = qs(`#${id}`);
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || "";
}

function selectedPh() {
  const id = qs("#sched-ph")?.value;
  return state.schedulablePhs.find((p) => p.id === id) || null;
}

function currentModality() {
  return qs('#schedule-form input[name="modality"]:checked')?.value || "VIRTUAL";
}

function currentKind() {
  return qs('#schedule-form input[name="assemblyKind"]:checked')?.value || "ORDINARY";
}

function syncModalityUi() {
  const m = currentModality();
  const loc = qs("#field-location");
  const virt = qs("#field-virtual-info");
  if (loc) loc.hidden = m === "VIRTUAL";
  if (virt) virt.hidden = m === "PRESENCIAL";
  if (m === "VIRTUAL" && qs("#sched-location")) qs("#sched-location").value = "";
}

function syncDurationUi() {
  const wrap = qs("#field-end-custom");
  if (wrap) wrap.hidden = qs("#sched-duration")?.value !== "custom";
}

function syncLobbySummary() {
  const mins = qs("#sched-lobby")?.value || "30";
  const el = qs("#lobby-summary");
  if (el) el.innerHTML = `Los participantes podrán ingresar <strong>${escapeHtml(mins)} minutos</strong> antes.`;
}

function syncTitleSuggestion() {
  if (state.titleTouched) return;
  const title = qs("#sched-title");
  if (title) title.value = suggestTitle(currentKind(), qs("#sched-date")?.value);
}

function syncTzHint() {
  const ph = selectedPh();
  const hint = qs("#sched-tz-hint");
  const phHint = qs("#sched-ph-hint");
  if (hint) {
    hint.textContent = humanTzLabel(ph?.timeZoneId);
  }
  if (phHint) {
    const bits = [ph?.city, ph?.unitCount != null ? `${ph.unitCount} unidades` : null].filter(Boolean);
    phHint.textContent = bits.join(" · ");
  }
}

function humanTzLabel(timeZoneId) {
  if (!timeZoneId) return "Hora local del PH";
  if (timeZoneId === "America/Panama") return "Hora de Panamá";
  if (timeZoneId === "America/Bogota") return "Hora de Bogotá";
  return `Hora local · ${timeZoneId.replace("America/", "").replaceAll("_", " ")}`;
}

async function loadSchedulablePhs() {
  const [memberships, list] = await Promise.all([
    api("/api/ph/memberships/mine").catch(() => []),
    api("/api/ph").catch(() => [])
  ]);
  const byId = new Map((list || []).map((p) => [p.id, p]));
  let phs = (memberships || [])
    .map((m) => {
      const full = byId.get(m.propertyHorizontalId);
      return {
        id: m.propertyHorizontalId,
        name: m.name || full?.name || "PH",
        timeZoneId: full?.timeZoneId || "America/Panama",
        city: full?.city,
        unitCount: full?.unitCount,
        status: full?.status
      };
    })
    .filter((p) => p.status !== "Inactive");

  if (!phs.length && list?.length) {
    phs = list
      .filter((p) => p.status !== "Inactive")
      .map((p) => ({
        id: p.id,
        name: p.name,
        timeZoneId: p.timeZoneId || "America/Panama",
        city: p.city,
        unitCount: p.unitCount,
        status: p.status
      }));
  }

  state.schedulablePhs = phs;
  const select = qs("#sched-ph");
  if (!select) return;
  if (!phs.length) {
    select.innerHTML = `<option value="">No hay propiedades disponibles</option>`;
    return;
  }
  const preferred = state.phId && phs.some((p) => p.id === state.phId) ? state.phId : phs[0].id;
  select.innerHTML = phs
    .map((p) => `<option value="${p.id}" ${p.id === preferred ? "selected" : ""}>${escapeHtml(p.name)}</option>`)
    .join("");
  qs("#field-ph")?.classList.toggle("is-single", phs.length === 1);
  syncTzHint();
}

function resetScheduleForm() {
  const f = qs("#schedule-form");
  if (!f) return;
  f.reset();
  state.titleTouched = false;
  state.scheduleDirty = false;
  state.scheduleSubmitting = false;
  state.editingAssemblyId = null;
  clearFieldErrors();
  fillTimeSelect(qs("#sched-time"), "19:00");
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const pad = (n) => String(n).padStart(2, "0");
  qs("#sched-date").value = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
  if (state.schedulablePhs.length) {
    const preferred =
      state.phId && state.schedulablePhs.some((p) => p.id === state.phId)
        ? state.phId
        : state.schedulablePhs[0].id;
    qs("#sched-ph").value = preferred;
  }
  qs("#sched-duration").value = "120";
  qs("#sched-lobby").value = "30";
  qs("#schedule-title").textContent = "Nueva asamblea";
  qs("#btn-create-assembly").textContent = "Crear asamblea";
  qs("#field-ph")?.classList.toggle("is-single", state.schedulablePhs.length === 1);
  const phSelect = qs("#sched-ph");
  if (phSelect) phSelect.disabled = false;
  syncModalityUi();
  syncDurationUi();
  syncLobbySummary();
  syncTitleSuggestion();
  syncTzHint();
  const btn = qs("#btn-create-assembly");
  if (btn) btn.disabled = false;
}

async function openScheduleDialog() {
  clearFieldErrors();
  await loadSchedulablePhs();
  resetScheduleForm();
  openDialog("schedule-dialog");
  qs("#sched-title")?.focus();
}

async function openEditDialog(ev) {
  clearFieldErrors();
  await loadSchedulablePhs();
  resetScheduleForm();
  state.editingAssemblyId = ev.assemblyId;
  state.titleTouched = true;
  qs("#schedule-title").textContent = "Editar asamblea";
  qs("#btn-create-assembly").textContent = "Guardar cambios";
  const phSelect = qs("#sched-ph");
  if (phSelect) {
    phSelect.value = ev.propertyHorizontalId;
    phSelect.disabled = true;
  }
  qs("#field-ph")?.classList.add("is-single");
  qs("#sched-title").value = ev.title || "";
  const kind = (ev.assemblyKind || "ORDINARY").toUpperCase();
  const kindRadio = qs(`#schedule-form input[name="assemblyKind"][value="${kind}"]`);
  if (kindRadio) kindRadio.checked = true;
  const modality = (ev.modality || "VIRTUAL").toUpperCase();
  const modRadio = qs(`#schedule-form input[name="modality"][value="${modality}"]`);
  if (modRadio) modRadio.checked = true;
  const parts = utcIsoToPhLocalParts(ev.scheduledAtUtc, ev.timeZoneId);
  qs("#sched-date").value = parts.date;
  fillTimeSelect(qs("#sched-time"), parts.time);
  const startMs = new Date(ev.scheduledAtUtc).getTime();
  const endMs = new Date(ev.estimatedEndAtUtc || startMs + 2 * 3600000).getTime();
  const mins = Math.round((endMs - startMs) / 60000);
  const duration = qs("#sched-duration");
  if (["30", "60", "90", "120", "180"].includes(String(mins))) {
    duration.value = String(mins);
  } else {
    duration.value = "custom";
    const endParts = utcIsoToPhLocalParts(ev.estimatedEndAtUtc, ev.timeZoneId);
    qs("#sched-end-time").value = endParts.time;
  }
  qs("#sched-location").value = ev.locationText || "";
  qs("#sched-lobby").value = String(ev.joinWindowMinutesBefore || 30);
  qs("#sched-notes").value = ev.notes || "";
  syncModalityUi();
  syncDurationUi();
  syncLobbySummary();
  syncTzHint();
  openDialog("schedule-dialog");
  qs("#sched-title")?.focus();
}

function requestCloseSchedule() {
  if (!state.scheduleDirty) {
    closeDialog("schedule-dialog");
    return;
  }
  openDialog("discard-dialog");
}

function validateScheduleForm() {
  clearFieldErrors();
  let ok = true;
  if (!qs("#sched-ph")?.value) {
    setFieldError("err-ph", "Selecciona una propiedad horizontal.");
    ok = false;
  }
  if (!qs("#sched-title")?.value.trim()) {
    setFieldError("err-title", "Ingresa un nombre para continuar.");
    ok = false;
  }
  const date = qs("#sched-date")?.value;
  const time = qs("#sched-time")?.value;
  if (!date) {
    setFieldError("err-date", "Elige una fecha.");
    ok = false;
  }
  if (!time) {
    setFieldError("err-time", "Elige una hora de inicio.");
    ok = false;
  }
  const modality = currentModality();
  if ((modality === "PRESENCIAL" || modality === "HIBRIDA") && !qs("#sched-location")?.value.trim()) {
    setFieldError("err-location", "Indica el lugar de la asamblea.");
    ok = false;
  }
  const ph = selectedPh();
  if (date && time && ph) {
    const startIso = phLocalToUtcIso(date, time, ph.timeZoneId);
    if (new Date(startIso).getTime() < Date.now() - 5 * 60 * 1000) {
      setFieldError("err-date", "No se puede programar en el pasado.");
      ok = false;
    }
    if (qs("#sched-duration")?.value === "custom") {
      const endTime = qs("#sched-end-time")?.value;
      if (!endTime) {
        setFieldError("err-end", "Indica la hora de fin.");
        ok = false;
      } else if (new Date(phLocalToUtcIso(date, endTime, ph.timeZoneId)) <= new Date(startIso)) {
        setFieldError("err-end", "La hora de fin debe ser posterior al inicio.");
        ok = false;
      }
    }
  }
  return ok;
}

function buildSchedulePayload() {
  const ph = selectedPh();
  const date = qs("#sched-date").value;
  const time = qs("#sched-time").value;
  const startIso = phLocalToUtcIso(date, time, ph.timeZoneId);
  const duration = qs("#sched-duration").value;
  const endIso =
    duration === "custom"
      ? phLocalToUtcIso(date, qs("#sched-end-time").value, ph.timeZoneId)
      : new Date(new Date(startIso).getTime() + Number(duration) * 60 * 1000).toISOString();
  return {
    propertyHorizontalId: ph.id,
    title: qs("#sched-title").value.trim(),
    modality: currentModality(),
    assemblyKind: currentKind(),
    scheduledAtUtc: startIso,
    estimatedEndAtUtc: endIso,
    requiredQuorumPercent: 50,
    locationText: qs("#sched-location").value.trim() || null,
    notes: qs("#sched-notes").value.trim() || null,
    joinWindowMinutesBefore: Number(qs("#sched-lobby").value || 30),
    publishAsScheduled: true,
    clientRequestId: crypto.randomUUID?.() || `sched-${Date.now()}`
  };
}

function showScheduleSuccess(created, ph, fallbackEndIso) {
  qs("#success-title").textContent = created.title || created.Title;
  const start = created.scheduledAtUtc || created.ScheduledAtUtc;
  const end = created.estimatedEndAtUtc || created.EstimatedEndAtUtc || fallbackEndIso;
  qs("#success-meta").textContent = [
    formatHumanRange(start, end, ph?.timeZoneId || created.timeZoneId),
    modalityLabel(created.modality || created.Modality),
    ph?.name || created.propertyHorizontalName
  ]
    .filter(Boolean)
    .join(" · ");
  const id = created.id || created.Id || created.assemblyId;
  qs("#success-view").href = `/lobby.html?assemblyId=${id}`;
  qs("#success-agenda").href = `/assembly.html?assemblyId=${id}`;
  qs("#success-convocation").href = `/convocation.html?assemblyId=${id}`;
  openDialog("schedule-success-dialog");
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
      if (!qs("#schedule-dialog")?.hidden) requestCloseSchedule();
      else {
        closeDialog("reschedule-dialog");
        closeDialog("cancel-dialog");
        closeDialog("schedule-success-dialog");
        closeDialog("discard-dialog");
      }
    }
  });
  document.querySelectorAll("[data-close]").forEach((b) =>
    b.addEventListener("click", () => {
      const id = b.getAttribute("data-close");
      if (id === "schedule-dialog") requestCloseSchedule();
      else closeDialog(id);
    })
  );
  qs("#btn-schedule")?.addEventListener("click", () => openScheduleDialog());
  qs("#btn-logout")?.addEventListener("click", () => logout());

  qs("#sched-ph")?.addEventListener("change", () => {
    state.scheduleDirty = true;
    syncTzHint();
  });
  qs("#sched-title")?.addEventListener("input", () => {
    state.titleTouched = true;
    state.scheduleDirty = true;
  });
  qs("#sched-date")?.addEventListener("change", () => {
    state.scheduleDirty = true;
    syncTitleSuggestion();
  });
  qs("#schedule-form")?.addEventListener("change", (e) => {
    state.scheduleDirty = true;
    if (e.target.name === "modality") syncModalityUi();
    if (e.target.name === "assemblyKind") syncTitleSuggestion();
    if (e.target.id === "sched-duration") syncDurationUi();
    if (e.target.id === "sched-lobby") syncLobbySummary();
  });
  qs("#btn-keep-editing")?.addEventListener("click", () => closeDialog("discard-dialog"));
  qs("#btn-discard-changes")?.addEventListener("click", () => {
    closeDialog("discard-dialog");
    state.scheduleDirty = false;
    closeDialog("schedule-dialog");
  });

  qs("#schedule-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (state.scheduleSubmitting) return;
    if (!validateScheduleForm()) return;
    state.scheduleSubmitting = true;
    const btn = qs("#btn-create-assembly");
    const editingId = state.editingAssemblyId;
    const { runWithButton } = await import("./loading.js");
    const ph = selectedPh();
    try {
      await runWithButton(btn, editingId ? "Guardando…" : "Creando…", async () => {
        const body = buildSchedulePayload();
        let result;
        if (editingId) {
          result = await api(`/api/assemblies/${editingId}`, {
            method: "PUT",
            body: {
              title: body.title,
              modality: body.modality,
              assemblyKind: body.assemblyKind,
              scheduledAtUtc: body.scheduledAtUtc,
              estimatedEndAtUtc: body.estimatedEndAtUtc,
              locationText: body.locationText,
              notes: body.notes,
              joinWindowMinutesBefore: body.joinWindowMinutesBefore
            }
          });
          state.scheduleDirty = false;
          closeDialog("schedule-dialog");
          showToast({
            title: "Asamblea actualizada",
            message: "Los cambios se aplicaron al calendario.",
            variant: "success"
          });
          closeDrawer();
        } else {
          result = await api("/api/assemblies", { method: "POST", body });
          state.scheduleDirty = false;
          closeDialog("schedule-dialog");
          showScheduleSuccess(result, ph, body.estimatedEndAtUtc);
        }
        await loadEvents();
        await loadNextBanner();
      });
    } catch (err) {
      showToast({
        title: "No se pudo guardar",
        message: err.message || "No se pudo guardar la asamblea",
        variant: "error",
        correlationId: err.correlationId
      });
    } finally {
      state.scheduleSubmitting = false;
    }
  });

  qs("#btn-review-impact")?.addEventListener("click", async () => {
    const f = qs("#reschedule-form");
    const id = f.dataset.assemblyId;
    const tz = f.dataset.timeZoneId || "America/Panama";
    const when = phLocalToUtcIso(f.dateLocal.value, f.timeLocal.value, tz);
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
    const tz = f.dataset.timeZoneId || "America/Panama";
    setLoading(true, "Reprogramando…");
    try {
      await api(`/api/assemblies/${f.dataset.assemblyId}/reschedule`, {
        method: "POST",
        body: {
          newScheduledAtUtc: phLocalToUtcIso(f.dateLocal.value, f.timeLocal.value, tz),
          reason: f.reason.value.trim(),
          notifyParticipants: Boolean(f.notifyParticipants.checked)
        }
      });
      showToast(
        f.notifyParticipants.checked
          ? "Asamblea reprogramada. Puedes notificar desde Comunicaciones."
          : "Asamblea reprogramada",
        "success"
      );
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
    "#nav-dashboard": `/dashboard.html${q}`,
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

function applyOwnerPortalShell() {
  const nav = document.querySelector(".app-nav nav");
  if (nav) {
    nav.innerHTML = `
      <a href="/owner.html">Inicio</a>
      <a href="/owner.html#assemblies">Mis asambleas</a>
      <a href="/calendar.html" aria-current="page">Calendario</a>
      <a href="/owner.html#units">Mis unidades</a>
      <a href="/owner.html#account">Mi cuenta</a>`;
  }
  const brandSub = qs("#nav-tenant");
  if (brandSub) brandSub.textContent = "Portal propietario";
  const eyebrow = document.querySelector(".calendar-hero .command-eyebrow");
  if (eyebrow) eyebrow.textContent = "Mis asambleas";
  const topEyebrow = document.querySelector(".app-top .command-eyebrow");
  if (topEyebrow) topEyebrow.textContent = "Portal propietario";
  document.querySelectorAll("#btn-schedule, #empty-schedule").forEach((el) => el.remove());
  const toolbar = document.querySelector(".calendar-toolbar");
  if (toolbar) toolbar.replaceChildren();
}

function canScheduleAssemblies(user) {
  if (isOwnerPortalUser(user)) return false;
  return hasPermission(user, "assembly:schedule") || hasPermission(user, "assembly:manage");
}

async function init() {
  try {
    state.user = await me();
  } catch {
    location.href = "/";
    return;
  }
  qs("#user-chip").textContent = state.user.displayName || state.user.email;
  const brandSub = qs("#nav-tenant");
  if (brandSub) brandSub.textContent = state.user.tenantName || "Gobernanza";
  state.phId = state.user.propertyHorizontalId || null;
  await bootIaPage({ current: "calendar" });

  const ownerPortal = isOwnerPortalUser(state.user);
  if (ownerPortal) {
    applyOwnerPortalShell();
  }

  const canSchedule = canScheduleAssemblies(state.user);
  const scheduleBtn = qs("#btn-schedule");
  if (scheduleBtn) {
    if (canSchedule) scheduleBtn.hidden = false;
    else scheduleBtn.remove();
  }

  document.querySelectorAll(".view-toggle [data-view]").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.view === state.view));
  });
  wireChrome();
  let navAssemblyId = null;
  try {
    const next = await api("/api/calendar/next");
    navAssemblyId = next?.next?.assemblyId || next?.assemblyId || null;
  } catch {
    /* ignore */
  }
  const assemblies = await api("/api/assemblies").catch(() => []);
  const first = Array.isArray(assemblies) ? assemblies[0] : null;
  if (first?.propertyHorizontalId) state.phId = first.propertyHorizontalId;
  if (!navAssemblyId) navAssemblyId = first?.id || null;
  if (!ownerPortal) {
    wireNav(navAssemblyId);
  }
  await loadNextBanner();
  await loadEvents();
}

init();
