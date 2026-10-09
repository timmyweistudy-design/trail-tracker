// 夥伴第三版 R11（2026-10-09）：社群·基礎，用假 Supabase 驗證
//   1) 好友看得到配件：好友卡、拜訪卡畫對方的 pet_acc；不認得的 id 不畫（舊版／亂填）
//   2) 好友狀態新鮮度：「N 小時前同步」；超過 24 小時→「不知道牠現在在做什麼」、不畫心情
//   3) 我的同步：送 pet_acc＋pet_state.at；資料庫還沒跑 phase40（沒有 pet_acc 欄）→ 退回不送、之後也不再先試
//   4) 斷網：不畫成「還沒有好友」、串門子不記今天來過；恢復後朋友會來
const __TTP = +process.env.TT_PORT || 8931;
const __path=require("path"),__fs=require("fs");
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");
const OUT=__path.join(__dirname,"out","r11");__fs.mkdirSync(OUT,{recursive:true});
const MOCK=__fs.readFileSync(__dirname+"/soc-mock.js","utf8");const errs=[];let fails=0;const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m);if(!c)fails++;};
const R=[0,1,2].map(i=>({id:"r"+i,date:new Date(Date.now()-(i+1)*864e5).toISOString(),trailName:"x",distanceKm:30,elapsedMs:7200e3,ascent:500,track:[]}));
const ago=h=>new Date(Date.now()-h*3600e3).toISOString();
(async()=>{const srv=spawn("python3",["-m","http.server",String(__TTP)],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch();
// 白天（串門子晚上會被睡覺擋掉）
const mk=async(setup)=>{const ctx=await b.newContext({viewport:{width:390,height:844},timezoneId:"Asia/Taipei"});const p=await ctx.newPage();await require(__dirname+"/fake-weather")(p);p.on("pageerror",e=>errs.push(e.message));
 await p.addInitScript(o=>{if(sessionStorage.getItem("seed"))return;sessionStorage.setItem("seed","1");localStorage.setItem("tt_lang","zh");["tt_onboarded_v2","tt_coach_trail","tt_locperm_prompted","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_coach_team","tt_coach_pet"].forEach(k=>localStorage.setItem(k,"1"));localStorage.setItem("tt_records",o.recs);localStorage.setItem("tt_pet_woke",String(Date.now()));localStorage.setItem("tt_pet_hat","bandana");localStorage.setItem("tt_pet_acc","bell");},{recs:JSON.stringify(R)});
 await p.addInitScript(MOCK);await p.goto("http://localhost:"+__TTP+"/");await require(__dirname+"/ready")(p);
 await p.evaluate(()=>{const d=new Date();d.setHours(11,0,0,0);ttClock.set(d);});   // 夥伴的時鐘撥到早上 11 點（晚上睡覺不接客）
 await p.evaluate(setup);
 await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));await p.click('.tab[data-view="pet"]');await p.waitForTimeout(1500);return p;};
const seed=()=>{window.__installFakeSupa({});const P=id=>window.__fakeT.profiles.find(x=>x.id===id),ago=h=>new Date(Date.now()-h*3600e3).toISOString();
 Object.assign(P("u1"),{pet_hat:"straw",pet_acc:"scarf",pet_state:{last:ago(30),wx:"",wxAt:null,at:ago(3.2)}});
 Object.assign(P("u3"),{pet_acc:"<b>x</b>",pet_state:{last:ago(30),wx:"rain",wxAt:ago(1).slice(0,13),at:ago(50)}});};

// 1) 2) 好友卡、拜訪卡
{const p=await mk(seed);
 await p.waitForSelector('#petFriends .fp-visit[data-id="u1"]',{timeout:8000}).catch(()=>{});
 const card=await p.evaluate(()=>{const c=id=>document.querySelector(`#petFriends .fp-visit[data-id="${id}"]`);return {u1acc:!!c("u1")?.querySelector(".fp-pet .pc-acc.acc-scarf"),u1fresh:c("u1")?.querySelector(".fp-fresh")?.textContent,u3acc:!!c("u3")?.querySelector(".pc-acc"),u3fresh:c("u3")?.querySelector(".fp-fresh.stale")?.textContent};});
 ok(card.u1acc,"friend card draws the friend's scarf");
 ok(card.u1fresh==="3 小時前同步","friend card: synced 3 h ago ("+card.u1fresh+")");
 ok(!card.u3acc,"unknown accessory id is not drawn");
 ok(card.u3fresh==="超過一天沒同步","friend card: stale after 24 h ("+card.u3fresh+")");
 await p.screenshot({path:OUT+"/friends.png",fullPage:false});
 await p.click('#petFriends .fp-visit[data-id="u1"]');await p.waitForTimeout(700);
 const v1=await p.evaluate(()=>({acc:!!document.querySelector(".fv-critter .pc-acc.acc-scarf"),hat:!!document.querySelector(".fv-critter .pc-hat"),fresh:document.querySelector(".fv-fresh")?.textContent,mood:[...document.querySelector(".fv-critter").classList].some(c=>c.startsWith("pet-m-")),bub:document.querySelector(".fv-stage .pet-bubble")?.textContent}));
 ok(v1.acc&&v1.hat,"visit card: friend's pet wears hat + scarf");
 ok(v1.fresh==="3 小時前同步"&&v1.mood&&v1.bub&&!/不知道/.test(v1.bub),"visit card: fresh state shows mood + sync time "+JSON.stringify(v1));
 await p.screenshot({path:OUT+"/visit-fresh.png"});
 await p.click("#pvX");await p.waitForTimeout(300);
 await p.click('#petFriends .fp-visit[data-id="u3"]');await p.waitForTimeout(700);
 const v3=await p.evaluate(()=>({mood:[...document.querySelector(".fv-critter").classList].some(c=>c.startsWith("pet-m-")),bub:document.querySelector(".fv-stage .pet-bubble")?.textContent,rain:document.querySelector(".fv-stage .ps-box")?.dataset.wx||""}));
 ok(!v3.mood&&v3.bub==="不知道牠現在在做什麼","stale (>24 h): no mood, says it doesn't know "+JSON.stringify(v3));
 ok(!v3.rain,"stale: weather not drawn");
 await p.screenshot({path:OUT+"/visit-stale.png"});
 await p.click("#pvX");
// 3) 我的同步
 const s1=await p.evaluate(async()=>{window.__updates=[];localStorage.setItem("tt_pet_acc","scarf");await Profiles.syncMyStats("me");const u=window.__updates.filter(x=>x.table==="profiles").pop();return u&&u.fields;});
 ok(s1&&s1.pet_acc==="scarf"&&s1.pet_hat==="bandana"&&s1.pet_state&&!isNaN(new Date(s1.pet_state.at)),"sync sends pet_acc + pet_state.at "+JSON.stringify(s1&&{acc:s1.pet_acc,at:s1.pet_state&&s1.pet_state.at}));
 const s2=await p.evaluate(async()=>{const c=Supa.client(),orig=c.from;window.__accTry=0;c.from=t=>{const q=orig(t),u=q.update;q.update=row=>{if(t==="profiles"&&"pet_acc" in row){window.__accTry++;return {eq:async()=>({data:null,error:{message:"Could not find the 'pet_acc' column of 'profiles' in the schema cache"}})};}return u.call(q,row);};return q;};
  window.__updates=[];localStorage.setItem("tt_pet_acc","bell");await Profiles.syncMyStats("me");const a=window.__updates.filter(x=>x.table==="profiles").pop();
  localStorage.setItem("tt_pet_acc","bowtie");await Profiles.syncMyStats("me");c.from=orig;return {tries:window.__accTry,fell:a&&a.fields,n:window.__updates.length};});
 ok(s2.fell&&!("pet_acc" in s2.fell)&&s2.fell.pet_state&&s2.fell.pet_hat==="bandana","no pet_acc column: falls back to state + hat (sync not lost)");
 ok(s2.tries===1&&s2.n===2,"no pet_acc column: remembered, not retried on the next sync "+JSON.stringify({tries:s2.tries,n:s2.n}));
 await p.context().close();}

// 4) 斷網：讀不到≠沒有好友；串門子不記；恢復後會來
{const p=await mk(()=>{window.__installFakeSupa({});const c=Supa.client(),orig=c.from;window.__origFrom=orig;c.from=t=>t==="follows"?{select:()=>({eq:async()=>({data:null,error:{message:"Failed to fetch"}})})}:orig(t);});
 await p.waitForTimeout(3500);
 const off=await p.evaluate(()=>({txt:document.getElementById("petFriends").innerText,guest:!!document.querySelector(".ps-guest"),day:localStorage.getItem("tt_pet_guest_day")}));
 ok(/暫時讀不到/.test(off.txt)&&!/互相追蹤山友後/.test(off.txt),"offline: says it can't load, not 'no friends yet' ("+off.txt.replace(/\n/g," | ")+")");
 ok(!off.guest&&!off.day,"offline: no guest, today not marked");
 await p.evaluate(()=>{Supa.client().from=window.__origFrom;});
 await p.click('.tab[data-view="me"]');await p.waitForTimeout(400);await p.click('.tab[data-view="pet"]');
 const came=await p.waitForFunction(()=>!!document.querySelector(".ps-guest"),null,{timeout:9000}).then(()=>true).catch(()=>false);
 ok(came,"back online: a friend's pet comes to visit");
 await p.waitForTimeout(900);await p.screenshot({path:OUT+"/guest.png"});
 ok(await p.waitForFunction(()=>!!localStorage.getItem("tt_pet_guest_day"),null,{timeout:12000}).then(()=>true).catch(()=>false),"visit recorded for today after it actually happened");
 await p.context().close();}
console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails+(errs.length?1:0));await b.close();srv.kill();process.exit(0);})();
