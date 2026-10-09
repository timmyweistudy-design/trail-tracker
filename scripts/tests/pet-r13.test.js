// 夥伴第三版 R13（2026-10-09）：小把戲＋擺設 3 個固定位置
//   1) 連續 3 天摸頭才學會（中間斷一天要重數），學會寫日記；之後換下一階要重新學
//   2) 七隻點兩下都會表演、播完才拿掉 class、最後一格回到原位（不頓一下）；龍會噴小雲；還沒學會點兩下不表演
//   3) 擺設：左、右在前景，後面的在角色後方；舊格式（陣列）照讀；選單切位置、同一件只擺一個位置
const __TTP = +process.env.TT_PORT || 8937;
const __path=require("path"),__fs=require("fs");
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");
const OUT=__path.join(__dirname,"out","r13");__fs.mkdirSync(OUT,{recursive:true});
const MOCK=__fs.readFileSync(__dirname+"/soc-mock.js","utf8");const errs=[];let fails=0;const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m);if(!c)fails++;};
const KM=[0,5,20,40,90,150,260];
(async()=>{const srv=spawn("python3",["-m","http.server",String(__TTP)],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch();
const mk=async km=>{const ctx=await b.newContext({viewport:{width:390,height:844},timezoneId:"Asia/Taipei"});const p=await ctx.newPage();await require(__dirname+"/fake-weather")(p);p.on("pageerror",e=>errs.push(e.message));
 await p.addInitScript(km=>{if(sessionStorage.getItem("seed"))return;sessionStorage.setItem("seed","1");localStorage.setItem("tt_lang","zh");["tt_onboarded_v2","tt_coach_trail","tt_locperm_prompted","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_coach_team","tt_coach_pet"].forEach(k=>localStorage.setItem(k,"1"));localStorage.setItem("tt_pet_woke",String(Date.now()));localStorage.setItem("tt_debug_km",String(km));
  const t=new Date(Date.now()-5*864e5).toISOString();localStorage.setItem("tt_pet_gifts",JSON.stringify([{id:"pine",t},{id:"maple",t},{id:"fern",t}]));},km);
 await p.addInitScript(MOCK);await p.goto("http://localhost:"+__TTP+"/");await require(__dirname+"/ready")(p);
 await p.evaluate(()=>{const d=new Date();d.setHours(11,0,0,0);ttClock.set(d);window.__psNoIdle=true;});
 await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));await p.click('.tab[data-view="pet"]');await p.waitForTimeout(1500);return p;};

// 1) 學會
{const p=await mk(90);
 const r=await p.evaluate(()=>{const day=n=>{const d=new Date();d.setDate(d.getDate()+n);d.setHours(11,0,0,0);ttClock.set(d);};const st=()=>JSON.parse(localStorage.getItem("tt_pet_trick_pat")||"{}").n||0;const out=[];
  day(0);petPatAff();petPatAff();out.push(st());   // 同一天摸兩次只算一天
  day(1);petPatAff();out.push(st());
  day(3);petPatAff();out.push(st());   // 斷了一天：重數
  day(4);petPatAff();out.push(st(),petTrickKnown(4));
  day(5);petPatAff();out.push(petTrickKnown(4),petTrickKnown(5),JSON.parse(localStorage.getItem("tt_pet_diary")||"[]").some(x=>x.k==="trick:4"));
  return out;});
 ok(r[0]===1&&r[1]===2,"streak counts days, not pats "+JSON.stringify(r));
 ok(r[2]===1,"a missed day restarts the count");
 ok(r[4]===false&&r[5]===true,"learned on the 3rd day in a row, not before");
 ok(r[6]===false&&r[7],"only this stage's trick is learned; diary entry written");
 await p.waitForTimeout(1200);
 ok(/學會新把戲了：踏踏腳/.test(await p.evaluate(()=>document.querySelector(".pet-bubble")?.textContent||"")),"the pet announces the new trick");
 await p.evaluate(()=>{const ov=document.querySelector(".pet-bubble");});
 await p.evaluate(()=>{document.getElementById("petDex").click();});await p.waitForTimeout(500);
 ok(await p.evaluate(()=>/把戲：踏踏腳/.test(document.querySelector('[data-ov="petdex"] .dex-row.now')?.textContent||"")),"handbook shows the learned trick on the current stage");
 await p.context().close();}

// 2) 表演
for(const st of [0,1,2,3,4,5,6]){const p=await mk(KM[st]);
 const em=await p.$("#petEmoji");const box=await em.boundingBox();const cx=box.x+box.width/2,cy=box.y+box.height*.6;
 await p.mouse.click(cx,cy);await p.waitForTimeout(120);await p.mouse.click(cx,cy);await p.waitForTimeout(150);
 const no=await p.evaluate(()=>document.querySelector("#petEmoji").classList.contains("pb-trick"));
 await p.waitForTimeout(1200);
 await p.evaluate(st=>{localStorage.setItem("tt_pet_tricks",JSON.stringify({[st]:new Date().toISOString()}));},st);
 await p.waitForTimeout(400);
 const r0=await p.evaluate(()=>{const c=document.querySelector("#petEmoji .pet-critter").getBoundingClientRect();return [c.x,c.y,c.width];});
 await p.mouse.click(cx,cy);await p.waitForTimeout(120);await p.mouse.click(cx,cy);await p.waitForTimeout(250);
 const on=await p.evaluate(()=>({on:document.querySelector("#petEmoji").classList.contains("pb-trick"),anims:document.querySelector("#petEmoji").getAnimations({subtree:true}).filter(a=>a.animationName&&/^pbt/.test(a.animationName)).length,puff:!!document.querySelector(".ps-puff")}));
 if(st===4||st===6){await p.waitForTimeout(300);await p.screenshot({path:OUT+`/trick-${st}.png`,clip:{x:0,y:60,width:390,height:420}});}
 const end=await p.waitForFunction(()=>!document.querySelector("#petEmoji").classList.contains("pb-trick"),null,{timeout:5000}).then(()=>true).catch(()=>false);
 const r1=await p.evaluate(()=>{const c=document.querySelector("#petEmoji .pet-critter").getBoundingClientRect();return [c.x,c.y,c.width];});
 const jump=Math.max(...r0.map((v,k)=>Math.abs(v-r1[k])));
 ok(!no,`stage ${st}: double-tap before learning does nothing special`);
 ok(on.on&&on.anims>=1&&end,`stage ${st}: double-tap performs the trick and it finishes ${JSON.stringify(on)}`);
 ok(jump<2,`stage ${st}: ends where it started (moved ${jump.toFixed(1)}px)`);
 if(st>=5)ok(on.puff,`stage ${st}: puffs a little cloud`);
 await p.context().close();}

// 3) 擺設
{const p=await mk(90);
 const r=await p.evaluate(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));
  localStorage.setItem("tt_pet_props",JSON.stringify({l:"maple",r:"pine",b:"fern"}));renderPet();await w(300);
  const z=el=>+getComputedStyle(el).zIndex||0,front=document.querySelector(".ps-props:not(.ps-props-b)"),back=document.querySelector(".ps-props-b"),actor=document.querySelector(".ps-box .ps-actor");
  const a={l:!!front?.querySelector(".ps-pp.l"),r:!!front?.querySelector(".ps-pp.r"),b:!!back?.querySelector(".ps-pp.b"),behind:back&&actor?z(back)<z(actor):false,inFront:front&&actor?z(front)>z(actor):false};
  localStorage.setItem("tt_pet_props",JSON.stringify(["pine","tent"]));renderPet();await w(300);
  const legacy={l:!!document.querySelector(".ps-pp.l"),n:document.querySelectorAll(".ps-pp").length};
  return {a,legacy};});
 ok(r.a.l&&r.a.r&&r.a.b,"three slots drawn (left, right, back) "+JSON.stringify(r.a));
 ok(r.a.behind&&r.a.inFront,"back slot is behind the pet; left/right in front");
 ok(r.legacy.l&&r.legacy.n===1,"old saved format (list) still works; locked items not shown "+JSON.stringify(r.legacy));
 await p.evaluate(()=>{localStorage.setItem("tt_pet_props",JSON.stringify({l:"maple",r:"pine",b:"fern"}));renderPet();});await p.waitForTimeout(400);
 await p.screenshot({path:OUT+"/props.png",clip:{x:0,y:60,width:390,height:420}});
 await p.click("#petDress");await p.waitForTimeout(500);
 const pk=await p.evaluate(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));const tab=[...document.querySelectorAll('[data-ov="pethat"] .dr-tabs button')].find(b=>/擺設/.test(b.textContent));if(tab)tab.click();await w(200);
  const slots=[...document.querySelectorAll(".prop-slot")].map(b=>b.textContent.trim());
  document.querySelector('.prop-slot[data-slot="b"]').click();await w(100);const onB=[...document.querySelectorAll(".prop-it.on")].map(b=>b.dataset.prop);
  document.querySelector('.prop-it[data-prop="maple"]').click();await w(150);const s1=JSON.parse(localStorage.getItem("tt_pet_props"));
  document.querySelector('.prop-it[data-prop="maple"]').click();await w(150);const s2=JSON.parse(localStorage.getItem("tt_pet_props"));
  return {slots,onB,s1,s2};});
 ok(pk.slots.length===3&&/左邊/.test(pk.slots[0])&&/後面/.test(pk.slots[1])&&/右邊/.test(pk.slots[2]),"picker has the three slots "+JSON.stringify(pk.slots));
 ok(pk.onB.join()==="fern","choosing the back slot highlights what's there");
 ok(pk.s1.b==="maple"&&pk.s1.l===null,"picking an item used elsewhere moves it (one item, one place) "+JSON.stringify(pk.s1));
 ok(pk.s2.b===null,"tap again to take it down");
 await p.waitForTimeout(300);await p.screenshot({path:OUT+"/picker.png"});
 await p.context().close();}
console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails+(errs.length?1:0));await b.close();srv.kill();process.exit(0);})();
