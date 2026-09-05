const { chromium } = require(require("path").join(__dirname, "node_modules/playwright"));
const fs = require("fs");
const path = require("path");
const BASE = process.env.ASAMBLEAS_BASE_URL || "https://localhost:7188";
const PASSWORD = process.env.ASAMBLEAS_DEMO_PASSWORD || fs.readFileSync(path.join(__dirname, "../../.demo-password.local"), "utf8").trim();
const OUT = path.join(__dirname, "live-voting-adaptive-results");
fs.mkdirSync(OUT, { recursive: true });
const gates = {};
function gate(k, pass, d) {
  gates[k] = pass ? "PASS" : "FAIL";
  console.log((pass ? "PASS" : "FAIL") + "  " + k + (d ? " â€” " + d : ""));
}
async function api(page, method, url, body) {
  return page.evaluate(async ({ method, url, body }) => {
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
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
    return { status: res.status, json, text: text.slice(0, 400) };
  }, { method, url, body });
}
async function login(page, email, password) {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", ignoreHTTPSErrors: true });
  return page.evaluate(async ({ email, password }) => {
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
    return { status: res.status };
  }, { email, password });
}
(async () => {
  const browser = await chromium.launch({ headless: true, ignoreHTTPSErrors: true });
  const prezCtx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 768 } });
  const ownCtx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
  const prez = await prezCtx.newPage();
  const owner = await ownCtx.newPage();
  try {
    gate("LOGIN", (await login(prez, "president@ocean.demo", PASSWORD)).status < 400 && (await login(owner, "owner101@ocean.demo", PASSWORD)).status < 400);
    const assemblies = await api(prez, "GET", "/api/assemblies");
    const list = Array.isArray(assemblies.json) ? assemblies.json : (assemblies.json && assemblies.json.items) || [];
    const assemblyId = (list.find((a) => a.id === "44444444-4444-4444-4444-444444444401") || list[0] || {}).id;
    gate("ASSEMBLY", !!assemblyId, String(assemblyId));
    await api(prez, "POST", "/api/assemblies/" + assemblyId + "/lifecycle/start").catch(() => ({}));

    // Close any open voting first
    const room0 = await api(prez, "GET", "/api/assemblies/" + assemblyId + "/room-state");
    const openSess = room0.json && (room0.json.openVotingSession || room0.json.session);
    const openSid = openSess && openSess.id;
    if (openSid && (openSess.status === "Open" || !openSess.closedAtUtc)) {
      const closed = await api(prez, "POST", "/api/assemblies/" + assemblyId + "/voting/" + openSid + "/close");
      gate("CLOSE_PRIOR", closed.status < 300, closed.text);
    } else {
      gate("CLOSE_PRIOR", true, "none");
    }

    const agenda = await api(prez, "GET", "/api/assemblies/" + assemblyId + "/agenda");
    let agendaItemId = agenda.json && agenda.json.items && agenda.json.items[0] && agenda.json.items[0].id;
    const stamp = Date.now().toString().slice(-6);
    const created = await api(prez, "POST", "/api/assemblies/" + assemblyId + "/motions", {
      agendaItemId,
      code: "AD-" + stamp,
      title: "Aprueba el punto " + stamp + "?",
      body: "Aprueba el punto " + stamp + "?",
      questionText: "Aprueba el punto " + stamp + "?",
      ballotKind: "FavorAgainstAbstain",
      calculationMethod: "Coefficient",
      decisionRuleCode: "SimpleMajority",
      defaultResultVisibilityPolicy: "HiddenUntilClose",
      optionsJson: JSON.stringify(["A favor", "En contra", "Abstencion"])
    });
    const motionId = created.json && created.json.id;
    gate("CREATE", created.status < 300 && !!motionId, created.text);
    const pub = await api(prez, "POST", "/api/assemblies/" + assemblyId + "/motions/" + motionId + "/publish");
    gate("PUBLISH", pub.status < 300, pub.text);
    const present = await api(prez, "POST", "/api/assemblies/" + assemblyId + "/motions/present", { motionId });
    gate("PRESENT", present.status < 300, present.text);
    const opened = await api(prez, "POST", "/api/assemblies/" + assemblyId + "/voting/open", {
      motionId,
      hidePartialResults: true,
      resultVisibilityPolicy: "HiddenUntilClose"
    });
    const sessionId = opened.json && opened.json.id;
    gate("OPEN", opened.status < 300 && !!sessionId, opened.text);

    await owner.goto(BASE + "/assembly.html?assemblyId=" + assemblyId, { waitUntil: "domcontentloaded" });
    await owner.waitForTimeout(3000);
    const ui = await owner.evaluate(() => {
      const panel = document.querySelector("#vote-panel");
      const text = (panel && panel.innerText) || "";
      const choices = [...document.querySelectorAll("#vote-panel .choice-card")].map((c) =>
        ((c.querySelector(".choice-label") && c.querySelector(".choice-label").textContent) || "").trim()
      );
      const loader = document.querySelector(".asambleas-loader");
      const loaderOn = !!(loader && !loader.hidden && loader.classList.contains("is-visible"));
      return {
        voting: document.querySelector(".room") && document.querySelector(".room").getAttribute("data-voting"),
        choices,
        loaderOn,
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
        hasOpen: /VOTACI|Aprueba|A FAVOR|A favor/i.test(text)
      };
    });
    gate("LOADING", !ui.loaderOn, "loaderOn=" + ui.loaderOn);
    gate("ACTIVE_UI", ui.voting === "open" && ui.hasOpen, JSON.stringify({ voting: ui.voting, hasOpen: ui.hasOpen }));
    gate("OPTION_ORDER", ui.choices.length >= 3 && /favor/i.test(ui.choices[0]) && /contra/i.test(ui.choices[1]) && /absten/i.test(ui.choices[2]), ui.choices.join("|"));
    gate("NO_HSCROLL", !ui.overflowX);

    const cast = await api(owner, "POST", "/api/assemblies/" + assemblyId + "/voting/" + sessionId + "/cast", {
      choice: "InFavor",
      clientRequestId: "adapt-" + Date.now()
    });
    gate("CAST", cast.status < 300, cast.text);
    const votesCast = Number((cast.json && (cast.json.votesCast != null ? cast.json.votesCast : cast.json.VotesCast)) || 0);
    const coeff = Number((cast.json && (cast.json.participatingCoefficient != null ? cast.json.participatingCoefficient : cast.json.ParticipatingCoefficient)) || 0);
    gate("PARTICIPATION", votesCast >= 1, "votesCast=" + votesCast + " eligible=" + (cast.json && cast.json.eligibleVoters));
    gate("COEFFICIENT", coeff > 0, "coeff=" + coeff);

    await owner.reload({ waitUntil: "domcontentloaded" });
    await owner.waitForTimeout(2000);
    const after = await owner.evaluate(() => {
      const t = (document.querySelector("#vote-panel") && document.querySelector("#vote-panel").innerText) || "";
      const part = t.match(/Participaci[oÃ³]n[\s\S]{0,40}?(\d+)\s*\/\s*(\d+)/i);
      return { registered: /registrado|VOTO REGISTRADO/i.test(t), part: part ? part[1] + "/" + part[2] : null, slice: t.slice(0, 280) };
    });
    gate("UI_RECEIPT", after.registered, after.part || after.slice);
    if (after.part) {
      const a = Number(after.part.split("/")[0]);
      gate("UI_1_N", a >= 1, after.part);
    } else {
      gate("UI_1_N", after.registered, "no ratio visible");
    }

    const dup = await api(owner, "POST", "/api/assemblies/" + assemblyId + "/voting/" + sessionId + "/cast", {
      choice: "Against",
      clientRequestId: "adapt-dup-" + Date.now()
    });
    gate("DUP_BLOCK", dup.status >= 400, "status=" + dup.status);

    const longText = "Texto largo de mantenimiento con impermeabilizacion y presupuesto extraordinario para certificacion de layout adaptativo en vivo.";
    const longQ = await api(prez, "POST", "/api/assemblies/" + assemblyId + "/motions", {
      agendaItemId,
      code: "ADL-" + stamp,
      title: longText.slice(0, 100),
      body: longText,
      questionText: longText,
      ballotKind: "FavorAgainstAbstain",
      calculationMethod: "Coefficient",
      decisionRuleCode: "SimpleMajority",
      defaultResultVisibilityPolicy: "HiddenUntilClose",
      optionsJson: JSON.stringify(["A favor", "En contra", "Abstencion"])
    });
    await api(prez, "POST", "/api/assemblies/" + assemblyId + "/voting/" + sessionId + "/close");
    await api(prez, "POST", "/api/assemblies/" + assemblyId + "/motions/" + longQ.json.id + "/publish");
    await api(prez, "POST", "/api/assemblies/" + assemblyId + "/motions/present", { motionId: longQ.json.id });
    const open2 = await api(prez, "POST", "/api/assemblies/" + assemblyId + "/voting/open", {
      motionId: longQ.json.id,
      hidePartialResults: true,
      resultVisibilityPolicy: "HiddenUntilClose"
    });
    gate("SECOND_Q", open2.status < 300, open2.text);
    await owner.reload({ waitUntil: "domcontentloaded" });
    await owner.waitForTimeout(2000);
    const longUi = await owner.evaluate(() => {
      const t = (document.querySelector("#vote-panel") && document.querySelector("#vote-panel").innerText) || "";
      return /impermeabilizaci|presupuesto/i.test(t);
    });
    gate("LONG_CONTENT", longUi, "visible=" + longUi);
    await owner.screenshot({ path: path.join(OUT, "owner-390.png"), fullPage: true }).catch(() => {});

    const desk = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1920, height: 1080 } });
    const dpage = await desk.newPage();
    await login(dpage, "owner101@ocean.demo", PASSWORD);
    await dpage.goto(BASE + "/assembly.html?assemblyId=" + assemblyId, { waitUntil: "domcontentloaded" });
    await dpage.waitForTimeout(2500);
    const deskM = await dpage.evaluate(() => {
      const panel = document.querySelector("#vote-panel");
      return {
        w: panel ? panel.getBoundingClientRect().width : 0,
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
      };
    });
    gate("DESKTOP", deskM.w >= 320 && !deskM.overflowX, JSON.stringify(deskM));
    await dpage.screenshot({ path: path.join(OUT, "owner-1920.png"), fullPage: true }).catch(() => {});
    await desk.close();
  } catch (e) {
    gate("FATAL", false, e.message || String(e));
    console.error(e);
  } finally {
    await browser.close().catch(() => {});
    const failed = Object.values(gates).filter((v) => v === "FAIL").length;
    fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ gates, failed, vpsDeploy: "NOT_PERFORMED", at: new Date().toISOString() }, null, 2));
    console.log("FAILED=" + failed);
    process.exit(failed ? 1 : 0);
  }
})();