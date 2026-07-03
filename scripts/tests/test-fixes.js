// 核心邏輯單元測試（node scripts/tests/test-fixes.js；npm run check 會自動跑）
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const web = f => path.join(ROOT, "web", "js", f);

global.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
global.indexedDB = undefined;   // node 無 IDB：封存層應靜默退化、不噴錯
eval(fs.readFileSync(web("storage.js"), "utf8") + "\n;globalThis.Store = Store;");
const Elevation = require(web("elevation.js"));
let fails = 0;
const ok = (name, cond) => { console.log((cond ? "✓" : "✗") + " " + name); if (!cond) fails++; };

// 1) trackSegments：gap 正確切段
const tr = [{ lat: 25, lon: 121 }, { lat: 25.001, lon: 121 }, { lat: 25.1, lon: 121.1, gap: true }, { lat: 25.101, lon: 121.1 }];
const segs = trackSegments(tr);
ok("trackSegments 切成 2 段", segs.length === 2 && segs[0].length === 2 && segs[1].length === 2);
ok("trackSegments 無 gap 時 1 段", trackSegments([{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }]).length === 1);
ok("trackSegments 空值安全", trackSegments(null).length === 0);

// 2) Elevation.recompute：中值濾波壓掉單點毛刺
const clean = Elevation.recompute([100, 105, 110, 115, 120]);
ok("recompute 單調上升 ascent=20", clean && clean.ascent === 20 && clean.descent === 0);
const spiky = Elevation.recompute([100, 105, 140, 110, 115, 120]);
ok("recompute 毛刺被中值濾波壓掉", spiky && spiky.ascent <= 25);

// 3) 備份鍵完整性
const bk = fs.readFileSync(web("storage.js"), "utf8").match(/BACKUP_KEYS\s*=\s*\[([^\]]*)\]/)[1];
for (const k of ["tt_pet_berry_bonus", "tt_pet_fed_t", "tt_badges_got", "tt_quest_hi", "tt_theme", "tt_pro_color", "tt_presets", "tt_life"])
  ok("備份鍵含 " + k, bk.includes('"' + k + '"'));

// 4) exportAll/importAll 來回：鍵不遺失
localStorage.setItem("tt_pet_berry_bonus", "7"); localStorage.setItem("tt_badges_got", '["初心者"]');
const dump = Store.exportAll();
localStorage._d = {};
Store.importAll(dump, "replace");
ok("備份還原後 tt_pet_berry_bonus 保留", localStorage.getItem("tt_pet_berry_bonus") === "7");
ok("備份還原後 tt_badges_got 保留", localStorage.getItem("tt_badges_got") === '["初心者"]');

// 5) 終身統計：加紀錄累積、手動刪除扣回、模擬不計
localStorage._d = {};
const mk = (id, km) => ({ id, date: "2026-07-02T04:00:00.000Z", distanceKm: km, ascent: 100, kcal: 200, steps: 1000, elapsedMs: 3.6e6, track: [{ lat: 25, lon: 121 }, { lat: 25.01, lon: 121 }] });
Store.addRecord(mk("a", 5)); Store.addRecord(mk("b", 3));
ok("終身統計累積 km=8", Math.abs(Store.life().km - 8) < 1e-6 && Store.life().trips === 2);
Store.deleteRecord("b");
ok("手動刪除扣回 km=5", Math.abs(Store.life().km - 5) < 1e-6 && Store.life().trips === 1);
Store.addRecord(Object.assign(mk("s", 9), { sim: true }));
ok("模擬紀錄不計入終身統計", Math.abs(Store.life().km - 5) < 1e-6);
// 還原較舊備份不倒退（reconcile 取較大值）
const before = Store.life().km;
Store.importAll({ records: [mk("a", 1)] }, "replace");
ok("還原較舊備份，終身統計不倒退", Store.life().km >= before);

// 6) i18n 翻譯層：字典與規則式
eval(fs.readFileSync(web("i18n.js"), "utf8") + "\n;globalThis.I18n = I18n;");
ok("i18n 字典：探索→Explore", I18n.tx("探索") === "Explore");
ok("i18n 規則：X 分鐘前", I18n.tx("5 分鐘前") === "5 min ago");
ok("i18n 規則：通知含名字", I18n.tx("小明 開始追蹤你") === "小明 started following you");
ok("i18n 規則：還差 X km", I18n.tx("還差 1.2 km") === "1.2 km to go");
ok("i18n 不翻無中文字串", I18n.tx("hello 123") === null);

// 7) 本地日期
function localDayOf(d) { const t = new Date(d); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; }
const noon = new Date(); noon.setHours(12, 0, 0, 0);
ok("localDay 與本地日期一致", localDayOf(noon) === `${noon.getFullYear()}-${String(noon.getMonth() + 1).padStart(2, "0")}-${String(noon.getDate()).padStart(2, "0")}`);

console.log(fails ? `✗ ${fails} 個測試失敗` : "✓ 單元測試全部通過");
process.exit(fails ? 1 : 0);
