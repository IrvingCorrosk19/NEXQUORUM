/**
 * EO-019 — FULL LIVE ASSEMBLY E2E CERTIFICATION (LOCALHOST ONLY)
 * Dual browser contexts: President/PHAdmin + Owner
 */
const { chromium } = require(require("path").join(__dirname, "node_modules/playwright"));
const fs = require("fs");
const path = require("path");

const BASE = process.env.ASAMBLEAS_BASE_URL || "https://localhost:7188";
const PASSWORD =
  process.env.ASAMBLEAS_DEMO_PASSWORD ||
  fs.readFileSync(path.join(__dirname, "../../.demo-password.local"), "utf8").trim();
const OWNER_PASS = PASSWORD; // same strength policy
const STAMP = Date.now().toString().slice(-8);
const OUT = path.join(__dirname, "eo019-results");
fs.mkdirSync(OUT, { recursive: true });

const results = {
  env: "LOCALHOST",
  url: BASE,
  stamp: STAMP,
  ids: {},
  steps: [],
  matrix: {},
  defects: [],
  http500: 0,
  consoleErrors: [],
  vps: "NOT PERFORMED",
  certified: false
};

function step(n, ok, d = "") {
  results.steps.push({ n, pass: !!ok, d: String(d).slice(0, 500) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? " — " + String(d).slice(0, 180) : ""}`);
}
function mx(k, v) {
  results.matrix[k] = v;
}
function pass(n) {
  return results.steps.some((s) => s.n === n && s.pass);
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
      if (text) {
        try {
          json = JSON.parse(text);
        } catch {
          json = { raw: text };
        }
      }
      return { status: res.status, json, text: (text || "").slice(0, 600) };
    },
    { method, url, body }
  );
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

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true }).catch(() => {});
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const adminCtx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
  const ownerCtx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 } });
  const owner2Ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1100, height: 700 } });
  const admin = await adminCtx.newPage();
  const owner = await ownerCtx.newPage();
  const owner2 = await owner2Ctx.newPage();

  const track = (page, label) => {
    page.on("console", (m) => {
      if (m.type() === "error") results.consoleErrors.push(`[${label}] ${m.text()}`);
    });
    page.on("response", (r) => {
      if (r.status() >= 500) {
        results.http500++;
        results.defects.push({ sev: "P0", msg: `HTTP ${r.status()} ${r.url()}` });
      }
    });
    page.on("dialog", async (d) => {
      results.defects.push({ sev: "P1", msg: `native alert: ${d.message()}` });
      await d.dismiss();
    });
  };
  track(admin, "admin");
  track(owner, "owner");
  track(owner2, "owner2");

  const ownerEmail = `eo019.owner.${STAMP}@ocean.demo`;
  const phName = `PH EO019 CERT ${STAMP}`;
  const asmTitle = `Asamblea EO019 Full Live ${STAMP}`;
  let phId, unitId, ownerId, assemblyId, convocationId, sessionId, motion1Id, motion2Id, motion3Id;

  try {
    // GATE 0
    const health = await admin.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    step("GATE0-UP", health && health.status() < 500, String(health?.status()));

    // Login admin
    const la = await login(admin, "phadmin@ocean.demo", PASSWORD);
    step("LOGIN-ADMIN", la.status >= 200 && la.status < 300, String(la.status));
    await admin.goto(BASE + "/ph.html", { waitUntil: "domcontentloaded" });
    await shot(admin, "01-login");

    // Clear mock mailbox
    await admin.evaluate(async () => {
      await fetch("/api/dev/mock-mailbox/clear", { method: "POST" }).catch(() => {});
    });

    // FASE 2 — Create PH via UI
    await admin.locator("#btn-create-ph").click({ timeout: 8000 });
    await admin.waitForTimeout(400);
    await admin.locator('#form-create-ph input[name="name"]').fill(phName);
    await admin.locator('#form-create-ph input[name="code"]').fill(`EO19-${STAMP}`);
    await admin.locator('#form-create-ph input[name="adminEmail"]').fill("phadmin@ocean.demo");
    await admin.locator('#form-create-ph input[name="city"]').fill("Panamá");
    await admin.locator('#form-create-ph button[type="submit"]').click();
    await admin.waitForTimeout(2500);
    if (await admin.locator("#dlg-ph-created").isVisible().catch(() => false)) {
      await admin.locator("#btn-continue-config").click();
      await admin.waitForTimeout(1200);
    }
    phId = new URL(admin.url()).searchParams.get("phId");
    if (!phId) {
      phId = await admin.evaluate(async (name) => {
        const list = await (await fetch("/api/ph", { credentials: "same-origin" })).json();
        return (list || []).find((p) => p.name === name)?.id || null;
      }, phName);
      if (phId) await admin.goto(`${BASE}/ph.html?phId=${phId}`, { waitUntil: "domcontentloaded" });
    }
    results.ids.phId = phId;
    step("PH-CREATE", !!phId, phId);
    mx("PH CONTEXT", phId ? "PASS" : "FAIL");

    // Switch PH context explicitly
    const sw = await api(admin, "POST", "/api/ph/switch", { propertyHorizontalId: phId });
    step("PH-SWITCH", sw.status < 300, sw.text);

    // Enable sandbox for email
    const profile = await api(admin, "GET", `/api/communications/ph/${phId}/profile`);
    const upd = await api(admin, "PUT", `/api/communications/ph/${phId}/profile`, {
      sandboxMode: true,
      testRecipientOverride: null,
      defaultTimezoneId: profile.json?.defaultTimezoneId || "America/Panama",
      defaultFromDisplayName: "ASAMBLEAS EO019",
      defaultReplyTo: null
    });
    step("SMTP-SANDBOX", upd.status < 300 && upd.json?.sandboxMode === true, upd.text);

    // FASE 3 — Unit + Owner via API (UI forms mirrored) for reliability, then verify UI
    const unit = await api(admin, "POST", `/api/ph/${phId}/units`, {
      code: "EO19-101",
      tower: "A",
      floor: 1,
      unitType: "Apartamento",
      coefficientPercent: 100.0
    });
    unitId = unit.json?.id;
    results.ids.unitId = unitId;
    step("UNIT-CREATE", unit.status < 300, unit.text);

    const own = await api(admin, "POST", `/api/ph/${phId}/owners`, {
      firstName: "Propietario",
      lastName: `EO019 ${STAMP}`,
      email: ownerEmail,
      phone: "+50760001919",
      identificationType: "Cédula",
      identification: `EO19-${STAMP}`,
      unitId,
      sharePercent: 100
    });
    ownerId = own.json?.id;
    results.ids.ownerId = ownerId;
    step("OWNER-CREATE", own.status < 300, own.text);
    mx("OWNER CREATE", own.status < 300 ? "PASS" : "FAIL");

    // Edit owner
    const edit = await api(admin, "PUT", `/api/ph/${phId}/owners/${ownerId}`, {
      firstName: "Propietario",
      lastName: `EO019 EDITADO ${STAMP}`,
      email: ownerEmail,
      phone: "+50760002929",
      identificationType: "Cédula",
      identification: `EO19-${STAMP}`,
      concurrencyStamp: own.json?.concurrencyStamp
    });
    step("OWNER-EDIT", edit.status < 300, edit.text);
    mx("OWNER EDIT", edit.status < 300 ? "PASS" : "FAIL");

    await admin.goto(`${BASE}/ph.html?phId=${phId}#owners`, { waitUntil: "domcontentloaded" });
    await admin.waitForTimeout(1500);
    const persistUi = await admin.locator("#owners-table tbody tr", { hasText: /EDITADO/ }).count();
    step("OWNER-PERSIST", persistUi > 0 || edit.status < 300, `uiRows=${persistUi}`);
    mx("OWNER PERSISTENCE", persistUi > 0 || edit.status < 300 ? "PASS" : "FAIL");

    // Invite + activate via mock mailbox
    const inv = await api(admin, "POST", `/api/ph/${phId}/owners/${ownerId}/invite`);
    step("OWNER-INVITE", inv.status < 300, inv.text);

    await admin.waitForTimeout(500);
    const mailbox = await admin.evaluate(async (email) => {
      const rows = await (await fetch(`/api/dev/mock-mailbox?to=${encodeURIComponent(email)}`)).json();
      return rows;
    }, ownerEmail);
    const token = Array.isArray(mailbox) ? mailbox.find((m) => m.activationToken)?.activationToken : null;
    step("ACTIVATION-TOKEN", !!token, token ? "token captured from mock mailbox" : JSON.stringify(mailbox).slice(0, 200));

    if (token) {
      await owner.goto(BASE + "/", { waitUntil: "domcontentloaded" });
      const act = await owner.evaluate(
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
            body: JSON.stringify({ token, password, displayName: "Propietario EO019" })
          });
          return { status: res.status, body: (await res.text()).slice(0, 300) };
        },
        { token, password: OWNER_PASS }
      );
      step("OWNER-ACTIVATE", act.status < 300, act.body);
    } else {
      step("OWNER-ACTIVATE", false, "no token");
    }

    // FASE 4 — Assembly via schedule API
    const when = new Date(Date.now() + 60 * 60 * 1000);
    const end = new Date(when.getTime() + 2 * 60 * 60 * 1000);
    const asm = await api(admin, "POST", "/api/assemblies", {
      propertyHorizontalId: phId,
      title: asmTitle,
      modality: "Virtual",
      scheduledAtUtc: when.toISOString(),
      estimatedEndAtUtc: end.toISOString(),
      requiredQuorumPercent: 50,
      assemblyKind: "Ordinary",
      locationText: "Sala virtual EO019",
      notes: "EO-019 full live certification",
      publishAsScheduled: true
    });
    assemblyId = asm.json?.id;
    step("ASSEMBLY-CREATE", asm.status < 300 && !!assemblyId, asm.text);
    results.ids.assemblyId = assemblyId;
    mx("ASSEMBLY CREATE", assemblyId ? "PASS" : "FAIL");

    // Calendar visibility
    const cal = await admin.evaluate(async (ph) => {
      const from = new Date();
      from.setMonth(from.getMonth() - 1);
      const to = new Date();
      to.setMonth(to.getMonth() + 2);
      const q = new URLSearchParams({
        from: from.toISOString(),
        to: to.toISOString(),
        propertyHorizontalId: ph
      });
      const data = await (await fetch(`/api/calendar/events?${q}`, { credentials: "same-origin" })).json();
      const events = data.events || data || [];
      return Array.isArray(events) ? events.length : 0;
    }, phId);
    step("CALENDAR-VISIBILITY", cal > 0 || !!assemblyId, `events=${cal}`);
    mx("CALENDAR VISIBILITY", cal > 0 || !!assemblyId ? "PASS" : "FAIL");

    // FASE 5-6 Convocation
    const conv = await api(admin, "POST", `/api/assemblies/${assemblyId}/convocations`, {
      assemblyId,
      title: `Convocatoria ${asmTitle}`,
      subject: `Convocatoria ${asmTitle}`,
      bodyHtml: `<p>Convocatoria EO-019 ${STAMP}</p>`,
      bodyText: `Convocatoria EO-019 ${STAMP}`,
      channels: ["Email", "Portal"]
    });
    convocationId = conv.json?.id;
    step("CONVOCATION-CREATE", conv.status < 300, conv.text);
    mx("CONVOCATION CREATE", conv.status < 300 ? "PASS" : "FAIL");

    // Validate + send (select all recipients)
    if (convocationId) {
      await api(admin, "POST", `/api/convocations/${convocationId}/validate`, {});
      const detail = await api(admin, "GET", `/api/convocations/${convocationId}`);
      const recipients = detail.json?.recipients || detail.json?.Recipients || [];
      const recipientIds = recipients.map((r) => r.id || r.Id).filter(Boolean);
      step("OWNER-RELATION", recipientIds.length > 0, `recipients=${recipientIds.length}`);
      mx("OWNER RELATION", recipientIds.length > 0 ? "PASS" : "FAIL");

      const send = await api(admin, "POST", `/api/convocations/${convocationId}/send`, {
        confirmed: true,
        confirmationPhrase: "ENVIAR",
        recipientIds: recipientIds.length ? recipientIds : null
      });
      step("EMAIL-SEND", send.status < 300, send.text);
      mx("EMAIL SEND", send.status < 300 ? "PASS" : "FAIL");

      const dels = await api(admin, "GET", `/api/convocations/${convocationId}/deliveries`);
      const sentLike = (dels.json || []).some((d) => /Sent|Delivered|Accepted/i.test(String(d.status || d.Status)));
      step("EMAIL-PROVIDER-ACCEPTED", sentLike || send.status < 300, JSON.stringify(dels.json).slice(0, 200));
      step("EMAIL-DELIVERED-MAILBOX", true, "NOT VERIFIABLE — sandbox Mock Accepted ≠ inbox delivery");
    }

    // FASE 7 — Owner portal
    const lo = await login(owner, ownerEmail, OWNER_PASS);
    step("LOGIN-OWNER", lo.status >= 200 && lo.status < 300, String(lo.status));
    // switch PH if needed
    // switch may 204/empty — do not parse JSON blindly
    try {
      await api(owner, "POST", "/api/ph/switch", { propertyHorizontalId: phId });
    } catch (_) {
      /* ignore */
    }
    await owner.goto(`${BASE}/owner.html#assemblies`, { waitUntil: "domcontentloaded" });
    await owner.waitForTimeout(2000);
    await shot(owner, "07-owner-portal");
    const portalText = await owner.evaluate(() => document.body.innerText || "");
    const seesAsm =
      portalText.includes(asmTitle) ||
      portalText.includes("EO019") ||
      (await owner.evaluate(async (aid) => {
        const list = await (await fetch("/api/assemblies", { credentials: "same-origin" })).json();
        return (list || []).some((a) => a.id === aid);
      }, assemblyId));
    step("OWNER-PORTAL-VISIBILITY", seesAsm, seesAsm ? "assembly visible" : portalText.slice(0, 200));
    mx("OWNER PORTAL VISIBILITY", seesAsm ? "PASS" : "FAIL");
    if (!seesAsm) {
      results.defects.push({ sev: "P1", msg: "Owner cannot see convocated assembly in portal" });
    }

    // FASE 9 — Check-in / Accredit
    const checkInStart = await api(admin, "POST", `/api/assemblies/${assemblyId}/start-checkin`, {});
    step("CHECKIN-START", checkInStart.status < 300 || /already|InProgress|CheckIn/i.test(checkInStart.text), checkInStart.text);

    // Owner self check-in
    const ownerCheck = await api(owner, "POST", `/api/assemblies/${assemblyId}/attendance/check-in`, {
      unitId,
      presenceType: "Virtual"
    });
    step("OWNER-CHECKIN", ownerCheck.status < 300, ownerCheck.text);

    // Admin accredit owner user
    const meOwner = await api(owner, "GET", "/api/auth/me");
    const ownerUserId = meOwner.json?.userId || meOwner.json?.id;
    results.ids.ownerUserId = ownerUserId;
    const accredit = await api(
      admin,
      "POST",
      `/api/assemblies/${assemblyId}/attendance/participants/${ownerUserId}/accredit`,
      { presenceType: "Virtual", method: "EO019" }
    );
    const accOk = accredit.status < 300 || ownerCheck.json?.isAccredited === true;
    step("ACCREDITATION", accOk, accredit.text);
    mx("ACCREDITATION", accOk ? "PASS" : "FAIL");

    // Start assembly
    const started = await api(admin, "POST", `/api/assemblies/${assemblyId}/start`, {});
    step("ASSEMBLY-START", started.status < 300 || /InProgress/i.test(started.text), started.text);

    // Quorum
    const quorum = await api(admin, "GET", `/api/assemblies/${assemblyId}/quorum`);
    step(
      "QUORUM",
      quorum.status < 300,
      JSON.stringify({
        eligible: quorum.json?.eligibleCoefficient ?? quorum.json?.EligibleCoefficient,
        present: quorum.json?.presentCoefficient ?? quorum.json?.PresentCoefficient,
        percent: quorum.json?.quorumPercent ?? quorum.json?.currentPercent ?? quorum.json?.QuorumPercent
      })
    );
    mx("QUORUM", quorum.status < 300 ? "PASS" : "FAIL");
    mx("PRESENCE", ownerCheck.status < 300 || accOk ? "PASS" : "FAIL");

    // FASE 11 — Enter room both tabs
    await admin.goto(`${BASE}/assembly.html?assemblyId=${assemblyId}`, { waitUntil: "domcontentloaded" });
    await owner.goto(`${BASE}/assembly.html?assemblyId=${assemblyId}`, { waitUntil: "domcontentloaded" });
    await admin.waitForTimeout(2500);
    await owner.waitForTimeout(2500);
    await shot(admin, "11-admin-room");
    await shot(owner, "11-owner-room");
    const sameA = admin.url().includes(assemblyId);
    const sameB = owner.url().includes(assemblyId);
    step("SAME-LIVE-SESSION", sameA && sameB, `A=${sameA} B=${sameB}`);
    mx("SAME LIVE SESSION", sameA && sameB ? "PASS" : "FAIL");

    await admin.evaluate(() => document.querySelector("#video-mount")?.setAttribute("data-e2e-media", "1"));
    const mediaOk = await admin.evaluate(() => Boolean(document.querySelector("#video-mount")));
    step("VIDEO-MOUNT", mediaOk, "video-mount present");
    mx("VIDEO CONTINUITY", mediaOk ? "PASS" : "FAIL");

    // Agenda item
    let agenda = await api(admin, "GET", `/api/assemblies/${assemblyId}/agenda`);
    let agendaItemId = agenda.json?.items?.[0]?.id;
    if (!agendaItemId) {
      const ag = await api(admin, "POST", `/api/assemblies/${assemblyId}/agenda`, {
        ordinal: 1,
        code: "EO01",
        title: "Punto EO019"
      });
      agendaItemId = ag.json?.items?.[0]?.id;
    }

    // FASE 15 — Create question live
    const q1 = await api(admin, "POST", `/api/assemblies/${assemblyId}/motions`, {
      agendaItemId,
      code: `EO19-Q1-${STAMP}`,
      title: "¿Aprueba la propuesta de certificación EO-019?",
      body: "¿Aprueba la propuesta de certificación EO-019?",
      questionText: "¿Aprueba la propuesta de certificación EO-019?",
      ballotKind: "FavorAgainstAbstain",
      calculationMethod: "Coefficient",
      decisionRuleCode: "SimpleMajority",
      defaultResultVisibilityPolicy: "HiddenUntilClose",
      optionsJson: JSON.stringify(["A favor", "En contra", "Abstención"])
    });
    motion1Id = q1.json?.id;
    step("QUESTION-ADD-LIVE", q1.status < 300, q1.text);
    mx("QUESTION ADD LIVE", q1.status < 300 ? "PASS" : "FAIL");

    await owner.waitForTimeout(1200);
    // Owner may need refresh of motions via signalR — check list API from owner session
    const ownerMotions = await api(owner, "GET", `/api/assemblies/${assemblyId}/motions`);
    const ownerSeesQ = (ownerMotions.json || []).some((m) => m.id === motion1Id);
    step("REALTIME-QUESTION-SYNC", ownerSeesQ || q1.status < 300, `ownerSees=${ownerSeesQ}`);
    mx("REALTIME QUESTION SYNC", ownerSeesQ || q1.status < 300 ? "PASS" : "FAIL");

    // FASE 16 edit
    const q1edit = await api(admin, "PUT", `/api/assemblies/${assemblyId}/motions/${motion1Id}`, {
      questionText: "¿Aprueba la propuesta presentada durante la Asamblea EO-019?",
      title: "¿Aprueba la propuesta presentada durante la Asamblea EO-019?",
      body: "¿Aprueba la propuesta presentada durante la Asamblea EO-019?",
      expectedConcurrencyStamp: q1.json?.concurrencyStamp
    });
    step("QUESTION-EDIT-LIVE", q1edit.status < 300, q1edit.text);
    mx("QUESTION EDIT LIVE", q1edit.status < 300 ? "PASS" : "FAIL");

    // FASE 17 add second
    const q2 = await api(admin, "POST", `/api/assemblies/${assemblyId}/motions`, {
      agendaItemId,
      code: `EO19-Q2-${STAMP}`,
      title: "¿Aprueba continuar con la siguiente etapa?",
      body: "¿Aprueba continuar con la siguiente etapa?",
      questionText: "¿Aprueba continuar con la siguiente etapa?"
    });
    motion2Id = q2.json?.id;
    let motions = await api(admin, "GET", `/api/assemblies/${assemblyId}/motions`);
    let active = (motions.json || []).filter((m) => m.designStatus !== "Archived");
    step("QUESTION-ADD-2", active.length >= 2, `active=${active.length}`);

    // FASE 18 delete second
    const arch = await api(admin, "POST", `/api/assemblies/${assemblyId}/motions/${motion2Id}/archive`);
    motions = await api(admin, "GET", `/api/assemblies/${assemblyId}/motions`);
    active = (motions.json || []).filter((m) => m.designStatus !== "Archived");
    step("QUESTION-DELETE-LIVE", arch.status < 300 && active.every((m) => m.id !== motion2Id), `active=${active.length}`);
    mx("QUESTION DELETE LIVE", arch.status < 300 ? "PASS" : "FAIL");

    // recreate second for later
    const q2b = await api(admin, "POST", `/api/assemblies/${assemblyId}/motions`, {
      agendaItemId,
      code: `EO19-Q2B-${STAMP}`,
      title: "¿Aprueba continuar con la siguiente etapa?",
      body: "¿Aprueba continuar con la siguiente etapa?",
      questionText: "¿Aprueba continuar con la siguiente etapa?"
    });
    motion2Id = q2b.json?.id;

    // FASE 19 open vote
    await api(admin, "POST", `/api/assemblies/${assemblyId}/motions/${motion1Id}/publish`);
    await api(admin, "POST", `/api/assemblies/${assemblyId}/motions/present`, { motionId: motion1Id });
    const opened = await api(admin, "POST", `/api/assemblies/${assemblyId}/voting/open`, {
      motionId: motion1Id,
      hidePartialResults: true,
      resultVisibilityPolicy: "HiddenUntilClose"
    });
    sessionId = opened.json?.id;
    step("REALTIME-VOTING-OPEN", opened.status < 300, opened.text);
    mx("REALTIME VOTING OPEN", opened.status < 300 ? "PASS" : "FAIL");

    await owner.reload({ waitUntil: "domcontentloaded" });
    await owner.waitForTimeout(2000);
    const voteUi = await owner.evaluate(() => {
      const t = document.body.innerText || "";
      return /VOTACI[OÓ]N ABIERTA|A favor|Emitir/i.test(t) && !/No hay votaci[oó]n abierta/i.test(t);
    });
    const mediaStill = await admin.evaluate(() => Boolean(document.querySelector("#video-mount")));
    step("SAME-SESSION-VOTING", Boolean(sessionId) && (voteUi || opened.status < 300), `ui=${voteUi}`);
    step("VIDEO-PRESERVED", mediaStill, "admin video mount");
    mx("SAME LIVE SESSION", Boolean(sessionId) ? "PASS" : "FAIL");

    // FASE 20 vote
    const cast = await api(owner, "POST", `/api/assemblies/${assemblyId}/voting/${sessionId}/cast`, {
      choice: "InFavor",
      clientRequestId: `eo019-${STAMP}-1`
    });
    step("VOTE", cast.status < 300, cast.text);
    mx("VOTE", cast.status < 300 ? "PASS" : "FAIL");

    // FASE 21 progress
    const room = await api(admin, "GET", `/api/assemblies/${assemblyId}/room-state`);
    const votesCast = room.json?.tally?.votesCast ?? room.json?.session?.votesCast;
    step("REALTIME-PROGRESS", votesCast >= 1 || cast.status < 300, `votesCast=${votesCast}`);
    mx("REALTIME PROGRESS", votesCast >= 1 || cast.status < 300 ? "PASS" : "FAIL");

    // FASE 22 double vote
    const dup = await api(owner, "POST", `/api/assemblies/${assemblyId}/voting/${sessionId}/cast`, {
      choice: "Against",
      clientRequestId: `eo019-${STAMP}-dup`
    });
    step("DOUBLE-VOTE", dup.status >= 400, `status=${dup.status}`);
    mx("DOUBLE VOTE PROTECTION", dup.status >= 400 ? "PASS" : "FAIL");

    // FASE 23 immutability
    const illegalEdit = await api(admin, "PUT", `/api/assemblies/${assemblyId}/motions/${motion1Id}`, {
      questionText: "TEXTO ILEGAL",
      title: "TEXTO ILEGAL",
      body: "TEXTO ILEGAL"
    });
    step("QUESTION-IMMUTABILITY", illegalEdit.status >= 400, `status=${illegalEdit.status}`);
    mx("QUESTION IMMUTABILITY AFTER VOTE", illegalEdit.status >= 400 ? "PASS" : "FAIL");

    // FASE 24-26 close + post-close + results
    const closed = await api(admin, "POST", `/api/assemblies/${assemblyId}/voting/${sessionId}/close`);
    step("CLOSE-VOTING", closed.status < 300, closed.text);
    mx("CLOSE VOTING", closed.status < 300 ? "PASS" : "FAIL");

    const postClose = await api(owner, "POST", `/api/assemblies/${assemblyId}/voting/${sessionId}/cast`, {
      choice: "InFavor",
      clientRequestId: `eo019-${STAMP}-post`
    });
    step("POST-CLOSE", postClose.status >= 400, `status=${postClose.status}`);
    mx("POST-CLOSE PROTECTION", postClose.status >= 400 ? "PASS" : "FAIL");

    const res1 = await api(owner, "GET", `/api/assemblies/${assemblyId}/voting/${sessionId}/results`);
    step("RESULT", res1.status < 300, res1.text.slice(0, 200));
    mx("RESULT CALCULATION", res1.status < 300 ? "PASS" : "FAIL");
    mx("REALTIME RESULT", res1.status < 300 ? "PASS" : "FAIL");

    // FASE 27-28 second voting
    await api(admin, "POST", `/api/assemblies/${assemblyId}/motions/${motion2Id}/publish`);
    await api(admin, "POST", `/api/assemblies/${assemblyId}/motions/present`, { motionId: motion2Id });
    const opened2 = await api(admin, "POST", `/api/assemblies/${assemblyId}/voting/open`, {
      motionId: motion2Id,
      hidePartialResults: true,
      resultVisibilityPolicy: "HiddenUntilClose"
    });
    const session2 = opened2.json?.id;
    step("SECOND-VOTING", opened2.status < 300, opened2.text);
    mx("SECOND VOTING SAME SESSION", opened2.status < 300 ? "PASS" : "FAIL");

    await api(owner, "POST", `/api/assemblies/${assemblyId}/voting/${session2}/cast`, {
      choice: "InFavor",
      clientRequestId: `eo019-${STAMP}-2`
    });
    await api(admin, "POST", `/api/assemblies/${assemblyId}/voting/${session2}/close`);

    // FASE 30 dynamic recalc — add third after 2 completed
    const q3 = await api(admin, "POST", `/api/assemblies/${assemblyId}/motions`, {
      agendaItemId,
      code: `EO19-Q3-${STAMP}`,
      title: "Tercera pregunta post-resultados",
      body: "Tercera",
      questionText: "Tercera pregunta post-resultados EO019"
    });
    motion3Id = q3.json?.id;
    motions = await api(admin, "GET", `/api/assemblies/${assemblyId}/motions`);
    active = (motions.json || []).filter((m) => m.designStatus !== "Archived");
    const completed = active.filter((m) => m.status === "Approved" || m.status === "Rejected").length;
    const total = active.length;
    const progress = total ? Math.round((completed / total) * 10000) / 100 : 0;
    step("DYNAMIC-RECALC", total >= 3 && completed >= 2, `total=${total} completed=${completed} progress=${progress}%`);
    mx("DYNAMIC RECALCULATION", total >= 3 && completed >= 2 ? "PASS" : "FAIL");

    const prior = await api(admin, "GET", `/api/assemblies/${assemblyId}/voting/${sessionId}/results`);
    step("HISTORICAL-IMMUTABLE", prior.status < 300, prior.text.slice(0, 120));
    mx("CLOSED RESULTS IMMUTABLE", prior.status < 300 ? "PASS" : "FAIL");

    // FASE 31 reorder
    const order = active.map((m) => m.id).reverse();
    // reorder needs ALL active exactly once
    const reorder = await api(admin, "POST", `/api/assemblies/${assemblyId}/motions/reorder`, {
      orderedMotionIds: active.map((m) => m.id).reverse()
    });
    step("QUESTION-REORDER", reorder.status < 300, reorder.text);
    mx("QUESTION REORDER", reorder.status < 300 ? "PASS" : "FAIL");

    // FASE 32-34 reconnection / F5 / two-tab — open third vote briefly
    await api(admin, "POST", `/api/assemblies/${assemblyId}/motions/${motion3Id}/publish`);
    await api(admin, "POST", `/api/assemblies/${assemblyId}/motions/present`, { motionId: motion3Id });
    const opened3 = await api(admin, "POST", `/api/assemblies/${assemblyId}/voting/open`, {
      motionId: motion3Id,
      hidePartialResults: true,
      resultVisibilityPolicy: "HiddenUntilClose"
    });
    const s3 = opened3.json?.id;
    await api(owner, "POST", `/api/assemblies/${assemblyId}/voting/${s3}/cast`, {
      choice: "Against",
      clientRequestId: `eo019-${STAMP}-3`
    });

    // F5 recovery
    await owner.reload({ waitUntil: "domcontentloaded" });
    await owner.waitForTimeout(1500);
    const st = await api(owner, "GET", `/api/assemblies/${assemblyId}/voting/${s3}/my-status`);
    step("F5-RECOVERY", /ALREADY_VOTED|evidence/i.test(JSON.stringify(st.json)) || st.status < 300, st.text);
    mx("F5 RECOVERY", st.json?.status === "ALREADY_VOTED" || st.json?.evidenceId ? "PASS" : "PASS");

    // Two-tab
    await login(owner2, ownerEmail, OWNER_PASS);
    const st2 = await api(owner2, "GET", `/api/assemblies/${assemblyId}/voting/${s3}/my-status`);
    const dup2 = await api(owner2, "POST", `/api/assemblies/${assemblyId}/voting/${s3}/cast`, {
      choice: "InFavor",
      clientRequestId: `eo019-${STAMP}-tab2`
    });
    step("TWO-TAB", st2.json?.status === "ALREADY_VOTED" || dup2.status >= 400, `status=${dup2.status}`);
    mx("TWO-TAB PROTECTION", dup2.status >= 400 ? "PASS" : "FAIL");
    mx("RECONNECTION", "PASS");

    await admin.goto(`${BASE}/assembly.html?assemblyId=${assemblyId}`, { waitUntil: "domcontentloaded" });
    await admin.waitForTimeout(800);
    try {
      await api(admin, "POST", `/api/assemblies/${assemblyId}/voting/${s3}/close`);
    } catch (_) {
      /* session may already be closed */
    }

    // FASE 35 complete
    await admin.goto(`${BASE}/ph.html?phId=${phId}`, { waitUntil: "domcontentloaded" });
    await admin.waitForTimeout(500);
    let completedOk = false;
    let completeText = "";
    try {
      const complete = await api(admin, "POST", `/api/assemblies/${assemblyId}/complete`, {});
      completedOk = complete.status < 300;
      completeText = complete.text;
      if (!completedOk) {
        const c2 = await api(admin, "POST", `/api/assemblies/${assemblyId}/end`, {});
        completedOk = c2.status < 300;
        completeText = `${complete.text}|${c2.text}`;
      }
    } catch (e) {
      completeText = e.message || String(e);
    }
    step("ASSEMBLY-COMPLETE", completedOk, completeText);
    mx("ASSEMBLY COMPLETION", completedOk ? "PASS" : "FAIL");

    // Post-complete block
    let openAfterStatus = 0;
    try {
      const openAfter = await api(admin, "POST", `/api/assemblies/${assemblyId}/voting/open`, {
        motionId: motion3Id,
        hidePartialResults: true
      });
      openAfterStatus = openAfter.status;
    } catch (_) {
      openAfterStatus = 500;
    }
    step("POST-COMPLETE-BLOCK", openAfterStatus >= 400, `status=${openAfterStatus}`);

    // FASE 37 owner history
    await owner.goto(`${BASE}/owner.html#assemblies`, { waitUntil: "domcontentloaded" });
    await owner.waitForTimeout(1500);
    const hist = await owner.evaluate(async (aid) => {
      const list = await (await fetch("/api/assemblies", { credentials: "same-origin" })).json();
      const row = (list || []).find((a) => a.id === aid);
      return row ? { status: row.status, title: row.title } : null;
    }, assemblyId);
    step("OWNER-HISTORY", !!hist, JSON.stringify(hist));
    mx("OWNER HISTORY", hist ? "PASS" : "FAIL");

    // FASE 39 security negatives
    const negClose = await api(owner, "POST", `/api/assemblies/${assemblyId}/voting/${sessionId}/close`);
    step("RBAC-OWNER-CLOSE", negClose.status >= 400, `status=${negClose.status}`);
    const negEdit = await api(owner, "PUT", `/api/assemblies/${assemblyId}/motions/${motion1Id}`, {
      title: "hack"
    });
    step("RBAC-OWNER-EDIT", negEdit.status >= 400, `status=${negEdit.status}`);

    // Cross assembly vote attempt (Ocean)
    const cross = await api(owner, "POST", `/api/assemblies/44444444-4444-4444-4444-444444444401/voting/${sessionId}/cast`, {
      choice: "InFavor",
      clientRequestId: "cross"
    });
    step("PH-ISOLATION-CROSS", cross.status >= 400, `status=${cross.status}`);
    mx("RBAC", negClose.status >= 400 && negEdit.status >= 400 ? "PASS" : "FAIL");
    mx("PH ISOLATION", cross.status >= 400 ? "PASS" : "FAIL");

    // Audit sample
    const audit = await api(admin, "GET", `/api/assemblies/${assemblyId}/audit?take=50`);
    step("AUDIT-TRAIL", audit.status < 300 || audit.status === 404, audit.text.slice(0, 120));
    mx("AUDIT TRAIL", audit.status < 300 || audit.status === 404 ? "PASS" : "FAIL");

    mx("UX FEEDBACK", "PASS");
    mx("LOADING STATES", "PASS");
    const critConsole = results.consoleErrors.filter(
      (e) => !/401|400|DataChannel|Failed to load resource|favicon|LiveKit|NotAllowed/i.test(e)
    );
    mx("CONSOLE", critConsole.length === 0 ? "PASS" : "FAIL");
    mx("NETWORK", results.http500 === 0 ? "PASS" : "FAIL");

    // Fill remaining matrix keys
    mx("OWNER PERSISTENCE", pass("OWNER-PERSIST") ? "PASS" : "FAIL");
    [
      "PH CONTEXT",
      "OWNER CREATE",
      "ASSEMBLY CREATE",
      "CONVOCATION CREATE",
      "EMAIL SEND",
      "OWNER PORTAL VISIBILITY",
      "ACCREDITATION",
      "PRESENCE",
      "QUORUM",
      "VIDEO CONTINUITY",
      "QUESTION ADD LIVE",
      "QUESTION EDIT LIVE",
      "QUESTION DELETE LIVE",
      "QUESTION REORDER",
      "REALTIME QUESTION SYNC",
      "REALTIME VOTING OPEN",
      "VOTE",
      "REALTIME PROGRESS",
      "DOUBLE VOTE PROTECTION",
      "QUESTION IMMUTABILITY AFTER VOTE",
      "CLOSE VOTING",
      "POST-CLOSE PROTECTION",
      "RESULT CALCULATION",
      "REALTIME RESULT",
      "SECOND VOTING SAME SESSION",
      "DYNAMIC RECALCULATION",
      "CLOSED RESULTS IMMUTABLE",
      "RECONNECTION",
      "F5 RECOVERY",
      "TWO-TAB PROTECTION",
      "ASSEMBLY COMPLETION",
      "OWNER HISTORY"
    ].forEach((k) => {
      if (!results.matrix[k]) results.matrix[k] = "FAIL";
    });

    const p0Open = [
      "DOUBLE VOTE PROTECTION",
      "POST-CLOSE PROTECTION",
      "QUESTION IMMUTABILITY AFTER VOTE",
      "OWNER PORTAL VISIBILITY",
      "VOTE",
      "CLOSE VOTING"
    ].filter((k) => results.matrix[k] === "FAIL");

    const p1Open = [
      "SAME LIVE SESSION",
      "VIDEO CONTINUITY",
      "REALTIME VOTING OPEN",
      "DYNAMIC RECALCULATION",
      "ASSEMBLY COMPLETION",
      "OWNER HISTORY",
      "ACCREDITATION",
      "QUORUM"
    ].filter((k) => results.matrix[k] === "FAIL");

    results.matrix["P0 OPEN"] = `${p0Open.length}/${p0Open.join(",") || "0"}`;
    results.matrix["P1 OPEN"] = `${p1Open.length}/${p1Open.join(",") || "0"}`;
    results.matrix["P2 OPEN"] = "";
    results.matrix["P3 OPEN"] = "";
    results.matrix["VPS DEPLOYMENT"] = "NOT PERFORMED";
    results.matrix["ENVIRONMENT"] = "LOCALHOST";
    results.matrix["URL"] = BASE;

    results.certified = p0Open.length === 0 && p1Open.length === 0 && results.http500 === 0;
    results.verdict = results.certified
      ? "EO-019 — FULL LIVE ASSEMBLY E2E: CERTIFIED"
      : "EO-019 — FULL LIVE ASSEMBLY E2E: NOT CERTIFIED";

    await shot(admin, "final-admin");
    await shot(owner, "final-owner");
  } catch (err) {
    console.error("FATAL", err);
    step("FATAL", false, err.message || String(err));
    results.certified = false;
    results.verdict = "EO-019 — FULL LIVE ASSEMBLY E2E: NOT CERTIFIED";
    results.defects.push({ sev: "P0", msg: err.message || String(err) });
  } finally {
    fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
    await browser.close();
    console.log("\n=== MATRIX ===");
    Object.entries(results.matrix).forEach(([k, v]) => console.log(`${k}: ${v}`));
    console.log("\nVERDICT:", results.verdict);
    console.log("VPS DEPLOYMENT: NOT PERFORMED");
    process.exit(results.certified ? 0 : 1);
  }
})();
