// 夥伴的視窗在小螢幕、最大字級、橫向下都要能用（2026-10-08 修正案 原33）：
// iPhone SE 直向 320×568＋最大字級 1.65、SE 橫向 568×320、一般 390×844＋最大字級。每個視窗：不能橫向捲動、按鈕不能跑出畫面、
// 關閉鈕要點得到（在畫面內，或在可以捲動的視窗裡）、文字不能被裁掉。截圖在 scripts/tests/out/psm/（給人看）
const __path=require("path"),__fs=require("fs");
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");
const O=__path.join(__dirname,"out","psm")+"/";__fs.mkdirSync(O,{recursive:true});
const MOCK=__fs.readFileSync(__dirname+"/soc-mock.js","utf8");const errs=[];let fails=0;const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m);if(!c)fails++;};
const PORT = +process.env.TT_PORT || 8918;
const CFG=[{n:"se-big",w:320,h:568,fs:"1.65"},{n:"se-land",w:568,h:320,fs:"1.2"},{n:"390-big",w:390,h:844,fs:"1.65"}];
(async()=>{const srv=spawn("python3",["-m","http.server",String(PORT)],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch();
for(const c of CFG){
 const ctx=await b.newContext({viewport:{width:c.w,height:c.h},timezoneId:"Asia/Taipei",hasTouch:true});const p=await ctx.newPage();await require(__dirname+"/fake-weather")(p);p.on("pageerror",e=>errs.push(c.n+": "+e.message));
 await p.addInitScript(fs=>{localStorage.setItem("tt_lang","zh");["tt_onboarded_v2","tt_coach_trail","tt_locperm_prompted","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_coach_team","tt_coach_pet"].forEach(k=>localStorage.setItem(k,"1"));
  localStorage.setItem("tt_pet_woke",String(Date.now()));localStorage.setItem("tt_test_diary","1");localStorage.setItem("tt_debug_km","40");localStorage.setItem("tt_pet_berry_bonus","30");localStorage.setItem("tt_fontscale",fs);
  localStorage.setItem("tt_pet_gifts",JSON.stringify([{id:"pine",t:"2026-10-01"},{id:"leaf",t:"2026-10-02"}]));},c.fs);
 await p.addInitScript(MOCK);await p.goto(`http://localhost:${PORT}/`);await require(__dirname+"/ready")(p);
 await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));await p.click('.tab[data-view="pet"]');await p.waitForTimeout(1200);
 await p.evaluate(()=>{document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove());window.__psNoIdle=true;});
 // 夥伴卡本身
 const card=await p.evaluate(()=>({sw:document.scrollingElement.scrollWidth,iw:innerWidth,fs:getComputedStyle(document.documentElement).getPropertyValue("--fs").trim(),
  out:[...document.querySelectorAll(".pet-card button,.pet-card .pet-tool")].filter(e=>e.getClientRects().length).map(e=>e.getBoundingClientRect()).filter(r=>r.right>innerWidth+1||r.left<-1).length}));
 ok(card.sw<=card.iw&&card.out===0&&card.fs===c.fs,`${c.n}: pet card fits (scrollWidth ${card.sw}/${card.iw}, buttons off-screen ${card.out}, --fs ${card.fs})`);
 await p.screenshot({path:O+c.n+"-card.png",fullPage:false});
 // 每個視窗：打開 → 檢查 → 截圖 → 關掉
 const OPEN={dex:()=>openPetDex(),help:()=>document.getElementById("petHelp").click(),hats:()=>openHatPicker(),photo:()=>openPetPhoto(),gift:()=>petGiftShow("pine")};
 for(const [k,fn] of Object.entries(OPEN)){
  const before=await p.evaluate(()=>document.body.children.length);
  await p.evaluate(f=>{(0,eval)("("+f+")")();},fn.toString());await p.waitForTimeout(900);
  const r=await p.evaluate(before=>{const ov=[...document.body.children].slice(before).filter(e=>e.getClientRects().length&&getComputedStyle(e).position==="fixed").pop()||[...document.querySelectorAll(".ttdlg-ov,.sheet-ov,.pet-photo-ov,.gift-ov")].pop();
   if(!ov)return {none:true};const W=innerWidth,H=innerHeight;
   const btns=[...ov.querySelectorAll("button")].filter(e=>e.getClientRects().length),offX=btns.map(e=>e.getBoundingClientRect()).filter(q=>q.right>W+1||q.left<-1).length;
   const close=btns.find(e=>/close|關閉|✕|×/.test(e.className+" "+(e.getAttribute("aria-label")||"")+" "+e.textContent))||btns[btns.length-1];
   const cr=close&&close.getBoundingClientRect();let sc=close&&close.parentElement;while(sc&&sc!==document.body&&!(sc.scrollHeight>sc.clientHeight+2&&/(auto|scroll)/.test(getComputedStyle(sc).overflowY)))sc=sc.parentElement;
   const closeOk=!!cr&&cr.width>0&&((cr.top>=-1&&cr.bottom<=H+1)||(sc&&sc!==document.body));
   const clipped=[...ov.querySelectorAll("p,span,b,h2,h3,div,td,label,button")].filter(e=>e.children.length===0&&e.clientWidth>0&&e.scrollWidth>e.clientWidth+2&&/(hidden|clip)/.test(getComputedStyle(e).overflowX)&&getComputedStyle(e).textOverflow!=="ellipsis").map(e=>(e.textContent||"").trim().slice(0,12));
   const tall=ov.scrollHeight>H+2,canScroll=tall?[ov,...ov.querySelectorAll("*")].some(e=>e.scrollHeight>e.clientHeight+2&&/(auto|scroll)/.test(getComputedStyle(e).overflowY)):true;
   return {cls:ov.className,sw:document.scrollingElement.scrollWidth,W,offX,closeOk,clipped:clipped.slice(0,4),canScroll,small:btns.filter(e=>{const q=e.getBoundingClientRect();return q.height<28&&q.width<28;}).length};},before);
  if(r.none){ok(false,`${c.n} ${k}: overlay opened`);continue;}
  await p.screenshot({path:O+c.n+"-"+k+".png"});
  ok(r.sw<=r.W&&r.offX===0,`${c.n} ${k}: no horizontal overflow, no button off-screen (${r.sw}/${r.W}, ${r.offX})`);
  ok(r.closeOk,`${c.n} ${k}: close button reachable`);
  ok(r.canScroll,`${c.n} ${k}: content taller than the screen can scroll`);
  ok(r.clipped.length===0,`${c.n} ${k}: no clipped text ${JSON.stringify(r.clipped)}`);
  await p.keyboard.press("Escape");await p.waitForTimeout(300);
  await p.evaluate(before=>{[...document.body.children].slice(before).filter(e=>getComputedStyle(e).position==="fixed").forEach(e=>e.remove());document.querySelectorAll(".ttdlg-ov").forEach(e=>e.remove());document.body.style.overflow="";},before);await p.waitForTimeout(200);
 }
 await ctx.close();}
ok(errs.length===0,"no page errors "+JSON.stringify(errs.slice(0,3)));
console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails);
await b.close();srv.kill();process.exit(fails?1:0);})().catch(e=>{console.error(e);process.exit(1);});
