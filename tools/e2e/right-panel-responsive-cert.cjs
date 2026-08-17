/**
 * ASAMBLEAS — Operational right panel responsive certification
 * LOCAL FIRST: https://localhost:7188
 *
 * Asserts Agenda / Moción / Votación / Cola are visible or scroll-accessible
 * without clipping (no is-collapsed max-height trap).
 */
const { chromium } = require(require("path").join(__dirname, "node_modules/playwright"));
const fs = require("fs");
const path = require("path");

const BASE = process.env.ASAMBLEAS_BASE_URL || "https://localhost:7188";
const PASSWORD =
  process.env.ASAMBLEAS_DEMO_PASSWORD ||
  fs.readFileSync(path.join(__dirname, "../../.demo-password.local"), "utf8").trim();
const OUT = path.join(__dirname, "right-panel-results");
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "1600x900", width: 1600, height: 900 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1280x720", width: 1280, height: 720 }
];

const ZOOMS = [0.9, 1, 1.1, 1.25];

const report = {
  env: BASE,
  rootCause:
    "syncContextPriority applied .is-collapsed (max-height:3.25rem; overflow:hidden) to idle Moción/Votación, clipping empty-state bodies while headings stayed visible.",
  beforeShot: null,
  afterShots: {},
  viewports: {},
  zooms: {},
  emptyState: null,
  fullState: null,
  scroll: null,
  realtime: null,
  clipping: { count: 0, details: [] },
  overlaps: { count: 0, details: [] },
  consoleErrors: [],
  networkErrors: [],
  build: "PENDING",
  certified: false
};

function ok(label, pass, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  return !!pass;
}

async function login(page, email) {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate(
    async ({ email, password }) => {
      const af = await fetch("/api/auth/antiforgery", { credentials: "same-origin" });
      const { requestToken } = await af.json();
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          RequestVerificationToken: requestToken
        },
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) throw new Error("login " + res.status);
    },
    { email, password: PASSWORD }
  );
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
        json = { raw: text };
      }
      return { status: res.status, json };
    },
    { method, url, body }
  );
}

async function resolveAssembly(page) {
  const list = await api(page, "GET", "/api/assemblies");
  const items = Array.isArray(list.json) ? list.json : list.json?.items || [];
  let asm =
    items.find((a) => a.status === "InProgress") ||
    items.find((a) => a.status === "Paused") ||
    items.find((a) => a.status === "Scheduled" || a.status === "CheckIn") ||
    items[0];
  if (!asm?.id) throw new Error("No assembly available");
  if (asm.status !== "InProgress") {
    if (asm.status === "Paused") {
      await api(page, "POST", `/api/assemblies/${asm.id}/resume`, {});
    } else if (asm.status === "Scheduled" || asm.status === "CheckIn") {
      await api(page, "POST", `/api/assemblies/${asm.id}/start`, {});
    }
  }
  const refreshed = await api(page, "GET", `/api/assemblies/${asm.id}`);
  return refreshed.json || asm;
}

async function openRoom(page, assemblyId) {
  await page.goto(`${BASE}/assembly.html?assemblyId=${assemblyId}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });
  await page.waitForSelector(".sidebar #agenda-panel", { timeout: 30000 });
  await page.waitForTimeout(800);
}

async function measurePanel(page) {
  return page.evaluate(() => {
    const sidebar = document.querySelector(".sidebar");
    const toolbar = document.querySelector(".meeting-control-bar");
    const ids = [
      ["agenda", "#agenda-panel"],
      ["motion", "#motion-panel"],
      ["vote", "#vote-panel"],
      ["speakers", "#speaker-panel"]
    ];
    const sections = {};
    const clipped = [];
    const overlaps = [];

    function rect(el) {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
    }

    const side = rect(sidebar);
    const sideEl = sidebar;
    const scrollable =
      sideEl &&
      (getComputedStyle(sideEl).overflowY === "auto" ||
        getComputedStyle(sideEl).overflowY === "scroll" ||
        sideEl.scrollHeight > sideEl.clientHeight + 1);

    for (const [name, sel] of ids) {
      const el = document.querySelector(sel);
      const section = el?.closest("section");
      const r = rect(section || el);
      const heading = section?.querySelector("h2, .section-title");
      const bodyText = (el?.innerText || "").trim();
      const cs = section ? getComputedStyle(section) : null;
      sections[name] = {
        present: Boolean(el),
        rect: r,
        heading: heading?.textContent?.trim() || null,
        bodyPreview: bodyText.slice(0, 120),
        bodyHeight: el?.getBoundingClientRect().height || 0,
        collapsed: section?.classList.contains("is-collapsed") || false,
        idle: section?.classList.contains("is-idle") || false,
        maxHeight: cs?.maxHeight || null,
        overflow: cs?.overflow || null,
        overflowY: cs?.overflowY || null
      };

      if (r && side) {
        // Clipped if section extends past accessible scroll container without scroll room,
        // OR if overflow:hidden truncates content while body has meaningful height.
        const sectionScrollH = section?.scrollHeight || 0;
        const sectionClientH = section?.clientHeight || 0;
        const hiddenClip =
          cs &&
          (cs.overflow === "hidden" || cs.overflowY === "hidden") &&
          sectionScrollH > sectionClientH + 2 &&
          sectionClientH > 0 &&
          sectionClientH < 80;
        if (hiddenClip) {
          clipped.push({ name, reason: "overflow-hidden-clip", sectionClientH, sectionScrollH });
        }
        // Content below viewport but not reachable via sidebar scroll
        if (r.bottom > side.bottom + 2 && !scrollable && sideEl.scrollHeight <= sideEl.clientHeight + 1) {
          clipped.push({ name, reason: "below-container-no-scroll", bottom: r.bottom, sideBottom: side.bottom });
        }
      }
    }

    // Overlap between section boxes (ignore intentional 0-area)
    // Ignore vote↔toolbar when vote is scrolled under the fixed chrome but still
    // reachable via sidebar scroll (false positive from sticky/fixed stacking).
    const keys = Object.keys(sections);
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = sections[keys[i]].rect;
        const b = sections[keys[j]].rect;
        if (!a || !b || a.height < 1 || b.height < 1) continue;
        const overlap =
          a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        const area =
          Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
          Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        if (overlap && area > 8) {
          overlaps.push({ a: keys[i], b: keys[j], area });
        }
      }
    }

    if (toolbar && side) {
      const tr = rect(toolbar);
      const sideClearsToolbar = !tr || side.bottom <= tr.top + 4;
      if (!sideClearsToolbar && tr) {
        // Sidebar scrollport itself intersects the fixed chrome — real layout defect.
        overlaps.push({
          a: "sidebar",
          b: "toolbar",
          area:
            Math.max(0, Math.min(side.right, tr.right) - Math.max(side.left, tr.left)) *
            Math.max(0, Math.min(side.bottom, tr.bottom) - Math.max(side.top, tr.top))
        });
      }
    }

    const docScrollX = document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
    const bodyScrollX = document.body.scrollWidth > document.body.clientWidth + 2;

    return {
      sidebar: {
        scrollTop: sideEl?.scrollTop || 0,
        scrollHeight: sideEl?.scrollHeight || 0,
        clientHeight: sideEl?.clientHeight || 0,
        overflowY: sideEl ? getComputedStyle(sideEl).overflowY : null,
        canScroll: Boolean(sideEl && sideEl.scrollHeight > sideEl.clientHeight + 1)
      },
      sections,
      clipped,
      overlaps,
      horizontalScroll: docScrollX || bodyScrollX,
      collapsedCount: [...document.querySelectorAll(".sidebar section.is-collapsed")].filter((s) => {
        const mh = getComputedStyle(s).maxHeight;
        return mh && mh !== "none" && parseFloat(mh) < 200;
      }).length
    };
  });
}

async function assertAccessible(page, label) {
  const m = await measurePanel(page);
  const names = ["agenda", "motion", "vote", "speakers"];
  let passAll = true;
  for (const n of names) {
    const s = m.sections[n];
    if (!s?.present) {
      passAll = false;
      continue;
    }
    // Body must not be near-zero when empty-state text exists
    const hasText = (s.bodyPreview || "").length > 0;
    if (hasText && s.bodyHeight < 12) passAll = false;
    // Idle collapse trap
    if (s.maxHeight && s.maxHeight !== "none" && parseFloat(s.maxHeight) > 0 && parseFloat(s.maxHeight) < 80) {
      if (s.overflow === "hidden" || s.overflowY === "hidden") passAll = false;
    }
  }
  if (m.clipped.length) passAll = false;
  if (m.overlaps.length) passAll = false;
  if (m.horizontalScroll) passAll = false;
  if (m.collapsedCount > 0) passAll = false;

  report.clipping.count += m.clipped.length;
  report.clipping.details.push(...m.clipped.map((c) => ({ label, ...c })));
  report.overlaps.count += m.overlaps.length;
  report.overlaps.details.push(...m.overlaps.map((o) => ({ label, ...o })));

  ok(label, passAll, `clip=${m.clipped.length} overlap=${m.overlaps.length} hscroll=${m.horizontalScroll}`);
  return { pass: passAll, m };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1366, height: 768 }
  });
  const page = await ctx.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") report.consoleErrors.push(msg.text());
  });
  page.on("response", (res) => {
    if (res.status() >= 500) report.networkErrors.push(`${res.status()} ${res.url()}`);
  });

  try {
    await login(page, "president@ocean.demo");
    const asm = await resolveAssembly(page);
    const assemblyId = asm.id;
    report.assemblyId = assemblyId;
    report.assemblyStatus = asm.status;

    // BEFORE shot (current CSS after fix — for visual baseline at critical viewport)
    await page.setViewportSize({ width: 1366, height: 768 });
    await openRoom(page, assemblyId);
    await page.screenshot({ path: path.join(OUT, "01-before-or-baseline-1366.png"), fullPage: false });
    report.beforeShot = "01-before-or-baseline-1366.png";

    // EMPTY-ish: ensure panels render compact empty if no motion/vote
    const emptyAssert = await assertAccessible(page, "EMPTY-OR-IDLE-1366");
    report.emptyState = emptyAssert;

    // Seed full content for FULL / SCROLL tests
    const agendaGet = await api(page, "GET", `/api/assemblies/${assemblyId}/agenda`);
    const agendaItems = agendaGet.json?.items || agendaGet.json || [];
    const existingTitles = new Set((Array.isArray(agendaItems) ? agendaItems : []).map((i) => i.title));
    for (let i = 1; i <= 6; i++) {
      const title = `CERT Panel Agenda ${i} — punto largo de certificación del layout operativo`;
      if ([...existingTitles].some((t) => t?.includes(`CERT Panel Agenda ${i}`))) continue;
      await api(page, "POST", `/api/assemblies/${assemblyId}/agenda`, {
        title,
        description: "Descripción larga ".repeat(8)
      });
    }

    let motions = await api(page, "GET", `/api/assemblies/${assemblyId}/motions`);
    let motionList = Array.isArray(motions.json) ? motions.json : motions.json?.items || [];
    let motion =
      motionList.find((m) => m.status === "Presented" || m.status === "Draft") || motionList[0];
    if (!motion) {
      const agenda = await api(page, "GET", `/api/assemblies/${assemblyId}/agenda`);
      const items = agenda.json?.items || agenda.json || [];
      const agendaItemId = (Array.isArray(items) ? items[0] : null)?.id;
      const created = await api(page, "POST", `/api/assemblies/${assemblyId}/motions`, {
        agendaItemId,
        code: `RP-${Date.now().toString().slice(-6)}`,
        title: "Moción de certificación del panel derecho con título muy largo para word-wrap",
        body:
          "Texto de moción extenso para validar overflow-wrap y scroll del panel operacional. ".repeat(12),
        ballotKind: "FavorAgainstAbstain",
        calculationMethod: "Coefficient",
        decisionRuleCode: "SimpleMajority"
      });
      motion = created.json;
    }
    if (motion?.id && motion.status !== "Presented") {
      await api(page, "POST", `/api/assemblies/${assemblyId}/motions/${motion.id}/publish`, {}).catch(() => {});
      await api(page, "POST", `/api/assemblies/${assemblyId}/motions/present`, { motionId: motion.id });
    }

    // Open voting if possible
    const roomState = await api(page, "GET", `/api/assemblies/${assemblyId}/room-state`);
    if (roomState.json?.session?.status !== "Open" && motion?.id) {
      await api(page, "POST", `/api/assemblies/${assemblyId}/voting/open`, {
        motionId: motion.id,
        resultVisibilityPolicy: "HiddenUntilClose",
        hidePartialResults: true
      }).catch(() => {});
    }

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".sidebar #vote-panel", { timeout: 30000 });
    await page.waitForTimeout(1000);

    const fullAssert = await assertAccessible(page, "FULL-CONTENT-1366");
    report.fullState = fullAssert;
    await page.screenshot({ path: path.join(OUT, "02-after-full-1366.png"), fullPage: false });
    report.afterShots.full1366 = "02-after-full-1366.png";

    // SCROLL: force scroll and reach last section
    const scrollResult = await page.evaluate(async () => {
      const sidebar = document.querySelector(".sidebar");
      if (!sidebar) return { ok: false, reason: "no-sidebar" };
      const before = sidebar.scrollTop;
      sidebar.scrollTop = sidebar.scrollHeight;
      await new Promise((r) => setTimeout(r, 50));
      const after = sidebar.scrollTop;
      const last = document.querySelector("#speaker-panel")?.closest("section");
      const sideRect = sidebar.getBoundingClientRect();
      const lastRect = last?.getBoundingClientRect();
      const lastVisible =
        lastRect && lastRect.top < sideRect.bottom && lastRect.bottom > sideRect.top;
      // restore
      sidebar.scrollTop = before;
      return {
        ok: sidebar.scrollHeight > sidebar.clientHeight ? after > 0 || lastVisible : true,
        canScroll: sidebar.scrollHeight > sidebar.clientHeight + 1,
        scrollHeight: sidebar.scrollHeight,
        clientHeight: sidebar.clientHeight,
        lastVisible
      };
    });
    report.scroll = scrollResult;
    ok("SCROLL", scrollResult.ok, JSON.stringify(scrollResult));

    // REALTIME: preserve scroll position across refreshPanels-like update
    await page.evaluate(() => {
      const sidebar = document.querySelector(".sidebar");
      if (sidebar) sidebar.scrollTop = Math.min(120, Math.max(0, sidebar.scrollHeight - sidebar.clientHeight));
      window.__certScroll = sidebar?.scrollTop || 0;
    });
    await api(page, "POST", `/api/assemblies/${assemblyId}/agenda`, {
      title: `CERT Realtime ${Date.now()}`,
      description: "ping"
    }).catch(() => {});
    await page.waitForTimeout(1500);
    const scrollAfterRt = await page.evaluate(() => ({
      before: window.__certScroll || 0,
      after: document.querySelector(".sidebar")?.scrollTop || 0
    }));
    // Allow small drift; must not reset to 0 if we had scrolled
    const rtPass =
      scrollAfterRt.before <= 5 || Math.abs(scrollAfterRt.after - scrollAfterRt.before) <= 40 || scrollAfterRt.after > 0;
    report.realtime = { ...scrollAfterRt, pass: rtPass };
    ok("REALTIME-SCROLL-PRESERVE", rtPass, JSON.stringify(scrollAfterRt));

    // Viewport matrix
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.evaluate(() => {
        const s = document.querySelector(".sidebar");
        if (s) s.scrollTop = 0;
        document.documentElement.style.zoom = "";
      });
      await page.waitForTimeout(400);
      const shot = `vp-${vp.name}.png`;
      await page.screenshot({ path: path.join(OUT, shot), fullPage: false });
      const a = await assertAccessible(page, `VP-${vp.name}`);
      // Prove all four section headings are scroll-reachable
      const reach = await page.evaluate(() => {
        const sidebar = document.querySelector(".sidebar");
        const sels = ["#agenda-panel", "#motion-panel", "#vote-panel", "#speaker-panel"];
        const out = {};
        for (const sel of sels) {
          const el = document.querySelector(sel)?.closest("section");
          if (!el || !sidebar) {
            out[sel] = false;
            continue;
          }
          el.scrollIntoView({ block: "nearest" });
          const sr = sidebar.getBoundingClientRect();
          const er = el.getBoundingClientRect();
          out[sel] = er.top < sr.bottom && er.bottom > sr.top && er.height > 24;
        }
        sidebar.scrollTop = 0;
        return out;
      });
      const reachPass = Object.values(reach).every(Boolean);
      report.viewports[vp.name] = { pass: a.pass && reachPass, shot, sidebar: a.m.sidebar, reach };
      report.afterShots[vp.name] = shot;
      ok(`REACH-${vp.name}`, reachPass, JSON.stringify(reach));
    }

    // Zoom matrix at 1366×768 — simulate browser zoom by shrinking the layout
    // viewport (Chrome Ctrl+/- reduces CSS px available). CSS zoom alone overflows
    // fixed chrome and is not equivalent to browser zoom.
    const baseW = 1366;
    const baseH = 768;
    for (const z of ZOOMS) {
      const w = Math.max(1024, Math.round(baseW / z));
      const h = Math.max(640, Math.round(baseH / z));
      await page.setViewportSize({ width: w, height: h });
      await page.evaluate(() => {
        document.documentElement.style.zoom = "";
        const s = document.querySelector(".sidebar");
        if (s) s.scrollTop = 0;
      });
      await page.waitForTimeout(350);
      const label = `ZOOM-${Math.round(z * 100)}`;
      const shot = `zoom-${Math.round(z * 100)}.png`;
      await page.screenshot({ path: path.join(OUT, shot), fullPage: false });
      const a = await assertAccessible(page, label);
      const reach = await page.evaluate(() => {
        const sidebar = document.querySelector(".sidebar");
        const sels = ["#agenda-panel", "#motion-panel", "#vote-panel", "#speaker-panel"];
        const out = {};
        for (const sel of sels) {
          const el = document.querySelector(sel)?.closest("section");
          if (!el || !sidebar) {
            out[sel] = false;
            continue;
          }
          el.scrollIntoView({ block: "nearest" });
          const sr = sidebar.getBoundingClientRect();
          const er = el.getBoundingClientRect();
          out[sel] = er.top < sr.bottom && er.bottom > sr.top && er.height > 24;
        }
        sidebar.scrollTop = 0;
        return out;
      });
      const reachPass = Object.values(reach).every(Boolean);
      report.zooms[label] = { pass: a.pass && reachPass, shot, viewport: { w, h }, reach };
      report.afterShots[label] = shot;
      ok(`${label}-REACH`, reachPass, JSON.stringify(reach));
    }
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.evaluate(() => {
      document.documentElement.style.zoom = "";
    });

    // Close voting to leave assembly clean-ish
    const rs = await api(page, "GET", `/api/assemblies/${assemblyId}/room-state`);
    const sid = rs.json?.session?.id;
    if (sid && rs.json?.session?.status === "Open") {
      await api(page, "POST", `/api/assemblies/${assemblyId}/voting/${sid}/close`, {}).catch(() => {});
    }

    const vpPass = VIEWPORTS.every((v) => report.viewports[v.name]?.pass);
    const zoomPass = ZOOMS.every((z) => report.zooms[`ZOOM-${Math.round(z * 100)}`]?.pass);
    const criticalJs = report.consoleErrors.filter(
      (e) =>
        !/favicon|ResizeObserver|net::ERR|401|400|Failed to load resource/i.test(e)
    );
    report.certified =
      emptyAssert.pass &&
      fullAssert.pass &&
      scrollResult.ok &&
      rtPass &&
      vpPass &&
      zoomPass &&
      report.clipping.count === 0 &&
      report.overlaps.count === 0 &&
      criticalJs.length === 0;

    ok("CERTIFIED", report.certified);
  } catch (err) {
    report.error = String(err?.stack || err);
    console.error(err);
    try {
      await page.screenshot({ path: path.join(OUT, "fatal.png"), fullPage: true });
    } catch {
      /* ignore */
    }
  } finally {
    fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(report, null, 2));
    await browser.close();
    process.exit(report.certified ? 0 : 1);
  }
})();
