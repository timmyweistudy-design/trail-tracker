// 夥伴音效、環境音、背景音樂 —— 精緻版（2026-10-10 第二版，docs/sound-plan-v2.md）
// 第一版（真實錄音、聲音池、不放合成音、環境音、背景音樂、ambient Audio Session）之上：
//  - 素材清單在 sounds/manifest.json（約 95 類音效 × 5～8 段、15 種以上環境音、四個時段的音樂、短樂句），引擎第一次用到才讀
//  - 事件細分：物種 × 動作 × 地面（草地／落葉／沙灘／雪地／雲）× 季節果實（草莓／芒果／柿子／橘子）
//  - 空間感：場景殘響（森林／高山／海邊／雲上，程式產生的衝擊響應）、左右聲道跟著畫面位置、總線壓縮器（很多聲音一起響不破音）
//  - 睡覺時的呼吸循環＋偶爾打呼；天氣點綴（雨滴、遠雷、落葉、海鷗、高山鳥、陣風）
//  - 背景音樂依時段挑曲；孵化、進化有短樂句
// 測試面板「🎧音效試聽板」可以換聲音池（tt_snd_pick，鍵是「群組.類別」），也能整串試聽。
const PetAudio = (() => {
  const DIRS = { sfx: "sounds/pet/", amb: "sounds/amb/", music: "sounds/music/", sting: "sounds/sting/" };
  let M = null, mP = null;   // manifest：{ sfx:{key:[名]}, amb:{key:[名]}, music:{tod:[名]}, sting:{key:[名]} }
  function manifest() { if (M) return Promise.resolve(M); if (mP) return mP; return (mP = fetch("sounds/manifest.json").then(r => r.json()).then(j => (M = j)).catch(() => { mP = null; return null; })); }
  const groupOf = name => { if (!M) return "sfx"; for (const g of ["sfx", "amb", "music", "sting"]) for (const k in (M[g] || {})) if (M[g][k].includes(name)) return g; return "sfx"; };
  const DIR = name => DIRS[groupOf(name)];
  const pick = () => { try { return JSON.parse(localStorage.getItem("tt_snd_pick") || "{}") || {}; } catch (e) { return {}; } };
  function poolOf(group, key) { const base = (M && M[group] && M[group][key]) || []; const p = pick()[group + "." + key]; return Array.isArray(p) && p.length ? p.filter(x => base.includes(x)) : base; }
  const vol = k => { const d = { sfx: 1, amb: .35, mus: .3 }[k]; try { const v = parseFloat(localStorage.getItem("tt_snd_vol_" + k)); return isFinite(v) ? Math.max(0, Math.min(1, v)) : d; } catch (e) { return d; } };

  let ac = null, bus = null; const buf = {}, loading = {}, lastUsed = {}, lastAt = {};
  function setSession() { try { if (navigator.audioSession && navigator.audioSession.type !== "ambient") navigator.audioSession.type = "ambient"; } catch (e) { /* 舊版 Safari 沒有這個 API */ } }
  // 程式產生的殘響衝擊響應：雙聲道雜訊 × 指數衰減，再用一階低通讓尾巴暗一點（不用另外下載檔案）
  function makeIR(sec, decay, damp) {
    const n = Math.floor(ac.sampleRate * sec), b = ac.createBuffer(2, n, ac.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); let lp = 0; for (let i = 0; i < n; i++) { const t = i / ac.sampleRate; lp += (1 - damp) * ((Math.random() * 2 - 1) - lp); d[i] = lp * Math.exp(-t * decay) * (i < 60 ? i / 60 : 1); } }
    return b;
  }
  const ROOMS = { forest: [.9, 5, .55, .12], alpine: [2.4, 2.2, .35, .16], sea: [1.4, 3.2, .45, .13], sky: [3, 1.6, .7, .2] };   // 長度秒、衰減、阻尼、送出量
  let room = "", wet = .12;
  function setRoom(r) { if (!ac || r === room || !ROOMS[r]) return; room = r; const [s, d, dm, w] = ROOMS[r]; try { bus.verb.buffer = makeIR(s, d, dm); } catch (e) { /* */ } wet = w; }
  function ctx() {
    try {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
        setSession(); ac = new AC();
        const g = () => ac.createGain();
        bus = { master: g(), sfx: g(), amb: g(), mus: g(), duck: g(), verb: ac.createConvolver(), verbOut: g(), comp: ac.createDynamicsCompressor() };
        const c = bus.comp; c.threshold.value = -16; c.knee.value = 10; c.ratio.value = 4; c.attack.value = .004; c.release.value = .25;
        bus.sfx.connect(bus.master); bus.verb.connect(bus.verbOut); bus.verbOut.connect(bus.sfx);
        bus.amb.connect(bus.duck); bus.mus.connect(bus.duck); bus.duck.connect(bus.master); bus.master.connect(c); c.connect(ac.destination);
        setRoom("forest"); applyVol(); manifest();
      }
      if (ac.state === "suspended") ac.resume().catch(() => { /* 沒有音訊裝置／系統不讓開：安靜 */ });
    } catch (e) { return null; }
    return ac;
  }
  function applyVol() { if (!bus) return; const t = ac.currentTime; bus.sfx.gain.setTargetAtTime(vol("sfx") * .8, t, .05); bus.amb.gain.setTargetAtTime(vol("amb"), t, .3); bus.mus.gain.setTargetAtTime(vol("mus"), t, .3); }
  function load(name) {
    if (buf[name]) return Promise.resolve(buf[name]); if (loading[name]) return loading[name];
    const c = ctx(); if (!c) return Promise.resolve(null);
    return (loading[name] = manifest().then(() => fetch(DIR(name) + name + ".mp3")).then(r => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
      .then(a => new Promise((res, rej) => c.decodeAudioData(a, res, rej))).then(b => (buf[name] = b)).catch(() => { delete loading[name]; return null; }));
  }
  // 池裡隨機挑一段，不跟上一次同一段；還沒載好就這一下安靜（不放合成音）
  function choose(group, key) {
    const p = poolOf(group, key); if (!p.length) return null;
    const ready = p.filter(n => buf[n]); p.forEach(n => { if (!buf[n]) load(n); });
    if (!ready.length) return null;
    const opts = ready.length > 1 ? ready.filter(n => n !== lastUsed[group + key]) : ready;
    const n = opts[Math.floor(Math.random() * opts.length)]; lastUsed[group + key] = n; return n;
  }
  // o：vol、rate（只微調）、delay 秒、len 最多播幾秒（結尾淡出）、off 起點、pan -1～1、dry（不送殘響）、wet 殘響倍數
  function playBuf(name, o) {
    o = o || {}; const c = ctx(), b = buf[name]; if (!c || !b) return false;
    try {
      const s = c.createBufferSource(), g = c.createGain(), t0 = c.currentTime + (o.delay || 0);
      const rate = (o.rate || 1) * (o.exact ? 1 : .94 + Math.random() * .12), v = (o.vol == null ? 1 : o.vol) * (o.exact ? 1 : .9 + Math.random() * .2);
      const off = Math.min(o.off || 0, Math.max(0, b.duration - .2)), len = Math.min(b.duration - off, o.len || b.duration);
      s.buffer = b; s.playbackRate.value = rate;
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(v, t0 + .008);
      const end = t0 + len / rate; g.gain.setValueAtTime(v, Math.max(t0 + .01, end - Math.min(.25, len / 3))); g.gain.linearRampToValueAtTime(0, end);
      let out = g;
      if (o.pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); g.connect(p); out = p; }
      s.connect(g); out.connect(o.bus || bus.sfx);
      if (!o.dry && !o.bus) { const w = c.createGain(); w.gain.value = wet * (o.wet == null ? 1 : o.wet); out.connect(w); w.connect(bus.verb); }
      s.start(t0, off); s.stop(end + .02);
      if (window.__petSndLog) window.__petSndLog.push(name.replace(/-\d+$/, ""));   // 測試用：播了哪一類
      if (window.__petSndNames) window.__petSndNames.push(name);              // 測試用：播了哪一段
      return true;
    } catch (e) { return false; }
  }
  function duck(depth, ms) { if (!bus) return; const t = ac.currentTime, d = bus.duck.gain; d.cancelScheduledValues(t); d.setTargetAtTime(1 - depth, t, .05); d.setTargetAtTime(1, t + ms / 1000, .35); }

  // ── 事件 → 聲音層（i：0 蛋…6 神龍；v：""／deep／sea／alpine；o：surface 地面、fruit 季節、pan 左右、lv 進化後等級） ──
  const CAT = (i, v) => i === 4 || (i === 3 && v === "deep");
  const BIG = [1, 1, 1, 1, .97, .93, .9];
  const LAND = { grass: "land_grass", leaf: "land_leaf", sand: "land_sand", snow: "land_snow", cloud: "land_cloud" };
  const BITE = { spring: "bite_straw", summer: "bite_mango", autumn: "bite_persim", winter: "bite_orange" };
  function recipe(ev, i, v, o) {
    o = o || {}; const L = (key, x) => [key, x || {}], sf = o.surface || "grass", fr = o.fruit || "autumn";
    const fur = i >= 4 ? "fur_thick" : "fur_short", paw = i === 1 ? "crawl" : i === 3 ? "paw_light" : i === 4 ? "paw_heavy" : i === 5 ? "claw" : i === 6 ? "float" : "";
    switch (ev) {
      case "bag": return [L("bag", { vol: .3, dry: 1 })];
      case "fall": return [L("fall_light", { vol: .14 })];
      case "land": return sf === "cloud" ? [L("land_cloud", { vol: .4 })] : [L(LAND[sf] || "land_grass", { vol: .55 }), ...(sf === "grass" || sf === "leaf" ? [L("bounce", { vol: .18, delay: .13 })] : []), ...(sf === "leaf" ? [L("leaf_fall", { vol: .12, delay: .05, len: .6 })] : [])];
      case "look": return i ? [L("rustle_small", { vol: .18 })] : [];
      case "step": return paw ? [L(paw, { vol: i === 4 ? .32 : i === 6 ? .12 : .22, len: i === 6 ? 1.6 : .45 }), ...(sf === "snow" && i >= 3 && i <= 5 ? [L("land_snow", { vol: .12, len: .35 })] : [])] : [];
      case "flap": return [L("wing_flap", { vol: i === 2 ? .3 : .4 })];
      case "fold": return [L("wing_fold", { vol: .22 })];
      case "lie": return [L("lie_down", { vol: i === 4 ? .45 : .32 })];
      case "touch": return i >= 3 ? [L("touch", { vol: .25 })] : [];
      case "bite":
        if (i === 0) return [L("egg_glow", { vol: .2, len: 2.2 })];
        if (i === 1) return [L("nibble", { vol: .5, len: 1.4 })];
        if (i === 2) return [L("sip", { vol: .4, len: 1.3 })];
        return [...(fr === "winter" ? [L("peel", { vol: .3, len: .6 })] : []), L(BITE[fr] || "bite_persim", { vol: .65, rate: BIG[i], len: 1.1, delay: fr === "winter" ? .4 : 0 }),
          L(i === 3 || i === 5 ? "chew_mid" : "chew_big", { vol: .32, rate: BIG[i], delay: (fr === "winter" ? .4 : 0) + .35, len: i >= 4 ? 1.6 : 1.1 })];
      case "gulp": return i >= 3 ? [L(i === 3 ? "gulp_small" : "gulp_big", { vol: .28, rate: BIG[i] })] : [];
      case "lick": return i >= 3 ? [L("lick", { vol: .25 })] : [];
      case "content": return i === 0 ? [] : CAT(i, v) || i >= 5 ? [L("purr", { vol: .4, rate: BIG[i], len: 1.8, off: 1 + Math.random() * 3 })] : [L("content", { vol: .3 })];
      case "pat": case "rub":
        if (i === 0) return [L("knock", { vol: .32 })];
        if (i === 1) return [L("rustle_small", { vol: .3 })];
        if (i === 2) return [L("wing_flap", { vol: .22 })];
        return [L(fur, { vol: .38, len: ev === "rub" ? 1.6 : .9 }), ...(CAT(i, v) ? [L("purr", { vol: .42, len: ev === "rub" ? 2.6 : 1.6, off: 1 + Math.random() * 3, delay: .1 })] : i >= 5 ? [L("dragon_rumble", { vol: .3, delay: .15 })] : [])];
      case "belly": return i >= 3 ? [L("belly", { vol: .35 }), L("content", { vol: .25, delay: .5 })] : [];
      case "tickle":
        if (i === 0) return [L("knock", { vol: .22, rate: 1.1 })];
        if (i === 1) return [L("rustle_small", { vol: .3 }), L("rustle_small", { vol: .25, delay: .25 })];
        if (i === 2) return [L("wing_flap", { vol: .3 })];
        if (i === 3) return [L(fur, { vol: .3, len: .6 }), L(v === "sea" ? "otter_squeak" : "fox_call", { vol: .3, delay: .2, len: 1.2 })];
        if (i === 4) return [L(fur, { vol: .3, len: .6 }), L("tiger_chuff", { vol: .32, delay: .2, len: 1.4 })];
        return [L("dragon_rumble", { vol: .32, len: 1.6 })];
      case "hug":
        if (i === 0) return [L("knock", { vol: .32 }), L("egg_answer", { vol: .25, delay: .45 })];
        if (i === 1) return [L("rustle_small", { vol: .32, len: 1 })];
        if (i === 2) return [L("wing_fold", { vol: .25 })];
        if (CAT(i, v) || i >= 5) return [L(fur, { vol: .3, len: 1 }), L("purr", { vol: .5, rate: BIG[i], len: 2.8, off: 1 + Math.random() * 3 })];
        return [L(fur, { vol: .38, len: 1.2 }), L("content", { vol: .28, delay: .5 })];
      case "heart": return [L("heart", { vol: .3, dry: 1 })];
      case "trick":
        if (i === 1) return [L("roll_leaf", { vol: .4 })];
        if (i === 2) return [L("wing_flap", { vol: .4 }), L("wing_flap", { vol: .35, delay: .3 })];
        if (i === 3) return [L("spin", { vol: .35 }), L("paw_light", { vol: .2, delay: .4, len: .4 })];
        if (i === 4) return [0, .28, .56].map(d => L("stomp", { vol: .4, delay: d }));
        if (i === 5) return [0, .3, .6].map(d => L("wing_flap", { vol: .35, delay: d }));
        if (i === 6) return [L("puff", { vol: .4 })];
        return [L("knock", { vol: .25 })];
      case "hop": return i === 0 ? [L(LAND[sf] || "land_grass", { vol: .25 })] : i === 1 ? [L("crawl", { vol: .3 })] : i === 2 || i === 5 ? [L("wing_flap", { vol: .4 })] : i === 6 ? [L("float", { vol: .22, len: 1.6 })] : [L(paw, { vol: .4, len: .45 })];
      case "bell": return [L("bell", { vol: .26, rate: 1.2, len: 1 })];
      case "dizzy": return i ? [L("dizzy", { vol: .3, len: 1.6 })] : [];
      case "sigh": return i ? [L(i >= 4 ? "sigh_big" : "sigh_small", { vol: .25, rate: BIG[i] })] : [];
      case "shiver": return i ? [L("shiver", { vol: .3, len: 1.4 })] : [];
      case "bask": return i ? [L("breath_slow", { vol: .2, len: 3, rate: BIG[i] }), ...(CAT(i, v) ? [L("purr", { vol: .25, len: 2.5, off: 2 })] : [])] : [];
      case "stretch": return i ? [L("stretch", { vol: .28, len: 1.6 })] : [];
      case "yawn": case "wake": return i === 3 ? [L("yawn_small", { vol: .35 })] : i === 4 ? [L("yawn_big", { vol: .38 })] : i === 5 ? [L("yawn_small", { vol: .35, rate: .95 })] : i === 6 ? [L("yawn_dragon", { vol: .38 })] : ev === "wake" && i ? [L("rustle_small", { vol: .25 })] : [];
      case "shake": return v === "sea" ? [L("splash", { vol: .42 })] : i ? [L("shiver", { vol: .32, len: 1 })] : [];
      case "pant": return i === 3 || i === 4 ? [L("pant", { vol: .25, len: 1.6 })] : [];
      case "swell": return [L("breath_slow", { vol: .25, len: 1.6, rate: .9 })];
      case "special": return [[L("egg_creak", { vol: .3 }), L("egg_glow", { vol: .18, delay: .5, len: 2 })], [L("nibble", { vol: .4, len: 1.2 })], [L("wing_flap", { vol: .4 }), L("wing_flap", { vol: .35, delay: .35 }), L("wing_flap", { vol: .3, delay: .7 })], [L("spin", { vol: .3 })], [L("lick_paw", { vol: .3, len: 2 })], [L("smoke_puff", { vol: .35 })], [L("float", { vol: .25, len: 2 })]][i] || [];
      case "gust": return [L("gust", { vol: .28, len: 3.5, wet: .5 })];
      case "pop": return [L("pop", { vol: .2 })];
      case "drop": return [L(LAND[sf] || "land_grass", { vol: .45 }), L("bounce", { vol: .2, delay: .14 })];
      case "roll": return [L("roll_leaf", { vol: .3, len: 1.2 })];
      case "gift": return [L("bell", { vol: .45 }), L("unwrap", { vol: .3, delay: .35, len: 1.5 })];
      case "guest_in": return [[1, .1], [.7, .3], [.45, .55], [.3, .8]].map(([p, d], k) => L("paw_light", { vol: .1 + k * .06, pan: p, delay: d, len: .4 })).concat([L("greet", { vol: .25, delay: 1.1, pan: .3 })]);
      case "guest_out": return [[.3, 0], [.5, .25], [.75, .5], [1, .75]].map(([p, d], k) => L("paw_light", { vol: .28 - k * .06, pan: p, delay: d, len: .4 }));
      case "berry_soft": return [L("berry_soft", { vol: .25 })];
      case "pouch": return [L("pouch", { vol: .3, dry: 1, len: 1.2 })];
      case "hatch": return [L("hatch_tap", { vol: .35 }), L("hatch_tap", { vol: .35, delay: .55 }), L("crack_small", { vol: .45, delay: 1.2 }), L("crack_small", { vol: .45, delay: 1.9 }), L("crack_big", { vol: .55, delay: 2.7 }), L("hatch_first", { vol: .3, delay: 3.4 }), L("@sting.hatch", { vol: .5, delay: 3.6, dry: 1 })];
      case "evolve": return [L("evo_rise", { vol: .45, dry: 1, len: 2.4 }), L("evo_swell", { vol: .45, delay: .9, len: 1.6 }), L("evo_burst", { vol: .55, delay: 2.1 }), L("gust", { vol: .2, delay: 2.2, len: 2.5 }), L("@sting.evo" + Math.max(3, Math.min(7, o.lv || i + 1)), { vol: .5, delay: 2.6, dry: 1 })];   // 白光在儀式第 2.15 秒
      case "meet": return [L("@sting.meet", { vol: .5, dry: 1 })];
      case "shutter": return [L("shutter", { vol: .45, dry: 1 })];
      case "cloth": return [L("cloth", { vol: .3, dry: 1, len: 1 })];
      case "hat": return [L("hat_on", { vol: .3, dry: 1 })];
      case "page": return [L("page", { vol: .3, dry: 1 })];
      case "paper": return [L("paper", { vol: .3, dry: 1 })];
      case "stamp": return [L("stamp", { vol: .4, dry: 1 })];
      case "ui": return [L("ui_tap", { vol: .22, dry: 1 })];
    }
    return [];
  }
  const EVENTS = ["bag", "fall", "land", "look", "step", "flap", "fold", "lie", "touch", "bite", "gulp", "lick", "content", "pat", "rub", "belly", "tickle", "hug", "heart", "trick", "hop", "bell", "dizzy", "sigh", "shiver", "bask", "stretch", "yawn", "wake", "shake", "pant", "swell", "special", "gust", "pop", "drop", "roll", "gift", "guest_in", "guest_out", "berry_soft", "pouch", "hatch", "evolve", "meet", "shutter", "cloth", "hat", "page", "paper", "stamp", "ui"];
  const GAP = { fall: 40, land: 40, step: 60, flap: 90, berry_soft: 60, gulp: 120, pouch: 150, ui: 40, look: 400 };
  // 回傳實際播了哪幾段（試聽板拿來顯示「現在播的是哪一段」）
  function cueNames(ev, i, v, o) {
    const now = Date.now(); if (!(o && o.force) && now - (lastAt[ev] || 0) < (GAP[ev] == null ? 220 : GAP[ev])) return []; lastAt[ev] = now;
    if (!ctx()) return [];
    if (ev === "evolve" || ev === "gift" || ev === "hatch") duck(.45, ev === "gift" ? 900 : 5000);
    const out = [];
    for (const [key, x] of recipe(ev, i, v, o)) {
      const sting = key[0] === "@", g = sting ? "sting" : "sfx", k = sting ? key.slice(7) : key;
      const name = choose(g, k); if (!name) continue;
      if (playBuf(name, Object.assign({}, x, o && o.pan != null && x.pan == null ? { pan: o.pan } : {}))) out.push(name);
    }
    return out;
  }
  const cue = (ev, i, v, o) => cueNames(ev, i, v, o).length;
  // 最常用的先載（進夥伴頁時）；all＝全部（試聽板）
  const COMMON = ["fall_light", "land_grass", "land_leaf", "bounce", "crawl", "paw_light", "paw_heavy", "nibble", "sip", "bite_straw", "bite_mango", "bite_persim", "bite_orange", "chew_mid", "chew_big", "gulp_small", "gulp_big", "purr", "fur_short", "fur_thick", "lick"];
  async function preload(all) { await manifest(); if (!M) return; const keys = all ? Object.keys(M.sfx) : COMMON; keys.forEach(k => poolOf("sfx", k).forEach(load)); if (all) Object.keys(M.sting || {}).forEach(k => poolOf("sting", k).forEach(load)); }

  // ── 環境音：最多三層，循環；換場景 8 秒交叉淡化 ──
  const beds = {}; let sceneKey = "", breath = null, snoreT = 0; const sprT = {};
  const AMB_VOL = { dawn: .55, day: .5, cicada: .35, dusk: .5, night: .55, frogs: .4, rain: .5, storm: .5, wind: .42, snow: .4, waves: .5, gulls: .45, alpine: .45, sky: .4, brook: .45 };
  function bedsFor(s) {
    const se = s.season || "", tod = s.tod || "day";
    let base = tod === "dawn" ? "dawn" : tod === "dusk" ? "dusk" : tod === "night" ? "night" : "day";
    if (s.v === "alpine" && (tod === "day" || tod === "dawn")) base = "alpine";
    const l = [];
    if (s.wx === "rain") l.push(s.code >= 95 ? "storm" : "rain");
    else if (s.wx === "snow") l.push("snow");
    else { l.push(base); if (base === "day" && se === "summer") l.push("cicada"); if (base === "night" && (se === "spring" || se === "summer")) l.push("frogs"); }
    if (s.v === "sea") l.unshift(tod === "day" || tod === "dawn" ? "gulls" : "waves");
    if (s.feel === "windy" && !l.includes("alpine")) l.push("wind");
    if (s.i === 6) l.push("sky");
    return [...new Set(l)].slice(0, 3);
  }
  // 環境音用 <audio loop> 串流（2 分鐘的立體聲整段解碼要 40 多 MB，三層就上百 MB，手機吃不消），接到環境音音量線再淡入淡出
  async function startBed(key) {
    if (beds[key]) return;
    await manifest(); const p = poolOf("amb", key); if (!p.length || !ctx()) return;
    const name = p[Math.floor(Math.random() * p.length)];
    const el = new Audio(); el.crossOrigin = "anonymous"; el.loop = true; el.preload = "auto"; el.src = DIRS.amb + name + ".mp3";
    const g = ac.createGain(), t = ac.currentTime; let node = null;
    try { node = ac.createMediaElementSource(el); node.connect(g); g.connect(bus.amb); } catch (e) { node = null; }
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(AMB_VOL[key] || .5, t + 8);
    if (!node) el.volume = (AMB_VOL[key] || .5) * vol("amb");
    el.addEventListener("loadedmetadata", () => { try { el.currentTime = Math.random() * Math.max(0, el.duration - 5); } catch (e) { /* */ } }, { once: true });
    el.play().catch(() => { /* 還沒有使用者手勢：下一次再試 */ });
    beds[key] = { el, g, name };
    if (window.__petSndLog) window.__petSndLog.push("amb:" + key);
  }
  function stopBed(key, fast) {
    const d = beds[key]; delete beds[key]; if (!d || !ac) return;
    const t = ac.currentTime, f = fast ? .3 : 8; d.g.gain.cancelScheduledValues(t); d.g.gain.setValueAtTime(d.g.gain.value, t); d.g.gain.linearRampToValueAtTime(0, t + f);
    setTimeout(() => { try { d.el.pause(); d.el.removeAttribute("src"); d.el.load(); } catch (e) { /* */ } }, f * 1000 + 100);
  }
  // 點綴：在環境音上面偶爾冒一聲（雨滴、遠雷、落葉、海鷗、高山鳥、陣風）
  const SPRINKLE = { drip: [3, 8, "drip", .18], thunder: [18, 45, "thunder", .35], leaf: [10, 22, "leaf_fall", .15], gull: [14, 32, "gull", .16], bird: [18, 40, "alpine_bird", .14], gust: [8, 20, "gust", .26] };
  function sprinkles(s) {
    const want = new Set();
    if (s && s.wx === "rain") want.add("drip");
    if (s && s.wx === "rain" && s.code >= 95) want.add("thunder");
    if (s && s.season === "autumn" && s.wx !== "rain") want.add("leaf");
    if (s && s.v === "sea" && (s.tod === "day" || s.tod === "dawn")) want.add("gull");
    if (s && s.v === "alpine" && s.tod !== "night") want.add("bird");
    if (s && s.feel === "windy") want.add("gust");
    Object.keys(sprT).forEach(k => { if (!want.has(k)) { clearTimeout(sprT[k]); delete sprT[k]; } });
    want.forEach(k => { if (sprT[k]) return; const [a, b2, key, v2] = SPRINKLE[k]; const next = () => { sprT[k] = setTimeout(() => { if (!sprT[k]) return; const n = choose("sfx", key); if (n) playBuf(n, { vol: v2, pan: Math.random() * 1.6 - .8, wet: 1.5 }); next(); }, (a + Math.random() * (b2 - a)) * 1000); }; next(); });
  }
  // 睡覺：呼吸循環（依體型慢一點、低一點）；虎、龍偶爾輕打呼
  async function sleeping(s) {
    const on = !!(s && s.asleep && s.i > 0);
    if (!on) { if (breath) { const d = breath; breath = null; if (d.g && ac) { const t = ac.currentTime; d.g.gain.setTargetAtTime(0, t, .6); try { d.src.stop(t + 3); } catch (e) { /* */ } } } clearTimeout(snoreT); snoreT = 0; return; }
    if (!breath) {
      breath = { pending: true }; await manifest(); const p = poolOf("sfx", "breath_slow"); const name = p[Math.floor(Math.random() * p.length)]; const b = name && await load(name);
      if (!b || !breath || !breath.pending) { if (breath && breath.pending) breath = null; return; }
      const src = ac.createBufferSource(), g = ac.createGain(); src.buffer = b; src.loop = true; src.playbackRate.value = BIG[s.i] * .95;
      g.gain.setValueAtTime(0, ac.currentTime); g.gain.linearRampToValueAtTime(.16, ac.currentTime + 3); src.connect(g); g.connect(bus.sfx); src.start();
      breath = { src, g };
      if (window.__petSndLog) window.__petSndLog.push("sleep:breath");
    }
    if (s.i >= 4 && !snoreT) { const next = () => { snoreT = setTimeout(() => { if (!breath) { snoreT = 0; return; } const n = choose("sfx", "snore"); if (n) playBuf(n, { vol: .14, rate: BIG[s.i] }); next(); }, 12000 + Math.random() * 14000); }; next(); }
  }
  // s：{ tod, wx, code, feel, v, season, i, asleep } 舞台現況；null＝全部停
  function scene(s) {
    if (!s) { Object.keys(beds).forEach(k => stopBed(k, true)); sceneKey = ""; sprinkles(null); sleeping(null); return; }
    if (!ctx()) return;
    setRoom(s.i === 6 ? "sky" : s.v === "alpine" ? "alpine" : s.v === "sea" ? "sea" : "forest");
    const want = bedsFor(s), key = want.join(",");
    if (key !== sceneKey) { sceneKey = key; Object.keys(beds).filter(k => !want.includes(k)).forEach(k => stopBed(k)); want.forEach(startBed); }
    sprinkles(s); sleeping(s);
  }

  // ── 背景音樂：<audio> 串流接到音樂音量線；依時段挑曲，一首播完才換 ──
  let mEl = null, mNode = null, mOn = false, mLast = "", mTod = "day";
  function nextTrack() {
    const g = poolOf("music", mTod).length ? mTod : Object.keys((M && M.music) || {})[0]; const p = g ? poolOf("music", g) : []; if (!p.length) return "";
    const opts = p.length > 1 ? p.filter(n => n !== mLast) : p; mLast = opts[Math.floor(Math.random() * opts.length)]; return mLast;
  }
  async function music(on, tod) {
    if (tod) mTod = tod;
    if (!on) { mOn = false; if (mEl) { const el = mEl; if (ac && bus) bus.mus.gain.setTargetAtTime(0, ac.currentTime, .4); setTimeout(() => { if (!mOn) el.pause(); }, 1600); } return; }
    if (mOn || !ctx()) return; mOn = true; await manifest(); if (!mOn) return;
    if (!mEl) {
      mEl = new Audio(); mEl.crossOrigin = "anonymous"; mEl.preload = "auto";
      try { mNode = ac.createMediaElementSource(mEl); mNode.connect(bus.mus); } catch (e) { mNode = null; }
      mEl.addEventListener("ended", () => { if (mOn) { const n = nextTrack(); if (n) { mEl.src = DIRS.music + n + ".mp3"; mEl.play().catch(() => { }); } } });
    }
    if (!mEl.src) { const n = nextTrack(); if (!n) { mOn = false; return; } mEl.src = DIRS.music + n + ".mp3"; }
    applyVol(); if (!mNode) mEl.volume = vol("mus");
    mEl.play().catch(() => { mOn = false; });
    if (window.__petSndLog) window.__petSndLog.push("music");
  }
  function stopAll() { scene(null); music(false); }
  return { cue, cueNames, play: (name, o) => playBuf(name, o), load, preload, manifest, scene, music, stopAll, applyVol, duck, poolOf, DIR, DIRS, EVENTS,
    get M() { return M; }, _recipe: recipe, _bedsFor: bedsFor, _beds: () => Object.keys(beds), _loaded: () => Object.keys(buf), _musicOn: () => mOn, _room: () => room, _sleeping: () => !!breath, _sprinkles: () => Object.keys(sprT) };
})();
