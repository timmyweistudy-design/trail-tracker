// 動作「最後一下被切掉」偵測器（2026-10-09 修正案 R7-1）：七隻 × 每個動作，動作 class 被拿掉的前一格和後一格，角色的外框不能跳（≤1.5px）。
// 以前 flash() 等寫死的毫秒數：神龍的跳 1.6 秒、程式 0.9 秒就拿掉 → 在半空中瞬間掉回去（玩松果回位「頓一下」的真因）；6 隻的跳、神龍伸懶腰、幼龍嚼都有
const __path=require("path"),__fs=require("fs");
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");
const MOCK=__fs.readFileSync(__dirname+"/soc-mock.js","utf8");const errs=[];let fails=0;const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m);if(!c)fails++;};
const PORT = +process.env.TT_PORT || 8921, KM=[0,5,20,40,90,150,260];
const ONLY=(process.env.AC_ONLY||"0,1,2,3,4,5,6").split(",").map(Number);
(async()=>{const srv=spawn("python3",["-m","http.server",String(PORT)],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch();
for(const st of ONLY){
 const ctx=await b.newContext({viewport:{width:390,height:844},timezoneId:"Asia/Taipei"});const p=await ctx.newPage();await require(__dirname+"/fake-weather")(p);p.on("pageerror",e=>errs.push(e.message));
 await p.addInitScript(km=>{localStorage.setItem("tt_lang","zh");["tt_onboarded_v2","tt_coach_trail","tt_locperm_prompted","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_coach_team","tt_coach_pet"].forEach(k=>localStorage.setItem(k,"1"));
  localStorage.setItem("tt_pet_woke",String(Date.now()));localStorage.setItem("tt_test_diary","1");localStorage.setItem("tt_debug_km",String(km));},KM[st]);
 await p.addInitScript(MOCK);await p.goto(`http://localhost:${PORT}/`);await p.waitForTimeout(2500);
 await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));await p.click('.tab[data-view="pet"]');await p.waitForTimeout(1200);
 await p.evaluate(()=>{document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove());window.__psNoIdle=true;document.querySelector(".ps-box").scrollIntoView({block:"center"});});await p.waitForTimeout(500);
 // 每一格記角色外框；class 被拿掉時馬上量一次（同步，已套用拿掉後的樣式），跟上一格比
 await p.evaluate(()=>{const em=document.querySelector("#petEmoji"),R=()=>{const c=em.querySelector(".pet-critter").getBoundingClientRect();return [c.left,c.top,c.width,c.height];};
  window.__cut=[];let last=R();const tick=()=>{last=R();requestAnimationFrame(tick);};requestAnimationFrame(tick);
  let prev=new Set(em.classList);new MutationObserver(()=>{const now=new Set(em.classList);for(const c of prev)if(/^pb-/.test(c)&&!now.has(c)){const a=R(),d=Math.max(...a.map((v,k)=>Math.abs(v-last[k])));window.__cut.push([c,+d.toFixed(2)]);}prev=now;}).observe(em,{attributes:true,attributeFilter:["class"]});});
 const ACTS=["hop","stretch","yawn","sigh","blink2","shake","shiver","bask","windy","special"],REACT=["hug","pat","tickle","rub","dizzy"];
 for(const a of ACTS)await p.evaluate(a=>PetStage.act(a),a);
 for(const r of REACT)await p.evaluate(r=>PetStage.react(r),r);
 await p.evaluate(async()=>{PetStage.sleep();await PetStage.wake();});
 await p.waitForTimeout(300);
 const cut=await p.evaluate(()=>window.__cut),bad=cut.filter(([c,d])=>d>1.5);
 ok(cut.length>=12&&bad.length===0,`stage ${st}: no action snaps back when it ends (${cut.length} endings checked${bad.length?", jumps: "+JSON.stringify(bad):""})`);
 await ctx.close();}
// 神龍玩松果：尾尖每一格的速度變化不能大於 3px（以前第 127 格一格跳 16px）
{const ctx=await b.newContext({viewport:{width:390,height:844}});const p=await ctx.newPage();await require(__dirname+"/fake-weather")(p);p.on("pageerror",e=>errs.push(e.message));
 await p.addInitScript(()=>{localStorage.setItem("tt_lang","zh");["tt_onboarded_v2","tt_coach_trail","tt_locperm_prompted","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_coach_team","tt_coach_pet"].forEach(k=>localStorage.setItem(k,"1"));localStorage.setItem("tt_pet_woke",String(Date.now()));localStorage.setItem("tt_debug_km","260");});
 await p.addInitScript(MOCK);await p.goto(`http://localhost:${PORT}/`);await p.waitForTimeout(2500);await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));await p.click('.tab[data-view="pet"]');await p.waitForTimeout(1500);
 await p.evaluate(()=>{document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove());window.__psNoIdle=true;document.querySelector(".ps-box").scrollIntoView({block:"center"});});await p.waitForTimeout(600);
 const cdp=await ctx.newCDPSession(p);await cdp.send("Emulation.setVirtualTimePolicy",{policy:"pause"});
 await p.evaluate(()=>{PetStage.play('<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="#963"/></svg>');});
 const T=[];for(let f=0;f<480;f++){await cdp.send("Emulation.setVirtualTimePolicy",{policy:"advance",budget:33});await new Promise(r=>cdp.once("Emulation.virtualTimeBudgetExpired",r));
  await cdp.send("Page.captureScreenshot",{format:"jpeg",quality:10,clip:{x:0,y:0,width:1,height:1,scale:1}});
  const r=await p.evaluate(()=>{const t=PetWalk.cpt(document.querySelector(".ps-box"),"tail");return {t,pl:PetStage.isPlaying()};});T.push(r);if(f>30&&!r.pl)break;}
 let worst=0,at=-1;for(let i=2;i<T.length;i++){if(!T[i].t||!T[i-1].t||!T[i-2].t)continue;const v=Math.hypot(T[i].t[0]-T[i-1].t[0],T[i].t[1]-T[i-1].t[1]),v0=Math.hypot(T[i-1].t[0]-T[i-2].t[0],T[i-1].t[1]-T[i-2].t[1]);if(Math.abs(v-v0)>worst){worst=Math.abs(v-v0);at=i;}}
 ok(worst<=3,`dragon play: tail tip speed never jumps more than 3px between frames (worst ${worst.toFixed(1)}px @${at}, ${T.length} frames)`);
 await ctx.close();}
ok(errs.length===0,"no page errors "+JSON.stringify(errs.slice(0,3)));
console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails);
await b.close();srv.kill();process.exit(fails?1:0);})().catch(e=>{console.error(e);process.exit(1);});
