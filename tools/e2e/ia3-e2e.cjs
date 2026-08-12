const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const BASE = process.env.ASAMBLEAS_BASE_URL || "https://asambleas.164.68.99.83.nip.io";
const EMAIL = "phadmin@ocean.demo";
const PASSWORD = fs.readFileSync(path.join(__dirname, ".demo-pw.tmp"), "utf8").trim();
const OUT = path.join(__dirname, "ia3-results");
fs.mkdirSync(OUT, { recursive: true });
const results = { steps: [], pass: false, http500: 0, consoleErrors: [] };
function step(n, ok, d=""){ results.steps.push({n,ok,d}); console.log((ok?"PASS":"FAIL")+"  "+n+(d?" — "+d:"")); }
async function shot(p,n){ await p.screenshot({path:path.join(OUT,n+".png")}); }

(async()=>{
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage({viewport:{width:1440,height:900}});
  page.on("console", m => { if(m.type()==="error") results.consoleErrors.push(m.text()); });
  page.on("response", r => { if(r.status()>=500) results.http500++; });
  try {
    await page.goto(BASE+"/", {waitUntil:"networkidle"});
    const loginOk = await page.evaluate(async ({email, password}) => {
      const af = await fetch("/api/auth/antiforgery", {credentials:"same-origin"});
      const { requestToken } = await af.json();
      const res = await fetch("/api/auth/login", {
        method:"POST", credentials:"same-origin",
        headers:{ "Content-Type":"application/json", "RequestVerificationToken": requestToken, "Accept":"application/json" },
        body: JSON.stringify({ email, password })
      });
      return { status: res.status, body: await res.text() };
    }, { email: EMAIL, password: PASSWORD });
    step("LOGIN_API", loginOk.status>=200 && loginOk.status<300, JSON.stringify(loginOk).slice(0,180));
    if (!(loginOk.status>=200 && loginOk.status<300)) throw new Error("login api failed");
    await page.goto(BASE+"/ph.html", {waitUntil:"networkidle"});
    step("LOGIN_SESSION", /ph\.html/.test(page.url()), page.url());

    const phId = await page.evaluate(async () => {
      const list = await (await fetch("/api/ph",{credentials:"same-origin"})).json();
      const row = (list||[]).find(p => /Irving/i.test(p.name||""));
      return row?.id || null;
    });
    step("RESOLVE_PH_IRVING", !!phId, String(phId));
    if (!phId) throw new Error("no irving");

    await page.goto(BASE+"/ph.html?phId="+phId+"#assemblies", {waitUntil:"networkidle"});
    await page.waitForTimeout(1000);
    await shot(page,"02-assemblies");
    step("ASSEMBLIES_ENTRY", /#assemblies/.test(page.url()), page.url());
    const crumb = (await page.locator("#ia-breadcrumbs").innerText().catch(()=> "")).replace(/\s+/g," ");
    step("BREADCRUMB_PH", /Propiedades/i.test(crumb)&&/Irving/i.test(crumb), crumb);
    step("NO_BACK_BUTTON", (await page.locator('button:has-text("← Propiedades")').count())===0);

    const openAsm = page.locator("#ph-assemblies-list a:has-text(\"Continuar preparación\"), #ph-assemblies-list a:has-text(\"Ver asamblea\")").first();
    await openAsm.waitFor({timeout:20000});
    await openAsm.click();
    await page.waitForURL(/dashboard\.html\?assemblyId=/, {timeout:20000});
    await page.waitForTimeout(1200);
    await shot(page,"03-overview");
    const assemblyId = new URL(page.url()).searchParams.get("assemblyId");
    step("ASSEMBLY_OVERVIEW", !!assemblyId, page.url());
    step("ASSEMBLY_TABS", (await page.locator(".ia-asm-tabs a, #ia-assembly-tabs a").count())>=4);
    step("OVERVIEW_STATS", (await page.locator("#assembly-stat-strip .ia-stat").count())>=3);

    await page.locator('.ia-asm-tabs a:has-text("Votaciones"), #ia-assembly-tabs a:has-text("Votaciones")').first().click();
    await page.waitForURL(/voting-studio\.html\?assemblyId=/, {timeout:20000});
    await page.waitForTimeout(1500);
    await shot(page,"04-voting");
    const voteAsmId = new URL(page.url()).searchParams.get("assemblyId");
    step("VOTING_SAME_ASSEMBLY", voteAsmId===assemblyId, "exp="+assemblyId+" got="+voteAsmId);
    const voteCrumb = (await page.locator("#ia-breadcrumbs").innerText().catch(()=> "")).replace(/\s+/g," ");
    step("VOTING_BREADCRUMB", /Irving/i.test(voteCrumb)&&/Asambleas/i.test(voteCrumb)&&/Votaciones/i.test(voteCrumb), voteCrumb);
    step("VOTING_PRIMARY_CREATE", (await page.locator("#btn-create").count())>=1);
    step("NO_ETERNAL_LOADING", (await page.locator("text=Cargando asamblea").count())===0);

    await page.locator('#ia-breadcrumbs a:has-text("Asambleas")').first().click();
    await page.waitForURL(/ph\.html\?phId=.*#assemblies/, {timeout:20000});
    await page.waitForTimeout(800);
    await shot(page,"05-return");
    step("BREADCRUMB_ASSEMBLIES_RETURN", /#assemblies/.test(page.url())&&page.url().includes(phId), page.url());

    await page.goto(BASE+"/voting-studio.html?assemblyId="+assemblyId, {waitUntil:"networkidle"});
    await page.waitForTimeout(1200);
    await shot(page,"06-deeplink");
    const deepCrumb = (await page.locator("#ia-breadcrumbs").innerText().catch(()=> "")).replace(/\s+/g," ");
    step("DEEP_LINK_CONTEXT", /Irving/i.test(deepCrumb)&&/Asambleas/i.test(deepCrumb)&&(await page.locator(".ia-asm-tabs a").count())>=3, deepCrumb);

    for (const [w,h,label] of [[1920,1080,"1920"],[1440,900,"1440"],[1366,768,"1366"],[390,844,"mobile"]]) {
      await page.setViewportSize({width:w,height:h});
      await page.goto(BASE+"/dashboard.html?assemblyId="+assemblyId, {waitUntil:"networkidle"});
      await page.waitForTimeout(500);
      await shot(page,"resp-"+label);
      const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
      step("RESPONSIVE_"+label, !overflowX, overflowX?"overflow":"ok");
    }

    results.pass = results.steps.every(s=>s.ok) && results.http500===0;
  } catch(e) {
    step("FATAL", false, e.message);
    results.pass=false;
    try{await shot(page,"fatal");}catch{}
  } finally {
    fs.writeFileSync(path.join(OUT,"results.json"), JSON.stringify(results,null,2));
    try { fs.unlinkSync(path.join(__dirname,".demo-pw.tmp")); } catch {}
    await browser.close();
    console.log("SUMMARY", results.pass?"PASS":"FAIL", results.steps.filter(s=>s.ok).length+"/"+results.steps.length, "http500="+results.http500, "jsErr="+results.consoleErrors.length);
    process.exit(results.pass?0:1);
  }
})();
