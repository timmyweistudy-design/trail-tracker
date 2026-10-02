// 自動化測試（瀏覽器）：npm run test:all 會依序跑；截圖輸出到 scripts/tests/out/（不進版控）
const __path=require("path"),__fs=require("fs");
const __out=p=>{const full=__path.join(__dirname,"out",p);__fs.mkdirSync(p.endsWith("/")?full:__path.dirname(full),{recursive:true});return p.endsWith("/")?full+"/":full;};
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");const fs=require("fs");
const O=__out("me3/");const MOCK=fs.readFileSync(__dirname+"/soc-mock.js","utf8");const errs=[];let fails=0;const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m);if(!c)fails++;};
// 台北時間 10/1 06:10 = UTC 9/30 22:10
const R=[{id:"a1",date:"2026-09-30T22:10:00.000Z",trailName:"南澳古道",trailId:"forestry-002",distanceKm:4,elapsedMs:7800e3,ascent:220,kcal:400,steps:5000,track:[{lat:24.45,lon:121.75,t:1},{lat:24.451,lon:121.752,t:2},{lat:24.455,lon:121.758,t:3}]},
 {id:"a2",date:"2026-09-20T01:00:00.000Z",trailName:"南澳古道",trailId:"forestry-002",distanceKm:6,elapsedMs:9000e3,ascent:300,kcal:500,steps:7000,sim:true,track:[{lat:24.45,lon:121.75,t:1},{lat:24.46,lon:121.76,t:2}]},
 {id:"a3",date:"2026-09-10T01:00:00.000Z",trailName:"自由路線",distanceKm:5,elapsedMs:3600e3,ascent:100,kcal:300,steps:6000,track:[{lat:24.4,lon:121.7,t:1},{lat:24.41,lon:121.71,t:2}]}];
(async()=>{const srv=spawn("python3",["-m","http.server","8890"],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch();
const mk=async(o={})=>{const ctx=await b.newContext({viewport:{width:o.w||390,height:844},timezoneId:"Asia/Taipei",colorScheme:o.scheme||"light"});const p=await ctx.newPage();await require(__dirname+"/fake-weather")(p);p.on("pageerror",e=>errs.push(e.message));
 await p.addInitScript(o=>{if(sessionStorage.getItem("seeded"))return;sessionStorage.setItem("seeded","1");localStorage.setItem("tt_lang",o.lang||"zh");["tt_onboarded_v2","tt_coach_trail","tt_locperm_prompted","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_coach_team"].forEach(k=>localStorage.setItem(k,"1"));localStorage.setItem("tt_set_open","[0,1,2,3,4,5]");localStorage.setItem("tt_records",JSON.stringify(o.recs));if(o.hidesim)localStorage.setItem("tt_hist_hidesim","1");},Object.assign({recs:o.recs||R},o));
 await p.addInitScript(MOCK);await p.goto("http://localhost:8890/");await p.waitForTimeout(2500);
 if(o.login)await p.evaluate(()=>window.__installFakeSupa({}));
 await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));await p.click('.tab[data-view="me"]');await p.waitForTimeout(1300);return p;};
const dlgTxt=p=>p.evaluate(()=>{const d=document.querySelector(".ttdlg");return d?d.innerText:null});
const dlgBtn=(p,i)=>p.evaluate(i=>{const bs=[...document.querySelectorAll(".ttdlg .btn")];bs[i].click()},i);
{const p=await mk();
 // 1 本地月份
 await p.click("#btnAnalytics");await p.waitForTimeout(1500);
 const months=await p.evaluate(()=>[...document.querySelectorAll('[data-ov="analytics"] .ana-m')].map(e=>e.textContent));
 ok(months.includes("10月")&&months.includes("9月"),"analytics months local: "+months.join(","));
 ok(await p.evaluate(()=>document.querySelectorAll(".ana-radar text").length===5),"radar 5 axes");
 await p.screenshot({path:O+"a-an.png"});
 await p.keyboard.press("Escape");await p.waitForTimeout(300);ok(await p.evaluate(()=>!document.querySelector('[data-ov="analytics"]')),"analytics closes on Esc");
 await p.click("#btnYearReview");await p.waitForTimeout(1500);
 ok(await p.evaluate(()=>{const v=[...document.querySelectorAll(".yr-mo-v")].map(e=>e.textContent);return v[9]==="4.0"&&v[8]!==""}),"year review Oct bar has 4.0");
 ok(await p.evaluate(()=>!document.querySelector(".yr-lines").textContent.includes("較去年")),"no vs-last-year without last-year data");
 ok(await p.evaluate(()=>document.querySelectorAll(".yr-route-svg circle").length===2),"route mini has start/end dots");
 await p.screenshot({path:O+"b-yr.png"});await p.evaluate(()=>document.getElementById("yrX").click());
 // 8 月份小標不算模擬
 const heads=await p.evaluate(()=>[...document.querySelectorAll(".hist-month .hm-meta")].map(e=>e.textContent));
 ok(heads[1]&&heads[1].startsWith("1 趟")&&heads[1].includes("5.0"),"Sep header excludes sim: "+heads.join(" | "));
 // 19 卡片一行
 ok(await p.evaluate(()=>{const c=document.querySelector(".hist-card .row");const t=[...c.children].map(x=>Math.round(x.getBoundingClientRect().top));return new Set(t).size===1}),"hist card stats on one line");
 // 17 工具列藏起來時 hideSim 不生效（另一頁測）
 // 13 地圖包沒圖磚就停用
 ok(await p.evaluate(()=>document.getElementById("btnPackExport").disabled),"pack export disabled with no tiles");
 // 15 個人資料錯誤位置
 await p.fill("#pfHeight","999");await p.click("#btnSaveProfile");await p.waitForTimeout(200);
 ok(await p.evaluate(()=>{const f=document.getElementById("pfHeight").closest(".field");return f.classList.contains("bad")&&f.nextElementSibling&&f.nextElementSibling.id==="pfErr"&&document.activeElement.id==="pfHeight"}),"profile error under the bad field");
 await p.evaluate(()=>document.getElementById("pfHeight").scrollIntoView({block:"center"}));await p.screenshot({path:O+"c-pf.png"});
 await p.fill("#pfHeight","170");ok(await p.evaluate(()=>!document.getElementById("pfHeight").closest(".field").classList.contains("bad")),"bad mark clears on input");
 // 11 清除地圖紅鈕
 await p.click("#btnClearTiles");await p.waitForTimeout(300);ok(await p.evaluate(()=>!!document.querySelector(".ttdlg .btn.danger-solid")),"clear tiles uses danger button");await p.screenshot({path:O+"d-clear.png"});await dlgBtn(p,0);
 // 10 匯入備份：說明＋完全取代二次確認
 const bk=JSON.stringify({v:1,records:[R[2]]});fs.writeFileSync(O+"bk.json",bk);
 await p.setInputFiles("#fileRestoreInput",O+"bk.json");await p.waitForTimeout(600);
 const t1=await dlgTxt(p);ok(t1&&t1.includes("合併：")&&t1.includes("完全取代："),"restore choice explains modes");await p.screenshot({path:O+"e-restore.png"});
 await p.evaluate(()=>[...document.querySelectorAll(".ttdlg .btn")].find(b=>b.textContent.includes("完全取代")).click());await p.waitForTimeout(400);
 const t2=await dlgTxt(p);ok(t2&&t2.includes("確定嗎")&&await p.evaluate(()=>!!document.querySelector(".ttdlg .btn.danger-solid")),"replace asks second confirm (danger)");
 await dlgBtn(p,0);await p.waitForTimeout(300);ok(await p.evaluate(()=>Store.getRecords().length)===3,"cancel replace keeps data");
 // 12 分享單時不講已匯出
 await p.evaluate(()=>{navigator.canShare=()=>true;navigator.share=async()=>{};});
 await p.click("#btnFileBackup");await p.waitForTimeout(600);ok(!(await p.evaluate(()=>document.getElementById("toast").classList.contains("show")&&document.getElementById("toast").textContent.includes("已匯出"))),"no 'exported' toast when share sheet used");
 await p.evaluate(()=>{navigator.canShare=undefined});
 await p.click("#btnFileBackup");await p.waitForTimeout(600);ok((await p.evaluate(()=>document.getElementById("toast").textContent)).includes("已匯出備份檔"),"toast when actually downloaded");
 // 18 足跡地圖縮放鈕
 await p.click("#btnFootMap");await p.waitForTimeout(1500);ok(await p.evaluate(()=>!!document.querySelector("#footMap .leaflet-control-zoom")),"footprint map zoom");await p.screenshot({path:O+"f-foot.png"});await p.evaluate(()=>document.getElementById("footClose").click());
 // 31 診斷時間格式
 await p.click("#btnDiag");await p.waitForTimeout(800);const dg=await dlgTxt(p);ok(/時間 2026\/\d+\/\d+/.test(dg||""),"diag time uses app locale: "+(dg||"").split("\n")[1]);await dlgBtn(p,0);
 await p.close();}

// 17 少於 6 筆時不看模擬不生效
{const p=await mk({hidesim:1});ok(await p.evaluate(()=>document.querySelectorAll(".hist-card.is-sim").length===1),"sim visible when tools hidden");await p.close();}
// 2 登入中清除資料
{const p=await mk({login:1});await p.evaluate(()=>{window.__so=0;const o=Auth.signOut;Auth.signOut=async()=>{window.__so++;};});
 await p.evaluate(()=>document.getElementById("btnWipeLocal").click());await p.waitForTimeout(400);const w1=await dlgTxt(p);ok(w1&&w1.includes("登出"),"wipe dialog mentions sign-out");
 ok(await p.evaluate(()=>document.querySelectorAll(".ttdlg .btn")[1].textContent==="下一步"),"wipe first button = 下一步");
 await dlgBtn(p,1);await p.waitForTimeout(400);ok(await p.evaluate(()=>!!document.querySelector(".ttdlg .btn.danger-solid")),"wipe final is danger");
 const nav=p.waitForNavigation({timeout:8000}).catch(()=>null);await dlgBtn(p,1);await nav;await p.waitForTimeout(2500);
 ok(await p.evaluate(async()=>Store.getRecords().length===0&&(await Store.allFull()).length===0),"wiped records stay gone after reload (archive cleared)");
 await p.close();}
// 英文
{const p=await mk({lang:"en"});
 ok((await p.evaluate(()=>document.querySelector(".mo-head").textContent.trim()))==="This month","en month head");
 await p.evaluate(()=>document.getElementById("btnAllOffline").click());await p.waitForTimeout(400);const tw=await dlgTxt(p);ok(tw&&!/[一-鿿]/.test(tw),"en Taiwan confirm translated: "+(tw||"").split("\n")[0]);await dlgBtn(p,0);
 await p.evaluate(()=>document.getElementById("btnWipeLocal").click());await p.waitForTimeout(400);ok(await p.evaluate(()=>document.querySelectorAll(".ttdlg .btn")[1].textContent==="Next"),"en wipe button Next");await dlgBtn(p,0);
 await p.click("#btnYearReview");await p.waitForTimeout(1500);const cap=await p.evaluate(()=>document.querySelector(".yr-mo-cap").textContent);ok(cap==="Monthly distance (km)","en caption paren: "+cap);
 const un=await p.evaluate(()=>{const out=[];const w=document.createTreeWalker(document.querySelector('[data-ov="year"]'),NodeFilter.SHOW_TEXT);let x;while((x=w.nextNode()))if(/[一-鿿]/.test(x.nodeValue))out.push(x.nodeValue.trim());return out});ok(un.length===0||un.every(s=>/南澳|自由/.test(s)),"en year review untranslated: "+JSON.stringify(un));
 await p.screenshot({path:O+"h-en-yr.png"});await p.evaluate(()=>document.getElementById("yrX").click());
 const un2=await p.evaluate(()=>{const out=new Set();const w=document.createTreeWalker(document.getElementById("view-me"),NodeFilter.SHOW_TEXT);let x;while((x=w.nextNode())){const t=x.nodeValue.trim();if(/[一-鿿]/.test(t)&&x.parentElement.getClientRects().length)out.add(t)}return [...out]});console.log("en me untranslated:",JSON.stringify(un2));
 ok(await p.evaluate(()=>!/[（）：]/.test(document.getElementById("view-me").innerText.replace(/[一-鿿]/g,""))),"en me no fullwidth punctuation");
 await p.close();}
for(const [l,k,exp] of [["ja","估","推定"],["tr","估","tahmini"],["ru","預估時間","Примерное время"]]){const p=await mk({lang:l});await p.waitForTimeout(500);const v=await p.evaluate(k=>ttT(k),k);ok(v===exp,l+" "+k+" = "+v);await p.close();}
// 7 英文搜尋
{const p=await mk({lang:"en",recs:[...R,...[1,2,3,4].map(i=>Object.assign({},R[2],{id:"x"+i,date:"2026-08-0"+i+"T01:00:00.000Z"}))]});
 await p.waitForTimeout(1500);const nm=await p.evaluate(()=>ttT("南澳古道"));await p.fill("#histSearch",nm.slice(0,5));await p.waitForTimeout(500);
 ok(await p.evaluate(()=>document.querySelectorAll(".hist-card").length)>=1,"en search by translated name ("+nm.slice(0,5)+")");await p.close();}
console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails);await b.close();srv.kill();})();
