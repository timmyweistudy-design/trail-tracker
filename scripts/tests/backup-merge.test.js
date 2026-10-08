// 備份合併規則（2026-10-08 修正案 A5，修 F3／F4）：手動「合併」匯入以前會把夥伴資料整份蓋掉——日記少掉、果實變多、階段倒退。
// 這裡用真的 Store.importAll 跑各種情況：舊格式、同一份還原兩次、本機比較新、備份比較新、新手機的新蛋、壞掉一半、完全取代、冷卻與禮物不重來
const __path=require("path"),__fs=require("fs");
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");
const MOCK=__fs.readFileSync(__dirname+"/soc-mock.js","utf8");const errs=[];let fails=0;const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m);if(!c)fails++;};
const PORT = +process.env.TT_PORT || 8915;
(async()=>{const srv=spawn("python3",["-m","http.server",String(PORT)],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:390,height:844},timezoneId:"Asia/Taipei"});const p=await ctx.newPage();await require(__dirname+"/fake-weather")(p);p.on("pageerror",e=>errs.push(e.message));
await p.addInitScript(()=>{if(sessionStorage.getItem("__i"))return;sessionStorage.setItem("__i","1");localStorage.setItem("tt_lang","zh");["tt_onboarded_v2","tt_coach_trail","tt_locperm_prompted","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_coach_team","tt_coach_pet"].forEach(k=>localStorage.setItem(k,"1"));});
await p.addInitScript(MOCK);await p.goto(`http://localhost:${PORT}/`);await p.waitForTimeout(2500);
// 每個情況：清掉夥伴鍵 → 灌本機 → importAll(備份, mode) → 讀回來
const run=(local,backup,mode)=>p.evaluate(([local,backup,mode])=>{const K=Object.keys(localStorage).filter(k=>/^tt_(pet|ach|badges|quest|peaks|mch|pj|life)/.test(k));K.forEach(k=>localStorage.removeItem(k));
  for(const k in local)localStorage.setItem(k,local[k]);let res=null,err=null;try{res=Store.importAll(backup,mode);}catch(e){err=e.message;}
  const g=k=>localStorage.getItem(k);return {res,err,g:Object.fromEntries(Object.keys(localStorage).filter(k=>/^tt_/.test(k)).map(k=>[k,g(k)]))};},[local,backup,mode]);
const D=(...ks)=>JSON.stringify(ks.map(([k,t])=>({t:"2026-10-0"+t+"T10:00:00.000Z",k,i:2})));
const old={v:2,exportedAt:"2026-09-01T00:00:00Z",records:[],favs:[],log:{},pet:{tt_pet_hatch:"2026-05-01T00:00:00.000Z",tt_pet_base:"0",tt_pet_name:"小綠",tt_pet_stage:"3",tt_pet_berry_spent:"20",tt_pet_berry_bonus:"4",tt_pet_feedkm:"1.2",
  tt_pet_diary:D(["hello",1],["feed1",2],["hug1",3]),tt_pet_gifts:JSON.stringify([{id:"pine",t:"2026-09-01"}]),tt_pet_gift_t:String(Date.parse("2026-09-01")),tt_pet_fed_t:String(Date.parse("2026-09-01")),tt_pet_aff:"40",tt_pet_aff_t:"2026-09-01T00:00:00.000Z",tt_pet_hat:"straw",tt_badges_got:'["a","b"]'}};

// 1. 舊格式（沒有 petV）合併進「本機沒有夥伴」的新手機：整份回來
{const r=await run({},old,"merge");ok(!r.err&&r.g.tt_pet_name==="小綠"&&r.g.tt_pet_stage==="3"&&JSON.parse(r.g.tt_pet_diary).length===3,"old-format backup into an empty device restores everything "+JSON.stringify(r.res));}
// 2. 匯出的新格式帶 petV
ok(await p.evaluate(()=>Store.exportAll().petV===1),"exportAll writes petV: 1");
// 3. 本機比較新（花了更多果實、日記更多、階段更高）＋舊備份合併：一樣都不能倒退
{const local={tt_pet_hatch:"2026-05-01T00:00:00.000Z",tt_pet_base:"0",tt_pet_name:"小綠",tt_pet_stage:"4",tt_pet_berry_spent:"50",tt_pet_berry_bonus:"6",tt_pet_feedkm:"2.5",
  tt_pet_diary:D(["hello",1],["feed1",2],["hug1",3],["evo",5],["gift:pine",6]),tt_pet_gifts:JSON.stringify([{id:"pine",t:"2026-09-01"},{id:"leaf",t:"2026-10-05"}]),tt_pet_gift_t:String(Date.parse("2026-10-05")),tt_pet_fed_t:String(Date.parse("2026-10-07")),tt_pet_aff:"80",tt_pet_aff_t:"2026-10-07T00:00:00.000Z",tt_pet_hat:"crown",tt_badges_got:'["a","c"]'};
 const r=await run(local,old,"merge"),g=r.g;
 ok(g.tt_pet_stage==="4"&&g.tt_pet_berry_spent==="50"&&g.tt_pet_berry_bonus==="6"&&g.tt_pet_feedkm==="2.5","counters never go backwards (stage 4, spent 50, bonus 6, feedkm 2.5)");
 ok(JSON.parse(g.tt_pet_diary).length===5&&JSON.parse(g.tt_pet_gifts).length===2,"diary and gifts keep the newer local entries (5 / 2)");
 ok(g.tt_pet_fed_t===local.tt_pet_fed_t&&g.tt_pet_gift_t===local.tt_pet_gift_t,"cooldown and gift timestamps keep the newer one");
 ok(g.tt_pet_aff==="80"&&g.tt_pet_hat==="crown","affinity follows the newer timestamp; preferences stay local");
 ok(JSON.stringify(JSON.parse(g.tt_badges_got).sort())==='["a","b","c"]',"badges are unioned (a, b, c)");
 // 4. 同一份再合併一次：結果完全一樣（不重複、不累加）
 const r2=await p.evaluate(b=>{const before=JSON.stringify(Object.fromEntries(Object.keys(localStorage).filter(k=>/^tt_pet/.test(k)).sort().map(k=>[k,localStorage.getItem(k)])));const res=Store.importAll(b,"merge");const after=JSON.stringify(Object.fromEntries(Object.keys(localStorage).filter(k=>/^tt_pet/.test(k)).sort().map(k=>[k,localStorage.getItem(k)])));return [before===after,res.applied];},old);
 ok(r2[0]&&r2[1]===0,"merging the same backup twice changes nothing (applied "+r2[1]+")");}
// 5. 備份比較新（另一台手機走更多）：取備份的大值與新日記
{const newer=JSON.parse(JSON.stringify(old));Object.assign(newer.pet,{tt_pet_stage:"5",tt_pet_berry_spent:"90",tt_pet_diary:D(["hello",1],["feed1",2],["hug1",3],["evo",8]),tt_pet_aff:"95",tt_pet_aff_t:"2026-10-08T00:00:00.000Z"});
 const r=await run({tt_pet_hatch:"2026-05-01T00:00:00.000Z",tt_pet_stage:"3",tt_pet_berry_spent:"20",tt_pet_diary:D(["hello",1]),tt_pet_aff:"40",tt_pet_aff_t:"2026-09-01T00:00:00.000Z"},newer,"merge"),g=r.g;
 ok(g.tt_pet_stage==="5"&&g.tt_pet_berry_spent==="90"&&JSON.parse(g.tt_pet_diary).length===4&&g.tt_pet_aff==="95","newer backup wins where it is ahead (stage 5, spent 90, diary 4, affinity 95)");}
// 6. 新手機一打開就孵了新蛋（今天），雲端有養了很久的那隻：身分跟著比較早孵化的那隻
{const r=await run({tt_pet_hatch:new Date().toISOString(),tt_pet_base:"0",tt_pet_stage:"0",tt_pet_name:""},old,"merge"),g=r.g;
 ok(g.tt_pet_hatch===old.pet.tt_pet_hatch&&g.tt_pet_name==="小綠"&&g.tt_pet_stage==="3","a brand-new egg does not overwrite the long-raised pet from the backup");}
// 7. 壞掉一半：清單那一項不是 JSON → 只略過那一項，其他照樣合併，不丟錯
{const bad=JSON.parse(JSON.stringify(old));bad.pet.tt_pet_gifts="{壞掉";bad.pet.tt_pet_stage="6";
 const r=await run({tt_pet_hatch:"2026-05-01T00:00:00.000Z",tt_pet_stage:"3",tt_pet_gifts:'[{"id":"pine"}]'},bad,"merge");
 ok(!r.err&&r.res.errors.includes("tt_pet_gifts")&&r.g.tt_pet_stage==="6"&&r.g.tt_pet_gifts==='[{"id":"pine"}]',"a broken entry is skipped and reported; the rest still merges "+JSON.stringify(r.res));}
// 8. 完全取代：整份換成備份（使用者自己選的）
{const r=await run({tt_pet_hatch:"2026-05-01T00:00:00.000Z",tt_pet_stage:"5",tt_pet_berry_spent:"90"},old,"replace");
 ok(r.g.tt_pet_stage==="3"&&r.g.tt_pet_berry_spent==="20","replace mode overwrites with the backup (stage 3, spent 20)");}
// 9. 合併後重開 App：果實餘額沒有變多、禮物不會又送一次、冷卻沒有重來
{await run({tt_pet_hatch:"2026-05-01T00:00:00.000Z",tt_pet_berry_spent:"50",tt_pet_gift_t:String(Date.now()),tt_pet_fed_t:String(Date.now())},old,"merge");
 await p.reload();await p.waitForTimeout(2500);
 const r=await p.evaluate(()=>[localStorage.getItem("tt_pet_berry_spent"),petGiftDue(),feedCooldownMs()>7*3600e3]);
 ok(r[0]==="50"&&r[1]===false&&r[2]===true,"after merging an old backup and reopening: spent stays 50, no repeat gift, cooldown kept "+JSON.stringify(r));}

ok(errs.length===0,"no page errors "+JSON.stringify(errs.slice(0,3)));
console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails);   // run-all 讀這兩行判斷成敗
await b.close();srv.kill();process.exit(fails?1:0);})().catch(e=>{console.error(e);process.exit(1);});
