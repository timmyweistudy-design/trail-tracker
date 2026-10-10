// 🎧 音效試聽板 —— 精緻版（2026-10-10 第二版；只在測試面板開）
// 使用者要「整串多一點、直接聽、不用一個一個點」：上面是 30 多串整串試聽（餵食、互動、待機、環境、社交與成長、音樂）＋「全部連播」，
// 播的時候一行一行顯示「第幾步、什麼時機、用了哪一段」，聽到不好的直接說「第幾串第幾步」。
// 下面（收起來）是每一類的候選，可以單獨聽、勾掉不要的（勾選存在 tt_snd_pick，鍵是「群組.類別」），最後「複製結果」。
const SoundBoard = (() => {
  const SP = ["蛋", "毛毛蟲", "蝶", "狐", "虎", "幼龍", "神龍"];
  const FRUIT = { spring: "草莓（春）", summer: "芒果（夏）", autumn: "柿子（秋）", winter: "橘子（冬）" };
  const SURF = { grass: "草地", leaf: "落葉林地", sand: "沙灘", snow: "雪地", cloud: "雲上" };
  const EVL = { bag: "打開果籃", fall: "果實劃過空氣", land: "果實落地", look: "低頭看", step: "腳步", flap: "翅膀拍動", fold: "翅膀收起", lie: "趴下", touch: "碰到果實", bite: "咬", gulp: "吞下去", lick: "舔嘴", content: "吃完滿足", pat: "摸頭", rub: "來回摸", belly: "摸肚子", tickle: "搔癢", hug: "抱抱", heart: "多一顆心", trick: "把戲", hop: "跳", bell: "鈴鐺", dizzy: "頭暈", sigh: "嘆氣", shiver: "發抖", bask: "晒太陽", stretch: "伸懶腰", yawn: "打哈欠", wake: "醒來", shake: "甩一甩", pant: "喘氣", special: "專屬動作", gust: "陣風", pop: "夢泡泡", drop: "松果落地", roll: "松果滾動", gift: "收到禮物", guest_in: "訪客走近", guest_out: "訪客離開", berry_soft: "好友的果實落下", pouch: "果實收進籃子", hatch: "孵化", evolve: "進化", meet: "第一次見面", shutter: "快門", cloth: "試穿配件", hat: "戴帽子", page: "翻手冊", paper: "翻明信片", stamp: "蓋章", ui: "按鈕輕觸" };
  // ── 整串的組法 ──
  const E = (at, ev, i, v, o, label) => ({ at, ev, i, v: v || "", o: o || {}, label });
  function feedSeq(i, v, fruit, surface) {
    const o = { surface, fruit }, st = [E(0, "bag", i, v, o)];
    [0, 1, 2].forEach(k => { const pan = (k - 1) * .6; st.push(E(300 + k * 170, "fall", i, v, Object.assign({ pan }, o)), E(747 + k * 170, "land", i, v, Object.assign({ pan }, o))); });
    st.push(E(1500, "look", i, v, o)); let t = 1800;
    if (i === 2) { st.push(E(t, "flap", i, v, o), E(t + 900, "fold", i, v, o)); t += 1200; }
    else if (i === 6) { st.push(E(t, "step", i, v, o)); t += 900; }
    else if (i > 0) { const n = i === 1 ? 4 : 6, gap = i === 1 ? 480 : i === 4 ? 340 : 260; for (let k = 0; k < n; k++) st.push(E(t + k * gap, "step", i, v, Object.assign({ pan: -.4 + k * .1 }, o))); t += n * gap + 200; }
    if (i === 3 || i === 4) { st.push(E(t, "lie", i, v, o)); t += 800; }
    for (let k = 0; k < 3; k++) { if (i >= 3) st.push(E(t, "touch", i, v, o)); st.push(E(t + 250, "bite", i, v, o)); if (i >= 3) st.push(E(t + 1650, "gulp", i, v, o)); t += i >= 3 ? 2300 : 1700; }
    if (i >= 3) st.push(E(t, "lick", i, v, o)); if (i) st.push(E(t + 700, "content", i, v, o));
    return st;
  }
  const seqs = [];
  const S = (group, title, steps, dur) => seqs.push({ group, title, steps, dur });
  [[1, ""], [2, ""], [3, ""], [3, "sea"], [4, ""], [5, ""], [6, ""], [0, ""]].forEach(([i, v]) => S("餵食", `${v === "sea" ? "水獺（海風近親）" : SP[i]}吃一輪（秋天、${i === 6 ? "雲上" : "落葉林地"}）`, feedSeq(i, v, "autumn", i === 6 ? "cloud" : v === "sea" ? "sand" : "leaf")));
  S("餵食", "四季果實比較（虎）", ["spring", "summer", "autumn", "winter"].flatMap((f, k) => [E(k * 2600, "bite", 4, "", { fruit: f }, FRUIT[f]), E(k * 2600 + 1500, "gulp", 4, "", { fruit: f })]));
  S("餵食", "五種地面比較（果實落地）", Object.keys(SURF).flatMap((sf, k) => [E(k * 1400, "fall", 4, "", { surface: sf }), E(k * 1400 + 450, "land", 4, "", { surface: sf }, SURF[sf])]));
  S("餵食", "走路比較（毛毛蟲／狐／虎／幼龍／神龍）", [[1, 480], [3, 260], [4, 340], [5, 260], [6, 0]].flatMap(([i, g], k) => i === 6 ? [E(k * 2200, "step", 6, "", {}, SP[6])] : [0, 1, 2, 3].map(n => E(k * 2200 + n * g, "step", i, "", { pan: -.3 + n * .2 }, n ? "" : SP[i]))));
  S("互動", "摸頭（每一種）", [[0, ""], [1, ""], [2, ""], [3, ""], [3, "deep"], [4, ""], [5, ""], [6, ""]].map(([i, v], k) => E(k * 2200, "pat", i, v, {}, v === "deep" ? "石虎" : SP[i])));
  S("互動", "來回摸、摸肚子（狐、虎、龍）", [[3, "rub"], [3, "belly"], [4, "rub"], [4, "belly"], [6, "rub"]].map(([i, ev], k) => E(k * 2800, ev, i, "", {}, SP[i])));
  S("互動", "搔癢（每一種的叫聲）", [[1, ""], [2, ""], [3, ""], [3, "sea"], [4, ""], [5, ""], [6, ""]].map(([i, v], k) => E(k * 2000, "tickle", i, v, {}, v === "sea" ? "水獺" : SP[i])));
  S("互動", "抱抱（蛋、狐、虎、龍）＋多一顆心", [[0, "hug"], [3, "hug"], [4, "hug"], [6, "hug"], [4, "heart"]].map(([i, ev], k) => E(k * 3000, ev, i, "", {}, SP[i])));
  S("互動", "六種把戲", [1, 2, 3, 4, 5, 6].map((i, k) => E(k * 2000, "trick", i, "", {}, SP[i])));
  S("互動", "戴鈴鐺跳跳、搖手機頭暈", [E(0, "hop", 3, ""), E(80, "bell", 3, ""), E(900, "hop", 4, ""), E(980, "bell", 4, ""), E(2200, "dizzy", 4, "")]);
  S("待機", "一段待機（虎）", ["look", "sigh", "stretch", "special", "bask", "yawn", "shiver", "pant"].map((ev, k) => E(k * 2600, ev, 4, "")));
  S("待機", "各階專屬動作", [0, 1, 2, 3, 4, 5, 6].map((i, k) => E(k * 2400, "special", i, "", {}, SP[i])));
  S("待機", "打哈欠比較", [3, 4, 5, 6].map((i, k) => E(k * 2400, "yawn", i, "", {}, SP[i])));
  S("待機", "睡著（呼吸、打呼）→ 夢泡泡 → 醒來（虎）", [{ at: 0, scene: { tod: "night", i: 4, asleep: true, season: "autumn" }, label: "夜晚睡著" }, E(6000, "pop", 4, ""), E(10000, "pop", 4, ""), { at: 16000, scene: { tod: "night", i: 4, season: "autumn" }, label: "醒來" }, E(16100, "wake", 4, "")], 19000);
  S("待機", "海風近親甩水、被風吹", [E(0, "shake", 3, "sea"), E(1800, "gust", 4, "")]);
  const AMB = (title, s, dur) => S("環境", title, [{ at: 0, scene: s, label: title }], dur || 18000);
  S("環境", "一天快轉（清晨→白天→黃昏→夜晚，各 15 秒）", [{ at: 0, scene: { tod: "dawn", season: "spring", i: 4 }, label: "清晨" }, { at: 15000, scene: { tod: "day", season: "spring", i: 4 }, label: "白天" }, { at: 30000, scene: { tod: "dusk", season: "spring", i: 4 }, label: "黃昏" }, { at: 45000, scene: { tod: "night", season: "spring", i: 4 }, label: "夜晚（春夏有青蛙）" }], 60000);
  AMB("夏天午後（蟬鳴）", { tod: "day", season: "summer", i: 4 });
  AMB("春夏夜（蟋蟀＋青蛙）", { tod: "night", season: "summer", i: 4 });
  S("環境", "下雨 → 雷雨", [{ at: 0, scene: { tod: "day", wx: "rain", code: 61, i: 4 }, label: "下雨（雨滴點綴）" }, { at: 15000, scene: { tod: "day", wx: "rain", code: 95, i: 4 }, label: "雷雨（遠雷）" }], 35000);
  AMB("起風（陣風）", { tod: "day", feel: "windy", season: "autumn", i: 4 });
  AMB("秋天（落葉點綴）", { tod: "day", season: "autumn", i: 4 });
  AMB("下雪", { tod: "day", wx: "snow", season: "winter", i: 4 });
  AMB("海風近親：白天（海鷗）", { tod: "day", v: "sea", season: "summer", i: 3 });
  AMB("海風近親：夜晚（海浪）", { tod: "night", v: "sea", season: "summer", i: 3 });
  AMB("高山近親（空曠的風、高山鳥）", { tod: "day", v: "alpine", season: "autumn", i: 4 });
  AMB("神龍（雲上的高空風）", { tod: "day", season: "autumn", i: 6 });
  S("社交與成長", "訪客來訪到離開", [E(0, "guest_in", 4, ""), E(5000, "guest_out", 4, "")], 7000);
  S("社交與成長", "收到禮物、好友送果實", [E(0, "gift", 4, ""), ...[0, 1, 2, 3, 4].map(k => E(2500 + k * 140, "berry_soft", 4, "", { pan: -.8 + k * .4 })), E(3800, "pouch", 4, "")]);
  S("社交與成長", "孵化全程", [E(0, "hatch", 1, "")], 8000);
  [3, 4, 5, 6, 7].forEach(lv => S("社交與成長", `進化儀式：變成${SP[lv - 1]}`, [E(0, "evolve", lv - 1, "", { lv })], 7000));
  S("社交與成長", "拍照、裝扮、手冊、明信片、領獎", [E(0, "shutter", 4, ""), E(1200, "hat", 4, ""), E(2000, "cloth", 4, ""), E(3000, "page", 4, ""), E(3800, "paper", 4, ""), E(4600, "stamp", 4, ""), E(5600, "pouch", 4, ""), E(6600, "ui", 4, ""), E(6900, "ui", 4, "")]);
  ["dawn", "day", "dusk", "night"].forEach(t => S("音樂", `背景音樂：${{ dawn: "清晨", day: "白天", dusk: "黃昏", night: "夜晚" }[t]}（每首 25 秒）`, [{ at: 0, music: t, label: "" }], 0));
  S("音樂", "短樂句連播（孵化、進化、見面）", [{ at: 0, stings: true, label: "" }], 0);

  const pick = () => { try { return JSON.parse(localStorage.getItem("tt_snd_pick") || "{}") || {}; } catch (e) { return {}; } };
  const save = p => { try { localStorage.setItem("tt_snd_pick", JSON.stringify(p)); } catch (e) { /* */ } };
  let ov = null, timers = [], mus = null, runId = 0;
  function stopAll() { runId++; timers.forEach(clearTimeout); timers = []; if (mus) { mus.pause(); mus = null; } PetAudio.scene(null); document.querySelectorAll(".sb-seq.on").forEach(b => b.classList.remove("on")); }
  const at = (ms, fn) => { const id = runId; timers.push(setTimeout(() => { if (id === runId) fn(); }, ms)); };
  function log(txt) { const el = ov && ov.querySelector("#sbLog"); if (!el) return; const d = document.createElement("div"); d.textContent = txt; el.appendChild(d); el.scrollTop = el.scrollHeight; }
  // 播一串；回傳這串大約多長（毫秒），全部連播用
  function playSeq(si, onEnd) {
    const q = seqs[si]; let n = 0, end = 0;
    log(`▶ 第 ${si + 1} 串：${q.title}`);
    if (q.steps[0] && q.steps[0].music) { const p = PetAudio.poolOf("music", q.steps[0].music); p.forEach((nm, k) => at(k * 25000, () => { if (mus) mus.pause(); mus = new Audio(PetAudio.DIRS.music + nm + ".mp3"); mus.play().catch(() => { }); log(`　第 ${k + 1} 首：${nm}`); })); end = p.length * 25000; at(end, () => { if (mus) mus.pause(); }); }
    else if (q.steps[0] && q.steps[0].stings) { const ks = Object.keys((PetAudio.M && PetAudio.M.sting) || {}); ks.forEach((k, j) => at(j * 5000, () => { PetAudio.preload(true); const p = PetAudio.poolOf("sting", k); const name = p[0]; if (name) PetAudio.load(name).then(() => PetAudio.play(name, { vol: .8, dry: 1, exact: 1 })); log(`　${k}：${p.join("、")}`); })); end = ks.length * 5000; }
    else q.steps.forEach(st => {
      end = Math.max(end, st.at + 2500);
      at(st.at, () => {
        n++;
        if (st.scene) { PetAudio.scene(st.scene); log(`　第 ${n} 步　環境：${st.label}（${PetAudio._bedsFor(st.scene).join("＋")}）`); return; }
        const names = PetAudio.cueNames(st.ev, st.i, st.v, Object.assign({ force: 1 }, st.o));
        log(`　第 ${n} 步　${st.label ? st.label + "：" : ""}${EVL[st.ev] || st.ev}　${names.length ? names.join("＋") : "（這一步沒有聲音）"}`);
      });
    });
    end = Math.max(end, q.dur || 0, q.steps[0] && q.steps[0].scene && q.steps.length === 1 ? 18000 : 0);
    at(end, () => { if (q.steps.some(s => s.scene)) PetAudio.scene(null); if (onEnd) onEnd(); });
    return end;
  }
  function playAll() { stopAll(); let k = 0; const next = () => { if (k >= seqs.length || !ov) { log("■ 全部播完"); return; } const si = k++; playSeq(si, () => at(800, next)); }; next(); }
  function row(group, key, names) {
    const p = pick()[group + "." + key], on = Array.isArray(p) && p.length ? new Set(p) : new Set(names);
    return `<div class="sb-row" data-g="${group}" data-key="${key}"><div class="sb-l">${key}</div><div class="sb-c">${names.map((n, i) => `<span class="sb-it"><button class="sb-play" data-n="${n}" data-g="${group}">▶ ${i + 1}</button><input type="checkbox" class="sb-ck" data-n="${n}" aria-label="${key} ${i + 1}"${on.has(n) ? " checked" : ""}></span>`).join("")}</div></div>`;
  }
  async function open() {
    if (ov) return; await PetAudio.manifest(); PetAudio.preload(true);
    const M = PetAudio.M || { sfx: {}, amb: {}, music: {}, sting: {} };
    const groups = [...new Set(seqs.map(s => s.group))];
    ov = document.createElement("div"); ov.className = "pet-modal sb-modal"; ov.dataset.ov = "soundboard";
    ov.innerHTML = `<div class="pet-modal-card sb-card"><button class="sheet-close" id="sbX" aria-label="關閉">✕</button><h2>音效試聽板</h2>
      <p class="sb-hint">直接按一串聽；下面的字幕會寫「第幾步、用了哪一段」，聽到不好的告訴 Claude「第幾串第幾步」。同一串再按一次會換一組候選。</p>
      <div class="sb-top"><button class="btn primary" id="sbAll">全部連播（約 ${Math.round(seqs.reduce((a, q) => a + (q.dur || 9000), 0) / 60000)} 分鐘）</button><button class="btn ghost" id="sbStop">停止</button></div>
      <div class="sb-log" id="sbLog" aria-live="polite"></div>
      ${groups.map(g => `<h3>${g}</h3><div class="sb-seqs">${seqs.map((q, i) => q.group === g ? `<button class="btn ghost sb-seq" data-i="${i}"><b>${i + 1}</b> ${q.title}</button>` : "").join("")}</div>`).join("")}
      <details class="sb-more"><summary>每一類的候選（單獨聽、勾掉不要的）</summary>
        <h3>音效（${Object.keys(M.sfx).length} 類）</h3>${Object.keys(M.sfx).map(k => row("sfx", k, M.sfx[k])).join("")}
        <h3>環境音</h3>${Object.keys(M.amb).map(k => row("amb", k, M.amb[k])).join("")}
        <h3>背景音樂</h3>${Object.keys(M.music).map(k => row("music", k, M.music[k])).join("")}
        <h3>短樂句</h3>${Object.keys(M.sting).map(k => row("sting", k, M.sting[k])).join("")}
      </details>
      <div class="sb-foot"><button class="btn ghost" id="sbReset">勾選全部重設</button><button class="btn primary" id="sbCopy">複製結果</button></div><pre class="sb-out" id="sbOut" hidden></pre></div>`;
    document.body.appendChild(ov);
    const close = () => { stopAll(); ov.remove(); ov = null; };
    ov.querySelector("#sbX").onclick = close; ov.addEventListener("click", e => { if (e.target === ov) close(); });
    ov.querySelector("#sbAll").onclick = playAll;
    ov.querySelector("#sbStop").onclick = () => { stopAll(); log("■ 停止"); };
    ov.querySelectorAll(".sb-seq").forEach(b => b.addEventListener("click", () => { stopAll(); b.classList.add("on"); playSeq(+b.dataset.i, () => b.classList.remove("on")); }));
    ov.querySelectorAll(".sb-play").forEach(b => b.addEventListener("click", async () => {
      stopAll(); const n = b.dataset.n, g = b.dataset.g;
      if (g === "music" || g === "amb") { mus = new Audio(PetAudio.DIRS[g] + n + ".mp3"); mus.play().catch(() => { }); if (g === "amb") at(15000, () => { if (mus) mus.pause(); }); log(`▶ ${n}`); return; }
      await PetAudio.load(n); PetAudio.play(n, { vol: .9, len: g === "amb" ? 12 : undefined, dry: 1, exact: 1 }); log(`▶ ${n}`);
    }));
    ov.querySelectorAll(".sb-ck").forEach(c => c.addEventListener("change", () => {
      const r = c.closest(".sb-row"), k = r.dataset.g + "." + r.dataset.key, chosen = [...r.querySelectorAll(".sb-ck")].filter(x => x.checked).map(x => x.dataset.n), p = pick();
      if (!chosen.length) { c.checked = true; toast("每一類至少留一個"); return; }
      p[k] = chosen; save(p);
    }));
    ov.querySelector("#sbReset").onclick = () => { localStorage.removeItem("tt_snd_pick"); ov.querySelectorAll(".sb-ck").forEach(c => { c.checked = true; }); toast("已重設成全部都用"); };
    ov.querySelector("#sbCopy").onclick = () => {
      const p = {}; ov.querySelectorAll(".sb-row").forEach(r => { const all = r.querySelectorAll(".sb-ck"), ch = [...all].filter(x => x.checked); if (ch.length < all.length) p[r.dataset.g + "." + r.dataset.key] = ch.map(x => x.dataset.n); });
      const txt = "音效試聽結果（沒列出的類別＝全部都要）：" + JSON.stringify(p);
      const out = ov.querySelector("#sbOut"); out.hidden = false; out.textContent = txt;
      (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast("已複製，貼給 Claude 就好")).catch(() => toast("請長按下面的文字複製"));
    };
  }
  return { open, seqs, _playSeq: (i, cb) => playSeq(i, cb), _stop: stopAll };
})();
