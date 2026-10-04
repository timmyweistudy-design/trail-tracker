// 山林夥伴 chibi 角色（純 SVG 資產、無邏輯）。7 進化階，viewBox 0 0 200 200。
// 動畫靠 CSS class（見 style.css）：.pc-bob 呼吸起伏 / .pc-eye 眨眼 / .pc-tail 擺動 /
// .pc-wing(.l/.r) 振翅 / .pc-hover 漂浮 / .pc-tw 閃爍 / .pc-sway(.l/.r) 龍鬚擺動。prefers-reduced-motion 會全關。
// 細節分三層：一般部件永遠畫；.pc-d 在 44px 以下藏；.pc-d2（鱗片、毛流、翅脈）預設藏，只在夥伴舞台與進化儀式顯示。
// 2026-10 美工輪：每個部件＝有色外框（該色加深，不用黑線）＋右下暗面（裁切）＋左上高光；眼睛有虹膜、兩個反光、眼皮線；
// .pc-eh 是開心瞇眼（摸頭／抱抱／吃東西時換上）；.pc-d 是細節（40px 以下的小圖藏起來，見 style-features.css）。
// 「§」是每份 SVG 自己的 id 前綴：同一頁會有很多份同樣的角色，id 重複的話裁切／漸層可能串到別份（尤其藏起來的那份）。
window.PET_ART = (function () {
  // ── 顏色與部件 ──
  const hx = c => [1, 3, 5].map(i => parseInt(c.substr(i, 2), 16));
  const mixc = (a, b, t) => "#" + hx(a).map((v, i) => Math.round(v + (hx(b)[i] - v) * t).toString(16).padStart(2, "0")).join("");
  const sh = (c, k) => mixc(c, "#2a1f3a", k);       // 暗面：往藍紫壓
  const tn = (c, k) => mixc(c, "#fff8e6", k);       // 亮面：往暖白提
  let K = 0;
  // el＝不含結尾的 SVG 元素開頭（例如 '<ellipse cx="100" cy="150" rx="46" ry="38"'）；o.hl＝[cx,cy,rx,ry] 高光位置
  function P(el, base, o) {
    o = o || {};
    const k = "k" + (K++), dx = o.dx == null ? 5 : o.dx, dy = o.dy == null ? 6 : o.dy;
    // 長的形狀（龍身、鬍鬚）只寫一次，其他三份用 <use> 引用：同一隻龍原本 46 KB，大半是同一條 path 重複四次
    let def = "";
    if (el.length > 56) { def = `<defs>${el} id="§${k}s"/></defs>`; el = `<use href="#§${k}s"`; }
    let s = def + `<clipPath id="§${k}">${el}/></clipPath>${el} fill="${sh(base, o.sk || .2)}"/><g clip-path="url(#§${k})">${el} fill="${base}" transform="translate(${-dx} ${-dy})"/>`;
    if (o.hl) s += `<ellipse cx="${o.hl[0]}" cy="${o.hl[1]}" rx="${o.hl[2]}" ry="${o.hl[3]}" fill="${tn(base, .55)}" opacity=".7" transform="rotate(-25 ${o.hl[0]} ${o.hl[1]})"/>`;
    s += `</g>`;
    if (o.sw !== 0) s += `${el} fill="none" stroke="${sh(base, .48)}" stroke-width="${o.sw || 3}" stroke-linejoin="round"/>`;
    return s;
  }
  const E = (cx, cy, rx, ry) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"`;
  const C = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}"`;
  const Pa = d => `<path d="${d}"`;
  // 眼睛：深色底＋下半低調虹膜＋一個中等反光（第二個很小很淡）；另附開心瞇眼（.pc-eh，預設藏）
  // 2026-10-04 使用者回饋「眼睛太亮、偏女性化，要中性」：反光縮小、拿掉眼皮線（看起來像睫毛）、虹膜壓暗
  function eye(cx, cy, rx, ry, iris) {
    return `<g class="pc-eye"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#24140a"/><ellipse cx="${cx}" cy="${cy + ry * .4}" rx="${rx * .62}" ry="${ry * .42}" fill="${mixc(iris, "#24140a", .35)}"/>` +
      `<circle cx="${cx + rx * .28}" cy="${cy - ry * .36}" r="${rx * .27}" fill="#fff" opacity=".92"/><circle class="pc-d" cx="${cx - rx * .3}" cy="${cy + ry * .4}" r="${rx * .1}" fill="#fff" opacity=".45"/></g>` +
      `<path class="pc-eh" d="M${cx - rx * 1.1} ${cy + ry * .15} Q${cx} ${cy - ry * .95} ${cx + rx * 1.1} ${cy + ry * .15}" stroke="#24140a" stroke-width="${Math.max(2.6, rx * .42)}" fill="none" stroke-linecap="round"/>`;
  }
  const blush = (cx, cy, rx, ry) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#e89a8a" opacity=".38"/>`;   // 淡一點、不加亮點（中性）
  // 兩端漸細的線（條紋、毛流、鬍鬚）
  function tp(x0, y0, x1, y1, w, col, bend) {
    const mx = (x0 + x1) / 2 + (bend || 0), my = (y0 + y1) / 2, dx = y1 - y0, dy = -(x1 - x0), L = Math.hypot(dx, dy) || 1, nx = dx / L * w / 2, ny = dy / L * w / 2, r = v => Math.round(v * 10) / 10;
    return `<path d="M${r(x0)} ${r(y0)} Q${r(mx + nx)} ${r(my + ny)} ${r(x1)} ${r(y1)} Q${r(mx - nx)} ${r(my - ny)} ${r(x0)} ${r(y0)}Z" fill="${col}"/>`;
  }
  // 有外框的漸細線（角、爪、鬃毛）：先畫深色粗一點的，再疊本色
  const tpo = (x0, y0, x1, y1, w, col, bend) => tp(x0, y0, x1, y1, w + 2.6, sh(col, .5), bend) + tp(x0, y0, x1, y1, w, col, bend);
  const rd = v => Math.round(v * 10) / 10;
  // ── 沿曲線長身體（2026-10-04 龍重畫）：segs＝一串三次貝茲 [[x,y],[x,y],[x,y],[x,y]]（首尾相接）──
  // spine() 等距取樣，回傳 {x,y,nx,ny,a,f}：n＝左法線（往行進方向的左手邊）、a＝切線角度、f＝全長比例 0..1
  function spine(segs, n) {
    const out = [], N = n || 16;
    segs.forEach((s, k) => {
      for (let j = (k ? 1 : 0); j <= N; j++) {
        const t = j / N, u = 1 - t, Q = i => u * u * u * s[0][i] + 3 * u * u * t * s[1][i] + 3 * u * t * t * s[2][i] + t * t * t * s[3][i],
          D = i => 3 * u * u * (s[1][i] - s[0][i]) + 6 * u * t * (s[2][i] - s[1][i]) + 3 * t * t * (s[3][i] - s[2][i]);
        const tx = D(0), ty = D(1), L = Math.hypot(tx, ty) || 1;
        out.push({ x: Q(0), y: Q(1), nx: -ty / L, ny: tx / L, a: Math.atan2(ty, tx) * 180 / Math.PI, f: (k + t) / segs.length });
      }
    });
    return out;
  }
  // ws＝[[f, 寬], …] 線性內插
  const wAt = (ws, f) => { for (let i = 1; i < ws.length; i++) if (f <= ws[i][0]) { const [f0, w0] = ws[i - 1], [f1, w1] = ws[i]; return w0 + (w1 - w0) * (f - f0) / ((f1 - f0) || 1); } return ws[ws.length - 1][1]; };
  // 管狀外形（身體、尾巴、鬍鬚、腳）：off＝中心線往左法線偏移（寬度的比例），回傳 path d
  function tube(segs, ws, off, n) {
    const pts = spine(segs, n), L = [], R = [];
    pts.forEach(p => { const w = wAt(ws, p.f) / 2, o = (off || 0) * w * 2; L.push([p.x + p.nx * (o + w), p.y + p.ny * (o + w)]); R.push([p.x + p.nx * (o - w), p.y + p.ny * (o - w)]); });
    return "M" + L.concat(R.reverse()).map(q => rd(q[0]) + " " + rd(q[1])).join(" ") + "Z";
  }
  // 祥雲：一群圓聯集成一朵（外框只畫外圍）＋暗面＋如意捲紋。c＝[[x,y,r],…]，curls＝[[x,y,r,方向],…]
  function cloud(c, curls, col) {
    const id = "c" + (K++), base = col || "#f1f4ef", line = sh(base, .42), u = `<use href="#§${id}s"`;
    const d = c.map(([x, y, r]) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`).join("");
    return `<defs><path id="§${id}s" d="${d}"/></defs>${u} fill="${line}" stroke="${line}" stroke-width="5.4"/><clipPath id="§${id}">${u}/></clipPath>${u} fill="${sh(base, .16)}"/>` +
      `<g clip-path="url(#§${id})">${u} fill="${base}" transform="translate(-3 -4)"/>${c.slice(0, 2).map(([x, y, r]) => `<ellipse cx="${x - r * .35}" cy="${y - r * .45}" rx="${r * .45}" ry="${r * .22}" fill="#fff" opacity=".8"/>`).join("")}</g>` +
      (curls || []).map(([x, y, r, s]) => `<path d="M${x} ${y} a${r} ${r} 0 1 ${s > 0 ? 1 : 0} ${s * r * 1.4} ${-r * .6} a${r * .55} ${r * .55} 0 1 ${s > 0 ? 1 : 0} ${-s * r * .7} ${r * .5}" fill="none" stroke="${line}" stroke-width="2" stroke-linecap="round" opacity=".75"/>`).join("");
  }
  // 鷹爪：腳掌＋n 根彎爪（ang＝爪子朝向的角度）
  function claw(x, y, ang, n, col) {
    let s = `<g transform="translate(${x} ${y}) rotate(${ang})"><g fill="#f4ecd2" stroke="#9c8a5a" stroke-width="1.4" stroke-linejoin="round">`;
    for (let k = 0; k < n; k++) s += `<path d="M5 0Q14-3 17 3Q13 1 8 3Z" transform="rotate(${(k - (n - 1) / 2) * 26})"/>`;
    return s + `</g><ellipse cx="0" cy="0" rx="7" ry="6" fill="${col}" stroke="${sh(col, .48)}" stroke-width="2.4"/></g>`;
  }
  // 短粗眉（中性、表情靠它）
  const brow = (x0, y0, x1, y1, col) => tp(x0, y0, x1, y1, 5.2, col, -1.5);

  // 0 神秘之卵：三階明暗的蛋殼、帶陰影的斑點、兩端漸細的裂紋
  const EGG = `
    <g class="pc-bob">
      ${P(E(100, 120, 50, 62), "#f1e2bc", { hl: [80, 90, 13, 24], dx: 8, dy: 8, sk: .18 })}
      <g class="pc-d">${[[78, 150, 4.5], [121, 158, 5.5], [112, 96, 3.8], [90, 176, 3.2], [128, 128, 3]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#c9ad74"/><circle cx="${x - r * .3}" cy="${y - r * .3}" r="${r * .45}" fill="#e2cc98"/>`).join("")}</g>
      ${tp(74, 108, 86, 116, 3.4, "#9c7f48")}${tp(86, 116, 77, 125, 3.4, "#9c7f48")}${tp(77, 125, 91, 133, 3.2, "#9c7f48")}
      <path class="pc-d" d="M88 114 l6 -3" stroke="#9c7f48" stroke-width="1.6" stroke-linecap="round"/>
    </g>
    <g class="pc-tw"><path d="M150 60 l3 9 l9 3 l-9 3 l-3 9 l-3-9 l-9-3 l9-3Z" fill="#ffe6a0"/></g>
    <g class="pc-tw" style="animation-delay:1.1s"><path d="M44 92 l2 6 l6 2 l-6 2 l-2 6 l-2-6 l-6-2 l6-2Z" fill="#ffe6a0"/></g>`;

  // 1 草叢幼蟲：分節身體（背上亮、肚子淺色帶）、斑點、觸角、會換表情的眼睛
  const LARVA = `
    <g class="pc-bob">
      ${P(E(66, 142, 18, 16), "#8bbd4e", { hl: [60, 134, 5, 3] })}
      ${P(E(90, 138, 20, 18), "#97c85a", { hl: [83, 129, 6, 3.5] })}
      ${P(E(116, 134, 22, 20), "#a3d167", { hl: [108, 124, 7, 4] })}
      <g class="pc-d"><circle cx="66" cy="136" r="3" fill="#6f9a38"/><circle cx="91" cy="130" r="3.4" fill="#6f9a38"/><circle cx="117" cy="125" r="3.8" fill="#6f9a38"/>
      <path d="M52 152 Q90 160 134 148" stroke="#d9ecb0" stroke-width="4" fill="none" stroke-linecap="round" opacity=".7"/></g>
      <path d="M66 157 v8 M90 155 v9 M116 153 v9" stroke="#5a7a28" stroke-width="3.4" stroke-linecap="round"/>
      ${P(C(143, 122, 27), "#b0da78", { hl: [132, 108, 9, 5.5] })}
      <g class="pc-tail">
        ${tp(137, 98, 140, 74, 4, "#6f9a38", -6)}${P(C(139, 72, 4.8), "#e58a8a", { sw: 2 })}
        ${tp(153, 98, 151, 74, 4, "#6f9a38", 6)}${P(C(151, 72, 4.8), "#e58a8a", { sw: 2 })}
      </g>
      ${eye(136, 123, 5.6, 7.6, "#4a5a20")}${eye(153, 121, 5.6, 7.6, "#4a5a20")}
      ${blush(128, 133, 5.4, 3.4)}${blush(160, 131, 4.4, 3)}
      <path d="M141 134 q6 5 12 1" stroke="#4a6a20" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    </g>`;

  // 2 翩翩彩蝶：翅膀外緣深色帶＋眼紋＋翅脈、圓頭大眼、觸角
  function wing(cx, cy, rx, ry, rot, col, side) {
    const id = "w" + (K++);
    return `<clipPath id="§${id}"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${cx} ${cy})"/></clipPath>` +
      `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${sh(col, .3)}" transform="rotate(${rot} ${cx} ${cy})"/>` +
      `<g clip-path="url(#§${id})"><ellipse cx="${cx - side * 3}" cy="${cy - 2}" rx="${rx * .8}" ry="${ry * .78}" fill="${col}" transform="rotate(${rot} ${cx} ${cy})"/><ellipse cx="${cx - side * rx * .3}" cy="${cy - ry * .35}" rx="${rx * .35}" ry="${ry * .2}" fill="${tn(col, .6)}" opacity=".7"/>` +
      `<path class="pc-d" d="M${100 + side * 6} ${cy} L${cx + side * rx * .7} ${cy - ry * .5} M${100 + side * 6} ${cy + 2} L${cx + side * rx * .8} ${cy + ry * .2}" stroke="${sh(col, .35)}" stroke-width="1.4" opacity=".6"/></g>` +
      `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${sh(col, .5)}" stroke-width="2.6" transform="rotate(${rot} ${cx} ${cy})"/>`;
  }
  const BUTTERFLY = `
    <g class="pc-hover">
      <g class="pc-wing l">${wing(66, 84, 31, 27, -16, "#ef9a6a", -1)}${wing(72, 124, 21, 19, -8, "#f4b98f", -1)}
        <circle class="pc-d" cx="58" cy="82" r="7.5" fill="#fff3e2"/><circle class="pc-d" cx="58" cy="82" r="3.4" fill="#7a5540"/><circle cx="70" cy="122" r="5" fill="#fff3e2"/></g>
      <g class="pc-wing r">${wing(134, 84, 31, 27, 16, "#ef9a6a", 1)}${wing(128, 124, 21, 19, 8, "#f4b98f", 1)}
        <circle class="pc-d" cx="142" cy="82" r="7.5" fill="#fff3e2"/><circle class="pc-d" cx="142" cy="82" r="3.4" fill="#7a5540"/><circle cx="130" cy="122" r="5" fill="#fff3e2"/></g>
      ${P(E(100, 106, 9.5, 22), "#7a5540", { hl: [97, 96, 2.5, 6], dx: 3, dy: 3 })}
      <path class="pc-d" d="M92 104 h16 M92 112 h16 M93 120 h14" stroke="#5e3f2c" stroke-width="1.6" opacity=".7"/>
      ${P(C(100, 84, 15.5), "#8a6349", { hl: [93, 76, 5, 3.4], dx: 4, dy: 4 })}
      ${tp(93, 71, 78, 57, 3.2, "#6a4836", -4)}${tp(107, 71, 122, 57, 3.2, "#6a4836", 4)}
      ${P(C(76, 54, 4.4), "#e07a34", { sw: 2 })}${P(C(124, 54, 4.4), "#e07a34", { sw: 2 })}
      ${eye(93, 84, 4.8, 6.4, "#6a3a1c")}${eye(107, 84, 4.8, 6.4, "#6a3a1c")}
      ${blush(87, 91, 3.6, 2.4)}${blush(113, 91, 3.6, 2.4)}
      <path d="M95 90 q5 5 10 0" stroke="#2a1608" stroke-width="1.9" fill="none" stroke-linecap="round"/>
    </g>`;

  // 3 靈巧山狐（2026-10-04 重畫，跟虎拉開剪影）：倒三角臉（耳朵寬、兩頰尖毛往外翹、下巴尖）、吻部往前突（中間一道橘色鼻樑＋兩側暗面）、
  // 耳尖黑、耳內奶油色絨毛、瘦長坐姿、胸前三層蓬毛、黑襪細腿、直立的大尾巴＋白尾尖。
  const FX = "#d8672c", FXC = "#f8efdf", FXK = "#3b2519";
  const FOX = `
    <g class="pc-bob">
      <g class="pc-tail">${P(Pa("M126 172 C158 178 182 160 184 130 C186 106 172 88 154 86 C168 104 166 128 152 146 C142 156 132 160 122 160Z"), FX, { hl: [172, 118, 4, 12] })}
        ${P(Pa("M154 86 C170 86 186 102 184 124 C178 112 168 106 160 106 C163 99 161 92 154 86Z"), FXC, { sw: 2.4, dx: 2, dy: 2 })}
        <path class="pc-d2" d="M174 132 q-6 10 -14 14 M168 122 q-4 8 -12 12 M178 146 q-8 10 -20 14" stroke="${sh(FX, .3)}" stroke-width="1.6" fill="none" stroke-linecap="round"/></g>
      ${P(E(132, 188, 11, 5), FXK, { sw: 2, dx: 2, dy: 2 })}
      ${P(Pa("M72 188 C64 160 74 130 100 124 C126 120 140 142 140 164 C140 180 134 188 122 190Z"), FX, { hl: [82, 140, 6, 12] })}
      <path class="pc-d" d="M124 152 Q138 160 134 182" stroke="${sh(FX, .3)}" stroke-width="2" fill="none" stroke-linecap="round"/>
      ${P(Pa("M84 152 L83 186 Q90 191 97 186 L97 152Z"), FX, { dx: 2, dy: 2 })}${P(Pa("M83 170 L83 186 Q90 191 97 186 L97 170Q90 167 83 170Z"), FXK, { sw: 2, dx: 2, dy: 2 })}
      ${P(Pa("M103 152 L103 186 Q110 191 117 186 L116 152Z"), FX, { dx: 2, dy: 2 })}${P(Pa("M103 170 L103 186 Q110 191 117 186 L116 170Q110 167 103 170Z"), FXK, { sw: 2, dx: 2, dy: 2 })}
      <path class="pc-d" d="M88 186 v-4 M92 186 v-4 M108 186 v-4 M112 186 v-4" stroke="#6a4a38" stroke-width="1.4" stroke-linecap="round"/>
      ${P(Pa("M80 128 Q100 120 120 128 Q122 140 114 150 L110 144 L106 156 L100 146 L94 156 L90 144 L86 150 Q78 140 80 128Z"), FXC, { sw: 2.2, dx: 3, dy: 3 })}
      <path class="pc-d2" d="M92 132 l2 6 M100 130 v7 M108 132 l-2 6" stroke="${sh(FXC, .25)}" stroke-width="1.4" stroke-linecap="round"/>
      ${P(Pa("M64 76 L56 26 L98 58Z"), FX, { dx: 3, dy: 3 })}${P(Pa("M56 26 L59.2 46 Q66 46 73 39.2Z"), FXK, { sw: 0, dx: 1, dy: 1 })}
      ${P(Pa("M136 76 L144 26 L102 58Z"), FX, { dx: 3, dy: 3 })}${P(Pa("M144 26 L140.8 46 Q134 46 127 39.2Z"), FXK, { sw: 0, dx: 1, dy: 1 })}
      ${P(Pa("M68 68 L62 42 L88 58Z"), "#efdac6", { sw: 0, dx: 2, dy: 2 })}${P(Pa("M132 68 L138 42 L112 58Z"), "#efdac6", { sw: 0, dx: 2, dy: 2 })}
      <path class="pc-d" d="M70 64 l-3 -8 M74 62 l-1 -7 M130 64 l3 -8 M126 62 l1 -7" stroke="#fffaf0" stroke-width="2" stroke-linecap="round"/>
      ${P(Pa("M58 72 Q66 54 100 52 Q134 54 142 72 Q146 88 158 100 Q138 104 125 116 Q112 132 100 134 Q88 132 75 116 Q62 104 42 100 Q54 88 58 72Z"), "#e2783a", { hl: [78, 66, 13, 7], dx: 6, dy: 6 })}
      ${P(Pa("M42 100 Q64 96 80 105 Q92 110 100 110 Q108 110 120 105 Q136 96 158 100 Q138 104 125 116 Q112 132 100 134 Q88 132 75 116 Q62 104 42 100Z"), FXC, { sw: 2.2, dx: 3, dy: 3 })}
      <g class="pc-d">${tp(42, 100, 30, 98, 4, FXC, -2)}${tp(46, 104, 34, 108, 3.4, FXC, 2)}${tp(158, 100, 170, 98, 4, FXC, 2)}${tp(154, 104, 166, 108, 3.4, FXC, -2)}</g>
      ${P(Pa("M91 90 Q100 85 109 90 L105 114 Q100 117 95 114Z"), "#e98a48", { sw: 0, dx: 2, dy: 2, sk: .12 })}
      <g class="pc-d">${tp(87, 95, 93, 110, 2.2, "#b2551f", -1)}${tp(113, 95, 107, 110, 2.2, "#b2551f", 1)}</g>
      ${P(Pa("M93 115 Q100 111 107 115 Q105 121 100 122 Q95 121 93 115Z"), "#2a1810", { sw: 0, dx: 1, dy: 1 })}<ellipse cx="97.6" cy="115.6" rx="2" ry="1.2" fill="#fff" opacity=".6"/>
      <path d="M100 122 v3 q-4 4 -8 1 M100 125 q4 4 8 1" stroke="#2a1810" stroke-width="2" fill="none" stroke-linecap="round"/>
      <g class="pc-d">${[[88, 120], [85, 124], [112, 120], [115, 124]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.2" fill="#9a7a5a"/>`).join("")}</g>
      ${brow(72, 78, 88, 79, "#8a3f16")}${brow(128, 78, 112, 79, "#8a3f16")}
      ${eye(81, 89, 7, 8.6, "#7a4a12")}${eye(119, 89, 7, 8.6, "#7a4a12")}
    </g>`;

  // 4 山林猛虎（2026-10-04 重畫）：寬圓頭＋兩頰外翻的頰毛、耳背黑底白斑、眼內側往額頭兩條白線（石虎）＋「王」字紋、
  // 眼上白斑、鼓鼓的白鬍鬚墊、大腳掌三道趾縫、順著身體彎的條紋、粗尾環紋＋黑尾尖。整體比狐壯一圈。
  const TG = "#ef973f", TGC = "#fbf3e3", TGK = "#33200f";
  const stripe = (x0, y0, x1, y1, w, b) => tp(x0, y0, x1, y1, w, TGK, b);
  const TIGER = `
    <g class="pc-bob">
      <g class="pc-tail">${P(Pa("M146 160 C176 160 188 136 182 110 C180 100 172 96 166 100 C172 118 166 140 140 146Z"), TG, { hl: [178, 120, 3, 9] })}
        ${P(Pa("M166 100 C170 92 182 94 184 104 C186 110 184 116 182 114 C180 106 174 102 166 100Z"), TGK, { sw: 0, dx: 1, dy: 1 })}
        ${stripe(186, 124, 170, 128, 4.4, -2)}${stripe(184, 138, 166, 140, 4.4, -1)}${stripe(176, 152, 160, 150, 4.2, 1)}</g>
      ${P(E(100, 154, 50, 36), TG, { hl: [74, 132, 12, 6] })}
      ${P(Pa("M100 126 Q126 130 130 158 Q122 182 100 186 Q78 182 70 158 Q74 130 100 126Z"), TGC, { sw: 2.4, dx: 4, dy: 4 })}
      ${stripe(52, 140, 68, 146, 5, 2)}${stripe(51, 156, 66, 158, 5, 1)}${stripe(56, 172, 70, 170, 4.6, -1)}${stripe(148, 140, 132, 146, 5, -2)}${stripe(149, 156, 134, 158, 5, -1)}${stripe(144, 172, 130, 170, 4.6, 1)}
      ${P(E(76, 184, 16, 10), TG, { sw: 2.6, dx: 2, dy: 3 })}${P(E(124, 184, 16, 10), TG, { sw: 2.6, dx: 2, dy: 3 })}
      <path d="M70 186 v-5 M76 187 v-6 M82 186 v-5 M118 186 v-5 M124 187 v-6 M130 186 v-5" stroke="${sh(TG, .5)}" stroke-width="2" stroke-linecap="round"/>
      ${P(C(56, 62, 17), TG, { sw: 2.6, dx: 2, dy: 2 })}${P(C(144, 62, 17), TG, { sw: 2.6, dx: 2, dy: 2 })}
      <path d="M41.5 66 A15 15 0 0 1 64 48.5 M158.5 66 A15 15 0 0 0 136 48.5" stroke="${TGK}" stroke-width="5.4" fill="none" stroke-linecap="round"/>
      <circle cx="47" cy="55" r="2.6" fill="#fbf3e3"/><circle cx="153" cy="55" r="2.6" fill="#fbf3e3"/>
      ${P(E(60, 66, 8, 8.4), "#f6e3cc", { sw: 0, dx: 1, dy: 1 })}${P(E(140, 66, 8, 8.4), "#f6e3cc", { sw: 0, dx: 1, dy: 1 })}
      ${P(Pa("M46 104 L34 98 L44 94 L36 86 L48 86 Q46 60 100 52 Q154 60 152 86 L164 86 L156 94 L166 98 L154 104 Q150 134 100 138 Q50 134 46 104Z"), TG, { hl: [70, 66, 14, 7], dx: 6, dy: 7 })}
      ${P(Pa("M46 104 L36 110 L48 112 L44 120 L58 118 Q74 136 100 138 Q126 136 142 118 L156 120 L152 112 L164 110 L154 104 Q140 112 120 108 Q100 104 80 108 Q60 112 46 104Z"), TGC, { sw: 2.2, dx: 3, dy: 3 })}
      ${stripe(100, 53, 100, 70, 5.6, 0)}${stripe(84, 57, 92, 70, 4.6, 1)}${stripe(116, 57, 108, 70, 4.6, -1)}
      ${tp(92, 86, 89, 60, 3.4, TGC, 1)}${tp(108, 86, 111, 60, 3.4, TGC, -1)}
      ${stripe(50, 84, 70, 90, 5, 2)}${stripe(52, 98, 68, 100, 4.6, 1)}${stripe(150, 84, 130, 90, 5, -2)}${stripe(148, 98, 132, 100, 4.6, -1)}
      <g class="pc-d2">${stripe(58, 74, 72, 80, 3.4, 2)}${stripe(142, 74, 128, 80, 3.4, -2)}${stripe(66, 112, 76, 116, 3, 1)}${stripe(134, 112, 124, 116, 3, -1)}</g>
      ${P(E(78, 80, 10, 4.6), TGC, { sw: 0, dx: 1, dy: 1 })}${P(E(122, 80, 10, 4.6), TGC, { sw: 0, dx: 1, dy: 1 })}
      ${P(E(91, 114, 12, 9), TGC, { sw: 2, dx: 2, dy: 2 })}${P(E(109, 114, 12, 9), TGC, { sw: 2, dx: 2, dy: 2 })}
      <g class="pc-d">${[[86, 113], [91, 117], [96, 113], [104, 113], [109, 117], [114, 113]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.3" fill="#8a6a4a"/>`).join("")}</g>
      ${P(Pa("M92 103 Q100 99 108 103 Q106 110 100 111 Q94 110 92 103Z"), "#3a2014", { sw: 0, dx: 1, dy: 1 })}<ellipse cx="97.4" cy="103.6" rx="2.2" ry="1.2" fill="#fff" opacity=".55"/>
      <path d="M100 111 v3 q-5 5 -9 1 M100 114 q5 5 9 1" stroke="#3a2014" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      ${brow(70, 74, 86, 76, TGK)}${brow(130, 74, 114, 76, TGK)}
      ${eye(80, 88, 7.6, 9, "#8a5a12")}${eye(120, 88, 7.6, 9, "#8a5a12")}
    </g>`;

  // 5 初醒幼龍（2026-10-04 重畫）：東方小龍坐姿——拿掉蝙蝠翼（那是西方龍，跟神龍接不起來）。
  // 短圓吻部往前突、小鹿角只分一岔、牛耳、火焰鬃、兩根短捲龍鬚、節狀腹甲、尾巴上的背鰭、三爪、腳下小雲、旁邊一顆小光珠（預告龍珠）
  const JADE = "#4fae7e", JD = "#2f7c56", BELLY = "#efdca4", GOLD = "#dfbf72", MANE = "#358f82";
  const HTAIL = [[[118, 166], [146, 176], [166, 158], [158, 138]], [[158, 138], [154, 128], [146, 126], [140, 130]]];
  const hatchFins = spine(HTAIL, 8).filter((p, k) => k % 3 === 1 && p.f < .8).map(p => {
    const w = wAt([[0, 16], [1, 6]], p.f) / 2, bx = p.x + p.nx * w, by = p.y + p.ny * w, tx = Math.cos(p.a * Math.PI / 180), ty = Math.sin(p.a * Math.PI / 180);
    return `M${Math.round(bx - tx * 4)} ${Math.round(by - ty * 4)}L${Math.round(bx + p.nx * 7 + tx * 2)} ${Math.round(by + p.ny * 7 + ty * 2)}L${Math.round(bx + tx * 4)} ${Math.round(by + ty * 4)}Z`;
  }).join("");
  const HATCHDRAGON = `
    <g class="pc-hover">
      ${cloud([[78, 186, 11], [100, 182, 14], [124, 186, 11], [62, 190, 7], [140, 190, 7]], [[92, 188, 4.5, 1], [114, 189, 4, -1]])}
    </g>
    <g class="pc-bob">
      <g class="pc-tail"><path d="${hatchFins}" fill="${MANE}" stroke="${sh(MANE, .45)}" stroke-width="1.8" stroke-linejoin="round"/>${P(Pa(tube(HTAIL, [[0, 16], [1, 6]], 0, 8)), JADE, { dx: 3, dy: 3 })}
        ${P(Pa("M141 131 Q130 118 136 108 Q140 118 146 120 Q146 110 154 106 Q152 118 148 128Z"), MANE, { sw: 2, dx: 2, dy: 2 })}</g>
      ${P(E(100, 148, 31, 29), JADE, { hl: [84, 132, 8, 4.5], dx: 4, dy: 5 })}
      ${P(Pa("M100 126 Q118 128 120 150 Q116 170 100 174 Q84 170 80 150 Q82 128 100 126Z"), BELLY, { sw: 2.2, dx: 3, dy: 3, sk: .14 })}
      <path d="M85 140 Q100 145 115 140 M83 151 Q100 156 117 151 M86 162 Q100 167 114 162" stroke="${sh(BELLY, .3)}" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <g class="pc-d2">${[[74, 142], [72, 154], [126, 142], [128, 154], [78, 130], [122, 130]].map(([x, y]) => `<path d="M${x - 3} ${y} q3 3.4 6 0" stroke="${JD}" stroke-width="1.3" fill="none" opacity=".55"/>`).join("")}</g>
      ${P(E(82, 176, 11, 7), JADE, { sw: 2.4, dx: 2, dy: 2 })}${P(E(118, 176, 11, 7), JADE, { sw: 2.4, dx: 2, dy: 2 })}
      ${[[76, 181], [82, 182], [88, 181], [112, 181], [118, 182], [124, 181]].map(([x, y]) => `<path d="M${x - 2} ${y - 2} q2 5 4 0Z" fill="#f4ecd2" stroke="#9c8a5a" stroke-width="1.2" stroke-linejoin="round"/>`).join("")}
      ${P(Pa(tube([[[76, 132], [72, 140], [72, 148], [76, 154]]], [[0, 11], [1, 9]])), JADE, { dx: 2, dy: 2 })}${claw(78, 156, 80, 3, JADE)}
      ${P(Pa(tube([[[124, 132], [128, 140], [128, 148], [124, 154]]], [[0, 11], [1, 9]])), JADE, { dx: 2, dy: 2 })}${claw(122, 156, 100, 3, JADE)}
      <g class="pc-tw">${P(Pa("M38 152 Q36 142 42 136 Q42 142 46 142 Q46 136 50 132 Q54 142 50 152Z"), "#ffa94a", { sw: 1.6, dx: 1, dy: 1 })}${P(C(44, 154, 8), "#ffdf86", { hl: [41, 151, 3, 2], dx: 2, dy: 2 })}</g>
      ${[[-170, 16, 9, -4], [-150, 18, 10, -3], [-30, 18, 10, 3], [-10, 16, 9, 4], [160, 12, 8, 3], [20, 12, 8, -3]].map(([a, L, w, b]) => { const r = a * Math.PI / 180, x0 = 100 + Math.cos(r) * 30, y0 = 80 + Math.sin(r) * 24; return tpo(rd(x0), rd(y0), rd(x0 + Math.cos(r) * L), rd(y0 + Math.sin(r) * L), w, MANE, b); }).join("")}
      ${tpo(88, 56, 80, 34, 7, GOLD, 3)}${tpo(84, 45, 72, 41, 4.4, GOLD, 2)}${tpo(112, 56, 120, 34, 7, GOLD, -3)}${tpo(116, 45, 128, 41, 4.4, GOLD, -2)}
      ${P(Pa("M68 80 Q54 70 44 76 Q52 88 68 88Z"), JADE, { dx: 2, dy: 2 })}${P(Pa("M132 80 Q146 70 156 76 Q148 88 132 88Z"), JADE, { dx: 2, dy: 2 })}
      <path class="pc-d" d="M66 83 Q56 78 50 78 M134 83 Q144 78 150 78" stroke="${sh(JADE, .3)}" stroke-width="2" fill="none" stroke-linecap="round"/>
      ${P(E(100, 80, 35, 29), JADE, { hl: [82, 64, 11, 6], dx: 5, dy: 6 })}
      ${P(Pa("M78 94 Q72 112 86 121 Q100 128 114 121 Q128 112 122 94 Q100 86 78 94Z"), "#5cbb8a", { hl: [84, 100, 6, 3], dx: 4, dy: 4 })}
      ${P(Pa("M85 117 Q100 124 115 117 Q111 128 100 129 Q89 128 85 117Z"), BELLY, { sw: 2, dx: 2, dy: 2 })}
      ${P(Pa("M86 108 Q86 101 93 101 Q100 103 107 101 Q114 101 114 108 Q112 113 100 113 Q88 113 86 108Z"), "#6cc596", { hl: [92, 104, 3.4, 1.8], dx: 2, dy: 2, sw: 2 })}
      <path d="M91 108 q1 -3.4 4.2 -2 q0 2.6 -3 2.9 M109 108 q-1 -3.4 -4.2 -2 q0 2.6 3 2.9" stroke="${JD}" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M86 117 Q100 123 114 117" stroke="${JD}" stroke-width="2.3" fill="none" stroke-linecap="round"/>
      <path d="M106 119.5 l1.2 4 l2 -4.6Z" fill="#fff" stroke="${JD}" stroke-width="1" stroke-linejoin="round"/>
      <g class="pc-sway l">${P(Pa(tube([[[86, 109], [76, 106], [66, 108], [64, 116]], [[64, 116], [62, 122], [68, 124], [70, 120]]], [[0, 3.6], [1, 1.2]])), GOLD, { sw: 1.4, dx: 1, dy: 1 })}</g>
      <g class="pc-sway r">${P(Pa(tube([[[114, 109], [124, 106], [134, 108], [136, 116]], [[136, 116], [138, 122], [132, 124], [130, 120]]], [[0, 3.6], [1, 1.2]])), GOLD, { sw: 1.4, dx: 1, dy: 1 })}</g>
      ${brow(78, 72, 94, 73, JD)}${brow(122, 72, 106, 73, JD)}
      ${eye(87, 85, 7.4, 9.4, "#c79a2a")}${eye(113, 85, 7.4, 9.4, "#c79a2a")}
    </g>`;

  // 6 騰雲神龍（2026-10-04 重畫）：東方龍「九似」——駝頭長吻、鹿角、牛耳、蛇身、蜃腹（節狀腹甲）、鯉鱗、鷹爪、龍鬚、
  // 分層後飄的鬃、背鰭、前爪抓火焰龍珠；身體穿進穿出祥雲。配色接幼龍的玉綠＋金米色。
  const DSP = [[[86, 104], [100, 140], [114, 166], [138, 160]], [[138, 160], [158, 154], [146, 106], [166, 98]], [[166, 98], [186, 90], [190, 142], [172, 162]]];
  const DW = [[0, 30], [.34, 28], [.7, 19], [1, 8]];
  const dragonBody = (() => {
    const pts = spine(DSP, 14);
    // 背鰭：沿背（右法線那側＝上方）一排小三角，往尾巴方向斜
    const fins = pts.filter((p, k) => k % 3 === 1 && p.f > .08 && p.f < .95).map(p => {
      const w = wAt(DW, p.f) / 2, bx = p.x - p.nx * w, by = p.y - p.ny * w, h = 5 + w * .35, tx = Math.cos(p.a * Math.PI / 180), ty = Math.sin(p.a * Math.PI / 180);
      return `M${Math.round(bx - tx * 4)} ${Math.round(by - ty * 4)}L${Math.round(bx - p.nx * h + tx * 3)} ${Math.round(by - p.ny * h + ty * 3)}L${Math.round(bx + tx * 5)} ${Math.round(by + ty * 5)}Z`;
    }).join("");
    // 腹甲：左法線那側一條米黃帶＋橫向分節
    const plates = pts.filter((p, k) => k % 2 === 0 && p.f > .04 && p.f < .9).map(p => {
      const w = wAt(DW, p.f) / 2;
      return `M${rd(p.x + p.nx * w * .2)} ${rd(p.y + p.ny * w * .2)}L${rd(p.x + p.nx * w * .95)} ${rd(p.y + p.ny * w * .95)}`;
    }).join("");
    // 鯉鱗（大圖才畫）：沿身體幾排小弧
    const scales = pts.filter((p, k) => k % 2 === 1 && p.f < .9).map(p => {
      const w = wAt(DW, p.f) / 2;
      const c = Math.cos((p.a + 90) * Math.PI / 180), si = Math.sin((p.a + 90) * Math.PI / 180), R = (x, y, u, v) => rd(x + u * c - v * si) + " " + rd(y + u * si + v * c);
      return [-.62, -.12].map(o => { const x = p.x + p.nx * w * o, y = p.y + p.ny * w * o; return `M${R(x, y, -3.2, 0)}Q${R(x, y, 0, 3.6)} ${R(x, y, 3.2, 0)}`; }).join("");
    }).join("");
    return `<path d="${fins}" fill="${MANE}" stroke="${sh(MANE, .45)}" stroke-width="2" stroke-linejoin="round"/>` + P(Pa(tube(DSP, DW, 0, 14)), JADE, { dx: 4, dy: 5 }) +
      P(Pa(tube(DSP, [[0, 12], [.34, 11], [.7, 7], [1, 2]], .3, 14)), BELLY, { sw: 1.6, dx: 2, dy: 2, sk: .14 }) + `<path d="${plates}" stroke="${sh(BELLY, .3)}" stroke-width="1.6" stroke-linecap="round"/>` +
      `<path d="${tube(DSP, [[0, 4], [.5, 4], [1, 1]], -.22, 14)}" fill="${tn(JADE, .35)}" opacity=".7"/>` + `<path class="pc-d2" d="${scales}" stroke="${JD}" stroke-width="1.3" fill="none" opacity=".55"/>`;
  })();
  const DRAGON = `
    <g class="pc-hover">
      ${cloud([[34, 178, 16], [58, 172, 20], [84, 180, 15], [16, 186, 10], [104, 186, 10]], [[46, 182, 6, 1], [76, 184, 5, -1]])}
    </g>
    <g class="pc-bob">
      <g class="pc-tail">${P(Pa("M172 160 C180 168 184 180 176 192 C172 184 166 182 160 184 C166 178 164 170 166 164Z"), MANE, { dx: 2, dy: 2 })}
        <path class="pc-d" d="M172 168 q4 8 2 16 M167 172 q0 6 -3 9" stroke="${tn(MANE, .5)}" stroke-width="1.6" fill="none" stroke-linecap="round"/></g>
            ${dragonBody}
      ${cloud([[150, 176, 14], [170, 170, 16], [188, 178, 11], [130, 184, 9]], [[162, 178, 5, 1]])}
      ${P(Pa(tube([[[150, 146], [154, 152], [156, 158], [158, 164]]], [[0, 12], [1, 9]])), JADE, { dx: 2, dy: 2 })}${claw(159, 166, 70, 3, JADE)}
      ${P(Pa(tube([[[104, 134], [96, 146], [88, 152], [78, 156]]], [[0, 13], [1, 9]])), JADE, { dx: 2, dy: 2 })}
      <g class="pc-tw"><circle cx="62" cy="160" r="19" fill="#ffd36a" opacity=".28"/></g>
      ${P(Pa("M46 160 Q42 142 52 134 Q53 144 58 145 Q56 130 66 122 Q67 136 73 140 Q77 134 80 128 Q86 144 78 160Z"), "#ffa94a", { sw: 2, dx: 2, dy: 2, sk: .15 })}
      <path class="pc-d" d="M54 150 Q53 142 57 138 Q60 146 64 146 Q63 136 67 131 Q70 142 74 146" fill="none" stroke="#ffe39a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      ${P(C(62, 162, 14), "#ffdf86", { hl: [56, 155, 5, 3.5], dx: 3, dy: 3, sk: .25 })}
      <path class="pc-d" d="M54 164 q6 6 14 -2 q2 -6 -4 -7" stroke="#e0a83a" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      ${claw(76, 157, 160, 4, JADE)}
      ${[[-160, 22, 10, -6], [-136, 26, 11, -4], [-112, 22, 9, 3], [-30, 26, 11, 5], [-5, 34, 13, 7], [22, 36, 14, 8], [48, 32, 12, 7], [74, 22, 10, 5]].map(([a, L, w, b]) => { const r = a * Math.PI / 180, x0 = 66 + Math.cos(r) * 22, y0 = 78 + Math.sin(r) * 20; return tpo(rd(x0), rd(y0), rd(x0 + Math.cos(r) * L), rd(y0 + Math.sin(r) * L), w, MANE, b); }).join("")}
      <g class="pc-d">${[[-140, 18, 5, -4], [-112, 18, 5, 2], [8, 22, 5, 5], [38, 22, 5, 5]].map(([a, L, w, b]) => { const r = a * Math.PI / 180, x0 = 66 + Math.cos(r) * 26, y0 = 78 + Math.sin(r) * 24; return tp(rd(x0), rd(y0), rd(x0 + Math.cos(r) * L), rd(y0 + Math.sin(r) * L), w, tn(MANE, .45), b); }).join("")}</g>
      ${tpo(52, 56, 38, 24, 8, GOLD, 5)}${tpo(45, 42, 29, 38, 5.4, GOLD, 3)}${tpo(41, 33, 45, 19, 4.4, GOLD, -2)}
      ${tpo(80, 56, 94, 24, 8, GOLD, -5)}${tpo(87, 42, 103, 38, 5.4, GOLD, -3)}${tpo(91, 33, 87, 19, 4.4, GOLD, 2)}
      <g class="pc-d">${tp(48, 50, 41, 32, 2, tn(GOLD, .5), 3)}${tp(84, 50, 91, 32, 2, tn(GOLD, .5), -3)}</g>
      ${P(Pa("M40 72 Q24 62 14 70 Q24 82 42 80Z"), JADE, { dx: 2, dy: 2 })}${P(Pa("M92 72 Q108 62 118 70 Q108 82 90 80Z"), JADE, { dx: 2, dy: 2 })}
      <path class="pc-d" d="M38 75 Q26 70 20 71 M94 75 Q106 70 112 71" stroke="${sh(JADE, .3)}" stroke-width="2" fill="none" stroke-linecap="round"/>
      ${P(E(66, 72, 29, 25), JADE, { hl: [52, 58, 10, 5.5], dx: 5, dy: 6 })}
      ${P(Pa("M42 86 Q36 108 50 120 Q66 128 82 120 Q96 108 90 86 Q66 78 42 86Z"), "#5cbb8a", { hl: [50, 94, 6, 3], dx: 4, dy: 5 })}
      ${P(Pa("M49 116 Q66 124 83 116 Q78 130 66 132 Q54 130 49 116Z"), BELLY, { sw: 2, dx: 2, dy: 2 })}
      ${tp(59, 130, 53, 146, 5, MANE, -3)}${tp(66, 132, 66, 150, 6, MANE, 2)}${tp(73, 130, 79, 146, 5, MANE, 3)}
      <path class="pc-d" d="M66 80 Q68 88 66 96" stroke="${sh(JADE, .25)}" stroke-width="2" fill="none" stroke-linecap="round"/>
      ${P(Pa("M50 106 Q50 98 58 98 Q66 101 74 98 Q82 98 82 106 Q80 112 66 112 Q52 112 50 106Z"), "#6cc596", { hl: [57, 101, 4, 2], dx: 2, dy: 2, sw: 2.2 })}
      <path d="M55 106 q1 -4 5 -2.5 q0 3 -3.6 3.4 M77 106 q-1 -4 -5 -2.5 q0 3 3.6 3.4" stroke="${JD}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <path d="M48 116 Q66 123 84 116" stroke="${JD}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <path d="M75 119 l1.5 5 l2.5 -5.6Z" fill="#fff" stroke="${JD}" stroke-width="1.1" stroke-linejoin="round"/>
      <g class="pc-sway l">${P(Pa(tube([[[51, 107], [34, 102], [20, 100], [12, 110]], [[12, 110], [6, 120], [12, 130], [22, 126]]], [[0, 4.6], [1, 1.2]])), GOLD, { sw: 1.6, dx: 1, dy: 1 })}</g>
      <g class="pc-sway r">${P(Pa(tube([[[81, 107], [98, 102], [114, 103], [122, 113]], [[122, 113], [128, 123], [122, 132], [114, 128]]], [[0, 4.6], [1, 1.2]])), GOLD, { sw: 1.6, dx: 1, dy: 1 })}</g>
      ${brow(42, 66, 62, 68, JD)}${brow(90, 66, 70, 68, JD)}
      ${eye(53, 77, 6.2, 8.2, "#c79a2a")}${eye(79, 77, 6.2, 8.2, "#c79a2a")}
    </g>`;

  const A = [EGG, LARVA, BUTTERFLY, FOX, TIGER, HATCHDRAGON, DRAGON];
  // 帽子插入點：卵在第一組（頭）結尾；其餘在最後一組結尾
  A[0] = A[0].replace(/<\/g>\s*<g class="pc-tw">/, "<!--H--></g>\n    <g class=\"pc-tw\">");
  for (let k = 1; k < A.length; k++) A[k] = A[k].replace(/<\/g>\s*$/, "<!--H--></g>");

  // 棲息地剪影（各階段專屬場景，鋪在角色後方；深色低調、卡片漸層透出來）。viewBox 0 0 400 150，貼底。
  const GROUND = `<path d="M0 150 L0 122 Q200 100 400 120 L400 150Z" fill="#193a24"/>`;
  const STARS = `<circle cx="60" cy="34" r="2.2" fill="#e6ecc8"/><circle cx="330" cy="26" r="2.6" fill="#e6ecc8"/><circle cx="288" cy="54" r="1.6" fill="#e6ecc8"/><circle cx="120" cy="20" r="1.6" fill="#e6ecc8"/>`;
  const grass = (x) => `<path d="M${x} 128 l-5 -16 M${x + 4} 128 l0 -19 M${x + 9} 128 l6 -15" stroke="#22482c" stroke-width="3.4" fill="none" stroke-linecap="round"/>`;
  const pine = (x, s) => `<path d="M${x} 126 l${-13 * s} 0 l${13 * s} ${-26 * s} l${13 * s} ${26 * s} Z" fill="#1e4229"/><path d="M${x} ${126 - 18 * s} l${-10 * s} ${12 * s} l${10 * s} ${-24 * s} l${10 * s} ${24 * s} Z" fill="#1e4229"/>`;
  const flower = (x, c) => `<path d="M${x} 126 v-18" stroke="#173c25" stroke-width="2.6"/><circle cx="${x}" cy="106" r="5" fill="${c}"/><circle cx="${x}" cy="106" r="2" fill="#193a24"/>`;
  const HAB = [
    /* 0 卵：巢＋星空 */ STARS + GROUND + `<path d="M70 130 q50-16 110-8 M120 136 q60-14 130-2" stroke="#22482c" stroke-width="4" fill="none" stroke-linecap="round"/>`,
    /* 1 幼蟲：草地 */ GROUND + grass(50) + grass(150) + grass(250) + grass(330) + `<ellipse cx="300" cy="112" rx="16" ry="7" fill="#22482c"/>`,
    /* 2 蝶：花叢 */ GROUND + grass(70) + grass(300) + flower(130, "#c9668a") + flower(180, "#e2b455") + flower(240, "#c9668a"),
    /* 3 狐：松林 */ GROUND + pine(70, 1.15) + pine(150, .85) + pine(320, 1.05) + pine(255, .8),
    /* 4 虎：岩地 */ GROUND + `<path d="M250 122 q10-34 46-30 q34 2 40 30Z" fill="#1b3620"/><ellipse cx="90" cy="120" rx="30" ry="12" fill="#122a1c"/>` + grass(40) + grass(360),
    /* 5 幼龍：山稜＋星 */ STARS + `<path d="M0 150 L0 92 L70 118 L140 74 L210 116 L290 66 L360 110 L400 84 L400 150Z" fill="#193a23"/>` + GROUND,
    /* 6 神龍：雲海群峰 */ STARS + `<path d="M0 150 L0 100 L90 60 L170 108 L250 54 L340 104 L400 76 L400 150Z" fill="#183820" opacity=".9"/><path d="M40 128 q-10-16 8-18 q6-14 24-8 q14-10 26 2 q18-4 16 14 q-4 12-20 10 q-16 6-28-2 q-14 4-26 2Z" fill="#1a3526" opacity=".8"/><path d="M250 122 q-8-14 8-16 q6-12 22-6 q12-8 22 2 q16-4 14 12 q-4 10-18 9 q-14 5-24-2 q-12 3-24 1Z" fill="#1a3526" opacity=".8"/>`,
  ];
  function habitat(i) { return `<svg class="pet-hab" viewBox="0 0 400 150" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${HAB[clamp(i)]}</svg>`; }

  // 配件（Premium 裝扮）：疊在角色頭頂（同 200x200 座標，畫在頭部上方 y15~60）。none=不戴。
  const HATS = {
    straw: `<ellipse cx="100" cy="55" rx="49" ry="13" fill="#dcb877"/><path d="M73 55 q5-33 27-33 q22 0 27 33Z" fill="#eccf94"/><path d="M73 51 q27 11 54 0" stroke="#c39a55" stroke-width="5" fill="none"/>`,
    party: `<path d="M100 5 l-20 47 q20 9 40 0Z" fill="#e2657f"/><path d="M96 22 l8 0 M88 38 l9 0 M82 50 l7 0" stroke="#fbe6a0" stroke-width="3.5" stroke-linecap="round"/><circle cx="100" cy="6" r="7" fill="#f2c94c"/>`,
    crown: `<path d="M60 52 q40-18 80 0" stroke="#5da24e" stroke-width="6" fill="none" stroke-linecap="round"/><circle cx="68" cy="47" r="7.5" fill="#e78aa8"/><circle cx="68" cy="47" r="2.6" fill="#fbe6a0"/><circle cx="100" cy="37" r="9" fill="#f2c94c"/><circle cx="100" cy="37" r="3.2" fill="#e78aa8"/><circle cx="132" cy="47" r="7.5" fill="#e78aa8"/><circle cx="132" cy="47" r="2.6" fill="#fbe6a0"/>`,
    bow: `<path d="M100 42 l-24 -13 q-7 13 0 26Z" fill="#d95a7a"/><path d="M100 42 l24 -13 q7 13 0 26Z" fill="#d95a7a"/><path d="M78 32 q10 8 0 18 M122 32 q-10 8 0 18" stroke="#b8446020" stroke-width="0" fill="none"/><circle cx="100" cy="42" r="7.5" fill="#c04968"/>`,
    // 登山頭巾：每月挑戰第一次完成才解鎖（不能用果實買）
    bandana: `<path d="M62 50 q38-26 76 0 l-3 9 q-35-16 -70 0Z" fill="#d9573f"/><path d="M66 48 q34-20 68 0" stroke="#f3c7a8" stroke-width="2.4" stroke-dasharray="3 5" fill="none" stroke-linecap="round"/><path d="M134 53 l17 -3 l-6 11 l11 6 l-18 2Z" fill="#c4452f"/><circle cx="100" cy="38" r="3" fill="#fff3d6"/><circle cx="84" cy="43" r="2.2" fill="#fff3d6"/><circle cx="116" cy="43" r="2.2" fill="#fff3d6"/>`,
  };
  // 地區配件（pet-journey.js）：走過那個地區的步道就解鎖，不用果實
  Object.assign(HATS, {
    silvergrass: `<path d="M84 52 q-6-20 -16-32 M100 50 q0-22 3-38 M116 52 q8-18 18-28" stroke="#b9a874" stroke-width="3" fill="none" stroke-linecap="round"/><ellipse cx="66" cy="20" rx="5.5" ry="12" transform="rotate(-36 66 20)" fill="#f1e7c9"/><ellipse cx="103" cy="12" rx="5.5" ry="12.5" fill="#f6eed6"/><ellipse cx="136" cy="22" rx="5.5" ry="12" transform="rotate(40 136 22)" fill="#f1e7c9"/><path d="M76 55 q24-9 48 0" stroke="#6f9446" stroke-width="5.5" fill="none" stroke-linecap="round"/>`,
    maple: `<g transform="translate(110 36) rotate(-14) scale(1.25)"><path d="M0 -20 l5 9 l8 -3 l-2 9 l9 2 l-8 6 l3 7 l-9 -2 l-1 9 l-5 -6 l-5 6 l-1 -9 l-9 2 l3 -7 l-8 -6 l9 -2 l-2 -9 l8 3Z" fill="#d9532f"/><path d="M0 -14 v26" stroke="#a83a1f" stroke-width="1.6"/></g><path d="M78 56 q22-8 44 0" stroke="#8a5a32" stroke-width="4" fill="none" stroke-linecap="round"/>`,
    pineapple: `<path d="M100 34 l-14 -22 l11 8 l3 -18 l4 17 l11 -9 l-9 22Z" fill="#4f9a3e"/><ellipse cx="100" cy="47" rx="27" ry="15" fill="#f2b632"/><path d="M80 40 l20 18 M90 34 l26 22 M104 33 l16 14 M120 40 l-20 18 M110 34 l-26 22 M96 33 l-16 14" stroke="#cf861a" stroke-width="2" stroke-linecap="round"/>`,
    wave: `<path d="M62 54 q38-24 76 0 l-2 8 q-36-14 -72 0Z" fill="#3a86c8"/><path d="M70 50 q8-12 18-4 q6-10 16-2 q8-10 18 0 q6-6 12 2" stroke="#eaf6ff" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M122 46 q8-18 26-12 q-12 4 -11 14 q-7-6 -15-2Z" fill="#7cc0ea"/>`,
    shell: `<g transform="translate(112 40)"><path d="M-19 9 q0-27 19-27 q19 0 19 27 q-19 6 -38 0Z" fill="#f4c7b0"/><path d="M0 -16 v22 M-9 -12 l4 19 M9 -12 l-4 19 M-15 -2 l9 9 M15 -2 l-9 9" stroke="#d99a80" stroke-width="1.8" stroke-linecap="round"/><rect x="-8" y="7" width="16" height="6" rx="3" fill="#e2a68c"/></g>`,
  });
  const HAT_LABEL = { none: "不戴", straw: "草帽", party: "派對帽", crown: "花冠", bow: "蝴蝶結", bandana: "登山頭巾", silvergrass: "芒草穗", maple: "楓葉", pineapple: "鳳梨帽", wave: "浪花頭巾", shell: "貝殼髮夾" };
  const HAT_IDS = ["none", "straw", "party", "crown", "bow", "bandana", "silvergrass", "maple", "pineapple", "wave", "shell"];
  // 各階段頭頂錨點 [x, y, scale]：帽子以自身參考點(x100,y45)對到該階段頭頂。逐一調過位。
  const HAT_ANCHOR = [
    [100, 62, 1.0],   // 0 卵
    [143, 90, 0.6],   // 1 幼蟲：頭在右下、縮小
    [100, 63, 0.56],  // 2 蝶：小頭、上移縮小
    [100, 50, 1.0],   // 3 狐（參考）
    [100, 49, 1.06],  // 4 虎：頭比較寬
    [100, 56, 0.8],   // 5 幼龍：頭頂在兩支鹿角中間
    [66, 52, 0.74],   // 6 神龍：頭在左上
  ];
  function hat(id, i) {
    if (!HATS[id]) return "";
    const a = HAT_ANCHOR[clamp(i || 0)] || [100, 46, 1];
    const tf = `translate(${a[0]} ${a[1]}) scale(${a[2]}) translate(-100 -45)`;
    return `<svg class="pet-hat-svg" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g transform="${tf}">${HATS[id]}</g></svg>`;
  }
  const EMOJI = ["🥚", "🐛", "🦋", "🦊", "🐅", "🐲", "🐉"];   // 對映 PET_STAGES 的 e，供把同步來的 emoji 反查成階段
  const clamp = i => Math.max(0, Math.min(A.length - 1, (i | 0)));
  // 帽子畫進「頭所在的那一組」（<!--H--> 位置），跟著角色同一個動畫一起動。
  // 以前帽子是另一張疊上去的 SVG、用自己的起伏動畫：彩蝶／神龍的漂浮週期（3.8s、10px）跟帽子（3.4s、6px）
  // 對不上，幾秒後帽子就滑到臉上。
  function hatG(id, i) {
    if (!HATS[id]) return "";
    const a = HAT_ANCHOR[clamp(i)] || [100, 46, 1];
    return `<g class="pc-hat" transform="translate(${a[0]} ${a[1]}) scale(${a[2]}) translate(-100 -45)">${HATS[id]}</g>`;
  }
  let U = 0;   // 每份 SVG 自己的 id 前綴（§ → p1_、p2_…），避免同頁多份角色的裁切互相串
  function body(i, hatId) { const pre = "p" + (++U).toString(36) + "_"; return A[clamp(i)].replace("<!--H-->", hatG(hatId, i)).replace(/§/g, pre); }
  function svg(i, cls, hatId) {
    return `<svg class="pet-critter ${cls || ""}" viewBox="0 0 200 200" role="img" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body(i, hatId)}</svg>`;
  }
  function byEmoji(e) { return EMOJI.indexOf(e); }   // 找不到回 -1
  // 給 canvas 用：帶 width/height 的獨立 SVG data URI（靜態一幀，供 new Image().src 光柵化畫進分享圖卡）
  // hatId 有給就把配件一起畫進去（合照用）
  function dataUri(i, size, hatId) {
    const s = size || 120;
    // 圖片裡吃不到 style.css：開心瞇眼要自己藏起來（以前分享圖卡會同時畫出睜眼和 ^^ 眼）；質感細節 .pc-d2 照畫（圖卡夠大）
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 200 200"><style>.pc-eh{display:none}</style>${body(i, hatId)}</svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }
  function habitatUri(i, w, h) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w || 400}" height="${h || 150}" viewBox="0 0 400 150" preserveAspectRatio="none">${HAB[clamp(i)]}</svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }
  return { svg, count: A.length, byEmoji, dataUri, habitat, habitatUri, hat, HAT_IDS, HAT_LABEL };
})();
