import { api } from "./api.js";
import { t } from "../i18n/i18n.js";
import { escapeHtml } from "./ui.js";

export async function openVoting(
  assemblyId,
  motionId,
  hidePartialResults = true,
  resultVisibilityPolicy = null
) {
  const body = { motionId, hidePartialResults };
  if (resultVisibilityPolicy) {
    body.resultVisibilityPolicy = resultVisibilityPolicy;
  }
  return api(`/api/assemblies/${assemblyId}/voting/open`, {
    method: "POST",
    body
  });
}

export async function castVote(assemblyId, votingSessionId, choice, unitId = null, clientRequestId = null) {
  return api(`/api/assemblies/${assemblyId}/voting/${votingSessionId}/cast`, {
    method: "POST",
    body: {
      choice,
      unitId,
      clientRequestId: clientRequestId || crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`
    }
  });
}

export async function getMyVoteStatus(assemblyId, votingSessionId) {
  return api(`/api/assemblies/${assemblyId}/voting/${votingSessionId}/my-status`);
}

export async function closeVoting(assemblyId, votingSessionId) {
  return api(`/api/assemblies/${assemblyId}/voting/${votingSessionId}/close`, {
    method: "POST"
  });
}

export async function getResults(assemblyId, votingSessionId) {
  return api(`/api/assemblies/${assemblyId}/voting/${votingSessionId}/results`);
}

const CHOICE_LABEL = {
  InFavor: () => t("voting.inFavor"),
  Against: () => t("voting.against"),
  Abstention: () => t("voting.abstention")
};

const CHOICE_ICON = {
  InFavor: "✓",
  Against: "✕",
  Abstention: "–"
};

const POLICY_OPTIONS = [
  {
    value: "HiddenUntilClose",
    labelKey: "voting.policyHidden",
    hintKey: "voting.policyHiddenHint"
  },
  {
    value: "PresidentOnlyLive",
    labelKey: "voting.policyPresident",
    hintKey: "voting.policyPresidentHint"
  },
  {
    value: "LiveResults",
    labelKey: "voting.policyLive",
    hintKey: "voting.policyLiveHint"
  }
];

function policyOf(session) {
  return (
    session?.resultVisibilityPolicy ||
    session?.ResultVisibilityPolicy ||
    (session?.hidePartialResults === false ? "LiveResults" : "HiddenUntilClose")
  );
}

function shortReceiptCode(evidenceId) {
  if (!evidenceId) return "—";
  const compact = String(evidenceId).replace(/-/g, "").toUpperCase();
  return `VT-${compact.slice(0, 6)}`;
}

function participationBlock(tally, session, { showPending = false } = {}) {
  const cast = tally?.votesCast ?? tally?.VotesCast ?? 0;
  const eligible =
    tally?.eligibleVoters ??
    tally?.EligibleVoters ??
    session?.eligibleVoters ??
    session?.EligibleVoters ??
    null;
  const pending = eligible != null ? Math.max(0, eligible - cast) : null;
  const coeff =
    tally?.participatingCoefficient ?? tally?.ParticipatingCoefficient ?? null;
  const eligibleCoeff =
    tally?.eligibleCoefficient ??
    tally?.EligibleCoefficient ??
    session?.eligibleCoefficient ??
    session?.EligibleCoefficient ??
    null;

  return `
    <div class="vote-participation" aria-live="polite">
      <p>
        <strong>${escapeHtml(t("voting.participation"))}:</strong>
        <span class="metric-number">${cast}${eligible != null ? ` / ${eligible}` : ""}</span>
        ${eligible != null ? escapeHtml(t("voting.eligibleShort")) : ""}
      </p>
      ${
        showPending && pending != null
          ? `<p>${escapeHtml(t("voting.pending"))}: <strong class="metric-number">${pending}</strong></p>`
          : ""
      }
      ${
        coeff != null && eligibleCoeff != null
          ? `<p class="muted">${escapeHtml(t("voting.coeffParticipating"))}:
              <span class="metric-number">${Number(coeff).toFixed(2)}%</span>
              / ${Number(eligibleCoeff).toFixed(2)}%</p>`
          : ""
      }
    </div>
  `;
}

/**
 * Voting UX: SELECT card → REVIEW (confirm button) → CONFIRM dialog → Registering… → receipt.
 * Never optimistic confirm. Keyboard: Tab / Space / Enter.
 */
export function renderVotePanel(
  root,
  {
    session,
    tally,
    myVote = null,
    myStatus = null,
    motion = null,
    canCast,
    canOpen,
    canClose,
    operatorView = false,
    eligibleVoters = null,
    onCast,
    onOpen,
    onClose,
    onVerify
  }
) {
  if (!root) {
    return;
  }

  if (!session) {
    root.innerHTML = `
      <div class="vote-prepare panel-compact-empty" role="region" aria-label="${escapeHtml(t("voting.prepareTitle"))}">
        <p class="vote-now-kicker">${escapeHtml(t("voting.prepareTitle"))}</p>
        ${
          motion
            ? `<h3 class="vote-question">${escapeHtml(motion.title || motion.code || "")}</h3>
               ${motion.body ? `<p class="muted vote-question-body">${escapeHtml(motion.body)}</p>` : ""}`
            : `<p class="empty-state-what">${escapeHtml(t("assembly.noVoting"))}</p>
               <p class="empty-state-why">${escapeHtml(t("assembly.noVotingWhy"))}</p>`
        }
        <dl class="vote-meta-grid">
          <div><dt>${escapeHtml(t("voting.method"))}</dt><dd>${escapeHtml(
            motion?.calculationMethod === "PerPerson"
              ? t("voting.methodPerPerson") || "Por persona"
              : motion?.calculationMethod === "PerUnit"
                ? t("voting.methodPerUnit") || "Por unidad"
                : t("voting.methodCoefficient")
          )}</dd></div>
          <div><dt>${escapeHtml(t("voting.rule"))}</dt><dd>${escapeHtml(
            motion?.decisionRuleCode === "QualifiedMajority"
              ? `${t("voting.ruleQualified") || "Mayoría calificada"}${
                  motion?.requiredThresholdPercent != null
                    ? ` (≥ ${Number(motion.requiredThresholdPercent).toFixed(2)}%)`
                    : ""
                }`
              : t("voting.ruleSimpleMajority")
          )}</dd></div>
        </dl>
        ${
          canOpen
            ? `
          <fieldset class="vote-policy-fieldset">
            <legend>${escapeHtml(t("voting.policyLegend"))}</legend>
            ${POLICY_OPTIONS.map(
              (opt, i) => `
              <label class="vote-policy-option">
                <input type="radio" name="result-policy" value="${opt.value}" ${i === 0 ? "checked" : ""} />
                <span>
                  <strong>${escapeHtml(t(opt.labelKey))}</strong>
                  <small class="muted">${escapeHtml(t(opt.hintKey))}</small>
                </span>
              </label>`
            ).join("")}
          </fieldset>
          <button type="button" class="btn btn-primary btn-vote-open" data-action="open-vote">
            ${escapeHtml(t("voting.open"))}
          </button>`
            : ""
        }
      </div>
    `;
    root.querySelector("[data-action='open-vote']")?.addEventListener("click", () => {
      const selected =
        root.querySelector('input[name="result-policy"]:checked')?.value || "HiddenUntilClose";
      onOpen?.(selected);
    });
    return;
  }

  if (session.status === "Closed" && tally) {
    root.innerHTML = renderOfficialResult(tally, session, motion);
    return;
  }

  const voted = Boolean(myVote?.evidenceId || myVote?.EvidenceId);
  const evidenceId = myVote?.evidenceId || myVote?.EvidenceId;
  const castAt = myVote?.castAtUtc || myVote?.CastAtUtc;
  const policy = policyOf(session);
  const trendHidden = Boolean(
    tally?.trendHidden ?? tally?.TrendHidden ?? policy !== "LiveResults"
  );
  const canSeeLiveTrend =
    !trendHidden &&
    (policy === "LiveResults" || (policy === "PresidentOnlyLive" && operatorView));
  const weight =
    myStatus?.representedCoefficientPercent ??
    myStatus?.RepresentedCoefficientPercent ??
    null;

  let body = `
    <div class="vote-live-header">
      <p class="vote-now-kicker">${escapeHtml(t("voting.openBanner"))}</p>
      ${
        motion
          ? `<h3 class="vote-question">${escapeHtml(motion.title || motion.code || "")}</h3>`
          : ""
      }
      <p class="vote-session-status">
        <span class="badge badge-live">${escapeHtml(t("voting.openStatus"))}</span>
        <span class="muted">${escapeHtml(t(`voting.policy${policy}`))}</span>
      </p>
      <dl class="vote-meta-grid">
        <div><dt>${escapeHtml(t("voting.method"))}</dt><dd>${escapeHtml(t("voting.methodCoefficient"))}</dd></div>
        ${
          weight != null
            ? `<div><dt>${escapeHtml(t("voting.yourWeight"))}</dt><dd class="metric-number">${Number(weight).toFixed(3)}%</dd></div>`
            : ""
        }
      </dl>
    </div>`;

  if (operatorView && session.status === "Open") {
    body += renderOperatorTally(tally, eligibleVoters ?? session.eligibleVoters, {
      showTrend: canSeeLiveTrend && policy === "PresidentOnlyLive"
    });
  } else if (session.status === "Open") {
    body += participationBlock(tally, session);
  }

  if (voted) {
    body += renderReceipt(evidenceId, castAt, tally, session, { waiting: true });
  } else if (canCast && session.status === "Open") {
    body += `
      <div class="choice-cards" role="radiogroup" aria-label="${escapeHtml(t("voting.title"))}">
        ${["InFavor", "Against", "Abstention"]
          .map(
            (choice) => `
          <button type="button" class="choice-card" role="radio" aria-checked="false" aria-pressed="false"
            data-choice="${choice}" tabindex="0">
            <span class="choice-icon" aria-hidden="true">${CHOICE_ICON[choice]}</span>
            <span class="choice-label">${escapeHtml(CHOICE_LABEL[choice]())}</span>
            <span class="choice-hint">${escapeHtml(t("voting.selectHint"))}</span>
          </button>`
          )
          .join("")}
      </div>
      <div class="vote-confirm-row">
        <button type="button" class="btn btn-primary btn-vote-confirm" data-action="confirm-selection" disabled>
          ${escapeHtml(t("voting.reviewConfirm"))}
        </button>
      </div>
      <div id="vote-status" class="muted" aria-live="polite"></div>
    `;
  } else if (!operatorView && session.status === "Open") {
    body += `<p class="muted">${escapeHtml(t("voting.notEligible"))}</p>`;
  }

  if (canSeeLiveTrend && tally && policy === "LiveResults") {
    body += `<div class="vote-live-trend"><h4>${escapeHtml(t("voting.liveResult"))}</h4>${renderTallyBars(tally)}</div>`;
  }

  if (canClose && session.status === "Open") {
    body += `<button type="button" class="btn btn-danger" data-action="close-vote">${escapeHtml(t("voting.close"))}</button>`;
  }

  root.innerHTML = body;
  root.querySelector("[data-action='close-vote']")?.addEventListener("click", onClose);

  const cards = [...root.querySelectorAll(".choice-card")];
  const statusEl = root.querySelector("#vote-status");
  const confirmBtn = root.querySelector("[data-action='confirm-selection']");
  let selected = null;

  const setPressed = (choice) => {
    selected = choice;
    cards.forEach((card) => {
      const isSelected = card.getAttribute("data-choice") === choice;
      card.setAttribute("aria-pressed", String(isSelected));
      card.setAttribute("aria-checked", String(isSelected));
      card.classList.toggle("is-selected", isSelected);
    });
    if (confirmBtn) {
      confirmBtn.disabled = !choice;
    }
  };

  const submitChoice = async (choice) => {
    if (!choice) return;
    setPressed(choice);
    const label = CHOICE_LABEL[choice]?.() || choice;
    const { confirmDialog } = await import("./ui.js");
    const ok = await confirmDialog({
      title: t("voting.confirmTitle"),
      body: t("voting.confirmWarning"),
      choiceLabel: `${t("voting.confirmBody")} ${label}`,
      confirmLabel: t("voting.confirmVote"),
      cancelLabel: t("voting.back")
    });

    if (!ok) {
      return;
    }

    cards.forEach((c) => {
      c.disabled = true;
    });
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.classList.add("is-loading");
      confirmBtn.setAttribute("aria-busy", "true");
    }
    if (statusEl) {
      statusEl.textContent = t("voting.registering");
    }

    try {
      const receipt = await onCast?.(choice);
      const evidence = receipt?.evidenceId || receipt?.EvidenceId || "—";
      const at = receipt?.castAtUtc || receipt?.CastAtUtc || new Date().toISOString();
      root.innerHTML = renderReceipt(evidence, at, tally, session, { waiting: true });
      const { notify } = await import("./ui.js");
      notify.success("Tu voto quedó registrado correctamente.", { title: "Voto registrado" });
    } catch (error) {
      const networkish =
        !error?.status ||
        error.status === 0 ||
        error.name === "TypeError" ||
        /network|fetch|abort|failed/i.test(String(error.message || ""));

      const already =
        error?.code === "ALREADY_VOTED" ||
        /already voted|ya (fue )?registr/i.test(String(error.message || ""));

      if (networkish) {
        cards.forEach((c) => {
          c.disabled = true;
        });
        if (confirmBtn) {
          confirmBtn.disabled = true;
          confirmBtn.classList.remove("is-loading");
          confirmBtn.removeAttribute("aria-busy");
        }
        if (statusEl) {
          statusEl.innerHTML = `
            <div class="inline-alert" role="status" aria-live="assertive">
              <p><strong>${escapeHtml(t("voting.verifying"))}</strong></p>
              <p class="muted">${escapeHtml(t("voting.failureBody"))}</p>
            </div>`;
        }
        try {
          const verified = await onVerify?.(choice);
          if (verified?.evidenceId || verified?.EvidenceId) {
            root.innerHTML = renderReceipt(
              verified.evidenceId || verified.EvidenceId,
              verified.castAtUtc || verified.CastAtUtc,
              tally,
              session,
              { waiting: true }
            );
          }
        } catch {
          /* parent rehydrates */
        }
        return;
      }

      if (already) {
        root.innerHTML = `
          <div class="inline-alert" role="status">
            <p><strong>${escapeHtml(t("voting.alreadyVoted"))}</strong></p>
          </div>`;
        const verified = await onVerify?.(choice);
        if (verified?.evidenceId || verified?.EvidenceId) {
          root.innerHTML = renderReceipt(
            verified.evidenceId || verified.EvidenceId,
            verified.castAtUtc || verified.CastAtUtc,
            tally,
            session,
            { waiting: true }
          );
        }
        return;
      }

      cards.forEach((c) => {
        c.disabled = false;
      });
      if (confirmBtn) {
        confirmBtn.disabled = !selected;
        confirmBtn.classList.remove("is-loading");
        confirmBtn.removeAttribute("aria-busy");
      }
      if (statusEl) {
        const msg =
          error?.status === 409 || /cerr|closed/i.test(String(error.message || ""))
            ? t("voting.closedError")
            : error?.message || t("voting.failureBody");
        statusEl.innerHTML = `
          <div class="inline-alert inline-alert-error" role="alert">
            <p><strong>${escapeHtml(t("voting.failureTitle"))}</strong></p>
            <p>${escapeHtml(msg)}</p>
            <p class="muted">${escapeHtml(t("voting.failureVerify"))}</p>
          </div>`;
      }
    }
  };

  cards.forEach((card) => {
    card.addEventListener("click", () => setPressed(card.getAttribute("data-choice")));
    card.addEventListener("keydown", (event) => {
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        setPressed(card.getAttribute("data-choice"));
      }
    });
  });

  confirmBtn?.addEventListener("click", () => submitChoice(selected));
}

function renderReceipt(evidenceId, castAt, tally, session, { waiting = false } = {}) {
  const time = castAt
    ? new Intl.DateTimeFormat(undefined, { timeStyle: "medium" }).format(new Date(castAt))
    : "";
  const code = shortReceiptCode(evidenceId);
  return `
    <div class="vote-receipt" role="status">
      <p class="vote-receipt-icon" aria-hidden="true">✓</p>
      <h3>${escapeHtml(t("voting.registered"))}</h3>
      <p>${escapeHtml(t("voting.registeredBody"))}</p>
      ${time ? `<p class="metric-number vote-receipt-time">${escapeHtml(time)}</p>` : ""}
      <p>${escapeHtml(t("voting.evidence"))}</p>
      <p class="evidence-id" title="${escapeHtml(evidenceId || "")}">${escapeHtml(code)}</p>
      ${participationBlock(tally, session)}
      ${
        waiting
          ? `<p class="muted vote-waiting">${escapeHtml(
              policyOf(session) === "LiveResults"
                ? t("voting.waitingLive")
                : t("voting.waitingClose")
            )}</p>`
          : ""
      }
    </div>
  `;
}

function renderOperatorTally(tally, eligibleVoters, { showTrend = false } = {}) {
  const cast = tally?.votesCast ?? tally?.VotesCast ?? null;
  const eligible =
    eligibleVoters ?? tally?.eligibleVoters ?? tally?.EligibleVoters ?? null;
  const pending = cast != null && eligible != null ? Math.max(0, eligible - cast) : null;
  const participation =
    cast != null && eligible
      ? `${Math.round((cast / eligible) * 100)}%`
      : "—";

  return `
    <div class="operator-tally panel" aria-live="polite">
      <p class="vote-now-kicker">${escapeHtml(t("voting.inProgress"))}</p>
      <p>${escapeHtml(t("voting.votesReceived"))}:
        <strong class="metric-number">${cast != null ? cast : "—"}</strong>${
          eligible != null ? ` / ${eligible}` : ""
        }
      </p>
      ${
        pending != null
          ? `<p>${escapeHtml(t("voting.pending"))}: <strong class="metric-number">${pending}</strong></p>`
          : ""
      }
      <p>${escapeHtml(t("voting.participation"))}: <strong class="metric-number">${escapeHtml(String(participation))}</strong></p>
      ${
        showTrend && tally && !tally.trendHidden
          ? renderTallyBars(tally)
          : `<p class="muted">${escapeHtml(t("voting.partialHidden"))}</p>`
      }
    </div>
  `;
}

function renderTallyBars(tally) {
  return `
    <div class="tally-bars" aria-live="polite">
      <div>${escapeHtml(t("voting.inFavor"))} ${Number(tally.inFavorCoefficient ?? 0).toFixed(2)}%
        <div class="bar"><span style="width:${Math.min(100, Number(tally.inFavorCoefficient ?? 0))}%"></span></div>
      </div>
      <div>${escapeHtml(t("voting.against"))} ${Number(tally.againstCoefficient ?? 0).toFixed(2)}%
        <div class="bar"><span style="width:${Math.min(100, Number(tally.againstCoefficient ?? 0))}%"></span></div>
      </div>
      <div>${escapeHtml(t("voting.abstention"))} ${Number(tally.abstentionCoefficient ?? 0).toFixed(2)}%
        <div class="bar"><span style="width:${Math.min(100, Number(tally.abstentionCoefficient ?? 0))}%"></span></div>
      </div>
    </div>`;
}

function resultRow(label, votes, coefficient) {
  return `
    <div class="result-row">
      <strong>${escapeHtml(label)}</strong>
      <span>${escapeHtml(t("voting.votes"))}: <span class="metric-number">${votes != null ? escapeHtml(String(votes)) : "—"}</span></span>
      <span>${escapeHtml(t("voting.coefficient"))}: <span class="metric-number">${Number(coefficient ?? 0).toFixed(2)}%</span></span>
    </div>
  `;
}

function renderOfficialResult(tally, session, motion) {
  const decision = tally.decisionStatus || tally.DecisionStatus || "—";
  const rule = tally.appliedDecisionRule || tally.AppliedDecisionRule;
  const explanation = tally.decisionExplanation || tally.DecisionExplanation;
  const approved = /Approved|Aprob/i.test(String(decision));
  return `
    <div class="result-premium result-reveal" role="status">
      <p class="vote-now-kicker">${escapeHtml(t("voting.closedBanner"))}</p>
      ${motion ? `<h3 class="vote-question">${escapeHtml(motion.title || "")}</h3>` : ""}
      <p class="result-decision ${approved ? "is-approved" : "is-rejected"}">${escapeHtml(decision)}</p>
      <p><strong>${escapeHtml(t("voting.result"))}:</strong> ${escapeHtml(decision)}</p>
      <p>${escapeHtml(t("voting.method"))}: ${escapeHtml(t("voting.methodCoefficient"))}</p>
      ${rule ? `<p class="muted">${escapeHtml(t("voting.ruleApplied"))}: ${escapeHtml(rule)}</p>` : ""}
      ${explanation ? `<p class="muted">${escapeHtml(explanation)}</p>` : `<p class="muted">${escapeHtml(t("voting.ruleDisclaimer"))}</p>`}
      ${resultRow(t("voting.inFavor"), tally.inFavorVotes ?? tally.votesInFavor, tally.inFavorCoefficient)}
      ${resultRow(t("voting.against"), tally.againstVotes ?? tally.votesAgainst, tally.againstCoefficient)}
      ${resultRow(t("voting.abstention"), tally.abstentionVotes ?? tally.votesAbstention, tally.abstentionCoefficient)}
      ${participationBlock(tally, session, { showPending: true })}
    </div>
  `;
}
