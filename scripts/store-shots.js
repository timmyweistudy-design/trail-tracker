// App Store 行銷截圖：實開 App 拍 6 個畫面，再套上標語框，輸出 1290×2796（6.9／6.7 吋 iPhone 共用）。
// 用法：npm run store:shots     （WSL 要先 export LD_LIBRARY_PATH=$HOME/pw-libs/root/usr/lib/x86_64-linux-gnu）
// 輸出：store-assets/ios-6.9/<zh|en>/01-…jpg；原始畫面在 store-assets/ios-6.9/raw/（不進版控）
// 社群畫面用測試用的假 Supabase（scripts/tests/soc-mock.js），天氣用假資料（scripts/tests/fake-weather.js），不會碰正式資料庫。
const path = require("path"), fs = require("fs");
const ROOT = path.resolve(__dirname, "..");
const { chromium } = require(ROOT + "/node_modules/playwright");
const { spawn } = require("child_process");
const OUT = ROOT + "/store-assets/ios-6.9/";
const MOCK = fs.readFileSync(ROOT + "/scripts/tests/soc-mock.js", "utf8");
const PORT = 8899;

// 標語：主標＋副標
const SCENES = [
  { key: "01-search", zh: ["一句話找步道", "「台北 3 小時內 有瀑布」直接打就懂"], en: ["Just say what you want", "\"Taipei waterfall under 3 hours\" — done"] },
  { key: "02-summit", zh: ["出發前，先看清楚", "林業署路況、地形地圖、山頂天氣"], en: ["Know before you go", "Trail closures, terrain maps, summit weather"] },
  { key: "03-record", zh: ["安全功能全免費", "GPS 記錄、留守人、求救卡、原路返回"], en: ["Safety tools, always free", "GPS tracking, check-in contact, SOS card, backtrack"] },
  { key: "04-pet", zh: ["越走越進化的夥伴", "從一顆蛋，陪你走成神龍"], en: ["A buddy that grows with you", "From an egg to a dragon, one hike at a time"] },
  { key: "05-peaks", zh: ["登頂收集冊", "百岳、小百岳，登頂自動蓋章"], en: ["Collect the summits", "Reach a peak, get the stamp — automatically"] },
  { key: "06-clubs", zh: ["和山友一起爬", "山社排行、揪團、好友夥伴互動"], en: ["Hike with your crew", "Club rankings, group hikes, buddy visits"] },
];

// 範例行程：最近兩個月 14 趟，夠讓夥伴長大、收集冊有章
function sampleRecords() {
  const T = [["forestry-004", 6.2, 420], ["forestry-002", 9.8, 760], ["forestry-008", 4.1, 230], ["forestry-027", 18.5, 1650], ["forestry-011", 7.4, 540]];
  const out = [];
  for (let i = 0; i < 14; i++) {
    const [id, km, up] = T[i % T.length];
    const d = new Date(Date.now() - (i * 4 + 1) * 864e5); d.setHours(7, 20, 0, 0);
    out.push({ id: "s" + i, date: d.toISOString(), trailName: "x", trailId: id, distanceKm: km, ascent: up, descent: up, elapsedMs: (km / 3.2 + up / 450) * 3.6e6, steps: Math.round(km * 1400), track: [] });
  }
  return out;
}

async function capture(b, lang) {
  const raw = OUT + "raw/" + lang + "/"; fs.mkdirSync(raw, { recursive: true });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, timezoneId: "Asia/Taipei", locale: lang === "zh" ? "zh-TW" : "en-US",
    geolocation: { latitude: 25.0418, longitude: 121.5654, accuracy: 8 }, permissions: ["geolocation"] });
  const p = await ctx.newPage();
  await require(ROOT + "/scripts/tests/fake-weather")(p);
  await p.addInitScript(o => {
    if (sessionStorage.getItem("seed")) return; sessionStorage.setItem("seed", "1");
    localStorage.setItem("tt_lang", o.lang);
    ["tt_onboarded_v2", "tt_coach_trail", "tt_locperm_prompted", "tt_coach_record", "tt_coach_record_tools", "tt_coach_peaks", "tt_coach_team", "tt_coach_soc_friends", "tt_coach_soc_explore", "tt_coach_soc_search", "tt_coach_soc_notif", "tt_coach_soc_me"].forEach(k => localStorage.setItem(k, "1"));
    localStorage.setItem("tt_records", o.recs); localStorage.setItem("tt_social", "1");
    localStorage.setItem("tt_pet_aff", "88"); localStorage.setItem("tt_pet_aff_t", new Date().toISOString()); localStorage.setItem("tt_pet_hat", "bandana");
  }, { lang, recs: JSON.stringify(sampleRecords()) });
  await p.addInitScript(MOCK);
  await p.goto(`http://localhost:${PORT}/`); await p.waitForTimeout(2600);
  const clean = () => p.evaluate(() => { document.querySelectorAll(".tour,.coach,.ttdlg-ov,#toast").forEach(e => e.remove()); if (document.activeElement) document.activeElement.blur(); });
  const shot = async k => { await clean(); await p.waitForTimeout(250); await p.screenshot({ path: raw + k + ".png" }); };
  const tab = async v => { await p.click(`.tab[data-view="${v}"]`); await p.waitForTimeout(1200); };
  await clean();

  // 1 一句話搜尋
  await p.fill("#searchInput", lang === "zh" ? "台北 3 小時內 有瀑布" : "Taipei waterfall under 3 hours");
  await p.waitForTimeout(500); await p.keyboard.press("Enter"); await p.waitForTimeout(900);
  await p.evaluate(() => document.getElementById("mapScope") && document.getElementById("mapScope").scrollIntoView({ block: "start" }));
  await p.evaluate(() => window.scrollBy(0, -70));
  await shot("01-search");
  await p.click("#nlClear").catch(() => {});

  // 2 山頂天氣（大霸尖山）
  await p.evaluate(() => openDetail("forestry-027")); await p.waitForTimeout(800);
  await p.waitForFunction(() => document.querySelector("#summitWx .smt"), null, { timeout: 20000 }).catch(() => {});
  await p.evaluate(() => { const s = document.getElementById("summitWx"); if (s) s.scrollIntoView({ block: "start" }); });
  await p.evaluate(() => { const sc = document.querySelector(".sheet-body, .detail-body, #detailSheet .sheet-scroll"); if (sc) sc.scrollTop -= 90; else window.scrollBy(0, -90); });
  await p.waitForTimeout(600); await shot("02-summit");
  await p.keyboard.press("Escape"); await p.waitForTimeout(600);

  // 3 記錄中
  await tab("record");
  await p.evaluate(() => { const t = TRAILS.find(x => x.id === "forestry-004"); return ensureGeo(t.region).then(() => selectTrailForRecord(t)); }); await p.waitForTimeout(2500);
  await p.evaluate(() => { document.getElementById("simToggle").checked = true; }); await p.click("#btnStart"); await p.waitForTimeout(9000);
  await shot("03-record");
  await p.evaluate(() => { try { Recorder.stop && Recorder.stop(); } catch (e) { /* */ } });

  // 4 夥伴
  await tab("pet"); await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(800);
  await shot("04-pet");

  // 5 收集冊
  await p.evaluate(() => ensureScript("js/debug.js")); await p.waitForTimeout(400);
  await p.evaluate(() => { ttDebug.peaksReset(); ttDebug.peaksStamp(9, 14); }); await p.waitForTimeout(300);
  await p.evaluate(() => ttDebug.openPeaks()); await p.waitForTimeout(1600);
  await shot("05-peaks");
  await p.keyboard.press("Escape"); await p.waitForTimeout(600);

  // 6 山社（假資料）
  await p.evaluate(() => window.__installFakeSupa({}));
  await p.evaluate(() => {
    const P = window.__fakeT.profiles, prof = id => P.find(x => x.id === id), cl = Supa.client(), orig = cl.rpc.bind(cl);
    const club = { id: "c1", name: "週末山友會", about: null, region: "臺北市", is_public: true, members: 4, is_member: true, my_role: "owner", join_code: "K7QH2M" };
    const km = { u1: 24.6, me: 18.2, u3: 11.4, u2: 6.3 };
    cl.rpc = async (n, a) => {
      if (n === "club_list") return { data: [club], error: null };
      if (n === "club_board") return { data: ["u1", "me", "u3", "u2"].map(u => Object.assign({ user_id: u, km: km[u], hikes: u === "u2" ? 1 : 2 + (u === "u1"), ascent: Math.round(km[u] * 62) }, prof(u))), error: null };
      if (n === "club_roster") return { data: ["me", "u1", "u3", "u2"].map(u => Object.assign({ user_id: u, role: u === "me" ? "owner" : "member" }, prof(u))), error: null };
      return orig(n, a);
    };
    const u2 = prof("u2"); u2.display_name = "山嵐"; u2.handle = "shanlan";
  });
  await tab("social"); await p.waitForTimeout(800);
  await p.evaluate(() => Clubs.open()); await p.waitForTimeout(900);
  await p.click('.club-row[data-id="c1"]'); await p.waitForTimeout(1200);
  await shot("06-clubs");
  await ctx.close();
}

// 套標語框：430×932 CSS px × 3 = 1290×2796
function frameHtml(img, title, sub, lang, i) {
  const bg = ["#1f4a33", "#23415a", "#3a2f22", "#2c3f2a", "#3b2f4a", "#1d4645"][i % 6];
  const font = lang === "zh" ? "'TaipeiSans','PingFang TC','Noto Sans TC',sans-serif" : "'TaipeiSans','SF Pro Display','Helvetica Neue',Arial,sans-serif";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face { font-family: TaipeiSans; src: url("http://localhost:${PORT}/vendor/fonts/taipei-sans.woff2") format("woff2"); font-weight: 100 900; }
  html,body{margin:0;width:430px;height:932px;overflow:hidden}
  body{background:radial-gradient(120% 70% at 50% 0%, color-mix(in srgb, ${bg} 70%, #fff 30%), ${bg} 60%);font-family:${font};color:#fbf6e8;position:relative}
  .cap{position:absolute;left:28px;right:28px;top:64px;text-align:center}
  h1{margin:0;word-break:keep-all;text-wrap:balance;font-size:${lang === "zh" ? 40 : 34}px;font-weight:800;letter-spacing:${lang === "zh" ? ".04em" : "-.01em"};line-height:1.15}
  p{margin:12px 0 0;text-wrap:balance;font-size:${lang === "zh" ? 18 : 17}px;font-weight:500;opacity:.86;line-height:1.4}
  .ph{position:absolute;left:50%;top:206px;width:330px;transform:translateX(-50%);border-radius:44px;padding:9px;background:#0d1410;box-shadow:0 30px 60px rgba(0,0,0,.45),0 0 0 2px rgba(255,255,255,.08)}
  .ph img{display:block;width:100%;border-radius:36px}
  </style></head><body><div class="cap"><h1>${title}</h1><p>${sub}</p></div><div class="ph"><img src="${img}"></div></body></html>`;
}

(async () => {
  const srv = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: ROOT + "/web", stdio: "ignore" });
  await new Promise(r => setTimeout(r, 1200));
  const b = await chromium.launch();
  try {
    const only = (process.argv.find(a => a.startsWith("--lang=")) || "").slice(7);
    const skipRaw = process.argv.includes("--frame-only");
    for (const lang of only ? [only] : ["zh", "en"]) {
      if (!skipRaw) await capture(b, lang);
      const dir = OUT + lang + "/"; fs.mkdirSync(dir, { recursive: true });
      const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3 });
      const p = await ctx.newPage();
      for (let i = 0; i < SCENES.length; i++) {
        const s = SCENES[i], rawPng = OUT + "raw/" + lang + "/" + s.key + ".png";
        if (!fs.existsSync(rawPng)) { console.log("skip (no raw)", lang, s.key); continue; }
        const img = "data:image/png;base64," + fs.readFileSync(rawPng).toString("base64");
        await p.setContent(frameHtml(img, s[lang][0], s[lang][1], lang, i), { waitUntil: "load" });
        await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
        await p.screenshot({ path: dir + s.key + ".jpg", type: "jpeg", quality: 92 });
        console.log("✓", lang, s.key);
      }
      await ctx.close();
    }
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
