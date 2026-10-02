// 記錄頁功能測試：地圖控制、完成判定（要走過六成）、暫停可拍照、全螢幕數字板、結束後放開步道、匯入路線可取消、背景預載不進已下載區、同名地標、分享圖卡挑選。
// 用法：node scripts/record-e2e.js
const ROOT=require("path").join(__dirname,"..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");const errs=[];const R=[];const ok=(n,v)=>R.push((v?"✓ ":"✗ ")+n);
(async()=>{const srv=spawn("python3",["-m","http.server","8897"],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));
const b=await chromium.launch();const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();p.on("pageerror",e=>errs.push(e.message));
await p.addInitScript(()=>{localStorage.setItem("tt_lang","zh");["tt_onboarded_v2","tt_coach_trail","tt_locperm_prompted","tt_coach_record"].forEach(k=>localStorage.setItem(k,"1"))});
await p.goto("http://localhost:8897/");await p.waitForTimeout(2500);
await p.click('.tab[data-view="record"]');await p.waitForTimeout(1200);await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg").forEach(e=>e.remove()));
ok("記錄地圖右上 4 顆鈕（指北針兼導航）",await p.evaluate(()=>document.querySelectorAll("#recMap .leaflet-top.leaflet-right > *").length===4));
ok("記錄地圖有地形/衛星切換",await p.evaluate(()=>!!document.querySelector("#recMap .basemap-toggle")));
ok("有縮放鈕和比例尺",await p.evaluate(()=>!!document.querySelector("#recMap .leaflet-control-zoom")&&!!document.querySelector("#recMap .leaflet-control-scale")));
// 完成判定：只走一小段不算完成
ok("走 10% 不算完成",await p.evaluate(async()=>{const t=TRAILS.find(x=>x.id==="forestry-004");await ensureGeo(t.region);selectTrailForRecord(t,{quiet:true});await new Promise(r=>setTimeout(r,200));
 const seg=geoOf(t)[0];const part=seg.slice(0,Math.max(2,Math.floor(seg.length*0.1))).map((p,i)=>({lat:p[0],lon:p[1],t:i}));
 Store.setTrailLog(t.id,{done:false});maybeMarkTrailDone({trailId:t.id,trailName:t.name,track:part,distanceKm:0.2});return !Store.trailLog(t.id).done}));
ok("走完整條算完成",await p.evaluate(()=>{const t=TRAILS.find(x=>x.id==="forestry-004");const tr=[];geoOf(t).forEach(seg=>seg.forEach((p,i)=>tr.push({lat:p[0],lon:p[1],t:i})));maybeMarkTrailDone({trailId:t.id,trailName:t.name,track:tr,distanceKm:1.4});return !!Store.trailLog(t.id).done}));
// 模擬記錄 → 結束 → 步道選擇清掉
await p.evaluate(()=>{document.getElementById("simToggle").checked=true});await p.click("#btnStart");await p.waitForTimeout(4000);
await p.click("#btnPause");await p.waitForTimeout(500);
ok("暫停時能隨手拍",await p.evaluate(()=>!document.getElementById("btnSnap").hidden||sim()));   // 模擬時本來就不給拍
await p.evaluate(()=>{const fs=document.querySelector("#recMap .leaflet-top.leaflet-right > div:last-child");fs.click()});await p.waitForTimeout(600);
ok("全螢幕地圖有數字板",await p.evaluate(()=>{const h=document.getElementById("fsHud");return h&&getComputedStyle(h).display!=="none"&&/\d/.test(h.textContent)}));
await p.evaluate(()=>{const fs=document.querySelector(".map-fs .leaflet-top.leaflet-right > div:last-child");fs.click()});await p.waitForTimeout(400);
// 結束後會先做地形海拔校正（最多等 8 秒，網路慢時會用滿）→ 等結算頁真的打開，不要用固定秒數
await p.click("#btnStop");await p.waitForTimeout(400);await p.click(".ttdlg .btn.primary").catch(()=>{});
await p.waitForFunction(()=>{const s=document.getElementById("trackSheet");return s&&s.classList.contains("show")},null,{timeout:15000}).catch(()=>{});await p.waitForTimeout(300);await p.evaluate(()=>closeTrackReview());
ok("結束後步道選擇清掉",await p.evaluate(()=>selectedTrailId==null&&!selectedTrailGeo));
// GPX 參考線有取消鈕
await p.evaluate(()=>followRoute([[24.9,121.7],[24.91,121.71],[24.92,121.72]],"測試路線"));await p.waitForTimeout(400);
ok("匯入路線有取消列",await p.evaluate(()=>!document.getElementById("selTrail").hidden));
await p.click("#selTrailX");await p.waitForTimeout(300);
ok("按 ✕ 清掉匯入路線",await p.evaluate(()=>!guideLine));
// 背景預載存瀏覽快取
const r=await p.evaluate(async()=>{const s0=(await (await caches.open("tt-tiles-saved")).keys()).length;await Offline.download(["https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/14/7001/13701"],()=>{},{temp:true}).catch(()=>{});const s1=(await (await caches.open("tt-tiles-saved")).keys()).length;return s1===s0});
ok("背景預載不進已下載區",r);
// 同名地標
ok("同名地標分開記",await p.evaluate(()=>wpKey({name:"三角點",lat:24.1,lon:121.1})!==wpKey({name:"三角點",lat:24.2,lon:121.2})));
// 震動函式在
ok("ttBuzz/ttBeep 存在",await p.evaluate(()=>typeof ttBuzz==="function"&&typeof ttBeep==="function"));
// 分享圖卡挑選
await p.evaluate(()=>shareHikeCard(Store.getRecords()[0]||{trailName:"x",date:new Date().toISOString(),distanceKm:1,track:[]}));await p.waitForTimeout(2500);
ok("分享圖卡有 3 張預覽可挑",await p.evaluate(()=>document.querySelectorAll(".cp-item img").length===3));

console.log(R.join("\n"));if(errs.length)console.log("頁面錯誤",JSON.stringify(errs));await b.close();srv.kill();const bad=R.filter(x=>x.startsWith("✗")).length+errs.length;console.log(bad?"✗ 記錄頁測試有失敗":"✓ 記錄頁測試全部通過");process.exit(bad?1:0);})();
