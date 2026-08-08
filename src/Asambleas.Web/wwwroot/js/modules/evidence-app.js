import { me } from "./auth.js";
import { initI18n, t } from "../i18n/i18n.js";
import { assemblyIdFromUrl, escapeHtml, formatDateTime, qs } from "./ui.js";
import { getEvidence } from "./room-state.js";

const assemblyId = assemblyIdFromUrl();

function showError(message) {
  const el = qs("#page-alert");
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || "";
}

function renderEvidence(data) {
  const root = qs("#evidence-root");
  if (!data) {
    root.innerHTML = `<div class="empty-state">${escapeHtml(t("evidence.empty"))}</div>`;
    return;
  }

  const items = Array.isArray(data)
    ? data
    : data.items || data.entries || data.evidence || data.package || [];

  if (!Array.isArray(items) || !items.length) {
    if (typeof data === "object" && !Array.isArray(data)) {
      root.innerHTML = `<pre style="white-space:pre-wrap;margin:0;font-family:var(--font-body)">${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
      return;
    }
    root.innerHTML = `<div class="empty-state">${escapeHtml(t("evidence.empty"))}</div>`;
    return;
  }

  root.innerHTML = `
    <h2 style="margin-top:0">${escapeHtml(t("evidence.title"))}</h2>
    <ul class="agenda-list">
      ${items
        .map((item) => {
          const id = item.evidenceId || item.id || item.code || "—";
          const type = item.type || item.kind || item.category || "";
          const at = item.createdAtUtc || item.timestampUtc || item.castAtUtc;
          return `
            <li>
              <strong>${escapeHtml(String(id))}</strong>
              ${type ? `<span class="badge badge-live" style="margin-left:0.5rem">${escapeHtml(type)}</span>` : ""}
              ${at ? `<div class="muted">${escapeHtml(formatDateTime(at))}</div>` : ""}
              ${item.summary || item.description ? `<p>${escapeHtml(item.summary || item.description)}</p>` : ""}
            </li>`;
        })
        .join("")}
    </ul>
  `;
}

async function init() {
  await initI18n();
  qs("#page-title").textContent = t("evidence.title");
  qs("#link-dashboard").href = `/dashboard.html?assemblyId=${assemblyId}`;
  qs("#link-dashboard").textContent = t("back");

  if (!assemblyId) {
    showError(t("dashboard.missingId"));
    return;
  }

  try {
    await me();
  } catch {
    location.href = "/";
    return;
  }

  const result = await getEvidence(assemblyId);
  if (!result.ok) {
    showError(result.message || t("evidence.unavailable"));
    qs("#evidence-root").innerHTML = `<div class="empty-state">${escapeHtml(t("evidence.empty"))}</div>`;
    return;
  }

  renderEvidence(result.data);
}

init().catch((error) => {
  console.error(error);
  showError(error.message || t("evidence.unavailable"));
});
