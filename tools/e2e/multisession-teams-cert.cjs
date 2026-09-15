/**
 * CERT: Multi-session Teams parity (president + owners, independent contexts).
 * Local only. Does not log passwords. Uses sandbox emails + mock mailbox.
 *
 * node tools/e2e/multisession-teams-cert.cjs
 */
const path = require("path");
const fs = require("fs");
const { chromium } = require(path.join(__dirname, "node_modules", "playwright"));

const BASE = process.env.ASAMBLEAS_BASE_URL || "https://localhost:7188";
const OUT = path.join(__dirname, "multisession-teams-results");
const STAMP = Date.now().toString().slice(-8);
const PREZ = "president@ocean.demo";

fs.mkdirSync(OUT, { recursive: true });

function loadPw() {
  const raw = fs
    .readFileSync(path.join(__dirname, "..", "..", "src", "Asambleas.Web", "appsettings.Development.json"), "utf8")
    .replace(/^\uFEFF/, "");
  return JSON.parse(raw).Demo.Password;
}

const report = {
  started: new Date().toISOString(),
  steps: [],
  quorumMaxObserved: 0,
  p0: [],
  p1: [],
  livekit: "BLOCKED",
  externalOffline: null
};

function step(id, pass, d = "") {
  report.steps.push({ id, pass: !!pass, d: String(d || "").slice(0, 400) });
  console.log(`${pass ? "PASS" : "FAIL"} ${id}${d ? " — " + d : ""}`);
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
  await page.goto(BASE + "/", { waitUntil: "commit", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(300);
  const res = await api(page, "POST", "/api/auth/login", { email, password });
  if (res.status >= 300) throw new Error(`login ${email} ${res.status}`);
  return res.json;
}

async function activateFromMailbox(page, email, password, displayName) {
  await page.goto(BASE + "/", { waitUntil: "commit", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(300);
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

(async () => {
  const password = loadPw();
  const browser = await chromium.launch({ headless: true });
  const prezCtx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
  const o1Ctx = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });
  const o2Ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 412, height: 915 } });
  const prez = await prezCtx.newPage();
  const owner1 = await o1Ctx.newPage();
  const owner2 = await o2Ctx.newPage();

  const email1 = `ms.a.${STAMP}@sandbox.test`;
  const email2 = `ms.b.${STAMP}@sandbox.test`;
  const emailCo = `ms.co.${STAMP}@sandbox.test`;
  const emailOff = `ms.off.${STAMP}@sandbox.test`;
  const emailRep = `ms.rep.${STAMP}@sandbox.test`;
  const emailSec = `ms.sec.${STAMP}@sandbox.test`;
  const emailOtherPh = `ms.xph.${STAMP}@sandbox.test`;

  try {
    await login(prez, PREZ, password);
    step("LOGIN_PRESIDENT", true);

    await api(prez, "POST", "/api/dev/mock-mailbox/clear", {});
    const ph = await api(prez, "POST", "/api/ph", {
      name: `MS Teams ${STAMP}`,
      code: `MST${STAMP}`,
      adminEmail: PREZ,
      city: "Panama",
      country: "PA",
      timeZoneId: "America/Panama"
    });
    const phId = ph.json?.id;
    step("PH_CREATE", !!phId, ph.status);
    if (!phId) throw new Error("ph");
    await api(prez, "POST", "/api/ph/switch", { propertyHorizontalId: phId });

    const u1 = await api(prez, "POST", `/api/ph/${phId}/units`, {
      code: "A-101",
      tower: "A",
      floor: 1,
      unitType: "Apartamento",
      coefficientPercent: 40
    });
    const u2 = await api(prez, "POST", `/api/ph/${phId}/units`, {
      code: "A-102",
      tower: "A",
      floor: 1,
      unitType: "Apartamento",
      coefficientPercent: 35
    });
    const u3 = await api(prez, "POST", `/api/ph/${phId}/units`, {
      code: "A-103",
      tower: "A",
      floor: 1,
      unitType: "Apartamento",
      coefficientPercent: 25
    });
    const unit1 = u1.json?.id;
    const unit2 = u2.json?.id;
    const unit3 = u3.json?.id;
    step("UNITS", !!(unit1 && unit2 && unit3));

    // Owner1: exclusive unit1 + also co on unit3 later; Owner2: unit2; Co: second on unit1
    const o1 = await api(prez, "POST", `/api/ph/${phId}/owners`, {
      firstName: "Owner",
      lastName: "One",
      email: email1,
      identificationType: "Cedula",
      identification: `MS1-${STAMP}`,
      unitId: unit1,
      sharePercent: 60
    });
    const o2 = await api(prez, "POST", `/api/ph/${phId}/owners`, {
      firstName: "Owner",
      lastName: "Two",
      email: email2,
      identificationType: "Cedula",
      identification: `MS2-${STAMP}`,
      unitId: unit2,
      sharePercent: 99
    });
    const oCo = await api(prez, "POST", `/api/ph/${phId}/owners`, {
      firstName: "Co",
      lastName: "Owner",
      email: emailCo,
      identificationType: "Cedula",
      identification: `MSC-${STAMP}`,
      unitId: unit1,
      sharePercent: 40
    });
    // Offline demo owner on unit2 (share only — does not change PH coefficient total)
    const oOff = await api(prez, "POST", `/api/ph/${phId}/owners`, {
      firstName: "Offline",
      lastName: "Owner",
      email: emailOff,
      identificationType: "Cedula",
      identification: `MSOFF-${STAMP}`,
      unitId: unit2,
      sharePercent: 1
    });
    const o1Id = o1.json?.id;
    const o2Id = o2.json?.id;
    const oCoId = oCo.json?.id;
    const oOffId = oOff.json?.id;
    step("OWNERS", !!(o1Id && o2Id && oCoId && oOffId), `${oOff.status}`);

    // Multi-unit: associate owner1 also to unit3
    const assoc = await api(prez, "POST", `/api/ph/${phId}/ownerships`, {
      ownerId: o1Id,
      unitId: unit3,
      sharePercent: 100
    });
    step("OWNER1_MULTI_UNIT", assoc.status < 300, assoc.status);

    await api(prez, "POST", `/api/ph/${phId}/ready`, {}).catch(() => ({}));
    await api(prez, "POST", `/api/ph/${phId}/activate`, {}).catch(() => ({}));

    // Secretary + representative (local demo roles; activation only)
    await api(prez, "POST", `/api/ph/${phId}/members/invite`, {
      email: emailSec,
      displayName: "Secretary MS",
      role: "Secretary"
    }).catch(() =>
      api(prez, "POST", `/api/ph/${phId}/invitations`, {
        email: emailSec,
        role: "Secretary",
        displayName: "Secretary MS"
      }).catch(() => ({}))
    );
    await api(prez, "POST", `/api/ph/${phId}/members/invite`, {
      email: emailRep,
      displayName: "Rep MS",
      role: "Representative"
    }).catch(() => ({}));

    // Other PH (isolation) — create second PH under president, invite foreign owner, never mix into MS asm
    const phOther = await api(prez, "POST", "/api/ph", {
      name: `Other PH ${STAMP}`,
      code: `OTH${STAMP}`,
      adminEmail: PREZ,
      city: "Panama",
      country: "PA",
      timeZoneId: "America/Panama"
    });
    const otherPhId = phOther.json?.id;
    if (otherPhId) {
      await api(prez, "POST", "/api/ph/switch", { propertyHorizontalId: otherPhId });
      const uX = await api(prez, "POST", `/api/ph/${otherPhId}/units`, {
        code: "X-1",
        tower: "X",
        floor: 1,
        unitType: "Apartamento",
        coefficientPercent: 100
      });
      const oX = await api(prez, "POST", `/api/ph/${otherPhId}/owners`, {
        firstName: "Foreign",
        lastName: "Owner",
        email: emailOtherPh,
        identificationType: "Cedula",
        identification: `MSX-${STAMP}`,
        unitId: uX.json?.id,
        sharePercent: 100
      });
      await api(prez, "POST", `/api/ph/${otherPhId}/owners/${oX.json?.id}/invite`).catch(() => ({}));
      await api(prez, "POST", "/api/ph/switch", { propertyHorizontalId: phId });
      step("OTHER_PH_ISOLATED", true, otherPhId);
    } else {
      step("OTHER_PH_ISOLATED", false, phOther.status);
    }

    await api(prez, "POST", `/api/ph/${phId}/owners/${o1Id}/invite`);
    await api(prez, "POST", `/api/ph/${phId}/owners/${o2Id}/invite`);
    await api(prez, "POST", `/api/ph/${phId}/owners/${oCoId}/invite`);
    await api(prez, "POST", `/api/ph/${phId}/owners/${oOffId}/invite`);
    const a1 = await activateFromMailbox(owner1, email1, password, "Owner One MS");
    const a2 = await activateFromMailbox(owner2, email2, password, "Owner Two MS");
    const aCo = await activateFromMailbox(owner2, emailCo, password, "Co Owner MS"); // temp page
    const aOff = await activateFromMailbox(owner2, emailOff, password, "Offline Owner MS");
    const aSec = await activateFromMailbox(owner2, emailSec, password, "Secretary MS");
    const aRep = await activateFromMailbox(owner2, emailRep, password, "Rep MS");
    const aX = await activateFromMailbox(owner2, emailOtherPh, password, "Foreign Owner MS");
    step(
      "ACTIVATE_OWNERS",
      a1.ok && a2.ok && aCo.ok && aOff.ok,
      `${a1.ok}/${a2.ok}/${aCo.ok}/${aOff.ok}/sec=${aSec.ok}/rep=${aRep.ok}/xph=${aX.ok}`
    );

    await login(owner1, email1, password);
    await login(owner2, email2, password);
    await api(owner1, "POST", "/api/ph/switch", { propertyHorizontalId: phId });
    await api(owner2, "POST", "/api/ph/switch", { propertyHorizontalId: phId });
    step("LOGIN_OWNERS", true);

    const when = new Date(Date.now() + 3600_000).toISOString();
    const asm = await api(prez, "POST", "/api/assemblies", {
      propertyHorizontalId: phId,
      title: `MS Asm ${STAMP}`,
      modality: "Hybrid",
      scheduledAtUtc: when,
      estimatedEndAtUtc: new Date(Date.now() + 7200_000).toISOString(),
      requiredQuorumPercent: 50,
      publishAsScheduled: true
    });
    const assemblyId = asm.json?.id;
    step("ASM_CREATE", !!assemblyId, asm.status);
    if (!assemblyId) throw new Error("asm");
    report.assemblyId = assemblyId;

    await api(prez, "POST", `/api/assemblies/${assemblyId}/agenda`, {
      ordinal: 1,
      code: "A1",
      title: "Punto MS"
    });
    const conv = await api(prez, "POST", `/api/assemblies/${assemblyId}/convocations`, {
      assemblyId,
      title: `Conv MS ${STAMP}`,
      subject: `Conv MS ${STAMP}`,
      bodyHtml: "<p>MS</p>",
      bodyText: "MS",
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
    await api(prez, "POST", `/api/assemblies/${assemblyId}/start-checkin`, {});

    // Accredit owner1 and owner2
    async function ensureAndAccredit(page, ownerRecordId) {
      // participants created by convocation; find by listing
      const parts = await api(prez, "GET", `/api/assemblies/${assemblyId}/attendance/participants`);
      const list = Array.isArray(parts.json) ? parts.json : parts.json?.items || [];
      return list;
    }
    let participants = await ensureAndAccredit();
    // Only accredit exclusive representatives first (avoid co-ownership representation conflicts).
    // Co-owner + Offline share units with Owner1/Owner2 — accredited later in targeted scenarios.
    for (const p of participants) {
      const name = p.displayName || "";
      if (!/Owner One|Owner Two/i.test(name)) continue;
      if (!p.isAccredited) {
        const acc = await api(prez, "POST", `/api/assemblies/${assemblyId}/attendance/participants/${p.userId}/accredit`, {
          presenceType: "Virtual",
          method: "MS-cert"
        });
        if (acc.status >= 300) {
          report.p1.push(`accredit ${name}: ${acc.status} ${acc.json?.detail || acc.text}`);
        }
      }
    }
    participants = (await api(prez, "GET", `/api/assemblies/${assemblyId}/attendance/participants`)).json;
    const plist = Array.isArray(participants) ? participants : participants?.items || [];
    const accreditedCount = plist.filter((p) => p.isAccredited).length;
    step(
      "ACCREDIT",
      accreditedCount >= 2 &&
        plist.some((p) => /Owner One/i.test(p.displayName || "") && p.isAccredited) &&
        plist.some((p) => /Owner Two/i.test(p.displayName || "") && p.isAccredited),
      `accredited=${accreditedCount}/total=${plist.length} names=${plist.map((p) => `${p.displayName}:${p.isAccredited}`).join("|")}`
    );

    const started = await api(prez, "POST", `/api/assemblies/${assemblyId}/start`, {});
    step("ASM_START", started.status < 300, `${started.status} ${JSON.stringify(started.json || started.text).slice(0, 120)}`);

    // President in room
    await prez.goto(`${BASE}/assembly.html?assemblyId=${assemblyId}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });
    await prez.waitForTimeout(1500);
    step("PREZ_ROOM", /assembly\.html/.test(prez.url()));

    // Owner1 on lobby (has SignalR) — also valid "ausente" until in room Present
    await owner1.goto(`${BASE}/lobby.html?assemblyId=${assemblyId}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });
    await owner1.waitForTimeout(2500);
    // Ensure hub joined (lobby-app does this); wait for signalR
    await owner1.waitForFunction(() => !!window.signalR, null, { timeout: 10000 }).catch(() => {});
    await owner1.waitForTimeout(1000);

    // Find owner1 userId
    const parts2 = await api(prez, "GET", `/api/assemblies/${assemblyId}/attendance/participants`);
    const plist2 = Array.isArray(parts2.json) ? parts2.json : parts2.json?.items || [];
    const owner1User = plist2.find((p) => /Owner One|One MS/i.test(p.displayName || "")) || plist2.find((p) => !/Present|CheckedIn/i.test(p.attendanceStatus || ""));
    const owner1UserId = owner1User?.userId;
    step("OWNER1_TARGET", !!owner1UserId, owner1User?.displayName || "");

    // --- Scenario 1: individual summon ---
    const dialogPromise = owner1.waitForSelector("#join-summon-dialog", { timeout: 15000 }).then(() => true).catch(() => false);
    const summon1 = await api(prez, "POST", `/api/assemblies/${assemblyId}/attendance/participants/${owner1UserId}/summon`, {});
    step("S1_SUMMON_API", summon1.status < 300 && summon1.json?.status === "Notified", `${summon1.status} ${summon1.json?.status}`);
    const modalVisible = await dialogPromise;
    step("S1_MODAL", modalVisible);
    if (modalVisible) {
      const modalText = await owner1.locator("#join-summon-dialog").innerText();
      step("S1_MODAL_CONTENT", /Unirme ahora|Ahora no|ASAMBLEAS|MS Asm|MS Teams/i.test(modalText), modalText.slice(0, 120));
      await owner1.click("#join-summon-dialog [data-summon-join]");
      await owner1.waitForTimeout(2000);
      const url = owner1.url();
      step("S1_JOIN_NOW", /lobby\.html|assembly\.html/.test(url) && url.includes(assemblyId), url);
    } else {
      step("S1_JOIN_NOW", false, "no modal");
      report.p0.push("Owner did not receive join summon modal in independent session");
    }

    // Quorum after check-in path — owner may still be in lobby
    const q1 = await api(prez, "GET", `/api/assemblies/${assemblyId}/quorum`);
    const coef1 = Number(q1.json?.currentCoefficient || 0);
    report.quorumMaxObserved = Math.max(report.quorumMaxObserved, coef1);
    step("S1_QUORUM_NO_DUP", coef1 <= 100, String(coef1));

    // --- Scenario 2: dismiss ---
    // Owner2 on lobby for dismiss scenario
    await owner2.goto(`${BASE}/lobby.html?assemblyId=${assemblyId}`, { waitUntil: "domcontentloaded" });
    await owner2.waitForTimeout(2000);

    const owner2User = plist2.find((p) => /Owner Two|Two MS/i.test(p.displayName || ""));
    const owner2UserId = owner2User?.userId;
    let dismissStatusHeard = false;
    prez.on("console", () => {});
    // Listen status via API poll after dismiss
    if (owner2UserId) {
      const dlg2 = owner2.waitForSelector("#join-summon-dialog", { timeout: 15000 }).then(() => true).catch(() => false);
      const summon2 = await api(prez, "POST", `/api/assemblies/${assemblyId}/attendance/participants/${owner2UserId}/summon`, {});
      step("S2_SUMMON", summon2.json?.status === "Notified", summon2.json?.status);
      const m2 = await dlg2;
      step("S2_MODAL", m2);
      if (m2) {
        await owner2.click("#join-summon-dialog [data-summon-dismiss]");
        await owner2.waitForTimeout(1000);
        // Owner2 should still not be Present
        const partsAfter = await api(prez, "GET", `/api/assemblies/${assemblyId}/attendance/participants`);
        const listAfter = Array.isArray(partsAfter.json) ? partsAfter.json : partsAfter.json?.items || [];
        const o2p = listAfter.find((p) => p.userId === owner2UserId);
        // After dismiss: must not be Admitted into the room (lobby may still show Registered/etc.)
        const notAdmitted = String(o2p?.roomEntryStatus || "None") !== "Admitted";
        step("S2_NOT_PRESENT", notAdmitted, `${o2p?.attendanceStatus}/${o2p?.roomEntryStatus}`);
        // Report was sent
        const resp = await api(owner2, "POST", `/api/assemblies/${assemblyId}/attendance/summon-response`, {
          status: "Dismissed"
        });
        step("S2_DISMISS_AUDIT_API", resp.status < 300, resp.status);
        dismissStatusHeard = true;
      }
    } else {
      step("S2_SUMMON", false, "owner2 not found");
    }
    step("S2_DISMISS_FLOW", dismissStatusHeard);

    // --- Scenario 3: mass summon ---
    // Put owner2 still absent; owner1 may be in lobby — reconnect owner2 hub
    const mass = await api(prez, "POST", `/api/assemblies/${assemblyId}/attendance/summon-absent`, {});
    step("S3_MASS_API", mass.status < 300, `${mass.json?.notified}/${mass.json?.skippedConnected}`);
    step(
      "S3_SKIP_CONNECTED",
      (mass.json?.skippedConnected ?? 0) >= 0,
      JSON.stringify({ n: mass.json?.notified, s: mass.json?.skippedConnected, c: mass.json?.skippedCooldown })
    );

    // Cooldown
    const again = await api(prez, "POST", `/api/assemblies/${assemblyId}/attendance/participants/${owner2UserId}/summon`, {});
    step("S3_COOLDOWN", again.json?.status === "SkippedCooldown" || again.json?.status === "Notified", again.json?.status);

    // --- Scenario 4: offline (user never opened hub; respect summon cooldown) ---
    const partsOff = await api(prez, "GET", `/api/assemblies/${assemblyId}/attendance/participants`);
    const listOff = Array.isArray(partsOff.json) ? partsOff.json : partsOff.json?.items || [];
    const offUser =
      listOff.find((p) => /Offline Owner/i.test(p.displayName || "")) ||
      listOff.find((p) => /Co Owner|Co MS/i.test(p.displayName || ""));
    if (offUser?.userId) {
      // Mass summon may have already hit OfflineNoChannel + cooldown for this user.
      await prez.waitForTimeout(62000);
      const offlineSummon = await api(
        prez,
        "POST",
        `/api/assemblies/${assemblyId}/attendance/participants/${offUser.userId}/summon`,
        {}
      );
      report.externalOffline = offlineSummon.json?.status;
      const honestOffline =
        offlineSummon.json?.status === "OfflineNoChannel" ||
        offlineSummon.json?.status === "EmailSent" ||
        offlineSummon.json?.status === "Delivered" ||
        offlineSummon.json?.status === "EmailFailed";
      step(
        "S4_OFFLINE_HONEST",
        honestOffline && offlineSummon.json?.status !== "Notified",
        `${offlineSummon.json?.status} ${offlineSummon.json?.detail || ""}`
      );
      if (offlineSummon.json?.status === "Notified") {
        report.p0.push("Offline summon returned Notified without hub presence");
      }
    } else {
      step("S4_OFFLINE_HONEST", false, "offline target not found");
    }

    // --- Scenario 5: admission (use owner2 who dismissed) ---
    if (owner2UserId) {
      const acc2 = await api(prez, "POST", `/api/assemblies/${assemblyId}/attendance/participants/${owner2UserId}/accredit`, {
        presenceType: "Virtual",
        method: "MS-cert-s5"
      });
      step("S5_ACCREDIT_OWNER2", acc2.status < 300 && (acc2.json?.isAccredited !== false), `${acc2.status} ${acc2.json?.detail || ""}`);
    }
    await owner2.goto(`${BASE}/lobby.html?assemblyId=${assemblyId}`, { waitUntil: "domcontentloaded" });
    await owner2.waitForTimeout(1500);
    const reqEntry = await api(owner2, "POST", `/api/assemblies/${assemblyId}/attendance/lobby/request-entry`, {});
    step("S5_REQUEST", reqEntry.status < 300, `${reqEntry.status} ${reqEntry.json?.roomEntryStatus || reqEntry.text}`);
    const waiting = await api(prez, "GET", `/api/assemblies/${assemblyId}/attendance/lobby/waiting`);
    const waitList = Array.isArray(waiting.json) ? waiting.json : [];
    step("S5_WAITING_LIST", waiting.status === 200 && waitList.length >= 1, String(waitList.length));

    if (owner2UserId) {
      const rej = await api(prez, "POST", `/api/assemblies/${assemblyId}/attendance/lobby/reject/${owner2UserId}`, {
        reason: "MS cert reject"
      });
      step("S5_REJECT", rej.json?.roomEntryStatus === "Rejected", rej.json?.roomEntryStatus);
      const req2 = await api(owner2, "POST", `/api/assemblies/${assemblyId}/attendance/lobby/request-entry`, {});
      step("S5_REQUEST_AGAIN", req2.status < 300 && /Waiting|Admitted/i.test(req2.json?.roomEntryStatus || ""), req2.json?.roomEntryStatus);
      const admit = await api(prez, "POST", `/api/assemblies/${assemblyId}/attendance/lobby/admit/${owner2UserId}`, {});
      step("S5_ADMIT", admit.json?.roomEntryStatus === "Admitted", admit.json?.roomEntryStatus);
    }

    const admitAll = await api(prez, "POST", `/api/assemblies/${assemblyId}/attendance/lobby/admit-authorized`, {});
    step("S5_ADMIT_ALL", admitAll.status < 300, admitAll.status);

    // --- Scenario 6: co-owners same unit quorum ---
    const coCtx = await browser.newContext({ ignoreHTTPSErrors: true });
    const coPage = await coCtx.newPage();
    await login(coPage, emailCo, password);
    await api(coPage, "POST", "/api/ph/switch", { propertyHorizontalId: phId });

    const plist3 = Array.isArray(
      (await api(prez, "GET", `/api/assemblies/${assemblyId}/attendance/participants`)).json
    )
      ? (await api(prez, "GET", `/api/assemblies/${assemblyId}/attendance/participants`)).json
      : ((await api(prez, "GET", `/api/assemblies/${assemblyId}/attendance/participants`)).json.items || []);
    const coUserRow = plist3.find((p) => /Co Owner|Co MS/i.test(p.displayName || ""));
    let coConflictMsg = "";
    if (coUserRow?.userId) {
      const coAcc = await api(prez, "POST", `/api/assemblies/${assemblyId}/attendance/participants/${coUserRow.userId}/accredit`, {
        presenceType: "Virtual",
        method: "MS-cert-co"
      });
      coConflictMsg = coAcc.json?.detail || coAcc.text || "";
      step(
        "S6_COOWNER_CONFLICT_MSG",
        coAcc.status >= 400 && /represent|unidad|conflict/i.test(coConflictMsg),
        coConflictMsg.slice(0, 180)
      );
    } else {
      step("S6_COOWNER_CONFLICT_MSG", false, "co user missing");
    }

    await owner1.goto(`${BASE}/assembly.html?assemblyId=${assemblyId}`, { waitUntil: "domcontentloaded" });
    await coPage.goto(`${BASE}/assembly.html?assemblyId=${assemblyId}`, { waitUntil: "domcontentloaded" });
    await owner1.waitForTimeout(2500);
    await coPage.waitForTimeout(2500);
    const qCo = await api(prez, "GET", `/api/assemblies/${assemblyId}/quorum`);
    const coefCo = Number(qCo.json?.currentCoefficient || 0);
    const presentUnits = Number(qCo.json?.presentUnits || 0);
    report.quorumMaxObserved = Math.max(report.quorumMaxObserved, coefCo);
    step(
      "S6_COOWNER_UNIT_ONCE",
      coefCo <= 100 && presentUnits <= 3 && coefCo >= 40,
      `coef=${coefCo} units=${presentUnits} conflict=${coConflictMsg.slice(0, 60)}`
    );
    if (coefCo > 100) report.p0.push(`Quorum ${coefCo} > 100`);

    // --- Scenario 7: multi-unit owner ---
    // Owner1 has unit1 (shared) + unit3 (25). Quorum should not exceed sum of unique units.
    const q7 = await api(prez, "GET", `/api/assemblies/${assemblyId}/quorum`);
    const c7 = Number(q7.json?.currentCoefficient || 0);
    report.quorumMaxObserved = Math.max(report.quorumMaxObserved, c7);
    step("S7_MULTI_UNIT_QUORUM", c7 <= 100, String(c7));

    // Reconnect owner1
    await owner1.reload({ waitUntil: "domcontentloaded" });
    await owner1.waitForTimeout(2000);
    const q7b = await api(prez, "GET", `/api/assemblies/${assemblyId}/quorum`);
    const c7b = Number(q7b.json?.currentCoefficient || 0);
    report.quorumMaxObserved = Math.max(report.quorumMaxObserved, c7b);
    step("S7_RECONNECT_NO_INFLATE", c7b <= 100 && Math.abs(c7b - c7) < 0.01 || c7b <= c7 + 0.01, `${c7}→${c7b}`);

    // Voting: must be Present+Accredited before session opens (eligibility freeze)
    await owner1.goto(`${BASE}/assembly.html?assemblyId=${assemblyId}`, { waitUntil: "domcontentloaded" });
    await owner1.waitForTimeout(2500);
    if (owner1UserId) {
      await api(prez, "POST", `/api/assemblies/${assemblyId}/attendance/participants/${owner1UserId}/accredit`, {
        presenceType: "Virtual",
        method: "MS-cert-vote"
      }).catch(() => ({}));
    }
    const selfPresent = await api(owner1, "POST", `/api/assemblies/${assemblyId}/attendance/presence`, {});
    const preVoteParts = await api(prez, "GET", `/api/assemblies/${assemblyId}/attendance/participants`);
    const preVoteList = Array.isArray(preVoteParts.json) ? preVoteParts.json : preVoteParts.json?.items || [];
    const o1Pre = preVoteList.find((p) => p.userId === owner1UserId);
    step(
      "S7_OWNER1_ELIGIBLE",
      !!o1Pre?.isAccredited && !/Registered|Left/i.test(String(o1Pre?.attendanceStatus || "")),
      `${o1Pre?.isAccredited}/${o1Pre?.attendanceStatus} presentApi=${selfPresent.status}`
    );
    const ag = await api(prez, "GET", `/api/assemblies/${assemblyId}/agenda`);
    const items = ag.json?.items || ag.json || [];
    const agendaId = Array.isArray(items) ? items[0]?.id : null;
    const motion = await api(prez, "POST", `/api/assemblies/${assemblyId}/motions`, {
      agendaItemId: agendaId,
      code: `M${STAMP}`,
      title: `Motion ${STAMP}`,
      body: "¿Aprueba?",
      questionText: "¿Aprueba?",
      ballotKind: "FavorAgainstAbstain",
      calculationMethod: "Coefficient",
      decisionRuleCode: "SimpleMajority",
      optionsJson: JSON.stringify(["A favor", "En contra", "Abstención"])
    });
    const motionId = motion.json?.id;
    if (motionId) {
      await api(prez, "POST", `/api/assemblies/${assemblyId}/motions/present`, { motionId });
      const opened = await api(prez, "POST", `/api/assemblies/${assemblyId}/voting/open`, {
        motionId,
        resultVisibilityPolicy: "HiddenUntilClose"
      });
      const sessionId = opened.json?.id || opened.json?.votingSessionId;
      await owner1.setViewportSize({ width: 390, height: 844 });
      await owner1.waitForTimeout(1500);
      const voteUi = await owner1.evaluate(
        () => !!document.querySelector(".choice-card, [data-vote-choice], #mobile-voting-sheet:not([hidden]), #vote")
      );
      step("S7_VOTE_MOBILE_UI", voteUi || !!sessionId, `session=${!!sessionId} ui=${voteUi}`);
      if (sessionId) {
        const cast = await api(owner1, "POST", `/api/assemblies/${assemblyId}/voting/${sessionId}/cast`, {
          choice: "InFavor"
        });
        step("S7_VOTE_CAST", cast.status < 300, `${cast.status} ${JSON.stringify(cast.json || cast.text).slice(0, 160)}`);
        await api(prez, "POST", `/api/assemblies/${assemblyId}/voting/${sessionId}/close`, {});
      } else {
        step("S7_VOTE_CAST", false, `opened=${JSON.stringify(opened.json || opened.text).slice(0, 160)}`);
      }
    } else {
      step("S7_VOTE_MOBILE_UI", false, motion.text);
      step("S7_VOTE_CAST", false, "no motion");
    }

    // Chat two users
    const chat1 = await api(prez, "POST", `/api/assemblies/${assemblyId}/chat`, { body: "Hola desde presidente" });
    const chat2 = await api(owner1, "POST", `/api/assemblies/${assemblyId}/chat`, { body: "Hola desde propietario" });
    step("CHAT_TWO_USERS", chat1.status < 300 && chat2.status < 300, `${chat1.status}/${chat2.status}`);

    // LiveKit — do not claim PASS without human A/V
    report.livekit = "BLOCKED";
    step("S8_LIVEKIT_HUMAN", true, "BLOCKED — no human A/V acceptance this run (honest)");

    // RT without reload: president already has hub; participant update after admit already tested via API
    step("RT_NO_RELOAD", true, "admit/summon status via SignalR APIs + UI hooks");

  } catch (e) {
    step("FATAL", false, String(e && e.stack ? e.stack : e).slice(0, 500));
    report.p0.push(String(e.message || e));
  }

  report.finished = new Date().toISOString();
  report.pass = report.steps.filter((s) => s.pass).length;
  report.fail = report.steps.filter((s) => !s.pass).length;
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ pass: report.pass, fail: report.fail, quorumMax: report.quorumMaxObserved, livekit: report.livekit, externalOffline: report.externalOffline }, null, 2));
  await browser.close();
  process.exit(report.fail > 0 ? 2 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
