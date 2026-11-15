/**
 * Bootstrap two local PHs + assemblies for admin nav perf testing.
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.ASAM_BASE_URL || "http://127.0.0.1:5188";
const PASS =
  process.env.ASAM_DEMO_PASSWORD ||
  fs.readFileSync(path.join(__dirname, "../../.demo-password.local"), "utf8").trim();

async function api(page, method, url, body) {
  return page.evaluate(
    async ({ method, url, body }) => {
      const headers = { Accept: "application/json" };
      if (body) headers["Content-Type"] = "application/json";
      const af = await fetch("/api/auth/antiforgery", { credentials: "same-origin" });
      if (af.ok) {
        const t = await af.json().catch(() => ({}));
        const tok = t.requestToken || t.token;
        if (tok) headers["RequestVerificationToken"] = tok;
      }
      const r = await fetch(url, {
        method,
        credentials: "same-origin",
        headers,
        body: body ? JSON.stringify(body) : undefined
      });
      const text = await r.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }
      return { status: r.status, data };
    },
    { method, url, body }
  );
}

async function ensurePh(page, name, code) {
  const list = await api(page, "GET", "/api/ph");
  const existing = (list.data || []).find((p) => String(p.code).toUpperCase() === code.toUpperCase());
  if (existing) return existing;
  const created = await api(page, "POST", "/api/ph", {
    code,
    name,
    legalName: name,
    timeZoneId: "America/Panama",
    address: "Calle Demo 1",
    city: "Panamá",
    country: "PA",
    adminEmail: "president@ocean.demo"
  });
  if (created.status >= 400) throw new Error(`Create PH ${code}: ${created.status} ${JSON.stringify(created.data)}`);
  return created.data;
}

async function ensureUnit(page, phId, code) {
  const units = await api(page, "GET", `/api/ph/${phId}/units`);
  const list = units.data || [];
  const existing = list.find((u) => u.code === code);
  if (existing) return existing;
  const created = await api(page, "POST", `/api/ph/${phId}/units`, {
    code,
    tower: "A",
    floor: 1,
    unitType: "Apartamento",
    coefficientPercent: 100
  });
  if (created.status >= 400) throw new Error(`Create unit: ${created.status} ${JSON.stringify(created.data)}`);
  return created.data;
}

async function ensureAssembly(page, phId, title) {
  const assemblies = await api(page, "GET", `/api/ph/${phId}/assemblies`);
  let list = assemblies.data;
  if (list && !Array.isArray(list)) list = list.items || list.assemblies || [];
  list = list || [];
  const existing = list.find((a) => (a.title || a.name) === title);
  if (existing) return existing;

  const start = new Date(Date.now() + 86400000);
  const end = new Date(start.getTime() + 2 * 3600000);
  const r = await api(page, "POST", "/api/assemblies", {
    propertyHorizontalId: phId,
    title,
    modality: "Hybrid",
    scheduledAtUtc: start.toISOString(),
    estimatedEndAtUtc: end.toISOString(),
    requiredQuorumPercent: 50,
    assemblyKind: "Ordinary",
    publishAsScheduled: true
  });
  if (r.status >= 400) throw new Error(`Create assembly: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.locator("#password-login-details").evaluate((el) => {
  el.open = true;
});
await page.fill("#email", "president@ocean.demo");
await page.fill("#password", PASS);
await page.click('#login-form button[type="submit"]');
await page.waitForTimeout(1500);

const phA = await ensurePh(page, "PH Nav Perf Alpha", "NAV-A");
const phB = await ensurePh(page, "PH Nav Perf Beta", "NAV-B");
console.log("PHA", phA.id, phA.name);
console.log("PHB", phB.id, phB.name);

async function switchTo(phId) {
  const r = await api(page, "POST", "/api/ph/switch", { propertyHorizontalId: phId });
  if (r.status >= 400) throw new Error(`switch ${phId}: ${r.status} ${JSON.stringify(r.data)}`);
  // Refresh session claims after switch
  await api(page, "GET", "/api/auth/me");
}

await switchTo(phA.id);
await ensureUnit(page, phA.id, "A-101");
await switchTo(phB.id);
await ensureUnit(page, phB.id, "B-101");

let asmA = null;
let asmB = null;
try {
  await switchTo(phA.id);
  asmA = await ensureAssembly(page, phA.id, "Asamblea Nav Perf Alpha");
  console.log("ASMA", asmA.id || asmA.assemblyId, asmA.title || asmA.name);
} catch (e) {
  console.warn("asmA", e.message);
}
try {
  await switchTo(phB.id);
  asmB = await ensureAssembly(page, phB.id, "Asamblea Nav Perf Beta");
  console.log("ASMB", asmB.id || asmB.assemblyId, asmB.title || asmB.name);
} catch (e) {
  console.warn("asmB", e.message);
}

const out = {
  phA: { id: phA.id, name: phA.name, code: phA.code },
  phB: { id: phB.id, name: phB.name, code: phB.code },
  assemblyA: asmA ? { id: asmA.id || asmA.assemblyId, title: asmA.title || asmA.name } : null,
  assemblyB: asmB ? { id: asmB.id || asmB.assemblyId, title: asmB.title || asmB.name } : null
};
fs.mkdirSync(path.join(__dirname, "admin-nav-perf-results"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "admin-nav-perf-results/fixture.json"), JSON.stringify(out, null, 2));
console.log("wrote fixture.json");
await browser.close();
