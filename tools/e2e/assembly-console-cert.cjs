/**
 * Assembly console layout certification — Browser Tab multi-viewport.
 */
const path = require("path");
const fs = require("fs");
const { chromium } = require(path.join(__dirname, "node_modules", "playwright"));

const BASE = process.env.ASAMBLEAS_BASE_URL || "https://localhost:7188";
const OUT = path.join(__dirname, "assembly-console-results");
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
  if (res.status >= 300) throw new Error(`login ${email} ${res.status}`);
  return res.json;
}

async function overflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const room = document.querySelector(".room");
    return {
      scrollWidth: Math.max(doc.scrollWidth, body.scrollWidth, room?.scrollWidth || 0),
      clientWidth: doc.clientWidth,
      overflow: Math.max(doc.scrollWidth, body.scrollWidth, room?.scrollWidth || 0) - doc.clientWidth
    };
  });
}

async function uiAudit(page) {
  return page.evaluate(() => {
    const text = document.body.innerText || "";
    const quorum = document.querySelector("#quorum-chip");
    const qr = quorum?.getBoundingClientRect();
    const side = document.querySelector("#governance-sidebar");
    const sr = side?.getBoundingClientRect();
    const bar = document.querySelector("#meeting-control-bar");
    const br = bar?.getBoundingClientRect();
    const header = document.querySelector(".room-header")?.getBoundingClientRect();
    const stage = document.querySelector(".video-stage")?.getBoundingClientRect();
    const tile = document.querySelector(".media-tile")?.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const soloGrid = document.querySelector(".media-stage-grid.is-solo");
    const tileCount = document.querySelectorAll(".media-tile").length;
    const expectSoloFill = !!soloGrid && tileCount === 1 && stage && stage.height >= 80;
    return {
      badTerms: /LiveKit media|Total lógico|Conectados \(media\)|Usted · president\b/i.test(text),
      soloTileFills: !expectSoloFill ? true : tile.height >= stage.height * 0.45,
      hasPresence: /Acreditados|Presentes|Conectados a la sala/i.test(text),
      quorumOverflow: quorum
        ? qr.right > vw + 2 || qr.bottom > vh + 2 || qr.left < -2
        : false,
      sidebarCut: side && !document.querySelector(".room")?.classList.contains("sidebar-collapsed")
        ? sr.right > vw + 4 || sr.left < -4
        : false,
      barVisible: !!br && br.height > 0 && br.top < vh + 2,
      headerH: header?.height || 0,
      barH: br?.height || 0,
      headerOk: !header || header.height <= (vw < 768 ? 88 : 96),
      barOk: !br || br.height <= (vw < 480 ? 88 : 110),
      startBtn: !!document.querySelector("#btn-start")
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

  try {
    await login(page, "president@ocean.demo", password);
    // Prefer existing assembly in CheckIn/InProgress; else create fixture quickly
    let assemblies = await api(page, "GET", "/api/assemblies");
    let list = Array.isArray(assemblies.json) ? assemblies.json : assemblies.json?.items || [];
    let assemblyId =
      list.find((a) => /CheckIn|InProgress|Paused|Scheduled/i.test(String(a.status || "")))?.id || list[0]?.id;

    if (!assemblyId) {
      const ph = await api(page, "POST", "/api/ph", {
        name: `Console Cert ${STAMP}`,
        code: `CC${STAMP}`,
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
        title: `Console ${STAMP}`,
        modality: "Hybrid",
        scheduledAtUtc: when,
        estimatedEndAtUtc: new Date(Date.now() + 7200_000).toISOString(),
        requiredQuorumPercent: 50,
        publishAsScheduled: true
      });
      assemblyId = asm.json?.id;
      await api(page, "POST", `/api/assemblies/${assemblyId}/start-checkin`, {});
    } else {
      await api(page, "POST", `/api/assemblies/${assemblyId}/start-checkin`, {}).catch(() => ({}));
    }
    ok("ASM", !!assemblyId, assemblyId);
    if (!assemblyId) throw new Error("no assembly");

    await page.goto(`${BASE}/assembly.html?assemblyId=${assemblyId}`, { waitUntil: "networkidle", timeout: 90000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT, "01-desktop-1366-before-start.png"), fullPage: false });

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
      // Open panel on drawer breakpoints to verify it fits
      if (vp.w < 1280) {
        const room = page.locator(".room--meeting-ux");
        const collapsed = await room.evaluate((el) => el.classList.contains("sidebar-collapsed"));
        if (collapsed) {
          await page.locator("#btn-toggle-sidebar").click().catch(() => {});
          await page.waitForTimeout(350);
        }
      } else {
        // Ensure sidebar visible on desktop
        const collapsed = await page.locator(".room--meeting-ux").evaluate((el) =>
          el.classList.contains("sidebar-collapsed")
        );
        if (collapsed) {
          await page.locator("#btn-toggle-sidebar").click().catch(() => {});
          await page.waitForTimeout(250);
        }
      }
      await page.screenshot({ path: path.join(OUT, `vp-${vp.name}.png`), fullPage: false });
      const ov = await overflow(page);
      const audit = await uiAudit(page);
      ok(`OVERFLOW_${vp.name}`, ov.overflow <= 2, JSON.stringify(ov));
      ok(`QUORUM_IN_${vp.name}`, !audit.quorumOverflow, JSON.stringify(audit));
      ok(`SIDEBAR_IN_${vp.name}`, !audit.sidebarCut, JSON.stringify({ cut: audit.sidebarCut }));
      ok(`BAR_${vp.name}`, audit.barVisible, "");
      ok(`NO_BAD_TERMS_${vp.name}`, !audit.badTerms, "");
      ok(`SOLO_TILE_${vp.name}`, audit.soloTileFills, JSON.stringify({ solo: audit.soloTileFills, headerH: audit.headerH, barH: audit.barH }));
      ok(`HEADER_COMPACT_${vp.name}`, audit.headerOk, JSON.stringify({ headerH: audit.headerH }));
      ok(`BAR_COMPACT_${vp.name}`, audit.barOk, JSON.stringify({ barH: audit.barH }));
      // close drawer to not affect next
      if (vp.w < 1280) {
        await page.keyboard.press("Escape").catch(() => {});
        await page.waitForTimeout(200);
      }
    }

    // Zoom checks at 1366
    await page.setViewportSize({ width: 1366, height: 768 });
    for (const z of [1, 1.25, 1.5]) {
      await page.evaluate((zoom) => {
        document.documentElement.style.zoom = String(zoom);
      }, z);
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUT, `zoom-${Math.round(z * 100)}.png`), fullPage: false });
      const ov = await overflow(page);
      ok(`ZOOM_${Math.round(z * 100)}`, ov.overflow <= 4, JSON.stringify(ov));
    }
    await page.evaluate(() => {
      document.documentElement.style.zoom = "1";
    });

    // Desktop presence summary / diagnostics
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(300);
    const desk = await uiAudit(page);
    ok("PRESENCE_SUMMARY", desk.hasPresence || desk.startBtn, JSON.stringify(desk));
    ok("START_PRIMARY", desk.startBtn, "");

    // Functional smoke: LiveKit mount exists, quorum chip present
    const smoke = await page.evaluate(() => ({
      videoMount: !!document.querySelector("#video-mount"),
      quorum: !!document.querySelector("#quorum-chip"),
      controlBar: !!document.querySelector("#meeting-control-bar"),
      diagnostics: !!document.querySelector("#ops-diagnostics")
    }));
    ok("SMOKE_STRUCTURE", smoke.videoMount && smoke.quorum && smoke.controlBar, JSON.stringify(smoke));
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
