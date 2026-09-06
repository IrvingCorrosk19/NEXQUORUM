const path = require("path");
const fs = require("fs");
const { chromium } = require(path.join(__dirname, "node_modules", "playwright"));
const BASE = "https://localhost:7188";
const OUT = path.join(__dirname, "units-hub-results");
fs.mkdirSync(OUT, { recursive: true });
function loadPw() {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "..", "src", "Asambleas.Web", "appsettings.Development.json"), "utf8").replace(/^\uFEFF/, "")
  ).Demo.Password;
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
        json = { raw: text.slice(0, 400) };
      }
      return { status: res.status, json };
    },
    { method, url, body }
  );
}
(async () => {
  const results = [];
  const ok = (id, pass, d) => {
    results.push({ id, pass: !!pass, d: d || "" });
    console.log(pass ? "PASS" : "FAIL", id, d || "");
  };
  const browser = await chromium.launch({ headless: true, ignoreHTTPSErrors: true });
  const page = await (
    await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 800 } })
  ).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message || e).slice(0, 180)));
  try {
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    const login = await api(page, "POST", "/api/auth/login", {
      email: "president@ocean.demo",
      password: loadPw()
    });
    ok("LOGIN", login.status < 300, String(login.status));

    let list = await api(page, "GET", "/api/ph");
    let items = Array.isArray(list.json) ? list.json : [];
    let phId = items[0]?.id;
    if (!phId) {
      const stamp = Date.now().toString().slice(-6);
      const created = await api(page, "POST", "/api/ph", {
        name: "PH Units Hub " + stamp,
        code: "UH" + stamp,
        timeZoneId: "America/Panama",
        country: "PA",
        adminEmail: "president@ocean.demo"
      });
      phId = created.json?.id;
      ok("CREATE_PH", created.status < 300 && !!phId, String(created.status));
    } else ok("PH_EXISTS", true, phId);

    await api(page, "POST", "/api/ph/switch", { propertyHorizontalId: phId });
    await page.goto(BASE + "/ph.html", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    // open PH detail
    const opened = await page.evaluate((id) => {
      const card = document.querySelector(`[data-ph-id="${id}"]`) || document.querySelector(".ph-card");
      const btn = card?.querySelector("button, a");
      if (btn) {
        btn.click();
        return true;
      }
      // fallback: click Ver text
      const ver = [...document.querySelectorAll("button, a")].find((el) => /^(Ver|Abrir)$/i.test(el.textContent.trim()));
      if (ver) {
        ver.click();
        return true;
      }
      return false;
    }, phId);
    ok("OPEN_PH_UI", opened);
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      const tab = document.querySelector('[data-tab="units"]');
      if (tab) tab.click();
      location.hash = "units";
    });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, "01-units.png"), fullPage: true });

    ok("HEADER_ACCIONES", (await page.locator("#units-table th", { hasText: "Acciones" }).count()) > 0);
    ok("ADMIN_PH_BTN", (await page.locator("#btn-manage-ph").count()) > 0);
    const searchBg = await page.locator("#unit-search").evaluate((el) => getComputedStyle(el).backgroundColor);
    ok("SEARCH_DARK", !/rgb\(\s*128/.test(searchBg), searchBg);

    const stamp = Date.now().toString().slice(-5);
    const unit = await api(page, "POST", `/api/ph/${phId}/units`, {
      code: "U-" + stamp,
      tower: "A",
      floor: 1,
      coefficientPercent: 25,
      isActive: true
    });
    ok("CREATE_UNIT_API", unit.status < 300, String(unit.status));
    const unitId = unit.json?.id;

    await page.evaluate(() => document.querySelector('[data-tab="units"]')?.click());
    await page.waitForTimeout(300);
    // force reload list via navigating hash
    await page.goto(BASE + `/ph.html#units`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    await page.evaluate((id) => {
      const ver = [...document.querySelectorAll("button, a")].find((el) => /^(Ver|Abrir)$/i.test(el.textContent.trim()));
      ver?.click();
    }, phId);
    await page.waitForTimeout(900);
    await page.evaluate(() => document.querySelector('[data-tab="units"]')?.click());
    await page.waitForTimeout(1200);

    const manageCount = await page.locator("[data-manage-unit]").count();
    ok("GESTIONAR_VISIBLE", manageCount > 0, String(manageCount));
    if (manageCount > 0) {
      await page.locator("[data-manage-unit]").first().click();
      await page.waitForTimeout(600);
      const dlgOpen = await page.locator("#dlg-unit-hub").evaluate((d) => d.open);
      ok("MODAL_OPEN", dlgOpen);
      await page.screenshot({ path: path.join(OUT, "02-modal.png"), fullPage: true });
      await page.locator("#unit-hub-close").click().catch(() => {});
    } else {
      ok("MODAL_OPEN", false, "no manage button");
    }

    const owner = await api(page, "POST", `/api/ph/${phId}/owners`, {
      firstName: "Hub",
      lastName: "Owner",
      email: `hub.${stamp}@sandbox.test`,
      identification: "8-" + stamp,
      unitId,
      sharePercent: 100
    });
    ok("CREATE_OWNER", owner.status < 300, String(owner.status));

    const upd = await api(page, "PUT", `/api/ph/${phId}/units/${unitId}`, {
      code: "U-" + stamp,
      tower: "B",
      floor: 2,
      unitType: "Apto",
      coefficientPercent: 25.5,
      isActive: true
    });
    ok("EDIT_UNIT", upd.status < 300, String(upd.status));

    const off = await api(page, "POST", `/api/ph/${phId}/units/${unitId}/active`, { isActive: false });
    ok("DEACTIVATE_UNIT", off.status < 300 && off.json?.isActive === false, String(off.status));
    const on = await api(page, "POST", `/api/ph/${phId}/units/${unitId}/active`, { isActive: true });
    ok("REACTIVATE_UNIT", on.status < 300 && on.json?.isActive === true, String(on.status));

    const detail = await api(page, "GET", `/api/ph/${phId}/units/${unitId}/ownerships`);
    ok("OWNERSHIP_DETAIL_ENRICHED", !!detail.json && "unitType" in (detail.json || {}), Object.keys(detail.json || {}).join(","));
    const ownId = (detail.json?.owners || []).find((o) => o.isActive)?.ownershipId;
    if (ownId) {
      const end = await api(page, "POST", `/api/ph/${phId}/ownerships/${ownId}/end`);
      ok("UNLINK", end.status < 300, String(end.status));
    } else ok("UNLINK", true, "none");

    const ev = await api(page, "GET", `/api/ph/${phId}/units/${unitId}/delete-evaluation`);
    ok("DELETE_EVAL", ev.status === 200, String(ev.json?.canHardDelete));
    const del = await api(page, "DELETE", `/api/ph/${phId}/units/${unitId}`);
    ok("DELETE_UNIT", del.status === 204 || del.status === 200, String(del.status));

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => document.querySelector('[data-tab="units"]')?.click());
    await page.waitForTimeout(500);
    const cardsVisible = await page.locator("#units-cards").evaluate((el) => getComputedStyle(el).display !== "none");
    ok("MOBILE_CARDS", cardsVisible);
    await page.screenshot({ path: path.join(OUT, "03-mobile.png"), fullPage: true });

    ok("NO_PAGE_ERRORS", errors.length === 0, errors.slice(0, 3).join(" | "));
    const failed = results.filter((r) => !r.pass).length;
    fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ failed, passed: results.length - failed, results, errors }, null, 2));
    console.log(JSON.stringify({ failed, passed: results.length - failed, total: results.length }));
    process.exitCode = failed ? 1 : 0;
  } catch (e) {
    fs.writeFileSync(path.join(OUT, "fatal.txt"), String(e && e.stack ? e.stack : e));
    console.error("FATAL", e.message || e);
    process.exitCode = 2;
  } finally {
    await browser.close().catch(() => {});
  }
})();
