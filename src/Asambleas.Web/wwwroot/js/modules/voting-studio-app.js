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
  draft: null
};

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
    rows = rows.filter((m) => (m.title || "").toLowerCase().includes(q));
  }
  return rows;
}

function renderLists() {
  const votes = qs("#list-votes");
  const rows = filteredMotions();

  if (!state.motions.length) {
    votes.innerHTML = `
      <div class="ia-empty-state">
        <p>Todavía no has preparado votaciones.</p>
        <p>Crea las decisiones que serán sometidas a los propietarios durante la Asamblea.</p>
        <button type="button" class="btn btn-primary" id="btn-empty-create">Crear primera votación</button>
        <p style="margin-top:1rem;font-size:0.875rem">También puedes <button type="button" class="btn btn-ghost" id="btn-empty-templates">usar una plantilla</button></p>
      </div>`;
    qs("#btn-empty-create")?.addEventListener("click", () => openCreateDialog());
    qs("#btn-empty-templates")?.addEventListener("click", () => showTemplatesTab());
  } else if (!rows.length) {
    votes.innerHTML = `<div class="ia-empty-state"><p>No hay votaciones en este filtro.</p></div>`;
  } else {
    votes.innerHTML = `
      <table class="ia-data-table" aria-label="Votaciones">
        <thead>
          <tr>
            <th>Título</th>
            <th>Estado</th>
            <th>Participación</th>
            <th class="col-actions">Acción</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((m) => {
              const action =
                motionBucket(m) === "closed"
                  ? `<button type="button" class="btn btn-secondary btn-sm" data-results-vote="${m.id}">Resultados</button>`
                  : motionBucket(m) === "live"
                    ? `<a class="btn btn-primary btn-sm" href="/lobby.html?assemblyId=${encodeURIComponent(assemblyId)}">Abrir</a>`
                    : `<button type="button" class="btn btn-secondary btn-sm" data-edit-vote="${m.id}">Editar</button>`;
              return `
            <tr>
              <td data-label="Título"><strong>${escapeHtml(m.title)}</strong></td>
              <td data-label="Estado"><span class="ia-badge-status">${escapeHtml(motionStatusLabel(m))}</span></td>
              <td data-label="Participación" class="muted">—</td>
              <td data-label="Acción" class="col-actions">${action}</td>
            </tr>`;
            })
            .join("")}
        </tbody>
      </table>`;
  }

  const surveys = qs("#list-surveys");
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

  qs("#list-templates").innerHTML = `<div class="template-grid">${TEMPLATES.map(
    (t) => `
    <article class="studio-card">
      <h3>${escapeHtml(t.title)}</h3>
      <p class="muted">${t.isSurvey ? "Encuesta" : "Votación formal"}</p>
      <button type="button" class="btn btn-primary" data-template="${escapeHtml(t.key)}">Usar plantilla</button>
    </article>`
  ).join("")}</div>`;

  bindListActions();
  qs("#voting-layout")?.classList.toggle("has-editor", !qs("#editor-panel")?.hidden);
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
    if (t.dataset.editVote) {
      const m = state.motions.find((x) => x.id === t.dataset.editVote);
      if (m) openVoteEditor(m);
    }
    if (t.dataset.dupVote) {
      showLoader("Duplicando votación…");
      try {
        await api(`/api/assemblies/${assemblyId}/motions/${t.dataset.dupVote}/duplicate`, { method: "POST" });
        await refresh();
        showToast("Votación duplicada", "success");
      } catch (err) {
        showError(err.message);
      } finally {
        hideLoader();
      }
    }
    if (t.dataset.publishVote) {
      showLoader("Publicando votación…");
      try {
        await api(`/api/assemblies/${assemblyId}/motions/${t.dataset.publishVote}/publish`, { method: "POST" });
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
    if (t.dataset.editSurvey) {
      const s = state.surveys.find((x) => x.id === t.dataset.editSurvey);
      if (s) openSurveyEditor(s);
    }
    if (t.dataset.publishSurvey) {
      showLoader("Publicando formulario…");
      try {
        await api(`/api/assemblies/${assemblyId}/surveys/${t.dataset.publishSurvey}/publish`, { method: "POST" });
        await refresh();
        showToast("Formulario publicado", "success");
      } catch (err) {
        showError(err.message);
      } finally {
        hideLoader();
      }
    }
    if (t.dataset.resultsSurvey) {
      try {
        const results = await api(`/api/assemblies/${assemblyId}/surveys/${t.dataset.resultsSurvey}/results`);
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

function openVoteEditor(motion, template) {
  state.mode = "vote";
  state.editingId = motion?.id || null;
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
        designStatus: motion.designStatus || "Draft"
      }
    : defaultVoteDraft(template);

  qs("#editor-panel").hidden = false;
  qs("#editor-title").textContent = motion ? "Editar votación" : "Crear votación";
  qs("#editor-status").textContent = DESIGN_LABELS[state.draft.designStatus] || "Borrador";
  qs("#voting-layout")?.classList.add("has-editor");
  renderVoteEditor();
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

  qs("#editor-panel").hidden = false;
  qs("#editor-title").textContent = survey ? "Editar encuesta" : "Crear encuesta";
  qs("#editor-status").textContent = STATUS_LABELS[survey?.status] || "Borrador";
  qs("#voting-layout")?.classList.add("has-editor");
  renderSurveyEditor();
}

function renderVoteEditor() {
  const d = state.draft;
  const agendaOptions = state.agenda
    .map((a) => `<option value="${a.id}" ${a.id === d.agendaItemId ? "selected" : ""}>${escapeHtml(a.code)} — ${escapeHtml(a.title)}</option>`)
    .join("");

  qs("#editor-canvas").innerHTML = `
    <label for="v-question">Pregunta</label>
    <textarea id="v-question" rows="3">${escapeHtml(d.questionText || "")}</textarea>
    <label for="v-title">Título corto</label>
    <input id="v-title" value="${escapeHtml(d.title || "")}" />
    <label for="v-instructions">Instrucciones</label>
    <textarea id="v-instructions" rows="2">${escapeHtml(d.instructions || "")}</textarea>
    <label>Opciones</label>
    <div id="v-options">${(d.options || [])
      .map(
        (o, i) => `
      <div class="option-row">
        <input data-opt="${i}" value="${escapeHtml(o)}" />
        <button type="button" class="btn btn-ghost" data-remove-opt="${i}" aria-label="Eliminar">✕</button>
      </div>`
      )
      .join("")}</div>
    <button type="button" class="btn btn-secondary" id="btn-add-opt">+ Agregar opción</button>
    <div class="ballot-preview" id="ballot-live"></div>
  `;

  qs("#editor-config").innerHTML = `
    <label for="v-agenda">Punto de agenda</label>
    <select id="v-agenda">${agendaOptions || '<option value="">Sin agenda — cree un punto primero</option>'}</select>
    <label for="v-code">Código</label>
    <input id="v-code" value="${escapeHtml(d.code || "")}" />
    <label for="v-ballot">Tipo de respuesta</label>
    <select id="v-ballot">
      <option value="FavorAgainstAbstain">A favor / En contra / Abstención</option>
      <option value="YesNo">Sí / No</option>
      <option value="YesNoAbstain">Sí / No / Abstención</option>
      <option value="SingleChoice">Opción única</option>
      <option value="MultiCandidate">Elección de candidatos</option>
    </select>
    <label for="v-calc">Método</label>
    <select id="v-calc">
      <option value="Coefficient">Por coeficiente</option>
      <option value="PerPerson">Por persona</option>
      <option value="PerUnit">Por unidad</option>
    </select>
    <label for="v-rule">Mayoría</label>
    <select id="v-rule">
      <option value="SimpleMajority">Mayoría simple</option>
      <option value="QualifiedMajority">Porcentaje requerido</option>
    </select>
    <label for="v-threshold">Umbral %</label>
    <input id="v-threshold" type="number" min="0" max="100" step="0.01" value="${escapeHtml(String(d.requiredThresholdPercent ?? ""))}" />
    <label for="v-vis">Resultado</label>
    <select id="v-vis">
      <option value="HiddenUntilClose">Oculto hasta cierre</option>
      <option value="PresidentOnlyLive">Solo mesa en vivo</option>
      <option value="LiveResults">Resultados en vivo</option>
    </select>
    <label><input type="checkbox" id="v-secret" ${d.isSecret ? "checked" : ""} /> Voto secreto (operacional)</label>
  `;

  qs("#v-ballot").value = d.ballotKind;
  qs("#v-calc").value = d.calculationMethod;
  qs("#v-rule").value = d.decisionRuleCode;
  qs("#v-vis").value = d.defaultResultVisibilityPolicy;

  const sync = () => {
    readVoteDraftFromDom();
    updateBallotLive();
  };
  qs("#editor-canvas").oninput = sync;
  qs("#editor-config").onchange = sync;
  qs("#btn-add-opt").onclick = () => {
    state.draft.options.push("Nueva opción");
    renderVoteEditor();
  };
  qs("#editor-canvas").onclick = (e) => {
    const t = e.target;
    if (t instanceof HTMLElement && t.dataset.removeOpt != null) {
      state.draft.options.splice(Number(t.dataset.removeOpt), 1);
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
    <p class="muted">Método: ${escapeHtml(d.calculationMethod)}${
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
    .map((a) => `<option value="${a.id}" ${a.id === d.agendaItemId ? "selected" : ""}>${escapeHtml(a.code)} — ${escapeHtml(a.title)}</option>`)
    .join("");

  qs("#editor-canvas").innerHTML = `
    <label for="s-title">Título</label>
    <input id="s-title" value="${escapeHtml(d.title || "")}" />
    <label for="s-desc">Descripción</label>
    <textarea id="s-desc" rows="2">${escapeHtml(d.description || "")}</textarea>
    <div id="s-questions">${(d.questions || [])
      .map(
        (q, i) => `
      <div class="studio-card" data-q="${i}">
        <label>Pregunta ${i + 1}</label>
        <input data-q-title="${i}" value="${escapeHtml(q.title || "")}" />
        <label>Tipo</label>
        <select data-q-type="${i}">
          <option value="SingleChoice">Opción única</option>
          <option value="MultipleChoice">Selección múltiple</option>
          <option value="Scale">Escala</option>
          <option value="OpenText">Texto abierto</option>
        </select>
        <label>Opciones (JSON array)</label>
        <input data-q-opts="${i}" value="${escapeHtml(q.optionsJson || "[]")}" />
        <label><input type="checkbox" data-q-req="${i}" ${q.isRequired !== false ? "checked" : ""} /> Obligatoria</label>
        <button type="button" class="btn btn-ghost" data-q-remove="${i}">Eliminar pregunta</button>
      </div>`
      )
      .join("")}</div>
    <button type="button" class="btn btn-secondary" id="btn-add-q">+ Pregunta</button>
  `;

  qs("#editor-config").innerHTML = `
    <label for="s-agenda">Punto de agenda (opcional)</label>
    <select id="s-agenda"><option value="">—</option>${agendaOptions}</select>
    <p class="muted">Las encuestas no generan Decision formal ni usan Voting Rule Engine.</p>
  `;

  (d.questions || []).forEach((q, i) => {
    const sel = qs(`#editor-canvas [data-q-type="${i}"]`);
    if (sel) sel.value = q.questionType || "SingleChoice";
  });
  if (d.agendaItemId) qs("#s-agenda").value = d.agendaItemId;

  qs("#btn-add-q").onclick = () => {
    readSurveyDraftFromDom();
    state.draft.questions.push({
      questionType: "SingleChoice",
      title: "Nueva pregunta",
      optionsJson: '["Opción A","Opción B"]',
      isRequired: true
    });
    renderSurveyEditor();
  };
  qs("#editor-canvas").onclick = (e) => {
    const t = e.target;
    if (t instanceof HTMLElement && t.dataset.qRemove != null) {
      readSurveyDraftFromDom();
      state.draft.questions.splice(Number(t.dataset.qRemove), 1);
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

async function saveDraft() {
  if (state.mode === "vote") {
    readVoteDraftFromDom();
    const d = state.draft;
    if (!d.agendaItemId) {
      showError("Seleccione o cree un punto de agenda.");
      return;
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
      await refresh();
      showToast("Borrador guardado", "success");
    } catch (err) {
      showError(err.message);
    } finally {
      hideLoader();
    }
    return;
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
      await refresh();
      showToast("Formulario guardado", "success");
    } catch (err) {
      showError(err.message);
    } finally {
      hideLoader();
    }
  }
}

async function publishCurrent() {
  await saveDraft();
  if (!state.editingId) return;
  showLoader("Publicando…");
  try {
    if (state.mode === "vote") {
      await api(`/api/assemblies/${assemblyId}/motions/${state.editingId}/publish`, { method: "POST" });
    } else {
      await api(`/api/assemblies/${assemblyId}/surveys/${state.editingId}/publish`, { method: "POST" });
    }
    await refresh();
    showToast("Publicado", "success");
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
  qs("#assembly-label").textContent = `${assembly?.title || "Asamblea"}${assembly?.status ? ` · ${statusLabelEs(assembly.status)}` : ""}`;
  renderLists();
}

async function init() {
  renderTabs();

  const ctx = await bootIaPage({ current: "asm-voting", pageLabel: "Votaciones" });
  if (!ctx) return;

  state.user = ctx.user;
  assemblyId = assemblyId || ctx.assemblyId || readIaContext().assemblyId;

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

  qs("#btn-create")?.addEventListener("click", () => openCreateDialog());
  qs("#btn-open-templates")?.addEventListener("click", () => showTemplatesTab());

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
    renderLists();
  });

  qs("#btn-save-draft").onclick = () => saveDraft();
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

  showLoader("Cargando votaciones…");
  try {
    await refresh();
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
