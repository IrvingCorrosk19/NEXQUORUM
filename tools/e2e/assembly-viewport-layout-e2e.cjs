/**
 * Viewport layout evidence for assembly.html meeting-ux shell.
 * Uses a fixture that mirrors the room DOM + production CSS (no LiveKit/SignalR).
 */
const path = require("path");
const fs = require("fs");
const http = require("http");
const { chromium } = require(path.join(__dirname, "node_modules/playwright"));

const ROOT = path.resolve(__dirname, "../../src/Asambleas.Web/wwwroot");
const OUT = path.resolve(__dirname, "assembly-viewport-results");
fs.mkdirSync(OUT, { recursive: true });

const FIXTURE = `<!DOCTYPE html>
<html lang="es-PA"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Viewport fixture</title>
<link rel="stylesheet" href="/css/tokens.css"/>
<link rel="stylesheet" href="/css/base.css"/>
<link rel="stylesheet" href="/css/components.css"/>
<link rel="stylesheet" href="/css/assembly-room.css"/>
</head>
<body>
<div class="room room--meeting-ux" data-role="operator">
  <header class="room-header">
    <div class="header-brand"><div><p class="command-eyebrow">Asamblea en vivo</p><h1 class="brand">ASAMBLEAS</h1></div></div>
    <div class="ph-name"><strong>PH Demo</strong><span>Asamblea Ordinaria</span></div>
    <div class="header-metrics">
      <button type="button" id="btn-toggle-sidebar" class="sidebar-toggle">Ocultar panel</button>
      <div class="live-chip"><span class="status-dot online"></span><span>EN VIVO</span><span class="duration">00:12:04</span></div>
      <div class="quorum-chip"><span>Quórum 62%</span></div>
    </div>
  </header>
  <div class="room-body">
    <main class="stage-column">
      <div class="waiting-room-banner" hidden></div>
      <section class="video-stage">
        <div class="stage-copy">
          <div id="video-mount" class="media-stage-grid is-quad">
            <div class="media-tile has-video"><div class="media-tile-video"><div class="media-track" style="background:#1f6f5b"></div></div><div class="media-tile-label">Presidente</div></div>
            <div class="media-tile has-video"><div class="media-tile-video"><div class="media-track" style="background:#3a5070"></div></div><div class="media-tile-label">Propietario A</div></div>
            <div class="media-tile has-video"><div class="media-tile-video"><div class="media-track" style="background:#6b4f2a"></div></div><div class="media-tile-label">Propietario B</div></div>
            <div class="media-tile has-video"><div class="media-tile-video"><div class="media-track" style="background:#4a3860"></div></div><div class="media-tile-label">Propietario C</div></div>
          </div>
        </div>
      </section>
      <div class="stage-actions operator-action-bar">
        <div class="control-cluster"><button type="button" class="btn btn-primary">Iniciar asamblea</button></div>
        <div class="control-cluster control-cluster-danger">
          <a class="btn btn-secondary" href="#">Expediente</a>
          <a class="btn btn-secondary" href="#">Votaciones</a>
          <button type="button" class="btn btn-secondary">Iniciar grabación</button>
        </div>
      </div>
    </main>
    <aside id="governance-sidebar" class="sidebar">
      <div class="sidebar-tabs" role="tablist">
        <button type="button" class="sidebar-tab" data-sidebar-tab="agenda" aria-selected="true">Agenda</button>
        <button type="button" class="sidebar-tab" data-sidebar-tab="motion" aria-selected="false">Moción</button>
        <button type="button" class="sidebar-tab" data-sidebar-tab="vote" aria-selected="false">Votación</button>
      </div>
      <div class="sidebar-panels">
        <section class="is-mobile-active" data-sidebar-panel="agenda"><h2 class="section-title">Agenda</h2><div id="agenda-panel"><p>1. Apertura<br/>2. Informe<br/>3. Votaciones pendientes con texto largo de ejemplo para wrap</p></div></section>
        <section data-sidebar-panel="motion"><h2 class="section-title">Moción</h2><div id="motion-panel"><div class="empty-state">Sin moción</div></div></section>
        <section class="vote-section" data-sidebar-panel="vote"><h2 class="section-title">Votación</h2><div id="vote-panel"><div class="empty-state">Sin votación abierta</div></div></section>
      </div>
    </aside>
  </div>
  <nav id="meeting-control-bar" class="meeting-control-bar">
    <div class="meeting-control-bar__inner">
      <button class="mcb-btn"><span class="mcb-label">Micro</span></button>
      <button class="mcb-btn"><span class="mcb-label">Cámara</span></button>
      <button class="mcb-btn"><span class="mcb-label">Palabra</span></button>
      <button class="mcb-btn"><span class="mcb-label">Personas</span></button>
      <button class="mcb-btn mcb-btn--leave"><span class="mcb-label">Salir</span></button>
    </div>
  </nav>
</div>
<script>
  const room = document.querySelector('.room--meeting-ux');
  const toggle = document.getElementById('btn-toggle-sidebar');
  toggle?.addEventListener('click', () => {
    const on = room.classList.toggle('sidebar-collapsed');
    toggle.textContent = on ? 'Mostrar panel' : 'Ocultar panel';
    toggle.setAttribute('aria-pressed', String(on));
  });
  const tabs = [...document.querySelectorAll('[data-sidebar-tab]')];
  const panels = [...document.querySelectorAll('[data-sidebar-panel]')];
  tabs.forEach(tab => tab.addEventListener('click', () => {
    const key = tab.getAttribute('data-sidebar-tab');
    tabs.forEach(t => t.setAttribute('aria-selected', String(t===tab)));
    panels.forEach(p => p.classList.toggle('is-mobile-active', p.getAttribute('data-sidebar-panel')===key));
  }));
</script>
</body></html>`;

const MIME = {
  ".css": "text/css",
  ".js": "application/javascript",
  ".html": "text/html",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2"
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === "/" || req.url.startsWith("/fixture")) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(FIXTURE);
        return;
      }
      const filePath = path.join(ROOT, decodeURIComponent((req.url || "/").split("?")[0]));
      if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404);
        res.end("missing");
        return;
      }
      const ext = path.extname(filePath);
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function probe(page) {
  return page.evaluate(() => {
    const room = document.querySelector(".room--meeting-ux");
    const bar = document.querySelector("#meeting-control-bar");
    const actions = document.querySelector(".stage-actions");
    const btns = [...document.querySelectorAll(".stage-actions .btn")];
    const roomRect = room.getBoundingClientRect();
    const barRect = bar.getBoundingClientRect();
    const actionRect = actions.getBoundingClientRect();
    const cut = btns.filter((b) => {
      const r = b.getBoundingClientRect();
      return r.bottom > barRect.top + 1 || r.right > window.innerWidth + 1 || r.left < -1;
    }).map((b) => b.textContent.trim());
    return {
      vh: window.innerHeight,
      vw: window.innerWidth,
      docScrollH: document.documentElement.scrollHeight,
      docScrollW: document.documentElement.scrollWidth,
      bodyOverflow: getComputedStyle(document.body).overflow,
      roomH: Math.round(roomRect.height),
      barTop: Math.round(barRect.top),
      actionsBottom: Math.round(actionRect.bottom),
      actionsAboveBar: actionRect.bottom <= barRect.top + 2,
      noHScroll: document.documentElement.scrollWidth <= window.innerWidth + 1,
      cutButtons: cut,
      sidebarVisible: getComputedStyle(document.querySelector(".sidebar")).display !== "none"
    };
  });
}

const VIEWPORTS = [
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "1600x900", width: 1600, height: 900 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "390x844", width: 390, height: 844 }
];

(async () => {
  const server = await startServer();
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto(`http://127.0.0.1:${port}/fixture`, { waitUntil: "networkidle" });
    const metrics = await probe(page);
    const pass =
      metrics.actionsAboveBar &&
      metrics.noHScroll &&
      metrics.cutButtons.length === 0 &&
      metrics.roomH <= metrics.vh + 1;
    await page.screenshot({ path: path.join(OUT, `${vp.name}.png`), fullPage: false });
    // collapsed sidebar shot for desktop
    if (vp.width >= 1024) {
      await page.click("#btn-toggle-sidebar");
      await page.screenshot({ path: path.join(OUT, `${vp.name}-sidebar-collapsed.png`), fullPage: false });
    }
    results.push({ viewport: vp.name, pass, ...metrics });
    await page.close();
  }
  await browser.close();
  server.close();
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ total: results.length, failed: failed.length, failedViewports: failed.map((f) => f.viewport) }, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
