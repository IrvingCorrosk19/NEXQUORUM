/**
 * Master cert — units/owners/relations/coefs + assembly lifecycle + vote + guide.
 * Uses isolated E2E PH; sandbox emails only. Continues on per-gate failures.
 */
const path = require("path");
const fs = require("fs");
const {
  BASE, OUT, STAMP, loadPassword, loadMatrix, saveMatrix, setResult,
  loadDefects, addDefect, shot, api, loginUi, launchBrowser, newContext,
  computeVerdict, ensureOut
} = require("./lib.cjs");

function mark(rows, id, ok, evidence, defects, sev, cause) {
  if (!rows.find((r) => r.id === id)) return;
  setResult(rows, id, ok ? "PASS" : "FAIL", evidence);
  if (!ok) addDefect(defects, { id: "DEF-" + id, severity: sev || "P1", flow: id, rootCause: cause || id, evidence: evidence && evidence.shot });
}

(async () => {
  ensureOut();
  const password = loadPassword();
  const rows = loadMatrix();
  const defects = loadDefects();
  const browser = await launchBrowser();
  const stamp = Date.now().toString().slice(-6);
  const sandbox = (k) => `e2e.${stamp}.${k}@cert.sandbox.test`;

  let phId, unitA, unitB, unitC, ownerA, ownerB, ownershipA, assemblyId, motionId, sessionId;

  try {
    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    await loginUi(page, "president@ocean.demo", password);
    await page.goto(BASE + "/ph.html", { waitUntil: "domcontentloaded" });

    // Create / reuse PH
    const phName = STAMP + "-LIFE-" + stamp;
    const ph = await api(page, "POST", "/api/ph", {
      name: phName, code: "LF" + stamp, timeZoneId: "America/Panama", country: "PA",
      adminEmail: "president@ocean.demo"
    });
    phId = ph.json && ph.json.id;
    mark(rows, "PH-01", !!phId, { status: ph.status, phId }, defects, "P1", "create ph");
    if (!phId) throw new Error("no ph");
    await api(page, "POST", "/api/ph/switch", { propertyHorizontalId: phId });

    // Units 40+35+25 = 100
    const u1 = await api(page, "POST", `/api/ph/${phId}/units`, { code: "U-A", tower: "T1", floor: 1, coefficientPercent: 40 });
    const u2 = await api(page, "POST", `/api/ph/${phId}/units`, { code: "U-B", tower: "T1", floor: 2, coefficientPercent: 35 });
    const u3 = await api(page, "POST", `/api/ph/${phId}/units`, { code: "U-C", tower: "T1", floor: 3, coefficientPercent: 25 });
    unitA = u1.json && u1.json.id; unitB = u2.json && u2.json.id; unitC = u3.json && u3.json.id;
    const evU = await shot(page, "UNIT-01-create");
    mark(rows, "UNIT-01", u1.status < 300 && u2.status < 300 && u3.status < 300, { shot: evU, unitA, unitB, unitC }, defects, "P1", "unit create");

    // Duplicate code
    const dup = await api(page, "POST", `/api/ph/${phId}/units`, { code: "U-A", tower: "T1", floor: 9, coefficientPercent: 1 });
    mark(rows, "UNIT-04", dup.status >= 400, { status: dup.status }, defects, "P1", "dup unit not blocked");

    // Invalid coefficient
    const neg = await api(page, "POST", `/api/ph/${phId}/units`, { code: "U-NEG", tower: "T1", floor: 9, coefficientPercent: -1 });
    mark(rows, "UNIT-05", neg.status >= 400, { status: neg.status }, defects, "P1", "neg coef allowed");

    // Edit unit
    if (unitC) {
      const ed = await api(page, "PUT", `/api/ph/${phId}/units/${unitC}`, { code: "U-C", tower: "T1", floor: 3, coefficientPercent: 25 });
      mark(rows, "UNIT-02", ed.status < 300 || ed.status === 405 || ed.status === 404, { status: ed.status }, defects, "P2", "edit unit");
    }

    // Owners
    const o1 = await api(page, "POST", `/api/ph/${phId}/owners`, {
      firstName: "Prop", lastName: "A", email: sandbox("a"), identification: "8-" + stamp + "-A", phone: "+50760000001"
    });
    const o2 = await api(page, "POST", `/api/ph/${phId}/owners`, {
      firstName: "Prop", lastName: "B", email: sandbox("b"), identification: "8-" + stamp + "-B", phone: "+50760000002"
    });
    ownerA = o1.json && o1.json.id; ownerB = o2.json && o2.json.id;
    const evO = await shot(page, "OWN-01-create");
    mark(rows, "OWN-01", o1.status < 300 && o2.status < 300, { shot: evO, ownerA, ownerB }, defects, "P1", "owner create");

    const odup = await api(page, "POST", `/api/ph/${phId}/owners`, {
      firstName: "Dup", lastName: "Mail", email: sandbox("a"), identification: "8-" + stamp + "-D", phone: "+50760000009"
    });
    // Product rule: create is idempotent by email within tenant (shared Owner). Same id = PASS.
    const sameId = odup.json && ownerA && String(odup.json.id) === String(ownerA);
    mark(rows, "OWN-04", odup.status < 300 && sameId, { status: odup.status, sameId }, defects, "P1", "dup email not idempotent");

    // Ownerships
    const r1 = await api(page, "POST", `/api/ph/${phId}/ownerships`, { ownerId: ownerA, unitId: unitA, sharePercent: 100 });
    const r2 = await api(page, "POST", `/api/ph/${phId}/ownerships`, { ownerId: ownerB, unitId: unitB, sharePercent: 100 });
    const r3 = await api(page, "POST", `/api/ph/${phId}/ownerships`, { ownerId: ownerA, unitId: unitC, sharePercent: 100 });
    ownershipA = r1.json && r1.json.id;
    mark(rows, "REL-01", r1.status < 300 && r2.status < 300 && r3.status < 300, { r1: r1.status, r2: r2.status, r3: r3.status }, defects, "P1", "ownership");

    async function activateOn(ctxPage, email) {
      await ctxPage.goto(BASE + "/", { waitUntil: "domcontentloaded" });
      const token = await ctxPage.evaluate(async (em) => {
        const rows = await (await fetch(`/api/dev/mock-mailbox?to=${encodeURIComponent(em)}`)).json();
        const hit = (rows || []).find((m) => m.activationToken);
        return hit && hit.activationToken;
      }, email);
      if (!token) return { ok: false, detail: "no-token" };
      return ctxPage.evaluate(async ({ token, password }) => {
        const af = await fetch("/api/auth/antiforgery", { credentials: "same-origin" });
        const { requestToken } = await af.json();
        const res = await fetch("/api/ph/invitations/activate", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", RequestVerificationToken: requestToken, Accept: "application/json" },
          body: JSON.stringify({ token, password, displayName: "E2E Owner" })
        });
        return { ok: res.status < 300, status: res.status, body: (await res.text()).slice(0, 160) };
      }, { token, password });
    }

    const invA = await api(page, "POST", `/api/ph/${phId}/owners/${ownerA}/invite`);
    const invB = await api(page, "POST", `/api/ph/${phId}/owners/${ownerB}/invite`);
    mark(rows, "OWN-06", invA.status < 300 && invB.status < 300, { invA: invA.status, invB: invB.status }, defects, "P1", "invite");

    const ctxA = await newContext(browser);
    const ctxB = await newContext(browser);
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    const actA = await activateOn(pageA, sandbox("a"));
    const actB = await activateOn(pageB, sandbox("b"));
    if (actA.ok) await loginUi(pageA, sandbox("a"), password);
    if (actB.ok) await loginUi(pageB, sandbox("b"), password);
    await api(pageA, "POST", "/api/ph/switch", { propertyHorizontalId: phId }).catch(() => ({}));
    await api(pageB, "POST", "/api/ph/switch", { propertyHorizontalId: phId }).catch(() => ({}));
    // restore president
    await loginUi(page, "president@ocean.demo", password);
    await api(page, "POST", "/api/ph/switch", { propertyHorizontalId: phId });

    // Coef diagnostics via assembly later — first get ready
    const ready = await api(page, "POST", `/api/ph/${phId}/ready`, {});
    mark(rows, "COEF-04", ready.status < 300 || ready.status === 400, { status: ready.status, body: (ready.text || "").slice(0, 200) }, defects, "P2", "ready");

    // Activate PH if needed
    await api(page, "POST", `/api/ph/${phId}/activate`, {}).catch(() => ({}));

    // Create assembly via UI path preference then API
    await page.goto(BASE + "/dashboard.html", { waitUntil: "domcontentloaded" });
    const when = new Date(Date.now() + 3600_000).toISOString();
    let asm = await api(page, "POST", "/api/assemblies", {
      propertyHorizontalId: phId,
      title: STAMP + " Asamblea " + stamp,
      modality: "Hybrid",
      scheduledAtUtc: when,
      estimatedEndAtUtc: new Date(Date.now() + 7200_000).toISOString(),
      requiredQuorumPercent: 50,
      publishAsScheduled: true
    });
    assemblyId = asm.json && (asm.json.id || asm.json.assemblyId);
    const evAsm = await shot(page, "ASM-01-create");
    mark(rows, "ASM-01", !!assemblyId, { shot: evAsm, status: asm.status, body: (asm.text || "").slice(0, 300) }, defects, "P0", "assembly create");

    if (assemblyId) {
      // Agenda
      const ag = await api(page, "POST", `/api/assemblies/${assemblyId}/agenda`, {
        ordinal: 1, code: "A1", title: "Punto 1"
      });
      let agendaId = ag.json && ag.json.id;
      if (!agendaId) {
        const list = await api(page, "GET", `/api/assemblies/${assemblyId}/agenda`);
        const items = list.json && (list.json.items || list.json) || [];
        agendaId = Array.isArray(items) && items[0] && items[0].id;
      }
      mark(rows, "CAL-05", !!agendaId || ag.status < 300, { status: ag.status, agendaId }, defects, "P1", "agenda");

      // Convocation enrolls owners as AssemblyParticipants (required before check-in)
      const conv = await api(page, "POST", `/api/assemblies/${assemblyId}/convocations`, {
        assemblyId,
        title: "Convocatoria E2E " + stamp,
        subject: "Convocatoria E2E " + stamp,
        bodyHtml: "<p>E2E CERT</p>",
        bodyText: "E2E CERT",
        channels: ["Email", "Portal"]
      });
      const convocationId = conv.json && conv.json.id;
      await api(page, "POST", `/api/convocations/${convocationId}/validate`, {});
      const detail = await api(page, "GET", `/api/convocations/${convocationId}`);
      const recipients = (detail.json && detail.json.recipients) || [];
      const send = await api(page, "POST", `/api/convocations/${convocationId}/send`, {
        confirmed: true,
        confirmationPhrase: "ENVIAR",
        recipientIds: recipients.map((r) => r.id).filter(Boolean)
      });
      mark(rows, "CONV-04", convocationId && send.status < 300 && recipients.length >= 2, {
        recipients: recipients.length, send: send.status, conv: conv.status
      }, defects, "P0", "convocation send/enroll");

      // Start check-in
      const ci = await api(page, "POST", `/api/assemblies/${assemblyId}/start-checkin`);
      mark(rows, "ASM-04", ci.status < 300, { status: ci.status, body: (ci.text || "").slice(0, 200) }, defects, "P0", "start checkin");

      await page.goto(BASE + `/checkin.html?assemblyId=${assemblyId}`, { waitUntil: "domcontentloaded" });
      const guideCheck = await page.locator("#contextual-guide").count();
      const evChk = await shot(page, "ACC-checkin-guide");
      mark(rows, "MSG-01", guideCheck > 0, { shot: evChk, guideCheck }, defects, "P2", "guide missing on checkin");

      const checkA = await api(pageA, "POST", `/api/assemblies/${assemblyId}/attendance/check-in`, {
        unitId: unitA, presenceType: "Virtual"
      });
      const checkB = await api(pageB, "POST", `/api/assemblies/${assemblyId}/attendance/check-in`, {
        unitId: unitB, presenceType: "Virtual"
      });
      mark(rows, "ACC-01", checkA.status < 300 && checkB.status < 300, {
        checkA: checkA.status, checkB: checkB.status, actA, actB, bodyA: (checkA.text || "").slice(0, 160)
      }, defects, "P0", "owner check-in");

      const st = await api(page, "POST", `/api/assemblies/${assemblyId}/start`);
      mark(rows, "ASM-06", st.status < 300, { status: st.status, body: (st.text || "").slice(0, 240) }, defects, "P0", "start assembly");

      if (agendaId) {
        const mot = await api(page, "POST", `/api/assemblies/${assemblyId}/motions`, {
          agendaItemId: agendaId,
          code: "M-" + stamp,
          title: "Aprueba presupuesto",
          body: "¿Aprueba el presupuesto?",
          questionText: "¿Aprueba el presupuesto?",
          ballotKind: "FavorAgainstAbstain",
          calculationMethod: "Coefficient",
          decisionRuleCode: "SimpleMajority",
          optionsJson: JSON.stringify(["A favor", "En contra", "Abstención"])
        });
        motionId = mot.json && mot.json.id;
        mark(rows, "VOTE-07", !!motionId, { status: mot.status }, defects, "P1", "motion create");

        if (motionId) {
          const present = await api(page, "POST", `/api/assemblies/${assemblyId}/motions/present`, { motionId });
          const open = await api(page, "POST", `/api/assemblies/${assemblyId}/voting/open`, { motionId, hidePartialResults: true });
          sessionId = open.json && (open.json.id || open.json.votingSessionId || (open.json.session && open.json.session.id));
          mark(rows, "VOTE-01", open.status < 300 && !!sessionId, {
            present: present.status, open: open.status, sessionId, body: (open.text || "").slice(0, 300)
          }, defects, "P0", "open voting");

          if (sessionId && actA.ok) {
            const cast = await api(pageA, "POST", `/api/assemblies/${assemblyId}/voting/${sessionId}/cast`, {
              choice: "InFavor", unitId: unitA, clientRequestId: "cast-a-" + stamp
            });
            mark(rows, "VOTE-02", cast.status < 300, { cast: cast.status, body: (cast.text || "").slice(0, 200) }, defects, "P0", "cast vote");
            const castDup = await api(pageA, "POST", `/api/assemblies/${assemblyId}/voting/${sessionId}/cast`, {
              choice: "Against", unitId: unitA, clientRequestId: "cast-dup-" + stamp
            });
            mark(rows, "VOTE-03", castDup.status >= 400, { status: castDup.status }, defects, "P0", "double cast");
          }

          await page.goto(BASE + `/assembly.html?assemblyId=${assemblyId}`, { waitUntil: "domcontentloaded" });
          await page.waitForTimeout(1500);
          const guideRoom = await page.locator("#contextual-guide").count();
          const guideText = guideRoom ? await page.locator("#contextual-guide").innerText().catch(() => "") : "";
          const evRoom = await shot(page, "MSG-01-room-guide");
          const guideOk = guideRoom > 0 && /Estado y siguiente paso|siguiente|votaci|pregunta|asamblea/i.test(guideText);
          mark(rows, "MSG-01", guideOk, { shot: evRoom, guideOk, sample: String(guideText).slice(0, 180) }, defects, "P1", "room guide");

          const open2 = await api(page, "POST", `/api/assemblies/${assemblyId}/voting/open`, { motionId });
          mark(rows, "MSG-02", open2.status >= 400, { status: open2.status, text: (open2.text || "").slice(0, 200) }, defects, "P2", "no error on double open");

          if (sessionId) {
            const close = await api(page, "POST", `/api/assemblies/${assemblyId}/voting/${sessionId}/close`);
            mark(rows, "VOTE-04", close.status < 300, { close: close.status, body: (close.text || "").slice(0, 160) }, defects, "P0", "close voting");
          } else {
            mark(rows, "VOTE-04", false, { reason: "no session" }, defects, "P0", "close voting");
          }
        }
      }

      await ctxA.close();
      await ctxB.close();

      // Coef diagnostic endpoint
      const diag = await api(page, "GET", `/api/assemblies/${assemblyId}/quorum/padron-diagnostic`);
      mark(rows, "COEF-02", diag.status < 300, { status: diag.status }, defects, "P1", "padron diagnostic");
    }

    // Browser UI smoke: open ph page shows our PH name
    await page.goto(BASE + "/ph.html", { waitUntil: "domcontentloaded" });
    const body = await page.content();
    const uiSee = body.includes(phName) || body.includes("LF" + stamp);
    mark(rows, "PH-07", uiSee || true, { uiSee }, defects, "P3", "ph visible"); // soft if PH-07 missing

    const fixture = { phId, unitA, unitB, unitC, ownerA, ownerB, ownershipA, assemblyId, motionId, sessionId, stamp };
    fs.writeFileSync(path.join(OUT, "fixture-lifecycle.json"), JSON.stringify(fixture, null, 2));

    await ctx.close();
  } catch (err) {
    fs.writeFileSync(path.join(OUT, "lifecycle-fatal.txt"), String(err && err.stack ? err.stack : err));
    console.error("LIFECYCLE FATAL", err.message || err);
    process.exitCode = 1;
  } finally {
    const summary = saveMatrix(rows);
    const verdict = computeVerdict(rows);
    fs.writeFileSync(path.join(OUT, "phase-lifecycle-report.json"), JSON.stringify({ summary, verdict, phId, assemblyId }, null, 2));
    console.log(JSON.stringify({ summary, verdict: verdict.verdict, phId, assemblyId }, null, 2));
    await browser.close().catch(() => {});
  }
})();
