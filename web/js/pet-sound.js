// 夥伴音效（2026-10-10 使用者：「全面加入音效，能趨近於真實是最好」）
// 用真的錄音（Freesound 上 CC0 的貓呼嚕、咬蘋果、翅膀、木頭、腳步…，來源見 sounds/pet/CREDITS.md），剪短、統一音量後放在 sounds/pet/。
// 每一個動作（pet-stage.js 送的 pet-fx 事件）照「哪一階、哪一種近親」挑聲音＋音高：同一段呼嚕，老虎低一點、龍再低一點；幼蟲、蝶小小聲。
// 每次播放音高隨機 ±4%，聽起來不像同一段錄音一直重複。音效開關在「活力和親密」說明裡（預設開；iPhone 靜音鍵開著就不會響）。
// 檔案只在音效開著、第一次進夥伴頁時才下載（全部約 160 KB），之後 Service Worker 快取；還沒載好的那一下就不出聲（不卡畫面）。
const PetAudio = (() => {
  const BASE = "sounds/pet/", MASTER = .6;
  const KEYS = ["purr", "crunch", "crunch2", "nom", "munch", "slurp", "flutter", "wingbeat", "knock", "tap", "pop", "step", "thud", "bell", "twinkle", "swoosh", "yawn", "breath", "squeak", "eek", "rustle", "splash"];
  let ac = null; const buf = {}, loading = {}, last = {};
  function ctx() {
    try { if (!ac) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ac = new AC(); } if (ac.state === "suspended") ac.resume().catch(() => { /* 沒有音訊裝置／系統不讓開：安靜 */ }); } catch (e) { return null; }
    return ac;
  }
  function load(k) {
    if (buf[k] || loading[k]) return loading[k] || Promise.resolve(buf[k]);
    const c = ctx(); if (!c) return Promise.resolve(null);
    return (loading[k] = fetch(BASE + k + ".mp3").then(r => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
      .then(a => new Promise((res, rej) => c.decodeAudioData(a, res, rej))).then(b => (buf[k] = b)).catch(() => { delete loading[k]; return null; }));
  }
  function preload() { KEYS.forEach(load); }
  // o.rate 音高（1＝原本）、o.vol 音量、o.delay 延遲秒、o.len 最多播幾秒（長的呼嚕只要一段）
  function play(k, o) {
    o = o || {}; const c = ctx(), b = buf[k]; if (!c) return false;
    if (!b) { load(k); return false; }
    try {
      const s = c.createBufferSource(), g = c.createGain(), t0 = c.currentTime + (o.delay || 0), len = Math.min(b.duration, o.len || b.duration);
      s.buffer = b; s.playbackRate.value = (o.rate || 1) * (.96 + Math.random() * .08);
      g.gain.setValueAtTime((o.vol == null ? 1 : o.vol) * MASTER, t0);
      if (o.len && o.len < b.duration) { g.gain.setValueAtTime((o.vol == null ? 1 : o.vol) * MASTER, t0 + Math.max(0, len - .25)); g.gain.linearRampToValueAtTime(0, t0 + len); }   // 截短的要淡出，不能「喀」一聲斷掉
      s.connect(g); g.connect(c.destination); s.start(t0); s.stop(t0 + len / ((o.rate || 1) * .96) + .05);
      if (window.__petSndLog) window.__petSndLog.push(k);   // 測試用：播了哪些聲音
      return true;
    } catch (e) { return false; }
  }
  // 每一階、每一種近親的聲音（i：0 蛋…6 神龍；v：""／deep／sea／alpine）
  const CAT = (i, v) => i === 4 || (i === 3 && v === "deep");   // 會呼嚕的：虎階全部、石虎
  const PURR_RATE = [1, 1, 1, 1.05, .85, .62, .55];
  const YAWN_RATE = [1, 1.55, 1.6, 1.25, 1, .88, .8];
  function cues(ev, i, v) {
    const sea = v === "sea";
    switch (ev) {
      case "bite": return [[["twinkle", { rate: 1.7, vol: .22, len: .8 }]], [["nom", { rate: 1.18, vol: .6 }]], [["slurp", { rate: 1.2, vol: .5 }]], [["crunch", { rate: 1.12, vol: .65 }]], [["crunch", { rate: .86, vol: .75 }]], [["crunch", { rate: .74, vol: .8 }]], [["crunch", { rate: .64, vol: .85 }], ["crunch2", { rate: .6, vol: .5, delay: .25 }]]][i];
      case "pat": case "rub":
        if (i === 0) return [["tap", { rate: 1.25, vol: .5 }], ["tap", { rate: 1.32, vol: .38, delay: .16 }]];
        if (i === 1) return [["eek", { rate: 1.3, vol: .4 }]];
        if (i === 2) return [["flutter", { rate: 1.25, vol: .32, len: .6 }]];
        if (i === 3 && sea) return [["squeak", { rate: 1.35, vol: .38, len: .5 }]];
        if (CAT(i, v) || i >= 5) return [["purr", { rate: PURR_RATE[i], vol: i >= 5 ? .55 : .5, len: ev === "rub" ? 2.4 : 1.4 }]];
        return [["rustle", { rate: 1.1, vol: .45, len: .7 }]];
      case "tickle":
        if (i === 0) return [["tap", { rate: 1.5, vol: .4 }], ["tap", { rate: 1.6, vol: .35, delay: .1 }], ["tap", { rate: 1.45, vol: .3, delay: .2 }]];
        if (i === 2) return [["flutter", { rate: 1.4, vol: .35, len: .7 }]];
        return [["squeak", { rate: [1, 1.45, 1, 1.3, .95, .8, .72][i], vol: .38, len: .7 }]];
      case "hug":
        if (i === 0) return [["knock", { rate: 1.2, vol: .45 }], ["knock", { rate: 1.25, vol: .35, delay: .3 }]];
        if (i === 1) return [["squeak", { rate: 1.45, vol: .4, len: .8 }]];
        if (i === 2) return [["flutter", { rate: 1.15, vol: .38 }]];
        if (CAT(i, v) || i >= 5) return [["purr", { rate: PURR_RATE[i], vol: .6, len: 2.6 }]];
        return [["rustle", { vol: .45, len: .9 }], ["squeak", { rate: 1.3, vol: .3, len: .45, delay: .35 }]];
      case "hop": return [[["thud", { rate: 1.25, vol: .5 }]], [["thud", { rate: 1.35, vol: .35 }]], [["wingbeat", { rate: 1.3, vol: .4 }]], [["step", { vol: .6 }]], [["thud", { rate: .85, vol: .65 }]], [["wingbeat", { rate: .8, vol: .5 }]], [["swoosh", { rate: .78, vol: .5 }]]][i];
      case "trick": return i === 0 ? [["knock", { rate: 1.1, vol: .4 }]] : i === 2 ? [["flutter", { vol: .45 }]] : i >= 5 ? [["swoosh", { rate: .75, vol: .55 }], ["twinkle", { rate: 1.5, vol: .18, len: .7, delay: .4 }]] : [["swoosh", { rate: 1.15, vol: .45 }]];
      case "yawn": case "wake": return i === 0 ? [["tap", { rate: 1.2, vol: .35 }]] : [["yawn", { rate: YAWN_RATE[i], vol: .5 }]];
      case "sleep": return i === 0 ? [] : [["breath", { rate: [1, 1.35, 1.4, 1.15, .95, .85, .8][i], vol: .45, len: 2.6 }]];
      case "stretch": return i === 0 ? [] : [["rustle", { rate: .95, vol: .35, len: .8 }]];
      case "shake": return sea ? [["splash", { rate: 1.1, vol: .45 }]] : [["rustle", { rate: 1.2, vol: .45, len: .7 }]];
      case "dizzy": return [["eek", { rate: [1, 1.3, 1.35, 1.2, .95, .85, .8][i], vol: .35 }]];
      case "drop": return [["pop", { rate: .95, vol: .55 }]];
      case "roll": return [["knock", { rate: 1.35, vol: .35 }], ["tap", { rate: 1.2, vol: .3, delay: .18 }], ["tap", { rate: 1.25, vol: .2, delay: .32 }]];
      case "gift": return [["bell", { vol: .55 }]];
      case "evolve": return [["twinkle", { vol: .6 }]];
      case "bell": return [["bell", { rate: 1.5, vol: .3, len: .9 }]];
    }
    return [];
  }
  function cue(ev, i, v) {
    const now = Date.now(); if (now - (last[ev] || 0) < 220) return 0; last[ev] = now;   // 同一個事件連發（狂點）只響一次
    let n = 0; for (const [k, o] of (cues(ev, i, v) || [])) if (play(k, o)) n++;
    return n;
  }
  return { cue, play, preload, KEYS, _cues: cues, _loaded: () => Object.keys(buf) };
})();
