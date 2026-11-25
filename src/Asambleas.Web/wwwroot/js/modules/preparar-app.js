import { api } from "./api.js";
import { logout, me } from "./auth.js";
import { bootIaPage } from "./ia-page.js?v=polish9";
import { fillTimeSelect, kindLabel, phLocalToUtcIso, utcIsoToPhLocalParts } from "./schedule-time.js";
import { escapeHtml } from "./ui.js?v=agenda-return1";

const params = new URLSearchParams(location.search);
let assemblyId = params.get("assemblyId");
let step = Number(params.get("step") || 0);
let assembly = null;
let phs = [];
let agenda = [];
let owners = [];
let channels = [];
let convocation = null;
let editingAgendaId = null;
let dirty = false;
let saving = false;
let createKey = sessionStorage.getItem("asambleas-prep-create") || crypto.randomUUID();
sessionStorage.setItem("asambleas-prep-create", createKey);
let sendKey = null;
const labels = ["Datos", "Agenda", "Destinatarios", "Revisar"];

const qs = (sel) => document.querySelector(sel);

function setStatus(text) {
  const el = qs("#save-status");
  if (el) el.textContent = text || "";
}

function fieldError(id, message) {
  const el = qs(id);
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || "";
}

function markDirty() {
  dirty = true;
}

function modalityLabel(value) {
  if (value === "PRESENCIAL") return "Presencial";
  if (value === "HIBRIDA") return "Híbrida";
  return "Virtual";
}

function sentStatus(status) {
  return ["Sent", "Partial", "Failed", "Sending"].includes(status);
}

async function loadPhs() {
  const [mine, all] = await Promise.all([
    api("/api/ph/memberships/mine").catch(() => []),
    api("/api/ph").catch(() => [])
  ]);
  const rows = [...(Array.isArray(all) ? all : []), ...(Array.isArray(mine) ? mine : [])];
  const map = new Map();
  for (const row of rows) {
    const id = row.id || row.propertyHorizontalId;
    if (!id || map.has(id)) continue;
    map.set(id, {
      id,
      name: row.name || row.propertyHorizontalName || "PH",
      timeZoneId: row.timeZoneId || "America/Panama"
    });
  }
  phs = [...map.values()];
  const select = qs("#f-ph");
  const requested = params.get("phId");
  select.innerHTML = phs.map((ph) => `<option value="${ph.id}">${escapeHtml(ph.name)}</option>`).join("");
  if (requested && phs.some((ph) => ph.id === requested)) select.value = requested;
}

function selectedPh() {
  return phs.find((ph) => ph.id === qs("#f-ph").value) || phs[0];
}

function syncPlace() {
  const modality = qs("#f-modality").value;
  qs("#place-wrap").hidden = modality === "VIRTUAL";
}

function readAssemblyForm() {
  const ph = selectedPh();
  const date = qs("#f-date").value;
  const time = qs("#f-time").value;
  const start = date && time && ph ? phLocalToUtcIso(date, time, ph.timeZoneId) : null;
  const minutes = Number(qs("#f-duration").value || 120);
  return {
    propertyHorizontalId: ph?.id,
    title: qs("#f-title").value.trim(),
    assemblyKind: qs("#f-kind").value,
    modality: qs("#f-modality").value,
    scheduledAtUtc: start,
    estimatedEndAtUtc: start ? new Date(new Date(start).getTime() + minutes * 60000).toISOString() : null,
    locationText: qs("#f-place").value.trim() || null,
    notes: qs("#f-notes").value.trim() || null,
    joinWindowMinutesBefore: 30,
    requiredQuorumPercent: 50,
    publishAsScheduled: true,
    clientRequestId: createKey
  };
}

function validateAssembly() {
  let ok = true;
  fieldError("#err-ph", "");
  fieldError("#err-title", "");
  fieldError("#err-date", "");
  fieldError("#err-place", "");
  const data = readAssemblyForm();
  if (!data.propertyHorizontalId) {
    fieldError("#err-ph", "Selecciona el PH de destino.");
    ok = false;
  }
  if (!data.title) {
    fieldError("#err-title", "Ingresa el nombre de la asamblea.");
    ok = false;
  }
  if (!data.scheduledAtUtc) {
    fieldError("#err-date", "Indica fecha y hora.");
    ok = false;
  } else if (new Date(data.scheduledAtUtc).getTime() < Date.now() - 5 * 60000) {
    fieldError("#err-date", "No se puede programar en el pasado.");
    ok = false;
  }
  if (data.modality !== "VIRTUAL" && !data.locationText) {
    fieldError("#err-place", "Indica el lugar.");
    ok = false;
  }
  return ok ? data : null;
}

async function saveAssembly() {
  const data = validateAssembly();
  if (!data) return false;
  setStatus("Guardando…");
  try {
    if (!assemblyId) {
      const created = await api("/api/assemblies", { method: "POST", body: data });
      assemblyId = created.assemblyId || created.id;
      sessionStorage.removeItem("asambleas-prep-create");
      history.replaceState({}, "", urlFor(2));
    } else {
      const update = {
        title: data.title,
        modality: data.modality,
        scheduledAtUtc: data.scheduledAtUtc,
        estimatedEndAtUtc: data.estimatedEndAtUtc,
        assemblyKind: data.assemblyKind,
        locationText: data.locationText,
        joinWindowMinutesBefore: 30
      };
      if (data.notes) update.notes = data.notes;
      await api(`/api/assemblies/${assemblyId}`, { method: "PUT", body: update });
    }
    await loadAssembly();
    dirty = false;
    setStatus("Cambios guardados.");
    return true;
  } catch (error) {
    setStatus("No se pudo guardar. Reintentar.");
    fieldError("#err-title", error.message || "No se pudo guardar la asamblea.");
    return false;
  }
}

async function loadAssembly() {
  if (!assemblyId) return;
  assembly = await api(`/api/calendar/events/${assemblyId}`);
  const ph = phs.find((item) => item.id === assembly.propertyHorizontalId);
  if (ph) qs("#f-ph").value = ph.id;
  qs("#f-ph").disabled = true;
  qs("#f-title").value = assembly.title || "";
  qs("#f-kind").value = assembly.assemblyKind || "ORDINARY";
  qs("#f-modality").value = assembly.modality || "VIRTUAL";
  const parts = utcIsoToPhLocalParts(assembly.scheduledAtUtc, assembly.timeZoneId || ph?.timeZoneId);
  qs("#f-date").value = parts.date;
  fillTimeSelect(qs("#f-time"), parts.time);
  qs("#f-place").value = assembly.locationText || "";
  syncPlace();
  paintHead();
}

function paintHead() {
  qs("#prep-title").textContent = assembly?.title || "Nueva asamblea";
  const ph = phs.find((item) => item.id === (assembly?.propertyHorizontalId || qs("#f-ph").value));
  qs("#prep-ph").textContent = ph ? ph.name : "Elige el PH de destino.";
}

function urlFor(nextStep) {
  const query = new URLSearchParams();
  if (assemblyId) query.set("assemblyId", assemblyId);
  else if (qs("#f-ph")?.value) query.set("phId", qs("#f-ph").value);
  query.set("step", String(nextStep));
  return `/preparar.html?${query}`;
}

function paintSteps() {
  qs("#prep-steps").innerHTML = labels.map((label, index) => {
    const number = index + 1;
    return `<li><button type="button" data-step="${number}" ${number === step ? 'aria-current="step"' : ""} ${!assemblyId && number > 1 ? "disabled" : ""}>${number}. ${label}</button></li>`;
  }).join("");
  for (let index = 1; index <= 4; index += 1) qs(`#step-${index}`).hidden = index !== step;
  const sent = sentStatus(convocation?.status);
  qs("#btn-back").hidden = step === 1;
  qs("#btn-exit").hidden = sent;
  const next = qs("#btn-next");
  if (sent) {
    next.hidden = true;
    return;
  }
  next.hidden = false;
  next.textContent = step === 3 ? "Guardar y revisar" : step === 4 ? "Enviar convocatoria" : "Guardar y continuar";
}

async function showStep(next, { push = true } = {}) {
  step = next;
  paintSteps();
  paintHead();
  if (push) history.pushState({ step }, "", urlFor(step));
  try {
    if (step === 2) await loadAgenda();
    if (step === 3) await loadRecipients();
    if (step === 4) await loadReview();
  } catch (error) {
    setStatus("No se pudo guardar. Reintentar.");
    qs("#page-alert").hidden = false;
    qs("#page-alert").textContent = error.message || "No se pudo cargar este paso.";
  }
}

async function loadAgenda() {
  const response = await api(`/api/assemblies/${assemblyId}/agenda`);
  agenda = response.items || [];
  qs("#agenda-list").innerHTML = agenda.map((item, index) => `
    <div class="agenda-row">
      <div><strong>${index + 1}. ${escapeHtml(item.title)}</strong><div class="text-secondary">${escapeHtml(item.code || "")}</div></div>
      <button type="button" class="btn btn-ghost btn-sm" data-edit="${item.id}">Editar</button>
      <button type="button" class="btn btn-ghost btn-sm" data-up="${item.id}" ${index === 0 ? "disabled" : ""}>Subir</button>
      <button type="button" class="btn btn-ghost btn-sm" data-down="${item.id}" ${index === agenda.length - 1 ? "disabled" : ""}>Bajar</button>
    </div>`).join("") || `<p class="text-secondary">Todavía no hay asuntos. Puedes continuar y agregarlos después.</p>`;
  qs("#docs-note").textContent = "No se pueden adjuntar documentos a la convocatoria. El expediente reúne las evidencias después de la sesión.";
}

async function saveAgenda(event) {
  event.preventDefault();
  const title = qs("#a-title").value.trim();
  fieldError("#err-agenda", "");
  if (!title) {
    fieldError("#err-agenda", "Escribe el asunto o cancela la edición.");
    return;
  }
  setStatus("Guardando…");
  try {
    if (editingAgendaId) {
      const current = agenda.find((item) => item.id === editingAgendaId);
      await api(`/api/assemblies/${assemblyId}/agenda/${editingAgendaId}`, {
        method: "PUT",
        body: { code: current?.code || "P", title }
      });
    } else {
      await api(`/api/assemblies/${assemblyId}/agenda`, {
        method: "POST",
        body: { ordinal: agenda.length + 1, code: `P${agenda.length + 1}`, title }
      });
    }
    qs("#a-title").value = "";
    editingAgendaId = null;
    qs("#btn-agenda-cancel").hidden = true;
    qs("#btn-agenda-save").textContent = "Agregar asunto";
    dirty = false;
    setStatus("Cambios guardados.");
    await loadAgenda();
  } catch (error) {
    setStatus("No se pudo guardar. Reintentar.");
    fieldError("#err-agenda", error.message || "No se pudo guardar el asunto.");
  }
}

async function loadRecipients() {
  const list = await api(`/api/assemblies/${assemblyId}/convocations`);
  const rows = Array.isArray(list) ? list : list.items || list.convocations || [];
  const ranked = [...rows].sort((a, b) => (b.version || 0) - (a.version || 0));
  const open = ranked.find((row) => !sentStatus(row.status) && row.status !== "Cancelled");
  const sent = ranked.find((row) => sentStatus(row.status));
  if (open) convocation = await api(`/api/convocations/${open.id}`);
  else if (sent && !convocation) convocation = await api(`/api/convocations/${sent.id}`);
  const phId = assembly.propertyHorizontalId;
  const [active, invited, channelRows] = await Promise.all([
    api(`/api/ph/${phId}/owners?status=Active`).catch(() => []),
    api(`/api/ph/${phId}/owners?status=Invited`).catch(() => []),
    api(`/api/communications/ph/${phId}/channels`).catch(() => [])
  ]);
  owners = [...(Array.isArray(active) ? active : []), ...(Array.isArray(invited) ? invited : [])];
  channels = Array.isArray(channelRows) ? channelRows : [];
  const selected = new Set((convocation?.recipients || []).map((row) => row.ownerId).filter(Boolean));
  qs("#owner-list").innerHTML = owners.map((owner) => {
    const email = owner.email || "";
    const unit = (owner.unitCodes || []).join(", ");
    return `<label class="owner-row">
      <input type="checkbox" class="owner-check" value="${owner.id}" ${selected.has(owner.id) ? "checked" : ""} />
      <span><strong>${escapeHtml(owner.displayName || owner.email || "Propietario")}</strong>
      <span class="text-secondary">${escapeHtml([unit && `Unidad ${unit}`, email || "Sin correo"].filter(Boolean).join(" · "))}</span></span>
    </label>`;
  }).join("") || `<p>No hay propietarios activos o invitados en este PH.</p>`;
  const enabled = new Set(channels.filter((row) => row.isEnabled).map((row) => row.channel));
  if (!channels.length) enabled.add("Portal");
  const chosen = new Set(convocation?.channels || ["Portal"]);
  const catalog = [
    ["Portal", "Portal", enabled.has("Portal") || !channels.some((row) => row.channel === "Portal"), "Visible dentro de Asambleas."],
    ["Email", "Correo", enabled.has("Email"), enabled.has("Email") ? "Usa el correo del padrón." : "El correo no está configurado para este PH."],
    ["WhatsApp", "WhatsApp", enabled.has("WhatsApp"), "No está configurado."],
    ["Sms", "SMS", enabled.has("Sms"), "No está configurado."]
  ];
  qs("#channel-list").innerHTML = catalog.map(([value, label, available, reason]) => `
    <label class="owner-row">
      <input type="checkbox" class="channel-check" value="${value}" ${available && chosen.has(value) ? "checked" : ""} ${available ? "" : "disabled"} />
      <span><strong>${label}</strong><span class="text-secondary">${available ? "Disponible." : escapeHtml(reason)}</span></span>
    </label>`).join("");
  const suggested = assembly?.title ? `Convocatoria — ${assembly.title}` : "";
  qs("#f-conv-title").value = convocation?.title || suggested;
  qs("#f-conv-subject").value = convocation?.subject || suggested;
  qs("#f-internal").value = convocation?.bodyText || "";
  updateRecipientCount();
  if (sentStatus(convocation?.status)) {
    document.querySelectorAll("#step-3 input, #step-3 textarea, #step-3 button").forEach((el) => {
      el.disabled = true;
    });
  }
}

function selectedOwners() {
  return [...document.querySelectorAll(".owner-check:checked")].map((input) => input.value);
}

function selectedChannels() {
  return [...document.querySelectorAll(".channel-check:checked")].map((input) => input.value);
}

function updateRecipientCount() {
  const count = selectedOwners().length;
  qs("#recipient-count").textContent = count === 1 ? "1 destinatario seleccionado" : `${count} destinatarios seleccionados`;
}

async function saveConvocation() {
  fieldError("#err-owners", "");
  fieldError("#err-channels", "");
  const ownerIds = selectedOwners();
  const channelList = selectedChannels();
  if (!ownerIds.length) {
    fieldError("#err-owners", "Selecciona al menos un destinatario.");
    return false;
  }
  if (!channelList.length) {
    fieldError("#err-channels", "Selecciona un canal disponible.");
    return false;
  }
  const title = qs("#f-conv-title").value.trim();
  const subject = qs("#f-conv-subject").value.trim() || title;
  fieldError("#err-conv-title", "");
  if (!title) {
    fieldError("#err-conv-title", "Indica el título de la convocatoria.");
    return false;
  }
  const payload = {
    assemblyId,
    title,
    subject,
    bodyHtml: "",
    bodyText: qs("#f-internal").value.trim(),
    channels: channelList,
    ownerIds
  };
  setStatus("Guardando…");
  try {
    if (convocation && !sentStatus(convocation.status)) {
      convocation = await api(`/api/convocations/${convocation.id}`, { method: "PUT", body: payload });
    } else if (!convocation) {
      convocation = await api(`/api/assemblies/${assemblyId}/convocations`, {
        method: "POST",
        body: { ...payload, idempotencyKey: `prep-${assemblyId}` }
      });
    }
    dirty = false;
    setStatus("Cambios guardados.");
    return true;
  } catch (error) {
    setStatus("No se pudo guardar. Reintentar.");
    fieldError("#err-owners", error.message || "No se pudo guardar la convocatoria.");
    return false;
  }
}

async function loadReview() {
  if (sentStatus(convocation?.status)) {
    paintResult();
    return;
  }
  if (!convocation) {
    qs("#review-body").textContent = "Guarda los destinatarios antes de revisar.";
    return;
  }
  convocation = await api(`/api/convocations/${convocation.id}`);
  let preview = null;
  try {
    preview = await api(`/api/convocations/${convocation.id}/email-preview`);
  } catch {
    preview = null;
  }
  const when = assembly.scheduledAtUtc ? new Date(assembly.scheduledAtUtc).toLocaleString("es-PA", { dateStyle: "full", timeStyle: "short" }) : "";
  const failed = (convocation.checks || []).filter((check) => check.passed === false);
  const problems = failed.length
    ? failed.map((check) => `<p><strong>${escapeHtml(check.label)}.</strong> ${escapeHtml(check.detail)} <button type="button" class="btn btn-ghost btn-sm" data-jump="3">Corregir</button></p>`).join("")
    : `<p>Preparación completa. Esta convocatoria está ${escapeHtml(convocation.status === "Ready" ? "lista" : "guardada")} y todavía no se ha enviado. Una entrega confirmada se consulta después del envío.</p>`;
  qs("#review-body").innerHTML = `
    <p><button type="button" class="btn btn-ghost btn-sm" data-jump="1">Editar datos</button></p>
    <p><strong>${escapeHtml(qs("#prep-ph").textContent)}</strong><br>${escapeHtml(assembly.title)}<br>${escapeHtml(when)} · ${escapeHtml(assembly.timeZoneId || "America/Panama")}<br>${escapeHtml(modalityLabel(assembly.modality))}${assembly.locationText ? ` · ${escapeHtml(assembly.locationText)}` : ""}</p>
    <p><button type="button" class="btn btn-ghost btn-sm" data-jump="2">Editar agenda</button></p>
    <p>${agenda.length ? agenda.map((item) => escapeHtml(item.title)).join(" · ") : "Sin asuntos. La agenda no es obligatoria para enviar."}</p>
    <p>Documentos de la convocatoria: no hay adjuntos. El expediente no se envía con este mensaje.</p>
    <p><button type="button" class="btn btn-ghost btn-sm" data-jump="3">Editar destinatarios</button></p>
    <p><strong>${escapeHtml(convocation.title || "")}</strong><br>Asunto: ${escapeHtml(convocation.subject || "")}</p>
    <p>${convocation.recipients?.length || 0} destinatarios de la comunicación · ${(convocation.channels || []).join(", ")}</p>
    <p class="text-secondary">Notas internas: ${escapeHtml(convocation.bodyText || "Ninguna. No se envían al propietario.")}</p>
    ${problems}
    <p><a class="btn btn-ghost btn-sm" href="/convocation.html?assemblyId=${encodeURIComponent(assemblyId)}">Crear otra convocatoria</a></p>`;
  const wrap = qs("#preview-frame-wrap");
  wrap.replaceChildren();
  if (preview?.html) {
    const frame = document.createElement("iframe");
    frame.title = "Vista previa del correo";
    frame.setAttribute("sandbox", "");
    frame.style.cssText = "width:100%;min-height:420px;border:1px solid #e7eef6;background:#fff";
    frame.srcdoc = preview.html;
    wrap.append(frame);
  } else {
    wrap.textContent = "La vista previa del correo no está disponible. El envío usa la misma plantilla del servidor.";
  }
  qs("#review-heading").textContent = "Revisar y enviar";
  qs("#result-actions").hidden = true;
}

function paintResult() {
  qs("#review-heading").textContent = "Resultado del envío";
  const failed = convocation.preview?.failedCount;
  qs("#review-body").innerHTML = `
    <p>El envío quedó ${convocation.status === "Partial" || convocation.status === "Failed" ? "con pendientes" : "solicitado"}.</p>
    <p>${convocation.recipients?.length || 0} destinatarios en la convocatoria.</p>
    <p class="text-secondary">Una entrega en el portal no confirma que el correo haya llegado.</p>
    ${failed ? `<p>${failed} entregas requieren atención.</p>` : ""}`;
  qs("#preview-frame-wrap").innerHTML = "";
  qs("#result-actions").hidden = false;
  qs("#result-actions").innerHTML = `
    <a class="btn btn-primary" href="/convocation.html?assemblyId=${assemblyId}#c=${convocation.id}">Ver estado de entregas</a>
    <a class="btn btn-secondary" href="/dashboard.html?assemblyId=${assemblyId}">Volver a la asamblea</a>`;
  paintSteps();
}

async function sendConvocation() {
  if (!convocation || sentStatus(convocation.status)) return;
  const people = convocation.recipients?.length || selectedOwners().length;
  const channelList = (convocation.channels || selectedChannels()).join(", ");
  qs("#send-summary").textContent = `Se enviará a ${people} destinatario(s) por ${channelList}.`;
  const dialog = qs("#send-dialog");
  dialog.showModal();
  const choice = await new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue), { once: true });
  });
  if (choice !== "send") return;
  saving = true;
  sendKey = sendKey || `send-${convocation.id}-${(convocation.recipients || []).map((row) => row.id).sort().join(",")}`;
  setStatus("Guardando…");
  qs("#btn-next").disabled = true;
  try {
    await api(`/api/convocations/${convocation.id}/send`, {
      method: "POST",
      body: {
        confirmed: true,
        recipientIds: (convocation.recipients || []).map((row) => row.id),
        idempotencyKey: sendKey
      }
    });
    convocation = await api(`/api/convocations/${convocation.id}`);
    dirty = false;
    setStatus("Cambios guardados.");
    paintResult();
  } catch (error) {
    setStatus("No se pudo guardar. Reintentar.");
    fieldError("#err-owners", error.message || "No se pudo enviar.");
  } finally {
    saving = false;
    qs("#btn-next").disabled = false;
  }
}

async function continueStep() {
  if (saving) return;
  saving = true;
  qs("#btn-next").disabled = true;
  try {
    if (step === 1) {
      if (await saveAssembly()) await showStep(2);
    } else if (step === 2) {
      dirty = false;
      setStatus("Cambios guardados.");
      await showStep(3);
    } else if (step === 3) {
      if (await saveConvocation()) await showStep(4, { push: true });
    } else if (step === 4) {
      await sendConvocation();
    }
  } finally {
    saving = false;
    qs("#btn-next").disabled = false;
  }
}

async function leave(save) {
  if (save && step === 1 && !(await saveAssembly())) return false;
  if (save && step === 3 && !(await saveConvocation())) return false;
  dirty = false;
  location.href = assemblyId ? `/dashboard.html?assemblyId=${assemblyId}` : "/calendar.html";
  return true;
}

async function askLeave() {
  if (!dirty) {
    await leave(false);
    return;
  }
  const dialog = qs("#leave-dialog");
  dialog.showModal();
  const choice = await new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue), { once: true });
  });
  if (choice === "save") await leave(true);
  else if (choice === "discard") await leave(false);
}

function pendingStep() {
  if (!assemblyId) return 1;
  if (sentStatus(convocation?.status)) return 4;
  if (convocation?.recipients?.length) return 4;
  if (convocation) return 3;
  return 2;
}

async function boot() {
  const user = await me().catch(() => null);
  if (!user) {
    location.href = "/";
    return;
  }
  qs("#user-chip").textContent = user.displayName || "Cuenta";
  await bootIaPage({ current: "asm-convocation", pageLabel: "Preparar asamblea", assemblyId });
  fillTimeSelect(qs("#f-time"), "19:00");
  await loadPhs();
  if (assemblyId) {
    await loadAssembly();
    const rows = await api(`/api/assemblies/${assemblyId}/convocations`).catch(() => []);
    const list = Array.isArray(rows) ? rows : [];
    const ranked = [...list].sort((a, b) => (b.version || 0) - (a.version || 0));
    const current = ranked.find((row) => !sentStatus(row.status) && row.status !== "Cancelled") || ranked[0];
    if (current) convocation = await api(`/api/convocations/${current.id}`);
    const response = await api(`/api/assemblies/${assemblyId}/agenda`).catch(() => ({ items: [] }));
    agenda = response.items || [];
  }
  const requested = Number(params.get("step"));
  await showStep(requested >= 1 && requested <= 4 && (assemblyId || requested === 1) ? requested : pendingStep(), { push: false });
  history.replaceState({ step }, "", urlFor(step));
  qs("#form-assembly").addEventListener("input", markDirty);
  qs("#f-modality").addEventListener("change", syncPlace);
  qs("#form-agenda").addEventListener("submit", saveAgenda);
  qs("#btn-agenda-cancel").addEventListener("click", () => {
    editingAgendaId = null;
    qs("#a-title").value = "";
    qs("#btn-agenda-cancel").hidden = true;
    qs("#btn-agenda-save").textContent = "Agregar asunto";
  });
  qs("#agenda-list").addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.edit) {
      const item = agenda.find((row) => row.id === button.dataset.edit);
      editingAgendaId = item.id;
      qs("#a-title").value = item.title;
      qs("#btn-agenda-cancel").hidden = false;
      qs("#btn-agenda-save").textContent = "Guardar asunto";
    }
    if (button.dataset.up || button.dataset.down) {
      const id = button.dataset.up || button.dataset.down;
      await api(`/api/assemblies/${assemblyId}/agenda/${id}/move`, {
        method: "POST",
        body: { direction: button.dataset.up ? -1 : 1 }
      });
      await loadAgenda();
    }
  });
  qs("#owner-list").addEventListener("change", () => {
    markDirty();
    updateRecipientCount();
  });
  qs("#owner-search").addEventListener("input", () => {
    const query = qs("#owner-search").value.trim().toLowerCase();
    document.querySelectorAll(".owner-row").forEach((row) => {
      row.hidden = query && !row.textContent.toLowerCase().includes(query);
    });
  });
  qs("#btn-all").addEventListener("click", () => {
    document.querySelectorAll(".owner-check").forEach((input) => { input.checked = !input.closest(".owner-row").hidden; });
    updateRecipientCount();
    markDirty();
  });
  qs("#btn-none").addEventListener("click", () => {
    document.querySelectorAll(".owner-check").forEach((input) => { input.checked = false; });
    updateRecipientCount();
    markDirty();
  });
  qs("#channel-list").addEventListener("change", markDirty);
  qs("#f-internal").addEventListener("input", markDirty);
  qs("#f-conv-title").addEventListener("input", markDirty);
  qs("#f-conv-subject").addEventListener("input", markDirty);
  qs("#btn-next").addEventListener("click", continueStep);
  qs("#btn-back").addEventListener("click", () => showStep(Math.max(1, step - 1)));
  qs("#btn-exit").addEventListener("click", askLeave);
  qs("#prep-steps").addEventListener("click", (event) => {
    const button = event.target.closest("[data-step]");
    if (!button || button.disabled) return;
    showStep(Number(button.dataset.step));
  });
  qs("#review-body").addEventListener("click", (event) => {
    const button = event.target.closest("[data-jump]");
    if (button) showStep(Number(button.dataset.jump));
  });
  qs("#btn-logout").addEventListener("click", async (event) => {
    event.preventDefault();
    await logout();
    location.href = "/";
  });
  window.addEventListener("beforeunload", (event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });
  window.addEventListener("popstate", () => {
    const next = Number(new URLSearchParams(location.search).get("step") || step);
    showStep(next, { push: false });
  });
  syncPlace();
}

boot().catch((error) => {
  qs("#page-alert").hidden = false;
  qs("#page-alert").textContent = error.message || "No se pudo abrir la preparación.";
});
