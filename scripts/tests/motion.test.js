// 自動化測試（瀏覽器）：npm run test:all 會依序跑；截圖輸出到 scripts/tests/out/（不進版控）
const __path=require("path"),__fs=require("fs");
const __out=p=>{const full=__path.join(__dirname,"out",p);__fs.mkdirSync(p.endsWith("/")?full:__path.dirname(full),{recursive:true});return p.endsWith("/")?full+"/":full;};
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");const fs=require("fs");const MOCK=fs.readFileSync(__dirname+"/soc-mock.js","utf8");const O=__out("w3/");
const errs=[];let fails=0;const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m);if(!c)fails++;};
const now=new Date();const mo=k=>{const d=new Date(now.getFullYear(),now.getMonth()-k,10,8);return d.toISOString();};
// 玉山主峰軌跡：從排雲走到主峰附近（主峰 23.47,120.957）
const ys={id:"ys1",date:mo(0),trailName:"玉山步道",trailId:"osm-13678202",distanceKm:10.9,elapsedMs:9*3.6e6,ascent:1100,track:[{lat:23.4870,lon:120.9330,t:1},{lat:23.4780,lon:120.9500,t:2},{lat:23.47005,lon:120.95735,t:3}]};
const simYs=Object.assign({},ys,{id:"ys2",sim:true});
const past=[1,2,3].flatMap(k=>[1,2,3,4].map(i=>({id:`p${k}${i}`,date:new Date(now.getFullYear(),now.getMonth()-k,i*5,8).toISOString(),trailName:"x",distanceKm:10,elapsedMs:3*3.6e6,ascent:300,track:[]})));
(async()=>{const srv=spawn("python3",["-m","http.server","8879"],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch();
const mk=async(o={})=>{const ctx=await b.newContext({viewport:{width:o.w||390,height:844},geolocation:{latitude:23.47,longitude:120.957},permissions:["geolocation"]});const p=await ctx.newPage();await require(__dirname+"/fake-weather")(p);p.on("pageerror",e=>errs.push(e.message));
 if(o.routeCond)await ctx.route(/workers\.dev/,r=>o.routeCond==="fail"?r.abort():r.fulfill({status:200,contentType:"application/json",body:JSON.stringify(o.routeCond)}));
 await p.addInitScript(o=>{if(sessionStorage.getItem("x"))return;sessionStorage.setItem("x","1");localStorage.setItem("tt_lang",o.lang||"zh");["tt_onboarded_v2","tt_coach_trail","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_locperm_prompted","tt_coach_team","tt_coach_soc_friends","tt_coach_soc_explore","tt_coach_soc_search","tt_coach_soc_notif","tt_coach_soc_me"].forEach(k=>localStorage.setItem(k,"1"));for(const k in (o.ls||{}))localStorage.setItem(k,o.ls[k]);},o);
 await p.addInitScript(()=>{document.addEventListener("DOMContentLoaded",()=>new MutationObserver(()=>document.querySelectorAll(".tour").forEach(e=>e.remove())).observe(document.body,{childList:true,subtree:true}));});await p.addInitScript(MOCK);await p.goto("http://localhost:8879/");await p.waitForTimeout(2500);
 if(o.login)await p.evaluate(m=>window.__installFakeSupa(m),o.mock||{});
 await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));return p;};
{const p=await mk({});
 await p.click('.tab[data-view="me"]');await p.waitForTimeout(300);
 ok(await p.evaluate(()=>document.body.dataset.nav==="fwd"),"explore → me: slides from right");
 await p.click('.tab[data-view="record"]');await p.waitForTimeout(300);
 ok(await p.evaluate(()=>document.body.dataset.nav==="back"),"me → record: slides from left");
 ok(await p.evaluate(()=>getComputedStyle(document.querySelector(".view.active")).animationName==="tt-in-l"),"active view uses tt-in-l");
 await p.click('.tab[data-view="me"]');await p.waitForTimeout(500);await p.click("#btnPeaks");await p.waitForTimeout(800);
 ok(await p.evaluate(()=>getComputedStyle(document.querySelector('[data-ov="peaks"] .pet-modal-card')).animationName==="tt-pop"),"modal card enters with tt-pop");
 await p.keyboard.press("Escape");
 const r=await p.evaluate(()=>({real:!!document.querySelector('[data-ov="peaks"]'),ghost:document.querySelectorAll(".tt-leaving").length,ids:document.querySelectorAll(".tt-leaving [id]").length,click:getComputedStyle(document.querySelector(".tt-leaving")||document.body).pointerEvents}));
 ok(!r.real&&r.ghost===1&&r.ids===0&&r.click==="none","close: real modal gone at once, inert ghost without ids "+JSON.stringify(r));
 await p.click("#btnPeaks");await p.waitForTimeout(100);ok(await p.evaluate(()=>!!document.querySelector('[data-ov="peaks"]')),"can reopen immediately during exit animation");
 await p.waitForTimeout(400);ok(await p.evaluate(()=>document.querySelectorAll(".tt-leaving").length===0),"ghost removed after animation");
 await p.keyboard.press("Escape");await p.waitForTimeout(400);
 const left=await p.evaluate(()=>document.querySelectorAll(".pet-modal").length);ok(left===0,"no leftover overlays");
 await p.close();}
{const ctx=await b.newContext({viewport:{width:390,height:844},reducedMotion:"reduce"});const p=await ctx.newPage();p.on("pageerror",e=>errs.push(e.message));
 await p.addInitScript(()=>{localStorage.setItem("tt_lang","zh");["tt_onboarded_v2","tt_coach_trail","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_locperm_prompted","tt_coach_team"].forEach(k=>localStorage.setItem(k,"1"));});
 await p.goto("http://localhost:8879/");await p.waitForTimeout(2500);
 await p.click('.tab[data-view="me"]');await p.waitForTimeout(400);await p.click("#btnPeaks");await p.waitForTimeout(500);await p.keyboard.press("Escape");
 ok(await p.evaluate(()=>document.querySelectorAll(".tt-leaving").length===0&&!document.querySelector('[data-ov="peaks"]')),"reduced motion: no ghost, closes instantly");await p.close();}
console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails);await b.close();srv.kill();})();
