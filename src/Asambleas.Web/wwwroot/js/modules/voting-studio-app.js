import { api } from "./api.js";
import { hasPermission } from "./auth.js";
import { statusLabelEs } from "./ia-actions.js";
import { escapeHtml, showToast, qs, confirmDialog } from "./ui.js";
import { showPageError } from "./app-feedback.js";
import { showGlobalLoader, hideGlobalLoader } from "./loading.js";
import { mountReadinessActionBar } from "./readiness-actions.js";
import { isReadinessReturnContext } from "./return-context.js";
import { bootIaPage } from "./ia-page.js";
import { readIaContext } from "./ia-context.js";
import { phHref } from "./ia-nav.js";
import { openMotionImportWizard } from "./motion-import.js";

const showLoader = (msg) => showGlobalLoader(msg, { immediate: true });
const hideLoader = () => hideGlobalLoader();

function showError(message) {
  const el = qs("#page-alert");
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || "";
  if (message) showToast(message, "error");
}

const params = new URLSearchParams(location.search);
let assemblyId = params.get("assemblyId");
let voteFilter = "all";
let voteSearch = "";

const DESIGN_LABELS = {
  Draft: "Borrador",
  Ready: "Preparada",
  Published: "Publicada"
};

const STATUS_LABELS = {
  Draft: "Borrador",
  Pending: "Pendiente",
  Open: "En vivo",
  Closed: "Cerrada",
  Published: "Publicada"
};

function motionBucket(m) {
  const design = String(m.designStatus || "Draft");
  const status = String(m.status || "");
  if (status === "Open" || status === "InProgress") return "live";
  if (status === "Closed" || status === "Completed") return "closed";
  if (design === "Ready" || design === "Published") return "ready";
  return "draft";
}

function motionStatusLabel(m) {
  const status = String(m.status || "");
  if (status === "Open" || status === "InProgress") return "En vivo";
  if (status === "Closed" || status === "Completed") return "Cerrada";
  return DESIGN_LABELS[m.designStatus] || DESIGN_LABELS.Draft;
}

const TEMPLATES = [
  {
    key: "approval-standard",
    title: "Aprobación estándar",
    ballotKind: "FavorAgainstAbstain",
    calculationMethod: "Coefficient",
    decisionRuleCode: "SimpleMajority",
    question: "¿Aprueba la moción presentada?",
    options: ["A favor", "En contra", "Abstención"]
  },
  {
    key: "yes-no",
    title: "Sí / No",
    ballotKind: "YesNo",
    calculationMethod: "Coefficient",
    decisionRuleCode: "SimpleMajority",
    question: "¿Está de acuerdo?",
    options: ["Sí", "No"]
  },
  {
    key: "favor-against-abstain",
    title: "A favor / En contra / Abstención",
    ballotKind: "FavorAgainstAbstain",
    calculationMethod: "Coefficient",
    decisionRuleCode: "SimpleMajority",
    question: "¿Aprueba la propuesta?",
    options: ["A favor", "En contra", "Abstención"]
  },
  {
    key: "budget",
    title: "Presupuesto",
    ballotKind: "FavorAgainstAbstain",
    calculationMethod: "Coefficient",
    decisionRuleCode: "QualifiedMajority",
    requiredThresholdPercent: 66.67,
    question: "¿Aprueba el presupuesto extraordinario?",
    options: ["A favor", "En contra", "Abstención"]
  },
  {
    key: "extra-fee",
    title: "Cuota extraordinaria",
    ballotKind: "FavorAgainstAbstain",
    calculationMethod: "Coefficient",
    decisionRuleCode: "QualifiedMajority",
    requiredThresholdPercent: 66.67,
    question: "¿Aprueba la cuota extraordinaria?",
    options: ["A favor", "En contra", "Abstención"]
  },
  {
    key: "election",
    title: "Elección",
    ballotKind: "SingleChoice",
    calculationMethod: "Coefficient",
    decisionRuleCode: "SimpleMajority",
    question: "Elija un candidato",
    options: ["Candidato A", "Candidato B", "Candidato C"]
  },
  {
    key: "board-election",
    title: "Elección de Junta",
    ballotKind: "MultiCandidate",
    calculationMethod: "Coefficient",
    decisionRuleCode: "SimpleMajority",
    question: "Elección de cargos de junta",
    options: ["Presidente — Carlos Pérez", "Presidente — María González", "Secretario — Ana Rodríguez"]
  },
  {
    key: "multi-option",
    title: "Opción múltiple",
    ballotKind: "SingleChoice",
    calculationMethod: "PerPerson",
    decisionRuleCode: "SimpleMajority",
    question: "Seleccione una opción",
    options: ["Opción 1", "Opción 2", "Opción 3"]
  },
  {
    key: "survey",
    title: "Encuesta",
    isSurvey: true,
    question: "Evaluación de la Asamblea",
    questions: [
      { questionType: "Scale", title: "Califique la Asamblea (1–5)", optionsJson: '["1","2","3","4","5"]', isRequired: true },
      {
        questionType: "MultipleChoice",
        title: "¿Qué temas desea priorizar?",
        optionsJson: '["Presupuesto","Mantenimiento","Seguridad","Comunicación"]',
        isRequired: true
      },
      { questionType: "OpenText", title: "Comentarios adicionales", isRequired: false }
    ]
  }
];

const state = {
  user: null,
  agenda: [],
  motions: [],
  surveys: [],
  mode: null, // vote | survey
  editingId: null,
  draft: null,
  studioView: "list", // list | editor
  dirty: false
};

function truncateText(value, max = 80) {
  const text = String(value || "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** Repair classic UTF-8-as-Latin1 mojibake in seeded/legacy strings. */
function repairMojibake(value) {
  const s = String(value ?? "");
  // Ã³ / Â / â€" (em-dash) and similar double-encoded UTF-8 sequences
  if (!/[ÃÂâ]/.test(s)) return s;
  try {
    const bytes = Uint8Array.from(s, (ch) => ch.charCodeAt(0) & 0xff);
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return s;
  }
}

function agendaCodeFor(motion) {
  const id = motion?.agendaItemId;
  if (!id) return "—";
  const item = state.agenda.find((a) => String(a.id) === String(id));
  return item?.code || "—";
}

function motionCounts() {
  const counts = { total: state.motions.length, draft: 0, ready: 0, live: 0, closed: 0 };
  for (const m of state.motions) {
    const bucket = motionBucket(m);
    if (counts[bucket] != null) counts[bucket] += 1;
  }
  return counts;
}

function setDirty(flag) {
  state.dirty = !!flag;
  const el = qs("#editor-dirty") || qs(".studio-dirty-flag");
  if (!el) return;
  el.hidden = !state.dirty;
  if (state.dirty) el.textContent = "Cambios pendientes";
}

function syncStudioUrl() {
  try {
    const url = new URL(location.href);
    if (assemblyId) url.searchParams.set("assemblyId", assemblyId);
    else url.searchParams.delete("assemblyId");
    if (state.studioView === "editor" && state.editingId) {
      url.searchParams.set("view", "edit");
      url.searchParams.set("motionId", state.editingId);
    } else {
      url.searchParams.delete("view");
      url.searchParams.delete("motionId");
    }
    history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* soft: ignore history failures */
  }
}

function applyLayoutMode() {
  const layout = qs("#voting-layout");
  const listPanel = qs("#list-panel") || qs(".studio-list-shell");
  const editorPanel = qs("#editor-panel");
  const isEditor = state.studioView === "editor";

  if (listPanel) listPanel.hidden = isEditor;
  if (editorPanel) editorPanel.hidden = !isEditor;

  if (layout) {
    layout.classList.toggle("is-list", !isEditor);
    layout.classList.toggle("is-editor", isEditor);
    layout.classList.remove("has-editor");
  }

  const listHero = qs("#list-hero");
  if (listHero) listHero.hidden = isEditor;
}

function enterListMode({ keepFilters = true } = {}) {
  state.studioView = "list";
  state.mode = null;
  state.editingId = null;
  state.draft = null;
  setDirty(false);
  if (!keepFilters) {
    voteFilter = "all";
    voteSearch = "";
    const search = qs("#vote-search");
    if (search) search.value = "";
    document.querySelectorAll("#vote-filters button").forEach((b) => {
      b.setAttribute("aria-pressed", b.dataset.filter === "all" ? "true" : "false");
    });
  }
  applyLayoutMode();
  syncStudioUrl();
  renderLists();
}

function enterEditorMode() {
  state.studioView = "editor";
  applyLayoutMode();
  syncStudioUrl();
}

async function closeEditor() {
  if (state.dirty) {
    const ok = await confirmDialog({
      title: "Cambios sin guardar",
      body: "Hay cambios pendientes en el editor. Si sales ahora, se perderán.",
      confirmLabel: "Descartar cambios",
      cancelLabel: "Seguir editando"
    });
    if (!ok) return false;
  }
  enterListMode({ keepFilters: true });
  return true;
}

async function createNewVote() {
  try {
    await ensureAgendaItem();
    openVoteEditor(null, TEMPLATES[0]);
  } catch (err) {
    showError(err.message);
  }
}

function defaultVoteDraft(template) {
  const t = template || TEMPLATES[0];
  return {
    agendaItemId: state.agenda[0]?.id || "",
    code: `V-${Date.now().toString().slice(-6)}`,
    title: t.title,
    body: t.question,
    questionText: t.question,
    instructions: "",
    ballotKind: t.ballotKind || "FavorAgainstAbstain",
    calculationMethod: t.calculationMethod || "Coefficient",
    decisionRuleCode: t.decisionRuleCode || "SimpleMajority",
    requiredThresholdPercent: t.requiredThresholdPercent ?? "",
    defaultResultVisibilityPolicy: "HiddenUntilClose",
    options: [...(t.options || ["A favor", "En contra", "Abstención"])],
    isSecret: false,
    templateKey: t.key || null,
    designStatus: "Draft"
  };
}

function defaultSurveyDraft(template) {
  const t = template || TEMPLATES.find((x) => x.isSurvey);
  return {
    agendaItemId: state.agenda[0]?.id || null,
    title: t?.title || "Nueva encuesta",
    description: "",
    questions: (t?.questions || []).map((q) => ({ ...q }))
  };
}

function choicesForBallot(kind, options) {
  if (kind === "YesNo") return ["Sí", "No"];
  if (kind === "YesNoAbstain") return ["Sí", "No", "Abstención"];
  if (kind === "FavorAgainstAbstain") return ["A favor", "En contra", "Abstención"];
  return options.filter(Boolean);
}

/** Labels already used in the studio select — keep preview in the same language surface. */
function calculationMethodLabel(code) {
  const map = {
    Coefficient: "Por coeficiente",
    PerPerson: "Por persona",
    PerUnit: "Por unidad"
  };
  return map[code] || code || "—";
}

function previewChoiceTone(label) {
  const t = String(label || "").trim().toLowerCase();
  if (t === "a favor" || t === "sí" || t === "si" || t === "yes" || t === "in favor") return "favor";
  if (t === "en contra" || t === "no" || t === "against") return "against";
  if (t === "abstención" || t === "abstencion" || t === "abstain" || t === "abstention") return "abstain";
  return "neutral";
}

function renderPreviewChoiceButtons(choices) {
  return choices
    .map((c) => {
      const tone = previewChoiceTone(c);
      const toneClass = tone === "neutral" ? "" : ` preview-choice--${tone}`;
      return `<button type="button" class="preview-choice${toneClass}" data-preview-choice aria-pressed="false">${escapeHtml(c)}</button>`;
    })
    .join("");
}

function wrapParticipantPreview({ title, methodLabel, methodHint, choicesHtml, choicesCount, bodyHtml }) {
  const meta = methodLabel
    ? `<div class="preview-meta">
        <span class="preview-meta__label">Método de votación</span>
        <span class="preview-meta__value">${escapeHtml(methodLabel)}</span>
        ${methodHint ? `<p class="preview-meta__hint">${escapeHtml(methodHint)}</p>` : ""}
      </div>`
    : "";
  const choices =
    choicesHtml != null
      ? `<div class="preview-choices" role="group" aria-label="Opciones de votación" data-count="${choicesCount || 0}">${choicesHtml}</div>`
      : bodyHtml || "";
  return `
    <div class="preview-device-chrome">
      <div class="preview-device-notch" aria-hidden="true"></div>
      <div class="preview-device-screen">
        <article class="preview-participant-card">
          <p class="preview-participant-badge">Vista del participante</p>
          <h3 class="preview-vote-title">${escapeHtml(title || "Votación")}</h3>
          ${meta}
          ${choices}
        </article>
      </div>
    </div>`;
}

function bindPreviewChoiceInteraction(root) {
  root.querySelectorAll("[data-preview-choice]").forEach((btn) => {
    btn.addEventListener("click", () => {
      root.querySelectorAll("[data-preview-choice]").forEach((b) => b.setAttribute("aria-pressed", "false"));
      btn.setAttribute("aria-pressed", "true");
    });
  });
}

function closePreviewDialog() {
  const dialog = qs("#preview-dialog");
  if (dialog?.open) dialog.close();
}

function renderTabs() {
  document.querySelectorAll(".studio-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".studio-tab").forEach((b) => {
        b.classList.toggle("is-active", b === btn);
        b.setAttribute("aria-selected", b === btn ? "true" : "false");
      });
      const tab = btn.dataset.tab;
      qs("#votes-panel").hidden = tab !== "votes";
      qs("#surveys-panel").hidden = tab !== "surveys";
      qs("#list-templates").hidden = tab !== "templates";
    });
  });
}

function filteredMotions() {
  let rows = state.motions;
  if (voteFilter !== "all") rows = rows.filter((m) => motionBucket(m) === voteFilter);
  if (voteSearch.trim()) {
    const q = voteSearch.trim().toLowerCase();
    rows = rows.filter((m) => {
      const haystack = [m.title, m.questionText, m.body, m.code]
        .map((v) => String(v || "").toLowerCase())
        .join(" ");
      return haystack.includes(q);
    });
  }
  return rows;
}

function updateVoteStatsAndFilters() {
  const counts = motionCounts();
  const statsRoot = qs("#vote-stats");
  if (statsRoot) {
    for (const key of ["total", "draft", "ready", "live", "closed"]) {
      const el = statsRoot.querySelector(`[data-stat="${key}"]`);
      if (el) el.textContent = String(counts[key] ?? 0);
    }
  } else {
    let host = qs("#vote-stats");
    if (!host) {
      const votesPanel = qs("#votes-panel");
      if (votesPanel) {
        host = document.createElement("div");
        host.id = "vote-stats";
        host.className = "studio-stats";
        host.setAttribute("aria-live", "polite");
        host.innerHTML = `
          <div class="studio-stat"><span class="studio-stat__value" data-stat="total">0</span><span class="studio-stat__label">Total</span></div>
          <div class="studio-stat"><span class="studio-stat__value" data-stat="draft">0</span><span class="studio-stat__label">Borradores</span></div>
          <div class="studio-stat"><span class="studio-stat__value" data-stat="ready">0</span><span class="studio-stat__label">Preparadas</span></div>
          <div class="studio-stat"><span class="studio-stat__value" data-stat="live">0</span><span class="studio-stat__label">En vivo</span></div>
          <div class="studio-stat"><span class="studio-stat__value" data-stat="closed">0</span><span class="studio-stat__label">Cerradas</span></div>`;
        votesPanel.prepend(host);
      }
    }
    if (host) {
      for (const key of ["total", "draft", "ready", "live", "closed"]) {
        const el = host.querySelector(`[data-stat="${key}"]`);
        if (el) el.textContent = String(counts[key] ?? 0);
      }
    }
  }

  const labels = {
    all: "Todas",
    draft: "Borradores",
    ready: "Preparadas",
    live: "En vivo",
    closed: "Cerradas"
  };
  document.querySelectorAll("#vote-filters button").forEach((btn) => {
    const key = btn.dataset.filter || "all";
    const n = key === "all" ? counts.total : counts[key] || 0;
    btn.textContent = `${labels[key] || key} ${n}`;
    btn.setAttribute("aria-pressed", key === voteFilter ? "true" : "false");
  });
}

function primaryActionForMotion(m) {
  const bucket = motionBucket(m);
  if (bucket === "closed") {
    return `<a class="btn btn-secondary btn-sm" href="/lobby.html?assemblyId=${encodeURIComponent(assemblyId)}">Ver resultados</a>`;
  }
  if (bucket === "live") {
    return `<a class="btn btn-primary btn-sm" href="/lobby.html?assemblyId=${encodeURIComponent(assemblyId)}">Administrar</a>`;
  }
  if (bucket === "draft") {
    return `<button type="button" class="btn btn-secondary btn-sm" data-edit-vote="${m.id}">Continuar edición</button>`;
  }
  return `<button type="button" class="btn btn-secondary btn-sm" data-edit-vote="${m.id}">Editar</button>`;
}

function renderLists() {
  const votes = qs("#list-votes");
  if (!votes) return;

  const focusFilter = document.activeElement?.closest?.("#vote-filters button")?.dataset?.filter || null;
  updateVoteStatsAndFilters();

  const rows = filteredMotions();
  const showEmpty = !state.motions.length && state.studioView === "list";

  if (showEmpty) {
    votes.innerHTML = `
      <div class="ia-empty-state">
        <p>Todavía no has preparado votaciones.</p>
        <p>Crea las decisiones que serán sometidas a los propietarios durante la Asamblea.</p>
        <button type="button" class="btn btn-primary" id="btn-empty-create">Crear primera votación</button>
        <button type="button" class="btn btn-secondary" id="btn-empty-import">Importar preguntas</button>
      </div>`;
    qs("#btn-empty-create")?.addEventListener("click", () => createNewVote());
    qs("#btn-empty-import")?.addEventListener("click", () => qs("#btn-import-motions")?.click());
  } else if (!state.motions.length) {
    votes.innerHTML = "";
  } else if (!rows.length) {
    votes.innerHTML = `<div class="ia-empty-state"><p>No hay votaciones en este filtro.</p></div>`;
  } else {
    votes.innerHTML = `
      <table class="ia-data-table" aria-label="Votaciones">
        <thead>
          <tr>
            <th scope="col"><span class="visually-hidden">Seleccionar</span></th>
            <th>Orden</th>
            <th>Código</th>
            <th>Título</th>
            <th>Pregunta</th>
            <th>Agenda</th>
            <th>Estado</th>
            <th class="col-actions">Acción</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((m, idx) => {
              const order = m.displayOrder ?? m.DisplayOrder ?? idx + 1;
              const question = m.questionText || m.body || "";
              const questionShort = truncateText(question, 80);
              const canBulk = (m.designStatus || "Draft") === "Draft" && (m.status === "Draft" || !m.status);
              const secondary =
                motionBucket(m) === "closed" || motionBucket(m) === "live"
                  ? ""
                  : `<details class="studio-row-more">
                      <summary class="btn btn-ghost btn-sm" aria-label="Más acciones">⋯</summary>
                      <div class="studio-row-more__menu" role="menu">
                        <button type="button" role="menuitem" data-dup-vote="${m.id}">Duplicar</button>
                        ${
                          motionBucket(m) === "draft" || motionBucket(m) === "ready"
                            ? `<button type="button" role="menuitem" data-publish-vote="${m.id}">Publicar</button>`
                            : ""
                        }
                      </div>
                    </details>`;
              return `
            <tr>
              <td data-label="Seleccionar">
                <input type="checkbox" data-bulk-id="${m.id}" ${canBulk ? "" : "disabled"} aria-label="Seleccionar ${escapeHtml(m.title || "")}" />
              </td>
              <td data-label="Orden">${escapeHtml(String(order))}</td>
              <td data-label="Código"><code>${escapeHtml(m.code || "—")}</code></td>
              <td data-label="Título"><strong>${escapeHtml(repairMojibake(m.title || "—"))}</strong></td>
              <td data-label="Pregunta" title="${escapeHtml(repairMojibake(question))}">${escapeHtml(repairMojibake(questionShort || "—"))}</td>
              <td data-label="Agenda">${escapeHtml(agendaCodeFor(m))}</td>
              <td data-label="Estado"><span class="ia-badge-status">${escapeHtml(motionStatusLabel(m))}</span></td>
              <td data-label="Acción" class="col-actions">
                <div class="studio-row-actions">${primaryActionForMotion(m)}${secondary}</div>
              </td>
            </tr>`;
            })
            .join("")}
        </tbody>
      </table>`;
  }

  const surveys = qs("#list-surveys");
  if (surveys) {
    if (!state.surveys.length) {
      surveys.innerHTML = `
        <div class="ia-empty-state">
          <p>No hay encuestas preparadas.</p>
          <button type="button" class="btn btn-primary" id="btn-empty-survey">Crear encuesta</button>
        </div>`;
      qs("#btn-empty-survey")?.addEventListener("click", async () => {
        try {
          await ensureAgendaItem();
          openSurveyEditor(null, TEMPLATES.find((t) => t.isSurvey));
        } catch (err) {
          showError(err.message);
        }
      });
    } else {
      surveys.innerHTML = `
        <table class="ia-data-table" aria-label="Encuestas">
          <thead><tr><th>Título</th><th>Estado</th><th>Respuestas</th><th class="col-actions">Acción</th></tr></thead>
          <tbody>
            ${state.surveys
              .map(
                (s) => `
              <tr>
                <td data-label="Título"><strong>${escapeHtml(s.title)}</strong></td>
                <td data-label="Estado">${escapeHtml(STATUS_LABELS[s.status] || s.status || "—")}</td>
                <td data-label="Respuestas">${s.responseCount || 0}</td>
                <td data-label="Acción" class="col-actions">
                  <button type="button" class="btn btn-secondary btn-sm" data-edit-survey="${s.id}">Editar</button>
                </td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>`;
    }
  }

  const templates = qs("#list-templates");
  if (templates) {
    templates.innerHTML = `<div class="template-grid">${TEMPLATES.map(
      (t) => `
      <article class="studio-card">
        <h3>${escapeHtml(t.title)}</h3>
        <p class="muted">${t.isSurvey ? "Encuesta" : "Votación formal"}</p>
        <button type="button" class="btn btn-primary" data-template="${escapeHtml(t.key)}">Usar plantilla</button>
      </article>`
    ).join("")}</div>`;
  }

  bindListActions();
  applyLayoutMode();

  if (focusFilter) {
    const btn = qs(`#vote-filters button[data-filter="${focusFilter}"]`);
    btn?.focus({ preventScroll: true });
  }
}

function showTemplatesTab() {
  document.querySelectorAll(".studio-tab").forEach((b) => {
    const isTpl = b.dataset.tab === "templates";
    b.classList.toggle("is-active", isTpl);
    b.setAttribute("aria-selected", isTpl ? "true" : "false");
  });
  qs("#votes-panel").hidden = true;
  qs("#surveys-panel").hidden = true;
  qs("#list-templates").hidden = false;
  if (!qs('.studio-tab[data-tab="templates"]')) {
    qs("#list-templates").hidden = false;
  }
}

async function openCreateDialog() {
  const dlg = qs("#create-dialog");
  dlg.showModal();
  const kind = await new Promise((resolve) => {
    dlg.addEventListener(
      "close",
      () => resolve(dlg.returnValue === "ok" ? dlg.querySelector('[name="create-kind"]:checked')?.value : null),
      { once: true }
    );
  });
  if (!kind) return;
  try {
    await ensureAgendaItem();
    if (kind === "survey") {
      openSurveyEditor(null, TEMPLATES.find((t) => t.isSurvey));
    } else {
      openVoteEditor(null, TEMPLATES[0]);
    }
  } catch (err) {
    showError(err.message);
  }
}

function bindListActions() {
  qs("#list-votes").onclick = async (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const editBtn = t.closest("[data-edit-vote]");
    if (editBtn) {
      const m = state.motions.find((x) => x.id === editBtn.dataset.editVote);
      if (m) openVoteEditor(m);
      return;
    }
    const dupBtn = t.closest("[data-dup-vote]");
    if (dupBtn) {
      showLoader("Duplicando votación…");
      try {
        await api(`/api/assemblies/${assemblyId}/motions/${dupBtn.dataset.dupVote}/duplicate`, { method: "POST" });
        await refresh();
        showToast("Votación duplicada", "success");
      } catch (err) {
        showError(err.message);
      } finally {
        hideLoader();
      }
      return;
    }
    const publishBtn = t.closest("[data-publish-vote]");
    if (publishBtn) {
      showLoader("Publicando votación…");
      try {
        await api(`/api/assemblies/${assemblyId}/motions/${publishBtn.dataset.publishVote}/publish`, { method: "POST" });
        await refresh();
        showToast("Votación lista para presentar", "success");
      } catch (err) {
        showError(err.message);
      } finally {
        hideLoader();
      }
    }
  };

  qs("#list-surveys").onclick = async (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const editBtn = t.closest("[data-edit-survey]");
    if (editBtn) {
      const s = state.surveys.find((x) => x.id === editBtn.dataset.editSurvey);
      if (s) openSurveyEditor(s);
      return;
    }
    const publishBtn = t.closest("[data-publish-survey]");
    if (publishBtn) {
      showLoader("Publicando formulario…");
      try {
        await api(`/api/assemblies/${assemblyId}/surveys/${publishBtn.dataset.publishSurvey}/publish`, { method: "POST" });
        await refresh();
        showToast("Formulario publicado", "success");
      } catch (err) {
        showError(err.message);
      } finally {
        hideLoader();
      }
      return;
    }
    const resultsBtn = t.closest("[data-results-survey]");
    if (resultsBtn) {
      try {
        const results = await api(`/api/assemblies/${assemblyId}/surveys/${resultsBtn.dataset.resultsSurvey}/results`);
        const lines = (results.questions || [])
          .map((q) => `• ${q.title}: ${(q.distribution || []).map((d) => `${d.label} ${d.count}`).join(", ")}`)
          .join("\n");
        await confirmDialog({
          title: results.title || "Resultados",
          body: `Respuestas: ${results.responseCount}\n${lines}`,
          confirmLabel: "Cerrar",
          cancelLabel: "OK"
        });
      } catch (err) {
        showError(err.message);
      }
    }
  };

  qs("#list-templates").onclick = (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement) || !t.dataset.template) return;
    const tpl = TEMPLATES.find((x) => x.key === t.dataset.template);
    if (!tpl) return;
    if (tpl.isSurvey) {
      openSurveyEditor(null, tpl);
    } else {
      openVoteEditor(null, tpl);
    }
  };
}

function motionEditMode(motion) {
  return String(motion?.editMode || motion?.EditMode || "Full");
}

function motionEditBlockReason(motion) {
  return repairMojibake(motion?.editBlockReason || motion?.EditBlockReason || motion?.message || "");
}

function openVoteEditor(motion, template) {
  state.mode = "vote";
  state.editingId = motion?.id || null;
  const editMode = motion ? motionEditMode(motion) : "Full";
  state.draft = motion
    ? {
        agendaItemId: motion.agendaItemId,
        code: motion.code,
        title: motion.title,
        body: motion.body,
        questionText: motion.questionText || motion.title,
        instructions: motion.instructions || "",
        ballotKind: motion.ballotKind || "FavorAgainstAbstain",
        calculationMethod: motion.calculationMethod || "Coefficient",
        decisionRuleCode: motion.decisionRuleCode || "SimpleMajority",
        requiredThresholdPercent: motion.requiredThresholdPercent ?? "",
        defaultResultVisibilityPolicy: motion.defaultResultVisibilityPolicy || "HiddenUntilClose",
        options: (() => {
          try {
            return motion.optionsJson ? JSON.parse(motion.optionsJson) : ["A favor", "En contra", "Abstención"];
          } catch {
            return ["A favor", "En contra", "Abstención"];
          }
        })(),
        isSecret: !!motion.isSecret,
        templateKey: motion.templateKey,
        designStatus: motion.designStatus || "Draft",
        editMode,
        editBlockReason: motionEditBlockReason(motion),
        acceptedBallots: Number(motion.acceptedBallots || motion.AcceptedBallots || 0)
      }
    : { ...defaultVoteDraft(template), editMode: "Full", editBlockReason: "", acceptedBallots: 0 };

  enterEditorMode();
  const titleEl = qs("#editor-title");
  const ledeEl = qs("#editor-lede");
  if (motion) {
    if (titleEl) titleEl.textContent = editMode === "Full" ? "Editar votación" : "Votación protegida";
    if (ledeEl) {
      const code = state.draft.code || "—";
      const status = DESIGN_LABELS[state.draft.designStatus] || motionStatusLabel(motion);
      ledeEl.textContent = `${code} · ${status}`;
    }
  } else {
    if (titleEl) titleEl.textContent = "Nueva votación";
    if (ledeEl) ledeEl.textContent = "Configura la pregunta que se presentará a los participantes.";
  }
  qs("#editor-status").textContent = DESIGN_LABELS[state.draft.designStatus] || "Borrador";
  renderVoteEditor();
  setDirty(false);
  syncStudioUrl();
}

function openSurveyEditor(survey, template) {
  state.mode = "survey";
  state.editingId = survey?.id || null;
  state.draft = survey
    ? {
        agendaItemId: survey.agendaItemId,
        title: survey.title,
        description: survey.description || "",
        questions: (survey.questions || []).map((q) => ({
          questionType: q.questionType,
          title: q.title,
          description: q.description || "",
          optionsJson: q.optionsJson || "[]",
          isRequired: q.isRequired !== false
        }))
      }
    : defaultSurveyDraft(template);

  enterEditorMode();
  const titleEl = qs("#editor-title");
  const ledeEl = qs("#editor-lede");
  if (survey) {
    if (titleEl) titleEl.textContent = "Editar encuesta";
    if (ledeEl) ledeEl.textContent = `${survey.title || "Encuesta"} · ${STATUS_LABELS[survey.status] || "Borrador"}`;
  } else {
    if (titleEl) titleEl.textContent = "Nueva encuesta";
    if (ledeEl) ledeEl.textContent = "Configura las preguntas del formulario.";
  }
  qs("#editor-status").textContent = STATUS_LABELS[survey?.status] || "Borrador";
  renderSurveyEditor();
  setDirty(false);
  syncStudioUrl();
}

function renderVoteEditor() {
  const d = state.draft;
  const locked = (d.editMode || "Full") !== "Full";
  const lockReason =
    d.editBlockReason ||
    (d.editMode === "WithdrawRequired"
      ? "La votación está abierta. Retire la apertura (sin votos) antes de editar campos críticos."
      : d.editMode === "CancelRequired"
        ? "Ya hay votos registrados. Anule y cree una nueva versión para corregir."
        : d.editMode === "Immutable"
          ? "Registro histórico inmutable. No se pueden alterar resultados ni evidencia."
          : "");
  const dis = locked ? "disabled" : "";
  const agendaOptions = state.agenda
    .map((a) => {
      const label = `${repairMojibake(a.code)} — ${repairMojibake(a.title)}`;
      return `<option value="${a.id}" ${a.id === d.agendaItemId ? "selected" : ""} title="${escapeHtml(label)}">${escapeHtml(label)}</option>`;
    })
    .join("");
  const thresholdApplies = d.decisionRuleCode === "QualifiedMajority";
  const options = d.options || [];
  const canRemove = options.length > 2 && !locked;

  const lockBanner = locked
    ? `<div class="studio-lock-banner" role="status" id="editor-lock-banner">
        <strong>Campos protegidos</strong>
        <p>${escapeHtml(lockReason || "Esta votación no admite edición crítica en su estado actual.")}</p>
        <p class="studio-field__hint">Modo: ${escapeHtml(d.editMode || "—")}${d.acceptedBallots ? ` · Votos: ${escapeHtml(String(d.acceptedBallots))}` : ""}</p>
      </div>`
    : "";

  qs("#editor-canvas").innerHTML = `
    ${lockBanner}
    <p class="studio-section-title">Pregunta</p>
    <div class="studio-field studio-field--dominant">
      <div class="studio-field__label"><label for="v-question">Pregunta</label></div>
      <textarea id="v-question" class="studio-field__control" rows="3" placeholder="Ej. ¿Se aprueba el presupuesto de gastos comunes 2026?" ${dis}>${escapeHtml(d.questionText || "")}</textarea>
    </div>
    <div class="studio-field">
      <div class="studio-field__label"><label for="v-title">Título corto</label></div>
      <input id="v-title" class="studio-field__control" value="${escapeHtml(d.title || "")}" placeholder="Nombre breve" ${dis} />
      <p class="studio-field__hint">Se utiliza en listados y resultados.</p>
    </div>
    <div class="studio-field">
      <div class="studio-field__label">
        <label for="v-instructions">Instrucciones</label>
        <span class="optional">Opcional</span>
      </div>
      <textarea id="v-instructions" class="studio-field__control" rows="2" placeholder="Indicaciones para el participante" ${dis}>${escapeHtml(d.instructions || "")}</textarea>
    </div>
    <p class="studio-section-title">Opciones</p>
    <div class="studio-field">
      <div id="v-options" class="studio-options">
        ${(options || [])
          .map(
            (opt, i) => `
          <div class="option-row">
            <input class="option-row__input studio-field__control" data-opt-idx="${i}" value="${escapeHtml(opt)}" aria-label="Opción ${i + 1}" ${dis} />
            <div class="option-row__actions">
              <button type="button" class="btn btn-ghost btn-sm" data-opt-up="${i}" aria-label="Subir opción ${i + 1}" ${i === 0 || locked ? "disabled" : ""}>↑</button>
              <button type="button" class="btn btn-ghost btn-sm" data-opt-down="${i}" aria-label="Bajar opción ${i + 1}" ${i >= options.length - 1 || locked ? "disabled" : ""}>↓</button>
              <button type="button" class="btn btn-ghost btn-sm" data-remove-opt="${i}" aria-label="Quitar opción ${i + 1}" ${!canRemove ? "disabled" : ""}>×</button>
            </div>
          </div>`
          )
          .join("")}
      </div>
      ${locked ? "" : `<button type="button" class="btn btn-ghost btn-sm" id="btn-add-opt">+ Agregar opción</button>`}
    </div>
    <div class="ballot-preview" id="ballot-live" aria-live="polite"></div>
  `;

  // Keep config panel in sync — find where editor-config is set
  const configHost = qs("#editor-config");
  if (configHost) {
    configHost.innerHTML = `
    <p class="studio-section-title">Configuración</p>
    <div class="studio-config-group">
      <h3 class="studio-config-group__title">Contexto</h3>
      <div class="studio-field">
        <div class="studio-field__label"><label for="v-agenda">Punto de agenda</label></div>
        <select id="v-agenda" class="studio-field__control" data-control="select" ${dis}>${agendaOptions || '<option value="">Sin agenda — cree un punto primero</option>'}</select>
      </div>
      <div class="studio-field">
        <div class="studio-field__label"><label for="v-code">Código</label></div>
        <input id="v-code" class="studio-field__control" value="${escapeHtml(d.code || "")}" placeholder="Ej. V-01" ${dis} />
      </div>
    </div>
    <div class="studio-config-group">
      <h3 class="studio-config-group__title">Forma de contabilización</h3>
      <div class="studio-field">
        <div class="studio-field__label"><label for="v-ballot">Tipo de respuesta</label></div>
        <select id="v-ballot" class="studio-field__control" data-control="select" ${dis}>
          <option value="FavorAgainstAbstain">A favor / En contra / Abstención</option>
          <option value="YesNo">Sí / No</option>
          <option value="YesNoAbstain">Sí / No / Abstención</option>
          <option value="SingleChoice">Opción única</option>
          <option value="MultiCandidate">Elección de candidatos</option>
        </select>
      </div>
      <div class="studio-field">
        <div class="studio-field__label"><label for="v-calc">Método</label></div>
        <select id="v-calc" class="studio-field__control" data-control="select" ${dis}>
          <option value="Coefficient">Por coeficiente</option>
          <option value="PerPerson">Por persona</option>
          <option value="PerUnit">Por unidad</option>
        </select>
      </div>
      <div class="studio-field">
        <div class="studio-field__label"><label for="v-rule">Mayoría</label></div>
        <select id="v-rule" class="studio-field__control" data-control="select" ${dis}>
          <option value="SimpleMajority">Mayoría simple</option>
          <option value="QualifiedMajority">Porcentaje requerido</option>
        </select>
      </div>
      <div class="studio-field" id="v-threshold-field" ${thresholdApplies ? "" : "hidden"}>
        <div class="studio-field__label"><label for="v-threshold">Umbral %</label></div>
        <input id="v-threshold" class="studio-field__control" type="number" min="0" max="100" step="0.01" value="${escapeHtml(String(d.requiredThresholdPercent ?? ""))}" ${!thresholdApplies || locked ? "disabled" : ""} />
      </div>
    </div>
    <div class="studio-config-group">
      <h3 class="studio-config-group__title">Privacidad y resultados</h3>
      <div class="studio-field">
        <div class="studio-field__label"><label for="v-vis">Visibilidad del resultado</label></div>
        <select id="v-vis" class="studio-field__control" data-control="select" ${dis}>
          <option value="HiddenUntilClose">Oculto hasta cierre</option>
          <option value="PresidentOnlyLive">Solo mesa en vivo</option>
          <option value="LiveResults">Resultados en vivo</option>
        </select>
      </div>
      <label class="studio-check"><input type="checkbox" id="v-secret" ${d.isSecret ? "checked" : ""} ${dis} /> Voto secreto (operacional)</label>
    </div>
  `;
  }

  const saveBtn = qs("#btn-save-draft");
  const pubBtn = qs("#btn-publish");
  if (saveBtn) {
    saveBtn.disabled = locked;
    saveBtn.hidden = locked;
  }
  if (pubBtn) {
    pubBtn.disabled = locked;
    pubBtn.hidden = locked;
  }

  if (qs("#v-ballot")) qs("#v-ballot").value = d.ballotKind;
  if (qs("#v-calc")) qs("#v-calc").value = d.calculationMethod;
  if (qs("#v-rule")) qs("#v-rule").value = d.decisionRuleCode;
  if (qs("#v-vis")) qs("#v-vis").value = d.defaultResultVisibilityPolicy;

  if (locked) {
    updateBallotLive();
    return;
  }

  const sync = () => {
    readVoteDraftFromDom();
    const rule = qs("#v-rule")?.value;
    const thField = qs("#v-threshold-field");
    const thInput = qs("#v-threshold");
    const applies = rule === "QualifiedMajority";
    if (thInput) thInput.disabled = !applies;
    if (thField) {
      if (applies) thField.removeAttribute("hidden");
      else thField.setAttribute("hidden", "");
    }
    setDirty(true);
    updateBallotLive();
  };
  qs("#editor-canvas").oninput = sync;
  qs("#editor-config").onchange = sync;
  qs("#editor-config").oninput = sync;
  qs("#btn-add-opt").onclick = () => {
    readVoteDraftFromDom();
    state.draft.options.push("Nueva opción");
    setDirty(true);
    renderVoteEditor();
  };
  qs("#editor-canvas").onclick = (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.dataset.removeOpt != null) {
      readVoteDraftFromDom();
      if ((state.draft.options || []).length <= 2) return;
      state.draft.options.splice(Number(t.dataset.removeOpt), 1);
      setDirty(true);
      renderVoteEditor();
      return;
    }
    if (t.dataset.optUp != null) {
      readVoteDraftFromDom();
      const i = Number(t.dataset.optUp);
      if (i <= 0) return;
      const arr = state.draft.options;
      [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
      setDirty(true);
      renderVoteEditor();
      return;
    }
    if (t.dataset.optDown != null) {
      readVoteDraftFromDom();
      const i = Number(t.dataset.optDown);
      const arr = state.draft.options;
      if (i >= arr.length - 1) return;
      [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
      setDirty(true);
      renderVoteEditor();
    }
  };
  updateBallotLive();
}

function readVoteDraftFromDom() {
  const d = state.draft;
  d.questionText = qs("#v-question")?.value || "";
  d.title = qs("#v-title")?.value || d.questionText;
  d.body = d.questionText || d.title;
  d.instructions = qs("#v-instructions")?.value || "";
  d.agendaItemId = qs("#v-agenda")?.value || "";
  d.code = qs("#v-code")?.value || "";
  d.ballotKind = qs("#v-ballot")?.value || "FavorAgainstAbstain";
  d.calculationMethod = qs("#v-calc")?.value || "Coefficient";
  d.decisionRuleCode = qs("#v-rule")?.value || "SimpleMajority";
  const th = qs("#v-threshold")?.value;
  d.requiredThresholdPercent = th === "" || th == null ? null : Number(th);
  d.defaultResultVisibilityPolicy = qs("#v-vis")?.value || "HiddenUntilClose";
  d.isSecret = !!qs("#v-secret")?.checked;
  d.options = [...qs("#editor-canvas").querySelectorAll("[data-opt]")].map((el) => el.value.trim()).filter(Boolean);
}

function updateBallotLive() {
  const d = state.draft;
  const choices = choicesForBallot(d.ballotKind, d.options);
  const live = qs("#ballot-live");
  if (!live) return;
  live.innerHTML = `
    <p class="command-eyebrow">Vista participante</p>
    <p><strong>${escapeHtml(d.questionText || d.title || "Pregunta")}</strong></p>
    <p class="muted">Método: ${escapeHtml(calculationMethodLabel(d.calculationMethod))}${
      d.decisionRuleCode === "QualifiedMajority" && d.requiredThresholdPercent != null
        ? ` · Umbral ${escapeHtml(String(d.requiredThresholdPercent))}%`
        : ""
    }</p>
    ${choices.map((c) => `<button type="button" class="choice" disabled>${escapeHtml(c)}</button>`).join("")}
  `;
}

function renderSurveyEditor() {
  const d = state.draft;
  const agendaOptions = state.agenda
    .map((a) => {
      const label = `${repairMojibake(a.code)} — ${repairMojibake(a.title)}`;
      return `<option value="${a.id}" ${a.id === d.agendaItemId ? "selected" : ""} title="${escapeHtml(label)}">${escapeHtml(label)}</option>`;
    })
    .join("");

  qs("#editor-canvas").innerHTML = `
    <p class="studio-section-title">Contenido</p>
    <div class="studio-field">
      <div class="studio-field__label"><label for="s-title">Título</label></div>
      <input id="s-title" class="studio-field__control" value="${escapeHtml(d.title || "")}" />
    </div>
    <div class="studio-field">
      <div class="studio-field__label">
        <label for="s-desc">Descripción</label>
        <span class="optional">Opcional</span>
      </div>
      <textarea id="s-desc" class="studio-field__control" rows="2">${escapeHtml(d.description || "")}</textarea>
    </div>
    <div id="s-questions">${(d.questions || [])
      .map(
        (q, i) => `
      <div class="studio-card" data-q="${i}">
        <div class="studio-field">
          <div class="studio-field__label"><label>Pregunta ${i + 1}</label></div>
          <input class="studio-field__control" data-q-title="${i}" value="${escapeHtml(q.title || "")}" />
        </div>
        <div class="studio-field">
          <div class="studio-field__label"><label>Tipo</label></div>
          <select class="studio-field__control" data-control="select" data-q-type="${i}">
            <option value="SingleChoice">Opción única</option>
            <option value="MultipleChoice">Selección múltiple</option>
            <option value="Scale">Escala</option>
            <option value="OpenText">Texto abierto</option>
          </select>
        </div>
        <div class="studio-field">
          <div class="studio-field__label"><label>Opciones (JSON array)</label></div>
          <input class="studio-field__control" data-q-opts="${i}" value="${escapeHtml(q.optionsJson || "[]")}" />
        </div>
        <label class="studio-check"><input type="checkbox" data-q-req="${i}" ${q.isRequired !== false ? "checked" : ""} /> Obligatoria</label>
        <button type="button" class="btn btn-ghost studio-add-opt" data-q-remove="${i}">Eliminar pregunta</button>
      </div>`
      )
      .join("")}</div>
    <button type="button" class="btn btn-ghost studio-add-opt" id="btn-add-q">+ Pregunta</button>
  `;

  qs("#editor-config").innerHTML = `
    <p class="studio-section-title">Configuración</p>
    <div class="studio-config-group">
      <h3 class="studio-config-group__title">Contexto</h3>
      <div class="studio-field">
        <div class="studio-field__label"><label for="s-agenda">Punto de agenda</label><span class="optional">Opcional</span></div>
        <select id="s-agenda" class="studio-field__control" data-control="select"><option value="">—</option>${agendaOptions}</select>
      </div>
      <p class="studio-field__hint">Las encuestas no generan Decision formal ni usan Voting Rule Engine.</p>
    </div>
  `;

  (d.questions || []).forEach((q, i) => {
    const sel = qs(`#editor-canvas [data-q-type="${i}"]`);
    if (sel) sel.value = q.questionType || "SingleChoice";
  });
  if (d.agendaItemId) qs("#s-agenda").value = d.agendaItemId;

  const markSurveyDirty = () => {
    readSurveyDraftFromDom();
    setDirty(true);
  };
  qs("#editor-canvas").oninput = markSurveyDirty;
  qs("#editor-canvas").onchange = markSurveyDirty;
  qs("#editor-config").onchange = markSurveyDirty;

  qs("#btn-add-q").onclick = () => {
    readSurveyDraftFromDom();
    state.draft.questions.push({
      questionType: "SingleChoice",
      title: "Nueva pregunta",
      optionsJson: '["Opción A","Opción B"]',
      isRequired: true
    });
    setDirty(true);
    renderSurveyEditor();
  };
  qs("#editor-canvas").onclick = (e) => {
    const t = e.target;
    if (t instanceof HTMLElement && t.dataset.qRemove != null) {
      readSurveyDraftFromDom();
      state.draft.questions.splice(Number(t.dataset.qRemove), 1);
      setDirty(true);
      renderSurveyEditor();
    }
  };
}

function readSurveyDraftFromDom() {
  const d = state.draft;
  d.title = qs("#s-title")?.value || "";
  d.description = qs("#s-desc")?.value || "";
  d.agendaItemId = qs("#s-agenda")?.value || null;
  d.questions = [...qs("#editor-canvas").querySelectorAll("[data-q]")].map((card) => {
    const i = card.dataset.q;
    return {
      questionType: qs(`#editor-canvas [data-q-type="${i}"]`)?.value || "SingleChoice",
      title: qs(`#editor-canvas [data-q-title="${i}"]`)?.value || "",
      optionsJson: qs(`#editor-canvas [data-q-opts="${i}"]`)?.value || "[]",
      isRequired: !!qs(`#editor-canvas [data-q-req="${i}"]`)?.checked
    };
  });
}

async function saveDraft({ returnToList = true } = {}) {
  if (state.mode === "vote") {
    readVoteDraftFromDom();
    const d = state.draft;
    if (!d.agendaItemId) {
      showError("Seleccione o cree un punto de agenda.");
      return false;
    }
    const body = {
      agendaItemId: d.agendaItemId,
      code: d.code,
      title: d.title,
      body: d.body || d.questionText,
      questionText: d.questionText,
      instructions: d.instructions,
      ballotKind: d.ballotKind,
      calculationMethod: d.calculationMethod,
      decisionRuleCode: d.decisionRuleCode,
      requiredThresholdPercent:
        d.decisionRuleCode === "QualifiedMajority" ? Number(d.requiredThresholdPercent || 66.67) : null,
      defaultResultVisibilityPolicy: d.defaultResultVisibilityPolicy,
      optionsJson: JSON.stringify(d.options || []),
      isSecret: !!d.isSecret,
      templateKey: d.templateKey
    };
    showLoader("Guardando borrador…");
    try {
      if (state.editingId) {
        await api(`/api/assemblies/${assemblyId}/motions/${state.editingId}`, { method: "PUT", body });
      } else {
        const created = await api(`/api/assemblies/${assemblyId}/motions`, { method: "POST", body });
        state.editingId = created.id;
      }
      setDirty(false);
      await refresh();
      showToast("Borrador guardado", "success");
      if (returnToList) enterListMode({ keepFilters: true });
      return true;
    } catch (err) {
      showError(err.message);
      return false;
    } finally {
      hideLoader();
    }
  }

  if (state.mode === "survey") {
    readSurveyDraftFromDom();
    const d = state.draft;
    const body = {
      title: d.title,
      description: d.description,
      agendaItemId: d.agendaItemId || null,
      questions: d.questions
    };
    showLoader("Guardando formulario…");
    try {
      if (state.editingId) {
        await api(`/api/assemblies/${assemblyId}/surveys/${state.editingId}`, { method: "PUT", body });
      } else {
        const created = await api(`/api/assemblies/${assemblyId}/surveys`, { method: "POST", body });
        state.editingId = created.id;
      }
      setDirty(false);
      await refresh();
      showToast("Formulario guardado", "success");
      if (returnToList) enterListMode({ keepFilters: true });
      return true;
    } catch (err) {
      showError(err.message);
      return false;
    } finally {
      hideLoader();
    }
  }
  return false;
}

async function publishCurrent() {
  const saved = await saveDraft({ returnToList: false });
  if (!saved || !state.editingId) return;
  showLoader("Publicando…");
  try {
    if (state.mode === "vote") {
      await api(`/api/assemblies/${assemblyId}/motions/${state.editingId}/publish`, { method: "POST" });
    } else {
      await api(`/api/assemblies/${assemblyId}/surveys/${state.editingId}/publish`, { method: "POST" });
    }
    setDirty(false);
    await refresh();
    showToast("Publicado", "success");
    enterListMode({ keepFilters: true });
  } catch (err) {
    showError(err.message);
  } finally {
    hideLoader();
  }
}

function showPreview() {
  const frame = qs("#preview-frame");
  if (!frame) return;

  if (state.mode === "vote") {
    readVoteDraftFromDom();
    const d = state.draft;
    const choices = choicesForBallot(d.ballotKind, d.options);
    const methodHint =
      d.decisionRuleCode === "QualifiedMajority" && d.requiredThresholdPercent != null
        ? `Umbral requerido: ${d.requiredThresholdPercent}%`
        : "";
    frame.innerHTML = wrapParticipantPreview({
      title: d.questionText || d.title || "Votación",
      methodLabel: calculationMethodLabel(d.calculationMethod),
      methodHint,
      choicesHtml: renderPreviewChoiceButtons(choices),
      choicesCount: choices.length
    });
    bindPreviewChoiceInteraction(frame);
  } else {
    readSurveyDraftFromDom();
    const d = state.draft;
    const bodyHtml = `
      ${d.description ? `<p class="preview-survey-desc">${escapeHtml(d.description)}</p>` : ""}
      <div class="preview-survey-list">
        ${(d.questions || [])
          .map(
            (q, i) => `
          <div class="preview-survey-item">
            <strong>${i + 1}. ${escapeHtml(q.title || "Pregunta")}</strong>
            <span>${escapeHtml(q.questionType || "")}</span>
          </div>`
          )
          .join("")}
      </div>`;
    frame.innerHTML = wrapParticipantPreview({
      title: d.title || "Formulario",
      methodLabel: null,
      bodyHtml
    });
  }

  const dialog = qs("#preview-dialog");
  if (!dialog) return;
  dialog.showModal();
  qs(".preview-devices button.is-active")?.focus();
}

async function ensureAgendaItem() {
  if (state.agenda.length) return state.agenda[0];
  const created = await api(`/api/assemblies/${assemblyId}/agenda`, {
    method: "POST",
    body: { ordinal: 1, code: "A01", title: "Punto principal" }
  });
  state.agenda = created.items || [];
  return state.agenda[0];
}

async function refresh() {
  const [agenda, motions, surveys, assembly] = await Promise.all([
    api(`/api/assemblies/${assemblyId}/agenda`),
    api(`/api/assemblies/${assemblyId}/motions`),
    api(`/api/assemblies/${assemblyId}/surveys`).catch(() => []),
    api(`/api/assemblies/${assemblyId}`)
  ]);
  state.agenda = agenda.items || [];
  state.motions = Array.isArray(motions) ? motions : [];
  state.surveys = Array.isArray(surveys) ? surveys : [];
  qs("#assembly-label").textContent = `${repairMojibake(assembly?.title || "Asamblea")}${assembly?.status ? ` · ${statusLabelEs(assembly.status)}` : ""}`;
  renderLists();
}

function softenRoleChip() {
  const roleChip = qs("#ia-role-chip");
  const userChip = qs("#user-chip");
  if (!roleChip || !userChip) return;
  const roleVisible = !roleChip.hidden && roleChip.offsetParent !== null;
  const userVisible = !userChip.hidden && userChip.offsetParent !== null;
  if (!roleVisible || !userVisible) return;
  roleChip.classList.remove("badge-live", "badge", "badge-muted");
  roleChip.classList.add("ia-role-chip");
  roleChip.title = "Rol operativo en esta asamblea";
}

async function openDeepLinkEditor() {
  try {
    const url = new URL(location.href);
    if (url.searchParams.get("view") !== "edit") return;
    const motionId = url.searchParams.get("motionId");
    if (!motionId) return;
    const motion = state.motions.find((m) => String(m.id) === String(motionId));
    if (motion) openVoteEditor(motion);
  } catch {
    /* soft */
  }
}

async function init() {
  renderTabs();

  const ctx = await bootIaPage({ current: "asm-voting", pageLabel: "Votaciones" });
  if (!ctx) return;

  state.user = ctx.user;
  assemblyId = assemblyId || ctx.assemblyId || readIaContext().assemblyId;
  softenRoleChip();

  if (!assemblyId) {
    const phId = ctx.phId || readIaContext().phId;
    showError("Seleccione una asamblea desde el listado del PH.");
    qs("#assembly-label").innerHTML = phId
      ? `<a href="${phHref(phId, "assemblies")}">Ir a asambleas del PH</a>`
      : `<a href="/ph.html">Ir a propiedades</a>`;
    return;
  }

  if (!hasPermission(state.user, "motion:create") && !hasPermission(state.user, "agenda:manage")) {
    showError("No tiene permiso para diseñar votaciones.");
  }

  import("./ph-context.js")
    .then(({ setDirtyGuard }) => {
      setDirtyGuard(() =>
        state.dirty
          ? { dirty: true, message: "Hay cambios sin guardar en el editor de votaciones." }
          : false
      );
    })
    .catch(() => {});

  qs("#btn-create")?.addEventListener("click", () => createNewVote());
  qs("#btn-create-survey")?.addEventListener("click", async () => {
    try {
      await ensureAgendaItem();
      openSurveyEditor(null, TEMPLATES.find((t) => t.isSurvey));
    } catch (err) {
      showError(err.message);
    }
  });
  qs("#btn-open-templates")?.addEventListener("click", () => showTemplatesTab());
  qs("#btn-import-motions")?.addEventListener("click", () => {
    if (!hasPermission(state.user, "motion:create")) {
      showError("No tiene permiso para importar preguntas.");
      return;
    }
    openMotionImportWizard({
      assemblyId,
      onImported: async () => {
        await refresh();
        enterListMode({ keepFilters: true });
      }
    });
  });
  qs("#btn-bulk-publish")?.addEventListener("click", async () => {
    const ids = [...document.querySelectorAll("#list-votes [data-bulk-id]:checked")].map(
      (el) => el.getAttribute("data-bulk-id")
    );
    if (!ids.length) {
      showToast("Seleccione borradores en la lista", "info");
      return;
    }
    const ok = await confirmDialog({
      title: "Publicar seleccionadas",
      body: `Preguntas seleccionadas: ${ids.length}. Solo se publicaran las que cumplan las reglas actuales.`,
      confirmLabel: "Publicar",
      cancelLabel: "Cancelar"
    });
    if (!ok) return;
    try {
      const result = await api(`/api/assemblies/${assemblyId}/motions/bulk-publish`, {
        method: "POST",
        body: { motionIds: ids }
      });
      showToast(
        `Se actualizaron ${result.updated}. No se pudieron modificar: ${result.skipped}.`,
        result.skipped ? "info" : "success"
      );
      await refresh();
    } catch (err) {
      showToast(err.message || "Error", "error");
    }
  });

  document.querySelectorAll("#vote-filters button").forEach((btn) => {
    btn.addEventListener("click", () => {
      voteFilter = btn.dataset.filter || "all";
      document.querySelectorAll("#vote-filters button").forEach((b) =>
        b.setAttribute("aria-pressed", b === btn ? "true" : "false")
      );
      renderLists();
    });
  });
  qs("#vote-search")?.addEventListener("input", (e) => {
    voteSearch = e.target.value || "";
    const clearBtn = qs("#btn-clear-search");
    if (clearBtn) clearBtn.hidden = !voteSearch;
    renderLists();
  });
  qs("#btn-clear-search")?.addEventListener("click", () => {
    voteSearch = "";
    const search = qs("#vote-search");
    if (search) search.value = "";
    const clearBtn = qs("#btn-clear-search");
    if (clearBtn) clearBtn.hidden = true;
    renderLists();
  });

  qs("#btn-editor-back")?.addEventListener("click", () => closeEditor());
  qs("#btn-cancel-editor")?.addEventListener("click", () => closeEditor());
  qs("#btn-save-draft").onclick = () => saveDraft({ returnToList: true });
  qs("#btn-publish").onclick = () => publishCurrent();
  qs("#btn-preview").onclick = () => showPreview();
  qs("#btn-preview-close")?.addEventListener("click", () => closePreviewDialog());
  qs("#btn-preview-dismiss")?.addEventListener("click", () => closePreviewDialog());

  const previewDialog = qs("#preview-dialog");
  previewDialog?.addEventListener("click", (e) => {
    if (e.target === previewDialog) closePreviewDialog();
  });

  document.querySelectorAll(".preview-devices button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".preview-devices button").forEach((b) => {
        b.classList.remove("is-active");
        b.setAttribute("aria-pressed", "false");
      });
      btn.classList.add("is-active");
      btn.setAttribute("aria-pressed", "true");
      const frame = qs("#preview-frame");
      if (!frame) return;
      frame.classList.remove("is-desktop", "is-tablet", "is-mobile");
      frame.classList.add(`is-${btn.dataset.device || "desktop"}`);
    });
  });

  document.querySelectorAll(".studio-tab-link[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabBtn = qs(`.studio-tab[data-tab="${btn.dataset.tab}"]`);
      tabBtn?.click();
    });
  });

  enterListMode({ keepFilters: true });

  showLoader("Cargando votaciones…");
  try {
    await refresh();
    await openDeepLinkEditor();
  } catch (err) {
    qs("#assembly-label").textContent = "No pudimos cargar esta asamblea.";
    showError(err.message);
  } finally {
    hideLoader();
  }

  if (isReadinessReturnContext()) {
    mountReadinessActionBar({
      assemblyId,
      hint: "Estás completando la preparación de esta asamblea — Votaciones."
    });
  }
}

init();
