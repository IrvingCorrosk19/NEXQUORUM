import { api } from "./api.js";
import { hasPermission, logout, me } from "./auth.js";
import { initI18n } from "../i18n/i18n.js";
import { assemblyIdFromUrl, escapeHtml, qs, showToast } from "./ui.js";
import { showPageError } from "./app-feedback.js";
import { ensureAssemblyIdInUrl } from "./assembly-context.js";
import { bootIaPage } from "./ia-page.js";
import { mountReadinessActionBar } from "./readiness-actions.js";
import { isReadinessReturnContext } from "./return-context.js";
import { startHybridShell } from "./hybrid-router.js";

let assemblyId = assemblyIdFromUrl();
let dirty = false;
let canManage = false;

function showError(message) {
  showPageError(message);
}

function markDirty() {
  dirty = true;
}

async function loadAgenda() {
  const data = await api(`/api/assemblies/${assemblyId}/agenda`);
  const root = qs("#agenda-list");
  const items = data.items || [];
  if (!items.length) {
    root.innerHTML = `<p class="muted">No hay puntos de agenda. Agregue al menos uno para completar la preparación.</p>`;
    return;
  }
  root.innerHTML = `
    <ol class="agenda-edit-list">
      ${items
        .map(
          (item) => `
        <li class="agenda-edit-item">
          <span class="agenda-edit-code">${escapeHtml(item.code || "")}</span>
          <span class="agenda-edit-title">${escapeHtml(item.title || "")}</span>
          ${item.isActive ? `<span class="badge badge-live">Activo</span>` : ""}
        </li>`
        )
        .join("")}
    </ol>`;
}

async function saveAgendaItem() {
  const title = qs("#agenda-title").value.trim();
  if (!title) {
    showError("El título es obligatorio.");
    return false;
  }
  const code = qs("#agenda-code").value.trim();
  try {
    await api(`/api/assemblies/${assemblyId}/agenda`, {
      method: "POST",
      body: { ordinal: 0, code, title }
    });
    qs("#agenda-title").value = "";
    qs("#agenda-code").value = "";
    dirty = false;
    await loadAgenda();
    showToast("Punto agregado", "success");
    showError("");
    return true;
  } catch (e) {
    showError(e.message || "No se pudo guardar");
    showToast(e.message, "error");
    return false;
  }
}

async function init() {
  await initI18n();
  assemblyId = assemblyIdFromUrl() || assemblyId;

  if (!assemblyId) {
    showError("Falta assemblyId");
    return;
  }
  if (ensureAssemblyIdInUrl(assemblyId, { hard: true })) return;

  let user;
  try {
    user = await me();
  } catch {
    location.href = "/";
    return;
  }

  qs("#btn-logout")?.addEventListener("click", async () => {
    await logout();
    location.href = "/";
  });

  await bootIaPage({ current: "asm-agenda", pageLabel: "Agenda" });

  let assembly;
  try {
    assembly = await api(`/api/assemblies/${assemblyId}`);
    qs("#assembly-label").textContent = `${assembly.propertyHorizontalName || ""} · ${assembly.title || ""}`;
  } catch (e) {
    showError(e.message);
    return;
  }

  canManage = hasPermission(user, "agenda:manage");
  if (!canManage) {
    qs("#add-panel").hidden = true;
  }

  await loadAgenda();

  qs("#agenda-form")?.addEventListener("input", markDirty);
  qs("#agenda-form")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!canManage) return;
    await saveAgendaItem();
  });

  if (isReadinessReturnContext()) {
    mountReadinessActionBar({
      assemblyId,
      getDirty: () => dirty,
      setDirty: (v) => {
        dirty = v;
      },
      onSave: saveAgendaItem,
      saveLabel: "Guardar punto",
      hint: "Estás completando la preparación de esta asamblea — Agenda."
    });
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
  /* page-level listeners are wiped with #main swap; abort in-flight via hybrid */
}

export async function canLeave() {
  if (!dirty) return true;
  try {
    const { confirmDialog } = await import("./ui.js");
    return Boolean(
      await confirmDialog({
        title: "Cambios sin guardar",
        body: "Hay cambios sin guardar en la agenda. ¿Salir de todas formas?",
        confirmLabel: "Salir",
        cancelLabel: "Seguir editando",
        danger: true
      })
    );
  } catch {
    return true;
  }
}

export async function dispose() {
  await unmount();
}

if (!window.__ASAM_SOFT_MOUNTING__ && !window.__ASAM_HYBRID__) {
  mount().catch((error) => {
    console.error(error);
  });
}