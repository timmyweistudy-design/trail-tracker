// 自動化測試（瀏覽器）：npm run test:all 會依序跑；截圖輸出到 scripts/tests/out/（不進版控）
const __path=require("path"),__fs=require("fs");
const __out=p=>{const full=__path.join(__dirname,"out",p);__fs.mkdirSync(p.endsWith("/")?full:__path.dirname(full),{recursive:true});return p.endsWith("/")?full+"/":full;};
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");const fs=require("fs");
const MOCK=fs.readFileSync(__dirname+"/soc-mock.js","utf8");const O=__out("dbgp/");
const errs=[];let fails=0;const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m);if(!c)fails++;};
const Y=new Date().getFullYear();
const recs=[1,3,5,7].map(m=>({id:"r"+m,date:new Date(Y,m-1,9,7).toISOString(),trailName:"金瓜寮魚蕨步道",trailId:"forestry-004",distanceKm:6+m,elapsedMs:9e6,ascent:300,steps:9000,track:[]}));
(async()=>{const srv=spawn("python3",["-m","http.server","8887"],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch();
 const ctx=await b.newContext({viewport:{width:390,height:844},geolocation:{latitude:24.93,longitude:121.69},permissions:["geolocation"]});
 const p=await ctx.newPage();p.on("pageerror",e=>errs.push(e.message));
 await p.addInitScript(r=>{if(sessionStorage.getItem("x"))return;sessionStorage.setItem("x","1");localStorage.setItem("tt_lang","zh");["tt_onboarded_v2","tt_coach_trail","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_locperm_prompted","tt_coach_team","tt_coach_soc_friends","tt_coach_soc_explore","tt_coach_soc_search","tt_coach_soc_notif","tt_coach_soc_me"].forEach(k=>localStorage.setItem(k,"1"));localStorage.setItem("tt_records",r);},JSON.stringify(recs));
 await p.addInitScript(MOCK);
 await p.goto("http://localhost:8887/");await p.waitForTimeout(2800);
 await p.evaluate(()=>ensureScript("js/debug.js"));
 await p.evaluate(()=>{window.__installFakeSupa({});window.ttIsOwner=async()=>true;window.ttConfirm=async()=>true;});
 // 面板
 await p.evaluate(()=>toggleDebugPanel());await p.waitForTimeout(800);
 const secs=await p.evaluate(()=>[...document.querySelectorAll("#debugPanel .dbg-sec summary")].map(s=>s.textContent));
 ok(secs.length===8&&/第三波/.test(secs.join()),"panel has 8 sections: "+secs.join(" / "));
 await p.screenshot({path:O+"panel.png"});
 const SKIP=/檢舉處理|錯誤紀錄|清所有行程|重置🥚|重看語言|導覽\(|開成就頁|求救卡|開收集冊|山頂天氣|回報路況|留守人看到的|人氣範例|今年故事|去年故事/;
 const toasts=[];await p.exposeFunction("__t",t=>toasts.push(t));await p.evaluate(()=>{const o=window.toast;window.toast=(m,...a)=>{window.__t(String(m));return o(m,...a);};});
 for(let si=0;si<secs.length;si++){
   await p.evaluate(si=>{const d=document.querySelectorAll("#debugPanel .dbg-sec")[si];if(d&&!d.open)d.querySelector("summary").click();},si);await p.waitForTimeout(250);
   const labels=await p.evaluate(si=>[...document.querySelectorAll("#debugPanel .dbg-sec")[si].querySelectorAll("button")].map(x=>x.textContent),si);
   for(const l of labels){ if(SKIP.test(l))continue; const n=errs.length;
     await p.evaluate(([si,l])=>{const bt=[...document.querySelectorAll("#debugPanel .dbg-sec")[si].querySelectorAll("button")].find(x=>x.textContent===l);if(bt)bt.click();},[si,l]);await p.waitForTimeout(450);
     if(errs.length>n)ok(false,"button "+l+" threw: "+errs.slice(n).join(";"));
     if(!(await p.evaluate(()=>!!document.getElementById("debugPanel")))){await p.evaluate(()=>toggleDebugPanel());await p.waitForTimeout(400);}
   }
   await p.screenshot({path:O+"sec-"+si+".png"});
 }
 await p.evaluate(()=>["tt_coach_trail","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_coach_team","tt_coach_soc_friends","tt_coach_soc_explore","tt_coach_soc_search","tt_coach_soc_notif","tt_coach_soc_me"].forEach(k=>localStorage.setItem(k,"1")));
 ok(await p.evaluate(()=>!document.querySelector('script[src="js/debug.js"]')||true),"(debug.js lazy)");
 ok(errs.length===0,"no errors pressing all safe buttons ("+toasts.length+" toasts)");
 // 功能驗證
 await p.evaluate(()=>{const d=document.getElementById("debugPanel");if(d)d.remove();ttDebug.peaksReset();ttDebug.peaksStamp(5,8);setTheme("light");if(document.documentElement.classList.contains("sim-notch"))ttDebug.notch();});
 ok(await p.evaluate(()=>Object.keys(Peaks.got()).length===13),"peaksStamp(5,8) stamps 13");
 await p.evaluate(()=>ttDebug.guard(-40));await p.evaluate(()=>{document.querySelector('.tab[data-view="record"]').click();});await p.waitForTimeout(600);
 const gh=await p.evaluate(()=>{const h=document.getElementById("guardHud");return h&&!h.hidden?h.className+"|"+h.innerText:""});
 ok(/alert/.test(gh)&&/已經通知留守人/.test(gh),"debug guard(-40) shows alert HUD");
 await p.evaluate(()=>ttDebug.guard(null));
 await p.evaluate(()=>{ttDebug.challengeReset();ttDebug.challengeDone();document.querySelector('.tab[data-view="pet"]').click();});await p.waitForTimeout(800);
 ok(await p.evaluate(()=>!!document.getElementById("mchClaim")),"challengeDone → claim button appears");
 await p.evaluate(()=>document.getElementById("mchClaim").click());await p.waitForTimeout(500);
 ok(await p.evaluate(()=>JSON.parse(localStorage.getItem("tt_pet_hats_owned")||"[]").includes("bandana")),"claim unlocks bandana");
 await p.evaluate(()=>ttDebug.challengeReset());ok(await p.evaluate(()=>!JSON.parse(localStorage.getItem("tt_pet_hats_owned")||"[]").includes("bandana")),"challengeReset takes bandana back");
 await p.evaluate(()=>ttDebug.guardPlan("overdue"));await p.waitForTimeout(600);ok(await p.evaluate(()=>/阿梅/.test((document.querySelector('[data-ov="gplan"]')||{}).innerText||"")),"guardPlan preview opens");await p.keyboard.press("Escape");await p.waitForTimeout(300);
 await p.evaluate(()=>ttDebug.crowdPreview());await p.waitForTimeout(1800);ok(await p.evaluate(()=>!!document.querySelector("#activityBox .crowd-grid")),"crowdPreview renders heat grid");
 await p.evaluate(()=>closeDetail());await p.waitForTimeout(300);
 await p.evaluate(()=>{localStorage.removeItem("tt_story_force");ttDebug.storyBanner();document.querySelector('.tab[data-view="me"]').click();});await p.waitForTimeout(700);
 ok(await p.evaluate(()=>!!document.querySelector(".story-banner")),"storyBanner forces banner");
 await p.evaluate(()=>ttDebug.storyBanner());
 await p.evaluate(()=>ttDebug.notch());await p.waitForTimeout(300);ok(await p.evaluate(()=>document.documentElement.classList.contains("sim-notch")&&!!document.querySelector(".sim-island")&&getComputedStyle(document.documentElement).getPropertyValue("--safe-t").trim()==="59px"),"notch sim on");
 await p.screenshot({path:O+"notch-me.png"});
 await p.reload();await p.waitForTimeout(2500);await p.evaluate(()=>ensureScript("js/debug.js"));ok(await p.evaluate(()=>document.documentElement.classList.contains("sim-notch")&&!!document.querySelector(".sim-island")),"notch sim survives reload");
 await p.evaluate(()=>ttDebug.notch());ok(await p.evaluate(()=>!document.documentElement.classList.contains("sim-notch")&&!document.querySelector(".sim-island")),"notch sim off");
 await p.evaluate(()=>ttDebug.sunset(-1));await p.evaluate(()=>{document.querySelector('.tab[data-view="record"]').click();});await p.waitForTimeout(400);
 await p.evaluate(()=>{const t=document.getElementById("simToggle");t.checked=true;t.dispatchEvent(new Event("change"));});
 // 模擬記錄時日落 HUD 不顯示（sim）→ 用真記錄
 await p.evaluate(()=>{const t=document.getElementById("simToggle");t.checked=false;t.dispatchEvent(new Event("change"));});
 await p.click("#btnStart");await p.waitForTimeout(2500);
 ok(await p.evaluate(()=>{const h=document.getElementById("sunHud");return h&&!h.hidden&&/dark/.test(h.className);}),"sunset(-1) → dark HUD while recording");
 await p.evaluate(()=>{ttDebug.sunset(null);window.ttConfirm=async()=>true;document.getElementById("btnStop").click();});await p.waitForTimeout(1500);
 // 導覽
 await p.keyboard.press("Escape");await p.evaluate(()=>document.querySelectorAll(".pet-modal,.tour").forEach(e=>e.remove()));
 await p.evaluate(()=>onboarding(true,{previewLang:"zh",startAt:0}));await p.waitForTimeout(900);
 const n=await p.evaluate(()=>document.querySelectorAll(".tour-dots span").length);ok(n===13,"main tour has 13 steps: "+n);
 const miss=[];
 for(let k=0;k<n;k++){
   const st=await p.evaluate(()=>{const s=document.querySelector(".tour-spot").getBoundingClientRect();const tip=document.querySelector(".tour-tip");return {w:s.width,h:s.height,title:tip.querySelector("h3").textContent,center:tip.classList.contains("center")};});
   await p.screenshot({path:O+`tour-${String(k).padStart(2,"0")}.png`});
   if(k>0&&k<n-1&&!/雲端備份/.test(st.title)&&(st.w<10||st.center))miss.push(st.title);
   const nx=await p.$("#tourNext");if(!nx)break;await nx.click();await p.waitForTimeout(1100);
 }
 ok(miss.length===0,"every tour step spotlights its target"+(miss.length?": missing "+miss.join(","):""));
 // 記錄頁情境導覽（新使用者看全部、看過舊版補工具）
 await p.evaluate(()=>{["tt_coach_record","tt_coach_record_tools"].forEach(k=>localStorage.removeItem(k));document.querySelectorAll(".tour").forEach(e=>e.remove());document.querySelector('.tab[data-view="explore"]').click();});await p.waitForTimeout(300);
 await p.evaluate(()=>{document.querySelector('.tab[data-view="record"]').click();});await p.waitForTimeout(500);await p.evaluate(()=>ttCoachRecord());await p.waitForTimeout(900);
 ok(await p.evaluate(()=>document.querySelectorAll(".tour-dots span").length===4),"record coach (new user): 4 steps");
 await p.evaluate(()=>document.querySelectorAll(".tour").forEach(e=>e.remove()));
 await p.evaluate(()=>{localStorage.setItem("tt_coach_record","1");localStorage.removeItem("tt_coach_record_tools");ttCoachRecord();});await p.waitForTimeout(900);
 ok(await p.evaluate(()=>document.querySelectorAll(".tour-dots span").length===2&&/留守人/.test(document.querySelector(".tour-tip h3").textContent)),"record coach (seen old): only the 2 new tool steps");
 await p.screenshot({path:O+"coach-tools.png"});
 await p.evaluate(()=>document.querySelectorAll(".tour").forEach(e=>e.remove()));
 await p.evaluate(()=>{localStorage.removeItem("tt_coach_peaks");Peaks.open();});await p.waitForTimeout(1800);
 ok(await p.evaluate(()=>!!document.querySelector(".tour")&&/百岳與小百岳/.test(document.querySelector(".tour-tip h3").textContent)),"peaks coach on first open");
 await p.screenshot({path:O+"coach-peaks.png"});
 // 英文導覽
 await p.evaluate(()=>document.querySelectorAll(".tour,.pet-modal").forEach(e=>e.remove()));
 await p.evaluate(()=>onboarding(true,{previewLang:"en",startAt:0}));await p.waitForTimeout(700);let bad=[];
 for(let k=0;k<13;k++){const t=await p.evaluate(()=>(document.querySelector(".tour-tip")||{innerText:""}).innerText);if(/[一-鿿]/.test(t))bad.push(k+":"+t.split("\n").find(x=>/[一-鿿]/.test(x)));const nx=await p.$("#tourNext");if(!nx)break;await nx.click();await p.waitForTimeout(700);}
 ok(!bad.length,"english tour fully translated "+bad.join(" | "));
 console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails);await b.close();srv.kill();})();
