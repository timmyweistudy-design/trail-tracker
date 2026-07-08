import fs from "fs"; import path from "path";
const dir="web/js/i18n"; const K="隊長已暫停，等隊長繼續";
const TR={cn:"队长已暂停，等队长继续",es:"El líder pausó — esperando que reanude",ja:"リーダーが一時停止中 — 再開待ち",ko:"팀장이 일시정지 — 재개 대기 중",fr:"Chef en pause — en attente de reprise",de:"Leiter pausiert – warte auf Fortsetzung",pt:"Líder pausou — a aguardar retoma",it:"Capo in pausa — in attesa di ripresa",ru:"Лидер приостановил — ждём возобновления",th:"หัวหน้าหยุดชั่วคราว — รอดำเนินต่อ",vi:"Đội trưởng tạm dừng — chờ tiếp tục",id:"Ketua menjeda — menunggu dilanjutkan"};
const EN="Leader paused — waiting for leader to resume";
let n=0;
for(const f of fs.readdirSync(dir).filter(x=>x.endsWith(".js"))){
  const code=f.replace(/\.js$/,""); const p=path.join(dir,f);
  let src=fs.readFileSync(p,"utf8"); if(src.includes(JSON.stringify(K)+":")){n++;continue;}
  const next=src.replace(/D:\s*\{/, m=>m+`${JSON.stringify(K)}:${JSON.stringify(TR[code]||EN)},`);
  if(next!==src){fs.writeFileSync(p,next);n++;}
}
console.log("updated:",n);
