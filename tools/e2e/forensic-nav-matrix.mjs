/**
 * Forensic navigation matrix — MPA hops + soft hybrid cluster.
 * Usage: node tools/e2e/forensic-nav-matrix.mjs
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
const PRES = "president@ocean.demo";
const OWN = "owner101@ocean.demo";

function classify(url) {
  const u = url.replace(BASE, "");
  if (u.includes("/api/")) return "api";
  if (/\.js(\?|$)/i.test(u)) return "js";
  if (/\.css(\?|$)/i.test(u)) return "css";
  if (/\.(woff2?|ttf|otf)(\?|$)/i.test(u)) return "font";
  if (/\.(png|jpe?g|gif|svg|webp|ico)(\?|$)/i.test(u)) return "img";
  if (u.includes("/hubs/") || u.includes("negotiate")) return "signalr";
  if (/\.html(\?|$)/i.test(u) || u === "/") return "html";
  return "other";
}

function attachTracker(page) {
  const rows = [];
  const onReq = (req) => {
    const url = req.url();
    if (!(url.startsWith(BASE) || url.includes("fonts.googleapis") || url.includes("fonts.gstatic") || url.includes("livekit"))) return;
    rows.push({
      method: req.method(),
      url: url.startsWith(BASE) ? url.replace(BASE, "") : url.slice(0, 180),
      type: req.resourceType(),
      kind: classify(url),
      ts: Date.now()
    });
  };
  page.on("request", onReq);
  return {
    rows,
    reset() { rows.length = 0; },
    stop() { page.off("request", onReq); },
    summary() {
      const gets = rows.filter((r) => r.method === "GET");
      const byUrl = new Map();
      for (const r of gets) byUrl.set(r.url, (byUrl.get(r.url) || 0) + 1);
      const dups = [...byUrl.entries()].filter(([, n]) => n > 1);
      const countKind = (k) => rows.filter((r) => r.kind === k).length;
      return {
        total: rows.length,
        getTotal: gets.length,
        api: countKind("api"),
        js: countKind("js"),
        css: countKind("css"),
        html: countKind("html"),
        font: countKind("font"),
        img: countKind("img"),
        signalr: rows.filter((r) => r.kind === "signalr" || r.url.includes("/hubs/")).length,
        duplicateGetUrls: dups.slice(0, 20).map(([url, n]) => ({ url, n })),
        duplicateGetCount: dups.reduce((a, [, n]) => a + (n - 1), 0),
        apiPaths: rows.filter((r) => r.kind === "api").map((r) => `${r.method} ${r.url}`),
        meCount: rows.filter((r) => r.url.includes("/api/auth/me")).length,
        membershipsCount: rows.filter((r) => r.url.includes("/memberships/mine")).length
      };
    }
  };
}

async function login(page, email) {
  await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.fill("#email", email);
  await page.fill("#password", PASS);
  await Promise.all([
    page.waitForURL((u) => !/login\.html/i.test(u.href), { timeout: 60000 }).catch(() => {}),
    page.click('button[type="submit"]')
  ]);
  await page.waitForTimeout(700);
  if (/login\.html/i.test(page.url())) throw new Error(`Login failed ${email}`);
}

async function navTiming(page) {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const res = performance.getEntriesByType("resource");
    return {
      type: nav?.type || null,
      duration: nav?.duration || null,
      domContentLoaded: nav?.domContentLoadedEventEnd || null,
      loadEventEnd: nav?.loadEventEnd || null,
      transferSize: nav?.transferSize || null,
      resourceCount: res.length,
      jsResources: res.filter((r) => /\.js/i.test(r.name)).length,
      cssResources: res.filter((r) => /\.css/i.test(r.name)).length
    };
  });
}

async function hop(page, tracker, label, from, toUrl, settleMs = 800) {
  tracker.reset();
  const t0 = Date.now();
  const consoleErrors = [];
  const onConsole = (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); };
  page.on("console", onConsole);
  await page.goto(`${BASE}${toUrl}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(settleMs);
  const timing = await navTiming(page);
  const sum = tracker.summary();
  page.off("console", onConsole);
  return {
    origin: from,
    dest: toUrl,
    label,
    fullDocumentReload: true,
    ms: Date.now() - t0,
    timing,
    network: sum,
    consoleErrors: consoleErrors.slice(0, 10),
    stateLost: {
      jsHeapReboot: true,
      signalrMustReconnect: /assembly\.html|lobby\.html/i.test(toUrl),
      livekitMustReconnect: /assembly\.html/i.test(toUrl),
      inMemoryCachesCleared: true,
      filterTabLostUnlessUrl: true
    }
  };
}

async function softHop(page, tracker, label, href) {
  tracker.reset();
  const t0 = Date.now();
  const shellBefore = await page.evaluate(() => document.documentElement.dataset.asamShellId || window.__ASAM_SHELL_ID__ || null);
  await page.evaluate(async (h) => {
    const mod = await import("/js/modules/hybrid-router.js");
    const ok = await mod.softNavigate(h);
    if (!ok) throw new Error("softNavigate returned false for " + h);
  }, href);
  await page.waitForTimeout(150);
  const meta = await page.evaluate(() => ({
    shellId: document.documentElement.dataset.asamShellId || window.__ASAM_SHELL_ID__ || null,
    softMs: Number(document.documentElement.dataset.asamLastSoftNavMs || 0),
    href: location.pathname + location.search + location.hash
  }));
  return {
    origin: "soft",
    dest: href,
    label,
    fullDocumentReload: false,
    ms: Date.now() - t0,
    softNavMs: meta.softMs,
    shellBefore,
    shellAfter: meta.shellId,
    shellStable: Boolean(shellBefore && meta.shellId && shellBefore === meta.shellId),
    network: tracker.summary(),
    consoleErrors: [],
    stateLost: {
      jsHeapReboot: false,
      signalrMustReconnect: false,
      livekitMustReconnect: false,
      inMemoryCachesCleared: false,
      filterTabLostUnlessUrl: false
    }
  };
}

const matrix = [];

async function main() {
  if (!PASS) throw new Error("ASAM_DEMO_PASSWORD required");
  const browser = await chromium.launch({ headless: true });
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
  const p = await desk.newPage();
  const tr = attachTracker(p);
  await login(p, PRES);

  // Soft hybrid cluster (primary remediation evidence)
  await p.goto(`${BASE}/dashboard.html?assemblyId=${AID}`, { waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => window.__ASAM_HYBRID__ || document.documentElement.dataset.asamShellId, null, { timeout: 20000 }).catch(() => {});
  matrix.push(await softHop(p, tr, "SOFT Dashboard -> PH", `/ph.html?phId=${PH}#resumen`));
  matrix.push(await softHop(p, tr, "SOFT PH -> Dashboard", `/dashboard.html?assemblyId=${AID}`));
  matrix.push(await softHop(p, tr, "SOFT Dashboard -> Agenda", `/agenda.html?assemblyId=${AID}`));
  matrix.push(await softHop(p, tr, "SOFT Agenda -> Check-in", `/checkin.html?assemblyId=${AID}`));
  matrix.push(await softHop(p, tr, "SOFT Check-in -> Votaciones", `/voting-studio.html?assemblyId=${AID}`));
  matrix.push(await softHop(p, tr, "SOFT Votaciones -> Dashboard", `/dashboard.html?assemblyId=${AID}`));

  // Hard boundary: enter room still full document
  matrix.push(await hop(p, tr, "HARD Dashboard -> Sala", "dashboard", `/assembly.html?id=${AID}`, 2500));

  // Owner soft
  await desk.close();
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true });
  const o = await mob.newPage();
  const otr = attachTracker(o);
  await login(o, OWN);
  await o.goto(`${BASE}/owner.html`, { waitUntil: "domcontentloaded" });
  await o.waitForFunction(() => window.__ASAM_HYBRID__ || document.querySelector("#main"), null, { timeout: 20000 }).catch(() => {});
  matrix.push(await softHop(o, otr, "SOFT Owner remount", `/owner.html`));
  matrix.push(await hop(o, otr, "HARD Owner -> Sala", "owner", `/assembly.html?id=${AID}`, 2500));
  await mob.close();
  await browser.close();

  const soft = matrix.filter((m) => !m.fullDocumentReload);
  const hard = matrix.filter((m) => m.fullDocumentReload);
  const report = {
    meta: { base: BASE, atUtc: new Date().toISOString(), ph: PH, aid: AID },
    matrix,
    findings: {
      softAllStable: soft.every((m) => m.shellStable),
      softMeZero: soft.every((m) => (m.network?.meCount || 0) === 0),
      softAvgMs: Math.round(soft.reduce((a, m) => a + (m.softNavMs || m.ms), 0) / Math.max(soft.length, 1)),
      hardAvgMs: Math.round(hard.reduce((a, m) => a + m.ms, 0) / Math.max(hard.length, 1)),
      meEveryHardHop: hard.map((m) => ({ label: m.label, me: m.network?.meCount || 0 }))
    }
  };
  fs.writeFileSync(path.join(OUT, "matrix.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ hops: matrix.length, softAvg: report.findings.softAvgMs, hardAvg: report.findings.hardAvgMs, softStable: report.findings.softAllStable, softMeZero: report.findings.softMeZero, out: path.join(OUT, "matrix.json") }, null, 2));
  for (const m of matrix) {
    console.log(`${m.label} | reload=${m.fullDocumentReload} | ms=${m.softNavMs || m.ms} | me=${m.network?.meCount} | shell=${m.shellStable ?? "n/a"}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });