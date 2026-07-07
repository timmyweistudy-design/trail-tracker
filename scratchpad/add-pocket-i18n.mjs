import fs from "fs"; import path from "path";
const dir = "web/js/i18n";
const LOCK = { cn:"锁定屏幕", de:"Sperren", es:"Bloquear", fr:"Verrouiller", hi:"लॉक करें", id:"Kunci layar", it:"Blocca", ja:"画面ロック", km:"ចាក់សោ", ko:"화면 잠금", mn:"Түгжих", ms:"Kunci skrin", my:"မျက်နှာပြင်လော့ခ်", ne:"लक गर्नुहोस्", nl:"Vergrendelen", pl:"Zablokuj", pt:"Bloquear", ru:"Блокировка", th:"ล็อกหน้าจอ", tl:"I-lock", tr:"Kilitle", uk:"Заблокувати", vi:"Khóa màn hình" };
const HOLD = { cn:"长按解锁", de:"Zum Entsperren halten", es:"Mantén para desbloquear", fr:"Maintenir pour déverrouiller", hi:"अनलॉक करने के लिए दबाए रखें", id:"Tahan untuk buka", it:"Tieni premuto per sbloccare", ja:"長押しで解除", km:"សង្កត់ដើម្បីដោះសោ", ko:"길게 눌러 잠금 해제", mn:"Тайлахын тулд удаан дар", ms:"Tekan lama untuk buka", my:"ဖွင့်ရန်ဖိထားပါ", ne:"अनलक गर्न थिच्नुहोस्", nl:"Ingedrukt houden om te ontgrendelen", pl:"Przytrzymaj, aby odblokować", pt:"Segure para desbloquear", ru:"Удерживайте для разблокировки", th:"กดค้างเพื่อปลดล็อก", tl:"Pindutin nang matagal para i-unlock", tr:"Kilidi açmak için basılı tut", uk:"Утримуйте, щоб розблокувати", vi:"Giữ để mở khóa" };
const K1="鎖定畫面", K2="長按解鎖";
let done=0, miss=[];
for (const f of fs.readdirSync(dir).filter(x=>x.endsWith(".js"))) {
  const code=f.replace(/\.js$/,""); const p=path.join(dir,f);
  if (!(code in LOCK)||!(code in HOLD)) { miss.push(code); continue; }
  let src=fs.readFileSync(p,"utf8");
  if (src.includes(K1)&&src.includes(K2)) { done++; continue; }
  const entry = `${JSON.stringify(K1)}:${JSON.stringify(LOCK[code])},${JSON.stringify(K2)}:${JSON.stringify(HOLD[code])},`;
  const next = src.replace(/D:\s*\{/, m => m + entry);
  if (next===src) { miss.push(code+"(no D:{)"); continue; }
  fs.writeFileSync(p,next); done++;
}
console.log("updated/ok:",done,"missing:",miss);
