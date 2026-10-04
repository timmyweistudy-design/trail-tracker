// 拜訪好友的夥伴（js/social/petsocial.js）：開拜訪卡、摸摸頭（每天每位 +2 親密度一次）、送果實、合照（PRO）
const __path=require("path"),__fs=require("fs");
const __out=p=>{const full=__path.join(__dirname,"out",p);__fs.mkdirSync(p.endsWith("/")?full:__path.dirname(full),{recursive:true});return p.endsWith("/")?full+"/":full;};
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");
const O=__out("pv/");const MOCK=__fs.readFileSync(__dirname+"/soc-mock.js","utf8");const errs=[];let fails=0;const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m);if(!c)fails++;};
const R=[0,1,2].map(i=>({id:"r"+i,date:new Date(Date.now()-(i+1)*864e5).toISOString(),trailName:"x",distanceKm:30,elapsedMs:7200e3,ascent:500,track:[]}));
(async()=>{const srv=spawn("python3",["-m","http.server","8895"],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch();
const mk=async(o={})=>{const ctx=await b.newContext({viewport:{width:o.w||390,height:844},acceptDownloads:true});const p=await ctx.newPage();await require(__dirname+"/fake-weather")(p);p.on("pageerror",e=>errs.push(e.message));
 await p.addInitScript(o=>{if(o.free)window.PERSONAL_MODE=false;if(sessionStorage.getItem("seed"))return;sessionStorage.setItem("seed","1");localStorage.setItem("tt_lang",o.lang||"zh");["tt_onboarded_v2","tt_coach_trail","tt_locperm_prompted","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_coach_team"].forEach(k=>localStorage.setItem(k,"1"));if(o.fs)localStorage.setItem("tt_fontscale",o.fs);localStorage.setItem("tt_records",o.recs);localStorage.setItem("tt_pet_berry_bonus","20");localStorage.setItem("tt_pet_aff","40");localStorage.setItem("tt_pet_aff_t",new Date().toISOString());localStorage.setItem("tt_pet_hat","bandana");},Object.assign({recs:JSON.stringify(R)},o));
 await p.addInitScript(MOCK);await p.goto("http://localhost:8895/");await p.waitForTimeout(2500);
 await p.evaluate(()=>window.__installFakeSupa({}));
 await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));await p.click('.tab[data-view="pet"]');await p.waitForTimeout(1200);
 await p.evaluate(()=>Pets.renderFriends());await p.waitForTimeout(1500);return p;};
{const p=await mk();
 ok(await p.evaluate(()=>document.querySelectorAll("#petFriends .fp-visit").length===2),"friend cards are visit buttons");
 await p.click('#petFriends .fp-visit[data-id="u1"]');await p.waitForTimeout(700);
 const t=await p.evaluate(()=>document.querySelector('[data-ov="petvisit"]')?.innerText||"");
 ok(/毛毛/.test(t)&&/Lv\.5/.test(t)&&/@mei_trail/.test(t)&&/420 km/.test(t),"visit card shows friend pet: "+t.replace(/\n/g," | "));
 ok(await p.evaluate(()=>!!document.querySelector(".fv-stage .ps-box")&&!!document.querySelector(".fv-critter .pet-critter")),"friend's pet stands in the same 2.5D stage as my own pet card");
 await p.screenshot({path:O+"visit.png"});
 const a0=await p.evaluate(()=>affinity());
 await p.click("#pvPat");await p.waitForTimeout(300);
 ok(await p.evaluate(()=>document.querySelectorAll(".fv-heart svg").length===5&&document.querySelector(".fv-critter").classList.contains("pb-pat")),"pat: 5 SVG hearts + the same squish as my own pet");
 await p.screenshot({path:O+"pat.png"});
 const a1=await p.evaluate(()=>affinity());ok(a1===a0+2,`first pat today +2 affinity (${a0}→${a1})`);
 ok(/毛毛 很開心/.test(await p.evaluate(()=>document.getElementById("toast").textContent)),"pat toast");
 await p.waitForTimeout(1700);await p.click("#pvPat");await p.waitForTimeout(300);
 ok(await p.evaluate(()=>affinity())===a1,"second pat same day: no extra affinity");
 ok(/蹭了蹭/.test(await p.evaluate(()=>document.getElementById("toast").textContent)),"second pat toast");
 // 隔天又可以
 await p.evaluate(()=>localStorage.setItem("tt_pet_pats",JSON.stringify({d:"2000-01-01",ids:["u1"]})));await p.click("#pvPat");await p.waitForTimeout(200);
 ok(await p.evaluate(()=>affinity())===a1+2,"next day pat counts again");
 // 送果實
 const bal=await p.evaluate(()=>{Supa.client().rpc=async n=>({data:n==="send_pet_gift",error:null});return berriesBalance()});
 await p.click("#pvGift");await p.waitForTimeout(900);
 ok(await p.evaluate(b=>berriesBalance()===b-3&&document.getElementById("pvGift").disabled,bal),"gift from visit card deducts 3 + disables");
 // 合照
 const c=await p.evaluate(async()=>{const c=await Pets._drawPhoto({id:"u1",handle:"mei_trail",pet_name:"毛毛",pet_level:5});return {w:c.width,h:c.height,url:c.toDataURL("image/png")}});
 ok(c.w===1080&&c.h===1350,"photo 1080x1350");
 __fs.writeFileSync(O+"photo.png",Buffer.from(c.url.split(",")[1],"base64"));
 const dl=p.waitForEvent("download",{timeout:5000}).catch(()=>null);await p.click("#pvPhoto");const d=await dl;
 ok(!!d&&/夥伴合照\.png$/.test(d.suggestedFilename()),"photo button saves png: "+(d&&d.suggestedFilename()));
 await p.keyboard.press("Escape");await p.waitForTimeout(400);ok(await p.evaluate(()=>!document.querySelector('[data-ov="petvisit"]')),"Esc closes");
 await p.close();}
// 免費版：合照被擋、摸摸頭照常
{const p=await mk({free:1});
 await p.click('#petFriends .fp-visit[data-id="u3"]');await p.waitForTimeout(700);
 ok(await p.evaluate(()=>!!document.querySelector("#pvPhoto .pro-tag")),"free: photo shows PRO tag");
 await p.click("#pvPat");await p.waitForTimeout(200);ok(/雲豹 很開心/.test(await p.evaluate(()=>document.getElementById("toast").textContent)),"free: pat works");
 const dl=p.waitForEvent("download",{timeout:2500}).catch(()=>null);await p.click("#pvPhoto");await p.waitForTimeout(800);
 ok(!(await dl)&&await p.evaluate(()=>!!document.querySelector('.premium-mask')),"free: photo opens upgrade instead of saving");
 await p.screenshot({path:O+"free-gate.png"});await p.close();}
// 英文、小螢幕大字
{const p=await mk({lang:"en",w:360,fs:"1.65"});
 await p.click('#petFriends .fp-visit[data-id="u1"]');await p.waitForTimeout(700);
 const t=await p.evaluate(()=>document.querySelector('[data-ov="petvisit"]').innerText);ok(!/[一-鿿]/.test(t.replace(/毛毛/g,"")),"en visit card translated: "+t.replace(/\n/g," | "));
 ok(await p.evaluate(()=>{const c=document.querySelector(".fv-card").getBoundingClientRect();return [...document.querySelectorAll(".fv-acts .btn")].every(b=>{const r=b.getBoundingClientRect();return r.left>=c.left-1&&r.right<=c.right+1})}),"buttons fit at 360/1.65");
 await p.screenshot({path:O+"en-360.png"});await p.close();}
// 2026-10-04：照搬好友那邊的舞台（配件、走過的風景），摸頭時只有角色彈、腳下的雲不動；欄位沒有時退回只用等級
{const p=await mk();
 const r=await p.evaluate(async()=>{document.querySelectorAll('[data-ov="petvisit"]').forEach(e=>e.remove());
  Pets.visit({id:"x1",handle:"a",pet_name:"小龍",pet_level:6,total_km:200,pet_hat:"maple",pet_decor:"fall,old,<script>"},false,null);await new Promise(r=>setTimeout(r,300));
  const box=document.querySelector(".fv-stage .ps-box"),pr=document.querySelector(".fv-critter .pet-prop"),b0=pr.getBoundingClientRect();
  document.querySelector("#pvPat").click();await new Promise(r=>setTimeout(r,180));const b1=pr.getBoundingClientRect();
  const out={stage:box.dataset.stage,decor:box.dataset.decor,hat:!!document.querySelector(".fv-critter .pc-hat"),propMoved:Math.abs(b1.top-b0.top),bounce:document.querySelector(".fv-critter").classList.contains("pb-pat")};
  document.querySelectorAll('[data-ov="petvisit"]').forEach(e=>e.remove());
  Pets.visit({id:"x2",handle:"b",pet_level:3,pet_hat:"evil-hat"},false,null);await new Promise(r=>setTimeout(r,300));
  out.old={stage:document.querySelector(".fv-stage .ps-box").dataset.stage,decor:document.querySelector(".fv-stage .ps-box").dataset.decor||"",hat:!!document.querySelector(".fv-critter .pc-hat")};return out;});
 ok(r.stage==="5"&&r.decor==="fall old"&&r.hat,"friend's hat and walked scenery carried over (unknown decor dropped) "+JSON.stringify(r));
 ok(r.propMoved<.5&&r.bounce,"pat bounces only the pet; the cloud under it stays "+JSON.stringify(r));
 ok(r.old.stage==="2"&&!r.old.decor&&!r.old.hat,"unknown hat / no decor falls back to the plain stage "+JSON.stringify(r.old));
 await p.close();}

// 使用者回報：摸頭時好友的夥伴會往左滑再回原位 → 整段動畫逐格量，左右位移不能超過 2px；開心瞇眼要出現
{const p=await mk();
 const r=await p.evaluate(async()=>{document.querySelectorAll('[data-ov="petvisit"]').forEach(e=>e.remove());
  Pets.visit({id:"x3",handle:"c",pet_name:"阿狐",pet_level:4,total_km:50},false,null);await new Promise(r=>setTimeout(r,400));
  const c=document.querySelector(".fv-critter .pet-critter"),cx=()=>{const q=c.getBoundingClientRect();return q.left+q.width/2;},x0=cx();
  document.querySelector("#pvPat").click();let dx=0,eh=false;
  for(let k=0;k<20;k++){await new Promise(r=>setTimeout(r,40));dx=Math.max(dx,Math.abs(cx()-x0));const e=document.querySelector(".fv-critter .pc-eh");if(e&&getComputedStyle(e).display!=="none")eh=true;}
  return {dx:+dx.toFixed(2),eh};});
 ok(r.dx<2,"pat: the friend's pet does not slide sideways (max dx "+r.dx+"px)");
 ok(r.eh,"pat: the friend's pet shows happy ^^ eyes");
 await p.close();}

console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails);await b.close();srv.kill();})();
