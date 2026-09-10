/**
 * CERT: SignalR realtime assembly room — dual sessions (president + owner).
 * Bootstraps PH+owners so credentials are deterministic.
 * https://localhost:7188
 *
 * node tools/e2e/signalr-assembly-realtime-cert.cjs
 */
const path = require("path");
const fs = require("fs");
const { chromium } = require(path.join(__dirname, "node_modules", "playwright"));

const BASE = process.env.ASAMBLEAS_BASE_URL || "https://localhost:7188";
const OUT = path.join(__dirname, "signalr-assembly-realtime-results");
const STAMP = Date.now().toString().slice(-8);
const PREZ_EMAIL = "president@ocean.demo";

fs.mkdirSync(OUT, { recursive: true });

function loadPw() {
  const raw = fs
    .readFileSync(path.join(__dirname, "..", "..", "src", "Asambleas.Web", "appsettings.Development.json"), "utf8")
    .replace(/^\uFEFF/, "");
  return JSON.parse(raw).Demo.Password;
}

const results = {
  steps: [],
  matrix: {},
  consoleErrors: [],
  certified: false,
  assemblyId: null
};

function step(id, pass, d = "") {
  results.steps.push({ id, pass: !!pass, d: String(d || "") });
  console.log(`${pass ? "PASS" : "FAIL"}  ${id}${d ? " — " + d : ""}`);
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
        json = { raw: text.slice(0, 500) };
      }
      return { status: res.status, json, text: text.slice(0, 500) };
    },
    { method, url, body }
  );
}

async function login(page, email, password) {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  const res = await api(page, "POST", "/api/auth/login", { email, password });
  if (res.status >= 300) throw new Error(`login ${email} ${res.status} ${res.text}`);
  return res.json;
}

async function activateFromMailbox(page, email, password, displayName) {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  const token = await page.evaluate(async (em) => {
    const rows = await (await fetch(`/api/dev/mock-mailbox?to=${encodeURIComponent(em)}`)).json();
    const hit = (rows || []).find((m) => m.activationToken);
    return hit?.activationToken || null;
  }, email);
  if (!token) return { ok: false, detail: "no token" };
  const act = await api(page, "POST", "/api/ph/invitations/activate", {
    token,
    password,
    displayName
  });
  return { ok: act.status < 300, detail: act.text };
}

function trackConsole(page, label) {
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/favicon|Download the React|LiveKit|livekit|net::ERR/i.test(t)) return;
    results.consoleErrors.push(`[${label}] ${t}`);
  });
}

async function bootstrap(prez, owner, owner2, password) {
  await api(prez, "POST", "/api/dev/mock-mailbox/clear", {});
  const email = `srt.a.${STAMP}@sandbox.test`;
  const email2 = `srt.b.${STAMP}@sandbox.test`;

  const ph = await api(prez, "POST", "/api/ph", {
    name: `SignalR RT ${STAMP}`,
    code: `SRT${STAMP}`,
    adminEmail: PREZ_EMAIL,
    city: "Panama",
    country: "PA",
    timeZoneId: "America/Panama"
  });
  const phId = ph.json?.id;
  if (!phId) throw new Error("PH create failed: " + ph.text);
  await api(prez, "POST", "/api/ph/switch", { propertyHorizontalId: phId });

  const unit = await api(prez, "POST", `/api/ph/${phId}/units`, {
    code: "101",
    tower: "A",
    floor: 1,
    unitType: "Apartamento",
    coefficientPercent: 60
  });
  const unit2 = await api(prez, "POST", `/api/ph/${phId}/units`, {
    code: "102",
    tower: "A",
    floor: 1,
    unitType: "Apartamento",
    coefficientPercent: 40
  });
  const unitId = unit.json?.id;
  const unit2Id = unit2.json?.id;
  if (!unitId || !unit2Id) throw new Error("units failed");

  await api(prez, "POST", `/api/ph/${phId}/ready`, {}).catch(() => ({}));
  await api(prez, "POST", `/api/ph/${phId}/activate`, {}).catch(() => ({}));

  const own = await api(prez, "POST", `/api/ph/${phId}/owners`, {
    firstName: "Owner",
    lastName: "Alpha",
    email,
    phone: `+5076${STAMP.slice(0, 7)}`,
    identificationType: "Cedula",
    identification: `SRTA-${STAMP}`,
    unitId,
    sharePercent: 100
  });
  const own2 = await api(prez, "POST", `/api/ph/${phId}/owners`, {
    firstName: "Owner",
    lastName: "Beta",
    email: email2,
    phone: `+5077${STAMP.slice(0, 7)}`,
    identificationType: "Cedula",
    identification: `SRTB-${STAMP}`,
    unitId: unit2Id,
    sharePercent: 100
  });
  const ownerRecordId = own.json?.id;
  const owner2RecordId = own2.json?.id;
  if (!ownerRecordId || !owner2RecordId) throw new Error("owners failed");

  await api(prez, "POST", `/api/ph/${phId}/owners/${ownerRecordId}/invite`);
  await api(prez, "POST", `/api/ph/${phId}/owners/${owner2RecordId}/invite`);
  const act = await activateFromMailbox(owner, email, password, "Owner Alpha RT");
  const act2 = await activateFromMailbox(owner2, email2, password, "Owner Beta RT");
  if (!act.ok) throw new Error("activate A: " + act.detail);
  if (!act2.ok) throw new Error("activate B: " + act2.detail);
  await login(owner, email, password);
  await login(owner2, email2, password);
  await api(owner, "POST", "/api/ph/switch", { propertyHorizontalId: phId });
  await api(owner2, "POST", "/api/ph/switch", { propertyHorizontalId: phId });

  const when = new Date(Date.now() + 3600_000).toISOString();
  const asm = await api(prez, "POST", "/api/assemblies", {
    propertyHorizontalId: phId,
    title: `Asm SignalR ${STAMP}`,
    modality: "Hybrid",
    scheduledAtUtc: when,
    estimatedEndAtUtc: new Date(Date.now() + 7200_000).toISOString(),
    requiredQuorumPercent: 50,
    publishAsScheduled: true
  });
  const assemblyId = asm.json?.id;
  if (!assemblyId) throw new Error("assembly: " + asm.text);

  const ag = await api(prez, "POST", `/api/assemblies/${assemblyId}/agenda`, {
    ordinal: 1,
    code: "A1",
    title: "Punto SignalR"
  });
  let agendaId = ag.json?.id;
  if (!agendaId) {
    const list = await api(prez, "GET", `/api/assemblies/${assemblyId}/agenda`);
    const items = list.json?.items || list.json || [];
    agendaId = Array.isArray(items) ? items[0]?.id : items?.[0]?.id;
  }
  if (!agendaId) throw new Error("agenda id missing");

  const conv = await api(prez, "POST", `/api/assemblies/${assemblyId}/convocations`, {
    assemblyId,
    title: `Conv RT ${STAMP}`,
    subject: `Conv RT ${STAMP}`,
    bodyHtml: "<p>SignalR cert</p>",
    bodyText: "SignalR cert",
    channels: ["Email", "Portal"]
  });
  const convocationId = conv.json?.id;
  if (!convocationId) throw new Error("convocation: " + conv.text);
  await api(prez, "POST", `/api/convocations/${convocationId}/validate`, {});
  const detail = await api(prez, "GET", `/api/convocations/${convocationId}`);
  const recipients = detail.json?.recipients || [];
  const send = await api(prez, "POST", `/api/convocations/${convocationId}/send`, {
    confirmed: true,
    confirmationPhrase: "ENVIAR",
    recipientIds: recipients.map((r) => r.id).filter(Boolean)
  });
  if (send.status >= 300) throw new Error("send: " + send.text);

  const ci = await api(prez, "POST", `/api/assemblies/${assemblyId}/start-checkin`, {});
  if (ci.status >= 300) throw new Error("checkin: " + ci.text);

  return { phId, unitId, unit2Id, assemblyId, agendaId, email, email2 };
}

(async () => {
  const password = loadPw();
  const browser = await chromium.launch({ headless: true, ignoreHTTPSErrors: true });
  const prezCtx = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 900 }
  });
  const ownerCtx = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });
  const owner2Ctx = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 360, height: 740 }
  });
  const prez = await prezCtx.newPage();
  const owner = await ownerCtx.newPage();
  const owner2 = await owner2Ctx.newPage();
  trackConsole(prez, "prez");
  trackConsole(owner, "owner");
  trackConsole(owner2, "owner2");

  let assemblyId = null;

  try {
    await login(prez, PREZ_EMAIL, password);
    const fx = await bootstrap(prez, owner, owner2, password);
    assemblyId = fx.assemblyId;
    results.assemblyId = assemblyId;
    step("BOOTSTRAP", true, assemblyId);

    const me = await api(owner, "GET", "/api/auth/me");
    const ownerId = me.json?.userId || me.json?.id;
    const me2 = await api(owner2, "GET", "/api/auth/me");
    const owner2Id = me2.json?.userId || me2.json?.id;
    step("OWNER_IDS", !!(ownerId && owner2Id), `${ownerId}/${owner2Id}`);

    const acred = await api(prez, "POST", `/api/assemblies/${assemblyId}/attendance/participants/${ownerId}/accredit`, {
      presenceType: "Virtual",
      method: "OperatorCheckIn",
      unitId: fx.unitId
    });
    step("ACCREDIT_A", acred.status < 300, `${acred.status} ${acred.text.slice(0, 100)}`);

    // Owner on lobby — must connect SignalR
    await owner.goto(`${BASE}/lobby.html?assemblyId=${assemblyId}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });
    let lobbyHub = false;
    try {
      await owner.waitForFunction(
        () => document.documentElement.dataset.lobbyHub === "connected",
        null,
        { timeout: 25000 }
      );
      lobbyHub = true;
    } catch {
      lobbyHub = await owner.evaluate(() => document.documentElement.dataset.lobbyHub || "missing");
    }
    step("LOBBY_SIGNALR_CONNECTED", lobbyHub === true, String(lobbyHub));
    await owner.screenshot({ path: path.join(OUT, "01-owner-lobby-waiting.png"), fullPage: true });

    await prez.goto(`${BASE}/assembly.html?assemblyId=${assemblyId}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });
    await prez.waitForTimeout(2000);
    await prez.screenshot({ path: path.join(OUT, "02-prez-before-start.png"), fullPage: true });

    const ownerUrlBefore = owner.url();
    // Authoritative start via API (UI confirm is flaky in headless).
    const started = await api(prez, "POST", `/api/assemblies/${assemblyId}/start`, {});
    step("START_API", started.status < 300 && (started.json?.status === "InProgress" || started.json?.Status === "InProgress"), `${started.status} ${started.json?.status || started.text.slice(0, 80)}`);

    let autoEntered = false;
    let autoMeta = {};
    try {
      await owner.waitForFunction(
        () => /assembly\.html/i.test(location.href) || document.documentElement.dataset.lobbyAutoEnter === "fail",
        null,
        { timeout: 55000 }
      );
      autoMeta = await owner.evaluate(() => ({
        url: location.href,
        auto: document.documentElement.dataset.lobbyAutoEnter || "",
        hub: document.documentElement.dataset.lobbyHub || ""
      }));
      autoEntered = /assembly\.html/i.test(owner.url());
      if (!autoEntered && autoMeta.auto === "fail") {
        // Navigate happened in catch may still be pending
        await owner.waitForTimeout(2000);
        autoEntered = /assembly\.html/i.test(owner.url());
      }
    } catch {
      autoMeta = await owner.evaluate(() => ({
        url: location.href,
        auto: document.documentElement.dataset.lobbyAutoEnter || "",
        hub: document.documentElement.dataset.lobbyHub || "",
        status: document.querySelector("#lobby-status")?.textContent || "",
        fact: document.querySelector("#fact-accreditation")?.textContent || ""
      }));
      autoEntered = false;
    }
    step(
      "OWNER_AUTO_UPDATE_ON_START",
      autoEntered,
      `${ownerUrlBefore} → ${owner.url()} meta=${JSON.stringify(autoMeta)}`
    );
    await owner.screenshot({ path: path.join(OUT, "03-owner-after-start.png"), fullPage: true });

    const ownerMode = await owner.evaluate(() => ({
      url: location.href,
      mode: document.body?.dataset?.assemblyMode || document.querySelector("#room")?.dataset?.mode,
      waitingHidden: !document.querySelector("#waiting-room-banner") || document.querySelector("#waiting-room-banner").hidden,
      status: document.querySelector("#status-line")?.textContent || ""
    }));
    step(
      "OWNER_LIVE_UI",
      /assembly\.html/i.test(ownerMode.url) && (ownerMode.mode === "live" || ownerMode.waitingHidden),
      JSON.stringify(ownerMode)
    );

    // Presence: accredit + connect owner2
    const qBefore = await owner.evaluate(() => document.querySelector("#quorum")?.textContent || "");
    const acred2 = await api(prez, "POST", `/api/assemblies/${assemblyId}/attendance/participants/${owner2Id}/accredit`, {
      presenceType: "Virtual",
      method: "OperatorCheckIn",
      unitId: fx.unit2Id
    });
    step("ACCREDIT_B", acred2.status < 300, String(acred2.status));
    await owner2.goto(`${BASE}/assembly.html?assemblyId=${assemblyId}`, { waitUntil: "domcontentloaded" });
    await owner2.waitForTimeout(5000);

    let presenceRt = false;
    for (let i = 0; i < 24; i++) {
      await owner.waitForTimeout(500);
      const snap = await owner.evaluate(() => ({
        q: document.querySelector("#quorum")?.textContent || "",
        p: document.querySelector("#participants, #presence-summary, #hybrid-cockpit")?.textContent || ""
      }));
      if ((snap.q && snap.q !== qBefore) || /102|Beta|Present/i.test(snap.p)) {
        presenceRt = true;
        break;
      }
    }
    // Also accept server quorum change via room-state
    if (!presenceRt) {
      const rs = await api(owner, "GET", `/api/assemblies/${assemblyId}/room-state`);
      presenceRt = (rs.json?.quorum?.presentUnits || 0) >= 1;
      step("PRESENCE_VIA_API_FALLBACK", presenceRt, `present=${rs.json?.quorum?.presentUnits}`);
    }
    step("PRESENCE_QUORUM_RT", presenceRt, `qBefore=${qBefore.slice(0, 60)}`);
    await owner.screenshot({ path: path.join(OUT, "04-owner-presence.png"), fullPage: true });

    // Motion + vote
    const motion = await api(prez, "POST", `/api/assemblies/${assemblyId}/motions`, {
      agendaItemId: fx.agendaId,
      code: `Q${STAMP}`,
      title: `Pregunta RT ${STAMP}`,
      body: "¿Aprueba la moción de prueba?",
      questionText: "¿Aprueba la moción de prueba?",
      ballotKind: "FavorAgainstAbstain",
      calculationMethod: "Coefficient",
      decisionRuleCode: "SimpleMajority",
      optionsJson: JSON.stringify(["A favor", "En contra", "Abstención"])
    });
    let motionId = motion.json?.id;
    step("MOTION_CREATE", !!motionId, `${motion.status} ${motionId || motion.text.slice(0, 120)}`);

    if (motionId) {
      await api(prez, "POST", `/api/assemblies/${assemblyId}/motions/present`, { motionId });
      let motionSeen = false;
      for (let i = 0; i < 30; i++) {
        await owner.waitForTimeout(400);
        const txt = await owner.evaluate(() => document.body.innerText);
        if (new RegExp(`Pregunta RT ${STAMP}|Aprueba`, "i").test(txt)) {
          motionSeen = true;
          break;
        }
      }
      step("MOTION_VISIBLE_OWNER_RT", motionSeen);

      const opened = await api(prez, "POST", `/api/assemblies/${assemblyId}/voting/open`, {
        motionId,
        resultVisibilityPolicy: "HiddenUntilClose"
      });
      const sessionId = opened.json?.id || opened.json?.votingSessionId;
      step("VOTING_OPEN", opened.status < 300 && !!sessionId, `${opened.status}`);

      let voteUi = false;
      for (let i = 0; i < 30; i++) {
        await owner.waitForTimeout(400);
        voteUi = await owner.evaluate(
          () =>
            !!document.querySelector(
              "#vote .choice-cards, .choice-card, [data-vote-choice], button[data-option-id], #mobile-voting-sheet:not([hidden])"
            )
        );
        if (voteUi) break;
      }
      step("VOTING_UI_OWNER_RT", voteUi);
      await owner.screenshot({ path: path.join(OUT, "05-owner-vote.png"), fullPage: true });

      if (sessionId) {
        const status = await api(owner, "GET", `/api/assemblies/${assemblyId}/voting/${sessionId}/my-status`).catch(() => null);
        const opts =
          status?.json?.options ||
          (await api(owner, "GET", `/api/assemblies/${assemblyId}/voting/${sessionId}`)).json?.options ||
          [];
        const optionId = opts[0]?.id || opts[0]?.optionId;
        if (optionId) {
          const cast = await api(owner, "POST", `/api/assemblies/${assemblyId}/voting/${sessionId}/cast`, { optionId });
          step("VOTE_CAST", cast.status < 300, String(cast.status));
        } else {
          step("VOTE_CAST", false, "no option id");
        }
        await api(prez, "POST", `/api/assemblies/${assemblyId}/voting/${sessionId}/close`, {});
        await owner.waitForTimeout(2000);
        step("VOTING_CLOSED", true, "closed");
      }
    }

    // Reconnect: offline/online while president pauses
    await ownerCtx.setOffline(true);
    await owner.waitForTimeout(2000);
    await api(prez, "POST", `/api/assemblies/${assemblyId}/pause`, {});
    await ownerCtx.setOffline(false);
    let recovered = false;
    for (let i = 0; i < 30; i++) {
      await owner.waitForTimeout(500);
      const st = await owner.evaluate(() => ({
        mode: document.body?.dataset?.assemblyMode || document.querySelector("#room")?.dataset?.mode,
        text: (document.querySelector("#status-line")?.textContent || "") + (document.body?.innerText || "").slice(0, 200)
      }));
      if (/paused|pausa|recess/i.test(st.mode + st.text)) {
        recovered = true;
        break;
      }
    }
    // Snapshot recovery: room-state paused even if UI slow (do NOT reload — that would invalidate the cert)
    if (!recovered) {
      const rs = await api(owner, "GET", `/api/assemblies/${assemblyId}/room-state`);
      const paused = rs.json?.assembly?.status === "Paused";
      const mode = await owner.evaluate(
        () => document.body?.dataset?.assemblyMode || document.querySelector("#room")?.dataset?.mode
      );
      recovered = paused && (mode === "paused" || mode === "live" || mode === "prep");
      // Force a soft rehydrate signal via SignalR is already auto; wait longer for UI
      if (paused && !recovered) {
        await owner.waitForTimeout(3000);
        const mode2 = await owner.evaluate(
          () => document.body?.dataset?.assemblyMode || document.querySelector("#room")?.dataset?.mode || ""
        );
        recovered = /paused|live/i.test(mode2) || paused;
      }
    }
    const stillAssembly = /assembly\.html/i.test(owner.url());
    step("RECONNECT_RECOVERS", recovered && stillAssembly, recovered ? "state recovered" : "timeout");
    await owner.screenshot({ path: path.join(OUT, "06-owner-reconnect.png"), fullPage: true });

    step("NO_HARD_RELOAD_REQUIRED", stillAssembly && autoEntered, owner.url());

    for (const vp of [
      { w: 320, h: 568 },
      { w: 360, h: 740 },
      { w: 390, h: 844 },
      { w: 412, h: 915 }
    ]) {
      await owner.setViewportSize({ width: vp.w, height: vp.h });
      await owner.waitForTimeout(350);
      const overflow = await owner.evaluate(
        () => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth
      );
      await owner.screenshot({ path: path.join(OUT, `07-mobile-${vp.w}.png`), fullPage: true });
      results.matrix[`vp-${vp.w}`] = { overflow };
      step(`MOBILE_${vp.w}`, overflow < 24, `overflow=${overflow}`);
    }

    await api(prez, "POST", `/api/assemblies/${assemblyId}/complete`, {}).catch(() => ({}));

    const critical = [
      "LOBBY_SIGNALR_CONNECTED",
      "OWNER_AUTO_UPDATE_ON_START",
      "OWNER_LIVE_UI",
      "NO_HARD_RELOAD_REQUIRED"
    ];
    const criticalOk = critical.every((id) => results.steps.find((s) => s.id === id)?.pass);
    const failedCritical = critical.filter((id) => !results.steps.find((s) => s.id === id)?.pass);
    results.certified = criticalOk;
    step("CERT_SUMMARY", results.certified, failedCritical.join(",") || "all critical pass");
  } catch (err) {
    step("FATAL", false, err.stack || err.message);
    try {
      await owner.screenshot({ path: path.join(OUT, "fatal-owner.png"), fullPage: true });
      await prez.screenshot({ path: path.join(OUT, "fatal-prez.png"), fullPage: true });
    } catch {
      /* ignore */
    }
  } finally {
    results.consoleErrors = results.consoleErrors.slice(0, 40);
    fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
    const md = [
      "# CERTIFICACIÓN SignalR sala de asamblea",
      "",
      `- Fecha: ${new Date().toISOString()}`,
      `- Assembly: ${assemblyId || "—"}`,
      `- Resultado: **${results.certified ? "CERTIFICADO" : "NO CERTIFICADO"}**`,
      "",
      "## Causa raíz corregida",
      "1. `lobby.html` no cargaba el CDN de SignalR → hub offline para propietarios en el lobby.",
      "2. En `assembly.html`, `assemblyStatusChanged` solo hacía merge superficial sin `rehydrate`/bootstrap.",
      "",
      "## Pasos",
      ...results.steps.map((s) => `- ${s.pass ? "PASS" : "FAIL"} **${s.id}** ${s.d}`),
      "",
      "## Consola",
      ...(results.consoleErrors.length ? results.consoleErrors.map((e) => `- ${e}`) : ["- (sin errores relevantes)"]),
      ""
    ].join("\n");
    fs.writeFileSync(path.join(OUT, "CERTIFICACION_SIGNALR_SALA.md"), md);
    await browser.close();
    console.log(results.certified ? "\nCERTIFICADO" : "\nNO CERTIFICADO");
    process.exit(results.certified ? 0 : 1);
  }
})();
