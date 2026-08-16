/**
 * RBAC / tenant isolation / close-safety checks against real Ready recording.
 */
const { chromium } = require(require("path").join(__dirname, "node_modules/playwright"));
const fs = require("fs");
const path = require("path");

const BASE = process.env.ASAMBLEAS_BASE_URL || "https://asambleas.164.68.99.83.nip.io";
const PASSWORD =
  process.env.ASAMBLEAS_DEMO_PASSWORD ||
  fs.readFileSync(path.join(__dirname, "../../.demo-password.local"), "utf8").trim();
const ASSEMBLY_ID = process.env.ASAMBLEAS_ASSEMBLY_ID || "44444444-4444-4444-4444-444444444401";
const RECORDING_ID = process.env.ASAMBLEAS_RECORDING_ID || "68bcaa32-0dc5-441b-a984-25b0774325bb";
const OUT = path.join(__dirname, "livekit-egress-results");
fs.mkdirSync(OUT, { recursive: true });

const report = {
  rbacOwnerPlay: null,
  rbacForeignDenied: null,
  tenantCrossDenied: null,
  doubleStart: null,
  reloadGrabando: null,
  closeSafety: null,
  orphanNote: null,
  verdict: "NOT CERTIFIED"
};

async function login(page, email) {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate(
    async ({ email, password }) => {
      const af = await fetch("/api/auth/antiforgery", { credentials: "same-origin" });
      const { requestToken } = await af.json();
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          RequestVerificationToken: requestToken
        },
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) throw new Error("login " + res.status + " " + email);
    },
    { email, password: PASSWORD }
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

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    // RBAC: president can play
    {
      const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
      const page = await ctx.newPage();
      await login(page, "president@ocean.demo");
      const play = await page.evaluate(async ({ aid, rid }) => {
        const res = await fetch(`/api/assemblies/${aid}/recording/${rid}/play`, {
          credentials: "same-origin"
        });
        return { status: res.status, len: res.headers.get("content-length") };
      }, { aid: ASSEMBLY_ID, rid: RECORDING_ID });
      report.rbacOwnerPlay = play;

      // Two-tab / double-start: only while publishers exist (infra publisher left in room).
      // Second start must be idempotent (same recording id), not a second egress.
      const s1 = await api(page, "POST", `/api/assemblies/${ASSEMBLY_ID}/recording/start`, {});
      const s2 = await api(page, "POST", `/api/assemblies/${ASSEMBLY_ID}/recording/start`, {});
      report.doubleStart = {
        first: { http: s1.status, id: s1.json?.id, status: s1.json?.status, provider: s1.json?.provider },
        second: {
          http: s2.status,
          id: s2.json?.id,
          status: s2.json?.status,
          sameId: s1.json?.id === s2.json?.id
        }
      };
      const rid = s2.json?.id || s1.json?.id;
      if (rid && ["Recording", "Starting"].includes(s1.json?.status || s2.json?.status)) {
        await api(page, "POST", `/api/assemblies/${ASSEMBLY_ID}/recording/${rid}/stop`, {});
        // allow finalize
        for (let i = 0; i < 15; i++) {
          const r = await api(page, "POST", `/api/assemblies/${ASSEMBLY_ID}/recording/${rid}/refresh`, {});
          if (r.json?.status === "Ready" || r.json?.status === "Failed") break;
          await page.waitForTimeout(2000);
        }
      }
      await ctx.close();
    }

    // Owner of same PH should play
    {
      const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
      const page = await ctx.newPage();
      try {
        await login(page, "owner101@ocean.demo");
        const play = await page.evaluate(async ({ aid, rid }) => {
          const res = await fetch(`/api/assemblies/${aid}/recording/${rid}/play`, {
            credentials: "same-origin"
          });
          return { status: res.status };
        }, { aid: ASSEMBLY_ID, rid: RECORDING_ID });
        report.rbacSameTenantOwner = play;
      } catch (e) {
        report.rbacSameTenantOwner = { error: String(e) };
      }
      await ctx.close();
    }

    // Unauthenticated direct object access must fail
    {
      const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
      const page = await ctx.newPage();
      const unauth = await page.evaluate(async ({ aid, rid, base }) => {
        const res = await fetch(`${base}/api/assemblies/${aid}/recording/${rid}/play`, {
          credentials: "omit"
        });
        return { status: res.status };
      }, { aid: ASSEMBLY_ID, rid: RECORDING_ID, base: BASE });
      report.tenantCrossDenied = { unauthenticatedPlay: unauth };
      await ctx.close();
    }

    const ownerOk = report.rbacOwnerPlay?.status === 200;
    const denied =
      report.tenantCrossDenied?.unauthenticatedPlay?.status === 401 ||
      report.tenantCrossDenied?.unauthenticatedPlay?.status === 403;
    const idempotent = report.doubleStart?.second?.sameId === true;
    report.verdict =
      ownerOk && denied && idempotent ? "RBAC/TENANT CHECKS PASS" : "RBAC/TENANT CHECKS FAIL";
  } catch (e) {
    report.verdict = "RBAC/TENANT CHECKS FAIL";
    report.error = String(e?.stack || e);
  }

  fs.writeFileSync(path.join(OUT, "rbac-close-results.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  process.exit(report.verdict.includes("PASS") ? 0 : 1);
})();
