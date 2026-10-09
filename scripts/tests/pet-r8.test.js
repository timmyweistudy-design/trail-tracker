// 夥伴修正案 R8（2026-10-09）：裝扮精緻化——先試穿再換、三個分頁、已收集 n/m、格子只畫配件本身、13 頂帽子重畫、配件 5 件（前後兩層）
const __path=require("path"),__fs=require("fs");
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");
const O=__path.join(__dirname,"out","pr8")+"/";__fs.mkdirSync(O,{recursive:true});
const MOCK=__fs.readFileSync(__dirname+"/soc-mock.js","utf8");const errs=[];let fails=0;const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m);if(!c)fails++;};
const PORT = +process.env.TT_PORT || 8923;
(async()=>{const srv=spawn("python3",["-m","http.server",String(PORT)],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch();
const mk=async(km)=>{const ctx=await b.newContext({viewport:{width:390,height:844},timezoneId:"Asia/Taipei",deviceScaleFactor:2});const p=await ctx.newPage();await require(__dirname+"/fake-weather")(p);p.on("pageerror",e=>errs.push(e.message));
 await p.addInitScript(km=>{if(sessionStorage.getItem("__i"))return;sessionStorage.setItem("__i","1");localStorage.setItem("tt_lang","zh");["tt_onboarded_v2","tt_coach_trail","tt_locperm_prompted","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_coach_team","tt_coach_pet"].forEach(k=>localStorage.setItem(k,"1"));
  localStorage.setItem("tt_pet_woke",String(Date.now()));localStorage.setItem("tt_test_diary","1");localStorage.setItem("tt_debug_km",String(km));localStorage.setItem("tt_pet_berry_bonus","60");localStorage.setItem("tt_pet_hats_owned",'["none","straw"]');},km);
 await p.addInitScript(MOCK);await p.goto(`http://localhost:${PORT}/`);await p.waitForTimeout(2500);
 await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));await p.click('.tab[data-view="pet"]');await p.waitForTimeout(1200);
 await p.evaluate(()=>{document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove());window.__psNoIdle=true;});return {p,ctx};};

// 1. 帽子、配件都是用 P() 畫的（有外框、暗面）；每一頂都畫得出格子圖示
{const {p,ctx}=await mk(40);
 const r=await p.evaluate(()=>{const ids=PET_ART.HAT_IDS.filter(x=>x!=="none");const shaded=ids.filter(id=>{const d=document.createElement("div");d.innerHTML=PET_ART.svg(3,"",id);const h=d.querySelector(".pc-hat");return h&&h.querySelectorAll("clipPath").length>=1&&h.querySelectorAll("[stroke]").length>=2;});
  const icons=ids.filter(id=>/<svg/.test(PET_ART.hatIcon(id))).length;
  const acc=PET_ART.ACC_IDS.filter(x=>x!=="none"),ok=acc.map(id=>[1,2,3,4,5,6].filter(i=>PET_ART.accOk(i,id)).join(""));return {n:ids.length,shaded:shaded.length,icons,acc:acc.length,ok};});
 ok(r.n===12&&r.shaded===12&&r.icons===12,"all 12 hats are drawn with outline + shading, each has a close-up icon "+JSON.stringify(r));
 ok(r.acc===5&&JSON.stringify(r.ok)==='["123456","123456","123456","345","345"]',"5 accessories; backpack and cape only on upright fox / tiger / young dragon "+JSON.stringify(r.ok));
 // 背包、披風有背後那一層（畫在整隻最底下）
 const back=await p.evaluate(()=>{const d=document.createElement("div");d.innerHTML=PET_ART.svg(4,"","none",false,"backpack");const root=d.querySelector(".pc-bob")||d.querySelector(".pc-hover");return !!root&&root.firstElementChild&&root.firstElementChild.classList.contains("acc-backpack-b");});
 ok(back,"backpack body sits at the very back of the pet (behind the body)");
 await ctx.close();}

// 2. 裝扮視窗：預覽、分頁、已收集、試穿不扣、按鈕才扣、已有的直接戴
{const {p,ctx}=await mk(40);
 await p.evaluate(()=>openHatPicker());await p.waitForTimeout(600);
 const ui=await p.evaluate(()=>({prev:!!document.querySelector(".dr-prev .pet-critter"),tabs:[...document.querySelectorAll(".dr-tabs .pp-tod")].map(b=>b.dataset.pane).join(","),grps:[...document.querySelectorAll('[data-pane="hat"].dr-pane .dr-gh small')].map(e=>e.textContent),
  icon:!document.querySelector('.hat-opt[data-hat="party"] .hat-prev .pet-critter')&&!!document.querySelector('.hat-opt[data-hat="party"] .dr-ic-svg')}));
 ok(ui.prev&&ui.tabs==="hat,acc,prop"&&ui.grps[0]==="已收集 1/4"&&ui.icon,"preview + three tabs + 'collected n/m' + tiles show the hat itself "+JSON.stringify(ui));
 const b0=await p.evaluate(()=>berriesBalance());
 await p.evaluate(()=>document.querySelector('.hat-opt[data-hat="party"]').click());await p.waitForTimeout(300);
 const t=await p.evaluate(()=>({bal:berriesBalance(),hat:localStorage.getItem("tt_pet_hat"),prev:!!document.querySelector(".dr-prev .pc-hat"),buy:!document.getElementById("drBuy").hidden,tryTxt:document.querySelector(".dr-try").textContent}));
 ok(t.bal===b0&&t.hat!=="party"&&t.prev&&t.buy&&/派對帽/.test(t.tryTxt),"tapping a hat you don't own only tries it on: preview wears it, nothing charged "+JSON.stringify(t));
 await p.screenshot({path:O+"try-party.png"});
 await p.evaluate(()=>document.getElementById("drBuy").click());await p.waitForTimeout(400);
 const t2=await p.evaluate(()=>({bal:berriesBalance(),hat:localStorage.getItem("tt_pet_hat"),own:hatsOwned().has("party"),card:!!document.querySelector("#petEmoji .pc-hat"),cnt:document.querySelector('[data-pane="hat"].dr-pane .dr-gh small').textContent}));
 ok(b0-t2.bal===10&&t2.hat==="party"&&t2.own&&t2.card&&t2.cnt==="已收集 2/4","the buy button charges 10 once, wears it, counts it "+JSON.stringify(t2));
 await p.evaluate(()=>document.querySelector('.hat-opt[data-hat="straw"]').click());await p.waitForTimeout(300);
 ok(await p.evaluate(b=>localStorage.getItem("tt_pet_hat")==="straw"&&berriesBalance()===b,b0-10),"tapping a hat you own wears it right away");
 // 配件分頁
 await p.evaluate(()=>document.querySelector('.dr-tabs [data-pane="acc"]').click());await p.waitForTimeout(200);
 ok(await p.evaluate(()=>!document.querySelector('.dr-pane[data-pane="acc"]').hidden&&document.querySelector('.dr-pane[data-pane="hat"]').hidden&&document.querySelectorAll(".acc-opt").length===6),"accessory tab shows 6 tiles");
 await p.screenshot({path:O+"acc-tab.png"});
 await ctx.close();}

// 3. 幼蟲不能背背包：格子灰掉、點了說明原因、不扣
{const {p,ctx}=await mk(5);
 await p.evaluate(()=>openHatPicker());await p.waitForTimeout(500);await p.evaluate(()=>document.querySelector('.dr-tabs [data-pane="acc"]').click());
 const r=await p.evaluate(()=>{const b=document.querySelector('.acc-opt[data-acc="backpack"]');b.click();return {na:b.classList.contains("na"),msg:document.querySelector(".dr-msg").textContent,buy:document.getElementById("drBuy").hidden};});
 ok(r.na&&/戴不了/.test(r.msg)&&r.buy,"larva: backpack marked unavailable with the reason, no buy button "+JSON.stringify(r));
 await ctx.close();}

// 4. 每隻戴每一件拍一張總表（人眼看位置）
{const {p,ctx}=await mk(40);
 await p.evaluate(()=>{const W=document.createElement("div");W.id="sheet";W.style.cssText="position:fixed;left:0;top:0;width:390px;background:#fff;z-index:99999;display:grid;grid-template-columns:repeat(5,1fr)";
  for(const i of [1,2,3,4,5,6])for(const a of PET_ART.ACC_IDS.filter(x=>x!=="none")){const c=document.createElement("div");c.style.cssText="width:78px;height:78px";c.innerHTML=PET_ART.accOk(i,a)?PET_ART.svg(i,"","straw",false,a):"";if(c.firstChild)c.firstChild.style.cssText="width:78px;height:78px";W.appendChild(c);}document.body.appendChild(W);});
 await p.locator("#sheet").screenshot({path:O+"acc-sheet.png"});await ctx.close();}

ok(errs.length===0,"no page errors "+JSON.stringify(errs.slice(0,3)));
console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails);
await b.close();srv.kill();process.exit(fails?1:0);})().catch(e=>{console.error(e);process.exit(1);});
