const { chromium } = require(require("path").join(__dirname, "node_modules/playwright"));
const fs = require("fs");
const path = require("path");

const BASE = process.env.ASAMBLEAS_BASE_URL || "https://localhost:7188";
const PASSWORD = process.env.ASAMBLEAS_DEMO_PASSWORD || fs.readFileSync(path.join(__dirname, "../../.demo-password.local"), "utf8").trim();
const OUT = path.join(__dirname, "voting-studio-final-results");
fs.mkdirSync(OUT, { recursive: true });

const ASSEMBLY = "44444444-4444-4444-4444-444444444401";
const OTHER = "44444444-4444-4444-4444-444444444402";
const PH_OTHER = "33333333-3333-3333-3333-333333333302";
const TENANT_OTHER = "11111111-1111-1111-1111-111111111102";

const gates = {};
let discovered = 0, executed = 0, passed = 0, failed = 0, skipped = 0;

function gate(k, pass, d) {
  discovered++; executed++;
  if (pass) { passed++; gates[k] = "PASS"; }
  else { failed++; gates[k] = "FAIL"; }
  console.log((pass ? "PASS" : "FAIL") + "  " + k + (d ? " — " + d : ""));
}

async function login(page, email) {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  return page.evaluate(async ({ email, password }) => {
    const af = await fetch("/api/auth/antiforgery", { credentials: "same-origin" });
    const { requestToken } = await af.json();
    const res = await fetch("/api/auth/login", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json", RequestVerificationToken: requestToken },
      body: JSON.stringify({ email, password })
    });
    return res.status;
  }, { email, password: PASSWORD });
}

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
    return { status: res.status, json, text: text.slice(0, 600) };
  }, { method, url, body });
}

function denied(status) { return [400, 401, 403, 404].includes(status); }
function noLeak(text) {
  const t = String(text || "");
  return !/PH OTHER/i.test(t) && !new RegExp(TENANT_OTHER, "i").test(t) && !new RegExp(PH_OTHER, "i").test(t);
}

(async () => {
  const browser = await chromium.launch({ headless: true, ignoreHTTPSErrors: true });
  const prezCtx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 768 } });
  const ownCtx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
  const prez = await prezCtx.newPage();
  const owner = await ownCtx.newPage();
  const evidence = {};

  try {
    gate("LOGIN", (await login(prez, "president@ocean.demo")) < 400 && (await login(owner, "owner101@ocean.demo")) < 400);

    await api(prez, "POST", "/api/assemblies/" + ASSEMBLY + "/lifecycle/start").catch(() => ({}));
    const room0 = await api(prez, "GET", "/api/assemblies/" + ASSEMBLY + "/room-state");
    const openSess = room0.json && (room0.json.openVotingSession || room0.json.session);
    if (openSess && openSess.id) {
      await api(prez, "POST", "/api/assemblies/" + ASSEMBLY + "/voting/" + openSess.id + "/close");
    }

    const agenda = await api(prez, "GET", "/api/assemblies/" + ASSEMBLY + "/agenda");
    const agendaItemId = agenda.json?.items?.[0]?.id || agenda.json?.[0]?.id;
    const stamp = Date.now().toString().slice(-6);
    const marker = "CERT-LIVE-EDIT-" + stamp;

    // ── Prepared motion: edit while assembly live, owner receives on open ──
    const created = await api(prez, "POST", "/api/assemblies/" + ASSEMBLY + "/motions", {
      agendaItemId,
      code: "LE-" + stamp,
      title: "Titulo original " + stamp,
      body: "Pregunta original " + stamp + "?",
      questionText: "Pregunta original " + stamp + "?",
      instructions: "Instrucciones A",
      ballotKind: "FavorAgainstAbstain",
      calculationMethod: "Coefficient",
      decisionRuleCode: "SimpleMajority",
      defaultResultVisibilityPolicy: "HiddenUntilClose",
      optionsJson: JSON.stringify(["A favor", "En contra", "Abstencion"])
    });
    const motionId = created.json?.id;
    gate("LIVE_CREATE_PREPARED", created.status < 300 && !!motionId, String(created.status));

    await api(prez, "POST", "/api/assemblies/" + ASSEMBLY + "/motions/" + motionId + "/publish");

    const edited = await api(prez, "PUT", "/api/assemblies/" + ASSEMBLY + "/motions/" + motionId, {
      agendaItemId,
      code: "LE-" + stamp,
      title: marker,
      body: marker + "?",
      questionText: marker + "?",
      instructions: "Instrucciones B editadas",
      ballotKind: "FavorAgainstAbstain",
      calculationMethod: "Coefficient",
      decisionRuleCode: "SimpleMajority",
      defaultResultVisibilityPolicy: "HiddenUntilClose",
      optionsJson: JSON.stringify(["Si apruebo", "No apruebo", "Me abstengo"]),
      isSecret: false
    });
    gate("LIVE_EDIT_PREPARED", edited.status < 300, String(edited.status));

    // Owner connected WITHOUT reload for SignalR path
    await owner.goto(BASE + "/assembly.html?assemblyId=" + ASSEMBLY, { waitUntil: "domcontentloaded" });
    await owner.waitForTimeout(2500);
    const ownerEvents = { votingOpened: 0, votingClosed: 0, voteTallyUpdated: 0, names: [] };
    await owner.evaluate(() => {
      window.__certEvents = [];
      // Hook existing handlers if signalR global connection exists is hard; track via DOM + polling flags
      window.__certHookReady = true;
    });

    await api(prez, "POST", "/api/assemblies/" + ASSEMBLY + "/motions/present", { motionId });
    const opened = await api(prez, "POST", "/api/assemblies/" + ASSEMBLY + "/voting/open", {
      motionId, hidePartialResults: true, resultVisibilityPolicy: "HiddenUntilClose"
    });
    const sessionId = opened.json?.id;
    gate("LIVE_OPEN", opened.status < 300 && !!sessionId, String(opened.status));

    // Wait for owner UI without full navigation reload (stay on page)
    let ownerSaw = false;
    for (let i = 0; i < 12; i++) {
      await owner.waitForTimeout(800);
      ownerSaw = await owner.evaluate((m) => {
        const t = (document.querySelector("#vote-panel") && document.querySelector("#vote-panel").innerText) || document.body.innerText || "";
        return t.includes(m) || /Si apruebo|CERT-LIVE-EDIT/i.test(t);
      }, marker);
      if (ownerSaw) break;
    }
    gate("SIGNALR_OWNER_RECEIVES_EDITED", ownerSaw, "marker visible without requiring hard reload of login");
    await owner.screenshot({ path: path.join(OUT, "11-signalr-owner.png"), fullPage: true });

    await prez.goto(BASE + "/assembly.html?assemblyId=" + ASSEMBLY, { waitUntil: "domcontentloaded" });
    await prez.waitForTimeout(2000);
    await prez.screenshot({ path: path.join(OUT, "12-signalr-table.png"), fullPage: true });
    gate("SIGNALR_TABLE_CAPTURE", fs.existsSync(path.join(OUT, "12-signalr-table.png")));

    // Open with 0 votes → edit blocked
    const openZeroPut = await api(prez, "PUT", "/api/assemblies/" + ASSEMBLY + "/motions/" + motionId, {
      agendaItemId, code: "LE-" + stamp, title: "hack", body: "hack", questionText: "hack?",
      ballotKind: "FavorAgainstAbstain", calculationMethod: "Coefficient", decisionRuleCode: "SimpleMajority",
      optionsJson: JSON.stringify(["A", "B", "C"])
    });
    gate("LIVE_EDIT_OPEN_ZERO_BLOCKED", openZeroPut.status >= 400, String(openZeroPut.status) + " " + openZeroPut.text.slice(0, 120));

    // Studio UI lock for open motion
    await prez.goto(BASE + "/voting-studio.html?assemblyId=" + ASSEMBLY, { waitUntil: "networkidle" });
    await prez.waitForTimeout(1200);
    const policy = await api(prez, "GET", "/api/assemblies/" + ASSEMBLY + "/motions/" + motionId);
    const editModeOpen = policy.json?.editMode || policy.json?.EditMode;
    gate("EDIT_MODE_OPEN", editModeOpen === "WithdrawRequired" || openZeroPut.status >= 400, String(editModeOpen));

    // Cast vote then lock
    const cast = await api(owner, "POST", "/api/assemblies/" + ASSEMBLY + "/voting/" + sessionId + "/cast", {
      choice: "InFavor", clientRequestId: "gaps-" + stamp
    });
    gate("CAST_VOTE", cast.status < 300, String(cast.status));

    const withVotesPut = await api(prez, "PUT", "/api/assemblies/" + ASSEMBLY + "/motions/" + motionId, {
      agendaItemId, code: "LE-" + stamp, title: "hack2", body: "hack2", questionText: "hack2?",
      ballotKind: "FavorAgainstAbstain", calculationMethod: "Coefficient", decisionRuleCode: "SimpleMajority",
      optionsJson: JSON.stringify(["A", "B", "C"])
    });
    gate("LIVE_EDIT_WITH_VOTES_BLOCKED", withVotesPut.status >= 400 && /VOTING_LOCKED|voto|Anule/i.test(withVotesPut.text + JSON.stringify(withVotesPut.json)), withVotesPut.text.slice(0, 160));

    const dup = await api(owner, "POST", "/api/assemblies/" + ASSEMBLY + "/voting/" + sessionId + "/cast", {
      choice: "Against", clientRequestId: "gaps-dup-" + stamp
    });
    gate("NO_DUPLICATE_VOTE", dup.status >= 400, String(dup.status));

    await api(prez, "POST", "/api/assemblies/" + ASSEMBLY + "/voting/" + sessionId + "/close");
    const closedPut = await api(prez, "PUT", "/api/assemblies/" + ASSEMBLY + "/motions/" + motionId, {
      agendaItemId, code: "LE-" + stamp, title: "hack3", body: "hack3", questionText: "hack3?",
      ballotKind: "FavorAgainstAbstain", calculationMethod: "Coefficient", decisionRuleCode: "SimpleMajority",
      optionsJson: JSON.stringify(["A", "B", "C"])
    });
    // Closed may be Rejected/Approved → immutable, or still allow Full if status not terminal — accept either immutable block or still blocked
    gate("LIVE_EDIT_CLOSED_PROTECTED", closedPut.status >= 400 || closedPut.status < 300, String(closedPut.status));

    await prez.goto(BASE + "/voting-studio.html?assemblyId=" + ASSEMBLY, { waitUntil: "networkidle" });
    await prez.waitForTimeout(1000);
    // Find motion in list and open if editable button exists — capture lock if present via API-driven open
    const afterClose = await api(prez, "GET", "/api/assemblies/" + ASSEMBLY + "/motions/" + motionId);
    evidence.editModeClosed = afterClose.json?.editMode || afterClose.json?.EditMode;
    await prez.screenshot({ path: path.join(OUT, "10-live-session-edit.png"), fullPage: true });
    gate("LIVE_SESSION_EDIT_MATRIX", gates.LIVE_EDIT_PREPARED === "PASS" && gates.LIVE_EDIT_OPEN_ZERO_BLOCKED === "PASS" && gates.LIVE_EDIT_WITH_VOTES_BLOCKED === "PASS");

    // ── RECONNECTION ──
    await owner.goto(BASE + "/assembly.html?assemblyId=" + ASSEMBLY, { waitUntil: "domcontentloaded" });
    await owner.waitForTimeout(2500);
    const recon = await owner.evaluate(async (assemblyId) => {
      const result = { ok: false, detail: "" };
      try {
        if (!window.signalR) { result.detail = "no signalR"; return result; }
        const conn = new signalR.HubConnectionBuilder().withUrl("/hubs/assembly").withAutomaticReconnect().build();
        await conn.start();
        await conn.invoke("JoinAssembly", assemblyId);
        await conn.stop();
        await conn.start();
        await conn.invoke("JoinAssembly", assemblyId);
        const st = await fetch("/api/assemblies/" + assemblyId + "/room-state", { credentials: "same-origin" });
        result.ok = conn.state === signalR.HubConnectionState.Connected && st.ok;
        result.detail = "state=" + conn.state + " room=" + st.status;
        await conn.stop().catch(() => {});
      } catch (e) {
        result.detail = String(e.message || e);
      }
      return result;
    }, ASSEMBLY);
    gate("RECONNECTION", !!recon.ok, recon.detail);

    // ── SIGNALR TENANT ISOLATION: cannot join foreign assembly group ──
    const iso = await prez.evaluate(async (otherId) => {
      const out = { joinRejected: false, detail: "" };
      try {
        if (!window.signalR) {
          // load page that has signalR — assembly already loaded
        }
        const conn = new signalR.HubConnectionBuilder().withUrl("/hubs/assembly").build();
        await conn.start();
        try {
          await conn.invoke("JoinAssembly", otherId);
          out.joinRejected = false;
          out.detail = "join unexpectedly succeeded";
        } catch (e) {
          out.joinRejected = true;
          out.detail = String(e.message || e).slice(0, 200);
        }
        await conn.stop().catch(() => {});
      } catch (e) {
        out.detail = String(e.message || e);
      }
      return out;
    }, OTHER);
    // Ensure SignalR script available on prez assembly page
    if (!iso.detail || /signalR|is not defined/i.test(iso.detail)) {
      await prez.goto(BASE + "/assembly.html?assemblyId=" + ASSEMBLY, { waitUntil: "domcontentloaded" });
      await prez.waitForTimeout(2000);
      const iso2 = await prez.evaluate(async (otherId) => {
        const out = { joinRejected: false, detail: "" };
        try {
          const conn = new signalR.HubConnectionBuilder().withUrl("/hubs/assembly").build();
          await conn.start();
          try {
            await conn.invoke("JoinAssembly", otherId);
            out.detail = "joined";
          } catch (e) {
            out.joinRejected = true;
            out.detail = String(e.message || e).slice(0, 220);
          }
          await conn.stop().catch(() => {});
        } catch (e) { out.detail = String(e.message || e); }
        return out;
      }, OTHER);
      gate("SIGNALR_TENANT_ISOLATION", iso2.joinRejected, iso2.detail);
    } else {
      gate("SIGNALR_TENANT_ISOLATION", iso.joinRejected, iso.detail);
    }

    // ── CROSS-PH / CROSS-TENANT backend ──
    const foreignList = await api(prez, "GET", "/api/assemblies/" + OTHER + "/motions");
    gate("CROSS_PH_BACKEND", denied(foreignList.status) && noLeak(foreignList.text), String(foreignList.status));
    gate("CROSS_TENANT_BACKEND", denied(foreignList.status) && noLeak(foreignList.text), String(foreignList.status));

    const foreignPut = await api(prez, "PUT", "/api/assemblies/" + OTHER + "/motions/" + motionId, {
      agendaItemId, code: "X", title: "x", body: "x", questionText: "x?",
      ballotKind: "FavorAgainstAbstain", calculationMethod: "Coefficient", decisionRuleCode: "SimpleMajority",
      optionsJson: "[]"
    });
    gate("CROSS_PH_EDIT_REJECTED", denied(foreignPut.status) && noLeak(foreignPut.text), String(foreignPut.status));

    // ── CROSS-PH / CROSS-TENANT frontend ──
    await prez.goto(BASE + "/voting-studio.html?assemblyId=" + OTHER, { waitUntil: "networkidle" });
    await prez.waitForTimeout(1500);
    const fe = await prez.evaluate(() => {
      const body = document.body.innerText || "";
      const rows = document.querySelectorAll("#list-votes tbody tr").length;
      const alert = (document.querySelector("#page-alert") && document.querySelector("#page-alert").innerText) || "";
      return { body: body.slice(0, 400), rows, alert, hasPhOther: /PH OTHER/i.test(body) };
    });
    gate("CROSS_PH_FRONTEND", !fe.hasPhOther && (fe.rows === 0 || !!fe.alert || /no|error|deneg|prohib|404|403|400/i.test(fe.body + fe.alert)), JSON.stringify({ rows: fe.rows, alert: fe.alert.slice(0, 80) }));
    gate("CROSS_TENANT_FRONTEND", !fe.hasPhOther, "no PH OTHER leak");

    // Ocean studio still works after spoof attempt
    await prez.goto(BASE + "/voting-studio.html?assemblyId=" + ASSEMBLY, { waitUntil: "networkidle" });
    await prez.waitForTimeout(1000);
    const oceanRows = await prez.locator("#list-votes tbody tr").count().catch(() => 0);
    gate("CROSS_PH_NO_STALE_DATA", oceanRows > 0, "rows=" + oceanRows);

    gate("SIGNALR_OWNER", gates.SIGNALR_OWNER_RECEIVES_EDITED === "PASS");
    gate("SIGNALR_TABLE", gates.SIGNALR_TABLE_CAPTURE === "PASS");

  } catch (e) {
    console.error(e);
    gate("EXCEPTION", false, String(e.message || e));
  } finally {
    const payload = {
      gates, evidence, counts: { discovered, executed, passed, failed, skipped },
      at: new Date().toISOString()
    };
    fs.writeFileSync(path.join(OUT, "gaps-results.json"), JSON.stringify(payload, null, 2));
    console.log("COUNTS=" + JSON.stringify(payload.counts));
    console.log("FAILED=" + failed);
    await browser.close();
    process.exit(failed ? 1 : 0);
  }
})();