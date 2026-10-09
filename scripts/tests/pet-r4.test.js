// 夥伴修正案 R4（2026-10-08）：睡覺時間可調、想你的提醒頻率、點舞台丟松果＋玩累了、拍照姿勢＋步道標題、日記照月份看、地圖夥伴分種類、還原壞掉幾項
const __path=require("path"),__fs=require("fs");
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");
const O=__path.join(__dirname,"out","pr4")+"/";__fs.mkdirSync(O,{recursive:true});
const MOCK=__fs.readFileSync(__dirname+"/soc-mock.js","utf8");const errs=[];let fails=0;const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m);if(!c)fails++;};
const PORT = +process.env.TT_PORT || 8919;
(async()=>{const srv=spawn("python3",["-m","http.server",String(PORT)],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch();
const mk=async(o={})=>{const ctx=await b.newContext({viewport:{width:390,height:844},timezoneId:"Asia/Taipei"});const p=await ctx.newPage();await require(__dirname+"/fake-weather")(p);p.on("pageerror",e=>errs.push(e.message));
 await p.addInitScript(o=>{if(sessionStorage.getItem("__i"))return;sessionStorage.setItem("__i","1");localStorage.setItem("tt_lang","zh");["tt_onboarded_v2","tt_coach_trail","tt_locperm_prompted","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_coach_team","tt_coach_pet"].forEach(k=>localStorage.setItem(k,"1"));
  localStorage.setItem("tt_pet_woke",String(Date.now()));localStorage.setItem("tt_test_diary","1");localStorage.setItem("tt_debug_km",String(o.km||40));localStorage.setItem("tt_pet_berry_bonus","30");
  if(o.records)localStorage.setItem("tt_records",JSON.stringify(o.records));if(o.diary)localStorage.setItem("tt_pet_diary",JSON.stringify(o.diary));},o);
 await p.addInitScript(MOCK);await p.goto(`http://localhost:${PORT}/`);await require(__dirname+"/ready")(p);
 await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));await p.click('.tab[data-view="pet"]');await p.waitForTimeout(1200);
 await p.evaluate(()=>{document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove());window.__psNoIdle=true;document.querySelector(".ps-box").scrollIntoView({block:"center"});});await p.waitForTimeout(400);return p;};
const at=(p,h,mi)=>p.evaluate(a=>{localStorage.setItem("tt_pet_woke","0");ttClock.set(new Date(2026,9,8,a[0],a[1]||0));renderPet();return document.querySelector(".ps-box").classList.contains("ps-asleep");},[h,mi]);

// 1. 睡覺時間（原5）：23～7、跨午夜邊界；不睡覺；設定選單存得進去
{const p=await mk();
 await p.evaluate(()=>localStorage.setItem("tt_pet_sleep","23-7"));
 const r=[await at(p,22,59),await at(p,23,0),await at(p,6,59),await at(p,7,0)];ok(JSON.stringify(r)==="[false,true,true,false]","sleep window 23–7 boundaries "+JSON.stringify(r));
 await p.evaluate(()=>localStorage.setItem("tt_pet_sleep","off"));ok(await at(p,2,0)===false,"'never sleeps' stays awake at 2:00");
 await p.evaluate(()=>{localStorage.removeItem("tt_pet_sleep");ttClock.reset();localStorage.setItem("tt_pet_woke",String(Date.now()));renderPet();});
 await p.evaluate(()=>document.getElementById("petHelp").click());await p.waitForTimeout(500);
 const ui=await p.evaluate(()=>{const a=document.getElementById("petSleepA"),bb=document.getElementById("petSleepB"),n=document.getElementById("petNudgeSel");if(!a||!bb||!n)return null;
  const def=[a.value,bb.value,n.value];a.value="21";a.dispatchEvent(new Event("change"));bb.value="8";bb.dispatchEvent(new Event("change"));n.value="7";n.dispatchEvent(new Event("change"));
  const s1=localStorage.getItem("tt_pet_sleep"),n1=localStorage.getItem("tt_pet_nudge");a.value="off";a.dispatchEvent(new Event("change"));return {def,s1,n1,s2:localStorage.getItem("tt_pet_sleep"),dis:bb.disabled,days:petNudgeDays()};});
 ok(ui&&ui.def.join()==="22,6,3","help dialog shows defaults 22:00–06:00, reminder after 3 days "+JSON.stringify(ui&&ui.def));
 ok(ui&&ui.s1==="21-8"&&ui.n1==="7"&&ui.s2==="off"&&ui.dis&&ui.days===7,"changing the selects saves sleep 21-8 / off and reminder 7 days "+JSON.stringify(ui));
 ok(await p.evaluate(()=>Store.exportAll().pet.tt_pet_sleep==="off"),"sleep setting goes into the backup");
 await p.evaluate(()=>document.querySelectorAll(".ttdlg-ov").forEach(e=>e.remove()));await p.close();}

// 2. 點舞台空地丟松果（原6）：丟在點的那一側、限制在 ±84；10 分鐘內第 3 次後累了，第 4 次被擋
{const p=await mk();
 const box=await p.evaluate(()=>{const r=document.querySelector(".ps-box").getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height};});
 await p.mouse.click(box.x+box.w*.9,box.y+box.h*.85);await p.waitForTimeout(400);
 const toy=await p.evaluate(()=>{const t=document.querySelector(".ps-toy");return t?+t.style.getPropertyValue("--bx"):null;});
 ok(toy!=null&&toy>=22&&toy<=84,"tapping the right side of the stage throws the cone to the right, within reach (--bx "+toy+")");
 await p.waitForFunction(()=>!PetStage.isPlaying(),null,{timeout:30000});
 for(let k=0;k<2;k++){await p.evaluate(()=>petPlayAt(null));await p.waitForTimeout(300);await p.waitForFunction(()=>!PetStage.isPlaying(),null,{timeout:30000});}
 await p.waitForTimeout(600);const t3=await p.evaluate(()=>document.querySelector(".pet-bubble").textContent);
 await p.evaluate(()=>petPlayAt(null));await p.waitForTimeout(400);const t4=await p.evaluate(()=>[document.querySelector(".pet-bubble").textContent,PetStage.isPlaying()]);
 ok(/玩累了/.test(t3),"after the 3rd play in 10 minutes it is tired ("+t3+")");ok(/玩累了/.test(t4[0])&&!t4[1],"a 4th play right away is refused with the tired line "+JSON.stringify(t4));
 await p.close();}

// 3. 拍照（原16）：三個姿勢都畫得出來；有走過步道才有「加上最近走的步道」
{const p=await mk({records:[{id:"r1",date:new Date().toISOString(),trailName:"金瓜寮魚蕨步道",distanceKm:3,elapsedMs:36e5,track:[]}]});
 const r=await p.evaluate(async()=>{const o=[];for(const pose of ["sit","happy","sleep"]){const c=await drawPetPhoto("day",pose,pose==="sleep"?"金瓜寮魚蕨步道":"");o.push(c.width===1080&&c.height===1350);}return o;});
 ok(r.every(Boolean),"photo draws in all three poses (sit / happy / sleep with trail title)");
 await p.evaluate(()=>openPetPhoto());await p.waitForTimeout(900);
 const ui=await p.evaluate(()=>({poses:document.querySelectorAll(".pp-pose").length,trail:!!document.getElementById("ppTrail")}));
 ok(ui.poses===3&&ui.trail,"photo dialog has 3 pose buttons and the latest-trail switch "+JSON.stringify(ui));
 await p.click('.pp-pose[data-pose="sleep"]');await p.click("#ppTrail");await p.waitForTimeout(1200);await p.screenshot({path:O+"photo-sleep-trail.png"});
 await p.close();}

// 4. 日記照月份（原22）：兩個月以上才有月份按鈕；選了月份只剩那個月，上面有小結
{const p=await mk({diary:[{t:"2026-09-03T10:00:00.000Z",k:"feed1",i:2},{t:"2026-10-02T10:00:00.000Z",k:"hug1",i:3}],records:[{id:"r9",date:"2026-09-03T02:00:00.000Z",trailName:"x",distanceKm:4.5,elapsedMs:36e5,track:[]}]});
 await p.evaluate(()=>openPetDex());await p.waitForTimeout(700);
 const r=await p.evaluate(()=>{const chips=[...document.querySelectorAll(".diary-months .pp-tod")];const sep=chips.find(c=>c.dataset.ym==="2026-09");if(!sep)return {chips:chips.length};sep.click();
  return {chips:chips.length,rows:document.querySelectorAll(".diary-list .diary-row").length,sum:document.querySelector(".diary-month-sum").textContent,hidden:document.querySelector(".diary-month-sum").hidden};});
 ok(r.chips>=3,"diary has month chips (all + each month): "+r.chips);ok(r.rows>=1&&/1 次、4\.5 km、日記 1 則/.test(r.sum)&&!r.hidden,"picking September filters the diary and shows the month summary "+JSON.stringify(r));
 await p.close();}

// 5. 地圖上的夥伴依種類動（原17）：每一階的 SVG 都帶 data-s；記錄中蝶是飄的、神龍是游的、蛋休息不動
{const p=await mk();
 const r=await p.evaluate(()=>{const d=document.createElement("div");d.id="recMap";document.body.appendChild(d);document.body.classList.add("rec-running");const out=[];
  for(const i of [0,1,2,6]){d.innerHTML=`<div class="pm-e">${PET_ART.svg(i)}</div>`;out.push(getComputedStyle(d.querySelector(".pet-critter")).animationName);}
  document.body.classList.add("rec-resting");d.innerHTML=`<div class="pm-e">${PET_ART.svg(0)}</div>`;out.push(getComputedStyle(d.querySelector(".pet-critter")).animationName);
  document.body.classList.remove("rec-running","rec-resting");d.remove();return out;});
 ok(JSON.stringify(r)==='["petRoll","petInch","petFlit","petGlide","none"]',"map buddy moves by kind (egg rolls, larva inches, butterfly flits, dragon glides; resting egg still) "+JSON.stringify(r));
 await p.close();}

// 6. 還原時壞掉的項目要說出來（A5 的畫面）
{const p=await mk();
 const r=await p.evaluate(()=>[typeof restoreNote==="function"?restoreNote({errors:["tt_pet_gifts","tt_peaks"]}):null,typeof restoreNote==="function"?restoreNote({errors:[]}):null]);
 ok(r[0]&&/2 項資料壞掉/.test(r[0])&&r[1]==="","restore toast mentions how many broken items were skipped "+JSON.stringify(r));
 await p.close();}

ok(errs.length===0,"no page errors "+JSON.stringify(errs.slice(0,3)));
console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails);
await b.close();srv.kill();process.exit(fails?1:0);})().catch(e=>{console.error(e);process.exit(1);});
