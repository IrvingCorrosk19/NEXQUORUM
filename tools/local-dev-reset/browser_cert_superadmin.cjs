const path = require("path");
const fs = require("fs");
const { chromium } = require(path.join(__dirname, "..", "e2e", "node_modules", "playwright"));

const BASE = "https://localhost:7188";
const OUT = path.join(__dirname, "evidence", "browser");
fs.mkdirSync(OUT, { recursive: true });

function loadDemoPassword() {
  const settings = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "..", "src", "Asambleas.Web", "appsettings.Development.json"), "utf8").replace(/^\uFEFF/, "")
  );
  return settings.Demo.Password;
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
      try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 300) }; }
      return { status: res.status, json, text: (text || "").slice(0, 500) };
    },
    { method, url, body }
  );
}

(async () => {
  const password = loadDemoPassword();
  const results = [];
  const ok = (id, pass, d) => { results.push({ id, pass, d }); console.log((pass ? "PASS" : "FAIL"), id, d || ""); };

  const browser = await chromium.launch({ headless: true, ignoreHTTPSErrors: true });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message || e).slice(0, 200)));

  try {
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    // form login
    const email = page.locator('#email, input[type="email"]').first();
    if (await email.count() && await email.isVisible().catch(() => false)) {
      await email.fill("president@ocean.demo");
      await page.locator('#password, input[type="password"]').first().fill(password);
      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {}),
        page.locator('button[type="submit"], button:has-text("Entrar")').first().click()
      ]);
    } else {
      const login = await api(page, "POST", "/api/auth/login", { email: "president@ocean.demo", password });
      ok("LOGIN_API", login.status < 300, String(login.status));
    }

    const me = await api(page, "GET", "/api/auth/me");
    const roles = me.json?.roles || me.json?.Roles || [];
    const perms = me.json?.permissions || [];
    ok("ME_200", me.status === 200, JSON.stringify({ email: me.json?.email, roles }));
    ok("ROLE_PLATFORM", (Array.isArray(roles) ? roles : []).includes("PlatformAdmin") || (Array.isArray(perms) && perms.length > 50), String(roles));

    await page.goto(BASE + "/ph.html", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, "01-empty-ph.png"), fullPage: true });
    const body = await page.locator("body").innerText();
    ok("EMPTY_MSG", /Primero debes crear o seleccionar una propiedad horizontal/i.test(body) || /Todavía no tienes un PH/i.test(body), body.slice(0, 200).replace(/\s+/g, " "));

    const list = await api(page, "GET", "/api/ph");
    const items = Array.isArray(list.json) ? list.json : (list.json?.items || []);
    ok("PH_LIST_EMPTY", list.status === 200 && items.length === 0, `n=${items.length} status=${list.status}`);

    // create PH
    const stamp = Date.now().toString().slice(-6);
    const create = await api(page, "POST", "/api/ph", {
      name: "PH Cert Clean " + stamp,
      code: "CLN" + stamp,
      timeZoneId: "America/Panama",
      country: "PA",
      adminEmail: "president@ocean.demo"
    });
    const phId = create.json?.id;
    ok("CREATE_PH", create.status < 300 && !!phId, `status=${create.status}`);
    if (phId) {
      await api(page, "POST", "/api/ph/switch", { propertyHorizontalId: phId });
      const unit = await api(page, "POST", `/api/ph/${phId}/units`, { code: "U1", floor: 1, coefficientPercent: 100 });
      ok("CREATE_UNIT", unit.status < 300, String(unit.status));
      const owner = await api(page, "POST", `/api/ph/${phId}/owners`, {
        firstName: "Cert", lastName: "Owner", email: `cert.${stamp}@sandbox.test`, identification: "8-" + stamp
      });
      ok("CREATE_OWNER", owner.status < 300, String(owner.status));
      const when = new Date(Date.now() + 3600_000).toISOString();
      const asm = await api(page, "POST", "/api/assemblies", {
        propertyHorizontalId: phId,
        title: "Asamblea cert " + stamp,
        modality: "Hybrid",
        scheduledAtUtc: when,
        estimatedEndAtUtc: new Date(Date.now() + 7200_000).toISOString(),
        requiredQuorumPercent: 50,
        publishAsScheduled: true
      });
      ok("CREATE_ASM", asm.status < 300 && !!asm.json?.id, String(asm.status));
    }

    await page.goto(BASE + "/ph.html", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, "02-after-create.png"), fullPage: true });
    ok("NO_PAGE_ERRORS", errors.length === 0, errors.slice(0, 3).join(" | "));

    fs.writeFileSync(path.join(OUT, "browser-results.json"), JSON.stringify({ results, errors }, null, 2));
    const failed = results.filter((r) => !r.pass).length;
    console.log(JSON.stringify({ failed, passed: results.length - failed, total: results.length }));
    process.exitCode = failed ? 1 : 0;
  } catch (e) {
    fs.writeFileSync(path.join(OUT, "fatal.txt"), String(e && e.stack ? e.stack : e));
    console.error("FATAL", e.message || e);
    process.exitCode = 2;
  } finally {
    await browser.close().catch(() => {});
  }
})();
