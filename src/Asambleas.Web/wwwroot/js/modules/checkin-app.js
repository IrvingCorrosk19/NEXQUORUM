import { api } from "./api.js";
import { me, hasPermission } from "./auth.js";
import { initI18n, t } from "../i18n/i18n.js";
import { assemblyIdFromUrl, escapeHtml, qs, showToast } from "./ui.js";
import { showPageError } from "./app-feedback.js";
import { getParticipants, hydrateRoomState } from "./room-state.js";
import { isOperator } from "./roles.js";
import { renderQuorum } from "./quorum.js";
import { createAssemblyConnection } from "./signalr-client.js";
import { ensureAssemblyIdOrRedirect } from "./assembly-context.js";
import { bootIaPage } from "./ia-page.js";
import { startHybridShell } from "./hybrid-router.js";
import { resolveContextualGuide, renderContextualGuide } from "./contextual-guide.js";

let assemblyId = assemblyIdFromUrl();
let participants = [];
let user = null;
let pendingPreview = null;
let recent = [];
let quorum = null;
let assembly = null;
let assemblyStatus = null;
let hubConn = null;
let mountAbort = null;
let selectedIds = new Set();
let pageIndex = 0;
let pageSize = 100;
let serverTotal = 0;
let useServerPaging = true;
let exceptions = [];
let statusFilter = "all";
let pendingBulkRequest = null;

const OPEN_STATUSES = new Set(["CheckIn", "InProgress", "Paused"]);

function showError(message) {
  showPageError(message);
}

function announce(message) {
  const el = qs("#sr-announcer");
  if (el) el.textContent = message;
}

function normalizeList(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.participants)) return data.participants;
  return [];
}

function isPresent(p) {
  return Boolean(p.isAccredited) || ["Present", "CheckedIn"].includes(p.attendanceStatus);
}

function deskIsOpen() {
  return OPEN_STATUSES.has(String(assemblyStatus || ""));
}

function canOpenDesk() {
  return (
    isOperator(user) &&
    hasPermission(user, "assembly:start") &&
    String(assemblyStatus || "") === "Scheduled"
  );
}

function errorMessage(error) {
  const code = error?.payload?.code || error?.payload?.extensions?.code;
  if (code === "ASSEMBLY_NOT_OPEN_FOR_CHECKIN") {
    return t("checkin.deskClosed", { status: assemblyStatus || "—" });
  }
  if (code === "OWNER_DRAFT") {
    return "El propietario está en borrador y sin unidades elegibles. Asigne unidad y actívelo.";
  }
  if (code === "OWNER_MISSING_UNITS") {
    return "El propietario no tiene unidades activas en esta PH. Asigne al menos una unidad.";
  }
  if (code === "OWNER_INACTIVE") {
    return "El propietario está inactivo y no puede acreditarse.";
  }
  if (code === "NO_ELIGIBLE_REPRESENTATION") {
    return error?.message || "Sin ownership ni poder aprobado para acreditar.";
  }
  if (code === "BULK_CONFIRM_ABSENT_REQUIRED") {
    return error?.message || t("checkin.bulkConfirmAbsent");
  }
  if (code === "COEFFICIENT_CONFIGURATION_INVALID") {
    return error?.message || t("quorum.configInvalid");
  }
  if (code === "DEACCREDIT_BLOCKED_VOTING_OPEN") {
    return error?.message || "No se puede corregir acreditación con votación abierta.";
  }
  return error?.message || t("networkError");
}

function canCloseDesk() {
  return (
    isOperator(user) &&
    hasPermission(user, "assembly:start") &&
    String(assemblyStatus || "") === "CheckIn"
  );
}

function updateDeskBanner() {
  const banner = qs("#desk-banner");
  const text = qs("#desk-banner-text");
  const btnOpen = qs("#btn-open-desk");
  const btnClose = qs("#btn-close-desk");
  if (!banner || !text) return;

  banner.hidden = false;
  banner.classList.toggle("is-open", deskIsOpen());
  if (deskIsOpen()) {
    text.textContent = t("checkin.deskOpen");
    if (btnOpen) btnOpen.hidden = true;
    if (btnClose) {
      btnClose.hidden = !canCloseDesk();
      btnClose.textContent = t("checkin.closeDesk");
    }
  } else {
    text.textContent = t("checkin.deskClosed", { status: assemblyStatus || "—" });
    if (btnClose) btnClose.hidden = true;
    if (btnOpen) {
      btnOpen.hidden = !canOpenDesk();
      btnOpen.textContent = t("checkin.openDesk");
    }
  }
}

function invitationLabel(p) {
  if (p.isAccredited || ["CheckedIn", "Present", "TemporarilyDisconnected", "Left"].includes(p.attendanceStatus)) {
    return "Convocado";
  }
  return p.attendanceStatus === "Registered" ? "Invitado" : p.attendanceStatus || "—";
}

function presenceLabel(p) {
  if (!p.isAccredited) return "—";
  if (p.attendanceStatus === "Present") return "Presente";
  if (p.attendanceStatus === "TemporarilyDisconnected") return "Desconectado";
  if (p.attendanceStatus === "Left") return "Retirado";
  if (p.attendanceStatus === "CheckedIn") return "Acreditado";
  return p.attendanceStatus || "—";
}

function observationLabel(p) {
  if (p.roleCode === "Observer") return "Observador";
  return "";
}

function filteredParticipants(filter = "") {
  const q = filter.trim().toLowerCase();
  return participants.filter((p) => {
    if (statusFilter === "accredited" && !p.isAccredited) return false;
    if (statusFilter === "present" && !["Present", "CheckedIn", "TemporarilyDisconnected"].includes(p.attendanceStatus)) {
      return false;
    }
    if (statusFilter === "invited" && !(p.attendanceStatus === "Registered" && !p.isAccredited)) return false;
    if (statusFilter === "observed" && !observationLabel(p)) return false;
    if (!q) return true;
    const hay = `${p.displayName || ""} ${p.unitCode || ""} ${p.roleCode || ""} ${p.identification || ""}`.toLowerCase();
    return hay.includes(q);
  });
}

function updateSelectionUi() {
  const el = qs("#selected-count");
  if (el) el.textContent = t("checkin.selectedCount", { n: selectedIds.size });
  const chk = qs("#chk-select-visible");
  if (chk) {
    const page = currentPageRows();
    chk.checked = page.length > 0 && page.every((p) => selectedIds.has(String(p.userId)));
    chk.indeterminate = !chk.checked && page.some((p) => selectedIds.has(String(p.userId)));
  }
}

function currentPageRows() {
  if (useServerPaging) return participants;
  const list = filteredParticipants(qs("#participant-filter")?.value || "");
  const start = pageIndex * pageSize;
  return list.slice(start, start + pageSize);
}

function isOperatorRole(p) {
  const role = String(p.roleCode || "");
  return /President|Secretary|Operator|PHAdmin|TenantAdmin|PlatformAdmin/i.test(role);
}


function syncCheckinGuide() {
  const root = qs("#contextual-guide");
  if (!root) return;
  const operator = isOperator(user);
  const uid = user?.userId || user?.id;
  const self = (participants || []).find(
    (p) => String(p.userId || "").toLowerCase() === String(uid || "").toLowerCase()
  ) || null;
  const guide = resolveContextualGuide({
    role: operator ? "Operator" : "Owner",
    user: user || null,
    assembly: assembly || { status: assemblyStatus },
    motion: null,
    motions: [],
    session: null,
    quorum,
    self,
    participants: participants || [],
    connection: "connected",
    assemblyId: assemblyId || ""
  });
  // On check-in page, "Ir a acreditación" means open the desk when closed.
  if (operator && guide.actionId === "go-checkin" && !OPEN_STATUSES.has(String(assemblyStatus || ""))) {
    guide.nextActionLabel = "Abrir mesa de acreditación";
  }
  renderContextualGuide(root, guide, {
    onAction: (actionId) => {
      if (actionId === "go-checkin") {
        qs("#btn-open-desk")?.click();
        return;
      }
      if (actionId === "start-assembly") {
        location.href = `/assembly.html?assemblyId=${assemblyId}`;
        return;
      }
      if (actionId === "reload") location.reload();
    }
  });
}

function renderSummary() {
  const host = qs("#checkin-summary");
  if (!host) return;
  const owners = participants.filter((p) => !isOperatorRole(p));
  const invited = owners.length;
  const accreditedOwners = owners.filter((p) => p.isAccredited).length;
  const presentOwners = owners.filter((p) =>
    ["Present", "CheckedIn", "TemporarilyDisconnected"].includes(p.attendanceStatus)
  ).length;
  const mesaStaff = participants.filter((p) => isOperatorRole(p)).length;
  const coeff = owners
    .filter((p) => p.isAccredited)
    .reduce((s, p) => s + Number(p.effectiveCoefficientPercent || 0), 0);
  const units = owners.reduce((s, p) => s + Number(p.representationCount || 0), 0);
  host.innerHTML = `
    <div class="chip"><strong>${invited}</strong><span>Propietarios convocados</span></div>
    <div class="chip"><strong>${accreditedOwners}</strong><span>Propietarios acreditados</span></div>
    <div class="chip"><strong>${units}</strong><span>Unidades representadas</span></div>
    <div class="chip"><strong>${coeff.toFixed(2)}%</strong><span>Coeficiente acreditado</span></div>
    <div class="chip"><strong>${presentOwners}</strong><span>Presentes/conectados</span></div>
    <div class="chip"><strong>${mesaStaff}</strong><span>Personal de mesa</span></div>
  `;
}

function updateLive() {
  const accredited = participants.filter((p) => p.isAccredited).length;
  const present = participants.filter((p) => isPresent(p)).length;
  const counts = qs("#live-counts");
  if (counts) counts.textContent = `${present} / ${accredited}`;

  const root = qs("#live-quorum");
  const warn = qs("#coeff-warn");
  if (quorum) {
    if (quorum.coefficientConfigurationInvalid) {
      root.innerHTML = `
        <span class="badge badge-warn">CONFIGURACIÓN DE COEFICIENTES INVÁLIDA</span>
        <p class="quorum-config-warn" role="alert">${escapeHtml(
          quorum.coefficientConfigurationMessage || t("quorum.configInvalid")
        )}</p>`;
      if (warn) {
        warn.hidden = false;
        warn.textContent = quorum.coefficientConfigurationMessage || t("quorum.configInvalid");
      }
      const meta = qs("#live-quorum-meta");
      if (meta) meta.textContent = "Corrija el padrón de unidades (Σ debe ser 100%) antes de operar.";
    } else {
      renderQuorum(root, quorum, { compact: true });
      const missing = Number(quorum.missingCoefficient ?? 0);
      const meta = qs("#live-quorum-meta");
      if (meta) {
        meta.textContent = quorum.quorumReached
          ? t("quorum.reached")
          : `Falta ${missing.toFixed(2)}% de coeficiente`;
      }
      if (warn) {
        warn.hidden = true;
        warn.textContent = "";
      }
    }
  } else if (root) {
    root.textContent = "—";
    const meta = qs("#live-quorum-meta");
    if (meta) meta.textContent = deskIsOpen() ? "" : t("checkin.assemblyStatus") + ": " + (assemblyStatus || "—");
  }

  const recentRoot = qs("#recent-root");
  if (recentRoot) {
    if (!recent.length) {
      recentRoot.textContent = "Sin acreditaciones aún";
    } else {
      recentRoot.innerHTML = recent
        .slice(0, 6)
        .map(
          (r) =>
            `<div>${escapeHtml(r.name)} <span class="muted">${escapeHtml(r.unit || "")}</span> · ${Number(r.coeff).toFixed(2)}%</div>`
        )
        .join("");
    }
  }
  renderSummary();
}

function formatCoeff(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `${Number(value).toFixed(3)}%`;
}

function renderCards(filter = "") {
  const root = qs("#cards-root");
  if (!root) return;
  const list = useServerPaging ? participants : filteredParticipants(filter);
  const total = useServerPaging ? serverTotal : list.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pageIndex >= pages) pageIndex = Math.max(0, pages - 1);
  const page = useServerPaging ? list : list.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize);

  const pager = qs("#pager");
  const pageLabel = qs("#page-label");
  if (pager) pager.hidden = total <= pageSize;
  if (pageLabel) pageLabel.textContent = `${pageIndex + 1} / ${pages} · ${total} registros`;

  if (!page.length) {
    root.innerHTML = `<div class="empty-state">${escapeHtml(total ? t("checkin.empty") : t("checkin.noApi"))}</div>`;
    updateSelectionUi();
    return;
  }

  root.innerHTML = `
    <table class="accreditation-table">
      <thead>
        <tr>
          <th></th>
          <th>${escapeHtml(t("checkin.owner"))}</th>
          <th>${escapeHtml(t("checkin.unit"))}</th>
          <th>Rep.</th>
          <th>${escapeHtml(t("checkin.coefficient"))}</th>
          <th>${escapeHtml(t("checkin.invitation"))}</th>
          <th>${escapeHtml(t("checkin.accreditation"))}</th>
          <th>${escapeHtml(t("checkin.presence"))}</th>
          <th>${escapeHtml(t("checkin.observation"))}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${page
          .map((p) => {
            const id = String(p.userId || "");
            const coeff =
              p.effectiveCoefficientPercent != null && p.isAccredited
                ? formatCoeff(p.effectiveCoefficientPercent)
                : formatCoeff(p.coefficientPercent);
            return `<tr class="${p.isAccredited ? "is-accredited" : ""}" data-user-id="${escapeHtml(id)}">
              <td data-label="Sel."><input type="checkbox" data-select="${escapeHtml(id)}" ${selectedIds.has(id) ? "checked" : ""} /></td>
              <td data-label="Propietario"><strong>${escapeHtml(p.displayName || "—")}</strong></td>
              <td data-label="Unidad">${escapeHtml(p.unitCode || "—")}</td>
              <td data-label="Rep.">${escapeHtml(String(p.representationCount || 0))}</td>
              <td data-label="Coef.">${escapeHtml(coeff)}</td>
              <td data-label="Invitación">${escapeHtml(invitationLabel(p))}</td>
              <td data-label="Acreditación"><span class="badge ${p.isAccredited ? "badge-success" : "badge-live"}">${escapeHtml(
                p.isAccredited ? t("checkin.accredited") : t("checkin.eligible")
              )}</span></td>
              <td data-label="Presencia">${escapeHtml(presenceLabel(p))}</td>
              <td data-label="Obs.">${escapeHtml(observationLabel(p) || "—")}</td>
              <td data-label="Acción">
                <button type="button" class="btn btn-secondary" data-view="${escapeHtml(id)}">${escapeHtml(t("checkin.viewDetails"))}</button>
                ${
                  p.isAccredited
                    ? `<button type="button" class="btn btn-secondary" data-deaccredit="${escapeHtml(id)}">${escapeHtml(t("checkin.bulkDeaccredit"))}</button>`
                    : `<button type="button" class="btn btn-primary" data-review="${escapeHtml(id)}">${escapeHtml(
                        isOperator(user) ? t("checkin.review") : t("checkin.checkIn")
                      )}</button>`
                }
              </td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>`;

  root.querySelectorAll("[data-select]").forEach((el) => {
    el.addEventListener("change", () => {
      const id = el.getAttribute("data-select");
      if (el.checked) selectedIds.add(id);
      else selectedIds.delete(id);
      updateSelectionUi();
    });
  });
  root.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => openOwnerModal(btn.getAttribute("data-view"), { accreditMode: false }));
  });
  root.querySelectorAll("[data-review]").forEach((btn) => {
    btn.addEventListener("click", () => openOwnerModal(btn.getAttribute("data-review"), { accreditMode: true }));
  });
  root.querySelectorAll("[data-deaccredit]").forEach((btn) => {
    btn.addEventListener("click", () => deaccreditOne(btn.getAttribute("data-deaccredit")));
  });
  updateSelectionUi();
}

function unitListHtml(units, emptyLabel) {
  if (!units?.length) {
    return `<p class="muted">${escapeHtml(emptyLabel)}</p>`;
  }
  return `<ul class="unit-list">${units
    .map((u) => {
      const conflict = u.conflictWithDisplayName
        ? `<div class="unit-meta">conflicto · ${escapeHtml(u.conflictWithDisplayName)}</div>`
        : `<div class="unit-meta">${escapeHtml(formatCoeff(u.coefficientPercent))}</div>`;
      return `<li><span class="unit-code">${escapeHtml(u.unitCode || "—")}</span>${conflict}</li>`;
    })
    .join("")}</ul>`;
}

function renderOwnerModalBody(preview, participant) {
  const conflicts = preview.conflicts || [];
  const statusLabel = preview.isAccredited
    ? t("checkin.accredited")
    : preview.canAccredit
      ? t("checkin.eligible")
      : t("checkin.conflictTitle");

  return `
    <div class="owner-metrics">
      <div class="owner-metric">
        <div class="label">${escapeHtml(t("checkin.effectiveTotal"))}</div>
        <div class="value">${escapeHtml(formatCoeff(preview.effectiveCoefficientPercent))}</div>
      </div>
      <div class="owner-metric">
        <div class="label">${escapeHtml(t("checkin.status"))}</div>
        <div class="value" style="font-size:1.05rem">${escapeHtml(statusLabel)}</div>
      </div>
    </div>
    <div class="owner-section">
      <h3>${escapeHtml(t("checkin.role"))} / ${escapeHtml(t("checkin.presence"))}</h3>
      <p style="margin:0">${escapeHtml(participant?.roleCode || "—")} · ${escapeHtml(
        preview.attendanceStatus || participant?.attendanceStatus || "—"
      )}${participant?.presenceType ? ` · ${escapeHtml(participant.presenceType)}` : ""}</p>
    </div>
    <div class="owner-section">
      <h3>${escapeHtml(t("checkin.ownedUnits"))}</h3>
      ${unitListHtml(preview.owned, t("checkin.noUnits"))}
    </div>
    <div class="owner-section">
      <h3>${escapeHtml(t("checkin.representedUnits"))}</h3>
      ${unitListHtml(preview.represented, t("checkin.noUnits"))}
    </div>
    ${
      conflicts.length
        ? `<div class="conflict-box" role="alert"><strong>${escapeHtml(t("checkin.conflictTitle"))}</strong><ul>${conflicts
            .map((c) => `<li>${escapeHtml(c.message)}</li>`)
            .join("")}</ul></div>`
        : !preview.isAccredited && !preview.canAccredit && preview.blockReasonMessage
          ? `<div class="conflict-box" role="alert"><strong>${escapeHtml(t("checkin.notEligible"))}</strong><p style="margin:0.4rem 0 0">${escapeHtml(
              preview.blockReasonMessage
            )}</p></div>`
          : ""
    }
  `;
}

async function openOwnerModal(targetUserId, { accreditMode }) {
  showError("");
  const dialog = qs("#owner-dialog");
  const accreditBtn = qs("#btn-dialog-accredit");
  // Clear any stale loading lock from a previous accreditation attempt.
  if (accreditBtn) {
    accreditBtn.classList.remove("is-loading");
    accreditBtn.removeAttribute("aria-busy");
    delete accreditBtn.dataset.labelBackup;
  }
  try {
    const preview = await api(
      `/api/assemblies/${assemblyId}/attendance/participants/${targetUserId}/preview`
    );
    pendingPreview = preview;
    const participant = participants.find((p) => String(p.userId) === String(targetUserId));

    qs("#owner-dialog-kicker").textContent = t("checkin.owner");
    qs("#owner-dialog-title").textContent = preview.displayName || "—";
    qs("#owner-dialog-subtitle").textContent = [
      participant?.unitCode,
      assembly?.propertyHorizontalName,
      assembly?.title
    ]
      .filter(Boolean)
      .join(" · ");
    qs("#owner-dialog-body").innerHTML = renderOwnerModalBody(preview, participant);

    const canAccredit =
      accreditMode &&
      !preview.isAccredited &&
      preview.canAccredit &&
      !(preview.conflicts || []).length;

    accreditBtn.hidden = !accreditMode;
    accreditBtn.disabled = !canAccredit && !preview.isAccredited;
    accreditBtn.textContent = preview.isAccredited
      ? t("checkin.alreadyAccredited")
      : t("checkin.confirmAccredit");

    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    (canAccredit ? accreditBtn : qs("#btn-dialog-close")).focus();
  } catch (error) {
    showError(errorMessage(error));
  }
}

function closeOwnerModal() {
  const dialog = qs("#owner-dialog");
  const accreditBtn = qs("#btn-dialog-accredit");
  if (accreditBtn) {
    accreditBtn.classList.remove("is-loading");
    accreditBtn.disabled = false;
    accreditBtn.removeAttribute("aria-busy");
    if (accreditBtn.dataset.labelBackup) {
      accreditBtn.textContent = accreditBtn.dataset.labelBackup;
      delete accreditBtn.dataset.labelBackup;
    }
  }
  if (dialog?.open) dialog.close();
  else dialog?.removeAttribute("open");
  pendingPreview = null;
}

async function ensureDeskOpen() {
  if (deskIsOpen()) return true;
  if (!canOpenDesk()) {
    throw Object.assign(new Error(t("checkin.deskClosed", { status: assemblyStatus || "—" })), {
      payload: { code: "ASSEMBLY_NOT_OPEN_FOR_CHECKIN" }
    });
  }
  qs("#btn-open-desk").disabled = true;
  qs("#btn-open-desk").textContent = t("checkin.deskOpening");
  try {
    const updated = await api(`/api/assemblies/${assemblyId}/start-checkin`, { method: "POST" });
    assemblyStatus = updated?.status || "CheckIn";
    if (assembly) assembly.status = assemblyStatus;
    updateDeskBanner();
    syncCheckinGuide();
    announce(t("checkin.deskOpen"));
    showToast(t("checkin.deskOpen"), "success");
    return true;
  } finally {
    qs("#btn-open-desk").disabled = false;
    qs("#btn-open-desk").textContent = t("checkin.openDesk");
  }
}

async function confirmAccredit() {
  if (!pendingPreview) return;
  const btn = qs("#btn-dialog-accredit");
  const { setButtonLoading } = await import("./loading.js");
  setButtonLoading(btn, true, "Acreditando…");
  try {
    await ensureDeskOpen();

    if (!isOperator(user) || !hasPermission(user, "attendance:manage")) {
      throw new Error("Solo la administración puede acreditar participantes.");
    }

    const targetId = pendingPreview.userId;
    const result = await api(`/api/assemblies/${assemblyId}/attendance/participants/${targetId}/accredit`, {
      method: "POST",
      body: { presenceType: "InPerson", method: "OperatorCheckIn" }
    });

    recent.unshift({
      name: pendingPreview.displayName,
      unit: (result.representations || pendingPreview.owned || [])[0]?.unitCode || "",
      coeff: result.effectiveCoefficientPercent ?? pendingPreview.effectiveCoefficientPercent
    });

    announce(`Acreditación completada: ${pendingPreview.displayName}`);
    showToast({
      title: "Acreditado",
      message: `${pendingPreview.displayName} · ${formatCoeff(result.effectiveCoefficientPercent ?? 0)}`,
      variant: "success"
    });

    if (result.currentQuorumCoefficient != null) {
      quorum = {
        currentCoefficient: result.currentQuorumCoefficient,
        requiredCoefficient: result.requiredQuorumCoefficient,
        quorumReached: result.quorumReached,
        missingCoefficient: Math.max(
          0,
          Number(result.requiredQuorumCoefficient || 0) - Number(result.currentQuorumCoefficient || 0)
        )
      };
    }

    // Soft refresh — SignalR also pushes participantUpdated.
    const idx = participants.findIndex((p) => String(p.userId) === String(targetId));
    if (idx >= 0) {
      participants[idx] = {
        ...participants[idx],
        isAccredited: true,
        effectiveCoefficientPercent: result.effectiveCoefficientPercent,
        attendanceStatus: result.attendanceStatus || participants[idx].attendanceStatus
      };
      renderCards(qs("#participant-filter")?.value || "");
      updateLive();
    }

    closeOwnerModal();
    await reloadParticipants();
    await reloadQuorum();
    qs("#participant-filter")?.focus();
  } catch (error) {
    showError(errorMessage(error));
    announce(errorMessage(error));
  } finally {
    setButtonLoading(btn, false);
  }
}

async function closeDesk() {
  if (!canCloseDesk()) return;
  const btn = qs("#btn-close-desk");
  if (btn) {
    btn.disabled = true;
    btn.textContent = t("checkin.deskClosing");
  }
  try {
    const updated = await api(`/api/assemblies/${assemblyId}/close-checkin`, { method: "POST" });
    assemblyStatus = updated?.status || "Scheduled";
    if (assembly) assembly.status = assemblyStatus;
    updateDeskBanner();
    syncCheckinGuide();
    announce(t("checkin.deskClosed", { status: assemblyStatus }));
    showToast(t("checkin.deskClosed", { status: assemblyStatus }), "success");
  } catch (error) {
    showError(errorMessage(error));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = t("checkin.closeDesk");
    }
  }
}

async function deaccreditOne(userId) {
  const reason = window.prompt(t("checkin.deaccreditReasonPrompt"), "");
  if (reason == null) return;
  if (String(reason).trim().length < 5) {
    showError("Motivo obligatorio (mín. 5 caracteres).");
    return;
  }
  try {
    await api(`/api/assemblies/${assemblyId}/attendance/participants/${userId}/deaccredit`, {
      method: "POST",
      body: { reason: String(reason).trim(), method: "OperatorDeaccredit" }
    });
    showToast("Acreditación corregida", "success");
    selectedIds.delete(String(userId));
    await reloadParticipants();
    await reloadQuorum();
  } catch (error) {
    showError(errorMessage(error));
  }
}

async function openBulkPreview(request) {
  await ensureDeskOpen();
  const preview = await api(`/api/assemblies/${assemblyId}/attendance/accredit-bulk/preview`, {
    method: "POST",
    body: request
  });
  pendingBulkRequest = { ...request, preview };
  const dlg = qs("#bulk-preview-dialog");
  qs("#bulk-preview-title").textContent = t("checkin.bulkPreviewTitle");
  qs("#bulk-preview-summary").textContent = preview.summary || "";
  const exclusions = (preview.exclusions || [])
    .slice(0, 12)
    .map((e) => `<li>${escapeHtml(e.displayName)} — ${escapeHtml(e.reason || e.code || "")}</li>`)
    .join("");
  qs("#bulk-preview-body").innerHTML = `
    <div class="owner-metrics">
      <div class="owner-metric"><div class="label">Nuevos</div><div class="value">${preview.newToAccredit ?? 0}</div></div>
      <div class="owner-metric"><div class="label">Unidades</div><div class="value">${preview.unitsRepresented ?? 0}</div></div>
      <div class="owner-metric"><div class="label">Coeficiente</div><div class="value">${Number(preview.aggregateCoefficient || 0).toFixed(2)}%</div></div>
      <div class="owner-metric"><div class="label">Excluidos</div><div class="value">${preview.excluded ?? 0}</div></div>
    </div>
    <p class="muted">Antes ${Number(preview.coefficientBefore || 0).toFixed(2)}% → estimado ${Number(preview.estimatedCoefficientAfter || 0).toFixed(2)}% (req. ${Number(preview.requiredCoefficient || 0).toFixed(2)}%)</p>
    ${
      preview.requiresAbsentConfirmation
        ? `<div class="conflict-box" role="alert"><strong>${escapeHtml(t("checkin.bulkConfirmAbsent"))}</strong></div>`
        : ""
    }
    ${exclusions ? `<div class="owner-section"><h3>Exclusiones</h3><ul>${exclusions}</ul></div>` : ""}
  `;
  const confirmBtn = qs("#btn-bulk-preview-confirm");
  if (confirmBtn) {
    confirmBtn.textContent = preview.requiresAbsentConfirmation
      ? "Confirmar (incluye ausentes)"
      : "Confirmar acreditación";
  }
  if (typeof dlg.showModal === "function") dlg.showModal();
  else dlg.setAttribute("open", "");
}

async function confirmBulkPreview() {
  if (!pendingBulkRequest) return;
  const btn = qs("#btn-bulk-preview-confirm");
  const { setButtonLoading } = await import("./loading.js");
  setButtonLoading(btn, true, "Acreditando…");
  try {
    const body = {
      ...pendingBulkRequest,
      confirmAccreditAbsentInvitees: Boolean(pendingBulkRequest.preview?.requiresAbsentConfirmation),
      presenceType: "InPerson",
      method: pendingBulkRequest.allEligible ? "OperatorBulkCheckIn" : "OperatorBulkSelected"
    };
    delete body.preview;
    const result = await api(`/api/assemblies/${assemblyId}/attendance/accredit-bulk`, {
      method: "POST",
      body
    });
    const msg = t("checkin.bulkAccreditDone", {
      ok: result?.succeeded ?? 0,
      fail: result?.failed ?? 0,
      skip: result?.skipped ?? 0
    });
    announce(msg);
    showToast({
      title: "Acreditación masiva",
      message: `${msg} · coef ${Number(result?.coefficientBefore || 0).toFixed(2)} → ${Number(result?.coefficientAfter || 0).toFixed(2)}`,
      variant: result?.failed ? "warning" : "success"
    });
    selectedIds.clear();
    qs("#bulk-preview-dialog")?.close?.();
    pendingBulkRequest = null;
    await reloadParticipants();
    await reloadQuorum();
  } catch (error) {
    showError(errorMessage(error));
  } finally {
    setButtonLoading(btn, false);
  }
}

async function bulkAccreditEligible() {
  if (!isOperator(user) || !hasPermission(user, "attendance:manage")) {
    showError("No tiene permiso para acreditar en masa.");
    return;
  }
  if (!hasPermission(user, "attendance:force-absent")) {
    showError(
      "La acción principal es «Acreditar seleccionados». Acreditar elegibles/ausentes requiere permiso administrativo especial."
    );
    return;
  }
  const phrase = window.prompt(
    `ACCIÓN EXCEPCIONAL — acreditar convocados ausentes altera el quórum.\nEscriba exactamente: ACREDITAR AUSENTES`,
    ""
  );
  if (phrase !== "ACREDITAR AUSENTES") {
    showError("Confirmación cancelada o frase incorrecta.");
    return;
  }
  const reason = window.prompt("Motivo obligatorio (≥10 caracteres):", "");
  if (!reason || String(reason).trim().length < 10) {
    showError("Motivo obligatorio.");
    return;
  }
  showError("");
  try {
    await openBulkPreview({
      allEligible: true,
      includeAbsentInvitees: true,
      confirmAccreditAbsentInvitees: true,
      absentConfirmationPhrase: "ACREDITAR AUSENTES",
      absentAccreditationReason: String(reason).trim(),
      presenceType: "InPerson",
      method: "OperatorForceAbsentBulk"
    });
  } catch (error) {
    showError(errorMessage(error));
  }
}

async function bulkAccreditSelected() {
  if (!selectedIds.size) {
    showError("Seleccione al menos un participante verificado por la mesa.");
    return;
  }
  try {
    await openBulkPreview({
      userIds: [...selectedIds],
      allEligible: false,
      presenceType: "InPerson",
      method: "OperatorBulkSelected"
    });
  } catch (error) {
    showError(errorMessage(error));
  }
}

async function bulkDeaccreditSelected() {
  const ids = [...selectedIds].filter((id) => {
    const p = participants.find((x) => String(x.userId) === id);
    return p?.isAccredited;
  });
  if (!ids.length) {
    showError("No hay acreditados seleccionados.");
    return;
  }
  const reason = window.prompt(t("checkin.deaccreditReasonPrompt"), "");
  if (reason == null || String(reason).trim().length < 5) {
    showError("Motivo obligatorio (mín. 5 caracteres).");
    return;
  }
  try {
    const preview = await api(`/api/assemblies/${assemblyId}/attendance/deaccredit-bulk/preview`, {
      method: "POST",
      body: { userIds: ids, reason: String(reason).trim() }
    });
    if (!window.confirm(preview?.summary || `Desacreditar ${ids.length}?`)) return;
    const result = await api(`/api/assemblies/${assemblyId}/attendance/deaccredit-bulk`, {
      method: "POST",
      body: {
        userIds: ids,
        reason: String(reason).trim(),
        method: "OperatorBulkDeaccredit",
        clientBatchId: crypto.randomUUID?.() || undefined
      }
    });
    showToast(
      `Desacreditación batch: ${result?.succeeded ?? 0} ok, ${result?.failed ?? 0} fallaron`,
      result?.failed ? "warning" : "success"
    );
    selectedIds.clear();
    await reloadParticipants();
    await reloadQuorum();
  } catch (error) {
    showError(errorMessage(error));
  }
}

function explicitCheckInMethod() {
  // UX hint only — backend consumes server-scoped proof; sessionStorage never authorizes.
  try {
    if (sessionStorage.getItem(`asambleas.vjl:${assemblyId}`) === "1") {
      return "VerifiedJoinLink";
    }
  } catch {
    /* ignore */
  }
  return "SelfCheckIn";
}

async function selfCheckIn() {
  showToast({
    title: "Acreditación administrativa",
    message: "La acreditación la realiza la mesa. Seleccione un participante y pulse Acreditar.",
    variant: "info"
  });
}

async function reloadParticipants() {
  if (useServerPaging) {
    try {
      const q = (qs("#participant-filter")?.value || "").trim();
      const st =
        statusFilter === "accredited"
          ? "accredited"
          : statusFilter === "invited"
            ? "registered"
            : statusFilter === "observed"
              ? "observed"
              : statusFilter === "present"
                ? "Present"
                : "";
      const params = new URLSearchParams({
        skip: String(pageIndex * pageSize),
        take: String(pageSize)
      });
      if (q) params.set("q", q);
      if (st) params.set("status", st);
      const page = await api(`/api/assemblies/${assemblyId}/attendance/participants?${params}`);
      if (page && Array.isArray(page.items)) {
        participants = normalizeList(page.items);
        serverTotal = Number(page.total || 0);
        renderCards(q);
        updateLive();
        return;
      }
    } catch {
      useServerPaging = false;
    }
  }

  const result = await getParticipants(assemblyId);
  if (result.ok) {
    participants = normalizeList(result.data);
    serverTotal = participants.length;
  } else {
    const room = await hydrateRoomState(assemblyId);
    participants = room.participants || [];
    serverTotal = participants.length;
    if (!participants.length && result.message) {
      showToast(result.message, "info");
    }
  }
  renderCards(qs("#participant-filter")?.value || "");
  updateLive();
}

async function reloadQuorum() {
  try {
    quorum =
      (await api(`/api/assemblies/${assemblyId}/quorum`)) ||
      (await api(`/api/assemblies/${assemblyId}/quorum/latest`));
    updateLive();
  } catch {
    try {
      quorum = await api(`/api/assemblies/${assemblyId}/quorum/latest`);
      updateLive();
    } catch {
      // ignore until first accreditation
    }
  }
}

async function init() {
  if (mountAbort) {
    mountAbort.abort();
    mountAbort = null;
  }
  mountAbort = new AbortController();
  const { signal } = mountAbort;

  assemblyId = assemblyIdFromUrl() || assemblyId;
  await initI18n();
  const pageTitle = qs("#page-title");
  if (pageTitle) pageTitle.textContent = t("checkin.title");
  const selfBtn = qs("#btn-self-checkin");
  if (selfBtn) {
    selfBtn.hidden = true;
    selfBtn.textContent = t("checkin.selfCheckIn");
  }
  const linkLobby = qs("#link-lobby");
  if (linkLobby) {
    linkLobby.textContent = t("dashboard.linkLobby");
    linkLobby.href = `/lobby.html?assemblyId=${assemblyId}`;
  }
  const linkDash = qs("#link-dashboard");
  if (linkDash) {
    linkDash.href = `/dashboard.html?assemblyId=${assemblyId}`;
    linkDash.textContent = t("back");
  }
  const btnClose = qs("#btn-dialog-close");
  if (btnClose) btnClose.textContent = t("checkin.close");
  const btnAccredit = qs("#btn-dialog-accredit");
  if (btnAccredit) btnAccredit.textContent = t("checkin.confirmAccredit");
  const btnOpenDesk = qs("#btn-open-desk");
  if (btnOpenDesk) btnOpenDesk.textContent = t("checkin.openDesk");
  const bulkBtn = qs("#btn-bulk-accredit");
  if (bulkBtn) {
    bulkBtn.textContent = t("checkin.bulkAccredit");
  }

  const filter = qs("#participant-filter");
  if (filter) filter.placeholder = t("checkin.searchPlaceholder");
  const filterLabel = qs("label[for='participant-filter']");
  if (filterLabel) filterLabel.textContent = t("checkin.searchLabel");

  if (!assemblyId) {
    assemblyId = await ensureAssemblyIdOrRedirect();
    if (!assemblyId) {
      showError(t("dashboard.missingId"));
      return;
    }
    return;
  }

  try {
    user = await me();
  } catch {
    location.href = "/";
    return;
  }

  // Owners must not use the accreditation desk — send them to lobby.
  if (!isOperator(user) || !hasPermission(user, "attendance:manage")) {
    location.replace(`/lobby.html?assemblyId=${encodeURIComponent(assemblyId)}`);
    return;
  }

  if (bulkBtn) {
    const canBulk = isOperator(user) && hasPermission(user, "attendance:manage");
    const canForceAbsent = hasPermission(user, "attendance:force-absent");
    const toolbar = qs("#bulk-toolbar");
    if (toolbar) toolbar.hidden = !canBulk;
    bulkBtn.hidden = !(canBulk && canForceAbsent);
    if (canBulk && canForceAbsent) bulkBtn.addEventListener("click", bulkAccreditEligible, { signal });
  }

  await bootIaPage({ current: "asm-checkin", pageLabel: "Acreditación" });

  try {
    assembly = await api(`/api/assemblies/${assemblyId}`);
    assemblyStatus = assembly.status;
    const label = qs("#assembly-label");
    if (label) label.textContent = `${assembly.propertyHorizontalName || ""} · ${assembly.title || ""}`;
  } catch {
    // ignore
  }

  updateDeskBanner();
  syncCheckinGuide();
  await reloadParticipants();
  await reloadQuorum();
  const csvLink = qs("#link-padron-csv");
  if (csvLink) csvLink.href = `/api/assemblies/${assemblyId}/quorum/padron.csv`;
  await reloadExceptions();

  async function reloadExceptions() {
    const root = qs("#exceptions-root");
    if (!root) return;
    try {
      exceptions = await api(`/api/assemblies/${assemblyId}/attendance/exceptions`);
      if (!exceptions?.length) {
        root.textContent = "Sin observados ni ausentes pendientes.";
        return;
      }
      root.innerHTML = `<table class="accreditation-table"><thead><tr>
        <th>Propietario</th><th>Unidad</th><th>Tipo</th><th>Reps</th><th>Evidencia</th><th>Acción</th>
      </tr></thead><tbody>${exceptions
        .slice(0, 50)
        .map((ex) => {
          const uid = ex.userId;
          const actions = String(ex.availableAction || "")
            .split("|")
            .filter(Boolean)
            .map(
              (a) =>
                `<button type="button" class="btn btn-secondary btn-ex-resolve" data-user="${escapeHtml(String(uid))}" data-action="${escapeHtml(a)}">${escapeHtml(a)}</button>`
            )
            .join(" ");
          return `<tr>
            <td>${escapeHtml(ex.displayName || "")}</td>
            <td>${escapeHtml(ex.unitCode || "—")}</td>
            <td>${escapeHtml(ex.conflictType || "")}</td>
            <td>${Number(ex.representationCount || 0)}</td>
            <td>${escapeHtml(ex.evidence || ex.reason || "—")}</td>
            <td>${actions || escapeHtml(ex.resolutionResult || "—")}</td>
          </tr>`;
        })
        .join("")}</tbody></table>`;
      root.querySelectorAll(".btn-ex-resolve").forEach((btn) => {
        btn.addEventListener("click", async () => {
          try {
            await api(`/api/assemblies/${assemblyId}/attendance/exceptions/${btn.dataset.user}/resolve`, {
              method: "POST",
              body: { action: btn.dataset.action, reason: "Revisión mesa", note: null }
            });
            showToast("Excepción auditada", "success");
            await reloadExceptions();
          } catch (error) {
            showError(errorMessage(error));
          }
        });
      });
    } catch {
      root.textContent = "No se pudo cargar la bandeja (permiso o red).";
    }
  }

  qs("#btn-reload-exceptions")?.addEventListener("click", () => void reloadExceptions(), { signal });
  filter?.addEventListener(
    "input",
    () => {
      pageIndex = 0;
      if (useServerPaging) void reloadParticipants();
      else renderCards(filter.value);
    },
    { signal }
  );
  qs("#status-filter")?.addEventListener(
    "change",
    (e) => {
      statusFilter = e.target.value || "all";
      pageIndex = 0;
      if (useServerPaging) void reloadParticipants();
      else renderCards(filter?.value || "");
    },
    { signal }
  );
  qs("#page-size")?.addEventListener(
    "change",
    (e) => {
      pageSize = Number(e.target.value) || 100;
      pageIndex = 0;
      if (useServerPaging) void reloadParticipants();
      else renderCards(filter?.value || "");
    },
    { signal }
  );
  qs("#chk-select-visible")?.addEventListener(
    "change",
    (e) => {
      for (const p of currentPageRows()) {
        const id = String(p.userId);
        if (e.target.checked) selectedIds.add(id);
        else selectedIds.delete(id);
      }
      renderCards(filter?.value || "");
    },
    { signal }
  );
  qs("#btn-select-filtered")?.addEventListener(
    "click",
    async () => {
      if (useServerPaging) {
        try {
          const q = (filter?.value || "").trim();
          const st =
            statusFilter === "accredited"
              ? "accredited"
              : statusFilter === "invited"
                ? "registered"
                : statusFilter === "observed"
                  ? "observed"
                  : statusFilter === "present"
                    ? "Present"
                    : "";
          const params = new URLSearchParams();
          if (q) params.set("q", q);
          if (st) params.set("status", st);
          const ids = await api(`/api/assemblies/${assemblyId}/attendance/participant-ids?${params}`);
          for (const id of ids || []) selectedIds.add(String(id));
        } catch (error) {
          showError(errorMessage(error));
        }
      } else {
        for (const p of filteredParticipants(filter?.value || "")) {
          selectedIds.add(String(p.userId));
        }
      }
      renderCards(filter?.value || "");
      updateSelectionUi();
    },
    { signal }
  );
  qs("#btn-bulk-selected")?.addEventListener("click", bulkAccreditSelected, { signal });
  qs("#btn-bulk-deaccredit")?.addEventListener("click", bulkDeaccreditSelected, { signal });
  qs("#btn-page-prev")?.addEventListener(
    "click",
    () => {
      pageIndex = Math.max(0, pageIndex - 1);
      if (useServerPaging) void reloadParticipants();
      else renderCards(filter?.value || "");
    },
    { signal }
  );
  qs("#btn-page-next")?.addEventListener(
    "click",
    () => {
      pageIndex += 1;
      if (useServerPaging) void reloadParticipants();
      else renderCards(filter?.value || "");
    },
    { signal }
  );
  qs("#btn-bulk-preview-cancel")?.addEventListener(
    "click",
    () => {
      pendingBulkRequest = null;
      qs("#bulk-preview-dialog")?.close?.();
    },
    { signal }
  );
  qs("#btn-bulk-preview-confirm")?.addEventListener("click", confirmBulkPreview, { signal });
  selfBtn?.addEventListener("click", selfCheckIn, { signal });
  btnClose?.addEventListener("click", closeOwnerModal, { signal });
  btnAccredit?.addEventListener("click", confirmAccredit, { signal });
  btnOpenDesk?.addEventListener(
    "click",
    async () => {
      try {
        await ensureDeskOpen();
      } catch (error) {
        showError(errorMessage(error));
      }
    },
    { signal }
  );
  qs("#btn-close-desk")?.addEventListener("click", closeDesk, { signal });
  const ownerDialog = qs("#owner-dialog");
  ownerDialog?.addEventListener(
    "close",
    () => {
      pendingPreview = null;
    },
    { signal }
  );
  ownerDialog?.addEventListener(
    "click",
    (e) => {
      if (e.target === ownerDialog) closeOwnerModal();
    },
    { signal }
  );

  try {
    if (window.signalR) {
      if (hubConn) {
        try { await hubConn.stop?.(assemblyId); } catch { /* ignore */ }
        hubConn = null;
      }
      hubConn = createAssemblyConnection({
        quorumUpdated: (q) => {
          quorum = q;
          updateLive();
          if (q?.quorumReached) announce(t("quorum.reached"));
        },
        participantUpdated: async () => {
          await reloadParticipants();
        },
        assemblyUpdated: (a) => {
          if (a?.status) {
            assemblyStatus = a.status;
            updateDeskBanner();
    syncCheckinGuide();
          }
        }
      });
      await hubConn.start(assemblyId);
    }
  } catch {
    // SignalR optional for check-in page
  }
}

export async function mount(ctx = {}) {
  await init();
  await startHybridShell({
    mount,
    unmount,
    canLeave,
    dispose: unmount
  });
  void ctx;
}

export async function unmount() {
  if (mountAbort) {
    mountAbort.abort();
    mountAbort = null;
  }
  if (hubConn) {
    try {
      await hubConn.stop?.(assemblyId);
    } catch {
      /* ignore */
    }
    hubConn = null;
  }
  pendingPreview = null;
}

export async function canLeave() {
  return true;
}

export async function dispose() {
  await unmount();
}

if (!window.__ASAM_SOFT_MOUNTING__ && !window.__ASAM_HYBRID__) {
  mount().catch((error) => {
    console.error(error);
  });
}
