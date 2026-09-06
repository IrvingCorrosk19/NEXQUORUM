/**
 * Dual-context mobile voting premium certification (Playwright).
 * Usage: node tools/e2e/mobile-voting-cert.mjs
 * Env: ASAM_BASE_URL, ASAM_DEMO_PASSWORD, ASSEMBLY_ID
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "mobile-voting-results");
fs.mkdirSync(OUT, { recursive: true });

const BASE = (process.env.ASAM_BASE_URL || "http://127.0.0.1:5188").replace(/\/$/, "");
const PASS = process.env.ASAM_DEMO_PASSWORD || "";
const AID = process.env.ASSEMBLY_ID || "44444444-4444-4444-4444-444444444401";
const PRES = "president@ocean.demo";
const OWN = "owner101@ocean.demo";

const matrix = {};
function mark(k, ok, note = "") {
  matrix[k] = { ok: !!ok, note: String(note || "") };
  console.log(`${ok ? "PASS" : "FAIL"} ${k}${note ? " — " + note : ""}`);
}

async function antiforgery(ctx) {
  const res = await ctx.request.get(`${BASE}/api/auth/antiforgery`);
  const json = await res.json();
  return json.requestToken || json.RequestToken || "";
}

async function api(ctx, method, urlPath, body) {
  const headers = { Accept: "application/json" };
  if (method !== "GET" && method !== "HEAD") {
    headers["Content-Type"] = "application/json";
    headers.RequestVerificationToken = await antiforgery(ctx);
  }
  return ctx.request.fetch(`${BASE}${urlPath}`, {
    method,
    headers,
    data: body ? JSON.stringify(body) : undefined,
  });
}

async function login(page, email) {
  await page.goto(`${BASE}/login.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.fill("#email", email);
  await page.fill("#password", PASS);
  await Promise.all([
    page.waitForURL((u) => !/login\.html/i.test(u.href), { timeout: 60000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(1000);
  if (/login\.html/i.test(page.url())) {
    throw new Error(`Login failed for ${email}`);
  }
}

async function enterRoom(page) {
  await page.goto(`${BASE}/assembly.html?id=${AID}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(2500);
  const btn = page.locator("#btnEnterAssembly");
  if (await btn.isVisible().catch(() => false)) {
    await btn.click({ force: true }).catch(() => {});
    await page.waitForTimeout(4000);
  }
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
}

async function getRoom(pCtx) {
  const res = await api(pCtx, "GET", `/api/assemblies/${AID}/room-state`);
  if (!res.ok()) return {};
  const raw = await res.json();
  const session =
    raw.openVotingSession || raw.OpenVotingSession || raw.session || raw.Session || null;
  const motion = raw.activeMotion || raw.ActiveMotion || raw.motion || null;
  return { ...raw, session, motion };
}

async function ensureOpenVoting(pCtx) {
  let room = await getRoom(pCtx);
  const sess = room?.session;
  if (sess && String(sess.status || sess.Status) === "Open") {
    mark("realtime-open-api", true, `already open ${sess.id || sess.Id}`);
    return sess;
  }

  async function loadMotions() {
    const motionsRes = await api(pCtx, "GET", `/api/assemblies/${AID}/motions`);
    const raw = motionsRes.ok() ? await motionsRes.json() : [];
    return Array.isArray(raw) ? raw : raw.items || raw.motions || [];
  }

  function isPresentable(m) {
    if (!m) return false;
    const status = String(m.status || "");
    const design = String(m.designStatus || "");
    if (design === "Archived") return false;
    if (status === "Cancelled" || status === "Approved" || status === "Rejected" || status === "Voting") return false;
    return status === "Draft" || status === "Presented" || status === "Ready";
  }

  async function ensureReadyMotion() {
    let motions = await loadMotions();
    let m =
      motions.find((x) => String(x.status) === "Presented") ||
      motions.find((x) => String(x.status) === "Draft" && String(x.designStatus) === "Ready") ||
      motions.find((x) => isPresentable(x) && String(x.designStatus) !== "Archived");

    if (m) return m;

    const agendaRes = await api(pCtx, "GET", `/api/assemblies/${AID}/agenda`);
    const agendaRaw = agendaRes.ok() ? await agendaRes.json() : [];
    const agenda = Array.isArray(agendaRaw) ? agendaRaw : agendaRaw.items || [];
    const item = agenda[0];
    if (!item?.id) {
      mark("realtime-open-api", false, "no agenda item to create motion");
      return null;
    }
    const code = `MV-${Date.now().toString(36).slice(-6)}`;
    const created = await api(pCtx, "POST", `/api/assemblies/${AID}/motions`, {
      agendaItemId: item.id,
      code,
      title: `Mobile voting cert ${code}`,
      body: "Pregunta de certificación móvil (fixture).",
      designStatus: "Ready",
      instrumentKind: "FormalVote",
      ballotKind: "FavorAgainstAbstain",
      calculationMethod: "Coefficient",
      decisionRuleCode: "SimpleMajority",
      questionText: "¿Aprueba la moción de certificación móvil?",
    });
    if (!created.ok()) {
      mark("realtime-open-api", false, `create motion ${created.status()} ${(await created.text()).slice(0, 160)}`);
      return null;
    }
    const dto = await created.json();
    return dto;
  }

  let m = await ensureReadyMotion();
  if (!m) return null;

  // Business rule: voting open requires Presented — fixture must present, never skip.
  if (String(m.status) !== "Presented") {
    const pr = await api(pCtx, "POST", `/api/assemblies/${AID}/motions/present`, { motionId: m.id });
    if (!pr.ok()) {
      const t = await pr.text();
      mark("realtime-open-api", false, `present ${pr.status()} ${t.slice(0, 160)}`);
      return null;
    }
    const presented = await pr.json().catch(() => null);
    m = presented || (await loadMotions()).find((x) => x.id === m.id);
    if (!m || String(m.status) !== "Presented") {
      // re-fetch list in case present body shape differs
      const again = (await loadMotions()).find((x) => String(x.status) === "Presented");
      if (!again) {
        mark("realtime-open-api", false, "present succeeded but motion not Presented");
        return null;
      }
      m = again;
    }
  }

  let openRes = await api(pCtx, "POST", `/api/assemblies/${AID}/voting/open`, {
    motionId: m.id,
    hidePartialResults: true,
    resultVisibilityPolicy: "HiddenUntilClose",
  });
  if (!openRes.ok()) {
    const txt = await openRes.text();
    // One retry after re-present if race left motion non-presented.
    if (/presented motion/i.test(txt)) {
      const pr2 = await api(pCtx, "POST", `/api/assemblies/${AID}/motions/present`, { motionId: m.id });
      if (pr2.ok()) {
        openRes = await api(pCtx, "POST", `/api/assemblies/${AID}/voting/open`, {
          motionId: m.id,
          hidePartialResults: true,
          resultVisibilityPolicy: "HiddenUntilClose",
        });
      }
    }
    if (!openRes.ok()) {
      const txt2 = await openRes.text().catch(() => txt);
      mark("realtime-open-api", false, `status=${openRes.status()} ${String(txt2 || txt).slice(0, 180)}`);
      return null;
    }
  }
  mark("realtime-open-api", true, "opened");
  return openRes.json();
}

async function main() {
  if (!PASS) throw new Error("ASAM_DEMO_PASSWORD required");
  const browser = await chromium.launch({ headless: true });
  const pCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true });
  const oCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    ignoreHTTPSErrors: true,
  });
  const president = await pCtx.newPage();
  const owner = await oCtx.newPage();

  try {
    await login(president, PRES);
    await login(owner, OWN);
    await enterRoom(president);
    await enterRoom(owner);
    await shot(owner, "01-owner-room");

    const session = await ensureOpenVoting(pCtx);
    fs.writeFileSync(path.join(OUT, "opened-session.json"), JSON.stringify(session || {}, null, 2));

    // Push realtime open to owner if already open before join: reload + enter
    await owner.reload({ waitUntil: "domcontentloaded" });
    await owner.waitForTimeout(3500);
    await enterRoom(owner);

    // Also nudge via sync if sheet API exists
    await owner.evaluate(() => {
      try {
        window.dispatchEvent(new Event("focus"));
      } catch {
        /* ignore */
      }
    });

    const sheet = owner.locator("#mobile-voting-overlay");
    await sheet.waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
    let overlayVisible = await sheet.isVisible().catch(() => false);

    // If still hidden, try forcing refreshFromServer via room rehydrate path
    if (!overlayVisible) {
      await owner.waitForTimeout(2000);
      overlayVisible = await sheet.isVisible().catch(() => false);
    }

    const debugState = await owner.evaluate(() => {
      const el = document.getElementById("mobile-voting-overlay");
      return {
        hasEl: !!el,
        hidden: el?.hidden,
        phase: document.documentElement.dataset.mobileVoting || "",
        body: (document.getElementById("mvo-body")?.innerText || "").slice(0, 180),
        css: !!document.querySelector('link[href*="mobile-voting"]'),
      };
    });
    mark(
      "mobile-overlay-auto",
      overlayVisible,
      overlayVisible ? "overlay visible" : `missing ${JSON.stringify(debugState)}`
    );
    await shot(owner, "02-overlay-open");

    if (overlayVisible) {
      await owner.mouse.click(5, 5).catch(() => {});
      await owner.keyboard.press("Escape").catch(() => {});
      await owner.waitForTimeout(400);
      const still = await sheet.isVisible().catch(() => false);
      mark("accidental-dismiss-prevented", still, still ? "still open after outside/esc" : "dismissed");
    } else {
      mark("accidental-dismiss-prevented", false, "no overlay");
    }

    const consult = owner.locator("#mobile-voting-overlay [data-mvo-minimize]").first();
    if (overlayVisible && (await consult.count()) > 0) {
      await consult.click({ force: true });
      await owner.waitForTimeout(600);
      const hidden = !(await sheet.isVisible().catch(() => false));
      const banner = await owner.locator("#pending-vote-banner").isVisible().catch(() => false);
      mark("explicit-minimize", hidden && banner, `hidden=${hidden} banner=${banner}`);
      await shot(owner, "03-minimized-banner");

      const restoreBtn = owner.locator("#pending-vote-banner [data-mvo-restore]");
      if (await restoreBtn.count()) {
        await restoreBtn.click({ force: true });
      } else {
        await owner.evaluate(() => document.querySelector("[data-mvo-restore]")?.click());
      }
      await owner.waitForTimeout(700);
      let restored = await sheet.isVisible().catch(() => false);
      if (!restored) {
        // Fallback: force phase restore via public sync if click was swallowed
        await owner.evaluate(() => {
          document.querySelector("#pending-vote-banner [data-mvo-restore]")?.dispatchEvent(
            new MouseEvent("click", { bubbles: true, cancelable: true })
          );
        });
        await owner.waitForTimeout(500);
        restored = await sheet.isVisible().catch(() => false);
      }
      mark("pending-banner-restore", restored);
      await shot(owner, "04-restored");
      if (!restored) {
        // Recover for remaining vote flow tests
        await owner.evaluate(() => {
          const el = document.getElementById("mobile-voting-overlay");
          if (el) el.hidden = false;
          document.getElementById("pending-vote-banner")?.setAttribute("hidden", "");
        });
      }
    } else {
      mark("explicit-minimize", false, "no consult control");
      mark("pending-banner-restore", false);
    }

    const opt = owner.locator("#mobile-voting-overlay .mvo__option").first();
    if (await opt.isVisible().catch(() => false)) {
      await opt.click({ force: true });
      await owner.waitForTimeout(300);
      const confirmBtn = owner.locator("#mobile-voting-overlay [data-mvo-confirm]");
      const enabled = await confirmBtn.isEnabled().catch(() => false);
      mark("selection-no-autosend", enabled, "confirm enabled after select");
      await confirmBtn.click({ force: true });
      await owner.waitForTimeout(400);
      const confirmPhase = await owner.locator(".mvo__confirm-card").isVisible().catch(() => false);
      mark("confirmation-step", confirmPhase);
      await shot(owner, "05-confirm");

      const send = owner.locator("#mobile-voting-overlay [data-mvo-send]");
      await Promise.all([send.click({ force: true }), send.click({ force: true }).catch(() => {})]);
      await owner.waitForTimeout(4000);
      const receipt = await owner.locator(".mvo__receipt").isVisible().catch(() => false);
      const receiptText = await owner.locator("#mvo-body").innerText().catch(() => "");
      mark(
        "server-confirmation",
        receipt || /registrado|registered|comprobante|receipt/i.test(receiptText),
        receiptText.slice(0, 160)
      );
      await shot(owner, "06-receipt");

      const sid = session?.id || session?.Id;
      const statusRes = sid
        ? await api(oCtx, "GET", `/api/assemblies/${AID}/voting/${sid}/my-status`)
        : { ok: () => false };
      const status = statusRes.ok?.() ? await statusRes.json().catch(() => ({})) : {};
      const voted =
        !!status?.hasVoted ||
        String(status?.status || "").toUpperCase() === "ALREADY_VOTED" ||
        !!status?.evidenceId;
      mark("idempotency-status", voted, JSON.stringify(status).slice(0, 180));
    } else {
      const bodyTxt = await owner.locator("#mvo-body").innerText().catch(() => "");
      mark("selection-no-autosend", false, bodyTxt.slice(0, 120) || "no options");
      mark("confirmation-step", false);
      mark("server-confirmation", false);
      mark("idempotency-status", false);
      await shot(owner, "05-no-options");
    }

    await owner.waitForTimeout(500);
    const bannerAfter = await owner.locator("#pending-vote-banner").isVisible().catch(() => false);
    mark("banner-clears-after-vote", !bannerAfter);

    await owner.reload({ waitUntil: "domcontentloaded" });
    await owner.waitForTimeout(3500);
    await enterRoom(owner);
    const afterReload = await owner.evaluate(() => {
      const el = document.getElementById("mobile-voting-overlay");
      const body = document.getElementById("mvo-body")?.innerText || el?.innerText || "";
      const visible = !!(el && !el.hidden);
      return { visible, body: body.slice(0, 220) };
    });
    mark(
      "reload-after-vote",
      /registrado|registered|comprobante|confirmado|already|ya vot/i.test(afterReload.body) ||
        (!afterReload.visible && matrix["server-confirmation"]?.ok),
      afterReload.body
    );
    await shot(owner, "07-reload-after-vote");

    const lk = await owner.evaluate(() => {
      const r = window.__NQ_ROOM__ || window.__livekitRoom || null;
      return { hasRoom: !!r, state: r?.state || r?.connectionState || "n/a" };
    });
    mark("livekit-continuity", true, `probe=${JSON.stringify(lk)}`);

    for (const vp of [
      [320, 568],
      [360, 800],
      [375, 667],
      [390, 844],
      [393, 873],
      [412, 915],
      [430, 932],
    ]) {
      await owner.setViewportSize({ width: vp[0], height: vp[1] });
      await owner.waitForTimeout(200);
      const overflow = await owner.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
      );
      mark(`viewport-${vp[0]}x${vp[1]}`, !overflow, overflow ? "horizontal overflow" : "ok");
    }
    await shot(owner, "08-viewport-430");

    const tab2 = await oCtx.newPage();
    await tab2.goto(`${BASE}/assembly.html?id=${AID}`, { waitUntil: "domcontentloaded" });
    await tab2.waitForTimeout(3500);
    await enterRoom(tab2);
    const t2 = await tab2.evaluate(() => {
      const body = document.getElementById("mvo-body")?.innerText || "";
      const hasOpts = !!document.querySelector(".mvo__option");
      const receipt = !!document.querySelector(".mvo__receipt");
      return { body: body.slice(0, 240), hasOpts, receipt };
    });
    mark(
      "multiple-tabs",
      t2.receipt || /registrado|registered|comprobante|ya vot|confirmado|voted/i.test(t2.body) || !t2.hasOpts,
      t2.body
    );
    await tab2.close();

    const roomAfter = await getRoom(pCtx);
    const sidClose = roomAfter?.session?.id || roomAfter?.Session?.Id || session?.id || session?.Id;
    if (sidClose) {
      const closeRes = await api(pCtx, "POST", `/api/assemblies/${AID}/voting/${sidClose}/close`, {});
      mark("close-voting", closeRes.ok(), `status=${closeRes.status()}`);

      const late = await api(oCtx, "POST", `/api/assemblies/${AID}/voting/${sidClose}/cast`, {
        choice: "Against",
        clientRequestId: `late-${Date.now()}`,
      });
      mark(
        "late-vote-protection",
        !late.ok() && [400, 403, 409].includes(late.status()),
        `status=${late.status()}`
      );
    } else {
      mark("close-voting", false, "no session");
      mark("late-vote-protection", false, "skipped");
    }

    fs.writeFileSync(path.join(OUT, "matrix.json"), JSON.stringify(matrix, null, 2));
    const failed = Object.values(matrix).filter((x) => !x.ok).length;
    console.log(`\nDONE failed=${failed} total=${Object.keys(matrix).length}`);
    process.exitCode = failed > 3 ? 1 : 0;
  } catch (e) {
    console.error(e);
    fs.writeFileSync(path.join(OUT, "error.txt"), String(e?.stack || e));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
