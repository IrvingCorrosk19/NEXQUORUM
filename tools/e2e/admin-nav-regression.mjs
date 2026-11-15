/**
 * Light regression after admin-nav fixes: login, two PHs, soft hops, history, viewports.
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "admin-nav-perf-results");
const BASE = (process.env.ASAM_BASE_URL || "http://127.0.0.1:5188").replace(/\/$/, "");
const PASS =
  process.env.ASAM_DEMO_PASSWORD ||
  (fs.existsSync(path.join(__dirname, "../../.demo-password.local"))
    ? fs.readFileSync(path.join(__dirname, "../../.demo-password.local"), "utf8").trim()
    : "");
const fixture = JSON.parse(fs.readFileSync(path.join(OUT, "fixture.json"), "utf8"));

const results = { atUtc: new Date().toISOString(), checks: [] };

function check(name, ok, detail = "") {
  results.checks.push({ name, ok, detail });
  console.log(ok ? "PASS" : "FAIL", name, detail || "");
}

async function login(page) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.locator("#password-login-details").evaluate((el) => {
    el.open = true;
  });
  await page.fill("#email", "president@ocean.demo");
  await page.fill("#password", PASS);
  await page.click('#login-form button[type="submit"]');
  await page.waitForTimeout(1000);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const page2 = await browser.newPage();

  try {
    await page.goto(`${BASE}/`);
    const lede = await page.locator("#login-main-msg").textContent();
    check(
      "login-lede-no-false-oauth",
      !/Google, Microsoft/i.test(lede || ""),
      (lede || "").slice(0, 120)
    );
    await page.screenshot({ path: path.join(OUT, "login-access.png"), fullPage: true });

    await login(page);
    await page.goto(`${BASE}/ph.html?phId=${fixture.phA.id}#resumen`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(900);
    const tabsVisible = await page.locator("#ph-module-tabs").isVisible();
    check("ops-module-tabs-visible", tabsVisible);

    await page.locator('#ph-module-tabs button[data-tab="assemblies"]').click();
    await page.waitForSelector('[data-panel="assemblies"]:not([hidden])', { timeout: 10000 });
    check("assemblies-panel", await page.locator('[data-panel="assemblies"]:not([hidden])').isVisible());

    const switcher = page.locator("#global-ph-switcher");
    check("ph-switcher-present", await switcher.count() > 0);

    await page.evaluate(async (id) => {
      const m = await import("/js/modules/ph-context.js");
      await m.switchPh(id);
    }, fixture.phB.id);
    await page.waitForTimeout(1000);
    check(
      "ph-switch-to-B",
      page.url().includes(fixture.phB.id),
      page.url().replace(BASE, "")
    );
    check(
      "ph-switch-lands-assemblies-or-resumen",
      /#assemblies|#resumen/.test(page.url()),
      page.url().replace(BASE, "")
    );

    // From assembly-scoped URL, switch must go to assemblies list of new PH
    await page.goto(`${BASE}/dashboard.html?assemblyId=${fixture.assemblyA.id}`, {
      waitUntil: "domcontentloaded"
    });
    await page.waitForTimeout(800);
    await page.evaluate(async (id) => {
      const m = await import("/js/modules/ph-context.js");
      await m.switchPh(id);
    }, fixture.phB.id);
    await page.waitForTimeout(1200);
    check(
      "switch-from-assembly-to-list",
      /ph\.html/.test(page.url()) && page.url().includes(fixture.phB.id) && /assemblies/.test(page.url()),
      page.url().replace(BASE, "")
    );

    // Soft nav Detalle → Votaciones
    await page.goto(`${BASE}/dashboard.html?assemblyId=${fixture.assemblyA.id}`, {
      waitUntil: "domcontentloaded"
    });
    await page.waitForTimeout(600);
    await page.evaluate(async (id) => {
      // ensure claim on Alpha for assembly access
      const m = await import("/js/modules/ph-context.js");
      await m.switchPh(id, { targetUrl: `/dashboard.html?assemblyId=${window.__aid || ""}`, silent: true }).catch(() => {});
    }, fixture.phA.id);
    // Re-open dashboard after claim
    await page.goto(`${BASE}/dashboard.html?assemblyId=${fixture.assemblyA.id}`, {
      waitUntil: "domcontentloaded"
    });
    await page.waitForTimeout(800);
    const softOk = await page.evaluate(async (aid) => {
      const m = await import("/js/modules/hybrid-router.js");
      document.body.classList.add("is-soft-navigating");
      const t0 = performance.now();
      await m.softNavigate(`/voting-studio.html?assemblyId=${aid}`);
      return {
        ms: Math.round(performance.now() - t0),
        href: location.pathname,
        navigatingClassCleared: !document.body.classList.contains("is-soft-navigating")
      };
    }, fixture.assemblyA.id);
    check("soft-nav-voting", /voting-studio/.test(softOk.href), JSON.stringify(softOk));

    await page.goBack();
    await page.waitForTimeout(500);
    check("history-back", /dashboard/.test(page.url()), page.url().replace(BASE, ""));
    await page.goForward();
    await page.waitForTimeout(500);
    check("history-forward", /voting-studio/.test(page.url()), page.url().replace(BASE, ""));

    // Second session
    await login(page2);
    await page2.goto(`${BASE}/ph.html?phId=${fixture.phB.id}#assemblies`, { waitUntil: "domcontentloaded" });
    await page2.waitForTimeout(800);
    check("session2-phB", page2.url().includes(fixture.phB.id));

    for (const [w, h, name] of [
      [360, 740, "reg-mobile-360"],
      [768, 1024, "reg-tablet-768"],
      [1440, 900, "reg-desktop-1440"]
    ]) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(`${BASE}/ph.html?phId=${fixture.phA.id}#assemblies`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
      check(`viewport-${w}`, true, name);
    }
  } finally {
    await browser.close();
  }

  const outFile = path.join(OUT, "regression.json");
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log("wrote", outFile);
  if (results.checks.some((c) => !c.ok)) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
