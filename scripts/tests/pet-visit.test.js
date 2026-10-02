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
 ok(await p.evaluate(()=>!!document.querySelector(".fv-stage .pet-hab")&&!!document.querySelector(".fv-critter .pet-critter")),"habitat + critter drawn");
 await p.screenshot({path:O+"visit.png"});
 const a0=await p.evaluate(()=>affinity());
 await p.click("#pvPat");await p.waitForTimeout(300);
 ok(await p.evaluate(()=>document.querySelectorAll(".fv-heart").length===5&&document.querySelector(".fv-critter").classList.contains("fv-bounce")),"pat: hearts + bounce");
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
console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails);await b.close();srv.kill();})();
