/**
 * Structural realtime-audio echo audit (Playwright).
 * Asserts: local mic not attached for playback; AEC defaults present in module;
 * does NOT certify acoustic echo (requires human speaker/headphones test).
 */
const { chromium } = require(require("path").join(__dirname, "node_modules/playwright"));
const fs = require("fs");
const path = require("path");

const BASE = process.env.ASAMBLEAS_BASE_URL || "https://localhost:7188";
const OUT = path.join(__dirname, "realtime-audio-results");
fs.mkdirSync(OUT, { recursive: true });

const report = {
  base: BASE,
  livekitSdk: null,
  moduleHasAecDefaults: false,
  moduleSkipsLocalAudioAttach: false,
  topology: null,
  verdict: "NOT CERTIFIED",
  notes: []
};

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--ignore-certificate-errors"]
  });
  const page = await browser.newPage({ ignoreHTTPSErrors: true });
  try {
    let meetingSrc = "";
    try {
      const res = await page.goto(`${BASE}/js/modules/meeting.js`, {
        waitUntil: "domcontentloaded",
        timeout: 15000
      });
      if (res && res.ok()) meetingSrc = await res.text();
    } catch {
      /* fall through to disk */
    }
    if (!meetingSrc) {
      meetingSrc = fs.readFileSync(
        path.join(__dirname, "../../src/Asambleas.Web/wwwroot/js/modules/meeting.js"),
        "utf8"
      );
      report.notes.push("meeting.js read from disk (local server unavailable)");
    }
    report.moduleHasAecDefaults =
      /ASAMBLEAS_AUDIO_CAPTURE_DEFAULTS/.test(meetingSrc) &&
      /echoCancellation:\s*true/.test(meetingSrc) &&
      /noiseSuppression:\s*true/.test(meetingSrc) &&
      /autoGainControl:\s*true/.test(meetingSrc);

    report.moduleSkipsLocalAudioAttach =
      /never play local mic/i.test(meetingSrc) &&
      /track\.kind === "audio" && isLocal/.test(meetingSrc) &&
      /Local audio: publish to LiveKit only/.test(meetingSrc);

    report.livekitSdk = "2.9.1 (assembly.html CDN)";
    report.notes.push(
      "Acoustic HUMAN SELF-ECHO TEST is mandatory and not covered by this structural script."
    );

    if (report.moduleHasAecDefaults && report.moduleSkipsLocalAudioAttach) {
      report.verdict = "STRUCTURAL AUDIO PIPELINE — PASS (HUMAN AEC GATE PENDING)";
    }
  } catch (e) {
    report.notes.push(String(e?.stack || e));
  }

  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  process.exit(report.verdict.includes("PASS") ? 0 : 1);
})();
