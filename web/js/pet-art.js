// 山林夥伴 chibi 角色（純 SVG 資產、無邏輯）。7 進化階，viewBox 0 0 200 200。
// 動畫靠 CSS class（見 style.css）：.pc-bob 呼吸起伏 / .pc-eye 眨眼 / .pc-tail 擺動 /
// .pc-wing(.l/.r) 振翅 / .pc-hover 漂浮 / .pc-tw 閃爍。prefers-reduced-motion 會全關。
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
    let s = `<clipPath id="§${k}">${el}/></clipPath>${el} fill="${sh(base, o.sk || .2)}"/><g clip-path="url(#§${k})">${el} fill="${base}" transform="translate(${-dx} ${-dy})"/>`;
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

  // 3 靈巧山狐：耳朵內側、臉頰兩撮蓬毛、白口鼻、分段毛流的尾巴、腳掌肉球
  const FOX = `
    <g class="pc-bob">
      <g class="pc-tail">${P(Pa("M52 150 C10 140 6 96 34 84 C40 118 66 128 78 138 Z"), "#d9702f", { hl: [28, 102, 5, 12] })}
        ${P(Pa("M38 92 C20 94 14 122 34 132 C40 116 40 104 38 92Z"), "#faf4e6", { sw: 2.4, dx: 3, dy: 3 })}
        <path class="pc-d" d="M30 110 q8 4 14 2 M24 124 q10 4 18 0" stroke="#b85a22" stroke-width="1.6" fill="none" opacity=".6"/></g>
      ${P(E(104, 150, 46, 38), "#e07a34", { hl: [84, 126, 12, 6] })}
      ${P(Pa("M104 118 q30 6 34 40 q-34 14 -68 0 q4 -34 34 -40Z"), "#faf4e6", { sw: 2.4, dx: 4, dy: 4 })}
      ${P(E(86, 184, 12, 8), "#7a3d15", { sw: 2.4, dx: 2, dy: 2 })}${P(E(122, 184, 12, 8), "#7a3d15", { sw: 2.4, dx: 2, dy: 2 })}
      <g class="pc-d"><ellipse cx="86" cy="183" rx="4" ry="2.6" fill="#c97a6a"/><ellipse cx="122" cy="183" rx="4" ry="2.6" fill="#c97a6a"/></g>
      ${P(Pa("M60 84 L54 34 L98 68 Z"), "#e07a34", { dx: 3, dy: 3 })}${P(Pa("M65 74 L61 47 L86 66 Z"), "#3a1e0c", { sw: 0, dx: 2, dy: 2 })}
      ${P(Pa("M148 84 L154 34 L110 68 Z"), "#e07a34", { dx: 3, dy: 3 })}${P(Pa("M143 74 L147 47 L122 66 Z"), "#3a1e0c", { sw: 0, dx: 2, dy: 2 })}
      ${P(C(104, 98, 48), "#e88a44", { hl: [80, 70, 14, 8], dx: 6, dy: 7 })}
      <g class="pc-d"><path d="M58 104 l-8 4 l8 2 l-6 6 l9 0" fill="#faf4e6" stroke="#d9c8a8" stroke-width="1.2"/><path d="M150 104 l8 4 l-8 2 l6 6 l-9 0" fill="#faf4e6" stroke="#d9c8a8" stroke-width="1.2"/></g>
      ${P(Pa("M104 92 q34 4 30 40 q-30 22 -60 0 q-4 -36 30 -40Z"), "#faf4e6", { sw: 2.2, dx: 4, dy: 4 })}
      ${eye(86, 98, 8, 10, "#6a3a1a")}${eye(122, 98, 8, 10, "#6a3a1a")}
      ${blush(75, 116, 8, 5)}${blush(133, 116, 8, 5)}
      ${P(Pa("M104 116 l-7 8 q7 6 14 0 Z"), "#2a1608", { sw: 0, dx: 1, dy: 1 })}<circle cx="101" cy="118.5" r="1.6" fill="#fff" opacity=".7"/>
      <path d="M104 124 v6 q-5 5 -10 2 M104 130 q5 3 10 -2" stroke="#2a1608" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    </g>`;

  // 4 山林猛虎：圓耳、兩端漸細的條紋（額頭「王」字感）、鬍鬚墊、條紋尾巴
  const TIGER = `
    <g class="pc-bob">
      <g class="pc-tail">${P(Pa("M150 152 C186 142 190 102 172 94 C168 122 150 134 140 142Z"), "#e08a34", { hl: [176, 112, 4, 10] })}
        ${tp(178, 100, 168, 112, 4.2, "#3a2410")}${tp(172, 116, 162, 127, 4.2, "#3a2410")}${tp(163, 130, 152, 139, 4, "#3a2410")}</g>
      ${P(E(100, 152, 46, 38), "#e88a3e", { hl: [80, 128, 12, 6] })}
      ${P(Pa("M100 122 q28 6 30 40 q-30 14 -60 0 q2 -34 30 -40Z"), "#faf1e0", { sw: 2.4, dx: 4, dy: 4 })}
      ${tp(70, 134, 86, 136, 4, "#3a2410")}${tp(130, 134, 114, 136, 4, "#3a2410")}${tp(74, 152, 88, 153, 3.6, "#3a2410")}${tp(126, 152, 112, 153, 3.6, "#3a2410")}
      ${P(E(84, 186, 11, 7), "#7a3d15", { sw: 2.4, dx: 2, dy: 2 })}${P(E(120, 186, 11, 7), "#7a3d15", { sw: 2.4, dx: 2, dy: 2 })}
      ${P(C(66, 66, 17), "#e88a3e", { dx: 3, dy: 3 })}<circle cx="66" cy="66" r="8" fill="#3a2410"/>
      ${P(C(138, 66, 17), "#e88a3e", { dx: 3, dy: 3 })}<circle cx="138" cy="66" r="8" fill="#3a2410"/>
      ${P(C(102, 96, 50), "#ee9448", { hl: [78, 66, 14, 8], dx: 6, dy: 7 })}
      ${tp(102, 47, 102, 68, 5.6, "#3a2410")}${tp(85, 51, 91, 68, 5, "#3a2410")}${tp(119, 51, 113, 68, 5, "#3a2410")}
      ${tp(54, 88, 74, 94, 5, "#3a2410")}${tp(54, 104, 74, 106, 5, "#3a2410")}${tp(150, 88, 130, 94, 5, "#3a2410")}${tp(150, 104, 130, 106, 5, "#3a2410")}
      ${P(Pa("M102 92 q30 2 26 34 q-26 20 -52 0 q-4 -32 26 -34Z"), "#faf1e0", { sw: 2.2, dx: 4, dy: 4 })}
      ${tp(77, 82, 94, 89, 4.4, "#3a2410")}${tp(127, 82, 110, 89, 4.4, "#3a2410")}
      ${eye(86, 98, 8, 10, "#7a4a12")}${eye(118, 98, 8, 10, "#7a4a12")}
      <g class="pc-d">${[[88, 120], [84, 124], [116, 120], [120, 124]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.3" fill="#7a5a3a"/>`).join("")}</g>
      ${P(Pa("M102 116 l-7 8 q7 6 14 0Z"), "#2a1608", { sw: 0, dx: 1, dy: 1 })}<circle cx="99" cy="118.5" r="1.6" fill="#fff" opacity=".7"/>
      <path d="M102 124 v5 q-6 6 -12 2 M102 129 q6 4 12 -2" stroke="#2a1608" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    </g>`;

  // 5 初醒幼龍：翅膀有膜與骨、肚子鱗紋、角、鼻孔
  const HATCHDRAGON = `
    <g class="pc-bob">
      <g class="pc-tail">${P(Pa("M84 156 C50 168 44 140 60 132 C70 144 80 150 90 150Z"), "#3f9e6e", {})}${P(Pa("M54 138 l-9-2 l6-6 l-9-3 l12 -2 l6 6Z"), "#7ed6a6", { sw: 1.8, dx: 2, dy: 2 })}</g>
      <g class="pc-wing l">${P(Pa("M84 108 C50 82 42 100 50 118 C60 118 74 118 84 114Z"), "#7ed6a6", { dx: 3, dy: 3 })}<path class="pc-d" d="M84 110 L54 94 M84 112 L56 106 M84 113 L60 116" stroke="#49aa78" stroke-width="2"/></g>
      <g class="pc-wing r">${P(Pa("M120 108 C154 82 162 100 154 118 C144 118 130 118 120 114Z"), "#7ed6a6", { dx: 3, dy: 3 })}<path class="pc-d" d="M120 110 L150 94 M120 112 L148 106 M120 113 L144 116" stroke="#49aa78" stroke-width="2"/></g>
      ${P(E(102, 146, 34, 30), "#49aa78", { hl: [86, 128, 9, 5] })}
      ${P(Pa("M102 124 q20 4 22 30 q-22 12 -44 0 q2 -26 22 -30Z"), "#cdeede", { sw: 2.2, dx: 3, dy: 3 })}
      <path class="pc-d" d="M86 134 q16 5 32 0 M84 144 q18 5 36 0 M88 154 q14 4 28 0" stroke="#8fd6b0" stroke-width="2" fill="none" stroke-linecap="round"/>
      ${P(E(88, 172, 10, 7), "#2f7c56", { sw: 2.2, dx: 2, dy: 2 })}${P(E(116, 172, 10, 7), "#2f7c56", { sw: 2.2, dx: 2, dy: 2 })}
      ${P(C(102, 96, 40), "#52b482", { hl: [84, 72, 11, 6.5], dx: 5, dy: 6 })}
      ${P(Pa("M80 62 q-5-16 5-21 q3 12 5 18Z"), "#e8dcb0", { sw: 2, dx: 2, dy: 2 })}${P(Pa("M124 62 q5-16 -5-21 q-3 12 -5 18Z"), "#e8dcb0", { sw: 2, dx: 2, dy: 2 })}
      ${P(Pa("M92 58 q10-6 20 0 q-4 6 -10 6 q-6 0 -10-6Z"), "#3f9e6e", { sw: 2, dx: 2, dy: 2 })}
      ${P(Pa("M102 92 q26 2 22 30 q-22 16 -44 0 q-2 -28 22 -30Z"), "#cdeede", { sw: 2.2, dx: 3, dy: 3 })}
      <circle cx="94" cy="118" r="2.4" fill="#2f7c56"/><circle cx="110" cy="118" r="2.4" fill="#2f7c56"/>
      ${eye(88, 92, 8, 10, "#2e6a48")}${eye(116, 92, 8, 10, "#2e6a48")}
      ${blush(76, 108, 6, 3.6)}${blush(128, 108, 6, 3.6)}
      <path d="M92 124 q10 6 20 0" stroke="#2f7c56" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    </g>`;

  // 6 騰雲神龍：東方神龍（分層鬃毛、兩端漸細的鬍鬚、蛇身鱗片、龍珠內光）、有體積的雲
  const DRAGON = `
    <g class="pc-hover">
      ${P(Pa("M36 170 q-16 2 -14-13 q-14-6-2-17 q6-12 22-6 q10-14 26-3 q18-11 30 3 q20-5 20 13 q15 3 6 18 q-4 11-20 8 q-14 6-24-2 q-16 6-28-2 q-12 4-16-3Z"), "#eef3f0", { hl: [56, 146, 14, 5], sk: .14 })}
    </g>
    <g class="pc-bob">
      <path d="M118 150 C176 156 190 108 158 96 C132 86 120 118 142 128 C158 134 158 112 148 108" fill="none" stroke="#2f7c56" stroke-width="25" stroke-linecap="round"/>
      <path d="M118 150 C176 156 190 108 158 96 C132 86 120 118 142 128 C158 134 158 112 148 108" fill="none" stroke="#3f9e6e" stroke-width="20" stroke-linecap="round"/>
      <path d="M120 147 C170 150 182 112 158 101" fill="none" stroke="#7ed6a6" stroke-width="7" stroke-linecap="round" opacity=".85"/>
      <path class="pc-d" d="M132 152 q4 -5 8 0 M146 151 q4 -5 8 0 M160 146 q4 -5 8 0 M172 134 q4 -5 8 -1 M176 118 q3 -5 7 -2" stroke="#2f7c56" stroke-width="1.8" fill="none"/>
      <path d="M150 88 l7-3 M162 96 l7-1 M170 110 l6 2 M170 126 l6 4" stroke="#2f7c56" stroke-width="4" stroke-linecap="round"/>
      <g class="pc-tail">${P(Pa("M150 150 q18 10 8 30 q-6-4-8-10 q-8 6-14 2 q6-6 8-12 q-4-8 6-10Z"), "#3f9e6e", { dx: 2, dy: 2 })}</g>
      ${P(Pa("M60 66 q-10-8-8-24 q10 2 12 12 q6-8 14-6 q-4 8 -10 10 q4 8 -2 16Z"), "#e8dcb0", { sw: 2.2, dx: 2, dy: 2 })}
      ${P(Pa("M112 66 q10-8 8-24 q-10 2 -12 12 q-6-8 -14-6 q4 8 10 10 q-4 8 2 16Z"), "#e8dcb0", { sw: 2.2, dx: 2, dy: 2 })}
      <path d="M52 74 q-6-4-10-2 q4 8 12 10Z M120 74 q6-4 10-2 q-4 8 -12 10Z" fill="#c8a24a"/>
      ${tp(50, 58, 54, 86, 7, "#2f7c56", 4)}${tp(132, 58, 128, 86, 7, "#2f7c56", -4)}${tp(40, 82, 48, 106, 7, "#2f7c56", 5)}${tp(142, 82, 134, 106, 7, "#2f7c56", -5)}
      <g class="pc-d">${tp(44, 70, 50, 92, 4, "#49aa78", 3)}${tp(138, 70, 132, 92, 4, "#49aa78", -3)}</g>
      ${P(C(90, 98, 46), "#4fae7e", { hl: [68, 72, 13, 7.5], dx: 6, dy: 7 })}
      ${tp(46, 106, 10, 116, 4, "#dcc98a", -6)}${tp(48, 118, 14, 136, 4, "#dcc98a", -4)}
      ${P(Pa("M90 96 q30 0 26 36 q-26 20 -52 2 q-4 -36 26 -38Z"), "#cdeede", { sw: 2.2, dx: 4, dy: 4 })}
      ${tp(64, 84, 84, 80, 4.2, "#c8a24a", -3)}${tp(96, 80, 116, 84, 4.2, "#c8a24a", -3)}
      ${eye(74, 94, 8, 11, "#2e6a48")}${eye(104, 94, 8, 11, "#2e6a48")}
      <circle cx="70" cy="122" r="2.4" fill="#2f7c56"/><circle cx="92" cy="122" r="2.4" fill="#2f7c56"/>
      <path d="M66 130 q15 9 30 0" stroke="#2f7c56" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      <path d="M76 130 l-2 6 M86 130 l2 6" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>
      <g class="pc-tw"><circle cx="150" cy="150" r="14" fill="#ffe08a"/><circle cx="150" cy="150" r="14" fill="none" stroke="#c99a3a" stroke-width="2.4"/><circle cx="154" cy="154" r="7" fill="#ffd060" opacity=".7"/><circle cx="145" cy="145" r="4" fill="#fffdf0"/></g>
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
    [104, 50, 1.0],   // 3 狐（參考）
    [102, 48, 1.02],  // 4 虎
    [102, 58, 0.92],  // 5 幼龍
    [86, 56, 0.92],   // 6 神龍：頭偏左
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
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 200 200">${body(i, hatId)}</svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }
  function habitatUri(i, w, h) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w || 400}" height="${h || 150}" viewBox="0 0 400 150" preserveAspectRatio="none">${HAB[clamp(i)]}</svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }
  return { svg, count: A.length, byEmoji, dataUri, habitat, habitatUri, hat, HAT_IDS, HAT_LABEL };
})();
