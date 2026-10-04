// 進場畫面（js/splash.js＋index.html 內聯樣式）：版面、品牌字、原生啟動畫面交接、時長、跳過、預載、收場
// npm run test:all 會跑；截圖輸出到 scripts/tests/out/splash/
const __path=require("path"),__fs=require("fs");
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");
const O=__path.join(__dirname,"out","splash")+"/";__fs.mkdirSync(O,{recursive:true});
const errs=[];let fails=0;const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m);if(!c)fails++;};
const PORT=8934;
(async()=>{const srv=spawn("python3",["-m","http.server",String(PORT)],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch();
// o.native：模擬 App 裡的原生啟動畫面外掛；o.ls：預先寫進 localStorage 的東西
const open=async(o={})=>{const ctx=await b.newContext({viewport:{width:390,height:844},reducedMotion:o.reduce?"reduce":"no-preference"});const p=await ctx.newPage();p.on("pageerror",e=>errs.push(e.message));
 await p.addInitScript(o=>{localStorage.setItem("tt_lang","zh");localStorage.setItem("tt_onboarded_v2","1");localStorage.setItem("tt_locperm_prompted","1");
  for(const [k,v] of Object.entries(o.ls||{}))localStorage.setItem(k,v);
  if(o.native){window.__nativeHidden=null;window.Capacitor={isNativePlatform:()=>true,getPlatform:()=>"ios",Plugins:{SplashScreen:{hide:(a)=>{window.__nativeHidden=performance.now();window.__nativeArgs=a;return Promise.resolve();}}}};}},o);
 const t0=Date.now();await p.goto(`http://localhost:${PORT}/`,{waitUntil:"commit"});p._t0=t0;return p;};

// ── 第 1 階段：版面、品牌字、原生交接 ──
{const p=await open({native:true});
 await p.waitForSelector("#splash .sp-name");await p.waitForTimeout(250);
 const L=await p.evaluate(()=>{const r=s=>document.querySelector(s).getBoundingClientRect();const m=r("#splash .sp-mark"),n=r("#splash .sp-name"),s=r("#splash .sp-sub");
  const groupMid=(m.top+s.bottom)/2;return {gap1:Math.round(n.top-m.bottom),gap2:Math.round(s.top-n.bottom),groupMid:Math.round(groupMid),vh:innerHeight,nameCx:Math.round(n.left+n.width/2-parseFloat(getComputedStyle(document.querySelector("#splash .sp-name")).letterSpacing)/2),markCx:Math.round(m.left+m.width/2),vw:innerWidth};});
 ok(L.gap1>=0&&L.gap1<60&&L.gap2>=0&&L.gap2<40,"logo / name / subtitle stay together as one group "+JSON.stringify(L));
 ok(L.groupMid>L.vh*.38&&L.groupMid<L.vh*.5,"group sits at the optical centre (slightly above middle)");
 ok(Math.abs(L.nameCx-L.vw/2)<6&&Math.abs(L.markCx-L.vw/2)<4,"name truly centred (letter-spacing compensated)");
 const f=await p.evaluate(async()=>{await document.fonts.ready;return {brand:[...document.fonts].some(x=>x.family.replace(/"/g,"")==="BrandSplash"&&x.status==="loaded"),visible:getComputedStyle(document.querySelector("#splash .sp-name")).visibility}});
 ok(f.brand&&f.visible==="visible","brand font (inline, 900) loaded and name visible");
 const nh=await p.evaluate(()=>window.__nativeHidden);ok(nh!=null&&nh<1500,"native launch screen hidden right after the web splash paints ("+Math.round(nh)+"ms)");
 await p.screenshot({path:O+"p1-layout.png"});
 await p.waitForTimeout(3500);
 ok(await p.evaluate(()=>!document.getElementById("splash")),"splash removes itself");
 await p.close();}

// ── 第 2 階段：分鏡、時長、跳過、收場 ──
const ended=async p=>{await p.waitForFunction(()=>!document.getElementById("splash")||document.getElementById("splash").dataset.endedAt,null,{timeout:8000});return p.evaluate(()=>{const s=document.getElementById("splash");return s?{mode:s.dataset.mode,at:+s.dataset.endedAt,anim:s.classList.contains("sp-anim")}:null});};
{const p=await open({ls:{tt_splash_test:"1"}});
 await p.waitForSelector("#splash");
 await p.evaluate(()=>{window.__lt=[];try{new PerformanceObserver(l=>l.getEntries().forEach(e=>window.__lt.push(Math.round(e.duration)))).observe({type:"longtask",buffered:true})}catch(e){}});
 await p.waitForTimeout(1000);
 const mid=await p.evaluate(()=>({trail:getComputedStyle(document.querySelector(".sp-trail")).strokeDashoffset,ch0:+getComputedStyle(document.querySelector(".sp-ch")).opacity}));
 ok(parseFloat(mid.trail)>0&&parseFloat(mid.trail)<100&&mid.ch0<.5,"full: at 1s the trail is mid-draw and the name not yet shown "+JSON.stringify(mid));
 await p.screenshot({path:O+"p2-1s.png"});
 const e=await ended(p);ok(e&&e.mode==="full"&&e.anim&&e.at>=2300&&e.at<3600,"first open today → full version ≈2.4s ("+JSON.stringify(e)+")");
 const fly=await p.evaluate(()=>document.querySelector("#splash .sp-mark").style.transform);ok(/translate\(.*scale\(/.test(fly),"exit: logo flies to the header logo ("+fly+")");
 await p.waitForTimeout(900);ok(await p.evaluate(()=>!document.getElementById("splash")),"splash removed after exit");
 const lt=await p.evaluate(()=>window.__lt||[]);console.log("long tasks during/after splash:",JSON.stringify(lt));
 // 同一天再開 → 精簡版
 await p.goto(`http://localhost:${PORT}/`,{waitUntil:"commit"});await p.waitForSelector("#splash");
 const e2=await ended(p);ok(e2&&e2.mode==="compact"&&e2.at>=1100&&e2.at<2200,"second open same day → compact ≈1.2s ("+JSON.stringify(e2)+")");
 await p.close();}
{const p=await open({ls:{tt_splash_test:"1"}});await p.waitForSelector("#splash");await p.waitForTimeout(500);
 const t=Date.now();await p.mouse.click(200,400);await p.waitForFunction(()=>!document.getElementById("splash"),null,{timeout:3000});
 ok(Date.now()-t<700,"tap skips immediately ("+(Date.now()-t)+"ms)");await p.close();}
{const p=await open({reduce:true,ls:{tt_splash_test:"1"}});await p.waitForSelector("#splash");
 const e=await ended(p);ok(e&&e.mode==="static"&&!e.anim&&e.at>=550&&e.at<1500,"reduced motion → static ≈0.6s ("+JSON.stringify(e)+")");
 ok(await p.evaluate(()=>getComputedStyle(document.querySelector(".sp-dot")).opacity==="0"&&getComputedStyle(document.querySelector(".sp-glow")).opacity==="0"),"static: no stray dot / glow ring");await p.close();}
{const p=await open({ls:{tt_splash_test:"1"}});await p.evaluate(()=>{window.ttSplashReady=false;});await p.waitForSelector("#splash");
 const e=await ended(p);ok(e&&e.at>=3400&&e.at<3900,"never-ready app still ends at the 3.5s cap ("+JSON.stringify(e)+")");await p.close();}
{const p=await open({});await p.waitForSelector("#splash");const e=await ended(p);
 ok(e&&e.mode==="compact"&&e.at<900,"automation browser: quick by default so other tests aren't slowed ("+JSON.stringify(e)+")");await p.close();}

// 第一次來：Service Worker 安裝接手時不能重新整理頁面（以前會，點到一半的東西不見、進場播兩次）
{const p=await open({});await p.waitForLoadState("load");await p.evaluate(()=>{window.__keep=1;});
 await p.waitForFunction(()=>navigator.serviceWorker&&navigator.serviceWorker.controller,null,{timeout:15000}).catch(()=>{});await p.waitForTimeout(2500);
 ok(await p.evaluate(()=>window.__keep===1&&!!navigator.serviceWorker.controller),"first visit: SW takes control without reloading the page");await p.close();}

console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails);await b.close();srv.kill();})();
