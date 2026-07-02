// 語言切換（v1）：字典式中→英翻譯層。
// 做法：tt_lang=en 時，用 TreeWalker 把畫面上「完全匹配」字典的文字節點與
// placeholder/title/aria-label 換成英文，MutationObserver 讓動態產生的介面（貼文卡、彈窗）也翻。
// 涵蓋主要介面文字；含數字的組合字串（toast 等）與步道資料內容維持中文，之後逐步擴充 DICT 即可。
const I18n = (() => {
  const DICT = {
    // 分頁
    "探索": "Explore", "記錄": "Record", "夥伴": "Buddy", "社群": "Social", "我的": "Me",
    "尋徑・分級・記錄你的每一步": "Find trails · Grades · Track every step",
    // 探索
    "搜尋步道、地區、主題…": "Search trails, regions, themes…", "語音搜尋": "Voice search",
    "全部": "All", "★ 收藏": "★ Saved", "✓ 已完成": "✓ Done", "親子友善": "Family-friendly",
    "篩選": "Filter", "篩選與排序": "Filter & Sort", "列表": "List", "地圖": "Map",
    "列表檢視": "List view", "地圖檢視": "Map view", "附近": "Nearby", "不限": "Any",
    "難度": "Difficulty", "地區": "Region", "主題": "Theme", "排序": "Sort", "範圍": "Range",
    "預設": "Default", "名稱": "Name", "最短": "Shortest", "最長": "Longest", "最易": "Easiest", "最難": "Hardest",
    "離我最近": "Nearest", "長度上限": "Max length", "爬升上限": "Max ascent",
    "只看有路線": "With route only", "排除封閉": "Exclude closed", "重設": "Reset", "關閉": "Close",
    "💾 存為常用篩選": "💾 Save as preset", "我的口袋路線": "My saved filters",
    "輕鬆": "Easy", "一般": "Moderate", "進階": "Advanced", "挑戰以上": "Challenging+",
    "古道": "Historic", "瀑布": "Waterfall", "海景": "Ocean view", "森林": "Forest", "湖泊": "Lake", "溫泉": "Hot spring", "環狀": "Loop", "其他": "Other",
    "我的評分": "My rating", "我評 4★+": "My 4★+", "條": "trails", "查看": "View", "載入中…": "Loading…", "ⓘ 分級說明": "ⓘ Grade info",
    // 記錄頁
    "準備就緒，按「開始」記錄路徑": "Ready — tap “Start” to record", "▶ 開始": "▶ Start",
    "⏸ 暫停": "⏸ Pause", "⏹ 結束": "⏹ Finish", "▶ 繼續": "▶ Resume", "已暫停": "Paused",
    "公里": "km", "步數": "Steps", "大卡": "kcal", "公里/小時": "km/h",
    "累積爬升 m": "Ascent m", "下降 m": "Descent m",
    "省電模式": "Battery saver", "螢幕保持喚醒": "Keep screen on", "模擬（無 GPS 預覽）": "Simulate (no GPS)",
    "隊友同行": "Team up", "分享位置": "Share location", "跟著路線走": "Follow a route",
    "隨手拍（記錄當下里程）": "Snap photo (tags distance)",
    "記錄中": "Recording", "海拔校正中…": "Correcting elevation…",
    // 小隊
    "小隊": "Team", "我的小隊": "My teams", "建立小隊": "Create team", "用加入碼加入": "Join with code",
    "建立": "Create", "加入": "Join", "設為目前": "Set current", "目前": "Current",
    "退出目前小隊": "Leave current team", "邀請好友": "Invite friends", "邀請": "Invite", "已邀請": "Invited",
    "✋ 準備": "✋ Ready", "✓ 已準備": "✓ Ready", "小隊名稱": "Team name",
    // 夥伴頁
    "🐾 山林夥伴": "🐾 Trail Buddy", "每日任務": "Daily quests", "成就勳章": "Achievements",
    "好友的夥伴": "Friends' buddies", "夥伴手冊": "Buddy book", "帶我去走": "Take me hiking",
    "今日出門健行": "Hike today", "夥伴推薦": "Buddy picks",
    // 我的頁
    "個人資料（用於估算步數與卡路里）": "Profile (for steps & calories)",
    "體重（公斤）": "Weight (kg)", "身高（公分）": "Height (cm)",
    "背包負重（公斤，選填，納入卡路里）": "Pack weight (kg, optional)",
    "儲存": "Save", "外觀主題": "Appearance", "淺色": "Light", "深色": "Dark", "主題色": "Accent color",
    "會員": "Membership", "我的足跡": "My stats", "進階分析": "Advanced Analytics", "年度回顧": "Year in Review",
    "足跡地圖": "Footprint map", "雲端備份": "Cloud backup", "雲端還原": "Cloud restore",
    "行程紀錄": "Trip history", "全部路線檔": "Export all GPX",
    "離線地圖": "Offline maps", "一鍵下載全台離線地圖（概覽）": "Download Taiwan overview map",
    "預載所有收藏步道的離線地圖": "Preload maps for saved trails", "清除離線地圖": "Clear offline maps",
    "已快取地圖圖磚：計算中…": "Cached tiles: counting…",
    "在步道詳情頁按「預載離線地圖」可下載該步道範圍，山區無網路也能看地圖。":
      "Tap “Preload offline map” on a trail page to use maps without signal in the mountains.",
    "足跡地圖與雲端同步為 Premium 功能，跨裝置保存你的行程與收藏。":
      "Footprint map & cloud sync are Premium features that keep your trips safe across devices.",
    "🐞 診斷／回報問題": "🐞 Diagnostics / report", "升級 Premium": "Upgrade to Premium", "管理訂閱": "Manage subscription",
    "語言 Language": "Language",
    // 社群
    "動態": "Feed", "搜尋": "Search", "通知": "Notifications", "貼文": "Post", "留言": "Comments",
    "追蹤": "Follow", "已追蹤": "Following", "已申請": "Requested", "粉絲": "Followers", "追蹤中": "Following",
    "登入": "Sign in", "登出": "Sign out", "編輯": "Edit", "收藏": "Saved", "揪團": "Events", "設定": "Settings",
    "讚": "Likes", "全部標記已讀": "Mark all read", "分享": "Share", "刪除": "Delete",
    // 通用
    "📴 離線模式（地圖與已快取內容仍可用）": "📴 Offline mode (cached maps & content still work)",
    "🔄 有新版本，點此更新": "🔄 New version — tap to update",
    "確定": "OK", "取消": "Cancel", "以後再說": "Maybe later",
  };
  const ATTRS = ["placeholder", "title", "aria-label"];

  function lang() { try { return localStorage.getItem("tt_lang") || "zh"; } catch { return "zh"; } }
  function tx(s) { if (s == null) return null; const k = s.trim(); return k ? (DICT[k] || null) : null; }

  function walk(root) {
    if (!root) return;
    try {
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode())) {
        const v = tx(n.nodeValue);
        if (v) n.nodeValue = n.nodeValue.replace(n.nodeValue.trim(), v);
      }
      if (root.querySelectorAll) {
        for (const el of root.querySelectorAll("[placeholder],[title],[aria-label]")) {
          for (const a of ATTRS) { const v = el.getAttribute(a); const t = v && tx(v); if (t) el.setAttribute(a, t); }
        }
      }
    } catch (e) { /* 翻譯失敗不影響功能 */ }
  }

  function start() {
    if (lang() !== "en") return;
    document.documentElement.lang = "en";
    walk(document.body);
    const obs = new MutationObserver(muts => {
      for (const m of muts) {
        if (m.type === "characterData") { const v = tx(m.target.nodeValue); if (v) m.target.nodeValue = v; continue; }
        for (const node of m.addedNodes) {
          if (node.nodeType === 3) { const v = tx(node.nodeValue); if (v) node.nodeValue = v; }
          else if (node.nodeType === 1) walk(node);
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function set(l) { try { localStorage.setItem("tt_lang", l); } catch (e) { /* */ } location.reload(); }

  return { lang, set, start, walk };
})();
I18n.start();
