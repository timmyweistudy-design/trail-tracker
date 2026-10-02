// 一句話找步道（不用 AI 服務、離線也能用）：把「週六台北近郊、3 小時內、有瀑布、不要太陡」拆成條件。
// 認得：地區（縣市、北中南東部）、時間（N 小時內、半天、一天）、難度（輕鬆／親子／挑戰）、坡度（不要太陡）、
//       景色（瀑布、古道、湖、海景、森林、溫泉、神木、吊橋…）、大眾運輸（有公車）、附近。
// 至少認出一個條件才算「一句話搜尋」，否則照舊用關鍵字比對名稱。剩下認不出來的詞會當關鍵字。
const NLSearch = (() => {
  const T = s => (typeof ttT === "function" ? ttT(s) : s);
  const REGION = [
    [/台北|臺北|taipei/i, ["臺北市"]], [/新北|new taipei/i, ["新北市"]], [/基隆|keelung/i, ["基隆市"]], [/桃園|桃园|taoyuan/i, ["桃園市"]],
    [/新竹|hsinchu/i, ["新竹縣", "新竹市"]], [/苗栗|miaoli/i, ["苗栗縣"]], [/台中|臺中|taichung/i, ["臺中市"]], [/彰化|changhua/i, ["彰化縣"]],
    [/南投|nantou/i, ["南投縣"]], [/雲林|云林|yunlin/i, ["雲林縣"]], [/嘉義|嘉义|chiayi/i, ["嘉義縣", "嘉義市"]], [/台南|臺南|tainan/i, ["臺南市"]],
    [/高雄|kaohsiung/i, ["高雄市"]], [/屏東|pingtung/i, ["屏東縣"]], [/宜蘭|宜兰|yilan/i, ["宜蘭縣"]], [/花蓮|花莲|hualien/i, ["花蓮縣"]],
    [/台東|臺東|台东|taitung/i, ["臺東縣"]], [/澎湖|penghu/i, ["澎湖縣"]], [/金門|金门|kinmen/i, ["金門縣"]], [/馬祖|連江|马祖|连江|matsu/i, ["連江縣"]],
    [/北部|北台灣|north(ern)? taiwan/i, ["臺北市", "新北市", "基隆市", "桃園市", "新竹縣", "新竹市", "宜蘭縣"]],
    [/中部|central taiwan/i, ["苗栗縣", "臺中市", "彰化縣", "南投縣", "雲林縣"]],
    [/南部|south(ern)? taiwan/i, ["嘉義縣", "嘉義市", "臺南市", "高雄市", "屏東縣"]],
    [/東部|花東|east(ern)? taiwan/i, ["宜蘭縣", "花蓮縣", "臺東縣"]],
  ];
  // 景色：[顯示用, 比對名稱的規則]
  const SIGHTS = [
    ["瀑布", /瀑布|waterfall/i, /瀑布|瀑/], ["古道", /古道|old trail|historic/i, /古道/], ["湖泊", /湖|潭|lake/i, /湖|潭|埤|池/],
    ["海景", /海景|看海|海邊|海岸|sea|ocean|coast/i, /海|濱|岬|灣|燈塔|岩岸|漁港/], ["森林", /森林|樹林|forest|woods/i, /森林|林道|神木|巨木|杉林|林/],
    ["溫泉", /溫泉|温泉|hot ?spring/i, /溫泉|泉/], ["神木", /神木|巨木|giant tree/i, /神木|巨木/], ["吊橋", /吊橋|吊桥|suspension bridge/i, /吊橋|橋/],
    ["溪流", /溪|河|stream|river|creek/i, /溪|河|川/], ["竹林", /竹林|bamboo/i, /竹/], ["山頂展望", /展望|看風景|眺望|view(point)?|summit/i, /山|峰|嶺|頂|展望|觀景/],
    ["環狀", /環狀|loop/i, /環/],
  ];
  const CN = { 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 半: 0.5 };
  const num = s => { if (s == null) return null; if (/^\d+(\.\d+)?$/.test(s)) return +s; let v = 0; for (const ch of s) v += CN[ch] || 0; return v || null; };

  function parse(q) {
    q = String(q || "").trim();
    if (q.length < 2) return null;
    let rest = q;
    const take = re => { const m = rest.match(re); if (m) rest = rest.replace(m[0], " "); return m; };
    const c = { regions: [], sights: [], chips: [] };
    // 地區
    for (const [re, rs] of REGION) {
      const m = take(re); if (!m) continue;
      rs.forEach(r => c.regions.includes(r) || c.regions.push(r));
      const area = rs.length > 2 ? (/北/.test(m[0]) || /north/i.test(m[0]) ? "北部" : /中/.test(m[0]) || /central/i.test(m[0]) ? "中部" : /南/.test(m[0]) || /south/i.test(m[0]) ? "南部" : "東部") : rs[0];
      c.chips.push(["region", T(area)]);
    }
    if (take(/近郊|郊區|郊山/)) { /* 近郊：只是口語，交給地區 */ }
    if (take(/附近|離我近|nearby|near me/i)) { c.near = true; c.chips.push(["near", T("附近")]); }
    // 時間
    let m = take(/(\d+(?:\.\d+)?|[一二兩三四五六七八九十半]+)\s*(?:個)?\s*(?:小時|小时|鐘頭|钟头|hours?|hrs?)(?:\s*(?:內|以內|左右|以下|or less|max))?/i);
    if (m) { c.maxHours = num(m[1]); }
    else if (take(/半天|half[- ]day/i)) c.maxHours = 4;
    else if (take(/一天|整天|當天來回|day ?trip|one day/i)) c.maxHours = 8;
    else { const mk = take(/(\d+(?:\.\d+)?)\s*(?:公里|km)(?:內|以內|以下)?/i); if (mk) { c.maxKm = +mk[1]; c.chips.push(["km", `${c.maxKm} km`]); } }
    if (c.maxHours) c.chips.push(["hours", T("%d 小時內").replace("%d", c.maxHours)]);
    // 難度與坡度
    if (take(/親子|亲子|小孩|小朋友|推車|推车|嬰兒車|婴儿车|長輩|长辈|老人|family|kids?|stroller/i)) { c.family = true; c.chips.push(["family", T("親子")]); }
    if (take(/輕鬆|轻松|簡單|简单|好走|新手|入門|入门|不累|easy|beginner/i)) { c.maxDiff = 2; c.chips.push(["easy", T("輕鬆")]); }
    else if (take(/中等|普通|moderate/i)) { c.minDiff = 2; c.maxDiff = 3; c.chips.push(["mid", T("中等")]); }
    else if (take(/挑戰|挑战|困難|困难|很難|很难|硬一點|有難度|有难度|hard|challenging|difficult/i)) { c.minDiff = 4; c.chips.push(["hard", T("挑戰")]); }
    if (take(/不要太陡|不陡|不要太喘|平緩|平缓|平坦|平路|not (too )?steep|flat|gentle/i)) { c.gentle = true; c.chips.push(["gentle", T("不要太陡")]); }
    // 交通
    if (take(/公車|公车|大眾運輸|大众运输|捷運|捷运|火車|火车|搭車|bus|public transport|mrt|train/i)) { c.transit = true; c.chips.push(["transit", T("大眾運輸")]); }
    // 景色
    for (const [name, re, nameRe] of SIGHTS) { if (take(re)) { c.sights.push([name, nameRe]); c.chips.push(["sight:" + name, T(name)]); } }
    // 口語贅字拿掉；剩下的當關鍵字
    rest = rest.replace(/週[一二三四五六日天]|星期[一二三四五六日天]|周末|週末|假日|平日|今天|明天|後天|這週|下週|想去|想走|找|有|的|要|不要|一條|一些|步道|路線|推薦|可以|適合|左右|以內|以下|內|，|,|、|。|！|!|\?|？|和|跟|或|又|而且|還要|最好|大概|稍微|一點|走|爬山|健行|hike|hiking|trail|trails|with|and|in|near|under|a|the|for|that|is|not|too|some|want|to|go|on|saturday|sunday|weekend|today|tomorrow/gi, " ").replace(/\s+/g, " ").trim();
    c.words = rest.split(" ").filter(w => w.length >= 2);
    const structured = c.chips.length;
    if (!structured) return null;
    return c;
  }

  // t：步道；estH：估計時數函式；slope：坡度函式
  function match(t, c, estH, slope) {
    if (c.regions.length && !c.regions.includes(t.region) && !c.regions.some(r => String(t.position || "").includes(r))) return false;
    if (c.maxHours) { const h = estH(t); if (!h || h > c.maxHours * 1.15) return false; }
    if (c.maxKm && (t.length_km == null || t.length_km > c.maxKm)) return false;
    const d = t.difficulty;
    if (c.maxDiff != null && (d == null || d > c.maxDiff || d === 6)) return false;
    if (c.minDiff != null && (d == null || d < c.minDiff)) return false;
    if (c.family && !t.family_friendly && !(d != null && d <= 1)) return false;
    if (c.gentle) { const s = slope(t); if (s && s.level > 0) return false; if (!s && d != null && d >= 3) return false; }
    if (c.transit && !/公車|客運|捷運|火車|台鐵|臺鐵|接駁/.test(String(t.transport || ""))) return false;
    for (const [, nameRe] of c.sights) if (!nameRe.test(t.name || "")) return false;
    if (c.words.length) { const hay = String(`${t.name} ${t.position || ""} ${t.region || ""} ${t.system || ""}`); if (!c.words.every(w => hay.includes(w))) return false; }
    return true;
  }
  return { parse, match };
})();
if (typeof window !== "undefined") window.NLSearch = NLSearch;
