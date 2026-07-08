import fs from "fs"; import path from "path";
const dir="web/js/i18n";
const EN={"👑 隊長暫停了記錄":"👑 Leader paused the recording","👑 隊長繼續記錄":"👑 Leader resumed recording"};
const TR={
 es:{"👑 隊長暫停了記錄":"👑 El líder pausó la grabación","👑 隊長繼續記錄":"👑 El líder reanudó la grabación"},
 ja:{"👑 隊長暫停了記錄":"👑 リーダーが記録を一時停止","👑 隊長繼續記錄":"👑 リーダーが記録を再開"},
 ko:{"👑 隊長暫停了記錄":"👑 팀장이 기록을 일시정지","👑 隊長繼續記錄":"👑 팀장이 기록을 재개"},
 fr:{"👑 隊長暫停了記錄":"👑 Le chef a mis l'enregistrement en pause","👑 隊長繼續記錄":"👑 Le chef a repris l'enregistrement"},
 de:{"👑 隊長暫停了記錄":"👑 Teamleiter hat pausiert","👑 隊長繼續記錄":"👑 Teamleiter hat fortgesetzt"},
 cn:{"👑 隊長暫停了記錄":"👑 队长暂停了记录","👑 隊長繼續記錄":"👑 队长继续记录"},
 pt:{"👑 隊長暫停了記錄":"👑 O líder pausou a gravação","👑 隊長繼續記錄":"👑 O líder retomou a gravação"},
 it:{"👑 隊長暫停了記錄":"👑 Il capo ha messo in pausa","👑 隊長繼續記錄":"👑 Il capo ha ripreso"},
 ru:{"👑 隊長暫停了記錄":"👑 Лидер приостановил запись","👑 隊長繼續記錄":"👑 Лидер возобновил запись"},
 th:{"👑 隊長暫停了記錄":"👑 หัวหน้าหยุดบันทึกชั่วคราว","👑 隊長繼續記錄":"👑 หัวหน้าบันทึกต่อ"},
 vi:{"👑 隊長暫停了記錄":"👑 Đội trưởng đã tạm dừng ghi","👑 隊長繼續記錄":"👑 Đội trưởng đã tiếp tục ghi"},
 id:{"👑 隊長暫停了記錄":"👑 Ketua menjeda perekaman","👑 隊長繼續記錄":"👑 Ketua melanjutkan perekaman"},
};
let done=0;
for(const f of fs.readdirSync(dir).filter(x=>x.endsWith(".js"))){
  const code=f.replace(/\.js$/,""); const p=path.join(dir,f);
  let src=fs.readFileSync(p,"utf8"); const t=TR[code]||{}; let entry="";
  for(const k of Object.keys(EN)){ if(src.includes(JSON.stringify(k)+":")) continue; entry+=`${JSON.stringify(k)}:${JSON.stringify(t[k]||EN[k])},`; }
  if(!entry){done++;continue;}
  const next=src.replace(/D:\s*\{/, m=>m+entry);
  if(next!==src){fs.writeFileSync(p,next);done++;}
}
console.log("updated:",done);
