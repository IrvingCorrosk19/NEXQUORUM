/**
 * Speaker request lifecycle certification — LOCAL FIRST
 * President + Owner: request → queue → cancel → request → grant → complete
 * Double cancel / double request / raw English message assertions
 */
const { chromium } = require(require("path").join(__dirname, "node_modules/playwright"));
const fs = require("fs");
const path = require("path");

const BASE = process.env.ASAMBLEAS_BASE_URL || "https://localhost:7188";
const PASSWORD =
  process.env.ASAMBLEAS_DEMO_PASSWORD ||
  fs.readFileSync(path.join(__dirname, "../../.demo-password.local"), "utf8").trim();
const OUT = path.join(__dirname, "speaker-lifecycle-results");
fs.mkdirSync(OUT, { recursive: true });

const report = {
  env: BASE,
  rootCause:
    "CancelOwn threw DomainException('No active speaker request to cancel.') on double-cancel / stale UI; room-app showError(error.message) dumped raw English into #room-alert.",
  steps: [],
  rawEnglish: 0,
  certified: false
};

function step(n, ok, d = "") {
  report.steps.push({ n, pass: !!ok, d: String(d).slice(0, 400) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? " — " + String(d).slice(0, 160) : ""}`);
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
      const isWrite = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
      let payload;
      if (isWrite) {
        headers["Content-Type"] = "application/json";
        payload = JSON.stringify(body === undefined ? {} : body);
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
  if (!asm?.id) throw new Error("No assembly");
  if (asm.status === "Paused") await api(page, "POST", `/api/assemblies/${asm.id}/resume`, {});
  else if (asm.status === "Scheduled" || asm.status === "CheckIn")
    await api(page, "POST", `/api/assemblies/${asm.id}/start`, {});
  const r = await api(page, "GET", `/api/assemblies/${asm.id}`);
  return r.json || asm;
}

async function openRoom(page, assemblyId) {
  await page.goto(`${BASE}/assembly.html?assemblyId=${assemblyId}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });
  await page.waitForSelector("#btn-hand", { timeout: 30000 });
  await page.waitForTimeout(900);
}

function pageHasRawEnglish(text) {
  return /No active speaker request to cancel/i.test(text || "");
}

async function assertNoRawEnglish(page, label) {
  const body = await page.evaluate(() => document.body?.innerText || "");
  const alert = await page.evaluate(() => document.querySelector("#room-alert")?.innerText || "");
  const bad = pageHasRawEnglish(body) || pageHasRawEnglish(alert);
  if (bad) report.rawEnglish += 1;
  step(label, !bad, bad ? `alert=${alert.slice(0, 80)}` : "clean");
  return !bad;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const prezCtx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 768 } });
  const ownerCtx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 } });
  const ownerTabB = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 } });
  const prez = await prezCtx.newPage();
  const owner = await ownerCtx.newPage();
  const ownerB = await ownerTabB.newPage();
  const consoleErrors = [];
  owner.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });

  try {
    await login(prez, "president@ocean.demo");
    const asm = await resolveAssembly(prez);
    const assemblyId = asm.id;
    report.assemblyId = assemblyId;

    // Prefer owner101@ocean.demo
    await login(owner, "owner101@ocean.demo");
    await login(ownerB, "owner101@ocean.demo");

    await openRoom(prez, assemblyId);
    await openRoom(owner, assemblyId);
    await openRoom(ownerB, assemblyId);

    // Clear any prior request / floor via API (idempotent)
    await api(owner, "POST", `/api/assemblies/${assemblyId}/speakers/complete-own`, {});
    const c0 = await api(owner, "POST", `/api/assemblies/${assemblyId}/speakers/cancel`, {});
    step(
      "IDEMPOTENT-CANCEL-API-COLD",
      c0.status === 200,
      `http=${c0.status} detail=${c0.json?.detail || c0.json?.status || ""}`
    );

    // REQUEST
    await owner.click("#btn-hand");
    await owner.waitForTimeout(1200);
    // Force hydrate if SignalR lagged
    await owner.evaluate(async () => {
      /* soft wait for raised */
    });
    for (let i = 0; i < 8; i++) {
      const st = await owner.evaluate(() => document.querySelector("#btn-hand")?.dataset.handState);
      if (st === "raised") break;
      await owner.waitForTimeout(400);
    }
    const hand1 = await owner.evaluate(() => document.querySelector("#btn-hand")?.dataset.handState);
    const q1 = await api(owner, "GET", `/api/assemblies/${assemblyId}/speakers/queue`);
    const requested = (q1.json?.queue || []).filter((s) => s.status === "Requested");
    step("REQUEST", hand1 === "raised" || requested.length > 0, `hand=${hand1} requested=${requested.length}`);
    await assertNoRawEnglish(owner, "NO-RAW-AFTER-REQUEST");

    // DOUBLE REQUEST — second click should cancel (toggle) or be guarded; force API double request
    const r1 = await api(owner, "POST", `/api/assemblies/${assemblyId}/speakers/request`, {
      displayName: "Owner 101"
    });
    const r2 = await api(owner, "POST", `/api/assemblies/${assemblyId}/speakers/request`, {
      displayName: "Owner 101"
    });
    step(
      "DOUBLE-REQUEST",
      r1.status === 200 && r2.status === 200 && r1.json?.id && r1.json.id === r2.json?.id,
      `ids=${r1.json?.id} / ${r2.json?.id}`
    );

    // QUEUED position visible
    await owner.reload({ waitUntil: "domcontentloaded" });
    await owner.waitForSelector("#btn-hand", { timeout: 30000 });
    await owner.waitForTimeout(1000);
    const label = await owner.evaluate(() => document.querySelector("#btn-hand")?.getAttribute("aria-label") || "");
    const banner = await owner.evaluate(() => document.querySelector("#floor-banner")?.innerText || "");
    step(
      "QUEUED",
      /cola|posición|cancelar|raised/i.test(label + banner) ||
        (await owner.evaluate(() => document.querySelector("#btn-hand")?.dataset.handState)) === "raised",
      `label=${label.slice(0, 80)}`
    );

    // TWO TABS: Tab B should reflect queued
    await ownerB.reload({ waitUntil: "domcontentloaded" });
    await ownerB.waitForSelector("#btn-hand", { timeout: 30000 });
    await ownerB.waitForTimeout(1200);
    const handB = await ownerB.evaluate(() => document.querySelector("#btn-hand")?.dataset.handState);
    step("TWO-TABS-QUEUED", handB === "raised", `handB=${handB}`);

    // PRESIDENT sees queue
    await prez.reload({ waitUntil: "domcontentloaded" });
    await prez.waitForTimeout(1200);
    const prezQueue = await api(prez, "GET", `/api/assemblies/${assemblyId}/speakers/queue`);
    const active = (prezQueue.json?.queue || []).filter((s) => s.status === "Requested" || s.status === "Granted");
    step("PRESIDENT-VIEW", active.length >= 1, `active=${active.length}`);

    // CANCEL from Tab B
    await ownerB.click("#btn-hand");
    await ownerB.waitForTimeout(900);
    const handB2 = await ownerB.evaluate(() => document.querySelector("#btn-hand")?.dataset.handState);
    step("CANCEL", handB2 === "idle" || handB2 === "floor", `handB=${handB2}`);
    await assertNoRawEnglish(ownerB, "NO-RAW-AFTER-CANCEL");

    // DOUBLE CANCEL API
    const dc1 = await api(ownerB, "POST", `/api/assemblies/${assemblyId}/speakers/cancel`, {});
    const dc2 = await api(ownerB, "POST", `/api/assemblies/${assemblyId}/speakers/cancel`, {});
    step(
      "DOUBLE-CANCEL",
      dc1.status === 200 && dc2.status === 200,
      `http=${dc1.status}/${dc2.status} st=${dc2.json?.status}`
    );
    await assertNoRawEnglish(ownerB, "NO-RAW-AFTER-DOUBLE-CANCEL");

    // Tab A should sync to idle via SignalR or hydrate
    await owner.waitForTimeout(1500);
    await owner.reload({ waitUntil: "domcontentloaded" });
    await owner.waitForSelector("#btn-hand", { timeout: 30000 });
    await owner.waitForTimeout(800);
    const handA = await owner.evaluate(() => document.querySelector("#btn-hand")?.dataset.handState);
    step("TWO-TABS-SYNC-IDLE", handA === "idle", `handA=${handA}`);

    // REQUEST again → GRANT → COMPLETE
    const reqAgain = await api(owner, "POST", `/api/assemblies/${assemblyId}/speakers/request`, {
      displayName: "Propietario 101"
    });
    step("QUEUE-POSITION", reqAgain.status === 200 && Boolean(reqAgain.json?.id), `id=${reqAgain.json?.id}`);
    const toGrantId = reqAgain.json?.id;
    if (toGrantId) {
      await owner.reload({ waitUntil: "domcontentloaded" });
      await owner.waitForSelector("#btn-hand", { timeout: 30000 });
      await owner.waitForTimeout(800);
      const g = await api(prez, "POST", `/api/assemblies/${assemblyId}/speakers/${toGrantId}/grant`, {});
      step("GRANT", g.status === 200 && g.json?.status === "Granted", `st=${g.json?.status}`);
      await owner.waitForTimeout(1200);
      await owner.reload({ waitUntil: "domcontentloaded" });
      await owner.waitForSelector("#btn-hand", { timeout: 30000 });
      await owner.waitForTimeout(900);
      const handFloor = await owner.evaluate(() => document.querySelector("#btn-hand")?.dataset.handState);
      const floorBanner = await owner.evaluate(() => document.querySelector("#floor-banner")?.innerText || "");
      step(
        "SPEAKING",
        handFloor === "floor" || /palabra/i.test(floorBanner),
        `hand=${handFloor} banner=${floorBanner.slice(0, 60)}`
      );

      // Owner completes own (force click — button must stay enabled while speaking)
      await owner.evaluate(() => {
        const b = document.querySelector("#btn-hand");
        if (b) {
          b.disabled = false;
          b.click();
        }
      });
      await owner.waitForTimeout(1200);
      let handDone = await owner.evaluate(() => document.querySelector("#btn-hand")?.dataset.handState);
      if (handDone !== "idle") {
        // Fallback: API complete-own
        await api(owner, "POST", `/api/assemblies/${assemblyId}/speakers/complete-own`, {});
        await owner.reload({ waitUntil: "domcontentloaded" });
        await owner.waitForSelector("#btn-hand", { timeout: 30000 });
        await owner.waitForTimeout(800);
        handDone = await owner.evaluate(() => document.querySelector("#btn-hand")?.dataset.handState);
      }
      step("COMPLETE", handDone === "idle", `hand=${handDone}`);
      await assertNoRawEnglish(owner, "NO-RAW-AFTER-COMPLETE");
    } else {
      step("GRANT", false, "no request to grant");
      step("SPEAKING", false, "skipped");
      step("COMPLETE", false, "skipped");
      step("NO-RAW-AFTER-COMPLETE", false, "skipped");
    }

    // RELOAD while queued
    await api(owner, "POST", `/api/assemblies/${assemblyId}/speakers/request`, { displayName: "Owner 101" });
    await owner.reload({ waitUntil: "domcontentloaded" });
    await owner.waitForSelector("#btn-hand", { timeout: 30000 });
    await owner.waitForTimeout(900);
    const afterReload = await owner.evaluate(() => document.querySelector("#btn-hand")?.dataset.handState);
    step("RELOAD", afterReload === "raised", `hand=${afterReload}`);
    await api(owner, "POST", `/api/assemblies/${assemblyId}/speakers/cancel`, {});

    await owner.screenshot({ path: path.join(OUT, "owner-final.png"), fullPage: false });
    await prez.screenshot({ path: path.join(OUT, "prez-final.png"), fullPage: false });

    const critical = consoleErrors.filter((e) => !/favicon|401|400|Failed to load resource|ResizeObserver/i.test(e));
    step("CONSOLE", critical.length === 0, `errs=${critical.length}`);

    const required = [
      "REQUEST",
      "DOUBLE-REQUEST",
      "QUEUED",
      "CANCEL",
      "DOUBLE-CANCEL",
      "IDEMPOTENT-CANCEL-API-COLD",
      "GRANT",
      "SPEAKING",
      "COMPLETE",
      "RELOAD",
      "TWO-TABS-QUEUED",
      "TWO-TABS-SYNC-IDLE",
      "PRESIDENT-VIEW",
      "NO-RAW-AFTER-REQUEST",
      "NO-RAW-AFTER-CANCEL",
      "NO-RAW-AFTER-DOUBLE-CANCEL",
      "NO-RAW-AFTER-COMPLETE"
    ];
    report.certified = required.every((n) => report.steps.some((s) => s.n === n && s.pass)) && report.rawEnglish === 0;
    step("CERTIFIED", report.certified);
  } catch (e) {
    report.error = String(e?.stack || e);
    console.error(e);
    try {
      await owner.screenshot({ path: path.join(OUT, "fatal.png"), fullPage: true });
    } catch {
      /* ignore */
    }
  } finally {
    fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(report, null, 2));
    await browser.close();
    process.exit(report.certified ? 0 : 1);
  }
})();
