// 自動化測試（瀏覽器）：npm run test:all 會依序跑；截圖輸出到 scripts/tests/out/（不進版控）
const __path=require("path"),__fs=require("fs");
const __out=p=>{const full=__path.join(__dirname,"out",p);__fs.mkdirSync(p.endsWith("/")?full:__path.dirname(full),{recursive:true});return p.endsWith("/")?full+"/":full;};
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");const fs=require("fs");const MOCK=fs.readFileSync(__dirname+"/soc-mock.js","utf8");const O=__out("w2/");
const errs=[];let fails=0;const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m);if(!c)fails++;};
const now=new Date();const mo=k=>{const d=new Date(now.getFullYear(),now.getMonth()-k,10,8);return d.toISOString();};
// 玉山主峰軌跡：從排雲走到主峰附近（主峰 23.47,120.957）
const ys={id:"ys1",date:mo(0),trailName:"玉山步道",trailId:"osm-13678202",distanceKm:10.9,elapsedMs:9*3.6e6,ascent:1100,track:[{lat:23.4870,lon:120.9330,t:1},{lat:23.4780,lon:120.9500,t:2},{lat:23.47005,lon:120.95735,t:3}]};
const simYs=Object.assign({},ys,{id:"ys2",sim:true});
const past=[1,2,3].flatMap(k=>[1,2,3,4].map(i=>({id:`p${k}${i}`,date:new Date(now.getFullYear(),now.getMonth()-k,i*5,8).toISOString(),trailName:"x",distanceKm:10,elapsedMs:3*3.6e6,ascent:300,track:[]})));
(async()=>{const srv=spawn("python3",["-m","http.server","8874"],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch();
const mk=async(o={})=>{const ctx=await b.newContext({viewport:{width:o.w||390,height:844},geolocation:{latitude:23.47,longitude:120.957},permissions:["geolocation"]});const p=await ctx.newPage();p.on("pageerror",e=>errs.push(e.message));
 if(o.routeCond)await ctx.route(/workers\.dev/,r=>o.routeCond==="fail"?r.abort():r.fulfill({status:200,contentType:"application/json",body:JSON.stringify(o.routeCond)}));
 await p.addInitScript(o=>{if(sessionStorage.getItem("x"))return;sessionStorage.setItem("x","1");localStorage.setItem("tt_lang",o.lang||"zh");["tt_onboarded_v2","tt_coach_trail","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_locperm_prompted","tt_coach_team"].forEach(k=>localStorage.setItem(k,"1"));for(const k in (o.ls||{}))localStorage.setItem(k,o.ls[k]);},o);
 await p.addInitScript(MOCK);await p.goto("http://localhost:8874/");await p.waitForTimeout(2500);
 if(o.login)await p.evaluate(m=>window.__installFakeSupa(m),o.mock||{});
 await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));return p;};
// ── 收集冊 ──
{const p=await mk({ls:{tt_records:JSON.stringify([ys,simYs]),tt_set_open:"[]"}});
 const h=await p.evaluate(r=>Peaks.hitsOf(r).map(x=>x.list+x.no),ys);ok(h.includes("b1"),"Yushan track hits b1: "+h.join(","));
 ok(await p.evaluate(r=>Peaks.hitsOf(r).length===0,simYs),"simulated record never stamps");
 ok(await p.evaluate(()=>Peaks.hitsOf({track:[{lat:23.4870,lon:120.9330},{lat:23.4780,lon:120.9500}]}).length===0),"not reaching summit → no stamp");
 await p.click('.tab[data-view="me"]');await p.waitForTimeout(800);await p.click("#btnPeaks");await p.waitForTimeout(1500);
 ok(await p.evaluate(()=>!!document.querySelector('.pk-stamp.got[data-no="1"]')),"backfill stamped Yushan in book");
 ok(await p.evaluate(()=>document.querySelectorAll(".pk-stamp").length===100),"100 stamps in 百岳 tab");
 ok(await p.evaluate(()=>/1\/100/.test(document.querySelector(".pk-tab.on").textContent)),"tab shows 1/100");
 await p.screenshot({path:O+"pk-book.png"});
 await p.click('.pk-stamp[data-no="1"]');await p.waitForTimeout(400);
 const det=await p.evaluate(()=>document.querySelector(".pk-detail").innerText);ok(/玉山/.test(det)&&/登頂於/.test(det)&&/附近的步道/.test(det)&&/玉山東峰步道/.test(det),"detail: date + nearby trails");
 await p.screenshot({path:O+"pk-detail.png"});
 await p.evaluate(()=>document.querySelector('.pk-tab[data-l="x"]').click());await p.waitForTimeout(300);ok(await p.evaluate(()=>document.querySelectorAll(".pk-stamp").length===100&&!document.querySelector(".pk-stamp.got")),"小百岳 tab: 100, none stamped");ok(await p.evaluate(()=>!document.querySelector(".pk-detail.show")),"detail closes on tab switch");
 await p.screenshot({path:O+"pk-xiao.png"});
 await p.keyboard.press("Escape");await p.waitForTimeout(200);ok(await p.evaluate(()=>!document.querySelector('[data-ov="peaks"]')),"book closes on Esc");
 // stampRecord 只蓋一次
 ok(await p.evaluate(r=>Peaks.stampRecord(r,true).length===0,ys),"same peak not stamped twice");
 await p.close();}
// ── 每月挑戰 ──
{const p=await mk({ls:{tt_records:JSON.stringify(past.concat([Object.assign({},ys,{id:"c1",distanceKm:46}),Object.assign({},ys,{id:"c2",distanceKm:1,date:mo(0)}),Object.assign({},ys,{id:"c3",distanceKm:1,date:mo(0)}),Object.assign({},ys,{id:"c4",distanceKm:1,date:mo(0)}),Object.assign({},ys,{id:"c5",distanceKm:1,date:mo(0)})]))}});
 const g=await p.evaluate(()=>Challenge.goal());ok(g.km===45&&g.trips===5,"goal from 3-month avg (40km,4 trips ×1.15): "+JSON.stringify(g));
 await p.click('.tab[data-view="pet"]');await p.waitForTimeout(1200);
 ok(await p.evaluate(()=>!!document.getElementById("mchClaim")),"challenge done → claim button");
 await p.evaluate(()=>document.getElementById("petMonth").scrollIntoView({block:"center"}));await p.screenshot({path:O+"mch-done.png"});
 const before=await p.evaluate(()=>berriesBalance());await p.click("#mchClaim");await p.waitForTimeout(500);
 ok(await p.evaluate(()=>berriesBalance())===before+25,"claim +25 berries");
 ok(await p.evaluate(()=>hatsOwned().has("bandana")),"bandana unlocked");
 ok(await p.evaluate(()=>/完成了/.test(document.getElementById("petMonth").innerText)),"claimed state shown");
 await p.evaluate(()=>{const b=document.getElementById("petDress");b&&b.click()});await p.waitForTimeout(500);await p.screenshot({path:O+"hat-bandana.png"});
 await p.evaluate(()=>document.querySelector('.hat-opt[data-hat="bandana"]').click());await p.waitForTimeout(300);ok(await p.evaluate(()=>petHat()==="bandana"),"wear bandana");
 await p.close();}
{const p=await mk({ls:{tt_records:"[]"}});const g=await p.evaluate(()=>Challenge.goal());ok(g.km===15&&g.trips===3,"new user goal 15km/3: "+JSON.stringify(g));
 await p.click('.tab[data-view="pet"]');await p.waitForTimeout(1000);await p.evaluate(()=>document.getElementById("petMonth").scrollIntoView({block:"center"}));await p.screenshot({path:O+"mch-new.png"});
 await p.evaluate(()=>{document.getElementById("petDress").click()});await p.waitForTimeout(400);await p.evaluate(()=>document.querySelector('.hat-opt[data-hat="bandana"]').click());await p.waitForTimeout(300);
 ok(await p.evaluate(()=>!hatsOwned().has("bandana")&&/每月挑戰/.test(document.getElementById("toast").textContent)),"bandana can't be bought");
 await p.close();}
// ── 山頂天氣 ──
{const p=await mk();await p.evaluate(()=>openDetail("forestry-027"));await p.waitForTimeout(500);
 await p.evaluate(()=>{const t=document.querySelector('[data-tab="rt"],.dtab[data-t="rt"]');if(t)t.click();});
 await p.waitForFunction(()=>document.querySelector("#summitWx .smt")||document.querySelector("#weatherBox .food-empty"),null,{timeout:20000}).catch(()=>{});
 const sm=await p.evaluate(()=>{const s=document.querySelector("#summitWx .smt");return s?[s.querySelectorAll(".smt-row").length,s.innerText.slice(0,80)]:null});
 ok(sm&&sm[0]>=3,"summit weather rows for 大霸尖山: "+JSON.stringify(sm));
 const cmp=await p.evaluate(async()=>{const t=TRAILS.find(x=>x.id==="forestry-027");const a=await Weather.get(t.lat,t.lon),b2=await Weather.summit(t.lat,t.lon,t.alt_high);return [a.elevation,b2.elevation,a.hourly?1:0]});
 ok(cmp[1]===3380,"summit forecast uses peak elevation: "+JSON.stringify(cmp));
 await p.evaluate(()=>document.getElementById("summitWx").scrollIntoView({block:"center"}));await p.screenshot({path:O+"summit.png"});
 // 低海拔不顯示
 await p.evaluate(()=>{closeDetail&&closeDetail();});await p.evaluate(()=>openDetail("forestry-005"));await p.waitForTimeout(4000);
 ok(await p.evaluate(()=>{const t=TRAILS.find(x=>x.id==="forestry-005");return !(t.alt_high>=1000||(t.alt_low!=null&&t.alt_high-t.alt_low>=300))?!document.querySelector("#summitWx .smt"):true}),"low trail: no summit block");
 await p.close();}
// ── 路況快取＋收藏變動 ──
{const cache={at:Date.now()-3600e3,data:[{TRAILID:"005",TR_TYP:"暫停開放",TITLE:"測試封閉",CONTENT:"",TR_SUB:"全線",opendate:"20261231",DEP_NAME:"新竹分署",ANN_DATE:"20261001"}]};
 const p=await mk({routeCond:"fail",ls:{tt_cond_cache:JSON.stringify(cache),tt_favs:JSON.stringify(["forestry-005"])}});
 ok(await p.evaluate(()=>{const t=TRAILS.find(x=>x.id==="forestry-005");return t.condition&&t.condition.status==="暫停開放"}),"offline: cached closure applied");
 await p.evaluate(()=>openDetail("forestry-005"));await p.waitForTimeout(1200);
 const ban=await p.evaluate(()=>document.querySelector(".cond-banner")&&document.querySelector(".cond-banner").innerText);ok(/離線/.test(ban||"")&&/小時前|分鐘前/.test(ban||""),"banner says offline + relative time: "+(ban||"").split("\n").slice(-1));
 await p.screenshot({path:O+"cond-offline.png"});await p.close();}
{const p=await mk({routeCond:[{TRAILID:"005",TR_TYP:"暫停開放",TITLE:"颱風坍方",CONTENT:"",TR_SUB:"全線",opendate:"20261231",DEP_NAME:"x",ANN_DATE:"20261001"}],ls:{tt_cond_seen:JSON.stringify({"forestry-005":""}),tt_favs:JSON.stringify(["forestry-005"])}});
 await p.evaluate(()=>{window.__toasts=[];const o=window.toast;window.toast=(m,x)=>{window.__toasts.push(m);return o(m,x)};});await p.evaluate(()=>{localStorage.setItem("tt_cond_seen",JSON.stringify({"forestry-005":""}));refreshConditions();});await p.waitForTimeout(2500);const tt=await p.evaluate(()=>window.__toasts.join(" | "));ok(/拳頭姆/.test(tt)&&/暫停開放/.test(tt),"fav change toast: "+tt);
 ok(await p.evaluate(()=>JSON.parse(localStorage.getItem("tt_cond_seen"))["forestry-005"]==="暫停開放"),"seen state updated");
 ok(await p.evaluate(()=>JSON.parse(localStorage.getItem("tt_cond_cache")).data.length===1),"fresh data cached");
 await p.close();}
// ── 山友回報 ──
{const p=await mk({login:1,mock:{}});
 await p.evaluate(()=>{window.__fakeT.trail_reports=[{id:"r1",trail_id:"forestry-004",kind:"tree",note:"1.2K 有倒木，從右邊繞",photo_url:null,lat:null,lon:null,created_at:new Date(Date.now()-3*3600e3).toISOString(),author_name:"阿梅",is_mine:false},{id:"r2",trail_id:"forestry-004",kind:"ok",note:null,photo_url:null,lat:null,lon:null,created_at:new Date(Date.now()-86400e3).toISOString(),author_name:"許",is_mine:false}];});
 await p.evaluate(()=>openDetail("forestry-004"));await p.waitForTimeout(2000);
 const rb=await p.evaluate(()=>document.getElementById("trailReportBox").innerText);ok(/山友回報/.test(rb)&&/倒木/.test(rb)&&/1\.2K/.test(rb),"reports listed");ok(await p.evaluate(()=>/1/.test(document.querySelector(".trp-sum b").textContent)),"alert count = 1 (ok excluded)");
 await p.evaluate(()=>document.getElementById("trailReportBox").scrollIntoView({block:"center"}));await p.screenshot({path:O+"reports.png"});
 await p.click("#trpAdd");await p.waitForTimeout(700);
 ok(await p.evaluate(()=>document.getElementById("trpSend").disabled),"send disabled until kind picked");
 await p.click('.trp-k[data-k="slide"]');await p.fill("#trpNote","0.5K 小坍方，可通行");await p.screenshot({path:O+"report-form.png"});
 await p.click("#trpSend");await p.waitForTimeout(1500);
 const ins=await p.evaluate(()=>window.__lastInsert);ok(ins&&ins.kind==="slide"&&ins.trail_id==="forestry-004"&&ins.author_id==="me","insert row: "+JSON.stringify(ins&&{k:ins.kind,t:ins.trail_id,lat:ins.lat}));
 ok(await p.evaluate(()=>!document.querySelector('[data-ov="trp"]')&&/坍方/.test(document.getElementById("trailReportBox").innerText)),"form closes and list refreshes");
 await p.close();}
{const p=await mk({login:1,mock:{noReports:true}});await p.evaluate(()=>openDetail("forestry-004"));await p.waitForTimeout(2000);ok(await p.evaluate(()=>document.getElementById("trailReportBox").innerHTML===""),"no phase30 → section hidden");await p.close();}
{const p=await mk({login:1,mock:{loggedOut:true}});await p.evaluate(()=>openDetail("forestry-004"));await p.waitForTimeout(2000);await p.click("#trpAdd");await p.waitForTimeout(600);ok(/先登入/.test(await p.evaluate(()=>document.getElementById("toast").textContent)),"logged out → sign-in prompt");await p.close();}
// ── 英文 ──
{const p=await mk({lang:"en",ls:{tt_records:JSON.stringify([ys])}});await p.click('.tab[data-view="me"]');await p.waitForTimeout(800);await p.click("#btnPeaks");await p.waitForTimeout(1500);
 const t=await p.evaluate(()=>document.querySelector('[data-ov="peaks"]').innerText);ok(!/[一-鿿]/.test(t),"en book fully translated");ok(/Yushan/.test(t),"en peak names romanized");ok(await p.evaluate(()=>{const e=document.querySelector(".pk-nm.long");return e&&parseFloat(getComputedStyle(e).fontSize)<parseFloat(getComputedStyle(document.querySelector(".pk-nm:not(.long)")).fontSize);}),"long romanized names shrink");await p.screenshot({path:O+"pk-en.png"});await p.keyboard.press("Escape");
 await p.click('.tab[data-view="pet"]');await p.waitForTimeout(1000);const m=await p.evaluate(()=>document.getElementById("petMonth").innerText);ok(!/[一-鿿]/.test(m),"en challenge translated: "+m.split("\n")[0]);
 await p.evaluate(()=>openDetail("forestry-027"));await p.waitForTimeout(500);await p.waitForFunction(()=>document.querySelector("#summitWx .smt"),null,{timeout:20000}).catch(()=>{});
 const s=await p.evaluate(()=>{const e=document.querySelector("#summitWx");return e?e.innerText:""});ok(s&&!/[一-鿿]/.test(s),"en summit weather translated");await p.close();}
console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails);await b.close();srv.kill();})();
