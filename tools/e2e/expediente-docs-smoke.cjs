/**
 * Minimal expediente UI smoke (Playwright).
 * Usage: node tools/e2e/expediente-docs-smoke.cjs
 */
const fs = require("fs");
const path = require("path");

async function main() {
  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    console.log("SKIP: playwright not installed locally");
    process.exit(0);
  }

  const base = process.env.ASAMBLEAS_LOCAL_URL || "https://localhost:7188";
  const assemblyId = process.env.ASSEMBLY_ID || "44444444-4444-4444-4444-444444444401";
  const email = process.env.DEMO_EMAIL || "president@ocean.demo";
  const password = process.env.ASAMBLEAS_DEMO_PASSWORD || process.env.DEMO_PASSWORD;
  if (!password) {
    console.error("Set ASAMBLEAS_DEMO_PASSWORD");
    process.exit(1);
  }

  const outDir = path.join("tools", "e2e", "expediente-docs-results");
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  // Prefer form login if present
  if (await page.locator('input[type="email"], input[name="email"]').count()) {
    await page.fill('input[type="email"], input[name="email"]', email);
    await page.fill('input[type="password"], input[name="password"]', password);
    await page.click('button[type="submit"], button:has-text("Entrar"), button:has-text("Iniciar")');
    await page.waitForTimeout(1500);
  } else {
    // API cookie login fallback
    await page.evaluate(
      async ({ email, password, base }) => {
        await fetch(`${base}/api/auth/login`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password })
        });
      },
      { email, password, base }
    );
  }

  await page.goto(`${base}/expediente.html?assemblyId=${assemblyId}`, {
    waitUntil: "networkidle"
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(outDir, "expediente.png"), fullPage: true });

  const cards = await page.locator(".exp-card").count();
  const hasActa = await page.getByText("Acta de Asamblea").count();
  const hasZip = await page.getByText(/expediente completo/i).count();
  const results = { cards, hasActa: hasActa > 0, hasZip: hasZip > 0, url: page.url() };
  fs.writeFileSync(path.join(outDir, "results.json"), JSON.stringify(results, null, 2));
  console.log(results);

  if (cards < 5 || !results.hasActa) {
    process.exit(2);
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
