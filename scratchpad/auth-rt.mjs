import { createClient } from "@supabase/supabase-js";
const URL="https://bkbkamvbczqdejrlpiqo.supabase.co", KEY="sb_publishable_3VM6B_9iEw1vt3BTZpTo3w_-r3wkimi";
async function anon(tag){
  const c=createClient(URL,KEY,{auth:{persistSession:false}});
  const { data, error }=await c.auth.signInAnonymously();
  return { c, session:data&&data.session, uid:data&&data.user&&data.user.id, error:error&&(error.message||JSON.stringify(error)) };
}
const A=await anon("a");
console.log("匿名登入 A:", A.error?("ERR "+A.error):("OK uid="+(A.uid||"").slice(0,8)+" 有session="+!!A.session));
if(!A.session){ console.log("→ 匿名登入未啟用，無法測已驗證路徑"); process.exit(0); }
const B=await anon("b");
console.log("匿名登入 B:", B.error?("ERR "+B.error):("OK 有session="+!!B.session));
// 兩個「已驗證」client 開純 presence 頻道（authenticated Realtime）
const TEAM="team:authprobe-"+Math.floor(Date.now()/1000);
function ch(c,uid){ const x=c.channel(TEAM,{config:{presence:{key:uid}}}); x.on("presence",{event:"sync"},()=>{}); return x; }
const cA=ch(A.c,A.uid), cB=ch(B.c,B.uid);
let sA=[],sB=[];
await new Promise(res=>{ let n=0,d=()=>{if(++n>=2)res()};
  cA.subscribe(s=>{sA.push(s); if(s==="SUBSCRIBED"){cA.track({n:"A"});d();} if(/ERROR|TIMED|CLOSED/.test(s))d();});
  cB.subscribe(s=>{sB.push(s); if(s==="SUBSCRIBED"){cB.track({n:"B"});d();} if(/ERROR|TIMED|CLOSED/.test(s))d();});
  setTimeout(res,15000);
});
await new Promise(r=>setTimeout(r,4000));
console.log("A 狀態序列:",JSON.stringify(sA)," presence:",JSON.stringify(Object.keys(cA.presenceState())));
console.log("B 狀態序列:",JSON.stringify(sB)," presence:",JSON.stringify(Object.keys(cB.presenceState())));
const ok=Object.keys(cA.presenceState()).length===2;
console.log(ok? "\n==> 已驗證使用者 presence 也正常 → 不是 auth/金鑰問題 → 使用者是裝置網路擋 WebSocket"
             : "\n==> 已驗證使用者頻道異常 → auth/publishable key 問題（全體登入者受影響，可修）");
process.exit(0);
