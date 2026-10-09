// 自動化測試（瀏覽器）：npm run test:all 會依序跑；截圖輸出到 scripts/tests/out/（不進版控）
const __TTP = +process.env.TT_PORT || 8878;   // run-all 並行時會分配不重複的 port
const __path=require("path"),__fs=require("fs");
const __out=p=>{const full=__path.join(__dirname,"out",p);__fs.mkdirSync(p.endsWith("/")?full:__path.dirname(full),{recursive:true});return p.endsWith("/")?full+"/":full;};
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");const fs=require("fs");const MOCK=fs.readFileSync(__dirname+"/soc-mock.js","utf8");const O=__out("w3/");
const errs=[];let fails=0;const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m);if(!c)fails++;};
const now=new Date();const mo=k=>{const d=new Date(now.getFullYear(),now.getMonth()-k,10,8);return d.toISOString();};
// 玉山主峰軌跡：從排雲走到主峰附近（主峰 23.47,120.957）
const ys={id:"ys1",date:mo(0),trailName:"玉山步道",trailId:"osm-13678202",distanceKm:10.9,elapsedMs:9*3.6e6,ascent:1100,track:[{lat:23.4870,lon:120.9330,t:1},{lat:23.4780,lon:120.9500,t:2},{lat:23.47005,lon:120.95735,t:3}]};
const simYs=Object.assign({},ys,{id:"ys2",sim:true});
const past=[1,2,3].flatMap(k=>[1,2,3,4].map(i=>({id:`p${k}${i}`,date:new Date(now.getFullYear(),now.getMonth()-k,i*5,8).toISOString(),trailName:"x",distanceKm:10,elapsedMs:3*3.6e6,ascent:300,track:[]})));
(async()=>{const srv=spawn("python3",["-m","http.server",String(__TTP)],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch();
const mk=async(o={})=>{const ctx=await b.newContext({viewport:{width:o.w||390,height:844},geolocation:{latitude:23.47,longitude:120.957},permissions:["geolocation"]});const p=await ctx.newPage();await require(__dirname+"/fake-weather")(p);p.on("pageerror",e=>errs.push(e.message));
 if(o.routeCond)await ctx.route(/workers\.dev/,r=>o.routeCond==="fail"?r.abort():r.fulfill({status:200,contentType:"application/json",body:JSON.stringify(o.routeCond)}));
 await p.addInitScript(o=>{if(sessionStorage.getItem("x"))return;sessionStorage.setItem("x","1");localStorage.setItem("tt_lang",o.lang||"zh");["tt_onboarded_v2","tt_coach_trail","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_locperm_prompted","tt_coach_team","tt_coach_soc_friends","tt_coach_soc_explore","tt_coach_soc_search","tt_coach_soc_notif","tt_coach_soc_me"].forEach(k=>localStorage.setItem(k,"1"));for(const k in (o.ls||{}))localStorage.setItem(k,o.ls[k]);},o);
 await p.addInitScript(()=>{document.addEventListener("DOMContentLoaded",()=>new MutationObserver(()=>document.querySelectorAll(".tour").forEach(e=>e.remove())).observe(document.body,{childList:true,subtree:true}));});if(o.native)await p.addInitScript(mode=>{window.__calls=[];const plug={available:async()=>{if(mode==="none")throw new Error("not implemented");return {live:true,widget:true};},start:async a=>{__calls.push(["start",a]);return {ok:true};},update:async a=>{__calls.push(["update",a]);return {ok:true};},end:async a=>{__calls.push(["end",a]);return {ok:true};},setWidget:async a=>{__calls.push(["setWidget",a]);return {ok:true};}};window.Capacitor={isNativePlatform:()=>true,getPlatform:()=>"ios",Plugins:{},registerPlugin:n=>n==="TrailLive"?plug:{}};},o.native);await p.addInitScript(MOCK);await p.goto("http://localhost:"+__TTP+"/");await require(__dirname+"/ready")(p);
 if(o.login)await p.evaluate(m=>window.__installFakeSupa(m),o.mock||{});
 await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));return p;};
const recs=[{id:"a",date:new Date(Date.now()-864e5).toISOString(),trailName:"x",distanceKm:5.5,elapsedMs:7200e3,ascent:200},{id:"b",date:new Date().toISOString(),trailName:"y",distanceKm:3.2,elapsedMs:3600e3,ascent:100}];
{const p=await mk({native:"ok",ls:{tt_records:JSON.stringify(recs),tt_pet_name:"小苔"}});
 await p.waitForTimeout(3500);
 const w=await p.evaluate(()=>__calls.filter(c=>c[0]==="setWidget"));
 ok(w.length>=1,"widget data pushed on launch");
 const d=w.length?JSON.parse(w[0][1].data):{};
 ok(d.streak>=1&&d.petName==="小苔"&&d.weekKm>0&&d.labels&&d.labels.streak==="連續"&&typeof d.goalKm==="number","widget payload: "+JSON.stringify(d).slice(0,160));
 ok(w[0][1].pet&&w[0][1].pet.length>2000&&/^iVBOR/.test(w[0][1].pet),"pet PNG base64 included");
 // 開始記錄 → Live Activity
 await p.click('.tab[data-view="record"]');await p.waitForTimeout(500);await p.click("#btnStart");await p.waitForTimeout(6500);
 const st=await p.evaluate(()=>__calls.find(c=>c[0]==="start"));
 ok(st&&st[1].labels&&st[1].labels.km==="公里"&&st[1].trail==="自由路線"&&typeof st[1].startedAt==="number"&&st[1].paused===false,"live activity started: "+JSON.stringify(st&&st[1]).slice(0,150));
 // 暫停 → 立刻更新 paused
 await p.click("#btnPause");await p.waitForTimeout(5800);
 const up=await p.evaluate(()=>__calls.filter(c=>c[0]==="update").pop());
 ok(up&&up[1].paused===true,"pause → update paused=true");
 // 沒變化不會一直送
 const n1=await p.evaluate(()=>__calls.filter(c=>c[0]==="update").length);await p.waitForTimeout(11000);const n2=await p.evaluate(()=>__calls.filter(c=>c[0]==="update").length);
 ok(n2===n1,"no redundant updates while nothing changes ("+n1+"→"+n2+")");
 // 結束 → end + 小工具刷新
 await p.evaluate(()=>{window.ttConfirm=async()=>true;});await p.click("#btnStop");await p.waitForTimeout(6500);
 ok(await p.evaluate(()=>__calls.some(c=>c[0]==="end")),"finish → live activity ended");
 const w2=await p.evaluate(()=>__calls.filter(c=>c[0]==="setWidget").length);ok(w2>=2,"widget refreshed after finish");
 // 小工具點進來
 await p.evaluate(()=>routeDeepLink("?view=pet"));await p.waitForTimeout(500);ok(await p.evaluate(()=>document.body.dataset.view==="pet"),"?view=pet opens pet tab");
 await p.close();}
// 模擬不上鎖定畫面
{const p=await mk({native:"ok"});await p.waitForTimeout(1000);await p.click('.tab[data-view="record"]');await p.waitForTimeout(400);
 await p.evaluate(()=>{const t=document.getElementById("simToggle");t.checked=true;t.dispatchEvent(new Event("change"));});await p.click("#btnStart");await p.waitForTimeout(6000);
 ok(await p.evaluate(()=>!__calls.some(c=>c[0]==="start")),"simulation → no live activity");await p.close();}
// 原生沒有這個外掛（還沒開 ENABLE_WIDGETS 的 App）
{const p=await mk({native:"none"});await p.waitForTimeout(3500);await p.click('.tab[data-view="record"]');await p.waitForTimeout(400);await p.click("#btnStart");await p.waitForTimeout(6000);
 ok(await p.evaluate(()=>__calls.length===0),"plugin missing → nothing called, no errors");await p.close();}
// 網頁版
{const p=await mk({});await p.waitForTimeout(1500);ok(await p.evaluate(()=>typeof NativeLive!=="undefined"),"web: module loads, inert");await p.close();}
console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails);await b.close();srv.kill();})();
