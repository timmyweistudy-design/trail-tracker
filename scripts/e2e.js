#!/usr/bin/env node
// E2E 冒煙測試（node scripts/e2e.js）：Playwright 無頭瀏覽器實開 App，
// 抓「檢查器抓不到的執行期錯誤」——載入、切五個分頁、開步道詳情、開分級說明、切英文。
// 不掛在 pre-commit（較慢），重大改動後手動跑或放 CI。
const { execSync, spawn } = require("child_process");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const PORT = 8899;

(async () => {
  // WSL 無 sudo 安裝的系統函式庫：用使用者目錄的本地副本（~/pw-libs，apt-get download + dpkg -x）
  const localLibs = path.join(process.env.HOME || "", "pw-libs", "root", "usr", "lib", "x86_64-linux-gnu");
  if (require("fs").existsSync(localLibs)) {
    process.env.LD_LIBRARY_PATH = localLibs + (process.env.LD_LIBRARY_PATH ? ":" + process.env.LD_LIBRARY_PATH : "");
  }
  let chromium;
  try { ({ chromium } = require("playwright")); }
  catch { console.error("✗ 請先安裝：npm i -D playwright && npx playwright install chromium"); process.exit(2); }

  const server = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: path.join(ROOT, "web"), stdio: "ignore" });
  await new Promise(r => setTimeout(r, 1200));

  const errors = [];
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.addInitScript(() => { try { localStorage.setItem("tt_onboarded_v2", "1"); } catch (e) { } });   // 跳過首次導覽浮層
    page.on("pageerror", e => errors.push("pageerror: " + e.message));
    // 忽略外部服務在無頭測試環境的網路/CORS 失敗（線上皆有 try/catch＋後備）：海拔 DEM、翻譯、Supabase、Overpass、圖磚
    const EXT_NOISE = /net::|favicon|404 \(|Failed to load resource|CORS policy|opentopodata|translate\.googleapis|mymemory|supabase|overpass|tile\.|Access to fetch/i;
    page.on("console", m => { if (m.type() === "error" && !EXT_NOISE.test(m.text())) errors.push("console: " + m.text()); });

    const ok = (name, cond) => { console.log((cond ? "✓" : "✗") + " " + name); if (!cond) errors.push("assert: " + name); };

    await page.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    ok("App 載入、標題正確", (await page.title()).includes("循徑拾光"));
    ok("步道列表有卡片", await page.locator(".card.jcard").count() > 0);
    // 搜尋清除鈕：打字→出現→點擊清空
    await page.fill("#searchInput", "古道"); await page.waitForTimeout(400);
    ok("搜尋清除鈕顯示", await page.locator("#searchClear").isVisible());
    await page.click("#searchClear"); await page.waitForTimeout(300);
    ok("清除後搜尋框空", (await page.inputValue("#searchInput")) === "");

    // 切五個分頁
    for (const v of ["record", "pet", "me", "social", "explore"]) {
      await page.click(`.tab[data-view="${v}"]`);
      await page.waitForTimeout(600);
      ok(`分頁 ${v} 顯示`, await page.locator(`#view-${v}.active`).count() === 1);
    }

    // 開步道詳情 → 關閉
    await page.click(".card.jcard");
    await page.waitForTimeout(1500);
    ok("步道詳情開啟", await page.locator("#detailSheet.show").count() === 1);
    await page.click("#closeDetailBtn");
    await page.waitForTimeout(400);

    // 分級說明
    await page.click("#btnGradeInfo").catch(() => {});
    await page.waitForTimeout(400);

    // 切英文重載，確認翻譯層生效
    await page.evaluate(() => localStorage.setItem("tt_lang", "en"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    const tabText = await page.locator('.tab[data-view="explore"]').innerText();
    ok("英文介面生效（Explore 分頁）", /Explore/i.test(tabText));

    const ttErrs = await page.evaluate(() => (window.ttErrors ? window.ttErrors() : []));
    ok("App 內錯誤日誌乾淨", ttErrs.length === 0);
    if (ttErrs.length) ttErrs.slice(0, 5).forEach(e => console.log("  ttError:", e.m));

    // 四語言凍結回歸（v241 日文同形詞條無限迴圈事故）：每個語言載入後主執行緒必須 3 秒內有回應
    for (const lng of ["es", "ja", "ko", "fr", "de", "cn", "pt", "it", "ru", "th", "vi", "id", "tl", "ms", "nl", "pl", "tr", "hi", "my", "km", "ne", "mn", "uk", "zh"]) {
      await page.evaluate(l => localStorage.setItem("tt_lang", l), lng).catch(() => {});
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500);
      const alive = await Promise.race([
        page.evaluate(() => 1 + 1).then(v => v === 2),
        new Promise(r => setTimeout(() => r(false), 3000)),
      ]);
      ok(`語言 ${lng}：載入後主執行緒有回應（無凍結）`, alive);
      if (!alive) break;
    }
    // 按需載入端到端：切西語重載 → 應動態抓 js/i18n/es.js 並實際翻譯（Explore→Explorar）
    await page.evaluate(() => localStorage.setItem("tt_lang", "es"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    ok("按需載入西語生效（Explorar）", /Explorar/i.test(await page.locator('.tab[data-view="explore"]').innerText()));
    // 首次語言選擇覆蓋層：用全新 context（無跳過導覽的 initScript、儲存空白）→ 應出現 .lang-gate
    const fresh = await browser.newContext();
    const fp = await fresh.newPage({ viewport: { width: 390, height: 844 } });
    await fp.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded" });
    await fp.waitForTimeout(2000);
    ok("首次進入顯示語言選擇", await fp.locator(".lang-gate").count() === 1);
    ok("語言選擇有 25 種", await fp.locator(".lang-gate [data-lg]").count() === 25);
    await fp.click('.lang-gate [data-lg="en"]');
    await fp.waitForTimeout(2500);
    ok("選英文後套用（Explore 分頁）", /Explore/i.test(await fp.locator('.tab[data-view="explore"]').innerText()));
    await fresh.close();
    // 字體大小（無障礙）：套用 --fs 後根字級倍率生效、CSS calc 放大文字
    await page.evaluate(() => { localStorage.setItem("tt_fontscale", "1.3"); });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const fsVal = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--fs").trim());
    ok("字體大小 --fs 套用（1.3）", fsVal === "1.3");
    const scaled = await page.evaluate(() => {
      const el = document.querySelector(".tab"); if (!el) return 0;
      return parseFloat(getComputedStyle(el).fontSize);
    });
    ok("字體實際放大（分頁字級 >11px）", scaled > 11);
    // 關鍵流程①：模擬記錄一趟走完（免 GPS）→ 里程>0 → 結束 → 結算頁出現
    await page.evaluate(() => localStorage.setItem("tt_lang", "zh"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    await page.click('.tab[data-view="record"]');
    await page.waitForTimeout(800);
    // 偏離路線的紅色警告框：沒在記錄時絕不該出現（CSS 的 display 規則會蓋掉 hidden 屬性，踩過一次）
    ok("記錄頁閒置時沒有偏離警告紅框", !(await page.locator("#offRoute").isVisible()));
    // 模擬模式是 PRO 功能 → 先讓測試身分成為有效會員（假造 Supabase 的訂閱查詢）
    await page.evaluate(async () => {
      Supa.ready = () => true;
      Supa.client = () => ({
        auth: { getUser: async () => ({ data: { user: { id: "e2e" } } }) },
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { status: "active", current_period_end: null }, error: null }) }) }) }),
      });
      await Premium.refresh();
    });
    await page.waitForTimeout(300);
    ok("非會員模擬模式被鎖住（PRO）", await page.evaluate(() => {
      const t = document.getElementById("simToggle");
      return !!document.querySelector('.sim-toggle .pro-tag') && !t.checked;
    }));
    await page.evaluate(() => { const t = document.getElementById("simToggle"); if (t && !t.checked) t.click(); });
    await page.click("#btnStart");
    await page.waitForTimeout(12000);   // 模擬 10 秒走完整條路線
    const dist = await page.evaluate(() => parseFloat(document.getElementById("stDist").textContent));
    ok(`模擬記錄有里程（${dist} km > 0.1）`, dist > 0.1);
    await page.click("#btnStop");
    await page.waitForTimeout(2500);
    ok("結束後結算頁開啟", await page.locator("#trackSheet.show").count() === 1);
    await page.click("#trackSheet .sheet-close").catch(() => {});
    await page.waitForTimeout(500);
    // 關鍵流程②：匯出備份檔會觸發下載（設定分類已收合→先展開「資料備份」群組）
    await page.click('.tab[data-view="me"]');
    await page.waitForTimeout(600);
    await page.evaluate(() => { const h = [...document.querySelectorAll("#view-me .set-head")].find(x => x.textContent.includes("資料備份")); if (h) h.click(); });
    await page.waitForTimeout(300);
    const dl = page.waitForEvent("download", { timeout: 5000 }).catch(() => null);
    await page.click("#btnFileBackup");
    ok("匯出備份檔觸發下載", !!(await dl));
    // 關鍵流程③：自製對話框（取代原生 confirm）——清除離線地圖 → 對話框出現 → 取消
    await page.evaluate(() => { const h = [...document.querySelectorAll("#view-me .set-head")].find(x => x.textContent.includes("離線地圖")); if (h && !h.parentElement.classList.contains("open")) h.click(); });   // 展開「離線地圖」群組
    await page.waitForTimeout(300);
    await page.evaluate(() => document.getElementById("btnClearTiles")?.scrollIntoView());
    await page.click("#btnClearTiles");
    await page.waitForTimeout(500);
    ok("自製確認對話框出現", await page.locator(".ttdlg").count() === 1);
    await page.click(".ttdlg .btn.ghost");
    await page.waitForTimeout(400);
    ok("取消後對話框關閉", await page.locator(".ttdlg").count() === 0);

    // IAP：模擬原生 App（假 Capacitor + 假 Purchases 外掛）→ 升級彈窗不得出現 Stripe 入口、要有回復購買
    {
      const p2 = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await p2.addInitScript(() => {
        try { localStorage.setItem("tt_onboarded_v2", "1"); } catch (e) { }
        // 假的已登入 session：升級面板要拿 Supabase user id 當 RevenueCat 的 app_user_id 才能 configure。
        // supabase-js 直接讀這個 storage key，expires_at 給未來時間就不會去連網 refresh。
        try {
          localStorage.setItem("sb-bkbkamvbczqdejrlpiqo-auth-token", JSON.stringify({
            access_token: "e2e-fake", refresh_token: "e2e-fake", token_type: "bearer",
            expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400,
            user: { id: "e2e-user-0001", email: "e2e@example.com", user_metadata: {} },
          }));
        } catch (e) { }
        let rcConfigured = false;   // 真 SDK 沒 configure() 過就 getOfferings() 會拋錯，假外掛必須一樣嚴格
        window.Capacitor = {
          isNativePlatform: () => true, getPlatform: () => "ios",
          Plugins: { Purchases: {
            configure: async () => { rcConfigured = true; }, logIn: async () => {},
            // 形狀必須跟真 SDK 一致：PurchasesOfferings = { all, current }，沒有 offerings 包裝層
            // （見 node_modules/@revenuecat/purchases-typescript-internal-esm/dist/offerings.d.ts:421）
            getOfferings: async () => {
              if (!rcConfigured) throw new Error("There is no singleton instance. Make sure you configure Purchases before trying to get offerings.");
              const cur = { identifier: "default", availablePackages: [
                { identifier: "$rc_monthly", packageType: "MONTHLY", product: { identifier: "tt_premium_month", priceString: "US$1.99" } },
                { identifier: "$rc_annual", packageType: "ANNUAL", product: { identifier: "tt_premium_year", priceString: "US$19.99" } },
              ] };
              return ({ all: { default: cur }, current: cur });
            },
            purchasePackage: async () => ({ customerInfo: { entitlements: { active: { premium: {} } } } }),
            restorePurchases: async () => ({ customerInfo: { entitlements: { active: {} } } }),
          } },
        };
      });
      let stripeHit = false;
      p2.on("request", r => { if (r.url().includes("create-checkout")) stripeHit = true; });
      await p2.goto(`http://localhost:${PORT}/index.html`);
      await p2.waitForTimeout(2500);
      await p2.evaluate(() => { window.IAP_ENABLED = true; Premium.openUpgrade(); });
      await p2.waitForTimeout(1200);

      const priceM = await p2.locator('.pm-plan[data-plan="month"] span').innerText();
      if (!priceM.includes("US$1.99")) errors.push(`IAP: 原生價格未用商店回傳值（看到「${priceM}」）`);
      else console.log("✓ 原生：價格用商店回傳的當地價格");

      if (await p2.locator("#pmRestore").count() === 0) errors.push("IAP: 原生升級彈窗缺「回復購買」按鈕（Apple 常見退件原因）");
      else console.log("✓ 原生：有回復購買按鈕");

      // Apple 3.1.2：購買畫面必須有隱私權政策與使用條款連結
      if (await p2.locator(".pm-legal [data-legal]").count() < 2) errors.push("IAP: 購買畫面缺隱私權政策/使用條款連結（Apple 3.1.2）");
      else console.log("✓ 原生：購買畫面有隱私權政策與使用條款連結");

      await p2.click("#pmGo");
      await p2.waitForTimeout(1500);
      if (stripeHit) errors.push("IAP: 原生環境竟打了 Stripe create-checkout（會被 Apple 拒審）");
      else console.log("✓ 原生：購買未觸發 Stripe");
      await p2.close();
    }
  } catch (e) {
    errors.push("fatal: " + e.message);
  } finally {
    if (browser) await browser.close();
    server.kill();
  }

  if (errors.length) { console.error(`\n✗ E2E 未通過（${errors.length}）：`); errors.slice(0, 10).forEach(e => console.error("  • " + e)); process.exit(1); }
  console.log("\n✓ E2E 冒煙測試全部通過");
})();
