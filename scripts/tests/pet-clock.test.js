// 夥伴的時鐘與版本（2026-10-08 修正案 R1：A1 版本辨識、A9 測試時鐘、原 35 錄影標籤）
// 跟時間有關的規則都在邊界上測（睡覺 22:00／06:00、節日前後 1.5 天、紀念日當天、冷卻上限），一律固定台北時區；
// 時間用 ttClock 撥（測試面板「時間快轉」用的同一個），不靠 CI 剛好在幾點跑
const __path=require("path"),__fs=require("fs");
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");
const MOCK=__fs.readFileSync(__dirname+"/soc-mock.js","utf8");const errs=[];let fails=0;const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m);if(!c)fails++;};
const PORT = +process.env.TT_PORT || 8913;
(async()=>{const srv=spawn("python3",["-m","http.server",String(PORT)],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch();
const SW=(__fs.readFileSync(ROOT+"/web/sw.js","utf8").match(/trail-tracker-(v\d+)/)||[])[1];
const mk=async(o={})=>{const ctx=await b.newContext({viewport:{width:390,height:844},timezoneId:"Asia/Taipei"});const p=await ctx.newPage();await require(__dirname+"/fake-weather")(p);p.on("pageerror",e=>errs.push(e.message));
 await p.addInitScript(o=>{if(sessionStorage.getItem("__init"))return;sessionStorage.setItem("__init","1");   // 只在第一次載入時灌資料（reload 測試要看 sessionStorage 留不留得住）
  localStorage.setItem("tt_lang","zh");["tt_onboarded_v2","tt_coach_trail","tt_locperm_prompted","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_coach_team","tt_coach_pet"].forEach(k=>localStorage.setItem(k,"1"));
  localStorage.setItem("tt_pet_woke",o.woke?String(Date.now()):"0");if(o.testDiary)localStorage.setItem("tt_test_diary","1");localStorage.setItem("tt_debug_km",String(o.km||0));if(o.hatch)localStorage.setItem("tt_pet_hatch",o.hatch);},o);
 await p.addInitScript(MOCK);await p.goto(`http://localhost:${PORT}/`);await p.waitForTimeout(2500);
 await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));await p.click('.tab[data-view="pet"]');await p.waitForTimeout(1200);
 await p.evaluate(()=>{document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove());window.__psNoIdle=true;});return p;};
const at=(p,y,mo,d,h,mi)=>p.evaluate(a=>{ttClock.set(new Date(a[0],a[1]-1,a[2],a[3],a[4]||0));renderPet();},[y,mo,d,h,mi]);

// ── 1. 時鐘本身：預設是真實時間；撥了之後夥伴的時段跟著走 ──
{const p=await mk({km:40,testDiary:1});
 ok(await p.evaluate(()=>typeof ttClock==="object"&&ttClock.offset()===0&&Math.abs(ttClock.now()-Date.now())<5),"ttClock defaults to real time");
 for(const [h,want] of [[4,"night"],[5,"dawn"],[7,"dawn"],[8,"day"],[15,"day"],[16,"dusk"],[18,"dusk"],[19,"night"]]){await at(p,2026,10,8,h,0);
  const got=await p.evaluate(()=>document.querySelector(".ps-box").dataset.tod);ok(got===want,`stage tod at ${h}:00 = ${want} (${got})`);}
 // 季節也跟著時鐘
 await at(p,2026,12,24,10);ok(await p.evaluate(()=>document.querySelector(".ps-box").dataset.season)==="winter","stage season follows clock (Dec → winter)");
 // 撥過的時間只活在這次開啟：reload 還在、不寫進 localStorage（不會進備份）
 await p.reload();await p.waitForTimeout(2500);
 const kept=await p.evaluate(()=>[ttClock.date().getMonth()+1,ttClock.date().getDate(),Object.keys(localStorage).filter(k=>/clock/.test(k))]);
 ok(kept[0]===12&&kept[1]===24&&kept[2].length===0,"offset survives reload via sessionStorage, nothing in localStorage "+JSON.stringify(kept));
 await p.evaluate(()=>ttClock.reset());ok(await p.evaluate(()=>ttClock.offset()===0&&!sessionStorage.getItem("tt_clock_off")),"reset clears the offset");
 await p.close();}

// ── 2. 睡覺的邊界：21:59 醒著、22:00 睡著、05:59 睡著、06:00 醒著；叫醒後 15 分鐘內不會又睡回去 ──
{const p=await mk({km:40,testDiary:1});
 for(const [h,mi,want] of [[21,59,false],[22,0,true],[23,30,true],[0,0,true],[5,59,true],[6,0,false],[12,0,false]]){await at(p,2026,10,8,h,mi);
  const got=await p.evaluate(()=>document.querySelector(".ps-box").classList.contains("ps-asleep"));ok(got===want,`asleep at ${h}:${String(mi).padStart(2,"0")} = ${want}`);}
 await at(p,2026,10,8,23,0);
 const w=await p.evaluate(async()=>{await PetStage.wake();const a=PetStage.isAsleep();ttClock.shift(14*60e3);renderPet();const b=PetStage.isAsleep();ttClock.shift(2*60e3);renderPet();return [a,b,PetStage.isAsleep()];});
 ok(w[0]===false&&w[1]===false&&w[2]===true,"woken at 23:00: stays awake 14 min, sleeps again after 16 min "+w);
 await p.evaluate(()=>ttClock.reset());await p.close();}

// ── 3. 節日：中秋 2026-09-25，前後 1.5 天（從當天中午算）──
{const p=await mk({km:40,testDiary:1});
 const f=await p.evaluate(()=>{const F=(y,m,d,h,mi)=>petFestival(new Date(y,m-1,d,h,mi||0));
  return {before:F(2026,9,23,23,59),start:F(2026,9,24,0,1),day:F(2026,9,25,12),end:F(2026,9,26,23,59),after:F(2026,9,27,0,1),ny:F(2027,2,6,9),db:F(2030,6,5,9),none:F(2026,10,8,12)};});
 ok(f.before===null&&f.start==="ma"&&f.day==="ma"&&f.end==="ma"&&f.after===null,"mid-autumn window is day before → day after "+JSON.stringify(f));
 ok(f.ny==="ny"&&f.db==="db"&&f.none===null,"new year 2027 / dragon boat 2030 found, ordinary day none");
 // 不帶參數時讀時鐘：撥到中秋 → 舞台掛燈籠
 await at(p,2026,9,25,10);ok(await p.evaluate(()=>petFestival()==="ma"),"petFestival() with no arg follows ttClock");
 await p.evaluate(()=>ttClock.reset());await p.close();}

// ── 4. 紀念日：相遇第 30／100 天、一週年當天，前一天不算 ──
{const p=await mk({km:40,testDiary:1,hatch:new Date(2026,0,1,9).toISOString()});
 const r=[];for(const [y,m,d] of [[2026,1,30],[2026,1,31],[2026,4,11],[2026,4,10],[2027,1,1]]){await at(p,y,m,d,10);r.push(await p.evaluate(()=>{const a=petAnniversary();return a?a.k:null;}));}
 ok(r[0]===null&&r[1]==="d30"&&r[2]==="d100"&&r[3]===null&&r[4]==="y1","anniversary days 30/100/1y exact, day before is nothing "+JSON.stringify(r));
 await p.evaluate(()=>ttClock.reset());await p.close();}

// ── 5. 冷卻上限：餵食時間落在「未來」（時間快轉後撥回來、手機時間被調過）也最多等 8 小時 ──
{const p=await mk({km:40,testDiary:1});
 const c=await p.evaluate(()=>{localStorage.setItem("tt_pet_fed_t",String(Date.now()+5*3600e3));const a=feedCooldownMs();localStorage.setItem("tt_pet_fed_t",String(Date.now()-7*3600e3));const b=feedCooldownMs();localStorage.removeItem("tt_pet_fed_t");return [a,b];});
 ok(c[0]<=8*3600e3&&c[0]>7.99*3600e3,"cooldown capped at 8h when fed_t is in the future ("+(c[0]/3600e3).toFixed(2)+"h)");
 ok(c[1]>0.99*3600e3&&c[1]<=3600e3,"normal cooldown unchanged (fed 7h ago → ~1h left)");
 // 時鐘往後撥 8 小時 → 可以再餵
 const d=await p.evaluate(()=>{localStorage.setItem("tt_pet_fed_t",String(Date.now()));const a=feedCooldownMs()>0;ttClock.shift(8*3600e3+1000);const b=feedCooldownMs();ttClock.reset();localStorage.removeItem("tt_pet_fed_t");return [a,b];});
 ok(d[0]&&d[1]===0,"shifting the clock +8h ends the cooldown");
 await p.close();}

// ── 6. 撥過時間之後寫的日記標 dbg（清 debug 一起刪）──
{const p=await mk({km:0});
 const r=await p.evaluate(()=>{window.__petDbg=false;const before=petDebugOn();ttClock.shift(3600e3);const after=petDebugOn();petDiaryAdd("clocktest");const d=JSON.parse(localStorage.getItem("tt_pet_diary")||"[]").filter(x=>x.k==="clocktest");ttClock.reset();return [before,after,d.length,d.every(x=>x.dbg)];});
 ok(r[0]===false&&r[1]===true&&r[2]===1&&r[3],"after shifting the clock, diary entries are marked dbg "+r);
 await p.close();}

// ── 7. 測試面板：時間快轉按鈕、版本、錄影標籤、清 debug 會撥回真實時間 ──
{const p=await mk({km:40,testDiary:1});
 await p.evaluate(()=>ensureScript("js/debug.js"));await p.waitForFunction(()=>window.ttDebug&&ttDebug.clock);
 const v=await p.evaluate(()=>ttDebug.ver());ok(v===`${SW} · web`,"ttDebug.ver() = sw version · web ("+v+")");
 const r=await p.evaluate(()=>{const o=[];for(const k of ["6:30","18:00","23:00"]){ttDebug.clock(k);const d=ttClock.date();o.push([d.getHours(),d.getMinutes(),ttClock.now()>Date.now()-1000]);}return o;});
 ok(r[0][0]===6&&r[0][1]===30&&r[1][0]===18&&r[2][0]===23&&r.every(x=>x[2]),"fast-forward to 6:30 / 18:00 / 23:00 (never backwards) "+JSON.stringify(r));
 ok(await p.evaluate(()=>/^時間：\d+\/\d+ 23:00/.test(ttDebug.clockTxt())),"clockTxt shows the shifted time");
 const fe=await p.evaluate(()=>{ttDebug.clock(null);ttDebug.clock("fest");return petFestival();});ok(["ny","db","ma"].includes(fe),"fast-forward to next festival lands on a festival ("+fe+")");
 const an=await p.evaluate(()=>{ttDebug.clock(null);localStorage.setItem("tt_pet_hatch",new Date(Date.now()-5*864e5).toISOString());ttDebug.clock("ann");const a=petAnniversary();return a&&a.k;});ok(an==="d30","fast-forward to next anniversary → day 30 ("+an+")");
 ok(await p.evaluate(()=>{ttDebug.clock("+8h");ttDebug.clearDebug();return ttClock.offset()===0;}),"clearDebug returns to real time");
 // 錄影標籤：版本、階段、動作階段都在（clearDebug 會清掉測試里程、真實時間可能是深夜：先放回第 3 階、醒著）
 await p.evaluate(()=>{localStorage.setItem("tt_debug_km","40");localStorage.setItem("tt_pet_woke",String(Date.now()));renderPet();ttDebug.tag();document.querySelector(".ps-box").scrollIntoView({block:"center"});});await p.waitForTimeout(400);
 const t1=await p.evaluate(()=>document.getElementById("ttTag").textContent);ok(t1.includes(SW)&&/第 3 階/.test(t1)&&/待機/.test(t1),"recording tag shows version, stage, idle ("+t1+")");
 await p.evaluate(()=>{localStorage.removeItem("tt_pet_fed_t");localStorage.setItem("tt_pet_berry_bonus","30");renderPet();document.getElementById("petFeed").click();});
 const seen=new Set();for(let i=0;i<40;i++){await p.waitForTimeout(150);seen.add(await p.evaluate(()=>PetStage.phase()));}
 ok([...seen].some(x=>x.startsWith("餵:")),"phase reports feeding sub-phases "+JSON.stringify([...seen]));
 const t2=await p.evaluate(()=>document.getElementById("ttTag").textContent);ok(/餵:|待機/.test(t2),"tag follows phase ("+t2+")");
 ok(await p.evaluate(()=>ttDebug.tag()==="錄影標籤：關"&&!document.getElementById("ttTag")),"tag toggles off");
 await p.close();}

ok(errs.length===0,"no page errors "+JSON.stringify(errs.slice(0,3)));
console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails);   // run-all 讀這兩行判斷成敗
await b.close();srv.kill();process.exit(fails?1:0);})().catch(e=>{console.error(e);process.exit(1);});
