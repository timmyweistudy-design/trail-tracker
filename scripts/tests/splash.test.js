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

console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails);await b.close();srv.kill();})();
