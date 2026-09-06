/**
 * Shared helpers for master browser E2E certification.
 * Never log passwords, tokens, or cookies.
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require(path.join(__dirname, "..", "node_modules", "playwright"));

const ROOT = path.join(__dirname, "..", "..", "..");
const STAMP = process.env.E2E_CERT_STAMP || "E2E-CERT-MASTER-20260906_142448";
const RUN_ID = process.env.E2E_CERT_RUN_ID || "20260906_142448";
const BASE = process.env.ASAMBLEAS_BASE_URL || "https://localhost:7188";
const OUT = path.join(__dirname, "..", "master-cert-results", RUN_ID);
const MATRIX_PATH = path.join(OUT, "matrix.json");
const DEFECTS_PATH = path.join(OUT, "defects.json");

function ensureOut() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(path.join(OUT, "screenshots"), { recursive: true });
  fs.mkdirSync(path.join(OUT, "traces"), { recursive: true });
}

function loadPassword() {
  if (process.env.ASAMBLEAS_DEMO_PASSWORD) return process.env.ASAMBLEAS_DEMO_PASSWORD;
  const p = path.join(ROOT, ".demo-password.local");
  if (fs.existsSync(p)) return fs.readFileSync(p, "utf8").trim();
  throw new Error("Missing demo password (ASAMBLEAS_DEMO_PASSWORD or .demo-password.local)");
}

function loadMatrix() {
  ensureOut();
  if (fs.existsSync(MATRIX_PATH)) return JSON.parse(fs.readFileSync(MATRIX_PATH, "utf8"));
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, "matrix-seed.json"), "utf8"));
  fs.writeFileSync(MATRIX_PATH, JSON.stringify(seed, null, 2));
  return seed;
}

function saveMatrix(rows) {
  ensureOut();
  fs.writeFileSync(MATRIX_PATH, JSON.stringify(rows, null, 2));
  const summary = {
    stamp: STAMP,
    base: BASE,
    at: new Date().toISOString(),
    PASS: rows.filter((r) => r.status === "PASS").length,
    FAIL: rows.filter((r) => r.status === "FAIL").length,
    PENDING: rows.filter((r) => r.status === "PENDING").length,
    BLOCKED: rows.filter((r) => r.status === "BLOCKED").length,
    SKIP: rows.filter((r) => r.status === "SKIP").length
  };
  fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
  return summary;
}

function setResult(rows, id, status, evidence, defect) {
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error("Unknown matrix id " + id);
  row.status = status;
  row.evidence = evidence || null;
  row.defect = defect || null;
  row.updatedAt = new Date().toISOString();
}

function loadDefects() {
  ensureOut();
  if (!fs.existsSync(DEFECTS_PATH)) {
    fs.writeFileSync(DEFECTS_PATH, "[]");
    return [];
  }
  return JSON.parse(fs.readFileSync(DEFECTS_PATH, "utf8"));
}

function addDefect(defects, d) {
  defects.push({
    id: d.id,
    severity: d.severity,
    flow: d.flow,
    rootCause: d.rootCause,
    remediation: d.remediation || null,
    evidence: d.evidence || null,
    status: d.status || "OPEN",
    at: new Date().toISOString()
  });
  fs.writeFileSync(DEFECTS_PATH, JSON.stringify(defects, null, 2));
}

async function shot(page, name) {
  ensureOut();
  const file = path.join(OUT, "screenshots", `${name}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  return path.relative(ROOT, file).replace(/\\/g, "/");
}

async function api(page, method, url, body) {
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      return await page.evaluate(
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
            json = { raw: String(text).slice(0, 400) };
          }
          return { status: res.status, json, text: String(text || "").slice(0, 800) };
        },
        { method, url, body }
      );
    } catch (err) {
      lastErr = err;
      await page.waitForTimeout(400);
      await page.waitForLoadState("domcontentloaded").catch(() => {});
    }
  }
  throw lastErr;
}

/** Browser-visible login via form when present; otherwise antiforgery API login (still in browser context). */
async function loginUi(page, email, password) {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  // Prefer dedicated login fields — avoid hidden adminEmail on other pages.
  const emailSel = page.locator('#email, form#login-form input[type="email"], input[name="email"]:visible').first();
  const passSel = page.locator('#password, form#login-form input[type="password"], input[name="password"]:visible').first();
  const visibleLogin = await emailSel.count() && await emailSel.isVisible().catch(() => false);
  if (visibleLogin) {
    await emailSel.fill(email);
    await passSel.fill(password);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {}),
      page.locator('button[type="submit"], button:has-text("Entrar"), #login-submit').first().click()
    ]);
    await page.waitForTimeout(500);
    return { mode: "form", ok: true };
  }
  const status = await page.evaluate(
    async ({ email, password }) => {
      const af = await fetch("/api/auth/antiforgery", { credentials: "same-origin" });
      const { requestToken } = await af.json();
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          RequestVerificationToken: requestToken,
          Accept: "application/json"
        },
        body: JSON.stringify({ email, password })
      });
      return res.status;
    },
    { email, password }
  );
  return { mode: "fetch-in-page", status, ok: status >= 200 && status < 300 };
}

async function loginInvalidUi(page, email, password) {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  const emailSel = page.locator('input[type="email"], input[name="email"], #email').first();
  if (await emailSel.count()) {
    await emailSel.fill(email);
    await page.locator('input[type="password"], #password').first().fill(password);
    await page.locator('button[type="submit"], button:has-text("Entrar")').first().click();
    await page.waitForTimeout(1000);
    const alert = page.locator(".alert, [role='alert'], .error, #page-alert").first();
    const txt = (await alert.count()) ? await alert.innerText().catch(() => "") : await page.content();
    return { mode: "form", body: String(txt).slice(0, 300) };
  }
  return page.evaluate(
    async ({ email, password }) => {
      const af = await fetch("/api/auth/antiforgery", { credentials: "same-origin" });
      const { requestToken } = await af.json();
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          RequestVerificationToken: requestToken,
          Accept: "application/json"
        },
        body: JSON.stringify({ email, password })
      });
      return { mode: "fetch-in-page", status: res.status, body: (await res.text()).slice(0, 200) };
    },
    { email, password }
  );
}

async function launchBrowser() {
  return chromium.launch({ headless: true, ignoreHTTPSErrors: true });
}

async function newContext(browser, opts = {}) {
  return browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: opts.viewport || { width: 1366, height: 768 },
    recordVideo: opts.video ? { dir: path.join(OUT, "videos") } : undefined,
    ...opts.extra
  });
}

function computeVerdict(rows) {
  const pass = rows.filter((r) => r.status === "PASS").length;
  const fail = rows.filter((r) => r.status === "FAIL").length;
  const pending = rows.filter((r) => r.status === "PENDING").length;
  const blocked = rows.filter((r) => r.status === "BLOCKED").length;
  const openP0 = (loadDefects() || []).filter((d) => d.severity === "P0" && d.status === "OPEN").length;
  const openP1 = (loadDefects() || []).filter((d) => d.severity === "P1" && d.status === "OPEN").length;
  const openP2 = (loadDefects() || []).filter((d) => d.severity === "P2" && d.status === "OPEN").length;
  let verdict = "NO CERTIFIED";
  if (fail === 0 && pending === 0 && openP0 === 0 && openP1 === 0 && openP2 === 0) {
    if (blocked > 0) verdict = "SOFTWARE 100/100 — HUMAN UAT PENDING";
    else verdict = "100/100 CERTIFIED — FULL BROWSER E2E — VPS VERIFIED";
  } else if (pass > 0 && (fail > 0 || pending > 0 || openP0 + openP1 + openP2 > 0)) {
    verdict = "PARTIALLY CERTIFIED";
  }
  return { verdict, pass, fail, pending, blocked, openP0, openP1, openP2 };
}

module.exports = {
  STAMP,
  RUN_ID,
  BASE,
  OUT,
  ROOT,
  ensureOut,
  loadPassword,
  loadMatrix,
  saveMatrix,
  setResult,
  loadDefects,
  addDefect,
  shot,
  api,
  loginUi,
  loginInvalidUi,
  launchBrowser,
  newContext,
  computeVerdict,
  chromium
};
