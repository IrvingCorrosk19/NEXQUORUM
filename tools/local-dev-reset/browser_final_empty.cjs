const path = require("path");
const fs = require("fs");
const { chromium } = require(path.join(__dirname, "..", "e2e", "node_modules", "playwright"));
const BASE = "https://localhost:7188";
const OUT = path.join(__dirname, "evidence", "browser");
fs.mkdirSync(OUT, { recursive: true });
function loadDemoPassword() {
  const settings = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "src", "Asambleas.Web", "appsettings.Development.json"), "utf8").replace(/^\uFEFF/, ""));
  return settings.Demo.Password;
}
(async () => {
  const password = loadDemoPassword();
  const browser = await chromium.launch({ headless: true, ignoreHTTPSErrors: true });
  const page = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  const login = await page.evaluate(async ({ email, password }) => {
    const af = await fetch("/api/auth/antiforgery", { credentials: "same-origin" });
    const { requestToken } = await af.json();
    const res = await fetch("/api/auth/login", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json", RequestVerificationToken: requestToken },
      body: JSON.stringify({ email, password })
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  }, { email: "president@ocean.demo", password });
  const me = await page.evaluate(async () => {
    const af = await fetch("/api/auth/antiforgery", { credentials: "same-origin" });
    const { requestToken } = await af.json();
    const res = await fetch("/api/auth/me", { credentials: "same-origin", headers: { Accept: "application/json", RequestVerificationToken: requestToken } });
    return { status: res.status, body: await res.json() };
  });
  const list = await page.evaluate(async () => {
    const af = await fetch("/api/auth/antiforgery", { credentials: "same-origin" });
    const { requestToken } = await af.json();
    const res = await fetch("/api/ph", { credentials: "same-origin", headers: { Accept: "application/json", RequestVerificationToken: requestToken } });
    const json = await res.json();
    return { status: res.status, n: Array.isArray(json) ? json.length : (json.items || []).length };
  });
  await page.goto(BASE + "/ph.html", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, "03-final-empty.png"), fullPage: true });
  const text = await page.locator("body").innerText();
  const out = {
    loginStatus: login.status,
    me: { status: me.status, email: me.body?.email, roles: me.body?.roles },
    phListEmpty: list.status === 200 && list.n === 0,
    emptyMsg: /Primero debes crear o seleccionar una propiedad horizontal/i.test(text),
    phCount: list.n
  };
  fs.writeFileSync(path.join(OUT, "final-empty-check.json"), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out));
  await browser.close();
  process.exitCode = (out.loginStatus < 300 && out.phListEmpty && out.emptyMsg && (out.me.roles || []).includes("PlatformAdmin")) ? 0 : 1;
})();
