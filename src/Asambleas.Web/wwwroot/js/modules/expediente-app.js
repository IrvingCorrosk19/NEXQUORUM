import { api } from "./api.js";
import { me } from "./auth.js";
import { initI18n, t } from "../i18n/i18n.js";
import { assemblyIdFromUrl, escapeHtml, qs, showToast } from "./ui.js";
import { ensureAssemblyIdOrRedirect } from "./assembly-context.js";

let assemblyId = assemblyIdFromUrl();

function showError(message) {
  const el = qs("#page-alert");
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || "";
}

function formatSize(bytes) {
  if (bytes == null) return "—";
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(sec) {
  if (sec == null) return "—";
  const s = Math.max(0, Math.floor(Number(sec)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return [h, m, r].map((x) => String(x).padStart(2, "0")).join(":");
}

async function downloadBlob(path, fallbackName) {
  const res = await fetch(path, { credentials: "same-origin" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const cd = res.headers.get("content-disposition") || "";
  const match = /filename\*?=(?:UTF-8''|")?([^\";]+)/i.exec(cd);
  const name = match ? decodeURIComponent(match[1].replace(/"/g, "")) : fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function renderRecordings(list) {
  const root = qs("#recordings-list");
  if (!list?.length) {
    root.innerHTML = `<p class="muted">No hay grabaciones disponibles.</p>`;
    return;
  }
  root.innerHTML = list
    .map(
      (r) => `
    <article class="panel" style="box-shadow:none;border:1px solid var(--color-border)">
      <p><strong>${escapeHtml(r.displayFileName || r.id)}</strong></p>
      <p class="muted">Estado: ${escapeHtml(r.status)} · Duración: ${formatDuration(r.durationSeconds)} · Tamaño: ${escapeHtml(r.fileSizeLabel || formatSize(r.fileSizeBytes))}</p>
      <p class="muted">Proveedor: ${escapeHtml(r.provider || "—")}</p>
      ${r.failureReason ? `<p class="inline-alert inline-alert-error">${escapeHtml(r.failureReason)}</p>` : ""}
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.75rem">
        ${
          r.canPlay
            ? `<button type="button" class="btn btn-primary" data-play="${r.id}">▶ Reproducir</button>`
            : ""
        }
        ${
          r.canDownload
            ? `<button type="button" class="btn btn-secondary" data-download="${r.id}">↓ Descargar</button>`
            : ""
        }
        ${
          r.status === "Processing" || r.status === "Starting" || r.status === "Recording"
            ? `<button type="button" class="btn btn-secondary" data-refresh="${r.id}">Actualizar estado</button>`
            : ""
        }
      </div>
    </article>`
    )
    .join("");

  root.querySelectorAll("[data-play]").forEach((btn) => {
    btn.addEventListener("click", () => play(btn.getAttribute("data-play")));
  });
  root.querySelectorAll("[data-download]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await downloadBlob(
          `/api/assemblies/${assemblyId}/recording/${btn.getAttribute("data-download")}/download`,
          "grabacion.mp4"
        );
        showToast("Descarga iniciada", "success");
      } catch (e) {
        showError(e.message);
      }
    });
  });
  root.querySelectorAll("[data-refresh]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api(`/api/assemblies/${assemblyId}/recording/${btn.getAttribute("data-refresh")}/refresh`, {
        method: "POST"
      });
      await load();
    });
  });
}

async function play(recordingId) {
  const panel = qs("#player-panel");
  const video = qs("#player");
  panel.hidden = false;
  qs("#player-meta").textContent = `Grabación ${recordingId}`;
  // Authorized cookie stream — not a public URL.
  video.src = `/api/assemblies/${assemblyId}/recording/${recordingId}/play`;
  try {
    await video.play();
  } catch {
    /* user gesture / codec */
  }
}

function renderTimeline(items) {
  const root = qs("#timeline");
  if (!items?.length) {
    root.innerHTML = "";
    return;
  }
  root.innerHTML = `<h3>Línea de tiempo</h3>` + items
    .map((e) => {
      const offset =
        e.offsetSecondsFromRecordingStart != null
          ? formatDuration(e.offsetSecondsFromRecordingStart)
          : "—";
      const canSeek =
        e.recordingId &&
        e.offsetSecondsFromRecordingStart != null &&
        e.offsetSecondsFromRecordingStart >= 0;
      const seekBtn = canSeek
        ? `<button type="button" class="btn btn-ghost" data-seek-rec="${escapeHtml(e.recordingId)}" data-seek-sec="${e.offsetSecondsFromRecordingStart}">Ver en grabación</button>`
        : "";
      return `<li><strong>${escapeHtml(offset)}</strong> · ${escapeHtml(e.label || e.eventType)} ${seekBtn}</li>`;
    })
    .join("");

  root.querySelectorAll("[data-seek-rec]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const recId = btn.getAttribute("data-seek-rec");
      const sec = Number(btn.getAttribute("data-seek-sec") || 0);
      await play(recId);
      const video = qs("#player");
      const seek = () => {
        try {
          video.currentTime = Math.max(0, sec);
        } catch {
          /* ignore */
        }
        video.removeEventListener("loadedmetadata", seek);
      };
      if (video.readyState >= 1) {
        seek();
      } else {
        video.addEventListener("loadedmetadata", seek);
      }
    });
  });
}

async function load() {
  const data = await api(`/api/assemblies/${assemblyId}/expediente`);
  qs("#page-sub").textContent = `${data.assemblyTitle || ""} · ${data.status || ""}`;
  qs("#link-back").href = `/dashboard.html?assemblyId=${assemblyId}`;

  const policy = data.policy;
  if (policy?.requireNoticeAcknowledgement && !policy.currentUserAcceptedNotice) {
    qs("#policy-panel").hidden = false;
    qs("#notice-text").textContent = policy.noticeText || "";
  } else {
    qs("#policy-panel").hidden = true;
  }

  renderRecordings(data.recordings || []);
  renderTimeline(data.timeline || []);

  const pkgBtn = qs('[data-dl="package"]');
  pkgBtn.disabled = !data.canDownloadEvidencePackage;
  pkgBtn.onclick = async () => {
    try {
      await downloadBlob(`/api/assemblies/${assemblyId}/expediente/package`, "expediente.zip");
      showToast("Expediente descargado", "success");
    } catch (e) {
      showError(e.message);
    }
  };
}

async function init() {
  await initI18n();
  qs("#page-title").textContent = "Expediente digital";
  if (!assemblyId) {
    assemblyId = await ensureAssemblyIdOrRedirect();
    if (!assemblyId) {
      showError("Falta assemblyId");
      return;
    }
    return;
  }
  try {
    await me();
  } catch {
    location.href = "/";
    return;
  }

  qs("#btn-ack-notice")?.addEventListener("click", async () => {
    await api(`/api/assemblies/${assemblyId}/recording/notice/ack`, {
      method: "POST",
      body: {}
    });
    await load();
  });

  await load();
}

init().catch((e) => showError(e.message || t("networkError")));
