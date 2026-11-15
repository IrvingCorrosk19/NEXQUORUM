import { api } from "./api.js";
import { me } from "./auth.js";
import { escapeHtml, formatDateTime, qs, showToast } from "./ui.js";
import { showPageError } from "./app-feedback.js";
import { bootIaPage } from "./ia-page.js?v=idn2";
import { assemblyLabel } from "./assembly-labels.js";
import { iconSvg, emptyIllustration } from "./tabler-icons.js?v=idn2";

function showError(message) {
  showPageError(message);
}

let all = [];

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
              <a class="btn btn-primary btn-sm" href="/expediente.html?assemblyId=${a.id}">Ver expediente</a>
              ${finished ? "" : `<a class="btn btn-outline-secondary btn-sm" href="/dashboard.html?assemblyId=${a.id}">Abrir panel</a>`}
              <a class="btn btn-outline-secondary btn-sm" href="/voting-studio.html?assemblyId=${a.id}">Votaciones</a>
            </div>
          </div>
        </div>
      </article>`;
    })
    .join("");
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
    all = (Array.isArray(list) ? list : list?.items || []).slice().sort((a, b) => {
      const da = a.scheduledAtUtc ? new Date(a.scheduledAtUtc).getTime() : 0;
      const db = b.scheduledAtUtc ? new Date(b.scheduledAtUtc).getTime() : 0;
      return db - da;
    });
    render();
    qs("#search").addEventListener("input", (e) => render(e.target.value));
  } catch (err) {
    showError(err.message);
    showToast(err.message, "error");
  }
}

init();
