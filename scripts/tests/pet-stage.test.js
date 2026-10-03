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

// ── 第 1 階段：2.5D 分層舞台 ──
{const p=await mk({km:40});
 ok(await p.evaluate(()=>{const b=document.querySelector(".pet-card .ps-box");return !!b&&b.dataset.tod===PetStage.tod()&&b.dataset.season===PetStage.season()}),"stage box follows real time-of-day and season");
 ok(await p.evaluate(()=>["ps-sky","ps-far","ps-mid","ps-fx","ps-actor","ps-front"].every(c=>document.querySelector(".ps-box ."+c))),"six layers present");
 ok(await p.evaluate(()=>!!document.querySelector(".ps-actor #petEmoji .pet-critter")),"critter lives in the actor layer");
 // 7 階都有自己的遠景／中景／前景，而且真的畫得出東西
 const sc=await p.evaluate(()=>{const r=[];for(let i=0;i<7;i++){localStorage.setItem("tt_debug_km",String([0,5,20,40,90,150,260][i]));renderPet();const b=document.querySelector(".ps-box");
  r.push(b.dataset.stage==String(i)&&["ps-far","ps-mid","ps-front"].every(c=>b.querySelector("."+c+" svg").querySelectorAll("path,circle,rect,g").length>0));}return r;});
 ok(sc.every(Boolean),"every stage has far/mid/front art "+sc);
 // 時段、天氣強制指定
 const nt=await p.evaluate(()=>{window.__ps={tod:"night",season:"summer"};renderPet();return [document.querySelector(".ps-box").dataset.tod,document.querySelectorAll(".ps-star").length,document.querySelectorAll(".ps-fly").length]});
 ok(nt[0]==="night"&&nt[1]>=10&&nt[2]>0,"night: stars + fireflies "+nt);
 const rn=await p.evaluate(()=>{window.__ps={tod:"day",season:"spring",wx:"rain"};renderPet();return [document.querySelector(".ps-box").dataset.wx,document.querySelectorAll(".ps-rain").length,!!document.querySelector(".ps-skycloud")]});
 ok(rn[0]==="rain"&&rn[1]>=10&&rn[2],"rain: drops + clouds "+rn);
 ok(await p.evaluate(()=>PetStage.wxOf(61)==="rain"&&PetStage.wxOf(95)==="rain"&&PetStage.wxOf(3)==="cloud"&&PetStage.wxOf(73)==="snow"&&PetStage.wxOf(0)===""&&PetStage.wxOf(null)===""),"WMO code → stage weather");
 await p.evaluate(()=>{window.__ps=null;renderPet();});
 // 視差：手指移到右上 → --px 變正；離開 → 回到 0
 const bx=await p.evaluate(()=>{document.querySelector(".ps-box").scrollIntoView({block:"center"});const r=document.querySelector(".ps-box").getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height}});await p.waitForTimeout(300);
 await p.mouse.move(bx.x+bx.w*0.95,bx.y+bx.h*0.1);await p.waitForTimeout(700);
 const pv=await p.evaluate(()=>+getComputedStyle(document.querySelector(".ps-box")).getPropertyValue("--px"));ok(pv>0.5,"parallax follows pointer (--px "+pv+")");
 const tr=await p.evaluate(()=>[getComputedStyle(document.querySelector(".ps-far")).translate,getComputedStyle(document.querySelector(".ps-front")).translate]);
 ok(parseFloat(tr[1])<parseFloat(tr[0])&&parseFloat(tr[1])<0,"front layer moves further than far layer "+tr);
 await p.mouse.move(5,830);await p.waitForTimeout(1200);
 const pv2=await p.evaluate(()=>+getComputedStyle(document.querySelector(".ps-box")).getPropertyValue("--px"));ok(Math.abs(pv2)<0.08,"parallax eases back after leave ("+pv2+")");
 ok(await p.evaluate(()=>document.scrollingElement.scrollWidth<=innerWidth),"no horizontal overflow");
 await p.screenshot({path:O+"p1-stage.png"});await p.close();}
{const p=await mk({km:150,reduce:true});
 await p.evaluate(()=>{window.__ps={tod:"night",season:"spring",wx:"rain"};renderPet();});
 ok(await p.evaluate(()=>[...document.querySelectorAll(".ps-p")].every(e=>getComputedStyle(e).display==="none")),"reduced motion: no particles");
 const r=await p.evaluate(()=>{const b=document.querySelector(".ps-box").getBoundingClientRect();return {x:b.left+b.width*.9,y:b.top+20}});await p.mouse.move(r.x,r.y);await p.waitForTimeout(500);
 ok(await p.evaluate(()=>(getComputedStyle(document.querySelector(".ps-box")).getPropertyValue("--px").trim()||"0")==="0"),"reduced motion: no parallax");
 await p.close();}

// ── 第 2 階段：行為、互動分區、抱抱、眼睛、餵食動作、進化儀式 ──
{const p=await mk({km:40,records:[{id:"r1",date:new Date().toISOString(),trailName:"x",distanceKm:3}]});
 await p.evaluate(()=>document.querySelector(".ps-box").scrollIntoView({block:"center"}));
 const seen=new Set();for(let k=0;k<26;k++){await p.waitForTimeout(500);const c=await p.evaluate(()=>[...document.querySelector("#petEmoji").classList].filter(x=>x.startsWith("pb-")).join(",")+"|"+document.querySelector(".ps-box").style.getPropertyValue("--wx")+"|"+document.querySelector(".ps-box").style.getPropertyValue("--ex"));seen.add(c);}
 ok(seen.size>1,"idle behaviour runs on its own within 13s: "+[...seen].join(" / "));
 await p.close();}
{const p=await mk({km:40,berries:20});
 await p.evaluate(()=>{window.__psNoIdle=true;renderPet();document.querySelector(".ps-box").scrollIntoView({block:"center"})});await p.waitForTimeout(400);
 // 走動：位置、面向、走路 class；重繪後位置保留
 const w=await p.evaluate(async()=>{const pr=PetStage.walkTo(60);await new Promise(r=>setTimeout(r,200));const mid=document.querySelector("#petEmoji").classList.contains("pb-walk");await pr;
  const b=document.querySelector(".ps-box");return {mid,end:document.querySelector("#petEmoji").classList.contains("pb-walk"),wx:b.style.getPropertyValue("--wx"),face:b.style.getPropertyValue("--face")}});
 ok(w.mid&&!w.end&&+w.wx===60&&+w.face===1,"walk: moves, faces right, step class only while walking "+JSON.stringify(w));
 const wl=await p.evaluate(async()=>{await PetStage.walkTo(-40);return document.querySelector(".ps-box").style.getPropertyValue("--face")});ok(+wl===-1,"walk left faces left");
 ok(await p.evaluate(()=>{renderPet();const b=document.querySelector(".ps-box");return +b.style.getPropertyValue("--wx")===-40&&+b.style.getPropertyValue("--face")===-1}),"position & facing survive re-render");
 const ex=await p.evaluate(()=>{const r=document.querySelector("#petEmoji .pet-critter").getBoundingClientRect();return r.left+r.width*1.4});
 const ey=await p.evaluate(()=>{const r=document.querySelector("#petEmoji .pet-critter").getBoundingClientRect();return r.top+r.height*.4});
 await p.mouse.move(ex,ey);await p.waitForTimeout(300);
 ok(await p.evaluate(()=>+document.querySelector(".ps-box").style.getPropertyValue("--ex")>0.5),"eyes follow the finger");
 ok(await p.evaluate(async()=>{const pr=PetStage.act("hop");await new Promise(r=>setTimeout(r,100));const on=document.querySelector("#petEmoji").classList.contains("pb-hop");await pr;return on&&!document.querySelector("#petEmoji").classList.contains("pb-hop")}),"hop plays and clears");
 // 分區：點頭＝摸頭、點身體＝搔癢
 const head=await p.evaluate(()=>{const r=document.querySelector("#petEmoji .pet-critter").getBoundingClientRect();return {x:r.left+r.width/2,top:r.top+r.height*.25,low:r.top+r.height*.8}});
 await p.mouse.click(head.x,head.top);await p.waitForTimeout(120);
 ok(await p.evaluate(()=>document.querySelector("#petEmoji").classList.contains("pb-pat")),"tap head → pat");
 await p.waitForTimeout(900);await p.mouse.click(head.x,head.low);await p.waitForTimeout(120);
 ok(await p.evaluate(()=>document.querySelector("#petEmoji").classList.contains("pb-tickle")),"tap body → tickle");
 // 長按＝抱抱：每天第一次 +2 親密
 await p.waitForTimeout(900);const a0=await p.evaluate(()=>{localStorage.removeItem("tt_pet_hug_day");return +(localStorage.getItem("tt_pet_aff")||0)});
 await p.mouse.move(head.x,head.top);await p.mouse.down();await p.waitForTimeout(750);await p.mouse.up();await p.waitForTimeout(150);
 const h1=await p.evaluate(()=>({hug:document.querySelector("#petEmoji").classList.contains("pb-hug"),aff:+(localStorage.getItem("tt_pet_aff")||0),day:localStorage.getItem("tt_pet_hug_day")===todayStr(),t:document.getElementById("toast").textContent,pat:document.querySelector("#petEmoji").classList.contains("pb-pat")}));
 ok(h1.hug&&!h1.pat&&h1.day&&h1.aff===a0+2&&/親密/.test(h1.t),"long press → hug, +2 bond once, no pat "+JSON.stringify(h1));
 await p.waitForTimeout(1100);await p.mouse.down();await p.waitForTimeout(750);await p.mouse.up();await p.waitForTimeout(150);
 ok(await p.evaluate(a=>+(localStorage.getItem("tt_pet_aff")||0)===a,h1.aff)&&/^抱抱！$/.test(await p.evaluate(()=>document.getElementById("toast").textContent.trim())),"second hug same day: no extra bond");
 // 餵食：果實掉下來 → 走過去吃 → 結算
 await p.evaluate(()=>localStorage.removeItem("tt_pet_fed_t"));await p.evaluate(()=>renderPet());await p.waitForTimeout(300);
 const bal0=await p.evaluate(()=>berriesBalance());const x0=await p.evaluate(()=>PetStage.pos.x);
 await p.click("#petFeed");await p.waitForTimeout(350);
 const f1=await p.evaluate(()=>({berry:!!document.querySelector(".ps-box .ps-berry"),dis:document.getElementById("petFeed").disabled}));ok(f1.berry&&f1.dis,"feed: berry drops, button locked "+JSON.stringify(f1));
 await p.screenshot({path:O+"p2-feed-drop.png"});
 await p.waitForTimeout(1500);await p.screenshot({path:O+"p2-feed-eat.png"});
 ok(await p.evaluate(x=>PetStage.pos.x!==x,x0),"feed: critter walks to the berry");
 await p.waitForTimeout(2600);
 const f2=await p.evaluate(()=>({berry:!!document.querySelector(".ps-berry"),bal:berriesBalance(),t:document.getElementById("toast").textContent}));
 ok(!f2.berry&&f2.bal===bal0-3&&/吃得好開心/.test(f2.t),"feed: berry eaten, settled "+JSON.stringify(f2));
 // 進化儀式
 await p.evaluate(()=>celebrateEvolve(PET_STAGES[4],5));await p.waitForTimeout(1700);
 ok(await p.evaluate(()=>!!document.querySelector(".evolve-bg .ps-box.ps-bg[data-stage='4']")&&document.querySelectorAll(".evolve-burst i").length===16&&!!document.querySelector(".evolve-rays")),"evolve: new stage scene + rays + burst");
 await p.screenshot({path:O+"p2-evolve.png"});await p.click("#evolveOk");
 await p.close();}
{const p=await mk({km:40,berries:20,reduce:true});
 const bal0=await p.evaluate(()=>{localStorage.removeItem("tt_pet_fed_t");renderPet();return berriesBalance()});
 await p.click("#petFeed");await p.waitForTimeout(300);
 ok(await p.evaluate(b=>!document.querySelector(".ps-berry")&&berriesBalance()===b-3,bal0),"reduced motion: feed settles instantly, no berry animation");
 await p.close();}

console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails);await b.close();srv.kill();})();
