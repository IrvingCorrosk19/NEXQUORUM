/**
 * Voting Preview UI remediation — LOCALHOST certification
 * Frontend-only visual/functional gate for Vista previa modal.
 */
const { chromium } = require(require("path").join(__dirname, "node_modules/playwright"));
const fs = require("fs");
const path = require("path");

const BASE = process.env.ASAMBLEAS_BASE_URL || "https://localhost:7188";
const PASSWORD =
  process.env.ASAMBLEAS_DEMO_PASSWORD ||
  fs.readFileSync(path.join(__dirname, "../../.demo-password.local"), "utf8").trim();
const OUT = path.join(__dirname, "voting-preview-results");
fs.mkdirSync(OUT, { recursive: true });

const results = {
  env: "LOCALHOST",
  url: BASE,
  tests: [],
  jsErrors: [],
  networkErrors: [],
  certified: false,
  verdict: null
};

function record(id, pass, detail = "") {
  results.tests.push({ id, pass, detail: String(detail).slice(0, 400) });
  console.log(`${pass ? "PASS" : "FAIL"}  ${id}${detail ? " — " + String(detail).slice(0, 160) : ""}`);
}

async function login(page, email, password) {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
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
      return { status: res.status, body: (await res.text()).slice(0, 200) };
    },
    { email, password }
  );
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
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = { raw: text };
      }
      return { status: res.status, json };
    },
    { method, url, body }
  );
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  page.on("pageerror", (e) => results.jsErrors.push(String(e.message || e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") results.jsErrors.push(msg.text());
  });
  page.on("response", (r) => {
    const st = r.status();
    if (st >= 400) {
      const u = r.url().replace(BASE, "");
      // Ignore expected auth noise on first paint
      if (/favicon|sourcemap/i.test(u)) return;
      results.networkErrors.push({ st, u, method: r.request().method() });
    }
  });

  try {
    const loginRes = await login(page, "phadmin@ocean.demo", PASSWORD);
    record("login", loginRes.status >= 200 && loginRes.status < 300, `status=${loginRes.status}`);

    const stamp = Date.now().toString().slice(-8);
    const phCreated = await api(page, "POST", "/api/ph", {
      name: `PH Preview UI ${stamp}`,
      code: `PREV-${stamp}`,
      adminEmail: "phadmin@ocean.demo",
      city: "Panamá",
      country: "PA",
      timeZoneId: "America/Panama"
    });
    let phId = phCreated.json?.id || phCreated.json?.propertyHorizontalId;
    if (!phId) {
      const list = await api(page, "GET", "/api/ph");
      const rows = Array.isArray(list.json) ? list.json : list.json?.items || [];
      phId = rows[0]?.id;
    }
    record("ph-ready", !!phId, phId || JSON.stringify(phCreated).slice(0, 160));
    if (phId) await api(page, "POST", "/api/ph/switch", { propertyHorizontalId: phId });

    const when = new Date(Date.now() + 40 * 60 * 1000);
    const end = new Date(when.getTime() + 3 * 60 * 60 * 1000);
    const createdAsm = await api(page, "POST", "/api/assemblies", {
      propertyHorizontalId: phId,
      title: `Asamblea Preview UI ${stamp}`,
      modality: "Virtual",
      scheduledAtUtc: when.toISOString(),
      estimatedEndAtUtc: end.toISOString(),
      requiredQuorumPercent: 50,
      assemblyKind: "Ordinary",
      locationText: "Sala Preview",
      notes: "Voting preview UI cert",
      publishAsScheduled: true
    });
    let assemblyId = createdAsm.json?.id;
    record("assembly-ready", !!assemblyId, assemblyId || JSON.stringify(createdAsm).slice(0, 200));
    if (!assemblyId) throw new Error("no assemblyId");

    await page.goto(`${BASE}/voting-studio.html?assemblyId=${encodeURIComponent(assemblyId)}`, {
      waitUntil: "networkidle"
    });
    await page.waitForSelector("#btn-create", { timeout: 20000 });
    record("studio-loaded", true, page.url());

    const editBtn = page.locator('#list-votes button:has-text("Editar")').first();
    if ((await editBtn.count()) > 0 && (await editBtn.isVisible().catch(() => false))) {
      await editBtn.click();
    } else {
      await page.locator("#btn-create").click();
      await page.waitForSelector("#create-dialog[open]", { timeout: 8000 });
      await page.locator('#create-dialog button[value="ok"]').click();
    }

    await page.waitForSelector("#editor-panel:not([hidden])", { timeout: 15000 });
    await page.waitForSelector("#btn-preview:visible", { timeout: 10000 });
    await page.waitForSelector("#v-question", { timeout: 10000 });

    const longTitle =
      "Aprobación extraordinaria del presupuesto anual correspondiente al período fiscal 2026 y autorización de proyectos de mantenimiento preventivo y correctivo de áreas comunes";
    await page.locator("#v-question").fill(longTitle);

    const beforeUrl = page.url();
    const jsBefore = results.jsErrors.length;
    const netBefore = results.networkErrors.length;

    await page.locator("#btn-preview").click();
    await page.waitForSelector("#preview-dialog[open]", { timeout: 8000 });
    record("preview-open", true);

    const titleText = await page.locator(".preview-vote-title").innerText();
    record("title-readable", /presupuesto|Aprobación|votación/i.test(titleText) && titleText.length > 10, titleText.slice(0, 80));

    const methodText = await page.locator(".preview-meta__value").innerText().catch(() => "");
    record(
      "method-es",
      /coeficiente|persona|unidad/i.test(methodText) && !/Coefficient/i.test(methodText),
      methodText
    );

    const choices = page.locator(".preview-choice");
    const choiceCount = await choices.count();
    record("options-visible", choiceCount >= 2, `count=${choiceCount}`);

    const contrast = await page.evaluate(() => {
      const title = document.querySelector(".preview-vote-title");
      if (!title) return { ok: false, reason: "no-title" };
      const cs = getComputedStyle(title);
      const color = cs.color;
      const bg = getComputedStyle(document.querySelector(".preview-participant-card")).backgroundColor;
      return { ok: true, color, bg, fontSize: cs.fontSize, fontWeight: cs.fontWeight };
    });
    record(
      "contrast-title",
      contrast.ok && /rgb\(\s*(0|[1-4]?\d)\s*,/.test(contrast.color),
      JSON.stringify(contrast)
    );

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('.preview-devices button[data-device="desktop"]').click();
    await page.waitForTimeout(350);
    const deskW = await page.locator("#preview-frame").evaluate((el) => el.getBoundingClientRect().width);
    record("device-desktop", deskW > 700 && (await page.locator("#preview-frame.is-desktop").count()) === 1, `w=${Math.round(deskW)}`);
    await shot(page, "preview-desktop");

    await page.locator('.preview-devices button[data-device="tablet"]').click();
    await page.waitForTimeout(350);
    const tabW = await page.locator("#preview-frame").evaluate((el) => el.getBoundingClientRect().width);
    const noReload1 = page.url() === beforeUrl;
    record("device-tablet", tabW <= 780 && tabW > 500 && (await page.locator("#preview-frame.is-tablet").count()) === 1, `w=${Math.round(tabW)}`);
    await shot(page, "preview-tablet");

    await page.locator('.preview-devices button[data-device="mobile"]').click();
    await page.waitForTimeout(350);
    const mobW = await page.locator("#preview-frame").evaluate((el) => el.getBoundingClientRect().width);
    const choiceLayout = await page.evaluate(() => {
      const btns = [...document.querySelectorAll(".preview-choice")];
      if (btns.length < 2) return { stacked: false };
      const y0 = btns[0].getBoundingClientRect().top;
      const y1 = btns[1].getBoundingClientRect().top;
      return { stacked: Math.abs(y1 - y0) > 20 };
    });
    record(
      "device-mobile",
      mobW <= 430 && (await page.locator("#preview-frame.is-mobile").count()) === 1 && choiceLayout.stacked,
      `w=${Math.round(mobW)} stacked=${choiceLayout.stacked}`
    );
    await shot(page, "preview-mobile");

    record("no-reload", noReload1 && page.url() === beforeUrl, page.url());

    // Simulated selection feedback
    if (choiceCount > 0) {
      await choices.first().click();
      const pressed = await choices.first().getAttribute("aria-pressed");
      record("option-select-feedback", pressed === "true");
    }

    await page.locator("#btn-preview-dismiss").click();
    await page.waitForSelector("#preview-dialog:not([open])", { timeout: 5000 }).catch(() => {});
    const closed = !(await page.locator("#preview-dialog[open]").count());
    record("preview-close", closed);

    await page.locator("#btn-preview").click();
    await page.waitForSelector("#preview-dialog[open]", { timeout: 8000 });
    record("preview-reopen", (await page.locator("#preview-dialog[open]").count()) === 1);
    await page.locator("#btn-preview-close").click();
    await page.waitForTimeout(300);
    record("preview-close-x", !(await page.locator("#preview-dialog[open]").count()));

    // Escape
    await page.locator("#btn-preview").click();
    await page.waitForSelector("#preview-dialog[open]");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    record("preview-escape", !(await page.locator("#preview-dialog[open]").count()));

    const jsNew = results.jsErrors.slice(jsBefore);
    const netNew = results.networkErrors.slice(netBefore).filter((e) => e.st >= 400);
    record("console-clean", jsNew.length === 0, jsNew.join(" | "));
    record(
      "network-clean",
      netNew.filter((e) => e.st >= 500 || (e.st >= 400 && /voting|preview|studio/i.test(e.u))).length === 0,
      JSON.stringify(netNew.slice(0, 5))
    );

    // Mobile viewport of host browser (modal still usable)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#btn-preview").click();
    await page.waitForSelector("#preview-dialog[open]");
    const overflow = await page.evaluate(() => {
      const dlg = document.querySelector("#preview-dialog");
      const r = dlg.getBoundingClientRect();
      return {
        within: r.left >= -2 && r.right <= window.innerWidth + 2,
        width: Math.round(r.width),
        vw: window.innerWidth
      };
    });
    record("responsive-host-mobile", overflow.within, JSON.stringify(overflow));
    await shot(page, "preview-host-mobile-390");
    await page.keyboard.press("Escape");
  } catch (err) {
    record("fatal", false, err.message || String(err));
    await shot(page, "fatal").catch(() => {});
  } finally {
    const failed = results.tests.filter((t) => !t.pass);
    results.certified = failed.length === 0;
    results.verdict = results.certified ? "LOCAL CERTIFIED" : "NOT CERTIFIED";
    fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
    console.log("\nVERDICT:", results.verdict);
    console.log("Failed:", failed.map((f) => f.id).join(", ") || "none");
    await browser.close();
    process.exit(results.certified ? 0 : 1);
  }
})();
