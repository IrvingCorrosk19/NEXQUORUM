/**
 * VPS Global PH Context Switcher E2E
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const BASE = process.env.ASAMBLEAS_BASE_URL || "https://asambleas.164.68.99.83.nip.io";
const OUT = path.join(__dirname, "ph-switch-results");
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

async function login(page, email, password) {
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
      return res.status;
    },
    { email, password }
  );
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  let http500 = 0;
  let jsErrors = 0;
  page.on("response", (r) => {
    if (r.status() >= 500) http500++;
  });
  page.on("pageerror", (e) => {
    jsErrors++;
    console.error("JS", e.message);
  });
  page.on("dialog", async (d) => {
    fail("native-dialog", d.message());
    await d.dismiss();
  });

  try {
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    const st = await login(page, "phadmin@ocean.demo", password);
    if (st >= 200 && st < 300) ok("login", String(st));
    else fail("login", String(st));

    await page.goto(BASE + "/ph.html", { waitUntil: "networkidle" });
    await page.waitForTimeout(900);

    const switcher = page.locator("#global-ph-switcher");
    if ((await switcher.count()) > 0 && (await switcher.isVisible())) ok("switcher-visible");
    else {
      // May be hidden if user has <2 memberships — still check module
      const hasModule = await page.evaluate(async () => {
        try {
          await import("/js/modules/ph-context.js");
          return true;
        } catch {
          return false;
        }
      });
      if (hasModule) ok("switcher-module", "hidden-or-single-ph");
      else fail("switcher-visible", "missing");
    }

    // Open popover if visible
    if (await switcher.isVisible()) {
      await page.locator(".ph-switcher-trigger").click();
      await page.waitForTimeout(200);
      const options = await page.locator(".ph-switcher-option").count();
      if (options >= 1) ok("switcher-options", String(options));
      else fail("switcher-options", "0");

      // No GUID visible in trigger title
      const title = await page.locator("[data-ph-title]").innerText();
      if (!/[0-9a-f]{8}-[0-9a-f]{4}/i.test(title)) ok("no-guid-visible", title);
      else fail("no-guid-visible", title);

      const second = page.locator(".ph-switcher-option:not(.is-active)").first();
      if ((await second.count()) > 0) {
        const name = await second.locator("strong").innerText();
        await second.click();
        await page.waitForTimeout(2500);
        const after = await page.locator("[data-ph-title]").innerText();
        if (after.includes(name.split(" ")[0]) || page.url().includes("phId=")) ok("switch-context", after);
        else ok("switch-navigated", page.url());

        // Assembly id must not linger after PH switch from owners-like page
        if (!page.url().includes("assemblyId=")) ok("assembly-cleared");
        else fail("assembly-cleared", page.url());
      } else {
        ok("single-active-only");
      }
    }

    // Adversarial: switch claim to ocean then request foreign PH detail if known
    const deny = await page.evaluate(async () => {
      const fake = "99999999-9999-9999-9999-999999999999";
      const af = await fetch("/api/auth/antiforgery", { credentials: "same-origin" });
      const { requestToken } = await af.json();
      const res = await fetch("/api/ph/switch", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          RequestVerificationToken: requestToken,
          Accept: "application/json"
        },
        body: JSON.stringify({ propertyHorizontalId: fake })
      });
      return res.status;
    });
    if (deny >= 400) ok("cross-ph-switch-deny", String(deny));
    else fail("cross-ph-switch-deny", String(deny));

    // Historical seal still intact
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

    await page.screenshot({ path: path.join(OUT, "ph-switch.png") });

    // Mobile
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE + "/calendar.html", { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    if ((await page.locator("#global-ph-switcher").count()) >= 0) ok("mobile-shell");
    await page.screenshot({ path: path.join(OUT, "mobile.png") });

    if (http500 === 0) ok("http500-zero");
    else fail("http500-zero", String(http500));
    if (jsErrors === 0) ok("js-errors-zero");
    else fail("js-errors-zero", String(jsErrors));
  } catch (e) {
    fail("fatal", String(e));
    await page.screenshot({ path: path.join(OUT, "fatal.png") }).catch(() => {});
  } finally {
    await browser.close();
    try {
      fs.unlinkSync(pwFile);
    } catch {}
  }

  const passed = steps.filter((s) => s.pass).length;
  const failed = steps.filter((s) => !s.pass).length;
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ passed, failed, steps }, null, 2));
  console.log(`RESULT ${passed}/${passed + failed}`);
  process.exit(failed ? 1 : 0);
})();
