// 山林夥伴舞台（2026-10 美化輪）：帽子、尺寸、2.5D 分層、行為、餵食動作、明信片／發現、3D 展示
// npm run test:all 會跑；截圖輸出到 scripts/tests/out/pst/（不進版控）
const __path=require("path"),__fs=require("fs");
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");
const O=__path.join(__dirname,"out","pst")+"/";__fs.mkdirSync(O,{recursive:true});
const MOCK=__fs.readFileSync(__dirname+"/soc-mock.js","utf8");const errs=[];let fails=0;const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m);if(!c)fails++;};
const PORT=8899;
(async()=>{const srv=spawn("python3",["-m","http.server",String(PORT)],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch();
const mk=async(o={})=>{const ctx=await b.newContext({viewport:{width:o.w||390,height:844},colorScheme:o.dark?"dark":"light",reducedMotion:o.reduce?"reduce":"no-preference"});const p=await ctx.newPage();await require(__dirname+"/fake-weather")(p);p.on("pageerror",e=>errs.push(e.message));
 await p.addInitScript(o=>{localStorage.setItem("tt_lang",o.lang||"zh");["tt_onboarded_v2","tt_coach_trail","tt_locperm_prompted","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_coach_team","tt_coach_pet"].forEach(k=>localStorage.setItem(k,"1"));
  localStorage.setItem("tt_debug_km",String(o.km||0));if(o.hat)localStorage.setItem("tt_pet_hat",o.hat);if(o.berries)localStorage.setItem("tt_pet_berry_bonus",String(o.berries));
  if(o.records)localStorage.setItem("tt_records",JSON.stringify(o.records));},o);
 await p.addInitScript(MOCK);await p.goto(`http://localhost:${PORT}/`);await p.waitForTimeout(2500);
 await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));await p.click('.tab[data-view="pet"]');await p.waitForTimeout(1500);
 await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));return p;};
const KM=[0,5,20,40,90,150,260];

// ── 第 0 階段：帽子跟角色同一組、不遮眼；尺寸 ──
{const p=await mk({km:40,hat:"straw"});
 const r=await p.evaluate(()=>{const out=[];const box=document.createElement("div");box.style.cssText="position:fixed;left:0;top:0;width:400px;height:400px";document.body.appendChild(box);
  for(let i=0;i<7;i++)for(const id of PET_ART.HAT_IDS.filter(h=>h!=="none")){box.innerHTML=PET_ART.svg(i,"",id);const sv=box.querySelector("svg");sv.style.cssText="width:400px;height:400px;animation:none";sv.querySelectorAll("*").forEach(e=>e.style.animation="none");
   const hat=sv.querySelector(".pc-hat");const grp=hat&&hat.parentElement.closest(".pc-bob,.pc-hover");const sameAsEyes=!!grp&&!!grp.querySelector(".pc-eye")||i===0;
   const hb=hat.getBoundingClientRect();let worst=0;sv.querySelectorAll(".pc-eye").forEach(e=>{const eb=e.getBoundingClientRect();const ox=Math.max(0,Math.min(hb.right,eb.right)-Math.max(hb.left,eb.left)),oy=Math.max(0,Math.min(hb.bottom,eb.bottom)-Math.max(hb.top,eb.top));worst=Math.max(worst,ox*oy/(eb.width*eb.height))});
   out.push({i,id,inGroup:!!grp,sameAsEyes,worst:+worst.toFixed(2)});}
  box.remove();return out;});
 ok(r.every(x=>x.inGroup&&x.sameAsEyes),"hat is drawn inside the head group for 7 stages × 5 hats");
 const bad=r.filter(x=>x.worst>0.15);ok(bad.length===0,"hat never covers >15% of an eye "+JSON.stringify(bad));
 ok(await p.evaluate(()=>!!document.querySelector("#petEmoji .pet-critter .pc-hat")&&!document.querySelector("#petEmoji > .pet-hat-svg")),"main card: hat inside critter svg, no separate overlay");
 const sz=await p.evaluate(()=>document.querySelector("#petEmoji .pet-critter").getBoundingClientRect().width);ok(sz>=150,"critter ≥150px wide ("+Math.round(sz)+")");
 const sil=await p.evaluate(()=>document.querySelector(".pet-evo-next .pet-critter")?.getBoundingClientRect().width||0);ok(sil>=36,"next-stage silhouette ≥36px ("+sil+")");
 await p.screenshot({path:O+"p0-card.png"});await p.close();}

console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails);await b.close();srv.kill();})();
