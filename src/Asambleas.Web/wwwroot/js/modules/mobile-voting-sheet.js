/**
 * Premium mobile full-screen voting sheet for owners.
 * Server remains authoritative; SignalR only signals refresh.
 * Does not disconnect LiveKit or use window.confirm/alert.
 */
import { castVote, getMyVoteStatus } from "./voting.js";
import { t } from "../i18n/i18n.js";
import { escapeHtml } from "./ui.js";

const CHOICES = ["InFavor", "Against", "Abstention"];
const CHOICE_ICON = { InFavor: "✓", Against: "✕", Abstention: "–" };
const STORAGE_PREFIX = "asambleas.voteSheet.";

function choiceLabel(choice) {
  if (choice === "InFavor") return t("voting.inFavor");
  if (choice === "Against") return t("voting.against");
  if (choice === "Abstention") return t("voting.abstention");
  return choice;
}

function shortReceipt(evidenceId) {
  if (!evidenceId) return "—";
  const compact = String(evidenceId).replace(/-/g, "").toUpperCase();
  return `VT-${compact.slice(0, 6)}`;
}

function loadDraft(sessionId) {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_PREFIX + sessionId) || "null");
  } catch {
    return null;
  }
}

function saveDraft(sessionId, draft) {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + sessionId, JSON.stringify(draft));
  } catch {
    /* ignore quota */
  }
}

function clearDraft(sessionId) {
  try {
    sessionStorage.removeItem(STORAGE_PREFIX + sessionId);
  } catch {
    /* ignore */
  }
}

function isCompactViewport() {
  return window.matchMedia("(max-width: 900px), (pointer: coarse)").matches;
}

function mapCastError(error) {
  const code = String(error?.code || error?.message || "").toUpperCase();
  const status = error?.status;
  if (code.includes("ALREADY_VOTED") || status === 409) {
    return t("voting.alreadyVoted") || "Ya registró su voto en esta votación.";
  }
  if (code.includes("CLOSED") || code.includes("VOTING_CLOSED")) {
    return t("mvote.closedBeforeCast") || "La votación fue cerrada antes de registrar su voto.";
  }
  if (code.includes("NOT_ELIGIBLE") || code.includes("NOT_ACCREDITED") || status === 403) {
    return t("voting.notEligible") || "No está habilitado para votar en esta ronda.";
  }
  if (code.includes("FAILED TO FETCH") || code.includes("NETWORK")) {
    return (
      t("mvote.networkUncertain") ||
      "No pudimos confirmar su voto todavía. Conservaremos esta pantalla mientras restablecemos la conexión."
    );
  }
  return error?.message || t("voting.castFailed") || "No se pudo registrar el voto.";
}

/**
 * @param {{
 *   assemblyId: string,
 *   getState: () => ({
 *     session: object|null,
 *     motion: object|null,
 *     myVote: object|null,
 *     myVoteStatus: object|null,
 *     viewerRole: string,
 *     user: object|null
 *   }),
 *   canCastPermission: () => boolean,
 *   onReceipt: (receipt: object) => void,
 *   onStateChange?: (phase: string) => void,
 *   debug?: boolean
 * }} options
 */
export function createMobileVotingController(options) {
  const {
    assemblyId,
    getState,
    canCastPermission,
    onReceipt,
    onStateChange,
    debug = false
  } = options;

  let phase = "idle"; // idle|full|minimized|confirm|submitting|receipt|closed|ineligible|error
  let selected = null;
  let clientRequestId = null;
  let lastAlertedSessionId = null;
  let focusReturnEl = null;
  let submitting = false;
  let destroyed = false;

  const overlay = ensureOverlay();
  const banner = ensureBanner();

  function log(event, payload = {}) {
    if (!debug && localStorage.getItem("asambleasVoteDebug") !== "1") return;
    console.info("[asambleas-vote]", {
      event,
      assemblyId,
      phase,
      ...payload
    });
  }

  function setPhase(next) {
    phase = next;
    onStateChange?.(phase);
    document.documentElement.dataset.mobileVoting = phase;
  }

  function ensureOverlay() {
    let el = document.getElementById("mobile-voting-overlay");
    if (el) return el;
    el = document.createElement("div");
    el.id = "mobile-voting-overlay";
    el.className = "mvo";
    el.hidden = true;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-labelledby", "mvo-title");
    el.innerHTML = `
      <div class="mvo__sheet" data-mvo-sheet>
        <header class="mvo__header">
          <div class="mvo__header-text">
            <p class="mvo__kicker" id="mvo-kicker"></p>
            <h2 class="mvo__title" id="mvo-title" tabindex="-1"></h2>
            <p class="mvo__timer" id="mvo-timer" hidden></p>
          </div>
          <button type="button" class="mvo__minimize btn btn-ghost" data-mvo-minimize>
            ${escapeHtml(t("mvote.consultAssembly") || "Consultar asamblea")}
          </button>
        </header>
        <div class="mvo__body" id="mvo-body"></div>
        <footer class="mvo__footer" id="mvo-footer" hidden></footer>
        <div class="mvo__live" aria-live="polite" aria-atomic="true" id="mvo-live"></div>
      </div>`;
    document.body.appendChild(el);

    // Block accidental dismiss: no backdrop click close.
    el.addEventListener("click", (e) => {
      if (e.target === el) {
        e.preventDefault();
        e.stopPropagation();
      }
    });
    el.querySelector("[data-mvo-minimize]")?.addEventListener("click", () => minimize());
    return el;
  }

  function ensureBanner() {
    let el = document.getElementById("pending-vote-banner");
    if (el) return el;
    el = document.createElement("div");
    el.id = "pending-vote-banner";
    el.className = "pending-vote-banner";
    el.hidden = true;
    el.setAttribute("role", "status");
    el.innerHTML = `
      <div class="pending-vote-banner__text">
        <strong>${escapeHtml(t("mvote.pendingTitle") || "Votación pendiente")}</strong>
        <span>${escapeHtml(t("mvote.pendingHint") || "Responde antes de que cierre")}</span>
      </div>
      <button type="button" class="btn btn-primary pending-vote-banner__cta" data-mvo-restore>
        ${escapeHtml(t("mvote.voteNow") || "Votar ahora")}
      </button>`;
    const host = document.body;
    host.appendChild(el);
    el.querySelector("[data-mvo-restore]")?.addEventListener("click", () => restore());
    return el;
  }

  function announce(msg) {
    const live = overlay.querySelector("#mvo-live");
    if (live) live.textContent = msg || "";
  }

  function shouldUseSheet() {
    const st = getState();
    if (st.viewerRole === "Operator") return false;
    return true; // owners/participants: sheet on mobile; compact panel on desktop via CSS
  }

  function sessionIdOf(session) {
    return session?.id || session?.Id || null;
  }

  function restoreDraft(sid) {
    const draft = loadDraft(sid);
    if (!draft) return;
    selected = draft.selected || null;
    clientRequestId = draft.clientRequestId || null;
  }

  function persistDraft(sid) {
    if (!sid) return;
    saveDraft(sid, {
      selected,
      clientRequestId,
      at: Date.now()
    });
  }

  function playOpenCueOnce(sid) {
    if (!sid || lastAlertedSessionId === sid) return;
    lastAlertedSessionId = sid;
    if (document.visibilityState !== "visible") return;
    try {
      if (navigator.vibrate) navigator.vibrate(40);
    } catch {
      /* ignore */
    }
    // Soft beep only after a prior user gesture context; never throw.
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      if (ctx.state === "suspended") {
        ctx.close().catch(() => {});
        return;
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.03;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
      setTimeout(() => ctx.close().catch(() => {}), 200);
    } catch {
      /* ignore */
    }
  }

  function render() {
    if (destroyed) return;
    const st = getState();
    const session = st.session;
    const sid = sessionIdOf(session);
    const status = String(session?.status || "").toLowerCase();
    const myStatus = st.myVoteStatus;
    const statusCode = String(myStatus?.status || myStatus?.Status || "").toUpperCase();
    const voted = Boolean(
      st.myVote?.evidenceId ||
        st.myVote?.EvidenceId ||
        myStatus?.evidenceId ||
        myStatus?.EvidenceId ||
        statusCode === "ALREADY_VOTED"
    );
    const motion = st.motion;

    if (!shouldUseSheet() || !session || status !== "open") {
      hideAll();
      if (status === "closed" || status === "cancelled") {
        setPhase(status === "cancelled" ? "idle" : "closed");
      } else {
        setPhase("idle");
      }
      return;
    }

    if (voted) {
      selected = null;
      clearDraft(sid);
      renderReceiptView(st);
      setPhase("receipt");
      showOverlay(true);
      showBanner(false);
      return;
    }

    if (
      statusCode === "NOT_ELIGIBLE" ||
      statusCode === "NOT_PARTICIPANT" ||
      statusCode === "NOT_ACCREDITED" ||
      (!canCastPermission() && statusCode && statusCode !== "ELIGIBLE")
    ) {
      if (phase === "minimized") {
        showOverlay(false);
        showBanner(false);
        setPhase("ineligible");
        return;
      }
      setPhase("ineligible");
      renderIneligible(statusCode);
      showOverlay(true);
      showBanner(false);
      return;
    }

    if (phase === "minimized") {
      showOverlay(false);
      showBanner(true);
      return;
    }

    if (phase === "confirm") {
      renderConfirm(motion);
      showOverlay(true);
      showBanner(false);
      return;
    }

    if (phase === "submitting") {
      renderSubmitting();
      showOverlay(true);
      showBanner(false);
      return;
    }

    if (phase === "error") {
      renderError();
      showOverlay(true);
      showBanner(false);
      return;
    }

    if (phase === "closed") {
      renderClosed();
      showOverlay(true);
      showBanner(false);
      return;
    }

    // Default pending ballot
    restoreDraft(sid);
    renderBallot(motion, myStatus);
    setPhase("full");
    showOverlay(true);
    showBanner(false);
    playOpenCueOnce(sid);
  }

  function showOverlay(visible) {
    overlay.hidden = !visible;
    overlay.classList.toggle("is-compact", !isCompactViewport());
    document.body.classList.toggle("mvo-open", visible);
  }

  function showBanner(visible) {
    banner.hidden = !visible;
    document.body.classList.toggle("mvo-pending-banner", visible);
  }

  function hideAll() {
    showOverlay(false);
    showBanner(false);
  }

  function renderBallot(motion, myStatus) {
    const kicker = overlay.querySelector("#mvo-kicker");
    const title = overlay.querySelector("#mvo-title");
    const timer = overlay.querySelector("#mvo-timer");
    const body = overlay.querySelector("#mvo-body");
    const footer = overlay.querySelector("#mvo-footer");
    const question =
      motion?.questionText || motion?.body || motion?.title || motion?.code || t("voting.title");

    if (kicker) kicker.textContent = t("voting.openBanner") || "VOTACIÓN ABIERTA";
    if (title) title.textContent = question;
    if (timer) {
      timer.hidden = false;
      timer.textContent =
        t("mvote.openUntilClose") || "Abierta hasta que el presidente la cierre";
    }

    const weight =
      myStatus?.representedCoefficientPercent ?? myStatus?.RepresentedCoefficientPercent ?? null;
    const method =
      motion?.calculationMethod === "PerPerson"
        ? t("voting.methodPerPerson") || "Por persona"
        : motion?.calculationMethod === "PerUnit"
          ? t("voting.methodPerUnit") || "Por unidad"
          : t("voting.methodCoefficient");
    const rule =
      motion?.decisionRuleCode === "QualifiedMajority"
        ? `${t("voting.ruleQualified") || "Mayoría calificada"}${
            motion?.requiredThresholdPercent != null
              ? ` (≥ ${Number(motion.requiredThresholdPercent).toFixed(2)}%)`
              : ""
          }`
        : t("voting.ruleSimpleMajority");

    body.innerHTML = `
      <section class="mvo__context">
        ${
          motion?.title && motion.title !== question
            ? `<p class="mvo__motion-title"><strong>${escapeHtml(t("assembly.motion") || "Moción")}:</strong> ${escapeHtml(motion.title)}</p>`
            : ""
        }
        ${motion?.code ? `<p class="muted mvo__code">${escapeHtml(motion.code)}</p>` : ""}
        <dl class="mvo__meta">
          <div><dt>${escapeHtml(t("voting.method"))}</dt><dd>${escapeHtml(method)}</dd></div>
          <div><dt>${escapeHtml(t("voting.rule"))}</dt><dd>${escapeHtml(rule)}</dd></div>
          ${
            weight != null
              ? `<div><dt>${escapeHtml(t("voting.yourWeight"))}</dt><dd class="metric-number">${Number(weight).toFixed(3)}%</dd></div>`
              : ""
          }
        </dl>
        <p class="mvo__hint muted">${escapeHtml(t("voting.selectHint") || "Selecciona una opción")}</p>
      </section>
      <div class="mvo__options" role="radiogroup" aria-labelledby="mvo-title">
        ${CHOICES.map((choice) => {
          const isSel = selected === choice;
          return `
          <button type="button" class="mvo__option${isSel ? " is-selected" : ""}"
            role="radio" aria-checked="${isSel}" data-choice="${choice}">
            <span class="mvo__option-mark" aria-hidden="true">${isSel ? "●" : "○"}</span>
            <span class="mvo__option-icon" aria-hidden="true">${CHOICE_ICON[choice]}</span>
            <span class="mvo__option-label">${escapeHtml(choiceLabel(choice))}</span>
            ${isSel ? `<span class="mvo__option-tag">${escapeHtml(t("mvote.selected") || "Opción seleccionada")}</span>` : ""}
          </button>`;
        }).join("")}
      </div>`;

    footer.hidden = false;
    footer.innerHTML = `
      <p class="mvo__selection" id="mvo-selection" aria-live="polite">
        ${
          selected
            ? `${escapeHtml(t("mvote.youSelected") || "Seleccionó")}: <strong>${escapeHtml(choiceLabel(selected))}</strong>`
            : escapeHtml(t("mvote.pickOption") || "Elija una opción para continuar")
        }
      </p>
      <button type="button" class="btn btn-primary mvo__confirm" data-mvo-confirm ${selected ? "" : "disabled"}>
        ${escapeHtml(t("voting.confirmVote") || "Confirmar voto")}
      </button>`;

    body.querySelectorAll("[data-choice]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selected = btn.getAttribute("data-choice");
        persistDraft(sessionIdOf(getState().session));
        renderBallot(motion, myStatus);
        announce(choiceLabel(selected));
      });
    });
    footer.querySelector("[data-mvo-confirm]")?.addEventListener("click", () => {
      if (!selected) return;
      setPhase("confirm");
      render();
    });

    queueMicrotask(() => {
      title?.focus?.({ preventScroll: true });
    });
  }

  function renderConfirm(motion) {
    const body = overlay.querySelector("#mvo-body");
    const footer = overlay.querySelector("#mvo-footer");
    const title = overlay.querySelector("#mvo-title");
    if (title) title.textContent = t("mvote.confirmTitle") || "Confirmar voto";
    const question =
      motion?.questionText || motion?.body || motion?.title || motion?.code || "";
    body.innerHTML = `
      <div class="mvo__confirm-card">
        <p class="mvo__confirm-lead">${escapeHtml(t("mvote.confirmLead") || "Vas a votar:")}</p>
        <p class="mvo__confirm-choice">${escapeHtml(choiceLabel(selected))}</p>
        <p class="muted">${escapeHtml(question)}</p>
        <p class="mvo__warn muted">${escapeHtml(
          t("mvote.confirmWarn") ||
            "Según las reglas actuales, no podrá cambiar este voto después de enviarlo."
        )}</p>
      </div>`;
    footer.hidden = false;
    footer.innerHTML = `
      <button type="button" class="btn btn-secondary" data-mvo-back>${escapeHtml(t("mvote.back") || "Volver")}</button>
      <button type="button" class="btn btn-primary" data-mvo-send>${escapeHtml(
        t("mvote.confirmSend") || "Confirmar y enviar"
      )}</button>`;
    footer.querySelector("[data-mvo-back]")?.addEventListener("click", () => {
      setPhase("full");
      render();
    });
    footer.querySelector("[data-mvo-send]")?.addEventListener("click", () => submit());
  }

  function renderSubmitting() {
    const body = overlay.querySelector("#mvo-body");
    const footer = overlay.querySelector("#mvo-footer");
    footer.hidden = true;
    body.innerHTML = `
      <div class="mvo__progress" role="status">
        <div class="mvo__spinner" aria-hidden="true"></div>
        <p>${escapeHtml(t("mvote.registering") || "Registrando tu voto…")}</p>
      </div>`;
    announce(t("mvote.registering") || "Registrando tu voto…");
  }

  function renderReceiptView(st) {
    const evidenceId =
      st.myVote?.evidenceId ||
      st.myVote?.EvidenceId ||
      st.myVoteStatus?.evidenceId ||
      st.myVoteStatus?.EvidenceId;
    const castAt =
      st.myVote?.castAtUtc || st.myVote?.CastAtUtc || st.myVoteStatus?.castAtUtc;
    const body = overlay.querySelector("#mvo-body");
    const footer = overlay.querySelector("#mvo-footer");
    const title = overlay.querySelector("#mvo-title");
    if (title) title.textContent = t("mvote.registered") || "Voto registrado correctamente";
    body.innerHTML = `
      <div class="mvo__receipt" role="status">
        <p class="mvo__receipt-ok">${escapeHtml(t("mvote.registered") || "Voto registrado correctamente")}</p>
        <dl class="mvo__meta">
          <div><dt>${escapeHtml(t("mvote.receiptCode") || "Comprobante")}</dt><dd><code>${escapeHtml(
            shortReceipt(evidenceId)
          )}</code></dd></div>
          <div><dt>${escapeHtml(t("mvote.castAt") || "Fecha y hora")}</dt><dd>${escapeHtml(
            castAt ? new Date(castAt).toLocaleString() : "—"
          )}</dd></div>
          <div><dt>${escapeHtml(t("mvote.serverConfirmed") || "Estado")}</dt><dd>${escapeHtml(
            t("mvote.serverConfirmed") || "Confirmado por el servidor"
          )}</dd></div>
        </dl>
      </div>`;
    footer.hidden = false;
    footer.innerHTML = `
      <button type="button" class="btn btn-primary" data-mvo-done>${escapeHtml(
        t("mvote.backToAssembly") || "Volver a la asamblea"
      )}</button>`;
    footer.querySelector("[data-mvo-done]")?.addEventListener("click", () => {
      hideAll();
      setPhase("idle");
      focusReturnEl?.focus?.();
    });
  }

  function renderIneligible(code) {
    const body = overlay.querySelector("#mvo-body");
    const footer = overlay.querySelector("#mvo-footer");
    const title = overlay.querySelector("#mvo-title");
    if (title) title.textContent = t("voting.openBanner") || "VOTACIÓN ABIERTA";
    const msg =
      code === "NOT_ACCREDITED"
        ? t("voting.notAccredited")
        : t("voting.notEligible");
    body.innerHTML = `<p class="mvo__eligibility" role="status">${escapeHtml(msg)}</p>`;
    footer.hidden = false;
    footer.innerHTML = `
      <button type="button" class="btn btn-secondary" data-mvo-minimize>${escapeHtml(
        t("mvote.consultAssembly") || "Consultar asamblea"
      )}</button>`;
    footer.querySelector("[data-mvo-minimize]")?.addEventListener("click", () => minimize());
  }

  function renderClosed() {
    const body = overlay.querySelector("#mvo-body");
    const footer = overlay.querySelector("#mvo-footer");
    const title = overlay.querySelector("#mvo-title");
    if (title) title.textContent = t("mvote.closedTitle") || "Votación cerrada";
    body.innerHTML = `<p class="mvo__eligibility" role="status">${escapeHtml(
      t("mvote.closedBeforeCast") ||
        "La votación fue cerrada antes de que pudieras registrar tu voto."
    )}</p>`;
    footer.hidden = false;
    footer.innerHTML = `
      <button type="button" class="btn btn-primary" data-mvo-done>${escapeHtml(
        t("mvote.backToAssembly") || "Volver a la asamblea"
      )}</button>`;
    footer.querySelector("[data-mvo-done]")?.addEventListener("click", () => {
      hideAll();
      setPhase("idle");
    });
  }

  let lastErrorMsg = "";
  function renderError() {
    const body = overlay.querySelector("#mvo-body");
    const footer = overlay.querySelector("#mvo-footer");
    body.innerHTML = `<p class="mvo__error" role="alert">${escapeHtml(lastErrorMsg)}</p>`;
    footer.hidden = false;
    footer.innerHTML = `
      <button type="button" class="btn btn-secondary" data-mvo-back>${escapeHtml(t("mvote.back") || "Volver")}</button>
      <button type="button" class="btn btn-primary" data-mvo-retry>${escapeHtml(t("mvote.retry") || "Reintentar")}</button>`;
    footer.querySelector("[data-mvo-back]")?.addEventListener("click", () => {
      setPhase("full");
      render();
    });
    footer.querySelector("[data-mvo-retry]")?.addEventListener("click", () => submit());
  }

  async function submit() {
    if (submitting || !selected) return;
    const st = getState();
    const sid = sessionIdOf(st.session);
    if (!sid) return;
    if (!clientRequestId) {
      clientRequestId =
        crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      persistDraft(sid);
    }
    submitting = true;
    setPhase("submitting");
    render();
    log("castAttempt", { sessionId: sid, idempotency: clientRequestId.slice(0, 8) });
    try {
      const receipt = await castVote(assemblyId, sid, selected, null, clientRequestId);
      clearDraft(sid);
      selected = null;
      clientRequestId = null;
      onReceipt?.(receipt);
      setPhase("receipt");
      // getState may not yet include myVote — seed from receipt for render
      const seeded = {
        ...getState(),
        myVote: {
          evidenceId: receipt.evidenceId || receipt.EvidenceId,
          castAtUtc: receipt.castAtUtc || receipt.CastAtUtc
        },
        myVoteStatus: {
          status: "ALREADY_VOTED",
          evidenceId: receipt.evidenceId || receipt.EvidenceId,
          castAtUtc: receipt.castAtUtc || receipt.CastAtUtc
        }
      };
      renderReceiptView(seeded);
      showOverlay(true);
      showBanner(false);
      announce(t("mvote.registered") || "Voto registrado correctamente");
      log("castAccepted", { sessionId: sid, replay: Boolean(receipt.idempotentReplay) });
    } catch (error) {
      lastErrorMsg = mapCastError(error);
      const code = String(error?.code || error?.message || "").toUpperCase();
      if (code.includes("CLOSED") || code.includes("VOTING_CLOSED")) {
        setPhase("closed");
        render();
      } else if (code.includes("ALREADY_VOTED")) {
        // Authoritative: refresh status
        try {
          const st2 = await getMyVoteStatus(assemblyId, sid);
          onReceipt?.({
            evidenceId: st2.evidenceId || st2.EvidenceId,
            castAtUtc: st2.castAtUtc || st2.CastAtUtc,
            idempotentReplay: true
          });
          setPhase("receipt");
          render();
        } catch {
          setPhase("error");
          render();
        }
      } else {
        // Uncertain: verify with server before claiming failure forever
        try {
          const st2 = await getMyVoteStatus(assemblyId, sid);
          if (st2?.evidenceId || st2?.EvidenceId || String(st2?.status).toUpperCase() === "ALREADY_VOTED") {
            onReceipt?.({
              evidenceId: st2.evidenceId || st2.EvidenceId,
              castAtUtc: st2.castAtUtc || st2.CastAtUtc,
              idempotentReplay: true
            });
            setPhase("receipt");
            render();
          } else {
            setPhase("error");
            render();
          }
        } catch {
          setPhase("error");
          render();
        }
      }
      log("castRejected", { message: lastErrorMsg.slice(0, 120) });
    } finally {
      submitting = false;
    }
  }

  function minimize() {
    focusReturnEl = document.activeElement;
    setPhase("minimized");
    showOverlay(false);
    showBanner(true);
    announce(t("mvote.pendingTitle") || "Votación pendiente");
    log("minimized");
  }

  function restore() {
    const st = getState();
    if (!st.session || String(st.session.status).toLowerCase() !== "open") {
      hideAll();
      setPhase("idle");
      return;
    }
    setPhase("full");
    render();
    log("restored");
  }

  async function refreshFromServer() {
    if (destroyed) return;
    const st = getState();
    const sid = sessionIdOf(st.session);
    if (!sid || !canCastPermission()) {
      render();
      return;
    }
    try {
      const status = await getMyVoteStatus(assemblyId, sid);
      onReceipt?.({
        __statusOnly: true,
        status,
        evidenceId: status.evidenceId || status.EvidenceId,
        castAtUtc: status.castAtUtc || status.CastAtUtc
      });
    } catch {
      /* keep local */
    }
    // Caller updates getState(); we re-render
    if (phase === "idle" || phase === "full" || phase === "minimized" || phase === "receipt") {
      if (phase === "idle") setPhase("full");
      render();
    } else {
      render();
    }
  }

  function onOpened() {
    if (!shouldUseSheet()) return;
    const sid = sessionIdOf(getState().session);
    restoreDraft(sid);
    setPhase("full");
    refreshFromServer();
  }

  function onClosed() {
    showBanner(false);
    const st = getState();
    const voted = Boolean(st.myVote?.evidenceId || st.myVote?.EvidenceId);
    if (voted) {
      setPhase("receipt");
      render();
      return;
    }
    if (phase === "submitting" || phase === "confirm" || phase === "full" || phase === "minimized" || phase === "error") {
      setPhase("closed");
      render();
      return;
    }
    hideAll();
    setPhase("idle");
  }

  function onCancelled() {
    clearDraft(sessionIdOf(getState().session));
    selected = null;
    clientRequestId = null;
    hideAll();
    setPhase("idle");
    announce(t("mvote.cancelled") || "La votación fue anulada.");
  }

  function sync() {
    if (destroyed) return;
    const st = getState();
    const status = String(st.session?.status || "").toLowerCase();
    if (!st.session || (status !== "open" && status !== "closed")) {
      if (status === "cancelled") onCancelled();
      else hideAll();
      return;
    }
    if (status === "closed") {
      onClosed();
      return;
    }
    // Open session: keep minimized if user minimized; otherwise show
    if (phase === "idle") setPhase("full");
    render();
  }

  function destroy() {
    destroyed = true;
    hideAll();
    overlay.remove();
    banner.remove();
    delete document.documentElement.dataset.mobileVoting;
  }

  return {
    onOpened,
    onClosed,
    onCancelled,
    sync,
    refreshFromServer,
    minimize,
    restore,
    destroy,
    getPhase: () => phase
  };
}
