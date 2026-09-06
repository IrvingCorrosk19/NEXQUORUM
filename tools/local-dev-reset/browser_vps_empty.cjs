const path = require("path");
const fs = require("fs");
const { chromium } = require(path.join(__dirname, "..", "e2e", "node_modules", "playwright"));
const BASE = "https://asambleas.164.68.99.83.nip.io";
const password = process.env.VPS_DEMO_PASSWORD;
if (!password) { console.error("NO_PASSWORD"); process.exit(2); }
(async () => {
  const browser = await chromium.launch({ headless: true, ignoreHTTPSErrors: true });
  const page = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  const out = await page.evaluate(async ({ email, password }) => {
    const af = await fetch("/api/auth/antiforgery", { credentials: "same-origin" });
    const { requestToken } = await af.json();
    const loginRes = await fetch("/api/auth/login", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json", RequestVerificationToken: requestToken },
      body: JSON.stringify({ email, password })
    });
    if (loginRes.status >= 300) return { login: loginRes.status, body: await loginRes.text() };
    const af2 = await fetch("/api/auth/antiforgery", { credentials: "same-origin" });
    const tok = (await af2.json()).requestToken;
    const me = await (await fetch("/api/auth/me", { credentials: "same-origin", headers: { Accept: "application/json", RequestVerificationToken: tok } })).json();
    const list = await (await fetch("/api/ph", { credentials: "same-origin", headers: { Accept: "application/json", RequestVerificationToken: tok } })).json();
    const n = Array.isArray(list) ? list.length : (list.items || []).length;
    return { login: loginRes.status, email: me.email, roles: me.roles, ph: n };
  }, { email: "president@ocean.demo", password });
  fs.mkdirSync(path.join(__dirname, "evidence", "vps"), { recursive: true });
  await page.goto(BASE + "/ph.html", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(__dirname, "evidence", "vps", "ph-after-wipe.png"), fullPage: true });
  fs.writeFileSync(path.join(__dirname, "evidence", "vps", "api-check.json"), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out));
  await browser.close();
  process.exitCode = (out.login === 200 && out.ph === 0 && (out.roles || []).includes("PlatformAdmin")) ? 0 : 1;
})().catch((e) => { console.error(String(e)); process.exit(2); });
