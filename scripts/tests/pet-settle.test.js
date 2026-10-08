// 獎勵只結算一次（2026-10-08 修正案 A4）：動畫播到一半重開 App，數值只能變一次——不能重扣果實、重加里程、重送禮物、重放進化
const __path=require("path"),__fs=require("fs");
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");
const MOCK=__fs.readFileSync(__dirname+"/soc-mock.js","utf8");const errs=[];let fails=0;const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m);if(!c)fails++;};
const PORT = +process.env.TT_PORT || 8916;
(async()=>{const srv=spawn("python3",["-m","http.server",String(PORT)],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch();
const mk=async(km)=>{const ctx=await b.newContext({viewport:{width:390,height:844},timezoneId:"Asia/Taipei"});const p=await ctx.newPage();await require(__dirname+"/fake-weather")(p);p.on("pageerror",e=>errs.push(e.message));
 await p.addInitScript(km=>{if(sessionStorage.getItem("__i"))return;sessionStorage.setItem("__i","1");localStorage.setItem("tt_lang","zh");["tt_onboarded_v2","tt_coach_trail","tt_locperm_prompted","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_coach_team","tt_coach_pet"].forEach(k=>localStorage.setItem(k,"1"));
  localStorage.setItem("tt_pet_woke",String(Date.now()));localStorage.setItem("tt_test_diary","1");localStorage.setItem("tt_debug_km",String(km));localStorage.setItem("tt_pet_berry_bonus","30");},km);
 await p.addInitScript(MOCK);await p.goto(`http://localhost:${PORT}/`);await p.waitForTimeout(2500);
 await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));await p.click('.tab[data-view="pet"]');await p.waitForTimeout(1200);
 await p.evaluate(()=>{document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove());window.__psNoIdle=true;document.querySelector(".ps-box").scrollIntoView({block:"center"});});await p.waitForTimeout(400);return p;};
const reopen=async p=>{await p.reload();await p.waitForTimeout(2500);await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));await p.click('.tab[data-view="pet"]');await p.waitForTimeout(1200);};
const snap=p=>p.evaluate(()=>({bal:berriesBalance(),km:+(localStorage.getItem("tt_pet_feedkm")||0),fed:localStorage.getItem("tt_pet_fed_t"),stage:localStorage.getItem("tt_pet_stage"),
  evo:JSON.parse(localStorage.getItem("tt_pet_diary")||"[]").filter(x=>x.k==="evo").length,gifts:JSON.parse(localStorage.getItem("tt_pet_gifts")||"[]").length,giftT:localStorage.getItem("tt_pet_gift_t")}));

// 1. 餵食：按下去、動畫 1.5 秒時重開 → 果實只扣一次（3 顆）、成長里程只加一次、冷卻在
{const p=await mk(40);const s0=await snap(p);
 await p.evaluate(()=>document.getElementById("petFeed").click());await p.waitForTimeout(1500);await reopen(p);const s1=await snap(p);
 ok(s0.bal-s1.bal===3,"feed: berries charged once (−"+(s0.bal-s1.bal)+")");ok(Math.abs(s1.km-s0.km-0.3)<1e-6||Math.abs(s1.km-s0.km-0.5)<1e-6,"feed: growth km added once (+"+(s1.km-s0.km).toFixed(2)+")");
 ok(await p.evaluate(()=>feedCooldownMs()>7.9*3600e3&&!canFeedNow()),"feed: cooldown survives the reopen (can't feed again)");
 await p.close();}

// 2. 進化：跨過門檻、慶祝動畫播到一半重開 → 階段只升一次、進化日記只一筆、重開不再放一次慶祝
{const p=await mk(11.5);
 await p.evaluate(()=>{localStorage.setItem("tt_debug_km","12.5");checkPetEvolve();});await p.waitForTimeout(1200);
 const s1=await snap(p);await reopen(p);await p.waitForTimeout(1500);const s2=await snap(p);
 const again=await p.evaluate(()=>!!document.querySelector(".evolve-stage,.evolve-ov,.evolve"));
 ok(s1.stage==="2"&&s2.stage==="2"&&s1.evo===1&&s2.evo===1,"evolve: stage set once, one diary entry ("+JSON.stringify([s1.stage,s2.stage,s1.evo,s2.evo])+")");ok(!again,"evolve: no second celebration after reopen");
 await p.close();}

// 3. 親密滿帶禮物：禮物出現前（2.6 秒內）重開 → 只拿到一個、時間戳只寫一次、重開不會再給
{const p=await mk(40);
 await p.evaluate(()=>{localStorage.setItem("tt_pet_aff","100");localStorage.setItem("tt_pet_aff_t",new Date().toISOString());localStorage.removeItem("tt_pet_gift_t");localStorage.removeItem("tt_pet_gifts");window.__petGiftT=0;renderPet();});
 await p.waitForTimeout(800);const s1=await snap(p);await reopen(p);await p.waitForTimeout(3200);const s2=await snap(p);
 ok(s1.gifts===1&&s2.gifts===1&&s1.giftT===s2.giftT,"gift: given once, timestamp unchanged after reopen ("+s1.gifts+"→"+s2.gifts+")");
 await p.close();}

ok(errs.length===0,"no page errors "+JSON.stringify(errs.slice(0,3)));
console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails);
await b.close();srv.kill();process.exit(fails?1:0);})().catch(e=>{console.error(e);process.exit(1);});
