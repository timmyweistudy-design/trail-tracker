// 美術共用工具（明信片、夥伴舞台、夥伴角色都用）：色票、混色、固定種子亂數、平滑曲線、
// 有受光面的山稜、有體積的雲、樹、草、芒草、紙張顆粒。純函式、只產生 SVG 字串。
// 風格規範（2026-10 美工輪）：光從左上來；每個物件三階（基本／暗面偏藍紫／亮面偏暖）；
// 遠景偏藍、淡、低對比（空氣透視）；線條用該色加深而不是黑；不用會動的 SVG 濾鏡（iOS 會卡）。
window.ArtKit = (function () {
  // ── 顏色 ──
  const hex = c => { c = c.replace("#", ""); if (c.length === 3) c = c.split("").map(x => x + x).join(""); return [0, 2, 4].map(i => parseInt(c.substr(i, 2), 16)); };
  const toHex = a => "#" + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
  function mix(a, b, t) { const A = hex(a), B = hex(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); }
  const shade = (c, k) => mix(c, "#1e2440", k);     // 暗面：往藍紫壓
  const tint = (c, k) => mix(c, "#fff6dc", k);      // 亮面：往暖白提

  // ── 時段色票（天空上/下、遠景、中景、近景、地面、水深/淺、陽光、霧） ──
  const PAL = {
    dawn: { sky: ["#f2b7a0", "#fde9d6"], far: "#a99ab6", mid: "#6f8f7c", near: "#3f6b4e", ground: "#4d7a52", water: ["#6f97b8", "#cfe0e8"], sun: "#ffd29a", mist: "#fbe7dc", ink: "#3a3346" },
    day: { sky: ["#8cc4ea", "#e4f3f2"], far: "#8fb3c4", mid: "#5f9a74", near: "#3c7a4e", ground: "#5a9a58", water: ["#3d86b8", "#a9dcec"], sun: "#fff3c0", mist: "#eef6f3", ink: "#2c3a30" },
    dusk: { sky: ["#6c5a96", "#f4a878"], far: "#8b6f97", mid: "#5d6b72", near: "#3a4f48", ground: "#4a5f48", water: ["#5b5b8a", "#f0b89a"], sun: "#ffb070", mist: "#f3c7b5", ink: "#2e2638" },
    night: { sky: ["#0f1b36", "#2b4566"], far: "#2f4562", mid: "#22394a", near: "#162a2c", ground: "#1d3330", water: ["#1a3150", "#3f5f86"], sun: "#f4eecf", mist: "#5a7090", ink: "#0d1620" },
  };
  // 季節：植物主色與點綴
  const SEASON = {
    spring: { leaf: "#7cb86a", accent: ["#f6b8c8", "#f8d9e2", "#ffffff"] },
    summer: { leaf: "#4f9a50", accent: ["#f2c14e", "#ffffff", "#e889a8"] },
    autumn: { leaf: "#b8a04a", accent: ["#d9622f", "#e8973a", "#c94a2a"] },
    winter: { leaf: "#6d8a62", accent: ["#efe6cf", "#ffffff", "#d9d2c0"] },
  };
  function seasonOf(d) { const m = new Date(d || Date.now()).getMonth() + 1; return m >= 3 && m <= 5 ? "spring" : m >= 6 && m <= 8 ? "summer" : m >= 9 && m <= 11 ? "autumn" : "winter"; }
  function todOf(d) { const h = new Date(d || Date.now()).getHours(); return h >= 5 && h < 8 ? "dawn" : h >= 8 && h < 16 ? "day" : h >= 16 && h < 19 ? "dusk" : "night"; }

  // ── 固定種子亂數（同一條步道永遠同一張圖） ──
  function hash(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = (typeof seed === "number" ? seed : hash(seed)) || 1; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const R = (r, a, b) => a + (b - a) * r();
  const f1 = v => (Math.round(v * 10) / 10);

  // ── 平滑曲線：Catmull-Rom → 三次貝茲 ──
  function smooth(pts) {
    if (pts.length < 2) return "";
    let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${f1(c1[0])} ${f1(c1[1])} ${f1(c2[0])} ${f1(c2[1])} ${f1(p2[0])} ${f1(p2[1])}`;
    }
    return d;
  }
  // 稜線點：x0→x1，base 是山腳高度，amp 起伏，peaks 幾個主峰
  function ridgePts(r, x0, x1, base, amp, n) {
    const pts = []; n = n || 7;
    for (let i = 0; i <= n; i++) {
      const x = x0 + (x1 - x0) * i / n;
      const y = base - amp * (0.35 + 0.65 * Math.abs(Math.sin(i * 1.7 + r() * 3))) * (0.6 + r() * 0.4);
      pts.push([x, y]);
    }
    return pts;
  }
  let _uid = 0;
  const uid = p => (p || "ak") + (++_uid).toString(36);
  // 有受光邊的山：底色填滿＋左上一道亮邊（同形狀往右下錯開、裁在原形狀裡）＋由上往下的漸層（下面融進霧）
  function mountain(pts, bottom, color, o) {
    o = o || {};
    const d = smooth(pts) + ` L${pts[pts.length - 1][0]} ${bottom} L${pts[0][0]} ${bottom}Z`;
    const id = uid("m"), lit = tint(color, o.lit != null ? o.lit : .32), low = o.fade ? mix(color, o.fade, .55) : shade(color, .12);
    return `<defs><clipPath id="${id}c"><path d="${d}"/></clipPath><linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="${low}"/></linearGradient></defs>` +
      `<path d="${d}" fill="${lit}"/><g clip-path="url(#${id}c)"><path d="${d}" fill="url(#${id}g)" transform="translate(${o.dx || 3.5} ${o.dy || 3})"/></g>`;
  }
  // 有體積的雲：幾顆圓疊起來，下面一層陰影、上面一層亮
  function cloud(x, y, s, base, o) {
    o = o || {};
    const lit = tint(base, .5), sh = shade(base, .18);
    const blobs = [[-22, 2, 13], [-8, -6, 17], [10, -3, 15], [24, 3, 11], [0, 5, 14]];
    const body = c => blobs.map(([bx, by, br]) => `<circle cx="${f1(x + bx * s)}" cy="${f1(y + by * s)}" r="${f1(br * s)}" fill="${c}"/>`).join("");
    return `<g opacity="${o.op || 1}"><g transform="translate(0 ${f1(3 * s)})">${body(sh)}</g>${body(base)}<g transform="translate(${f1(-2 * s)} ${f1(-3 * s)})" opacity=".55">${blobs.slice(1, 3).map(([bx, by, br]) => `<circle cx="${f1(x + bx * s)}" cy="${f1(y + by * s)}" r="${f1(br * s * .7)}" fill="${lit}"/>`).join("")}</g></g>`;
  }
  // 霧帶：一條柔和的橫向帶
  function mist(y, h, color, op, w) { w = w || 400; return `<path d="M-20 ${y + h} Q${w * .25} ${y - h * .4} ${w * .5} ${y + h * .3} T${w + 20} ${y} L${w + 20} ${y + h * 1.6} L-20 ${y + h * 1.6}Z" fill="${color}" opacity="${op}"/>`; }
  // 杉木（窄長尖塔，台灣中海拔）：左亮右暗兩半
  function cedar(x, y, h, color) {
    const w = h * .32, lit = tint(color, .22), dk = shade(color, .2), tiers = 4;
    let s = `<rect x="${f1(x - h * .03)}" y="${f1(y - h * .12)}" width="${f1(h * .06)}" height="${f1(h * .14)}" fill="${shade("#6b4a2a", .1)}"/>`;
    for (let k = 0; k < tiers; k++) {
      const ty = y - h * .1 - k * h * .22, tw = w * (1 - k * .2), th = h * .36;
      s += `<path d="M${f1(x)} ${f1(ty - th)} L${f1(x - tw)} ${f1(ty)} Q${f1(x)} ${f1(ty + 4)} ${f1(x)} ${f1(ty)}Z" fill="${lit}"/><path d="M${f1(x)} ${f1(ty - th)} L${f1(x + tw)} ${f1(ty)} Q${f1(x)} ${f1(ty + 4)} ${f1(x)} ${f1(ty)}Z" fill="${dk}"/>`;
    }
    return s;
  }
  // 闊葉樹：一叢圓，暗面在右下、亮面在左上
  function broadleaf(x, y, s, color, r) {
    r = r || Math.random;
    const dk = shade(color, .22), lit = tint(color, .28);
    const blobs = [[0, -40, 22], [-18, -30, 17], [18, -28, 18], [-6, -52, 16], [10, -46, 15]].map(([a, b, c]) => [a + R(r, -3, 3), b + R(r, -3, 3), c * R(r, .9, 1.1)]);
    const B = (c, dx, dy, k) => blobs.map(([a, b, rr]) => `<circle cx="${f1(x + (a + dx) * s)}" cy="${f1(y + (b + dy) * s)}" r="${f1(rr * s * (k || 1))}" fill="${c}"/>`).join("");
    return `<path d="M${f1(x - 3 * s)} ${f1(y)} L${f1(x - 2 * s)} ${f1(y - 26 * s)} L${f1(x + 2 * s)} ${f1(y - 26 * s)} L${f1(x + 3 * s)} ${f1(y)}Z" fill="#5e4430"/>` + B(dk, 3, 3) + B(color, 0, 0) + B(lit, -5, -6, .55);
  }
  // 草叢：5 種葉形隨機組合（不會一眼看出是複製的）
  function grass(x, y, s, color, r) {
    r = r || Math.random;
    let d = "";
    const n = 4 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      const bx = x + R(r, -8, 8) * s, h = R(r, 12, 26) * s, lean = R(r, -9, 9) * s, w = R(r, 1.6, 3) * s;
      d += `M${f1(bx - w)} ${f1(y)} Q${f1(bx + lean * .3)} ${f1(y - h * .6)} ${f1(bx + lean)} ${f1(y - h)} Q${f1(bx + lean * .2 + w)} ${f1(y - h * .55)} ${f1(bx + w)} ${f1(y)}Z`;
    }
    return `<path d="${d}" fill="${color}"/>`;
  }
  // 芒草：彎桿＋米白花穗（秋冬古道、稜線的招牌）
  function silvergrass(x, y, s, r, plume) {
    r = r || Math.random; plume = plume || "#efe6cf";
    let st = "", pl = "";
    const n = 3 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const bx = x + R(r, -6, 6) * s, h = R(r, 30, 46) * s, lean = R(r, -14, 14) * s;
      const tx = bx + lean, ty = y - h;
      st += `M${f1(bx)} ${f1(y)} Q${f1(bx + lean * .2)} ${f1(y - h * .6)} ${f1(tx)} ${f1(ty)}`;
      pl += `<path d="M${f1(tx)} ${f1(ty)} q${f1(lean * .25 + 4 * s)} ${f1(-4 * s)} ${f1(lean * .5 + 6 * s)} ${f1(8 * s)} q${f1(-6 * s)} ${f1(-1 * s)} ${f1(-lean * .5 - 6 * s)} ${f1(-8 * s)}Z" fill="${plume}"/>`;
    }
    return `<path d="${st}" stroke="#8a8a5a" stroke-width="${f1(1.4 * s)}" fill="none" stroke-linecap="round"/>${pl}`;
  }
  // 兩端漸細的線（SVG 的線不能變粗細，用細長填色形狀做）：從 (x0,y0) 到 (x1,y1)，中間最寬 w
  function taper(x0, y0, x1, y1, w, color, bend) {
    const mx = (x0 + x1) / 2 + (bend || 0), my = (y0 + y1) / 2, dx = y1 - y0, dy = -(x1 - x0), L = Math.hypot(dx, dy) || 1, nx = dx / L * w / 2, ny = dy / L * w / 2;
    return `<path d="M${f1(x0)} ${f1(y0)} Q${f1(mx + nx)} ${f1(my + ny)} ${f1(x1)} ${f1(y1)} Q${f1(mx - nx)} ${f1(my - ny)} ${f1(x0)} ${f1(y0)}Z" fill="${color}"/>`;
  }
  // 紙張顆粒：一張小雜訊圖（canvas 算一次就快取），在 SVG 裡當 pattern 鋪滿、5% 透明度。不用 feTurbulence。
  let _grain = null;
  function grainURI() {
    if (_grain !== null) return _grain;
    try {
      const c = document.createElement("canvas"); c.width = c.height = 64;
      const x = c.getContext("2d"), im = x.createImageData(64, 64), r = rng(7);
      for (let i = 0; i < im.data.length; i += 4) { const v = r() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
      x.putImageData(im, 0, 0); _grain = c.toDataURL("image/png");
    } catch (e) { _grain = ""; }
    return _grain;
  }
  function grain(w, h, op) {
    const u = grainURI(); if (!u) return "";
    const id = uid("gr");
    return `<defs><pattern id="${id}" width="64" height="64" patternUnits="userSpaceOnUse"><image href="${u}" width="64" height="64"/></pattern></defs><rect width="${w}" height="${h}" fill="url(#${id})" opacity="${op || .06}" style="mix-blend-mode:multiply"/>`;
  }
  const skyGrad = (id, a, b) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;

  return { mix, shade, tint, PAL, SEASON, seasonOf, todOf, hash, rng, R, f1, smooth, ridgePts, mountain, cloud, mist, cedar, broadleaf, grass, silvergrass, taper, grain, grainURI, uid, skyGrad };
})();
