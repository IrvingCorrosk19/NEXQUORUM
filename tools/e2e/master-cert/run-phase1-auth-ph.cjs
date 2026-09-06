/**
 * Master cert Phase 1 (Auth/Security) + PH create isolation.
 */
const path = require("path");
const fs = require("fs");
const {
  BASE, OUT, STAMP, loadPassword, loadMatrix, saveMatrix, setResult,
  loadDefects, addDefect, shot, api, loginUi, loginInvalidUi,
  launchBrowser, newContext, computeVerdict, ensureOut
} = require("./lib.cjs");

const USERS = {
  president: "president@ocean.demo",
  ownerA: "owner101@ocean.demo",
  otherTenant: "president@other.demo"
};

function pickId(rows, candidates) {
  for (const id of candidates) if (rows.find((r) => r.id === id)) return id;
  return null;
}

(async () => {
  ensureOut();
  const password = loadPassword();
  const rows = loadMatrix();
  const defects = loadDefects();
  const consoleErrors = [];
  const browser = await launchBrowser();
  const attach = (page, tag) => {
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push({ tag, text: msg.text().slice(0, 240) });
    });
  };

  let e2ePhId = null;
  try {
    // AUTH-01
    {
      const ctx = await newContext(browser);
      const page = await ctx.newPage();
      attach(page, "AUTH-01");
      const r = await loginUi(page, USERS.president, password);
      await page.goto(BASE + "/ph.html", { waitUntil: "domcontentloaded" });
      const me = await api(page, "GET", "/api/auth/me");
      const ev = await shot(page, "AUTH-01-login-president");
      const ok = r.ok && me.status === 200 && me.json;
      setResult(rows, "AUTH-01", ok ? "PASS" : "FAIL", { shot: ev, meStatus: me.status, mode: r.mode });
      if (!ok) addDefect(defects, { id: "DEF-AUTH-01", severity: "P0", flow: "AUTH-01", rootCause: "Login failed", evidence: ev });
      await ctx.close();
    }

    // AUTH-02
    {
      const ctx = await newContext(browser);
      const page = await ctx.newPage();
      const r = await loginInvalidUi(page, USERS.president, "Definitely-Wrong-Password-!!");
      const ev = await shot(page, "AUTH-02-invalid-login");
      const status = r.status || 0;
      const okStatus = status === 401 || status === 400 || /invalid|incorrect|credencial|error|fall/i.test(String(r.body || ""));
      const me = await api(page, "GET", "/api/auth/me").catch(() => ({ status: 401 }));
      const stillAnon = me.status === 401 || me.status === 403 || !me.json?.email;
      setResult(rows, "AUTH-02", okStatus && stillAnon ? "PASS" : "FAIL", { shot: ev, status, stillAnon });
      if (!(okStatus && stillAnon)) addDefect(defects, { id: "DEF-AUTH-02", severity: "P0", flow: "AUTH-02", rootCause: "Invalid login leak", evidence: ev });
      await ctx.close();
    }

    // AUTH-03 logout
    {
      const ctx = await newContext(browser);
      const page = await ctx.newPage();
      await loginUi(page, USERS.president, password);
      const before = await api(page, "GET", "/api/auth/me");
      const logout = await api(page, "POST", "/api/auth/logout");
      const after = await api(page, "GET", "/api/auth/me");
      await page.goto(BASE + "/ph.html", { waitUntil: "domcontentloaded" });
      const ev = await shot(page, "AUTH-03-after-logout");
      const ok = before.status === 200 && after.status === 401;
      setResult(rows, "AUTH-03", ok ? "PASS" : "FAIL", { shot: ev, before: before.status, logout: logout.status, after: after.status });
      if (!ok) addDefect(defects, { id: "DEF-AUTH-03", severity: "P1", flow: "AUTH-03", rootCause: "Logout incomplete", evidence: ev });
      await ctx.close();
    }

    // AUTH-04 deep link anon
    {
      const ctx = await newContext(browser);
      const page = await ctx.newPage();
      await page.goto(BASE + "/assembly.html?assemblyId=00000000-0000-0000-0000-000000000001", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(800);
      const url = page.url();
      const me = await api(page, "GET", "/api/auth/me");
      const ev = await shot(page, "AUTH-04-deeplink-anon");
      const redirectedOrBlocked =
        me.status === 401 || /login|index\.html|activate|join/i.test(url) || url.endsWith("/") || (await page.locator('input[type="password"]').count()) > 0;
      setResult(rows, "AUTH-04", redirectedOrBlocked ? "PASS" : "FAIL", { shot: ev, url, me: me.status });
      if (!redirectedOrBlocked) addDefect(defects, { id: "DEF-AUTH-04", severity: "P0", flow: "AUTH-04", rootCause: "Anon assembly access", evidence: ev });
      await ctx.close();
    }

    // AUTH-05 owner cannot create PH
    {
      const ctx = await newContext(browser);
      const page = await ctx.newPage();
      await loginUi(page, USERS.ownerA, password);
      await page.goto(BASE + "/ph.html", { waitUntil: "networkidle" }).catch(() => page.goto(BASE + "/ph.html", { waitUntil: "domcontentloaded" }));
      await page.waitForTimeout(500);
      const create = await api(page, "POST", "/api/ph", {
        name: STAMP + "-OWNER-ATTACK",
        code: "ATT" + Date.now().toString().slice(-5),
        timeZoneId: "America/Panama",
        country: "PA"
      });
      const ev = await shot(page, "AUTH-05-owner-ph-create");
      const ok = create.status === 401 || create.status === 403;
      const id = pickId(rows, ["AUTH-05", "SEC-01"]);
      if (id) setResult(rows, id, ok ? "PASS" : "FAIL", { shot: ev, status: create.status });
      if (!ok) addDefect(defects, { id: "DEF-AUTH-05", severity: "P0", flow: id || "AUTH-05", rootCause: "Owner create PH status=" + create.status, evidence: ev });
      await ctx.close();
    }

    // PH-01 create E2E PH
    {
      const ctx = await newContext(browser);
      const page = await ctx.newPage();
      await loginUi(page, USERS.president, password);
      await page.goto(BASE + "/ph.html", { waitUntil: "domcontentloaded" });
      const stampShort = Date.now().toString().slice(-6);
      const name = STAMP + "-PH-" + stampShort;
      const code = "E2E" + stampShort;
      const create = await api(page, "POST", "/api/ph", {
        name, code, timeZoneId: "America/Panama", country: "PA", adminEmail: USERS.president
      });
      let phId = create.json && create.json.id;
      if (!phId) {
        const list = await api(page, "GET", "/api/ph");
        const items = list.json && (list.json.items || list.json) || [];
        const hit = (Array.isArray(items) ? items : []).find((p) => p.name === name || p.code === code);
        phId = hit && hit.id;
      }
      e2ePhId = phId;
      const ev = await shot(page, "PH-01-create");
      const ok = Boolean(phId);
      if (pickId(rows, ["PH-01"])) setResult(rows, "PH-01", ok ? "PASS" : "FAIL", { shot: ev, phId, status: create.status });
      if (ok) await api(page, "POST", "/api/ph/switch", { propertyHorizontalId: phId });
      else addDefect(defects, { id: "DEF-PH-01", severity: "P1", flow: "PH-01", rootCause: "PH create failed", evidence: ev });
      await ctx.close();
    }

    // Cross-tenant
    if (e2ePhId) {
      const ctx = await newContext(browser);
      const page = await ctx.newPage();
      const loginOther = await loginUi(page, USERS.otherTenant, password);
      const detail = await api(page, "GET", "/api/ph/" + e2ePhId);
      const switchAttack = await api(page, "POST", "/api/ph/switch", { propertyHorizontalId: e2ePhId });
      const ev = await shot(page, "SEC-cross-tenant-ph");
      const ok = loginOther.ok && [401, 403, 404].includes(detail.status) && [401, 403, 404].includes(switchAttack.status);
      const id = pickId(rows, ["SEC-05", "SEC-02", "PH-06"]);
      if (id) setResult(rows, id, ok ? "PASS" : "FAIL", { shot: ev, detail: detail.status, switchAttack: switchAttack.status });
      if (!ok) addDefect(defects, { id: "DEF-SEC-CROSS", severity: "P0", flow: id || "SEC", rootCause: "Cross-tenant leak", evidence: ev });
      await ctx.close();
    }

    // Dual contexts
    {
      const ctxA = await newContext(browser);
      const ctxB = await newContext(browser);
      const pageA = await ctxA.newPage();
      const pageB = await ctxB.newPage();
      await loginUi(pageA, USERS.president, password);
      await loginUi(pageB, USERS.ownerA, password);
      const meA = await api(pageA, "GET", "/api/auth/me");
      const meB = await api(pageB, "GET", "/api/auth/me");
      const emailA = String(meA.json && (meA.json.email || meA.json.userName) || "").toLowerCase();
      const emailB = String(meB.json && (meB.json.email || meB.json.userName) || "").toLowerCase();
      const ok = emailA.includes("president") && emailB.includes("owner");
      const id = pickId(rows, ["AUTH-06", "AUTH-10"]);
      if (id) setResult(rows, id, ok ? "PASS" : "FAIL", { a: !!emailA, b: !!emailB });
      await ctxA.close();
      await ctxB.close();
    }

    const summary = saveMatrix(rows);
    const verdict = computeVerdict(rows);
    fs.writeFileSync(path.join(OUT, "phase1-2-report.json"), JSON.stringify({
      stamp: STAMP, base: BASE, summary, verdict, e2ePhId,
      consoleErrors: consoleErrors.slice(0, 40),
      defectsOpen: defects.filter((d) => d.status === "OPEN").length
    }, null, 2));
    console.log(JSON.stringify({ summary, verdict: verdict.verdict, e2ePhId }, null, 2));
  } catch (err) {
    fs.writeFileSync(path.join(OUT, "fatal.txt"), String(err && err.stack ? err.stack : err));
    console.error("FATAL", err && err.message ? err.message : err);
    process.exitCode = 2;
  } finally {
    await browser.close().catch(() => {});
  }
})();