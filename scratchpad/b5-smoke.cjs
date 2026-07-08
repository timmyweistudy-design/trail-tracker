const { spawn } = require("child_process");
const path=require("path"), fs=require("fs"); const ROOT=process.cwd(), PORT=8933;
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
    await p.goto(`http://localhost:${PORT}/`,{waitUntil:"domcontentloaded"}); await p.waitForTimeout(2500);
    // 開步道詳情（有地圖＋控制鈕）
    await p.click(".card.jcard"); await p.waitForTimeout(2000);
    const r=await p.evaluate(()=>{
      const btns=[...document.querySelectorAll(".map-fs-btn, .map-compass")];
      if(!btns.length) return {none:true};
      const b=btns[0];
      return { count:btns.length, role:b.getAttribute("role"), tab:b.getAttribute("tabindex"), aria:!!b.getAttribute("aria-label"),
               mapTab: (document.querySelector("#detailMap")||{}).tabIndex };
    });
    const ok=(n,c)=>{console.log((c?"✓ ":"✗ ")+n);if(!c)errs.push(n);};
    ok("地圖控制鈕存在", !r.none && r.count>0);
    ok("控制鈕 role=button", r.role==="button");
    ok("控制鈕 tabindex=0（可 Tab 聚焦）", r.tab==="0");
    ok("控制鈕有 aria-label", r.aria===true);
    ok("地圖容器可鍵盤聚焦(tabindex)", r.mapTab>=0);
    ok("無執行期錯誤", errs.filter(e=>e.startsWith("pageerror")).length===0);
  }catch(e){errs.push("EXC: "+e.message);}
  finally{await b.close();srv.kill();}
  console.log(errs.length?"ISSUES:\n"+errs.join("\n"):"ALL GOOD"); process.exit(errs.filter(e=>e.startsWith("pageerror")||e.startsWith("EXC")).length?1:0);
})();
