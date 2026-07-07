import { createClient } from "@supabase/supabase-js";
const URL="https://bkbkamvbczqdejrlpiqo.supabase.co", KEY="sb_publishable_3VM6B_9iEw1vt3BTZpTo3w_-r3wkimi";
const rnd=Math.floor(Date.now()/1000);
async function signup(tag){
  const c=createClient(URL,KEY);
  const email=`probe_${tag}_${rnd}@example.com`, pw="Test123456!"+rnd;
  const { data, error }=await c.auth.signUp({ email, password: pw });
  return { c, email, session: data && data.session, user: data && data.user, error: error && error.message };
}
const A=await signup("a");
console.log("A signUp:", A.error?("ERR "+A.error):(A.session?"got session":"no session (需 email 確認?)"));
if(!A.session){ console.log("→ 無法建立已驗證 session（signup 需確認），改用另一路徑判斷"); process.exit(0); }
const B=await signup("b");
console.log("B signUp:", B.error?("ERR "+B.error):(B.session?"got session":"no session"));
if(!B.session){ process.exit(0); }
// A 建隊
const { data: teamId, error: ce }=await A.c.rpc("create_team",{ p_name:"probe", p_code:"PB"+String(rnd).slice(-4) });
console.log("create_team:", ce?("ERR "+ce.message):("teamId="+teamId));
if(ce){ process.exit(0); }
// 取加入碼
const { data: trow }=await A.c.from("teams").select("join_code,owner").eq("id",teamId).maybeSingle();
console.log("join_code:", trow && trow.join_code, "owner=A?", trow && trow.owner===A.user.id);
// B 加入
const { data: jid, error: je }=await B.c.rpc("join_team_by_code",{ p_code: trow.join_code });
console.log("join_team_by_code:", je?("ERR "+je.message):("joined "+jid));
// 兩個「已驗證」client 開 app 的完整頻道
function appChannel(c, uid){
  const ch=c.channel("team:"+teamId,{config:{presence:{key:uid}}});
  ch.on("presence",{event:"sync"},()=>{});
  ch.on("broadcast",{event:"start"},()=>{});
  ch.on("postgres_changes",{event:"*",schema:"public",table:"team_starts",filter:"team_id=eq."+teamId},()=>{});
  return ch;
}
const chA=appChannel(A.c,A.user.id), chB=appChannel(B.c,B.user.id);
let sA="",sB="";
await new Promise(res=>{ let n=0,d=()=>{if(++n>=2)res()};
  chA.subscribe((st,e)=>{ sA=st; if(e)console.log("A ch err:",e.message||e); if(st==="SUBSCRIBED"){chA.track({name:"A"});d();} if(/ERROR|TIMED|CLOSED/.test(st))d(); });
  chB.subscribe((st,e)=>{ sB=st; if(e)console.log("B ch err:",e.message||e); if(st==="SUBSCRIBED"){chB.track({name:"B"});d();} if(/ERROR|TIMED|CLOSED/.test(st))d(); });
  setTimeout(res,15000);
});
await new Promise(r=>setTimeout(r,4000));
const kA=Object.keys(chA.presenceState()), kB=Object.keys(chB.presenceState());
console.log("\nA subscribe:",sA,"| B subscribe:",sB);
console.log("A presence keys:",JSON.stringify(kA));
console.log("B presence keys:",JSON.stringify(kB));
const ok = kA.length===2 && kB.length===2;
console.log(ok? "\n==> 已驗證使用者 presence 也正常同步（不是這個原因）" : "\n==> 復現了！已驗證使用者的頻道沒同步 presence → root cause 在 authenticated 頻道");
process.exit(0);
