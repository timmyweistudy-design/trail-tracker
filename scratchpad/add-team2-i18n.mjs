import fs from "fs"; import path from "path";
const dir="web/js/i18n";
const EN={
 "我是隊長":"I'm the leader","等待按準備":"Waiting for ready",
 "隊友未在記錄中，暫時看不到位置":"Teammate isn't recording — location unavailable",
 "點隊友名字看他目前位置（記錄中才有）":"Tap a teammate's name to see their location (only while recording)"};
const TR={
 es:{"我是隊長":"Soy el líder","等待按準備":"Esperando confirmación","隊友未在記錄中，暫時看不到位置":"El compañero no está grabando: ubicación no disponible","點隊友名字看他目前位置（記錄中才有）":"Toca el nombre de un compañero para ver su ubicación (solo al grabar)"},
 ja:{"我是隊長":"私がリーダー","等待按準備":"準備待ち","隊友未在記錄中，暫時看不到位置":"仲間は記録していません。位置は表示できません","點隊友名字看他目前位置（記錄中才有）":"仲間の名前をタップすると現在地を表示（記録中のみ）"},
 ko:{"我是隊長":"내가 팀장","等待按準備":"준비 대기 중","隊友未在記錄中，暫時看不到位置":"팀원이 기록 중이 아니어서 위치를 볼 수 없어요","點隊友名字看他目前位置（記錄中才有）":"팀원 이름을 누르면 현재 위치 표시 (기록 중일 때만)"},
 fr:{"我是隊長":"Je suis le chef","等待按準備":"En attente de préparation","隊友未在記錄中，暫時看不到位置":"Le coéquipier n'enregistre pas — position indisponible","點隊友名字看他目前位置（記錄中才有）":"Touchez le nom d'un coéquipier pour voir sa position (seulement en enregistrement)"},
 de:{"我是隊長":"Ich bin Teamleiter","等待按準備":"Warte auf Bereit","隊友未在記錄中，暫時看不到位置":"Teamkollege zeichnet nicht auf – Position nicht verfügbar","點隊友名字看他目前位置（記錄中才有）":"Tippe auf einen Namen, um die Position zu sehen (nur beim Aufzeichnen)"},
 cn:{"我是隊長":"我是队长","等待按準備":"等待准备","隊友未在記錄中，暫時看不到位置":"队友未在记录中，暂时看不到位置","點隊友名字看他目前位置（記錄中才有）":"点队友名字看他当前位置（记录中才有）"},
 pt:{"我是隊長":"Sou o líder","等待按準備":"Aguardando preparação","隊友未在記錄中，暫時看不到位置":"O colega não está a gravar — localização indisponível","點隊友名字看他目前位置（記錄中才有）":"Toque no nome de um colega para ver a localização (só ao gravar)"},
 it:{"我是隊長":"Sono il capo","等待按準備":"In attesa del pronto","隊友未在記錄中，暫時看不到位置":"Il compagno non sta registrando — posizione non disponibile","點隊友名字看他目前位置（記錄中才有）":"Tocca il nome di un compagno per vederne la posizione (solo durante la registrazione)"},
 ru:{"我是隊長":"Я лидер","等待按準備":"Ожидание готовности","隊友未在記錄中，暫時看不到位置":"Товарищ не записывает — местоположение недоступно","點隊友名字看他目前位置（記錄中才有）":"Нажмите на имя, чтобы увидеть местоположение (только при записи)"},
 th:{"我是隊長":"ฉันเป็นหัวหน้า","等待按準備":"รอกดพร้อม","隊友未在記錄中，暫時看不到位置":"เพื่อนยังไม่ได้บันทึก จึงยังดูตำแหน่งไม่ได้","點隊友名字看他目前位置（記錄中才有）":"แตะชื่อเพื่อนเพื่อดูตำแหน่งปัจจุบัน (เฉพาะตอนบันทึก)"},
 vi:{"我是隊長":"Tôi là đội trưởng","等待按準備":"Đang chờ sẵn sàng","隊友未在記錄中，暫時看不到位置":"Đồng đội chưa ghi lại nên chưa xem được vị trí","點隊友名字看他目前位置（記錄中才有）":"Chạm tên đồng đội để xem vị trí (chỉ khi đang ghi)"},
 id:{"我是隊長":"Saya ketua","等待按準備":"Menunggu siap","隊友未在記錄中，暫時看不到位置":"Rekan belum merekam — lokasi tidak tersedia","點隊友名字看他目前位置（記錄中才有）":"Ketuk nama rekan untuk melihat lokasinya (hanya saat merekam)"},
};
let done=0;
for(const f of fs.readdirSync(dir).filter(x=>x.endsWith(".js"))){
  const code=f.replace(/\.js$/,""); const p=path.join(dir,f);
  let src=fs.readFileSync(p,"utf8");
  const t=TR[code]||{};
  let entry="";
  for(const k of Object.keys(EN)){ if(src.includes(JSON.stringify(k)+":")) continue; entry+=`${JSON.stringify(k)}:${JSON.stringify(t[k]||EN[k])},`; }
  if(!entry) { done++; continue; }
  const next=src.replace(/D:\s*\{/, m=>m+entry);
  if(next!==src){ fs.writeFileSync(p,next); done++; }
}
console.log("updated:",done,"langs");
