import { api } from "./api.js";
import { me, hasPermission } from "./auth.js";
import { initI18n, t } from "../i18n/i18n.js?v=labels-es1";
import { assemblyIdFromUrl, escapeHtml, qs, showToast } from "./ui.js";
import { showPageError } from "./app-feedback.js";
import { getParticipants, hydrateRoomState } from "./room-state.js";
import { isOperator } from "./roles.js";
import { renderQuorum } from "./quorum.js?v=flow8";
import { assemblyLabel } from "./assembly-labels.js";
import { createAssemblyConnection } from "./signalr-client.js";
import { ensureAssemblyIdOrRedirect } from "./assembly-context.js";
import { bootIaPage } from "./ia-page.js?v=flow5";
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
let pageIndex = 0;
let pageSize = 100;
let serverTotal = 0;
let useServerPaging = true;
let exceptions = [];
let statusFilter = "all";

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
  return ["Present", "CheckedIn", "TemporarilyDisconnected"].includes(p.attendanceStatus);
}

function deskIsOpen() {
  return OPEN_STATUSES.has(String(assemblyStatus || ""));
}

function canOpenDesk() {
  return (
    isOperator(user) &&
    (hasPermission(user, "assembly:start") ||
      hasPermission(user, "attendance:manage") ||
      hasPermission(user, "assembly:manage")) &&
    String(assemblyStatus || "") === "Scheduled"
  );
}

function canCloseDesk() {
  return (
    isOperator(user) &&
    hasPermission(user, "assembly:start") &&
    String(assemblyStatus || "") === "CheckIn"
  );
}

function errorMessage(error) {
  const code = error?.payload?.code || error?.payload?.extensions?.code;
  if (code === "ASSEMBLY_NOT_OPEN_FOR_CHECKIN") {
    return t("checkin.deskClosed", { status: assemblyLabel(assemblyStatus) });
  }
  if (code === "OWNER_DRAFT") {
    return "El propietario está en borrador y sin unidades elegibles. Asigne unidad y actívelo.";
  }
  if (code === "OWNER_MISSING_UNITS") {
    return "El propietario no tiene unidades activas en esta PH. Asigne al menos una unidad.";
  }
  if (code === "OWNER_INACTIVE") {
    return "El propietario está inactivo.";
  }
  if (code === "NO_ELIGIBLE_REPRESENTATION") {
    return error?.message || "Sin ownership ni poder aprobado.";
  }
  if (code === "COEFFICIENT_CONFIGURATION_INVALID") {
    return error?.message || t("quorum.configInvalid");
  }
  return error?.message || t("networkError");
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
    text.textContent = t("checkin.deskClosed", { status: assemblyLabel(assemblyStatus) });
    if (btnClose) btnClose.hidden = true;
    if (btnOpen) {
      btnOpen.hidden = !canOpenDesk();
      btnOpen.textContent = t("checkin.openDesk");
    }
  }
}

function invitationLabel(p) {
  if (["CheckedIn", "Present", "TemporarilyDisconnected", "Left", "Registered"].includes(p.attendanceStatus)) {
    return t("checkin.convoked") || "Convocado";
  }
  return assemblyLabel(p.attendanceStatus);
}

function presenceLabel(p) {
  if (p.attendanceStatus === "Present") return "Presente";
  if (p.attendanceStatus === "TemporarilyDisconnected") return "Desconectado";
  if (p.attendanceStatus === "Left") return "Salió";
  if (p.attendanceStatus === "CheckedIn") return "Presente";
  if (p.attendanceStatus === "Registered") return "Ausente";
  return assemblyLabel(p.attendanceStatus);
}

function observationLabel(p) {
  if (p.roleCode === "Observer") return "Observador";
  return "";
}

function filteredParticipants(filter = "") {
  const q = filter.trim().toLowerCase();
  return participants.filter((p) => {
    if (statusFilter === "present" && !isPresent(p)) return false;
    if (statusFilter === "invited" && p.attendanceStatus !== "Registered") return false;
    if (statusFilter === "observed" && !observationLabel(p)) return false;
    if (!q) return true;
    const hay = `${p.displayName || ""} ${p.unitCode || ""} ${p.roleCode || ""} ${p.identification || ""}`.toLowerCase();
    return hay.includes(q);
  });
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
  const self =
    (participants || []).find(
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
  if (operator && guide.actionId === "go-checkin" && !OPEN_STATUSES.has(String(assemblyStatus || ""))) {
    guide.nextActionLabel = t("checkin.openDesk") || "Abrir presencia";
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

function coefficientPoints(p) {
  const raw = p?.effectiveCoefficientPercent;
  const n = raw == null || raw === "" ? Number(p?.coefficientPercent || 0) : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function ownedCodes(p) {
  const listed = Array.isArray(p.ownedUnitCodes) ? p.ownedUnitCodes : [];
  const codes = listed.map((code) => String(code || "").trim()).filter(Boolean);
  if (codes.length) return codes;
  const primary = String(p.unitCode || "").trim();
  return primary ? [primary] : [];
}

function distinctCodes(people) {
  const seen = new Set();
  const ordered = [];
  for (const person of people) {
    for (const code of ownedCodes(person)) {
      const key = code.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      ordered.push(code);
    }
  }
  return ordered;
}

function unitLine(p) {
  const codes = ownedCodes(p);
  if (!codes.length) return "Sin unidad";
  if (codes.length <= 3) {
    if (codes.length === 1) return codes[0];
    return `${codes.slice(0, -1).join(", ")} y ${codes[codes.length - 1]}`;
  }
  return `${codes[0]} y ${codes.length - 1} más`;
}

function renderSummary() {
  const host = qs("#checkin-summary");
  if (!host) return;
  const owners = participants.filter((p) => !isOperatorRole(p));
  const staff = participants.filter((p) => isOperatorRole(p));
  const presentOwners = owners.filter((p) => isPresent(p));
  const presentStaff = staff.filter((p) => isPresent(p));
  const linkedUnits = distinctCodes(owners).length;
  const presentUnits = distinctCodes(presentOwners).length;
  const quorumPeople = participants.filter((p) => isPresent(p) && coefficientPoints(p) > 0).length;
  const representations = presentOwners.reduce((s, p) => s + Number(p.representationCount || 0), 0);
  const coeff = presentOwners.reduce((s, p) => s + coefficientPoints(p), 0);
  host.innerHTML = `
    <div class="chip"><strong>${owners.length}</strong><span>Propietarios convocados</span></div>
    <div class="chip"><strong>${presentOwners.length}</strong><span>Propietarios acreditados</span></div>
    <div class="chip"><strong>${presentStaff.length}</strong><span>Personal de mesa presente</span></div>
    <div class="chip"><strong>${quorumPeople}</strong><span>Personas que aportan al quórum</span></div>
    <div class="chip" title="Unidades distintas de las titularidades de los propietarios convocados. Una unidad compartida cuenta una vez."><strong>${linkedUnits}</strong><span>Unidades de los convocados</span></div>
    <div class="chip"><strong>${presentUnits}</strong><span>Unidades de propietarios acreditados</span></div>
    <div class="chip"><strong>${representations}</strong><span>Representaciones en quórum</span></div>
    <div class="chip"><strong>${coeff.toFixed(2)}%</strong><span>Coeficiente en el quórum</span></div>
  `;
}

function updateLive() {
  const owners = participants.filter((p) => !isOperatorRole(p));
  const presentOwners = owners.filter((p) => isPresent(p));
  const counts = qs("#live-counts");
  if (counts) counts.textContent = `${presentOwners.length} / ${owners.length}`;

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
    root.textContent = "No disponible";
    const meta = qs("#live-quorum-meta");
    if (meta) {
      meta.textContent = deskIsOpen()
        ? "El quórum todavía no tiene un cálculo."
        : "Se calcula cuando hay presencia registrada. Estado: " + assemblyLabel(assemblyStatus);
    }
  }

  const recentRoot = qs("#recent-root");
  if (recentRoot) {
    if (!recent.length) {
      recentRoot.textContent = "Sin cambios de presencia aún";
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
  if (value == null || value === "" || !Number.isFinite(Number(value))) return "—";
  return `${Number(value).toLocaleString("es-PA", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}%`;
}

function sumCoefficients(units) {
  return (units || []).reduce((sum, unit) => {
    const n = Number(unit?.coefficientPercent);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
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
    return;
  }

  root.innerHTML = `
    <table class="participants-table">
      <thead>
        <tr>
          <th>${escapeHtml(t("checkin.owner"))}</th>
          <th>${escapeHtml(t("checkin.presence"))}</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        ${page
          .map((p) => {
            const id = String(p.userId || "");
            const present = isPresent(p);
            return `<tr class="${present ? "is-present" : ""}" data-user-id="${escapeHtml(id)}">
              <td data-label="Propietario">
                <strong>${escapeHtml(p.displayName || "Sin nombre")}</strong>
                <div class="owner-unit">${escapeHtml(unitLine(p))}</div>
              </td>
              <td data-label="Presencia"><span class="badge ${present ? "badge-success" : "badge-live"}">${escapeHtml(
                presenceLabel(p)
              )}</span></td>
              <td data-label="Acciones">
                <button type="button" class="btn btn-secondary" data-view="${escapeHtml(id)}">${escapeHtml(t("checkin.viewDetails"))}</button>
              </td>
            </tr>`;
          })
          .join("")}
      </tbody>
    </table>`;

  root.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => openOwnerModal(btn.getAttribute("data-view"), btn));
  });
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
  const status = preview.attendanceStatus || participant?.attendanceStatus;
  const statusLabel = presenceLabel({ attendanceStatus: status });
  const owned = sumCoefficients(preview.owned);
  const represented = sumCoefficients(preview.represented);
  const effective = preview.effectiveCoefficientPercent;
  const present = status === "Present" ? effective : null;

  return `
    <div class="owner-metrics">
      <div class="owner-metric">
        <div class="label">Coeficiente propio</div>
        <div class="value">${escapeHtml(formatCoeff(owned))}</div>
        <p class="text-secondary mb-0">Suma de las unidades de su titularidad.</p>
      </div>
      <div class="owner-metric">
        <div class="label">Coeficiente representado</div>
        <div class="value">${escapeHtml(formatCoeff(represented))}</div>
        <p class="text-secondary mb-0">Suma de las unidades que representa.</p>
      </div>
      <div class="owner-metric">
        <div class="label">Coeficiente efectivo</div>
        <div class="value">${escapeHtml(formatCoeff(effective))}</div>
        <p class="text-secondary mb-0">Propias y representadas, sin unidades en conflicto.</p>
      </div>
      <div class="owner-metric">
        <div class="label">Coeficiente presente</div>
        <div class="value">${escapeHtml(present == null ? "—" : formatCoeff(present))}</div>
        <p class="text-secondary mb-0">${escapeHtml(statusLabel)}. Solo entra al quórum si está presente.</p>
      </div>
    </div>
    <div class="owner-section">
      <h3>${escapeHtml(t("checkin.role"))} / ${escapeHtml(t("checkin.presence"))}</h3>
      <p style="margin:0">${escapeHtml(assemblyLabel(participant?.roleCode))} · ${escapeHtml(
        assemblyLabel(preview.attendanceStatus || participant?.attendanceStatus)
      )}${participant?.presenceType ? ` · ${escapeHtml(assemblyLabel(participant.presenceType))}` : ""}</p>
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
        : ""
    }
  `;
}

let ownerOpener = null;

async function openOwnerModal(targetUserId, opener) {
  showError("");
  ownerOpener = opener || document.activeElement;
  const dialog = qs("#owner-dialog");
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

    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    qs("#btn-dialog-close")?.focus();
  } catch (error) {
    showError(errorMessage(error));
  }
}

function closeOwnerModal() {
  const dialog = qs("#owner-dialog");
  if (dialog?.open) dialog.close();
  else dialog?.removeAttribute("open");
  pendingPreview = null;
}

async function ensureDeskOpen() {
  if (deskIsOpen()) return true;
  if (!canOpenDesk()) {
    throw Object.assign(new Error(t("checkin.deskClosed", { status: assemblyLabel(assemblyStatus) })), {
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
    announce(t("checkin.deskClosed", { status: assemblyLabel(assemblyStatus) }));
    showToast(t("checkin.deskClosed", { status: assemblyLabel(assemblyStatus) }), "success");
  } catch (error) {
    showError(errorMessage(error));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = t("checkin.closeDesk");
    }
  }
}

async function reloadParticipants() {
  if (useServerPaging) {
    try {
      const q = (qs("#participant-filter")?.value || "").trim();
      const st =
        statusFilter === "invited"
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
      // ignore until first presence
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
  }
  const linkLobby = qs("#link-lobby");
  if (linkLobby) {
    linkLobby.textContent = t("dashboard.linkLobby");
    linkLobby.href = `/lobby.html?assemblyId=${assemblyId}`;
  }
  const btnClose = qs("#btn-dialog-close");
  if (btnClose) btnClose.textContent = t("checkin.close");
  const btnOpenDesk = qs("#btn-open-desk");
  if (btnOpenDesk) btnOpenDesk.textContent = t("checkin.openDesk");

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

  // Owners use lobby/room — presence desk is for operators.
  if (!isOperator(user) || !hasPermission(user, "attendance:manage")) {
    location.replace(`/lobby.html?assemblyId=${encodeURIComponent(assemblyId)}`);
    return;
  }

  await bootIaPage({ current: "asm-checkin", pageLabel: t("checkin.title") || "Participantes" });

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
      root.innerHTML = `<table class="participants-table"><thead><tr>
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
            <td>${escapeHtml(assemblyLabel(ex.conflictType || ""))}</td>
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
  btnClose?.addEventListener("click", closeOwnerModal, { signal });
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
    "keydown",
    (e) => {
      if (e.key !== "Escape" || !ownerDialog.open) return;
      e.preventDefault();
      closeOwnerModal();
    },
    { signal }
  );
  ownerDialog?.addEventListener(
    "close",
    () => {
      pendingPreview = null;
      const opener = ownerOpener;
      ownerOpener = null;
      if (opener && document.contains(opener)) opener.focus?.();
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
        try {
          await hubConn.stop?.(assemblyId);
        } catch {
          /* ignore */
        }
        hubConn = null;
      }
      hubConn = createAssemblyConnection({
        quorumUpdated: (q) => {
          quorum = q;
          updateLive();
          if (q?.quorumReached) announce(t("quorum.reached"));
        },
        participantUpdated: async (p) => {
          if (p?.displayName) {
            recent.unshift({
              name: p.displayName,
              unit: p.unitCode || "",
              coeff: p.effectiveCoefficientPercent ?? p.coefficientPercent ?? 0
            });
          }
          await reloadParticipants();
        },
        assemblyStatusChanged: (a) => {
          if (a?.status || a?.Status) {
            assemblyStatus = a.status || a.Status;
            updateDeskBanner();
            syncCheckinGuide();
          }
        }
      });
      await hubConn.start(assemblyId, { markPresence: false });
    }
  } catch {
    // SignalR optional for presence page
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
