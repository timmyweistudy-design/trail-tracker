// 夥伴音效＋觸覺回饋（2026-10-10 使用者：「寵物讓手機震動太多」「全面加入音效，趨近真實」）
//   音效：22 段真實錄音都載得到、解得開；每一階×每一種近親×每一個動作都對得到存在的聲音；摸頭／餵食／抱抱／玩松果／收禮物真的會出聲，關掉就不出聲
//   觸覺：原生 App 用輕觸（impact light），0.8 秒內最多一次；不再用完整馬達震動；吞果實不再每一顆震一下；進化才用成功節奏
const __TTP = +process.env.TT_PORT || 8943;
const __path=require("path"),__fs=require("fs"),vm=require("vm");
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");
const MOCK=__fs.readFileSync(__dirname+"/soc-mock.js","utf8");const errs=[];let fails=0;const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m);if(!c)fails++;};
const KM=[0,5,20,40,90,150,260];
// 靜態：對照表裡的每一個聲音都有檔案
{const ctx={console};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(__fs.readFileSync(ROOT+"/web/js/pet-sound.js","utf8")+";window.PetAudio=PetAudio;",ctx);const PA=ctx.PetAudio;
 const missing=PA.KEYS.filter(k=>!__fs.existsSync(ROOT+"/web/sounds/pet/"+k+".mp3"));ok(missing.length===0,"every sound key has its file "+JSON.stringify(missing));
 const EV=["bite","pat","rub","tickle","hug","hop","trick","yawn","wake","sleep","stretch","shake","dizzy","drop","roll","gift","evolve","bell"];const bad=[],empty=[];
 for(let i=0;i<7;i++)for(const v of ["","deep","sea","alpine"])for(const e of EV){const c=PA._cues(e,i,v)||[];if(!c.length&&!(e==="sleep"||e==="stretch")||(e==="sleep"||e==="stretch")&&i>0&&!c.length)empty.push(`${e}/${i}/${v}`);for(const [k] of c)if(!PA.KEYS.includes(k))bad.push(`${e}/${i}/${v}:${k}`);}
 ok(bad.length===0,"every cue points to a real sound "+JSON.stringify(bad.slice(0,5)));
 ok(empty.length===0,"every stage × species × action has a sound (egg sleeps silently) "+JSON.stringify(empty.slice(0,6)));
 const credits=__fs.readFileSync(ROOT+"/web/sounds/pet/CREDITS.md","utf8");ok(PA.KEYS.every(k=>credits.includes(k+".mp3")),"every sound is listed in CREDITS.md with its source");
 const kb=PA.KEYS.reduce((s,k)=>s+__fs.statSync(ROOT+"/web/sounds/pet/"+k+".mp3").size,0)/1024;ok(kb<400,`all sounds together are small (${kb.toFixed(0)} KB)`);}
(async()=>{const srv=spawn("python3",["-m","http.server",String(__TTP)],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch({args:["--autoplay-policy=no-user-gesture-required"]});
const mk=async(km,o={})=>{const ctx=await b.newContext({viewport:{width:390,height:844},timezoneId:"Asia/Taipei"});const p=await ctx.newPage();await require(__dirname+"/fake-weather")(p);p.on("pageerror",e=>errs.push(e.message));
 await p.addInitScript(o=>{if(sessionStorage.getItem("seed"))return;sessionStorage.setItem("seed","1");localStorage.setItem("tt_lang","zh");["tt_onboarded_v2","tt_coach_trail","tt_locperm_prompted","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_coach_team","tt_coach_pet"].forEach(k=>localStorage.setItem(k,"1"));localStorage.setItem("tt_pet_woke",String(Date.now()));localStorage.setItem("tt_debug_km",String(o.km));if(!o.nodev)localStorage.setItem("tt_pet_sound_dev","1");if(o.tone)localStorage.setItem("tt_pet_tone",o.tone);},{km,tone:o.tone,nodev:o.nodev});
 await p.addInitScript(MOCK);await p.goto(`http://localhost:${__TTP}/`);await require(__dirname+"/ready")(p);
 await p.evaluate(()=>{window.__toneAll=true;petApplyTone();document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove());});await p.click('.tab[data-view="pet"]');await p.waitForTimeout(1000);
 await p.evaluate(()=>{window.__psNoIdle=true;document.querySelector(".ps-box").scrollIntoView({block:"center"});
  window.__snd=window.__petSndLog=[];
  window.__hap=[];window.Capacitor={isNativePlatform:()=>true,getPlatform:()=>"ios",Plugins:{Haptics:{impact:a=>window.__hap.push("impact:"+a.style),notification:a=>window.__hap.push("notify:"+a.type),vibrate:a=>window.__hap.push("vibrate:"+a.duration)}}};});
 return p;};
// 檔案都解得開
{const p=await mk(KM[4]);
 const n=await p.evaluate(async()=>{PetAudio.preload();for(let k=0;k<40&&PetAudio._loaded().length<PetAudio.KEYS.length;k++)await new Promise(r=>setTimeout(r,250));return PetAudio._loaded().length;});
 ok(n===22,`all 22 recordings load and decode in the browser (${n})`);
 // 摸頭（虎＝呼嚕）、抱抱、搔癢、跳、收禮物、進化
 const r=await p.evaluate(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));const take=()=>{const a=window.__snd.slice();window.__snd.length=0;return a;};
  await PetStage.react("pat");const pat=take();await w(300);await PetStage.react("hug");const hug=take();await w(300);await PetStage.react("tickle");const tickle=take();
  await w(300);petSound("gift");const gift=take();await w(300);petSound("evolve");const evolve=take();
  localStorage.setItem("tt_pet_sound","0");await w(300);await PetStage.react("pat");const off=take();localStorage.removeItem("tt_pet_sound");
  return {pat,hug,tickle,gift,evolve,off};});
 ok(r.pat.includes("purr")&&r.hug.includes("purr"),"tiger: pat and hug purr "+JSON.stringify([r.pat,r.hug]));
 ok(r.tickle.includes("squeak")&&r.gift.includes("bell")&&r.evolve.includes("twinkle"),"tickle / gift / evolve have their sounds "+JSON.stringify([r.tickle,r.gift,r.evolve]));
 ok(r.off.length===0,"sound switched off: silent");
 // 觸覺：連摸 6 下
 const h=await p.evaluate(async()=>{window.__hap.length=0;for(let k=0;k<6;k++){document.querySelector("#petEmoji").click();await new Promise(r=>setTimeout(r,120));}const taps=window.__hap.slice();window.__hap.length=0;
  petBuzz([60,40,140]);const big=window.__hap.slice();window.__hap.length=0;localStorage.setItem("tt_pet_haptic","0");await new Promise(r=>setTimeout(r,900));document.querySelector("#petEmoji").click();const off=window.__hap.slice();localStorage.removeItem("tt_pet_haptic");return {taps,big,off};});
 ok(h.taps.length>=1&&h.taps.length<=2&&h.taps.every(x=>x==="impact:LIGHT"),"six quick pats: one or two light taps, no motor buzz "+JSON.stringify(h.taps));
 ok(h.big.join()==="notify:SUCCESS","big moments use the success pattern "+JSON.stringify(h.big));
 ok(h.off.length===0,"vibration switched off: nothing");
 await p.context().close();}
// 餵食：吞果實不再每一顆震一下；照物種出聲
for(const [st,tone,want] of [[1,"","nom"],[3,"sea","crunch"],[6,"","crunch"]]){const p=await mk(KM[st],{tone});
 const r=await p.evaluate(async()=>{PetAudio.preload();for(let k=0;k<40&&PetAudio._loaded().length<PetAudio.KEYS.length;k++)await new Promise(r=>setTimeout(r,250));
  window.__hap.length=0;window.__snd.length=0;localStorage.removeItem("tt_pet_fed_t");localStorage.setItem("tt_pet_berry_bonus","30");renderPet();await new Promise(r=>setTimeout(r,300));feedPet();const t0=Date.now();await new Promise(r=>setTimeout(r,500));
  while(document.querySelector(".ps-box").classList.contains("feeding")&&Date.now()-t0<40000)await new Promise(r=>setTimeout(r,250));return {hap:window.__hap.slice(),snd:window.__snd.slice()};});
 ok(r.hap.length<=3&&!r.hap.some(x=>x.startsWith("vibrate")),`stage ${st}${tone?" "+tone:""}: feeding vibrates at most a few light times, no motor buzz ${JSON.stringify(r.hap)}`);
 ok(r.snd.includes(want),`stage ${st}${tone?" "+tone:""}: eating makes the ${want} sound ${JSON.stringify(r.snd.slice(0,8))}`);
 await p.context().close();}
// 2026-10-10 使用者要求先全面關掉音效（docs/sound-plan.md）：沒開「試聽（開發中）」的一般使用者完全不出聲，設定裡也沒有音效開關
{const p=await mk(KM[4],{nodev:1});
 const r=await p.evaluate(async()=>{window.__snd.length=0;petSound("gift");await PetStage.react("pat");await new Promise(r=>setTimeout(r,300));document.querySelector("#petHelp")&&document.querySelector("#petHelp").click();await new Promise(r=>setTimeout(r,500));return {snd:window.__snd.slice(),sw:!!document.getElementById("petSoundSw"),loaded:PetAudio._loaded().length};});
 ok(r.snd.length===0&&r.loaded===0,"sound is switched off for everyone until it's ready (nothing plays, nothing downloads) "+JSON.stringify(r));
 ok(!r.sw,"the sound switch is hidden from settings while sound is off");
 await p.context().close();}
console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails+(errs.length?1:0));await b.close();srv.kill();process.exit(0);})();
