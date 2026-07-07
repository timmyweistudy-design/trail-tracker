import { createClient } from "@supabase/supabase-js";
const URL="https://bkbkamvbczqdejrlpiqo.supabase.co";
const KEY="sb_publishable_3VM6B_9iEw1vt3BTZpTo3w_-r3wkimi";
const TEAM="probe2-"+Math.floor(Date.now()/1000);
const c=createClient(URL,KEY);
// 完全複製 app 的 channel 設定：presence + broadcast + postgres_changes(team_starts)
const ch=c.channel("team:"+TEAM,{config:{presence:{key:"userX"}}});
ch.on("presence",{event:"sync"},()=>{});
ch.on("broadcast",{event:"start"},()=>{});
ch.on("postgres_changes",{event:"*",schema:"public",table:"team_starts",filter:"team_id=eq."+TEAM},()=>{});
let final="(none)";
ch.subscribe((st,err)=>{
  console.log("status:",st, err?("ERR: "+(err.message||err)):"");
  final=st;
  if(st==="SUBSCRIBED"){ ch.track({name:"X"}); }
});
await new Promise(r=>setTimeout(r,9000));
console.log("\n最終狀態:",final);
console.log(final==="SUBSCRIBED"
  ? "==> postgres_changes(team_starts) 綁定 OK，頻道能訂閱（presence 不受此影響）"
  : "==> 頻道沒到 SUBSCRIBED！postgres_changes(team_starts) 綁定失敗會拖垮整個頻道→presence 全無（這就是 root cause）");
// 對照：檢查 team_starts 是否存在/可讀
const { error } = await c.from("team_starts").select("team_id").limit(1);
console.log("team_starts 表查詢:", error? ("錯誤: "+error.message):"可查詢(表存在)");
process.exit(0);
