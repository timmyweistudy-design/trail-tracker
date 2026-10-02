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
(async()=>{const srv=spawn("python3",["-m","http.server","8875"],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch();
const mk=async(o={})=>{const ctx=await b.newContext({viewport:{width:o.w||390,height:844},geolocation:{latitude:23.47,longitude:120.957},permissions:["geolocation"]});const p=await ctx.newPage();await require(__dirname+"/fake-weather")(p);p.on("pageerror",e=>errs.push(e.message));
 if(o.routeCond)await ctx.route(/workers\.dev/,r=>o.routeCond==="fail"?r.abort():r.fulfill({status:200,contentType:"application/json",body:JSON.stringify(o.routeCond)}));
 await p.addInitScript(o=>{if(sessionStorage.getItem("x"))return;sessionStorage.setItem("x","1");localStorage.setItem("tt_lang",o.lang||"zh");["tt_onboarded_v2","tt_coach_trail","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_locperm_prompted","tt_coach_team","tt_coach_soc_friends","tt_coach_soc_explore","tt_coach_soc_search","tt_coach_soc_notif","tt_coach_soc_me"].forEach(k=>localStorage.setItem(k,"1"));for(const k in (o.ls||{}))localStorage.setItem(k,o.ls[k]);},o);
 await p.addInitScript(()=>{document.addEventListener("DOMContentLoaded",()=>new MutationObserver(()=>document.querySelectorAll(".tour").forEach(e=>e.remove())).observe(document.body,{childList:true,subtree:true}));});await p.addInitScript(MOCK);await p.goto("http://localhost:8875/");await p.waitForTimeout(2500);
 if(o.login)await p.evaluate(m=>window.__installFakeSupa(m),o.mock||{});
 await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));return p;};
const fake=(o)=>Object.assign({login:1},o);
const plan={id:"tp9",owner_id:"u1",owner_name:"阿梅",owner_avatar:null,trail_id:"forestry-004",trail_name:"金瓜寮魚蕨步道",expected_at:new Date(Date.now()-50*60000).toISOString(),status:"overdue",last_lat:24.93512,last_lon:121.69876,last_at:new Date(Date.now()-40*60000).toISOString(),alerted_at:new Date().toISOString()};
// ── 1. 設定留守（還沒開始）──
{const p=await mk(fake({}));
 await p.click('.tab[data-view="record"]');await p.waitForTimeout(600);
 ok(await p.evaluate(()=>!!document.querySelector("#btnGuard")&&!document.querySelector("#btnShareLoc")),"record tools: 留守人 tile replaces 分享位置");
 await p.click("#btnGuard");await p.waitForTimeout(900);
 const t=await p.evaluate(()=>document.querySelector('[data-ov="guard"]').innerText);
 ok(/阿梅/.test(t)&&/許/.test(t)&&!/一個名字非常/.test(t),"sheet lists mutual friends only");
 ok(await p.evaluate(()=>document.querySelectorAll("#gdChips .chip").length===3),"no trail → 3 time chips (+3/+5/+8)");
 await p.screenshot({path:O+"guard-sheet.png"});
 await p.click('.gd-f:has(input[value="u1"])');await p.click("#gdChips .chip:nth-child(2)");
 ok(/設定好了/.test(await p.evaluate(()=>document.getElementById("gdGo").innerText)),"idle → button says 開始記錄時生效");
 await p.click("#gdGo");await p.waitForTimeout(400);
 const st=await p.evaluate(()=>Guardian.state());
 ok(st&&st.gs.length===1&&st.gs[0].id==="u1"&&!st.on&&st.at>Date.now()+4.9*3.6e6,"state saved, not active yet");
 ok(await p.evaluate(()=>window.__tpInserts||0)===0,"no plan sent before recording");
 const hud=await p.evaluate(()=>{const h=document.getElementById("guardHud");return h.hidden?"":h.innerText});
 ok(/按開始後生效/.test(hud),"HUD: takes effect on start");
 ok(await p.evaluate(()=>document.getElementById("btnGuard").classList.contains("on")),"tile shows on-dot");
 await p.screenshot({path:O+"guard-set.png"});
 // 開始記錄 → 送出行程
 await p.click("#btnStart");await p.waitForTimeout(2500);
 const lp=await p.evaluate(()=>window.__lastPlan);
 ok(lp&&lp.guardians.join()==="u1"&&lp.owner_id==="me"&&lp.expected_at,"start → plan inserted with guardian "+JSON.stringify(lp&&lp.guardians));
 const st2=await p.evaluate(()=>Guardian.state());ok(st2.on&&st2.planId===lp.id,"state active with planId");
 ok(/阿梅/.test(await p.evaluate(()=>document.getElementById("guardHud").innerText)),"HUD shows guardian name");
 await p.screenshot({path:O+"guard-active.png"});
 // 延後 1 小時
 const at0=st2.at;await p.click("#ghExt");await p.waitForTimeout(400);
 const st3=await p.evaluate(()=>Guardian.state());const u=await p.evaluate(()=>(window.__updates||[]).filter(x=>x.table==="trip_plans"&&x.fields.expected_at).pop());
 ok(st3.at>=at0+59*60000&&u&&new Date(u.fields.expected_at).getTime()===st3.at,"extend +1h → cloud updated");
 // 時間到 / 超過 30 分
 await p.evaluate(()=>{const s=Guardian.state();s.at=Date.now()-5*60000;localStorage.setItem("tt_guard",JSON.stringify(s));Guardian.paintHud();});
 let h=await p.evaluate(()=>[document.getElementById("guardHud").className,document.getElementById("guardHud").innerText]);
 ok(/due/.test(h[0])&&/25 分鐘後通知留守人/.test(h[1]),"past due → orange with countdown: "+h[1].split("\n").pop());
 await p.screenshot({path:O+"guard-due.png"});
 await p.evaluate(()=>{const s=Guardian.state();s.at=Date.now()-40*60000;localStorage.setItem("tt_guard",JSON.stringify(s));Guardian.paintHud();});
 h=await p.evaluate(()=>[document.getElementById("guardHud").className,document.getElementById("guardHud").innerText]);
 ok(/alert/.test(h[0])&&/已經通知留守人/.test(h[1]),"past grace → red, guardians notified text");
 await p.screenshot({path:O+"guard-alert.png"});
 // 結束 → done
 await p.evaluate(()=>{window.ttConfirm=async()=>true;});await p.click("#btnStop");await p.waitForTimeout(1500);
 const d=await p.evaluate(()=>(window.__updates||[]).filter(x=>x.table==="trip_plans"&&x.fields.status).pop());
 ok(d&&d.fields.status==="done","finish → plan done");
 ok(await p.evaluate(()=>!Guardian.state()&&document.getElementById("guardHud").hidden),"state cleared + HUD hidden");
 await p.close();}
// ── 2. 沒網路時開始 → 補送 ──
{const p=await mk(fake({}));await p.click('.tab[data-view="record"]');await p.waitForTimeout(500);
 await p.evaluate(()=>{window.__tpFail=true;localStorage.setItem("tt_guard",JSON.stringify({at:Date.now()+3*3.6e6,gs:[{id:"u1",name:"阿梅"}]}));});
 await p.click("#btnStart");await p.waitForTimeout(2000);
 let st=await p.evaluate(()=>Guardian.state());ok(st.on&&st.pend&&!st.planId,"offline start → pending");
 ok(/還沒送出/.test(await p.evaluate(()=>document.getElementById("guardHud").innerText)),"HUD says will retry");
 await p.evaluate(()=>{window.__tpFail=false;});await p.evaluate(()=>Guardian.tick());await p.waitForTimeout(800);
 st=await p.evaluate(()=>Guardian.state());ok(st.planId&&!st.pend,"retry → plan created");
 await p.close();}
// ── 3. 資料庫沒開 phase31 ──
{const p=await mk(fake({mock:{noGuard:true}}));await p.click('.tab[data-view="record"]');await p.waitForTimeout(500);
 await p.evaluate(()=>localStorage.setItem("tt_guard",JSON.stringify({at:Date.now()+3*3.6e6,gs:[{id:"u1",name:"阿梅"}]})));
 await p.click("#btnStart");await p.waitForTimeout(2000);
 ok(/雲端留守還沒開通/.test(await p.evaluate(()=>document.getElementById("guardHud").innerText)),"no phase31 → HUD explains local-only");
 await p.close();}
// ── 4. 沒登入：提示登入、仍可傳給家人 ──
{const p=await mk(fake({mock:{loggedOut:true}}));await p.click('.tab[data-view="record"]');await p.waitForTimeout(500);
 await p.click("#btnGuard");await p.waitForTimeout(900);
 ok(/登入社群就能指定好友/.test(await p.evaluate(()=>document.getElementById("gdFriends").innerText)),"logged out → login hint");
 await p.evaluate(()=>{navigator.share=async d=>{window.__shared=d.text;};});await p.click("#gdSms");await p.waitForTimeout(300);
 const tx=await p.evaluate(()=>window.__shared||"");ok(/預計/.test(tx)&&/112/.test(tx),"share-to-family text: "+tx.slice(0,40));
 await p.click("#gdGo");await p.waitForTimeout(300);ok(await p.evaluate(()=>Guardian.state()&&Guardian.state().gs.length===0),"can set local-only reminder");
 await p.close();}
// ── 5. 留守人那一端 ──
{const p=await mk(fake({}));
 await p.evaluate(pl=>{const T=window.__fakeT;T.guard_plans=[pl];T.notifications.unshift({id:"ng1",user_id:"me",type:"overdue",plan_id:"tp9",actor_id:"u1",read:false,created_at:new Date().toISOString(),actor:T.profiles.find(x=>x.id==="u1")},{id:"ng2",user_id:"me",type:"guard",plan_id:"tp9",actor_id:"u1",read:true,created_at:new Date(Date.now()-3*3.6e6).toISOString(),actor:T.profiles.find(x=>x.id==="u1")});},plan);
 await p.click('.tab[data-view="social"]');await p.waitForTimeout(1500);
 const nb=await p.$('[data-sub="notifs"],.soc-tab[data-t="notifs"],#socNotifBtn,.sub-tab[data-s="notif"]');
 await p.evaluate(()=>{const b=[...document.querySelectorAll("button")].find(x=>/通知/.test(x.textContent)&&x.offsetParent);if(b)b.click();});await p.waitForTimeout(1500);
 const nt=await p.evaluate(()=>{const l=document.querySelector(".notif-list");return l?l.innerText:""});
 ok(/阿梅 超過預計下山時間 30 分鐘還沒回報/.test(nt)&&/阿梅 出發了，請你當留守人/.test(nt),"guard notifications labelled");
 ok(await p.evaluate(()=>!!document.querySelector(".gp-b.st-overdue")),"overdue banner on top of notifications");
 await p.screenshot({path:O+"guard-notifs.png"});
 await p.evaluate(()=>document.querySelector(".notif.nf-overdue").click());await p.waitForTimeout(800);
 const pt=await p.evaluate(()=>{const e=document.querySelector('[data-ov="gplan"]');return e?e.innerText:""});
 ok(/阿梅/.test(pt)&&/超過預計時間/.test(pt)&&/24\.93512/.test(pt)&&/撥 112/.test(pt)&&/金瓜寮/.test(pt),"plan modal: status, last position, 112");
 await p.screenshot({path:O+"guard-plan.png"});
 await p.keyboard.press("Escape");await p.waitForTimeout(200);ok(await p.evaluate(()=>!document.querySelector('[data-ov="gplan"]')),"plan modal closes on Esc");
 await p.evaluate(()=>routeDeepLink("?guard=tp9"));await p.waitForTimeout(1200);
 ok(await p.evaluate(()=>!!document.querySelector('[data-ov="gplan"] .gp-card')),"deep link ?guard opens plan");
 await p.close();}
// ── 6. 英文 ──
{const p=await mk(fake({lang:"en"}));await p.click('.tab[data-view="record"]');await p.waitForTimeout(700);
 await p.click("#btnGuard");await p.waitForTimeout(1200);
 const t=await p.evaluate(()=>document.querySelector('[data-ov="guard"]').innerText.replace(/阿梅|許/g,""));ok(!/[一-鿿]/.test(t),"en sheet translated: "+(t.match(/[^\n]*[一-鿿][^\n]*/)||[""])[0]);
 await p.screenshot({path:O+"guard-sheet-en.png"});
 await p.click('.gd-f:has(input[value="u1"])');await p.click("#gdGo");await p.waitForTimeout(400);
 await p.click("#btnStart");await p.waitForTimeout(2000);
 const h=await p.evaluate(()=>document.getElementById("guardHud").innerText.replace(/阿梅/g,""));ok(!/[一-鿿]/.test(h),"en HUD translated: "+h.replace(/\n/g," | "));
 await p.evaluate(()=>{const s=Guardian.state();s.at=Date.now()-5*60000;localStorage.setItem("tt_guard",JSON.stringify(s));Guardian.paintHud();});
 const h2=await p.evaluate(()=>document.getElementById("guardHud").innerText);ok(!/[一-鿿]/.test(h2),"en due HUD translated: "+h2.replace(/\n/g," | "));
 await p.evaluate(pl=>{window.__fakeT.guard_plans=[pl];},plan);await p.evaluate(()=>Guardian.openPlan("tp9"));await p.waitForTimeout(800);
 const pt=await p.evaluate(()=>document.querySelector('[data-ov="gplan"]').innerText.replace(/阿梅|金瓜寮魚蕨步道|^阿$/gm,""));ok(!/[一-鿿]/.test(pt),"en plan modal translated: "+(pt.match(/[^\n]*[一-鿿][^\n]*/)||[""])[0]);
 await p.close();}
// ── 7. 步道人氣 ──
{const p=await mk(fake({}));
 const grid=Array(28).fill(0);grid[5*4+1]=4;grid[6*4+1]=3;grid[5*4+0]=2;grid[1*4+1]=1;grid[2*4+3]=1;
 await p.evaluate(g=>{window.__fakeT.crowd={hikers7:12,hikers30:40,year_hikers:88,grid:g};window.__fakeT.activity={hikers:5,hikes:6,median_ms:9000000,median_km:6.2,median_ascent:480};},grid);
 await p.evaluate(()=>openDetail("forestry-004"));await p.waitForTimeout(1800);
 const c=await p.evaluate(()=>{const b=document.getElementById("activityBox");return b&&!b.hidden?b.innerText:""});
 ok(/步道人氣/.test(c)&&/最近 7 天 12 人走過/.test(c.replace(/\n/g," "))&&/30 天 40 人/.test(c),"crowd card counts: "+c.split("\n").slice(0,2).join(" | "));
 ok(/星期六上午最熱鬧/.test(c)&&/想清幽一點/.test(c),"busiest + calm summary: "+(c.match(/.*最熱鬧.*/)||[""])[0]);
 ok(await p.evaluate(()=>document.querySelectorAll("#activityBox .crowd-grid .cg-c").length===28&&document.querySelectorAll("#activityBox .crowd-grid .cg-c.l4").length===1),"28-cell heat grid, one busiest cell");
 ok(/平均耗時/.test(c),"median time still shown");
 await p.evaluate(()=>document.getElementById("activityBox").scrollIntoView({block:"center"}));await p.waitForTimeout(300);
 await p.screenshot({path:O+"crowd.png"});
 // 人太少：只剩 7/30 天為 0 且沒圖 → 卡片不出現
 await p.evaluate(()=>{window.__fakeT.crowd={hikers7:0,hikers30:0,year_hikers:0,grid:null};window.__fakeT.activity=null;});
 await p.evaluate(()=>{closeDetail&&closeDetail();});await p.waitForTimeout(300);await p.evaluate(()=>openDetail("forestry-027"));await p.waitForTimeout(1500);
 ok(await p.evaluate(()=>{const b=document.getElementById("activityBox");return b&&!b.hidden&&b.classList.contains("crowd-empty")&&!b.querySelector(".crowd-grid")&&!/\d+ 人走過/.test(b.innerText);}),"too few hikers → no numbers, just the cold-start hint");
 // 貢獻
 const rec={id:"r1",date:new Date().toISOString(),trailId:"forestry-004",distanceKm:3.2,elapsedMs:2*3.6e6};
 ok(await p.evaluate(r=>TrailCrowd.contribute(r),rec),"contribute real hike");
 const v=await p.evaluate(()=>window.__visits&&window.__visits[0]);ok(v&&v.trail_id==="forestry-004"&&v.duration_min===120&&Math.abs(new Date(v.started_at).getTime()-(Date.now()-2*3.6e6))<60000&&!("lat" in v)&&!("track" in v),"visit row: start time + duration only");
 ok(!(await p.evaluate(r=>TrailCrowd.contribute(Object.assign({},r,{sim:true})),rec)),"sim not contributed");
 ok(!(await p.evaluate(r=>TrailCrowd.contribute(Object.assign({},r,{elapsedMs:5*60000})),rec)),"too short not contributed");
 await p.evaluate(()=>localStorage.setItem("tt_crowd_off","1"));ok(!(await p.evaluate(r=>TrailCrowd.contribute(r),rec)),"opt-out respected");
 await p.close();}
// ── 8. 步道人氣：英文、資料庫沒開 ──
{const p=await mk(fake({lang:"en"}));
 const grid=Array(28).fill(0);grid[5*4+1]=4;grid[1*4+1]=1;
 await p.evaluate(g=>{window.__fakeT.crowd={hikers7:12,hikers30:40,year_hikers:88,grid:g};},grid);
 await p.evaluate(()=>openDetail("forestry-004"));await p.waitForTimeout(2000);
 const c=await p.evaluate(()=>{const b=document.getElementById("activityBox");return b&&!b.hidden?b.innerText:""});
 ok(c&&!/[一-鿿]/.test(c),"en crowd card translated: "+c.replace(/\n/g," | ").slice(0,160));
 await p.evaluate(()=>document.getElementById("activityBox").scrollIntoView({block:"center"}));await p.waitForTimeout(300);await p.screenshot({path:O+"crowd-en.png"});
 await p.close();}
{const p=await mk(fake({mock:{noCrowd:true}}));await p.evaluate(()=>openDetail("forestry-004"));await p.waitForTimeout(1500);
 ok(await p.evaluate(()=>{const b=document.getElementById("activityBox");return !b||b.hidden;}),"no phase32 → silently hidden");await p.close();}
console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails);await b.close();srv.kill();})();
