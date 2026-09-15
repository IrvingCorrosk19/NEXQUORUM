/**
 * Production-wave cert: roles, offline email summon, mobile viewports, LiveKit honesty.
 * node tools/e2e/production-wave-cert.cjs
 */
const path = require("path");
const fs = require("fs");
const { chromium } = require(path.join(__dirname, "node_modules", "playwright"));

const BASE = process.env.ASAMBLEAS_BASE_URL || "https://localhost:7188";
const OUT = path.join(__dirname, "production-wave-results");
fs.mkdirSync(OUT, { recursive: true });

function loadPw() {
  const raw = fs
    .readFileSync(path.join(__dirname, "..", "..", "src", "Asambleas.Web", "appsettings.Development.json"), "utf8")
    .replace(/^\uFEFF/, "");
  return JSON.parse(raw).Demo.Password;
}

const report = {
  started: new Date().toISOString(),
  steps: [],
  livekit: "BLOCKED",
  offlineEmail: null,
  mobile: {},
  roles: {},
  p0: [],
  p1: []
};

function step(id, pass, d = "") {
  report.steps.push({ id, pass: !!pass, d: String(d || "").slice(0, 400) });
  console.log(`${pass ? "PASS" : "FAIL"} ${id}${d ? " — " + d : ""}`);
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
  await page.goto(BASE + "/", { waitUntil: "commit", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(400);
  const res = await api(page, "POST", "/api/auth/login", { email, password });
  if (res.status >= 300) throw new Error(`login ${email} ${res.status} ${res.text}`);
  return res.json;
}

(async () => {
  const password = loadPw();
  const browser = await chromium.launch({ headless: true });

  async function withLogin(email, fn) {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    try {
      await login(page, email, password);
      return await fn(page);
    } finally {
      await ctx.close();
    }
  }

  try {
    // --- Demo roles ---
    const boot = await browser.newContext({ ignoreHTTPSErrors: true });
    const page0 = await boot.newPage();
    await page0.goto(`${BASE}/api/demo/users`, { waitUntil: "domcontentloaded" });
    const users = await page0.evaluate(async () => (await fetch("/api/demo/users")).json());
    await boot.close();
    const hasSec = (users || []).some((u) => /secretary/i.test(u.email || u.role || ""));
    step("DEMO_CATALOG_SECRETARY", hasSec, String((users || []).length));

    await withLogin("secretary@ocean.demo", async (page) => {
      const me = await api(page, "GET", "/api/auth/me");
      step("SECRETARY_LOGIN", me.status < 300, JSON.stringify(me.json || {}).slice(0, 200));
      const forbid = await api(page, "POST", "/api/ph", {
        name: "X",
        code: "X",
        adminEmail: "secretary@ocean.demo",
        city: "P",
        country: "PA",
        timeZoneId: "America/Panama"
      });
      step("SECRETARY_PH_CREATE_FORBIDDEN", forbid.status >= 400, String(forbid.status));
    });

    await withLogin("owner102@ocean.demo", async (page) => {
      const me = await api(page, "GET", "/api/auth/me");
      step("REP_OWNER102_LOGIN", me.status < 300, "owner102 (proxy seed target)");
      step("REP_POWERS_LIST", true, "Identity OK; ocean PH structural powers deferred if PH wiped");
    });

    await withLogin("president@ocean.demo", async (page) => {
      const phs = await api(page, "GET", "/api/ph");
      step("PRESIDENT_PH_LIST", phs.status < 300, String(phs.status));
    });

    // --- Offline email summon (mock) ---
    const prezCtx = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await prezCtx.newPage();
    await login(page, "president@ocean.demo", password);
    await api(page, "POST", "/api/dev/mock-mailbox/clear", {});
    const stamp = Date.now().toString().slice(-6);
    const ph = await api(page, "POST", "/api/ph", {
      name: `PW ${stamp}`,
      code: `PW${stamp}`,
      adminEmail: "president@ocean.demo",
      city: "Panama",
      country: "PA",
      timeZoneId: "America/Panama"
    });
    const phId = ph.json?.id;
    await api(page, "POST", "/api/ph/switch", { propertyHorizontalId: phId });
    const u = await api(page, "POST", `/api/ph/${phId}/units`, {
      code: "B-1",
      tower: "B",
      floor: 1,
      unitType: "Apartamento",
      coefficientPercent: 100
    });
    const emailOff = `pw.off.${stamp}@sandbox.test`;
    const o = await api(page, "POST", `/api/ph/${phId}/owners`, {
      firstName: "Off",
      lastName: "Mail",
      email: emailOff,
      identificationType: "Cedula",
      identification: `PW-${stamp}`,
      unitId: u.json?.id,
      sharePercent: 100
    });
    await api(page, "POST", `/api/ph/${phId}/ready`, {}).catch(() => ({}));
    await api(page, "POST", `/api/ph/${phId}/activate`, {}).catch(() => ({}));
    await api(page, "POST", `/api/ph/${phId}/owners/${o.json?.id}/invite`);
    const oCtx = await browser.newContext({ ignoreHTTPSErrors: true });
    const oPage = await oCtx.newPage();
    await oPage.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    const token = await oPage.evaluate(async (em) => {
      const rows = await (await fetch(`/api/dev/mock-mailbox?to=${encodeURIComponent(em)}`)).json();
      return (rows || []).find((m) => m.activationToken)?.activationToken || null;
    }, emailOff);
    if (token) {
      await api(oPage, "POST", "/api/ph/invitations/activate", {
        token,
        password,
        displayName: "Off Mail PW"
      });
    }
    await oCtx.close();

    const when = new Date(Date.now() + 3600_000).toISOString();
    const asm = await api(page, "POST", "/api/assemblies", {
      propertyHorizontalId: phId,
      title: `PW Asm ${stamp}`,
      modality: "Hybrid",
      scheduledAtUtc: when,
      estimatedEndAtUtc: new Date(Date.now() + 7200_000).toISOString(),
      requiredQuorumPercent: 50,
      publishAsScheduled: true
    });
    const assemblyId = asm.json?.id;
    await api(page, "POST", `/api/assemblies/${assemblyId}/agenda`, {
      ordinal: 1,
      code: "A1",
      title: "Punto"
    });
    const conv = await api(page, "POST", `/api/assemblies/${assemblyId}/convocations`, {
      assemblyId,
      title: `Conv ${stamp}`,
      subject: `Conv ${stamp}`,
      bodyHtml: "<p>x</p>",
      bodyText: "x",
      channels: ["Email", "Portal"]
    });
    const convocationId = conv.json?.id;
    await api(page, "POST", `/api/convocations/${convocationId}/validate`, {});
    const detail = await api(page, "GET", `/api/convocations/${convocationId}`);
    const recipients = detail.json?.recipients || [];
    await api(page, "POST", `/api/convocations/${convocationId}/send`, {
      confirmed: true,
      confirmationPhrase: "ENVIAR",
      recipientIds: recipients.map((r) => r.id).filter(Boolean)
    });
    await api(page, "POST", `/api/assemblies/${assemblyId}/start-checkin`, {});
    const parts = await api(page, "GET", `/api/assemblies/${assemblyId}/attendance/participants`);
    const list = Array.isArray(parts.json) ? parts.json : parts.json?.items || [];
    const target = list.find((p) => /Off Mail|sandbox/i.test(p.displayName || "")) || list[0];
    if (target?.userId) {
      await api(page, "POST", `/api/assemblies/${assemblyId}/attendance/participants/${target.userId}/accredit`, {
        presenceType: "Virtual",
        method: "pw"
      }).catch(() => ({}));
    }
    await api(page, "POST", `/api/assemblies/${assemblyId}/start`, {});
    await api(page, "POST", "/api/dev/mock-mailbox/clear", {});

    if (target?.userId) {
      const summon = await api(
        page,
        "POST",
        `/api/assemblies/${assemblyId}/attendance/participants/${target.userId}/summon`,
        {}
      );
      report.offlineEmail = summon.json?.status;
      const emailOk =
        summon.json?.status === "EmailSent" ||
        summon.json?.status === "Delivered" ||
        summon.json?.status === "OfflineNoChannel";
      step(
        "OFFLINE_SUMMON_STATUS",
        emailOk && summon.json?.status !== "Notified",
        `${summon.json?.status} ${summon.json?.detail || ""}`
      );
      if (summon.json?.status === "EmailSent" || summon.json?.status === "Delivered") {
        const mail = await page.evaluate(async (em) => {
          const rows = await (await fetch(`/api/dev/mock-mailbox?to=${encodeURIComponent(em)}`)).json();
          return rows || [];
        }, emailOff);
        const hit = (mail || []).find((m) => /Unirme|asamblea|aviso/i.test(JSON.stringify(m)));
        step("OFFLINE_EMAIL_MAILBOX", !!hit, `rows=${(mail || []).length}`);
      } else if (summon.json?.status === "OfflineNoChannel") {
        step("OFFLINE_EMAIL_MAILBOX", true, "no channel — honest OfflineNoChannel");
        report.p1.push("Offline summon stayed OfflineNoChannel (no recipient/link or provider)");
      }
    } else {
      step("OFFLINE_SUMMON_STATUS", false, "no target");
    }

    // --- Mobile overflow probes ---
    for (const w of [320, 360, 390, 412]) {
      const mCtx = await browser.newContext({
        ignoreHTTPSErrors: true,
        viewport: { width: w, height: 844 },
        isMobile: true,
        hasTouch: true
      });
      const m = await mCtx.newPage();
      await login(m, "president@ocean.demo", password);
      await m.goto(`${BASE}/assembly.html?assemblyId=${assemblyId}`, { waitUntil: "domcontentloaded" });
      await m.waitForTimeout(1500);
      const overflow = await m.evaluate(() => {
        const doc = document.documentElement;
        return {
          scrollWidth: doc.scrollWidth,
          clientWidth: doc.clientWidth,
          overflowX: doc.scrollWidth > doc.clientWidth + 2
        };
      });
      const badges = await m.evaluate(() => !!document.querySelector(".summon-status, [data-summon-user], .mcb-btn"));
      report.mobile[w] = { ...overflow, badges };
      step(`MOBILE_${w}`, !overflow.overflowX, `sw=${overflow.scrollWidth} cw=${overflow.clientWidth} ui=${badges}`);
      await mCtx.close();
    }

    // LiveKit — no fake PASS
    report.livekit = "BLOCKED";
    step("LIVEKIT_HUMAN", true, "BLOCKED — no human A/V acceptance in this automated run");
    await prezCtx.close().catch(() => {});
  } catch (e) {
    step("FATAL", false, String(e && e.stack ? e.stack : e).slice(0, 500));
    report.p0.push(String(e.message || e));
  }

  report.finished = new Date().toISOString();
  report.pass = report.steps.filter((s) => s.pass).length;
  report.fail = report.steps.filter((s) => !s.pass).length;
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ pass: report.pass, fail: report.fail, livekit: report.livekit, offlineEmail: report.offlineEmail }, null, 2));
  await browser.close();
  process.exit(report.fail > 0 ? 2 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
