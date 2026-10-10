// CPU 剖析（2026-10-10 優化輪）：CPU 降速 4 倍，量「開 App」或「切到夥伴頁」時，各檔案／函式自己花的時間，以及誰在強制排版（getBoundingClientRect 等）。
// 用法：node scripts/profile-cpu.js start|pet（要 LD_LIBRARY_PATH，見 docs）。改效能前後各跑一次、用 git stash 對照，數字才可信
const ROOT="/mnt/c/Users/timmy/projects/trail-tracker";const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");
(async()=>{const srv=spawn("python3",["-m","http.server","8987"],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));
const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:390,height:844}});const p=await ctx.newPage();const cdp=await ctx.newCDPSession(p);
await p.addInitScript(()=>{localStorage.setItem("tt_lang","zh");["tt_onboarded_v2","tt_coach_trail","tt_locperm_prompted","tt_coach_record","tt_coach_peaks","tt_coach_team","tt_coach_pet","tt_coach_record_tools"].forEach(k=>localStorage.setItem(k,"1"));});
await cdp.send("Emulation.setCPUThrottlingRate",{rate:4});await cdp.send("Profiler.enable");await cdp.send("Profiler.setSamplingInterval",{interval:200});
const which=process.argv[2]||"start";
if(which==="start"){await cdp.send("Profiler.start");await p.goto("http://localhost:8987/");await require(ROOT+"/scripts/tests/ready")(p);await p.waitForTimeout(2500);}
else {await p.goto("http://localhost:8987/");await require(ROOT+"/scripts/tests/ready")(p);await p.waitForTimeout(3000);await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));await cdp.send("Profiler.start");await p.click('.tab[data-view="pet"]');await p.waitForTimeout(1500);}
const {profile}=await cdp.send("Profiler.stop");
const byId=new Map(profile.nodes.map(n=>[n.id,n]));const self=new Map();const dt=profile.timeDeltas;
profile.samples.forEach((id,i)=>{self.set(id,(self.get(id)||0)+(dt[i]||0));});
const byUrl={},byFn={};
for(const [id,t] of self){const n=byId.get(id);const cf=n.callFrame;const u=(cf.url||"(native)").split("/").slice(-1)[0]||cf.functionName||"(program)";byUrl[u]=(byUrl[u]||0)+t;const k=u+":"+(cf.functionName||"(anon)")+":"+cf.lineNumber;byFn[k]=(byFn[k]||0)+t;}
const top=o=>Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,14).map(([k,v])=>`${(v/1000).toFixed(1)}ms ${k}`).join("\n");
const parent=new Map();profile.nodes.forEach(n=>(n.children||[]).forEach(c=>parent.set(c,n.id)));const callers={};for(const [id,t] of self){const n=byId.get(id);if(!/getBoundingClientRect|elementsFromPoint|offsetWidth/.test(n.callFrame.functionName))continue;let q=parent.get(id),chain=[];for(let k=0;k<4&&q;k++){const c=byId.get(q).callFrame;chain.push((c.url||"").split("/").pop()+":"+c.functionName+":"+c.lineNumber);q=parent.get(q);}const key=chain.join(" < ");callers[key]=(callers[key]||0)+t;}console.log("== layout callers\n"+top(callers));
console.log("== by file\n"+top(byUrl));console.log("== by function\n"+top(byFn));
await b.close();srv.kill();})();
