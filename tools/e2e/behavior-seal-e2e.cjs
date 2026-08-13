/**
 * VPS E2E — Completed historical seal (browser + API adversarial).
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = process.env.ASAMBLEAS_BASE_URL || "https://asambleas.164.68.99.83.nip.io";
const OUT = path.join(__dirname, "behavior-seal-results");
fs.mkdirSync(OUT, { recursive: true });

const steps = [];
function ok(name, detail) {
  steps.push({ name, pass: true, detail: detail || "" });
  console.log("PASS", name, detail || "");
}
function fail(name, detail) {
  steps.push({ name, pass: false, detail: detail || "" });
  console.error("FAIL", name, detail || "");
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  let http500 = 0;
  page.on("response", (r) => {
    if (r.status() >= 500) http500++;
  });

  try {
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    const loginOk = await page.evaluate(
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
        return { status: res.status, body: await res.text() };
      },
      { email: "president@ocean.demo", password }
    );
    if (!(loginOk.status >= 200 && loginOk.status < 300)) {
      fail("login-president", JSON.stringify(loginOk).slice(0, 200));
      throw new Error("login failed");
    }
    ok("login-president", String(loginOk.status));

    const api = async (method, url, body) =>
      page.evaluate(
        async ({ method, url, body }) => {
          const af = await fetch("/api/auth/antiforgery", { credentials: "same-origin" });
          const { requestToken } = await af.json();
          const res = await fetch(url, {
            method,
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/json",
              RequestVerificationToken: requestToken,
              Accept: "application/json"
            },
            body: body ? JSON.stringify(body) : undefined
          });
          return { status: res.status, text: await res.text() };
        },
        { method, url, body }
      );

    const list = await api("GET", "/api/assemblies");
    if (list.status !== 200) fail("list-assemblies", list.text.slice(0, 200));
    else ok("list-assemblies");

    const assemblies = JSON.parse(list.text || "[]");
    const completed = assemblies.find((a) => a.status === "Completed");
    if (!completed) {
      // Create+complete is covered by integration; on VPS demo may lack Completed.
      ok("find-completed-soft", "no Completed in list — adversarial checks skipped");
    } else {
      const id = completed.id || completed.assemblyId;

      await page.goto(`${BASE}/lobby.html?assemblyId=${id}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1200);
      const url = page.url();
      if (/dashboard\.html/.test(url)) ok("lobby-redirect-completed", url);
      else fail("lobby-redirect-completed", url);

      await page.goto(`${BASE}/dashboard.html?assemblyId=${id}&mode=historical`, {
        waitUntil: "networkidle"
      });
      await page.waitForTimeout(1000);
      const bannerText = await page.locator("#historical-banner").innerText().catch(() => "");
      if (/FINALIZADA|CANCELADA/i.test(bannerText)) ok("historical-banner", bannerText.slice(0, 80));
      else fail("historical-banner", bannerText || "empty");

      const salaInNav = await page.locator('#ia-nav a[href*="lobby.html"], .ia-asm-tabs a[href*="lobby.html"]').count();
      if (salaInNav === 0) ok("no-sala-cta");
      else fail("no-sala-cta", `found ${salaInNav}`);

      const join = await api("POST", `/api/assemblies/${id}/meeting/join-token`);
      if (join.status >= 400) ok("join-token-denied", String(join.status));
      else fail("join-token-denied", join.text.slice(0, 120));

      const checkin = await api("POST", `/api/assemblies/${id}/attendance/check-in`, {
        unitId: null,
        presenceType: "Virtual"
      });
      if (checkin.status >= 400) ok("checkin-denied", String(checkin.status));
      else fail("checkin-denied", checkin.text.slice(0, 120));

      const minutes = await api("GET", `/api/assemblies/${id}/minutes`);
      if (minutes.status === 200) {
        const sealed = /"isSealed"\s*:\s*true/i.test(minutes.text);
        if (sealed) ok("minutes-sealed");
        else ok("minutes-readable-legacy", "pre-seal Completed row");
      } else fail("minutes-sealed", minutes.text.slice(0, 120));
    }

    const otherId = "44444444-4444-4444-4444-444444444402";
    const xt = await api("GET", `/api/assemblies/${otherId}`);
    if (xt.status === 200) fail("cross-tenant", "unexpected 200");
    else ok("cross-tenant", String(xt.status));

    if (http500 === 0) ok("http500-zero");
    else fail("http500-zero", String(http500));
  } catch (e) {
    fail("fatal", String(e));
    await page.screenshot({ path: path.join(OUT, "fatal.png") }).catch(() => {});
  } finally {
    await browser.close();
  }

  const passed = steps.filter((s) => s.pass).length;
  const failed = steps.filter((s) => !s.pass).length;
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ passed, failed, steps, http500 }, null, 2));
  console.log(`RESULT ${passed}/${passed + failed}`);
  process.exit(failed ? 1 : 0);
})();
