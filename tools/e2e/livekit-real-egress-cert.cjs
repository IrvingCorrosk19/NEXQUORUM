/**
 * LiveKit Real Egress certification (production-capable).
 * Browser fake A/V tracks → LiveKit room → ASAMBLEAS recording start → real Egress → MP4.
 */
const { chromium } = require(require("path").join(__dirname, "node_modules/playwright"));
const fs = require("fs");
const path = require("path");

const BASE = process.env.ASAMBLEAS_BASE_URL || "https://asambleas.164.68.99.83.nip.io";
const PASSWORD =
  process.env.ASAMBLEAS_DEMO_PASSWORD ||
  fs.readFileSync(path.join(__dirname, "../../.demo-password.local"), "utf8").trim();
const ASSEMBLY_ID = process.env.ASAMBLEAS_ASSEMBLY_ID || "44444444-4444-4444-4444-444444444401";
const OUT = path.join(__dirname, "livekit-egress-results");
fs.mkdirSync(OUT, { recursive: true });

const report = {
  base: BASE,
  assemblyId: ASSEMBLY_ID,
  provider: null,
  egressId: null,
  recordingId: null,
  statusTimeline: [],
  fileSize: null,
  playStatus: null,
  downloadStatus: null,
  consoleErrors: [],
  networkErrors: [],
  screenshots: [],
  verdict: "NOT CERTIFIED",
  notes: []
};

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

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--autoplay-policy=no-user-gesture-required"
    ]
  });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    permissions: ["camera", "microphone"]
  });
  await context.grantPermissions(["camera", "microphone"]);
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") report.consoleErrors.push(msg.text());
  });
  page.on("response", (res) => {
    const s = res.status();
    if (s >= 400) {
      const u = res.url();
      if (!/antiforgery|favicon|404/.test(u)) {
        report.networkErrors.push({ status: s, url: u });
      }
    }
  });

  try {
    await login(page, "president@ocean.demo");
    await page.goto(`${BASE}/assembly.html?assemblyId=${ASSEMBLY_ID}`, {
      waitUntil: "domcontentloaded",
      timeout: 90000
    });
    await page.waitForTimeout(4000);

    // Enable camera / mic if buttons exist
    for (const sel of ["#btn-cam", "#btn-mic", "[data-action='toggle-cam']", "[data-action='toggle-mic']"]) {
      const el = page.locator(sel).first();
      if (await el.count()) {
        await el.click({ timeout: 2000 }).catch(() => {});
      }
    }
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(OUT, "01-room.png"), fullPage: true });
    report.screenshots.push("01-room.png");

    // Wait for LiveKit connection heuristics
    const connected = await page
      .waitForFunction(
        () => {
          const t = document.body?.innerText || "";
          return /conectado|connected|en vivo|en sala|participantes/i.test(t);
        },
        { timeout: 45000 }
      )
      .then(() => true)
      .catch(() => false);
    report.notes.push(`roomConnectedHint=${connected}`);

    // Start recording via API (same session) after room should exist
    let start = await api(page, "POST", `/api/assemblies/${ASSEMBLY_ID}/recording/start`, {});
    if (start.status >= 400) {
      // Create room by fetching meeting token / join endpoint
      await api(page, "POST", `/api/assemblies/${ASSEMBLY_ID}/meeting/token`, {}).catch(() => null);
      await api(page, "POST", `/api/assemblies/${ASSEMBLY_ID}/meeting/join`, {}).catch(() => null);
      await page.waitForTimeout(2000);
      start = await api(page, "POST", `/api/assemblies/${ASSEMBLY_ID}/recording/start`, {});
    }
    report.statusTimeline.push({ at: "start", http: start.status, body: start.json });
    report.provider = start.json?.provider || null;
    report.recordingId = start.json?.id || null;
    report.egressId = start.json?.providerEgressId || start.json?.egressId || null;

    if (start.status >= 400 || report.provider !== "LiveKitEgress") {
      report.notes.push("START_FAILED_OR_NOT_LIVEKIT");
      report.verdict = "NOT CERTIFIED";
      fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report, null, 2));
      await browser.close();
      process.exit(1);
    }

    await page.waitForTimeout(2000);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(OUT, "02-recording.png"), fullPage: true });
    report.screenshots.push("02-recording.png");

    // Hold for media capture
    await page.waitForTimeout(20000);

    const stop = await api(
      page,
      "POST",
      `/api/assemblies/${ASSEMBLY_ID}/recording/${report.recordingId}/stop`,
      {}
    );
    report.statusTimeline.push({ at: "stop", http: stop.status, body: stop.json });

    // Poll refresh until Ready or timeout
    let ready = null;
    for (let i = 0; i < 40; i++) {
      const r = await api(
        page,
        "POST",
        `/api/assemblies/${ASSEMBLY_ID}/recording/${report.recordingId}/refresh`,
        {}
      );
      const st = r.json?.status;
      report.statusTimeline.push({ at: `refresh-${i}`, status: st, bytes: r.json?.fileSizeBytes });
      if (st === "Ready" || st === "Failed") {
        ready = r.json;
        break;
      }
      await page.waitForTimeout(3000);
    }

    report.fileSize = ready?.fileSizeBytes ?? null;
    await page.screenshot({ path: path.join(OUT, "03-after-stop.png"), fullPage: true });
    report.screenshots.push("03-after-stop.png");

    if (ready?.status === "Ready" && report.fileSize > 1000) {
      const play = await page.evaluate(async ({ aid, rid }) => {
        const res = await fetch(`/api/assemblies/${aid}/recording/${rid}/play`, {
          credentials: "same-origin"
        });
        return { status: res.status, type: res.headers.get("content-type"), len: res.headers.get("content-length") };
      }, { aid: ASSEMBLY_ID, rid: report.recordingId });
      report.playStatus = play;
      const dl = await page.evaluate(async ({ aid, rid }) => {
        const res = await fetch(`/api/assemblies/${aid}/recording/${rid}/download`, {
          credentials: "same-origin"
        });
        const buf = await res.arrayBuffer();
        return { status: res.status, type: res.headers.get("content-type"), bytes: buf.byteLength };
      }, { aid: ASSEMBLY_ID, rid: report.recordingId });
      report.downloadStatus = dl;

      if (play.status === 200 && dl.status === 200 && dl.bytes > 1000) {
        report.verdict = "LIVEKIT REAL EGRESS — PRODUCTION CERTIFIED";
      }
    }

    await page.goto(`${BASE}/expediente.html?assemblyId=${ASSEMBLY_ID}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    }).catch(() => null);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT, "04-expediente.png"), fullPage: true }).catch(() => {});
    report.screenshots.push("04-expediente.png");
  } catch (err) {
    report.notes.push(String(err?.stack || err));
    report.verdict = "NOT CERTIFIED";
  }

  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  process.exit(report.verdict.includes("CERTIFIED") && !report.verdict.includes("NOT") ? 0 : 1);
})();
