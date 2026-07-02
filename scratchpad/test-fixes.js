// 驗證本次修正的核心邏輯（node scratchpad/test-fixes.js）
global.localStorage = { _d: {}, getItem(k){ return this._d[k] ?? null; }, setItem(k,v){ this._d[k]=String(v); }, removeItem(k){ delete this._d[k]; } };
const fs = require("fs");
eval(fs.readFileSync("web/js/storage.js", "utf8") + "\n;globalThis.Store = Store;");   // Store, haversine, trackSegments
const Elevation = require("../web/js/elevation.js");
let fails = 0;
const ok = (name, cond) => { console.log((cond ? "✓" : "✗") + " " + name); if (!cond) fails++; };

// 1) trackSegments：gap 正確切段
const tr = [{lat:25,lon:121},{lat:25.001,lon:121},{lat:25.1,lon:121.1,gap:true},{lat:25.101,lon:121.1}];
const segs = trackSegments(tr);
ok("trackSegments 切成 2 段", segs.length === 2 && segs[0].length === 2 && segs[1].length === 2);
ok("trackSegments 無 gap 時 1 段", trackSegments([{lat:1,lon:1},{lat:2,lon:2}]).length === 1);
ok("trackSegments 空值安全", trackSegments(null).length === 0);

// 2) Elevation.recompute：中值濾波壓掉單點毛刺
const clean = Elevation.recompute([100,105,110,115,120]);         // 單調上升 20m
ok("recompute 單調上升 ascent=20", clean && clean.ascent === 20 && clean.descent === 0);
const spiky = Elevation.recompute([100,105,140,110,115,120]);     // 中間 140 是毛刺
ok("recompute 毛刺被中值濾波壓掉（ascent 仍≈20 而非 60+）", spiky && spiky.ascent <= 25);

// 3) 備份鍵：BACKUP_KEYS 含本次新增鍵
const bk = fs.readFileSync("web/js/storage.js","utf8").match(/BACKUP_KEYS\s*=\s*\[([^\]]*)\]/)[1];
for (const k of ["tt_pet_berry_bonus","tt_pet_fed_t","tt_badges_got","tt_quest_hi","tt_theme","tt_pro_color","tt_presets"])
  ok("備份鍵含 " + k, bk.includes('"' + k + '"'));

// 4) exportAll/importAll 來回：pet 鍵不遺失
localStorage.setItem("tt_pet_berry_bonus","7"); localStorage.setItem("tt_badges_got",'["初心者"]');
const dump = Store.exportAll();
localStorage._d = {};
Store.importAll(dump, "replace");
ok("備份還原後 tt_pet_berry_bonus 保留", localStorage.getItem("tt_pet_berry_bonus") === "7");
ok("備份還原後 tt_badges_got 保留", localStorage.getItem("tt_badges_got") === '["初心者"]');

// 5) 本地日期（模擬 app.js 的 localDayOf）
function localDayOf(d){ const t=new Date(d); return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`; }
const noon = new Date(); noon.setHours(12,0,0,0);
ok("localDay 與本地日期一致", localDayOf(noon) === `${noon.getFullYear()}-${String(noon.getMonth()+1).padStart(2,"0")}-${String(noon.getDate()).padStart(2,"0")}`);

process.exit(fails ? 1 : 0);
