import { api } from "./api.js";
import { me } from "./auth.js";
import { initI18n, t } from "../i18n/i18n.js";
import { assemblyIdFromUrl, escapeHtml, qs, showToast } from "./ui.js";
import { showPageError } from "./app-feedback.js";
import { ensureAssemblyIdOrRedirect, isValidAssemblyId } from "./assembly-context.js?v=guid1";
import { bootIaPage } from "./ia-page.js";

let assemblyId = assemblyIdFromUrl();
let previewObjectUrl = null;

const ICONS = {
  acta: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4"/><path d="M9 12h6M9 16h6"/></svg>`,
  asistencia: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 19c1.5-3 4-4.5 6-4.5S13.5 16 15 19"/><path d="M16 8h5M18.5 5.5v5"/></svg>`,
  quorum: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 19V5"/><path d="M4 19h16"/><path d="M7 15h3v4H7zM12 10h3v9h-3zM17 7h3v12h-3z"/></svg>`,
  votaciones: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M9 11l3 3 7-7"/><path d="M4 19h16"/><path d="M5 15V5h10"/></svg>`,
  decisiones: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4z"/><path d="M9 12l2 2 4-4"/></svg>`,
  integridad: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4z"/></svg>`,
  auditoria: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M16 16l4 4"/><path d="M9 11h4M11 9v4"/></svg>`,
  grabacion: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="6" width="14" height="12" rx="2"/><path d="M17 10l4-2v8l-4-2z"/></svg>`
};

function showError(message) {
  const text = String(message || "No se pudo completar la descarga.").trim();
  showPageError(text);
  showToast({ title: "Error", message: text, variant: "error" });
}

function friendlyExpedienteError(error) {
  const status = error?.status;
  const raw = String(error?.message || "");
  if (status === 404 || /Request failed \(404\)/i.test(raw)) {
    return "No encontramos el expediente de esta asamblea. Abra Expediente desde el menú de la asamblea.";
  }
  if (status === 403) {
    return "No tiene permiso para ver o descargar el expediente de esta asamblea.";
  }
  return raw || "No se pudo cargar el expediente.";
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

function assemblyStatusLabel(status) {
  const map = {
    Draft: "Borrador",
    Scheduled: "Programada",
    CheckIn: "En acreditación",
    InProgress: "En curso",
    Paused: "Pausada",
    Completed: "Finalizada",
    Cancelled: "Cancelada",
    Archived: "Archivada"
  };
  return map[status] || status || "—";
}

function documentLifecycle(status) {
  if (status === "Completed" || status === "Archived") return "FINAL";
  if (status === "Cancelled") return "CANCELADO";
  if (status === "InProgress" || status === "Paused" || status === "CheckIn") return "DOCUMENTO EN CURSO";
  return "BORRADOR";
}

function filenameFromContentDisposition(header, fallbackName) {
  const cd = String(header || "");
  const star = /filename\*\s*=\s*(?:UTF-8''|utf-8'')([^;]+)/i.exec(cd);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ""));
    } catch {
      /* fall through */
    }
  }
  const plain = /filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;]+)/i.exec(cd);
  const raw = (plain?.[1] || plain?.[2] || "").trim().replace(/^"|"$/g, "");
  if (raw) {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return fallbackName;
}

function sanitizeDownloadName(name, fallbackName) {
  const cleaned = String(name || fallbackName || "download.bin")
    .replace(/[<>:"/\\|?*\u0000-\u001f;]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || fallbackName || "download.bin";
}

async function parseErrorBody(res) {
  const text = await res.text().catch(() => "");
  if (!text) return `Descarga falló (${res.status})`;
  try {
    const json = JSON.parse(text);
    return json.detail || json.title || json.message || text;
  } catch {
    return text.length > 240 ? `Descarga falló (${res.status})` : text;
  }
}

async function downloadBlob(path, fallbackName, { button } = {}) {
  if (button) {
    button.disabled = true;
    button.dataset.prevLabel = button.textContent || "";
    button.textContent = "Descargando…";
  }
  try {
    const res = await fetch(path, { credentials: "same-origin" });
    if (!res.ok) {
      throw new Error(await parseErrorBody(res));
    }
    const blob = await res.blob();
    if (!blob || blob.size <= 0) {
      throw new Error(
        "El archivo está vacío o aún no está disponible. Si es una grabación, espere a que termine de procesarse."
      );
    }
    const name = sanitizeDownloadName(
      filenameFromContentDisposition(res.headers.get("content-disposition"), fallbackName),
      fallbackName
    );
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.rel = "noopener";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(url), 2500);
    }
    return { name, size: blob.size };
  } finally {
    if (button) {
      button.disabled = false;
      if (button.dataset.prevLabel) {
        button.textContent = button.dataset.prevLabel;
        delete button.dataset.prevLabel;
      }
    }
  }
}

function docUrl(key, format, preview = false) {
  const q = new URLSearchParams({ format });
  if (preview) q.set("preview", "true");
  return `/api/assemblies/${assemblyId}/expediente/documents/${key}?${q}`;
}

function closePreview() {
  const modal = qs("#pdf-preview-modal");
  const frame = qs("#pdf-preview-frame");
  if (modal) modal.hidden = true;
  if (frame) frame.src = "about:blank";
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }
}

async function openPdfPreview(key, title, button) {
  if (button) {
    button.disabled = true;
    button.dataset.prevLabel = button.textContent || "";
    button.textContent = "Cargando…";
  }
  try {
    const res = await fetch(docUrl(key, "pdf", true), { credentials: "same-origin" });
    if (!res.ok) throw new Error(await parseErrorBody(res));
    const blob = await res.blob();
    if (!blob?.size) throw new Error("El PDF está vacío.");
    closePreview();
    previewObjectUrl = URL.createObjectURL(blob);
    const modal = qs("#pdf-preview-modal");
    const frame = qs("#pdf-preview-frame");
    const titleEl = qs("#pdf-preview-title");
    if (titleEl) titleEl.textContent = title || "Vista previa";
    if (frame) frame.src = previewObjectUrl;
    if (modal) modal.hidden = false;
  } finally {
    if (button) {
      button.disabled = false;
      if (button.dataset.prevLabel) {
        button.textContent = button.dataset.prevLabel;
        delete button.dataset.prevLabel;
      }
    }
  }
}

function wirePreviewModal() {
  document.querySelectorAll("[data-close-preview]").forEach((el) => {
    el.addEventListener("click", () => closePreview());
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePreview();
  });
}

function renderDocCards(root, cards, canDownload) {
  if (!root) return;
  root.innerHTML = cards
    .map((c) => {
      const formats = (c.formats || ["pdf"]).map((f) => f.toUpperCase()).join(" · ");
      const previewBtn = c.preview
        ? `<button type="button" class="btn btn-secondary" data-preview="${escapeHtml(c.key)}" data-title="${escapeHtml(c.title)}">Vista previa</button>`
        : "";
      const dlButtons = (c.formats || ["pdf"])
        .map(
          (fmt) =>
            `<button type="button" class="btn btn-secondary" data-doc="${escapeHtml(c.key)}" data-format="${escapeHtml(fmt)}">Descargar ${escapeHtml(fmt.toUpperCase())}</button>`
        )
        .join("");
      return `<article class="exp-card">
        <div class="exp-card__icon">${ICONS[c.icon] || ICONS.acta}</div>
        <h3 class="exp-card__title">${escapeHtml(c.title)}</h3>
        <p class="exp-card__meta">${escapeHtml(formats)}${c.meta ? ` · ${escapeHtml(c.meta)}` : ""}</p>
        <div class="exp-card__actions">${canDownload ? `${previewBtn}${dlButtons}` : `<span class="muted">Sin permiso de descarga</span>`}</div>
      </article>`;
    })
    .join("");

  root.querySelectorAll("[data-preview]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await openPdfPreview(btn.getAttribute("data-preview"), btn.getAttribute("data-title"), btn);
      } catch (e) {
        showError(e.message);
      }
    });
  });
  root.querySelectorAll("[data-doc]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const key = btn.getAttribute("data-doc");
      const format = btn.getAttribute("data-format") || "pdf";
      try {
        const result = await downloadBlob(docUrl(key, format), `${key}.${format}`, { button: btn });
        showToast({
          title: "Descarga iniciada",
          message: `${result.name} (${formatSize(result.size)})`,
          variant: "success"
        });
      } catch (e) {
        showError(e.message);
      }
    });
  });
}

function renderDocumentSections(data) {
  const lifecycle = documentLifecycle(data.status);
  const lifeEl = qs("#doc-lifecycle");
  if (lifeEl) {
    lifeEl.hidden = false;
    lifeEl.textContent = lifecycle;
  }

  const recCount = (data.recordings || []).length;
  const canDocs = Boolean(data.canDownloadEvidencePackage || data.canDownloadActa);

  renderDocCards(
    qs("#official-docs"),
    [
      {
        key: "acta",
        title: "Acta de Asamblea",
        icon: "acta",
        formats: ["pdf", "txt"],
        preview: true,
        meta: lifecycle
      },
      {
        key: "asistencia",
        title: "Registro de Asistencia",
        icon: "asistencia",
        formats: ["pdf", "txt"],
        preview: true,
        meta: "Participantes y representaciones"
      },
      {
        key: "quorum",
        title: "Certificación de Quórum",
        icon: "quorum",
        formats: ["pdf", "txt"],
        preview: true,
        meta: "Resumen e evolución"
      },
      {
        key: "votaciones",
        title: "Informe de Votaciones",
        icon: "votaciones",
        formats: ["pdf", "txt"],
        preview: true,
        meta: "Mociones y resultados"
      },
      {
        key: "decisiones",
        title: "Registro de Decisiones",
        icon: "decisiones",
        formats: ["pdf", "txt"],
        preview: true,
        meta: "Decisiones formalizadas"
      }
    ],
    canDocs
  );

  renderDocCards(
    qs("#evidence-docs"),
    [
      {
        key: "integridad",
        title: "Resumen de Integridad",
        icon: "integridad",
        formats: ["pdf", "txt"],
        preview: true,
        meta: `${recCount} grabación(es) referenciadas`
      },
      {
        key: "auditoria",
        title: "Auditoría técnica",
        icon: "auditoria",
        formats: ["txt"],
        preview: false,
        meta: "Timestamps ISO · eventos · IDs"
      }
    ],
    canDocs
  );
}

function renderRecordings(list) {
  const root = qs("#recordings-list");
  if (!list?.length) {
    root.innerHTML = `<p class="muted">No hay grabaciones disponibles.</p>`;
    return;
  }
  root.innerHTML = list
    .map((r) => {
      const size = Number(r.fileSizeBytes || 0);
      const ready = r.status === "Ready";
      const canPlay = Boolean(r.canPlay) && ready;
      const canDownload = Boolean(r.canDownload) && ready && size > 0;
      const emptyReady = ready && size <= 0;
      return `
    <article class="exp-card" style="min-height:auto">
      <div class="exp-card__icon">${ICONS.grabacion}</div>
      <h3 class="exp-card__title">${escapeHtml(r.displayFileName || r.id)}</h3>
      <p class="exp-card__meta">Estado: ${escapeHtml(r.status)} · Duración: ${formatDuration(r.durationSeconds)} · Tamaño: ${escapeHtml(r.fileSizeLabel || formatSize(r.fileSizeBytes))}</p>
      <p class="exp-card__meta">Proveedor: ${escapeHtml(r.provider || "—")}</p>
      ${r.failureReason ? `<p class="inline-alert inline-alert-error">${escapeHtml(r.failureReason)}</p>` : ""}
      ${emptyReady ? `<p class="inline-alert inline-alert-error">La grabación figura como lista pero el archivo aún no está en el servidor (0 bytes).</p>` : ""}
      <div class="exp-card__actions">
        ${canPlay ? `<button type="button" class="btn btn-primary" data-play="${r.id}">Reproducir</button>` : ""}
        ${canDownload ? `<button type="button" class="btn btn-secondary" data-download="${r.id}">Descargar</button>` : ""}
        ${
          r.status === "Processing" || r.status === "Starting" || r.status === "Recording" || emptyReady
            ? `<button type="button" class="btn btn-secondary" data-refresh="${r.id}">Actualizar estado</button>`
            : ""
        }
      </div>
    </article>`;
    })
    .join("");

  root.querySelectorAll("[data-play]").forEach((btn) => {
    btn.addEventListener("click", () => play(btn.getAttribute("data-play")));
  });
  root.querySelectorAll("[data-download]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        const result = await downloadBlob(
          `/api/assemblies/${assemblyId}/recording/${btn.getAttribute("data-download")}/download`,
          "grabacion.mp4",
          { button: btn }
        );
        showToast({
          title: "Descarga iniciada",
          message: `${result.name} (${formatSize(result.size)})`,
          variant: "success"
        });
      } catch (e) {
        showError(e.message);
      }
    });
  });
  root.querySelectorAll("[data-refresh]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        btn.disabled = true;
        await api(`/api/assemblies/${assemblyId}/recording/${btn.getAttribute("data-refresh")}/refresh`, {
          method: "POST"
        });
        await load();
        showToast("Estado de grabación actualizado", "success");
      } catch (e) {
        showError(e.message);
      } finally {
        btn.disabled = false;
      }
    });
  });
}

async function play(recordingId) {
  const panel = qs("#player-panel");
  const video = qs("#player");
  panel.hidden = false;
  qs("#player-meta").textContent = `Grabación ${recordingId}`;
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
    root.innerHTML = `<p class="muted">Sin eventos de línea de tiempo.</p>`;
    return;
  }
  root.innerHTML = items
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
      if (video.readyState >= 1) seek();
      else video.addEventListener("loadedmetadata", seek);
    });
  });
}

function wirePackageButton(canDownload) {
  const pkgBtn = qs('[data-dl="package"]');
  if (!pkgBtn) return;
  pkgBtn.disabled = false;
  pkgBtn.onclick = async () => {
    if (!canDownload) {
      showError("No tiene permiso para descargar el expediente (ZIP).");
      return;
    }
    try {
      const result = await downloadBlob(
        `/api/assemblies/${assemblyId}/expediente/package`,
        "expediente.zip",
        { button: pkgBtn }
      );
      showToast({
        title: "Expediente descargado",
        message: `${result.name} (${formatSize(result.size)})`,
        variant: "success"
      });
    } catch (e) {
      showError(e.message);
    }
  };
}

async function load() {
  const data = await api(`/api/assemblies/${assemblyId}/expediente`);
  const sub = qs("#page-sub");
  if (sub) {
    sub.textContent = `${data.assemblyTitle || ""} · ${assemblyStatusLabel(data.status)}`;
  }
  const linkBack = qs("#link-back");
  if (linkBack) linkBack.href = `/dashboard.html?assemblyId=${assemblyId}`;

  const policy = data.policy;
  if (policy?.requireNoticeAcknowledgement && !policy.currentUserAcceptedNotice) {
    qs("#policy-panel").hidden = false;
    qs("#notice-text").textContent = policy.noticeText || "";
  } else {
    qs("#policy-panel").hidden = true;
  }

  renderDocumentSections(data);
  renderRecordings(data.recordings || []);
  renderTimeline(data.timeline || []);
  wirePackageButton(Boolean(data.canDownloadEvidencePackage));
}

async function init() {
  await initI18n();
  const pageTitle = qs("#page-title");
  if (pageTitle) pageTitle.textContent = "Expediente digital";
  wirePreviewModal();
  if (!isValidAssemblyId(assemblyId)) {
    const resolved = await ensureAssemblyIdOrRedirect();
    if (!resolved) {
      showError(
        "Falta el identificador de la asamblea. Abra Expediente desde Propiedades → Asambleas."
      );
      return;
    }
    const urlId = new URLSearchParams(location.search).get("assemblyId");
    if (String(urlId || "") !== String(resolved)) {
      return;
    }
    assemblyId = resolved;
  }
  assemblyId = String(assemblyId).trim();
  try {
    await me();
  } catch {
    location.href = "/";
    return;
  }

  await bootIaPage({ current: "asm-expediente", pageLabel: "Expediente" });

  qs("#btn-ack-notice")?.addEventListener("click", async () => {
    await api(`/api/assemblies/${assemblyId}/recording/notice/ack`, {
      method: "POST",
      body: {}
    });
    await load();
  });

  wirePackageButton(true);

  try {
    await load();
  } catch (e) {
    showError(friendlyExpedienteError(e));
  }
}

init().catch((e) => showError(friendlyExpedienteError(e) || t("networkError")));
