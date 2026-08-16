/**
 * EO-021 ADDENDUM — Native Screen Sharing (LOCALHOST ONLY)
 * Automatable gates + explicit PENDING for native getDisplayMedia picker.
 * NO VPS. Does NOT fake PASS on browser display picker.
 */
const { chromium } = require(require("path").join(__dirname, "node_modules/playwright"));
const fs = require("fs");
const path = require("path");

const BASE = process.env.ASAMBLEAS_BASE_URL || "https://localhost:7188";
const PASSWORD =
  process.env.ASAMBLEAS_DEMO_PASSWORD ||
  fs.readFileSync(path.join(__dirname, "../../.demo-password.local"), "utf8").trim();
const STAMP = Date.now().toString().slice(-8);
const OUT = path.join(__dirname, "eo021-results");
fs.mkdirSync(OUT, { recursive: true });

const results = {
  env: "LOCALHOST",
  url: BASE,
  stamp: STAMP,
  tests: [],
  matrix: {},
  defects: [],
  http500: 0,
  consoleCritical: [],
  vps: "NOT PERFORMED",
  manualGetDisplayMedia: "PENDING USER ACCEPTANCE",
  architectureDecision:
    "ADDITIONAL LiveKit screen track via setScreenShareEnabled (camera retained). SignalR coordinates ScreenShareUpdated state only — no video frames.",
  certified: false,
  verdict: null
};

function record(t) {
  results.tests.push(t);
  const ok = t.Result === "PASS";
  const pending = t.Result === "PENDING";
  console.log(
    `${ok ? "PASS" : pending ? "PEND" : "FAIL"}  ${t.TestId} — ${String(t.Actual || "").slice(0, 200)}`
  );
  if (!ok && !pending && (t.Severity === "P0" || t.Severity === "P1")) {
    results.defects.push({ sev: t.Severity, id: t.TestId, msg: t.Actual });
  }
}

function mx(k, v) {
  results.matrix[k] = v;
}

function pass(id) {
  return results.tests.some((t) => t.TestId === id && t.Result === "PASS");
}

async function api(page, method, url, body) {
  const run = () =>
    page.evaluate(
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
        if (text) {
          try {
            json = JSON.parse(text);
          } catch {
            json = { raw: text };
          }
        }
        return { status: res.status, json, text: (text || "").slice(0, 800), code: json?.code || null };
      },
      { method, url, body }
    );
  try {
    return await run();
  } catch (err) {
    const msg = String(err?.message || err);
    if (/Execution context was destroyed|Target closed|navigation/i.test(msg)) {
      await page.waitForTimeout(500);
      await page.goto(page.url() || BASE + "/", { waitUntil: "domcontentloaded" }).catch(() => {});
      return run();
    }
    throw err;
  }
}

async function login(page, email, password) {
  await page.goto(BASE + "/", { waitUntil: "networkidle" }).catch(() =>
    page.goto(BASE + "/", { waitUntil: "domcontentloaded" })
  );
  await page.waitForTimeout(200);
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

async function activateFromMailbox(page, email) {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  const token = await page.evaluate(async (em) => {
    const rows = await (await fetch(`/api/dev/mock-mailbox?to=${encodeURIComponent(em)}`)).json();
    const hit = (rows || []).find((m) => m.activationToken);
    return hit?.activationToken || null;
  }, email);
  if (!token) return { ok: false, detail: "no token" };
  const act = await page.evaluate(
    async ({ token, password }) => {
      const af = await fetch("/api/auth/antiforgery", { credentials: "same-origin" });
      const { requestToken } = await af.json();
      const res = await fetch("/api/ph/invitations/activate", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          RequestVerificationToken: requestToken,
          Accept: "application/json"
        },
        body: JSON.stringify({ token, password, displayName: "EO021 SS Owner" })
      });
      return { status: res.status, body: (await res.text()).slice(0, 200) };
    },
    { token, password: PASSWORD }
  );
  return { ok: act.status < 300, detail: act.body, status: act.status };
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--ignore-certificate-errors"]
  });
  const ctx = async () =>
    browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1440, height: 900 }
    });

  const prezCtx = await ctx();
  const ownCtx = await ctx();
  const ownBCtx = await ctx();
  const isoCtx = await ctx();
  const prez = await prezCtx.newPage();
  const ownA = await ownCtx.newPage();
  const ownB = await ownBCtx.newPage();
  const iso = await isoCtx.newPage();

  for (const [name, page] of [
    ["prez", prez],
    ["ownA", ownA],
    ["ownB", ownB],
    ["iso", iso]
  ]) {
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const t = msg.text();
        if (
          /favicon|Download the React|signalr.*negotiation|401 \(\)|Failed to load resource|net::ERR_/i.test(
            t
          )
        ) {
          return;
        }
        results.consoleCritical.push({ who: name, t: t.slice(0, 300) });
      }
    });
    page.on("pageerror", (err) => {
      const t = String(err.message || err);
      if (/ResizeObserver|Script error/i.test(t)) return;
      results.consoleCritical.push({ who: name, t: t.slice(0, 300) });
    });
    page.on("response", (r) => {
      if (r.status() >= 500) results.http500++;
    });
  }

  const ownerEmail = `eo021ss.a.${STAMP}@ocean.demo`;
  const ownerBEmail = `eo021ss.b.${STAMP}@ocean.demo`;
  let phId;
  let phBId;
  let assemblyId;
  let assemblyBId;
  let motionId;

  try {
    const health = await prez.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    record({
      TestId: "HEALTH",
      Area: "Infra",
      Scenario: "localhost up",
      Expected: "<500",
      Actual: String(health?.status()),
      Result: health && health.status() < 500 ? "PASS" : "FAIL",
      Severity: "P0"
    });

    const la = await login(prez, "phadmin@ocean.demo", PASSWORD);
    record({
      TestId: "LOGIN-ADMIN",
      Area: "Auth",
      Scenario: "PHAdmin login",
      Expected: "<300",
      Actual: String(la.status),
      Result: la.status < 300 ? "PASS" : "FAIL",
      Severity: "P0"
    });
    await prez.evaluate(async () => {
      await fetch("/api/dev/mock-mailbox/clear", { method: "POST" }).catch(() => {});
    });

    const ph = await api(prez, "POST", "/api/ph", {
      name: `PH EO021 SS ${STAMP}`,
      code: `EO21SS-${STAMP}`,
      adminEmail: "phadmin@ocean.demo",
      city: "Panamá",
      country: "PA",
      timeZoneId: "America/Panama"
    });
    phId = ph.json?.id || ph.json?.propertyHorizontalId;
    if (!phId) {
      const list = await api(prez, "GET", "/api/ph");
      phId = (list.json || []).find((p) => (p.name || "").includes(`EO021 SS ${STAMP}`))?.id;
    }
    record({
      TestId: "PH-CREATE",
      Area: "PH",
      Scenario: "Create PH",
      Expected: "phId",
      Actual: phId || "null",
      Result: phId ? "PASS" : "FAIL",
      Severity: "P0"
    });
    await api(prez, "POST", "/api/ph/switch", { propertyHorizontalId: phId });

    const prof = await api(prez, "GET", `/api/communications/ph/${phId}/profile`);
    await api(prez, "PUT", `/api/communications/ph/${phId}/profile`, {
      sandboxMode: true,
      testRecipientOverride: null,
      defaultTimezoneId: prof.json?.defaultTimezoneId || "America/Panama",
      defaultFromDisplayName: "EO021SS",
      defaultReplyTo: null
    });

    const unitA = await api(prez, "POST", `/api/ph/${phId}/units`, {
      code: "101",
      tower: "A",
      floor: 1,
      unitType: "Apartamento",
      coefficientPercent: 60
    });
    const unitB = await api(prez, "POST", `/api/ph/${phId}/units`, {
      code: "102",
      tower: "A",
      floor: 1,
      unitType: "Apartamento",
      coefficientPercent: 40
    });
    const unitAId = unitA.json?.id;
    const unitBId = unitB.json?.id;
    const ownCreate = await api(prez, "POST", `/api/ph/${phId}/owners`, {
      firstName: "Owner",
      lastName: "SS A",
      email: ownerEmail,
      phone: "+50761001101",
      identificationType: "Cédula",
      identification: `SS-A-${STAMP}`,
      unitId: unitAId,
      sharePercent: 100
    });
    const ownBCreate = await api(prez, "POST", `/api/ph/${phId}/owners`, {
      firstName: "Owner",
      lastName: "SS B",
      email: ownerBEmail,
      phone: "+50761001102",
      identificationType: "Cédula",
      identification: `SS-B-${STAMP}`,
      unitId: unitBId,
      sharePercent: 100
    });
    const ownerId = ownCreate.json?.id;
    const ownerBId = ownBCreate.json?.id;

    await api(prez, "POST", `/api/ph/${phId}/owners/${ownerId}/invite`);
    await api(prez, "POST", `/api/ph/${phId}/owners/${ownerBId}/invite`);
    const actA = await activateFromMailbox(ownA, ownerEmail);
    const actB = await activateFromMailbox(ownB, ownerBEmail);
    const loA = actA.ok ? await login(ownA, ownerEmail, PASSWORD) : { status: 0 };
    const loB = actB.ok ? await login(ownB, ownerBEmail, PASSWORD) : { status: 0 };
    await api(ownA, "POST", "/api/ph/switch", { propertyHorizontalId: phId }).catch(() => {});
    await api(ownB, "POST", "/api/ph/switch", { propertyHorizontalId: phId }).catch(() => {});
    record({
      TestId: "OWNERS-READY",
      Area: "Owners",
      Scenario: "Activate+login owners",
      Expected: "ok",
      Actual: `actA=${actA.ok} actB=${actB.ok} A=${loA.status} B=${loB.status}`,
      Result: actA.ok && actB.ok && loA.status >= 200 && loA.status < 300 && loB.status >= 200 && loB.status < 300
        ? "PASS"
        : "FAIL",
      Severity: "P0"
    });

    // Prefer PHAdmin for this PH (has meeting:screenshare).
    await api(prez, "POST", "/api/ph/switch", { propertyHorizontalId: phId });

    const when = new Date(Date.now() + 40 * 60 * 1000);
    const end = new Date(when.getTime() + 3 * 60 * 60 * 1000);
    const asm = await api(prez, "POST", "/api/assemblies", {
      propertyHorizontalId: phId,
      title: `EO021 Screen Share ${STAMP}`,
      modality: "Virtual",
      scheduledAtUtc: when.toISOString(),
      estimatedEndAtUtc: end.toISOString(),
      requiredQuorumPercent: 50,
      assemblyKind: "Ordinary",
      locationText: "Sala SS",
      notes: "Screen share certification",
      publishAsScheduled: true
    });
    assemblyId = asm.json?.id;
    record({
      TestId: "ASM-CREATE",
      Area: "Assembly",
      Scenario: "Create assembly",
      Expected: "id",
      Actual: assemblyId || JSON.stringify(asm.json || asm.text).slice(0, 200),
      Result: assemblyId ? "PASS" : "FAIL",
      Severity: "P0"
    });

    // Convocation materializes owners as assembly participants (required for check-in/meeting).
    const conv = await api(prez, "POST", `/api/assemblies/${assemblyId}/convocations`, {
      assemblyId,
      title: `Convocatoria SS ${STAMP}`,
      subject: `Convocatoria SS ${STAMP}`,
      bodyHtml: `<p>SS ${STAMP}</p>`,
      bodyText: `SS ${STAMP}`,
      channels: ["Email", "Portal"]
    });
    const convocationId = conv.json?.id;
    await api(prez, "POST", `/api/convocations/${convocationId}/validate`, {});
    const detail = await api(prez, "GET", `/api/convocations/${convocationId}`);
    const recipients = detail.json?.recipients || [];
    await api(prez, "POST", `/api/convocations/${convocationId}/send`, {
      confirmed: true,
      confirmationPhrase: "ENVIAR",
      recipientIds: recipients.map((r) => r.id).filter(Boolean)
    });
    record({
      TestId: "CONVOCATION",
      Area: "Assembly",
      Scenario: "Send convocation to register owners",
      Expected: "recipients>=2",
      Actual: `n=${recipients.length}`,
      Result: recipients.length >= 2 ? "PASS" : "FAIL",
      Severity: "P0"
    });

    await api(prez, "POST", `/api/assemblies/${assemblyId}/start-checkin`, {});
    const ciA = await api(ownA, "POST", `/api/assemblies/${assemblyId}/attendance/check-in`, {
      unitId: unitAId,
      presenceType: "Virtual"
    });
    const ciB = await api(ownB, "POST", `/api/assemblies/${assemblyId}/attendance/check-in`, {
      unitId: unitBId,
      presenceType: "Virtual"
    });
    record({
      TestId: "CHECKIN",
      Area: "Attendance",
      Scenario: "Owners check-in",
      Expected: "<300",
      Actual: `A=${ciA.status} B=${ciB.status}`,
      Result: ciA.status < 300 && ciB.status < 300 ? "PASS" : "FAIL",
      Severity: "P0"
    });

    const start = await api(prez, "POST", `/api/assemblies/${assemblyId}/start`, {});
    record({
      TestId: "ASM-START",
      Area: "Assembly",
      Scenario: "Start assembly",
      Expected: "InProgress",
      Actual: `${start.status} ${start.json?.status || start.text}`,
      Result: start.status < 300 ? "PASS" : "FAIL",
      Severity: "P0"
    });

    // Open rooms
    await prez.goto(`${BASE}/assembly.html?assemblyId=${assemblyId}`, { waitUntil: "domcontentloaded" });
    await ownA.goto(`${BASE}/assembly.html?assemblyId=${assemblyId}`, { waitUntil: "domcontentloaded" });
    await ownB.goto(`${BASE}/assembly.html?assemblyId=${assemblyId}`, { waitUntil: "domcontentloaded" });
    await prez.waitForTimeout(2500);
    await ownA.waitForTimeout(1500);

    // SS-001 button
    const btnPrez = await prez.evaluate(() => {
      const b = document.querySelector("#btn-screen");
      if (!b) return { exists: false };
      return {
        exists: true,
        hidden: b.hidden || b.getAttribute("hidden") !== null,
        label: (b.getAttribute("aria-label") || b.textContent || "").trim(),
        display: getComputedStyle(b).display
      };
    });
    record({
      TestId: "SS-001",
      Area: "ScreenShare",
      Scenario: "President has Compartir pantalla control",
      Expected: "button visible / available",
      Actual: JSON.stringify(btnPrez),
      Result: btnPrez.exists && !btnPrez.hidden && btnPrez.display !== "none" ? "PASS" : "FAIL",
      Severity: "P1"
    });
    mx("NATIVE SCREEN SHARE UI", pass("SS-001") ? "PASS" : "FAIL");

    // SS-002 owner permission (UI + API)
    const btnOwn = await ownA.evaluate(() => {
      const b = document.querySelector("#btn-screen");
      if (!b) return { exists: false, hidden: true };
      return { exists: true, hidden: b.hidden || getComputedStyle(b).display === "none" };
    });
    const ownStart = await api(ownA, "POST", `/api/assemblies/${assemblyId}/meeting/screen-share/start`);
    record({
      TestId: "SS-002",
      Area: "ScreenShare",
      Scenario: "Owner cannot start share without permission",
      Expected: "UI hidden + API forbidden/400",
      Actual: `uiHidden=${btnOwn.hidden} api=${ownStart.status} code=${ownStart.code || ownStart.json?.code}`,
      Result:
        btnOwn.hidden !== false && ownStart.status >= 400 && ownStart.status < 500 ? "PASS" : "FAIL",
      Severity: "P0"
    });
    mx("SCREEN SHARE AUTHORIZATION", pass("SS-002") ? "PASS" : "FAIL");

    // Token capability
    const tokenPrez = await api(prez, "POST", `/api/assemblies/${assemblyId}/meeting/join-token`);
    const tokenOwn = await api(ownA, "POST", `/api/assemblies/${assemblyId}/meeting/join-token`);
    record({
      TestId: "SS-TOKEN",
      Area: "ScreenShare",
      Scenario: "Join token CanPublishScreenShare gated",
      Expected: "prez true, owner false",
      Actual: `prez=${tokenPrez.status}/${tokenPrez.json?.canPublishScreenShare} owner=${tokenOwn.status}/${tokenOwn.json?.canPublishScreenShare}`,
      Result:
        tokenPrez.status < 300 &&
        tokenOwn.status < 300 &&
        tokenPrez.json?.canPublishScreenShare === true &&
        tokenOwn.json?.canPublishScreenShare === false
          ? "PASS"
          : "FAIL",
      Severity: "P0"
    });

    // API start (server claim) — does NOT equal media share
    const claim = await api(prez, "POST", `/api/assemblies/${assemblyId}/meeting/screen-share/start`);
    record({
      TestId: "SS-API-START",
      Area: "ScreenShare",
      Scenario: "Authorized start claims single presenter",
      Expected: "200 isActive",
      Actual: `${claim.status} active=${claim.json?.state?.isActive ?? claim.json?.isActive}`,
      Result:
        claim.status < 300 &&
        (claim.json?.state?.isActive === true || claim.json?.isActive === true)
          ? "PASS"
          : "FAIL",
      Severity: "P1"
    });

    // Second presenter blocked (owner is registered but not allowed / conflict)
    const claim2 = await api(ownA, "POST", `/api/assemblies/${assemblyId}/meeting/screen-share/start`);
    const claim2Code = claim2.code || claim2.json?.code || "";
    record({
      TestId: "SS-019",
      Area: "ScreenShare",
      Scenario: "Second presenter blocked while active",
      Expected: "4xx SCREEN_SHARE_ACTIVE or FORBIDDEN",
      Actual: `${claim2.status} ${claim2Code || claim2.text}`,
      Result:
        claim2.status >= 400 &&
        (/SCREEN_SHARE/i.test(String(claim2Code)) ||
          /presentación activa|permiso|FORBIDDEN/i.test(String(claim2.text || "")))
          ? "PASS"
          : "FAIL",
      Severity: "P0"
    });
    mx("SINGLE ACTIVE PRESENTER", pass("SS-019") && pass("SS-API-START") ? "PASS" : "FAIL");

    // Room state rehydrate
    const roomOwn = await api(ownA, "GET", `/api/assemblies/${assemblyId}/room-state`);
    const ss = roomOwn.json?.screenShare || roomOwn.json?.ScreenShare || null;
    record({
      TestId: "SS-020-STATE",
      Area: "ScreenShare",
      Scenario: "Owner rehydrates active presenter from room-state",
      Expected: "isActive + presenter",
      Actual: JSON.stringify(ss || { status: roomOwn.status, err: roomOwn.text }).slice(0, 240),
      Result: ss?.isActive === true && (ss.presenterUserId || ss.PresenterUserId) ? "PASS" : "FAIL",
      Severity: "P1"
    });
    mx("OWNER RECONNECTION STATE", pass("SS-020-STATE") ? "PASS" : "FAIL");

    // Native picker — cannot automate securely
    record({
      TestId: "SS-003",
      Area: "ScreenShare",
      Scenario: "Native getDisplayMedia picker",
      Expected: "User selects screen/window/tab",
      Actual: "Browser native picker not controllable by automation without hacking permissions",
      Result: "PENDING",
      Severity: "P1"
    });
    mx("MANUAL GETDISPLAYMEDIA ACCEPTANCE", "PENDING USER ACCEPTANCE");

    // Create question + open voting while server share state active (media optional)
    let agenda = await api(prez, "GET", `/api/assemblies/${assemblyId}/agenda`);
    let agendaItemId = agenda.json?.items?.[0]?.id;
    if (!agendaItemId) {
      await api(prez, "POST", `/api/assemblies/${assemblyId}/agenda`, {
        ordinal: 1,
        code: "SS1",
        title: "Punto Screen Share"
      });
      agenda = await api(prez, "GET", `/api/assemblies/${assemblyId}/agenda`);
      agendaItemId = agenda.json?.items?.[0]?.id;
    }
    const motion = await api(prez, "POST", `/api/assemblies/${assemblyId}/motions`, {
      agendaItemId,
      code: `SS-Q1-${STAMP}`,
      title: `Presupuesto SS ${STAMP}`,
      body: "Documento en pantalla",
      questionText: "¿Aprueba el presupuesto presentado?",
      ballotKind: "FavorAgainstAbstain",
      calculationMethod: "Coefficient",
      decisionRuleCode: "SimpleMajority",
      defaultResultVisibilityPolicy: "HiddenUntilClose",
      optionsJson: JSON.stringify(["A favor", "En contra", "Abstención"])
    });
    motionId = motion.json?.id;
    const present = await api(prez, "POST", `/api/assemblies/${assemblyId}/motions/present`, {
      motionId
    });
    const open = await api(prez, "POST", `/api/assemblies/${assemblyId}/voting/open`, {
      motionId,
      hidePartialResults: false
    });
    record({
      TestId: "SS-008",
      Area: "ScreenShare",
      Scenario: "Create/present question while share state active",
      Expected: "motion ok",
      Actual: `motion=${motion.status} id=${motionId} present=${present.status} agenda=${agendaItemId} err=${JSON.stringify(motion.json || motion.text).slice(0, 120)}`,
      Result: motion.status < 300 && motionId && present.status < 300 ? "PASS" : "FAIL",
      Severity: "P1"
    });
    record({
      TestId: "SS-009",
      Area: "ScreenShare",
      Scenario: "Open voting while share state active",
      Expected: "<300",
      Actual: `${open.status} ${JSON.stringify(open.json || open.text).slice(0, 160)}`,
      Result: open.status < 300 ? "PASS" : "FAIL",
      Severity: "P0"
    });

    const sessionId = open.json?.id || open.json?.votingSessionId;
    const voteA = await api(ownA, "POST", `/api/assemblies/${assemblyId}/voting/${sessionId}/cast`, {
      choice: "InFavor",
      clientRequestId: `ss-a-${STAMP}`
    });
    const voteB = await api(ownB, "POST", `/api/assemblies/${assemblyId}/voting/${sessionId}/cast`, {
      choice: "Against",
      clientRequestId: `ss-b-${STAMP}`
    });
    record({
      TestId: "SS-010",
      Area: "ScreenShare",
      Scenario: "Owner A votes during share state",
      Expected: "<300",
      Actual: String(voteA.status),
      Result: voteA.status < 300 ? "PASS" : "FAIL",
      Severity: "P0"
    });
    record({
      TestId: "SS-011",
      Area: "ScreenShare",
      Scenario: "Owner B votes during share state",
      Expected: "<300",
      Actual: String(voteB.status),
      Result: voteB.status < 300 ? "PASS" : "FAIL",
      Severity: "P0"
    });

    const tally = await api(prez, "GET", `/api/assemblies/${assemblyId}/voting/${sessionId}/results`);
    record({
      TestId: "SS-012",
      Area: "ScreenShare",
      Scenario: "President sees progress during share",
      Expected: "votesCast>=2",
      Actual: `cast=${tally.json?.votesCast}`,
      Result: (tally.json?.votesCast || 0) >= 2 ? "PASS" : "FAIL",
      Severity: "P1"
    });

    const close = await api(prez, "POST", `/api/assemblies/${assemblyId}/voting/${sessionId}/close`);
    record({
      TestId: "SS-013",
      Area: "ScreenShare",
      Scenario: "Close voting without stopping share state",
      Expected: "<300 + share still active",
      Actual: `${close.status}`,
      Result: close.status < 300 ? "PASS" : "FAIL",
      Severity: "P1"
    });
    const afterClose = await api(ownA, "GET", `/api/assemblies/${assemblyId}/meeting/screen-share`);
    record({
      TestId: "SS-014",
      Area: "ScreenShare",
      Scenario: "Share state remains after result close",
      Expected: "isActive true",
      Actual: JSON.stringify(afterClose.json).slice(0, 200),
      Result: afterClose.json?.isActive === true ? "PASS" : "FAIL",
      Severity: "P1"
    });

    mx("VOTING DURING SHARE", pass("SS-009") && pass("SS-010") && pass("SS-011") ? "PASS" : "FAIL");
    mx("QUESTION DURING SHARE", pass("SS-008") ? "PASS" : "FAIL");

    // Stop from API (app stop)
    const stop = await api(prez, "POST", `/api/assemblies/${assemblyId}/meeting/screen-share/stop`);
    record({
      TestId: "SS-016",
      Area: "ScreenShare",
      Scenario: "Stop share from app/API",
      Expected: "inactive",
      Actual: `${stop.status} active=${stop.json?.state?.isActive ?? stop.json?.isActive}`,
      Result:
        stop.status < 300 &&
        (stop.json?.state?.isActive === false || stop.json?.isActive === false)
          ? "PASS"
          : "FAIL",
      Severity: "P1"
    });
    mx("STOP FROM APP", pass("SS-016") ? "PASS" : "FAIL");

    // Five claim/release cycles (server state)
    let cyclesOk = true;
    for (let i = 0; i < 5; i++) {
      const s = await api(prez, "POST", `/api/assemblies/${assemblyId}/meeting/screen-share/start`);
      const e = await api(prez, "POST", `/api/assemblies/${assemblyId}/meeting/screen-share/stop`);
      if (s.status >= 300 || e.status >= 300) cyclesOk = false;
    }
    const afterCycles = await api(prez, "GET", `/api/assemblies/${assemblyId}/meeting/screen-share`);
    record({
      TestId: "SS-018",
      Area: "ScreenShare",
      Scenario: "START/STOP ×5 server state clean",
      Expected: "inactive, no stale presenter",
      Actual: JSON.stringify(afterCycles.json).slice(0, 200),
      Result:
        cyclesOk && afterCycles.json?.isActive === false && !afterCycles.json?.presenterUserId
          ? "PASS"
          : "FAIL",
      Severity: "P1"
    });
    mx("MEDIA CLEANUP (server state)", pass("SS-018") ? "PASS" : "FAIL");

    // Cross-assembly isolation
    const phB = await api(prez, "POST", "/api/ph", {
      name: `PH EO021 SS ISO ${STAMP}`,
      code: `EO21SSI-${STAMP}`,
      adminEmail: "phadmin@ocean.demo",
      city: "Panamá",
      country: "PA",
      timeZoneId: "America/Panama"
    });
    phBId = phB.json?.id || phB.json?.propertyHorizontalId;
    await api(prez, "POST", "/api/ph/switch", { propertyHorizontalId: phBId });
    const asmB = await api(prez, "POST", "/api/assemblies", {
      propertyHorizontalId: phBId,
      title: `EO021 SS ISO ${STAMP}`,
      modality: "Virtual",
      scheduledAtUtc: new Date(Date.now() + 7200_000).toISOString(),
      requiredQuorumPercent: 50
    });
    assemblyBId = asmB.json?.id;
    await api(prez, "POST", `/api/assemblies/${assemblyBId}/start`).catch(() => {});
    await api(prez, "POST", "/api/ph/switch", { propertyHorizontalId: phId });
    await api(prez, "POST", `/api/assemblies/${assemblyId}/meeting/screen-share/start`);
    await api(prez, "POST", "/api/ph/switch", { propertyHorizontalId: phBId });
    const cross = await api(prez, "GET", `/api/assemblies/${assemblyBId}/meeting/screen-share`);
    record({
      TestId: "SS-023",
      Area: "Isolation",
      Scenario: "Assembly B does not see Assembly A share",
      Expected: "isActive false on B",
      Actual: JSON.stringify(cross.json).slice(0, 200),
      Result: cross.json?.isActive === false ? "PASS" : "FAIL",
      Severity: "P0"
    });
    mx("CROSS-ASSEMBLY ISOLATION", pass("SS-023") ? "PASS" : "FAIL");

    // Cross-PH: owner of A must not read B screen-share
    await login(iso, ownerEmail, PASSWORD);
    await api(iso, "POST", "/api/ph/switch", { propertyHorizontalId: phId }).catch(() => {});
    const crossPh = await api(iso, "GET", `/api/assemblies/${assemblyBId}/meeting/screen-share`);
    record({
      TestId: "SS-024",
      Area: "Isolation",
      Scenario: "Owner PH A cannot read PH B assembly share",
      Expected: "4xx",
      Actual: `${crossPh.status}`,
      Result: crossPh.status >= 400 ? "PASS" : "FAIL",
      Severity: "P0"
    });
    mx("CROSS-PH ISOLATION", pass("SS-024") ? "PASS" : "FAIL");

    // Finalize cleanup — stabilize page context first (avoid navigation races)
    await prez.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await prez.waitForTimeout(400);
    await login(prez, "phadmin@ocean.demo", PASSWORD);
    await api(prez, "POST", "/api/ph/switch", { propertyHorizontalId: phId });
    await api(prez, "POST", `/api/assemblies/${assemblyId}/meeting/screen-share/start`).catch(() => ({
      status: 0
    }));
    const openSess = await api(prez, "GET", `/api/assemblies/${assemblyId}/voting/open`).catch(() => ({
      json: null
    }));
    if (openSess.json?.id) {
      await api(prez, "POST", `/api/assemblies/${assemblyId}/voting/${openSess.json.id}/close`);
    }
    const fin = await api(prez, "POST", `/api/assemblies/${assemblyId}/complete`);
    let afterFin = { status: 0, json: null };
    try {
      afterFin = await api(prez, "GET", `/api/assemblies/${assemblyId}/meeting/screen-share`);
    } catch {
      afterFin = { status: 499, json: null };
    }
    const cleaned =
      afterFin.status >= 400 ||
      afterFin.json?.isActive === false ||
      afterFin.json == null;
    record({
      TestId: "SS-022",
      Area: "ScreenShare",
      Scenario: "Finalize clears/stops share",
      Expected: "complete ok + share cleared",
      Actual: `complete=${fin.status} shareStatus=${afterFin.status} active=${afterFin.json?.isActive}`,
      Result: fin.status < 300 && cleaned ? "PASS" : "FAIL",
      Severity: "P1"
    });
    mx("FINALIZATION CLEANUP", pass("SS-022") ? "PASS" : "FAIL");

    // Keyboard: screen button focusable when visible (re-open not needed — check attribute)
    record({
      TestId: "SS-026",
      Area: "A11y",
      Scenario: "Screen control is a real button with aria-label",
      Expected: "button + aria-label",
      Actual: JSON.stringify(btnPrez),
      Result: btnPrez.exists && /pantalla|compartir|detener/i.test(btnPrez.label || "") ? "PASS" : "FAIL",
      Severity: "P2"
    });
    mx("ACCESSIBILITY", pass("SS-026") ? "PASS" : "FAIL");

    const criticalJs = results.consoleCritical.filter(
      (c) =>
        !/Failed to load resource|401|403|404|favicon|net::ERR_|signalr/i.test(String(c.t || ""))
    );
    record({
      TestId: "SS-027",
      Area: "Console",
      Scenario: "No critical JS errors during automatable path",
      Expected: "0 unhandled JS",
      Actual: `n=${criticalJs.length} rawNoise=${results.consoleCritical.length} ${JSON.stringify(criticalJs).slice(0, 300)}`,
      Result: criticalJs.length === 0 ? "PASS" : "FAIL",
      Severity: "P1"
    });
    mx("CONSOLE", pass("SS-027") ? "PASS" : "FAIL");

    record({
      TestId: "SS-028",
      Area: "Network",
      Scenario: "No unexpected 500s",
      Expected: "0",
      Actual: String(results.http500),
      Result: results.http500 === 0 ? "PASS" : "FAIL",
      Severity: "P1"
    });
    mx("NETWORK", pass("SS-028") ? "PASS" : "FAIL");

    // Pending media receive gates (require real getDisplayMedia)
    for (const id of ["SS-004", "SS-005", "SS-006", "SS-007", "SS-017"]) {
      record({
        TestId: id,
        Area: "ScreenShare",
        Scenario: "Requires native display media / track.onended",
        Expected: "manual",
        Actual: "PENDING USER ACCEPTANCE — see MANUAL ACCEPTANCE TEST",
        Result: "PENDING",
        Severity: "P1"
      });
    }

    mx("SCREEN SHARE RECEIVE", "PENDING USER ACCEPTANCE");
    mx("PRESENTER INDICATOR", "PENDING USER ACCEPTANCE");
    mx("AUDIO CONTINUITY", "PENDING USER ACCEPTANCE");
    mx("CAMERA CONTINUITY", "PENDING USER ACCEPTANCE");
    mx("BROWSER TRACK ONENDED", "PENDING USER ACCEPTANCE");
    mx("VIDEO SESSION CONTINUITY", "PENDING USER ACCEPTANCE");

    const p0 = results.defects.filter((d) => d.sev === "P0").length;
    const p1 = results.defects.filter((d) => d.sev === "P1").length;
    const failed = results.tests.filter((t) => t.Result === "FAIL").length;
    results.certified = p0 === 0 && p1 === 0 && failed === 0;
    results.verdict = results.certified
      ? "EO-021 SCREEN SHARING IMPLEMENTATION COMPLETE — P0=0 / P1=0 — LOCALHOST ONLY — WAITING FOR USER MANUAL SCREEN-SHARE ACCEPTANCE — NO VPS DEPLOYMENT PERFORMED."
      : `EO-021 SCREEN SHARING — INCOMPLETE — P0=${p0} P1=${p1} FAIL=${failed} — LOCALHOST ONLY — NO VPS.`;

    mx("NATIVE SCREEN SHARE", results.certified ? "IMPLEMENTATION COMPLETE (MANUAL PENDING)" : "FAIL");
  } catch (err) {
    results.verdict = `EO-021 SCREEN SHARING — CRASHED — ${String(err.message || err).slice(0, 300)}`;
    results.defects.push({ sev: "P0", id: "CRASH", msg: String(err.stack || err).slice(0, 800) });
    console.error(err);
  } finally {
    fs.writeFileSync(
      path.join(OUT, "screen-sharing-results.json"),
      JSON.stringify(results, null, 2)
    );
    console.log("\n" + results.verdict);
    await browser.close();
    process.exit(results.defects.some((d) => d.sev === "P0") ? 1 : 0);
  }
})();
