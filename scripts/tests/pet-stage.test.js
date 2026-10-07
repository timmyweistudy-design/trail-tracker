// 山林夥伴舞台（2026-10 美化輪）：帽子、尺寸、2.5D 分層、行為、餵食動作、明信片／發現、3D 展示
// npm run test:all 會跑；截圖輸出到 scripts/tests/out/pst/（不進版控）
const __path=require("path"),__fs=require("fs");
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");
const O=__path.join(__dirname,"out","pst")+"/";__fs.mkdirSync(O,{recursive:true});
const MOCK=__fs.readFileSync(__dirname+"/soc-mock.js","utf8");const errs=[];let fails=0;const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m);if(!c)fails++;};
const PORT = +process.env.TT_PORT || 8899;   // run-all 並行時會分配不重複的 port
(async()=>{const srv=spawn("python3",["-m","http.server",String(PORT)],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch();
const mk=async(o={})=>{const ctx=await b.newContext({viewport:{width:o.w||390,height:844},colorScheme:o.dark?"dark":"light",reducedMotion:o.reduce?"reduce":"no-preference"});const p=await ctx.newPage();await require(__dirname+"/fake-weather")(p);p.on("pageerror",e=>errs.push(e.message));
 await p.addInitScript(o=>{localStorage.setItem("tt_lang",o.lang||"zh");["tt_onboarded_v2","tt_coach_trail","tt_locperm_prompted","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_coach_team","tt_coach_pet"].forEach(k=>localStorage.setItem(k,"1"));
  localStorage.setItem("tt_debug_km",String(o.km||0));if(o.hat)localStorage.setItem("tt_pet_hat",o.hat);if(o.berries)localStorage.setItem("tt_pet_berry_bonus",String(o.berries));
  if(o.records)localStorage.setItem("tt_records",JSON.stringify(o.records));},o);
 if(o.free)await p.addInitScript(()=>{window.PERSONAL_MODE=false;localStorage.removeItem("tt_premium");});
 await p.addInitScript(MOCK);await p.goto(`http://localhost:${PORT}/`);await p.waitForTimeout(2500);
 await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));await p.click('.tab[data-view="pet"]');await p.waitForTimeout(1500);
 await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));return p;};
const KM=[0,5,20,40,90,150,260];
// 分組平行跑（2026-10-07 優化輪 #19）：PS_SHARD="i/n" 只跑第 i 組（每個最上層的測試區塊輪流分配；區塊彼此獨立、各開各的頁面）
const __SH=(process.env.PS_SHARD||"0/1").split("/").map(Number);let __blk=0;const sh=()=>(__blk++%__SH[1])===__SH[0];

// ── 第 0 階段：帽子跟角色同一組、不遮眼；尺寸 ──
if(sh()){const p=await mk({km:40,hat:"straw"});
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
if(sh()){const p=await mk({km:40});
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
if(sh()){const p=await mk({km:150,reduce:true});
 await p.evaluate(()=>{window.__ps={tod:"night",season:"spring",wx:"rain"};renderPet();});
 ok(await p.evaluate(()=>[...document.querySelectorAll(".ps-p")].every(e=>getComputedStyle(e).display==="none")),"reduced motion: no particles");
 const r=await p.evaluate(()=>{const b=document.querySelector(".ps-box").getBoundingClientRect();return {x:b.left+b.width*.9,y:b.top+20}});await p.mouse.move(r.x,r.y);await p.waitForTimeout(500);
 ok(await p.evaluate(()=>(getComputedStyle(document.querySelector(".ps-box")).getPropertyValue("--px").trim()||"0")==="0"),"reduced motion: no parallax");
 { const fr=await p.evaluate(async()=>{localStorage.removeItem("tt_pet_fed_t");renderPet();await new Promise(r=>setTimeout(r,200));let berries=0,walk=0;const t=setInterval(()=>{berries=Math.max(berries,document.querySelectorAll(".ps-berry").length);walk+=document.querySelector(".ps-box").classList.contains("walking")?1:0;},40);
   document.querySelector("#petFeed").click();await new Promise(r=>setTimeout(r,1500));clearInterval(t);return {berries,walk};});   /* 2026-10-07 優化輪 #13 */
   ok(fr.berries===0&&fr.walk===0,"reduced motion: feeding settles at once — no berries flying, no walking "+JSON.stringify(fr)); }
 await p.close();}

// ── 第 2 階段：行為、互動分區、抱抱、眼睛、餵食動作、進化儀式 ──
if(sh()){const p=await mk({km:40,records:[{id:"r1",date:new Date().toISOString(),trailName:"x",distanceKm:3}]});
 await p.evaluate(()=>document.querySelector(".ps-box").scrollIntoView({block:"center"}));
 const seen=new Set();for(let k=0;k<26;k++){await p.waitForTimeout(500);const c=await p.evaluate(()=>[...document.querySelector("#petEmoji").classList].filter(x=>x.startsWith("pb-")).join(",")+"|"+document.querySelector(".ps-box").style.getPropertyValue("--wx")+"|"+document.querySelector(".ps-box").style.getPropertyValue("--ex"));seen.add(c);}
 ok(seen.size>1,"idle behaviour runs on its own within 13s: "+[...seen].join(" / "));
 await p.close();}
if(sh()){const p=await mk({km:40,berries:20});
 await p.evaluate(()=>{window.__psNoIdle=true;renderPet();document.querySelector(".ps-box").scrollIntoView({block:"center"})});await p.waitForTimeout(400);
 // 走動：位置、面向、走路 class；重繪後位置保留
 // 角色固定在中間：沒有走動 class、沒有位移變數；跳和東張西望照樣會播
 const ctr=await p.evaluate(async()=>{for(const k of ["hop","look","stretch"])await PetStage.act(k);const em=document.querySelector("#petEmoji"),bx=document.querySelector(".ps-box"),c=em.querySelector(".pet-critter").getBoundingClientRect(),b=bx.getBoundingClientRect();
  return {walkApi:typeof PetStage.walkTo,wx:bx.style.getPropertyValue("--wx"),off:Math.abs((c.left+c.width/2)-(b.left+b.width/2))}});
 ok(ctr.walkApi==="undefined"&&!ctr.wx&&ctr.off<3,"critter stays centered, no walking "+JSON.stringify(ctr));
 const ex=await p.evaluate(()=>{const c=document.querySelector("#petEmoji .pet-critter"),r0=c.getBoundingClientRect(),k=(+c.dataset.pad||0)/(200+2*(+c.dataset.pad||0)),r={left:r0.left+r0.width*k,width:r0.width*(1-2*k)};return r.left+r.width*1.15});   // 角色在中間：1.15 倍寬還在卡片內（主角畫布四周留白不算）
 const ey=await p.evaluate(()=>{const r=document.querySelector("#petEmoji .pet-critter").getBoundingClientRect();return r.top+r.height*.4});
 await p.mouse.move(ex,ey);await p.waitForTimeout(300);
 const exv=await p.evaluate(()=>document.querySelector(".ps-box").style.getPropertyValue("--ex"));ok(+exv>0.5,"eyes follow the finger (--ex "+exv+")");
 ok(await p.evaluate(async()=>{const pr=PetStage.act("hop");await new Promise(r=>setTimeout(r,100));const on=document.querySelector("#petEmoji").classList.contains("pb-hop");await pr;return on&&!document.querySelector("#petEmoji").classList.contains("pb-hop")}),"hop plays and clears");
 // 分區：點頭＝摸頭、點身體＝搔癢
 const head=await p.evaluate(()=>{const c=document.querySelector("#petEmoji .pet-critter"),r0=c.getBoundingClientRect(),k=(+c.dataset.pad||0)/(200+2*(+c.dataset.pad||0)),r={left:r0.left+r0.width*k,top:r0.top+r0.height*k,width:r0.width*(1-2*k),height:r0.height*(1-2*k)};return {x:r.left+r.width/2,top:r.top+r.height*.25,low:r.top+r.height*.8}});   // 圖案本身的範圍（主角畫布四周留白不算）
 await p.mouse.click(head.x,head.top);await p.waitForTimeout(120);
 ok(await p.evaluate(()=>document.querySelector("#petEmoji").classList.contains("pb-pat")),"tap head → pat");
 await p.waitForTimeout(900);await p.mouse.click(head.x,head.low);await p.waitForTimeout(120);
 ok(await p.evaluate(()=>document.querySelector("#petEmoji").classList.contains("pb-tickle")),"tap body → tickle");
 // 長按＝抱抱：每天第一次 +2 親密
 await p.waitForTimeout(900);const a0=await p.evaluate(()=>{localStorage.removeItem("tt_pet_hug_day");return +(localStorage.getItem("tt_pet_aff")||0)});
 await p.mouse.move(head.x,head.top);await p.mouse.down();await p.waitForTimeout(750);await p.mouse.up();await p.waitForTimeout(150);
 const h1=await p.evaluate(()=>({hug:document.querySelector("#petEmoji").classList.contains("pb-hug"),aff:+(localStorage.getItem("tt_pet_aff")||0),day:localStorage.getItem("tt_pet_hug_day")===todayStr(),t:document.querySelector(".pet-card .pet-bubble").textContent,pat:document.querySelector("#petEmoji").classList.contains("pb-pat")}));
 ok(h1.hug&&!h1.pat&&h1.day&&h1.aff===a0+2&&/親密/.test(h1.t),"long press → hug, +2 bond once, no pat "+JSON.stringify(h1));
 await p.waitForTimeout(1100);await p.mouse.down();await p.waitForTimeout(750);await p.mouse.up();await p.waitForTimeout(150);
 ok(await p.evaluate(a=>+(localStorage.getItem("tt_pet_aff")||0)===a,h1.aff)&&/抱抱！.*今天已經抱過囉/.test(await p.evaluate(()=>document.querySelector(".pet-card .pet-bubble").textContent.trim())),"second hug same day: no extra bond, and it says so");
 // 餵食（2026-10-04）：一次扣三顆 → 掉三顆（隨機、彼此分開）→ 一顆一顆吃、餵食鈕上的數字一顆一顆減 → 結算
 await p.evaluate(()=>localStorage.removeItem("tt_pet_fed_t"));await p.evaluate(()=>renderPet());await p.waitForTimeout(300);
 const bal0=await p.evaluate(()=>berriesBalance());
 const shown0=await p.evaluate(()=>+(document.querySelector("#petFeed .feed-bal")||{}).textContent);
 await p.evaluate(()=>{window.__psBefore=document.querySelector(".ps-box");window.__psParts=[...document.querySelectorAll(".ps-p")].map(e=>e.style.left).join();});
 await p.click("#petFeed");await p.waitForTimeout(350);
 const f1=await p.evaluate(()=>{const bs=[...document.querySelectorAll(".ps-box .ps-berry")].map(b=>+b.style.getPropertyValue("--bx"));return {n:bs.length,st:+document.querySelector(".ps-box").dataset.stage,xs:bs,minGap:Math.min(...bs.flatMap((a,i)=>bs.slice(i+1).map(b=>Math.abs(a-b)))),dis:document.getElementById("petFeed").disabled};});
 ok(f1.n===3&&f1.minGap>=(f1.st===3||f1.st===4?16:34)&&f1.dis,"feed: three berries drop at separate spots (fox/tiger: lined up in front of the paws), button locked "+JSON.stringify(f1));
 await p.screenshot({path:O+"p2-feed-drop.png"});
 const seq=await p.evaluate(async()=>{const vals=[],steps=[],c0=document.querySelector("#petEmoji .pet-critter"),b=document.querySelector(".ps-box").getBoundingClientRect();let bite=false,off=0,feet=null,feetMove=0,wasOpen=false;const aims=[];
  for(let k=0;k<420;k++){const e=document.querySelector("#petFeed .feed-bal");if(e){const v=+e.textContent;if(vals[vals.length-1]!==v)vals.push(v);}
   const em=document.querySelector("#petEmoji");if(em){const top=["pb-lick","pb-gulp","pb-chew","pb-snap","st-open","st-lean"].find(k=>em.classList.contains(k));if(top&&steps[steps.length-1]!==top)steps.push(top);
    if(em.classList.contains("st-lean")){bite=true;const f={bottom:Math.max(...[...em.querySelectorAll(".pc-bob > .pr-paw")].map(e=>e.getBoundingClientRect().bottom))};feet=feet==null?f.bottom:feet;feetMove=Math.max(feetMove,Math.abs(f.bottom-feet));   /* 2026-10-06 第五輪：量前掌（趴著低頭時頭會低過腳，整個身體的外框不準） */}
    if(!em.classList.contains("st-open")&&wasOpen){const mc=PetWalk.cpt(document.querySelector(".ps-box"),"mouth");   // 嘴的接觸點對果實上緣——2026-10-06 第四輪：低頭的最後一段才張嘴，所以量「閉上嘴咬下」那一刻
     const bs=[...document.querySelectorAll(".ps-berry:not(.eaten)")].map(x=>{const q=x.getBoundingClientRect();return [q.left+q.width/2-mc[0],q.top+q.height*.32-mc[1]]}).sort((u,v)=>Math.hypot(...u)-Math.hypot(...v));if(bs[0])aims.push(bs[0].map(Math.round));}
    wasOpen=em.classList.contains("st-open");if(!em.classList.contains("st-lean"))feet=null;}
   if(!document.querySelector(".ps-berry"))break;await new Promise(r=>setTimeout(r,70));}
  return {vals,bite,steps:steps.join(">"),feetMove:+feetMove.toFixed(1),aims};});
 await p.screenshot({path:O+"p2-feed-eat.png"});
 ok(seq.vals.join()===[shown0,shown0-1,shown0-2,shown0-3].join(),"feed: the berry count on the button ticks down one per bite "+JSON.stringify(seq));
 ok(seq.bite&&seq.feetMove<1.5,"feed: leans down to eat, feet stay planted while eating "+JSON.stringify({feetMove:seq.feetMove}));
 ok(seq.aims.length===3&&seq.aims.every(([dx,dy])=>Math.abs(dx)<=8&&Math.abs(dy)<=8),"feed: walks over so the mouth is right on each berry when it bites (dx,dy px) "+JSON.stringify(seq.aims));
 ok(/st-lean>st-open>pb-snap>pb-chew>pb-gulp/.test(seq.steps),"feed: each berry = lean > open mouth > snap > chew > gulp "+seq.steps);
 const lick=await p.evaluate(async()=>{for(let k=0;k<80;k++){if(document.querySelector("#petEmoji.pb-lick"))return true;await new Promise(r=>setTimeout(r,50));}return false;});
 ok(lick,"feed: licks its lips after the last berry");
 await p.waitForFunction(()=>/吃得好開心/.test(document.querySelector(".pet-card .pet-bubble").textContent),null,{timeout:12000}).catch(()=>{});   // 走回中間、慶祝、愛心先冒、0.45 秒後才跳提示
 const f2=await p.evaluate(()=>({berry:!!document.querySelector(".ps-berry"),bal:berriesBalance(),t:document.querySelector(".pet-card .pet-bubble").textContent}));
 ok(!f2.berry&&f2.bal===bal0-3&&/吃得好開心/.test(f2.t),"feed: all three eaten, settled (−3) "+JSON.stringify(f2));

 ok(await p.evaluate(()=>Math.abs(parseFloat(document.querySelector(".ps-box").style.getPropertyValue("--wx"))||0)<1),"feed: walks back to the middle afterwards");
 const keep=await p.evaluate(()=>({same:document.querySelector(".ps-box")===window.__psBefore,parts:[...document.querySelectorAll(".ps-p")].map(e=>e.style.left).join()===window.__psParts,
  km:document.querySelector(".pet-chip .cv").textContent,feedDis:document.getElementById("petFeed").disabled,lbl:document.querySelector("#petFeed span").textContent}));
 ok(keep.same&&keep.parts&&keep.feedDis&&/小時後可餵/.test(keep.lbl),"after eating the card is updated in place: same stage element, particles untouched, button shows the cooldown "+JSON.stringify(keep));
 // 進化儀式
 await p.evaluate(()=>celebrateEvolve(PET_STAGES[4],5));await p.waitForTimeout(1700);
 ok(await p.evaluate(()=>!!document.querySelector(".evolve-bg .ps-box.ps-bg[data-stage='4']")&&document.querySelectorAll(".evolve-burst i").length===16&&!!document.querySelector(".evolve-rays")),"evolve: new stage scene + rays + burst");
 await p.screenshot({path:O+"p2-evolve.png"});await p.click("#evolveOk");
 await p.close();}
if(sh()){const p=await mk({km:40,berries:20,reduce:true});
 const bal0=await p.evaluate(()=>{localStorage.removeItem("tt_pet_fed_t");renderPet();return berriesBalance()});
 await p.click("#petFeed");await p.waitForTimeout(300);
 ok(await p.evaluate(b=>!document.querySelector(".ps-berry")&&berriesBalance()===b-3,bal0),"reduced motion: feed settles instantly, no berry animation");
 await p.close();}

// ── 第 4 階段（2026-10-04 改版）：明信片、走過的縣市、地區配件、舞台裝飾；PRO 閘門 ──
{const D=k=>{const d=new Date(Date.now()-k*864e5);d.setHours((k%4)===1?6:17,30,0,0);return d.toISOString()};
 const recs=[["osm-13164921",1],["osm-7605213",3],["osm-7605213",9],["forestry-002",5],["forestry-198",7],["forestry-062",11],["osm-14358020",13],["osm_path-內湖山登山路線-23.7153",15]].map(([id,k],i)=>({id:"j"+i,date:D(k),trailName:"x",trailId:id,distanceKm:3,ascent:100,durationMin:60}));
 const p=await mk({km:40,records:recs});
 const j=await p.evaluate(()=>({w:PetJourney.walked().map(e=>e.t.id+":"+e.n),reg:[...PetJourney.regions()].sort(),cty:PetJourney.counties().size,hats:PetJourney.regionHats().sort(),decor:PetJourney.decor(),speciesGone:typeof PetJourney.species==="undefined"}));
 console.log(JSON.stringify(j));
 ok(j.w.length===7&&j.w.includes("osm-7605213:2"),"walked: 7 unique trails, repeat counted");
 ok(j.reg.length===5&&j.hats.length===5&&j.cty===7,"5 regions, 7 counties, 5 regional hats");
 ok(j.decor.length===2,"decor: two most-walked themes ("+j.decor+")");
 ok(j.speciesGone,"「發現的生物」已移除");
 // 夥伴頁區塊：三格（明信片／縣市／配件），沒有生物
 const sec=await p.evaluate(()=>{const b=document.getElementById("petJourney");return {cards:b.querySelectorAll(".pj-strip .pj-card").length,ids:[...b.querySelectorAll(".pj-stat")].map(x=>x.id).join(","),cty:b.querySelector("#pjRegions b").textContent,txt:b.textContent}});
 ok(sec.cards===7&&sec.ids==="pjCards,pjRegions,pjHats"&&/^7/.test(sec.cty)&&!/生物/.test(sec.txt),"section: 7 postcards, counties 7/22, hats; no wildlife "+JSON.stringify({c:sec.cards,ids:sec.ids,cty:sec.cty}));
 // 天色跟第一次走的時段（清晨 6 點／傍晚 5 點半）
 ok(await p.evaluate(()=>{const a=[...document.querySelectorAll(".pj-strip .pj-art")].map(s=>s.querySelector("stop").getAttribute("stop-color"));return new Set(a).size>=2}),"postcard sky follows time of first walk");
 // 「新」小標：第一次用全部算看過；新走一條 → 出現新；打開相簿就消失
 ok(await p.evaluate(()=>!document.querySelector(".pj-new")),"first run: existing postcards not marked new");
 await p.evaluate(()=>{const r=Store.getRecords();r.unshift({id:"jn",date:new Date().toISOString(),trailName:"x",trailId:"forestry-004",distanceKm:2});Store.setRecords(r);renderPet();});
 const nw=await p.evaluate(()=>({n:document.querySelectorAll(".pj-strip .pj-new").length,dot:(document.querySelector(".pj-dot")||{}).textContent}));
 ok(nw.n===1&&nw.dot==="+1","new trail → one postcard marked 新, +1 badge "+JSON.stringify(nw));
 await p.evaluate(()=>document.getElementById("petJourney").scrollIntoView({block:"start"}));await p.waitForTimeout(300);await p.screenshot({path:O+"p4-journey.png"});
 // 相簿：依地區分組；開了就都算看過
 await p.click("#pjCards");await p.waitForTimeout(500);
 const al=await p.evaluate(()=>({groups:[...document.querySelectorAll(".pj-gh b")].map(x=>x.textContent),cards:document.querySelectorAll(".pj-grid .pj-card").length}));
 ok(al.groups.length===5&&al.cards===8,"album grouped by 5 regions, 8 cards "+JSON.stringify(al));
 await p.screenshot({path:O+"p4-album.png"});
 await p.click('.pj-seg .seg-btn[data-t="regions"]');await p.waitForTimeout(300);
 const rg=await p.evaluate(()=>({tiles:document.querySelectorAll(".pj-tile").length,on:document.querySelectorAll(".pj-tile.on").length,rows:document.querySelectorAll(".pj-rrow").length,rowsOn:document.querySelectorAll(".pj-rrow.on").length}));
 ok(rg.tiles===22&&rg.on===7&&rg.rows===5&&rg.rowsOn===5,"county map: 22 tiles, 7 lit (金瓜寮 also 新北); 5 region rows "+JSON.stringify(rg));
 await p.screenshot({path:O+"p4-regions.png"});
 await p.click("#pjClose");await p.waitForTimeout(400);
 ok(await p.evaluate(()=>!document.querySelector(".pj-new")),"opening the album clears 新");
 // 單張明信片：翻面、夥伴寫的話、看這條步道
 await p.evaluate(()=>document.querySelector(".pj-strip .pj-card").click());await p.waitForTimeout(400);
 await p.screenshot({path:O+"p4-card-front.png"});await p.waitForTimeout(1200);
 const cd=await p.evaluate(()=>({turned:document.querySelector(".pj-flip").classList.contains("turned"),note:document.querySelector(".pj-note").textContent,facts:document.querySelector(".pj-facts").textContent,pm:document.querySelector(".pj-back .pj-mark").textContent,stamp:!!document.querySelector(".pj-back .pj-stamp .pc-bob,.pj-back .pj-stamp .pc-hover")}));
 ok(cd.turned&&cd.note.length>8&&/次/.test(cd.facts)&&/km/.test(cd.facts)&&/\d{4}\.\d{2}\.\d{2}/.test(cd.pm)&&cd.stamp,"postcard flips to the back: note, postmark (date), stamp with the pet, times, km "+JSON.stringify(cd));
 await p.screenshot({path:O+"p4-card-back.png"});
 await p.click("#pjGo");await p.waitForTimeout(1200);
 ok(await p.evaluate(()=>!document.querySelector('[data-ov="pjcard"]')&&!!document.querySelector("#detailSheet.show, .sheet.show")),"「看這條步道」opens the trail detail");
 await p.evaluate(()=>document.querySelectorAll(".sheet.show, .sheet-mask.show").forEach(x=>x.classList.remove("show")));
 // 地區配件：PRO 可戴；推出來的不寫進存檔
 await p.evaluate(()=>{document.querySelector('.tab[data-view="pet"]').click();document.getElementById("petCard").scrollIntoView();});await p.waitForTimeout(400);
 await p.click("#petDress");await p.waitForTimeout(500);
 ok(await p.evaluate(()=>["silvergrass","maple","pineapple","wave","shell"].every(h=>!document.querySelector(`.hat-opt[data-hat="${h}"]`).classList.contains("locked"))),"PRO: regional hats unlocked in picker");
 await p.click('.hat-opt[data-hat="maple"]');await p.waitForTimeout(400);
 ok(await p.evaluate(()=>localStorage.getItem("tt_pet_hat")==="maple"&&!!document.querySelector("#petEmoji .pc-hat")&&!(localStorage.getItem("tt_pet_hats_owned")||"").includes("maple")),"wear maple; derived hats not persisted");
 await p.close();}
// 免費版：旅行區只是說明卡、點了開升級面板；地區配件標 PRO；舞台沒有主題裝飾；戴著的地區配件不顯示
{const recs=[{id:"f1",date:new Date().toISOString(),trailName:"x",trailId:"osm-13164921",distanceKm:3},{id:"f2",date:new Date(Date.now()-864e5).toISOString(),trailName:"x",trailId:"osm-13164921",distanceKm:3}];
 const p=await mk({km:40,free:true,records:recs,hat:"maple"});
 const f=await p.evaluate(()=>({pro:Premium.isOn(),locked:!!document.querySelector("#petJourney .pj-locked"),strip:!!document.querySelector("#petJourney .pj-strip"),decor:document.querySelector(".ps-box").dataset.decor||"",hat:!!document.querySelector("#petEmoji .pc-hat")}));
 ok(!f.pro&&f.locked&&!f.strip&&!f.decor&&!f.hat,"free: teaser only, no decor, regional hat not worn "+JSON.stringify(f));
 await p.click("#pjPro");await p.waitForTimeout(600);
 ok(await p.evaluate(()=>!!document.querySelector('.premium-mask')),"free: tapping the teaser opens the upgrade panel");
 await p.screenshot({path:O+"p4-free.png"});
 await p.evaluate(()=>document.querySelectorAll('[data-ov], .premium-mask').forEach(x=>x.remove()));
 await p.evaluate(()=>PetJourney.openAlbum("cards"));await p.waitForTimeout(300);
 ok(await p.evaluate(()=>!document.querySelector('[data-ov="pjalbum"]')),"free: album cannot be opened directly");
 await p.evaluate(()=>document.querySelectorAll('[data-ov], .premium-mask').forEach(x=>x.remove()));
 await p.click("#petDress");await p.waitForTimeout(500);
 ok(await p.evaluate(()=>{const b=document.querySelector('.hat-opt[data-hat="silvergrass"]');return b.classList.contains("locked")&&!!b.querySelector(".pro-tag")}),"free: regional hat shows PRO");
 await p.close();}
if(sh()){const p=await mk({km:40,lang:"en",records:[{id:"e1",date:new Date().toISOString(),trailName:"x",trailId:"forestry-002",distanceKm:3}]});
 await p.waitForTimeout(800);
 const t=await p.evaluate(()=>[document.getElementById("petJourney").textContent,document.querySelector("#petJourney .pj-stats").textContent]);
 ok(/Buddy's Travels/.test(t[0])&&/Postcards/.test(t[1])&&/Counties walked/.test(t[1])&&!/[一-鿿]/.test(t[1]),"English journey section translated: "+t[1].replace(/\s+/g," ").slice(0,90));
 await p.evaluate(()=>PetJourney.openAlbum("regions"));await p.waitForTimeout(400);
 ok(await p.evaluate(()=>[...document.querySelectorAll(".pj-tile")].every(x=>/^[A-Z]{3}$/.test(x.textContent))),"English county map uses ISO codes");
 await p.close();}

// ── 美工輪 第 1 階段：明信片插畫（7 主題 × 3 構圖、時段、季節） ──
if(sh()){const p=await mk({km:40});
 const r=await p.evaluate(()=>{const th=Object.keys(PostcardArt.THEMES),bad=[],sizes=[];let n=0;const t0=performance.now();
  for(const t of th)for(let v=0;v<3;v++)for(const tod of ["dawn","day","dusk","night"]){const s=PostcardArt.draw("x"+t+v,t,"2026-07-10T10:00:00",{variant:v,tod});n++;sizes.push(s.length);if(/NaN|undefined/.test(s))bad.push(t+v+tod);}
  const ms=(performance.now()-t0)/n;
  const norm=x=>x.replace(/id="[^"]+"|url\(#[^)]+\)/g,"");const same=norm(PostcardArt.draw("forestry-002","old","2026-03-01T06:00:00"))===norm(PostcardArt.draw("forestry-002","old","2026-03-01T06:00:00"));
  const ids=["a1","b2","c3","d4","e5","f6"].map(i=>PostcardArt.draw(i,"fall","2026-07-10T10:00:00").replace(/id="[^"]+"|url\(#[^)]+\)/g,""));
  return {n,bad,max:Math.max(...sizes),ms:+ms.toFixed(2),same,distinct:new Set(ids).size};});
 ok(r.n===84&&r.bad.length===0,"84 postcard renders, no NaN/undefined "+JSON.stringify(r.bad));
 ok(r.max<40000&&r.ms<15,"postcard size & speed budget (max "+r.max+" chars, "+r.ms+" ms each)");
 ok(r.same&&r.distinct>=3,"same trail → same card; different trails vary ("+r.distinct+"/6 distinct)");
 await p.close();}

// ── 美工輪 第 2 階段：舞台背景（StageArt） ──
if(sh()){const p=await mk({km:40});
 const r=await p.evaluate(()=>{const bad=[];let n=0,max=0;const t0=performance.now();
  for(let i=0;i<7;i++)for(const tod of ["dawn","day","dusk","night"])for(const d of [[],["fall","old"],["sea","lake"],["forest"]]){const o=StageArt.scene(i,tod,"autumn",d);n++;const s=o.far+o.mid+o.front;max=Math.max(max,s.length);if(/NaN|undefined/.test(s))bad.push(i+tod+d);}
  return {n,bad,max,ms:+((performance.now()-t0)/n).toFixed(2)};});
 ok(r.n===112&&r.bad.length===0,"112 stage scenes, no NaN/undefined "+JSON.stringify(r.bad.slice(0,3)));
 ok(r.max<60000&&r.ms<10,"stage scene size & speed budget (max "+r.max+" chars, "+r.ms+" ms)");
 await p.close();}

// ── 美工輪 第 3 階段：角色（外框＋明暗＋眼睛＋表情＋小尺寸） ──
if(sh()){const p=await mk({km:40});
 const r=await p.evaluate(async()=>{const a=PET_ART.svg(3),b=PET_ART.svg(3);const ida=(a.match(/id="([^"]+)"/)||[])[1],idb=(b.match(/id="([^"]+)"/)||[])[1];
  const sizes=[0,1,2,3,4,5,6].map(i=>PET_ART.svg(i,"","straw").length);
  const imgs=await Promise.all([0,1,2,3,4,5,6].map(i=>new Promise(res=>{const im=new Image();im.onload=()=>res(im.width===120);im.onerror=()=>res(false);im.src=PET_ART.dataUri(i,120,"maple")})));
  const host=document.createElement("div");document.body.appendChild(host);const t0=performance.now();host.innerHTML=Array.from({length:40},()=>PET_ART.svg(6,"","straw")).join("");host.getBoundingClientRect();const ms=(performance.now()-t0)/40;host.remove();
  return {uniq:ida&&idb&&ida!==idb,leftover:/§/.test(a+b),max:Math.max(...sizes),imgs,ms:+ms.toFixed(2)};});
 ok(r.uniq&&!r.leftover,"each SVG copy gets its own ids, no § left");
 // 2026-10-04 龍重畫：東方龍要有鬃、鬚、鹿角、背鰭、鱗才像龍，預算 12K→24K；另外量實際插進頁面的時間（列表一次畫很多隻）
 // 2026-10-04 走過去吃：狐、虎多了一份側身站姿（四條有關節的腿＋脖子＋同一顆頭），預算 24K→40K；插入時間照量
 ok(r.max<60000&&r.ms<10,"character SVG size & speed budget (max "+r.max+" chars, "+r.ms+" ms per dragon)");
 ok(r.imgs.every(Boolean),"dataUri (share cards / widgets) loads for 7 stages with hat");
 await p.evaluate(()=>{window.__psNoIdle=true;renderPet();document.querySelector(".ps-box").scrollIntoView({block:"center"})});
 const hb=await p.evaluate(()=>{const sv=document.querySelector("#petEmoji .pet-critter"),c=sv.getBoundingClientRect(),k=(+sv.dataset.pad||0)/(200+2*(+sv.dataset.pad||0));return {x:c.left+c.width/2,y:c.top+c.height*(k+(1-2*k)*.25)}});   // 圖案本身的 25% 高（主角畫布四周留白不算）
 await p.mouse.click(hb.x,hb.y);await p.waitForTimeout(150);
 const ex=await p.evaluate(()=>({eh:getComputedStyle(document.querySelector("#petEmoji .pc-eh")).display,eye:getComputedStyle(document.querySelector("#petEmoji .pc-eye")).display}));
 ok(ex.eh!=="none"&&ex.eye==="none","pat → happy ^^ eyes replace open eyes "+JSON.stringify(ex));
 await p.waitForTimeout(900);
 ok(await p.evaluate(()=>getComputedStyle(document.querySelector("#petEmoji .pc-eh")).display==="none"),"happy eyes go away after the reaction");
 const lod=await p.evaluate(()=>{const big=document.querySelector("#petEmoji .pc-d"),sm=document.querySelector(".pet-evo-next .pc-d");return {big:big&&getComputedStyle(big).display,sm:sm?getComputedStyle(sm).display:"none"}});
 ok(lod.big!=="none"&&lod.sm==="none","details shown on the big critter, hidden in the small silhouette "+JSON.stringify(lod));
 await p.screenshot({path:O+"p3-chars-card.png"});
 await p.close();}

// ── debug 面板：夥伴舞台與旅行 ──
if(sh()){const p=await mk({km:40});
 await p.evaluate(()=>ensureScript("js/debug.js"));await p.waitForTimeout(300);
 const r=await p.evaluate(()=>{ttDebug.stage("tod","night");ttDebug.stage("wx","rain");const a=[document.querySelector(".ps-box").dataset.tod,document.querySelector(".ps-box").dataset.wx];
  ttDebug.stage(null);const b=document.querySelector(".ps-box").dataset.tod===PetStage.tod()&&!document.querySelector(".ps-box").dataset.wx;
  ttDebug.allRegions();ttDebug.addTheme("瀑布");ttDebug.addRandomTrail();
  const j={regs:PetJourney.regions().size,decor:PetJourney.decor(),cards:PetJourney.walked().length,hug:(ttDebug.resetHug(),localStorage.getItem("tt_pet_hug_day"))};
  ttDebug.clearHikes();return {a,b,j,after:PetJourney.walked().length};});
 ok(r.a[0]==="night"&&r.a[1]==="rain"&&r.b,"debug: force night+rain, then back to real "+JSON.stringify(r.a));
 ok(r.j.regs===5&&r.j.decor[0]==="fall"&&r.j.cards>=6&&r.j.hug===null,"debug: all regions, waterfall decor, postcards, hug reset "+JSON.stringify(r.j));
 ok(r.after===0,"debug: clear test trails removes postcards");
 await p.close();}

// ── 2026-10-04 角色重畫：結構檢查（id 引用、畫框、開心眼對位、動畫掛點）、分享圖卡不畫瞇眼、幼蟲的頭在下半部 ──
if(sh()){const p=await mk({km:5});
 const r=await p.evaluate(async()=>{const out=[],h=document.createElement("div");document.body.appendChild(h);
  for(let i=0;i<7;i++)for(const hat of PET_ART.HAT_IDS){const s=PET_ART.svg(i,"",hat);if(/NaN|undefined|Infinity/.test(s))out.push([i,hat,"NaN"]);
   h.innerHTML=s;const sv=h.firstChild;sv.style.cssText="width:200px;height:200px;animation:none";sv.querySelectorAll("*").forEach(e=>e.style.animation="none");
   const ids=new Set([...sv.querySelectorAll("[id]")].map(e=>e.id));for(const m of s.matchAll(/(?:url\(#|href="#)([^)"]+)/g))if(!ids.has(m[1]))out.push([i,hat,"dangling "+m[1]]);
   if(hat==="none"){const bb=[...sv.children].reduce((a,c)=>{if(!c.getBBox)return a;const x=c.getBBox();return [Math.min(a[0],x.x),Math.min(a[1],x.y),Math.max(a[2],x.x+x.width),Math.max(a[3],x.y+x.height)]},[999,999,-999,-999]);
    if(bb[0]<-2||bb[1]<-2||bb[2]>202||bb[3]>202)out.push([i,"out of frame",bb.map(Math.round)]);
    const vis=e=>!e.closest(".pr-stand");const eyes=[...sv.querySelectorAll(".pc-eye")].filter(vis),ehs=[...sv.querySelectorAll(".pc-eh")].filter(vis);if(eyes.length!==ehs.length||(i>0&&eyes.length!==2))out.push([i,"eye count"]);
    ehs.forEach(e=>e.style.display="inline");eyes.forEach((e,k)=>{const a=e.getBBox(),c=ehs[k].getBBox();if(Math.abs(a.x+a.width/2-c.x-c.width/2)>2)out.push([i,"happy eye misaligned"])});
    for(const c of ["pc-bob","pc-hover","pc-tail","pc-wing","pc-sway","pc-tw"])sv.querySelectorAll("."+c).forEach(e=>{if(!e.getBBox().width)out.push([i,"empty "+c])});}}
  h.remove();
  const load=src=>new Promise(r=>{const im=new Image();im.onload=()=>r(im);im.src=src});const cv=document.createElement("canvas");cv.width=cv.height=200;const g=cv.getContext("2d");
  const px=async src=>{g.clearRect(0,0,200,200);g.drawImage(await load(src),0,0);return g.getImageData(0,0,200,200).data};
  const shown=[];for(let i=1;i<7;i++){const a=await px(PET_ART.dataUri(i,200)),hid=PET_ART.dataUri(i,200);const vbx=(/viewBox="([^"]+)"/.exec(decodeURIComponent(hid))||[,"0 0 200 200"])[1];const b2=await px("data:image/svg+xml;charset=utf-8,"+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="${vbx}"><style>.pc-eh,.pc-eye{}.pc-eh{display:none!important}</style>`+decodeURIComponent(hid.split(",")[1]).replace(/^<svg[^>]*>/,"")));
   let d=0;for(let k=0;k<a.length;k+=4)if(Math.abs(a[k]-b2[k])>40)d++;shown.push(d)}
  const c=document.querySelector("#petEmoji .pet-critter").getBoundingClientRect();
  return {out,shown,zone:[PetStage.zoneOf(c.top+c.height*.6),PetStage.zoneOf(c.top+c.height*.8)]};});
 ok(r.out.length===0,"7 stages × 11 hats: no dangling ids, in frame, happy eyes aligned, animation hooks not empty "+JSON.stringify(r.out.slice(0,5)));
 ok(r.shown.every(n=>n<5),"share card (dataUri) does not draw the happy ^^ eyes over the open eyes "+r.shown);
 ok(r.zone[0]==="pat"&&r.zone[1]==="tickle","larva: tapping its head (lower half of the picture) pats, tapping its body tickles "+r.zone);
 await p.close();}

// ── 2026-10-04 第二輪（使用者：不能飄、腳下的葉子／雲不能跟著跳、帽子戴在頭上）──
if(sh())for(const [km,st] of [[5,1],[260,6]]){const p=await mk({km});
 const r=await p.evaluate(async()=>{const pr=document.querySelector("#petEmoji .pet-prop"),c=document.querySelector("#petEmoji .pet-critter");if(!pr)return {none:true};
  const b0=pr.getBoundingClientRect(),c0=c.getBoundingClientRect();document.querySelector("#petEmoji").classList.add("pb-hop");await new Promise(r=>setTimeout(r,380));
  const b1=pr.getBoundingClientRect(),c1=c.getBoundingClientRect();const moved=Math.abs(c1.top-c0.top)+Math.abs(c1.left-c0.left)+Math.abs(c1.height-c0.height)+Math.abs(Math.atan2(0,1));
  const style=getComputedStyle(c).transform;return {prop:Math.abs(b1.top-b0.top)+Math.abs(b1.left-b0.left),anim:style!=="none"}});
 ok(!r.none&&r.prop<.5&&r.anim,"stage "+st+": the leaf/cloud under the pet stays put while the pet moves "+JSON.stringify(r));
 await p.close();}
if(sh()){const p=await mk({km:40});
 const r=await p.evaluate(async()=>{window.__psNoIdle=true;const em0=document.querySelector("#petEmoji");em0.className=em0.className.replace(/\bpb-\S+/g,"");await new Promise(r=>setTimeout(r,1500));   // 只量呼吸：關掉隨機動作（伸懶腰會抬前腳，那是故意的）
  const g=document.querySelector("#petEmoji .pc-bob");let lo=1e9,hi=-1e9;for(let k=0;k<12;k++){const b=g.getBoundingClientRect();lo=Math.min(lo,b.bottom);hi=Math.max(hi,b.bottom);await new Promise(r=>setTimeout(r,300));}return hi-lo;});
 ok(r<1,"fox idle: feet stay on the ground (bottom moves "+r.toFixed(2)+"px over 3.6 s)");
 await p.close();}
if(sh()){const p=await mk({km:5,hat:"straw"});
 ok(await p.evaluate(()=>{const s=PET_ART.svg(1,"","straw"),n=PET_ART.svg(1);return !/f29a3a/.test(s)&&/f29a3a/.test(n)}),"larva: the osmeterium is removed when wearing a hat (hat sits on the head)");
 await p.close();}

// ── 2026-10-04 明信片定格：郵票是「第一次去的時候」的夥伴，之後進化也不變；郵戳每趟一個、角度固定 ──
if(sh()){const p=await mk({km:0,hat:"straw"});
 const r=await p.evaluate(()=>{const t=TRAILS.find(x=>x.region&&tagsOf(x)[0]);const add=(days,km)=>{const d=new Date();d.setDate(d.getDate()-days);Store.addRecord({id:"dbg"+Math.random(),date:d.toISOString(),dbg:true,trailId:t.id,trailName:t.name,distanceKm:km,elapsedMs:3600e3,ascent:50,descent:50,steps:100,kcal:10,track:[]})};
  const u=TRAILS.find(x=>x.region&&x.id!==t.id);const addU=(days,km)=>{const d=new Date();d.setDate(d.getDate()-days);Store.addRecord({id:"dbg"+Math.random(),date:d.toISOString(),dbg:true,trailId:u.id,trailName:u.name,distanceKm:km,elapsedMs:3600e3,ascent:50,descent:50,steps:100,kcal:10,track:[]})};
  addU(90,4);add(60,20);add(20,2);   // 90 天前累積 4 km＝幼蟲；60 天前累積 24 km＝彩蝶
  const e=()=>PetJourney.walked().find(x=>x.t.id===t.id),eu=()=>PetJourney.walked().find(x=>x.t.id===u.id);
  const a1=PetJourney.snapOf(e()),b1=PetJourney.snapOf(eu());localStorage.setItem("tt_debug_km","300");   // 進化到最終型態
  const a2=PetJourney.snapOf(e());const html1=document.createElement("div");
  return {a1:[a1.s,a1.h],b1:[b1.s,b1.h],a2:[a2.s],marks:e().dates.length,same:PetJourney.snapOf(e()).s===a1.s};});
 ok(r.b1[0]===1&&r.a1[0]===2&&r.a1[1]==="none","old trips are back-dated by the km walked up to that day (larva 90 days ago, butterfly 60 days ago) "+JSON.stringify(r));
 ok(r.a2[0]===2&&r.same,"after the pet evolves, old postcards keep the pet as it was "+JSON.stringify(r));
 const r2=await p.evaluate(async()=>{const w=new Set(PetJourney.walked().map(e=>e.t.id));const t=TRAILS.find(x=>x.region&&!w.has(x.id));const d=new Date();Store.addRecord({id:"dbg"+Math.random(),date:d.toISOString(),dbg:true,trailId:t.id,trailName:t.name,distanceKm:3,elapsedMs:3600e3,ascent:50,descent:50,steps:100,kcal:10,track:[]});
  const e=PetJourney.walked().find(x=>x.t.id===t.id);const s=PetJourney.snapOf(e);return {s:s.s,h:s.h,cur:petStageIndex(totalKm())};});
 ok(r2.s===r2.cur&&r2.h==="straw","a new postcard stamps the pet as it is now, hat included "+JSON.stringify(r2));
 await p.close();}

// ── 2026-10-04 動作優化：骨架、嘴、帽子跟著頭、小圖與分享圖卡不受影響 ──
if(sh()){const p=await mk({km:40,hat:"straw"});
 const r=await p.evaluate(()=>{const out={};const d=document.createElement("div");document.body.appendChild(d);
  for(let i=1;i<7;i++){d.innerHTML=PET_ART.svg(i,"","straw");const q=k=>d.querySelector(k);out[i]={head:!!q(".pr-head"),mouth:i===0||!!q(".pr-mouth .m-c")&&!!q(".pr-mouth .m-o"),hatInHead:!!q(".pr-head .pc-hat"),eyesInHead:[...d.querySelectorAll(".pr-head .pc-eye")].filter(e=>!e.closest(".pr-stand")).length===2};}
  d.remove();return out;});
 ok(Object.values(r).every(o=>o.head&&o.mouth&&o.hatInHead&&o.eyesInHead),"rig: 6 stages have a head (eyes + hat inside) and a mouth with closed/open states "+JSON.stringify(r));
 const m=await p.evaluate(()=>{const o=document.querySelector("#petEmoji .m-o"),c=document.querySelector("#petEmoji .m-c");return {o:getComputedStyle(o).opacity,c:getComputedStyle(c).opacity};});
 ok(m.o==="0"&&m.c==="1","at rest only the closed mouth shows "+JSON.stringify(m));
 const lean=await p.evaluate(async()=>{const em=document.querySelector("#petEmoji"),h=em.querySelector(".pc-hat").getBoundingClientRect(),f=em.querySelector(".pc-bob").getBoundingClientRect();
  em.classList.add("st-lean","st-open");await new Promise(r=>setTimeout(r,600));const h2=em.querySelector(".pc-hat").getBoundingClientRect(),f2=em.querySelector(".pc-bob").getBoundingClientRect(),o=getComputedStyle(em.querySelector(".m-o")).opacity;
  em.classList.remove("st-lean","st-open");return {hatDown:+(h2.top-h.top).toFixed(1),feet:+Math.abs(f2.bottom-f.bottom).toFixed(1),open:o};});
 ok(lean.hatDown>5&&lean.feet<1&&lean.open==="1","leaning: the hat goes down with the head, feet stay, mouth opens "+JSON.stringify(lean));
 const share=await p.evaluate(()=>/\.m-o,\.m-t,\.m-p,\.pr-ext,\.pr-legs,\.pc-crack2,\.pc-crack3\{display:none\}/.test(decodeURIComponent(PET_ART.dataUri(3,120))));
 ok(share,"share cards (no stylesheet) always draw the closed mouth");
 await p.close();}
if(sh()){const p=await mk({km:40,reduce:true});
 const r=await p.evaluate(async()=>{const em=document.querySelector("#petEmoji");em.classList.add("pb-pat");await new Promise(r=>setTimeout(r,250));const t=getComputedStyle(em.querySelector(".pr-head")).animationName;em.classList.remove("pb-pat");return t;});
 ok(r==="none","reduced motion: no part animation ("+r+")");
 await p.close();}

// ── 2026-10-05 餵食骨架：咬下那一刻嘴真的碰到果實（果實不再自己飛過去）、走路時地上的果實不動、一次只標一顆、最多轉身兩次 ──
if(sh())for(const [km,st] of [[5,1],[40,3],[90,4],[260,6]]){const p=await mk({km});
 await p.evaluate(()=>{localStorage.removeItem("tt_pet_fed_t");renderPet();});await p.waitForTimeout(300);
 await p.evaluate(()=>document.querySelector(".ps-box").scrollIntoView());await p.click("#petFeed");
 const r=await p.evaluate(async()=>{const bite=[],seen=new Set();let moved=0,prev=null,maxTarget=0,dirs=[],lastX=null;const t0=performance.now();
  while(performance.now()-t0<30000){const box=document.querySelector(".ps-box");const bs=[...document.querySelectorAll(".ps-berry")];
   for(const b of bs)if((b.classList.contains("eaten")||b.classList.contains("held"))&&!seen.has(b)){seen.add(b);   /* 2026-10-06 第四輪：狐虎咬住後果實先交給嘴（held）、抬頭途中才吞（eaten）——量嘴第一次接手那一刻 */bite.push([Math.round(parseFloat(b.style.getPropertyValue("--tx"))||0),Math.round(parseFloat(b.style.getPropertyValue("--ty"))||0)]);}
   maxTarget=Math.max(maxTarget,bs.filter(b=>b.classList.contains("target")&&!b.classList.contains("eaten")).length);
   if(box.classList.contains("walking")){const pos=bs.filter(b=>!b.classList.contains("eaten")&&!b.classList.contains("held")).map(b=>{const q=b.getBoundingClientRect();return Math.round(q.left)+","+Math.round(q.top)});if(prev&&prev.length===pos.length&&pos.some((x,i)=>x!==prev[i]))moved++;prev=pos;
   }else prev=null;
   {const fv=parseFloat(box.style.getPropertyValue("--face"))||0,d=box.classList.contains("standing")?(box.classList.contains("face-r")?1:-1):(Math.abs(fv)>8?Math.sign(fv):0);if(d&&dirs[dirs.length-1]!==d)dirs.push(d);}   // 面朝哪邊（小碎步往後退不算轉身）
   if(!bs.length&&bite.length)break;await new Promise(r=>setTimeout(r,25));}
  return {bite,moved,maxTarget,turns:Math.max(0,dirs.length-1)};});
 ok(r.bite.length===3&&r.bite.every(([x,y])=>Math.hypot(x,y)<=10),"stage "+st+": the mouth touches the berry when it bites (berry moves ≤10px into the mouth; 2026-10-05 咬的是果實上緣，最後一口果實中心要再往上移約 18% 才進嘴) "+JSON.stringify(r.bite));
 ok(r.moved===0,"stage "+st+": berries on the ground never move while the pet walks ("+r.moved+")");
 ok(r.maxTarget===1,"stage "+st+": exactly one berry is marked as the one being eaten");
 ok(r.turns<=2,"stage "+st+": eats in one sweep, turns around at most twice ("+r.turns+")");
 await p.close();}

// ── 2026-10-05 蛋、蝶：蛋不走路、果實化成光點飛進裂縫；蝶落在果實旁、腳尖踩地、口器彎過去吸（尖端在果實上） ──
if(sh())for(const [km,st] of [[0,0],[20,2]]){const p=await mk({km,berries:20});
 await p.evaluate(()=>{window.__psNoIdle=true;localStorage.removeItem("tt_pet_fed_t");renderPet();document.querySelector(".ps-box").scrollIntoView({block:"center"});});await p.waitForTimeout(300);await p.click("#petFeed");
 const r=await p.evaluate(async()=>{const out={xs:[],tips:[],feet:[],sparks:[],sparkGap:[],wx:new Set(),face:0,moved:0};const seen=new Set();let prev=null;const t0=performance.now();
  while(performance.now()-t0<30000){const box=document.querySelector(".ps-box"),em=document.querySelector("#petEmoji"),bs=[...document.querySelectorAll(".ps-berry")];
   if(!out.xs.length&&bs.length)out.xs=bs.map(b=>+b.style.getPropertyValue("--bx"));
   out.wx.add(parseFloat(box.style.getPropertyValue("--wx"))||0);out.face=Math.max(out.face,Math.abs(parseFloat(box.style.getPropertyValue("--face"))||0));
   if(box.classList.contains("walking")){const pos=bs.filter(b=>!b.classList.contains("sipped")).map(b=>{const q=b.getBoundingClientRect();return Math.round(q.left)+","+Math.round(q.top)});if(prev&&prev.length===pos.length&&pos.some((x,i)=>x!==prev[i]))out.moved++;prev=pos;}else prev=null;
   const tb=bs.find(b=>b.classList.contains("target"));
   if(tb&&em.classList.contains("pb-sip")&&!seen.has(tb)){seen.add(tb);await new Promise(r=>setTimeout(r,120));   // 口器一圈一圈攤開要 0.42 秒，開始吸（pb-sip）時才量
    const ext=em.querySelector(".pr-ext"),pt=ext.getPointAtLength(ext.getTotalLength()),sp=new DOMPoint(pt.x,pt.y).matrixTransform(ext.getScreenCTM()),q=tb.getBoundingClientRect();out.tips.push(+Math.hypot(sp.x-(q.left+q.width/2),sp.y-(q.top+q.height/2)).toFixed(1));
    let lo=-1e9;em.querySelectorAll(".pr-legs path").forEach(l=>{const pp=l.getPointAtLength(l.getTotalLength()),s2=new DOMPoint(pp.x,pp.y).matrixTransform(l.getScreenCTM());lo=Math.max(lo,s2.y)});out.feet.push(+(lo-PetWalk.groundY(tb)).toFixed(1));}
   const mb=bs.find(b=>b.classList.contains("melt"));
   if(mb&&!seen.has(mb)){seen.add(mb);await new Promise(r=>setTimeout(r,20));const ss=[...document.querySelectorAll(".ps-spark")];out.sparks.push(ss.length);
    await Promise.all(ss.flatMap(s=>s.getAnimations().map(a=>a.finished.catch(()=>{}))).concat([]));   // 最後一格：光點的位置跟它要去的裂縫
    }
   if(!bs.length&&seen.size)break;await new Promise(r=>requestAnimationFrame(r));}
  out.wx=[...out.wx];return out;});
 if(st===0){ok(r.xs.length===3&&r.xs.every(x=>Math.abs(x)<=40),"egg: berries land in front of the egg within ±40px "+JSON.stringify(r.xs));
  ok(r.wx.every(x=>x===0),"egg: does not walk (stays at the centre) "+JSON.stringify(r.wx));
  ok(r.sparks.length===3&&r.sparks.every(n=>n>=5&&n<=7),"egg: each berry turns into 5–7 sparks flying into the crack "+JSON.stringify(r.sparks));}
 else{ok(r.tips.length===3&&r.tips.every(d=>d<=6),"butterfly: the proboscis tip reaches the berry (≤6px) "+JSON.stringify(r.tips));
  ok(r.feet.length===3&&r.feet.every(d=>Math.abs(d)<=3),"butterfly: lands with its leg tips on the ground line (≤3px) "+JSON.stringify(r.feet));
  ok(r.face<1&&r.moved===0,"butterfly: flies without the 3D turn and never pushes the berries "+JSON.stringify({face:r.face,moved:r.moved}));}
 await p.close();}
if(sh()){const p=await mk({km:2.4});   // 蛋 0→3 km：走到 80%＝三道裂縫
 const r=await p.evaluate(()=>{const v=c=>getComputedStyle(document.querySelector("#petEmoji "+c)).display!=="none";const a=[document.querySelector(".ps-box").dataset.evo,v(".pc-crack2"),v(".pc-crack3")];
  localStorage.setItem("tt_debug_km","0.3");renderPet();const b=[document.querySelector(".ps-box").dataset.evo||"",v(".pc-crack2"),v(".pc-crack3")];return {a,b};});
 ok(r.a.join()==="2,true,true"&&r.b.join()===",false,false","egg: more cracks appear as it gets closer to hatching "+JSON.stringify(r));
 await p.close();}

// ── 2026-10-05 幼龍：腳下沒有雲（走在地上），慶祝跳才噗出雲；咬兩口（第一口後手上拿著剩下的）、吞完拍肚子 ──
if(sh()){const p=await mk({km:150,berries:20});
 const r=await p.evaluate(async()=>{window.__psNoIdle=true;const em=document.querySelector("#petEmoji"),pr=em.querySelector(".pet-prop"),c=em.querySelector(".pet-critter");
  const feet=[...em.querySelectorAll(".pr-foot ellipse")].map(e=>e.getBoundingClientRect().bottom),cb=c.getBoundingClientRect();
  const rest=+getComputedStyle(pr).opacity;em.classList.add("pb-hop");await new Promise(r=>setTimeout(r,420));const hop=+getComputedStyle(pr).opacity;em.classList.remove("pb-hop");
  return {rest,hop,ground:+(PetWalk.svgY(c,cb,183)-Math.max(...feet)).toFixed(1)};});
 ok(r.rest===0&&r.hop>.5,"baby dragon: no cloud under its feet at rest, the cloud puffs up only when it jumps "+JSON.stringify(r));
 ok(Math.abs(r.ground)<=2.5,"baby dragon: feet stand on the same ground line as the other pets (px off) "+r.ground);
 await p.evaluate(()=>{localStorage.removeItem("tt_pet_fed_t");renderPet();document.querySelector(".ps-box").scrollIntoView({block:"center"});});await p.waitForTimeout(300);await p.click("#petFeed");
 const s2=await p.evaluate(async()=>{const seq=[];const t0=performance.now();const seen=new Set();
  while(performance.now()-t0<30000){const em=document.querySelector("#petEmoji"),bs=[...document.querySelectorAll(".ps-berry")];
   for(const b of bs){const k=(b.classList.contains("bit1")?"b":"")+(b.classList.contains("eaten")?"e":"")+(b.classList.contains("held")?"h":"");const key=b.style.cssText.slice(0,12)+k;if(k&&!seen.has(key)){seen.add(key);seq.push(k);}}
   if(em.classList.contains("pb-belly")&&seq[seq.length-1]!=="belly")seq.push("belly");
   if(!bs.length&&seq.length)break;await new Promise(r=>setTimeout(r,20));}return seq.join(">");});
 ok(s2==="h>bh>beh>h>eh>h>eh>belly","baby dragon: picks up each berry; the first one it bites a chunk, holds the rest while chewing, then eats it (the next two in one bite — 2026-10-07 shorter feeding); pats its belly after the last one "+s2);
 await p.close();}
// ── 2026-10-05 神龍：果實落在雲上、尾巴托到嘴前；游的時候身體走頭走過的路、雲座晚一點跟上 ──
if(sh()){const p=await mk({km:260,berries:20});
 await p.evaluate(()=>{window.__psNoIdle=true;localStorage.removeItem("tt_pet_fed_t");renderPet();document.querySelector(".ps-box").scrollIntoView({block:"center"});});await p.waitForTimeout(300);await p.click("#petFeed");
 const r=await p.evaluate(async()=>{await new Promise(r=>setTimeout(r,1200));const pr=document.querySelector("#petEmoji .pet-prop").getBoundingClientRect(),k=pr.width/200;
  const on=[...document.querySelectorAll(".ps-berry")].map(b=>{const x=(PetWalk.groundY(b)-pr.top)/k,q=b.getBoundingClientRect(),lx=(q.left+q.width/2-pr.left)/k;return +(x-(PET_ART.cloudTop6(lx)+3)).toFixed(1)});
  let carried=0,tipGap=99;const t0=performance.now();while(performance.now()-t0<25000){const bs=[...document.querySelectorAll(".ps-berry")];const c=bs.find(b=>b.classList.contains("carried")&&!b.classList.contains("eaten"));if(c)carried++;if(!bs.length)break;await new Promise(r=>setTimeout(r,30));}
  return {on,carried};});
 ok(r.on.length===3&&r.on.every(d=>Math.abs(d)<=3),"divine dragon: berries land on the cloud surface (units off) "+JSON.stringify(r.on));
 ok(r.carried>5,"divine dragon: carries each berry to its mouth with the tail ("+r.carried+" frames)");
 const w=await p.evaluate(async()=>{const box=document.querySelector(".ps-box"),pr=box.querySelector("#petEmoji .pet-prop"),c=box.querySelector("#petEmoji .pet-critter");const cx=e=>{const q=e.getBoundingClientRect();return q.left+q.width/2};
  for(let i=0;i<200&&(box.classList.contains("walking")||document.querySelector("#petEmoji").className.includes("pb-")||Math.abs(parseFloat(box.style.getPropertyValue("--wx"))||0)>.5);i++)await new Promise(r=>setTimeout(r,50));await new Promise(r=>setTimeout(r,600));   // 等吃完的慶祝（游一小段、回來、跳）結束
  const x0=cx(pr);const p1=PetWalk.goTo(box,-70);let lag=0,hy=new Set();const t0=performance.now();while(performance.now()-t0<3000){if(box.__wx!=null)lag=Math.max(lag,(cx(pr)-x0)-box.__wx);hy.add(+(parseFloat(box.querySelector("#petEmoji .pr-head").style.transform.split(",")[1])||0).toFixed(1));if(!box.classList.contains("walking"))break;await new Promise(r=>requestAnimationFrame(r));}
  await p1;const end=Math.abs(cx(pr)-x0+70);await PetWalk.home(box);return {lag:+lag.toFixed(1),end:+end.toFixed(1),heads:hy.size};});
 ok(w.lag>8&&w.end<1.5,"divine dragon: the cloud seat trails behind while swimming and is right under it when it stops "+JSON.stringify(w));
 ok(w.heads>=4,"divine dragon: the head rides the same wave the body follows "+JSON.stringify(w));
 await p.close();}

// ── 2026-10-04 走過去吃：蠕動／游動的身體變形走完要還原；站姿走路要坐回去 ──
if(sh())for(const [km,st] of [[5,1],[260,6]]){const p=await mk({km});
 const r=await p.evaluate(async()=>{const box=document.querySelector(".ps-box"),sig=()=>[...box.querySelectorAll("#petEmoji .pr-deform path")].map(e=>e.getAttribute("d")).join("|")+[...box.querySelectorAll("#petEmoji .lv-seg")].map(e=>e.style.transform).join("|");   // 幼蟲一節一節：看每一節的位移
  const before=sig();let mid="";const t=setTimeout(()=>{mid=sig()},500);await PetWalk.goTo(box,60);clearTimeout(t);const after=sig();await PetWalk.home(box);
  await new Promise(r=>setTimeout(r,400));const idle=sig();   // 神龍（2026-10-06 繩波）：停下來身體還在流動，本來就不會停在原形
  return {changedMid:mid!==""&&mid!==before,restored:after===before&&sig()===before,alive:idle!==after,wx:box.style.getPropertyValue("--wx")};});
 ok(r.changedMid&&(st===6?r.alive:r.restored),"stage "+st+(st===6?": body ripples while moving and keeps rippling at rest (rope wave) ":": body bends while moving and is restored exactly afterwards ")+JSON.stringify(r));
 await p.close();}
// ── 2026-10-07：狐、虎不再側身走——萬一要挪位置，臉一直朝向我們（不轉身、沒有站姿），走完回到原位 ──
if(sh()){const p=await mk({km:90});
 const r=await p.evaluate(async()=>{const box=document.querySelector(".ps-box");let side=0,face=0;const on=()=>{side+=box.classList.contains("standing")||!!box.querySelector(".pr-stand")?1:0;face=Math.max(face,Math.abs(parseFloat(box.style.getPropertyValue("--face"))||0));};
  const p1=PetWalk.goTo(box,-50);const t=setInterval(on,30);await p1;const moved=Math.abs((parseFloat(box.style.getPropertyValue("--wx"))||0)+50);await PetWalk.home(box);clearInterval(t);
  return {side,face,moved:+moved.toFixed(1),home:+(parseFloat(box.style.getPropertyValue("--wx"))||0).toFixed(1)};});
 ok(r.side===0&&r.face<1&&r.moved<1.5&&Math.abs(r.home)<1,"fox/tiger shuffle over facing us — never side-on, never turn — and come back home "+JSON.stringify(r));
 await p.close();}

// ── 2026-10-04 腳要踩住：走路時支撐腳的著地點在畫面上不能滑（狐、虎用 IK：中位數 ≤1px；幼龍有 3D 轉身：≤3px）──
if(sh()){const p=await mk({km:5});
 const r=await p.evaluate(async()=>{const out={};
  for(const [st,sel,cfg] of [[5,".pr-foot.l ellipse",0],[1,".lv-sl:nth-child(2) .lv-pro path",0]]){
   const host=document.createElement("div");host.innerHTML=`<div class="ps-box" data-stage="${st}" style="position:fixed;left:0;top:0;width:900px;height:380px;margin:0;padding:20px 0 0;z-index:99"><div class="ps-actor" style="position:absolute;left:0;right:0;bottom:24px"><div id="petEmojiT"></div></div></div>`;document.body.appendChild(host);
   const box=host.firstChild,em=box.querySelector("#petEmojiT");em.id="petEmoji";em.innerHTML=PET_ART.svg(st);em.querySelector(".pet-critter").style.cssText="width:200px;height:200px;max-width:none;max-height:none";box.style.setProperty("--wx","-200px");
   const S=[];let on=true;const el0=[...box.querySelectorAll(sel)].find(x=>!x.closest("clipPath")&&!x.closest("defs")),pick=()=>el0;   // 先抓好（幼蟲的變形會改 cy，選擇器之後就對不到了）
   const tick=()=>{const e=pick();if(e&&box.classList.contains("walking")){if(cfg){const pt=new DOMPoint(+e.getAttribute("cx"),+e.getAttribute("cy")+ +e.getAttribute("ry")).matrixTransform(e.getScreenCTM());S.push([pt.x,pt.y]);}else{const q=e.getBoundingClientRect();S.push([q.left+q.width/2,q.bottom]);}}if(on)requestAnimationFrame(tick)};requestAnimationFrame(tick);
   await PetWalk.goTo(box,200,st===1?{keepFace:true}:undefined);on=false;
   const ys=S.map(v=>v[1]).sort((a,b)=>b-a),ground=ys[Math.floor(ys.length*.3)];let runs=[],cur=[];for(const v of S){if(Math.abs(ground-v[1])<1)cur.push(v[0]);else{if(cur.length>3)runs.push(cur);cur=[];}}
   const d=runs.map(r=>Math.max(...r)-Math.min(...r)).sort((a,b)=>a-b);out[st]={runs:runs.length,med:+(d[Math.floor(d.length/2)]||99).toFixed(2)};host.remove();}
  return out;});
 ok(r[5].runs>=4&&r[5].med<=3&&r[1].runs>=4&&r[1].med<=1,"planted feet (and the larva's prolegs) do not slide while walking (median stance drift px) "+JSON.stringify(r));
 await p.close();}

// ── 2026-10-07 使用者：餵食的過程中不能摸、不能抱——點了只在泡泡說一句，不打斷吃東西 ──
if(sh()){const p=await mk({km:40,berries:20});
 await p.evaluate(()=>{window.__psNoIdle=true;localStorage.removeItem("tt_pet_fed_t");localStorage.removeItem("tt_pet_hug_day");renderPet();document.querySelector(".ps-box").scrollIntoView({block:"center"});});await p.waitForTimeout(400);
 await p.click("#petFeed");await p.waitForTimeout(1800);
 const c=await p.evaluate(()=>{const r=document.querySelector("#petEmoji .pet-critter").getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height*.62};});
 const a0=await p.evaluate(()=>+(localStorage.getItem("tt_pet_aff")||0));
 await p.mouse.click(c.x,c.y);await p.waitForTimeout(300);
 const t1=await p.evaluate(()=>({pat:/pb-pat|pb-tickle/.test(document.querySelector("#petEmoji").className),say:document.querySelector(".pet-card .pet-bubble").textContent,feeding:PetStage.isFeeding()}));
 await p.mouse.move(c.x,c.y);await p.mouse.down();await p.waitForTimeout(750);await p.mouse.up();await p.waitForTimeout(200);
 const t2=await p.evaluate(()=>({hug:/pb-hug/.test(document.querySelector("#petEmoji").className),aff:+(localStorage.getItem("tt_pet_aff")||0),day:localStorage.getItem("tt_pet_hug_day")}));
 ok(t1.feeding&&!t1.pat&&/在吃東西/.test(t1.say)&&!t2.hug&&t2.aff===a0&&!t2.day,"while feeding: tapping and long-press do nothing except a line in the bubble "+JSON.stringify({t1,t2}));
 await p.close();}

// ── 2026-10-07 收尾輪：測試面板「夥伴動畫」——每顆按鈕都按得動、不出錯，效果真的套上 ──
if(sh()){const p=await mk({km:40,berries:20});
 const r=await p.evaluate(async()=>{await window.openDebugPanel();await new Promise(r=>setTimeout(r,400));
  const sec=[...document.querySelectorAll("#debugPanel *, .dbg-panel *, [id*=debug] *")].find(e=>/夥伴動畫/.test(e.textContent)&&e.children.length===0);
  const out={found:!!sec};
  ttDebug.setLevel(1);out.lv1=+document.querySelector(".ps-box").dataset.stage;
  ttDebug.mood("happy");out.happy=document.querySelector("#petEmoji").className.includes("pet-m-happy");ttDebug.mood(null);
  const t0=performance.now();ttDebug.slow(.5);await new Promise(r=>setTimeout(r,100));out.slow=Math.round(performance.now()-t0);ttDebug.slow(1);
  out.spots=ttDebug.spots([1,2,3])&&JSON.stringify(window.__psSpots);ttDebug.spots(null);
  out.hat=ttDebug.hat();out.fps=ttDebug.fps();out.fpsEl=!!document.getElementById("ttFps");ttDebug.fps();
  ttDebug.setLevel(6);out.lv6=+document.querySelector(".ps-box").dataset.stage;ttDebug.clearDebug();return out;});
 ok(r.lv1===1&&r.lv6===6&&r.happy&&r.slow>=90&&r.slow<=140&&r.spots==="[1,2,3]"&&r.fpsEl,"debug panel 夥伴動畫: jump to a stage, mood, slow motion, drop spots, hat, fps overlay all work "+JSON.stringify(r));
 await p.close();}

console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails);await b.close();srv.kill();})();
