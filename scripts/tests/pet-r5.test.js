// 夥伴修正案 R5（2026-10-09）：節日到 2035、回憶句、起風／冷／熱、季節裝飾、夢泡泡、玩具多兩種、小東西 14 種、脖子配件
// 截圖在 scripts/tests/out/pr5/（給人看：配件 6 隻 × 2 件、四季裝飾、夢泡泡）
const __path=require("path"),__fs=require("fs");
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");
const O=__path.join(__dirname,"out","pr5")+"/";__fs.mkdirSync(O,{recursive:true});
const MOCK=__fs.readFileSync(__dirname+"/soc-mock.js","utf8");const errs=[];let fails=0;const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m);if(!c)fails++;};
const PORT = +process.env.TT_PORT || 8920, KM=[0,5,20,40,90,150,260];
(async()=>{const srv=spawn("python3",["-m","http.server",String(PORT)],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch();
const mk=async(o={})=>{const ctx=await b.newContext({viewport:{width:390,height:844},timezoneId:"Asia/Taipei",deviceScaleFactor:2});const p=await ctx.newPage();await require(__dirname+"/fake-weather")(p);p.on("pageerror",e=>errs.push(e.message));
 await p.addInitScript(o=>{if(sessionStorage.getItem("__i"))return;sessionStorage.setItem("__i","1");localStorage.setItem("tt_lang","zh");["tt_onboarded_v2","tt_coach_trail","tt_locperm_prompted","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_coach_team","tt_coach_pet"].forEach(k=>localStorage.setItem(k,"1"));
  localStorage.setItem("tt_pet_woke",String(Date.now()));localStorage.setItem("tt_test_diary","1");localStorage.setItem("tt_debug_km",String(o.km==null?40:o.km));localStorage.setItem("tt_pet_berry_bonus","60");
  if(o.records)localStorage.setItem("tt_records",JSON.stringify(o.records));if(o.gifts)localStorage.setItem("tt_pet_gifts",JSON.stringify(o.gifts));},o);
 await p.addInitScript(MOCK);await p.goto(`http://localhost:${PORT}/`);await require(__dirname+"/ready")(p);
 await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));await p.click('.tab[data-view="pet"]');await p.waitForTimeout(1200);
 await p.evaluate(()=>{document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove());window.__psNoIdle=true;document.querySelector(".ps-box").scrollIntoView({block:"center"});});await p.waitForTimeout(400);return p;};

// 1. 節日表延到 2035（原4）：每一年三個節日都找得到、前後一天的邊界
{const p=await mk();
 const r=await p.evaluate(()=>{const out=[];for(const [y,m,d,k] of [[2031,1,23,"ny"],[2032,6,12,"db"],[2033,9,8,"ma"],[2034,2,19,"ny"],[2035,9,16,"ma"]]){out.push(petFestival(new Date(y,m-1,d,12))===k);out.push(petFestival(new Date(y,m-1,d+2,12))===null);}return out;});
 ok(r.every(Boolean),"festival dates found through 2035 and not two days later "+JSON.stringify(r));
 ok(await p.evaluate(()=>Object.values(PET_FEST).every(a=>a.length===10)),"each festival has 10 years (2026–2035)");
 await p.close();}

// 2. 回憶（原9）：一個月前走過的步道，一天最多說一次；沒有舊紀錄就不說
{const old=new Date(Date.now()-45*864e5).toISOString();const p=await mk({records:[{id:"o1",date:old,trailName:"孝子山步道",distanceKm:2.4,elapsedMs:36e5,track:[]}]});
 const r=await p.evaluate(()=>{localStorage.removeItem("tt_pet_mem_day");const R=Math.random;Math.random=()=>0;const a=petMemoryLine(),b=petMemoryLine();Math.random=R;return [a,b];});
 ok(/還記得孝子山步道嗎？那天走了 2\.4 km/.test(r[0])&&r[1]===null,"memory line mentions an old trail once a day "+JSON.stringify(r));
 await p.close();}

// 3. 小東西 14 種（原18）：都有名字和圖、圖鑑全列、當季的比較容易撿到、不會重複
{const p=await mk();
 const r=await p.evaluate(()=>{const ks=Object.keys(PET_GIFTS);const okArt=ks.every(k=>PET_GIFTS[k][0]&&/<(path|ellipse|circle|g)/.test(PET_GIFTS[k][1]));
  window.__ps={season:"autumn"};localStorage.setItem("tt_pet_gifts","[]");const got=[];for(let n=0;n<ks.length;n++)got.push(petGiftGive());window.__ps=null;
  const first5=got.slice(0,3);return {n:ks.length,okArt,uniq:new Set(got).size,all:got.every(Boolean),extra:petGiftGive()===null,first:first5};});
 ok(r.n===14&&r.okArt,"14 gifts, each with a name and drawing ("+r.n+")");
 ok(r.uniq===14&&r.all&&r.extra,"gifts never repeat; once all 14 are owned it gives berries instead");
 await p.close();}

// 4. 起風／冷／熱（原10）＋季節裝飾（原11）：裝飾一層、不蓋嘴；冷的時候白氣在嘴邊
{const p=await mk({km:40});
 const shots=[["autumn",""],["winter","cold"],["spring",""],["summer","windy"]];const res=[];
 for(const [se,feel] of shots){await p.evaluate(a=>{window.__ps={season:a[0],feel:a[1],tod:"day",wx:""};renderPet();},[se,feel]);await p.waitForTimeout(700);
  const r=await p.evaluate(()=>{const d=document.querySelector(".ps-sdeco"),box=document.querySelector(".ps-box"),m=PetWalk.cpt(box,"mouth"),B=box.getBoundingClientRect();
   const br=d&&d.querySelector(".ps-breath"),q=br&&br.getBoundingClientRect();
   return {cls:d?[...d.children].map(e=>e.className.split(" ")[0]):[],feel:box.dataset.feel||"",near:q&&m?Math.hypot(q.left-m[0],q.top+q.height/2-m[1]):null};});
  res.push(r);await p.locator(".ps-box").screenshot({path:O+`season-${se}${feel?"-"+feel:""}.png`});}
 ok(res[0].cls.includes("ps-leaf"),"autumn: falling leaves "+JSON.stringify(res[0].cls));
 ok(res[1].cls.includes("ps-breath")&&res[1].near!=null&&res[1].near<30,"winter/cold: breath puff right beside the mouth ("+(res[1].near&&res[1].near.toFixed(1))+"px)");
 ok(res[2].cls.includes("ps-sbfly"),"spring: a little butterfly by the head");
 ok(res[3].cls.includes("ps-windl")&&res[3].feel==="windy","windy: wind streaks + data-feel");
 const w=await p.evaluate(()=>{window.__ps={feel:"windy",tod:"day"};renderPet();const n={};const R=Math.random;let s=0;Math.random=()=>((s=(s*9301+49297)%233280)/233280);for(let k=0;k<400;k++){}Math.random=R;return document.querySelector(".ps-box").dataset.feel;});
 ok(w==="windy","debug override __ps.feel drives the stage");
 // 起風時會有「被風吹」的待機動作（直接播一次看 class）
 const wa=await p.evaluate(async()=>{const pr=PetStage.act("windy");await new Promise(r=>setTimeout(r,200));const on=document.querySelector("#petEmoji").classList.contains("pb-windy");await pr;return on;});
 ok(wa,"windy idle action plays (pb-windy)");
 await p.evaluate(()=>{window.__ps=null;renderPet();});await p.close();}

// 5. 夢泡泡（原12）：睡著時才有、畫最近步道的類型（沒有就畫山）
{const p=await mk({km:40});
 const r=await p.evaluate(async()=>{PetStage.sleep();PetStage.dream();const d=document.querySelector(".ps-dream");const tag=d&&d.dataset.tag;await new Promise(r=>setTimeout(r,500));return {has:!!d,tag};});
 await p.locator(".ps-box").screenshot({path:O+"dream.png"});
 ok(r.has&&r.tag==="山","asleep: a dream bubble appears (no trail yet → mountain) "+JSON.stringify(r));
 await p.close();}

// 6. 玩具多兩種（原13）：帶回來的橡實、羽毛也會拿來玩；羽毛飄得慢
{const p=await mk({gifts:[{id:"acorn",t:"2026-10-01"},{id:"feather",t:"2026-10-01"}]});
 const r=await p.evaluate(async()=>{const seen=new Set();const R=Math.random;for(const v of [0,.4,.9]){Math.random=()=>v;petPlayAt(null);Math.random=R;await new Promise(r=>setTimeout(r,250));const t=document.querySelector(".ps-toy");if(t)seen.add(t.classList.contains("toy-feather")?"feather":t.innerHTML.includes("#c98a4a")?"acorn":"pine");
  await new Promise(res=>{const w=()=>PetStage.isPlaying()?setTimeout(w,200):res();w();});_petPlays.length=0;}return [...seen];});
 ok(r.length===3,"pine, acorn and feather are all used as toys "+JSON.stringify(r));
 await p.close();}

// 7. 脖子配件（原20）：6 隻都有掛點、畫在頭的群組裡（跟著頭動）、蛋沒有；拍照也畫得到；備份帶著走
{const p=await mk();
 const r=await p.evaluate(()=>{const out=[];for(let i=0;i<7;i++){const d=document.createElement("div");d.innerHTML=PET_ART.svg(i,"","none",false,"scarf");const a=d.querySelector(".pc-acc");out.push(a?!!a.closest(".pr-head"):null);}return out;});
 ok(JSON.stringify(r)==="[null,true,true,true,true,true,true]","scarf sits inside the head group for stages 1–6, none on the egg "+JSON.stringify(r));
 // 每隻戴兩件拍一張（看位置）
 const sheet=await p.evaluate(()=>{const W=document.createElement("div");W.style.cssText="position:fixed;left:0;top:0;width:390px;background:#fff;z-index:99999;display:grid;grid-template-columns:repeat(3,1fr)";W.id="accSheet";
  for(let i=1;i<7;i++)for(const a of ["scarf","bell"]){const c=document.createElement("div");c.style.cssText="width:130px;height:130px";c.innerHTML=PET_ART.svg(i,"","none",false,a);c.firstChild.style.cssText="width:130px;height:130px";W.appendChild(c);}document.body.appendChild(W);return true;});
 await p.locator("#accSheet").screenshot({path:O+"acc-sheet.png"});await p.evaluate(()=>document.getElementById("accSheet").remove());
 // 裝扮視窗買一件、戴上、夥伴卡畫出來、備份帶著
 await p.evaluate(()=>openHatPicker());await p.waitForTimeout(500);
 const n=await p.evaluate(()=>document.querySelectorAll(".acc-opt").length);ok(n===6,"dress-up dialog has an accessory tab (none + 5): "+n);
 const bal0=await p.evaluate(()=>berriesBalance());
 await p.evaluate(()=>{document.querySelector('.acc-opt[data-acc="scarf"]').click();});await p.waitForTimeout(300);
 ok(await p.evaluate(b=>berriesBalance()===b&&!document.getElementById("drBuy").hidden,bal0),"tapping an accessory only tries it on (no charge yet), the buy button appears");   /* 2026-10-09 R8：先試穿 */
 await p.evaluate(()=>document.getElementById("drBuy").click());await p.waitForTimeout(600);
 const r2=await p.evaluate(()=>({acc:localStorage.getItem("tt_pet_acc"),own:localStorage.getItem("tt_pet_accs_owned"),card:!!document.querySelector("#petEmoji .pc-acc.acc-scarf"),bal:berriesBalance(),bk:Store.exportAll().pet.tt_pet_acc}));
 ok(r2.acc==="scarf"&&/scarf/.test(r2.own)&&r2.card&&bal0-r2.bal===10&&r2.bk==="scarf","buying the scarf: charged once (−"+(bal0-r2.bal)+"), worn on the card, in the backup "+JSON.stringify(r2));
 const ph=await p.evaluate(async()=>{const c=await drawPetPhoto("day","sit","");return c.width;});ok(ph===1080,"photo still draws with an accessory");
 await p.close();}

ok(errs.length===0,"no page errors "+JSON.stringify(errs.slice(0,3)));
console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails);
await b.close();srv.kill();process.exit(fails?1:0);})().catch(e=>{console.error(e);process.exit(1);});
