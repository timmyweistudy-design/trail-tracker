// 夥伴舞台的背景插畫（viewBox 400×300，貼底）：用 ArtKit 畫，光從左上、三階明暗、空氣透視（遠景偏藍淡）、層間夾霧。
// 回傳 { far, mid, front } 三層 SVG 內容，由 pet-stage.js 放進視差的各層。時段決定色票、季節決定樹葉顏色。
// 「走過的風景」裝飾（pet-journey.js 決定）也畫在這裡：海、瀑布、古道石階＋土地公廟、遠方杉林、湖。
window.StageArt = (function () {
  const W = 400, H = 300;
  const K = () => window.ArtKit;
  const f = v => Math.round(v * 10) / 10;

  function ctx(tod, season, seed) { const A = K(); return { A, P: A.PAL[tod] || A.PAL.day, S: A.SEASON[season] || A.SEASON.summer, tod, season, r: A.rng("stage|" + seed + "|" + tod + "|" + season) }; }
  function leaf(c, k) {
    const A = c.A; let col = c.S.leaf;
    if (c.season === "autumn" && k % 3 === 1) col = c.S.accent[k % c.S.accent.length];
    if (c.season === "spring" && k % 4 === 2) col = "#f2b8c8";
    return c.tod === "night" ? A.mix(col, c.P.near, .72) : c.tod === "dusk" ? A.mix(col, c.P.mid, .45) : c.tod === "dawn" ? A.mix(col, c.P.mid, .25) : col;
  }
  const groundCol = c => c.A.mix(leaf(c, 0), c.P.ground, .5);
  // 遠景：兩層山＋兩條霧；extra 插在兩層之間（例如海）
  function far(c, o) {
    const A = c.A, r = c.r; o = o || {};
    const l1 = A.mountain(A.ridgePts(r, -10, W + 10, o.b1 || 196, o.a1 || 70, o.n1 || 7), H, A.mix(c.P.far, c.P.sky[1], .28), { fade: c.P.mist, lit: .22 });
    const l2 = A.mountain(A.ridgePts(r, -10, W + 10, o.b2 || 226, o.a2 || 38, 6), H, A.mix(c.P.far, c.P.mid, .45), { fade: A.mix(c.P.mist, c.P.mid, .3), lit: .2 });
    return l1 + (o.between || "") + A.mist(198, 12, c.P.mist, .5, W) + l2 + A.mist(228, 8, c.P.mist, .35, W);
  }
  // 地面：一道平緩的丘（角色站在中間 y≈250），左上受光
  function ground(c, y, col) {
    const A = c.A;
    return A.mountain([[-10, y + 10], [90, y - 4], [200, y], [310, y - 8], [410, y + 6]], H, col || groundCol(c), { fade: A.shade(col || groundCol(c), .25), lit: .18 });
  }
  function grassRow(c, xs, y, s, k0) { return xs.map((x, k) => c.A.grass(x, y, s, c.A.shade(leaf(c, (k0 || 0) + k), .1 + (k % 2) * .08), c.r)).join(""); }
  function rock(c, x, y, s) {
    const A = c.A, base = c.tod === "night" ? "#3f4652" : A.mix("#8a8476", c.P.mid, .2), w = 30 * s, h = 22 * s;
    return `<path d="M${f(x - w)} ${f(y)} Q${f(x - w * .9)} ${f(y - h * .8)} ${f(x - w * .2)} ${f(y - h)} Q${f(x + w * .55)} ${f(y - h * 1.05)} ${f(x + w)} ${f(y - h * .2)} L${f(x + w + 2 * s)} ${f(y)}Z" fill="${A.shade(base, .28)}"/>` +
      `<path d="M${f(x - w)} ${f(y)} Q${f(x - w * .9)} ${f(y - h * .8)} ${f(x - w * .2)} ${f(y - h)} Q${f(x)} ${f(y - h * .9)} ${f(x - w * .05)} ${f(y - h * .45)} Q${f(x - w * .4)} ${f(y - h * .15)} ${f(x - w * .3)} ${f(y)}Z" fill="${A.tint(base, .3)}"/>`;
  }
  function fern(c, x, y, s, flip, k) {
    const A = c.A, col = A.shade(leaf(c, k || 0), .08), g = flip ? -1 : 1; let d = "";
    for (let i = 0; i < 7; i++) { const t = i / 7, px = x + g * 34 * s * t, py = y - 30 * s * t + 12 * s * t * t, L = (1 - t) * 12 * s + 3 * s; d += A.taper(px, py, px + g * L * .4, py - L, 2.6 * s, col) + A.taper(px, py, px + g * L, py + L * .25, 2.6 * s, col); }
    return `<path d="M${x} ${y} Q${f(x + g * 17 * s)} ${f(y - 22 * s)} ${f(x + g * 34 * s)} ${f(y - 18 * s)}" stroke="${col}" stroke-width="${f(1.8 * s)}" fill="none"/>` + d;
  }
  function flower(c, x, y, s, col) {
    const A = c.A, st = A.shade(leaf(c, 0), .15);
    const petals = [0, 72, 144, 216, 288].map(a => { const rad = a * Math.PI / 180; return `<circle cx="${f(x + Math.cos(rad) * 5 * s)}" cy="${f(y - 24 * s + Math.sin(rad) * 5 * s)}" r="${f(4.6 * s)}" fill="${col}"/>`; }).join("");
    return `<path d="M${x} ${y} Q${f(x + 2 * s)} ${f(y - 12 * s)} ${x} ${f(y - 22 * s)}" stroke="${st}" stroke-width="${f(2 * s)}" fill="none"/>${A.taper(x, y - 8 * s, x + 9 * s, y - 14 * s, 3.4 * s, st)}` +
      `<g transform="translate(${f(1.2 * s)} ${f(1.6 * s)})" opacity=".5">${petals.replace(new RegExp(col, "g"), A.shade(col, .35))}</g>${petals}<circle cx="${x}" cy="${f(y - 24 * s)}" r="${f(3 * s)}" fill="#f6d36a"/><circle cx="${f(x - 1.4 * s)}" cy="${f(y - 25.5 * s)}" r="${f(1.6 * s)}" fill="${A.tint(col, .6)}" opacity=".7"/>`;
  }
  function shroom(c, x, y, s) {
    const A = c.A, cap = c.tod === "night" ? "#7a3a34" : "#d9674f", stem = c.tod === "night" ? "#8a8270" : "#efe4c8";
    return `<path d="M${f(x - 4 * s)} ${y} L${f(x - 3 * s)} ${f(y - 13 * s)} L${f(x + 3 * s)} ${f(y - 13 * s)} L${f(x + 4 * s)} ${y}Z" fill="${stem}"/><path d="M${f(x + 1 * s)} ${y} L${f(x + 1.6 * s)} ${f(y - 13 * s)} L${f(x + 3 * s)} ${f(y - 13 * s)} L${f(x + 4 * s)} ${y}Z" fill="${A.shade(stem, .2)}"/>` +
      `<path d="M${f(x - 13 * s)} ${f(y - 11 * s)} Q${x} ${f(y - 32 * s)} ${f(x + 13 * s)} ${f(y - 11 * s)}Z" fill="${cap}"/><path d="M${f(x + 2 * s)} ${f(y - 11 * s)} Q${f(x + 8 * s)} ${f(y - 22 * s)} ${f(x + 13 * s)} ${f(y - 11 * s)}Z" fill="${A.shade(cap, .22)}"/>` +
      `<ellipse cx="${f(x - 5 * s)}" cy="${f(y - 19 * s)}" rx="${f(2.4 * s)}" ry="${f(1.8 * s)}" fill="#fff"/><ellipse cx="${f(x + 4 * s)}" cy="${f(y - 15 * s)}" rx="${f(1.8 * s)}" ry="${f(1.3 * s)}" fill="#fff"/>`;
  }
  function trunk(c, x, w, top, flip) {
    const A = c.A, bark = c.tod === "night" ? "#2e2822" : "#6b4e36", g = flip ? -1 : 1;
    const d = `M${f(x - w)} ${H} C${f(x - w * .7)} 220 ${f(x - w * .55)} 120 ${f(x - w * .45)} ${top} L${f(x + w * .45)} ${top} C${f(x + w * .55)} 120 ${f(x + w * .7)} 220 ${f(x + w)} ${H}Z`;
    return `<path d="${d}" fill="${bark}"/><path d="M${f(x + g * w * .1)} ${H} C${f(x + g * w * .15)} 200 ${f(x + g * w * .1)} 120 ${f(x + g * w * .05)} ${top} L${f(x + g * w * .45)} ${top} C${f(x + g * w * .55)} 120 ${f(x + g * w * .7)} 220 ${f(x + g * w)} ${H}Z" fill="${A.shade(bark, .35)}"/>` +
      [.2, -.15].map(k => `<path d="M${f(x + w * k)} ${H - 10} C${f(x + w * k - 3)} 200 ${f(x + w * k + 3)} 140 ${f(x + w * k)} ${top + 20}" stroke="${A.shade(bark, .5)}" stroke-width="2" fill="none" opacity=".6"/>`).join("");
  }
  function canopy(c, x, y, s, k) { const A = c.A; return A.broadleaf(x, y + 60 * s, s, A.shade(leaf(c, k || 0), .18), c.r); }

  // ── 走過的風景（裝飾） ──
  function decoFall(c) {
    const A = c.A, base = c.tod === "night" ? "#3c4450" : A.mix("#8a8476", c.P.mid, .2), white = c.tod === "night" ? "#b9c9e0" : "#f4fafd", id = A.uid("df"), cid = A.uid("dc");
    const pts = [[280, 262], [282, 200], [290, 168], [304, 152], [320, 146], [336, 150], [350, 166], [358, 200], [362, 262]];
    const d = A.smooth(pts) + "Z";
    let s = `<defs><clipPath id="${cid}"><path d="${d}"/></clipPath><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${A.mix(c.P.water[0], white, .35)}"/><stop offset="1" stop-color="${white}"/></linearGradient></defs>`;
    s += `<path d="${d}" fill="${A.shade(base, .25)}"/><g clip-path="url(#${cid})"><path d="${d}" fill="${A.tint(base, .18)}" transform="translate(-28 -2)"/></g>`;
    s += `<path d="M310 150 C309 190 307 230 304 258 L332 258 C329 230 327 190 326 150Z" fill="url(#${id})"/>`;
    for (let k = 0; k < 5; k++) { const x = 312 + k * 3.2; s += `<path class="ps-fallw" d="M${x} ${154 + k * 6} V${250 - k * 4}" stroke="${white}" stroke-width="${1.4 + (k % 2) * .8}" stroke-linecap="round" fill="none"/>`; }
    for (let k = 0; k < 5; k++) s += `<ellipse cx="${304 + k * 8}" cy="${258 + (k % 2) * 2}" rx="${6 + k % 3 * 3}" ry="2.6" fill="${white}" opacity=".85"/>`;
    return s + `<circle cx="306" cy="250" r="10" fill="${white}" opacity=".3"/><circle cx="330" cy="252" r="12" fill="${white}" opacity=".25"/>`;
  }
  function decoSea(c) { const A = c.A; return `<rect class="ps-sea" x="-10" y="214" width="${W + 20}" height="40" fill="${A.mix(c.P.water[0], c.P.sky[1], .25)}"/>` + [40, 130, 250, 330].map((x, k) => `<path d="M${x} ${222 + k % 2 * 6} h${18 + k * 4}" stroke="${A.tint(c.P.water[1], .3)}" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>`).join(""); }
  function decoLake(c) {
    const A = c.A, id = A.uid("dl");
    return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${A.mix(c.P.water[1], c.P.sky[1], .3)}"/><stop offset="1" stop-color="${c.P.water[0]}"/></linearGradient></defs>` +
      `<ellipse class="ps-lake" cx="318" cy="266" rx="52" ry="10" fill="url(#${id})"/><path d="M268 264 Q318 255 368 264" stroke="#fff" stroke-width="1.2" fill="none" opacity=".7"/><path d="M296 266 h18 M326 270 h14" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity=".6"/>`;
  }
  function decoOld(c) {
    const A = c.A, stone = c.tod === "night" ? "#5d6268" : "#b8ad94";
    let s = `<g class="ps-steps">`;
    const S = [[96, 270, 18], [88, 260, 15], [82, 251, 12], [78, 243, 9.5], [76, 236, 7.5], [76, 230, 6]];   // 放在角色左邊，不被身體擋住
    for (let k = S.length - 2; k >= 0; k--) { const [x, y, w] = S[k], [x2, y2, w2] = S[k + 1], rise = (y - y2) * .45;
      s += `<path d="M${x - w} ${f(y - rise)} L${x2 - w2} ${y2} L${x2 + w2} ${y2} L${x + w} ${f(y - rise)}Z" fill="${A.mix(stone, k % 2 ? "#ffffff" : "#000000", .08)}"/><path d="M${x - w} ${y} V${f(y - rise)} H${x + w} V${y}Z" fill="${A.shade(stone, .35)}"/>`; }
    const night = c.tod === "night";
    return s + `</g><g transform="translate(48 252) scale(.62)"><rect x="-15" y="-6" width="30" height="6" fill="${night ? "#3f4550" : "#7f7c73"}"/><rect x="-11" y="-24" width="22" height="18" fill="${night ? "#5d6470" : "#a9a69c"}"/><path d="M-5 -6 V-15 Q0 -20 5 -15 V-6Z" fill="#2b2620"/><path d="M-17 -23 Q-10 -25 0 -31 Q10 -25 17 -23 Q19 -26 20 -28 Q12 -26 0 -35 Q-12 -26 -20 -28 Q-19 -26 -17 -23Z" fill="${night ? "#6a3a34" : "#9c4a3a"}"/>${night ? `<circle cx="0" cy="-11" r="9" fill="#ffd27a" opacity=".25"/>` : ""}</g>`;
  }
  function decoForest(c) { const A = c.A; return [150, 186, 222, 252].map((x, k) => A.cedar(x, 228 - k % 2 * 4, 52 + k % 3 * 10, A.mix(leaf(c, k), c.P.far, .45))).join(""); }

  // ── 7 階的場景 ──
  function scene(stage, tod, season, decor) {
    const c = ctx(tod, season, stage), A = c.A, r = c.r;
    decor = stage >= 6 ? [] : (decor || []);
    const has = k => decor.includes(k);
    const between = has("sea") ? decoSea(c) : "";
    const farExtra = (has("forest") ? decoForest(c) : "") + (has("fall") ? decoFall(c) : "");
    const midExtra = (has("old") ? decoOld(c) : "") + (has("lake") ? decoLake(c) : "");
    let o = {};
    if (stage === 0) {   // 神秘之卵：兩棵大樹框住的林間空地、灑落的光斑、編織的巢
      o.far = far(c, { between }) + farExtra;
      let nest = "";
      for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI, rx = 62, y0 = 264; nest += `<path d="M${f(200 - rx * Math.cos(a))} ${f(y0 + 6 * Math.sin(a))} Q200 ${f(y0 + A.R(r, 6, 16))} ${f(200 + rx * Math.cos(a + .6))} ${f(y0 + 4 * Math.sin(a + .6))}" stroke="${A.mix("#8a6236", k % 2 ? "#5e4026" : "#b08a5a", .4)}" stroke-width="${A.R(r, 2.4, 4).toFixed(1)}" fill="none" stroke-linecap="round"/>`; }
      o.mid = ground(c, 252) + `<g opacity="${c.tod === "night" ? .12 : .28}">${[[120, 258, 26], [260, 262, 30], [200, 276, 20]].map(([x, y, rr]) => `<ellipse cx="${x}" cy="${y}" rx="${rr}" ry="${rr * .25}" fill="${c.P.sun}"/>`).join("")}</g>` +
        `<ellipse cx="200" cy="266" rx="68" ry="13" fill="${A.shade("#6b4a2a", .2)}"/>` + nest + midExtra +
        trunk(c, 30, 30, -10) + trunk(c, 372, 36, -10, true) + canopy(c, 20, -40, 2.4, 0) + canopy(c, 390, -50, 2.6, 2);
      o.front = grassRow(c, [12, 44, 360, 392], 304, 1.6) + [[70, 296], [330, 300]].map(([x, y], k) => A.taper(x, y, x + 22, y - 8, 9, leaf(c, k + 1))).join("");
    } else if (stage === 1) {   // 草叢幼蟲：草地、有明暗的香菇、幸運草、遠處小樹
      o.far = far(c, { between }) + farExtra + [60, 330].map((x, k) => A.broadleaf(x, 232, .7, A.mix(leaf(c, k), c.P.far, .35), r)).join("");
      o.mid = ground(c, 250) + grassRow(c, [70, 130, 280, 330], 262, 1.2) + shroom(c, 92, 270, 1.4) + shroom(c, 312, 266, 1.1) + shroom(c, 292, 272, .8) + midExtra +
        [[150, 276], [258, 278]].map(([x, y]) => [0, 120, 240].map(a => `<circle cx="${f(x + Math.cos(a * Math.PI / 180) * 4)}" cy="${f(y + Math.sin(a * Math.PI / 180) * 4)}" r="4" fill="${A.tint(leaf(c, 0), .1)}"/>`).join("")).join("");
      o.front = grassRow(c, [10, 40, 70, 330, 362, 394], 304, 1.8);
    } else if (stage === 2) {   // 翩翩彩蝶：花田，前中後景的花大小不同
      const cols = c.S.accent.concat(["#e889a8", "#b58be0", "#f2c14e"]);
      o.far = far(c, { between }) + farExtra;
      o.mid = ground(c, 250) + Array.from({ length: 14 }, (_, k) => `<circle cx="${f(A.R(r, 10, 390))}" cy="${f(A.R(r, 246, 258))}" r="${f(A.R(r, 1.6, 2.6))}" fill="${cols[k % cols.length]}" opacity=".9"/>`).join("") +
        [[70, 268, 1.1], [106, 262, .8], [300, 264, 1], [336, 270, 1.2], [132, 258, .6], [272, 256, .65]].map(([x, y, s], k) => flower(c, x, y, s, cols[k % cols.length])).join("") + midExtra;
      o.front = flower(c, 24, 306, 1.7, cols[1]) + flower(c, 378, 304, 1.6, cols[2]) + grassRow(c, [50, 352], 304, 1.4);
    } else if (stage === 3) {   // 靈巧山狐：杉木林（遠淡近濃）、光束、蕨類
      let fr = far(c, { between }) + farExtra;
      [40, 90, 140, 260, 310, 360].forEach((x, k) => { fr += A.cedar(x, 232 - k % 2 * 6, 64 + k % 3 * 12, A.mix(leaf(c, k), c.P.far, .5)); });
      o.far = fr;
      o.mid = ground(c, 250) + `<g opacity="${c.tod === "night" ? .06 : .16}">${[0, 1].map(k => `<path d="M${150 + k * 70} -10 L${180 + k * 70} -10 L${120 + k * 90} 260 L${80 + k * 90} 260Z" fill="#fff8d8"/>`).join("")}</g>` +
        A.cedar(52, 262, 150, leaf(c, 0)) + A.cedar(350, 266, 170, leaf(c, 3)) + A.cedar(96, 254, 96, A.mix(leaf(c, 1), c.P.mid, .3)) + midExtra;
      o.front = fern(c, 0, 304, 1.5, false, 1) + fern(c, 400, 304, 1.5, true, 2) + grassRow(c, [80, 330], 304, 1.3);
    } else if (stage === 4) {   // 山林猛虎：尖峰岩稜、分面的岩塊、玉山圓柏
      o.far = A.mountain([[-10, 210], [50, 150], [110, 186], [170, 118], [230, 180], [300, 132], [360, 172], [410, 150]], H, A.mix("#7d8aa0", c.P.far, .4), { fade: c.P.mist, lit: .3 }) + between +
        A.mist(198, 12, c.P.mist, .5, W) + A.mountain(A.ridgePts(r, -10, W + 10, 228, 30, 6), H, A.mix(c.P.far, c.P.mid, .45), { fade: c.P.mist }) + farExtra;
      const juniper = c.tod === "night" ? "#2e3a34" : "#4e6b4a", tw = c.tod === "night" ? "#5a5a5a" : "#c9c1b0";
      o.mid = ground(c, 252, A.mix("#8a8476", groundCol(c), .45)) + rock(c, 80, 268, 1.8) + rock(c, 326, 266, 2.2) + rock(c, 130, 260, .9) + midExtra +
        `<path d="M300 238 C304 222 292 214 300 200 C310 188 326 192 334 182" stroke="${tw}" stroke-width="5" fill="none" stroke-linecap="round"/>` + [[334, 180, 13], [348, 176, 9], [318, 194, 9]].map(([x, y, rr]) => `<ellipse cx="${x}" cy="${y}" rx="${rr * 1.5}" ry="${rr * .6}" fill="${juniper}"/>`).join("");
      o.front = rock(c, 22, 312, 1.4) + rock(c, 384, 314, 1.2) + grassRow(c, [60, 350], 304, 1.2);
    } else if (stage === 5) {   // 初醒幼龍：三層山夾三層霧的山谷
      o.far = A.mountain([[-10, 180], [60, 120], [120, 168], [190, 92], [250, 158], [320, 104], [410, 150]], H, A.mix(c.P.far, c.P.sky[1], .25), { fade: c.P.mist, lit: .25 }) + A.mist(170, 16, c.P.mist, .6, W) + between +
        A.mountain(A.ridgePts(r, -10, W + 10, 214, 44, 6), H, A.mix(c.P.far, c.P.mid, .4), { fade: c.P.mist }) + A.mist(210, 12, c.P.mist, .5, W) + farExtra;
      o.mid = ground(c, 252) + A.cedar(40, 258, 110, leaf(c, 0)) + A.cedar(78, 254, 70, A.mix(leaf(c, 1), c.P.mid, .3)) + A.cedar(356, 260, 120, leaf(c, 2)) + rock(c, 300, 266, 1) + midExtra + A.mist(240, 8, c.P.mist, .3, W);
      o.front = A.mist(286, 10, c.P.mist, .45, W) + grassRow(c, [20, 380], 304, 1.4);
    } else {   // 騰雲神龍：站在雲海之上，遠方山尖露出
      const cc = c.tod === "night" ? "#7c8ca8" : A.mix("#ffffff", c.P.sky[1], .18);
      o.far = A.mountain([[-10, 230], [70, 170], [130, 214], [210, 150], [280, 210], [340, 166], [410, 200]], H, A.mix(c.P.far, c.P.sky[1], .3), { fade: cc, lit: .3 }) +
        Array.from({ length: 6 }, () => A.cloud(A.R(r, 0, W), A.R(r, 218, 236), A.R(r, 1.2, 1.9), A.mix(cc, c.P.far, .15), { op: .9 })).join("");
      let sea = `<rect x="-10" y="250" width="${W + 20}" height="60" fill="${cc}"/>`;
      for (let k = 0; k < 9; k++) sea += A.cloud(k * 50 - 10 + A.R(r, -10, 10), 252 + A.R(r, -6, 6), A.R(r, 1.6, 2.4), cc);
      o.mid = sea;
      o.front = A.cloud(20, 300, 2.4, cc) + A.cloud(384, 302, 2.2, cc);
    }
    return o;
  }
  // 天氣雲（陰天／雨天掛在天空層）
  function skyClouds(tod) { const A = K(), P = A.PAL[tod] || A.PAL.day, cc = tod === "night" ? A.mix(P.far, "#ffffff", .2) : A.mix(P.sky[1], "#9aa6b0", .35); return `<g class="ps-skycloud">${A.cloud(90, 70, 1.6, cc)}${A.cloud(300, 52, 2, cc)}</g>`; }
  return { scene, skyClouds };
})();
