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
// 非同步斷言要 push 進來，否則結尾的 process.exit() 會在 .then() 跑之前就退出 → 測試靜默不執行、假綠燈
const pending = [];

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
eval(fs.readFileSync(web("i18n.js"), "utf8").replace(/I18n\.start\(\);[^]*$/, "") + "\n;globalThis.I18n = I18n;");
// 按需語言檔：載入全部（測試會切到各語言驗 tx）
global.window = global.window || {}; global.window.I18n = I18n;
{ const d = web("i18n"); if (fs.existsSync(d)) for (const lf of fs.readdirSync(d).filter(x => x.endsWith(".js"))) eval(fs.readFileSync(path.join(d, lf), "utf8")); }
ok("i18n 字典：探索→Explore", I18n.tx("探索") === "Explore");
ok("i18n 規則：X 分鐘前", I18n.tx("5 分鐘前") === "5 min ago");
ok("i18n 規則：通知含名字", I18n.tx("小明 開始追蹤你") === "小明 started following you");
ok("i18n 規則：還差 X km", I18n.tx("還差 1.2 km") === "1.2 km to go");
ok("i18n 不翻無中文字串", I18n.tx("hello 123") === null);
ok("i18n 上次那行", I18n.tx("上次：象山步道・") === "Last: 象山步道 · ");
ok("i18n 時程：半天", I18n.tx("半天") === "Half a day");
ok("i18n 時程：2~3小時", I18n.tx("2~3小時") === "2–3 hr");
localStorage.setItem("tt_lang", "es");
ok("i18n(es) 字典：探索→Explorar", I18n.tx("探索") === "Explorar");
ok("i18n(es) 字典：儲存→Guardar", I18n.tx("儲存") === "Guardar");
ok("i18n(es) 規則：X 分鐘前", I18n.tx("5 分鐘前") === "hace 5 min");
ok("i18n(es) 規則：通知含名字", I18n.tx("Ana 開始追蹤你") === "Ana empezó a seguirte");
localStorage.setItem("tt_lang", "ja");
ok("i18n(ja) 字典：記錄→記録", I18n.tx("記錄") === "記録");
ok("i18n(ja) 字典：翻譯年糕→ほんやくコンニャク", I18n.tx("翻譯年糕") === "ほんやくコンニャク");
ok("i18n(ja) 規則：X 分鐘前", I18n.tx("5 分鐘前") === "5分前");
ok("i18n(ja) 規則：通知含名字", I18n.tx("花子 開始追蹤你") === "花子 さんがフォローしました");
localStorage.removeItem("tt_lang");
localStorage.setItem("tt_lang", "ko");
ok("i18n(ko) 字典：記錄→기록", I18n.tx("記錄") === "기록");
ok("i18n(ko) 字典：儲存→저장（非救援）", I18n.tx("儲存") === "저장");
ok("i18n(ko) 規則：X 分鐘前", I18n.tx("5 分鐘前") === "5분 전");
localStorage.setItem("tt_lang", "fr");
ok("i18n(fr) 字典：記錄→Suivi", I18n.tx("記錄") === "Suivi");
ok("i18n(fr) 規則：X 分鐘前", I18n.tx("5 分鐘前") === "il y a 5 min");
localStorage.setItem("tt_lang", "de");
ok("i18n(de) 字典：儲存→Speichern", I18n.tx("儲存") === "Speichern");
ok("i18n(de) 規則：通知含名字", I18n.tx("小明 讚了你的貼文") === "小明 gefällt dein Beitrag");
localStorage.setItem("tt_lang", "pt");
ok("i18n(pt) 字典：步道→Trilha", I18n.tx("步道") === "Trilha");
ok("i18n(pt) 規則：X 分鐘前", /minutos?/.test(I18n.tx("5 分鐘前") || ""));
localStorage.setItem("tt_lang", "ru");
ok("i18n(ru) 修正：步道→Тропа（非拖曳）", I18n.tx("步道") === "Тропа");
localStorage.setItem("tt_lang", "vi");
ok("i18n(vi) 修正：儲存→Lưu（非救援）", I18n.tx("儲存") === "Lưu");
localStorage.setItem("tt_lang", "th");
ok("i18n(th) 字典：難度", I18n.tx("難度") === "ความยาก");
localStorage.setItem("tt_lang", "id");
ok("i18n(id) 字典：探索→Jelajahi", I18n.tx("探索") === "Jelajahi");
localStorage.setItem("tt_lang", "it");
ok("i18n(it) 字典：步道→Sentiero", I18n.tx("步道") === "Sentiero");
localStorage.setItem("tt_lang", "tl"); ok("i18n(tl) 字典：步道→Trail", I18n.tx("步道") === "Trail");
localStorage.setItem("tt_lang", "pl"); ok("i18n(pl) 字典：儲存→Zapisz", I18n.tx("儲存") === "Zapisz");
localStorage.setItem("tt_lang", "hi"); ok("i18n(hi) 字典：難度", I18n.tx("難度") === "कठिनाई");
localStorage.setItem("tt_lang", "uk"); ok("i18n(uk) 字典：步道→Стежка", I18n.tx("步道") === "Стежка");
localStorage.setItem("tt_lang", "my"); ok("i18n(my) 團隊：隊友有值", (I18n.tx("隊友") || "").length > 0);
localStorage.setItem("tt_lang", "en"); ok("i18n 小隊：（我）→(Me)", I18n.tx("（我）") === "(Me)");
localStorage.setItem("tt_lang", "cn");
ok("i18n(cn) 繁→簡：記錄→记录", I18n.tx("記錄") === "记录");
ok("i18n(cn) 規則：貼文→帖子", I18n.tx("小明 讚了你的貼文") === "小明 赞了你的帖子");
localStorage.removeItem("tt_lang");
// 地名字典後備（i18n-names.js）
global.window = global.window || {};
eval(fs.readFileSync(web("i18n-names.js"), "utf8"));
ok("地名：宜蘭縣→Yilan County", I18n.tx("宜蘭縣") === "Yilan County");
ok("地名：南澳古道含 Nan'ao", /Nan'ao/.test(I18n.tx("南澳古道") || ""));
delete global.window.TT_NAMES;

// 7) 本地日期
function localDayOf(d) { const t = new Date(d); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; }
const noon = new Date(); noon.setHours(12, 0, 0, 0);
ok("localDay 與本地日期一致", localDayOf(noon) === `${noon.getFullYear()}-${String(noon.getMonth() + 1).padStart(2, "0")}-${String(noon.getDate()).padStart(2, "0")}`);

// 12) RevenueCat webhook：事件 → 訂閱狀態對應
const rcSrc = fs.readFileSync(path.join(ROOT, "supabase", "functions", "revenuecat-webhook", "index.ts"), "utf8");
const rcMap = eval("(" + rcSrc.match(/const EVENT_STATUS[^=]*=\s*(\{[\s\S]*?\})\s*;/)[1] + ")");
ok("RC 續訂→active", rcMap.RENEWAL === "active");
ok("RC 首購→active", rcMap.INITIAL_PURCHASE === "active");
ok("RC 取消→仍 active（期末前有權益）", rcMap.CANCELLATION === "active");
ok("RC 到期→canceled", rcMap.EXPIRATION === "canceled");
ok("RC 退款→canceled", rcMap.REFUND === "canceled");
ok("RC 扣款失敗→past_due", rcMap.BILLING_ISSUE === "past_due");
const rcStore = eval("(" + rcSrc.match(/const STORE_SOURCE[^=]*=\s*(\{[\s\S]*?\})\s*;/)[1] + ")");
ok("RC APP_STORE→app_store", rcStore.APP_STORE === "app_store");
ok("RC PLAY_STORE→play_store", rcStore.PLAY_STORE === "play_store");

// 13) IAP：非原生 / SDK 不存在 / 未啟用 → available() 為假且不拋錯（安全降級，網頁不受影響）
global.window = global.window || {};
delete global.window.Capacitor;
global.window.IAP_ENABLED = true;
eval(fs.readFileSync(web("iap.js"), "utf8") + "\n;globalThis.IAP = IAP;");
ok("IAP 非原生時 available() 為假", IAP.available() === false);
global.window.Capacitor = { isNativePlatform: () => true, Plugins: {} };          // 原生但沒有 Purchases 外掛
ok("IAP 原生但無 SDK → available() 為假", IAP.available() === false);
global.window.Capacitor = { isNativePlatform: () => true, Plugins: { Purchases: {} } };
global.window.IAP_ENABLED = false;                                                // 開關關閉
ok("IAP 未啟用 → available() 為假", IAP.available() === false);
global.window.IAP_ENABLED = true;
ok("IAP 原生＋有 SDK＋已啟用 → available() 為真", IAP.available() === true);

// 13b) plans() 必須看得懂「真 SDK 的回傳形狀」：PurchasesOfferings = { all, current }，沒有 offerings 包裝層。
//   （契約來源：node_modules/@revenuecat/purchases-typescript-internal-esm/dist/offerings.d.ts:421）
//   曾經誤寫成 r.offerings.current → 永遠 undefined → 實機面板一直顯示「付費方案設定中」；
//   而假外掛照著同一個錯的形狀寫，測試與程式碼「互相配合的錯」，e2e 全綠卻擋不住。這裡把形狀釘死。
{
  const realShape = () => {
    const cur = { identifier: "default", availablePackages: [
      { packageType: "MONTHLY", product: { priceString: "NT$60" } },
      { packageType: "ANNUAL", product: { priceString: "NT$600" } },
    ] };
    return Promise.resolve({ all: { default: cur }, current: cur });
  };
  const P = { configure: async () => {}, getOfferings: realShape };
  global.window.Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios", Plugins: { Purchases: P } };
  global.window.REVENUECAT_IOS_KEY = "appl_test";
  // plans() 需要先 configure()（真 SDK 沒 configure 就 getOfferings 會拋錯），所以先 init 再驗形狀
  pending.push(IAP.init("uid-test")
    .then(okInit => { ok("IAP init() 有 key＋有 uid → configure 成功", okInit === true); return IAP.plans(); })
    .then(ps => {
      ok("IAP plans() 讀得懂真 SDK 的 { all, current } 形狀", !!ps && ps.month.price === "NT$60" && ps.year.price === "NT$600");
      // 舊的錯形狀（多包一層 offerings）必須抓不到方案——確保測試真的在驗形狀，而不是隨便給什麼都過
      P.getOfferings = () => Promise.resolve({ offerings: { current: {
        availablePackages: [{ packageType: "MONTHLY", product: { priceString: "NT$60" } }] } } });
      return IAP.plans();
    })
    .then(ps => {
      ok("IAP plans() 對舊的錯形狀回 null（不會假裝拿到方案）", ps === null);
      ok("IAP 失敗時 lastError() 說得出原因（不再只有「設定中」）", /current offering/.test(IAP.lastError()));
    }));
}

// 14) 海拔校正改用 terrarium 高程圖磚（z14）：解碼公式與圖磚座標換算
ok("terrarium 解碼：海平面", Elevation.decode(128, 0, 0) === 0);
ok("terrarium 解碼：玉山約 3952m", Math.abs(Elevation.decode(143, 112, 0) - 3952) < 1);
ok("terrarium 解碼：負高度（死海）", Elevation.decode(126, 40, 0) < 0);
{
  const t = Elevation.tileXY(25.033, 121.564);   // 台北 101 一帶，z14
  ok("tileXY：台北落在 z14 的 (13724, 7014) 圖磚", Math.floor(t.fx) === 13724 && Math.floor(t.fy) === 7014);
  const north = Elevation.tileXY(25.5, 121.564);
  ok("tileXY：緯度越高 → 圖磚 y 越小（北在上）", north.fy < t.fy);
}

// 15) 點到路線距離：必須算「到線段」而非「到頂點」
// （官方路線頂點間距常 100–200m，只比頂點的話，走在兩點正中間的人會被誤判成偏離數十公尺）
{
  const src = fs.readFileSync(web("app.js"), "utf8");
  const m = src.match(/function distToSegment[\s\S]*?\n}/);
  ok("app.js 有 distToSegment（點到線段）", !!m);
  if (m) {
    // eslint-disable-next-line no-new-func
    const distToSegment = new Function("return " + m[0])();
    const a = [25.0000, 121.5000], b = [25.0000, 121.5020];   // 東西向線段，長約 200m
    const mid = [25.0000, 121.5010];                           // 正中間，離線 0
    ok("線段中點距離 ≈ 0", distToSegment(mid[0], mid[1], a, b) < 1);
    const off = [25.0009, 121.5010];                           // 垂直偏離約 100m
    const d = distToSegment(off[0], off[1], a, b);
    ok("垂直偏離 100m 算得出來", Math.abs(d - 100) < 6);
    const beyond = [25.0000, 121.5040];                        // 線段外延伸 → 夾到端點
    ok("投影落在線段外→夾到端點", Math.abs(distToSegment(beyond[0], beyond[1], a, b) - 202) < 12);
  }
}

// safeRun：記錄收尾每步的錯誤隔離器。一步 throw 不外拋、回 false、記進 tt_errors 供診斷；
//   正常步驟回 true。這是「有時候不能結束/進結算、自動儲存沒全存到」的根因修復核心。
{
  const appSrc = fs.readFileSync(web("app.js"), "utf8");
  const m = appSrc.match(/async function safeRun\(label, fn\)[\s\S]*?\n\}/);
  ok("app.js 有 safeRun 收尾隔離器", !!m);
  if (m) {
    eval(m[0] + "\n;globalThis.safeRun = safeRun;");
    localStorage.setItem("tt_errors", "[]");
    pending.push((async () => {
      ok("safeRun 正常步驟回 true", await safeRun("ok步驟", () => 1) === true);
      ok("safeRun throw 的步驟回 false（不外拋、不連坐後續）", await safeRun("壞步驟", () => { throw new Error("boom"); }) === false);
      ok("safeRun 非同步 throw 也擋得住", await safeRun("壞async", async () => { throw new Error("boom2"); }) === false);
      const errs = JSON.parse(localStorage.getItem("tt_errors") || "[]");
      ok("safeRun 把失敗記進 tt_errors（診斷/client_errors 查得到）", errs.some(e => /壞步驟/.test(e.m)));
    })());
  }
}

// Ecology：環境帶判定 + 小黑蚊風險（純函式，基於真實生態；資料由 iNaturalist 烘焙）
eval(fs.readFileSync(web("ecology-data.js"), "utf8"));                       // 設 window.ECO_HABITATS
eval(fs.readFileSync(web("ecology.js"), "utf8") + "\n;globalThis.Ecology = Ecology;");
{
  const D = (y, m, d) => new Date(y, m - 1, d);   // m 用 1–12（月份直覺）
  ok("小黑蚊：嘉義低海拔夏天→高風險", Ecology.biteRisk(400, "嘉義縣", D(2026, 7, 15), "").level === "high");
  ok("小黑蚊：高山(>1200m)→無（上不了）", Ecology.biteRisk(2200, "南投縣", D(2026, 7, 15), "").level === "none");
  ok("小黑蚊：台北低海拔冬天→無（非活躍季）", Ecology.biteRisk(700, "臺北市", D(2026, 1, 15), "").level === "none");
  ok("小黑蚊：台北低海拔夏天→中", Ecology.biteRisk(700, "臺北市", D(2026, 7, 15), "").level === "mid");
  ok("小黑蚊：非活躍季 seasonal=false", Ecology.biteRisk(400, "臺南市", D(2026, 1, 15), "").seasonal === false);
  ok("環境帶：低海拔步道", JSON.stringify(Ecology.habitatsFor({ alt_low: 300, alt_high: 600 })) === JSON.stringify(["低海拔闊葉林"]));
  ok("環境帶：橫跨中海拔到高山", (() => { const h = Ecology.habitatsFor({ alt_low: 1000, alt_high: 3200 }); return h.includes("中海拔針闊混合林") && h.includes("高山") && !h.includes("低海拔闊葉林"); })());
  ok("環境帶：名稱含瀑布→加溪流", Ecology.habitatsFor({ name: "銀簾瀑布步道", alt_low: 400, alt_high: 700 }).includes("溪流"));
  ok("環境帶：無海拔→保守給低海拔", JSON.stringify(Ecology.habitatsFor({})) === JSON.stringify(["低海拔闊葉林"]));
  ok("物種：低海拔查得到真實物種、分類齊、含青竹絲", (() => { const s = Ecology.speciesFor({ alt_low: 300, alt_high: 600 }).species; return s.bird.length > 0 && s.mammal.length > 0 && s.herp.includes("赤尾青竹絲"); })());
  ok("毒蛇標記：青竹絲是毒蛇、蟾蜍不是", Ecology.isPoison("赤尾青竹絲") && !Ecology.isPoison("盤古蟾蜍"));
}

// N) 連續天數/成就日期一律用「本地日期」，不受 UTC 位移害到（半夜/清晨不會被算成前一天）
{
  const petSrc = fs.readFileSync(web("pet.js"), "utf8");
  const m = petSrc.match(/function localDayOf\([\s\S]*?\n\}/);
  ok("pet.js 有 localDayOf", !!m);
  if (m) {
    eval(m[0]);
    ok("localDayOf 用本地日期(清晨不位移到前一天)", localDayOf(new Date(2026, 0, 15, 2, 30)) === "2026-01-15");
    ok("localDayOf 深夜不位移到隔天", localDayOf(new Date(2026, 0, 15, 23, 45)) === "2026-01-15");
    ok("localDayOf 補零", localDayOf(new Date(2026, 2, 3, 9, 0)) === "2026-03-03");
    ok("localDayOf 空值安全", localDayOf("garbage") === "");
  }
  // 成就階層獎勵表長度正確（0 佔位 + 6 階）
  const rw = petSrc.match(/ACH_REWARD\s*=\s*\[([^\]]*)\]/);
  ok("ACH_REWARD 有 7 格(佔位+6階)", !!rw && rw[1].split(",").length === 7);
}

Promise.all(pending).then(() => {                 // 等非同步斷言跑完再結算，否則它們等於沒執行
  console.log(fails ? `✗ ${fails} 個測試失敗` : "✓ 單元測試全部通過");
  process.exit(fails ? 1 : 0);
});
