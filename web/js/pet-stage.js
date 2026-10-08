// 山林夥伴 2.5D 舞台：天空 → 遠山 → 中景（各階段棲地）→ 天氣/季節粒子 → 角色 → 前景，分層做視差。
// 時段（晨/午/昏/夜）、季節、天氣跟真實世界同步；手指拖、陀螺儀（已授權才有）會讓各層以不同深度位移。
// 只負責「畫面」：角色 SVG 仍由 PET_ART 提供（地圖標記、分享圖卡、動態島都讀那邊，不受影響）。
// 系統設定「減少動態效果」時：不視差、不飄粒子、不走動（畫面照樣有層次，只是靜止）。
// 夥伴用的時鐘（2026-10-08 修正案 A9）：作息、冷卻、禮物、節日、紀念日、日記日期都讀這裡，不直接讀 Date.now()。
// 測試面板「時間快轉」和自動測試可以撥：差值存在 sessionStorage（關掉 App 就回到真實時間、不會進備份）；
// 撥過時間之後寫的日記、拿到的小東西都標 dbg（清 debug 會一起刪）。互動計時（長按、連點、泡泡停留）照樣用真實時間。
window.ttClock = window.ttClock || (() => {
  let off = 0; try { off = +sessionStorage.getItem("tt_clock_off") || 0; } catch (e) { /* 私密瀏覽 */ }
  if (off) window.__petDbg = true;
  const save = () => { try { if (off) sessionStorage.setItem("tt_clock_off", String(off)); else sessionStorage.removeItem("tt_clock_off"); } catch (e) { /* 私密瀏覽 */ } if (off) window.__petDbg = true; window.__petLine = null; };
  return {
    now: () => Date.now() + off, date: () => new Date(Date.now() + off), offset: () => off,
    set(t) { off = t == null ? 0 : new Date(t).getTime() - Date.now(); save(); return off; },   // 撥到某個時刻（Date、時間戳或字串）
    shift(ms) { off += +ms || 0; save(); return off; }, reset() { off = 0; save(); },
  };
})();
window.PetStage = (function () {
  const reduce = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };

  // ── 真實世界狀態 ──
  function tod(d) {
    const h = (d || ttClock.date()).getHours();
    return h >= 5 && h < 8 ? "dawn" : h >= 8 && h < 16 ? "day" : h >= 16 && h < 19 ? "dusk" : "night";
  }
  function season(d) {
    const m = (d || ttClock.date()).getMonth() + 1;
    return m >= 3 && m <= 5 ? "spring" : m >= 6 && m <= 8 ? "summer" : m >= 9 && m <= 11 ? "autumn" : "winter";
  }
  // WMO 天氣代碼 → 舞台天氣（只分三種畫得出差別的）
  function wxOf(code) {
    if (code == null) return "";
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return "rain";
    if (code >= 71 && code <= 77 || code === 85 || code === 86) return "snow";
    if (code === 3 || code === 45 || code === 48) return "cloud";
    return "";
  }

  // ── 場景 SVG（viewBox 400×300，貼底、寬度鋪滿） ──
  const VB = `viewBox="0 0 400 300" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"`;
  // 場景插畫在 stage-art.js（ArtKit 畫的：受光山稜、霧、樹、裝飾）；這裡只組層、做視差與動作
  const STAGES = 7;
  const clamp = i => Math.max(0, Math.min(STAGES - 1, i | 0));

  // 天空小物：太陽／月亮／星星
  function sky(t) {
    if (t === "night") {
      let st = "";
      for (let k = 0; k < 14; k++) st += `<circle class="ps-star" cx="${(k * 97 + 23) % 400}" cy="${(k * 53 + 11) % 150}" r="${k % 3 ? 1.3 : 2}" style="animation-delay:${(k % 7) * .45}s"/>`;
      return `<svg class="ps-svg" ${VB}>${st}<circle cx="318" cy="56" r="17" fill="#f6efcf"/><circle cx="326" cy="50" r="15" class="ps-moonbite"/></svg>`;
    }
    const sun = t === "day" ? `<circle cx="320" cy="58" r="40" fill="#fff6c8" opacity=".25"/><circle cx="320" cy="58" r="20" fill="#fff3b8"/>`
      : `<circle cx="${t === "dawn" ? 90 : 310}" cy="176" r="56" fill="#ffd08a" opacity=".22"/><circle cx="${t === "dawn" ? 90 : 310}" cy="176" r="26" fill="#ffc77a"/>`;
    return `<svg class="ps-svg" ${VB}>${sun}</svg>`;
  }

  // 粒子：季節（春花瓣／夏螢火蟲或花粉／秋落葉／冬高山才下雪）＋天氣（雨／雪）
  function particles(stage, t, se, wx) {
    let kind = wx === "rain" ? "rain" : wx === "snow" ? "snow"
      : se === "spring" ? "petal" : se === "autumn" ? "leaf" : se === "winter" ? (stage >= 5 ? "snow" : "mote")
      : (t === "night" || t === "dusk") ? "fly" : "mote";
    if (t === "night" && kind === "mote") kind = "fly";
    const n = kind === "rain" ? 16 : kind === "fly" ? 7 : 9;
    let h = "";
    for (let k = 0; k < n; k++) {
      const left = (k * 37 + 7) % 100, delay = ((k * 0.77) % 5).toFixed(2), dur = (kind === "rain" ? 0.9 + (k % 4) * .12 : 6 + (k % 5) * 1.3).toFixed(2);
      h += `<i class="ps-p ps-${kind === "leaf" ? "maple" : kind}" style="left:${left}%;top:${kind === "fly" || kind === "mote" ? 20 + (k * 29) % 60 : -8}%;animation-delay:-${delay}s;animation-duration:${dur}s"></i>`;
    }
    return h;
  }

  // 節日燈籠（2026-10-07 寵物新一輪 #22）：新年紅燈籠、端午掛艾草香包、中秋橘色圓燈籠，掛在舞台右上角輕輕晃
  function lantern(k) {
    const body = k === "db" ? `<path d="M20 18 C10 24 10 40 20 46 C30 40 30 24 20 18Z" fill="#5d9b4a" stroke="#2f5a2a" stroke-width="1.6"/><path d="M14 30h12" stroke="#e8c45a" stroke-width="2"/><path d="M20 46v8M17 54l3 4 3-4" stroke="#c0392b" stroke-width="1.6" fill="none"/>`
      : `<ellipse cx="20" cy="32" rx="${k === "ma" ? 14 : 12}" ry="${k === "ma" ? 13 : 15}" fill="${k === "ma" ? "#f39a3d" : "#d8362b"}" stroke="${k === "ma" ? "#b0601a" : "#8e1d16"}" stroke-width="1.6"/><path d="M8 32h24M11 24c6 2 12 2 18 0M11 40c6-2 12-2 18 0" stroke="${k === "ma" ? "#ffd9a0" : "#f1b04a"}" stroke-width="1.2" fill="none" opacity=".8"/><rect x="15" y="15" width="10" height="4" rx="1" fill="#e8c45a"/><rect x="15" y="45" width="10" height="4" rx="1" fill="#e8c45a"/><path d="M20 49v9" stroke="#e8c45a" stroke-width="2"/><ellipse cx="20" cy="32" rx="6" ry="7" fill="#fff3c4" opacity=".35"/>`;
    return `<div class="ps-fest ps-fest-${k}" aria-hidden="true"><svg viewBox="0 -40 40 100"><path d="M20 -40v55" stroke="#6b5a3a" stroke-width="1.4"/>${body}</svg></div>`;
  }
  // 拍照用（2026-10-07 寵物新一輪 #18）：舞台的場景畫成兩張獨立的 SVG（後景＝天空漸層＋天空小物＋遠山＋中景、前景），pet.js 疊在 canvas 上、中間畫角色
  const SKY = { dawn: ["#f2b7a0", "#fde9d6"], day: ["#8cc4ea", "#e4f3f2"], dusk: ["#6c5a96", "#f4a878"], night: ["#0f1b36", "#2b4566"] };
  function photoSvgs(stage, t, w, h) {
    const i = clamp(stage), se = season(), sc = StageArt.scene(i, t, se, []), [a, b] = SKY[t] || SKY.day, V = `viewBox="0 0 400 300" preserveAspectRatio="xMidYMax slice"`;
    const wrap = inner => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" ${V}>${inner}</svg>`;
    const strip = x => x.replace(/<svg[^>]*>/, `<svg ${V} width="400" height="300">`);
    return { back: wrap(`<defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".78" stop-color="${b}"/></linearGradient></defs><rect x="-400" y="-300" width="1200" height="900" fill="url(#sk)"/>${strip(sky(t)).replace(/class="ps-moonbite"/g, `fill="${a}"`).replace(/class="ps-star"/g, 'fill="#f3f0d8"')}${sc.far}${sc.mid}`)   /* 月亮缺角、星星的顏色原本在 CSS（圖片裡讀不到） */,
      front: wrap(sc.front) };
  }
  // 季節與體感的裝飾（2026-10-09 R5 原10／原11）：一層獨立的裝飾，不碰角色的骨架；不蓋帽子、嘴、果實的接觸點（只在角色旁邊）。
  //   秋：兩片落葉飄過、一片落在腳邊；冬或冷：嘴邊呼白氣（位置在 bind 時量嘴）；春：一隻小蝴蝶在頭旁邊繞（蝶自己那一階不放）；起風：幾道風線。
  //   這些都是裝飾——舞台的天氣不是步道的即時安全資訊（真的天氣在步道頁）
  function sdeco(i, se, feel, t) {
    const out = [];
    if (se === "autumn") out.push(`<i class="ps-leaf a"></i><i class="ps-leaf b"></i><i class="ps-leaf g"></i>`);
    if ((se === "winter" || feel === "cold") && i > 0) out.push(`<i class="ps-breath"></i>`);
    if (se === "spring" && i !== 2 && t !== "night") out.push(`<i class="ps-sbfly"><svg viewBox="0 0 24 24"><path d="M12 12C9 6 4 6 4 10s4 5 8 2c4 3 8 2 8-2s-5-4-8 2Z" fill="#f4c35a" stroke="#a87a1e" stroke-width="1"/></svg></i>`);
    if (feel === "windy") out.push(`<i class="ps-windl a"></i><i class="ps-windl b"></i><i class="ps-windl c"></i>`);
    return out.length ? `<div class="ps-sdeco" aria-hidden="true">${out.join("")}</div>` : "";
  }
  // 舞台 HTML：actorHtml 是角色那一層的內容（對話泡＋角色＋影子），由 pet.js 組好傳進來
  function html(stage, actorHtml, o) {
    o = Object.assign({}, o, window.__ps || {});   // window.__ps＝測試／除錯面板強制指定時段、季節、天氣
    const i = clamp(stage), t = o.tod || tod(), se = o.season || season(), wx = o.wx || "", feel = o.feel || "";
    const sc = StageArt.scene(i, t, se, o.decor);
    return `<div class="ps-box${o.bg ? " ps-bg" : ""}" data-stage="${i}"${o.evo ? ` data-evo="${o.evo}"` : ""}${(o.decor || []).length ? ` data-decor="${o.decor.join(" ")}"` : ""} data-tod="${t}" data-season="${se}"${wx ? ` data-wx="${wx}"` : ""}${feel ? ` data-feel="${feel}"` : ""}>
      <div class="ps-l ps-sky" style="--d:.1">${sky(t)}${wx === "cloud" || wx === "rain" ? `<svg class="ps-svg ps-drift" ${VB}>${StageArt.skyClouds(t)}</svg>` : ""}</div>
      <div class="ps-l ps-far" style="--d:.28"><svg class="ps-svg" ${VB}>${sc.far}</svg></div>
      <div class="ps-l ps-mid" style="--d:.55"><svg class="ps-svg" ${VB}>${sc.mid}</svg></div>
      <div class="ps-l ps-fx" aria-hidden="true">${particles(i, t, se, wx)}</div>
      <div class="ps-actor" style="--d:.72">${actorHtml}</div>
      ${o.bg ? "" : sdeco(i, se, feel, t)}
      <div class="ps-l ps-front" style="--d:1.35"><svg class="ps-svg" ${VB}>${sc.front}</svg></div>
      ${o.fest && !o.bg ? lantern(o.fest) : ""}
      ${(o.props || []).length && !o.bg ? `<div class="ps-props" aria-hidden="true">${o.props.map((p, k) => `<i class="ps-pp ${k ? "r" : "l"}">${p}</i>`).join("")}</div>` : ""}
    </div>`;
  }

  // ── 視差：手指拖（任何裝置）＋陀螺儀（已有權限時，例如開過指北針；不在這裡主動跳權限框） ──
  let cur = { x: 0, y: 0 }, tgt = { x: 0, y: 0 }, raf = 0, box = null, base = null, io = null, visible = false;
  const lerp = (a, b, k) => a + (b - a) * k;
  function frame() {
    raf = 0;
    if (!box || !box.isConnected) return;
    cur.x = lerp(cur.x, tgt.x, .12); cur.y = lerp(cur.y, tgt.y, .12);
    box.style.setProperty("--px", cur.x.toFixed(3)); box.style.setProperty("--py", cur.y.toFixed(3));
    if (Math.abs(cur.x - tgt.x) > .002 || Math.abs(cur.y - tgt.y) > .002) raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf && visible) raf = requestAnimationFrame(frame); };
  function aim(x, y) { tgt.x = Math.max(-1, Math.min(1, x)); tgt.y = Math.max(-1, Math.min(1, y)); kick(); }
  function onMove(e) {
    if (!box) return;
    const r = box.getBoundingClientRect();
    aim(((e.clientX - r.left) / r.width - .5) * 2, ((e.clientY - r.top) / r.height - .5) * 2);
    look(e.clientX, e.clientY);
  }
  // 眼睛看向手指（以角色中心為準，-1～1）
  function look(cx, cy) {
    const c = box && box.querySelector("#petEmoji .pet-critter"); if (!c) return;
    const r0 = c.getBoundingClientRect(), pd = +c.dataset.pad || 0, k = pd / (200 + 2 * pd);   // 畫布四周留白的部分不算（圖案本身的範圍）
    const r = { left: r0.left + r0.width * k, top: r0.top + r0.height * k, width: r0.width * (1 - 2 * k), height: r0.height * (1 - 2 * k) };
    const ex = Math.max(-1, Math.min(1, (cx - (r.left + r.width / 2)) / (r.width * .8)));
    const ey = Math.max(-1, Math.min(1, (cy - (r.top + r.height * .45)) / (r.height * .8)));
    box.style.setProperty("--ex", ex.toFixed(2)); box.style.setProperty("--ey", ey.toFixed(2));
  }
  const onLeave = () => { aim(0, 0); if (box) { box.style.setProperty("--ex", "0"); box.style.setProperty("--ey", "0"); } };
  function onOrient(e) {
    if (!visible || e.gamma == null || e.beta == null) return;
    if (!base) base = { g: e.gamma, b: e.beta };
    aim((e.gamma - base.g) / 18, (e.beta - base.b) / 24);
  }
  // 搖手機（寵物新一輪 #11）：加速度突然變很大＝在搖，夥伴頭暈晃一晃（4 秒最多一次；iOS 要先授權動作感測，跟陀螺儀視差同一個授權）
  let shakeT = 0;
  function onMotion(e) {
    const a = e.accelerationIncludingGravity || e.acceleration; if (!visible || !a || feeding || asleep) return;
    const g = Math.hypot(a.x || 0, a.y || 0, a.z || 0); if (g < 24 || Date.now() - shakeT < 4000) return;
    shakeT = Date.now(); react("dizzy"); if (box) box.dispatchEvent(new CustomEvent("pet-shaken", { bubbles: true }));
  }
  let mood = "content";
  function bind(el, m) {
    unbind();
    mood = m || "content";
    if (!el || reduce()) return;
    box = el; base = null; cur = { x: 0, y: 0 }; tgt = { x: 0, y: 0 };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("pointerup", onLeave);
    el.addEventListener("contextmenu", noMenu);   // 長按不要跳出瀏覽器的選單（抱抱是長按）
    window.addEventListener("deviceorientation", onOrient);
    window.addEventListener("devicemotion", onMotion);
    if ("IntersectionObserver" in window) { io = new IntersectionObserver(es => { visible = es.some(x => x.isIntersecting); if (!visible) base = null; live(); }); io.observe(el); }
    else visible = true;
    document.addEventListener("visibilitychange", live);
    if (+el.dataset.stage === 6) warmReach6();
    placeDeco();
    setAsleep(sleepNow()); firstAct = !asleep && (window.__ps && window.__ps.tod || tod()) === "dawn" ? "stretch" : null;   // 清晨打開：先伸個懶腰
    schedule(mood);
    live();
  }
  // 看得到才跑（2026-10-07 優化輪）：夥伴卡捲出畫面、切到別的分頁／App 到背景時，神龍繩波、蝶翅膀這兩個常駐迴圈停下，舞台上的 CSS 動畫也暫停。
  // 量過（CPU 降速 4 倍）：以前神龍捲出畫面每秒還花 99ms 跑腳本、每隻角色的舞台每秒 30～50ms 重算樣式。回來時從當下時間接著跑（相位用時間算，不跳）
  // 睡／醒跟著時間走（2026-10-08 修正案 R1 測試時鐘抓到的）：以前只在舞台第一次畫出來時判斷一次，
  // 夥伴頁一直開著跨過 22:00 不會睡、早上 6:00 也不會醒，要整張重畫才對。現在每一拍待機、回到前景、只更新數字時都對一次（正在做事時不動）
  // 裝飾的位置跟著角色：嘴邊（白氣）、頭旁邊（小蝴蝶、夢泡泡）——每一階的嘴和頭不在同一個地方
  function placeDeco() {
    const d = box && box.querySelector(".ps-sdeco"), em = emEl(); if (!box || !em) return;
    const B = box.getBoundingClientRect(), m = typeof PetWalk !== "undefined" && PetWalk.cpt ? PetWalk.cpt(box, "mouth") : null, hd = em.querySelector(".pr-head") || em, H = hd.getBoundingClientRect();
    const set = (k, v) => box.style.setProperty(k, v.toFixed(1) + "px");
    if (m) { set("--mx", m[0] - B.left); set("--my", m[1] - B.top); }
    set("--hx", H.right - B.left); set("--hy", H.top - B.top + H.height * .25);
    if (d) d.dataset.ok = "1";
  }
  // 夢泡泡（2026-10-09 R5 原12）：睡著時偶爾冒一個，畫最近走的步道類型（瀑布、海、森林、古道、湖，其他畫山）；低頻、靜態
  let dreamT = 0;
  function dream() {
    if (!box || !asleep || Date.now() - dreamT < 20000 || Math.random() > .3) return; dreamT = Date.now();
    let tag = ""; try { const r = realRecords().find(x => x && x.trailId), t = r && TRAILS.find(x => x.id === r.trailId); tag = t && typeof tagsOf === "function" ? tagsOf(t)[0] || "" : ""; } catch (e) { /* 沒有步道資料就畫山 */ }
    const IC = new Map([["瀑布", '<path d="M8 4v12M12 4v14M16 4v12" stroke="#5aa3d8" stroke-width="2" stroke-linecap="round"/><path d="M5 19c2 1 4 1 7 0s5-1 7 0" stroke="#5aa3d8" stroke-width="1.6" fill="none"/>'], ["海景", '<path d="M3 13c3-3 6 3 9 0s6 3 9 0M3 18c3-3 6 3 9 0s6 3 9 0" stroke="#3c8fc4" stroke-width="2" fill="none"/>'], ["湖泊", '<ellipse cx="12" cy="15" rx="9" ry="4" fill="#9fd0ec" stroke="#3c8fc4" stroke-width="1.4"/>'], ["森林", '<path d="M12 3 6 13h3l-4 6h14l-4-6h3Z" fill="#5c9a4a" stroke="#3d6e30" stroke-width="1.2"/>'], ["古道", '<path d="M6 21c2-5 4-8 6-9s4-4 5-9" stroke="#a07a4a" stroke-width="2.4" fill="none" stroke-dasharray="3 2"/>']]);   // [步道類型, 圖]
    const svg = IC.get(tag) || '<path d="M2 19 9 8l4 6 3-4 6 9Z" fill="#8fb3a0" stroke="#4f7a62" stroke-width="1.2" stroke-linejoin="round"/>';
    const b = document.createElement("div"); b.className = "ps-dream"; b.setAttribute("aria-hidden", "true"); b.innerHTML = `<svg viewBox="0 0 24 24">${svg}</svg>`; b.dataset.tag = tag || "山";
    box.appendChild(b); setTimeout(() => b.remove(), 4200);
  }
  function syncSleep() {
    if (!box || busy || feeding || playing) return;
    const s = sleepNow(); if (s !== asleep) setAsleep(s);
  }
  function live() {
    if (!box) return; const on = visible && !document.hidden, st = +box.dataset.stage;
    if (on) syncSleep();
    box.classList.toggle("ps-off", !on);
    if (typeof PetWalk === "undefined") return;
    if (st === 6 && PetWalk.rope) PetWalk.rope(box, on);    // 神龍：身體一直有繩波流過
    if (st === 2 && PetWalk.wings) PetWalk.wings(box, on);  // 蝶：翅膀由同一個控制器每格寫
  }
  const noMenu = e => e.preventDefault();
  function unbind() {
    if (box) box.removeEventListener("contextmenu", noMenu);
    document.removeEventListener("visibilitychange", live);
    if (box && typeof PetWalk !== "undefined" && PetWalk.rope) PetWalk.rope(box, false);
    if (box && typeof PetWalk !== "undefined" && PetWalk.wings) PetWalk.wings(box, false);
    if (box) { box.removeEventListener("pointermove", onMove); box.removeEventListener("pointerleave", onLeave); box.removeEventListener("pointerup", onLeave); }
    window.removeEventListener("deviceorientation", onOrient);
    window.removeEventListener("devicemotion", onMotion);
    if (io) { io.disconnect(); io = null; }
    if (raf) cancelAnimationFrame(raf);
    clearTimeout(beat); beat = 0; busy = false; owner = 0; ownerKind = ""; asleep = false; if (guesting) guesting.bye();
    raf = 0; box = null; visible = false;
  }

  // ── 行為狀態機：待機 → 隨機挑一個動作 → 回待機。角色固定站在舞台中間（走動試過，看起來不自然，2026-10-04 拿掉）。
  // 心情決定機率：睏的多半不動、開心的會跳、想念的東張西望。
  // 2026-10-04：多了連眨兩下、打哈欠（睏）、嘆氣（想念）；看的時候頭跟著轉（CSS 讀 --ex）
  // ── 作息（2026-10-07 寵物新一輪 #4，參考 Finch：讓牠有自己的一天）──
  // 深夜 22:00～06:00 打開是睡著的（閉眼、呼吸放慢、頭一點一點、飄 Z），點牠、抱牠、餵牠會先醒來（揉眼、伸懶腰），醒了 15 分鐘內再打開不會又睡回去；
  // 清晨第一個動作是伸懶腰、白天比較愛動、黃昏比較安靜。除錯面板可以強制（window.__ps.asleep）
  let asleep = false, firstAct = null;
  // 睡覺時間（2026-10-08 修正案 R4 原5）：設定裡可以調、可以跨午夜、可以「不睡覺」；預設 22～6。存 tt_pet_sleep＝"22-6"／"off"
  function sleepWin() {
    let v = "22-6"; try { v = localStorage.getItem("tt_pet_sleep") || v; } catch (e) { /* 私密瀏覽 */ }
    if (v === "off") return null; const m = /^(\d{1,2})-(\d{1,2})$/.exec(v); if (!m) return [22, 6];
    const a = +m[1] % 24, b = +m[2] % 24; return a === b ? null : [a, b];
  }
  function sleepNow() {
    const f = window.__ps && window.__ps.asleep; if (f != null) return !!f;
    let w = 0; try { w = +localStorage.getItem("tt_pet_woke") || 0; } catch (e) { /* 私密瀏覽 */ }
    const W = sleepWin(); if (!W) return false;
    const h = ttClock.date().getHours(), inWin = W[0] > W[1] ? h >= W[0] || h < W[1] : h >= W[0] && h < W[1];
    return inWin && ttClock.now() - w > 15 * 60e3;
  }
  function setAsleep(on) {
    asleep = !!on && !reduce(); const em = emEl(); if (!box || !em) return;
    em.classList.toggle("pb-asleep", asleep); box.classList.toggle("ps-asleep", asleep);
    const old = box.querySelector(".ps-zz"); if (old) old.remove();
    if (asleep) { const z = document.createElement("div"); z.className = "ps-zz"; z.setAttribute("aria-hidden", "true"); z.innerHTML = "<i>z</i><i>z</i><i>Z</i>"; em.appendChild(z); }
  }
  async function wake() {
    if (!asleep || !box) return false;
    try { localStorage.setItem("tt_pet_woke", String(ttClock.now())); } catch (e) { /* 私密瀏覽 */ }
    if (window.__ps && window.__ps.asleep) window.__ps.asleep = false;
    setAsleep(false); stopIdle(); const tk = claimStage("wake");
    try { await flash("pb-wake", 1300); await flash("pb-stretch", 1400); } finally { freeStage(tk); }
    return true;
  }
  // 每隻自己的作息個性（2026-10-08 修正案 R4 原8：少量物種差異就好，不是每小時都有新行為）：只調待機動作的機率
  //   蝶白天愛飛（專屬小動作＝用力拍翅）、狐晨昏最活躍（真的狐狸是晨昏活動）、虎白天懶洋洋晚上東張西望、幼龍白天愛跳、神龍清晨亮龍珠
  const SP_TOD = { 2: { day: { special: 2 }, dusk: { idle: 1.6 } }, 3: { dawn: { special: 1.8, look: 1.5 }, dusk: { special: 1.8, look: 1.5 }, day: { idle: 1.4 } }, 4: { day: { idle: 1.8, yawn: 1.5 }, night: { look: 1.8 } }, 5: { day: { hop: 1.4 } }, 6: { dawn: { special: 2.2 } } };
  const TOD_W = { dawn: { add: { stretch: 3, yawn: 2 } }, day: { mul: { hop: 1.6, special: 1.5 } }, dusk: { add: { idle: 2, look: 1 } }, night: { add: { idle: 3, yawn: 1 } } };
  function weights(m) {   // 心情的機率，再照時段加減（清晨多伸懶腰、白天愛跳、黃昏多發呆）
    const w = Object.assign({}, WEIGHTS[m] || WEIGHTS.content), t = TOD_W[(window.__ps && window.__ps.tod) || tod()] || {};
    for (const k in t.add || {}) w[k] = (w[k] || 0) + t.add[k];
    for (const k in t.mul || {}) if (w[k]) w[k] *= t.mul[k];
    const sp = box && (SP_TOD[+box.dataset.stage] || {})[(window.__ps && window.__ps.tod) || tod()] || {};   // 每隻的作息個性（2026-10-08 R4 原8）
    for (const k in sp) if (w[k]) w[k] *= sp[k];
    // 天氣（2026-10-07 寵物新一輪 #14）：下雨會甩水、下雪會發抖、晴朗的白天會晒太陽
    const wx = box && box.dataset.wx, td = (window.__ps && window.__ps.tod) || tod();
    const feel = box && box.dataset.feel;
    if (wx === "rain") w.shake = 3; else if (wx === "snow") w.shiver = 3; else if (!wx && feel !== "hot" && (td === "day" || td === "dawn")) w.bask = 2;
    if (feel === "windy") w.windy = 3; else if (feel === "cold") w.shiver = Math.max(w.shiver || 0, 2); else if (feel === "hot") w.idle = (w.idle || 0) + 2;   // 起風：被吹一下；冷：縮著發抖；熱：懶得動
    return w;
  }
  const WEIGHTS = {
    sleepy: { idle: 5, yawn: 3, stretch: 1, look: 1, special: 1 },
    happy: { hop: 4, look: 2, stretch: 1, blink2: 1, idle: 1, special: 3 },
    content: { look: 3, hop: 1, stretch: 2, blink2: 1, idle: 2, special: 3 },
    longing: { look: 3, sigh: 2, blink2: 1, idle: 2, special: 1 },
  };
  let beat = 0, busy = false;
  // ── 動作仲裁（2026-10-08 修正案 A2）：誰拿到舞台、誰才能放開 ──
  // 以前大家共用一個 busy：待機動作播完的 finally 會把「正在吃」的 busy 也放掉 → 吃到一半插一個跳（F1）。
  // 現在每個動作開始時拿一張號碼牌（claimStage），結束時只有號碼牌還是自己的才放開（freeStage）。
  // 優先：使用者操作（餵、玩）＞ 叫醒 ＞ 朋友來訪 ＞ 待機。使用者操作開始時，正在播的待機動作立刻停（stopIdle，F1b）、
  // 正在來訪的朋友提早告別（dismissGuest，F2a／F2c），等牠走了才開始
  let owner = 0, ownerKind = "", tkSeq = 0, guesting = null;
  const idleAnims = new Set(), IDLE_CLS = ["pb-hop", "pb-stretch", "pb-yawn", "pb-sigh", "pb-blink2", "pb-shake", "pb-shiver", "pb-bask", "pb-windy", "chew2", "st-glow"];
  function claimStage(kind) { owner = ++tkSeq; ownerKind = kind; busy = true; return owner; }
  function freeStage(tk) { if (owner !== tk) return false; owner = 0; ownerKind = ""; busy = false; return true; }
  function stopIdle() {   // 待機動作讓位：拿掉它的 class、停掉它開的 Web 動畫、頭轉回正面
    if (ownerKind !== "idle") return;
    owner = 0; ownerKind = ""; busy = false;
    idleAnims.forEach(a => { try { a.cancel(); } catch (e) { /* 已經結束 */ } }); idleAnims.clear();
    const em = emEl(); if (em) em.classList.remove(...IDLE_CLS);
    if (box) { box.style.setProperty("--ex", "0"); if (+box.dataset.stage === 2 && typeof PetWalk !== "undefined" && PetWalk.wingMode) PetWalk.wingMode(box, "idle", 200); }
  }
  async function dismissGuest() { if (!guesting) return; guesting.bye(); await guesting.done; }   // 請朋友先走，等牠走出舞台
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function pick(w) {
    let r = Math.random() * Object.values(w).reduce((a, b) => a + b, 0);
    for (const k in w) if ((r -= w[k]) < 0) return k;
    return "idle";
  }
  function emEl() { return box && box.querySelector("#petEmoji"); }
  function flash(cls, ms) {   // 加一個動作 class，播完拿掉
    const em = emEl(); if (!em) return sleep(0);
    if (cls === "pb-snap" || cls === "pb-hug" || cls === "pb-rub") window.dispatchEvent(new CustomEvent("pet-fx", { detail: cls === "pb-snap" ? "bite" : "hug" }));   // 音效（pet.js，預設關；寵物新一輪 #23）
    em.classList.remove(cls); void em.offsetWidth; em.classList.add(cls);
    return sleep(ms).then(() => em.classList.remove(cls));
  }
  // 每隻專屬的待機小動作（2026-10-07 收尾輪：讓牠平常也有事做）——只動不會被繩波、步態每格寫的元素（單一擁有者）
  async function special(on) {   // on()：這個待機動作還擁有舞台嗎（被餵食／玩／訪客接手後，後面的步驟一律不做）
    on = on || (() => true); const fl = (c, ms) => on() ? flash(c, ms) : sleep(0);
    const em = emEl(); if (!em || typeof PetWalk === "undefined") return sleep(400);
    const st = +box.dataset.stage, A = (el, kf, o) => { if (!on() || !el || !el.animate) return sleep(on() ? o.duration || 400 : 0); const an = el.animate(kf, o); idleAnims.add(an); return an.finished.catch(() => {}).then(() => idleAnims.delete(an)); };
    if (st === 0) {   // 蛋：左右晃一下、裂縫亮起來
      const eg = em.querySelector(".pc-egg"); on() && cls(true, "st-glow");
      await A(eg, [{ transform: "rotate(0)" }, { transform: "rotate(-6deg)" }, { transform: "rotate(5deg)" }, { transform: "rotate(-2deg)" }, { transform: "rotate(0)" }].map(k => ({ ...k, transformBox: "view-box", transformOrigin: "100px 157px" })), { duration: 900, easing: "ease-in-out" });
      cls(false, "st-glow");
    } else if (st === 1) {   // 毛毛蟲：低頭啃一口葉子
      if (!on()) return; await PetWalk.bend(box, 8, 3, 380); on() && cls(true, "chew2"); await fl("pb-chew", 600); cls(false, "chew2"); if (on()) await PetWalk.bend(box, 0, 0, 380);
    } else if (st === 2) {   // 蝴蝶：用力拍一陣
      if (!on()) return; PetWalk.wingMode(box, "flap", 180); await sleep(1300); if (on()) PetWalk.wingMode(box, "idle", 300); await sleep(300);
    } else if (st === 3) {   // 狐：回頭看尾巴、尾巴甩兩下
      if (!on()) return; box.style.setProperty("--ex", "1"); await sleep(300); if (on()) PetWalk.tailFlick(box); await sleep(520); if (on()) PetWalk.tailFlick(box); await sleep(600); if (on()) box.style.setProperty("--ex", "0"); await sleep(300);
    } else if (st === 4) {   // 虎：前爪交替踩踏（貓的踏踏）
      const L = em.querySelector(".pc-bob > .pr-paw.l"), R = em.querySelector(".pc-bob > .pr-paw.r"), kf = d => [{ translate: "0 0" }, { translate: "0 -3px", offset: .3 }, { translate: "0 0", offset: .6 }, { translate: "0 0" }];
      for (let k = 0; k < 3 && on(); k++) { A(L, kf(), { duration: 420 }); await sleep(210); await A(R, kf(), { duration: 420 }); }
    } else if (st === 5) { await fl("pb-hop", 1100); await fl("pb-hop", 1100); }   // 幼龍：連跳兩下
    else if (st === 6) {   // 神龍：龍珠光芒脹大、亮一下
      const tw = em.querySelector(".pr-pearl .pc-tw");
      await A(tw, [{ transform: "scale(1)", opacity: .6 }, { transform: "scale(1.9)", opacity: 1, offset: .4 }, { transform: "scale(1)", opacity: .6 }].map(k => ({ ...k, transformBox: "view-box", transformOrigin: "62px 160px" })), { duration: 1400, easing: "ease-in-out" });
    } else await sleep(400);
  }
  function drops() {   // 甩水：幾滴水珠從身上往外飛（播完就拿掉）
    const em = emEl(); if (!em || reduce()) return;
    const g = document.createElement("div"); g.className = "ps-drops"; g.setAttribute("aria-hidden", "true");
    g.innerHTML = Array.from({ length: 7 }, (_, k) => `<i style="--a:${-160 + k * 23}deg;--dl:${(k % 3) * 60}ms"></i>`).join(""); em.appendChild(g); setTimeout(() => g.remove(), 1100);
  }
  async function act(kind) {
    if (!box || (owner && ownerKind !== "idle")) return;   // 舞台被使用者操作／訪客占著：待機不插隊
    const tk = claimStage("idle"), on = () => owner === tk, fl = (c, ms) => on() ? flash(c, ms) : sleep(0);
    if (window.__psIdleLog) window.__psIdleLog.push({ kind, feeding, playing, guest: !!guesting, t: performance.now() });   // 測試用：每個待機動作開始時記一筆（pet-handoff.test.js）
    try {
      if (kind === "look") {
        for (const d of [-1, 1, 0]) { if (!box || !on()) break; box.style.setProperty("--ex", d); await sleep(d ? 900 : 200); }
      } else if (kind === "hop") await fl("pb-hop", 1100);
      else if (kind === "stretch") await fl("pb-stretch", 1400);
      else if (kind === "yawn") await fl("pb-yawn", 1400);
      else if (kind === "sigh") await fl("pb-sigh", 1600);
      else if (kind === "blink2") await fl("pb-blink2", 500);
      else if (kind === "special") await special(on);
      else if (kind === "shake") { drops(); await fl("pb-shake", 900); }
      else if (kind === "shiver") await fl("pb-shiver", 1300);
      else if (kind === "bask") await fl("pb-bask", 2200);
      else if (kind === "windy") await fl("pb-windy", 1500);
      else await sleep(400);
    } finally { freeStage(tk); }
  }
  function schedule(m) {
    clearTimeout(beat);
    if (reduce() || window.__psNoIdle) return;   // __psNoIdle：測試要穩定時關掉隨機動作
    if (box) box.style.setProperty("--bk", (3.2 + Math.random() * 3).toFixed(2) + "s");   // 眨眼間隔每輪換一次（不要像節拍器）
    beat = setTimeout(async () => {
      if (window.__psNoIdle) return;   // 已經排好的那一次也要停（以前只在排程時檢查，測試關掉後還會再跳一次）
      syncSleep(); if (asleep && visible && !document.hidden) dream();
      if (box && box.isConnected && visible && !document.hidden && !busy && !asleep) { const k = firstAct || pick(weights(m)); firstAct = null; await act(k); }   // 睡著時不做動作（呼吸、點頭、飄 Z 是 CSS）
      if (box && box.isConnected) schedule(m);
    }, 3500 + Math.random() * 4500);
  }

  // ── 互動：點頭＝摸摸頭、點身體＝搔癢、長按＝抱抱（pet.js 決定給什麼回饋，這裡只播動作） ──
  function zoneOf(clientY) {
    const c = box && box.querySelector("#petEmoji .pet-critter"); if (!c) return "pat";
    const r = c.getBoundingClientRect();
    const line = typeof PET_ART !== "undefined" && PET_ART.headLine ? PET_ART.headLine(+box.dataset.stage || 0) : .5;   // 每階段的頭高度不同（幼蟲的頭在下半部）
    return clientY < (typeof PetWalk !== "undefined" ? PetWalk.svgY(c, r, line * 200) : r.top + r.height * line) ? "pat" : "tickle";
  }
  function react(kind) {
    if (reduce()) return sleep(0);
    if (kind === "rub") return flash("pb-rub", 1200);     // 來回摸（2026-10-07 寵物新一輪 #11）：瞇眼、身體跟著手扭
    if (kind === "dizzy") return flash("pb-dizzy", 1400); // 搖手機：頭暈晃一晃
    return flash(kind === "hug" ? "pb-hug" : kind === "tickle" ? "pb-tickle" : "pb-pat", kind === "hug" ? 1000 : 800);
  }

  // ── 餵食（2026-10-04 改）：一次扣三顆，就掉三顆——隨機落在腳邊（彼此分開、各自大小／角度／落下高度不同），
  // 夥伴一顆一顆轉頭看、咬一口（果實被吸到嘴邊縮小），餵食鈕上的果實數跟著一顆一顆減；三顆吃完再用自己那一種方式慶祝（跳、撲、挺胸…）。
  // 蛋不會吃也不會走：果實掉在蛋前面，化成光點飛進裂縫。減少動態效果或舞台不在畫面上時，pet.js 直接結算。回傳播完的 promise
  function dropSpots(n, egg) {   // egg：蛋不會走路，果實掉在蛋的前方 ±40 以內（在蛋前面、不會被擋住）
    if (Array.isArray(window.__psSpots) && window.__psSpots.length >= n) return window.__psSpots.slice(0, n);   // 測試／除錯：指定落點（px，相對舞台中間）
    if (egg === "front") {   // 狐、虎（2026-10-06 第五輪）：三顆排在兩隻前掌前面（左、中、右），趴下來轉頭、低頭就吃得到，不用走
      const u = PetWalk.pxu(box), wx = parseFloat(box.style.getPropertyValue("--wx")) || 0;
      return [-1, 0, 1].map(k => Math.round(wx + (k * 24 + (Math.random() * 2 - 1) * 3) * u));
    }
    if (egg === "larva") {   // 幼蟲（2026-10-06）：爬得慢（像真的毛毛蟲），果實落在頭的前方、一路往前吃——不用掉頭、不用爬遠
      const f = box.classList.contains("lv-l") ? -1 : 1, wx = parseFloat(box.style.getPropertyValue("--wx")) || 0, hx = wx + f * 48 * PetWalk.pxu(box);
      const xs = [20, 44, 68].map(d => Math.round(Math.max(-112, Math.min(112, hx + f * (d + (Math.random() * 2 - 1) * 6)))));
      if (new Set(xs).size === n) return xs;   // 太靠邊被夾成同一點：退回一般的落點
    }
    const out = [], R = egg === true ? 40 : 84, gap = egg === true ? 26 : 34;
    for (let tries = 0; out.length < n && tries < 80; tries++) {
      const x = Math.round((Math.random() * 2 - 1) * R);
      if ((egg !== true && Math.abs(x) < 18) || out.some(o => Math.abs(o - x) < gap)) continue;   // 不要剛好在正中間（被身體擋住）、彼此不要疊在一起
      out.push(x);
    }
    while (out.length < n) {   // 保底：掃一遍、挑離現有的點最遠的位置（以前塞固定值，可能跟已經有的點只差 24px）
      let best = 0, bd = -1; for (let x = -R; x <= R; x += 2) { if (egg !== true && Math.abs(x) < 18) continue; const d = Math.min(...out.map(o => Math.abs(o - x)), 999); if (d > bd) { bd = d; best = x; } }
      out.push(best);
    }
    return out;
  }
  // 尾巴搆不搆得到雲上某一點：雲面高度固定，所以結果只跟 x 有關——閒置時先算好一張表（2026-10-07 優化輪：以前按下餵食那一刻同步解好幾次，4 倍降速下卡 75ms）
  const R6 = new Map();
  const reach6 = (lx, top) => { const k = Math.round(lx); if (!R6.has(k)) R6.set(k, PetWalk.tailReach(k, top + 3 - 15)); return R6.get(k); };
  function warmReach6() {
    if (typeof PetWalk === "undefined" || typeof PET_ART === "undefined" || !PET_ART.cloudTop6) return;
    const xs = []; for (let x = 75; x <= 143; x++) if (!R6.has(x) && PET_ART.cloudTop6(x) != null) xs.push(x);
    const idle = window.requestIdleCallback || (f => setTimeout(() => f({ timeRemaining: () => 8 }), 200));
    const run = d => { while (xs.length && d.timeRemaining() > 2) { const x = xs.shift(); reach6(x, PET_ART.cloudTop6(x)); } if (xs.length) idle(run); };
    idle(run);
  }
  // 神龍：果實落在雲面上（雲的頂＋陷進去 3），只挑尾巴搆得到、彼此分開的位置。回傳 [{x, by}]（px，相對舞台中間／舞台底）
  function cloudSpots(n) {
    const pr = box.querySelector("#petEmoji .pet-prop"), actor = box.querySelector(".ps-actor");
    if (!pr || typeof PET_ART === "undefined" || !PET_ART.cloudTop6) return null;
    const q = pr.getBoundingClientRect(), a = actor.getBoundingClientRect(), k = q.width / 200, out = [];
    const forced = Array.isArray(window.__psSpots) && window.__psSpots.length >= n ? window.__psSpots.slice(0, n) : null;   // 測試：指定雲上的落點（圖上的 x）
    for (let tries = 0; out.length < n && tries < 120; tries++) {
      const lx = forced ? forced[out.length] : [82, 108, 136][out.length] + (Math.random() * 2 - 1) * (tries < 60 ? 5 : 2), top = PET_ART.cloudTop6(lx); if (top == null) continue;   // 分三區各一顆（隨機挑三個互隔 24 單位的點，運氣不好 120 次都湊不齊、退回掉在地上）；2026-10-07 尾巴重新設計後尾尖平常就在身體前下方，果實落在尾巴前段附近
      const x = Math.round(q.left + lx * k - (a.left + a.width / 2));
      if (!forced && (out.some(o => Math.abs(o.lx - lx) < 24) || reach6(lx, top) > 3)) continue;   // 間距用圖上的單位（尾巴那側只有 74 單位寬，用 px 算小舞台放不下三顆）
      out.push({ x, lx, by: Math.round(a.bottom - (q.top + (top + 3) * k)) });
    }
    return out.length === n ? out : null;
  }
  // ── 蝶：口器伸向果實（量果實在口器座標裡的位置，把伸直的口器改成一條彎過去的線）──
  const PROB0 = "M100 95 Q101 118 100 142 q-1 4 -3 3";
  // 口器（2026-10-06 改螺旋展開）：最後的形狀＝從嘴往下垂、再彎到果實的曲線；u＝展開了多少（0＝整條捲成螺旋收在嘴下、1＝整條伸直到果實）。
  // 還沒展開的那段在「已經伸出去的尖端」捲成越來越小的螺旋——像真的蝴蝶口器靠血壓一圈一圈攤開。dip＝吸的時候尖端一下一下探進果實
  function aimProboscis(b, u, dip) {
    const em = emEl(), ext = em && em.querySelector(".pr-ext"); if (!ext || !ext.getScreenCTM) return;
    const m = ext.getScreenCTM(); if (!m) return;
    const r = b.getBoundingClientRect(), q = new DOMPoint(r.left + r.width / 2, r.top + r.height * .5).matrixTransform(m.inverse());
    const tx = q.x, ty = q.y + (dip || 0), cx = 100 + (tx - 100) * .12, cy = 95 + (ty - 95) * .9, U = u == null ? 1 : u;
    const B = t => [(1 - t) * (1 - t) * 100 + 2 * (1 - t) * t * cx + t * t * tx, (1 - t) * (1 - t) * 95 + 2 * (1 - t) * t * cy + t * t * ty];
    const N = 26, pts = []; for (let i = 0; i <= N; i++) { const t = i / N * U; pts.push(B(t)); }
    let L = 0; for (let i = 1; i <= 40; i++) { const a = B((i - 1) / 40), c = B(i / 40); L += Math.hypot(c[0] - a[0], c[1] - a[1]); }
    const rest = L * (1 - U);
    if (rest > .5) {   // 還捲著的那段：從尖端沿切線往內捲，半徑 5 → 1
      const e = B(U), e2 = B(Math.max(0, U - .02)); let ang = Math.atan2(e[1] - e2[1], e[0] - e2[0]) || Math.PI / 2, x = e[0], y = e[1], done = 0;
      while (done < rest) { const rad = 1 + 4 * (1 - done / Math.max(rest, 1)), st = 1.6; ang += st / rad; x += Math.cos(ang) * st; y += Math.sin(ang) * st; done += st; pts.push([x, y]); }
    }
    ext.setAttribute("d", "M" + pts.map(p => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L"));
  }
  async function proboscis(b, from, to, ms) { await (typeof PetWalk !== "undefined" ? PetWalk.tween(ms, e => aimProboscis(b, from + (to - from) * e)) : sleep(ms)); }
  function resetProboscis() { const em = emEl(), ext = em && em.querySelector(".pr-ext"); if (ext) ext.setAttribute("d", PROB0); }
  // ── 蛋：往果實那邊傾、正面那道裂縫亮起來、果實化成 5～7 顆光點沿弧線飛進裂縫（每飛出一顆果實就縮一級）、鼓起來晃兩下 ──
  async function absorb(b, side) {
    const em = emEl(); if (!em) return;
    cls(true, "st-tilt-" + side); await sleep(380);
    cls(true, "st-glow"); await sleep(200);
    // 2026-10-05 第二輪：固定從正面那道裂紋（.cp-crack）吸進去；光點＋剩下的果實＝原本那一份（以前果實自己淡出、光點另外飛，像憑空複製）
    const tg = PetWalk.cpt(box, "crack"), br = b.getBoundingClientRect(), bx = br.left + br.width / 2, by = br.top + br.height / 2;
    const actor = box.querySelector(".ps-actor"), ar = actor.getBoundingClientRect();
    b.classList.add("melt");
    const n = 5 + Math.floor(Math.random() * 3), sparks = [], gap = 70;
    b.animate([{ transform: "none", filter: "brightness(1)" }, { transform: "scale(1.05, .92)", filter: "brightness(1.4)", offset: .12 }].concat(Array.from({ length: n }, (_, k) => ({ transform: `scale(${(1 - (k + 1) / n).toFixed(3)})`, filter: "brightness(1.6)", offset: Math.min(1, .12 + .88 * (k + 1) / n) }))), { duration: gap * n + 120, easing: "linear", fill: "forwards" });
    for (let k = 0; k < n; k++) {
      const s = document.createElement("i"); s.className = "ps-spark";
      const sx = bx + (Math.random() - .5) * br.width * .4, sy = by + (Math.random() - .5) * br.height * .3;
      const ex = tg ? tg[0] + (Math.random() - .5) * 6 : bx, ey = tg ? tg[1] + (Math.random() - .5) * 6 : by - 40;
      const dx = ex - sx, dy = ey - sy, lift = 16 + Math.random() * 12;
      s.style.left = (sx - ar.left) + "px"; s.style.top = (sy - ar.top) + "px";
      actor.appendChild(s);
      const a = s.animate([
        { transform: "translate(0, 0) scale(.5)", opacity: 0 },
        { transform: `translate(${(dx * .25).toFixed(1)}px, ${(dy * .25 - lift * .7).toFixed(1)}px) scale(1.15)`, opacity: 1, offset: .3 },
        { transform: `translate(${(dx * .7).toFixed(1)}px, ${(dy * .7 - lift).toFixed(1)}px) scale(.95)`, opacity: 1, offset: .7 },
        { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(.3)`, opacity: .15 },
      ], { duration: 560, delay: 120 + k * gap, easing: "ease-in", fill: "both" });
      sparks.push([s, a]);
    }
    await Promise.all(sparks.map(([, a]) => a.finished.catch(() => {})));
    sparks.forEach(([s]) => s.remove());
    cls(false, "st-tilt-" + side);
    await flash("pb-swell", 640);
    cls(false, "st-glow"); await sleep(260);   // 光退了、停一下，下一顆才開始
  }
  // 一顆一顆吃：看（頭＋眼轉過去）→ 俯身 → 張嘴 → 咬（嘴碰到果實上緣）→ 抬頭 → 嚼（臉頰鼓起）→ 吞；
  // 三顆吃完舔舔嘴、再慶祝。蝶是落在果實旁、口器彎過去吸；蛋是往果實傾、裂縫亮起來把光吸進去。
  const cls = (on, ...c) => { const em = emEl(); if (em) c.forEach(k => em.classList.toggle(k, on)); };
  // ── 果實歸誰（2026-10-05 第二輪）：地上（不動）／手掌／尾尖／嘴，同一時間只歸一個。歸了誰，每一格就把果實的錨點對齊到那個接觸點（PetWalk.cpt），
  // 部位怎麼動（爪子的 CSS 過渡、尾巴的變形、龍上下飄）果實就怎麼跟——以前用「量外框估爪尖」再讓果實用自己的過渡追，會落後、會跳。
  // 換手時從現在的位置接過來，殘差 off0 在 ms 內收到 0（接觸點本來就碰到果實了才換手，所以只差幾 px，不是果實自己飛過去）
  const owned = new Set(); let ownRaf = 0;
  function follow(b, name, o) {
    o = o || {}; const pt = typeof PetWalk !== "undefined" ? PetWalk.cpt(box, name) : null; if (!pt) return;
    const r = b.getBoundingClientRect(), ax = o.ax == null ? .5 : o.ax, ay = o.ay == null ? .5 : o.ay;
    if (b.__tx == null) { b.__bx0 = b.__rx != null ? b.__rx : parseFloat(b.style.getPropertyValue("--bx")) || 0; b.__tx = 0; b.__ty = 0; }
    b.__own = { name, ax, ay, off0: [r.left + r.width * ax - pt[0], r.top + r.height * ay - pt[1]], t0: performance.now(), ms: o.ms || 140 };
    owned.add(b); ownTick(true);
  }
  function release(b) { owned.delete(b); if (b) b.__own = null; }
  function ownTick(once) {
    if (!once) ownRaf = 0;
    if (!box) { owned.clear(); return; }
    owned.forEach(b => {
      if (!b.isConnected || !b.__own) { owned.delete(b); return; }
      const o = b.__own, pt = PetWalk.cpt(box, o.name); if (!pt) return;
      const k = Math.min(1, (performance.now() - o.t0) / o.ms), e = 1 - (1 - k) * (1 - k);
      const r = b.getBoundingClientRect();
      b.__tx += pt[0] + o.off0[0] * (1 - e) - (r.left + r.width * o.ax); b.__ty += pt[1] + o.off0[1] * (1 - e) - (r.top + r.height * o.ay);
      b.style.translate = `${(b.__bx0 + b.__tx).toFixed(2)}px ${b.__ty.toFixed(2)}px`;
    });
    if (owned.size && !ownRaf) ownRaf = requestAnimationFrame(() => ownTick());
  }
  function toMouth(b, egg) {   // 最後一口：果實要縮進去的點＝嘴的接觸點（蛋就是蛋的中間）
    const em = emEl(); if (!em) return;
    release(b);
    let pt = !egg && typeof PetWalk !== "undefined" && box ? PetWalk.cpt(box, "mouth") : null;
    if (!pt) { const t = (egg ? em.querySelector(".pc-bob") : em.querySelector(".pr-mouth") || em.querySelector(".pr-head")) || em, a = t.getBoundingClientRect(); pt = [a.left + a.width / 2, a.top + a.height / 2]; }
    const r = b.getBoundingClientRect();
    const ox = parseFloat(b.style.getPropertyValue("--tx")) || 0, oy = parseFloat(b.style.getPropertyValue("--ty")) || 0;   // 已經被移動過就接著算
    b.style.setProperty("--tx", `${Math.round(ox + pt[0] - (r.left + r.width / 2))}px`);
    b.style.setProperty("--ty", `${Math.round(oy + pt[1] - (r.top + r.height / 2))}px`);
  }
  // 低頭（.st-lean 把頭移 --lx/--ld）要移多少，嘴才會剛好碰到果實：套上姿勢量、算差、再量一次修正（同一格量完拿掉，不會閃）。
  // 差太多（頭伸不到）就先小碎步挪過去再量——**果實絕不自己飛過去**，沒碰到不准咬
  async function reach(b, stg) {
    const em = emEl(); if (!em) return;
    const u = 1 / PetWalk.pxu(box);
    const gap = (lx, ld) => { box.style.setProperty("--lx", lx + "px"); box.style.setProperty("--ld", ld + "px"); void em.offsetWidth;
      const m = PetWalk.cpt(box, "mouth"), r = b.getBoundingClientRect();
      return [(r.left + r.width / 2 - m[0]) * u, (r.top + r.height * BITE_Y - m[1]) * u]; };   // 嘴碰果實的上半部
    const LIM = { 1: [-14, 40], 3: [-8, 40], 4: [-8, 40], 6: [-14, 64] }[stg] || [-10, 40];
    let lx = 0, ld = 0;
    const hd = stg === 1 ? PetWalk.part(box, ".pr-head") : null, hdT = hd ? hd.style.transform : "";   // 幼蟲趴平時頭是 JS 寫的位置（會蓋掉 CSS 的低頭）：量的時候先拿掉，量完放回去
    if (hd) hd.style.transform = "";
    box.classList.add("no-tr"); em.classList.add("st-lean");
    for (let it = 0; it < 3; it++) {
      const [gx, gy] = gap(lx, ld); if (Math.abs(gx) < 1.5 && Math.abs(gy) < 1.5) break;
      lx = Math.max(-12, Math.min(12, lx + gx)); ld = Math.max(LIM[0], Math.min(LIM[1], ld + gy));
    }
    const [rx] = gap(lx, ld);
    em.classList.remove("st-lean"); void em.offsetWidth; box.classList.remove("no-tr"); if (hd) hd.style.transform = hdT; void em.offsetWidth;
    box.style.setProperty("--lx", Math.round(lx) + "px"); box.style.setProperty("--ld", Math.round(ld) + "px");
    if (Math.abs(rx) > 4 && typeof PetWalk !== "undefined") {   // 頭往旁邊伸不到：小碎步挪過去
      await PetWalk.goTo(box, (parseFloat(box.style.getPropertyValue("--wx")) || 0) + rx / u, { keepFace: true });
    }
  }
  // ── 玩（2026-10-07 寵物新一輪 #12）：丟一顆松果，每隻用自己的方式去玩——走得動的走過去用鼻子頂一下（松果滾開、開心跳）、
  // 蝶飛過去在上面拍翅、神龍用尾巴勾起來甩一下再放回、蛋原地搖一搖。松果用果實同一套落下動畫；玩完走回中間、松果淡出
  let playing = false;
  async function play(toySvg, atX, kind) {   // atX：使用者點的地方（相對舞台中間 px）；會限制在搆得到的範圍（2026-10-08 R4 原6）
    if (!box || reduce() || !visible || feeding || playing || typeof PetWalk === "undefined") return false;
    clearTimeout(beat); playing = true;   // 先占位：等朋友走、等醒來的這段時間，再按一次不會開第二輪
    stopIdle(); if (guesting) await dismissGuest(); if (asleep) await wake(); if (!box) { playing = false; return false; }
    const tk = claimStage("play"); box.classList.add("playing");
    const actor = box.querySelector(".ps-actor"), stg = +box.dataset.stage, b = document.createElement("span");
    try {
      const reachX = v => { const a = Math.max(-84, Math.min(84, Math.round(v))); return Math.abs(a) < 22 ? (a < 0 ? -22 : 22) : a; };   // 跟隨便丟的範圍一樣（±84、不要剛好在身體正中間）
      const cloud = stg === 6 ? cloudSpots(1) : null, x = cloud ? cloud[0].x : stg === 0 ? (Math.random() < .5 ? -1 : 1) * 34 : atX != null && isFinite(atX) ? reachX(atX) : dropSpots(1, stg === 1 ? "larva" : false)[0];   // 蛋不會動、神龍在雲上：照原本的玩法
      b.className = "ps-berry ps-toy" + (kind === "feather" ? " toy-feather" : ""); b.innerHTML = toySvg || "";   // 羽毛：飄得慢（R5 原13）
      b.style.cssText = `--bx:${x};--by:${cloud ? cloud[0].by : 8}px;--bs:28px;--br:${Math.round(Math.random() * 40 - 20)}deg;--bh:-230px;z-index:4`;
      actor.appendChild(b);
      if (cloud) { const c0 = parseFloat(box.style.getPropertyValue("--wx")) || 0; box.__cloud = c0; box.__riders = [{ el: b, bx: x, c0 }]; b.__rx = x; }
      box.style.setProperty("--ex", String(Math.sign(x) * Math.min(1, Math.abs(x) / 60))); box.style.setProperty("--ey", "1");
      await sleep(1000);
      if (stg === 0) { await special(); }
      else if (stg === 6) {
        const r0 = b.getBoundingClientRect(), back = [r0.left + r0.width / 2, r0.top + r0.height * .62];   // 玩完放回原地
        await PetWalk.tailTo(box, b, null, null, .34); b.classList.add("carried"); follow(b, "tail", { ay: .62, ms: 120 });
        await PetWalk.tailTo(box, () => { const r = box.getBoundingClientRect(); return [r.left + r.width * .62, r.top + r.height * .32]; });   // 舉高甩一下
        await flash("pb-hop", 900);
        await PetWalk.tailTo(box, () => back);
        release(b); await PetWalk.tailTo(box, null);
      } else {
        await PetWalk.goEat(box, b, x);
        box.style.setProperty("--ex", "0"); box.style.setProperty("--ey", "1");
        if (stg === 2) { PetWalk.wingMode(box, "flap", 160); await sleep(1100); PetWalk.wingMode(box, "idle", 300); }
        else { await sleep(250); b.classList.add("toy-roll"); b.style.setProperty("--rx", (Math.sign(x || 1) * 34) + "px"); await flash("pb-hop", 1100); }
        await PetWalk.home(box);
      }
      b.classList.add("toy-gone"); await sleep(450);
      return true;
    } finally {
      release(b); b.remove(); if (box) { box.__riders = null; box.classList.remove("playing"); box.style.setProperty("--ex", "0"); box.style.setProperty("--ey", "0"); }
      playing = false; freeStage(tk); if (box) schedule(mood);
    }
  }
  // ── 朋友的夥伴來串門子（2026-10-07 寵物新一輪 #19）：從舞台邊走進來站在旁邊，兩隻一起跳一下，待一會兒再走出去（自己一個元素，不碰主角的骨架） ──
  async function guest(o) {
    if (!box || reduce() || !visible || feeding || playing || asleep || guesting || !o || !o.svg) return false;
    if (owner && ownerKind !== "idle") return false;   // 叫醒中之類：下次再來
    const actor = box.querySelector(".ps-actor"); if (!actor || box.querySelector(".ps-guest")) return false;
    stopIdle(); const tk = claimStage("guest"); clearTimeout(beat);
    let bye = false, byeNow, doneR; const byeP = new Promise(r => { byeNow = r; });
    guesting = { bye: () => { bye = true; byeNow(); }, done: new Promise(r => { doneR = r; }) };
    const side = Math.random() < .5 ? -1 : 1, g = document.createElement("div"); g.className = "ps-guest"; g.setAttribute("aria-hidden", "true"); g.innerHTML = o.svg;
    g.style.setProperty("--gx", `${side * 33}%`); actor.appendChild(g);
    const W = box.getBoundingClientRect().width, off = side * W * .7;
    const walk = (from, to, ms) => g.animate([{ translate: `${from}px 0` }, { translate: `${to}px 0` }], { duration: ms, easing: "cubic-bezier(.3,.6,.4,1)", fill: "forwards" }).finished.catch(() => {});
    try {
      g.animate([{ rotate: "-5deg" }, { rotate: "5deg" }], { duration: 260, iterations: 6, direction: "alternate" });   // 走路時左右晃
      const inW = walk(off, 0, 1500); await Promise.race([inW, byeP]);
      if (!bye) {
        box.style.setProperty("--ex", String(side)); await Promise.race([sleep(300), byeP]);
        if (!bye) { g.animate([{ transform: "none" }, { transform: "translateY(-14%)", offset: .4 }, { transform: "none" }], { duration: 650, easing: "ease-out" });
          await flash("pb-hop", 1100); await Promise.race([sleep(Math.max(0, (o.stay || 3200) - 1100)), byeP]); }
      }
      if (box) box.style.setProperty("--ex", "0");
      g.animate([{ rotate: "-5deg" }, { rotate: "5deg" }], { duration: 260, iterations: 6, direction: "alternate" });
      g.getAnimations().forEach(a => { if (a.effect && a.effect.getKeyframes().some(k => k.translate)) { try { a.commitStyles(); } catch (e) { /* */ } a.cancel(); } });   // 從當下位置走出去（被請走時可能還沒走到）
      const cur = parseFloat(getComputedStyle(g).translate) || 0;
      await walk(cur, off, bye ? 800 : 1500);   // 被請走：走快一點，讓主人的事情早點開始
      return true;
    } finally { g.remove(); guesting = null; doneR(); freeStage(tk); if (box) schedule(mood); }
  }
  const BITE_Y = .32;   // 咬的位置：果實由上往下 32%（咬住上緣、一部分留在嘴外）
  let feeding = false;
  async function feed(berrySvg) {
    if (!box || reduce() || !visible || feeding || playing) return;   // 正在吃就不再開一輪（正在玩也等玩完）（餵食鈕本來就會鎖住＋8 小時冷卻；測試面板連按才會進來）
    clearTimeout(beat); feeding = true;   // 先占位（等朋友走、等醒來時再按一次不會開第二輪）
    stopIdle();                // 正在播的待機動作立刻讓位（F1b）
    if (guesting) await dismissGuest();   // 朋友在：先跟牠說掰掰，走了才吃（F2a）；沒朋友就不要多等一拍（同一格開始，幼蟲的時序才跟以前一樣）
    if (asleep) await wake();   // 睡著時按餵食：先醒來（揉眼、伸懶腰）再吃
    if (!box) { feeding = false; return; }
    const tk = claimStage("feed"); box.classList.add("feeding");
    const actor = box.querySelector(".ps-actor"), stg = +box.dataset.stage, egg = stg === 0, fly = stg === 2;
    const front = (stg === 3 || stg === 4) && typeof PetWalk !== "undefined" && !!PetWalk.frontLie;   // 狐、虎：正面趴著吃（不走路）
    const bal = document.querySelector("#petFeed .feed-bal");
    let left = bal ? +bal.textContent : NaN;
    const berries = []; let aborted = false;
    try {
      const onCloud = stg === 6 && typeof PetWalk !== "undefined" ? cloudSpots(3) : null;   // 神龍：果實落在雲上（跟著雲走）
      // 狐、虎趴著吃不走路：落點限制在前掌前方 ±28 單位（修正案規則 4：搆不到就換位置，不准把頭拉出去補——以前測試面板的遠落點會讓頭離開身體）
      const inReach = xs => { if (!front) return xs; const u = PetWalk.pxu(box), wx = parseFloat(box.style.getPropertyValue("--wx")) || 0, c = xs.map(x => wx + Math.max(-28, Math.min(28, (x - wx) / u)) * u);
        return c.every((x, i) => c.every((y, j) => i === j || Math.abs(x - y) >= 14 * u)) ? c.map(Math.round) : xs.map((x, i) => i).sort((a, b) => xs[a] - xs[b]).reduce((o, i, r) => { o[i] = Math.round(wx + (r - 1) * 24 * u); return o; }, []); };
      inReach(onCloud ? onCloud.map(o => o.x) : dropSpots(3, egg || (stg === 1 && typeof PetWalk !== "undefined" ? "larva" : front ? "front" : false))).forEach((x, k) => {
        const b = document.createElement("span");
        b.className = "ps-berry";
        b.innerHTML = berrySvg || "";
        const size = 26 + Math.round(Math.random() * 7), by = onCloud ? onCloud[k].by : egg ? 3 + Math.round(Math.random() * 5) : front ? 4 + Math.round(Math.random() * 3) : 10 + Math.round(Math.random() * 12);   // 狐虎：落在前掌前面（比腳底線靠鏡頭）
        b.style.cssText = `--bx:${x};--by:${by}px;--bs:${size}px;--br:${Math.round((Math.random() * 2 - 1) * 22)}deg;--bh:${-(200 + Math.round(Math.random() * 70))}px;animation-delay:${k * 170}ms;z-index:${by < 16 ? 4 : 3}`;
        actor.appendChild(b); berries.push({ b, x });
      });
      if (onCloud) { const c0 = parseFloat(box.style.getPropertyValue("--wx")) || 0; box.__cloud = c0; box.__riders = berries.map(o => ({ el: o.b, bx: o.x, c0 })); berries.forEach(o => { o.b.__rx = o.x; }); }
      box.style.setProperty("--ex", "0"); box.style.setProperty("--ey", "1");   // 低頭看掉下來的果實
      await sleep(340 + 650);   // 等最後一顆落地（以前多等 0.12 秒；再早出發，第三顆還在彈就開始走）
      const W = typeof PetWalk !== "undefined";
      const at = () => parseFloat(box.style.getPropertyValue("--wx")) || 0;
      // 吃的順序：從離現在位置比較近的那一端開始，一路掃到另一端——以前每次挑最近的會左右來回（轉身最難看，能少就少：最多轉兩次）
      const todo = berries.slice().sort((a, b) => a.x - b.x);
      if (Math.abs(todo[todo.length - 1].x - at()) < Math.abs(todo[0].x - at())) todo.reverse();
      // 幼蟲掉頭很花時間（頭不動、身體繞過去，等於多走 80px）：從頭朝的那一端開始吃，少掉一次頭（2026-10-05 第二輪）
      if (stg === 1) {   // 頭前方的由近到遠吃，背後的（如果有）最後掉一次頭再吃（2026-10-06：以前先去最遠那顆，最後回頭吃最近的，多掉一次頭）
        const f = box.classList.contains("lv-l") ? -1 : 1, hx = at() + f * 48 * PetWalk.pxu(box), front = todo.filter(o => (o.x - hx) * f > -10).sort((a, b) => (a.x - b.x) * f), back = todo.filter(o => (o.x - hx) * f <= -10).sort((a, b) => (b.x - a.x) * f);
        todo.splice(0, todo.length, ...front, ...back);
      }
      if (front) { box.style.setProperty("--ey", "1"); await PetWalk.frontLie(box, 1, stg === 4 ? 820 : 680); }   // 趴下（虎慢一點）
      while (todo.length) {
        if (!box || !visible || document.hidden) { aborted = true; break; }   // 滑走或切到背景：直接結算（pet.js 的 done 會更新數字），角色回到坐姿
        const { b, x } = todo.shift(), later = todo.length < 2;   // 第二、三顆：嚼兩下、停頓短一點（整段不要拖太久）
        // 正在吃的這顆亮一圈、其他的稍微暗下來在旁邊等——一眼就知道牠要吃哪一顆
        b.classList.add("target"); todo.forEach(o => o.b.classList.add("wait")); b.classList.remove("wait");
        box.style.setProperty("--ex", String(Math.sign(x - at()) * Math.min(1, Math.abs(x - at()) / 60)));   // 頭和眼睛轉過去看這一顆（轉身時一起轉，不另外停）
        await sleep(W ? 60 : 240);
        if (fly) cls(true, "st-legs");   // 蝶：快到的時候腳先伸出來
        if (W && !egg && !onCloud && !front) { await PetWalk.goEat(box, b, x); box.style.setProperty("--ex", "0"); box.style.setProperty("--ey", "1"); }   // 走過去：停在嘴剛好在果實上方
        // 低頭要低多少：量嘴到果實的高度差（換成 SVG 單位），夠不到的最後一點由果實「跳」進嘴裡
        if (front) {   // 狐、虎趴著：頭轉向這一顆、低頭，最後一段才張嘴，一碰到就咬 → 咬住後果實跟著嘴抬起來 → 抬頭嚼、吞
          const h = PetWalk.frontHeadSolve(box, b, BITE_Y), D = stg === 4 ? 640 : 520;
          cls(true, "st-lean"); const down = PetWalk.frontHead(box, h, D);
          await sleep(D * .68); cls(true, "st-open"); await down;
          cls(false, "st-open"); await flash("pb-snap", 200);
          b.classList.add("held"); follow(b, "mouth", { ay: .3, ms: 120 });
          cls(false, "st-lean"); const up = PetWalk.frontHead(box, [h[0] * .25, 6, h[2] * .25], stg === 4 ? 780 : 640);   // 抬頭（留一點點低頭、轉向那邊）；虎每一段都比狐慢 ≥20%（趴下 820/680、抬頭 780/640，修正案驗收表 2026-10-08）、頭壓得比較低（24 vs 21）＝比較重
          await sleep(stg === 4 ? 320 : 260); toMouth(b, false); b.classList.add("eaten"); await up;
          cls(true, "chew2"); await flash("pb-chew", (stg === 4 ? 1050 : 900) * .67); cls(false, "chew2");
          await flash("pb-gulp", 340);
          if (bal && isFinite(left)) { left = Math.max(0, left - 1); bal.textContent = left; bal.classList.remove("tick"); void bal.offsetWidth; bal.classList.add("tick"); }
          if (typeof ttBuzz === "function") ttBuzz(8);
          if (todo.length && PetWalk.tailFlick) PetWalk.tailFlick(box);   // 下一顆之前尾巴輕甩一下
          b.remove(); continue;
        }
        if (!egg && !fly && stg !== 5 && !onCloud) await reach(b, stg);
        if (egg) await absorb(b, x >= 0 ? "r" : "l");   // 蛋：不走路，原地把果實化成光吸進裂縫
        else if (onCloud) {   // 神龍：尾尖托住果實 → 沿身體下方送到下巴前的交接點 → 停一下、頭往前、張嘴 → 果實改歸嘴、尾巴鬆開退回 → 咬、嚼
          // 2026-10-06 第四輪：每一段的時間照尾尖要走的路長（PetWalk.tailMs）：去托 0.7～1 秒 → 托住停 0.2 → 送 0.9～1.2 → 等嘴 0.2 → 鬆開收回 0.9～1.3
          await PetWalk.tailTo(box, b, null, null, .34);   // 快到時尾尖捲起來勾住（2026-10-06 第五輪：像象鼻）
          b.classList.add("carried"); follow(b, "tail", { ay: .62, ms: 120 });   // 托住之後果實歸尾尖（尾巴拿著時跟尾尖）
          await sleep(200);                                                     // 托穩了才抬
          // 送到嘴前：尾尖勾在果實 62% 高的地方，果實上緣要碰到嘴（嘴在果實 BITE_Y 高的位置，跟其他角色咬的地方一樣）——2026-10-07 使用者回報沒對準：以前目標寫死「嘴往左 5、往下 6」
          const bh = b.getBoundingClientRect().height, atMouth = () => { const m = PetWalk.cpt(box, "mouth"); return [m[0], m[1] + bh * (.62 - BITE_Y)]; };
          await PetWalk.tailTo(box, atMouth, null, () => ownTick(true));   // 同一格把果實對齊尾尖（不等下一個 rAF：機器忙時會差一格、果實晃一下）
          await sleep(200);                                                     // 到了交接點停一下
          // 頭迎上去：尾巴盡量送，剩下的距離由頭補（2026-10-07：尾巴從背上的拱才動，嘴在頭的左下方幾乎是尾巴全長，搆不太到）——量果實和嘴還差多少，頭往那邊移（最多 24 單位）。
          // 位移交給繩波寫頭的那一行（box.__lean）：以前用 Web Animations 寫在頭的內層，跟咬的 CSS 動畫搶同一個元素，偶爾某一格頭彈回去 20px
          const mm = PetWalk.cpt(box, "mouth"), br = b.getBoundingClientRect(), uu = 1 / PetWalk.pxu(box), cl = v => Math.max(-8, Math.min(8, v));   // 尾巴自己送到嘴前（2026-10-07 重新設計：尾巴加長、尾端像象鼻往上捲），頭最多只補 8 單位（使用者：頭不用動）
          const LN = [cl((br.left + br.width / 2 - mm[0]) * uu), cl((br.top + br.height * BITE_Y - mm[1]) * uu)];
          const lean = PetWalk.tween(Math.round(220 + 8 * Math.hypot(LN[0], LN[1])), e => { box.__lean = [LN[0] * e, LN[1] * e]; });   // 距離越遠迎得越久（不然嘴一格跳一大段）
          await lean; cls(true, "st-open"); await sleep(150);   // 頭迎到位了才張嘴
          follow(b, "mouth", { ay: .38, ms: 220 });                             // 嘴碰到了：果實改歸嘴（交接只發生一次，從現在的位置接過來）
          const relax = PetWalk.tailTo(box, null);                              // 尾尖鬆開、退回
          await sleep(110);
          toMouth(b, false); b.classList.add("eaten"); cls(false, "st-open"); await flash("pb-snap", 240);
          await PetWalk.tween(380, e => { box.__lean = [LN[0] * (1 - e), LN[1] * (1 - e)]; }); box.__lean = null;
          cls(true, "chew2"); await flash("pb-chew", 600); cls(false, "chew2"); await relax;   // 嚼兩下（0.3 秒 × 2，要等嚼完）
          await flash("pb-gulp", 340);
        }
        else if (fly) {   // 蝶（2026-10-06 第四輪）：弧線降落 → 停穩、翅膀慢慢半合 → 口器一圈一圈攤開碰到果實 → 一下一下吸（翅膀只微動、身體高度不變）
          // → 口器捲回去 → 翅膀打開、在原地用力拍兩下以上 → 才起飛（以前翅膀一打開就直接升起來）
          PetWalk.wingMode(box, "rest", 560);
          cls(true, "st-land"); await sleep(420);
          aimProboscis(b, 0); cls(true, "st-sip");
          await proboscis(b, 0, 1, 420);
          b.classList.add("sipped"); cls(true, "pb-sip");
          { const t0 = performance.now(), D = later ? 900 : 1100; await PetWalk.tween(D, () => aimProboscis(b, 1, 2.6 * Math.sin((performance.now() - t0) / 1000 * Math.PI * 2 / .45))); }
          cls(false, "pb-sip");
          await proboscis(b, 1, 0, 360);
          cls(false, "st-sip"); resetProboscis();
          PetWalk.wingMode(box, "flap", 200); await sleep(200 + 2 * 340 + 60);   // 拍兩下（一下 0.34 秒）
          cls(false, "st-land", "st-legs");
        } else {
          if (stg === 5) {   // 幼龍（2026-10-06 像松鼠）：走到果實在兩腳正前方 → 蹲下、雙手往前下方伸到果實 → 雙手捧住 → 坐直把果實捧到下巴前 → 小口啃兩口 → 吞完才放下手
            const em = emEl(), pl = em.querySelector(".pr-paw.l"), pr = em.querySelector(".pr-paw.r");
            const put = (l, r) => { pl.style.transform = `translate(${l[0].toFixed(2)}px, ${l[1].toFixed(2)}px) rotate(${l[2].toFixed(2)}deg)`; pr.style.transform = `translate(${r[0].toFixed(2)}px, ${r[1].toFixed(2)}px) rotate(${r[2].toFixed(2)}deg)`; };
            const mir = q => [-q[0], q[1], -q[2]], lerp = (a, b, e) => a.map((v, i) => v + (b[i] - v) * e);
            pl.style.transition = pr.style.transition = "none";
            cls(true, "st-crouch"); await sleep(200);
            // 伸手：先套上「伸下去」的姿勢量兩個手掌的中點，差多少就再往那邊伸一點（同一格量完，不會畫出來）
            let R0 = [9, 24, -26];
            { put(R0, mir(R0)); void em.offsetWidth; const p = PetWalk.cpt(box, "palms"), q = b.getBoundingClientRect(), u = 1 / PetWalk.pxu(box);
              R0 = [R0[0], R0[1] + Math.max(-10, Math.min(18, (q.top + q.height * .55 - p[1]) * u)), R0[2]]; put([0, 0, 0], [0, 0, 0]); void em.offsetWidth; }
            await PetWalk.tween(380, e => put(lerp([0, 0, 0], R0, e), lerp([0, 0, 0], mir(R0), e)));
            b.classList.add("held"); follow(b, "palms", { ay: .55, ms: 180 }); await sleep(180);   // 雙手捧住：果實歸兩個手掌的中點
            const H = [-4, -6, -80];   // 捧到下巴前（手掌在下巴下面一點，果實上緣碰到嘴）
            cls(false, "st-crouch");
            await PetWalk.tween(480, e => { put(lerp(R0, H, e), lerp(mir(R0), mir(H), e)); ownTick(true); });
            b.style.setProperty("--nx", "50%");          // 缺口在正上方（嘴從上面咬）
            if (!later) {   // 第一顆咬兩口（先咬一口留缺口、捧著嚼）；第二、三顆一口吃掉（2026-10-07 優化輪 #8：一次餵食 22～24 秒太長）
              cls(true, "st-open"); await sleep(150);
              cls(false, "st-open"); b.classList.add("bit1"); await flash("pb-snap", 220);
              cls(true, "chew2"); await flash("pb-chew", 600); cls(false, "chew2");   // 捧著嚼
            }
            cls(true, "st-open"); await sleep(130);
            toMouth(b, false); b.classList.add("eaten");
            cls(false, "st-open"); await flash("pb-snap", 220);
            cls(true, "chew2"); await flash("pb-chew", 600); cls(false, "chew2"); await flash("pb-gulp", 340);
            await PetWalk.tween(360, e => put(lerp(H, [0, 0, 0], e), lerp(mir(H), [0, 0, 0], e)));   // 吞完才放下手
            pl.style.transform = pr.style.transform = ""; pl.style.transition = pr.style.transition = "";
            if (!todo.length) await flash("pb-belly", 640);                      // 最後一顆吞下去才拍拍肚子
            if (bal && isFinite(left)) { left = Math.max(0, left - 1); bal.textContent = left; bal.classList.remove("tick"); void bal.offsetWidth; bal.classList.add("tick"); }
            if (typeof ttBuzz === "function") ttBuzz(8);
            b.remove(); box.style.removeProperty("--ld"); box.style.removeProperty("--lx"); continue;
          }
          if (stg === 1) {   // 幼蟲：一小口一小口啃——每一口果實多一個缺口（缺口在嘴靠過來的那一側），第三口整顆吞下
            // 低頭：不是只有頭往下（那樣身體中間會拱成尖角），前面幾節一起彎下去（頭那一端彎最多、往後漸少）
            const hf = PetWalk.lvHeadFlat ? PetWalk.lvHeadFlat(box) : 0;   // 趴平時頭已經放低 hf（2026-10-07 優化輪 #6）
            const ld = (parseFloat(box.style.getPropertyValue("--ld")) || 0) - hf, lx = parseFloat(box.style.getPropertyValue("--lx")) || 0;
            { const hd = PetWalk.part(box, ".pr-head"); if (hd) hd.style.transform = `translate(0px, ${hf.toFixed(2)}px)`; }   // 頭先由 JS 接手（不然加上 st-lean 那一格，CSS 會先把頭移到低頭的位置，身體還沒彎）
            cls(true, "st-lean"); await PetWalk.bend(box, ld, lx, 320);
            b.style.setProperty("--nx", box.classList.contains("lv-l") ? "38%" : "62%");   // 缺口在上面、偏嘴那一側
            for (let k = 1; k <= 1; k++) {   // 2026-10-05 第二輪：兩口（咬一口留缺口、第二口吃掉），以前三口——一次餵食 23～29 秒太長
              cls(true, "st-open"); await sleep(130); cls(false, "st-open");
              b.classList.add("bit" + k); await flash("pb-snap", 220);           // 咬下去：果實多一個缺口
              cls(true, "chew2"); await flash("pb-chew", 360); cls(false, "chew2");  // 快快啃兩下（0.18 秒 × 2）
            }
            // 最後一口（2026-10-06 第四輪）：咬住的那一刻果實歸嘴（離開地面），頭抬起時一起帶起來，抬到位才縮進嘴裡——
            // 以前縮進去的目標點在咬下那一刻就算死了，頭抬起後果實還留在地上慢慢消失（像先站起來、食物才被清掉）
            cls(true, "st-open"); await sleep(130);
            b.classList.add("held"); follow(b, "mouth", { ay: .3, ms: 120 });
            cls(false, "st-open"); await flash("pb-snap", 220);
            cls(false, "st-lean"); await PetWalk.bend(box, 0, 0, later ? 300 : 360, () => ownTick(true));
            toMouth(b, false); b.classList.add("eaten");
            cls(true, "chew2"); await flash("pb-chew", 400); cls(false, "chew2"); await flash("pb-gulp", 340);
            if (bal && isFinite(left)) { left = Math.max(0, left - 1); bal.textContent = left; bal.classList.remove("tick"); void bal.offsetWidth; bal.classList.add("tick"); }
            if (typeof ttBuzz === "function") ttBuzz(8);
            b.remove(); box.style.removeProperty("--ld"); box.style.removeProperty("--lx"); continue;
          }
          {
            cls(true, "st-lean"); await sleep(360);   // 俯身，碰到後停一下
            cls(true, "st-open"); await sleep(170);   // 張嘴
            toMouth(b, false); b.classList.add("eaten");               // 果實被咬進嘴裡
            cls(false, "st-open"); await flash("pb-snap", 240);   // 咬！
            cls(false, "st-lean"); await sleep(later ? 200 : 280);   // 抬頭
          }
          { const two = later; cls(two, "chew2"); await flash("pb-chew", (stg === 1 ? 900 : stg === 4 ? 1050 : 900) * (two ? .67 : 1)); cls(false, "chew2"); }   // 嚼三下（後兩顆、以及狐虎每一顆都兩下：整段控制在 16 秒內）   // 嚼三下（後兩顆兩下；幼蟲快快啃、虎慢慢嚼）
          await flash("pb-gulp", 340);                               // 吞（要等動畫播完：0.28 秒就拿掉會切掉最後一段，頭跳回去）
        }
        if (bal && isFinite(left)) { left = Math.max(0, left - 1); bal.textContent = left; bal.classList.remove("tick"); void bal.offsetWidth; bal.classList.add("tick"); }
        if (typeof ttBuzz === "function") ttBuzz(8);
        b.remove();
        box.style.removeProperty("--ld"); box.style.removeProperty("--lx");
      }
      if (box) { box.style.setProperty("--ex", "0"); box.style.setProperty("--ey", "0"); }
      if (front && box && !aborted) { await PetWalk.frontHead(box, null, 360); await PetWalk.frontLie(box, 0, stg === 4 ? 820 : 680); }   // 吃完：頭回正、起身坐好
      if (aborted || !box) return;
      if (!egg && !fly) await flash("pb-lick", 640);                  // 舔舔嘴
      if (onCloud && W && box) { box.__riders = null; await PetWalk.goTo(box, -22); }   // 神龍：吃飽在雲上游一小段（身體走頭走過的路、雲座晚一點跟上）
      if (W && box) await PetWalk.home(box);                          // 走回中間
      await flash("pb-hop", 1300);   // 各自的慶祝（style-features.css 依階段換動作）
    } finally { if (box) box.__lean = null;
      if (front && box && (box.__lie || box.__fh)) { PetWalk.frontHead(box, null, 1); PetWalk.frontLie(box, 0, 1); }
      berries.forEach(o => { release(o.b); o.b.remove(); }); cls(false, "st-lean", "st-open", "st-sip", "st-land", "st-legs", "pb-sip", "st-glow", "st-tilt-l", "st-tilt-r"); resetProboscis(); if (box) { box.__riders = null; if (box.__chain && typeof PetWalk !== "undefined") PetWalk.tailTo(box, null, 1); box.style.removeProperty("--ld"); box.style.removeProperty("--lx"); if (typeof PetWalk !== "undefined" && (reduce() || aborted)) { PetWalk.stop(box); box.classList.remove("standing", "face-r"); } } feeding = false; freeStage(tk); if (box) { box.classList.remove("feeding"); schedule(mood); } }
  }

  // ── 天氣：用使用者所在位置（探索頁拿過的）或最後一趟走的步道；拿不到就不畫天氣，絕不在這裡要定位 ──
  let wxMemo = null;   // { at, wx }
  function wxPlace() {
    try { if (typeof myLoc !== "undefined" && myLoc && isFinite(myLoc.lat)) return myLoc; } catch (e) { /* */ }
    try {
      const recs = (typeof Store !== "undefined" ? Store.getRecords() : []).filter(r => r.trailId).sort((a, b) => (a.date < b.date ? 1 : -1));
      for (const r of recs) {
        const t = typeof TRAILS !== "undefined" ? TRAILS.find(x => x.id === r.trailId) : null;
        if (t && isFinite(t.lat) && isFinite(t.lon)) return { lat: t.lat, lon: t.lon };
      }
    } catch (e) { /* */ }
    return null;
  }
  async function weather() {
    if (wxMemo && Date.now() - wxMemo.at < 30 * 60e3) return wxMemo.wx;
    const p = wxPlace();
    if (!p || typeof Weather === "undefined" || !navigator.onLine) return "";
    try {
      const d = await Weather.get(p.lat, p.lon);
      const cu = d && d.current || {}, ws = +cu.wind_speed_10m, tc = +cu.temperature_2m;   // 體感（2026-10-09 R5 原10）：起風 ≥25 km/h、冷 ≤10°C、熱 ≥31°C；沒有資料就不猜
      wxMemo = { at: Date.now(), wx: wxOf(cu.weather_code), feel: isFinite(ws) && ws >= 25 ? "windy" : isFinite(tc) && tc <= 10 ? "cold" : isFinite(tc) && tc >= 31 ? "hot" : "" };
      return wxMemo.wx;
    } catch (e) { return ""; }
  }
  const cachedWx = () => (wxMemo ? wxMemo.wx : "");
  const cachedFeel = () => (window.__ps && window.__ps.feel != null ? window.__ps.feel : wxMemo ? wxMemo.feel || "" : "");

  // ── 除錯標記（測試面板「餵食除錯標記」／PetStage.debug(true)）：紅＝嘴、綠＝果實中心、藍＝腳掌著地點、黃＝接觸點（.cp-*）──
  let dbgOn = false, dbgRaf = 0;
  function debug(on) {
    dbgOn = on == null ? !dbgOn : !!on; cancelAnimationFrame(dbgRaf);
    document.querySelectorAll(".ps-dbg").forEach(e => e.remove());
    if (!dbgOn) return false;
    const lay = document.createElement("div"); lay.className = "ps-dbg"; lay.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:9999"; document.body.appendChild(lay);
    const dot = (x, y, c, r) => `<i style="position:fixed;left:${x - (r || 3)}px;top:${y - (r || 3)}px;width:${2 * (r || 3)}px;height:${2 * (r || 3)}px;border-radius:50%;background:${c};box-shadow:0 0 0 1px #000"></i>`;
    const tick = () => {
      if (!dbgOn) return;
      let h = "";
      const bx = document.querySelector(".ps-box"), em = bx && bx.querySelector("#petEmoji");
      if (em) {
        const P = sel => (typeof PetWalk !== "undefined" ? PetWalk.part(bx, sel) : em.querySelector(sel));
        const m = P(".pr-mouth"); if (m) { const r = m.getBoundingClientRect(); h += dot(r.left + r.width / 2, r.top + r.height / 2, "#f33", 4); }
        em.querySelectorAll(".cp").forEach(c => { const q = c.getBoundingClientRect(); if (q.width || q.height || c.getScreenCTM) { const M = c.getScreenCTM && c.getScreenCTM(); if (M) { const pt = new DOMPoint(+c.getAttribute("cx"), +c.getAttribute("cy")).matrixTransform(M); h += dot(pt.x, pt.y, "#ff0", 3); } } });
      }
      document.querySelectorAll(".ps-berry").forEach(b => { const r = b.getBoundingClientRect(); h += dot(r.left + r.width / 2, r.top + r.height / 2, "#3f6", 3); });
      lay.innerHTML = h; dbgRaf = requestAnimationFrame(tick);
    };
    tick(); return true;
  }

  // 心情變了但卡片沒重畫（pet.js 的 petCardUpdate）：待機動作的機率跟著換
  function setMood(m) { mood = m || "content"; if (box) schedule(mood); }
  // 現在在做什麼（2026-10-08 修正案 A1／原 35）：錄影標籤、驗收腳本、效能紀錄共用的同一套名字；只讀狀態，不改任何東西
  function phase() {
    if (!box) return "—";
    const em = emEl(), pb = em && [...em.classList].find(c => c.startsWith("pb-") && c !== "pb-asleep"), walk = box.classList.contains("walking");
    if (feeding) return walk ? (box.dataset.walk === "turn" ? "餵:掉頭" : "餵:走") : box.__chain ? "餵:尾巴送" : "餵:吃";
    if (playing) return walk ? "玩:走" : "玩";
    if (box.querySelector(".ps-guest")) return "訪客";
    if (asleep) return "睡";
    return pb ? "動作:" + pb.slice(3) : busy ? "動作" : "待機";
  }
  return { debug, phase, sync: syncSleep, sleepWin, dream: () => { dreamT = 0; const r = Math.random; Math.random = () => 0; try { dream(); } finally { Math.random = r; } }, setMood, html, photoSvgs, bind, unbind, tod, season, wxOf, weather, cachedWx, cachedFeel, count: STAGES, zoneOf, react, feed, act, isFeeding: () => feeding, isAsleep: () => asleep, isPlaying: () => playing, play, guest, wake, sleep: () => setAsleep(true) };
})();
