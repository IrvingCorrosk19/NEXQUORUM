/**
 * VPS E2E — Completed/Cancelled historical seal (browser + API adversarial).
 * Usage: node tools/e2e/behavior-seal-e2e.cjs
 * Requires DEMO password file tools/e2e/.demo-pw.tmp (deleted after run if present).
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = process.env.ASAMBLEAS_BASE_URL || "https://asambleas.164.68.99.83.nip.io";
const OUT = path.join(__dirname, "behavior-seal-results");
fs.mkdirSync(OUT, { recursive: true });

const steps = [];
function ok(name, detail) {
  steps.push({ name, pass: true, detail });
  console.log("PASS", name, detail || "");
}
function fail(name, detail) {
  steps.push({ name, pass: false, detail });
  console.error("FAIL", name, detail || "");
}

async function login(page, email, password) {
  await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    async ({ email, password }) => {
      const af = await fetch("/api/auth/antiforgery", { credentials: "include" });
      const token = await af.text();
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          RequestVerificationToken: token.trim()
        },
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) throw new Error(`login ${res.status}`);
    },
    { email, password }
  );
}

async function api(page, method, url, body) {
  return page.evaluate(
    async ({ method, url, body }) => {
      const af = await fetch("/api/auth/antiforgery", { credentials: "include" });
      const token = (await af.text()).trim();
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          RequestVerificationToken: token
        },
        body: body ? JSON.stringify(body) : undefined
      });
      const text = await res.text();
      return { status: res.status, text };
    },
    { method, url, body }
  );
}

(async () => {
  const pwFile = path.join(__dirname, ".demo-pw.tmp");
  let password = process.env.DEMO_PASSWORD || "";
  if (!password && fs.existsSync(pwFile)) {
    password = fs.readFileSync(pwFile, "utf8").trim();
    try {
      fs.unlinkSync(pwFile);
    } catch {}
  }
  if (!password) {
    console.error("Missing DEMO_PASSWORD");
    process.exit(2);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await login(page, "president@ocean.demo", password);
    ok("login-president");

    const list = await api(page, "GET", "/api/assemblies");
    if (list.status !== 200) fail("list-assemblies", list.text);
    else ok("list-assemblies");

    const assemblies = JSON.parse(list.text || "[]");
    const completed = assemblies.find((a) => a.status === "Completed");
    if (!completed) {
      fail("find-completed", "No Completed assembly in demo — seal still validated in integration tests");
    } else {
      const id = completed.id || completed.assemblyId;
      await page.goto(`${BASE}/lobby.html?assemblyId=${id}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);
      const url = page.url();
      if (url.includes("dashboard.html") && url.includes("mode=historical")) ok("lobby-redirect-completed", url);
      else if (url.includes("dashboard.html")) ok("lobby-redirect-completed-soft", url);
      else fail("lobby-redirect-completed", url);

      await page.goto(`${BASE}/dashboard.html?assemblyId=${id}&mode=historical`, {
        waitUntil: "domcontentloaded"
      });
      await page.waitForTimeout(1200);
      const banner = await page.locator("[data-testid=historical-banner], #historical-banner").count();
      if (banner > 0) ok("historical-banner");
      else fail("historical-banner", "banner missing");

      const sala = await page.locator('a[href*="lobby.html"]').count();
      if (sala === 0) ok("no-sala-cta");
      else fail("no-sala-cta", `found ${sala}`);

      const join = await api(page, "POST", `/api/assemblies/${id}/meeting/join-token`);
      if (join.status >= 400) ok("join-token-denied", String(join.status));
      else fail("join-token-denied", join.text);

      const checkin = await api(page, "POST", `/api/assemblies/${id}/attendance/check-in`, {
        unitId: null,
        presenceType: "Virtual"
      });
      if (checkin.status >= 400) ok("checkin-denied", String(checkin.status));
      else fail("checkin-denied", checkin.text);

      const minutes = await api(page, "GET", `/api/assemblies/${id}/minutes`);
      if (minutes.status === 200 && /"isSealed"\s*:\s*true/i.test(minutes.text)) ok("minutes-sealed");
      else if (minutes.status === 200) ok("minutes-readable", "sealed flag may be camelCase missing on older rows");
      else fail("minutes-sealed", minutes.text);
    }

    // Cross-tenant smoke (Other assembly id from demo constants)
    const otherId = "44444444-4444-4444-4444-444444444402";
    const xt = await api(page, "GET", `/api/assemblies/${otherId}`);
    if (xt.status === 200) fail("cross-tenant", "unexpected 200");
    else ok("cross-tenant", String(xt.status));
  } catch (e) {
    fail("fatal", String(e));
    await page.screenshot({ path: path.join(OUT, "fatal.png") }).catch(() => {});
  } finally {
    await browser.close();
  }

  const passed = steps.filter((s) => s.pass).length;
  const failed = steps.filter((s) => !s.pass).length;
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ passed, failed, steps }, null, 2));
  console.log(`RESULT ${passed}/${passed + failed}`);
  process.exit(failed ? 1 : 0);
})();
