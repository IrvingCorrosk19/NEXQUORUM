import { api } from "./api.js";
import { me, logout } from "./auth.js";
import { escapeHtml, formatDateTime, qs, showToast } from "./ui.js";
import { bootIaPage } from "./ia-page.js";

function showError(message) {
  const el = qs("#page-alert");
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || "";
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
    root.innerHTML = `<p class="muted">No hay asambleas que coincidan.</p>`;
    return;
  }
  root.innerHTML = items
    .map((a) => {
      const finished = a.status === "Completed" || a.status === "Cancelled";
      return `
      <article class="panel">
        <h2 style="font-family:'Source Serif 4',Georgia,serif;margin:0 0 0.35rem">${escapeHtml(a.title)}</h2>
        <p class="muted">${a.scheduledAtUtc ? escapeHtml(formatDateTime(a.scheduledAtUtc)) : "—"} · ${escapeHtml(a.status)}</p>
        <div class="cta-row" style="margin-top:0.75rem">
          <a class="btn btn-primary" href="/expediente.html?assemblyId=${a.id}">Ver expediente</a>
          ${finished ? "" : `<a class="btn btn-secondary" href="/dashboard.html?assemblyId=${a.id}">Abrir panel</a>`}
          <a class="btn btn-ghost" href="/voting-studio.html?assemblyId=${a.id}">Votaciones</a>
        </div>
      </article>`;
    })
    .join("");
}

async function init() {
  qs("#btn-logout").onclick = () => logout().then(() => (location.href = "/"));
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
