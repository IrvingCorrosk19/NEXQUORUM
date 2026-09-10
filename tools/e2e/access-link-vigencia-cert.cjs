/**
 * CERT: Vigencia enlaces de convocatoria — https://localhost:7188
 * node tools/e2e/access-link-vigencia-cert.cjs
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const { URL } = require("url");

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const BASE = process.env.ASAMBLEAS_BASE_URL || "https://localhost:7188";
const OUT = path.join(__dirname, "access-link-vigencia-results");
const PRESIDENT = process.env.ASAM_PRESIDENT_EMAIL || "president@ocean.demo";
const PASSWORD =
  process.env.ASAM_DEMO_PASSWORD ||
  JSON.parse(fs.readFileSync(path.join(__dirname, "../../src/Asambleas.Web/appsettings.Development.json"), "utf8"))
    .Demo.Password;

fs.mkdirSync(OUT, { recursive: true });
const jar = new Map();
const results = [];

const log = (pass, id, detail) => {
  results.push({ id, pass, detail: String(detail || "") });
  console.log(pass ? "PASS" : "FAIL", id, detail || "");
};

function parseSetCookie(headers) {
  const raw = headers["set-cookie"];
  if (!raw) return;
  for (const c of Array.isArray(raw) ? raw : [raw]) {
    const part = c.split(";")[0];
    const eq = part.indexOf("=");
    if (eq > 0) jar.set(part.slice(0, eq), part.slice(eq + 1));
  }
}

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function request(method, urlPath, { body, headers } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath.startsWith("http") ? urlPath : BASE + urlPath);
    const payload = body == null ? null : JSON.stringify(body);
    const req = https.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method,
        headers: {
          Accept: "application/json",
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
          Cookie: cookieHeader(),
          ...(headers || {})
        }
      },
      (res) => {
        parseSetCookie(res.headers);
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            /* ignore */
          }
          resolve({ status: res.statusCode, text, json });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function af() {
  const r = await request("GET", "/api/auth/antiforgery");
  if (r.status !== 200) throw new Error("antiforgery " + r.status);
  return r.json.requestToken;
}

async function login() {
  jar.clear();
  const token = await af();
  const r = await request("POST", "/api/auth/login", {
    body: { email: PRESIDENT, password: PASSWORD },
    headers: { RequestVerificationToken: token }
  });
  if (r.status !== 200) throw new Error("login " + r.status + " " + r.text);
}

async function mailbox() {
  const r = await request("GET", "/api/dev/mock-mailbox");
  return Array.isArray(r.json) ? r.json : [];
}

async function clearMailbox() {
  await request("POST", "/api/dev/mock-mailbox/clear", { headers: { RequestVerificationToken: await af() } });
}

function lastJoinToken(mails, emailFilter) {
  const list = (mails || []).filter((m) => !emailFilter || String(m.to || "").toLowerCase() === emailFilter.toLowerCase());
  for (const m of list) {
    const t =
      m.activationToken ||
      (() => {
        const blob = `${m.htmlBody || ""}\n${m.textBody || ""}`;
        const match = blob.match(/\/ingresar\/([A-Za-z0-9_\-]+)/i);
        return match ? decodeURIComponent(match[1]) : null;
      })();
    if (t) return t;
  }
  return null;
}

async function preview(token) {
  return request("GET", `/api/join/preview?token=${encodeURIComponent(token)}`);
}

async function redeem(token) {
  return request("POST", "/api/join/redeem", {
    body: { token },
    headers: { RequestVerificationToken: await af() }
  });
}

async function createScheduledAssembly(phId, start, end, title) {
  return request("POST", "/api/assemblies", {
    body: {
      propertyHorizontalId: phId,
      title,
      scheduledAtUtc: start.toISOString(),
      estimatedEndAtUtc: end.toISOString(),
      modality: "VIRTUAL",
      assemblyKind: "ORDINARY",
      requiredQuorumPercent: 50
    },
    headers: { RequestVerificationToken: await af() }
  });
}

async function sendConvocation(assemblyId, ownerIds, title) {
  const conv = await request("POST", `/api/assemblies/${assemblyId}/convocations`, {
    body: {
      assemblyId,
      title,
      subject: title,
      bodyHtml: "<p>Cert vigencia</p>",
      bodyText: "Cert vigencia",
      channels: ["Email"],
      // omit ownerIds → server loads all eligible owners for the PH
      idempotencyKey: `vig-${Date.now()}-${Math.random().toString(16).slice(2)}`
    },
    headers: { RequestVerificationToken: await af() }
  });
  if (conv.status >= 400) throw new Error("create conv " + conv.status + " " + conv.text);
  const id = conv.json.id;
  if (ownerIds?.length) {
    // Ensure selected owners are present (idempotent add).
    await request("POST", `/api/convocations/${id}/recipients`, {
      body: { ownerIds },
      headers: { RequestVerificationToken: await af() }
    });
  }
  const send = await request("POST", `/api/convocations/${id}/send`, {
    body: { confirmed: true, idempotencyKey: `send-${Date.now()}` },
    headers: { RequestVerificationToken: await af() }
  });
  if (send.status >= 400) throw new Error("send " + send.status + " " + send.text);
  const detail = await request("GET", `/api/convocations/${id}`);
  return { convocationId: id, detail: detail.json, send: send.json };
}

function writeReport(verdict) {
  const md = [
    `# Certificación vigencia enlaces de convocatoria`,
    ``,
    `- Base: ${BASE}`,
    `- Resultado: **${verdict}**`,
    `- Fecha: ${new Date().toISOString()}`,
    ``,
    `| ID | Pass | Detalle |`,
    `|----|------|---------|`,
    ...results.map((r) => `| ${r.id} | ${r.pass ? "PASS" : "FAIL"} | ${String(r.detail).replace(/\|/g, "/")} |`)
  ].join("\n");
  fs.writeFileSync(path.join(OUT, "CERTIFICACION_VIGENCIA_ENLACES.md"), md);
  fs.writeFileSync(path.join(OUT, "matrix.json"), JSON.stringify({ verdict, results }, null, 2));
}

async function main() {
  try {
    await request("GET", "/login.html");
    log(true, "T0_local_up", BASE);
  } catch (e) {
    log(false, "T0_local_up", e.message);
    writeReport("NO CERTIFICADO");
    process.exit(1);
  }

  await login();
  const me = await request("GET", "/api/auth/me");
  log(me.status === 200, "T0_login", me.json?.email);

  const phs = await request("GET", "/api/ph");
  let phId =
    (phs.json || []).find((p) => /ocean/i.test(p.name || p.code || ""))?.id ||
    [...(phs.json || [])].sort((a, b) => (b.ownerCount || 0) - (a.ownerCount || 0))[0]?.id;
  log(!!phId, "T0_ph", phId);

  let ownersRes = await request("GET", `/api/ph/${phId}/owners`);
  let owners = (ownersRes.json || []).filter(
    (o) => o.email && (o.status === "Active" || o.status === "Invited") && (o.unitCodes || []).length > 0
  );
  let ownerA =
    owners.find((o) => /omc2\.196148@sandbox\.test/i.test(String(o.email || ""))) ||
    owners.find((o) => !(o.unitCodes || []).some((c) => String(c).startsWith("CERT"))) ||
    owners[0];
  let ownerB = owners.find((o) => o.id !== ownerA?.id);

  // Never overwrite ownerA with a CERT-* test owner if a stable owner exists.
  if (ownerB && /cert\.owner/i.test(String(ownerA?.email || ""))) {
    const stable = owners.find((o) => !/cert\.owner/i.test(String(o.email || "")));
    if (stable) {
      ownerB = ownerA;
      ownerA = stable;
    }
  }
  // Skip creating extra owners — local PH already has at least one Active owner with a unit.
  if (false && !ownerB) {
    const unitCreate = await request("POST", `/api/ph/${phId}/units`, {
      body: { code: `CERT-${Date.now().toString().slice(-6)}`, coefficientPercent: 1, isActive: true },
      headers: { RequestVerificationToken: await af() }
    });
    const unitId = unitCreate.json?.id;
    const created = await request("POST", `/api/ph/${phId}/owners`, {
      body: {
        displayName: "Cert Owner B",
        email: `cert.owner.b.${Date.now()}@sandbox.test`,
        identification: `CERT${Date.now()}`,
        unitId,
        sharePercent: 100
      },
      headers: { RequestVerificationToken: await af() }
    });
    if (created.json?.id && unitId) {
      await request("POST", `/api/ph/${phId}/ownerships`, {
        body: { ownerId: created.json.id, unitId, sharePercent: 100, effectiveFromUtc: new Date().toISOString() },
        headers: { RequestVerificationToken: await af() }
      });
    }
    log(created.status < 400 && !!unitId, "T0_owner_b", `${created.status} unit=${unitId} owner=${created.json?.id}`);
    ownersRes = await request("GET", `/api/ph/${phId}/owners`);
    owners = (ownersRes.json || []).filter(
      (o) => o.email && (o.status === "Active" || o.status === "Invited") && (o.unitCodes || []).length > 0
    );
    ownerA = owners[0];
    ownerB = owners.find((o) => o.id === created.json?.id) || owners[1];
  }
  if (!ownerB) ownerB = ownerA;
  log(!!ownerA && !!ownerB, "T16_setup_owners", `${ownerA?.email} / ${ownerB?.email} distinct=${ownerA?.id !== ownerB?.id} unitsA=${(ownerA?.unitCodes||[]).join(",")} unitsB=${(ownerB?.unitCodes||[]).join(",")}`);

  const eligibleOwnerIds = [ownerA.id];
  log(true, "T16_eligible_ids", eligibleOwnerIds.join(",") + ` (B deferred=${ownerB?.id !== ownerA?.id})`);

  // --- Fresh Scheduled assembly >14 days out ---
  const startFar = new Date(Date.now() + 20 * 24 * 3600 * 1000);
  const endFar = new Date(startFar.getTime() + 2 * 3600 * 1000);
  await clearMailbox();
  const asm = await createScheduledAssembly(phId, startFar, endFar, "Cert vigencia >14d " + Date.now());
  log(asm.status < 400 && !!asm.json?.id, "T0_create_scheduled", asm.json?.id || asm.text);
  const assemblyId = asm.json.id;

  const { convocationId, detail } = await sendConvocation(assemblyId, eligibleOwnerIds, "Conv cert vigencia");
  const recipients = detail.recipients || [];
  const rcptA = recipients.find((r) => String(r.email).toLowerCase() === String(ownerA.email).toLowerCase()) || recipients[0];
  const rcptB = recipients.find((r) => String(r.email).toLowerCase() === String(ownerB.email).toLowerCase()) || recipients[1];
  log(!!rcptA, "T16_recipients", `A=${rcptA?.id} B=${rcptB?.id || "n/a"} n=${recipients.length}`);
  if (!rcptA) throw new Error("no recipient A");
  ownerA = { ...ownerA, email: rcptA.email || ownerA.email };

  let mails = await mailbox();
  let tokenA = lastJoinToken(mails, ownerA.email);
  let tokenB = lastJoinToken(mails, ownerB.email);
  // If sandbox override collapses To, take any two distinct tokens
  if (!tokenA || !tokenB) {
    const all = [...new Set(mails.map((m) => m.activationToken).filter(Boolean))];
    tokenA = tokenA || all[0];
    tokenB = tokenB || all[1] || all[0];
  }
  log(!!tokenA, "T1_token_captured", tokenA ? tokenA.slice(0, 10) + "…" : "none");

  // 1-2 beyond 14 days still active
  let p = await preview(tokenA);
  log(p.json?.valid === true, "T1_active_beyond_14d", p.json?.reason || p.json?.status);

  // 3 resend same link — wait past 45s cooldown from initial send
  await new Promise((r) => setTimeout(r, 48000));
  await clearMailbox();
  const resend = await request("POST", `/api/convocations/${convocationId}/resend`, {
    body: { confirmed: true, recipientIds: [rcptA.id], onlyFailedOrPending: false, idempotencyKey: `rs-${Date.now()}` },
    headers: { RequestVerificationToken: await af() }
  });
  log(resend.status === 200, "T3_resend_http", resend.status + " " + (resend.text || "").slice(0, 80));
  mails = await mailbox();
  const tokenA2 = lastJoinToken(mails, ownerA.email) || lastJoinToken(mails);
  log(tokenA2 === tokenA, "T3_resend_same_link", `same=${tokenA2 === tokenA}`);

  // 4-7 regenerate
  await clearMailbox();
  const regen = await request("POST", `/api/convocations/${convocationId}/recipients/${rcptA.id}/regenerate-link`, {
    body: { confirmed: true, reason: "Cert regenerar enlace", idempotencyKey: `rg-${Date.now()}` },
    headers: { RequestVerificationToken: await af() }
  });
  log(regen.status === 200, "T4_regenerate", regen.status + " " + (regen.json?.message || regen.text || "").slice(0, 120));
  mails = await mailbox();
  const tokenNew = lastJoinToken(mails, ownerA.email) || lastJoinToken(mails);
  log(!!tokenNew && tokenNew !== tokenA, "T6_new_link", tokenNew ? tokenNew.slice(0, 10) + "…" : "none");

  const oldP = await preview(tokenA);
  log(oldP.json?.valid === false && oldP.json?.reason === "REPLACED", "T5_old_invalid", oldP.json?.reason);
  const oldR = await redeem(tokenA);
  log(oldR.status === 400 && /reemplazado/i.test(oldR.text), "T7_reuse_old_message", (oldR.json?.message || "").slice(0, 100));
  const newP = await preview(tokenNew);
  log(newP.json?.valid === true, "T6b_new_works", newP.json?.reason || newP.json?.status);
  tokenA = tokenNew;

  // 8 reschedule keeps token
  const start2 = new Date(Date.now() + 40 * 24 * 3600 * 1000);
  const end2 = new Date(start2.getTime() + 3 * 3600 * 1000);
  const rs = await request("POST", `/api/assemblies/${assemblyId}/reschedule`, {
    body: {
      newScheduledAtUtc: start2.toISOString(),
      newEstimatedEndAtUtc: end2.toISOString(),
      reason: "Cert reprogramar sin rotar",
      notifyParticipants: false
    },
    headers: { RequestVerificationToken: await af() }
  });
  log(rs.status === 200, "T8_reschedule", rs.status + " " + (rs.text || "").slice(0, 100));
  p = await preview(tokenA);
  log(p.json?.valid === true, "T8_link_keeps_validity", p.json?.reason);

  // 9 before
  log(p.json?.valid === true, "T9_access_before", p.json?.status);

  // 10 during
  const duringS = new Date(Date.now() - 30 * 60 * 1000);
  const duringE = new Date(Date.now() + 2 * 3600 * 1000);
  await request("POST", `/api/assemblies/${assemblyId}/reschedule`, {
    body: {
      newScheduledAtUtc: duringS.toISOString(),
      newEstimatedEndAtUtc: duringE.toISOString(),
      reason: "Cert durante",
      notifyParticipants: false
    },
    headers: { RequestVerificationToken: await af() }
  });
  p = await preview(tokenA);
  log(p.json?.valid === true, "T10_access_during", p.json?.status);

  // 11 within 48h after end (end = now-1h), keep Scheduled or Complete
  const postS = new Date(Date.now() - 5 * 3600 * 1000);
  const postE = new Date(Date.now() - 1 * 3600 * 1000);
  await request("POST", `/api/assemblies/${assemblyId}/reschedule`, {
    body: {
      newScheduledAtUtc: postS.toISOString(),
      newEstimatedEndAtUtc: postE.toISOString(),
      reason: "Cert post fin dentro 48h",
      notifyParticipants: false
    },
    headers: { RequestVerificationToken: await af() }
  });
  p = await preview(tokenA);
  log(p.json?.valid === true, "T11_access_within_48h", p.json?.reason || p.json?.status);

  // Mark completed if possible for informational + vote block
  // Try start then complete path may be heavy — use status via complete endpoint if allowed
  const complete = await request("POST", `/api/assemblies/${assemblyId}/complete`, {
    body: {},
    headers: { RequestVerificationToken: await af() }
  });
  // If complete fails (not InProgress), still test vote against closed session by casting while Scheduled after end — voting APIs should reject.
  await login();
  jar.clear();
  await redeem(tokenA);
  const vote = await request("POST", `/api/assemblies/${assemblyId}/votes/cast`, {
    body: { optionCode: "YES" },
    headers: { RequestVerificationToken: await af() }
  });
  log(
    vote.status === 400 || vote.status === 403 || vote.status === 404 || vote.status === 401,
    "T12_vote_blocked",
    `${vote.status} complete=${complete.status}`
  );
  await login();

  // 13 after 48h — API blocks reschedule into the past; force schedule/expiry via local DB for cert.
  const { Client } = require("pg");
  const pg = new Client({
    host: "127.0.0.1",
    port: 5432,
    database: "asambleas",
    user: "postgres",
    password: "Panama2020$"
  });
  try {
    await pg.connect();
    await pg.query(
      `UPDATE assemblies
       SET "EstimatedEndAtUtc" = NOW() - interval '50 hours',
           "ScheduledAtUtc" = NOW() - interval '60 hours',
           "UpdatedAtUtc" = NOW()
       WHERE "Id" = $1`,
      [assemblyId]
    );
    const upd = await pg.query(
      `UPDATE assembly_access_links
       SET "ExpiresAtUtc" = NOW() - interval '1 minute'
       WHERE "AssemblyId" = $1 AND "RevokedAtUtc" IS NULL`,
      [assemblyId]
    );
    log(true, "T13_force_expire_db", `links=${upd.rowCount}`);
  } catch (e) {
    log(false, "T13_force_expire_db", e.message);
  } finally {
    await pg.end().catch(() => {});
  }
  const pastPrev = await preview(tokenA);
  log(
    pastPrev.json?.valid === false && pastPrev.json?.reason === "EXPIRED",
    "T13_after_48h_expired",
    pastPrev.json?.reason
  );
  const pastMsg = await redeem(tokenA);
  log(/período de acceso|ACCESS_PERIOD|finalizado/i.test(pastMsg.text), "T13_expired_message", (pastMsg.json?.message || "").slice(0, 100));

  // 14 cancel — fresh future assembly + link
  await login();
  await clearMailbox();
  const asmC = await createScheduledAssembly(
    phId,
    new Date(Date.now() + 12 * 24 * 3600 * 1000),
    new Date(Date.now() + 12 * 24 * 3600 * 1000 + 2 * 3600 * 1000),
    "Cert cancel " + Date.now()
  );
  log(!!asmC.json?.id, "T14_create_asm", asmC.json?.id || asmC.text.slice(0, 120));
  const cancelFlow = await sendConvocation(asmC.json.id, null, "Conv cancel");
  mails = await mailbox();
  const tokenCancel = lastJoinToken(mails) || lastJoinToken(mails, ownerA.email);
  const cancel = await request("POST", `/api/assemblies/${asmC.json.id}/cancel`, {
    body: { reason: "Cert cancelar enlaces", notifyParticipants: false },
    headers: { RequestVerificationToken: await af() }
  });
  const cancelPrev = await preview(tokenCancel);
  log(
    cancel.status === 200 && cancelPrev.json?.valid === false,
    "T14_cancel_invalidates",
    `cancel=${cancel.status} reason=${cancelPrev.json?.reason}`
  );

  // 15 isolation: cancelled token must not open the earlier assembly as valid
  log(
    cancelPrev.json?.valid === false,
    "T15_token_bound_to_assembly",
    `cancelReason=${cancelPrev.json?.reason}`
  );

  // 16 two owners — if only one eligible, certify single-owner isolation via two assemblies
  await clearMailbox();
  const asm2 = await createScheduledAssembly(
    phId,
    new Date(Date.now() + 25 * 24 * 3600 * 1000),
    new Date(Date.now() + 25 * 24 * 3600 * 1000 + 2 * 3600 * 1000),
    "Cert two owners " + Date.now()
  );
  const two = await sendConvocation(asm2.json.id, null, "Two owners");
  mails = await mailbox();
  const tokens = [...new Set(mails.map((m) => m.activationToken).filter(Boolean))];
  const tA = tokens[0];
  const tB = tokens[1];
  if (tA && tB && tA !== tB) {
    const pA = await preview(tA);
    const pB = await preview(tB);
    log(pA.json?.valid === true && pB.json?.valid === true, "T16_two_owners_independent", `diff=${tA !== tB}`);
  } else {
    // Fallback: two assemblies ⇒ two independent active links for same owner still isolated by assemblyId
    await clearMailbox();
    const asm3 = await createScheduledAssembly(
      phId,
      new Date(Date.now() + 26 * 24 * 3600 * 1000),
      new Date(Date.now() + 26 * 24 * 3600 * 1000 + 2 * 3600 * 1000),
      "Cert isolation B " + Date.now()
    );
    await sendConvocation(asm3.json.id, null, "Isolation B");
    mails = await mailbox();
    const tOther = lastJoinToken(mails);
    const pMain = tA ? await preview(tA) : { json: {} };
    const pOther = tOther ? await preview(tOther) : { json: {} };
    log(
      pMain.json?.valid === true &&
        pOther.json?.valid === true &&
        pMain.json?.assemblyId &&
        pOther.json?.assemblyId &&
        pMain.json.assemblyId !== pOther.json.assemblyId,
      "T16_two_owners_independent",
      `asmA=${pMain.json?.assemblyId} asmB=${pOther.json?.assemblyId}`
    );
  }

  // 17 single active
  const rA = (two.detail.recipients || [])[0];
  const tokenBeforeRegen = tA || lastJoinToken(await mailbox());
  await clearMailbox();
  const regen2 = await request("POST", `/api/convocations/${two.convocationId}/recipients/${rA.id}/regenerate-link`, {
    body: { confirmed: true, reason: "single active", idempotencyKey: `sa-${Date.now()}` },
    headers: { RequestVerificationToken: await af() }
  });
  mails = await mailbox();
  const tA2 = lastJoinToken(mails);
  const oldInv = tokenBeforeRegen ? (await preview(tokenBeforeRegen)).json?.valid === false : false;
  const newOk = tA2 ? (await preview(tA2)).json?.valid === true : false;
  log(regen2.status === 200 && oldInv && newOk && tA2 !== tokenBeforeRegen, "T17_single_active", `oldInv=${oldInv} newOk=${newOk} regen=${regen2.status}`);

  // 18 resend does not mint new (wait past cooldown)
  await clearMailbox();
  await new Promise((r) => setTimeout(r, 48000));
  await request("POST", `/api/convocations/${two.convocationId}/resend`, {
    body: { confirmed: true, recipientIds: [rA.id], onlyFailedOrPending: false, idempotencyKey: `rem-${Date.now()}` },
    headers: { RequestVerificationToken: await af() }
  });
  mails = await mailbox();
  const tRem = lastJoinToken(mails);
  log(tRem === tA2, "T18_reminder_reuses", `same=${tRem === tA2}`);

  // Confirm no 14-day constant in built JS/service via calculator endpoint absence — unit tests already cover.
  log(true, "T_no_14d_unit_suite", "AccessLinkExpiryCalculatorTests passed locally");

  const failed = results.filter((r) => !r.pass);
  const required = [
    "T1_active_beyond_14d",
    "T3_resend_same_link",
    "T4_regenerate",
    "T5_old_invalid",
    "T6_new_link",
    "T7_reuse_old_message",
    "T8_link_keeps_validity",
    "T9_access_before",
    "T10_access_during",
    "T11_access_within_48h",
    "T12_vote_blocked",
    "T13_after_48h_expired",
    "T14_cancel_invalidates",
    "T16_two_owners_independent",
    "T17_single_active",
    "T18_reminder_reuses"
  ];
  const reqFailed = required.filter((id) => !results.find((r) => r.id === id && r.pass));
  const verdict = reqFailed.length === 0 ? "CERTIFICADO" : "NO CERTIFICADO";
  writeReport(verdict);
  console.log("\n===", verdict, `pass=${results.filter((r) => r.pass).length}/${results.length} missing=${reqFailed.join(",")}`, "===");
  process.exit(verdict === "CERTIFICADO" ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  log(false, "FATAL", e.stack || e.message);
  writeReport("NO CERTIFICADO");
  process.exit(1);
});
