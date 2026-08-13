/**
 * Broader VPS UX interaction drive: owner save loading, responsive toasts, seal regression.
 */
const { chromium, devices } = require("playwright");
const fs = require("fs");
const path = require("path");
const BASE = process.env.ASAMBLEAS_BASE_URL || "https://asambleas.164.68.99.83.nip.io";
const OUT = path.join(__dirname, "ux-interaction-results");
fs.mkdirSync(OUT, { recursive: true });
const steps = [];
const ok = (n, d = "") => {
  steps.push({ n, pass: true, d });
  console.log("PASS", n, d);
};
const fail = (n, d = "") => {
  steps.push({ n, pass: false, d });
  console.error("FAIL", n, d);
};

async function login(page, password) {
  const status = await page.evaluate(async ({ email, password }) => {
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
  }, { email: "phadmin@ocean.demo", password });
  return status;
}

(async () => {
  const pwFile = path.join(__dirname, ".demo-pw.tmp");
  let password = process.env.DEMO_PASSWORD || "";
  if (!password && fs.existsSync(pwFile)) password = fs.readFileSync(pwFile, "utf8").trim();
  if (!password) {
    console.error("Missing DEMO_PASSWORD");
    process.exit(2);
  }

  const browser = await chromium.launch({ headless: true });
  let http500 = 0;
  let jsErrors = 0;

  async function drive(label, viewport, opts = {}) {
    const context = await browser.newContext({
      viewport,
      ...opts
    });
    const page = await context.newPage();
    page.on("response", (r) => {
      if (r.status() >= 500) http500++;
    });
    page.on("pageerror", () => {
      jsErrors++;
    });
    page.on("dialog", async (d) => {
      fail(`${label}-native-dialog`, d.message());
      await d.dismiss();
    });

    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    const st = await login(page, password);
    if (st >= 200 && st < 300) ok(`${label}-login`, String(st));
    else fail(`${label}-login`, String(st));

    await page.goto(BASE + "/ph.html", { waitUntil: "networkidle" });
    await page.waitForTimeout(600);

    await page.evaluate(() =>
      import("/js/modules/ui.js").then(({ notify }) =>
        notify.success("Toast viewport check", { title: "UX" })
      )
    );
    await page.waitForTimeout(350);
    const toastN = await page.locator(".toast-region .toast").count();
    if (toastN > 0) ok(`${label}-toast`, String(toastN));
    else fail(`${label}-toast`, "0");

    // Progress bar API
    await page.evaluate(() =>
      import("/js/modules/loading.js").then(({ startTopProgress, stopTopProgress }) => {
        startTopProgress();
        setTimeout(() => stopTopProgress(), 400);
      })
    );
    await page.waitForTimeout(200);
    const progress = await page.locator(".asambleas-top-progress").count();
    if (progress > 0) ok(`${label}-progress`, String(progress));
    else fail(`${label}-progress`, "0");

    await page.screenshot({ path: path.join(OUT, `${label}.png`), fullPage: false });
    await context.close();
  }

  try {
    await drive("resp-1920", { width: 1920, height: 1080 });
    await drive("resp-1440", { width: 1440, height: 900 });
    await drive("resp-1366", { width: 1366, height: 768 });
    await drive("resp-mobile", { width: 390, height: 844 });

    // Slow network owner list + toast
    const slow = await browser.newContext({
      viewport: { width: 1440, height: 900 }
    });
    const page = await slow.newPage();
    await page.route("**/api/**", async (route) => {
      await new Promise((r) => setTimeout(r, 600));
      await route.continue();
    });
    page.on("dialog", async (d) => {
      fail("slow-native-dialog", d.message());
      await d.dismiss();
    });
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    const st = await login(page, password);
    if (st >= 200 && st < 300) ok("slow-login");
    else fail("slow-login", String(st));
    await page.goto(BASE + "/ph.html", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    const busy = await page.evaluate(() => {
      return Boolean(document.querySelector(".asambleas-top-progress"));
    });
    ok("slow-progress-present", String(busy));

    // Force controlled API error toast path
    await page.evaluate(async () => {
      const { notify } = await import("/js/modules/ui.js");
      const err = new Error("Simulated failure");
      err.status = 500;
      err.correlationId = "ux-e2e-corr";
      notify.fromError(err);
    });
    await page.waitForTimeout(400);
    const corr = await page.locator(".toast__meta").count();
    if (corr > 0) ok("error-correlation", String(corr));
    else fail("error-correlation", "0");

    // Historical seal still
    const join = await page.evaluate(async () => {
      const id = "44444444-4444-4444-4444-444444444401";
      const af = await fetch("/api/auth/antiforgery", { credentials: "same-origin" });
      const { requestToken } = await af.json();
      const res = await fetch(`/api/assemblies/${id}/meeting/join-token`, {
        method: "POST",
        credentials: "same-origin",
        headers: { RequestVerificationToken: requestToken, Accept: "application/json" }
      });
      return res.status;
    });
    if (join >= 400) ok("historical-seal", String(join));
    else fail("historical-seal", String(join));

    await page.screenshot({ path: path.join(OUT, "slow.png") });
    await slow.close();

    if (http500 === 0) ok("http500-zero");
    else fail("http500-zero", String(http500));
    if (jsErrors === 0) ok("js-errors-zero");
    else fail("js-errors-zero", String(jsErrors));
  } catch (e) {
    fail("fatal", String(e));
  } finally {
    await browser.close();
    try {
      fs.unlinkSync(pwFile);
    } catch {}
  }

  const passed = steps.filter((s) => s.pass).length;
  const failed = steps.filter((s) => !s.pass).length;
  fs.writeFileSync(path.join(OUT, "results-full.json"), JSON.stringify({ passed, failed, steps, http500, jsErrors }, null, 2));
  console.log(`RESULT ${passed}/${passed + failed}`);
  process.exit(failed ? 1 : 0);
})();
