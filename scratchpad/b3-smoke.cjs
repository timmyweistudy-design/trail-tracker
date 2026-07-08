const { spawn } = require("child_process");
const path=require("path"), fs=require("fs"); const ROOT=process.cwd(), PORT=8931;
(async()=>{
  const ll=path.join(process.env.HOME||"","pw-libs","root","usr","lib","x86_64-linux-gnu");
  if(fs.existsSync(ll))process.env.LD_LIBRARY_PATH=ll+(process.env.LD_LIBRARY_PATH?":"+process.env.LD_LIBRARY_PATH:"");
  const {chromium}=require("playwright");
  const srv=spawn("python3",["-m","http.server",String(PORT)],{cwd:path.join(ROOT,"web"),stdio:"ignore"});
  await new Promise(r=>setTimeout(r,1200)); const b=await chromium.launch(); const errs=[];
  try{
    const p=await b.newPage({viewport:{width:390,height:844}});
    await p.addInitScript(()=>{try{localStorage.setItem("tt_onboarded_v2","1");localStorage.setItem("tt_premium","1")}catch(e){}});
    p.on("pageerror",e=>errs.push("pageerror: "+e.message));
    await p.goto(`http://localhost:${PORT}/`,{waitUntil:"domcontentloaded"}); await p.waitForTimeout(2500);
    const r=await p.evaluate(async()=>{
      const rec={trailName:"測試",date:new Date().toISOString(),distanceKm:2.5,elapsedMs:3600000,ascent:120,descent:100,kcal:180,steps:3200,track:[{lat:24,lon:121},{lat:24.01,lon:121.01}]};
      let ok=false; try{ await shareHikeCard(rec); ok=true; }catch(e){ return "ERR:"+e.message; }
      // brand animation applied?
      const anim = getComputedStyle(document.querySelector('.brand-mark')).animationName;
      return { ok, anim };
    });
    const ok=(n,c)=>{console.log((c?"✓ ":"✗ ")+n);if(!c)errs.push(n);};
    ok("分享圖卡（含季節貼紙）產生無錯", r.ok===true);
    ok("品牌 logo 有淡入動畫", r.anim==="brandIn");
    ok("無執行期錯誤", errs.length===0 || errs.every(e=>!e.startsWith("pageerror")));
  }catch(e){errs.push("EXC: "+e.message);}
  finally{await b.close();srv.kill();}
  console.log(errs.length?"ISSUES:\n"+errs.join("\n"):"ALL GOOD"); process.exit(errs.filter(e=>e.startsWith("pageerror")||e.startsWith("EXC")).length?1:0);
})();
