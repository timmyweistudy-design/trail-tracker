import fs from "fs"; import path from "path";
const dir="web/js/i18n";
const K="即時連線被擋，請關 VPN／私人DNS 或改用行動網路";
const TR={
 cn:"实时连接被拦截，请关闭 VPN／私人DNS 或改用移动网络",
 de:"Echtzeit-Verbindung blockiert – VPN/Privates DNS aus oder Netzwerk wechseln",
 es:"Conexión en tiempo real bloqueada: desactiva VPN/DNS privado o cambia de red",
 fr:"Connexion temps réel bloquée — désactive VPN/DNS privé ou change de réseau",
 hi:"रियल-टाइम कनेक्शन अवरुद्ध — VPN/निजी DNS बंद करें या नेटवर्क बदलें",
 id:"Koneksi realtime diblokir — matikan VPN/DNS Pribadi atau ganti jaringan",
 it:"Connessione in tempo reale bloccata — disattiva VPN/DNS privato o cambia rete",
 ja:"リアルタイム接続がブロックされています。VPN/プライベートDNSをオフにするか回線を変えてください",
 km:"ការតភ្ជាប់ពេលវេលាជាក់ស្តែងត្រូវបានទប់ស្កាត់ — បិទ VPN/DNS ឯកជន ឬប្តូរបណ្តាញ",
 ko:"실시간 연결이 차단됨 — VPN/비공개 DNS 끄거나 네트워크 변경",
 mn:"Бодит цагийн холболт хаагдсан — VPN/хувийн DNS унтраах эсвэл сүлжээ солино уу",
 ms:"Sambungan masa nyata disekat — matikan VPN/DNS Peribadi atau tukar rangkaian",
 my:"အချိန်နှင့်တပြေးညီ ချိတ်ဆက်မှု ပိတ်ဆို့ခံရသည် — VPN/Private DNS ပိတ်ပါ သို့မဟုတ် ကွန်ရက်ပြောင်းပါ",
 ne:"रियल-टाइम जडान अवरुद्ध — VPN/निजी DNS बन्द गर्नुहोस् वा नेटवर्क परिवर्तन गर्नुहोस्",
 nl:"Realtime-verbinding geblokkeerd — schakel VPN/privé-DNS uit of wissel van netwerk",
 pl:"Połączenie w czasie rzeczywistym zablokowane — wyłącz VPN/prywatny DNS lub zmień sieć",
 pt:"Conexão em tempo real bloqueada — desative VPN/DNS privado ou troque de rede",
 ru:"Realtime-соединение заблокировано — отключите VPN/частный DNS или смените сеть",
 th:"การเชื่อมต่อเรียลไทม์ถูกบล็อก — ปิด VPN/DNS ส่วนตัว หรือเปลี่ยนเครือข่าย",
 tl:"Naka-block ang realtime na koneksyon — patayin ang VPN/Private DNS o magpalit ng network",
 tr:"Gerçek zamanlı bağlantı engellendi — VPN/Özel DNS'i kapatın veya ağı değiştirin",
 uk:"З'єднання в реальному часі заблоковано — вимкніть VPN/приватний DNS або змініть мережу",
 vi:"Kết nối thời gian thực bị chặn — tắt VPN/DNS riêng tư hoặc đổi mạng",
};
let done=0,miss=[];
for(const f of fs.readdirSync(dir).filter(x=>x.endsWith(".js"))){
  const code=f.replace(/\.js$/,""); const p=path.join(dir,f);
  if(!(code in TR)){miss.push(code);continue;}
  let src=fs.readFileSync(p,"utf8");
  if(src.includes(K)){done++;continue;}
  const next=src.replace(/D:\s*\{/, m=>m+`${JSON.stringify(K)}:${JSON.stringify(TR[code])},`);
  if(next===src){miss.push(code+"(no D:{)");continue;}
  fs.writeFileSync(p,next); done++;
}
console.log("updated/ok:",done,"missing:",miss);
