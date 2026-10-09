// 夥伴第三版 R10（2026-10-09）：頭飾在舞台上的自動檢查——不浮空、不掛在觸角上（使用者兩次在手機上抓到：小頭頭飾浮空、玉兔耳在觸角上）
//   1) 七隻 × 12 頂：帽子外框跟頭的外框要重疊 ≥2px（不浮空）
//   2) 蝴蝶：頭巾類、髮夾類、玉兔耳、芒草穗要整頂落在兩根觸角之間（不掛在觸角上）
//   （龍的鹿角沒有自己的 class，量不到——靠舞台截圖人眼看）
const __path=require("path"),__fs=require("fs");
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");
const MOCK=__fs.readFileSync(__dirname+"/soc-mock.js","utf8");const errs=[];let fails=0;const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m);if(!c)fails++;};
const PORT = +process.env.TT_PORT || 8925, KM=[0,5,20,40,90,150,260];
(async()=>{const srv=spawn("python3",["-m","http.server",String(PORT)],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch();
for(const st of [0,1,2,3,4,5,6]){const ctx=await b.newContext({viewport:{width:390,height:844},timezoneId:"Asia/Taipei"});const p=await ctx.newPage();await require(__dirname+"/fake-weather")(p);p.on("pageerror",e=>errs.push(e.message));
 await p.addInitScript(km=>{localStorage.setItem("tt_lang","zh");["tt_onboarded_v2","tt_coach_trail","tt_locperm_prompted","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_coach_team","tt_coach_pet"].forEach(k=>localStorage.setItem(k,"1"));localStorage.setItem("tt_pet_woke",String(Date.now()));localStorage.setItem("tt_test_diary","1");localStorage.setItem("tt_debug_km",String(km));},KM[st]);
 await p.addInitScript(MOCK);await p.goto(`http://localhost:${PORT}/`);await p.waitForTimeout(2500);
 await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));await p.click('.tab[data-view="pet"]');await p.waitForTimeout(1200);
 const r=await p.evaluate(async st=>{document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove());window.__psNoIdle=true;document.querySelector(".ps-box").scrollIntoView({block:"center"});
  const out={float:[],ant:[]},SMALL=new Set(["bandana","wave","crown","shell","bow","rabbit","silvergrass"]);
  for(const id of PET_ART.HAT_IDS.filter(x=>x!=="none")){localStorage.setItem("tt_pet_hat",id);renderPet();await new Promise(r=>setTimeout(r,60));
   document.querySelectorAll("#petEmoji *").forEach(e=>e.getAnimations().forEach(a=>a.cancel()));
   const em=document.querySelector("#petEmoji"),h=(em.querySelector(".pr-head")||em.querySelector(".pc-egg")).getBoundingClientRect(),t=em.querySelector(".pc-hat").getBoundingClientRect();
   if(Math.min(t.bottom,h.bottom)-Math.max(t.top,h.top)<2)out.float.push(id);
   if(st===2&&SMALL.has(id)){const a=[...em.querySelectorAll(".pr-ant")].map(e=>e.getBoundingClientRect());const L=Math.min(...a.map(q=>q.left)),R=Math.max(...a.map(q=>q.right));if(t.left<L-1||t.right>R+1)out.ant.push(id);}}
  return out;},st);
 ok(r.float.length===0,`stage ${st}: every hat touches the head (floating: ${JSON.stringify(r.float)})`);
 if(st===2)ok(r.ant.length===0,`stage 2: bands, clips, rabbit ears and silvergrass sit between the antennae (sticking out: ${JSON.stringify(r.ant)})`);
 await ctx.close();}
ok(errs.length===0,"no page errors "+JSON.stringify(errs.slice(0,3)));
console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails);
await b.close();srv.kill();process.exit(fails?1:0);})().catch(e=>{console.error(e);process.exit(1);});
