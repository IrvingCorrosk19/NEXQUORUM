/**
 * Owner mobile UX + accreditation simplicity — Browser Tab cert (local).
 * Bootstraps PH + owner + assembly (demo Ocean PH may be wiped).
 * Viewports: 320, 360, 390, 412, 768, 1366
 */
const path = require("path");
const fs = require("fs");
const { chromium } = require(path.join(__dirname, "node_modules", "playwright"));

const BASE = process.env.ASAMBLEAS_BASE_URL || "https://localhost:7188";
const OUT = path.join(__dirname, "owner-mobile-acred-results");
fs.mkdirSync(OUT, { recursive: true });
const STAMP = Date.now().toString().slice(-8);

function loadPw() {
  const raw = fs
    .readFileSync(path.join(__dirname, "..", "..", "src", "Asambleas.Web", "appsettings.Development.json"), "utf8")
    .replace(/^\uFEFF/, "");
  return JSON.parse(raw).Demo.Password;
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
      return { status: res.status, json, text: text.slice(0, 400) };
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

async function activateFromMailbox(page, email, password) {
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
    displayName: "Owner Mobile Cert"
  });
  return { ok: act.status < 300, detail: act.text };
}

async function overflowCheck(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    return {
      scrollWidth: Math.max(doc.scrollWidth, body.scrollWidth),
      clientWidth: doc.clientWidth,
      overflow: Math.max(doc.scrollWidth, body.scrollWidth) - doc.clientWidth
    };
  });
}

async function bootstrap(prez, owner, password) {
  await api(prez, "POST", "/api/dev/mock-mailbox/clear", {});
  const email = `omc.${STAMP}@sandbox.test`;
  const ph = await api(prez, "POST", "/api/ph", {
    name: `Owner Mobile Cert ${STAMP}`,
    code: `OMC${STAMP}`,
    adminEmail: "president@ocean.demo",
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
    coefficientPercent: 100
  });
  const unitId = unit.json?.id;
  if (!unitId) throw new Error("unit create failed: " + unit.text);

  await api(prez, "POST", `/api/ph/${phId}/ready`, {}).catch(() => ({}));
  await api(prez, "POST", `/api/ph/${phId}/activate`, {}).catch(() => ({}));

  const own = await api(prez, "POST", `/api/ph/${phId}/owners`, {
    firstName: "Owner",
    lastName: "Mobile",
    email,
    phone: `+5076${STAMP.slice(0, 7)}`,
    identificationType: "Cedula",
    identification: `OM-${STAMP}`,
    unitId,
    sharePercent: 100
  });
  const ownerRecordId = own.json?.id;
  if (!ownerRecordId) throw new Error("owner create failed: " + own.text);

  const inv = await api(prez, "POST", `/api/ph/${phId}/owners/${ownerRecordId}/invite`);
  if (inv.status >= 300) throw new Error("invite failed: " + inv.text);
  const act = await activateFromMailbox(owner, email, password);
  if (!act.ok) throw new Error("activate failed: " + act.detail);
  await login(owner, email, password);
  await api(owner, "POST", "/api/ph/switch", { propertyHorizontalId: phId });

  const when = new Date(Date.now() + 3600_000).toISOString();
  const asm = await api(prez, "POST", "/api/assemblies", {
    propertyHorizontalId: phId,
    title: `Asm Owner Mobile ${STAMP}`,
    modality: "Hybrid",
    scheduledAtUtc: when,
    estimatedEndAtUtc: new Date(Date.now() + 7200_000).toISOString(),
    requiredQuorumPercent: 50,
    publishAsScheduled: true
  });
  const assemblyId = asm.json?.id;
  if (!assemblyId) throw new Error("assembly create failed: " + asm.text);

  const ag = await api(prez, "POST", `/api/assemblies/${assemblyId}/agenda`, {
    ordinal: 1,
    code: "A1",
    title: "Aprobacion de presupuesto anual"
  });
  let agendaId = ag.json?.id;
  if (!agendaId) {
    const list = await api(prez, "GET", `/api/assemblies/${assemblyId}/agenda`);
    const items = list.json?.items || list.json || [];
    agendaId = Array.isArray(items) ? items[0]?.id : null;
  }

  const conv = await api(prez, "POST", `/api/assemblies/${assemblyId}/convocations`, {
    assemblyId,
    title: `Conv ${STAMP}`,
    subject: `Conv ${STAMP}`,
    bodyHtml: "<p>E2E owner mobile</p>",
    bodyText: "E2E owner mobile",
    channels: ["Email", "Portal"]
  });
  const convocationId = conv.json?.id;
  if (!convocationId) throw new Error("convocation failed: " + conv.text);
  await api(prez, "POST", `/api/convocations/${convocationId}/validate`, {});
  const detail = await api(prez, "GET", `/api/convocations/${convocationId}`);
  const recipients = (detail.json && detail.json.recipients) || [];
  const send = await api(prez, "POST", `/api/convocations/${convocationId}/send`, {
    confirmed: true,
    confirmationPhrase: "ENVIAR",
    recipientIds: recipients.map((r) => r.id).filter(Boolean)
  });
  if (send.status >= 300) throw new Error("convocation send failed: " + send.text);

  const ci = await api(prez, "POST", `/api/assemblies/${assemblyId}/start-checkin`, {});
  if (ci.status >= 300) throw new Error("start-checkin failed: " + ci.text);

  return { phId, unitId, assemblyId, agendaId, email };
}

(async () => {
  const results = [];
  const ok = (id, pass, d) => {
    results.push({ id, pass: !!pass, d: String(d || "") });
    console.log(pass ? "PASS" : "FAIL", id, d || "");
  };

  const browser = await chromium.launch({ headless: true, ignoreHTTPSErrors: true });
  const password = loadPw();
  const prezCtx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 860 } });
  const ownerCtx = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });
  const prez = await prezCtx.newPage();
  const owner = await ownerCtx.newPage();

  try {
    await login(prez, "president@ocean.demo", password);
    const fx = await bootstrap(prez, owner, password);
    const { assemblyId, agendaId, unitId, email } = fx;
    ok("ASM", !!assemblyId, assemblyId);
    ok("OWNER_EMAIL", !!email, email);

    const me = await api(owner, "GET", "/api/auth/me");
    const ownerId = me.json?.userId || me.json?.id;
    ok("OWNER_USER", !!ownerId, ownerId);

    // Owner cannot open checkin desk
    await owner.goto(`${BASE}/checkin.html?assemblyId=${assemblyId}`, { waitUntil: "networkidle" });
    await owner.waitForTimeout(900);
    const onLobby = owner.url().includes("lobby.html");
    ok("OWNER_CHECKIN_REDIRECT", onLobby, owner.url());

    await owner.goto(`${BASE}/lobby.html?assemblyId=${assemblyId}`, { waitUntil: "networkidle" });
    await owner.waitForFunction(() => document.documentElement.dataset.lobbyHub, { timeout: 15000 }).catch(() => {});
    await owner.waitForTimeout(800);
    await owner.screenshot({ path: path.join(OUT, "01-lobby-390-pending.png"), fullPage: true });

    const pending = await owner.evaluate(() => {
      const text = [
        document.querySelector("#accreditation-banner")?.textContent,
        document.querySelector("#enter-hint")?.textContent,
        document.body.innerText
      ].join("\n");
      const tabs = [...document.querySelectorAll(".ia-asm-tab")].map((a) => a.textContent.trim());
      return {
        text,
        tabs,
        hasBad: /Acreditarme|Solicitar acreditación|Registrar mi asistencia|Confirmar acreditación/i.test(text),
        pendingMsg: /siendo validada|No necesita realizar ninguna acción/i.test(text),
        hasCheckinTab: tabs.some((t) => /Acreditación|Participantes/i.test(t))
      };
    });
    ok(
      "NO_SELF_ACCREDIT_UI",
      !pending.hasBad && !pending.hasCheckinTab,
      JSON.stringify({ tabs: pending.tabs, hasBad: pending.hasBad, hasCheckinTab: pending.hasCheckinTab })
    );
    ok("PENDING_COPY", pending.pendingMsg, pending.text.slice(0, 200));

    const denied = await api(owner, "POST", `/api/assemblies/${assemblyId}/attendance/check-in`, {
      presenceType: "Virtual",
      method: "SelfCheckIn",
      unitId
    });
    ok("API_403", denied.status === 403, String(denied.status));

    // President accredits while owner watches lobby
    const acred = await api(prez, "POST", `/api/assemblies/${assemblyId}/attendance/participants/${ownerId}/accredit`, {
      presenceType: "Virtual",
      method: "OperatorCheckIn",
      unitId
    });
    ok("ADMIN_ACCREDIT", acred.status < 300 && !!acred.json?.isAccredited, `${acred.status} ${acred.text.slice(0, 120)}`);

    let live = false;
    for (let i = 0; i < 40; i++) {
      await owner.waitForTimeout(500);
      const st = await owner.evaluate(() => {
        return (
          (document.querySelector("#accreditation-banner")?.textContent || "") +
          " " +
          (document.querySelector("#fact-accreditation")?.textContent || "") +
          " " +
          (document.querySelector("#enter-hint")?.textContent || "")
        );
      });
      if (/fue aprobada|Acreditado|Ya puede ingresar/i.test(st)) {
        live = true;
        break;
      }
    }
    ok("RT_APPROVED_NO_RELOAD", live, live ? "live-update" : "timeout");
    if (!live) {
      await owner.reload({ waitUntil: "networkidle" });
      await owner.waitForTimeout(800);
    }
    const after = await owner.evaluate(() => {
      return (
        (document.querySelector("#accreditation-banner")?.textContent || "") +
        " " +
        (document.querySelector("#enter-hint")?.textContent || "")
      );
    });
    ok(
      "APPROVED_COPY",
      /fue aprobada.*Ya puede ingresar|Ya puede ingresar y votar/i.test(after),
      after.slice(0, 180)
    );
    await owner.screenshot({ path: path.join(OUT, "02-lobby-390-approved.png"), fullPage: true });

    // Multi-viewport overflow lobby
    const viewports = [
      { w: 320, h: 568, name: "320" },
      { w: 360, h: 740, name: "360" },
      { w: 390, h: 844, name: "390" },
      { w: 412, h: 915, name: "412" },
      { w: 768, h: 1024, name: "tablet" },
      { w: 1366, h: 800, name: "desktop" }
    ];
    for (const vp of viewports) {
      await owner.setViewportSize({ width: vp.w, height: vp.h });
      await owner.waitForTimeout(350);
      await owner.screenshot({ path: path.join(OUT, `lobby-${vp.name}.png`), fullPage: true });
      const ov = await overflowCheck(owner);
      ok(`OVERFLOW_LOBBY_${vp.name}`, ov.overflow <= 8, JSON.stringify(ov));
    }

    // Presence required before voter eligibility (accreditation ≠ presence)
    const presentEarly = await api(owner, "POST", `/api/assemblies/${assemblyId}/attendance/presence`, {});
    ok("PRESENCE_BEFORE_VOTE", presentEarly.status < 300, String(presentEarly.status));

    // Start assembly + open voting (admin)
    const started = await api(prez, "POST", `/api/assemblies/${assemblyId}/start`, {});
    ok("ASM_START", started.status < 300, String(started.status));

    let motionId = null;
    if (agendaId) {
      const mot = await api(prez, "POST", `/api/assemblies/${assemblyId}/motions`, {
        agendaItemId: agendaId,
        code: "M-" + STAMP,
        title: "Aprueba presupuesto",
        body: "¿Aprueba el presupuesto?",
        questionText: "¿Aprueba el presupuesto anual de mantenimiento?",
        ballotKind: "FavorAgainstAbstain",
        calculationMethod: "Coefficient",
        decisionRuleCode: "SimpleMajority",
        optionsJson: JSON.stringify(["A favor", "En contra", "Abstención"])
      });
      motionId = mot.json?.id;
      ok("MOTION", !!motionId, `${mot.status}`);
      if (motionId) {
        await api(prez, "POST", `/api/assemblies/${assemblyId}/motions/present`, { motionId });
        const opened = await api(prez, "POST", `/api/assemblies/${assemblyId}/voting/open`, {
          motionId,
          hidePartialResults: true
        });
        ok("VOTE_OPEN", opened.status < 300, `${opened.status} ${opened.text.slice(0, 120)}`);
      }
    } else {
      ok("MOTION", false, "no agendaId");
      ok("VOTE_OPEN", false, "skipped");
    }

    // Enter assembly room (mobile)
    await owner.setViewportSize({ width: 390, height: 844 });
    await owner.goto(`${BASE}/lobby.html?assemblyId=${assemblyId}`, { waitUntil: "networkidle" });
    await owner.waitForTimeout(800);
    const enterBtn = owner.locator("#btn-enter");
    if (await enterBtn.isEnabled()) {
      await enterBtn.click();
      await owner.waitForTimeout(2500);
    } else {
      await owner.goto(`${BASE}/assembly.html?assemblyId=${assemblyId}`, { waitUntil: "networkidle" });
      await owner.waitForTimeout(2000);
    }
    await owner.screenshot({ path: path.join(OUT, "03-room-390.png"), fullPage: true });
    const roomOv = await overflowCheck(owner);
    ok("OVERFLOW_ROOM_390", roomOv.overflow <= 12, JSON.stringify(roomOv));

    const roomUi = await owner.evaluate(() => {
      const text = document.body.innerText;
      return {
        hasBad: /Acreditarme|Solicitar acreditación|Registrar mi asistencia/i.test(text),
        tapMin: [...document.querySelectorAll("button.btn, .sidebar-tab, .mvo__option, #btn-enter")]
          .slice(0, 16)
          .map((el) => {
            const r = el.getBoundingClientRect();
            return { h: Math.round(r.height), w: Math.round(r.width), t: (el.textContent || "").trim().slice(0, 24) };
          })
      };
    });
    ok("ROOM_NO_SELF_ACCREDIT", !roomUi.hasBad, "");
    const smallTaps = roomUi.tapMin.filter((b) => b.h > 0 && b.h < 40);
    ok("TOUCH_TARGETS", smallTaps.length === 0, JSON.stringify(smallTaps.slice(0, 5)));

    // Voting sheet UI
    await owner.waitForTimeout(1500);
    await owner.screenshot({ path: path.join(OUT, "04-vote-sheet-390.png"), fullPage: true });
    const voteOv = await overflowCheck(owner);
    ok("OVERFLOW_VOTE_390", voteOv.overflow <= 12, JSON.stringify(voteOv));

    const sheet = await owner.evaluate(() => {
      const opts = [...document.querySelectorAll(".mvo__option, [data-vote-option], button[data-option-id]")];
      const sheetEl = document.querySelector(".mvo__sheet:not([hidden]), .mvo:not([hidden]), #mobile-vote-overlay");
      return {
        sheet: !!sheetEl || opts.length > 0,
        options: opts.length,
        minH: opts.length ? Math.min(...opts.map((o) => o.getBoundingClientRect().height)) : 0,
        labels: opts.map((o) => (o.textContent || "").trim().slice(0, 40))
      };
    });
    ok("VOTE_SHEET_VISIBLE", sheet.sheet && sheet.options >= 2, JSON.stringify(sheet));
    ok("VOTE_OPTIONS_TOUCH", !sheet.options || sheet.minH >= 44, JSON.stringify(sheet));

    // Cast vote via UI if possible, else API + UI confirmation
    let castOk = false;
    let dupBlocked = false;
    if (sheet.options >= 2) {
      const firstOpt = owner.locator(".mvo__option").first();
      await firstOpt.click({ force: true });
      await owner.waitForTimeout(500);
      const confirm = owner.locator("[data-mvo-confirm]");
      if (await confirm.count()) {
        await confirm.first().click({ force: true });
        await owner.waitForTimeout(600);
      }
      const send = owner.locator("[data-mvo-send]");
      if (await send.count()) {
        await send.first().click({ force: true });
        await owner.waitForTimeout(2000);
      }
      const receipt = await owner.evaluate(() => {
        const t = document.body.innerText;
        return /registrado|comprobante|voto emitido|ya votó|gracias|ALREADY_VOTED|evidencia/i.test(t);
      });
      castOk = receipt;
      await owner.screenshot({ path: path.join(OUT, "05-vote-after-390.png"), fullPage: true });
    }

    const roomState = await api(owner, "GET", `/api/assemblies/${assemblyId}/room-state`);
    const openVote = roomState.json?.openVotingSession || roomState.json?.OpenVotingSession;
    const sessionId = openVote?.id || openVote?.sessionId;
    if (sessionId && !castOk) {
      const cast = await api(owner, "POST", `/api/assemblies/${assemblyId}/voting/${sessionId}/cast`, {
        choice: "InFavor",
        unitId,
        clientRequestId: `omc-cast-${STAMP}`
      });
      castOk = cast.status < 300;
      ok("VOTE_CAST_API", castOk, `${cast.status} ${cast.text.slice(0, 160)}`);
      const castDup = await api(owner, "POST", `/api/assemblies/${assemblyId}/voting/${sessionId}/cast`, {
        choice: "Against",
        unitId,
        clientRequestId: `omc-dup-${STAMP}`
      });
      dupBlocked = castDup.status >= 400;
      ok("VOTE_DUP_BLOCKED", dupBlocked, String(castDup.status));
    } else if (sessionId) {
      ok("VOTE_CAST_UI", castOk, castOk ? "ui-receipt" : "no-receipt");
      const castDup = await api(owner, "POST", `/api/assemblies/${assemblyId}/voting/${sessionId}/cast`, {
        choice: "Against",
        unitId,
        clientRequestId: `omc-dup-${STAMP}`
      });
      dupBlocked = castDup.status >= 400;
      ok("VOTE_DUP_BLOCKED", dupBlocked, String(castDup.status));
    } else {
      ok("VOTE_CAST_UI", false, "no session");
      ok("VOTE_DUP_BLOCKED", false, "no session");
    }

    // Room viewports
    for (const vp of [
      { w: 320, h: 568, name: "320" },
      { w: 360, h: 740, name: "360" },
      { w: 412, h: 915, name: "412" }
    ]) {
      await owner.setViewportSize({ width: vp.w, height: vp.h });
      await owner.waitForTimeout(300);
      await owner.screenshot({ path: path.join(OUT, `room-${vp.name}.png`), fullPage: true });
      const ov = await overflowCheck(owner);
      ok(`OVERFLOW_ROOM_${vp.name}`, ov.overflow <= 12, JSON.stringify(ov));
    }
  } catch (err) {
    ok("FATAL", false, String(err?.message || err).slice(0, 500));
    try {
      await owner.screenshot({ path: path.join(OUT, "fatal.png") });
    } catch {
      /* ignore */
    }
  } finally {
    const passed = results.filter((r) => r.pass).length;
    const failed = results.filter((r) => !r.pass).length;
    const criticalFail = results.some(
      (r) =>
        !r.pass &&
        /NO_SELF_ACCREDIT|PENDING_COPY|API_403|ADMIN_ACCREDIT|APPROVED_COPY|OVERFLOW_|ROOM_NO_SELF|VOTE_DUP|FATAL|ASM\b|OWNER_CHECKIN/.test(
          r.id
        )
    );
    const verdict = failed === 0 ? "CERTIFICADO" : criticalFail ? "NO CERTIFICADO" : "NO CERTIFICADO";
    fs.writeFileSync(
      path.join(OUT, "matrix.json"),
      JSON.stringify({ at: new Date().toISOString(), base: BASE, stamp: STAMP, passed, failed, verdict, results }, null, 2)
    );
    console.log("\nSUMMARY", passed, "pass /", failed, "fail →", OUT);
    console.log("VERDICT", verdict);
    await browser.close();
    process.exit(failed ? 1 : 0);
  }
})();
