/**
 * Voting Studio FULL UI remediation — LOCALHOST certification
 */
const { chromium } = require(require("path").join(__dirname, "node_modules/playwright"));
const fs = require("fs");
const path = require("path");

const BASE = process.env.ASAMBLEAS_BASE_URL || "https://localhost:7188";
const PASSWORD =
  process.env.ASAMBLEAS_DEMO_PASSWORD ||
  fs.readFileSync(path.join(__dirname, "../../.demo-password.local"), "utf8").trim();
const OUT = path.join(__dirname, "voting-studio-full-results");
fs.mkdirSync(OUT, { recursive: true });

const results = {
  env: BASE.includes("localhost") ? "LOCALHOST" : "VPS",
  url: BASE,
  tests: [],
  jsErrors: [],
  networkErrors: [],
  certified: false
};

function record(id, pass, detail = "") {
  results.tests.push({ id, pass, detail: String(detail).slice(0, 500) });
  console.log(`${pass ? "PASS" : "FAIL"}  ${id}${detail ? " — " + String(detail).slice(0, 180) : ""}`);
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
      return { status: res.status };
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

async function contrastOf(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      color: cs.color,
      bg: cs.backgroundColor,
      fill: cs.webkitTextFillColor,
      fontSize: cs.fontSize
    };
  }, selector);
}

function isLightText(rgb) {
  const m = String(rgb).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!m) return false;
  const r = +m[1],
    g = +m[2],
    b = +m[3];
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.55;
}

function isDarkBg(rgb) {
  const m = String(rgb).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?/i);
  if (!m) return false;
  const r = +m[1],
    g = +m[2],
    b = +m[3];
  const a = m[4] != null ? +m[4] : 1;
  if (a < 0.4) return false;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark"
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => results.jsErrors.push(String(e.message || e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") results.jsErrors.push(msg.text());
  });
  page.on("response", (r) => {
    if (r.status() >= 400 && !/favicon/i.test(r.url())) {
      results.networkErrors.push({ st: r.status(), u: r.url().replace(BASE, "") });
    }
  });

  try {
    const loginRes = await login(page, "phadmin@ocean.demo", PASSWORD);
    record("login", loginRes.status < 300, String(loginRes.status));

    const stamp = Date.now().toString().slice(-8);
    const ph = await api(page, "POST", "/api/ph", {
      name: `PH Studio UI ${stamp}`,
      code: `STU-${stamp}`,
      adminEmail: "phadmin@ocean.demo",
      city: "Panamá",
      country: "PA",
      timeZoneId: "America/Panama"
    });
    const phId = ph.json?.id || ph.json?.propertyHorizontalId;
    record("ph", !!phId, phId);
    await api(page, "POST", "/api/ph/switch", { propertyHorizontalId: phId });

    const when = new Date(Date.now() + 40 * 60 * 1000);
    const end = new Date(when.getTime() + 3 * 60 * 60 * 1000);
    const asm = await api(page, "POST", "/api/assemblies", {
      propertyHorizontalId: phId,
      title: `Asamblea Studio UI ${stamp}`,
      modality: "Virtual",
      scheduledAtUtc: when.toISOString(),
      estimatedEndAtUtc: end.toISOString(),
      requiredQuorumPercent: 50,
      assemblyKind: "Ordinary",
      locationText: "Sala",
      notes: "studio ui",
      publishAsScheduled: true
    });
    const assemblyId = asm.json?.id;
    record("assembly", !!assemblyId, assemblyId);
    if (!assemblyId) throw new Error("no assembly");

    await page.goto(`${BASE}/voting-studio.html?assemblyId=${encodeURIComponent(assemblyId)}`, {
      waitUntil: "networkidle"
    });
    await page.waitForSelector("#btn-create");
    await page.locator("#btn-create").click();
    await page.waitForSelector("#create-dialog[open]");
    await page.locator('#create-dialog button[value="ok"]').click();
    await page.waitForSelector("#editor-panel:not([hidden])");
    await page.waitForSelector("#v-question");
    await page.waitForTimeout(400);
    const preDump = await page.evaluate(() => {
      const q = document.querySelector("#v-question");
      const s = q ? getComputedStyle(q) : null;
      return {
        css: [...document.querySelectorAll("link[rel=stylesheet]")].map((l) => l.href).filter((h) => /voting|ux-|ia\.css/.test(h)),
        q: s ? { color: s.color, bg: s.backgroundColor, fill: s.webkitTextFillColor, cls: q.className } : null,
        htmlHasControl: !!document.querySelector("#v-question.studio-field__control")
      };
    });
    console.log("PRE_DUMP", JSON.stringify(preDump));
    if (!preDump.q || !isDarkBg(preDump.q.bg) || !isLightText(preDump.q.color || preDump.q.fill)) {
      throw new Error("contrast-not-ready " + JSON.stringify(preDump));
    }

    const qContrast = await contrastOf(page, "#v-question");
    const agendaContrast = await contrastOf(page, "#v-agenda");
    const titleContrast = await contrastOf(page, "#v-title");
    const readable =
      qContrast &&
      agendaContrast &&
      isLightText(qContrast.color || qContrast.fill) &&
      isDarkBg(qContrast.bg) &&
      isLightText(agendaContrast.color || agendaContrast.fill) &&
      isDarkBg(agendaContrast.bg);
    record("contrast-inputs", !!readable, JSON.stringify({ q: qContrast, agenda: agendaContrast, title: titleContrast }));

    const longQ =
      "Aprobación extraordinaria del presupuesto anual correspondiente al período fiscal 2026 y autorización de proyectos de mantenimiento preventivo y correctivo de áreas comunes";
    await page.locator("#v-question").fill(longQ);
    await page.locator("#v-title").fill("Presupuesto 2026");
    await page.locator("#v-instructions").fill("Lea con atención antes de votar.");
    await page.locator("#v-code").fill("V-01");

    const typedQ = await page.locator("#v-question").inputValue();
    record("create-fill-question", typedQ.includes("presupuesto"), typedQ.slice(0, 60));

    // Options editor
    const optCount0 = await page.locator("#v-options .option-row").count();
    await page.locator("#btn-add-opt").click();
    await page.waitForFunction(
      (n) => document.querySelectorAll("#v-options .option-row").length === n,
      optCount0 + 1,
      { timeout: 8000 }
    );
    const optCount1 = await page.locator("#v-options .option-row").count();
    record("option-add", optCount1 === optCount0 + 1, `${optCount0}->${optCount1}`);
    await page.locator("#v-options .option-row input[data-opt]").last().fill("Opción larga de prueba para layout estable");
    await page.locator("#v-options [data-remove-opt]").last().click();
    await page.waitForFunction(
      (n) => document.querySelectorAll("#v-options .option-row").length === n,
      optCount0,
      { timeout: 8000 }
    );
    record("option-remove", (await page.locator("#v-options .option-row").count()) === optCount0);

    // Selects readable
    await page.locator("#v-ballot").selectOption("YesNo");
    await page.locator("#v-calc").selectOption("PerPerson");
    await page.locator("#v-rule").selectOption("QualifiedMajority");
    await page.waitForTimeout(150);
    const thDisabled = await page.locator("#v-threshold").isDisabled();
    record("threshold-enabled-qualified", !thDisabled);
    await page.locator("#v-threshold").fill("66.67");
    await page.locator("#v-rule").selectOption("SimpleMajority");
    await page.waitForTimeout(150);
    record("threshold-disabled-simple", await page.locator("#v-threshold").isDisabled());

    await page.screenshot({ path: path.join(OUT, "form-desktop-1440.png") });

    // Save draft
    const jsBefore = results.jsErrors.length;
    await page.locator("#btn-save-draft").click();
    await page.waitForTimeout(1500);
    const motions = await api(page, "GET", `/api/assemblies/${assemblyId}/motions`);
    const list = Array.isArray(motions.json) ? motions.json : [];
    record("create-save", list.length >= 1, `motions=${list.length}`);

    // Edit: editor may still be open after save — reload via list when available
    const editBtn = page.locator("#list-votes [data-edit-vote]").first();
    if ((await editBtn.count()) > 0) {
      await editBtn.click({ timeout: 8000 }).catch(async () => {
        await page.locator("#list-votes").evaluate((el) => el.scrollIntoView({ block: "start" }));
        await page.locator("#list-votes [data-edit-vote]").first().click({ force: true });
      });
      await page.waitForSelector("#v-question");
    }
    const loaded = await page.locator("#v-question").inputValue();
    const loadedTitle = await page.locator("#v-title").inputValue();
    const loadedCalc = await page.locator("#v-calc").inputValue();
    record(
      "edit-load-readable",
      loaded.length > 5 && loadedTitle.length > 0 && loadedCalc === "PerPerson",
      JSON.stringify({ loaded: loaded.slice(0, 40), loadedTitle, loadedCalc })
    );
    await page.locator("#v-title").fill("Presupuesto 2026 (editado)");
    await page.locator("#btn-save-draft").click();
    await page.waitForTimeout(1200);

    // Preview regression
    await page.locator("#btn-preview").click();
    await page.waitForSelector("#preview-dialog[open]");
    const previewTitle = await page.locator(".preview-vote-title").innerText();
    record("preview-open", /presupuesto|Aprobación/i.test(previewTitle));
    await page.locator('.preview-devices button[data-device="tablet"]').click();
    await page.waitForTimeout(200);
    record("preview-tablet", (await page.locator("#preview-frame.is-tablet").count()) === 1);
    await page.locator('.preview-devices button[data-device="mobile"]').click();
    await page.waitForTimeout(200);
    record("preview-mobile", (await page.locator("#preview-frame.is-mobile").count()) === 1);
    await page.locator("#btn-preview-dismiss").click();
    await page.waitForTimeout(200);
    const stillThere = await page.locator("#v-title").inputValue();
    record("preview-no-loss", stillThere.includes("editado"), stillThere);

    // Responsive screenshots
    for (const [name, w, h] of [
      ["desktop-1366", 1366, 768],
      ["tablet-768", 768, 1024],
      ["mobile-390", 390, 844]
    ]) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(250);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
      record(`responsive-${name}`, !overflow, `overflow=${overflow}`);
      await page.screenshot({ path: path.join(OUT, `form-${name}.png`) });
    }

    record("console-clean", results.jsErrors.slice(jsBefore).length === 0, results.jsErrors.slice(jsBefore).join(" | "));
    const badNet = results.networkErrors.filter((e) => e.st >= 500 || (e.st >= 400 && /motions|voting-studio|assemblies/i.test(e.u)));
    record("network-clean", badNet.length === 0, JSON.stringify(badNet.slice(0, 5)));

    // Hierarchy / structure markers
    record("has-config-groups", (await page.locator(".studio-config-group").count()) >= 3);
    record("has-option-editor", (await page.locator(".option-editor").count()) === 1);
    record("has-sticky-actions", await page.locator(".studio-actions").evaluate((el) => getComputedStyle(el).position === "sticky"));
  } catch (err) {
    record("fatal", false, err.message || String(err));
    await page.screenshot({ path: path.join(OUT, "fatal.png") }).catch(() => {});
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
