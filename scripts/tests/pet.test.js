// 自動化測試（瀏覽器）：npm run test:all 會依序跑；截圖輸出到 scripts/tests/out/（不進版控）
const __path=require("path"),__fs=require("fs");
const __out=p=>{const full=__path.join(__dirname,"out",p);__fs.mkdirSync(p.endsWith("/")?full:__path.dirname(full),{recursive:true});return p.endsWith("/")?full+"/":full;};
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");const fs=require("fs");
const O=__out("pt3/");fs.mkdirSync(O,{recursive:true});const MOCK=fs.readFileSync(__dirname+"/soc-mock.js","utf8");const errs=[];let fails=0;const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m);if(!c)fails++;};
const R=[];for(let i=0;i<9;i++){const d=new Date(Date.now()-(i*2+1)*864e5);d.setHours(i%3?9:6,10);R.push({id:"r"+i,date:d.toISOString(),trailName:"x",trailId:["forestry-002","forestry-004","forestry-008"][i%3],distanceKm:4+i*1.3,elapsedMs:7200e3,ascent:220+i*40,descent:200,steps:6000+i*500,track:[{lat:24.45,lon:121.75,t:1},{lat:24.451,lon:121.752,t:2}]});}
(async()=>{const srv=spawn("python3",["-m","http.server","8894"],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch();
const mk=async(o={})=>{const ctx=await b.newContext({viewport:{width:o.w||390,height:844}});const p=await ctx.newPage();await require(__dirname+"/fake-weather")(p);p.on("pageerror",e=>errs.push(e.message));
 await p.addInitScript(o=>{localStorage.setItem("tt_lang",o.lang||"zh");["tt_onboarded_v2","tt_coach_trail","tt_locperm_prompted","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_coach_team"].forEach(k=>localStorage.setItem(k,"1"));if(o.fs)localStorage.setItem("tt_fontscale",o.fs);localStorage.setItem("tt_records",o.recs);localStorage.setItem("tt_pet_berry_bonus","95");localStorage.setItem("tt_pet_aff","60");},Object.assign({recs:JSON.stringify(R)},o));
 await p.addInitScript(MOCK);await p.goto("http://localhost:8894/");await p.waitForTimeout(2500);
 if(o.login) await p.evaluate(()=>window.__installFakeSupa({}));
 await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));await p.click('.tab[data-view="pet"]');await p.waitForTimeout(1500);return p;};
{const p=await mk();
 // 頁面＝階層
 await p.click("#achOpen");await p.waitForTimeout(1200);
 ok(await p.evaluate(()=>document.querySelectorAll(".ach-page").length===6),"6 pages");
 ok(await p.evaluate(()=>document.querySelectorAll(".ach-page[data-built]").length===2),"lazy: only 2 pages built at open");
 const tags=[];for(let i=0;i<6;i++){tags.push(await p.evaluate(i=>{const pg=document.querySelector(`.ach-page[data-p="${i}"]`);return pg.querySelector(".ach-pgtag").textContent.trim()+"|"+pg.querySelectorAll(".ach3d-mk").length},i));if(i<5){await p.evaluate(()=>document.querySelector('.ach-pgbtn[data-go="up"]').click());await p.waitForTimeout(500);}}
 console.log(tags.join("  "));
 const exp=await p.evaluate(()=>ACH_TIERS.map((n,i)=>petBadges().filter(b=>b.t===i+1).length));
 ok(tags.every((t,i)=>+t.split("|")[1]===exp[i]),"marker count per page = tier size "+exp);
 ok(await p.evaluate(()=>document.querySelectorAll(".ach3d-mk").length===petBadges().length),"all badges placed");
 ok(await p.evaluate(()=>{const t=[...document.querySelectorAll(".ach-pgtag")].map(e=>e.textContent);return ACH_TIERS.every(n=>t.some(x=>x.includes(n)))}),"every tier has its page tag");
 // 詳情卡切清單會收
 await p.evaluate(()=>document.querySelector(".ach-page[data-p='5'] .ach3d-mk").click());await p.waitForTimeout(300);
 ok(await p.evaluate(()=>!!document.querySelector(".ach3d-detail.show")),"detail opens");
 await p.click("#achViewTog");await p.waitForTimeout(300);
 ok(await p.evaluate(()=>!document.querySelector(".ach3d-detail.show")),"detail hidden after view toggle");
 // 清單模式按方向鍵不換頁
 const pg0=await p.evaluate(()=>document.querySelector('[data-ov="achtree"]').dataset.pg);await p.keyboard.press("ArrowDown");ok(await p.evaluate(()=>document.querySelector('[data-ov="achtree"]').dataset.pg)===pg0,"arrow keys ignored in list mode");
 await p.click("#achViewTog");await p.waitForTimeout(300);
 // refresh 不重複綁
 await p.evaluate(()=>refreshAchTree());await p.waitForTimeout(800);
 ok(await p.evaluate(()=>document.querySelectorAll('[data-ov="achtree"]').length===1),"refresh keeps single overlay");
 await p.evaluate(()=>document.querySelector('.ach-pgbtn[data-go="up"]').click());await p.waitForTimeout(500);
 ok(await p.evaluate(()=>document.querySelector('[data-ov="achtree"]').dataset.pg)==="1","after refresh one click = one page");
 await p.screenshot({path:O+"a-p2.png"});
 await p.evaluate(()=>document.querySelector('.ach-pgdot[data-pg="0"]').click());await p.waitForTimeout(600);await p.screenshot({path:O+"a-p1.png"});
 // 解鎖日期回推
 const dates=await p.evaluate(()=>{localStorage.removeItem("tt_badges_seen");localStorage.removeItem("tt_badges_date");achCheckUnlocks();return JSON.parse(localStorage.getItem("tt_badges_date")||"{}")});
 const recs=R.slice().sort((a,b)=>a.date<b.date?-1:1);
 ok(dates.first===recs[0].date,"初心者 date = first record ("+dates.first+")");
 ok(dates.trips3===recs[2].date,"週末山友 date = 3rd record");
 ok(Object.keys(dates).length>0 && Object.values(dates).every(d=>d<=new Date().toISOString()),"dates sane: "+Object.keys(dates).join(","));
 console.log("got:",await p.evaluate(()=>petBadges().filter(b=>b.got).map(b=>b.id).join(",")));
 // 原生存圖預覽
 await p.evaluate(async()=>{window.Capacitor={isNativePlatform:()=>true};navigator.canShare=undefined;const c=document.createElement("canvas");c.width=200;c.height=200;const x=c.getContext("2d");x.fillStyle="#3a7";x.fillRect(0,0,200,200);const bl=await new Promise(r=>c.toBlob(r,"image/png"));window.__r=await saveBlob(bl,"a.png","t");});
 ok(await p.evaluate(()=>window.__r==="preview"&&!!document.querySelector(".img-prev img")),"native image -> preview overlay");
 await p.screenshot({path:O+"b-preview.png"});
 await p.keyboard.press("Escape");await p.waitForTimeout(300);ok(await p.evaluate(()=>!document.querySelector(".img-prev")),"preview closes with Esc");
 await p.close();}
// 括號／語言
for(const l of ["en","ja","de","hi","ko","my","es"]){const p=await mk({lang:l});await p.waitForTimeout(500);
 const v=await p.evaluate(()=>[ttT("總爬升 3952 m（一座玉山）"),ttT("總爬升 8848 m（一座聖母峰）")]);
 ok(v.every(x=>!/[)）]\s*[)）]/.test(x)),l+" paren ok: "+v.join(" / "));
 if(l==="en"){
  const t=await p.evaluate(()=>{document.getElementById("petDex").click();return document.querySelector(".dex-intro").textContent});ok(/footsteps\. Growth km comes/.test(t),"en dex intro spacing: "+t.slice(0,60));
  ok(await p.evaluate(()=>!document.querySelector(".pet-modal-card").textContent.includes("？")),"en dex no fullwidth ？");
  await p.evaluate(()=>document.getElementById("petDexClose").click());
  ok(await p.evaluate(()=>/: /.test(document.querySelector(".quest-mile")?.textContent||": ")),"en milestone colon");
  await p.evaluate(()=>document.getElementById("petFeed").click());await p.waitForTimeout(300);
  console.log("en feed label:",await p.evaluate(()=>document.getElementById("petFeed").textContent.trim()));
  await p.screenshot({path:O+"c-en-feed.png"});
  await p.evaluate(()=>{const b=[...document.querySelectorAll(".pet-btn")];window.__h=b.map(x=>x.getBoundingClientRect().height)});ok(await p.evaluate(()=>Math.max(...window.__h)<70),"en acts row not stretched "+await p.evaluate(()=>window.__h.join(",")));
  await p.evaluate(()=>document.getElementById("petDress").click());await p.waitForTimeout(500);await p.evaluate(()=>document.querySelectorAll(".hat-opt.locked")[0]?.click());await p.waitForTimeout(500);
  console.log("en hat confirm:",await p.evaluate(()=>document.querySelector(".ttdlg")?.innerText.split("\n")[0]));
 }
 if(l==="ja"){console.log("ja 常客/目前:",await p.evaluate(()=>[ttT("常客"),ttT("目前"),ttT("走遍五縣"),ttT("氣勢威猛，群山都是牠的領地。")].join(" | ")));}
 await p.close();}
// 送果實失敗
{const p=await mk({login:1});await p.evaluate(()=>Pets.renderFriends());await p.waitForTimeout(1500);
 const bal0=await p.evaluate(()=>berriesBalance());
 await p.evaluate(()=>{Supa.client().rpc=async()=>({data:null,error:{message:"Failed to fetch"}})});
 const btn=await p.$(".fp-gift:not([disabled])");if(btn){await btn.click();await p.waitForTimeout(600);
  ok(await p.evaluate(()=>{const b=document.querySelector(".fp-gift:not([disabled])");return !!b}),"gift button re-enabled after network error");
  ok((await p.evaluate(()=>document.getElementById("toast").textContent)).includes("網路"),"network toast: "+await p.evaluate(()=>document.getElementById("toast").textContent));
  ok(await p.evaluate(()=>berriesBalance())===bal0,"berries not deducted on error");
  await p.evaluate(()=>{Supa.client().rpc=async()=>({data:true,error:null})});
  await p.click(".fp-gift:not([disabled])");await p.waitForTimeout(800);ok(await p.evaluate(()=>berriesBalance())===bal0-3,"success deducts 3");
 } else ok(false,"no gift button");
 await p.evaluate(()=>document.getElementById("petFriends").scrollIntoView());await p.screenshot({path:O+"d-friends.png"});
 await p.close();}
// 去走 toast 位置、360、大字
{const p=await mk();await p.click("#petRec");await p.waitForTimeout(900);await p.screenshot({path:O+"e-go.png"});ok(await p.evaluate(()=>document.getElementById("toast").classList.contains("top")),"go toast at top");await p.close();}
{const p=await mk({w:360});await p.click("#achOpen");await p.waitForTimeout(1200);await p.screenshot({path:O+"f-360.png"});await p.click("#achViewTog");await p.waitForTimeout(500);await p.screenshot({path:O+"f-360l.png"});await p.close();}
{const p=await mk({fs:"1.65"});await p.click("#achOpen");await p.waitForTimeout(1200);await p.screenshot({path:O+"g-big.png"});await p.close();}
console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails);await b.close();srv.kill();})();
