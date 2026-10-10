// 夥伴音效、環境音、背景音樂（2026-10-10 音效優化輪，docs/sound-plan.md）＋觸覺回饋
//   素材：每個聲音池的檔案都在、都列在 CREDITS、都是 44.1 kHz（以前 22 kHz／48 kbps 把高頻切掉＝悶、像電話）
//   引擎：真的錄音、聲音池隨機不連續重複、不放合成音、物種各有各的聲音、果實掉落三層、吞嚥
//   環境音：跟時段／天氣／近親物種換，離開夥伴頁就停；背景音樂：要打開才放、記錄中不放
//   預設：音效整個關掉（PET_SOUND_READY=false），一般使用者不出聲、沒有開關
const __TTP = +process.env.TT_PORT || 8943;
const __path=require("path"),__fs=require("fs"),vm=require("vm");
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");
const MOCK=__fs.readFileSync(__dirname+"/soc-mock.js","utf8");const errs=[];let fails=0;const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m);if(!c)fails++;};
const KM=[0,5,20,40,90,150,260];
// MP3 第一個音框的取樣率
const mp3Rate=f=>{const b=__fs.readFileSync(f);let i=0;if(b.slice(0,3).toString()==="ID3")i=10+((b[6]&127)<<21|(b[7]&127)<<14|(b[8]&127)<<7|(b[9]&127));for(;i<b.length-4;i++)if(b[i]===0xff&&(b[i+1]&0xe0)===0xe0){const ver=(b[i+1]>>3)&3,sr=(b[i+2]>>2)&3;const T={3:[44100,48000,32000],2:[22050,24000,16000],0:[11025,12000,8000]};return (T[ver]||[])[sr];}return 0;};
{const ctx={console};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(__fs.readFileSync(ROOT+"/web/js/pet-sound.js","utf8")+";window.PetAudio=PetAudio;",ctx);const PA=ctx.PetAudio;
 const files=[...Object.values(PA.SFX).flat(),...Object.values(PA.AMB).flat(),...PA.MUSIC].map(n=>ROOT+"/web/"+PA.DIR(n)+n+".mp3");
 const missing=files.filter(f=>!__fs.existsSync(f));ok(missing.length===0,`every sound in every pool has its file (${files.length}) `+JSON.stringify(missing.slice(0,4)));
 const credits=__fs.readFileSync(ROOT+"/web/sounds/CREDITS.md","utf8");const nc=files.filter(f=>!credits.includes(f.split("/web/sounds/")[1]));ok(nc.length===0,"every file is credited in sounds/CREDITS.md "+JSON.stringify(nc.slice(0,4)));
 const low=files.filter(f=>__fs.existsSync(f)&&mp3Rate(f)!==44100);ok(low.length===0,"all sounds are 44.1 kHz (old set was 22 kHz) "+JSON.stringify(low.slice(0,4).map(f=>f.split("/").pop()+":"+mp3Rate(f))));
 const EV=["fall","land","bite","gulp","pat","rub","tickle","hug","hop","trick","yawn","wake","stretch","shake","drop","roll","gift","evolve","bell","gust"];const bad=[];
 for(let i=0;i<7;i++)for(const v of ["","deep","sea","alpine"])for(const e of EV)for(const [k] of PA._recipe(e,i,v))if(!PA.SFX[k])bad.push(`${e}/${i}/${v}:${k}`);
 ok(bad.length===0,"every recipe layer points at a real sound pool "+JSON.stringify(bad.slice(0,5)));
 const r=(e,i,v)=>PA._recipe(e,i,v).map(x=>x[0]).join("+");
 ok(r("bite",1,"")==="nibble"&&r("bite",2,"")==="sip"&&r("bite",4,"")==="crunch+chew","each creature eats differently: larva nibbles, butterfly sips, tiger crunches and chews");
 ok(PA._recipe("bite",6,"").every(x=>(x[1].rate||1)>=.85),"big creatures are only slightly lower, not slowed down to 0.55×");
 ok(r("land",4,"")==="land+leaf","a berry landing has a thud plus a leaf rustle");
 const bd=s=>PA._bedsFor(s).join(",");
 ok(bd({tod:"day"})==="day"&&bd({tod:"night"})==="night"&&bd({tod:"dusk"})==="dusk"&&bd({tod:"day",wx:"rain"})==="rain"&&bd({tod:"day",feel:"windy"})==="day,wind"&&bd({tod:"day",v:"sea"})==="waves,day","ambience follows time of day, rain, wind and the sea relative "+[bd({tod:"day",feel:"windy"}),bd({tod:"day",v:"sea"})].join(" | "));
 ok(!/createOscillator/.test(__fs.readFileSync(ROOT+"/web/js/pet.js","utf8")),"no synthesized beeps left in pet.js");}
(async()=>{const srv=spawn("python3",["-m","http.server",String(__TTP)],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch({args:["--autoplay-policy=no-user-gesture-required"]});
const mk=async(km,o={})=>{const ctx=await b.newContext({viewport:{width:390,height:844},timezoneId:"Asia/Taipei"});const p=await ctx.newPage();await require(__dirname+"/fake-weather")(p);p.on("pageerror",e=>errs.push(e.message));
 await p.addInitScript(o=>{if(sessionStorage.getItem("seed"))return;sessionStorage.setItem("seed","1");localStorage.setItem("tt_lang","zh");["tt_onboarded_v2","tt_coach_trail","tt_locperm_prompted","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_coach_team","tt_coach_pet"].forEach(k=>localStorage.setItem(k,"1"));localStorage.setItem("tt_pet_woke",String(Date.now()));localStorage.setItem("tt_debug_km",String(o.km));if(!o.nodev)localStorage.setItem("tt_pet_sound_dev","1");if(o.tone)localStorage.setItem("tt_pet_tone",o.tone);if(o.music)localStorage.setItem("tt_pet_music","1");},{km,tone:o.tone,nodev:o.nodev,music:o.music});
 await p.addInitScript(MOCK);await p.goto(`http://localhost:${__TTP}/`);await require(__dirname+"/ready")(p);
 await p.evaluate(()=>{window.__toneAll=true;petApplyTone();document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove());});await p.click('.tab[data-view="pet"]');await p.waitForTimeout(1000);
 await p.evaluate(()=>{window.__psNoIdle=true;document.querySelector(".ps-box").scrollIntoView({block:"center"});window.__snd=window.__petSndLog=[];window.__petSndNames=[];
  window.__hap=[];window.Capacitor={isNativePlatform:()=>true,getPlatform:()=>"ios",Plugins:{Haptics:{impact:a=>window.__hap.push("impact:"+a.style),notification:a=>window.__hap.push("notify:"+a.type),vibrate:a=>window.__hap.push("vibrate:"+a.duration)}}};});
 return p;};
const loadAll=p=>p.evaluate(async()=>{PetAudio.preload(true);const all=Object.values(PetAudio.SFX).flat(),n=all.length,c=()=>all.filter(x=>PetAudio._loaded().includes(x)).length;for(let k=0;k<80&&c()<n;k++)await new Promise(r=>setTimeout(r,250));return [c(),n];});
{const p=await mk(KM[4]);
 const first=await p.evaluate(()=>{window.__snd.length=0;petSound("gift");return window.__snd.slice();});
 ok(first.length===0,"first time, before the file is loaded: silent (no synthesized beep)");
 const [n,tot]=await loadAll(p);ok(n===tot,`all ${tot} effect recordings load and decode (${n})`);
 const r=await p.evaluate(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));const take=()=>{const a=window.__snd.filter(x=>!/^amb:|^music/.test(x));window.__snd.length=0;return a;};
  await w(300);await PetStage.react("pat");const pat=take();await w(300);await PetStage.react("hug");const hug=take();await w(300);await PetStage.react("tickle");const tickle=take();
  await w(300);petSound("gift");const gift=take();await w(300);petSound("evolve");const evolve=take();
  window.__petSndNames.length=0;for(let k=0;k<8;k++){petSound("land");await w(80);}const lands=window.__petSndNames.filter(x=>/^land-/.test(x));take();
  localStorage.setItem("tt_pet_sound","0");await w(300);await PetStage.react("pat");const off=take();localStorage.removeItem("tt_pet_sound");
  return {pat,hug,tickle,gift,evolve,lands,off};});
 ok(r.pat.includes("purr")&&r.hug.includes("purr"),"tiger: pat and hug purr "+JSON.stringify([r.pat,r.hug]));
 ok(r.tickle.includes("fur")&&r.gift.includes("bell")&&r.evolve.includes("chime"),"tickle / gift / evolve have real sounds "+JSON.stringify([r.tickle,r.gift,r.evolve]));
 ok(r.lands.length>=6&&r.lands.every((x,i)=>i===0||x!==r.lands[i-1]),"the same recording never plays twice in a row "+JSON.stringify(r.lands));
 ok(r.off.length===0,"sound switched off: silent "+JSON.stringify(r.off));
 // 觸覺
 const h=await p.evaluate(async()=>{window.__hap.length=0;for(let k=0;k<6;k++){document.querySelector("#petEmoji").click();await new Promise(r=>setTimeout(r,120));}const taps=window.__hap.slice();window.__hap.length=0;
  petBuzz([60,40,140]);const big=window.__hap.slice();window.__hap.length=0;localStorage.setItem("tt_pet_haptic","0");await new Promise(r=>setTimeout(r,900));document.querySelector("#petEmoji").click();const off=window.__hap.slice();localStorage.removeItem("tt_pet_haptic");return {taps,big,off};});
 ok(h.taps.length>=1&&h.taps.length<=2&&h.taps.every(x=>x==="impact:LIGHT"),"six quick pats: one or two light taps, no motor buzz "+JSON.stringify(h.taps));
 ok(h.big.join()==="notify:SUCCESS","big moments use the success pattern "+JSON.stringify(h.big));
 ok(h.off.length===0,"vibration switched off: nothing");
 // 環境音
 const a=await p.evaluate(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));window.__ps=Object.assign(window.__ps||{},{tod:"night"});petSoundScene();await w(2500);const night=PetAudio._beds().slice();
  window.__ps.wx="rain";window.__ps.feel="windy";petSoundScene();await w(2500);const rain=PetAudio._beds().slice();
  document.querySelector('.tab[data-view="explore"]').click();await w(200);petSoundScene();await w(300);const away=PetAudio._beds().slice();
  delete window.__ps.wx;delete window.__ps.feel;return {night,rain,away};});
 ok(a.night.join()==="night","night on the pet page: cricket ambience "+JSON.stringify(a.night));
 ok(a.rain.includes("rain")&&a.rain.includes("wind"),"rain + wind: rain and wind beds "+JSON.stringify(a.rain));
 ok(a.away.length===0,"leaving the pet page stops the ambience");
 // 設定：三個開關＋音量
 const s=await p.evaluate(async()=>{document.querySelector('.tab[data-view="pet"]').click();await new Promise(r=>setTimeout(r,600));document.querySelector("#petHelp").click();await new Promise(r=>setTimeout(r,600));return {sw:["petSoundSw","petAmbSw","petMusicSw"].map(id=>!!document.getElementById(id)),vol:document.querySelectorAll(".ah-vol").length,music:document.getElementById("petMusicSw")&&document.getElementById("petMusicSw").checked};});
 ok(s.sw.every(Boolean)&&s.vol===3&&s.music===false,"settings: sound / ambience / music switches with volume sliders; music off by default "+JSON.stringify(s));
 await p.context().close();}
// 餵食：三顆果實各自劃過、落地；照物種吃；吞下去
for(const [st,tone,want] of [[1,"","nibble"],[2,"","sip"],[4,"","crunch"],[6,"","crunch"]]){const p=await mk(KM[st],{tone});await loadAll(p);
 const r=await p.evaluate(async()=>{window.__hap.length=0;window.__snd.length=0;localStorage.removeItem("tt_pet_fed_t");localStorage.setItem("tt_pet_berry_bonus","30");renderPet();await new Promise(r=>setTimeout(r,300));feedPet();const t0=Date.now();await new Promise(r=>setTimeout(r,500));
  while(document.querySelector(".ps-box").classList.contains("feeding")&&Date.now()-t0<40000)await new Promise(r=>setTimeout(r,250));await new Promise(r=>setTimeout(r,600));return {hap:window.__hap.slice(),snd:window.__snd.slice()};});
 const cnt=k=>r.snd.filter(x=>x===k).length;
 ok(cnt("fall")===3&&cnt("land")===3&&(st===6?cnt("leaf")===0:cnt("leaf")>=1),`stage ${st}: three berries each whoosh and land${st===6?" (on clouds: no leaves)":""} ${JSON.stringify([cnt("fall"),cnt("land"),cnt("leaf")])}`);
 ok(r.snd.includes(want)&&(st<3||cnt("gulp")>=1),`stage ${st}: eats with the ${want} sound${st>=3?" and swallows":""} ${JSON.stringify(r.snd.filter(x=>!/fall|land|leaf/.test(x)).slice(0,8))}`);
 ok(r.hap.length<=3&&!r.hap.some(x=>x.startsWith("vibrate")),`stage ${st}: feeding vibrates at most a few light times ${JSON.stringify(r.hap)}`);
 await p.context().close();}
// 背景音樂：要打開才放；記錄中不放
{const p=await mk(KM[4],{music:1});
 const m=await p.evaluate(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));petSoundScene();await w(500);const on=PetAudio._musicOn();document.body.classList.add("rec-running");petSoundScene();await w(300);const rec=PetAudio._musicOn();document.body.classList.remove("rec-running");return {on,rec};});
 ok(m.on&&!m.rec,"music plays on the pet page when switched on, and stops while recording a hike "+JSON.stringify(m));
 await p.context().close();}
// 🎧 試聽板：每個時機一列；勾掉的候選就不會再被挑到
{const p=await mk(KM[4]);await loadAll(p);
 const r=await p.evaluate(async()=>{await ensureScript("js/sound-board.js");SoundBoard.open();await new Promise(r=>setTimeout(r,400));
  const rows=document.querySelectorAll(".sb-row").length,want=Object.keys(PetAudio.SFX).length+Object.keys(PetAudio.AMB).length+1;
  const cks=[...document.querySelectorAll('.sb-row[data-key="land"] .sb-ck')];cks.slice(1).forEach(c=>{c.checked=false;c.dispatchEvent(new Event("change"));});
  window.__petSndNames=[];for(let k=0;k<5;k++){PetAudio.cue("land",4,"");await new Promise(r=>setTimeout(r,60));}
  document.querySelector("#sbCopy").click();await new Promise(r=>setTimeout(r,200));
  return {rows,want,used:[...new Set(window.__petSndNames.filter(x=>/^land-/.test(x)))],out:document.querySelector("#sbOut").textContent};});
 ok(r.rows===r.want,`audition board lists every sound, ambience and music (${r.rows})`);
 ok(r.used.join()==="land-1"&&/"land":\["land-1"\]/.test(r.out),"unticked candidates are no longer used, and the copied result says so "+JSON.stringify(r.used));
 await p.context().close();}
// 預設：音效整個關掉
{const p=await mk(KM[4],{nodev:1});
 const r=await p.evaluate(async()=>{window.__snd.length=0;petSound("gift");await PetStage.react("pat");petSoundScene();await new Promise(r=>setTimeout(r,400));document.querySelector("#petHelp")&&document.querySelector("#petHelp").click();await new Promise(r=>setTimeout(r,500));return {snd:window.__snd.slice(),sw:!!document.getElementById("petSoundSw"),loaded:PetAudio._loaded().length,beds:PetAudio._beds().length};});
 ok(r.snd.length===0&&r.loaded===0&&r.beds===0,"sound is switched off for everyone until it's ready (nothing plays, nothing downloads) "+JSON.stringify(r));
 ok(!r.sw,"the sound switches are hidden from settings while sound is off");
 await p.context().close();}
console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails+(errs.length?1:0));await b.close();srv.kill();process.exit(0);})();
