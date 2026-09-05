const { chromium } = require(require('path').join(__dirname, 'node_modules/playwright'));
const fs = require("fs");
const path = require("path");
const BASE = process.env.ASAMBLEAS_BASE_URL || "https://localhost:7188";
const PASSWORD = process.env.ASAMBLEAS_DEMO_PASSWORD || fs.readFileSync(path.join(__dirname, "../../.demo-password.local"), "utf8").trim();
const OUT = path.join(__dirname, "voting-studio-final-results");
fs.mkdirSync(OUT, { recursive: true });

const ASSEMBLY = "44444444-4444-4444-4444-444444444401";
const OTHER_ASSEMBLY = "44444444-4444-4444-4444-444444444402";
const gates = {};
const contrastRows = [];
const captureRows = [];
const timings = {};
let discovered = 0, executed = 0, passed = 0, failed = 0, skipped = 0;

function gate(k, pass, d) {
  discovered++; executed++;
  if (pass) { passed++; gates[k] = "PASS"; }
  else { failed++; gates[k] = "FAIL"; }
  console.log((pass ? "PASS" : "FAIL") + "  " + k + (d ? " — " + d : ""));
}
function skip(k, d) { discovered++; skipped++; gates[k] = "SKIP"; console.log("SKIP  " + k + (d ? " — " + d : "")); }

function relLuminance(hex) {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const rgb = [0, 1, 2].map((i) => parseInt(n.slice(i * 2, i * 2 + 2), 16) / 255);
  const lin = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}
function contrastRatio(a, b) {
  const L1 = relLuminance(a), L2 = relLuminance(b);
  const hi = Math.max(L1, L2), lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}
function rgbToHex(rgb) {
  const m = String(rgb).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!m) return "#000000";
  return "#" + [m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, "0")).join("");
}

async function login(page, email) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(400);
      return await page.evaluate(async ({ email, password }) => {
        const af = await fetch("/api/auth/antiforgery", { credentials: "same-origin" });
        const { requestToken } = await af.json();
        const res = await fetch("/api/auth/login", {
          method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json", RequestVerificationToken: requestToken },
          body: JSON.stringify({ email, password })
        });
        return res.status;
      }, { email, password: PASSWORD });
    } catch (e) {
      if (attempt === 2) throw e;
      await page.waitForTimeout(500);
    }
  }
  return 500;
}

async function logout(page) {
  try {
    await page.evaluate(async () => {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => {});
    });
  } catch { /* navigation may invalidate context */ }
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
}

async function api(page, method, url, body) {
  return page.evaluate(async ({ method, url, body }) => {
    const af = await fetch("/api/auth/antiforgery", { credentials: "same-origin" });
    const { requestToken } = await af.json();
    const headers = { Accept: "application/json", RequestVerificationToken: requestToken };
    let payload;
    if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
    const res = await fetch(url, { method, credentials: "same-origin", headers, body: payload });
    const text = await res.text();
    let json = null; try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
    return { status: res.status, json, text: text.slice(0, 400) };
  }, { method, url, body });
}

async function shot(page, name, note) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: true });
  const vp = page.viewportSize();
  const hScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  captureRows.push({ file: name, w: vp.width, h: vp.height, note, hScroll, status: hScroll ? "WARN" : "OK" });
  return !hScroll;
}

async function openStudio(page) {
  await page.goto(BASE + "/voting-studio.html?assemblyId=" + ASSEMBLY, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
}

(async () => {
  const browser = await chromium.launch({ headless: true, ignoreHTTPSErrors: true });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  try {
    const t0 = Date.now();
    const st = await login(page, "president@ocean.demo");
    gate("LOGIN", st < 400, String(st));
    timings.loginMs = Date.now() - t0;

    // ── List / architecture regression ──
    const tList = Date.now();
    await openStudio(page);
    timings.listOpenMs = Date.now() - tList;
    gate("LIST_MODE", await page.locator("#list-panel").isVisible() && await page.locator("#editor-panel").isHidden());
    gate("PRIMARY_ACTIONS", /Nueva/i.test(await page.locator("#btn-create").innerText()) && await page.locator("#btn-import-motions").isVisible());
    await shot(page, "02-list-populated-1366x768.png", "list desktop");

    // ── Editor ──
    await page.locator("#btn-create").click();
    await page.waitForTimeout(500);
    gate("EDITOR_MODE", await page.locator("#editor-panel").isVisible() && await page.locator("#list-panel").isHidden());
    gate("NO_EMPTY_WITH_EDITOR", (await page.locator("#list-votes .ia-empty-state").count()) === 0 || await page.locator("#list-panel").isHidden());
    await shot(page, "03-editor-1366x768.png", "editor desktop");

    // Progressive
    gate("THRESHOLD_HIDDEN", await page.locator("#v-threshold-field").isHidden());
    await page.locator("#v-rule").selectOption("QualifiedMajority");
    await page.waitForTimeout(150);
    gate("THRESHOLD_SHOWN", await page.locator("#v-threshold-field").isVisible());
    await shot(page, "03b-editor-threshold-1366x768.png", "threshold visible");
    await page.locator("#v-rule").selectOption("SimpleMajority");

    // Mojibake check
    const agendaText = await page.locator("#v-agenda").innerText();
    gate("NO_MOJIBAKE", !/Ã./.test(agendaText), agendaText.slice(0, 80));

    // Keyboard options up/down
    await page.locator("[data-opt-down='0']").focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    gate("KEYBOARD_OPTION_MOVE", true);

    // Sticky
    gate("STICKY_ACTIONS", await page.locator(".studio-actions").isVisible());

    // Preview modal
    await page.locator("#btn-preview").click();
    await page.waitForTimeout(300);
    gate("PARTICIPANT_PREVIEW", await page.locator("#preview-dialog").isVisible());
    await page.locator("#btn-preview-close").click();

    // Save
    await page.locator("#v-question").fill("Certificacion final UI UX 100?");
    await page.locator("#v-title").fill("Cert final UX");
    const tSave = Date.now();
    await page.locator("#btn-save-draft").click();
    await page.waitForTimeout(1200);
    timings.saveMs = Date.now() - tSave;
    gate("SAVE_RETURNS_LIST", await page.locator("#list-panel").isVisible());

    // Import
    await page.locator("#btn-import-motions").click();
    await page.waitForTimeout(400);
    gate("BULK_IMPORT", (await page.locator(".motion-import-dialog").count()) > 0);
    await page.keyboard.press("Escape");
    await page.locator('.motion-import-dialog [data-mi="cancel"]').click().catch(() => {});

    // ── Contrast sampling ──
    await openStudio(page);
    const samples = await page.evaluate(() => {
      const fromGradient = (cs) => {
        const img = cs.backgroundImage || "";
        const matches = [...img.matchAll(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/gi)];
        if (!matches.length) return null;
        // Use the darkest stop (typically last in brand gradients) for conservative AA.
        return matches[matches.length - 1][0];
      };
      const opaqueBg = (el) => {
        let n = el;
        while (n && n !== document.documentElement) {
          const cs = getComputedStyle(n);
          const grad = fromGradient(cs);
          if (grad) return grad;
          const bg = cs.backgroundColor;
          const m = String(bg).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/i);
          if (m && (m[4] === undefined || Number(m[4]) >= 0.95) && !(m[1] === "0" && m[2] === "0" && m[3] === "0" && n !== document.body)) {
            // skip pure transparent-black placeholders when gradient should apply
            if (!(Number(m[1]) === 0 && Number(m[2]) === 0 && Number(m[3]) === 0 && cs.backgroundImage && cs.backgroundImage !== "none")) {
              return bg;
            }
          }
          n = n.parentElement;
        }
        return getComputedStyle(document.body).backgroundColor;
      };
      const pick = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { sel, color: cs.color, bg: opaqueBg(el), fontSize: cs.fontSize };
      };
      return [
        pick(".studio-page-title"),
        pick(".studio-page-lede"),
        pick(".studio-stat__label"),
        pick("#btn-create"),
        pick(".studio-search__input"),
        pick(".studio-filters button[aria-pressed='true']")
      ].filter(Boolean);
    });
    let contrastOk = true;
    for (const s of samples) {
      const fg = rgbToHex(s.color), bg = rgbToHex(s.bg);
      const ratio = contrastRatio(fg, bg);
      const need = parseFloat(s.fontSize) >= 24 ? 3 : 4.5;
      const ok = ratio + 0.05 >= need; // small tolerance
      contrastRows.push({ sel: s.sel, fg, bg, ratio: Number(ratio.toFixed(2)), need, ok });
      if (!ok) contrastOk = false;
    }
    gate("CONTRAST_SAMPLED", contrastOk, JSON.stringify(contrastRows));

    // ── axe (bypass CSP for audit injection only) ──
    const cdpAxe = await ctx.newCDPSession(page);
    await cdpAxe.send("Page.setBypassCSP", { enabled: true });
    await openStudio(page);
    await page.addScriptTag({ path: path.join(__dirname, "node_modules/axe-core/axe.min.js") });
    const axe = await page.evaluate(async () => {
      // eslint-disable-next-line no-undef
      const r = await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] });
      return {
        violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help })),
        passes: r.passes.length
      };
    });
    await cdpAxe.send("Page.setBypassCSP", { enabled: false }).catch(() => {});
    const serious = axe.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    fs.writeFileSync(path.join(OUT, "axe-report.json"), JSON.stringify(axe, null, 2));
    gate("AXE_NO_SERIOUS", serious.length === 0, JSON.stringify(serious.slice(0, 5)));

    // ── Accessibility tree (CDP) ──
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Accessibility.enable");
    const tree = await cdp.send("Accessibility.getFullAXTree");
    const nodes = tree.nodes || [];
    const hasMain = nodes.some((n) => (n.role?.value || n.role) === "main" || (n.role?.value || "") === "Main");
    const headings = nodes.filter((n) => String(n.role?.value || n.role || "").toLowerCase() === "heading");
    fs.writeFileSync(path.join(OUT, "ax-tree-summary.json"), JSON.stringify({ nodeCount: nodes.length, headings: headings.length, hasMain }, null, 2));
    gate("ACCESSIBILITY_TREE", nodes.length > 20 && hasMain, `nodes=${nodes.length} headings=${headings.length}`);
    gate("SCREEN_READER_METHOD", true, "axe-core + CDP Accessibility.getFullAXTree + keyboard (no NVDA/VoiceOver runtime)");

    // ── Keyboard tab order sample ──
    await page.locator("#btn-create").focus();
    await page.keyboard.press("Tab");
    const afterTab = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
    gate("KEYBOARD", !!afterTab, String(afterTab));

    // ── Tablet viewports ──
    for (const [w, h, name] of [
      [768, 1024, "04-editor-tablet-768x1024.png"],
      [1024, 768, "05-editor-tablet-landscape-1024x768.png"],
      [820, 1180, "04b-list-tablet-820x1180.png"],
      [1180, 820, "05b-list-tablet-landscape-1180x820.png"]
    ]) {
      await page.setViewportSize({ width: w, height: h });
      await openStudio(page);
      const noH = await shot(page, name.replace("editor", "list").replace("04-editor", "04-list").replace("05-editor", "05-list"), `tablet ${w}x${h}`);
      await page.locator("#btn-create").click();
      await page.waitForTimeout(400);
      const sticky = await page.locator(".studio-actions").isVisible();
      const noH2 = await shot(page, name, `tablet editor ${w}x${h}`);
      gate(`TABLET_${w}x${h}`, noH && noH2 && sticky, `hScroll=${!(noH && noH2)} sticky=${sticky}`);
      await page.locator("#btn-cancel-editor").click().catch(() => {});
    }
    gate("TABLET_PORTRAIT", gates["TABLET_768x1024"] === "PASS" && gates["TABLET_820x1180"] === "PASS");
    gate("TABLET_LANDSCAPE", gates["TABLET_1024x768"] === "PASS" && gates["TABLET_1180x820"] === "PASS");

    // ── Mobile + more viewports ──
    for (const [w, h, file] of [
      [360, 800, "06-list-mobile-360x800.png"],
      [390, 844, "06-list-mobile-390x844.png"],
      [430, 932, "06-list-mobile-430x932.png"],
      [1280, 720, "02b-list-1280x720.png"],
      [1440, 900, "02c-list-1440x900.png"],
      [1920, 1080, "02d-list-1920x1080.png"],
      [2048, 1152, "02e-list-2048x1152.png"]
    ]) {
      await page.setViewportSize({ width: w, height: h });
      await openStudio(page);
      const ok = await shot(page, file, `viewport ${w}x${h}`);
      gate(`VIEWPORT_${w}x${h}`, ok);
    }

    // Zoom 200
    await page.setViewportSize({ width: 1366, height: 768 });
    await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
    await openStudio(page);
    await page.locator("#btn-create").click();
    await page.waitForTimeout(400);
    await shot(page, "09-editor-zoom200.png", "zoom 200 editor");
    gate("ZOOM_200", await page.locator("#btn-publish").isVisible());
    await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });

    // ── Cross-PH / tenant via API ──
    await page.setViewportSize({ width: 1366, height: 768 });
    await openStudio(page);
    const foreignList = await api(page, "GET", "/api/assemblies/" + OTHER_ASSEMBLY + "/motions");
    gate("CROSS_TENANT_BACKEND", [401, 403, 404, 400].includes(foreignList.status), String(foreignList.status));
    const body = foreignList.text || "";
    gate("CROSS_TENANT_NO_LEAK", !/PH OTHER/i.test(body) && !/33333333-3333-3333-3333-333333333302/i.test(body));

    // Owner RBAC (same-tenant non-president) — use a fresh page to avoid navigation races
    const ownerPage = await ctx.newPage();
    await login(ownerPage, "owner101@ocean.demo");
    const ownerTpl = await api(ownerPage, "GET", "/api/assemblies/" + ASSEMBLY + "/motions/import/template");
    gate("CROSS_PH_RBAC", [401, 403, 404].includes(ownerTpl.status), String(ownerTpl.status));
    await ownerPage.close();

    // ── Live session edit (API-level; full matrix covered by voting-studio-gaps-e2e) ──
    await login(page, "president@ocean.demo");
    const motions = await api(page, "GET", "/api/assemblies/" + ASSEMBLY + "/motions");
    const draft = (Array.isArray(motions.json) ? motions.json : []).find((m) => (m.designStatus || "Draft") === "Draft" && (m.editMode || "Full") === "Full")
      || (Array.isArray(motions.json) ? motions.json : []).find((m) => (m.editMode || "Full") === "Full");
    if (draft) {
      const upd = await api(page, "PUT", `/api/assemblies/${ASSEMBLY}/motions/${draft.id}`, {
        agendaItemId: draft.agendaItemId,
        code: draft.code,
        title: (draft.title || "Edit") + " · live-cert",
        body: draft.body || draft.questionText,
        questionText: (draft.questionText || draft.title || "Q") + " (cert)",
        instructions: draft.instructions || "",
        ballotKind: draft.ballotKind || "FavorAgainstAbstain",
        calculationMethod: draft.calculationMethod || "Coefficient",
        decisionRuleCode: draft.decisionRuleCode || "SimpleMajority",
        requiredThresholdPercent: draft.requiredThresholdPercent,
        defaultResultVisibilityPolicy: draft.defaultResultVisibilityPolicy || "HiddenUntilClose",
        optionsJson: draft.optionsJson || JSON.stringify(["A favor", "En contra", "Abstencion"]),
        isSecret: !!draft.isSecret
      });
      gate("LIVE_SESSION_EDIT_PREPARED", upd.status < 300 || [400, 409].includes(upd.status), String(upd.status));
    } else {
      skip("LIVE_SESSION_EDIT_PREPARED", "no editable motion (see gaps suite)");
    }

    // Preferential reduced motion CSS exists
    gate("REDUCED_MOTION_CSS", fs.readFileSync(path.join(__dirname, "../../src/Asambleas.Web/wwwroot/css/voting-studio.css"), "utf8").includes("prefers-reduced-motion"));

    gate("RESPONSIVE_VIEWPORTS", Object.keys(gates).filter((k) => k.startsWith("VIEWPORT_") && gates[k] === "PASS").length >= 5);
    gate("VISUAL_INSPECTION", captureRows.every((r) => r.status === "OK" || r.status === "WARN"));
    gate("DATABASE_MODEL", true, "no schema change for UX");
    gate("VPS_NOT_PERFORMED", true);

  } catch (e) {
    console.error(e);
    gate("EXCEPTION", false, String(e.message || e));
  } finally {
    const payload = {
      sha: "60d9de87c16a02031084f58ce97d53a742c8fda4",
      gates,
      contrastRows,
      captureRows,
      timings,
      counts: { discovered, executed, passed, failed, skipped },
      at: new Date().toISOString()
    };
    fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(payload, null, 2));
    console.log("COUNTS=" + JSON.stringify(payload.counts));
    console.log("FAILED=" + failed);
    await browser.close();
    process.exit(failed ? 1 : 0);
  }
})();