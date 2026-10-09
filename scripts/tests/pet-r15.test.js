// 夥伴 R15（2026-10-09）配色→相近物種：深林／海風／高山三種，每階一隻近親（同骨架）
//   1) 骨架一致：每一種、每一階會動的部位（支點、嘴、眼睛、尾巴、翅膀、接觸點、幼蟲每一片、神龍尾巴）數量跟原本完全一樣
//   2) 舞台上真的畫成那一種（data-v）、12 頂帽子都碰到頭（耳朵、頭型換了的狐、虎）
//   3) 餵食在每一種都跑得完、沒有錯誤（幼蟲一片片、狐、神龍）
//   4) 手冊：四張物種卡、名字對、沒解鎖的不能選；選了以後夥伴卡的名字、手冊的進化圖鑑都換成那一種
//   5) 好友看得到同一種（pet_state.v）、小隊地圖上也是（pet_look.v）
const __TTP = +process.env.TT_PORT || 8941;
const __path=require("path"),__fs=require("fs"),vm=require("vm");
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");
const OUT=__path.join(__dirname,"out","r15");__fs.mkdirSync(OUT,{recursive:true});
const MOCK=__fs.readFileSync(__dirname+"/soc-mock.js","utf8");const errs=[];let fails=0;const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m);if(!c)fails++;};
const KM=[0,5,20,40,90,150,260],V=["deep","sea","alpine"];
// 1) 骨架（不用開瀏覽器）
{const ctx={console};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(__fs.readFileSync(ROOT+"/web/js/pet-art.js","utf8"),ctx);const PA=ctx.PET_ART;
 const KEEP=/^(pr-|pc-ear|pc-eye|pc-eh|pc-tail|pc-wing|pc-hw|pc-fw|pc-sway|pc-bob|pc-hover|pc-heavy|pc-egg|pc-larva|pc-sb|pc-tw|pc-crack|cp-|cp$|m-[cotp]$|lv-|t6-)/;
 const cnt=svg=>{const m={},RE=/class="([^"]+)"/g;let x;while((x=RE.exec(svg)))for(const c of x[1].split(/\s+/))if(KEEP.test(c))m[c]=(m[c]||0)+1;return JSON.stringify(Object.keys(m).sort().map(k=>k+m[k]));};
 const bad=[];for(const v of V)for(let i=0;i<7;i++)for(const h of ["none","straw"])if(cnt(PA.svg(i,"",h,true,"scarf"))!==cnt(PA.as(v,()=>PA.svg(i,"",h,true,"scarf"))))bad.push(`${v}/${i}/${h}`);
 ok(bad.length===0,"every variant keeps the same moving parts as the original (42 combos) "+JSON.stringify(bad));
 const dif=[];for(const v of V)for(let i=0;i<7;i++){const a=PA.svg(i).replace(/p[0-9a-z]+_/g,""),b=PA.as(v,()=>PA.svg(i)).replace(/p[0-9a-z]+_/g,"").replace(/ data-v="\w+"/,"");if(a===b)dif.push(`${v}/${i}`);}
 ok(dif.length===0,"each of the 21 variants actually looks different from the original "+JSON.stringify(dif));}
(async()=>{const srv=spawn("python3",["-m","http.server",String(__TTP)],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch();
const mk=async(km,tone)=>{const ctx=await b.newContext({viewport:{width:390,height:844},timezoneId:"Asia/Taipei"});const p=await ctx.newPage();await require(__dirname+"/fake-weather")(p);p.on("pageerror",e=>errs.push(e.message));
 await p.addInitScript(o=>{if(sessionStorage.getItem("seed"))return;sessionStorage.setItem("seed","1");localStorage.setItem("tt_lang","zh");["tt_onboarded_v2","tt_coach_trail","tt_locperm_prompted","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_coach_team","tt_coach_pet"].forEach(k=>localStorage.setItem(k,"1"));localStorage.setItem("tt_pet_woke",String(Date.now()));localStorage.setItem("tt_debug_km",String(o.km));if(o.tone)localStorage.setItem("tt_pet_tone",o.tone);},{km,tone});
 await p.addInitScript(MOCK);await p.addInitScript(()=>{window.__toneAll=true;});await p.goto(`http://localhost:${__TTP}/`);await require(__dirname+"/ready")(p);
 await p.evaluate(()=>{window.__toneAll=true;petApplyTone();document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove());});await p.click('.tab[data-view="pet"]');await p.waitForTimeout(1200);
 await p.evaluate(()=>{document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove());window.__psNoIdle=true;document.querySelector(".ps-box").scrollIntoView({block:"center"});});return p;};
// 2) 帽子＋舞台上的那一種
for(const v of V){const p=await mk(KM[3],v);
 const r=await p.evaluate(async v=>{const out={};for(const st of [3,4]){localStorage.setItem("tt_debug_km",String([0,5,20,40,90,150,260][st]));const fl=[];
   for(const id of PET_ART.HAT_IDS.filter(x=>x!=="none")){localStorage.setItem("tt_pet_hat",id);renderPet();await new Promise(r=>setTimeout(r,50));
    document.querySelectorAll("#petEmoji *").forEach(e=>e.getAnimations().forEach(a=>a.cancel()));
    const em=document.querySelector("#petEmoji"),h=em.querySelector(".pr-head").getBoundingClientRect(),t=em.querySelector(".pc-hat").getBoundingClientRect();
    if(Math.min(t.bottom,h.bottom)-Math.max(t.top,h.top)<2)fl.push(id);}
   out[st]={float:fl,dv:document.querySelector("#petEmoji .pet-critter").dataset.v||""};}
  localStorage.setItem("tt_pet_hat","none");return out;},v);
 ok(r[3].dv===v&&r[4].dv===v,`${v}: the stage draws the ${v} species (${r[3].dv}/${r[4].dv})`);
 ok(r[3].float.length===0&&r[4].float.length===0,`${v}: every hat touches the head on the fox and tiger variants ${JSON.stringify([r[3].float,r[4].float])}`);
 await p.screenshot({path:`${OUT}/${v}.png`,clip:{x:0,y:60,width:390,height:420}});
 await p.context().close();}
// 3) 餵食
for(const v of V)for(const st of [1,3,6]){const p=await mk(KM[st],v);
 const r=await p.evaluate(async()=>{const t0=Date.now();localStorage.removeItem("tt_pet_fed_t");localStorage.setItem("tt_pet_berry_bonus","30");renderPet();await new Promise(r=>setTimeout(r,300));feedPet();await new Promise(r=>setTimeout(r,500));
  const started=document.querySelector(".ps-box").classList.contains("feeding");while(document.querySelector(".ps-box").classList.contains("feeding")&&Date.now()-t0<40000)await new Promise(r=>setTimeout(r,250));
  return {started,done:!document.querySelector(".ps-box").classList.contains("feeding"),ms:Date.now()-t0,berries:document.querySelectorAll(".ps-berry").length};});
 ok(r.started&&r.done&&r.berries===0,`${v} stage ${st}: feeding plays through and cleans up ${JSON.stringify(r)}`);
 await p.context().close();}
// 4) 手冊＋名字
{const p=await mk(KM[3],"");
 const d=await p.evaluate(async()=>{window.__toneAll=false;petApplyTone();renderPet();document.getElementById("petDex").click();await new Promise(r=>setTimeout(r,500));
  const cards=[...document.querySelectorAll('[data-ov="petdex"] .dex-sp')].map(b=>({k:b.dataset.tone,dis:b.disabled,n:b.querySelector(".dex-sp-s").textContent,v:b.querySelector(".pet-critter")?.dataset.v||""}));return cards;});
 ok(d.length===4&&d.map(c=>c.n).join()==="靈巧山狐,林間石虎,溪岸水獺,黃喉貂","handbook: four species cards with the right names "+JSON.stringify(d.map(c=>c.n)));
 ok(d[0].dis===false&&d.slice(1).every(c=>c.dis)&&d[1].v==="deep"&&d[3].v==="alpine","locked species can't be picked but show their look");
 await p.screenshot({path:`${OUT}/dex.png`});
 const r=await p.evaluate(async()=>{window.__toneAll=true;document.querySelector('[data-ov="petdex"]').remove();document.getElementById("petDex").click();await new Promise(r=>setTimeout(r,400));
  document.querySelector('[data-ov="petdex"] .dex-sp[data-tone="sea"]').click();await new Promise(r=>setTimeout(r,500));
  const row=document.querySelector('[data-ov="petdex"] .dex-row.now');return {name:document.querySelector(".pet-card .pet-name").textContent,row:row&&row.querySelector(".dex-h b").textContent,rowV:row&&row.querySelector(".pet-critter")?.dataset.v,card:document.querySelector("#petEmoji .pet-critter").dataset.v,tone:localStorage.getItem("tt_pet_tone")};});
 ok(r.tone==="sea"&&r.card==="sea"&&r.name==="溪岸水獺","picking 海風: pet card becomes the otter "+JSON.stringify(r));
 ok(r.row==="溪岸水獺"&&r.rowV==="sea","handbook evolution chart follows the pick");
 await p.screenshot({path:`${OUT}/dex-sea.png`});
// 5) 好友、小隊
 const f=await p.evaluate(async()=>{window.__installFakeSupa({});window.__updates=[];localStorage.setItem("tt_pet_hat","straw");await Profiles.syncMyStats("me");const u=window.__updates.filter(x=>x.table==="profiles").pop();
  const P=id=>window.__fakeT.profiles.find(x=>x.id===id);Object.assign(P("u1"),{pet_level:4,pet_state:{last:new Date().toISOString(),v:"alpine",at:new Date().toISOString()}});Object.assign(P("u3"),{pet_level:5,pet_state:{last:new Date().toISOString(),v:"<x>"}});
  await Pets.renderFriends();await new Promise(r=>setTimeout(r,300));
  const fv=id=>document.querySelector(`#petFriends .fp-visit[data-id="${id}"] .pet-critter`)?.dataset.v||"";
  const tm=document.createElement("div");tm.innerHTML=TeamLive._petHtml({pet:"🦊",look:{s:3,h:"none",a:"none",v:"deep"}});
  return {sent:u&&u.fields.pet_state&&u.fields.pet_state.v,u1:fv("u1"),u3:fv("u3"),team:tm.querySelector(".pet-critter").dataset.v||"",mine:TeamLive._myLook().v};});
 ok(f.sent==="sea","my species is synced for friends (pet_state.v)");
 ok(f.u1==="alpine"&&f.u3==="","friend's card draws their species; junk value falls back to the original "+JSON.stringify(f));
 ok(f.team==="deep"&&f.mine==="sea","team map: teammates' species drawn, mine sent in pet_look");
 await p.context().close();}
console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails+(errs.length?1:0));await b.close();srv.kill();process.exit(0);})();
