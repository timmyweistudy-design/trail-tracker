// 記錄頁／結算頁改版（2026-10）：移動時間有存、舊紀錄從軌跡反推、校正後卡路里重算、剩餘里程與預計完成、結算頁收穫／來源／比較／海拔剖面、各寬度不爆版
const __TTP = +process.env.TT_PORT || 8904;   // run-all 並行時會分配不重複的 port
const __path=require("path"),__fs=require("fs");
const __out=p=>{const full=__path.join(__dirname,"out",p);__fs.mkdirSync(p.endsWith("/")?full:__path.dirname(full),{recursive:true});return p.endsWith("/")?full+"/":full;};
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");
const O=__out("rv/");const errs=[];let fails=0;const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m);if(!c)fails++;};
(async()=>{const srv=spawn("python3",["-m","http.server",String(__TTP)],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch();
const mk=async(o={})=>{const ctx=await b.newContext({viewport:{width:o.w||390,height:844},geolocation:{latitude:24.95,longitude:121.7,accuracy:8},permissions:["geolocation"],timezoneId:"Asia/Taipei"});const p=await ctx.newPage();await require(__dirname+"/fake-weather")(p);p.on("pageerror",e=>errs.push(e.message));
 await p.addInitScript(o=>{if(sessionStorage.getItem("seed"))return;sessionStorage.setItem("seed","1");localStorage.setItem("tt_lang",o.lang||"zh");if(o.fs)localStorage.setItem("tt_fontscale",o.fs);["tt_onboarded_v2","tt_coach_trail","tt_locperm_prompted","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_coach_team"].forEach(k=>localStorage.setItem(k,"1"));},o);
 await p.goto("http://localhost:"+__TTP+"/");await p.waitForTimeout(2300);await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));return p;};
// 真的（非模擬）一趟：沿金瓜寮路線、時間戳每點 30 秒、中間休息 20 分鐘
const realRec=p=>p.evaluate(async()=>{const t=TRAILS.find(x=>x.id==="forestry-004");await ensureGeo(t.region);const pts=[].concat(...geoOf(t));const t0=Date.now()-3*3.6e6;let tt=t0;
  const track=pts.map((q,i)=>{tt+=(i===Math.floor(pts.length/2)?20*60000:180000);return {lat:q[0],lon:q[1],alt:300,t:tt,acc:6};});
  return {id:"rv1",date:new Date(tt).toISOString(),trailName:t.name,trailId:t.id,distanceKm:1.38,elapsedMs:tt-t0,ascent:84,descent:86,altHigh:344,altLow:284,altCorrected:true,kcal:300,steps:1950,track};});
{const p=await mk();
 // 1 移動時間：舊紀錄從軌跡反推、休息不算；反推出比快走還快的不採用
 ok(await p.evaluate(()=>movingOf({distanceKm:5,elapsedMs:3.6e6,track:[{lat:24,lon:121,t:0},{lat:24.0005,lon:121,t:60000},{lat:24.001,lon:121,t:120000}]})===null),"implausible derived moving time rejected");
 const r=await realRec(p);
 const mv=await p.evaluate(r=>movingOf(r),r);
 ok(mv>0&&mv<r.elapsedMs-15*60000,"movingOf derives moving time from track, excluding the 20-min rest ("+Math.round(mv/60000)+" min of "+Math.round(r.elapsedMs/60000)+")");
 // 2 結算頁（剛走完、第一次走這條）
 await p.evaluate(r=>{localStorage.removeItem("tt_records");openTrackReview(r,true);},r);await p.waitForTimeout(1500);
 const t=await p.evaluate(()=>document.getElementById("trackBody").innerText.replace(/\s+/g," "));
 ok(/這趟的收穫/.test(t)&&/第一次走這條/.test(t)&&/夥伴再 [\d.]+ km 就進化/.test(t),"gains: first time + buddy progress");
 ok(/移動時間/.test(t)&&/總時間 .+，休息 .+/.test(t)&&/最高海拔 344/.test(t)&&/地形校正/.test(t),"stats: moving time with total/rest, highest point, terrain-corrected");
 ok(/預估 .+，你移動了 .+/.test(t)||/官方長度/.test(t),"compares with trail estimate or official length");
 ok(await p.evaluate(()=>document.querySelectorAll(".trk-stats .dv-src").length===4),"every main stat has a source chip");
 await p.waitForTimeout(800);if(process.env.RV_DBG)console.log(await p.evaluate(async()=>{const t0=performance.now();while(performance.now()-t0<15000&&!document.querySelector("#trkProfile svg path"))await new Promise(r=>setTimeout(r,100));return "profile after "+Math.round(performance.now()-t0)+"ms tiles:"+performance.getEntriesByType("resource").filter(e=>/terrarium/.test(e.name)).map(e=>Math.round(e.duration)).join(",");}));ok(await p.evaluate(()=>!!document.querySelector("#trkProfile svg path")),"hike elevation profile drawn");
 ok(!/速度 km\/h 這次/.test(t),"speed comparison hidden with no history to compare");
 await p.click('[data-rsrc="kcal"]');await p.waitForTimeout(300);
 ok(/兩到三成/.test(await p.evaluate(()=>document.querySelector(".ttdlg")?.innerText||"")),"kcal chip explains accuracy");
 await p.evaluate(()=>document.querySelector(".ttdlg .btn")?.click());await p.waitForTimeout(300);
 ok(await p.evaluate(()=>!!document.getElementById("trackCard")&&!!document.getElementById("trackReplay")&&!!document.getElementById("trackGpx")),"actions present");
 await p.screenshot({path:O+"summary-real.png",fullPage:false});
 // 3 去設定體重
 await p.click("#trkSetWeight");await p.waitForTimeout(1200);
 ok(await p.evaluate(()=>document.body.dataset.view==="me"&&document.getElementById("pfWeight").closest(".set-group").classList.contains("open")),"set-weight link opens profile settings");
 // 4 舊紀錄：第 2 次走、比較上次
 await p.evaluate(r=>{Store.addRecord(Object.assign({},r,{id:"rv0",date:new Date(Date.now()-10*864e5).toISOString()}));Store.addRecord(r);},r);
 await p.evaluate(()=>openTrackReview(Store.getRecords().find(x=>x.id==="rv1"),false));await p.waitForTimeout(1200);
 const t2=await p.evaluate(()=>document.getElementById("trackBody").innerText.replace(/\s+/g," "));
 ok(/第 2 次走這條/.test(t2)&&!/這趟的收穫/.test(t2)&&/改名稱/.test(t2),"old record: Nth time, no gains, manage buttons");
 await p.evaluate(()=>closeTrackReview());
 await p.close();}
// 5 真的跑一趟（模擬）：結束後有存 movingMs、卡路里跟校正後的爬升一致、記錄中有剩餘里程
{const p=await mk();await p.click('.tab[data-view="record"]');await p.waitForTimeout(1200);
 await p.evaluate(()=>{const t=TRAILS.find(x=>x.id==="forestry-004");return ensureGeo(t.region).then(()=>selectTrailForRecord(t))});await p.waitForTimeout(2000);
 await p.evaluate(()=>{document.getElementById("simToggle").checked=true;});await p.click("#btnStart");await p.waitForTimeout(4000);
 const prog=await p.evaluate(()=>{const e=document.getElementById("recProg");return !e.hidden&&e.innerText});
 ok(prog&&/剩 [\d.]+ km・預計 \d\d:\d\d 走完|快到終點/.test(prog),"recording: remaining km + ETA: "+prog);
 ok(await p.evaluate(()=>{const r=document.getElementById("btnPause").getBoundingClientRect();return r.bottom<=innerHeight&&r.top>0}),"pause button visible without scrolling");
 await p.screenshot({path:O+"recording.png"});
 await p.evaluate(()=>{window.ttConfirm=async()=>true;});await p.click("#btnStop");await p.waitForTimeout(6500);
 const rec=await p.evaluate(()=>Store.getRecords()[0]);
 ok(rec&&rec.movingMs>0,"saved record has movingMs: "+(rec&&rec.movingMs));
 ok(rec&&(!rec.altCorrected||rec.kcal===await p.evaluate(r=>Recorder.kcalFor(r.distanceKm,r.movingMs,r.ascent,r.descent),rec)),"kcal recomputed with corrected climb");
 await p.close();}
// 6 英文、小螢幕大字、深色不爆版
for(const [lang,w,fs] of [["en",360,"1.65"],["ja",390,""]]){const p=await mk({lang,w,fs});const r=await realRec(p);
 await p.evaluate(r=>openTrackReview(r,true),r);await p.waitForTimeout(1500);
 const bad=await p.evaluate(()=>{const W=document.documentElement.clientWidth;return [...document.querySelectorAll("#trackSheet *")].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.right>W+1&&!e.closest(".leaflet-container,.hike-shots")}).slice(0,3).map(e=>e.className)});
 ok(!bad.length,`${lang} ${w}/${fs||1} summary fits: ${bad.join(",")}`);
 const tx=await p.evaluate(()=>{const o=document.getElementById("trackBody").cloneNode(true);o.querySelector("h2").remove();return o.innerText});
 const left=(tx.match(/這趟的收穫|移動時間|最高海拔|總時間|預估|官方長度|第一次走這條/g)||[]).filter(w=>!(lang==="ja"&&w==="移動時間"));ok(!left.length,`${lang} summary translated ${left.join(",")}`);
 await p.screenshot({path:O+`summary-${lang}.png`});await p.close();}
console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails);await b.close();srv.kill();})();
