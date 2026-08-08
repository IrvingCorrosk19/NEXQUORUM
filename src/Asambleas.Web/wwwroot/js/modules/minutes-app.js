import { me } from "./auth.js";
import { initI18n, t } from "../i18n/i18n.js";
import { assemblyIdFromUrl, escapeHtml, formatDateTime, qs } from "./ui.js";
import { getMinutes } from "./room-state.js";

const assemblyId = assemblyIdFromUrl();

function showError(message) {
  const el = qs("#page-alert");
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || "";
}

function renderMinutes(data) {
  const root = qs("#minutes-root");
  if (!data) {
    root.innerHTML = `<div class="empty-state">${escapeHtml(t("minutes.empty"))}</div>`;
    return;
  }

  if (typeof data === "string") {
    root.innerHTML = `<pre style="white-space:pre-wrap;margin:0;font-family:var(--font-body)">${escapeHtml(data)}</pre>`;
    return;
  }

  const title = data.title || data.assemblyTitle || t("minutes.title");
  const body = data.body || data.content || data.html || null;
  const sections = data.sections || data.items || data.entries || [];

  if (body && typeof body === "string" && body.includes("<")) {
    root.innerHTML = `<h2 style="margin-top:0">${escapeHtml(title)}</h2>${body}`;
    return;
  }

  root.innerHTML = `
    <h2 style="margin-top:0">${escapeHtml(title)}</h2>
    ${data.generatedAtUtc ? `<p class="muted">${escapeHtml(formatDateTime(data.generatedAtUtc))}</p>` : ""}
    ${body ? `<p>${escapeHtml(body)}</p>` : ""}
    ${
      sections.length
        ? `<ol>${sections
            .map(
              (s) =>
                `<li><strong>${escapeHtml(s.heading || s.title || s.code || "")}</strong>
                 <div>${escapeHtml(s.text || s.body || s.content || JSON.stringify(s))}</div></li>`
            )
            .join("")}</ol>`
        : !body
          ? `<pre style="white-space:pre-wrap;margin:0;font-family:var(--font-body)">${escapeHtml(JSON.stringify(data, null, 2))}</pre>`
          : ""
    }
  `;
}

async function init() {
  await initI18n();
  qs("#page-title").textContent = t("minutes.title");
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

  const result = await getMinutes(assemblyId);
  if (!result.ok) {
    showError(result.message || t("minutes.unavailable"));
    qs("#minutes-root").innerHTML = `<div class="empty-state">${escapeHtml(t("minutes.empty"))}</div>`;
    return;
  }

  renderMinutes(result.data);
}

init().catch((error) => {
  console.error(error);
  showError(error.message || t("minutes.unavailable"));
});
