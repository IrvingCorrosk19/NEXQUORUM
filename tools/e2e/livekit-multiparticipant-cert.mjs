import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "livekit-multiparticipant-results");
const BASE = process.env.ASAM_BASE_URL || "https://asambleas.164.68.99.83.nip.io";
const ASSEMBLY_ID = process.env.ASAM_ASSEMBLY_ID || "768822c2-e34c-446e-9b02-78e8c157dca8";
const PASSWORD = process.env.ASAM_DEMO_PASSWORD || "";
fs.mkdirSync(OUT, { recursive: true });

async function apiLoginCookies(email) {
  const afRes = await fetch(`${BASE}/api/auth/antiforgery`, { credentials: "include" });
  const afSet = afRes.headers.getSetCookie?.() || [];
  const af = await afRes.json();
  const jar = new Map();
  for (const c of afSet) {
    const [nv] = c.split(";");
    const i = nv.indexOf("=");
    jar.set(nv.slice(0, i), nv.slice(i + 1));
  }
  const cookieHeader = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      RequestVerificationToken: af.requestToken,
      Cookie: cookieHeader
    },
    body: JSON.stringify({ email, password: PASSWORD })
  });
  const loginSet = loginRes.headers.getSetCookie?.() || [];
  for (const c of loginSet) {
    const [nv] = c.split(";");
    const i = nv.indexOf("=");
    jar.set(nv.slice(0, i), nv.slice(i + 1));
  }
  if (!loginRes.ok) {
    throw new Error(`login failed ${email} ${loginRes.status} ${await loginRes.text()}`);
  }
  // Convert jar to playwright cookies
  const cookies = [];
  for (const [name, value] of jar.entries()) {
    cookies.push({
      name,
      value,
      domain: "asambleas.164.68.99.83.nip.io",
      path: "/",
      secure: true,
      httpOnly: name.toLowerCase().includes("auth") || name.toLowerCase().includes("session") || name.startsWith(".")
    });
  }
  return cookies;
}

async function openRoom(context, role, grantMedia) {
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      fs.appendFileSync(path.join(OUT, `${role}-console.txt`), msg.text() + "\n");
    }
  });
  if (grantMedia) {
    await context.grantPermissions(["camera", "microphone"], { origin: BASE });
  }
  await page.goto(`${BASE}/assembly.html?assemblyId=${ASSEMBLY_ID}&mediaDebug=1&v=${Date.now()}`, {
    waitUntil: "networkidle",
    timeout: 90000
  });
  // Wait until LiveKit diagnostics appear or timeout
  for (let i = 0; i < 30; i++) {
    const ready = await page.evaluate(() => typeof window.__asambleasMediaDiagnostics === "function");
    if (ready) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(OUT, `${role}.png`), fullPage: true });
  return page;
}

async function snap(page) {
  return page.evaluate(() => {
    const tiles = [...document.querySelectorAll(".media-tile")].map((t) => ({
      identity: t.dataset.identity,
      local: t.classList.contains("is-local"),
      hasVideo: t.classList.contains("has-video"),
      cameraOff: t.classList.contains("camera-off"),
      videos: t.querySelectorAll("video").length,
      audios: t.querySelectorAll("audio").length
    }));
    const hint = document.querySelector(".media-empty-hint")?.textContent || null;
    const media = window.__asambleasMediaDiagnostics?.() || null;
    return {
      url: location.href,
      title: document.title,
      tileCount: tiles.length,
      tiles,
      hint,
      media,
      bodySnippet: document.body?.innerText?.slice(0, 200) || ""
    };
  });
}

(async () => {
  if (!PASSWORD) throw new Error("ASAM_DEMO_PASSWORD required");
  const browser = await chromium.launch({ headless: true });

  const cookiesA = await apiLoginCookies("president@ocean.demo");
  const cookiesB = await apiLoginCookies("owner101@ocean.demo");

  const ctxA = await browser.newContext({ ignoreHTTPSErrors: true });
  const ctxB = await browser.newContext({ ignoreHTTPSErrors: true });
  await ctxA.addCookies(cookiesA);
  await ctxB.addCookies(cookiesB);

  // Scenario 3: owner first
  const pageB = await openRoom(ctxB, "owner", false);
  const pageA = await openRoom(ctxA, "president", true);

  await pageA.waitForTimeout(6000);
  await pageB.waitForTimeout(2000);

  let da = await snap(pageA);
  let db = await snap(pageB);
  await pageA.screenshot({ path: path.join(OUT, "president-final.png"), fullPage: true });
  await pageB.screenshot({ path: path.join(OUT, "owner-final.png"), fullPage: true });

  // Scenario 6 reload owner
  await pageB.reload({ waitUntil: "networkidle" });
  await pageB.waitForTimeout(8000);
  const dbReload = await snap(pageB);
  await pageB.screenshot({ path: path.join(OUT, "owner-reload.png"), fullPage: true });

  const matrix = {
    adminSeesOwner: (da.media?.remotes || 0) >= 1 || da.tiles.some((t) => !t.local),
    ownerSeesAdmin: (db.media?.remotes || 0) >= 1 || db.tiles.some((t) => !t.local),
    sameRoomName: da.media?.roomName && db.media?.roomName ? da.media.roomName === db.media.roomName : false,
    firstParticipantGone:
      !/primer participante/i.test(da.hint || "") && !/primer participante/i.test(db.hint || ""),
    ownerWithoutCamConnected: db.media?.connectionState === "connected",
    reloadDiscovers: (dbReload.media?.remotes || 0) >= 1,
    da,
    db,
    dbReload
  };
  fs.writeFileSync(path.join(OUT, "cert-matrix.json"), JSON.stringify(matrix, null, 2));
  console.log(JSON.stringify(matrix, null, 2));
  const pass =
    matrix.adminSeesOwner &&
    matrix.ownerSeesAdmin &&
    matrix.sameRoomName &&
    matrix.firstParticipantGone &&
    matrix.reloadDiscovers;
  await browser.close();
  process.exit(pass ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});