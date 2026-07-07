const { spawn } = require("child_process");
const path=require("path"), fs=require("fs");
const ROOT=process.cwd(), PORT=8923;
(async()=>{
  const ll=path.join(process.env.HOME||"","pw-libs","root","usr","lib","x86_64-linux-gnu");
  if(fs.existsSync(ll))process.env.LD_LIBRARY_PATH=ll+(process.env.LD_LIBRARY_PATH?":"+process.env.LD_LIBRARY_PATH:"");
  const {chromium}=require("playwright");
  const srv=spawn("python3",["-m","http.server",String(PORT)],{cwd:path.join(ROOT,"web"),stdio:"ignore"});
  await new Promise(r=>setTimeout(r,1200));
  const b=await chromium.launch(); const errs=[];
  try{
    const p=await b.newPage();
    await p.addInitScript(()=>{try{localStorage.setItem("tt_onboarded_v2","1")}catch(e){}});
    p.on("pageerror",e=>errs.push("pageerror: "+e.message));
    await p.goto(`http://localhost:${PORT}/`,{waitUntil:"domcontentloaded"}); await p.waitForTimeout(1500);
    await p.evaluate(()=>window.loadSocial&&window.loadSocial()); await p.waitForTimeout(2500);
    const res=await p.evaluate(async()=>{
      if(typeof Supa==="undefined"||!Supa.client) return {err:"Supa 未載"};
      const c=Supa.client(); if(!c) return {err:"client null"};
      const ch=c.channel("probe:"+Date.now(),{config:{presence:{key:"z"}}});
      ch.on("presence",{event:"sync"},()=>{});
      const states=[]; ch.subscribe(s=>states.push(s));
      await new Promise(r=>setTimeout(r,8000));
      // 讀心跳設定是否套用
      const hb = c.realtime && c.realtime.heartbeatIntervalMs;
      return { states, hb };
    });
    console.log("Supa.client() 訂閱狀態:", JSON.stringify(res.states||res.err), " heartbeatIntervalMs:", res.hb);
    console.log((res.states||[]).includes("SUBSCRIBED")? "✓ 新 realtime 設定仍正常 SUBSCRIBED":"✗ 訂閱失敗");
    if(errs.length) console.log("ERR:",errs.join("; "));
  }catch(e){console.log("EXC:",e.message);}
  finally{await b.close();srv.kill();}
})();
