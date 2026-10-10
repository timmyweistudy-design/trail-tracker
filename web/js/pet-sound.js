// 夥伴音效、環境音、背景音樂（2026-10-10 音效優化輪，docs/sound-plan.md）
// 以前的問題：22 kHz／48 kbps 壓壞的單段錄音、硬放慢代表大動物、第一次觸發退回合成音、沒有環境音 → 機械感。
// 現在：
//  - 真的錄音（Freesound CC0，來源在 sounds/CREDITS.md），44.1 kHz；每個事件一個「聲音池」，隨機挑、不連續重複同一段，音高只 ±6%
//  - 一個事件可以疊幾層（果實掉落＝劃過空氣＋落地＋葉子），層與層錯開一點點
//  - 三條音量線：音效、環境音、音樂；重要音效響時環境音和音樂自動壓低
//  - 環境音跟著舞台（時段、天氣、近親物種）換，兩段交叉淡化；看不到夥伴頁就停
//  - 背景音樂只在夥伴頁、要使用者打開；記錄健行時不放
//  - 還沒載好的那一下就安靜，不再放合成音
//  - iPhone：Audio Session 設成 ambient——跟其他 App 的音樂／Podcast 一起放、不會把它們停掉，靜音鍵打開時也安靜（Safari 16.4+；舊版退回預設）
// 聲音池可以在測試面板「🎧 音效試聽板」換（tt_snd_pick 存使用者選的），定稿後寫回下面的預設值。
const PetAudio = (() => {
  // ── 聲音池（檔名不含副檔名）：sfx 在 sounds/pet/、環境音在 sounds/amb/、音樂在 sounds/music/ ──
  const SFX = {
    fall: ["fall-1", "fall-2", "fall-3"], land: ["land-1", "land-2", "land-3", "land-4"], leaf: ["leaf-1", "leaf-2", "leaf-3"],
    crunch: ["crunch-1", "crunch-2", "crunch-3", "crunch-4", "crunch-5"], chew: ["chew-1", "chew-2", "chew-3", "chew-4"], nibble: ["nibble-1", "nibble-2"],
    sip: ["sip-1", "sip-2", "sip-3"], gulp: ["gulp-1", "gulp-2", "gulp-3", "gulp-4"], purr: ["purr-1", "purr-2", "purr-3", "purr-4"],
    fur: ["fur-1", "fur-3"], step: ["step-1", "step-2", "step-3", "step-4"], flap: ["flap-1", "flap-2", "flap-3", "flap-4"],
    bell: ["bell-1", "bell-2", "bell-3"], chime: ["chime-1", "chime-2", "chime-3", "chime-4"], cone: ["cone-1", "cone-2"],
    gust: ["gust-1", "gust-2", "gust-3"], yawn: ["yawn-1", "yawn-2"], splash: ["splash-1", "splash-2", "splash-3"], knock: ["knock-1"],
  };
  const AMB = { day: ["day-1", "day-2", "day-3"], dusk: ["dusk-1", "dusk-2"], night: ["night-1", "night-2", "night-3"], rain: ["rain-1", "rain-2", "rain-3"], wind: ["wind-1", "wind-2", "wind-3"], waves: ["waves-1", "waves-2", "waves-3"], brook: ["brook-1", "brook-2"] };
  const MUSIC = ["music-1", "music-2", "music-3", "music-4", "music-5", "music-6", "music-7", "music-8"];
  // 每種環境音在環境音線裡的相對音量（雨、浪本身比較吵）
  const AMB_VOL = { day: .55, dusk: .55, night: .6, rain: .5, wind: .45, waves: .5, brook: .5 };
  const DIR = k => (AMB[k] || /^(day|dusk|night|rain|wind|waves|brook)-/.test(k) ? "sounds/amb/" : /^music-/.test(k) ? "sounds/music/" : "sounds/pet/");
  const pick = () => { try { return JSON.parse(localStorage.getItem("tt_snd_pick") || "{}") || {}; } catch (e) { return {}; } };
  const poolOf = (group, key) => { const p = pick()[key]; const base = group[key] || []; return Array.isArray(p) && p.length ? p.filter(x => base.includes(x)) : base; };
  const vol = k => { const d = { sfx: 1, amb: .35, mus: .3 }[k]; try { const v = parseFloat(localStorage.getItem("tt_snd_vol_" + k)); return isFinite(v) ? Math.max(0, Math.min(1, v)) : d; } catch (e) { return d; } };

  let ac = null, bus = null; const buf = {}, loading = {}, lastUsed = {}, lastAt = {};
  function setSession() { try { if (navigator.audioSession && navigator.audioSession.type !== "ambient") navigator.audioSession.type = "ambient"; } catch (e) { /* 舊版 Safari 沒有這個 API */ } }
  function ctx() {
    try {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
        setSession(); ac = new AC();
        const g = () => ac.createGain();
        bus = { master: g(), sfx: g(), amb: g(), mus: g(), duck: g() };
        bus.sfx.connect(bus.master); bus.amb.connect(bus.duck); bus.mus.connect(bus.duck); bus.duck.connect(bus.master); bus.master.connect(ac.destination);
        applyVol();
      }
      if (ac.state === "suspended") ac.resume().catch(() => { /* 沒有音訊裝置／系統不讓開：安靜 */ });
    } catch (e) { return null; }
    return ac;
  }
  function applyVol() { if (!bus) return; const t = ac.currentTime; bus.sfx.gain.setTargetAtTime(vol("sfx") * .8, t, .05); bus.amb.gain.setTargetAtTime(vol("amb"), t, .3); bus.mus.gain.setTargetAtTime(vol("mus"), t, .3); }
  function load(name) {
    if (buf[name]) return Promise.resolve(buf[name]); if (loading[name]) return loading[name];
    const c = ctx(); if (!c) return Promise.resolve(null);
    return (loading[name] = fetch(DIR(name) + name + ".mp3").then(r => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
      .then(a => new Promise((res, rej) => c.decodeAudioData(a, res, rej))).then(b => (buf[name] = b)).catch(() => { delete loading[name]; return null; }));
  }
  // 池裡隨機挑一段，不跟上一次同一段
  function choose(key) {
    const p = poolOf(SFX, key); if (!p.length) return null;
    const ready = p.filter(n => buf[n]); p.forEach(n => { if (!buf[n]) load(n); });
    if (!ready.length) return null;   // 還沒載好：這一下安靜（不再放合成音）
    const opts = ready.length > 1 ? ready.filter(n => n !== lastUsed[key]) : ready;
    const n = opts[Math.floor(Math.random() * opts.length)]; lastUsed[key] = n; return n;
  }
  // o：vol 音量、rate 音高（只微調）、delay 秒、len 最多播幾秒（長錄音只要一段，結尾淡出）、off 從第幾秒開始
  function playBuf(name, o) {
    o = o || {}; const c = ctx(), b = buf[name]; if (!c || !b) return false;
    try {
      const s = c.createBufferSource(), g = c.createGain(), t0 = c.currentTime + (o.delay || 0);
      const rate = (o.rate || 1) * (.94 + Math.random() * .12), v = (o.vol == null ? 1 : o.vol) * (.9 + Math.random() * .2);
      const off = Math.min(o.off || 0, Math.max(0, b.duration - .2)), len = Math.min(b.duration - off, o.len || b.duration);
      s.buffer = b; s.playbackRate.value = rate;
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(v, t0 + .008);
      const end = t0 + len / rate; g.gain.setValueAtTime(v, Math.max(t0 + .01, end - Math.min(.25, len / 3))); g.gain.linearRampToValueAtTime(0, end);
      s.connect(g); g.connect(o.bus || bus.sfx); s.start(t0, off); s.stop(end + .02);
      if (window.__petSndLog) window.__petSndLog.push(name.replace(/-\d+$/, ""));   // 測試用：播了哪一類
      if (window.__petSndNames) window.__petSndNames.push(name);              // 測試用：播了哪一段（檢查不連續重複）
      return true;
    } catch (e) { return false; }
  }
  function duck(depth, ms) {
    if (!bus) return; const t = ac.currentTime, d = bus.duck.gain;
    d.cancelScheduledValues(t); d.setTargetAtTime(1 - depth, t, .05); d.setTargetAtTime(1, t + ms / 1000, .35);
  }

  // ── 每個事件怎麼組（i：0 蛋…6 神龍；v：""／deep／sea／alpine） ──
  const CAT = (i, v) => i === 4 || (i === 3 && v === "deep");   // 會呼嚕的：虎階、石虎
  const BIG = [1, 1, 1, 1, .96, .92, .88];                        // 大的動物只略低一點點（不再硬放慢）
  function recipe(ev, i, v) {
    const L = (key, o) => [key, o || {}];
    switch (ev) {
      case "fall": return [L("fall", { vol: .16 })];
      case "land": return i === 6 ? [L("land", { vol: .35 })] : [L("land", { vol: .6 }), L("leaf", { vol: .22, delay: .04, len: .6 })];
      case "bite":
        if (i === 0) return [L("chime", { vol: .14, len: 1.2 })];
        if (i === 1) return [L("nibble", { vol: .55, len: 1.4 })];
        if (i === 2) return [L("sip", { vol: .4, len: 1.2 })];
        return [L("crunch", { vol: .7, rate: BIG[i], len: 1 }), L("chew", { vol: .35, rate: BIG[i], delay: .32, len: i >= 4 ? 1.6 : 1.1 })];
      case "gulp": return i >= 3 ? [L("gulp", { vol: .3, rate: BIG[i] })] : [];
      case "pat": case "rub":
        if (i === 0) return [L("knock", { vol: .35 })];
        if (CAT(i, v) || i >= 5) return [L("purr", { vol: i >= 5 ? .5 : .45, rate: BIG[i], len: ev === "rub" ? 2.6 : 1.6, off: 1 + Math.random() * 3 })];
        return [L("fur", { vol: .4, len: .9 })];
      case "hug":
        if (i === 0) return [L("knock", { vol: .35 }), L("knock", { vol: .25, delay: .3 })];
        if (CAT(i, v) || i >= 5) return [L("purr", { vol: .55, rate: BIG[i], len: 2.8, off: 1 + Math.random() * 3 })];
        return [L("fur", { vol: .45, len: 1.2 })];
      case "tickle": return i === 0 ? [L("knock", { vol: .25, rate: 1.1 })] : [L("fur", { vol: .4, rate: 1.08, len: .6 }), L("fur", { vol: .3, rate: 1.12, delay: .28, len: .5 })];
      case "hop": return i === 0 ? [L("land", { vol: .3 })] : i === 1 ? [L("leaf", { vol: .3, len: .5 })] : i === 2 || i === 5 ? [L("flap", { vol: .45 })] : i === 6 ? [L("gust", { vol: .25, len: 1.6 })] : [L("step", { vol: .55 })];
      case "trick": return i >= 5 ? [L("flap", { vol: .45 }), L("chime", { vol: .15, delay: .45, len: 1.5 })] : i === 2 ? [L("flap", { vol: .45 })] : [L("step", { vol: .45 }), L("step", { vol: .4, delay: .22 })];
      case "yawn": case "wake": return i >= 3 ? [L("yawn", { vol: .4, rate: BIG[i] })] : [];
      case "stretch": return i === 0 ? [] : [L("fur", { vol: .3, len: .8 })];
      case "shake": return v === "sea" ? [L("splash", { vol: .45 })] : [L("fur", { vol: .4, rate: 1.1, len: .7 })];
      case "drop": return [L("cone", { vol: .5, len: .8 })];
      case "roll": return [L("cone", { vol: .35, rate: 1.06, len: 1.2, off: .3 })];
      case "gift": return [L("bell", { vol: .5 })];
      case "evolve": return [L("chime", { vol: .55, len: 4 }), L("gust", { vol: .2, delay: .2, len: 2.5 })];
      case "bell": return [L("bell", { vol: .28, rate: 1.25, len: 1 })];
      case "gust": return [L("gust", { vol: .3, len: 3 })];
    }
    return [];
  }
  const GAP = { fall: 40, land: 40, leaf: 40, gulp: 120 };   // 同一事件連發的最短間隔（果實三顆連掉要每顆都響；狂點摸頭只響一次）
  function cue(ev, i, v) {
    const now = Date.now(); if (now - (lastAt[ev] || 0) < (GAP[ev] || 220)) return 0; lastAt[ev] = now;
    if (!ctx()) return 0;
    if (ev === "evolve" || ev === "gift") duck(.4, 800);
    let n = 0; for (const [key, o] of recipe(ev, i, v)) { const name = choose(key); if (name && playBuf(name, o)) n++; }
    return n;
  }
  // 最常用的先載（進夥伴頁時呼叫）；其他的第一次用到才載
  function preload(all) { (all ? Object.keys(SFX) : ["fall", "land", "leaf", "crunch", "chew", "purr", "fur", "nibble", "sip", "gulp"]).forEach(k => poolOf(SFX, k).forEach(load)); }

  // ── 環境音：最多兩層，循環播放，換場景時 2 秒交叉淡化 ──
  const beds = {};   // key → { src, g, name }
  let gustT = 0, sceneKey = "";
  function bedsFor(s) {
    const base = s.tod === "dusk" ? "dusk" : s.tod === "night" ? "night" : "day";
    let l = s.wx === "rain" ? ["rain"] : [base];
    if (s.v === "sea") l.unshift("waves");
    if (s.feel === "windy" || s.v === "alpine") l.push("wind");
    if (s.brook && !l.includes("rain")) l.push("brook");
    return [...new Set(l)].slice(0, 2);
  }
  async function startBed(key) {
    if (beds[key]) return;
    const p = poolOf(AMB, key); if (!p.length) return;
    const name = p[Math.floor(Math.random() * p.length)];
    beds[key] = { pending: true };
    const b = await load(name); if (!b || !beds[key] || !beds[key].pending || !ac) { if (beds[key] && beds[key].pending) delete beds[key]; return; }
    const src = ac.createBufferSource(), g = ac.createGain(), t = ac.currentTime;
    src.buffer = b; src.loop = true; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(AMB_VOL[key] || .5, t + 2);
    src.connect(g); g.connect(bus.amb); src.start(t, Math.random() * Math.max(0, b.duration - 1));
    beds[key] = { src, g, name };
    if (window.__petSndLog) window.__petSndLog.push("amb:" + key);
  }
  function stopBed(key, fast) {
    const d = beds[key]; delete beds[key]; if (!d || d.pending || !ac) return;
    const t = ac.currentTime, f = fast ? .2 : 2; d.g.gain.cancelScheduledValues(t); d.g.gain.setValueAtTime(d.g.gain.value, t); d.g.gain.linearRampToValueAtTime(0, t + f); try { d.src.stop(t + f + .05); } catch (e) { /* */ }
  }
  // s：{ tod, wx, feel, v, brook } 舞台現況；null＝停掉
  function scene(s) {
    if (!s) { Object.keys(beds).forEach(k => stopBed(k)); clearTimeout(gustT); gustT = 0; sceneKey = ""; return; }
    if (!ctx()) return;
    const want = bedsFor(s), key = want.join(",");
    if (key !== sceneKey) { sceneKey = key; Object.keys(beds).filter(k => !want.includes(k)).forEach(k => stopBed(k)); want.forEach(startBed); }
    // 起風：環境音上面偶爾疊一陣陣風（8～20 秒一次）
    if (s.feel === "windy" && !gustT) { const next = () => { gustT = setTimeout(() => { if (sceneKey.includes("wind")) { cue("gust", 0, ""); next(); } else gustT = 0; }, 8000 + Math.random() * 12000); }; next(); }
    if (s.feel !== "windy" && gustT) { clearTimeout(gustT); gustT = 0; }
  }

  // ── 背景音樂：<audio> 串流（不整首解碼進記憶體），接到音樂音量線；一首播完換下一首、不連續重複 ──
  let mEl = null, mNode = null, mOn = false, mLast = "";
  function nextTrack() {
    const p = poolOf({ m: MUSIC }, "m").length ? poolOf({ m: MUSIC }, "m") : MUSIC, opts = p.length > 1 ? p.filter(n => n !== mLast) : p;
    mLast = opts[Math.floor(Math.random() * opts.length)]; return mLast;
  }
  function music(on) {
    if (!on) { mOn = false; if (mEl) { const el = mEl; if (ac && bus) { const t = ac.currentTime; bus.mus.gain.setTargetAtTime(0, t, .4); } setTimeout(() => { if (!mOn) el.pause(); }, 1600); } return; }
    if (mOn || !ctx()) return; mOn = true;
    if (!mEl) {
      mEl = new Audio(); mEl.crossOrigin = "anonymous"; mEl.preload = "auto";
      try { mNode = ac.createMediaElementSource(mEl); mNode.connect(bus.mus); } catch (e) { mNode = null; }
      mEl.addEventListener("ended", () => { if (mOn) { mEl.src = DIR("music-1") + nextTrack() + ".mp3"; mEl.play().catch(() => { }); } });
    }
    if (!mEl.src) mEl.src = DIR("music-1") + nextTrack() + ".mp3";
    applyVol(); if (!mNode) mEl.volume = vol("mus");
    mEl.play().catch(() => { mOn = false; });
    if (window.__petSndLog) window.__petSndLog.push("music");
  }
  function stopAll() { scene(null); music(false); }
  return { cue, play: (name, o) => playBuf(name, o), load, preload, scene, music, stopAll, applyVol, duck, SFX, AMB, MUSIC, KEYS: Object.keys(SFX), _recipe: recipe, _bedsFor: bedsFor, _beds: () => Object.keys(beds), _loaded: () => Object.keys(buf), _musicOn: () => mOn, DIR };
})();
