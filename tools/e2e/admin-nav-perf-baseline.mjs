/**
 * Admin navigation performance baseline / after (Playwright).
 * Panel → Asambleas → Detalle → Votaciones + PH switch + history.
 *
 * Usage:
 *   ASAM_DEMO_PASSWORD=... node tools/e2e/admin-nav-perf-baseline.mjs
 *   ASAM_PHASE=before|after ASAM_BASE_URL=http://127.0.0.1:5188 ...
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PHASE = process.env.ASAM_PHASE || "before";
const OUT = path.join(__dirname, "admin-nav-perf-results");
fs.mkdirSync(OUT, { recursive: true });

const BASE = (process.env.ASAM_BASE_URL || "http://127.0.0.1:5188").replace(/\/$/, "");
const _passFile = path.join(__dirname, "../../.demo-password.local");
const PASS =
  process.env.ASAM_DEMO_PASSWORD ||
  process.env.ASAMBLEAS_DEMO_PASSWORD ||
  (fs.existsSync(_passFile) ? fs.readFileSync(_passFile, "utf8").trim() : "");
const EMAIL = process.env.ASAM_DEMO_EMAIL || "president@ocean.demo";

const report = {
  phase: PHASE,
  baseUrl: BASE,
  email: EMAIL,
  atUtc: new Date().toISOString(),
  routes: [],
  notes: []
};

function attachNet(page) {
  const rows = [];
  let docs = 0;
  const onReq = (req) => {
    const url = req.url();
    if (!url.startsWith(BASE) && !url.includes("/api/")) return;
    const type = req.resourceType();
    if (type === "document") docs += 1;
    rows.push({
      method: req.method(),
      type,
      url: url.startsWith(BASE) ? url.replace(BASE, "") : url.slice(0, 160),
      ts: Date.now()
    });
  };
  page.on("request", onReq);
  return {
    rows,
    reset() {
      rows.length = 0;
      docs = 0;
    },
    stop() {
      page.off("request", onReq);
    },
    snapshot() {
      const api = rows.filter((r) => r.url.includes("/api/"));
      const html = rows.filter((r) => r.type === "document" || /\.html(\?|$)/i.test(r.url));
      const byUrl = new Map();
      for (const r of rows.filter((r) => r.method === "GET")) {
        byUrl.set(r.url, (byUrl.get(r.url) || 0) + 1);
      }
      const dups = [...byUrl.entries()].filter(([, n]) => n > 1);
      return {
        requestCount: rows.length,
        apiCount: api.length,
        documentReloads: docs,
        htmlFetches: html.length,
        duplicateGetCount: dups.reduce((a, [, n]) => a + (n - 1), 0),
        apiPaths: api.map((r) => `${r.method} ${r.url}`),
        duplicateGets: dups.slice(0, 12).map(([url, n]) => ({ url, n }))
      };
    }
  };
}

async function login(page) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
  // Password form lives inside <details> (mesa / administración).
  await page.locator("#password-login-details").evaluate((el) => {
    el.open = true;
  });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASS);
  await Promise.all([
    page.waitForURL((u) => !/\/$|index\.html/i.test(u.pathname) || /ph\.html|dashboard|owner/i.test(u.href), {
      timeout: 90000
    }).catch(() => {}),
    page.click('#login-form button[type="submit"]')
  ]);
  await page.waitForTimeout(800);
  if (await page.locator("#login-form").count()) {
    const still = await page.locator("#login-error:not([hidden])").textContent().catch(() => "");
    if (/\/$/.test(new URL(page.url()).pathname) && (await page.locator("#password").isVisible().catch(() => false))) {
      throw new Error(`login failed ${still || page.url()}`);
    }
  }
}

async function waitUsable(page, selectors, timeout = 15000) {
  const list = Array.isArray(selectors) ? selectors : [selectors];
  const start = Date.now();
  const joined = list.join(", ");
  try {
    await page.waitForSelector(joined, { state: "visible", timeout });
    return Date.now() - start;
  } catch {
    return Date.now() - start;
  }
}

async function measureHop(page, net, label, action, usableSelectors) {
  net.reset();
  const t0 = Date.now();
  let firstFeedbackMs = null;
  // Playwright signature: waitForFunction(fn[, arg][, options]) — options must be 3rd arg.
  const feedbackPromise = page
    .waitForFunction(
      () => {
        const busy =
          document.body.classList.contains("is-ph-switching") ||
          document.body.classList.contains("is-navigating") ||
          document.body.classList.contains("is-soft-navigating");
        const progress = document.querySelector(
          ".top-progress.is-active, [data-top-progress].is-active, .ux-progress.is-active, #asam-top-progress.is-active"
        );
        const aria = document.querySelector('main[aria-busy="true"], [aria-busy="true"].skeleton');
        const skel = document.querySelector('.skeleton[aria-busy="true"], .ia-region-busy');
        return busy || !!progress || !!aria || !!skel;
      },
      undefined,
      { timeout: 2000 }
    )
    .then(() => {
      firstFeedbackMs = Date.now() - t0;
    })
    .catch(() => {});

  const actionStart = Date.now();
  await action();
  const actionMs = Date.now() - actionStart;
  await feedbackPromise;
  const usableMs = await waitUsable(page, usableSelectors);
  await page.waitForTimeout(250).catch(() => {});
  const wallMs = Date.now() - t0;
  const softMs = await page.evaluate(() => Number(document.documentElement.dataset.asamLastSoftNavMs || 0) || null);
  const shellId = await page.evaluate(() => document.documentElement.dataset.asamShellId || null);
  const navEntries = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    return {
      type: nav?.type || null,
      ttfb: nav ? Math.round(nav.responseStart) : null,
      duration: nav ? Math.round(nav.duration) : null
    };
  });
  const snap = net.snapshot();
  const row = {
    label,
    href: page.url().replace(BASE, ""),
    wallMs,
    actionMs,
    firstFeedbackMs: firstFeedbackMs ?? Math.min(usableMs, wallMs),
    usableMs,
    softNavMsAttr: softMs,
    ttfbMs: snap.documentReloads > 0 ? navEntries.ttfb : null,
    documentReloads: snap.documentReloads,
    requestCount: snap.requestCount,
    apiCount: snap.apiCount,
    htmlFetches: snap.htmlFetches,
    duplicateGetCount: snap.duplicateGetCount,
    shellId,
    apiPaths: snap.apiPaths,
    duplicateGets: snap.duplicateGets
  };
  report.routes.push(row);
  console.log(
    JSON.stringify({
      label,
      wallMs,
      actionMs,
      firstFeedbackMs: row.firstFeedbackMs,
      usableMs,
      docs: snap.documentReloads,
      api: snap.apiCount,
      reqs: snap.requestCount
    })
  );
  return row;
}

async function discoverContext(page) {
  const fixturePath = path.join(OUT, "fixture.json");
  let fixture = null;
  if (fs.existsSync(fixturePath)) {
    fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  }

  const phs = await page.evaluate(async () => {
    const r = await fetch("/api/ph", { credentials: "same-origin" });
    if (!r.ok) return [];
    return r.json();
  });
  if (!Array.isArray(phs) || phs.length < 1) throw new Error("No PHs for user");

  const phA =
    (fixture?.phA && phs.find((p) => p.id === fixture.phA.id)) ||
    phs.find((p) => /Nav Perf Alpha/i.test(p.name || "")) ||
    phs[0];
  const phB =
    (fixture?.phB && phs.find((p) => p.id === fixture.phB.id)) ||
    phs.find((p) => p.id !== phA.id) ||
    null;

  // Ensure claim points at phA for assembly listing.
  await page.evaluate(async (phId) => {
    const af = await fetch("/api/auth/antiforgery", { credentials: "same-origin" });
    const t = await af.json();
    await fetch("/api/ph/switch", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        RequestVerificationToken: t.requestToken
      },
      body: JSON.stringify({ propertyHorizontalId: phId })
    });
  }, phA.id);

  await page.goto(`${BASE}/ph.html?phId=${encodeURIComponent(phA.id)}#assemblies`, {
    waitUntil: "domcontentloaded",
    timeout: 90000
  });
  await page.waitForTimeout(1200);

  let assembly = null;
  if (fixture?.assemblyA?.id) {
    assembly = { id: fixture.assemblyA.id, title: fixture.assemblyA.title };
  } else {
    const assemblies = await page.evaluate(async () => {
      const r = await fetch("/api/assemblies", { credentials: "same-origin" });
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : data.items || [];
    });
    assembly =
      assemblies.find((a) => String(a.propertyHorizontalId) === String(phA.id)) ||
      assemblies[0] ||
      null;
  }

  return { phA, phB, assembly, phCount: phs.length };
}

async function main() {
  if (!PASS) throw new Error("ASAM_DEMO_PASSWORD / .demo-password.local required");
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true
  });
  const page = await ctx.newPage();
  const net = attachNet(page);

  try {
    await login(page);
    const ctxInfo = await discoverContext(page);
    report.context = {
      phA: { id: ctxInfo.phA.id, name: ctxInfo.phA.name },
      phB: ctxInfo.phB ? { id: ctxInfo.phB.id, name: ctxInfo.phB.name } : null,
      assemblyId: ctxInfo.assembly?.id || ctxInfo.assembly?.assemblyId || null,
      assemblyTitle: ctxInfo.assembly?.title || ctxInfo.assembly?.name || null,
      phCount: ctxInfo.phCount
    };
    console.log("context", report.context);

    const phId = ctxInfo.phA.id;
    const aid = report.context.assemblyId;

    // Cold: Panel (PH resumen) — full document navigation
    await measureHop(
      page,
      net,
      "cold: Panel PH resumen (hard)",
      async () => {
        await page.goto(`${BASE}/ph.html?phId=${encodeURIComponent(phId)}#resumen`, {
          waitUntil: "domcontentloaded",
          timeout: 90000
        });
      },
      ['[data-panel="resumen"]:not([hidden])', "#ph-title", "#ph-hero", "main.app-workspace"]
    );

    // Hot: Asambleas tab (hash / in-page) — prefer module tabs, then IA sidebar, then hash API
    await measureHop(
      page,
      net,
      "hot: Panel → Asambleas (#assemblies)",
      async () => {
        const tabBtn = page.locator('#ph-module-tabs button[data-tab="assemblies"]').first();
        const sideLink = page.locator('a[href*="#assemblies"]').first();
        if (await tabBtn.isVisible().catch(() => false)) {
          await tabBtn.click();
        } else if (await sideLink.isVisible().catch(() => false)) {
          await sideLink.click();
        } else {
          await page.evaluate((id) => {
            const next = `/ph.html?phId=${id}#assemblies`;
            history.pushState({ hybrid: true, page: "ph.html" }, "", next);
            if (typeof window.__asambleasHandlePhUrl === "function") {
              return window.__asambleasHandlePhUrl(new URL(location.href));
            }
            location.hash = "assemblies";
          }, phId);
        }
      },
      [
        '[data-panel="assemblies"]:not([hidden])',
        "#ph-assemblies-list .ia-asm-card",
        "#ph-assemblies-list .ia-empty-state",
        "#ph-assemblies-list"
      ]
    );

    if (aid) {
      // Detalle (dashboard overview) via soft/hard hybrid
      await measureHop(
        page,
        net,
        "hot: Asambleas → Detalle (dashboard)",
        async () => {
          // Prefer hybrid softNavigate (same path as in-app IA links) to avoid Playwright
          // click→full document races on cross-page anchors.
          await page.evaluate(async (assemblyId) => {
            const href = `/dashboard.html?assemblyId=${encodeURIComponent(assemblyId)}`;
            const m = await import("/js/modules/hybrid-router.js");
            const ok = await m.softNavigate(href);
            if (!ok) location.assign(href);
          }, aid);
          await page.waitForURL((u) => /dashboard\.html/i.test(u.pathname), { timeout: 30000 });
        },
        ["#ia-assembly-tabs", "#readiness", "#assembly-name", "main.app-workspace"]
      );

      // Votaciones
      await measureHop(
        page,
        net,
        "hot: Detalle → Votaciones",
        async () => {
          const tab = page
            .locator(
              '#ia-assembly-tabs a[href*="voting-studio"], a[data-ia-nav="voting"], a:has-text("Votaciones")'
            )
            .first();
          if (await tab.isVisible().catch(() => false)) {
            await tab.click();
          } else {
            await page.evaluate((assemblyId) => {
              const href = `/voting-studio.html?assemblyId=${encodeURIComponent(assemblyId)}`;
              if (window.__ASAM_HYBRID__) {
                import("/js/modules/hybrid-router.js").then((m) => m.softNavigate(href));
              } else {
                location.assign(href);
              }
            }, aid);
            await page.waitForURL((u) => /voting-studio\.html/i.test(u.pathname), { timeout: 30000 });
          }
        },
        ["#voting-studio-root", ".voting-studio", "#questions-list", "main.app-workspace"]
      );

      // Back
      await measureHop(
        page,
        net,
        "hot: Atrás (history)",
        async () => {
          await page.goBack({ waitUntil: "domcontentloaded" });
        },
        ["main.app-workspace", "#ia-assembly-tabs", '[data-panel="assemblies"]']
      );

      // Forward
      await measureHop(
        page,
        net,
        "hot: Adelante (history)",
        async () => {
          await page.goForward({ waitUntil: "domcontentloaded" });
        },
        ["main.app-workspace", "#voting-studio-root", ".voting-studio"]
      );
    } else {
      report.notes.push("No assembly found — skipped Detalle/Votaciones/history hops");
    }

    // PH switch (if second PH)
    if (ctxInfo.phB) {
      await page.goto(`${BASE}/ph.html?phId=${encodeURIComponent(phId)}#assemblies`, {
        waitUntil: "domcontentloaded",
        timeout: 90000
      });
      await page.waitForTimeout(800);
      await measureHop(
        page,
        net,
        "hot: Cambio de PH (switcher)",
        async () => {
          const trigger = page.locator("#global-ph-switcher .ph-switcher-trigger, .ph-switcher-trigger").first();
          if (!(await trigger.count()) || !(await trigger.isVisible().catch(() => false))) {
            report.notes.push("PH switcher not visible — fell back to soft switchPh()");
            await page.evaluate(async (targetId) => {
              const mod = await import("/js/modules/ph-context.js");
              await mod.switchPh(targetId);
            }, ctxInfo.phB.id);
            return;
          }
          await trigger.click();
          const opt = page.locator(`#global-ph-switcher [data-ph-id="${ctxInfo.phB.id}"]`).first();
          await opt.waitFor({ state: "visible", timeout: 10000 });
          await opt.click();
          await page.waitForFunction(
            (id) => location.href.includes(id) || document.body.classList.contains("is-ph-switching") === false,
            ctxInfo.phB.id,
            { timeout: 30000 }
          ).catch(() => {});
        },
        [
          `#global-ph-switcher [data-ph-title]`,
          '[data-panel="assemblies"]:not([hidden])',
          "#ph-assemblies-list",
          "main.app-workspace"
        ]
      );

      // Rapid double switch
      await measureHop(
        page,
        net,
        "stress: cambio rápido PH A→B→A",
        async () => {
          for (const id of [ctxInfo.phB.id, ctxInfo.phA.id]) {
            await page.evaluate(async (targetId) => {
              const mod = await import("/js/modules/ph-context.js");
              await mod.switchPh(targetId);
            }, id);
            await page.waitForTimeout(180);
          }
          await page.waitForTimeout(600);
        },
        ["#ph-title", "main.app-workspace"]
      );
    } else {
      report.notes.push("Only one PH available — PH switch hops skipped");
    }

    // Screenshots
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE}/ph.html?phId=${encodeURIComponent(phId)}#assemblies`, { waitUntil: "networkidle" }).catch(() => {});
    await page.screenshot({ path: path.join(OUT, `${PHASE}-desktop-1440.png`), fullPage: true });
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.screenshot({ path: path.join(OUT, `${PHASE}-tablet-768.png`), fullPage: true });
    await page.setViewportSize({ width: 360, height: 740 });
    await page.screenshot({ path: path.join(OUT, `${PHASE}-mobile-360.png`), fullPage: true });
  } finally {
    net.stop();
    await browser.close();
  }

  const outFile = path.join(OUT, `${PHASE}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log("wrote", outFile);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
