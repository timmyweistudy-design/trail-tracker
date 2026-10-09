// 夥伴修正案 R7（2026-10-09）：親密改成點數＋部分填色的心（第一顆心 10 點、2 天後才掉、每天 −1、不跨心掉）、爬坡會喘
const __path=require("path"),__fs=require("fs");
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");
const O=__path.join(__dirname,"out","pr7")+"/";__fs.mkdirSync(O,{recursive:true});
const MOCK=__fs.readFileSync(__dirname+"/soc-mock.js","utf8");const errs=[];let fails=0;const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m);if(!c)fails++;};
const PORT = +process.env.TT_PORT || 8922;
(async()=>{const srv=spawn("python3",["-m","http.server",String(PORT)],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:390,height:844},timezoneId:"Asia/Taipei",deviceScaleFactor:2});const p=await ctx.newPage();await require(__dirname+"/fake-weather")(p);p.on("pageerror",e=>errs.push(e.message));
await p.addInitScript(()=>{if(sessionStorage.getItem("__i"))return;sessionStorage.setItem("__i","1");localStorage.setItem("tt_lang","zh");["tt_onboarded_v2","tt_coach_trail","tt_locperm_prompted","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_coach_team","tt_coach_pet"].forEach(k=>localStorage.setItem(k,"1"));
 localStorage.setItem("tt_pet_woke",String(Date.now()));localStorage.setItem("tt_test_diary","1");localStorage.setItem("tt_debug_km","40");localStorage.removeItem("tt_pet_aff");localStorage.removeItem("tt_pet_aff_t");});
await p.addInitScript(MOCK);await p.goto(`http://localhost:${PORT}/`);await p.waitForTimeout(2500);
await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));await p.click('.tab[data-view="pet"]');await p.waitForTimeout(1200);
await p.evaluate(()=>{document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove());window.__psNoIdle=true;document.querySelector(".ps-box").scrollIntoView({block:"center"});});await p.waitForTimeout(400);

// 1. 計算規則
const R=await p.evaluate(()=>{const set=(a,daysAgo)=>{localStorage.setItem("tt_pet_aff",String(a));localStorage.setItem("tt_pet_aff_t",new Date(Date.now()-daysAgo*864e5).toISOString());return affinity();};
 return {h:[0,9,10,29,30,50,70,89,90,100].map(a=>petHearts(a)),d0:set(37,1),d2:set(37,2.5),d3:set(37,3.5),d10:set(37,10.5),d30:set(9,30),fills:affFills(40).map(f=>+f.toFixed(2))};});
ok(JSON.stringify(R.h)==="[0,0,1,1,2,3,4,4,5,5]","hearts at 10/30/50/70/90 points "+JSON.stringify(R.h));
ok(R.d0===37&&R.d2===37&&R.d3===36&&R.d10===30&&R.d30===0,"decay: none for 2 days, then −1/day, never below the heart already earned "+JSON.stringify([R.d0,R.d2,R.d3,R.d10,R.d30]));
ok(JSON.stringify(R.fills)==="[1,1,0.5,0,0]","40 points = two full hearts and half of the third "+JSON.stringify(R.fills));

// 2. 卡片：摸一次頭，數字 +1、進度條變寬、心的填色跟著變（以前 0/5 不動）
await p.evaluate(()=>{localStorage.setItem("tt_pet_aff","4");localStorage.setItem("tt_pet_aff_t",new Date().toISOString());localStorage.removeItem("tt_pet_pat_day");renderPet();});await p.waitForTimeout(300);
const c0=await p.evaluate(()=>{const m=document.querySelectorAll(".pet-card .pet-meter")[1];return {n:m.querySelector("b").textContent,w:m.querySelector(".m-love").style.width,f:m.querySelector(".aff-hearts i").style.getPropertyValue("--f"),vt:m.getAttribute("aria-valuetext")};});
await p.evaluate(()=>{petPatAff();renderPet();});await p.waitForTimeout(300);
const c1=await p.evaluate(()=>{const m=document.querySelectorAll(".pet-card .pet-meter")[1];return {n:m.querySelector("b").textContent,w:m.querySelector(".m-love").style.width,f:m.querySelector(".aff-hearts i").style.getPropertyValue("--f")};});
ok(c0.n==="4"&&c1.n==="5"&&parseFloat(c1.w)>parseFloat(c0.w)&&+c1.f>+c0.f,"a head pat moves the number, the bar and the first heart "+JSON.stringify([c0,c1]));
ok(/再 6 點就有第 1 顆心/.test(c0.vt),"screen reader text says how far the next heart is ("+c0.vt+")");
await p.locator(".pet-card .pet-meters").screenshot({path:O+"meters.png"});
// 3. 「？」多一行現在幾點；拍照畫得出來
await p.evaluate(()=>document.getElementById("petHelp").click());await p.waitForTimeout(500);
ok(await p.evaluate(()=>/現在 5 點/.test((document.querySelector(".ah-now")||{}).textContent||"")),"the ? dialog shows the current points and next heart");
await p.evaluate(()=>document.querySelectorAll(".ttdlg-ov").forEach(e=>e.remove()));
ok(await p.evaluate(async()=>(await drawPetPhoto("day","sit","")).width===1080),"photo draws with the heart row");
// 4. 送禮物還是在 5 顆心（90 點）時
ok(await p.evaluate(()=>{localStorage.setItem("tt_pet_aff","90");localStorage.setItem("tt_pet_aff_t",new Date().toISOString());localStorage.removeItem("tt_pet_gift_t");return petGiftDue();}),"gift comes at 5 hearts (90 points)");

// 5. 爬坡會喘：最近 5 分鐘爬 70m → rec-climb；爬 30m → 沒有
const cl=await p.evaluate(()=>{const now=Date.now(),mk=up=>Array.from({length:11},(_,k)=>({t:now-(10-k)*30000,alt:100+k*up/10}));return [recentClimb(mk(70)),recentClimb(mk(30)),recentClimb([])];});
ok(cl[0]>60&&cl[1]<60&&cl[2]===0,"climb in the last 5 minutes: 70m → pant, 30m → no "+JSON.stringify(cl.map(v=>Math.round(v))));

ok(errs.length===0,"no page errors "+JSON.stringify(errs.slice(0,3)));
console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails);
await b.close();srv.kill();process.exit(fails?1:0);})().catch(e=>{console.error(e);process.exit(1);});
