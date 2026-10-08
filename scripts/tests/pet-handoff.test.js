// 夥伴動作交接（2026-10-08 修正案 R1：先把已知問題寫成會重現的測試，R2 的 A2「統一動作仲裁」再修）
// KNOWN 裡的項目＝已確認的 bug：失敗時印 XFAIL（不擋 CI）；哪天修好了會印 XPASS 並算失敗——提醒把它從 KNOWN 拿掉、變成正式的檢查。
// 每一項都用「正確的行為」寫判斷，不是寫「現在的行為」。
const __path=require("path"),__fs=require("fs");
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");
const MOCK=__fs.readFileSync(__dirname+"/soc-mock.js","utf8");const errs=[];let fails=0,xf=0;
const KNOWN=new Set(["F1","F1b","F2a","F2c"]);   // R2 修好一個就拿掉一個
const ok=(c,m,id)=>{if(id&&KNOWN.has(id)){if(c){console.log("XPASS "+id+" "+m+"（修好了：把 "+id+" 從 KNOWN 拿掉）");fails++;}else{console.log("XFAIL "+id+" "+m);xf++;}return;}console.log((c?"PASS ":"FAIL ")+(id?id+" ":"")+m);if(!c)fails++;};
const PORT = +process.env.TT_PORT || 8914;
(async()=>{const srv=spawn("python3",["-m","http.server",String(PORT)],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch();
const mk=async(km)=>{const ctx=await b.newContext({viewport:{width:390,height:844},timezoneId:"Asia/Taipei"});const p=await ctx.newPage();await require(__dirname+"/fake-weather")(p);p.on("pageerror",e=>errs.push(e.message));
 await p.addInitScript(km=>{localStorage.setItem("tt_lang","zh");["tt_onboarded_v2","tt_coach_trail","tt_locperm_prompted","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_coach_team","tt_coach_pet"].forEach(k=>localStorage.setItem(k,"1"));
  localStorage.setItem("tt_pet_woke",String(Date.now()));localStorage.setItem("tt_test_diary","1");localStorage.setItem("tt_debug_km",String(km));localStorage.setItem("tt_pet_berry_bonus","30");window.__psNoIdle=true;},km);
 await p.addInitScript(MOCK);await p.goto(`http://localhost:${PORT}/`);await p.waitForTimeout(2500);
 await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));await p.click('.tab[data-view="pet"]');await p.waitForTimeout(1200);
 await p.evaluate(()=>{document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove());document.querySelector(".ps-box").scrollIntoView({block:"center"});});await p.waitForTimeout(500);return p;};
// 每 80ms 看一次舞台：吃東西的時候有沒有出現待機動作的 class、訪客和餵食有沒有同時在
const IDLE=["pb-hop","pb-stretch","pb-yawn","pb-sigh","pb-blink2","pb-shake","pb-shiver","pb-bask"];
const watch=p=>p.evaluate(IDLE=>{window.__hw={idleWhileFeeding:[],guestWhileFeeding:0,playWhileAsleep:0,playWhileGuest:0};const t=setInterval(()=>{const box=document.querySelector(".ps-box"),em=box&&box.querySelector("#petEmoji");if(!box)return;
  const feeding=box.classList.contains("feeding"),guest=!!box.querySelector(".ps-guest"),playing=box.classList.contains("playing"),asleep=box.classList.contains("ps-asleep");
  if(feeding){const c=IDLE.filter(k=>em.classList.contains(k));if(c.length)window.__hw.idleWhileFeeding.push(...c);if(guest)window.__hw.guestWhileFeeding++;}
  if(playing&&asleep)window.__hw.playWhileAsleep++;if(playing&&guest)window.__hw.playWhileGuest++;},80);window.__hwStop=()=>clearInterval(t);},IDLE);
const result=p=>p.evaluate(()=>{window.__hwStop();return window.__hw;});

// ── F1：待機動作播到一半開始餵食 → 待機動作結束時把「忙碌」解掉，接下來的待機排程會在吃到一半插一個動作 ──
// 重現：幼龍（餵食很長）。先播「晒太陽」（2.2 秒）→ 0.1 秒後餵食 → 晒太陽結束後心情變了（setMood 會重排待機）→
//       Math.random 固定成 0：下一拍 3.5 秒後、挑第一個動作（開心＝跳）。正確：吃東西時不准有任何待機動作。
{const p=await mk(150);await watch(p);
 await p.evaluate(()=>{PetStage.act("bask");setTimeout(()=>PetStage.feed(BERRY_SVG),100);});
 await p.waitForTimeout(2700);
 const mid=await p.evaluate(()=>{const f=document.querySelector(".ps-box").classList.contains("feeding");window.__psNoIdle=false;window.__rnd=Math.random;Math.random=()=>0;PetStage.setMood("happy");return f;});
 ok(mid,"setup: still feeding when the idle act has finished");
 await p.waitForTimeout(5000);await p.evaluate(()=>{Math.random=window.__rnd;window.__psNoIdle=true;});
 await p.waitForFunction(()=>!document.querySelector(".ps-box").classList.contains("feeding"),null,{timeout:90000});
 const r=await result(p),seen=[...new Set(r.idleWhileFeeding)];
 // F1b：開始吃的那一刻，正在播的晒太陽沒有停（兩個動作同時在角色身上）→ 規則 2：新動作要接手，舊的待機動作要中止
 ok(!seen.includes("pb-bask"),"the idle act that was playing stops when feeding starts ("+JSON.stringify(seen)+")","F1b");
 // F1：晒太陽結束後，下一拍待機在吃到一半插進來（跳）
 ok(seen.filter(k=>k!=="pb-bask").length===0,"no new idle action starts while eating ("+JSON.stringify(seen)+")","F1");
 await p.close();}

// ── F2a：朋友的夥伴來串門子的時候按餵食 → 正確：等訪客走了才吃（或回一句「朋友來玩了」），不能兩件事疊在一起 ──
{const p=await mk(40);await watch(p);
 await p.evaluate(()=>{PetStage.guest({svg:PET_ART.svg(2,"","none"),stay:4000});setTimeout(()=>PetStage.feed(BERRY_SVG),900);});
 await p.waitForTimeout(3000);
 await p.waitForFunction(()=>!document.querySelector(".ps-box").classList.contains("feeding")&&!document.querySelector(".ps-guest"),null,{timeout:90000});
 const r=await result(p);ok(r.guestWhileFeeding===0,"feeding never overlaps a guest visit ("+r.guestWhileFeeding+" samples overlapped)","F2a");
 ok(await p.evaluate(()=>document.querySelectorAll(".ps-berry,.ps-guest").length===0),"no berries or guest left on stage afterwards");
 await p.close();}

// ── F2b（對照組，本來就對）：睡著時玩松果會先醒來（play() 先 wake()；修正案 v1 誤列為問題，2026-10-08 更正）──
{const p=await mk(40);await watch(p);
 await p.evaluate(()=>{PetStage.sleep();PetStage.play(BERRY_SVG);});
 await p.waitForTimeout(1500);
 await p.waitForFunction(()=>!document.querySelector(".ps-box").classList.contains("playing"),null,{timeout:60000});
 const r=await result(p);ok(r.playWhileAsleep===0,"never playing while asleep ("+r.playWhileAsleep+" samples)");
 await p.close();}

// ── F2c：訪客在的時候玩松果 → 正確：等訪客走了才玩（或不讓玩），不能疊在一起 ──
{const p=await mk(40);await watch(p);
 await p.evaluate(()=>{PetStage.guest({svg:PET_ART.svg(2,"","none"),stay:4000});setTimeout(()=>PetStage.play(BERRY_SVG),900);});
 await p.waitForTimeout(3000);
 await p.waitForFunction(()=>!document.querySelector(".ps-box").classList.contains("playing")&&!document.querySelector(".ps-guest"),null,{timeout:60000});
 const r=await result(p);ok(r.playWhileGuest===0,"playing never overlaps a guest visit ("+r.playWhileGuest+" samples)","F2c");
 await p.close();}

// ── 對照組（應該本來就對）：正在吃的時候再餵、正在玩的時候餵，都不會開第二輪 ──
{const p=await mk(40);
 const r=await p.evaluate(async()=>{const a=PetStage.feed(BERRY_SVG);await new Promise(r=>setTimeout(r,300));const n1=document.querySelectorAll(".ps-berry").length;await PetStage.feed(BERRY_SVG);const n2=document.querySelectorAll(".ps-berry").length;await a;return [n1,n2];});
 ok(r[0]===3&&r[1]===3,"second feed while eating is ignored (berries "+r+")");
 await p.close();}

ok(errs.length===0,"no page errors "+JSON.stringify(errs.slice(0,3)));
console.log(`（已知問題 ${xf} 項，等 R2 修）`);
console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails);   // run-all 讀這兩行判斷成敗
await b.close();srv.kill();process.exit(fails?1:0);})().catch(e=>{console.error(e);process.exit(1);});
