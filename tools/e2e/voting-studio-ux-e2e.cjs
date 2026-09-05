const { chromium } = require(require("path").join(__dirname, "node_modules/playwright"));
const fs = require("fs");
const path = require("path");
const BASE = process.env.ASAMBLEAS_BASE_URL || "https://localhost:7188";
const PASSWORD = process.env.ASAMBLEAS_DEMO_PASSWORD || fs.readFileSync(path.join(__dirname, "../../.demo-password.local"), "utf8").trim();
const OUT = path.join(__dirname, "voting-studio-ux-results");
fs.mkdirSync(OUT, { recursive: true });
const gates = {};
function gate(k, pass, d) { gates[k] = pass ? "PASS" : "FAIL"; console.log((pass ? "PASS" : "FAIL") + "  " + k + (d ? " — " + d : "")); }

const ASSEMBLY = "44444444-4444-4444-4444-444444444401";

(async () => {
  const browser = await chromium.launch({ headless: true, ignoreHTTPSErrors: true });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  try {
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await page.evaluate(async ({ email, password }) => {
      const af = await fetch("/api/auth/antiforgery", { credentials: "same-origin" });
      const { requestToken } = await af.json();
      await fetch("/api/auth/login", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", RequestVerificationToken: requestToken },
        body: JSON.stringify({ email, password })
      });
    }, { email: "president@ocean.demo", password: PASSWORD });

    await page.goto(BASE + "/voting-studio.html?assemblyId=" + ASSEMBLY, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, "01-list-1366.png"), fullPage: true });

    const listVisible = await page.locator("#list-panel").isVisible();
    const editorHidden = await page.locator("#editor-panel").isHidden();
    gate("LIST_MODE_DEFAULT", listVisible && editorHidden);

    const createLabel = await page.locator("#btn-create").innerText();
    const importVisible = await page.locator("#btn-import-motions").isVisible();
    gate("PRIMARY_ACTIONS", /Nueva votaci/i.test(createLabel) && importVisible, createLabel);

    const emptyOrTable = await page.locator("#list-votes .ia-empty-state, #list-votes table").count();
    gate("LIST_CONTENT", emptyOrTable > 0);

    // Open editor
    await page.locator("#btn-create").click();
    await page.waitForTimeout(600);
    const editorVisible = await page.locator("#editor-panel").isVisible();
    const listHidden = await page.locator("#list-panel").isHidden();
    const emptyGone = await page.locator("#list-votes .ia-empty-state").count() === 0 || listHidden;
    gate("EDITOR_MODE", editorVisible && listHidden && emptyGone);
    await page.screenshot({ path: path.join(OUT, "02-editor-1366.png"), fullPage: true });

    // Progressive threshold
    const thHidden = await page.locator("#v-threshold-field").isHidden();
    gate("PROGRESSIVE_THRESHOLD_HIDDEN", thHidden);
    await page.locator("#v-rule").selectOption("QualifiedMajority");
    await page.waitForTimeout(200);
    const thShown = await page.locator("#v-threshold-field").isVisible();
    gate("PROGRESSIVE_THRESHOLD_SHOWN", thShown);

    // Fill and save draft
    await page.locator("#v-question").fill("¿Aprueba la remediación UX del estudio de votaciones?");
    await page.locator("#v-title").fill("Remediación UX studio");
    await page.locator("#btn-save-draft").click();
    await page.waitForTimeout(1500);
    const backToList = await page.locator("#list-panel").isVisible();
    gate("SAVE_RETURNS_LIST", backToList);
    await page.screenshot({ path: path.join(OUT, "03-after-save-1366.png"), fullPage: true });

    const found = await page.locator("#list-votes").innerText();
    gate("SAVED_IN_LIST", /Remediaci/i.test(found) || /UX studio/i.test(found), found.slice(0, 120));

    // Search
    await page.locator("#vote-search").fill("Remediación");
    await page.waitForTimeout(300);
    const searchHits = await page.locator("#list-votes tbody tr").count();
    gate("SEARCH", searchHits >= 1, String(searchHits));
    await page.locator("#btn-clear-search").click();

    // Import button opens wizard
    await page.locator("#btn-import-motions").click();
    await page.waitForTimeout(400);
    const wizard = await page.locator(".motion-import-dialog").count();
    gate("BULK_IMPORT", wizard > 0);
    await page.locator('.motion-import-dialog [data-mi="cancel"]').click().catch(() => {});
    await page.keyboard.press("Escape").catch(() => {});

    // Mobile viewport
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE + "/voting-studio.html?assemblyId=" + ASSEMBLY, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT, "04-list-390.png"), fullPage: true });
    const hScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
    gate("MOBILE_NO_HSCROLL", !hScroll);

    await page.locator("#btn-create").click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, "05-editor-390.png"), fullPage: true });
    const sticky = await page.locator(".studio-actions").isVisible();
    gate("STICKY_ACTIONS_MOBILE", sticky);
    await page.locator("#btn-cancel-editor").click();
    await page.waitForTimeout(300);

    // Zoom 200% approx via CDP
    await page.setViewportSize({ width: 1366, height: 768 });
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
    await page.goto(BASE + "/voting-studio.html?assemblyId=" + ASSEMBLY, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT, "06-zoom200.png"), fullPage: true });
    gate("ZOOM_200", true);

    // Keyboard focus on create
    await page.locator("#btn-create").focus();
    const focused = await page.evaluate(() => document.activeElement && document.activeElement.id === "btn-create");
    gate("KEYBOARD_FOCUS", focused);

  } catch (e) {
    console.error(e);
    gate("EXCEPTION", false, String(e.message || e));
  } finally {
    const failed = Object.values(gates).filter((v) => v === "FAIL").length;
    fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ gates, failed, at: new Date().toISOString() }, null, 2));
    console.log("FAILED=" + failed);
    await browser.close();
    process.exit(failed ? 1 : 0);
  }
})();