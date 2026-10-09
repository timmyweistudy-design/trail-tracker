// 夥伴修正案 R9（2026-10-09）：夥伴卡版面三層（舞台／狀態／動作一排＋次要小字）、大字級排法、年度回顧的「和夥伴的一年」、任務果實飛進餵食鈕
const __path=require("path"),__fs=require("fs");
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");
const MOCK=__fs.readFileSync(__dirname+"/soc-mock.js","utf8");const errs=[];let fails=0;const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m);if(!c)fails++;};
const PORT = +process.env.TT_PORT || 8924;
(async()=>{const srv=spawn("python3",["-m","http.server",String(PORT)],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch();
const mk=async(o={})=>{const ctx=await b.newContext({viewport:{width:o.w||390,height:844},timezoneId:"Asia/Taipei"});const p=await ctx.newPage();await require(__dirname+"/fake-weather")(p);p.on("pageerror",e=>errs.push(e.message));
 await p.addInitScript(o=>{localStorage.setItem("tt_lang","zh");["tt_onboarded_v2","tt_coach_trail","tt_locperm_prompted","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_coach_team","tt_coach_pet"].forEach(k=>localStorage.setItem(k,"1"));
  localStorage.setItem("tt_pet_woke",String(Date.now()));localStorage.setItem("tt_test_diary","1");localStorage.setItem("tt_debug_km","40");localStorage.setItem("tt_fontscale",o.fs||"1.2");
  if(o.diary)localStorage.setItem("tt_pet_diary",JSON.stringify(o.diary));if(o.gifts)localStorage.setItem("tt_pet_gifts",JSON.stringify(o.gifts));},o);
 await p.addInitScript(MOCK);await p.goto(`http://localhost:${PORT}/`);await p.waitForTimeout(2500);
 await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));await p.click('.tab[data-view="pet"]');await p.waitForTimeout(1200);
 await p.evaluate(()=>{document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove());window.__psNoIdle=true;});return {p,ctx};};

// 1. 版面：餵食、玩、拍照、裝扮在同一排（餵食最寬）；手冊、去走、改名在下面一行；舊的工具列拿掉了；按鈕 id 都還在（導覽、測試靠它們）
{const {p,ctx}=await mk();
 const r=await p.evaluate(()=>{const row=document.querySelector(".pet-acts-main"),btn=[...row.children].map(e=>e.id),more=[...document.querySelectorAll(".pet-more .pet-link")].map(e=>e.id);
  const top=[...row.children].map(e=>Math.round(e.getBoundingClientRect().top)),fw=document.getElementById("petFeed").getBoundingClientRect().width,pw=document.getElementById("petPlay").getBoundingClientRect().width;
  return {btn,more,sameRow:new Set(top).size===1,feedWider:fw>pw*1.4,noTools:!document.querySelector(".pet-tools"),ids:["petFeed","petPlay","petPhoto","petDress","petDex","petRec","petHelp"].every(id=>document.getElementById(id))};});
 ok(JSON.stringify(r.btn)==='["petFeed","petPlay","petPhoto","petDress"]'&&r.sameRow&&r.feedWider,"feed / play / photo / dress on one row, feed widest "+JSON.stringify(r));
 ok(r.more.slice(0,2).join()==="petDex,petRec"&&r.noTools&&r.ids,"handbook / go hiking below as small links; old tool row gone; all ids kept");
 // 動作還是會動：按玩 → 會丟松果
 await p.evaluate(()=>{document.querySelector(".ps-box").scrollIntoView({block:"center"});document.getElementById("petPlay").click();});await p.waitForTimeout(500);
 ok(await p.evaluate(()=>!!document.querySelector(".ps-toy")||PetStage.isPlaying()),"the play button in the new row still plays");
 await ctx.close();}
// 2. 大字級＋iPhone SE：餵食佔滿一排、其他三個在下一排；活力、親密各一行；不橫向捲動
{const {p,ctx}=await mk({w:320,fs:"1.65"});
 const r=await p.evaluate(()=>{const f=document.getElementById("petFeed").getBoundingClientRect(),pl=document.getElementById("petPlay").getBoundingClientRect(),row=document.querySelector(".pet-acts-main").getBoundingClientRect();
  const m=[...document.querySelectorAll(".pet-meters .pet-meter")].map(e=>Math.round(e.getBoundingClientRect().top));
  return {full:f.width>row.width*.95,below:pl.top>f.bottom-2,meters:m[1]>m[0]+4,sw:document.scrollingElement.scrollWidth<=innerWidth};});
 ok(r.full&&r.below&&r.meters&&r.sw,"SE + biggest font: feed full width, other actions below, meters stacked, no sideways scroll "+JSON.stringify(r));
 await ctx.close();}
// 3. 年度回顧：夥伴那一頁多一行「今年進化了 N 次」（或帶回來幾個小東西），圖戴著帽子和配件
{const y=new Date().getFullYear();const {p,ctx}=await mk({diary:[{t:`${y}-03-01T10:00:00.000Z`,k:"evo",i:2},{t:`${y}-06-01T10:00:00.000Z`,k:"evo",i:3}],gifts:[{id:"pine",t:`${y}-05-01`}]});
 const r=await p.evaluate(async y=>{localStorage.setItem("tt_pet_hat","straw");localStorage.setItem("tt_pet_acc","scarf");await ensureScript("js/year-story.js");const d=YearStory.collect(y),pg=YearStory.pages(d).find(x=>x.key==="pet");return pg?pg.lines:null;},y);
 ok(r&&r.some(l=>/今年進化了 2 次/.test(l)),"year story pet page mentions evolutions this year "+JSON.stringify(r));
 await ctx.close();}

ok(errs.length===0,"no page errors "+JSON.stringify(errs.slice(0,3)));
console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails);
await b.close();srv.kill();process.exit(fails?1:0);})().catch(e=>{console.error(e);process.exit(1);});
