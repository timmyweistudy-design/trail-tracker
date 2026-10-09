// 夥伴效能預算（2026-10-08 修正案 原37＋A8）：CPU 降速 4 倍（手機級），每隻待機、最重的兩隻餵食，腳本耗時與 fps 不能超過預算；
// 切到「記錄」頁之後夥伴的動畫迴圈要停（健行時不能被陪伴功能拖慢）。
// 數字會飄：超標時再量兩次取中位數（單次超標不算紅）。預算＝2026-10-08 實測的約 1.5 倍（神龍餵食 167ms/s、待機 80ms/s；其他待機 8～22ms/s）
const __path=require("path"),__fs=require("fs");
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");
const MOCK=__fs.readFileSync(__dirname+"/soc-mock.js","utf8");const errs=[];let fails=0;const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m);if(!c)fails++;};
const PORT = +process.env.TT_PORT || 8917, KM=[0,5,20,40,90,150,260];
const BUDGET={idle:[35,35,40,35,35,35,125],feed:{1:60,6:260},fps:50};   // 腳本 ms／秒（4 倍降速）
(async()=>{const srv=spawn("python3",["-m","http.server",String(PORT)],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch();
const mk=async(st)=>{const ctx=await b.newContext({viewport:{width:390,height:844},timezoneId:"Asia/Taipei"});const p=await ctx.newPage();await require(__dirname+"/fake-weather")(p);p.on("pageerror",e=>errs.push(e.message));
 await p.addInitScript(km=>{localStorage.setItem("tt_lang","zh");["tt_onboarded_v2","tt_coach_trail","tt_locperm_prompted","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_coach_team","tt_coach_pet"].forEach(k=>localStorage.setItem(k,"1"));
  localStorage.setItem("tt_pet_woke",String(Date.now()));localStorage.setItem("tt_test_diary","1");localStorage.setItem("tt_debug_km",String(km));localStorage.setItem("tt_pet_berry_bonus","30");
  // 記下每個 requestAnimationFrame 是誰排的（A8：切到記錄頁後，夥伴的檔案不能再排任何一格）
  const raf=window.requestAnimationFrame.bind(window);window.__petRaf=0;window.requestAnimationFrame=f=>{const pet=/pet-(walk|stage)\.js/.test(new Error().stack||"");return raf(t=>{if(pet)window.__petRaf++;f(t);});};},KM[st]);
 await p.addInitScript(MOCK);await p.goto(`http://localhost:${PORT}/`);await require(__dirname+"/ready")(p);
 await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));await p.click('.tab[data-view="pet"]');await p.waitForTimeout(1200);
 await p.evaluate(()=>{document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove());window.__psNoIdle=true;localStorage.removeItem("tt_pet_fed_t");renderPet();document.querySelector(".ps-box").scrollIntoView({block:"center"});});
 await p.waitForTimeout(800);const cdp=await ctx.newCDPSession(p);await cdp.send("Performance.enable");await cdp.send("Emulation.setCPUThrottlingRate",{rate:4});
 await p.evaluate(()=>{window.__lt=[];try{new PerformanceObserver(l=>l.getEntries().forEach(e=>window.__lt.push(e.duration))).observe({entryTypes:["longtask"]});}catch(e){}});return {p,ctx,cdp};};
const seg=async({p,cdp},run)=>{const M=async()=>Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(m=>[m.name,m.value]));
 const m0=await M();await p.evaluate(()=>{window.__lt.length=0;window.__fr=0;const g=window.__gen=(window.__gen||0)+1;const t=()=>{if(window.__gen!==g)return;window.__fr++;requestAnimationFrame(t);};requestAnimationFrame(t);window.__t0=performance.now();});
 await run();const r=await p.evaluate(()=>{window.__gen++;const s=(performance.now()-window.__t0)/1000;return {s,fps:window.__fr/s,lt:window.__lt.length};});const m1=await M();
 return {fps:+r.fps.toFixed(1),lt:r.lt,script:+((m1.ScriptDuration-m0.ScriptDuration)*1000/r.s).toFixed(1)};};
const med=a=>a.slice().sort((x,y)=>x-y)[Math.floor(a.length/2)];
// 超標就再量兩次取中位數
const measure=async(st,kind)=>{const runs=[];for(let k=0;k<3;k++){const h=await mk(st);
  const r=await seg(h,kind==="idle"?()=>h.p.waitForTimeout(3000):async()=>{await h.p.evaluate(()=>document.querySelector("#petFeed").click());await h.p.waitForFunction(()=>!document.querySelector(".ps-box").classList.contains("feeding"),null,{timeout:120000});});
  runs.push(r);await h.ctx.close();const lim=kind==="idle"?BUDGET.idle[st]:BUDGET.feed[st];if(k===0&&r.script<=lim&&r.fps>=BUDGET.fps)break;}
 return {script:med(runs.map(r=>r.script)),fps:med(runs.map(r=>r.fps)),lt:med(runs.map(r=>r.lt)),n:runs.length};};

for(let st=0;st<7;st++){const r=await measure(st,"idle");ok(r.script<=BUDGET.idle[st]&&r.fps>=BUDGET.fps&&r.lt<=1,`stage ${st} idle within budget: script ${r.script}ms/s ≤ ${BUDGET.idle[st]}, ${r.fps}fps, long tasks ${r.lt} (${r.n} run)`);}
for(const st of [1,6]){const r=await measure(st,"feed");ok(r.script<=BUDGET.feed[st]&&r.fps>=BUDGET.fps,`stage ${st} feeding within budget: script ${r.script}ms/s ≤ ${BUDGET.feed[st]}, ${r.fps}fps (${r.n} run)`);}

// A8：神龍（最重的）在夥伴頁 → 切到記錄頁：1 秒後開始數，3 秒內夥伴排的動畫格數要是 0
{const h=await mk(6);const before=await h.p.evaluate(async()=>{const n=window.__petRaf;await new Promise(r=>setTimeout(r,500));return window.__petRaf-n;});
 await h.p.click('.tab[data-view="record"]');await h.p.waitForTimeout(1000);
 const after=await h.p.evaluate(async()=>{const n=window.__petRaf;await new Promise(r=>setTimeout(r,3000));return window.__petRaf-n;});
 ok(before>0,"setup: the dragon animates on the pet page ("+before+" frames in 0.5s)");
 ok(after===0,"A8: after switching to the record page the pet schedules no animation frames ("+after+" in 3s)");
 const rec=await seg(h,()=>h.p.waitForTimeout(3000));ok(rec.script<=25,"A8: record page script time with the dragon parked: "+rec.script+"ms/s ≤ 25");
 await h.ctx.close();}

ok(errs.length===0,"no page errors "+JSON.stringify(errs.slice(0,3)));
console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails);
await b.close();srv.kill();process.exit(fails?1:0);})().catch(e=>{console.error(e);process.exit(1);});
