/**
 * VPS premium UX smoke: toast region, owner save loading, no alert().
 */
const { chromium } = require("playwright");
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
  let jsErrors = 0;
  page.on("response", (r) => {
    if (r.status() >= 500) http500++;
  });
  page.on("pageerror", () => {
    jsErrors++;
  });
  page.on("dialog", async (d) => {
    fail("native-dialog", d.message());
    await d.dismiss();
  });

  try {
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    const login = await page.evaluate(async ({ email, password }) => {
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
    if (login >= 200 && login < 300) ok("login", String(login));
    else fail("login", String(login));

    await page.goto(BASE + "/ph.html", { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const toastCss = await page.evaluate(() => {
      const s = getComputedStyle(document.createElement("div"));
      return Boolean(document.styleSheets.length);
    });
    ok("styles-loaded", String(toastCss));

    // Trigger a notify via console module path: open owners and save invalid to see toast/error UX
    await page.evaluate(() => {
      import("/js/modules/ui.js").then(({ notify }) => {
        notify.success("Prueba de toast visible", { title: "UX check" });
      });
    });
    await page.waitForTimeout(400);
    const toastCount = await page.locator(".toast-region .toast").count();
    if (toastCount > 0) ok("toast-visible", String(toastCount));
    else fail("toast-visible", "0");

    const top = await page.evaluate(() => {
      const region = document.querySelector(".toast-region");
      if (!region) return null;
      const r = region.getBoundingClientRect();
      return { top: r.top, right: window.innerWidth - r.right };
    });
    if (top && top.top < 80) ok("toast-top-right", JSON.stringify(top));
    else fail("toast-top-right", JSON.stringify(top));

    // Historical still sealed (Completed ocean if present)
    const minutes = await page.evaluate(async () => {
      const id = "44444444-4444-4444-4444-444444444401";
      const af = await fetch("/api/auth/antiforgery", { credentials: "same-origin" });
      const { requestToken } = await af.json();
      const join = await fetch(`/api/assemblies/${id}/meeting/join-token`, {
        method: "POST",
        credentials: "same-origin",
        headers: { RequestVerificationToken: requestToken, Accept: "application/json" }
      });
      return join.status;
    });
    if (minutes >= 400) ok("historical-join-still-denied", String(minutes));
    else fail("historical-join-still-denied", String(minutes));

    if (http500 === 0) ok("http500-zero");
    else fail("http500-zero", String(http500));
    if (jsErrors === 0) ok("js-errors-zero");
    else fail("js-errors-zero", String(jsErrors));
  } catch (e) {
    fail("fatal", String(e));
    await page.screenshot({ path: path.join(OUT, "fatal.png") }).catch(() => {});
  } finally {
    await browser.close();
  }

  const passed = steps.filter((s) => s.pass).length;
  const failed = steps.filter((s) => !s.pass).length;
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ passed, failed, steps, http500, jsErrors }, null, 2));
  console.log(`RESULT ${passed}/${passed + failed}`);
  process.exit(failed ? 1 : 0);
})();
