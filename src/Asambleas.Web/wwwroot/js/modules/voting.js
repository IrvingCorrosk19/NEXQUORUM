import { api } from "./api.js";
import { t } from "../i18n/i18n.js";
import { escapeHtml } from "./ui.js";

export async function openVoting(assemblyId, motionId, hidePartialResults = true) {
  return api(`/api/assemblies/${assemblyId}/voting/open`, {
    method: "POST",
    body: { motionId, hidePartialResults }
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
      <div class="empty-state panel-compact-empty" role="status">
        <p class="empty-state-what">${escapeHtml(t("assembly.noVoting"))}</p>
        <p class="empty-state-why">${escapeHtml(t("assembly.noVotingWhy"))}</p>
      </div>
      ${
        canOpen
          ? `<button type="button" class="btn btn-primary" data-action="open-vote">${escapeHtml(t("voting.open"))}</button>`
          : ""
      }
    `;
    root.querySelector("[data-action='open-vote']")?.addEventListener("click", onOpen);
    return;
  }

  if (session.status === "Closed" && tally) {
    root.innerHTML = renderOfficialResult(tally, session);
    return;
  }

  const voted = Boolean(myVote?.evidenceId || myVote?.EvidenceId);
  const evidenceId = myVote?.evidenceId || myVote?.EvidenceId;
  const castAt = myVote?.castAtUtc || myVote?.CastAtUtc;

  let body = `
    <p class="vote-session-status">
      <span class="badge badge-live">${escapeHtml(t("voting.title"))}</span>
      <span class="muted">${escapeHtml(session.status === "Open" ? t("voting.openStatus") : session.status)}</span>
    </p>`;

  if (operatorView && session.status === "Open") {
    body += renderOperatorTally(tally, eligibleVoters);
  }

  if (voted) {
    body += renderReceipt(evidenceId, castAt);
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
        <button type="button" class="btn btn-primary" data-action="confirm-selection" disabled>
          ${escapeHtml(t("voting.reviewConfirm"))}
        </button>
      </div>
      <div id="vote-status" class="muted" aria-live="polite"></div>
    `;
  } else if (!operatorView && session.status === "Open") {
    body += `<p class="muted">${escapeHtml(t("voting.partialHidden"))}</p>`;
  }

  if (!operatorView && tally && !session.hidePartialResults) {
    body += renderTallyBars(tally);
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
      cancelLabel: t("cancel")
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
      root.innerHTML = renderReceipt(evidence, at);
    } catch (error) {
      const networkish =
        !error?.status ||
        error.status === 0 ||
        error.name === "TypeError" ||
        /network|fetch|abort|failed/i.test(String(error.message || ""));

        if (networkish) {
        // Unknown outcome — do NOT re-enable vote; verify with backend.
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
              verified.castAtUtc || verified.CastAtUtc
            );
          }
        } catch {
          /* parent rehydrates */
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
        statusEl.innerHTML = `
          <div class="inline-alert inline-alert-error" role="alert">
            <p><strong>${escapeHtml(t("voting.failureTitle"))}</strong></p>
            <p>${escapeHtml(t("voting.failureBody"))}</p>
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

function renderReceipt(evidenceId, castAt) {
  const time = castAt
    ? new Intl.DateTimeFormat(undefined, { timeStyle: "medium" }).format(new Date(castAt))
    : "";
  return `
    <div class="vote-receipt" role="status">
      <p class="vote-receipt-icon" aria-hidden="true">✓</p>
      <h3>${escapeHtml(t("voting.registered"))}</h3>
      ${time ? `<p class="metric-number vote-receipt-time">${escapeHtml(time)}</p>` : ""}
      <p>${escapeHtml(t("voting.evidence"))}</p>
      <p class="evidence-id">${escapeHtml(evidenceId || "—")}</p>
    </div>
  `;
}

function renderOperatorTally(tally, eligibleVoters) {
  const cast = tally?.votesCast ?? tally?.VotesCast ?? null;
  const eligible = eligibleVoters ?? tally?.eligibleVoters ?? null;
  const participation =
    cast != null && eligible
      ? `${Math.round((cast / eligible) * 100)}%`
      : tally?.participationPercent != null
        ? `${tally.participationPercent}%`
        : "—";

  return `
    <div class="operator-tally panel" aria-live="polite">
      <p>${escapeHtml(t("voting.votesReceived"))}:
        <strong class="metric-number">${cast != null ? cast : "—"}</strong>${
          eligible != null ? ` / ${eligible}` : ""
        }
      </p>
      <p>${escapeHtml(t("voting.participation"))}: <strong class="metric-number">${escapeHtml(String(participation))}</strong></p>
      ${
        tally && !tally.hidePartial
          ? ""
          : `<p class="muted">${escapeHtml(t("voting.partialHidden"))}</p>`
      }
    </div>
  `;
}

function renderTallyBars(tally) {
  return `
    <div class="tally-bars" aria-live="polite">
      <div>${escapeHtml(t("voting.inFavor"))} ${Number(tally.inFavorCoefficient).toFixed(2)}%
        <div class="bar"><span style="width:${Math.min(100, Number(tally.inFavorCoefficient))}%"></span></div>
      </div>
      <div>${escapeHtml(t("voting.against"))} ${Number(tally.againstCoefficient).toFixed(2)}%
        <div class="bar"><span style="width:${Math.min(100, Number(tally.againstCoefficient))}%"></span></div>
      </div>
      <div>${escapeHtml(t("voting.abstention"))} ${Number(tally.abstentionCoefficient).toFixed(2)}%
        <div class="bar"><span style="width:${Math.min(100, Number(tally.abstentionCoefficient))}%"></span></div>
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

function renderOfficialResult(tally, session) {
  const decision = tally.decisionStatus || tally.DecisionStatus || "—";
  const rule = tally.appliedDecisionRule || tally.AppliedDecisionRule;
  const explanation = tally.decisionExplanation || tally.DecisionExplanation;
  return `
    <div class="result-premium" role="status">
      <h3>${escapeHtml(t("voting.officialResult"))}</h3>
      ${session?.motionCode ? `<p><strong>${escapeHtml(session.motionCode)}</strong></p>` : ""}
      <p><strong>${escapeHtml(t("voting.result"))}:</strong> ${escapeHtml(decision)}</p>
      ${rule ? `<p class="muted">${escapeHtml(t("voting.ruleApplied"))}: ${escapeHtml(rule)}</p>` : ""}
      ${explanation ? `<p class="muted">${escapeHtml(explanation)}</p>` : `<p class="muted">${escapeHtml(t("voting.ruleDisclaimer"))}</p>`}
      ${resultRow(t("voting.inFavor"), tally.inFavorVotes ?? tally.votesInFavor, tally.inFavorCoefficient)}
      ${resultRow(t("voting.against"), tally.againstVotes ?? tally.votesAgainst, tally.againstCoefficient)}
      ${resultRow(t("voting.abstention"), tally.abstentionVotes ?? tally.votesAbstention, tally.abstentionCoefficient)}
      <p>${escapeHtml(t("voting.votesReceived"))}: <strong class="metric-number">${tally.votesCast ?? "—"}</strong></p>
    </div>
  `;
}
