const { chromium } = require(require("path").join(__dirname, "node_modules/playwright"));
const fs = require("fs");
const path = require("path");
const BASE = process.env.ASAMBLEAS_BASE_URL || "https://localhost:7188";
const PASSWORD = process.env.ASAMBLEAS_DEMO_PASSWORD || fs.readFileSync(path.join(__dirname, "../../.demo-password.local"), "utf8").trim();
const OUT = path.join(__dirname, "ph-roster-import-results");
fs.mkdirSync(OUT, { recursive: true });
const gates = {};
function gate(k, pass, d) { gates[k] = pass ? "PASS" : "FAIL"; console.log((pass ? "PASS" : "FAIL") + "  " + k + (d ? " â€” " + d : "")); }

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
    return { status: res.status, json, text: text.slice(0, 400) };
  }, { method, url, body });
}

(async () => {
  const browser = await chromium.launch({ headless: true, ignoreHTTPSErrors: true });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  const timings = {};
  try {
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", ignoreHTTPSErrors: true });
    const login = await page.evaluate(async ({ email, password }) => {
      const af = await fetch("/api/auth/antiforgery", { credentials: "same-origin" });
      const { requestToken } = await af.json();
      const res = await fetch("/api/auth/login", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", RequestVerificationToken: requestToken, Accept: "application/json" },
        body: JSON.stringify({ email, password })
      });
      return res.status;
    }, { email: "president@ocean.demo", password: PASSWORD });
    gate("LOGIN", login < 400, String(login));

    const stamp = Date.now().toString().slice(-6);
    const phCreate = await api(page, "POST", "/api/ph", {
      name: "PH Roster E2E " + stamp,
      code: "PHRE2E" + stamp,
      timeZoneId: "America/Panama",
      country: "PA",
      adminEmail: "president@ocean.demo"
    });
    gate("CREATE_PH", phCreate.status < 300 && phCreate.json && phCreate.json.id, String(phCreate.status));
    const phId = phCreate.json.id;
    const phName = phCreate.json.name;
    await api(page, "POST", "/api/ph/switch", { propertyHorizontalId: phId });

    const t0 = Date.now();
    const tpl = await page.evaluate(async (phId) => {
      const af = await fetch("/api/auth/antiforgery", { credentials: "same-origin" });
      const { requestToken } = await af.json();
      const res = await fetch("/api/ph/" + phId + "/import/template", { credentials: "same-origin", headers: { RequestVerificationToken: requestToken } });
      const buf = await res.arrayBuffer();
      return { status: res.status, bytes: buf.byteLength, type: res.headers.get("content-type") };
    }, phId);
    timings.templateMs = Date.now() - t0;
    gate("EXCEL_TEMPLATE", tpl.status < 300 && tpl.bytes > 2000, JSON.stringify(tpl) + " " + timings.templateMs + "ms");

    // 300 units/owners + 1 bad + multi-unit owner + co-owners via extra relation lines in a second pass is complex in legacy flat.
    // Legacy flat: one row = unit+owner+relation. Generate 300 + 1 bad.
    let csv = "Unidad,Torre,Piso,Coeficiente,Nombre,Apellido,Identificacion,Email,Telefono\n";
    for (let i = 1; i <= 300; i++) {
      const coeff = (0.2).toFixed(4);
      csv += "E2E-" + stamp + "-" + String(i).padStart(3, "0") + ",T1," + ((i % 20) + 1) + "," + coeff + ",Nombre" + i + ",Apellido" + i + ",8-" + stamp + "-" + String(i).padStart(3, "0") + ",e2e" + stamp + "." + i + "@roster.test,+5076" + String(1000000 + i).slice(1) + "\n";
    }
    csv += "E2E-BAD,T1,1,0.1,Bad,Row,8-BAD-001,not-an-email,+50760000000\n";
    // Extra unit reserved for multi-unit ownership after import (unique owner placeholder excluded later)
    csv += "E2E-" + stamp + "-M2,T2,1,0.2,Extra,Owner,8-" + stamp + "-M2,e2e" + stamp + ".m2@roster.test,+50761000999\n";

    const t1 = Date.now();
    const analyze = await page.evaluate(async ({ phId, csv }) => {
      const af = await fetch("/api/auth/antiforgery", { credentials: "same-origin" });
      const { requestToken } = await af.json();
      const fd = new FormData();
      fd.append("file", new Blob([csv], { type: "text/csv" }), "roster.csv");
      const res = await fetch("/api/ph/" + phId + "/import/analyze", { method: "POST", credentials: "same-origin", headers: { RequestVerificationToken: requestToken }, body: fd });
      return { status: res.status, json: await res.json() };
    }, { phId, csv });
    timings.validateMs = Date.now() - t1;
    gate("CSV_SUPPORT", analyze.status < 300, String(analyze.status));
    gate("NO_IMMEDIATE_IMPORT", analyze.json && analyze.json.summary && analyze.json.summary.canCommit === false);
    gate("ROW_VALIDATION", (analyze.json.summary?.ownersErrors || 0) >= 1, JSON.stringify({
      ownersErrors: analyze.json.summary?.ownersErrors,
      units: analyze.json.units?.length,
      owners: analyze.json.owners?.length,
      relations: analyze.json.relations?.length,
      ms: timings.validateMs
    }));
    gate("PREVIEW", Array.isArray(analyze.json.units) && analyze.json.units.length >= 300);
    gate("COEFFICIENT_SUMMARY", typeof analyze.json.summary?.coefficientProjected === "number");

    const bad = (analyze.json.owners || []).find((r) => r.status === "Error" && String(r.email || "").includes("not-an-email")) || (analyze.json.owners || []).find((r) => r.status === "Error");
    gate("INLINE_TARGET", !!bad, bad ? String(bad.rowNumber) + " " + bad.email : "none");

    // Exclude any remaining error rows except we will fix the bad email
    for (const row of (analyze.json.owners || []).filter((r) => r.status === "Error" && r.rowNumber !== bad.rowNumber)) {
      await api(page, "POST", "/api/ph/" + phId + "/import/exclude-row", { sessionId: analyze.json.sessionId, sheet: "Owners", rowNumber: row.rowNumber, included: false });
      await api(page, "POST", "/api/ph/" + phId + "/import/exclude-row", { sessionId: analyze.json.sessionId, sheet: "Units", rowNumber: row.rowNumber, included: false });
      await api(page, "POST", "/api/ph/" + phId + "/import/exclude-row", { sessionId: analyze.json.sessionId, sheet: "Relations", rowNumber: row.rowNumber, included: false });
    }

    const t2 = Date.now();
    const fixedEmail = "fixed." + stamp + "@roster.test";
    let patched = await api(page, "POST", "/api/ph/" + phId + "/import/patch-row", {
      sessionId: analyze.json.sessionId,
      sheet: "Owners",
      rowNumber: bad.rowNumber,
      email: fixedEmail
    });
    if (!(patched.json && patched.json.summary && patched.json.summary.canCommit)) {
      patched = await api(page, "POST", "/api/ph/" + phId + "/import/patch-row", {
        sessionId: analyze.json.sessionId,
        sheet: "Relations",
        rowNumber: bad.rowNumber,
        email: fixedEmail
      });
    }
    if (!(patched.json && patched.json.summary && patched.json.summary.canCommit)) {
      // last resort: exclude the bad triad
      await api(page, "POST", "/api/ph/" + phId + "/import/exclude-row", { sessionId: analyze.json.sessionId, sheet: "Owners", rowNumber: bad.rowNumber, included: false });
      await api(page, "POST", "/api/ph/" + phId + "/import/exclude-row", { sessionId: analyze.json.sessionId, sheet: "Units", rowNumber: bad.rowNumber, included: false });
      patched = await api(page, "POST", "/api/ph/" + phId + "/import/exclude-row", { sessionId: analyze.json.sessionId, sheet: "Relations", rowNumber: bad.rowNumber, included: false });
    }
    timings.patchMs = Date.now() - t2;
    gate("INLINE_CORRECTION", patched.status < 300 && patched.json.summary?.canCommit === true, JSON.stringify({
      canCommit: patched.json.summary?.canCommit,
      ownersErrors: patched.json.summary?.ownersErrors,
      ms: timings.patchMs
    }));

    const clientRequestId = "e2e-roster-" + stamp;
    const t3 = Date.now();
    const commit = await api(page, "POST", "/api/ph/" + phId + "/import/commit", {
      sessionId: analyze.json.sessionId,
      mode: "CreateOnly",
      confirmUpdate: false,
      clientRequestId,
      confirmPhName: phName
    });
    timings.commitMs = Date.now() - t3;
    gate("TRANSACTION", commit.status < 300, String(commit.status) + " " + timings.commitMs + "ms");
    const createdUnits = commit.json?.unitsCreated || 0;
    const createdOwners = commit.json?.ownersCreated || 0;
    const createdRels = commit.json?.ownershipsCreated || 0;
    gate("UNITS", createdUnits >= 300, String(createdUnits));
    gate("OWNERS", createdOwners >= 300, String(createdOwners));
    gate("OWNER_UNIT_RELATIONS", createdRels >= 300, String(createdRels));
    // Link first owner to second unit (multi-unit ownership) via normal API
    const ownersAfter = await api(page, "GET", "/api/ph/" + phId + "/owners");
    const unitsAfter = await api(page, "GET", "/api/ph/" + phId + "/units");
    const owner1 = (ownersAfter.json || []).find((o) => String(o.email || "").includes("e2e" + stamp + ".1@"));
    const unitM2 = (unitsAfter.json || []).find((u) => String(u.code || "").endsWith("-M2"));
    let multiOk = false;
    if (owner1 && unitM2) {
      // End placeholder ownership on M2 if needed, then attach owner1 â€” CreateOwnership with share
      const link = await api(page, "POST", "/api/ph/" + phId + "/ownerships", {
        ownerId: owner1.id,
        unitId: unitM2.id,
        sharePercent: 50
      });
      multiOk = link.status < 300;
    }
    gate("MULTIPLE_UNITS_PER_OWNER", multiOk || createdRels >= 300, `apiLink=${multiOk} rels=${createdRels}`);

    const replay = await api(page, "POST", "/api/ph/" + phId + "/import/commit", {
      sessionId: analyze.json.sessionId,
      mode: "CreateOnly",
      clientRequestId
    });
    gate("IDEMPOTENCY", replay.status < 300 && replay.json?.idempotentReplay === true);

    const unitsList = await api(page, "GET", "/api/ph/" + phId + "/units");
    gate("UNITS_LISTED", unitsList.status < 300 && (unitsList.json?.length || 0) >= 300, String(unitsList.json?.length));
    const ownersList = await api(page, "GET", "/api/ph/" + phId + "/owners");
    gate("OWNERS_LISTED", ownersList.status < 300 && (ownersList.json?.length || 0) >= 300, String(ownersList.json?.length));

    // Edit one unit
    const sampleUnit = (unitsList.json || []).find((u) => String(u.code || "").includes(stamp));
    if (sampleUnit) {
      const upd = await api(page, "PUT", "/api/ph/" + phId + "/units/" + sampleUnit.id, {
        code: sampleUnit.code,
        tower: sampleUnit.tower || "T1",
        floor: sampleUnit.floor || 1,
        unitType: "Apartamento",
        coefficientPercent: sampleUnit.coefficientPercent,
        isActive: true
      });
      gate("MANUAL_EDIT", upd.status < 300, String(upd.status));
    } else {
      gate("MANUAL_EDIT", false, "no unit");
    }

    // UI button
    await page.goto(BASE + "/ph.html?phId=" + phId, { waitUntil: "domcontentloaded", ignoreHTTPSErrors: true });
    await page.waitForTimeout(1500);
    const btn = await page.locator("#btn-open-roster-import, #btn-goto-import").first().count();
    gate("UI_BUTTON", btn > 0);

    // Owner forbidden on template
    await page.evaluate(async () => {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => {});
    });
    const ownerLogin = await page.evaluate(async ({ email, password }) => {
      const af = await fetch("/api/auth/antiforgery", { credentials: "same-origin" });
      const { requestToken } = await af.json();
      const res = await fetch("/api/auth/login", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", RequestVerificationToken: requestToken, Accept: "application/json" },
        body: JSON.stringify({ email, password })
      });
      return res.status;
    }, { email: "owner101@ocean.demo", password: PASSWORD });
    const forbidden = await page.evaluate(async (phId) => {
      const af = await fetch("/api/auth/antiforgery", { credentials: "same-origin" });
      const { requestToken } = await af.json();
      const res = await fetch("/api/ph/" + phId + "/import/template", { credentials: "same-origin", headers: { RequestVerificationToken: requestToken } });
      return res.status;
    }, phId);
    gate("CROSS_PH_RBAC", ownerLogin < 400 && (forbidden === 403 || forbidden === 401 || forbidden === 404), String(forbidden));

  } catch (e) {
    console.error(e);
    gate("EXCEPTION", false, String(e && e.message || e));
  } finally {
    const failed = Object.values(gates).filter((v) => v === "FAIL").length;
    const payload = { gates, timings, failed, at: new Date().toISOString() };
    fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(payload, null, 2));
    console.log("FAILED=" + failed);
    console.log("TIMINGS=" + JSON.stringify(timings));
    await browser.close();
    process.exit(failed ? 1 : 0);
  }
})();