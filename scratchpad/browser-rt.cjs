const { spawn } = require("child_process");
const path=require("path"), fs=require("fs");
const ROOT=process.cwd(), PORT=8921;
(async()=>{
  const ll=path.join(process.env.HOME||"","pw-libs","root","usr","lib","x86_64-linux-gnu");
  if(fs.existsSync(ll))process.env.LD_LIBRARY_PATH=ll+(process.env.LD_LIBRARY_PATH?":"+process.env.LD_LIBRARY_PATH:"");
  const {chromium}=require("playwright");
  const srv=spawn("python3",["-m","http.server",String(PORT)],{cwd:path.join(ROOT,"web"),stdio:"ignore"});
  await new Promise(r=>setTimeout(r,1200));
  const b=await chromium.launch();
  try{
    const p=await b.newPage();
    await p.addInitScript(()=>{try{localStorage.setItem("tt_onboarded_v2","1")}catch(e){}});
    await p.goto(`http://localhost:${PORT}/`,{waitUntil:"domcontentloaded"});
    await p.waitForTimeout(1500);
    // 載入 vendored supabase 客戶端（社群模組）
    await p.evaluate(()=>window.loadSocial && window.loadSocial());
    await p.waitForTimeout(2500);
    const res = await p.evaluate(async () => {
      if (typeof supabase === "undefined") return { err: "vendored supabase 未載入" };
      const c = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
      const ch = c.channel("probe:"+Date.now(), { config:{ presence:{ key:"browserX" } } });
      ch.on("presence",{event:"sync"},()=>{});
      const states=[];
      ch.subscribe(s=>states.push(s));
      await new Promise(r=>setTimeout(r,9000));
      return { states, presence: Object.keys(ch.presenceState()) };
    });
    console.log("瀏覽器+vendored client+publishable key，subscribe 狀態序列：", JSON.stringify(res.states||res.err));
    console.log("presence keys:", JSON.stringify(res.presence||[]));
    const ok = (res.states||[]).includes("SUBSCRIBED");
    console.log(ok? "\n==> 瀏覽器環境也能 SUBSCRIBED → 程式/client OK，你的裝置網路擋了 WebSocket（環境問題）"
                  : "\n==> 瀏覽器環境就 CLOSED/失敗 → 是 client/程式碼問題（可修）");
  }catch(e){console.log("EXC:",e.message);}
  finally{await b.close();srv.kill();}
})();
