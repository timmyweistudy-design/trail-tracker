const { spawn } = require("child_process");
const path=require("path"), fs=require("fs"); const ROOT=process.cwd(), PORT=8929;
(async()=>{
  const ll=path.join(process.env.HOME||"","pw-libs","root","usr","lib","x86_64-linux-gnu");
  if(fs.existsSync(ll))process.env.LD_LIBRARY_PATH=ll+(process.env.LD_LIBRARY_PATH?":"+process.env.LD_LIBRARY_PATH:"");
  const {chromium}=require("playwright");
  const srv=spawn("python3",["-m","http.server",String(PORT)],{cwd:path.join(ROOT,"web"),stdio:"ignore"});
  await new Promise(r=>setTimeout(r,1200)); const b=await chromium.launch(); const errs=[];
  try{
    const p=await b.newPage({viewport:{width:390,height:844}});
    await p.addInitScript(()=>{try{localStorage.setItem("tt_onboarded_v2","1")}catch(e){}});
    p.on("pageerror",e=>errs.push("pageerror: "+e.message));
    const EXT=/net::|favicon|404|Failed to load|CORS|opentopodata|googleapis|mymemory|supabase|overpass|tile\.|Access to fetch/i;
    p.on("console",m=>{if(m.type()==="error"&&!EXT.test(m.text()))errs.push("console: "+m.text());});
    await p.goto(`http://localhost:${PORT}/`,{waitUntil:"domcontentloaded"}); await p.waitForTimeout(2500);
    await p.evaluate(()=>window.loadSocial&&window.loadSocial()); await p.waitForTimeout(2500);
    // 切五分頁確保無錯
    for(const v of ["record","pet","me","social","explore"]){ await p.click(`.tab[data-view="${v}"]`); await p.waitForTimeout(400); }
    const ok=(n,c)=>{console.log((c?"✓ ":"✗ ")+n);if(!c)errs.push(n);};
    ok("TeamLive 介面完整", await p.evaluate(()=>typeof TeamLive!=="undefined"&&typeof TeamLive.peek==="function"&&typeof TeamLive.sendPause==="function"));
    ok("無執行期錯誤", errs.filter(e=>e.startsWith("pageerror")||e.startsWith("console")).length===0);
  }catch(e){errs.push("EXC: "+e.message);}
  finally{await b.close();srv.kill();}
  console.log(errs.length?"ISSUES:\n"+errs.join("\n"):"ALL GOOD"); process.exit(errs.length?1:0);
})();
