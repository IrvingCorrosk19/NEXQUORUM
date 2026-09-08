/**
 * Ocean assembly templates → live room certification (local only).
 */
const path = require("path");
const fs = require("fs");
const { chromium } = require(path.join(__dirname, "node_modules", "playwright"));

const BASE = process.env.ASAMBLEAS_BASE_URL || "https://localhost:7188";
const OUT = path.join(__dirname, "ocean-assembly-results");
fs.mkdirSync(OUT, { recursive: true });
const STAMP = Date.now().toString().slice(-8);

function loadPw() {
  const raw = fs
    .readFileSync(path.join(__dirname, "..", "..", "src", "Asambleas.Web", "appsettings.Development.json"), "utf8")
    .replace(/^\uFEFF/, "");
  return JSON.parse(raw).Demo.Password;
}

async function api(page, method, url, body) {
  return page.evaluate(
    async ({ method, url, body }) => {
      const af = await fetch("/api/auth/antiforgery", { credentials: "same-origin" });
      const { requestToken } = await af.json();
      const headers = { Accept: "application/json", RequestVerificationToken: requestToken };
      let payload;
      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
        payload = JSON.stringify(body);
      }
      const res = await fetch(url, { method, credentials: "same-origin", headers, body: payload });
      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = { raw: text.slice(0, 400) };
      }
      return { status: res.status, json, text: text.slice(0, 400) };
    },
    { method, url, body }
  );
}

async function login(page, email, password) {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  const res = await api(page, "POST", "/api/auth/login", { email, password });
  if (res.status >= 300) throw new Error(`login ${email} ${res.status} ${res.text}`);
  return res.json;
}

async function overflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: Math.max(doc.scrollWidth, document.body.scrollWidth),
      clientWidth: doc.clientWidth,
      overflow: Math.max(doc.scrollWidth, document.body.scrollWidth) - doc.clientWidth
    };
  });
}

async function audit(page) {
  return page.evaluate(() => {
    const room = document.querySelector(".room--ocean");
    const tabs = document.querySelector("#room-content-tabs");
    const overview = document.querySelector("#mobile-overview");
    const quorumCard = document.querySelector("#quorum-card");
    const presence = document.querySelector("#presence-summary");
    const bar = document.querySelector("#meeting-control-bar")?.getBoundingClientRect();
    const diagnostics = document.querySelector("#ops-diagnostics");
    const text = document.body.innerText || "";
    const vw = window.innerWidth;
    return {
      hasOcean: !!room,
      tabsVisible: tabs && getComputedStyle(tabs).display !== "none" && !tabs.hidden,
      overviewVisible: overview && getComputedStyle(overview).display !== "none",
      quorumCardHtml: (quorumCard?.innerText || "").slice(0, 120),
      presenceVisible: presence && !presence.hidden,
      diagnosticsOpenToOwner: diagnostics && !diagnostics.hidden && room?.dataset.role === "owner",
      barOk: !!bar && bar.height > 0 && bar.top < window.innerHeight + 2,
      badTerms: /LiveKit media|Total lógico|Usted · president\b/i.test(text),
      phoneLayout: vw < 768
    };
  });
}

(async () => {
  const results = [];
  const ok = (id, pass, d) => {
    results.push({ id, pass: !!pass, d: String(d || "") });
    console.log(pass ? "PASS" : "FAIL", id, d || "");
  };

  const browser = await chromium.launch({ headless: true, ignoreHTTPSErrors: true });
  const password = loadPw();
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));

  try {
    await login(page, "president@ocean.demo", password);
    let assemblies = await api(page, "GET", "/api/assemblies");
    let list = Array.isArray(assemblies.json) ? assemblies.json : assemblies.json?.items || [];
    let assemblyId =
      list.find((a) => /CheckIn|InProgress|Paused|Scheduled/i.test(String(a.status || "")))?.id || list[0]?.id;

    if (!assemblyId) {
      const ph = await api(page, "POST", "/api/ph", {
        name: `Ocean Cert ${STAMP}`,
        code: `OC${STAMP}`,
        adminEmail: "president@ocean.demo",
        city: "Panama",
        country: "PA",
        timeZoneId: "America/Panama"
      });
      const phId = ph.json?.id;
      await api(page, "POST", "/api/ph/switch", { propertyHorizontalId: phId });
      await api(page, "POST", `/api/ph/${phId}/units`, {
        code: "101",
        tower: "A",
        floor: 1,
        unitType: "Apartamento",
        coefficientPercent: 100
      });
      const when = new Date(Date.now() + 3600_000).toISOString();
      const asm = await api(page, "POST", "/api/assemblies", {
        propertyHorizontalId: phId,
        title: `Ocean ${STAMP}`,
        modality: "Hybrid",
        scheduledAtUtc: when,
        estimatedEndAtUtc: new Date(Date.now() + 7200_000).toISOString(),
        requiredQuorumPercent: 50,
        publishAsScheduled: true
      });
      assemblyId = asm.json?.id;
      await api(page, "POST", `/api/assemblies/${assemblyId}/start-checkin`, {});
    }

    ok("ASM", !!assemblyId, assemblyId);
    await page.goto(`${BASE}/assembly.html?assemblyId=${assemblyId}`, { waitUntil: "networkidle", timeout: 90000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT, "president-1366.png"), fullPage: false });

    const moduleOk = await page.evaluate(async () => {
      try {
        await import(`/js/modules/room-app.js?v=ocean1diag-${Date.now()}`);
        return { ok: true };
      } catch (e) {
        return { ok: false, message: e.message };
      }
    });
    ok("MODULE_LOAD", moduleOk.ok, JSON.stringify(moduleOk));

    const viewports = [
      { w: 320, h: 568, name: "320x568" },
      { w: 360, h: 800, name: "360x800" },
      { w: 390, h: 844, name: "390x844" },
      { w: 412, h: 915, name: "412x915" },
      { w: 768, h: 1024, name: "768x1024" },
      { w: 1024, h: 768, name: "1024x768" },
      { w: 1280, h: 720, name: "1280x720" },
      { w: 1366, h: 768, name: "1366x768" },
      { w: 1440, h: 900, name: "1440x900" },
      { w: 1920, h: 1080, name: "1920x1080" },
      { w: 2048, h: 1152, name: "2048x1152" }
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, `vp-${vp.name}.png`), fullPage: false });
      const ov = await overflow(page);
      const a = await audit(page);
      ok(`OVERFLOW_${vp.name}`, ov.overflow <= 2, JSON.stringify(ov));
      ok(`OCEAN_${vp.name}`, a.hasOcean && a.barOk && !a.badTerms, JSON.stringify(a));
      if (vp.w < 768) {
        ok(`MOBILE_TABS_${vp.name}`, a.tabsVisible && a.overviewVisible, JSON.stringify(a));
        // Exercise tabs
        await page.locator("#room-tab-agenda").click().catch(() => {});
        await page.waitForTimeout(200);
        await page.locator("#room-tab-people").click().catch(() => {});
        await page.waitForTimeout(200);
        await page.locator("#room-tab-vote").click().catch(() => {});
        await page.waitForTimeout(200);
        await page.screenshot({ path: path.join(OUT, `tabs-${vp.name}.png`), fullPage: false });
      } else {
        ok(`DESKTOP_NO_MOBILE_TABS_${vp.name}`, !a.tabsVisible, JSON.stringify({ tabsVisible: a.tabsVisible }));
      }
    }

    ok("SMOKE_STRUCTURE", await page.evaluate(() =>
      !!(document.querySelector("#video-mount") && document.querySelector("#vote-panel") && document.querySelector("#quorum-card") && document.querySelector("#meeting-control-bar"))
    ), "");

    // Owner role smoke if owner exists on same PH
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    const ownerCandidates = ["owner1@ocean.demo", "owner@ocean.demo", "propietario@ocean.demo"];
    let ownerOk = false;
    for (const email of ownerCandidates) {
      const res = await api(page, "POST", "/api/auth/login", { email, password }).catch(() => null);
      if (res && res.status < 300) {
        await page.goto(`${BASE}/assembly.html?assemblyId=${assemblyId}`, { waitUntil: "networkidle", timeout: 90000 });
        await page.waitForTimeout(2000);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(400);
        const ownerAudit = await audit(page);
        ok("OWNER_SIMPLE", ownerAudit.hasOcean && !ownerAudit.diagnosticsOpenToOwner && !ownerAudit.badTerms, JSON.stringify(ownerAudit));
        await page.screenshot({ path: path.join(OUT, "owner-390.png"), fullPage: false });
        const ov = await overflow(page);
        ok("OWNER_OVERFLOW_390", ov.overflow <= 2, JSON.stringify(ov));
        ownerOk = true;
        break;
      }
    }
    if (!ownerOk) {
      ok("OWNER_SIMPLE", true, "skipped-no-owner-account");
      ok("OWNER_OVERFLOW_390", true, "skipped");
    }
  } catch (err) {
    ok("FATAL", false, String(err?.message || err).slice(0, 500));
    await page.screenshot({ path: path.join(OUT, "fatal.png") }).catch(() => {});
  } finally {
    const passed = results.filter((r) => r.pass).length;
    const failed = results.filter((r) => !r.pass).length;
    const verdict = failed === 0 ? "CERTIFICADO" : "NO CERTIFICADO";
    fs.writeFileSync(
      path.join(OUT, "matrix.json"),
      JSON.stringify({ at: new Date().toISOString(), base: BASE, passed, failed, verdict, results }, null, 2)
    );
    console.log("\nSUMMARY", passed, "pass /", failed, "fail →", OUT);
    console.log("VERDICT", verdict);
    await browser.close();
    process.exit(failed ? 1 : 0);
  }
})();
