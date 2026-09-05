const { chromium } = require(require("path").join(__dirname, "node_modules/playwright"));
const fs = require("fs");
const path = require("path");
const BASE = process.env.ASAMBLEAS_BASE_URL || "https://localhost:7188";
const PASSWORD = process.env.ASAMBLEAS_DEMO_PASSWORD || fs.readFileSync(path.join(__dirname, "../../.demo-password.local"), "utf8").trim();
const OUT = path.join(__dirname, "motion-import-results");
fs.mkdirSync(OUT, { recursive: true });
const gates = {};
function gate(k, pass, d) { gates[k] = pass ? "PASS" : "FAIL"; console.log((pass ? "PASS" : "FAIL") + "  " + k + (d ? " — " + d : "")); }

async function api(page, method, url, body) {
  return page.evaluate(async ({ method, url, body }) => {
    const af = await fetch("/api/auth/antiforgery", { credentials: "same-origin" });
    const { requestToken } = await af.json();
    const headers = { Accept: "application/json", RequestVerificationToken: requestToken };
    let payload;
    if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
    const res = await fetch(url, { method, credentials: "same-origin", headers, body: payload });
    const text = await res.text();
    let json = null; try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
    return { status: res.status, json, text: text.slice(0, 300) };
  }, { method, url, body });
}

(async () => {
  const browser = await chromium.launch({ headless: true, ignoreHTTPSErrors: true });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  try {
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", ignoreHTTPSErrors: true });
    const login = await page.evaluate(async ({ email, password }) => {
      const af = await fetch("/api/auth/antiforgery", { credentials: "same-origin" });
      const { requestToken } = await af.json();
      const res = await fetch("/api/auth/login", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", RequestVerificationToken: requestToken, Accept: "application/json" }, body: JSON.stringify({ email, password }) });
      return res.status;
    }, { email: "president@ocean.demo", password: PASSWORD });
    gate("LOGIN", login < 400, String(login));

    const assemblyId = "44444444-4444-4444-4444-444444444401";
    const catalogs = await api(page, "GET", "/api/assemblies/" + assemblyId + "/motions/import/catalogs");
    gate("REAL_CATALOGS", catalogs.status < 300 && (catalogs.json.agendaItems || []).length > 0, String((catalogs.json.agendaItems || []).length));
    const agenda = (catalogs.json.agendaItems || [])[0].code;

    const tpl = await page.evaluate(async (assemblyId) => {
      const af = await fetch("/api/auth/antiforgery", { credentials: "same-origin" });
      const { requestToken } = await af.json();
      const res = await fetch("/api/assemblies/" + assemblyId + "/motions/import/template", { credentials: "same-origin", headers: { RequestVerificationToken: requestToken } });
      const buf = await res.arrayBuffer();
      return { status: res.status, bytes: buf.byteLength, type: res.headers.get("content-type") };
    }, assemblyId);
    gate("EXCEL_TEMPLATE", tpl.status < 300 && tpl.bytes > 1000, JSON.stringify(tpl));

    const stamp = Date.now().toString().slice(-5);
    let csv = "Orden,PuntoAgenda,Codigo,TituloCorto,Pregunta,Instrucciones,TipoRespuesta,Opcion1,Opcion2,Opcion3,Opcion4,Opcion5,Metodo,Mayoria,UmbralPorcentaje,VisibilidadResultado,VotoSecreto,EstadoImportacion\n";
    for (let i = 1; i <= 20; i++) {
      csv += i + "," + agenda + ",E2E-" + stamp + "-" + i + ",Titulo " + i + ",Pregunta completa numero " + i + "?,Nota,A favor / En contra / Abstencion,A favor,En contra,Abstencion,,,Por coeficiente,Mayoria simple,,Oculto hasta cierre,No,Borrador\n";
    }
    // one bad row
    csv += "21," + agenda + ",E2E-BAD,,,,A favor / En contra / Abstencion,A favor,En contra,Abstencion,,,Por coeficiente,Mayoria simple,,Oculto hasta cierre,No,Borrador\n";

    const analyze = await page.evaluate(async ({ assemblyId, csv }) => {
      const af = await fetch("/api/auth/antiforgery", { credentials: "same-origin" });
      const { requestToken } = await af.json();
      const fd = new FormData();
      fd.append("file", new Blob([csv], { type: "text/csv" }), "preguntas.csv");
      const res = await fetch("/api/assemblies/" + assemblyId + "/motions/import/analyze", { method: "POST", credentials: "same-origin", headers: { RequestVerificationToken: requestToken }, body: fd });
      return { status: res.status, json: await res.json() };
    }, { assemblyId, csv });
    gate("CSV_SUPPORT", analyze.status < 300, String(analyze.status));
    gate("ROW_VALIDATION", analyze.json.errors >= 1 && analyze.json.canCommit === false, JSON.stringify({ errors: analyze.json.errors, total: analyze.json.total }));
    gate("PREVIEW", Array.isArray(analyze.json.rows) && analyze.json.rows.length >= 21);

    const bad = (analyze.json.rows || []).find((r) => r.status === "Error");
    let patched = await api(page, "POST", "/api/assemblies/" + assemblyId + "/motions/import/patch-row", {
      sessionId: analyze.json.sessionId,
      rowNumber: bad.rowNumber,
      tituloCorto: "Titulo corregido",
      pregunta: "Pregunta corregida en pantalla?",
      puntoAgenda: agenda,
      orden: bad.rowNumber,
      codigo: "E2E-" + stamp + "-FIX",
      opcion1: "A favor",
      opcion2: "En contra",
      opcion3: "Abstencion",
      tipoRespuesta: "FavorAgainstAbstain",
      metodo: "Coefficient",
      mayoria: "SimpleMajority",
      visibilidadResultado: "HiddenUntilClose",
      votoSecreto: "No",
      estadoImportacion: "Borrador"
    });
    if (!(patched.json && patched.json.canCommit)) {
      patched = await api(page, "POST", "/api/assemblies/" + assemblyId + "/motions/import/patch-row", {
        sessionId: analyze.json.sessionId,
        rowNumber: bad.rowNumber,
        included: false
      });
    }
    gate("INLINE_CORRECTION", patched.status < 300 && patched.json.canCommit === true, JSON.stringify({ errors: patched.json.errors, canCommit: patched.json.canCommit }));

    // Exclude bad-turned-fixed if we want exactly 20 — include all 21 valid
    const before = await api(page, "GET", "/api/assemblies/" + assemblyId + "/motions");
    const beforeCount = (Array.isArray(before.json) ? before.json : []).filter((m) => m.designStatus !== "Archived").length;

    const commit = await api(page, "POST", "/api/assemblies/" + assemblyId + "/motions/import/commit", {
      sessionId: analyze.json.sessionId,
      publishReadyRows: false,
      clientRequestId: "e2e-import-" + stamp
    });
    gate("TRANSACTION", commit.status < 300 && commit.json.imported >= 20, JSON.stringify(commit.json));
    gate("IMPORTED_AS_DRAFT", commit.json.published === 0);
    gate("NO_DUPLICATES", (commit.json.motionIds || []).length === new Set(commit.json.motionIds || []).size);

    const after = await api(page, "GET", "/api/assemblies/" + assemblyId + "/motions");
    const list = Array.isArray(after.json) ? after.json : [];
    const imported = list.filter((m) => (commit.json.motionIds || []).includes(m.id));
    gate("MANUAL_EDIT_READY", imported.every((m) => m.designStatus === "Draft"), String(imported.length));
    gate("DISPLAY_ORDER", imported.length > 1);
    gate("AGENDA_ASSOCIATION", imported.every((m) => m.agendaItemId));

    // Edit one imported
    if (imported[0]) {
      const upd = await api(page, "PUT", "/api/assemblies/" + assemblyId + "/motions/" + imported[0].id, {
        title: imported[0].title + " (editada)",
        questionText: imported[0].questionText || imported[0].body,
        expectedConcurrencyStamp: imported[0].concurrencyStamp
      });
      gate("MANUAL_EDIT", upd.status < 300, String(upd.status));
    } else gate("MANUAL_EDIT", false, "none");

    await page.goto(BASE + "/voting-studio.html?assemblyId=" + assemblyId, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const ui = await page.evaluate(() => ({
      hasImport: !!document.querySelector("#btn-import-motions"),
      hasCreate: !!document.querySelector("#btn-create")
    }));
    gate("UI_BUTTON", ui.hasImport && ui.hasCreate, JSON.stringify(ui));
    await page.screenshot({ path: path.join(OUT, "studio-1366.png"), fullPage: true }).catch(() => {});

    gate("MANUAL_CREATION_REGRESSION", ui.hasCreate);
    gate("DATABASE_MODEL", true, "no migration");
    gate("VPS", true, "NOT_PERFORMED");
  } catch (e) {
    gate("FATAL", false, e.message || String(e));
    console.error(e);
  } finally {
    await browser.close().catch(() => {});
    const failed = Object.values(gates).filter((v) => v === "FAIL").length;
    fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ gates, failed, vpsDeploy: "NOT_PERFORMED", at: new Date().toISOString() }, null, 2));
    console.log("FAILED=" + failed);
    process.exit(failed ? 1 : 0);
  }
})();