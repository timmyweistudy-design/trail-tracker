// 明信片插畫（viewBox 320×200）：7 個主題 × 3 個構圖骨架，由步道 id 固定挑（同一條永遠同一張、不同條不一樣）。
// 第一次走的時段決定整張色票（不只天空）、月份決定季節（春花／夏雲／秋紅／冬芒）。
// 畫法依 2026-10 美工方案：瀑布五層（岩壁／水緣／落水亮線／水潭泡沫／水霧）、古道有透視石階＋土地公廟＋芒草、
// 水有深淺漸層＋岸邊白線＋倒影＋遠密近疏的波光。全部是 ArtKit 的手寫向量，沒有濾鏡。
window.PostcardArt = (function () {
  const K = () => window.ArtKit;
  const W = 320, H = 200;

  // ── 小零件 ──
  function rock(x, y, s, base, r) {
    const A = K(), lit = A.tint(base, .3), dk = A.shade(base, .25);
    const w = 26 * s, h = 18 * s, j = () => A.R(r, -3, 3) * s;
    const d = `M${x - w} ${y} Q${x - w + j()} ${y - h * .8} ${x - w * .2} ${y - h + j()} Q${x + w * .5} ${y - h * 1.05} ${x + w} ${y - h * .2} L${x + w + 2 * s} ${y}Z`;
    return `<path d="${d}" fill="${dk}"/><path d="M${x - w} ${y} Q${x - w + 2} ${y - h * .8} ${x - w * .2} ${y - h} Q${x} ${y - h * .9} ${x - w * .05} ${y - h * .45} Q${x - w * .4} ${y - h * .15} ${x - w * .3} ${y}Z" fill="${lit}" opacity=".9"/>`;
  }
  function fern(x, y, s, color, flip) {
    const A = K(); let d = "";
    const f = flip ? -1 : 1;
    for (let k = 0; k < 7; k++) {
      const t = k / 7, px = x + f * 30 * s * t, py = y - 26 * s * t + 10 * s * t * t, L = (1 - t) * 11 * s + 3 * s;
      d += A.taper(px, py, px + f * L * .4, py - L, 2.4 * s, color) + A.taper(px, py, px + f * L, py + L * .25, 2.4 * s, color);
    }
    return `<path d="M${x} ${y} Q${x + f * 15 * s} ${y - 20 * s} ${x + f * 30 * s} ${y - 16 * s}" stroke="${color}" stroke-width="${1.6 * s}" fill="none"/>` + d;
  }
  function shrine(x, y, s, night) {   // 土地公廟：石砌基座、小屋身、深色門洞、翹脊屋頂、紅布
    const stone = night ? "#5d6470" : "#a9a69c", stoneD = night ? "#3f4550" : "#7f7c73";
    return `<g transform="translate(${x} ${y}) scale(${s})">
      <rect x="-15" y="-6" width="30" height="6" fill="${stoneD}"/><rect x="-11" y="-24" width="22" height="18" fill="${stone}"/><rect x="0" y="-24" width="11" height="18" fill="${stoneD}" opacity=".5"/>
      <path d="M-5 -6 V-15 Q0 -20 5 -15 V-6Z" fill="#2b2620"/><rect x="-4" y="-13" width="8" height="2.4" fill="#c9443a"/>
      <path d="M-17 -23 Q-10 -25 0 -31 Q10 -25 17 -23 Q19 -26 20 -28 Q12 -26 0 -35 Q-12 -26 -20 -28 Q-19 -26 -17 -23Z" fill="${night ? "#6a3a34" : "#9c4a3a"}"/>
      ${night ? `<circle cx="0" cy="-11" r="9" fill="#ffd27a" opacity=".22"/><circle cx="0" cy="-11" r="2" fill="#ffcf6a"/>` : ""}</g>`;
  }
  function lighthouse(x, y, s, night) {
    return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-6 0 L-4 -34 H4 L6 0Z" fill="#f4f1ea"/><path d="M0 0 V-34 H4 L6 0Z" fill="#d8d2c6"/><rect x="-5" y="-24" width="10" height="5" fill="#c9443a"/><rect x="-5" y="-12" width="10" height="5" fill="#c9443a"/>
      <rect x="-5" y="-40" width="10" height="6" fill="${night ? "#ffe08a" : "#9fc7d9"}"/><path d="M-7 -40 H7 L0 -47Z" fill="#c9443a"/>
      ${night ? `<path d="M0 -37 L-70 -52 L-70 -24Z" fill="#ffe8a8" opacity=".18"/>` : ""}</g>`;
  }
  function stars(r, n) { let s = ""; for (let k = 0; k < n; k++) s += `<circle cx="${(r() * W).toFixed(1)}" cy="${(r() * 80).toFixed(1)}" r="${(r() * .9 + .4).toFixed(2)}" fill="#fff" opacity="${(r() * .6 + .4).toFixed(2)}"/>`; return s; }
  // 前景框景：角落的暗色葉叢（最暗、最大）
  function frame(c, r, side) {
    const A = K(), dk = A.shade(c.P.near, .35); let s = "";
    if (side !== "right") s += A.grass(6, H, 1.9, dk, r) + A.grass(26, H + 2, 1.4, dk, r);
    if (side !== "left") s += A.grass(W - 8, H, 1.8, dk, r) + A.grass(W - 30, H + 2, 1.3, dk, r);
    return s;
  }
  // 樹葉顏色：季節＋時段（晚上壓暗）
  function leaf(c, k) {
    const A = K(), S = c.S;
    let col = S.leaf;
    if (c.season === "autumn" && k % 3 === 1) col = S.accent[k % S.accent.length];
    if (c.season === "spring" && k % 4 === 2) col = "#f2b8c8";
    return c.tod === "night" ? A.mix(col, c.P.near, .72) : c.tod === "dusk" ? A.mix(col, c.P.mid, .45) : c.tod === "dawn" ? A.mix(col, c.P.mid, .25) : col;
  }
  function trees(c, r, xs, y, s) { const A = K(); return xs.map((x, k) => A.broadleaf(x + A.R(r, -6, 6), y + A.R(r, -2, 2), s * A.R(r, .8, 1.15), leaf(c, k), r)).join(""); }

  // ── 天空：漸層＋太陽/月亮＋雲（夏天的積雲大一點）＋夜晚星星 ──
  function sky(c, r) {
    const A = K(), P = c.P, id = A.uid("sk");
    let s = `<defs>${A.skyGrad(id, P.sky[0], P.sky[1])}</defs><rect width="${W}" height="${H}" fill="url(#${id})"/>`;
    if (c.tod === "night") s += stars(r, 26) + `<circle cx="258" cy="34" r="12" fill="${P.sun}"/><circle cx="264" cy="30" r="10.5" fill="${P.sky[0]}"/>`;
    else {
      const sx = c.tod === "dawn" ? 64 : c.tod === "dusk" ? 254 : 262, sy = c.tod === "day" ? 34 : 92;
      s += `<circle cx="${sx}" cy="${sy}" r="${c.tod === "day" ? 34 : 44}" fill="${P.sun}" opacity=".28"/><circle cx="${sx}" cy="${sy}" r="${c.tod === "day" ? 15 : 19}" fill="${P.sun}"/>`;
    }
    const cc = c.tod === "night" ? A.mix(P.far, "#ffffff", .15) : A.mix(P.sky[1], "#ffffff", .55);
    const n = c.season === "summer" ? 3 : 2;
    for (let k = 0; k < n; k++) s += A.cloud(A.R(r, 30, 290), A.R(r, 26, 62), A.R(r, .7, c.season === "summer" ? 1.5 : 1.05), cc, { op: c.tod === "night" ? .5 : .95 });
    return s;
  }
  const farR = (c, r, base, amp) => K().mountain(K().ridgePts(r, -10, W + 10, base, amp, 6), H, K().mix(c.P.far, c.P.sky[1], .2), { fade: c.P.mist, lit: .2 });
  const midR = (c, r, base, amp, col) => K().mountain(K().ridgePts(r, -10, W + 10, base, amp, 5), H, col || K().mix(c.P.mid, c.S.leaf, .25), { fade: K().mix(c.P.mid, c.P.mist, .3) });

  // ── 瀑布：岩壁（受光面/背光面）→ 水緣 → 落水（上深下白＋長短不一的亮線）→ 水潭泡沫＋漣漪 → 水霧 ──
  function fall(c, r, x0, x1, top, bottom, x2, x3) {
    const A = K(), P = c.P, id = A.uid("wf"), deep = A.mix(P.water[0], "#ffffff", .25), white = c.tod === "night" ? "#b9c9e0" : "#f7fbfd";   // 夜裡是月光下的水，不是純白
    x2 = x2 == null ? x0 - 4 : x2; x3 = x3 == null ? x1 + 4 : x3;
    let s = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${deep}"/><stop offset=".55" stop-color="${A.mix(deep, white, .6)}"/><stop offset="1" stop-color="${white}"/></linearGradient></defs>`;
    s += `<path d="M${x0} ${top} C${x0 - 1} ${top + (bottom - top) * .4} ${x2} ${top + (bottom - top) * .7} ${x2} ${bottom} L${x3} ${bottom} C${x3} ${top + (bottom - top) * .7} ${x1 + 1} ${top + (bottom - top) * .4} ${x1} ${top}Z" fill="url(#${id})"/>`;
    const n = Math.max(5, Math.round((x1 - x0) / 5));
    for (let k = 0; k < n; k++) {
      const t = (k + .5) / n, xa = x0 + (x1 - x0) * t, xb = x2 + (x3 - x2) * t, y0 = top + A.R(r, 2, (bottom - top) * .25), y1 = bottom - A.R(r, 0, (bottom - top) * .25);
      s += A.taper(xa, y0, xb, y1, A.R(r, 1.2, 3.4), white, A.R(r, -1, 1)).replace("/>", ` opacity="${A.R(r, .55, .95).toFixed(2)}"/>`);
    }
    s += `<path d="M${x0 - 2} ${top} Q${(x0 + x1) / 2} ${top - 5} ${x1 + 2} ${top}" stroke="${A.shade(P.water[0], .1)}" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M${x0 + 2} ${top + 2} Q${(x0 + x1) / 2} ${top - 2} ${x1 - 2} ${top + 2}" stroke="${white}" stroke-width="1.2" fill="none" opacity=".9"/>`;
    // 水潭的泡沫＋水霧
    const cx = (x2 + x3) / 2, hw = (x3 - x2) / 2 + 10;
    for (let k = 0; k < 9; k++) s += `<ellipse cx="${(cx + A.R(r, -hw, hw)).toFixed(1)}" cy="${(bottom + A.R(r, -2, 5)).toFixed(1)}" rx="${A.R(r, 5, 14).toFixed(1)}" ry="${A.R(r, 2, 4).toFixed(1)}" fill="${white}" opacity="${A.R(r, .5, .95).toFixed(2)}"/>`;
    for (let k = 0; k < 3; k++) s += `<circle cx="${(cx + A.R(r, -hw * .8, hw * .8)).toFixed(1)}" cy="${(bottom - A.R(r, 4, 12)).toFixed(1)}" r="${A.R(r, 9, 16).toFixed(1)}" fill="${white}" opacity=".32"/>`;
    return s;
  }
  function pool(c, r, y, x0, x1) {
    const A = K(), P = c.P, id = A.uid("pl");
    let s = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${A.mix(P.water[0], P.water[1], .3)}"/><stop offset="1" stop-color="${P.water[0]}"/></linearGradient></defs>`;
    s += `<path d="M${x0} ${y} Q${(x0 + x1) / 2} ${y - 6} ${x1} ${y} L${x1} ${H} L${x0} ${H}Z" fill="url(#${id})"/><path d="M${x0} ${y} Q${(x0 + x1) / 2} ${y - 6} ${x1} ${y}" stroke="#fff" stroke-width="1.4" fill="none" opacity=".75"/>`;
    for (let k = 0; k < 7; k++) { const yy = y + 6 + k * k * 1.6; s += `<path d="M${(A.R(r, x0, x1 - 30)).toFixed(1)} ${yy.toFixed(1)} h${A.R(r, 8, 24 + k * 3).toFixed(1)}" stroke="#fff" stroke-width="${(1 + k * .15).toFixed(2)}" opacity="${(.5 - k * .04).toFixed(2)}" stroke-linecap="round"/>`; }
    return s;
  }
  function cliff(c, r, x0, x1, top, bottom) {
    const A = K(), base = c.tod === "night" ? "#3c4450" : A.mix("#8a8476", c.P.mid, .2);
    const pts = [[x0, bottom], [x0 + 4, top + 30], [x0 + 18, top + 6], [x0 + (x1 - x0) * .4, top], [x0 + (x1 - x0) * .7, top + 4], [x1 - 14, top + 14], [x1 - 2, top + 40], [x1, bottom]];
    const d = A.smooth(pts) + "Z", id = A.uid("cl");
    return `<defs><clipPath id="${id}"><path d="${d}"/></clipPath></defs><path d="${d}" fill="${A.shade(base, .25)}"/><g clip-path="url(#${id})"><path d="${d}" fill="${A.tint(base, .18)}" transform="translate(-${(x1 - x0) * .35} -2)"/>` +
      Array.from({ length: 6 }, () => `<ellipse cx="${A.R(r, x0, x1).toFixed(1)}" cy="${A.R(r, top + 10, bottom).toFixed(1)}" rx="${A.R(r, 6, 14).toFixed(1)}" ry="${A.R(r, 3, 6).toFixed(1)}" fill="${leaf(c, 0)}" opacity=".55"/>`).join("") + `</g>`;
  }
  const FALL = [
    (c, r) => farR(c, r, 92, 30) + K().mist(96, 10, c.P.mist, .5, W) + trees(c, r, [40, 70, 270, 300], 128, .9) + cliff(c, r, 96, 236, 34, 172) + trees(c, r, [118, 150, 210], 44, .55) +
      fall(c, r, 150, 186, 46, 166, 140, 196) + fern(c.tod === "night" ? 118 : 116, 120, .8, K().shade(leaf(c, 0), .1)) + fern(222, 110, .7, leaf(c, 0), true) +
      pool(c, r, 168, -10, W + 10) + rock(76, 186, 1, "#8a8476", r) + rock(252, 190, .8, "#8a8476", r),
    (c, r) => farR(c, r, 86, 26) + midR(c, r, 120, 26) + cliff(c, r, 104, 230, 26, 120) + fall(c, r, 156, 180, 34, 104, 152, 184) +
      cliff(c, r, 72, 260, 108, 176) + fall(c, r, 138, 196, 112, 168, 128, 206) + trees(c, r, [36, 286], 140, 1) +
      pool(c, r, 170, -10, W + 10) + fern(84, 150, .8, leaf(c, 1)) + rock(232, 190, .9, "#8a8476", r),
    (c, r) => farR(c, r, 80, 28) + midR(c, r, 112, 30) + cliff(c, r, 196, 270, 50, 130) + fall(c, r, 222, 236, 56, 122, 220, 240) + trees(c, r, [40, 80, 120, 160, 300], 132, .75) +
      `<path d="M228 126 C200 150 150 160 110 200 L210 200 C220 170 238 150 238 126Z" fill="${c.P.water[1]}"/><path d="M226 140 C206 160 170 172 150 196" stroke="#fff" stroke-width="1.6" fill="none" opacity=".7"/>` +
      rock(150, 182, .7, "#8a8476", r) + rock(196, 168, .55, "#8a8476", r) + K().grass(100, 176, 1.2, leaf(c, 2), r),
  ];

  // ── 古道：有透視的石階（踏面亮、立面暗、遠小近大、接縫長苔），土地公廟，芒草，雙扇蕨 ──
  function steps(c, r, path, wNear, wFar, n) {
    const A = K(), stone = c.tod === "night" ? "#6a6e70" : "#b8ad94", riser = A.shade(stone, .35), moss = A.mix(leaf(c, 0), stone, .3);
    const pt = t => { const k = Math.min(path.length - 2, Math.floor(t * (path.length - 1))), u = t * (path.length - 1) - k; return [path[k][0] + (path[k + 1][0] - path[k][0]) * u, path[k][1] + (path[k + 1][1] - path[k][1]) * u]; };
    const S = []; for (let k = 0; k <= n; k++) { const t = k / n, p = pt(t), w = wNear + (wFar - wNear) * Math.pow(t, .8); S.push([p[0], p[1], w]); }
    let s = `<path d="${A.smooth(S.map(([x, y, w]) => [x - w - 4, y]))} L${S[n][0] + S[n][2] + 4} ${S[n][1]} ${A.smooth(S.map(([x, y, w]) => [x + w + 4, y]).reverse()).replace(/^M/, "L")}Z" fill="${A.shade(A.mix("#8a7a5a", c.P.ground, .4), .1)}"/>`;
    for (let k = n - 1; k >= 0; k--) {
      const [x, y, w] = S[k], [x2, y2, w2] = S[k + 1], rise = Math.max(1.5, (y - y2) * .42), tone = A.mix(stone, k % 2 ? "#d8cdb0" : "#9a917c", A.R(r, .1, .35));
      s += `<path d="M${(x - w).toFixed(1)} ${(y - rise).toFixed(1)} L${(x2 - w2).toFixed(1)} ${y2.toFixed(1)} L${(x2 + w2).toFixed(1)} ${y2.toFixed(1)} L${(x + w).toFixed(1)} ${(y - rise).toFixed(1)}Z" fill="${c.tod === "night" ? A.mix(tone, "#2a3340", .5) : tone}"/>`;
      s += `<path d="M${(x - w).toFixed(1)} ${y.toFixed(1)} L${(x - w).toFixed(1)} ${(y - rise).toFixed(1)} L${(x + w).toFixed(1)} ${(y - rise).toFixed(1)} L${(x + w).toFixed(1)} ${y.toFixed(1)}Z" fill="${riser}"/>`;
      if (r() < .5) s += `<ellipse cx="${(x + A.R(r, -w, w) * .8).toFixed(1)}" cy="${(y - rise).toFixed(1)}" rx="${(w * .18).toFixed(1)}" ry="${Math.max(1, rise * .35).toFixed(1)}" fill="${moss}" opacity=".85"/>`;
    }
    return s;
  }
  const OLD = [
    (c, r) => farR(c, r, 84, 26) + midR(c, r, 112, 22) + trees(c, r, [40, 80, 250, 290, 140], 118, .9) +
      steps(c, r, [[150, 202], [118, 172], [150, 146], [186, 126], [168, 108]], 34, 5, 13) + shrine(222, 148, 1.15, c.tod === "night") +
      K().silvergrass(278, 196, 1.3, r) + K().silvergrass(300, 200, 1.1, r) + fern(30, 178, 1, leaf(c, 1)) + frame(c, r, "left"),
    (c, r) => farR(c, r, 90, 20) + `<rect x="0" y="0" width="${W}" height="${H}" fill="${K().mix(c.P.mist, c.P.sky[1], .3)}" opacity=".35"/>` +
      steps(c, r, [[160, 204], [158, 160], [162, 128], [160, 104]], 40, 6, 12) +
      K().cedar(56, 196, 190, leaf(c, 0)) + K().cedar(266, 198, 200, leaf(c, 3)) + K().cedar(100, 150, 96, K().mix(leaf(c, 0), c.P.far, .4)) + K().cedar(218, 150, 96, K().mix(leaf(c, 0), c.P.far, .4)) +
      shrine(206, 162, .8, c.tod === "night") + fern(110, 190, 1, leaf(c, 2)) + fern(214, 196, .9, leaf(c, 1), true),
    (c, r) => { const A = K(), wall = c.tod === "night" ? "#4f5258" : "#9a9180"; let s = farR(c, r, 78, 26) + A.mist(92, 12, c.P.mist, .6, W) +
      A.mountain([[-10, 124], [80, 108], [170, 118], [260, 100], [330, 112]], H, A.mix(leaf(c, 0), c.P.mid, .3), { fade: c.P.ground }) +
      steps(c, r, [[110, 206], [130, 178], [172, 152], [222, 132], [262, 116]], 34, 5, 14);
      // 石砌駁坎：一顆顆石頭，不是虛線
      for (let k = 0; k < 9; k++) { const x = -4 + k * 13, y = 182 - k * 2; s += `<path d="M${x} ${y} q6 -6 12 0 v7 h-12Z" fill="${A.mix(wall, k % 2 ? "#ffffff" : "#000000", .12)}"/>`; }
      return s + [24, 60, 196, 252, 292, 312].map((x, k) => A.silvergrass(x, 202 - k % 2 * 10, 1.1 + k % 3 * .25, r)).join(""); },
  ];

  // ── 水：深淺漸層＋岸邊白線＋倒影（往下翻、較暗、被橫向空隙切開）＋遠密近疏的波光 ──
  function lake(c, r, y, ridgeD, ridgeCol) {
    const A = K(), P = c.P, id = A.uid("lk"), cp = A.uid("lc");
    let s = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${A.mix(P.water[1], P.sky[1], .35)}"/><stop offset="1" stop-color="${P.water[0]}"/></linearGradient><clipPath id="${cp}"><rect x="0" y="${y}" width="${W}" height="${H - y}"/></clipPath></defs>`;
    s += `<rect x="0" y="${y}" width="${W}" height="${H - y}" fill="url(#${id})"/>`;
    if (ridgeD) s += `<g clip-path="url(#${cp})" opacity=".45"><path d="${ridgeD}" fill="${A.mix(ridgeCol, P.water[0], .45)}" transform="translate(0 ${2 * y}) scale(1 -1)"/></g>`;
    for (let k = 0; k < 6; k++) s += `<rect x="0" y="${(y + 6 + k * k * 2.4).toFixed(1)}" width="${W}" height="${(1 + k * .4).toFixed(1)}" fill="${A.mix(P.water[1], P.sky[1], .4)}" opacity=".45"/>`;
    for (let k = 0; k < 11; k++) { const t = k / 11, yy = y + 3 + Math.pow(t, 1.6) * (H - y - 6); s += `<path d="M${A.R(r, 0, W - 40).toFixed(1)} ${yy.toFixed(1)} h${(6 + t * 30 + A.R(r, 0, 10)).toFixed(1)}" stroke="#fff" stroke-width="${(.8 + t * 1.4).toFixed(2)}" opacity="${(.7 - t * .35).toFixed(2)}" stroke-linecap="round"/>`; }
    s += `<path d="M0 ${y} H${W}" stroke="#fff" stroke-width="1.2" opacity=".7"/>`;
    return s;
  }
  function ridgeD(c, r, base, amp) { const A = K(), pts = A.ridgePts(r, -10, W + 10, base, amp, 6); return { d: A.smooth(pts) + ` L${W + 10} ${base + 4} L-10 ${base + 4}Z`, pts }; }
  const LAKE = [
    (c, r) => { const A = K(), col = A.mix(c.P.far, c.P.sky[1], .15), R1 = ridgeD(c, r, 112, 46); return A.mountain(R1.pts, 120, col, { fade: c.P.mist }) + trees(c, r, [30, 64, 280], 118, .7) + lake(c, r, 116, R1.d, col) + rock(60, 194, .8, "#8a8476", r) + A.grass(286, 198, 1.4, leaf(c, 2), r) + frame(c, r); },
    (c, r) => { const A = K(), col = A.mix(c.P.mid, c.P.far, .4), R1 = ridgeD(c, r, 104, 34); return A.mountain(R1.pts, 110, col, { fade: c.P.mist }) + lake(c, r, 108, R1.d, col) +
      `<path d="M190 150 H300 V156 H190Z" fill="#7a5a3a"/><path d="M200 156 V176 M232 156 V180 M264 156 V176 M292 156 V172" stroke="#5e4430" stroke-width="3"/>` +
      `<g transform="translate(270 150)"><path d="M-18 0 H18 V-4 H-18Z" fill="#8a6a46"/><path d="M-14 -4 V-22 M14 -4 V-22" stroke="#7a5a3a" stroke-width="2.4"/><path d="M-24 -20 Q0 -36 24 -20 Q16 -22 0 -30 Q-16 -22 -24 -20Z" fill="#9c4a3a"/></g>` +
      trees(c, r, [26, 60, 96], 112, .8) + A.grass(40, 198, 1.6, leaf(c, 1), r); },
    (c, r) => { const A = K(), col = A.mix(c.P.far, c.P.mist, .35), R1 = ridgeD(c, r, 118, 30); return A.mountain(R1.pts, 124, col, { fade: c.P.mist }) + lake(c, r, 122, R1.d, col) + A.mist(110, 14, c.P.mist, .7, W) + A.mist(134, 8, c.P.mist, .45, W) +
      `<path d="M150 150 Q172 156 196 150 L190 156 Q172 160 156 156Z" fill="${A.shade(c.P.near, .2)}"/><path d="M172 150 V134 L184 146Z" fill="${A.mix("#f4efe2", c.P.sky[1], .3)}"/>` +
      [12, 30, 290, 306].map(x => `<path d="M${x} 200 Q${x + 2} 170 ${x - 4} 150 M${x + 6} 200 Q${x + 6} 176 ${x + 10} 158" stroke="${A.shade(c.P.near, .2)}" stroke-width="2" fill="none"/>`).join(""); },
  ];
  // 海：遠方水平線較亮、浪頭捲起來＋白沫、濕沙帶；龜山島剪影、燈塔
  function sea(c, r, y) {
    const A = K(), P = c.P, id = A.uid("se");
    let s = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${A.mix(P.water[1], P.sky[1], .4)}"/><stop offset=".35" stop-color="${P.water[0]}"/><stop offset="1" stop-color="${A.shade(P.water[0], .15)}"/></linearGradient></defs><rect x="0" y="${y}" width="${W}" height="${H - y}" fill="url(#${id})"/>`;
    for (let k = 0; k < 10; k++) { const t = k / 10, yy = y + 3 + Math.pow(t, 1.5) * (H - y - 10); s += `<path d="M${A.R(r, 0, W - 40).toFixed(1)} ${yy.toFixed(1)} q${(8 + t * 14).toFixed(1)} -${(1 + t * 2).toFixed(1)} ${(16 + t * 28).toFixed(1)} 0" stroke="#fff" stroke-width="${(.8 + t * 1.2).toFixed(2)}" fill="none" opacity="${(.65 - t * .3).toFixed(2)}" stroke-linecap="round"/>`; }
    return s;
  }
  function turtleIsland(x, y, s, col) { return `<path d="M${x - 40 * s} ${y} Q${x - 30 * s} ${y - 16 * s} ${x - 6 * s} ${y - 18 * s} Q${x + 14 * s} ${y - 20 * s} ${x + 26 * s} ${y - 8 * s} Q${x + 32 * s} ${y - 12 * s} ${x + 38 * s} ${y - 9 * s} Q${x + 42 * s} ${y - 4 * s} ${x + 46 * s} ${y}Z" fill="${col}"/>`; }
  const SEA = [
    (c, r) => { const A = K(); return sea(c, r, 104) + turtleIsland(110, 104, 1, A.mix(c.P.far, c.P.sky[1], .25)) +
      A.mountain([[150, 200], [170, 120], [210, 92], [260, 88], [300, 96], [330, 110]], H, A.mix("#7c8a64", c.P.mid, .35), { fade: A.shade(c.P.near, .1) }) +
      lighthouse(262, 92, 1.1, c.tod === "night") + `<path d="M150 200 Q160 176 176 168" stroke="#fff" stroke-width="3" fill="none" opacity=".8"/>` + A.grass(300, 200, 1.4, leaf(c, 1), r); },
    (c, r) => { const A = K(), sand = c.tod === "night" ? "#4a4a46" : "#e6d6ae"; return sea(c, r, 96) + `<path d="M0 150 Q80 140 160 150 T320 146 L320 200 L0 200Z" fill="${sand}"/><path d="M0 150 Q80 140 160 150 T320 146 L320 156 Q240 158 160 160 T0 160Z" fill="${A.shade(sand, .18)}"/>` +
      `<path d="M0 148 Q40 138 80 146 Q120 152 160 146 Q200 140 240 146 Q280 152 320 144" stroke="#fff" stroke-width="4" fill="none" opacity=".9" stroke-linecap="round"/>` +
      [[50, 132], [150, 126], [240, 134]].map(([x, y]) => `<path d="M${x} ${y} q12 -10 26 -2 q-8 -2 -12 4 q-8 -4 -14 -2Z" fill="#fff" opacity=".85"/>`).join("") +
      rock(270, 168, 1.2, "#6d6a62", r) + rock(52, 176, .8, "#6d6a62", r) + A.grass(296, 198, 1.2, leaf(c, 1), r); },
    (c, r) => { const A = K(); return sea(c, r, 92) + turtleIsland(240, 92, .8, A.mix(c.P.far, c.P.sky[1], .25)) +
      A.mountain([[-10, 120], [60, 110], [140, 128], [200, 160], [240, 200]], H, A.mix(leaf(c, 0), "#9ab86a", .3), { fade: A.shade(c.P.near, .05) }) +
      `<path d="M20 200 Q60 160 100 140 Q130 128 160 132" stroke="${c.tod === "night" ? "#4f4a40" : "#c9b48a"}" stroke-width="5" fill="none" stroke-linecap="round"/>` +
      [30, 80, 120].map((x, k) => A.silvergrass(x, 196 - k * 6, 1, r)).join(""); },
  ];

  // ── 森林／高山／郊山 ──
  const FOREST = [
    (c, r) => { const A = K(); let s = farR(c, r, 90, 26) + A.mist(100, 12, c.P.mist, .5, W); [30, 70, 110, 150, 190, 230, 270, 310].forEach((x, k) => { s += A.cedar(x + A.R(r, -6, 6), 168 - k % 2 * 10, A.R(r, 100, 140), A.mix(leaf(c, k), c.P.far, .3)); });
      s += `<g opacity="${c.tod === "night" ? .08 : .2}">${[0, 1, 2].map(k => `<path d="M${120 + k * 40} 0 L${150 + k * 40} 0 L${80 + k * 60} 200 L${40 + k * 60} 200Z" fill="#fff8d8"/>`).join("")}</g>`;
      [10, 300].forEach((x, k) => { s += A.cedar(x, 204, 210, leaf(c, k + 3)); }); return s + `<path d="M140 200 Q160 170 170 150" stroke="${c.tod === "night" ? "#3a3a32" : "#b8a37a"}" stroke-width="10" fill="none" stroke-linecap="round"/>` + fern(118, 192, 1, leaf(c, 1)) + fern(206, 196, .9, leaf(c, 2), true); },
    (c, r) => { const A = K(), dirt = c.tod === "night" ? "#3a3a32" : "#c4ae84"; let s = farR(c, r, 100, 22) + trees(c, r, [30, 70, 110, 150, 190, 230, 270, 310], 142, 1) +
      `<path d="M96 206 C130 176 150 160 160 142 C168 160 186 178 226 206Z" fill="${dirt}"/><path d="M160 142 C168 160 186 178 226 206 L200 206 C176 178 166 162 160 142Z" fill="${A.shade(dirt, .15)}"/>`;
      s += trees(c, r, [-10, 330], 214, 2.3);
      for (let k = 0; k < 9; k++) s += `<circle cx="${(k * 40 + A.R(r, -8, 8)).toFixed(1)}" cy="${A.R(r, -6, 8).toFixed(1)}" r="${A.R(r, 26, 38).toFixed(1)}" fill="${A.shade(leaf(c, k), .35)}"/>`;
      return s + A.grass(112, 200, 1.5, leaf(c, 3), r) + A.grass(214, 200, 1.4, leaf(c, 2), r); },
    (c, r) => { const A = K(), bark = c.tod === "night" ? "#3a3028" : "#7a5a3e"; return farR(c, r, 88, 24) + trees(c, r, [200, 240, 280, 320], 150, .9) +
      `<path d="M8 204 C30 196 44 186 50 160 C54 120 48 80 58 30 L100 30 C110 80 104 120 108 160 C114 186 128 196 152 204Z" fill="${bark}"/><path d="M78 204 C84 170 86 120 84 30 L100 30 C110 80 104 120 108 160 C114 186 128 196 152 204Z" fill="${A.shade(bark, .3)}"/>` +
      [70, 84, 62].map((x, k) => `<path d="M${x} 196 C${x - 4} 150 ${x + 4} 100 ${x - 2} 40" stroke="${A.shade(bark, .45)}" stroke-width="${1.6 + k * .4}" fill="none" opacity=".8"/>`).join("") +
      Array.from({ length: 10 }, () => `<ellipse cx="${A.R(r, 52, 104).toFixed(1)}" cy="${A.R(r, 50, 196).toFixed(1)}" rx="${A.R(r, 4, 9).toFixed(1)}" ry="3" fill="${leaf(c, 0)}" opacity=".75"/>`).join("") +
      A.broadleaf(64, 40, 2.6, leaf(c, 0), r) + A.broadleaf(110, 34, 2.1, leaf(c, 1), r) + `<path d="M150 200 Q190 170 220 160" stroke="${c.tod === "night" ? "#3a3a32" : "#b8a37a"}" stroke-width="7" fill="none"/>` + fern(140, 196, 1, leaf(c, 2), true); },
  ];
  function snowPeak(c, r, pts, col) {
    const A = K(), id = A.uid("sp"), d = A.smooth(pts) + ` L${pts[pts.length - 1][0]} ${H} L${pts[0][0]} ${H}Z`;
    const top = Math.min(...pts.map(p => p[1]));
    let s = A.mountain(pts, H, col, { fade: c.P.mist, lit: .3 }) + `<defs><clipPath id="${id}"><path d="${d}"/></clipPath></defs><g clip-path="url(#${id})">`;
    for (let k = 0; k < 7; k++) { const x = A.R(r, 40, 280), y = top + A.R(r, 0, 26); s += `<path d="M${x.toFixed(1)} ${y.toFixed(1)} l${A.R(r, -14, -6).toFixed(1)} ${A.R(r, 12, 22).toFixed(1)} l${A.R(r, 4, 9).toFixed(1)} -4 l${A.R(r, 3, 8).toFixed(1)} 8 l${A.R(r, 4, 10).toFixed(1)} -16Z" fill="#f4f7fb" opacity=".92"/>`; }
    return s + `</g>`;
  }
  const PEAK = [
    (c, r) => { const A = K(); return farR(c, r, 110, 30) + snowPeak(c, r, [[-10, 170], [60, 120], [130, 50], [170, 72], [220, 40], [290, 110], [330, 140]], A.mix("#7d8aa0", c.P.far, .3)) + A.mist(150, 12, c.P.mist, .6, W) +
      A.mountain([[-10, 176], [90, 166], [200, 180], [330, 168]], H, A.mix(leaf(c, 0), c.P.mid, .5), { fade: c.P.ground }) + A.grass(40, 200, 1.4, leaf(c, 1), r) + A.grass(280, 200, 1.3, leaf(c, 2), r); },
    (c, r) => { const A = K(), cc = c.tod === "night" ? "#7c8ca8" : A.mix("#ffffff", c.P.sky[1], .2); let s = farR(c, r, 92, 34);
      s += `<rect x="0" y="112" width="${W}" height="88" fill="${cc}"/>`; for (let k = 0; k < 9; k++) s += A.cloud(A.R(r, 0, W), A.R(r, 110, 140), A.R(r, 1.1, 1.8), cc);
      s += A.mountain([[-10, 200], [40, 160], [110, 150], [160, 170], [200, 200]], H, A.mix("#6f7d6a", c.P.mid, .4), { fade: A.shade(c.P.near, .1) });
      return s + `<g transform="translate(96 152)"><rect x="-7" y="-10" width="14" height="10" fill="#c8c2b4"/><rect x="0" y="-10" width="7" height="10" fill="#a8a294"/><path d="M-4 -6 H4 M0 -9 V-2" stroke="#7a2a24" stroke-width="1.6"/></g>` + A.grass(30, 196, 1.2, leaf(c, 3), r); },
    (c, r) => { const A = K(), juniper = c.tod === "night" ? "#2e3a34" : "#4e6b4a", trunk = c.tod === "night" ? "#5a5a5a" : "#c9c1b0"; return farR(c, r, 100, 40) + farR(c, r, 120, 26) +
      A.mountain([[-10, 200], [70, 150], [150, 140], [230, 158], [330, 150]], H, A.mix("#8a8476", c.P.mid, .3), { fade: A.shade(c.P.near, .1) }) +
      `<path d="M210 168 C214 150 200 140 210 124 C222 108 240 112 250 100" stroke="${trunk}" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M226 118 C236 106 254 108 266 96" stroke="${trunk}" stroke-width="3.4" fill="none" stroke-linecap="round"/>` +
      [[248, 96, 14], [266, 92, 10], [232, 112, 10]].map(([x, y, rr]) => `<ellipse cx="${x}" cy="${y}" rx="${rr * 1.5}" ry="${rr * .6}" fill="${juniper}"/>`).join("") + rock(90, 176, 1, "#8a8476", r) + A.grass(40, 200, 1.2, leaf(c, 1), r); },
  ];
  const HILL = [
    (c, r) => { const A = K(); return farR(c, r, 96, 22) + A.mountain([[-10, 140], [80, 112], [170, 132], [260, 108], [330, 124]], H, A.mix(leaf(c, 0), c.P.mid, .35), { fade: c.P.ground }) +
      trees(c, r, [30, 70, 240, 290], 140, .8) + `<g transform="translate(176 124)"><rect x="-20" y="-4" width="40" height="4" fill="#8a6a46"/><path d="M-15 -4 V-22 M15 -4 V-22" stroke="#7a5a3a" stroke-width="2.6"/><path d="M-26 -20 Q0 -38 26 -20 Q16 -23 0 -31 Q-16 -23 -26 -20Z" fill="#9c4a3a"/></g>` +
      A.mountain([[-10, 176], [100, 160], [200, 172], [330, 158]], H, A.mix(leaf(c, 1), c.P.near, .3), { fade: A.shade(c.P.near, .05) }) + `<path d="M120 200 Q150 180 176 128" stroke="${c.tod === "night" ? "#3a3a32" : "#c9b48a"}" stroke-width="4" fill="none" stroke-dasharray="1 0"/>` + frame(c, r); },
    (c, r) => { const A = K(); let s = farR(c, r, 90, 24) + A.mountain([[-10, 120], [120, 100], [240, 112], [330, 104]], H, A.mix(leaf(c, 0), c.P.mid, .3), { fade: c.P.ground });
      for (let k = 0; k < 9; k++) { const y = 118 + k * 9; s += `<path d="M-10 ${y} Q100 ${y - 10 + k} 200 ${y - 4} T330 ${y - 6}" stroke="${A.shade(leaf(c, 0), .18 + k * .02)}" stroke-width="${3 + k * .5}" fill="none" stroke-linecap="round"/>`; }
      return s + trees(c, r, [290, 310], 160, .9) + A.grass(30, 200, 1.3, leaf(c, 2), r); },
    (c, r) => { const A = K(), night = c.tod === "night"; let s = farR(c, r, 110, 20); const city = night ? "#26334a" : A.mix(c.P.far, c.P.sky[1], .3);
      for (let k = 0; k < 22; k++) { const x = 40 + k * 11, h = A.R(r, 8, 26) + (k === 10 ? 34 : 0); s += `<rect x="${x}" y="${(124 - h).toFixed(1)}" width="9" height="${h.toFixed(1)}" fill="${city}"/>`; if (night) for (let j = 0; j < 3; j++) if (r() < .5) s += `<rect x="${x + 2 + (j % 2) * 3}" y="${(126 - h + 4 + j * 6).toFixed(1)}" width="1.6" height="1.6" fill="#ffd98a"/>`; }
      s += A.mist(118, 8, c.P.mist, .55, W) + A.mountain([[-10, 200], [60, 150], [160, 140], [260, 156], [330, 170]], H, A.mix(leaf(c, 0), c.P.near, .4), { fade: A.shade(c.P.near, .1) });
      return s + `<path d="M160 140 h10" stroke="#7a5a3a" stroke-width="2"/>` + trees(c, r, [40, 290], 160, .9) + A.grass(140, 200, 1.4, leaf(c, 1), r); },
  ];
  const THEMES = { fall: FALL, old: OLD, lake: LAKE, sea: SEA, forest: FOREST, peak: PEAK, hill: HILL };

  // 主程式：trail（要 id/theme）、first＝第一次走的時間
  function draw(trailId, theme, first, opt) {
    const A = K(); opt = opt || {};
    const tod = opt.tod || A.todOf(first), season = opt.season || A.seasonOf(first);
    const c = { P: A.PAL[tod], S: A.SEASON[season], tod, season };
    const r = A.rng(String(trailId) + "|pc"), set = THEMES[theme] || HILL;
    const v = opt.variant != null ? opt.variant : Math.floor(r() * set.length);
    let body = sky(c, r) + set[v % set.length](c, r);
    if (season === "spring" && theme !== "peak") for (let k = 0; k < 8; k++) body += `<ellipse cx="${A.R(r, 10, 310).toFixed(1)}" cy="${A.R(r, 20, 180).toFixed(1)}" rx="2.6" ry="1.6" fill="#f6b8c8" transform="rotate(${A.R(r, 0, 180).toFixed(0)})" transform-origin="center" opacity=".9"/>`;
    if (season === "autumn") for (let k = 0; k < 6; k++) body += `<path d="M${A.R(r, 10, 310).toFixed(1)} ${A.R(r, 20, 170).toFixed(1)} l3 -4 l3 4 l-3 3Z" fill="${c.S.accent[k % 3]}" opacity=".9"/>`;
    if (tod === "night") body += `<rect width="${W}" height="${H}" fill="#0b1630" opacity=".18"/>`;
    const vg = A.uid("vg");
    body += `<defs><radialGradient id="${vg}" cx="50%" cy="45%" r="75%"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#${vg})"/>` + A.grain(W, H, .045);
    return `<svg class="pj-art" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
  }
  return { draw, THEMES, variants: k => (THEMES[k] || HILL).length };
})();
