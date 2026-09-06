/**
 * Hybrid soft-nav measurement (no artificial settle in metrics).
 * Usage: node tools/e2e/forensic-hybrid-soft.mjs
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "forensic-nav-results");
fs.mkdirSync(OUT, { recursive: true });
const BASE = (process.env.ASAM_BASE_URL || "http://127.0.0.1:5188").replace(/\/$/, "");
const PASS = process.env.ASAM_DEMO_PASSWORD || process.env.ASAMBLEAS_DEMO_PASSWORD || "";
const PH = process.env.PH_ID || "33333333-3333-3333-3333-333333333301";
const AID = process.env.ASSEMBLY_ID || "44444444-4444-4444-4444-444444444401";

async function login(page) {
  await page.goto(BASE + "/login.html", { waitUntil: "domcontentloaded" });
  await page.fill("#email", "president@ocean.demo");
  await page.fill("#password", PASS);
  await Promise.all([
    page.waitForURL((u) => !/login\.html/i.test(u.href)).catch(() => {}),
    page.click("button[type=submit]")
  ]);
  await page.waitForTimeout(500);
}

function track(page) {
  const rows = [];
  page.on("request", (req) => {
    const u = req.url();
    if (!u.startsWith(BASE)) return;
    rows.push({ method: req.method(), url: u.replace(BASE, ""), type: req.resourceType(), ts: Date.now() });
  });
  return {
    rows,
    reset() { rows.length = 0; },
    summary() {
      const api = rows.filter((r) => r.url.includes("/api/"));
      const me = api.filter((r) => r.url.includes("/api/auth/me"));
      const js = rows.filter((r) => r.type === "script" || /\.js(\?|$)/.test(r.url));
      const css = rows.filter((r) => r.type === "stylesheet" || /\.css(\?|$)/.test(r.url));
      return { total: rows.length, api: api.length, me: me.length, js: js.length, css: css.length, apiPaths: api.map((r) => r.method + " " + r.url) };
    }
  };
}

async function softNav(page, tr, label, href) {
  tr.reset();
  const shellBefore = await page.evaluate(() => document.documentElement.dataset.asamShellId || window.__ASAM_SHELL_ID__ || null);
  const t0 = Date.now();
  await page.evaluate(async (h) => {
    const mod = await import("/js/modules/hybrid-router.js");
    const ok = await mod.softNavigate(h);
    if (!ok) throw new Error("softNavigate returned false for " + h);
  }, href);
  await page.waitForTimeout(200);
  const meta = await page.evaluate(() => ({
    shellId: document.documentElement.dataset.asamShellId || window.__ASAM_SHELL_ID__ || null,
    softMs: document.documentElement.dataset.asamLastSoftNavMs || null,
    href: location.pathname + location.search + location.hash,
    navType: performance.getEntriesByType("navigation")[0]?.type || null
  }));
  return {
    label,
    wallMs: Date.now() - t0,
    softNavMsAttr: meta.softMs ? Number(meta.softMs) : null,
    shellBefore,
    shellAfter: meta.shellId,
    shellStable: Boolean(shellBefore && meta.shellId && shellBefore === meta.shellId),
    href: meta.href,
    navType: meta.navType,
    network: tr.summary()
  };
}

async function main() {
  if (!PASS) throw new Error("ASAM_DEMO_PASSWORD required");
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const tr = track(page);
  await login(page);

  tr.reset();
  const coldT0 = Date.now();
  await page.goto(BASE + "/dashboard.html?assemblyId=" + AID, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#main", { timeout: 30000 });
  await page.waitForFunction(() => window.__ASAM_HYBRID__ || document.documentElement.dataset.asamShellId, null, { timeout: 20000 }).catch(() => {});
  const cold = {
    label: "cold dashboard load",
    wallMs: Date.now() - coldT0,
    shellId: await page.evaluate(() => document.documentElement.dataset.asamShellId || window.__ASAM_SHELL_ID__),
    hybrid: await page.evaluate(() => Boolean(window.__ASAM_HYBRID__)),
    network: tr.summary()
  };

  const hops = [];
  hops.push(await softNav(page, tr, "Dashboard -> PH soft", "/ph.html?phId=" + PH + "#resumen"));
  hops.push(await softNav(page, tr, "PH -> Dashboard soft", "/dashboard.html?assemblyId=" + AID));
  hops.push(await softNav(page, tr, "Dashboard -> Agenda soft", "/agenda.html?assemblyId=" + AID));
  hops.push(await softNav(page, tr, "Agenda -> Check-in soft", "/checkin.html?assemblyId=" + AID));
  hops.push(await softNav(page, tr, "Check-in -> Votaciones soft", "/voting-studio.html?assemblyId=" + AID));
  hops.push(await softNav(page, tr, "Votaciones -> Dashboard soft", "/dashboard.html?assemblyId=" + AID));

  tr.reset();
  await page.goBack();
  await page.waitForTimeout(400);
  const back = {
    label: "history back",
    network: tr.summary(),
    href: page.url().replace(BASE, ""),
    shellId: await page.evaluate(() => document.documentElement.dataset.asamShellId)
  };

  const report = {
    atUtc: new Date().toISOString(),
    cold,
    hops,
    back,
    criteria: {
      allShellStable: hops.every((h) => h.shellStable),
      softUnder1200: hops.every((h) => (h.softNavMsAttr ?? h.wallMs) <= 1200),
      meZeroOnSoft: hops.every((h) => (h.network?.me || 0) === 0)
    }
  };
  fs.writeFileSync(path.join(OUT, "hybrid-soft.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    coldMs: cold.wallMs,
    hybrid: cold.hybrid,
    shell: cold.shellId,
    hops: hops.map((h) => ({ l: h.label, soft: h.softNavMsAttr, wall: h.wallMs, shell: h.shellStable, me: h.network.me, api: h.network.api, js: h.network.js })),
    criteria: report.criteria
  }, null, 2));
  await browser.close();
  if (!cold.hybrid) process.exit(2);
  if (!report.criteria.allShellStable) process.exit(3);
}

main().catch((e) => { console.error(e); process.exit(1); });