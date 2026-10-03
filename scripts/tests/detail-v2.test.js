// 步道頁改版（2026-10）：數字來源與可信度、預估時間一致、開放日已過、高山申請提醒、多天行程、照片／地圖切換、黏頂標題、各種寬度不爆版
const __path=require("path"),__fs=require("fs");
const __out=p=>{const full=__path.join(__dirname,"out",p);__fs.mkdirSync(p.endsWith("/")?full:__path.dirname(full),{recursive:true});return p.endsWith("/")?full+"/":full;};
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");
const O=__out("dv/");const errs=[];let fails=0;const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m);if(!c)fails++;};
(async()=>{const srv=spawn("python3",["-m","http.server","8899"],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch();
const mk=async(o={})=>{const ctx=await b.newContext({viewport:{width:o.w||390,height:844}});const p=await ctx.newPage();await require(__dirname+"/fake-weather")(p);p.on("pageerror",e=>errs.push(e.message));
 await p.route(/places\.googleapis\.com|api\.inaturalist\.org|commons\.wikimedia\.org/,r=>r.fulfill({status:200,contentType:"application/json",body:/inaturalist/.test(r.request().url())?'{"results":[]}':/wikimedia/.test(r.request().url())?'{"query":{"pages":{}}}':'{"places":[]}'}));
 await p.addInitScript(o=>{if(sessionStorage.getItem("seed"))return;sessionStorage.setItem("seed","1");localStorage.setItem("tt_lang",o.lang||"zh");if(o.fs)localStorage.setItem("tt_fontscale",o.fs);["tt_onboarded_v2","tt_coach_trail","tt_locperm_prompted"].forEach(k=>localStorage.setItem(k,"1"));},o);
 await p.goto("http://localhost:8899/");await p.waitForTimeout(2300);await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));return p;};
const open=async(p,id)=>{await p.evaluate(id=>openDetail(id),id);await p.waitForTimeout(1500);};
const statTxt=p=>p.evaluate(()=>[...document.querySelectorAll(".dv-stat")].map(e=>e.innerText.replace(/\s+/g," ")));
{const p=await mk();
 // 資料規則
 const d=await p.evaluate(()=>{const g=id=>TRAILS.find(x=>x.id===id);const k=g("forestry-004"),db=g("forestry-027");
   return {kAsc:trailAscent(k),dbAsc:trailAscent(db),kShape:routeShape(k),dbShape:routeShape(db),semi:TRAILS.filter(x=>/;/.test(x.name)).length,
     cardTime:(()=>{const div=document.createElement("div");div.innerHTML=trailCard(k);return div.querySelector(".jnum-sm").textContent})(),est:fmtHours(estHours(k))}});
 ok(d.kAsc.kind==="dem"&&d.kAsc.v===84,"金瓜寮: trusted terrain gain 84 m "+JSON.stringify(d.kAsc));
 ok(d.dbAsc.kind==="range"&&d.dbAsc.v===1580,"大霸: no route line → labelled elevation range "+JSON.stringify(d.dbAsc));
 ok(d.kShape==="loop"&&d.dbShape===null,"route shape only when route is trusted");
 ok(d.semi===0,"no semicolons left in names");
 ok(d.cardTime.includes(d.est),"list card and detail use the same estimate: "+d.cardTime+" / "+d.est);
 // 金瓜寮：有照片 → 照片／地圖切換
 await open(p,"forestry-004");
 let st=await statTxt(p);
 ok(/累積爬升 84\s?m 地形計算/.test(st[1])&&/官方建議：半天/.test(st[2])&&/環狀一圈/.test(st[0]),"stats with sources: "+st.join(" | "));
 ok(await p.evaluate(()=>document.querySelectorAll(".dv-stats .dv-src").length===4),"every number has a source chip");
 await p.click('.dv-src[data-src="dem"]');await p.waitForTimeout(400);
 ok(/25 公尺/.test(await p.evaluate(()=>document.querySelector(".ttdlg")?.innerText||"")),"source chip explains terrain calc");
 await p.evaluate(()=>document.querySelector(".ttdlg .btn")?.click());await p.waitForTimeout(300);
 // 黏頂標題
 await p.evaluate(()=>{const s=document.getElementById("detailSheet");s.scrollTop=700;});await p.waitForTimeout(500);
 ok(await p.evaluate(()=>document.getElementById("detailNav").classList.contains("mini")&&getComputedStyle(document.querySelector(".dt-name")).display!=="none"),"scrolled: tab bar shows trail name");
 // 出發前
 await p.click('#detailNav [data-tab="pre"]');await p.waitForTimeout(800);
 ok(await p.evaluate(()=>/最晚 .*\d\d:\d\d.* 出發/.test(document.querySelector(".dv-sun-plan")?.innerText||"")&&!document.querySelector(".dv-permit")),"low trail: latest start time, no permit card");
 ok(await p.evaluate(()=>!!document.querySelector(".dv-bug .eco-lv")&&!!document.getElementById("btnGuardSet")&&!!document.getElementById("btnOffline")),"plan tab: bugs + guardian + offline");
 // 大霸：高山、官方一天以上
 await open(p,"forestry-027");
 st=await statTxt(p);ok(/高低差 1,580\s?m 最高減最低/.test(st[1]),"大霸 shows 高低差: "+st[1]);
 ok(await p.evaluate(()=>document.getElementById("mediaTog").hidden),"no photos → no toggle, map only");
 await p.click('#detailNav [data-tab="pre"]');await p.waitForTimeout(1500);
 ok(await p.evaluate(()=>/一天以上/.test(document.querySelector(".dv-sun-plan.warn")?.innerText||"")&&/nv2\.npa\.gov\.tw/.test(document.querySelector(".dv-permit")?.innerHTML||"")),"high multi-day trail: overnight warning + permit links");
 // 開放日已過
 await p.evaluate(()=>{const t=TRAILS.find(x=>x.id==="forestry-008");t.condition={status:"暫停開放",title:"測試坍方",section:"全線",reopen:"20260101",dep:"宜蘭分署",ann:"20251201"};});
 await open(p,"forestry-008");
 const cb=await p.evaluate(()=>{const c=document.querySelector("#condLive .cond-banner");return [c.className,c.innerText]});
 ok(/warn/.test(cb[0])&&/2026\/01\/01 已過/.test(cb[1])&&/林業署公告 2025\/12\/01/.test(cb[1]),"past reopen date → amber + 'may be open, confirm' + announcement date");
 // 社群步道：附近步道不推小碎段
 await open(p,"osm_path-枋野具山登山路線-22.2751");
 await p.click('#detailNav [data-tab="nb"]');await p.waitForTimeout(1200);
 ok(await p.evaluate(()=>[...document.querySelectorAll(".nearby-card")].every(c=>{const t=TRAILS.find(x=>x.id===c.dataset.id);return t&&!(t.length_km<0.5)&&t.name!=="健行步道"})),"nearby trails skip <0.5 km fragments and vague names");
 ok(await p.evaluate(()=>!!document.querySelector("details#ecoBox")&&!document.querySelector("details#ecoBox").open),"common species collapsed");
 await p.close();}
// 照片切換（假 Wikimedia 回一張圖）
{const p=await mk();await p.unroute(/places\.googleapis\.com|api\.inaturalist\.org|commons\.wikimedia\.org/);
 await p.route(/commons\.wikimedia\.org/,r=>r.fulfill({status:200,contentType:"application/json",body:JSON.stringify({query:{pages:{1:{title:"File:金瓜寮魚蕨步道.jpg",imageinfo:[{url:"data:image/gif;base64,R0lGODlhAQABAAAAACw=",thumburl:"data:image/gif;base64,R0lGODlhAQABAAAAACw=",mime:"image/jpeg",extmetadata:{Artist:{value:"Tester"},LicenseShortName:{value:"CC BY 4.0"}}}]}}}})}));
 await p.evaluate(()=>{for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i);if(/^photon/.test(k))localStorage.removeItem(k);}});
 await open(p,"forestry-004");await p.waitForTimeout(1200);
 ok(await p.evaluate(()=>!document.getElementById("mediaTog").hidden&&!document.getElementById("detailPhotos").hidden&&/Tester · CC BY 4\.0/.test(document.querySelector(".hero-credit")?.textContent||"")),"photos: toggle shown, photo first, credit shown");
 await p.click('#mediaTog [data-m="map"]');await p.waitForTimeout(300);
 ok(await p.evaluate(()=>document.getElementById("detailPhotos").hidden),"toggle → map");
 await p.click('#mediaTog [data-m="photo"]');await p.click('#detailNav [data-tab="rt"]');await p.waitForTimeout(300);
 ok(await p.evaluate(()=>document.getElementById("detailPhotos").hidden),"route tab switches to map");
 await p.close();}
// 各種寬度／語言／大字不爆版
for(const [lang,w,fs] of [["zh",390,""],["en",360,"1.65"],["ja",360,"1.3"]]){const p=await mk({lang,w,fs});
 for(const id of ["forestry-004","forestry-027"]){await open(p,id);
  for(const tab of ["ov","pre","rt","nb"]){await p.evaluate(t=>document.querySelector(`#detailNav [data-tab="${t}"]`).click(),tab);await p.waitForTimeout(900);
   const bad=await p.evaluate(()=>{const W=document.documentElement.clientWidth;return [...document.querySelectorAll("#detailSheet *")].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.right>W+1&&!e.closest(".hero-carousel,.nearby-strip,.wx-fc,.leaflet-container,.det-photos,.eco-obs,.sib-row")}).slice(0,2).map(e=>e.className)});
   if(bad.length)ok(false,`${lang} ${w}/${fs} ${id} ${tab} overflow: ${bad.join(",")}`);
  }}
 ok(true,`layout ${lang} ${w}/${fs||1} checked`);
 if(lang!=="zh"){const t=await p.evaluate(()=>{const o=document.querySelector('.tabpane[data-pane="pre"]').cloneNode(true);o.querySelectorAll('[translate="no"]').forEach(e=>e.remove());return o.innerText});ok(!/超時沒回報會通知家人|要在天黑前走完|登山口附近|出發前準備|高山步道多半要申請|預估時間/.test(t)&&(lang==="ja"||!/[一-鿿]/.test(t.replace(/[一-鿿]+分署/g,""))),`${lang} plan tab translated`);}
 await p.screenshot({path:O+`${lang}-${w}.png`});await p.close();}
console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails);await b.close();srv.kill();})();
