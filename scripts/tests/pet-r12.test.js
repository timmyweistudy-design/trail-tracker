// 夥伴第三版 R12（2026-10-09）：社群·互動，用假 Supabase（RPC 換成記錄呼叫的替身）驗證
//   1) 送小東西：選一件 → give_pet_item → 成功才從手冊拿掉、寫日記；dup／daily 不拿掉；回應斷掉時查一次對方收到沒；離線不能按
//   2) 領取：手冊沒有的收進去（記下誰送的），已經有的換 3 顆果實
//   3) 回訪：朋友今天來過才出現；你的夥伴走進對方舞台、松果拋一個來回、兩隻不疊位、玩完就停；同一天第二次不行
//   4) 備份合併：送出去的小東西不會被舊備份帶回來
//   5) 小隊地圖：隊友的夥伴戴帽子＋配件（pet_look），舊版只有 emoji 照舊；亂填的值不畫
const __TTP = +process.env.TT_PORT || 8933;
const __path=require("path"),__fs=require("fs");
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");
const OUT=__path.join(__dirname,"out","r12");__fs.mkdirSync(OUT,{recursive:true});
const MOCK=__fs.readFileSync(__dirname+"/soc-mock.js","utf8");const errs=[];let fails=0;const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m);if(!c)fails++;};
const R=[0,1,2].map(i=>({id:"r"+i,date:new Date(Date.now()-(i+1)*864e5).toISOString(),trailName:"x",distanceKm:30,elapsedMs:7200e3,ascent:500,track:[]}));
(async()=>{const srv=spawn("python3",["-m","http.server",String(__TTP)],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch();
const mk=async()=>{const ctx=await b.newContext({viewport:{width:390,height:844},timezoneId:"Asia/Taipei"});const p=await ctx.newPage();await require(__dirname+"/fake-weather")(p);p.on("pageerror",e=>errs.push(e.message));
 await p.addInitScript(o=>{if(sessionStorage.getItem("seed"))return;sessionStorage.setItem("seed","1");localStorage.setItem("tt_lang","zh");["tt_onboarded_v2","tt_coach_trail","tt_locperm_prompted","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_coach_team","tt_coach_pet"].forEach(k=>localStorage.setItem(k,"1"));localStorage.setItem("tt_records",o.recs);localStorage.setItem("tt_pet_woke",String(Date.now()));localStorage.setItem("tt_pet_hat","bandana");localStorage.setItem("tt_pet_acc","bell");
  const t=new Date(Date.now()-5*864e5).toISOString();localStorage.setItem("tt_pet_gifts",JSON.stringify([{id:"pine",t},{id:"maple",t},{id:"fern",t}]));},{recs:JSON.stringify(R)});
 await p.addInitScript(MOCK);await p.goto("http://localhost:"+__TTP+"/");await require(__dirname+"/ready")(p);
 // RPC 替身：照 window.__rpcPlan 回答，記下每一次呼叫
 await p.evaluate(()=>{window.__installFakeSupa({});const c=Supa.client(),orig=c.rpc;window.__rpcLog=[];window.__rpcPlan={};
  c.rpc=async(n,a)=>{window.__rpcLog.push([n,a]);const v=window.__rpcPlan[n];if(v===undefined)return orig(n,a);if(v==="THROW")throw new Error("Failed to fetch");return typeof v==="function"?v(a):{data:v,error:null};};});
 await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));await p.click('.tab[data-view="pet"]');await p.waitForTimeout(1500);return p;};
const own=p=>p.evaluate(()=>petGiftsOwned().map(o=>o.id).sort().join(","));
const toast=p=>p.evaluate(()=>document.getElementById("toast").textContent);
const diary=p=>p.evaluate(()=>{const d=document.createElement("div");d.innerHTML=petDiaryHtml();return d.innerText;});
const pick=async(p,id)=>{await p.waitForSelector(".ttdlg-ov .btn",{timeout:4000});await p.evaluate(nm=>{const b=[...document.querySelectorAll(".ttdlg-ov .btn")].find(x=>x.textContent.includes(nm));b.click();},id);await p.waitForTimeout(400);};
const openVisit=async(p,id="u1")=>{await p.evaluate(()=>{const x=document.querySelector('[data-ov="petvisit"]');if(x)x.remove();});await p.click(`#petFriends .fp-visit[data-id="${id}"]`);await p.waitForTimeout(600);};

// 1) 送小東西
{const p=await mk();await p.waitForSelector('#petFriends .fp-visit[data-id="u1"]',{timeout:8000}).catch(()=>{});
 await openVisit(p);
 ok(await p.evaluate(()=>!!document.querySelector("#pvItem:not([disabled])")),"visit card has a 'give a little gift' button");
 await p.evaluate(()=>{window.__rpcPlan.give_pet_item="ok";});
 await p.click("#pvItem");await p.waitForSelector(".ttdlg-ov",{timeout:4000});
 const choices=await p.evaluate(()=>[...document.querySelectorAll(".ttdlg-ov .btn")].map(b=>b.textContent.trim()));
 ok(choices.length===4&&choices.some(t=>/松果/.test(t))&&choices.some(t=>/楓葉/.test(t)),"picker lists my 3 items + cancel "+JSON.stringify(choices));
 await p.waitForTimeout(500);await p.screenshot({path:OUT+"/picker.png"});
 await pick(p,"松果");
 const call=await p.evaluate(()=>window.__rpcLog.filter(x=>x[0]==="give_pet_item").pop());
 ok(call&&call[1].p_to==="u1"&&call[1].p_item==="pine","RPC give_pet_item(u1, pine) "+JSON.stringify(call));
 ok(await own(p)==="fern,maple","given item leaves my collection ("+await own(p)+")");
 ok(/送給 毛毛 了/.test(await toast(p)),"toast: given");
 ok(/送給 毛毛 一個松果/.test(await diary(p)),"diary: gave 毛毛 a pine cone");
 await p.evaluate(()=>{window.__rpcPlan.give_pet_item="dup";});await p.click("#pvItem");await pick(p,"楓葉");
 ok(await own(p)==="fern,maple"&&/已經送過 毛毛/.test(await toast(p)),"dup: item kept, says already given");
 await p.evaluate(()=>{window.__rpcPlan.give_pet_item="daily";});await p.click("#pvItem");await pick(p,"楓葉");
 ok(await own(p)==="fern,maple"&&/明天再送/.test(await toast(p)),"daily: item kept, try tomorrow");
 // 回應斷掉：查 pet_item_gifts，對方已經收到 → 算成功
 await p.evaluate(()=>{window.__rpcPlan.give_pet_item="THROW";window.__fakeT.pet_item_gifts=[{from_user:"me",to_user:"u1",item:"maple"}];});await p.click("#pvItem");await pick(p,"楓葉");
 ok(await own(p)==="fern","lost response but the friend got it: counted as given (no duplicate)");
 await p.evaluate(()=>{window.__fakeT.pet_item_gifts=[];});await p.click("#pvItem");await pick(p,"蕨葉");
 ok(await own(p)==="fern"&&/沒送出去/.test(await toast(p)),"lost response and the friend didn't get it: kept, try again");
 await p.context().setOffline(true);await openVisit(p);
 ok(await p.evaluate(()=>!!document.querySelector("#pvItem[disabled]")&&/離線/.test(document.querySelector("#pvItem").textContent)),"offline: button disabled");
 await p.context().setOffline(false);
// 4) 備份合併：舊備份裡還有松果、楓葉 → 不帶回來；之後才撿到的照留
 const m=await p.evaluate(()=>{const old=new Date(Date.now()-5*864e5).toISOString(),later=new Date(Date.now()+60e3).toISOString();
  Store.importAll({v:2,pet:{tt_pet_gifts:JSON.stringify([{id:"pine",t:old},{id:"maple",t:old},{id:"acorn",t:old}])}},"merge");const a=petGiftsOwned().map(o=>o.id).sort().join(",");
  Store.importAll({v:2,pet:{tt_pet_gifts:JSON.stringify([{id:"pine",t:later}])}},"merge");return [a,petGiftsOwned().map(o=>o.id).sort().join(",")];});
 ok(m[0]==="acorn,fern","merging an old backup doesn't bring back given items ("+m[0]+")");
 ok(m[1]==="acorn,fern,pine","an item found again after giving it away is kept ("+m[1]+")");
// 2) 領取
 const c=await p.evaluate(async()=>{window.__rpcPlan.claim_pet_items=[{item:"crystal",from_user:"u1",from_name:"阿梅"},{item:"fern",from_user:"u3",from_name:"許"},{item:"zzz",from_user:"u3",from_name:"許"}];
  const b0=berriesBalance();const n=await Pets.claimItems();return {n,got:petGiftsOwned().find(o=>o.id==="crystal"),db:berriesBalance()-b0};});
 ok(c.n===3&&c.got&&c.got.from==="阿梅","new item goes into the collection with who sent it "+JSON.stringify(c.got));
 ok(c.db===6,"already-owned + unknown item → 3 berries each (+"+c.db+")");
 ok(/收到 阿梅 送的小水晶/.test(await diary(p)),"diary: got a crystal from 阿梅");
 await p.context().close();}

// 3) 回訪
{const p=await mk();await p.waitForSelector('#petFriends .fp-visit[data-id="u1"]',{timeout:8000}).catch(()=>{});
 ok(await p.evaluate(()=>!document.querySelector("#fpReturn")),"no return-visit banner before anyone visited");
 await p.evaluate(async()=>{localStorage.setItem("tt_pet_guest_who",JSON.stringify({id:"u1",day:todayStr()}));window.__rpcPlan.pet_return_visit="ok";await Pets.renderFriends();});
 ok(await p.evaluate(()=>/毛毛 今天來過/.test(document.querySelector("#fpReturn")?.textContent||"")),"banner: 毛毛 came by today → return visit");
 await p.screenshot({path:OUT+"/banner.png"});
 await p.click("#fpReturn");await p.waitForTimeout(1000);
 const g=await p.evaluate(()=>{const a=document.querySelector(".fv-me")?.getBoundingClientRect(),f=document.querySelector(".fv-together .fv-critter")?.getBoundingClientRect();return a&&f?{gap:Math.round(f.left-a.right),me:!!document.querySelector(".fv-me .pc-acc.acc-bell"),cone:!!document.querySelector(".fv-cone")}:null;});
 ok(g&&g.gap>=0,"my pet and the friend's pet don't overlap "+JSON.stringify(g));
 ok(g&&g.me,"my pet walks in wearing my accessory");
 await p.waitForTimeout(400);await p.screenshot({path:OUT+"/together.png"});
 const done=await p.waitForFunction(()=>document.querySelector(".fv-stage")?.dataset.played==="1"&&!document.querySelector(".fv-cone"),null,{timeout:6000}).then(()=>true).catch(()=>false);
 ok(done,"pine-cone game plays once and stops");
 ok(await p.evaluate(()=>document.querySelector(".fv-me").getAnimations().filter(a=>a.playState==="running").length===0),"nothing keeps animating afterwards");
 ok(/去 毛毛 家玩/.test(await diary(p)),"diary: visited 毛毛");
 await p.evaluate(()=>document.querySelector('[data-ov="petvisit"]').remove());await p.evaluate(()=>Pets.renderFriends());await p.waitForTimeout(300);
 ok(await p.evaluate(()=>!document.querySelector("#fpReturn")),"banner gone after visiting today");
 const r2=await p.evaluate(async()=>{window.__rpcPlan.pet_return_visit="daily";window.__rpcLog=[];await Pets.returnVisit(window.__fakeT.profiles.find(x=>x.id==="u1"),false,null);return {open:!!document.querySelector('[data-ov="petvisit"]'),t:document.getElementById("toast").textContent};});
 ok(!r2.open&&/今天已經去過 毛毛 家了/.test(r2.t),"second visit same day: refused "+JSON.stringify(r2));
 const v=await p.evaluate(async()=>{window.__rpcPlan.claim_pet_visits=[{from_user:"u3",from_name:"許",pet_name:"雲豹"}];return Pets.claimVisits();});
 ok(v===1&&/雲豹 回訪了我們家/.test(await diary(p)),"host side: diary records the return visit");
// 5) 小隊地圖
 const t=await p.evaluate(()=>{const h=m=>{const d=document.createElement("div");d.innerHTML=TeamLive._petHtml(m);return d;};
  const a=h({pet:"🦊",look:{s:3,h:"straw",a:"scarf"}}),o=h({pet:"🦊"}),x=h({pet:"🦊",look:{s:9,h:"<b>",a:"x"}}),y=h({pet:"🦊",look:{s:4,h:"<b>",a:"zz"}});
  return {look:!!a.querySelector('.pet-critter[data-s="3"]')&&!!a.querySelector(".pc-hat")&&!!a.querySelector(".pc-acc.acc-scarf"),old:!!o.querySelector('.pet-critter[data-s="3"]')&&!o.querySelector(".pc-hat,.pc-acc"),bad:!!x.querySelector('.pet-critter[data-s="3"]')&&!x.querySelector(".pc-acc"),junk:!!y.querySelector('.pet-critter[data-s="4"]')&&!y.querySelector(".pc-hat,.pc-acc"),mine:TeamLive._myLook()};});
 ok(t.look,"teammate with pet_look: right stage + hat + scarf");
 ok(t.old,"old client (emoji only): still drawn, nothing worn");
 ok(t.bad&&t.junk,"out-of-range stage / unknown ids: fall back, nothing odd drawn");
 ok(t.mine&&t.mine.h==="bandana"&&t.mine.a==="bell"&&t.mine.s>=0,"my look sent to the team "+JSON.stringify(t.mine));
 await p.context().close();}
console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails+(errs.length?1:0));await b.close();srv.kill();process.exit(0);})();
