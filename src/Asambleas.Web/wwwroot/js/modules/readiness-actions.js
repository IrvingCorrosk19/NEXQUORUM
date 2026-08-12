/**
 * Sticky action bar + unsaved-changes dialog for readiness return flow.
 */
import { confirmDialog, qs } from "./ui.js";
import {
  isReadinessReturnContext,
  navigateBackToReadiness,
  assemblyIdFromReturnContext
} from "./return-context.js";

/**
 * @param {{
 *   assemblyId: string,
 *   onSave?: () => Promise<boolean>,
 *   getDirty?: () => boolean,
 *   setDirty?: (v: boolean) => void,
 *   saveLabel?: string,
 *   hint?: string
 * }} opts
 */
export function mountReadinessActionBar(opts) {
  const {
    assemblyId,
    onSave = null,
    getDirty = () => false,
    setDirty = () => {},
    saveLabel = "Guardar",
    hint = "Estás completando la preparación de esta asamblea."
  } = opts;

  if (!isReadinessReturnContext()) return null;

  const existing = qs("#readiness-action-bar");
  if (existing) existing.remove();

  const banner = document.createElement("div");
  banner.id = "readiness-context-banner";
  banner.className = "readiness-context-banner";
  banner.innerHTML = `<p>${hint}</p>`;

  const bar = document.createElement("footer");
  bar.id = "readiness-action-bar";
  bar.className = "readiness-action-bar";
  bar.setAttribute("role", "toolbar");
  bar.innerHTML = `
    <button type="button" class="btn btn-secondary" id="btn-readiness-back">Volver a preparación</button>
    <div class="cluster">
      ${onSave ? `<button type="button" class="btn btn-secondary" id="btn-readiness-save">${saveLabel}</button>` : ""}
      ${onSave ? `<button type="button" class="btn btn-primary" id="btn-readiness-save-return">Guardar y volver</button>` : ""}
    </div>`;

  const main = qs("#main") || document.body;
  main.appendChild(banner);
  document.body.appendChild(bar);

  const goBack = async (afterSave = false) => {
    if (!afterSave && getDirty()) {
      const choice = await confirmUnsaved(getDirty, onSave, setDirty);
      if (choice === "stay") return;
      if (choice === "save-return" && onSave) {
        const ok = await onSave();
        if (!ok) return;
        setDirty(false);
      }
    }
    navigateBackToReadiness(assemblyId || assemblyIdFromReturnContext());
  };

  qs("#btn-readiness-back")?.addEventListener("click", () => goBack(false));

  qs("#btn-readiness-save")?.addEventListener("click", async () => {
    if (!onSave) return;
    const ok = await onSave();
    if (ok) setDirty(false);
  });

  qs("#btn-readiness-save-return")?.addEventListener("click", async () => {
    if (!onSave) {
      await goBack(true);
      return;
    }
    const ok = await onSave();
    if (!ok) return;
    setDirty(false);
    navigateBackToReadiness(assemblyId || assemblyIdFromReturnContext());
  });

  return { setDirty, goBack };
}

async function confirmUnsaved(getDirty, onSave, setDirty) {
  if (!getDirty()) return "discard";

  const body = document.createElement("div");
  body.innerHTML = `
    <p>Tienes cambios sin guardar.</p>
    <div class="cta-row" style="margin-top:1rem;justify-content:flex-end">
      <button type="button" class="btn btn-secondary" data-act="stay">Seguir editando</button>
      <button type="button" class="btn btn-secondary" data-act="discard">Descartar y volver</button>
      ${onSave ? `<button type="button" class="btn btn-primary" data-act="save-return">Guardar y volver</button>` : ""}
    </div>`;

  return new Promise((resolve) => {
    const dlg = document.createElement("dialog");
    dlg.className = "owner-dialog";
    dlg.innerHTML = `<div class="owner-sheet"><h2>Cambios sin guardar</h2></div>`;
    dlg.querySelector(".owner-sheet").appendChild(body);
    document.body.appendChild(dlg);

    body.querySelectorAll("[data-act]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const act = btn.getAttribute("data-act");
        dlg.close();
        dlg.remove();
        resolve(act);
      });
    });

    dlg.addEventListener("cancel", (e) => {
      e.preventDefault();
      resolve("stay");
    });
    dlg.showModal();
  });
}
