import fs from "fs";
import path from "path";
const dir = "web/js/i18n";
const TR = {
  cn: "🌿 休息中", de: "🌿 Pause", es: "🌿 Descansando", fr: "🌿 Pause",
  hi: "🌿 विश्राम", id: "🌿 Istirahat", it: "🌿 In pausa", ja: "🌿 休憩中",
  km: "🌿 សម្រាក", ko: "🌿 휴식 중", mn: "🌿 Амарч байна", ms: "🌿 Berehat",
  my: "🌿 အနားယူနေသည်", ne: "🌿 विश्राम", nl: "🌿 Rusten", pl: "🌿 Odpoczynek",
  pt: "🌿 Descansando", ru: "🌿 Отдых", th: "🌿 กำลังพัก", tl: "🌿 Nagpapahinga",
  tr: "🌿 Dinlenme", uk: "🌿 Відпочинок", vi: "🌿 Đang nghỉ",
};
const KEY = "🌿 休息中";
let done = 0, missing = [];
for (const f of fs.readdirSync(dir).filter(x => x.endsWith(".js"))) {
  const code = f.replace(/\.js$/, "");
  if (!(code in TR)) { missing.push(code); continue; }
  const p = path.join(dir, f);
  let src = fs.readFileSync(p, "utf8");
  if (src.includes(KEY)) { done++; continue; }          // 冪等：已加過就跳過
  const entry = `${JSON.stringify(KEY)}:${JSON.stringify(TR[code])},`;
  const next = src.replace(/D:\s*\{/, m => m.replace(/\{\s*$/, "{") + entry);
  if (next === src) { missing.push(code + "(no D:{)"); continue; }
  fs.writeFileSync(p, next);
  done++;
}
console.log("updated/ok:", done, "missing/unmatched:", missing);
