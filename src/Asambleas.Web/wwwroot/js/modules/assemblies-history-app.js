import { api } from "./api.js";
import { me } from "./auth.js";
import { escapeHtml, formatDateTime, qs, showToast } from "./ui.js";
import { showPageError } from "./app-feedback.js";
import { bootIaPage } from "./ia-page.js?v=polish9";
import { assemblyLabel } from "./assembly-labels.js";
import { iconSvg, emptyIllustration } from "./tabler-icons.js?v=idn2";
import { bindSheetViewport, createQueryGuard, lockPageScroll, rememberOpener, restoreOpener, trapFocus, wireSheetKeyboard } from "./query-guard.js?v=polish9b";

function showError(message) {
  showPageError(message);
}

let all = [];
const historyGuard = createQueryGuard();
let historyOpener = null;
let historyUntrap = null;
let historyUnbind = null;
let historyListY = 0;

function render(filter = "") {
  const q = filter.trim().toLowerCase();
  const items = all.filter((a) => {
    if (!q) return true;
    return `${a.title} ${a.status}`.toLowerCase().includes(q);
  });
  const root = qs("#history-list");
  if (!items.length) {
    root.innerHTML = emptyIllustration(
      "folder",
      q ? "No hay asambleas que coincidan" : "No hay asambleas anteriores",
      q ? "Prueba con otro término de búsqueda." : "Cuando una asamblea finalice, su expediente aparecerá aquí."
    );
    return;
  }
  root.innerHTML = items
    .map((a) => {
      const finished = a.status === "Completed" || a.status === "Cancelled";
      return `
      <article class="card history-card mb-2">
        <div class="card-body d-flex gap-3 align-items-start">
          <span class="history-item__icon" aria-hidden="true">${iconSvg("files", 22)}</span>
          <div class="flex-fill">
            <h2 class="mb-1" style="font-size:1.1rem;font-weight:700">${escapeHtml(a.title)}</h2>
            <p class="text-secondary mb-2">${a.scheduledAtUtc ? escapeHtml(formatDateTime(a.scheduledAtUtc)) : "—"} · ${escapeHtml(assemblyLabel(a.status))}</p>
            <div class="btn-list">
              <button type="button" class="btn btn-ghost btn-sm" data-history-summary="${a.id}">Consultar</button>
              <a class="btn btn-primary btn-sm" href="/expediente.html?assemblyId=${a.id}">Ver expediente</a>
              ${finished ? "" : `<a class="btn btn-outline-secondary btn-sm" href="/dashboard.html?assemblyId=${a.id}">Abrir panel</a>`}
              <a class="btn btn-outline-secondary btn-sm" href="/voting-studio.html?assemblyId=${a.id}">Votaciones</a>
            </div>
          </div>
        </div>
      </article>`;
    })
    .join("");
  root.querySelectorAll("[data-history-summary]").forEach((btn) => {
    btn.addEventListener("click", () => openHistorySummary(btn.dataset.historySummary, btn));
  });
}

function closeHistorySummary() {
  const dlg = qs("#dlg-history-summary");
  if (dlg?.open) dlg.close();
}

async function openHistorySummary(id, opener) {
  const dlg = qs("#dlg-history-summary");
  if (!dlg) return;
  const token = historyGuard.next();
  historyListY = window.scrollY || 0;
  historyOpener = opener || rememberOpener();
  if (dlg.parentElement !== document.body) document.body.appendChild(dlg);
  qs("#history-summary-status").textContent = "Cargando";
  qs("#history-summary-title").textContent = "Asamblea";
  qs("#history-summary-body").innerHTML = `<p class="muted" style="margin:0">Cargando resumen…</p>`;
  qs("#history-summary-foot").innerHTML = `<button type="button" class="btn btn-secondary" data-history-close>Cerrar</button>`;
  qs("#history-summary-foot [data-history-close]")?.addEventListener("click", closeHistorySummary);
  lockPageScroll(true);
  if (!dlg.open) {
    try { dlg.showModal(); } catch { dlg.setAttribute("open", ""); }
  }
  bindSheetViewport(dlg);
  historyUntrap?.();
  historyUnbind?.();
  historyUntrap = trapFocus(dlg);
  historyUnbind = wireSheetKeyboard(dlg);
  requestAnimationFrame(() => qs("#history-summary-title")?.focus?.({ preventScroll: true }));
  const cached = all.find((a) => String(a.id) === String(id));
  let a = cached;
  try {
    a = await api(`/api/assemblies/${id}`);
  } catch {
    if (!historyGuard.isCurrent(token)) return;
    if (!cached) {
      qs("#history-summary-status").textContent = "No disponible";
      qs("#history-summary-title").textContent = "Asamblea no encontrada";
      qs("#history-summary-body").innerHTML = `<p style="margin:0">Este registro ya no está en el histórico o no se pudo cargar.</p>`;
      qs("#history-summary-foot").innerHTML = `<button type="button" class="btn btn-primary" data-history-close>Volver a la lista</button>`;
      qs("#history-summary-foot [data-history-close]")?.addEventListener("click", closeHistorySummary);
      return;
    }
  }
  if (!historyGuard.isCurrent(token)) return;
  const when = a.scheduledAtUtc ? escapeHtml(formatDateTime(a.scheduledAtUtc)) : "—";
  qs("#history-summary-title").textContent = a.title || "Asamblea";
  qs("#history-summary-status").textContent = assemblyLabel(a.status);
  qs("#history-summary-body").innerHTML = `
    <div class="sheet-kv"><span>Fecha</span><span>${when}</span></div>
    <div class="sheet-kv"><span>Estado</span><span>${escapeHtml(assemblyLabel(a.status))}</span></div>`;
  qs("#history-summary-foot").innerHTML = `
    <button type="button" class="btn btn-secondary" data-history-close>Cerrar</button>
    <a class="btn btn-primary" href="/expediente.html?assemblyId=${encodeURIComponent(a.id || id)}">Abrir expediente</a>
    <a class="btn btn-secondary" href="/minutes.html?assemblyId=${encodeURIComponent(a.id || id)}">Acta</a>`;
  qs("#history-summary-foot [data-history-close]")?.addEventListener("click", closeHistorySummary);
}

async function init() {
  try {
    await me();
  } catch {
    location.href = "/";
    return;
  }

  await bootIaPage({
    current: "history",
    level: "global",
    breadcrumbs: [
      { label: "Propiedades", href: "/ph.html" },
      { label: "Asambleas anteriores" }
    ]
  });

  try {
    const list = await api("/api/assemblies");
    all = (Array.isArray(list) ? list : list?.items || [])
      .filter((a) => a.status === "Completed" || a.status === "Cancelled")
      .slice()
      .sort((a, b) => {
      const da = a.scheduledAtUtc ? new Date(a.scheduledAtUtc).getTime() : 0;
      const db = b.scheduledAtUtc ? new Date(b.scheduledAtUtc).getTime() : 0;
      return db - da;
    });
    render();
    qs("#search").addEventListener("input", (e) => render(e.target.value));
    qs("#history-summary-close")?.addEventListener("click", closeHistorySummary);
    qs("#dlg-history-summary")?.addEventListener("close", () => {
      historyUntrap?.();
      historyUnbind?.();
      historyUntrap = null;
      historyUnbind = null;
      lockPageScroll(false);
      restoreOpener(historyOpener);
      historyOpener = null;
      window.scrollTo(0, historyListY || 0);
    });
    requestAnimationFrame(() => qs(".brand-hero__title")?.focus?.({ preventScroll: true }));
  } catch (err) {
    showError(err.message);
    showToast(err.message, "error");
  }
}

init();
