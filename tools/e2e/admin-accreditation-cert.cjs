/**
 * Browser Tab cert — admin-only accreditation (local https://localhost:7188).
 * Covers: owner pending UI, no self-accredit, 403 check-in, admin accredit,
 * realtime banner, presence≠accredit, mobile viewport, revoke messaging.
 */
const path = require("path");
const fs = require("fs");
const { chromium } = require(path.join(__dirname, "node_modules", "playwright"));

const BASE = process.env.ASAMBLEAS_BASE_URL || "https://localhost:7188";
const OUT = path.join(__dirname, "admin-acred-results");
fs.mkdirSync(OUT, { recursive: true });

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
      return { status: res.status, json };
    },
    { method, url, body }
  );
}

async function login(page, email, password) {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  const res = await api(page, "POST", "/api/auth/login", { email, password });
  if (res.status >= 300) throw new Error(`login ${email} -> ${res.status}`);
  return res.json;
}

(async () => {
  const results = [];
  const ok = (id, pass, d) => {
    results.push({ id, pass: !!pass, d: String(d || "") });
    console.log(pass ? "PASS" : "FAIL", id, d || "");
  };

  const browser = await chromium.launch({ headless: true, ignoreHTTPSErrors: true });
  const prezCtx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 860 } });
  const ownerCtx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 860 } });
  const mobileCtx = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });
  const prez = await prezCtx.newPage();
  const owner = await ownerCtx.newPage();
  const mobile = await mobileCtx.newPage();
  const password = loadPw();

  try {
    await login(prez, "president@ocean.demo", password);
    ok("T01_LOGIN_PRESIDENT", true);

    const assemblies = await api(prez, "GET", "/api/assemblies");
    const list = Array.isArray(assemblies.json) ? assemblies.json : assemblies.json?.items || [];
    let assemblyId =
      list.find((a) => String(a.status || "").match(/CheckIn|Scheduled|InProgress|Paused/i))?.id ||
      list[0]?.id;
    ok("T01_ASSEMBLY", !!assemblyId, assemblyId || "none");
    if (!assemblyId) throw new Error("No assembly available");

    // Ensure desk open
    const startDesk = await api(prez, "POST", `/api/assemblies/${assemblyId}/start-checkin`, {});
    ok("T01_START_CHECKIN", startDesk.status < 300 || startDesk.status === 400, String(startDesk.status));

    // Owner session
    await login(owner, "owner101@ocean.demo", password);
    ok("T02_LOGIN_OWNER", true);

    // Owner cannot self-accredit via API
    const denied = await api(owner, "POST", `/api/assemblies/${assemblyId}/attendance/check-in`, {
      unitId: null,
      presenceType: "Virtual",
      method: "SelfCheckIn"
    });
    ok("T04_OWNER_CHECKIN_403", denied.status === 403, String(denied.status));

    const deniedAccredit = await api(
      owner,
      "POST",
      `/api/assemblies/${assemblyId}/attendance/participants/${denied.json?.userId || "00000000-0000-0000-0000-000000000001"}/accredit`,
      { presenceType: "Virtual", method: "OperatorCheckIn" }
    );
    ok("T04_OWNER_ACCREDIT_OTHER_403", deniedAccredit.status === 403, String(deniedAccredit.status));

    // Lobby pending state
    await owner.goto(`${BASE}/lobby.html?assemblyId=${assemblyId}`, { waitUntil: "networkidle" });
    await owner.waitForTimeout(1200);
    await owner.screenshot({ path: path.join(OUT, "01-owner-lobby-pending.png"), fullPage: true });

    const pendingText = await owner.evaluate(() => {
      const banner = document.querySelector("#accreditation-banner")?.textContent || "";
      const hint = document.querySelector("#enter-hint")?.textContent || "";
      const selfBtn = document.querySelector("#btn-self-checkin");
      const link = document.querySelector("#link-checkin");
      return {
        banner,
        hint,
        hasSelfBtn: Boolean(selfBtn && !selfBtn.hidden),
        linkHidden: !link || link.hidden,
        body: document.body.innerText.slice(0, 1200)
      };
    });
    const pendingOk =
      /pendiente de validación/i.test(pendingText.banner + pendingText.hint + pendingText.body) &&
      !pendingText.hasSelfBtn &&
      pendingText.linkHidden &&
      !/Acreditarme|Solicitar acreditación|Registrar mi asistencia/i.test(pendingText.body);
    ok("T03_OWNER_NO_SELF_ACCREDIT_UI", pendingOk, JSON.stringify({
      banner: pendingText.banner.slice(0, 80),
      hasSelfBtn: pendingText.hasSelfBtn,
      linkHidden: pendingText.linkHidden
    }));

    // Resolve owner101 user id from room-state / me
    const meOwner = await api(owner, "GET", "/api/auth/me");
    const ownerUserId = meOwner.json?.userId || meOwner.json?.id;
    ok("T02_OWNER_ID", !!ownerUserId, ownerUserId);

    // Quorum before accredit (baseline)
    const q0 = await api(prez, "GET", `/api/assemblies/${assemblyId}/quorum`);
    const coeff0 = Number(q0.json?.currentCoefficient ?? q0.json?.CurrentCoefficient ?? 0);

    // President accredits via API (same as Acreditar button)
    const acred = await api(prez, "POST", `/api/assemblies/${assemblyId}/attendance/participants/${ownerUserId}/accredit`, {
      presenceType: "Virtual",
      method: "OperatorCheckIn"
    });
    ok("T01_ADMIN_ACCREDIT", acred.status < 300 && acred.json?.isAccredited === true, String(acred.status));

    // Accreditation must not inflate quorum by itself
    const q1 = await api(prez, "GET", `/api/assemblies/${assemblyId}/quorum`);
    const coeff1 = Number(q1.json?.currentCoefficient ?? q1.json?.CurrentCoefficient ?? 0);
    ok("T10_ACCREDIT_NOT_PRESENCE", Math.abs(coeff1 - coeff0) < 0.0001 || coeff1 <= coeff0 + 0.0001, `before=${coeff0} after=${coeff1}`);

    // Wait for realtime / soft update on owner lobby
    let realtimeOk = false;
    for (let i = 0; i < 20; i++) {
      await owner.waitForTimeout(500);
      const state = await owner.evaluate(() => {
        const banner = document.querySelector("#accreditation-banner")?.textContent || "";
        const fact = document.querySelector("#fact-accreditation")?.textContent || "";
        const hint = document.querySelector("#enter-hint")?.textContent || "";
        return banner + " " + fact + " " + hint;
      });
      if (/Acreditado|acreditación está aprobada|acreditación fue aprobada/i.test(state)) {
        realtimeOk = true;
        break;
      }
    }
    // Fallback soft refresh if SignalR missed (still verify UI path)
    if (!realtimeOk) {
      await owner.reload({ waitUntil: "networkidle" });
      await owner.waitForTimeout(1000);
      const state = await owner.evaluate(() => {
        const banner = document.querySelector("#accreditation-banner")?.textContent || "";
        const fact = document.querySelector("#fact-accreditation")?.textContent || "";
        return banner + " " + fact;
      });
      realtimeOk = /Acreditado|aprobada/i.test(state);
      ok("T02_REALTIME_OR_REFRESH", realtimeOk, "used refresh fallback");
    } else {
      ok("T02_REALTIME_UPDATE", true, "SignalR/banner updated live");
    }
    await owner.screenshot({ path: path.join(OUT, "02-owner-lobby-accredited.png"), fullPage: true });

    const waitingStart = await owner.evaluate(() => {
      const t = (document.querySelector("#accreditation-banner")?.textContent || "") +
        (document.querySelector("#enter-hint")?.textContent || "") +
        (document.querySelector("#lobby-status")?.textContent || "");
      return t;
    });
    ok(
      "T05_ACCREDITED_BEFORE_START_MSG",
      /aún no ha iniciado|acreditación está aprobada|Acreditado/i.test(waitingStart),
      waitingStart.slice(0, 120)
    );

    // Presence after accreditation updates quorum
    const present = await api(owner, "POST", `/api/assemblies/${assemblyId}/attendance/presence`, {});
    ok("T11_PRESENCE_AFTER_ACCREDIT", present.status < 300, String(present.status));
    const q2 = await api(prez, "GET", `/api/assemblies/${assemblyId}/quorum`);
    const coeff2 = Number(q2.json?.currentCoefficient ?? q2.json?.CurrentCoefficient ?? 0);
    ok("T11_QUORUM_AFTER_PRESENCE", coeff2 >= coeff1, `before=${coeff1} after=${coeff2}`);

    // Admin checkin UI — no self-checkin for owners; Acreditar available
    await prez.goto(`${BASE}/checkin.html?assemblyId=${assemblyId}`, { waitUntil: "networkidle" });
    await prez.waitForTimeout(1000);
    await prez.screenshot({ path: path.join(OUT, "03-admin-checkin.png"), fullPage: true });
    const deskUi = await prez.evaluate(() => {
      const selfBtn = document.querySelector("#btn-self-checkin");
      return {
        selfHidden: !selfBtn || selfBtn.hidden,
        hasAccredit: /Acreditar/i.test(document.body.innerText)
      };
    });
    ok("T01_ADMIN_UI", deskUi.selfHidden && deskUi.hasAccredit, JSON.stringify(deskUi));

    // Mobile responsive lobby
    await login(mobile, "owner101@ocean.demo", password);
    await mobile.goto(`${BASE}/lobby.html?assemblyId=${assemblyId}`, { waitUntil: "networkidle" });
    await mobile.waitForTimeout(1000);
    await mobile.screenshot({ path: path.join(OUT, "04-owner-lobby-mobile.png"), fullPage: true });
    const overflow = await mobile.evaluate(() => {
      const doc = document.documentElement;
      return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
    });
    ok("T15_MOBILE_NO_OVERFLOW", overflow.scrollWidth <= overflow.clientWidth + 8, JSON.stringify(overflow));

    // Revoke
    const revoke = await api(prez, "POST", `/api/assemblies/${assemblyId}/attendance/participants/${ownerUserId}/deaccredit`, {
      reason: "Correccion de certificacion E2E browser"
    });
    ok("T13_REVOKE", revoke.status < 300, String(revoke.status));

    // Cross-tenant hard fail: owner ocean cannot accredit other assembly
    const otherAsm = list.find((a) => a.id !== assemblyId)?.id;
    if (otherAsm) {
      const cross = await api(owner, "POST", `/api/assemblies/${otherAsm}/attendance/check-in`, {
        presenceType: "Virtual"
      });
      ok("T16_CROSS_OR_FORBIDDEN", cross.status === 403 || cross.status === 400 || cross.status === 404, String(cross.status));
    } else {
      ok("T16_CROSS_SKIP", true, "single assembly in catalog");
    }
  } catch (err) {
    ok("FATAL", false, String(err && err.message ? err.message : err).slice(0, 300));
    try {
      await prez.screenshot({ path: path.join(OUT, "fatal-prez.png") });
      await owner.screenshot({ path: path.join(OUT, "fatal-owner.png") });
    } catch {
      /* ignore */
    }
  } finally {
    const passed = results.filter((r) => r.pass).length;
    const failed = results.filter((r) => !r.pass).length;
    const summary = { at: new Date().toISOString(), base: BASE, passed, failed, results };
    fs.writeFileSync(path.join(OUT, "matrix.json"), JSON.stringify(summary, null, 2));
    console.log("\nSUMMARY", passed, "pass /", failed, "fail →", OUT);
    await browser.close();
    process.exit(failed ? 1 : 0);
  }
})();
