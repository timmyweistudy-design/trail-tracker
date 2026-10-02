// 自動化測試（瀏覽器）：npm run test:all 會依序跑；截圖輸出到 scripts/tests/out/（不進版控）
const __path=require("path"),__fs=require("fs");
const __out=p=>{const full=__path.join(__dirname,"out",p);__fs.mkdirSync(p.endsWith("/")?full:__path.dirname(full),{recursive:true});return p.endsWith("/")?full+"/":full;};
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");const fs=require("fs");const MOCK=fs.readFileSync(__dirname+"/soc-mock.js","utf8");const O=__out("w1/");
const errs=[];let fails=0;const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m);if(!c)fails++;};
// 慢腳程紀錄：比公式慢 1.6 倍
const R=[1,2,3,4].map(i=>({id:"s"+i,date:new Date(Date.now()-i*3*864e5).toISOString(),trailName:"x",distanceKm:5,ascent:250,elapsedMs:(5/3.5+250/500)*1.6*3.6e6,track:[]}));
(async()=>{const srv=spawn("python3",["-m","http.server","8880"],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch();
const mk=async(o={})=>{const ctx=await b.newContext({viewport:{width:o.w||390,height:844},geolocation:{latitude:24.4526,longitude:121.7517,accuracy:8},permissions:["geolocation"],timezoneId:"Asia/Taipei"});const p=await ctx.newPage();await require(__dirname+"/fake-weather")(p);p.on("pageerror",e=>errs.push(e.message));
 await p.addInitScript(o=>{if(sessionStorage.getItem("seed"))return;sessionStorage.setItem("seed","1");localStorage.setItem("tt_lang",o.lang||"zh");if(o.fs)localStorage.setItem("tt_fontscale",o.fs);["tt_onboarded_v2","tt_coach_trail","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_locperm_prompted","tt_coach_team"].forEach(k=>localStorage.setItem(k,"1"));if(o.recs)localStorage.setItem("tt_records",o.recs);},Object.assign({},o));
 await p.addInitScript(MOCK);await p.goto("http://localhost:8880/");await p.waitForTimeout(2300);
 if(o.login)await p.evaluate(()=>window.__installFakeSupa({}));
 await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));return p;};
const overlap=(p)=>p.evaluate(()=>{const z=document.querySelector(".map-fs .leaflet-control-zoom"),bar=document.getElementById("teamReadyBar");if(!z||!bar)return {err:"missing",z:!!z,bar:!!bar};const a=z.getBoundingClientRect(),c=bar.getBoundingClientRect();const ctl=[...document.querySelectorAll(".map-fs .leaflet-control, .map-fs .map-fs-btn, .map-fs .fs-hud")].filter(e=>e.getClientRects().length&&getComputedStyle(e).display!=="none").map(e=>e.getBoundingClientRect()).filter(r=>r.width);const hit=ctl.filter(r=>!(r.right<=c.left||r.left>=c.right||r.bottom<=c.top||r.top>=c.bottom));return {bar:[c.left,c.top,c.right,c.bottom].map(Math.round),hits:hit.length}});
// 1 全螢幕＋小隊
for(const [w,f] of [[390,"1.2"],[360,"1.65"]]){const p=await mk({login:1,w,fs:f});
 await p.click('.tab[data-view="record"]');await p.waitForTimeout(1200);
 await p.evaluate(()=>{initRecMap();Team.setActive("tm1","週末爬山隊");TeamLive.start("tm1",recMap,{name:"Timmy"},{leader:"me"});});await p.waitForTimeout(2200);
 await p.evaluate(()=>document.querySelector("#recMap .map-fs-btn:not(.map-3d-btn):not(.recenter-btn):not(.map-nav-btn)").click());await p.waitForTimeout(800);
 const r=await overlap(p);ok(r.hits===0,`fs team bar overlaps no map control at ${w}/${f}: `+JSON.stringify(r));
 ok(await p.evaluate(()=>getComputedStyle(document.querySelector(".map-fs .fs-hud")).display==="none"),"idle fs hides 0.00 hud");
 await p.screenshot({path:O+`fix-fs-${w}.png`});
 // 縮放鈕真的點得到
 const zin=await p.evaluate(()=>{const a=document.querySelector(".map-fs .leaflet-control-zoom-in").getBoundingClientRect();const el=document.elementFromPoint(a.x+a.width/2,a.y+a.height/2);return el&&el.closest(".leaflet-control-zoom-in")?"zoom-in":(el&&(el.className||el.tagName))});ok(/zoom-in/.test(zin||""),"zoom-in is topmost at its spot: "+zin);
 await p.close();}
// 2 日落與 TWD97
{const p=await mk();
 const ss=await p.evaluate(()=>{const d=sunsetAt(25.033,121.565,new Date(2026,9,2));return d.getHours()*60+d.getMinutes()});
 ok(Math.abs(ss-(17*60+38))<=6,"Taipei sunset Oct 2 ≈ 17:38 → "+Math.floor(ss/60)+":"+String(ss%60).padStart(2,"0"));
 const ss2=await p.evaluate(()=>{const d=sunsetAt(25.033,121.565,new Date(2026,5,21));return d.getHours()*60+d.getMinutes()});
 ok(Math.abs(ss2-(18*60+47))<=6,"Taipei sunset Jun 21 ≈ 18:47 → "+Math.floor(ss2/60)+":"+String(ss2%60).padStart(2,"0"));
 const tw=await p.evaluate(()=>[toTWD97(23.5,121),toTWD97(24,121),toTWD97(24,121.01)]);
 // 子午線弧長數值積分驗證 y
 const a=6378137,f=1/298.257222101,e2=f*(2-f);let M=0;const N=20000,phi=24*Math.PI/180;for(let i=0;i<N;i++){const t=(i+.5)/N*phi;M+=a*(1-e2)/Math.pow(1-e2*Math.sin(t)**2,1.5)*phi/N;}
 ok(tw[0].x===250000,"TWD97 x at central meridian = 250000");
 ok(Math.abs(tw[1].y-Math.round(0.9999*M))<=2,"TWD97 y matches meridian arc ("+tw[1].y+" vs "+Math.round(0.9999*M)+")");
 const Nn=a/Math.sqrt(1-e2*Math.sin(phi)**2);ok(Math.abs((tw[2].x-250000)-0.9999*Nn*Math.cos(phi)*0.01*Math.PI/180)<=2,"TWD97 x offset 0.01° ≈ "+(tw[2].x-250000)+" m");
 await p.close();}
// 3 求救卡（待機）
{const p=await mk();await p.click('.tab[data-view="record"]');await p.waitForTimeout(1200);
 ok(await p.evaluate(()=>document.getElementById("btnBacktrack").hidden&&!document.getElementById("btnSos").hidden),"idle: SOS visible, backtrack hidden");
 await p.click("#btnSos");await p.waitForTimeout(1500);
 const t=await p.evaluate(()=>document.querySelector('[data-ov="sos"]').innerText);
 ok(/24\.452600, 121\.751700/.test(t)&&/TWD97/.test(t)&&/X \d{6}/.test(t),"SOS shows coords + TWD97");
 ok(await p.evaluate(()=>document.querySelector(".sos-call").getAttribute("href")==="tel:112"&&/sms:/.test(document.getElementById("sosSms").getAttribute("href"))),"SOS tel/sms links");
 await p.screenshot({path:O+"sos.png"});
 await p.keyboard.press("Escape");await p.waitForTimeout(300);ok(await p.evaluate(()=>!document.querySelector('[data-ov="sos"]')),"SOS closes on Esc");
 await p.close();}
// 4 記錄中：原路返回＋天黑倒數
{const p=await mk();await p.click('.tab[data-view="record"]');await p.waitForTimeout(1200);
 await p.evaluate(()=>{const t=TRAILS.find(x=>x.id==="forestry-004");return ensureGeo(t.region).then(()=>selectTrailForRecord(t))});await p.waitForTimeout(2500);
 await p.evaluate(()=>{document.getElementById("simToggle").checked=true;});await p.click("#btnStart");await p.waitForTimeout(5000);
 await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));
 ok(await p.evaluate(()=>!document.getElementById("btnBacktrack").hidden),"running: backtrack button visible");
 await p.click("#btnBacktrack");await p.waitForTimeout(3500);
 ok(await p.evaluate(()=>Outdoor.isBacktracking()&&!document.getElementById("backHud").hidden&&routeSegs()===Outdoor.backSegs()||JSON.stringify(routeSegs())===JSON.stringify(Outdoor.backSegs())),"backtrack active, route check uses own track");
 console.log("backHud:",await p.evaluate(()=>document.getElementById("backHud").innerText.replace(/\n/g," | ")));
 await p.screenshot({path:O+"back.png"});
 await p.evaluate(()=>document.getElementById("backEnd").click());await p.waitForTimeout(400);
 ok(await p.evaluate(()=>!Outdoor.isBacktracking()&&document.getElementById("backHud").hidden),"backtrack ends");
 // 天黑倒數：假日落
 const st=await p.evaluate(()=>{const real=window.sunsetAt;const res={};const s=Object.assign({},Recorder.snapshot(),{sim:false});
   window.sunsetAt=()=>new Date(Date.now()+30*60000);Outdoor.onUpdate(Object.assign({},s,{elapsedMs:2*3.6e6}));res.late=document.getElementById("sunHud").className+"|"+document.getElementById("sunHud").innerText;
   window.sunsetAt=()=>new Date(Date.now()+6*3.6e6);Outdoor.onUpdate(Object.assign({},s,{elapsedMs:3600e3}));res.early=document.getElementById("sunHud").className+"|"+document.getElementById("sunHud").innerText;
   window.sunsetAt=()=>new Date(Date.now()-60000);Outdoor.onUpdate(s);res.dark=document.getElementById("sunHud").className+"|"+document.getElementById("sunHud").innerText+"|red:"+!!document.querySelector(".sh-red");
   window.sunsetAt=real;return res;});
 console.log(JSON.stringify(st));
 ok(/warn/.test(st.late)&&/該往回走了/.test(st.late),"near sunset after 2h out → turn back now");
 ok(!/warn/.test(st.early)&&/最晚往回走/.test(st.early),"plenty of time → shows latest turn time");
 // 驗證公式：日落 6h 後、已走 1h → 最晚 = now + (6h-20m+(-1h))/2 = now+2h20m
 const tt=await p.evaluate(()=>{const now=Date.now();const t=Outdoor._turnAt(now+6*3.6e6,now-3.6e6);return Math.round((t-now)/60000)});ok(tt===140,"turnaround formula = +140 min: "+tt);
 ok(/dark/.test(st.dark),"after sunset → dark state");
 await p.screenshot({path:O+"sun.png"});
 // 全螢幕＋記錄中 fs-hud 顯示
 await p.close();}
// 6 個人化時間
{const p=await mk({recs:JSON.stringify(R)});await p.evaluate(()=>openDetail("forestry-004"));await p.waitForTimeout(2000);
 const t=await p.evaluate(()=>{const e=document.querySelector(".my-est");return e&&e.innerText});ok(!!t&&/依你的腳程/.test(t),"detail shows personal estimate: "+t);
 const f=await p.evaluate(()=>myPaceFactor());ok(Math.abs(f-1.6)<0.05,"pace factor ≈1.6: "+f);
 await p.evaluate(()=>document.querySelector(".my-est").scrollIntoView({block:"center"}));await p.screenshot({path:O+"myest.png"});await p.close();}
{const p=await mk({recs:JSON.stringify(R.slice(0,2))});await p.evaluate(()=>openDetail("forestry-004"));await p.waitForTimeout(1500);ok(await p.evaluate(()=>!document.querySelector(".my-est")),"no personal estimate with <3 records");await p.close();}
// 7 英文
{const p=await mk({lang:"en",recs:JSON.stringify(R)});await p.click('.tab[data-view="record"]');await p.waitForTimeout(1200);
 const u=await p.evaluate(()=>[...document.querySelectorAll(".rec-safety,.rec-tools,.rec-opts,.rec-head")].map(e=>e.innerText).join(" "));ok(!/[一-鿿]/.test(u),"en record safety/vis translated: "+u.replace(/\n/g," "));
 await p.click("#btnSos");await p.waitForTimeout(1500);const s=await p.evaluate(()=>document.querySelector('[data-ov="sos"]').innerText);ok(!/[一-鿿]/.test(s),"en SOS translated");await p.screenshot({path:O+"sos-en.png"});await p.keyboard.press("Escape");
 await p.evaluate(()=>openDetail("forestry-004"));await p.waitForTimeout(1500);const m=await p.evaluate(()=>document.querySelector(".my-est")&&document.querySelector(".my-est").innerText);ok(m&&/At your pace/.test(m),"en personal estimate: "+m);
 await p.close();}
console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails);await b.close();srv.kill();})();
