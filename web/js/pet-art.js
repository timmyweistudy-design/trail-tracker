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
  // 各自的眼睛（2026-10-04 使用者：「眼睛不用統一，各自設計適合的、符合自然」）。結構一樣：.pc-eye（眨眼、跟著手指看）＋ .pc-eh 開心瞇眼。
  // k：bead＝毛毛蟲的小黑珠眼；compound＝蝴蝶的複眼（大、深色、一道光澤，沒有瞳孔）；
  //    almond＝狐／龍的杏眼（外眼角上揚、直立縫瞳）；round＝虎（圓瞳）／幼龍（大圓眼、縫瞳）。
  // dir：-1 左眼、1 右眼（杏眼的外眼角朝外）。o.pupil＝"slit"|"round"；o.lid＝上緣陰影（0～1，成熟／威嚴）；
  // o.cut＝上眼瞼斜切的毛色（虎、成龍：靠鼻子那側壓低＝專注、有威嚴，不是生氣）
  function eyeOf(k, cx, cy, w, h, dir, iris, o) {
    o = o || {};
    const D = "#1c1209", r = v => Math.round(v * 10) / 10, id = "e" + (K++);
    let g;
    if (k === "bead") g = `<circle cx="${cx}" cy="${cy}" r="${w}" fill="${D}"/><circle cx="${r(cx + w * .3)}" cy="${r(cy - w * .36)}" r="${r(w * .34)}" fill="#fff" opacity=".9"/>`;
    else if (k === "compound") g = `<ellipse cx="${cx}" cy="${cy}" rx="${w}" ry="${h}" fill="#20150e" stroke="#0e0905" stroke-width="1.3"/>` +
      `<path d="M${r(cx - w * .62)} ${r(cy - h * .05)} Q${r(cx - w * .35)} ${r(cy - h * .8)} ${r(cx + w * .45)} ${r(cy - h * .62)}" stroke="#7d7590" stroke-width="${r(w * .3)}" fill="none" stroke-linecap="round" opacity=".75"/>` +
      `<circle cx="${r(cx + w * .3)}" cy="${r(cy - h * .45)}" r="${r(w * .17)}" fill="#fff" opacity=".85"/>` +
      `<g class="pc-d2" fill="#3a2c22">${[[-.3, .3], [.15, .35], [-.05, .7], [.45, .1]].map(([a, b]) => `<circle cx="${r(cx + w * a)}" cy="${r(cy + h * b)}" r="${r(w * .1)}"/>`).join("")}</g>`;
    else {
      const sh_ = k === "almond"
        ? `M${r(cx + dir * w)} ${r(cy - h * (o.tilt == null ? .38 : o.tilt))} Q${r(cx + dir * w * .15)} ${r(cy - h * 1.75)} ${r(cx - dir * w)} ${r(cy + h * .1)} Q${r(cx + dir * w * .05)} ${r(cy + h * 1.5)} ${r(cx + dir * w)} ${r(cy - h * (o.tilt == null ? .38 : o.tilt))}Z`
        : `M${r(cx - w)} ${cy}a${w} ${h} 0 1 0 ${r(w * 2)} 0a${w} ${h} 0 1 0 ${r(-w * 2)} 0Z`;
      const pup = o.pupil === "round" ? `<circle cx="${cx}" cy="${r(cy + h * .05)}" r="${r(w * (o.pr || .42))}" fill="${D}"/>` : `<ellipse cx="${cx}" cy="${r(cy + h * .05)}" rx="${r(w * (o.pw || .17))}" ry="${r(h * .78)}" fill="${D}"/>`;
      g = `<clipPath id="§${id}"><path d="${sh_}"/></clipPath><path d="${sh_}" fill="${iris}"/><g clip-path="url(#§${id})">` +
        `<ellipse cx="${cx}" cy="${r(cy + h * .55)}" rx="${r(w * .8)}" ry="${r(h * .5)}" fill="${tn(iris, .4)}" opacity=".8"/>${pup}` +
        (o.lid ? `<ellipse cx="${cx}" cy="${r(cy - h * .95)}" rx="${r(w * 1.3)}" ry="${r(h * .6)}" fill="${D}" opacity="${o.lid}"/>` : "") +
        (o.cut ? `<path d="M${r(cx + dir * w * 1.4)} ${r(cy - h * 1.6)} L${r(cx + dir * w * 1.4)} ${r(cy - h * (o.co || .72))} L${r(cx - dir * w * 1.4)} ${r(cy - h * (o.ci || .3))} L${r(cx - dir * w * 1.4)} ${r(cy - h * 1.6)}Z" fill="${o.cut}"/>` +
          `<path d="M${r(cx + dir * w * 1.4)} ${r(cy - h * (o.co || .72))} L${r(cx - dir * w * 1.4)} ${r(cy - h * (o.ci || .3))}" stroke="${D}" stroke-width="2"/>` : "") +
        `<circle cx="${r(cx + w * .26)}" cy="${r(cy - h * .26)}" r="${r(w * .26)}" fill="#fff" opacity=".92"/><circle class="pc-d" cx="${r(cx - w * .28)}" cy="${r(cy + h * .38)}" r="${r(w * .1)}" fill="#fff" opacity=".5"/></g><path d="${sh_}" fill="none" stroke="${D}" stroke-width="1.8" stroke-linejoin="round"/>`;
    }
    const ew = Math.max(w, 4);
    return `<g class="pc-eye">${g}</g>` +
      `<path class="pc-eh" d="M${r(cx - ew * 1.1)} ${r(cy + h * .15)} Q${cx} ${r(cy - h * .95)} ${r(cx + ew * 1.1)} ${r(cy + h * .15)}" stroke="${D}" stroke-width="${Math.max(2.4, r(ew * .42))}" fill="none" stroke-linecap="round"/>`;
  }
  const blush = (cx, cy, rx, ry) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#e0a08a" opacity=".25"/>`;   // 淡一點、不加亮點（中性）
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

  // ── 骨架（2026-10-04 動作優化）：可以分開動的部位，各自有支點（viewBox 座標，CSS 用 transform-box: view-box）──
  // pr-head 頭（支點＝脖子）／pr-paw.l/.r 前腳（支點＝肩）／pr-jaw 下顎／pr-mouth 嘴（m-c 閉、m-o 張、m-t 舌頭、m-p 鼓起的臉頰）
  // 平常只看得到 m-c；張嘴、嚼、舔嘴、打哈欠都靠 CSS 切換（style-features.css 的 .ps-box 底下），小圖與分享圖卡永遠是閉嘴。
  const rig = (cls, ox, oy, inner) => `<g class="${cls}" style="--ox:${ox}px;--oy:${oy}px">${inner}</g>`;
  const mouth = (ox, oy, closed, open, tongue, puff) => `<g class="pr-mouth" style="--ox:${ox}px;--oy:${oy}px"><g class="m-c">${closed}</g><g class="m-o">${open}</g>${tongue ? `<g class="m-t">${tongue}</g>` : ""}${puff ? `<g class="m-p">${puff}</g>` : ""}</g>`;
  const MOUTH_IN = "#3a1a12", TONGUE = "#d4685a";

  // ── 7 階角色（2026-10-04 重新設計；同日第二輪依使用者回饋：不能飄、道具不能跟著跳、眼睛各自設計）──
  // 物理：地上的動物腳底對齊 y≈196（夥伴卡的影子在 SVG 底下），待機只「呼吸」（.pc-bob 以腳底為原點微縮放，不往上飄）；
  // 會飛的（蝶、神龍）才用 .pc-hover。腳下的葉子、雲是另外一層靜止道具（PROP，見下方），不放在角色裡，免得跳的時候一起跳。

  // 0 神秘之卵：淡淡的鯉鱗紋（預告會變成龍）、裂縫透暖光；直接坐在地上
  const EGG = `
    <g class="pc-bob pc-egg">
      ${P(E(100, 135, 48, 60), "#f1e4c0", { hl: [80, 105, 12, 22], dx: 8, dy: 8, sk: .18 })}
      <path class="pc-d2" d="${[[78, 147], [92, 143], [106, 143], [120, 147], [84, 159], [98, 156], [112, 159], [70, 159], [126, 159], [90, 171], [104, 170], [78, 173], [116, 173]].map(([x, y]) => `M${x - 6} ${y}q6 6 12 0`).join("")}" stroke="#d8c89a" stroke-width="1.6" fill="none" opacity=".8"/>
      <g class="pc-d">${[[76, 173, 4.5], [122, 179, 5], [116, 111, 3.6], [92, 186, 3.2], [132, 131, 3]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#c9ad74"/><circle cx="${x - r * .3}" cy="${y - r * .3}" r="${r * .45}" fill="#e2cc98"/>`).join("")}</g>
      <path class="pr-glow" d="M72 115 L84 125 L76 133 L90 141" stroke="#ffd98a" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/>
      ${tp(72, 115, 84, 125, 3.4, "#8a6a38")}${tp(84, 125, 76, 133, 3.4, "#8a6a38")}${tp(76, 133, 90, 141, 3.2, "#8a6a38")}
      <path class="pc-d" d="M84 125 l7 -3 M76 133 l-5 2" stroke="#8a6a38" stroke-width="1.6" stroke-linecap="round"/>
    </g>
    <g class="pc-tw"><path d="M150 66 l3 9 l9 3 l-9 3 l-3 9 l-3-9 l-9-3 l9-3Z" fill="#ffe6a0"/></g>
    <g class="pc-tw" style="animation-delay:1.1s"><path d="M44 96 l2 6 l6 2 l-6 2 l-2 6 l-2-6 l-6-2 l6-2Z" fill="#ffe6a0"/></g>`;

  // 1 草叢幼蟲：鳳蝶終齡幼蟲——翠綠、一節一節、胸部假眼紋（大圖）、小黑珠眼；臭角在頭後面（<!--O-->，戴帽子時拿掉，帽子戴在頭上）
  const LV = "#86c95a", LVS = [[[44, 166], [72, 180], [110, 176], [134, 146]]], LVW = [[0, 24], [.55, 32], [1, 36]];
  const lvFolds = spine(LVS, 10).filter((q, k) => k > 0 && k < 10 && k % 2 === 0).map(q => { const w = wAt(LVW, q.f) / 2; return `M${rd(q.x + q.nx * w * .95)} ${rd(q.y + q.ny * w * .95)}Q${rd(q.x + q.nx * w * .1 + Math.cos(q.a * Math.PI / 180) * 3)} ${rd(q.y + q.ny * w * .1 + Math.sin(q.a * Math.PI / 180) * 3)} ${rd(q.x - q.nx * w * .95)} ${rd(q.y - q.ny * w * .95)}`; }).join("");
  const LARVA = `
    <g class="pc-bob pc-larva">
      <g class="pr-deform">
      ${[[62, 186], [82, 189], [102, 187]].map(([x, y]) => P(E(x, y, 6, 5), "#6faa48", { sw: 2, dx: 1, dy: 1 })).join("")}
      ${P(C(44, 166, 12), LV, { dx: 3, dy: 3 })}
      ${P(Pa(tube(LVS, LVW, 0, 10)), LV, { hl: [84, 160, 14, 4] })}
      <path class="pc-d" d="${lvFolds}" stroke="${sh(LV, .3)}" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <path class="pc-d" d="M50 176 Q80 190 118 180" stroke="${tn(LV, .45)}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/>
      <g class="pc-d2" opacity=".85"><ellipse cx="112" cy="156" rx="5.4" ry="4.2" fill="#b89a5a"/><ellipse cx="112.6" cy="156.4" rx="3" ry="2.4" fill="#3a2c1c"/></g>
      ${[[134, 172], [142, 168], [150, 162]].map(([x, y]) => `<path d="M${x} ${y} l2 5" stroke="#3a4a20" stroke-width="3" stroke-linecap="round"/>`).join("")}
      </g>
      <g class="pr-head" style="--ox:132px;--oy:152px">
      <!--O--><g class="pc-tail">${tp(132, 128, 120, 116, 3.6, "#f29a3a", -2)}${tp(132, 128, 126, 112, 3.6, "#f29a3a", 2)}</g><!--/O-->
      ${P(C(148, 136, 23), "#a6d978", { hl: [138, 123, 8, 5], dx: 4, dy: 4 })}
      ${eyeOf("bead", 140, 135, 5, 5, -1)}${eyeOf("bead", 156, 135, 5, 5, 1)}
      ${blush(133, 144, 4.6, 2.8)}${blush(163, 144, 4.6, 2.8)}
      ${mouth(148, 145, `<path d="M144 145 q4 4 8 0" stroke="#3e5a1a" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
        `<ellipse cx="148" cy="147" rx="4.4" ry="3.6" fill="${MOUTH_IN}"/><path d="M143.6 144.4 l2 2.6 M152.4 144.4 l-2 2.6" stroke="#6a4a20" stroke-width="1.6" stroke-linecap="round"/>`,
        "", `<circle cx="140" cy="146" r="4.2" fill="#b2df86"/><circle cx="156" cy="146" r="4.2" fill="#b2df86"/>`)}
      <!--H--></g>
    </g>`;

  // 2 翩翩彩蝶：台灣常見的琉璃翠鳳蝶——黑褐底、橫過前後翅的一道琉璃翠帶、後翅紅色弦月紋＋藍色眼紋、鳳蝶的尾突。
  // （寬尾鳳蝶全身褐色，跟「彩蝶」這個名字對不起來）會飛，所以用 .pc-hover；臉是暖褐色、配複眼
  const BFD = "#2c2522", BFG = "#2fbfa8";
  function bfWings(m) {   // m＝1 右翅、-1 左翅（以 x=100 對稱）
    const X = x => 100 + m * (x - 100), fl = (d) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => X(+x) + " " + y);
    return P(Pa(fl("M106 94 Q132 58 170 56 Q180 68 172 84 Q150 106 108 108Z")), BFD, { hl: [X(150), 66, 12, 4], dx: m * 4, dy: 4, sk: .1 }) +
      `<path class="pc-d2" d="${fl("M108 98 L164 64 M108 101 L170 74 M108 104 L166 86 M108 106 L150 98")}" stroke="#5a4e48" stroke-width="1.2" opacity=".7"/>` +
      `<path d="${fl("M116 98 Q134 84 156 72")}" stroke="${BFG}" stroke-width="10" fill="none" stroke-linecap="round"/>` +
      `<path d="${fl("M118 97 Q134 85 152 75")}" stroke="#a6f0e2" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"/>` +
      `<g class="pc-d">${[[160, 62], [168, 70], [170, 80]].map(([x, y]) => `<circle cx="${X(x)}" cy="${y}" r="1.8" fill="#cfe9df"/>`).join("")}</g>` +
      P(Pa(fl("M108 110 Q138 108 154 124 Q158 140 142 146 L146 172 Q136 178 128 168 L124 148 Q110 140 106 118Z")), BFD, { dx: m * 3, dy: 3, sk: .1 }) +
      P(Pa(fl("M112 116 Q130 112 142 122 Q138 134 124 134 Q114 130 112 116Z")), BFG, { sw: 0, dx: m * 2, dy: 2, sk: .15 }) +
      `<path d="${fl("M146 128 Q150 132 149 137 M144 140 Q146 144 143 148")}" stroke="#e0503c" stroke-width="3" fill="none" stroke-linecap="round"/>` +
      `<circle cx="${X(132)}" cy="156" r="4.4" fill="#4a7fd0"/><circle cx="${X(132)}" cy="156" r="2" fill="#1a1410"/>`;
  }
  const BUTTERFLY = `
    <g class="pc-hover">
      <g class="pc-wing l">${bfWings(-1)}</g>
      <g class="pc-wing r">${bfWings(1)}</g>
      ${P(E(100, 126, 6.6, 20), "#3a2c24", { hl: [98, 116, 1.6, 5], dx: 2, dy: 2 })}
      <path class="pc-d" d="M94.5 116 h11 M94 124 h12 M94.5 132 h11 M96 140 h8" stroke="#1e1612" stroke-width="1.4" opacity=".7"/>
      ${P(E(100, 100, 9.4, 11), "#4a3a30", { dx: 2, dy: 2 })}
      <path class="pc-d2" d="M92 96 l-3 -2 M92 102 l-3 1 M108 96 l3 -2 M108 102 l3 1 M96 92 l-1 -3 M104 92 l1 -3" stroke="#8a7a6a" stroke-width="1.6" stroke-linecap="round"/>
      <g class="pr-head" style="--ox:100px;--oy:93px">
      <g class="pr-ant l" style="--ox:94px;--oy:70px">${tp(94, 70, 80, 48, 2.8, "#2a201a", -5)}${P(E(79, 46, 3.4, 5), "#2a201a", { sw: 1.6, dx: 1, dy: 1 })}</g>
      <g class="pr-ant r" style="--ox:106px;--oy:70px">${tp(106, 70, 120, 48, 2.8, "#2a201a", 5)}${P(E(121, 46, 3.4, 5), "#2a201a", { sw: 1.6, dx: 1, dy: 1 })}</g>
      ${P(C(100, 80, 15), "#a07a5a", { hl: [93, 72, 5, 3.2], dx: 3, dy: 3 })}
      <g class="pr-prob" style="--ox:100px;--oy:95px"><path class="pr-curl" d="M100 95 q4 4 0 7 q-3 2 -3 -1" stroke="#2a201a" stroke-width="1.4" fill="none" stroke-linecap="round"/>
        <path class="pr-ext" d="M100 95 Q101 118 100 142 q-1 4 -3 3" stroke="#2a201a" stroke-width="1.6" fill="none" stroke-linecap="round"/></g>
      ${eyeOf("compound", 92, 80, 5.8, 6.8, -1)}${eyeOf("compound", 108, 80, 5.8, 6.8, 1)}
      ${blush(88, 89, 3, 2)}${blush(112, 89, 3, 2)}
      ${mouth(100, 88, `<path d="M97 88 q3 3 6 0" stroke="#2a1608" stroke-width="1.8" fill="none" stroke-linecap="round"/>`, `<ellipse cx="100" cy="89.4" rx="3" ry="2.4" fill="${MOUTH_IN}"/>`)}
      <!--H--></g>
    </g>`;

  // 3 靈巧山狐：倒三角臉、吻部突出、耳尖黑、黑襪細腿、直立大尾巴＋白尾尖；杏眼＋直立縫瞳（狐狸真的是縫瞳）、眼角往鼻子的淚線
  const FX = "#d8672c", FXC = "#f8efdf", FXK = "#3b2519";
  const foxHead = () => `
      <g class="pc-ear l">${P(Pa("M64 81 L56 31 L98 63Z"), FX, { dx: 3, dy: 3 })}${P(Pa("M56 31 L59.2 51 Q66 51 73 44.2Z"), FXK, { sw: 0, dx: 1, dy: 1 })}${P(Pa("M68 73 L62 47 L88 63Z"), "#efdac6", { sw: 0, dx: 2, dy: 2 })}<path class="pc-d" d="M70 69 l-3 -8 M74 67 l-1 -7" stroke="#fffaf0" stroke-width="2" stroke-linecap="round"/></g>
      <g class="pc-ear r">${P(Pa("M136 81 L144 31 L102 63Z"), FX, { dx: 3, dy: 3 })}${P(Pa("M144 31 L140.8 51 Q134 51 127 44.2Z"), FXK, { sw: 0, dx: 1, dy: 1 })}${P(Pa("M132 73 L138 47 L112 63Z"), "#efdac6", { sw: 0, dx: 2, dy: 2 })}<path class="pc-d" d="M130 69 l3 -8 M126 67 l1 -7" stroke="#fffaf0" stroke-width="2" stroke-linecap="round"/></g>
      ${P(Pa("M58 77 Q66 59 100 57 Q134 59 142 77 Q146 93 158 105 Q138 109 125 121 Q112 137 100 139 Q88 137 75 121 Q62 109 42 105 Q54 93 58 77Z"), "#e2783a", { hl: [78, 71, 13, 7], dx: 6, dy: 6 })}
      ${P(Pa("M42 105 Q64 101 80 110 Q92 115 100 115 Q108 115 120 110 Q136 101 158 105 Q138 109 125 121 Q112 137 100 139 Q88 137 75 121 Q62 109 42 105Z"), FXC, { sw: 2.2, dx: 3, dy: 3 })}
      <g class="pc-d">${tp(42, 105, 30, 103, 4, FXC, -2)}${tp(46, 109, 34, 113, 3.4, FXC, 2)}${tp(158, 105, 170, 103, 4, FXC, 2)}${tp(154, 109, 166, 113, 3.4, FXC, -2)}</g>
      ${P(Pa("M91 95 Q100 90 109 95 L105 119 Q100 122 95 119Z"), "#e98a48", { sw: 0, dx: 2, dy: 2, sk: .12 })}
      ${tp(89, 99, 94, 113, 2.4, "#9a4518", -1)}${tp(111, 99, 106, 113, 2.4, "#9a4518", 1)}
      ${mouth(100, 129, `<path d="M100 127 v3 q-4 4 -8 1 M100 130 q4 4 8 1" stroke="#2a1810" stroke-width="2" fill="none" stroke-linecap="round"/>`,
        `<path d="M100 127 v2" stroke="#2a1810" stroke-width="2" stroke-linecap="round"/><path d="M91 129 Q100 126.5 109 129 Q107.5 140 100 141 Q92.5 140 91 129Z" fill="${MOUTH_IN}" stroke="#2a1810" stroke-width="1.6" stroke-linejoin="round"/><path d="M94.5 136 Q100 133.5 105.5 136 Q104 141 100 141 Q96 141 94.5 136Z" fill="${TONGUE}"/><path d="M93.6 129.6 l1.3 3.2 l1.5 -3.2Z M106.4 129.6 l-1.3 3.2 l-1.5 -3.2Z" fill="#fff"/>`,
        `<path d="M100 130 q2 6 7 6 q4 -1 3 -5 q-4 0 -10 -1Z" fill="${TONGUE}" stroke="#9a3a30" stroke-width="1"/>`,
        `<ellipse cx="86" cy="127" rx="6" ry="4.6" fill="${FXC}"/><ellipse cx="114" cy="127" rx="6" ry="4.6" fill="${FXC}"/>`)}
      <g class="pr-nose" style="--ox:100px;--oy:121px">${P(Pa("M93 120 Q100 116 107 120 Q105 126 100 127 Q95 126 93 120Z"), "#2a1810", { sw: 0, dx: 1, dy: 1 })}<ellipse cx="97.6" cy="120.6" rx="2" ry="1.2" fill="#fff" opacity=".6"/></g>
      <g class="pc-d">${[[88, 125], [85, 129], [112, 125], [115, 129]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.2" fill="#9a7a5a"/>`).join("")}</g>
      ${brow(72, 83, 88, 85, "#8a3f16")}${brow(128, 83, 112, 85, "#8a3f16")}
      ${eyeOf("almond", 81, 95, 9.2, 10.4, -1, "#b8702a", { pupil: "round", pr: .6, tilt: .18 })}${eyeOf("almond", 119, 95, 9.2, 10.4, 1, "#b8702a", { pupil: "round", pr: .6, tilt: .18 })}
`;   // 坐著和站著兩份身體共用同一顆頭（每次呼叫都有自己的 id）
  const FOX = `
    <g class="pc-bob">
      <g class="pc-tail">${P(Pa("M126 177 C158 183 182 165 184 135 C186 111 172 93 154 91 C168 109 166 133 152 151 C142 161 132 165 122 165Z"), FX, { hl: [172, 123, 4, 12] })}
        ${P(Pa("M154 91 C170 91 186 107 184 129 C178 117 168 111 160 111 C163 104 161 97 154 91Z"), FXC, { sw: 2.4, dx: 2, dy: 2 })}
        <path class="pc-d2" d="M174 137 q-6 10 -14 14 M168 127 q-4 8 -12 12 M178 151 q-8 10 -20 14" stroke="${sh(FX, .3)}" stroke-width="1.6" fill="none" stroke-linecap="round"/></g>
      ${rig("pr-foot r", 132, 190, P(E(132, 193, 11, 4.6), FXK, { sw: 2, dx: 2, dy: 2 }))}
      ${P(Pa("M72 193 C64 165 74 135 100 129 C126 125 140 147 140 169 C140 185 134 193 122 195Z"), FX, { hl: [82, 145, 6, 12] })}
      <path class="pc-d" d="M124 157 Q138 165 134 187" stroke="${sh(FX, .3)}" stroke-width="2" fill="none" stroke-linecap="round"/>
      ${rig("pr-paw l", 90, 157, P(Pa("M84 157 L83 191 Q90 196 97 191 L97 157Z"), FX, { dx: 2, dy: 2 }) + P(Pa("M83 175 L83 191 Q90 196 97 191 L97 175Q90 172 83 175Z"), FXK, { sw: 2, dx: 2, dy: 2 }))}
      ${rig("pr-paw r", 110, 157, P(Pa("M103 157 L103 191 Q110 196 117 191 L116 157Z"), FX, { dx: 2, dy: 2 }) + P(Pa("M103 175 L103 191 Q110 196 117 191 L116 175Q110 172 103 175Z"), FXK, { sw: 2, dx: 2, dy: 2 }))}
      <path class="pc-d" d="M88 191 v-4 M92 191 v-4 M108 191 v-4 M112 191 v-4" stroke="#6a4a38" stroke-width="1.4" stroke-linecap="round"/>
      ${P(Pa("M80 133 Q100 125 120 133 Q122 145 114 155 L110 149 L106 161 L100 151 L94 161 L90 149 L86 155 Q78 145 80 133Z"), FXC, { sw: 2.2, dx: 3, dy: 3 })}
      <path class="pc-d2" d="M92 137 l2 6 M100 135 v7 M108 137 l-2 6" stroke="${sh(FXC, .25)}" stroke-width="1.4" stroke-linecap="round"/>
      <g class="pr-head" style="--ox:100px;--oy:132px">
${foxHead()}
      <!--H--></g>
    </g>`;

  // 4 山林猛虎：瘦一圈、坐得挺——深胸、粗直的前腿、大腳掌；頭寬但不圓（頰毛往外翻），吻部突出、露兩顆小犬齒；
  // 石虎特徵（眼內側往額頭兩條白線、耳背黑底白斑）；圓瞳金眼＋上眼瞼往鼻子壓低＝專注、有威嚴
  const TG = "#ec913a", TGC = "#fbf3e3", TGK = "#2e1d0e";
  const stripe = (x0, y0, x1, y1, w, b) => tp(x0, y0, x1, y1, w, TGK, b);
  const TSP = [[[132, 186], [166, 190], [186, 164], [176, 128]]], TSW = [[0, 15], [1, 10]];
  const tgRings = spine(TSP, 12).filter((q, k) => k > 1 && k % 3 === 1).map(q => { const w = wAt(TSW, q.f) / 2 + 1; return `M${rd(q.x + q.nx * w)} ${rd(q.y + q.ny * w)}L${rd(q.x - q.nx * w)} ${rd(q.y - q.ny * w)}`; }).join("");
  const tigerHead = () => `
      <g class="pc-ear l">${P(C(64, 66, 14), TG, { sw: 2.6, dx: 2, dy: 2 })}<path d="M52 70 A12 12 0 0 1 70 54.5" stroke="${TGK}" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="56" cy="59" r="2.4" fill="#fbf3e3"/>${P(E(67, 69, 6.6, 7), "#f6e3cc", { sw: 0, dx: 1, dy: 1 })}</g>
      <g class="pc-ear r">${P(C(136, 66, 14), TG, { sw: 2.6, dx: 2, dy: 2 })}<path d="M148 70 A12 12 0 0 0 130 54.5" stroke="${TGK}" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="144" cy="59" r="2.4" fill="#fbf3e3"/>${P(E(133, 69, 6.6, 7), "#f6e3cc", { sw: 0, dx: 1, dy: 1 })}</g>
      ${P(Pa("M54 96 Q52 62 100 56 Q148 62 146 96 L160 102 L150 106 L156 114 L141 114 Q128 136 100 138 Q72 136 59 114 L44 114 L50 106 L40 102Z"), TG, { hl: [72, 70, 13, 6], dx: 6, dy: 7 })}
      ${P(Pa("M54 102 L42 104 L52 108 L48 116 L60 114 Q74 134 100 137 Q126 134 140 114 L152 116 L148 108 L158 104 L146 102 Q134 112 120 110 Q100 106 80 110 Q66 112 54 102Z"), TGC, { sw: 2.2, dx: 3, dy: 3 })}
      ${stripe(100, 57, 100, 72, 5.4, 0)}${stripe(85, 61, 92, 72, 4.4, 1)}${stripe(115, 61, 108, 72, 4.4, -1)}
      ${tp(93, 88, 90, 63, 3.2, TGC, 1)}${tp(107, 88, 110, 63, 3.2, TGC, -1)}
      ${stripe(56, 86, 72, 92, 4.8, 2)}${stripe(56, 100, 70, 101, 4.4, 1)}${stripe(144, 86, 128, 92, 4.8, -2)}${stripe(144, 100, 130, 101, 4.4, -1)}
      <g class="pc-d2">${stripe(62, 76, 74, 81, 3.2, 2)}${stripe(138, 76, 126, 81, 3.2, -2)}${stripe(68, 116, 78, 119, 3, 1)}${stripe(132, 116, 122, 119, 3, -1)}</g>
      ${P(E(78, 82, 9, 3.8), TGC, { sw: 0, dx: 1, dy: 1 })}${P(E(122, 82, 9, 3.8), TGC, { sw: 0, dx: 1, dy: 1 })}
      ${P(Pa("M84 104 Q100 98 116 104 Q122 116 112 124 Q100 128 88 124 Q78 116 84 104Z"), TGC, { sw: 2, dx: 2, dy: 2 })}
      <path class="pc-d" d="M100 112 v8" stroke="${sh(TGC, .3)}" stroke-width="1.4"/>
      <g class="pc-d">${[[88, 114], [92, 118], [96, 114], [104, 114], [108, 118], [112, 114]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.2" fill="#8a6a4a"/>`).join("")}</g>
      ${mouth(100, 113, `<path d="M100 110 v4 q-6 5 -11 1 M100 114 q6 5 11 1" stroke="#3a2014" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M92 117 l1.4 4 l1.8 -4.2Z M108 117 l-1.4 4 l-1.8 -4.2Z" fill="#fff" stroke="#3a2014" stroke-width="1" stroke-linejoin="round"/>`,
        `<path d="M100 110 v3" stroke="#3a2014" stroke-width="2.2" stroke-linecap="round"/><path d="M87 113 Q100 110 113 113 Q111.5 128 100 130 Q88.5 128 87 113Z" fill="${MOUTH_IN}" stroke="#3a2014" stroke-width="1.8" stroke-linejoin="round"/><path d="M92 122 Q100 119 108 122 Q106.5 129.5 100 130 Q93.5 129.5 92 122Z" fill="${TONGUE}"/><path d="M90.5 113.6 l1.6 4.4 l1.9 -4.6Z M109.5 113.6 l-1.6 4.4 l-1.9 -4.6Z M93 128.5 l1.2 -3 l1.4 3Z M107 128.5 l-1.2 -3 l-1.4 3Z" fill="#fff" stroke="#3a2014" stroke-width=".8" stroke-linejoin="round"/>`,
        `<path d="M100 115 q2 7 8 7 q5 -1 3 -6 q-5 0 -11 -1Z" fill="${TONGUE}" stroke="#9a3a30" stroke-width="1"/>`,
        `<ellipse cx="83" cy="113" rx="7" ry="5.4" fill="${TGC}"/><ellipse cx="117" cy="113" rx="7" ry="5.4" fill="${TGC}"/>`)}
      <g class="pr-nose" style="--ox:100px;--oy:103px">${P(Pa("M91 101 Q100 96 109 101 Q107 109 100 110 Q93 109 91 101Z"), "#3a2014", { sw: 0, dx: 1, dy: 1 })}<ellipse cx="96.6" cy="101.6" rx="2.4" ry="1.2" fill="#fff" opacity=".5"/></g>
      ${tp(68, 80, 88, 84, 4.6, TGK, -1.5)}${tp(132, 80, 112, 84, 4.6, TGK, 1.5)}
      ${eyeOf("round", 80, 92, 7.8, 8.4, -1, "#c98a2a", { pupil: "round", pr: .56, cut: TG, co: 1.05, ci: .78 })}${eyeOf("round", 120, 92, 7.8, 8.4, 1, "#c98a2a", { pupil: "round", pr: .56, cut: TG, co: 1.05, ci: .78 })}
`;   // 坐著和站著兩份身體共用
  const TIGER = `
    <g class="pc-bob pc-heavy">
      <g class="pc-tail">${P(Pa(tube(TSP, TSW, 0, 12)), TG, { dx: 3, dy: 3 })}<path d="${tgRings}" stroke="${TGK}" stroke-width="4.4" stroke-linecap="round"/>
        ${P(E(176, 126, 6.4, 8), TGK, { sw: 2, dx: 1, dy: 1 })}</g>
      ${P(Pa("M64 196 C56 166 66 132 100 122 C134 132 144 166 136 196Z"), TG, { hl: [78, 140, 6, 14] })}
      ${P(Pa("M100 128 Q120 136 121 162 Q116 182 100 188 Q84 182 79 162 Q80 136 100 128Z"), TGC, { sw: 2.4, dx: 3, dy: 3 })}
      ${stripe(60, 150, 74, 156, 4.6, 2)}${stripe(58, 166, 72, 170, 4.4, 1)}${stripe(62, 182, 74, 182, 4, 0)}${stripe(140, 150, 126, 156, 4.6, -2)}${stripe(142, 166, 128, 170, 4.4, -1)}${stripe(138, 182, 126, 182, 4, 0)}
      ${rig("pr-paw l", 83, 150, P(Pa("M74 148 Q68 170 69 190 Q82 194 94 190 Q93 168 92 150 Q84 144 74 148Z"), TG, { dx: 3, dy: 2 }) + stripe(71, 166, 81, 168, 3.4, 0) + stripe(71, 176, 80, 177, 3, 0) + P(E(82, 192, 14, 5.4), TG, { sw: 2.4, dx: 1, dy: 2 }) + `<path d="M76 195 v-4 M82 196 v-5 M88 195 v-4" stroke="${sh(TG, .5)}" stroke-width="1.8" stroke-linecap="round"/>`)}
      ${rig("pr-paw r", 117, 150, P(Pa("M126 148 Q132 170 131 190 Q118 194 106 190 Q107 168 108 150 Q116 144 126 148Z"), TG, { dx: 3, dy: 2 }) + stripe(129, 166, 119, 168, 3.4, 0) + stripe(129, 176, 120, 177, 3, 0) + P(E(118, 192, 14, 5.4), TG, { sw: 2.4, dx: 1, dy: 2 }) + `<path d="M112 195 v-4 M118 196 v-5 M124 195 v-4" stroke="${sh(TG, .5)}" stroke-width="1.8" stroke-linecap="round"/>`)}
      <g class="pr-head" style="--ox:100px;--oy:134px">
${tigerHead()}
      <!--H--></g>
    </g>`;

  // 5 初醒幼龍（2026-10-04 重畫）：東方小龍坐姿——拿掉蝙蝠翼（那是西方龍，跟神龍接不起來）。
  // 短圓吻部往前突、小鹿角只分一岔、牛耳、火焰鬃、兩根短捲龍鬚、節狀腹甲、尾巴上的背鰭、三爪、腳下小雲、旁邊一顆小光珠（預告龍珠）
  const JADE = "#4fae7e", JD = "#2f7c56", BELLY = "#efdca4", GOLD = "#dfbf72", MANE = "#358f82";
  const HTAIL = [[[118, 166], [146, 176], [166, 158], [158, 138]], [[158, 138], [154, 128], [146, 126], [140, 130]]];
  const hatchFins = spine(HTAIL, 8).filter((p, k) => k % 3 === 1 && p.f < .8).map(p => {
    const w = wAt([[0, 16], [1, 6]], p.f) / 2, bx = p.x + p.nx * w, by = p.y + p.ny * w, tx = Math.cos(p.a * Math.PI / 180), ty = Math.sin(p.a * Math.PI / 180);
    return `M${Math.round(bx - tx * 4)} ${Math.round(by - ty * 4)}L${Math.round(bx + p.nx * 7 + tx * 2)} ${Math.round(by + p.ny * 7 + ty * 2)}L${Math.round(bx + tx * 4)} ${Math.round(by + ty * 4)}Z`;
  }).join("");
  const HATCH_CLOUD = cloud([[78, 186, 11], [100, 182, 14], [124, 186, 11], [62, 190, 7], [140, 190, 7]], [[92, 188, 4.5, 1], [114, 189, 4, -1]]);
  const HATCHDRAGON = `
    <g class="pc-bob">
      <g class="pc-tail"><path d="${hatchFins}" fill="${MANE}" stroke="${sh(MANE, .45)}" stroke-width="1.8" stroke-linejoin="round"/>${P(Pa(tube(HTAIL, [[0, 16], [1, 6]], 0, 8)), JADE, { dx: 3, dy: 3 })}
        ${P(Pa("M141 131 Q130 118 136 108 Q140 118 146 120 Q146 110 154 106 Q152 118 148 128Z"), MANE, { sw: 2, dx: 2, dy: 2 })}</g>
      ${P(E(100, 148, 31, 29), JADE, { hl: [84, 132, 8, 4.5], dx: 4, dy: 5 })}
      ${P(Pa("M100 126 Q118 128 120 150 Q116 170 100 174 Q84 170 80 150 Q82 128 100 126Z"), BELLY, { sw: 2.2, dx: 3, dy: 3, sk: .14 })}
      <path d="M85 140 Q100 145 115 140 M83 151 Q100 156 117 151 M86 162 Q100 167 114 162" stroke="${sh(BELLY, .3)}" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <g class="pc-d2">${[[74, 142], [72, 154], [126, 142], [128, 154], [78, 130], [122, 130]].map(([x, y]) => `<path d="M${x - 3} ${y} q3 3.4 6 0" stroke="${JD}" stroke-width="1.3" fill="none" opacity=".55"/>`).join("")}</g>
      ${[[82, -1], [118, 1]].map(([fx, k]) => rig(`pr-foot ${k < 0 ? "l" : "r"}`, fx, 172, P(E(fx, 176, 11, 7), JADE, { sw: 2.4, dx: 2, dy: 2 }) + [-6, 0, 6].map(d => `<path d="M${fx + d - 2} ${(d ? 181 : 182) - 2} q2 5 4 0Z" fill="#f4ecd2" stroke="#9c8a5a" stroke-width="1.2" stroke-linejoin="round"/>`).join(""))).join("")}
      <g class="pc-tw">${P(Pa("M38 152 Q36 142 42 136 Q42 142 46 142 Q46 136 50 132 Q54 142 50 152Z"), "#ffa94a", { sw: 1.6, dx: 1, dy: 1 })}${P(C(44, 154, 8), "#ffdf86", { hl: [41, 151, 3, 2], dx: 2, dy: 2 })}</g>
      <g class="pr-head" style="--ox:100px;--oy:124px">
      ${[[-170, 16, 9, -4], [-150, 18, 10, -3], [-30, 18, 10, 3], [-10, 16, 9, 4], [160, 12, 8, 3], [20, 12, 8, -3]].map(([a, L, w, b]) => { const r = a * Math.PI / 180, x0 = 100 + Math.cos(r) * 30, y0 = 80 + Math.sin(r) * 24; return tpo(rd(x0), rd(y0), rd(x0 + Math.cos(r) * L), rd(y0 + Math.sin(r) * L), w, MANE, b); }).join("")}
      ${tpo(88, 56, 80, 34, 7, GOLD, 3)}${tpo(84, 45, 72, 41, 4.4, GOLD, 2)}${tpo(112, 56, 120, 34, 7, GOLD, -3)}${tpo(116, 45, 128, 41, 4.4, GOLD, -2)}
      <g class="pc-ear l">${P(Pa("M68 80 Q54 70 44 76 Q52 88 68 88Z"), JADE, { dx: 2, dy: 2 })}</g><g class="pc-ear r">${P(Pa("M132 80 Q146 70 156 76 Q148 88 132 88Z"), JADE, { dx: 2, dy: 2 })}</g>
      <path class="pc-d" d="M66 83 Q56 78 50 78 M134 83 Q144 78 150 78" stroke="${sh(JADE, .3)}" stroke-width="2" fill="none" stroke-linecap="round"/>
      ${P(E(100, 80, 35, 29), JADE, { hl: [82, 64, 11, 6], dx: 5, dy: 6 })}
      ${P(Pa("M78 94 Q72 112 86 121 Q100 128 114 121 Q128 112 122 94 Q100 86 78 94Z"), "#5cbb8a", { hl: [84, 100, 6, 3], dx: 4, dy: 4 })}
      ${P(Pa("M85 117 Q100 124 115 117 Q111 128 100 129 Q89 128 85 117Z"), BELLY, { sw: 2, dx: 2, dy: 2 })}
      ${P(Pa("M86 108 Q86 101 93 101 Q100 103 107 101 Q114 101 114 108 Q112 113 100 113 Q88 113 86 108Z"), "#6cc596", { hl: [92, 104, 3.4, 1.8], dx: 2, dy: 2, sw: 2 })}
      <path d="M91 108 q1 -3.4 4.2 -2 q0 2.6 -3 2.9 M109 108 q-1 -3.4 -4.2 -2 q0 2.6 3 2.9" stroke="${JD}" stroke-width="2" fill="none" stroke-linecap="round"/>
      ${mouth(100, 119, `<path d="M86 117 Q100 123 114 117" stroke="${JD}" stroke-width="2.3" fill="none" stroke-linecap="round"/><path d="M106 119.5 l1.2 4 l2 -4.6Z" fill="#fff" stroke="${JD}" stroke-width="1" stroke-linejoin="round"/>`,
        `<path d="M86 117 Q100 121 114 117 Q111 129 100 130 Q89 129 86 117Z" fill="${MOUTH_IN}" stroke="${JD}" stroke-width="1.8" stroke-linejoin="round"/><path d="M92 124 Q100 121.5 108 124 Q106 130 100 130 Q94 130 92 124Z" fill="${TONGUE}"/><path d="M90 118.6 l1.2 3.6 l1.8 -3.4Z M110 118.6 l-1.2 3.6 l-1.8 -3.4Z" fill="#fff"/>`,
        `<path d="M100 120 q2 6 7 6 q4 -1 3 -5 q-4 0 -10 -1Z" fill="${TONGUE}" stroke="#9a3a30" stroke-width="1"/>`,
        `<ellipse cx="84" cy="116" rx="6" ry="4.4" fill="#6cc596"/><ellipse cx="116" cy="116" rx="6" ry="4.4" fill="#6cc596"/>`)}
      <g class="pc-sway l">${P(Pa(tube([[[86, 109], [76, 106], [66, 108], [64, 116]], [[64, 116], [62, 122], [68, 124], [70, 120]]], [[0, 3.6], [1, 1.2]])), GOLD, { sw: 1.4, dx: 1, dy: 1 })}</g>
      <g class="pc-sway r">${P(Pa(tube([[[114, 109], [124, 106], [134, 108], [136, 116]], [[136, 116], [138, 122], [132, 124], [130, 120]]], [[0, 3.6], [1, 1.2]])), GOLD, { sw: 1.4, dx: 1, dy: 1 })}</g>
      ${brow(78, 72, 94, 73, JD)}${brow(122, 72, 106, 73, JD)}
      ${eyeOf("round", 87, 86, 8, 9.4, -1, "#c99a2a", { pupil: "slit", pw: .5 })}${eyeOf("round", 113, 86, 8, 9.4, 1, "#c99a2a", { pupil: "slit", pw: .5 })}
      <!--H--></g>
      <!-- 前爪畫在頭之後：撿果實舉到嘴邊時爪子要在下巴前面（平常不會跟頭重疊，看起來一樣）-->
      ${rig("pr-paw l", 76, 132, P(Pa(tube([[[76, 132], [72, 140], [72, 148], [76, 154]]], [[0, 11], [1, 9]])), JADE, { dx: 2, dy: 2 }) + claw(78, 156, 80, 3, JADE))}
      ${rig("pr-paw r", 124, 132, P(Pa(tube([[[124, 132], [128, 140], [128, 148], [124, 154]]], [[0, 11], [1, 9]])), JADE, { dx: 2, dy: 2 }) + claw(122, 156, 100, 3, JADE))}
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
  const DRAGON_CLOUD = cloud([[34, 178, 16], [58, 172, 20], [84, 180, 15], [16, 186, 10], [104, 186, 10]], [[46, 182, 6, 1], [76, 184, 5, -1]]) +
    cloud([[150, 176, 14], [170, 170, 16], [188, 178, 11], [130, 184, 9]], [[162, 178, 5, 1]]);
  const DRAGON = `
    <g class="pc-hover pc-soar">
      <g class="pr-deform"><g class="pc-tail">${P(Pa("M172 160 C180 168 184 180 176 192 C172 184 166 182 160 184 C166 178 164 170 166 164Z"), MANE, { dx: 2, dy: 2 })}
        <path class="pc-d" d="M172 168 q4 8 2 16 M167 172 q0 6 -3 9" stroke="${tn(MANE, .5)}" stroke-width="1.6" fill="none" stroke-linecap="round"/></g>
            ${dragonBody}
      ${P(Pa(tube([[[150, 146], [154, 152], [156, 158], [158, 164]]], [[0, 12], [1, 9]])), JADE, { dx: 2, dy: 2 })}${claw(159, 166, 70, 3, JADE)}</g>
      ${P(Pa(tube([[[104, 134], [96, 146], [88, 152], [78, 156]]], [[0, 13], [1, 9]])), JADE, { dx: 2, dy: 2 })}
      <g class="pc-tw"><circle cx="62" cy="160" r="19" fill="#ffd36a" opacity=".28"/></g>
      ${P(Pa("M46 160 Q42 142 52 134 Q53 144 58 145 Q56 130 66 122 Q67 136 73 140 Q77 134 80 128 Q86 144 78 160Z"), "#ffa94a", { sw: 2, dx: 2, dy: 2, sk: .15 })}
      <path class="pc-d" d="M54 150 Q53 142 57 138 Q60 146 64 146 Q63 136 67 131 Q70 142 74 146" fill="none" stroke="#ffe39a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      ${P(C(62, 162, 14), "#ffdf86", { hl: [56, 155, 5, 3.5], dx: 3, dy: 3, sk: .25 })}
      <path class="pc-d" d="M54 164 q6 6 14 -2 q2 -6 -4 -7" stroke="#e0a83a" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      ${claw(76, 157, 160, 4, JADE)}
      <g class="pr-head" style="--ox:86px;--oy:108px">
      ${[[-160, 22, 10, -6], [-136, 26, 11, -4], [-112, 22, 9, 3], [-30, 26, 11, 5], [-5, 34, 13, 7], [22, 36, 14, 8], [48, 32, 12, 7], [74, 22, 10, 5]].map(([a, L, w, b]) => { const r = a * Math.PI / 180, x0 = 66 + Math.cos(r) * 22, y0 = 78 + Math.sin(r) * 20; return tpo(rd(x0), rd(y0), rd(x0 + Math.cos(r) * L), rd(y0 + Math.sin(r) * L), w, MANE, b); }).join("")}
      <g class="pc-d">${[[-140, 18, 5, -4], [-112, 18, 5, 2], [8, 22, 5, 5], [38, 22, 5, 5]].map(([a, L, w, b]) => { const r = a * Math.PI / 180, x0 = 66 + Math.cos(r) * 26, y0 = 78 + Math.sin(r) * 24; return tp(rd(x0), rd(y0), rd(x0 + Math.cos(r) * L), rd(y0 + Math.sin(r) * L), w, tn(MANE, .45), b); }).join("")}</g>
      ${tpo(52, 56, 38, 24, 8, GOLD, 5)}${tpo(45, 42, 29, 38, 5.4, GOLD, 3)}${tpo(41, 33, 45, 19, 4.4, GOLD, -2)}
      ${tpo(80, 56, 94, 24, 8, GOLD, -5)}${tpo(87, 42, 103, 38, 5.4, GOLD, -3)}${tpo(91, 33, 87, 19, 4.4, GOLD, 2)}
      <g class="pc-d">${tp(48, 50, 41, 32, 2, tn(GOLD, .5), 3)}${tp(84, 50, 91, 32, 2, tn(GOLD, .5), -3)}</g>
      <g class="pc-ear l">${P(Pa("M40 72 Q24 62 14 70 Q24 82 42 80Z"), JADE, { dx: 2, dy: 2 })}</g><g class="pc-ear r">${P(Pa("M92 72 Q108 62 118 70 Q108 82 90 80Z"), JADE, { dx: 2, dy: 2 })}</g>
      <path class="pc-d" d="M38 75 Q26 70 20 71 M94 75 Q106 70 112 71" stroke="${sh(JADE, .3)}" stroke-width="2" fill="none" stroke-linecap="round"/>
      ${P(E(66, 72, 29, 25), JADE, { hl: [52, 58, 10, 5.5], dx: 5, dy: 6 })}
      ${P(Pa("M42 86 Q36 108 50 120 Q66 128 82 120 Q96 108 90 86 Q66 78 42 86Z"), "#5cbb8a", { hl: [50, 94, 6, 3], dx: 4, dy: 5 })}
      ${rig("pr-jaw", 66, 116, P(Pa("M49 116 Q66 124 83 116 Q78 130 66 132 Q54 130 49 116Z"), BELLY, { sw: 2, dx: 2, dy: 2 }) + tp(59, 130, 53, 146, 5, MANE, -3) + tp(66, 132, 66, 150, 6, MANE, 2) + tp(73, 130, 79, 146, 5, MANE, 3))}
      <path class="pc-d" d="M66 80 Q68 88 66 96" stroke="${sh(JADE, .25)}" stroke-width="2" fill="none" stroke-linecap="round"/>
      ${P(Pa("M50 106 Q50 98 58 98 Q66 101 74 98 Q82 98 82 106 Q80 112 66 112 Q52 112 50 106Z"), "#6cc596", { hl: [57, 101, 4, 2], dx: 2, dy: 2, sw: 2.2 })}
      <path d="M55 106 q1 -4 5 -2.5 q0 3 -3.6 3.4 M77 106 q-1 -4 -5 -2.5 q0 3 3.6 3.4" stroke="${JD}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      ${mouth(66, 118, `<path d="M48 116 Q66 123 84 116" stroke="${JD}" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M75 119 l1.5 5 l2.5 -5.6Z" fill="#fff" stroke="${JD}" stroke-width="1.1" stroke-linejoin="round"/>`,
        `<path d="M48 116 Q66 121 84 116 Q81 131 66 133 Q51 131 48 116Z" fill="${MOUTH_IN}" stroke="${JD}" stroke-width="2" stroke-linejoin="round"/><path d="M56 126 Q66 122.5 76 126 Q74 132.5 66 133 Q58 132.5 56 126Z" fill="${TONGUE}"/><path d="M53 117.2 l1.6 5 l2.2 -4.8Z M79 117.2 l-1.6 5 l-2.2 -4.8Z M58 131 l1.4 -3.4 l1.6 3.4Z M74 131 l-1.4 -3.4 l-1.6 3.4Z" fill="#fff" stroke="${JD}" stroke-width=".8" stroke-linejoin="round"/>`,
        `<path d="M66 120 q2 7 8 7 q5 -1 3 -6 q-5 0 -11 -1Z" fill="${TONGUE}" stroke="#9a3a30" stroke-width="1"/>`,
        `<ellipse cx="48" cy="112" rx="6" ry="4.6" fill="#5cbb8a"/><ellipse cx="84" cy="112" rx="6" ry="4.6" fill="#5cbb8a"/>`)}
      <g class="pc-sway l">${P(Pa(tube([[[51, 107], [34, 102], [20, 100], [12, 110]], [[12, 110], [6, 120], [12, 130], [22, 126]]], [[0, 4.6], [1, 1.2]])), GOLD, { sw: 1.6, dx: 1, dy: 1 })}</g>
      <g class="pc-sway r">${P(Pa(tube([[[81, 107], [98, 102], [114, 103], [122, 113]], [[122, 113], [128, 123], [122, 132], [114, 128]]], [[0, 4.6], [1, 1.2]])), GOLD, { sw: 1.6, dx: 1, dy: 1 })}</g>
      ${tp(40, 64, 63, 72, 6.4, sh(JADE, .55), -2)}${tp(92, 64, 69, 72, 6.4, sh(JADE, .55), 2)}
      ${eyeOf("almond", 52, 79, 8.4, 7.4, -1, "#d9a032", { pupil: "slit", pw: .36, lid: .3, cut: JADE, co: .95, ci: .7 })}${eyeOf("almond", 80, 79, 8.4, 7.4, 1, "#d9a032", { pupil: "slit", pw: .36, lid: .3, cut: JADE, co: .95, ci: .7 })}
      <!--H--></g>
    </g>`;

  // ── 站姿（2026-10-04 走過去吃）：狐、虎坐著是正面，嘴碰不到地上；走路時換成側身站姿（面朝左，往右走時鏡像）──
  // 每條腿＝大腿（支點：肩／髖）＋小腿與腳掌（支點：膝），pet-walk.js 每一格給角度；遠側的腿畫在身體後面、顏色暗一點。
  // 脖子（pr-neck，支點在肩上）帶著跟坐姿同一顆頭（縮小），低頭吃東西時脖子往下轉。平常藏著（.pr-stand），分享圖卡也不畫。
  function jleg(cls, hx, hy, L1, L2, w1, w2, col, sock, paw, far) {
    const c = far ? sh(col, .2) : col, k = hy + L1, f = k + L2;
    const thigh = P(Pa(tube([[[hx, hy], [hx - 1, hy + L1 * .35], [hx + 1, hy + L1 * .7], [hx, k]]], [[0, w1], [1, w2]])), c, { dx: 2, dy: 2, sw: 2.2 });
    const shin = P(Pa(tube([[[hx, k], [hx, k + L2 * .35], [hx, k + L2 * .7], [hx, f]]], [[0, w2], [1, w2 * .82]])), sock ? (far ? sh(sock, .15) : sock) : c, { dx: 1.5, dy: 1.5, sw: 2 });
    const pw = P(E(hx - 3, f + 1, paw, paw * .5), sock ? (far ? sh(sock, .15) : sock) : sh(c, .1), { sw: 2, dx: 1, dy: 1 });
    const cap = far ? "" : `<ellipse cx="${hx}" cy="${hy + 2}" rx="${rd(w1 * .62)}" ry="${rd(w1 * .55)}" fill="${c}"/>`;   // 近側的腿：頂端蓋一塊身體色，看不到大腿跟身體的接縫
    return `<g class="pr-leg ${cls}" style="--ox:${hx}px;--oy:${hy}px">${thigh}${cap}<g class="pr-shin" style="--ox:${hx}px;--oy:${k}px">${shin}${pw}</g></g>`;
  }
  const FOX_STAND = `
    <g class="pr-stand" data-legs="${[[94, 140], [80, 142], [148, 138], [140, 140]].map(q => q.join(",")).join(" ")}">
      ${jleg("fr far", 94, 140, 26, 28, 12, 8, FX, FXK, 7, true)}${jleg("hr far", 148, 138, 26, 30, 15, 8, FX, FXK, 7, true)}
      <g class="pc-tail" style="--ox:156px;--oy:132px">${P(Pa("M152 126 C172 118 194 104 190 78 C202 98 198 126 172 140 C164 144 156 142 152 136Z"), FX, { hl: [182, 104, 4, 10] })}${P(Pa("M190 78 C202 92 200 112 192 122 C190 108 186 96 182 90 C186 86 188 82 190 78Z"), FXC, { sw: 2.2, dx: 2, dy: 2 })}</g>
      <g class="pr-torso">${P(Pa("M64 140 Q66 116 100 114 Q140 112 158 126 Q168 142 156 156 Q130 166 100 163 Q72 161 64 140Z"), FX, { hl: [96, 122, 18, 5], dx: 3, dy: 4 })}
        ${P(Pa("M76 152 Q108 166 150 154 Q132 166 104 166 Q84 164 76 152Z"), FXC, { sw: 1.8, dx: 1, dy: 1 })}
        ${P(E(144, 140, 17, 15), FX, { hl: [138, 132, 6, 3], dx: 2, dy: 3 })}</g>
      ${jleg("fl near", 80, 142, 26, 28, 13, 8.5, FX, FXK, 7.5)}${jleg("hl near", 140, 140, 27, 29, 16, 8.5, FX, FXK, 7.5)}
      ${P(Pa("M62 130 Q58 146 70 158 L74 150 L78 160 L82 148 Q82 136 74 126Z"), FXC, { sw: 2, dx: 2, dy: 2 })}
      <g class="pr-neck" style="--ox:84px;--oy:128px">${P(Pa("M58 138 Q54 116 64 100 Q78 90 94 100 Q100 122 98 138 Q78 148 58 138Z"), FX, { dx: 2, dy: 2, sw: 0 })}
        <g class="pr-head2" transform="translate(66 84) scale(.64) translate(-100 -100)"><g class="pr-head" style="--ox:100px;--oy:132px">${foxHead()}<!--H2--></g></g></g>
    </g>`;
  const TIGER_STAND = `
    <g class="pr-stand">
      ${jleg("fr far", 96, 140, 25, 26, 15, 11, TG, "", 9.5, true)}${jleg("hr far", 150, 136, 26, 28, 18, 11, TG, "", 9.5, true)}
      <g class="pc-tail" style="--ox:160px;--oy:132px">${P(Pa(tube([[[158, 132], [184, 128], [196, 108], [188, 86]]], [[0, 12], [1, 8]])), TG, { dx: 2, dy: 2 })}${P(E(188, 84, 5.4, 7), TGK, { sw: 1.6, dx: 1, dy: 1 })}
        <path d="M176 128 l4 -8 M188 118 l6 -4 M192 102 l6 0" stroke="${TGK}" stroke-width="3.6" stroke-linecap="round"/></g>
      <g class="pr-torso">${P(Pa("M62 140 Q64 112 102 110 Q146 108 164 124 Q174 142 160 158 Q132 170 100 167 Q70 165 62 140Z"), TG, { hl: [98, 118, 20, 5], dx: 3, dy: 4 })}
        ${P(Pa("M74 154 Q110 170 154 156 Q134 170 104 170 Q82 168 74 154Z"), TGC, { sw: 1.8, dx: 1, dy: 1 })}
        ${[[96, 112, 92, 134], [112, 110, 110, 136], [128, 111, 128, 138], [144, 114, 146, 136], [80, 116, 78, 132]].map(([a, b, c, d]) => stripe(a, b, c, d, 5, 2)).join("")}
        ${P(E(148, 138, 19, 17), TG, { hl: [142, 130, 6, 3], dx: 2, dy: 3 })}${stripe(150, 126, 156, 146, 4.4, 2)}${stripe(140, 128, 144, 148, 4, 2)}</g>
      ${jleg("fl near", 80, 142, 25, 26, 16, 11.5, TG, "", 10)}${jleg("hl near", 144, 138, 27, 28, 19, 11.5, TG, "", 10)}
      ${P(Pa("M60 128 Q54 146 68 160 L72 152 L76 162 L80 150 Q80 136 72 124Z"), TGC, { sw: 2, dx: 2, dy: 2 })}
      <g class="pr-neck" style="--ox:84px;--oy:126px">${P(Pa("M56 138 Q50 114 62 98 Q78 88 96 98 Q102 120 100 138 Q78 148 56 138Z"), TG, { dx: 2, dy: 2, sw: 0 })}${stripe(66, 106, 82, 110, 4, 1)}${stripe(68, 120, 84, 124, 4, 1)}
        <g class="pr-head2" transform="translate(64 82) scale(.66) translate(-100 -100)"><g class="pr-head" style="--ox:100px;--oy:134px">${tigerHead()}<!--H2--></g></g></g>
    </g>`;
  const A = [EGG, LARVA, BUTTERFLY, FOX + FOX_STAND, TIGER + TIGER_STAND, HATCHDRAGON, DRAGON];
  // 腳下的靜止道具（只在夥伴卡用，畫在角色後面的另一層）：角色跳、伸懶腰時它不動
  const LEAF = `${P(Pa("M10 192 Q56 172 116 178 Q162 182 192 196 Q140 200 80 199 Q32 198 10 192Z"), "#5f9a48", { sw: 2.4, dx: 3, dy: 3 })}<path d="M18 192 Q90 184 186 195" stroke="#4a7d38" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M56 188 l-8 7 M88 186 l-6 9 M120 188 l-4 9 M72 187 l6 -6 M104 187 l6 -6 M140 190 l6 -5" stroke="#4a7d38" stroke-width="1.6" stroke-linecap="round"/>`;
  const PROP = ["", LEAF, "", "", "", HATCH_CLOUD, DRAGON_CLOUD];
  // 帽子插入點：卵在第一組（頭）結尾；其餘在最後一組結尾
  A[0] = A[0].replace(/<\/g>\s*<g class="pc-tw">/, "<!--H--></g>\n    <g class=\"pc-tw\">");
  for (let k = 1; k < A.length; k++) if (!A[k].includes("<!--H-->")) A[k] = A[k].replace(/<\/g>\s*$/, "<!--H--></g>");   // 有骨架的：帽子在 pr-head 裡（跟著頭動）

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
    [100, 81, 1.0],   // 0 卵：蛋坐在地上（2026-10-04 往下移）
    [148, 108, 0.6],  // 1 幼蟲：頭在右邊、縮小（戴帽子時臭角會拿掉）
    [100, 58, 0.52],  // 2 蝶：小頭、上移縮小
    [100, 55, 1.0],   // 3 狐（參考）
    [100, 54, 0.98],  // 4 虎
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
  // 戴帽子時拿掉 <!--O-->…<!--/O-->（幼蟲的臭角）：帽子要戴在頭上，不是戴在臭角上
  function body(i, hatId) { const pre = "p" + (++U).toString(36) + "_"; let a = A[clamp(i)]; if (HATS[hatId]) a = a.replace(/<!--O-->[\s\S]*?<!--\/O-->/, ""); return a.replace("<!--H-->", hatG(hatId, i)).replace("<!--H2-->", hatG(hatId, i)).replace(/§/g, pre); }
  function prop(i) { const p = PROP[clamp(i)]; if (!p) return ""; const pre = "q" + (++U).toString(36) + "_"; return `<svg class="pet-prop" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${p.replace(/§/g, pre)}</svg>`; }
  function svg(i, cls, hatId) {
    return `<svg class="pet-critter ${cls || ""}" viewBox="0 0 200 200" role="img" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body(i, hatId)}</svg>`;
  }
  function byEmoji(e) { return EMOJI.indexOf(e); }   // 找不到回 -1
  // 給 canvas 用：帶 width/height 的獨立 SVG data URI（靜態一幀，供 new Image().src 光柵化畫進分享圖卡）
  // hatId 有給就把配件一起畫進去（合照用）
  function dataUri(i, size, hatId) {
    const s = size || 120;
    // 圖片裡吃不到 style.css：開心瞇眼要自己藏起來（以前分享圖卡會同時畫出睜眼和 ^^ 眼）；質感細節 .pc-d2 照畫（圖卡夠大）
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 200 200"><style>.pc-eh,.m-o,.m-t,.m-p,.pr-ext,.pr-stand{display:none}</style>${body(i, hatId)}</svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }
  function habitatUri(i, w, h) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w || 400}" height="${h || 150}" viewBox="0 0 400 150" preserveAspectRatio="none">${HAB[clamp(i)]}</svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }
  // 頭和身體的分界（佔畫面高度的比例）：點這條線以上＝摸頭、以下＝搔癢。
  // 以前一律用 0.5，但幼蟲的頭在畫面下半部（y 97～143），點頭會被當成搔癢
  const HEAD_LINE = [.5, .8, .5, .68, .68, .62, .64];
  const headLine = i => HEAD_LINE[clamp(i)];
  return { svg, count: A.length, byEmoji, dataUri, habitat, habitatUri, hat, HAT_IDS, HAT_LABEL, headLine, prop };
})();
