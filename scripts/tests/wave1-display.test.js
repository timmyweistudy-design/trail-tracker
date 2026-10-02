// 自動化測試（瀏覽器）：npm run test:all 會依序跑；截圖輸出到 scripts/tests/out/（不進版控）
const __path=require("path"),__fs=require("fs");
const __out=p=>{const full=__path.join(__dirname,"out",p);__fs.mkdirSync(p.endsWith("/")?full:__path.dirname(full),{recursive:true});return p.endsWith("/")?full+"/":full;};
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");
const errs=[];let fails=0;const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m);if(!c)fails++;};
(async()=>{const srv=spawn("python3",["-m","http.server","8876"],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch();
const mk=async(seed,o={})=>{const p=await (await b.newContext({viewport:{width:390,height:844},colorScheme:o.scheme||"light",geolocation:{latitude:24.45,longitude:121.75},permissions:["geolocation"]})).newPage();p.on("pageerror",e=>errs.push(e.message));
 await p.addInitScript(s=>{if(sessionStorage.getItem("x"))return;sessionStorage.setItem("x","1");localStorage.setItem("tt_lang","zh");["tt_onboarded_v2","tt_coach_trail","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_locperm_prompted"].forEach(k=>localStorage.setItem(k,"1"));for(const k in s)localStorage.setItem(k,s[k]);},seed);
 await p.goto("http://localhost:8876/");await p.waitForTimeout(2200);await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));return p;};
const st=p=>p.evaluate(()=>[document.documentElement.getAttribute("data-theme"),document.documentElement.getAttribute("data-vis")||"",localStorage.getItem("tt_theme"),localStorage.getItem("tt_vis")]);
// 舊設定遷移
for(const [seed,exp,scheme] of [[{tt_vis:"red"},"dark,,dark,"],[{tt_vis:"sun",tt_theme:"dark"},"light,sun,sun,"],[{tt_theme:"auto"},"dark,,dark,","dark"],[{tt_theme:"auto"},"light,,light,","light"],[{},"light,,,"],[{tt_theme:"dark"},"dark,,dark,"]]){
 const p=await mk(seed,{scheme});const r=(await st(p)).map(x=>x==null?"":x).join(",");ok(r===exp,"migrate "+JSON.stringify(seed)+(scheme?"/"+scheme:"")+" → "+r);
 await p.reload();await p.waitForTimeout(1200);const r2=(await st(p)).map(x=>x==null?"":x).join(",");ok(r2===exp,"  stable after reload → "+r2);await p.close();}
// 外觀設定只有三顆
{const p=await mk({tt_set_open:"[0,1,2,3,4,5]"});await p.click('.tab[data-view="me"]');await p.waitForTimeout(1000);
 const opts=await p.evaluate(()=>[...document.querySelectorAll("#view-me [data-theme-opt]")].map(b=>b.dataset.themeOpt));ok(opts.join()==="light,dark,sun","me theme options = light,dark,sun");
 ok(await p.evaluate(()=>!document.querySelector("[data-vis-opt]")),"no vis buttons anywhere");
 await p.click('[data-theme-opt="sun"]');ok((await st(p)).slice(0,3).join()==="light,sun,sun","pick sun");
 await p.click('[data-theme-opt="dark"]');ok((await st(p)).slice(0,3).join()==="dark,,dark","pick dark clears sun");
 ok(await p.evaluate(()=>document.querySelector('[data-theme-opt="dark"]').classList.contains("on")&&!document.querySelector('[data-theme-opt="sun"]').classList.contains("on")),"on state follows");
 await p.evaluate(()=>document.querySelector('[data-theme-opt="dark"]').closest(".set-body").scrollIntoView());await p.waitForTimeout(300);await p.screenshot({path:__out("rp/me-theme.png")});
 // 記錄頁沒有畫面切換、頁首
 await p.click('.tab[data-view="record"]');await p.waitForTimeout(1500);
 ok(await p.evaluate(()=>!document.querySelector("#view-record .vis-row")),"record page has no display switch");
 ok(await p.evaluate(()=>document.getElementById("recTitle").textContent==="準備出發"&&!document.getElementById("recSunPill").hidden),"record header idle");
 await p.evaluate(()=>{const t=TRAILS.find(x=>x.id==="forestry-004");return ensureGeo(t.region).then(()=>selectTrailForRecord(t))});await p.waitForTimeout(1500);
 ok(await p.evaluate(()=>document.getElementById("recTitle").textContent===TRAILS.find(x=>x.id==="forestry-004").name),"header shows selected trail");
 await p.click("#selTrailX");await p.waitForTimeout(400);ok(await p.evaluate(()=>document.getElementById("recTitle").textContent==="準備出發"),"free route resets header");
 await p.evaluate(()=>followRoute([[24.45,121.75],[24.46,121.76]],"我的路線"));await p.waitForTimeout(500);ok(await p.evaluate(()=>document.getElementById("recTitle").textContent==="我的路線"),"imported route name in header");
 await p.click("#selTrailX");await p.waitForTimeout(300);
 await p.evaluate(()=>{document.getElementById("simToggle").checked=true;});await p.click("#btnStart");await p.waitForTimeout(3000);
 const rh=await p.evaluate(()=>[document.getElementById("recEyebrow").textContent,document.getElementById("recTitle").textContent,Recorder._trailName]);ok(/記錄中/.test(rh[0])&&rh[1]===(rh[2]||"自由路線"),"running header: "+rh.join(" / "));
 ok(await p.evaluate(()=>getComputedStyle(document.querySelector(".rec-opts")).display==="none"),"settings hidden while recording");
 await p.click("#btnPause");await p.waitForTimeout(500);ok(await p.evaluate(()=>/已暫停/.test(document.getElementById("recEyebrow").textContent)),"paused header");
 // 天黑提示的切深色鈕
 await p.evaluate(()=>setTheme("light"));await p.evaluate(()=>{const s=Object.assign({},Recorder.snapshot(),{sim:false});window.sunsetAt=()=>new Date(Date.now()-60000);Outdoor.onUpdate(s)});
 const sb=await p.$(".sh-red");ok(!!sb,"after-dark button offered");if(sb){await sb.click();ok((await st(p))[0]==="dark","after-dark button switches to dark");}
 await p.close();}
console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails);await b.close();srv.kill();})();
