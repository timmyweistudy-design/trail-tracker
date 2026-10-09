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
  const rd = v => Math.round(v * 10) / 10, RD = rd;
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

  // 接觸點（2026-10-05 第二輪）：看不見的點，跟著所在的部位一起移動／旋轉／翻面；pet-walk.js 的 cpt() 用 getScreenCTM 換成畫面座標
  // palm-l/r＝幼龍手掌、tail＝神龍尾尖（在 .pr-deform 裡，尾巴彎它就跟著動）、crack＝蛋吸收果實的那道裂紋；嘴用 .pr-mouth 自己的支點
  const CP = (name, x, y) => `<circle class="cp cp-${name}" cx="${x}" cy="${y}" r="0"/>`;
  // 0 神秘之卵：淡淡的鯉鱗紋（預告會變成龍）、裂縫透暖光；直接坐在地上
  const EGG = `
    <g class="pc-bob pc-egg">
      ${P(E(100, 135, 48, 60), "#f1e4c0", { hl: [80, 105, 12, 22], dx: 8, dy: 8, sk: .18 })}
      <path class="pc-d2" d="${[[78, 147], [92, 143], [106, 143], [120, 147], [84, 159], [98, 156], [112, 159], [70, 159], [126, 159], [90, 171], [104, 170], [78, 173], [116, 173]].map(([x, y]) => `M${x - 6} ${y}q6 6 12 0`).join("")}" stroke="#d8c89a" stroke-width="1.6" fill="none" opacity=".8"/>
      <g class="pc-d">${[[76, 173, 4.5], [122, 179, 5], [116, 111, 3.6], [92, 186, 3.2], [132, 131, 3]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#c9ad74"/><circle cx="${x - r * .3}" cy="${y - r * .3}" r="${r * .45}" fill="#e2cc98"/>`).join("")}</g>
      <path class="pr-glow" d="M72 115 L84 125 L76 133 L90 141" stroke="#ffd98a" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/>
      ${tp(72, 115, 84, 125, 3.4, "#8a6a38")}${tp(84, 125, 76, 133, 3.4, "#8a6a38")}${tp(76, 133, 90, 141, 3.2, "#8a6a38")}
      <path class="pc-d" d="M84 125 l7 -3 M76 133 l-5 2" stroke="#8a6a38" stroke-width="1.6" stroke-linecap="round"/>${CP("crack", 82, 128)}
      <g class="pc-crack2"><path class="pr-glow" d="M90 141 L100 136 L108 146" stroke="#ffd98a" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/>${tp(90, 141, 100, 136, 3, "#8a6a38")}${tp(100, 136, 108, 146, 2.8, "#8a6a38")}</g>
      <g class="pc-crack3"><path class="pr-glow" d="M124 100 L132 114 L125 122 L134 132" stroke="#ffd98a" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/>${tp(124, 100, 132, 114, 3, "#8a6a38")}${tp(132, 114, 125, 122, 3, "#8a6a38")}${tp(125, 122, 134, 132, 2.6, "#8a6a38")}</g>
    </g>
    <g class="pc-tw"><path d="M150 66 l3 9 l9 3 l-9 3 l-3 9 l-3-9 l-9-3 l9-3Z" fill="#ffe6a0"/></g>
    <g class="pc-tw" style="animation-delay:1.1s"><path d="M44 96 l2 6 l6 2 l-6 2 l-2 6 l-2-6 l-6-2 l6-2Z" fill="#ffe6a0"/></g>`;

  // 1 草叢幼蟲：鳳蝶終齡幼蟲——翠綠、一節一節、胸部假眼紋（大圖）、小黑珠眼；臭角在頭後面（<!--O-->，戴帽子時拿掉，帽子戴在頭上）
  // 腳（2026-10-08 修正案 R2）：照真的鳳蝶幼蟲——胸部 3 節是尖的胸足（畫在 k7、k8）、腹部 4 對肉足（k3～k6）＋尾足（k1）；以前只有尾端兩節有肉足。
  //   動作維持使用者 10/06 要的拱身走：拱起來的那幾節腳跟著離地、貼地的那幾節腳踩在地上
  const LV = "#86c95a", LVS = [[[44, 166], [72, 180], [110, 176], [134, 146]]], LVW = [[0, 24], [.55, 32], [1, 36]];
  // 2026-10-06 改成一節一節畫（9 節，尾→頭）：每一節是自己的橢圓（明暗、描邊、氣門），有腹足的節底下有腳——
  // 動作時每一節各自移動（pet-walk.js 排位置），掉頭時依遠近重新排序，近的那節蓋在遠的上面（以前整條是一條 path，U 型迴轉時兩段的描邊會交叉成一團）
  // 2026-10-06 第四輪改「管片」：分兩層畫——下層 .lv-ln 是每一片的外框（粗描邊）＋腳，上層 .lv-seg 是每一片的填色。
  // 所有填色蓋在所有外框上面，所以外框只剩身體最外圈那一條、連續柔軟（以前每節都是完整的圓圈，像一串珠子）；節與節之間只剩淡淡的摺線。
  // 兩層的第 k 片一起移動（pet-walk lvPose），U 型迴轉時兩層各自依遠近排先後
  function lvSegs() {
    const S = spine(LVS, 8), ln = [], fl = [];
    S.forEach((q, k) => {
      const w = wAt(LVW, q.f) / 2 + 1, rx = 11.5, ry = k === 0 ? 11.5 : w, ryb = ry * .8, x = rd(q.x), y = rd(q.y), a = rd(q.a);
      const shape = `M${rd(x - rx)} ${y} A${rx} ${rd(ry)} 0 0 1 ${rd(x + rx)} ${y} A${rx} ${rd(ryb)} 0 0 1 ${rd(x - rx)} ${y}Z`;   // 上面是弧、肚子比較平
      const yb = rd(y + ryb), st = `data-u="${x}" data-v="${y}" data-b="${yb}" style="--ox:${x}px;--oy:${y}px"`;   // data-b：肚子底部（趴平時用）
      const legs = [1, 3, 4, 5, 6].includes(k) ? `<g class="lv-pro"><path d="M${rd(x - 4.4)} ${rd(yb - 3)} L${rd(x + 4.4)} ${rd(yb - 3)} L${rd(x + 3.2)} ${rd(yb + 5)} L${rd(x - 3.2)} ${rd(yb + 5)}Z" fill="#6aa646" stroke="${sh(LV, .5)}" stroke-width="1.8" stroke-linejoin="round"/><path d="M${rd(x - 3.4)} ${rd(yb + 5.6)} h6.8" stroke="#2f4a1c" stroke-width="1.8" stroke-linecap="round"/></g>`   // 肉足：短胖、底下一排小鉤
        : k >= 7 ? `<path d="M${rd(x - 2)} ${rd(yb - 2)} l2.4 6.6 l1.8 -1" stroke="#33461c" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` : "";   // 胸足（尖的）
      ln.push(`<g class="lv-sl" ${st}>${legs}<path transform="rotate(${a} ${x} ${y})" d="${shape}" fill="${sh(LV, .48)}" stroke="${sh(LV, .48)}" stroke-width="4.4" stroke-linejoin="round"/></g>`);
      const fold = k > 0 ? `<path class="pc-d" d="M${rd(x - rx * .62)} ${rd(y - ry * .8)} Q${rd(x - rx * .9)} ${rd(y + ryb * .1)} ${rd(x - rx * .62)} ${rd(y + ryb * .8)}" stroke="${sh(LV, .22)}" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".5"/>` : "";   // 摺線（在這一片的後緣、前一片的上面）
      const eye = k === 7 ? `<g class="pc-d2" opacity=".85"><ellipse cx="${rd(x - 1)}" cy="${rd(y - ry * .2)}" rx="5.4" ry="4.2" fill="#b89a5a"/><ellipse cx="${rd(x - .4)}" cy="${rd(y - ry * .16)}" rx="3" ry="2.4" fill="#3a2c1c"/></g>` : "";   // 假眼紋
      const spot = k >= 1 && k <= 7 ? `<circle class="pc-d" cx="${rd(x + 1)}" cy="${rd(y + ryb * .3)}" r="1.4" fill="${sh(LV, .45)}"/>` : "";   // 氣門
      const band = `<path class="pc-d" d="M${rd(x - rx - 1)} ${rd(y + ryb * .55)} L${rd(x + rx + 1)} ${rd(y + ryb * .55)}" stroke="${tn(LV, .45)}" stroke-width="2.6" fill="none" opacity=".6"/>`;   // 肚子那一側的淺色帶（相鄰幾片接成一條）
      fl.push(`<g class="lv-seg" ${st}><g transform="rotate(${a} ${x} ${y})">${P(Pa(shape), LV, { hl: [rd(x), rd(y - ry * .5), rd(rx * .85), rd(ry * .18)], dx: 2, dy: 2, sw: 0 })}${band}${fold}${spot}${eye}</g></g>`);
    });
    return `<g class="lv-ln">${ln.join("")}</g>${fl.join("")}`;
  }
  const LARVA = `
    <g class="pc-bob pc-larva">
      <g class="pr-deform lv-body">${lvSegs()}</g>
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
    // 前翅、後翅分開（2026-10-05）：拍翅時前翅帶頭、後翅晚一點跟上；後翅畫在前翅後面（真的鳳蝶前翅蓋在後翅上）
    const fore = P(Pa(fl("M106 94 Q132 58 170 56 Q180 68 172 84 Q150 106 108 108Z")), BFD, { hl: [X(150), 66, 12, 4], dx: m * 4, dy: 4, sk: .1 }) +
      `<path class="pc-d2" d="${fl("M108 98 L164 64 M108 101 L170 74 M108 104 L166 86 M108 106 L150 98")}" stroke="#5a4e48" stroke-width="1.2" opacity=".7"/>` +
      `<path d="${fl("M116 98 Q134 84 156 72")}" stroke="${BFG}" stroke-width="10" fill="none" stroke-linecap="round"/>` +
      `<path d="${fl("M118 97 Q134 85 152 75")}" stroke="#a6f0e2" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"/>` +
      `<g class="pc-d">${[[160, 62], [168, 70], [170, 80]].map(([x, y]) => `<circle cx="${X(x)}" cy="${y}" r="1.8" fill="#cfe9df"/>`).join("")}</g>`;
    const hind = P(Pa(fl("M108 110 Q138 108 154 124 Q158 140 142 146 L146 172 Q136 178 128 168 L124 148 Q110 140 106 118Z")), BFD, { dx: m * 3, dy: 3, sk: .1 }) +
      P(Pa(fl("M112 116 Q130 112 142 122 Q138 134 124 134 Q114 130 112 116Z")), BFG, { sw: 0, dx: m * 2, dy: 2, sk: .15 }) +
      `<path d="${fl("M146 128 Q150 132 149 137 M144 140 Q146 144 143 148")}" stroke="#e0503c" stroke-width="3" fill="none" stroke-linecap="round"/>` +
      `<circle cx="${X(132)}" cy="156" r="4.4" fill="#4a7fd0"/><circle cx="${X(132)}" cy="156" r="2" fill="#1a1410"/>`;
    return `<g class="pc-hw">${hind}</g><g class="pc-fw">${fore}</g>`;
  }
  // 六隻腳（停下來吃的時候才伸出來）：從胸部往外、膝蓋往上彎、腳尖都落在同一條線（y≈160）
  const BF_LEGS = `<g class="pr-legs" stroke="#2a201a" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round">${[[118, 84, 128, 79, 159], [124, 87, 136, 87, 160], [130, 91, 142, 94, 160]].map(([y0, kx, ky, fx, fy]) => `<path d="M97 ${y0} L${kx} ${ky} L${fx} ${fy}"/><path d="M103 ${y0} L${200 - kx} ${ky} L${200 - fx} ${fy}"/>`).join("")}</g>`;
  const BUTTERFLY = `
    <g class="pc-hover">
      <g class="pc-wing l">${bfWings(-1)}</g>
      <g class="pc-wing r">${bfWings(1)}</g>
      ${BF_LEGS}
      ${P(E(100, 126, 6.6, 20), "#3a2c24", { hl: [98, 116, 1.6, 5], dx: 2, dy: 2 })}
      <path class="pc-d" d="M94.5 116 h11 M94 124 h12 M94.5 132 h11 M96 140 h8" stroke="#1e1612" stroke-width="1.4" opacity=".7"/>
      ${P(E(100, 100, 9.4, 11), "#4a3a30", { dx: 2, dy: 2 })}
      <path class="pc-d2" d="M92 96 l-3 -2 M92 102 l-3 1 M108 96 l3 -2 M108 102 l3 1 M96 92 l-1 -3 M104 92 l1 -3" stroke="#8a7a6a" stroke-width="1.6" stroke-linecap="round"/>
      <g class="pr-head" style="--ox:100px;--oy:93px">
      <g class="pr-ant l" style="--ox:94px;--oy:70px">${tp(94, 70, 80, 48, 2.8, "#2a201a", -5)}${P(E(79, 46, 3.4, 5), "#2a201a", { sw: 1.6, dx: 1, dy: 1 })}</g>
      <g class="pr-ant r" style="--ox:106px;--oy:70px">${tp(106, 70, 120, 48, 2.8, "#2a201a", 5)}${P(E(121, 46, 3.4, 5), "#2a201a", { sw: 1.6, dx: 1, dy: 1 })}</g>
      ${P(C(100, 80, 15), "#a07a5a", { hl: [93, 72, 5, 3.2], dx: 3, dy: 3 })}
      <g class="pr-prob" style="--ox:100px;--oy:95px"><path class="pr-curl" d="M100 95 q4 4 0 7 q-3 2 -3 -1" stroke="#2a201a" stroke-width="1.4" fill="none" stroke-linecap="round"/>
        <path class="pr-ext" d="M100 95 Q101 118 100 142 q-1 4 -3 3" stroke="#c49a66" stroke-width="2" fill="none" stroke-linecap="round"/></g>
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
      <g class="pc-sb">${P(Pa("M72 193 C64 165 74 135 100 129 C126 125 140 147 140 169 C140 185 134 193 122 195Z"), FX, { hl: [82, 145, 6, 12] })}
      <path class="pc-d" d="M124 157 Q138 165 134 187" stroke="${sh(FX, .3)}" stroke-width="2" fill="none" stroke-linecap="round"/></g>
      <g class="pr-loaf" opacity="0">${P(E(134, 180, 20, 13), FX, { dx: 2, dy: 2 })}${P(E(100, 184, 44, 13), FX, { hl: [84, 178, 12, 3], dx: 3, dy: 3 })}${P(E(100, 186, 22, 8), FXC, { sw: 0, dx: 1, dy: 1 })}${P(Pa("M70 182 Q66 150 100 144 Q134 150 130 182Z"), FX, { hl: [84, 156, 5, 8], dx: 3, dy: 3 })}${P(Pa("M86 182 Q84 158 100 154 Q116 158 114 182Z"), FXC, { sw: 0, dx: 1, dy: 1 })}</g>
      ${rig("pr-paw l", 90, 157, P(Pa("M84 157 L83 191 Q90 196 97 191 L97 157Z"), FX, { dx: 2, dy: 2 }) + P(Pa("M83 175 L83 191 Q90 196 97 191 L97 175Q90 172 83 175Z"), FXK, { sw: 2, dx: 2, dy: 2 }))}
      ${rig("pr-paw r", 110, 157, P(Pa("M103 157 L103 191 Q110 196 117 191 L116 157Z"), FX, { dx: 2, dy: 2 }) + P(Pa("M103 175 L103 191 Q110 196 117 191 L116 175Q110 172 103 175Z"), FXK, { sw: 2, dx: 2, dy: 2 }))}
      <g class="pr-lpaws" opacity="0">${P(E(89, 176, 7, 6), FX, { dx: 1, dy: 1 })}${P(E(111, 176, 7, 6), FX, { dx: 1, dy: 1 })}${P(E(89, 182, 9.5, 5), FXK, { sw: 2, dx: 1, dy: 2 })}${P(E(111, 182, 9.5, 5), FXK, { sw: 2, dx: 1, dy: 2 })}<path d="M85 185 v-3 M89 186 v-3 M93 185 v-3 M107 185 v-3 M111 186 v-3 M115 185 v-3" stroke="#f3e6d6" stroke-opacity=".55" stroke-width="1.3" stroke-linecap="round"/></g>
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
  // 正面站姿（橋）：深胸、肩膀寬，後腿在前腿外側；條紋跟坐姿、側身同一組位置（肩上兩條、後腿各兩條、尾巴環）
  const TIGER = `
    <g class="pc-bob pc-heavy">
      <g class="pc-tail">${P(Pa(tube(TSP, TSW, 0, 12)), TG, { dx: 3, dy: 3 })}<path d="${tgRings}" stroke="${TGK}" stroke-width="4.4" stroke-linecap="round"/>
        ${P(E(176, 126, 6.4, 8), TGK, { sw: 2, dx: 1, dy: 1 })}</g>
      <g class="pc-sb">${P(Pa("M64 196 C56 166 66 132 100 122 C134 132 144 166 136 196Z"), TG, { hl: [78, 140, 6, 14] })}
      ${P(Pa("M100 128 Q120 136 121 162 Q116 182 100 188 Q84 182 79 162 Q80 136 100 128Z"), TGC, { sw: 2.4, dx: 3, dy: 3 })}
      ${stripe(60, 150, 74, 156, 4.6, 2)}${stripe(58, 166, 72, 170, 4.4, 1)}${stripe(62, 182, 74, 182, 4, 0)}${stripe(140, 150, 126, 156, 4.6, -2)}${stripe(142, 166, 128, 170, 4.4, -1)}${stripe(138, 182, 126, 182, 4, 0)}</g>
      <g class="pr-loaf" opacity="0">${P(E(138, 179, 22, 14), TG, { dx: 2, dy: 2 })}${stripe(132, 170, 140, 184, 4, 1)}${stripe(146, 170, 150, 182, 3.6, 1)}${P(E(100, 184, 48, 14), TG, { hl: [82, 178, 13, 3], dx: 3, dy: 3 })}${P(E(100, 186, 24, 8), TGC, { sw: 0, dx: 1, dy: 1 })}${stripe(60, 178, 70, 190, 4, 1)}${P(Pa("M64 184 Q60 146 100 138 Q140 146 136 184Z"), TG, { hl: [80, 152, 5, 9], dx: 3, dy: 3 })}${P(Pa("M84 184 Q82 154 100 150 Q118 154 116 184Z"), TGC, { sw: 0, dx: 1, dy: 1 })}${stripe(68, 158, 78, 162, 4, 1)}${stripe(132, 158, 122, 162, 4, -1)}</g>
      ${rig("pr-paw l", 83, 150, P(Pa("M74 148 Q68 170 69 190 Q82 194 94 190 Q93 168 92 150 Q84 144 74 148Z"), TG, { dx: 3, dy: 2 }) + stripe(71, 166, 81, 168, 3.4, 0) + stripe(71, 176, 80, 177, 3, 0) + P(E(82, 192, 14, 5.4), TG, { sw: 2.4, dx: 1, dy: 2 }) + `<path d="M76 195 v-4 M82 196 v-5 M88 195 v-4" stroke="${sh(TG, .5)}" stroke-width="1.8" stroke-linecap="round"/>`)}
      ${rig("pr-paw r", 117, 150, P(Pa("M126 148 Q132 170 131 190 Q118 194 106 190 Q107 168 108 150 Q116 144 126 148Z"), TG, { dx: 3, dy: 2 }) + stripe(129, 166, 119, 168, 3.4, 0) + stripe(129, 176, 120, 177, 3, 0) + P(E(118, 192, 14, 5.4), TG, { sw: 2.4, dx: 1, dy: 2 }) + `<path d="M112 195 v-4 M118 196 v-5 M124 195 v-4" stroke="${sh(TG, .5)}" stroke-width="1.8" stroke-linecap="round"/>`)}
      <g class="pr-lpaws" opacity="0">${P(E(84, 175, 9, 6), TG, { dx: 1, dy: 1 })}${P(E(116, 175, 9, 6), TG, { dx: 1, dy: 1 })}${P(E(84, 181, 13, 6), TG, { sw: 2.4, dx: 1, dy: 2 })}${P(E(116, 181, 13, 6), TG, { sw: 2.4, dx: 1, dy: 2 })}<path d="M77 185 v-3 M83 186 v-4 M89 185 v-3 M111 185 v-3 M117 186 v-4 M123 185 v-3" stroke="${sh(TG, .5)}" stroke-width="1.8" stroke-linecap="round"/></g>
      <g class="pr-head" style="--ox:100px;--oy:134px">
${tigerHead()}
      <!--H--></g>
    </g>`;

  // 5 初醒幼龍（2026-10-04 重畫）：東方小龍坐姿——拿掉蝙蝠翼（那是西方龍，跟神龍接不起來）。
  // 短圓吻部往前突、小鹿角只分一岔、牛耳、火焰鬃、兩根短捲龍鬚、節狀腹甲、尾巴上的背鰭、三爪、旁邊一顆小光珠（預告龍珠）；2026-10-05 拿掉腳下的雲（走在地上，慶祝跳時才噗出雲）
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
      ${rig("pr-paw l", 76, 132, P(Pa(tube([[[76, 132], [72, 140], [72, 148], [76, 154]]], [[0, 11], [1, 9]])), JADE, { dx: 2, dy: 2 }) + claw(78, 156, 80, 3, JADE) + CP("palm-l", 79, 160))}
      ${rig("pr-paw r", 124, 132, P(Pa(tube([[[124, 132], [128, 140], [128, 148], [124, 154]]], [[0, 11], [1, 9]])), JADE, { dx: 2, dy: 2 }) + claw(122, 156, 100, 3, JADE) + CP("palm-r", 121, 160))}
    </g>`;

  // 6 騰雲神龍（2026-10-04 重畫）：東方龍「九似」——駝頭長吻、鹿角、牛耳、蛇身、蜃腹（節狀腹甲）、鯉鱗、鷹爪、龍鬚、
  // 分層後飄的鬃、背鰭、前爪抓火焰龍珠；身體穿進穿出祥雲。配色接幼龍的玉綠＋金米色。
  // 2026-10-07 尾巴全面重新設計（使用者：「尾巴還是沒修好，要全方面重新設計」）：
  //   以前尾巴是整條身體路徑的一部分，彎尾巴＝把身體上的每個點跟著最近的那一節搬過去（裝飾被剪歪），要畫在最上層還得把整條身體再畫一份、剪裁、淡入（雙重輪廓、繪圖量多一倍）；
  //   尾巴從背上的拱才能動、全長只有 114，嘴離起點 96——送到嘴邊只能拉成一根直棍橫過身體。
  //   現在：①尾巴加長兩段（沿著雲一路拖到龍珠下方），全長 114 → 約 210；平常尾尖就在嘴的下方不遠，送到嘴前可以像象鼻從胸前下方往上捲；
  //   ②尾巴是一條獨立的管子，外形、腹帶、腹甲、鱗、背鰭都由「中心線」產生（dragonTail），pet-walk 每格給新的中心線就重畫——怎麼彎都不會剪歪；
  //   ③尾巴只有一份、畫在頭和龍珠後面（最上層），不用淡入淡出。身體畫到尾巴根部多一點，接縫蓋在尾巴下面
  const DSP = [[[86, 104], [100, 140], [114, 166], [138, 160]], [[138, 160], [158, 154], [146, 106], [166, 98]], [[166, 98], [188, 90], [182, 140], [172, 162]],
    [[172, 162], [164.5, 178.5], [150, 194], [124, 188]], [[124, 188], [112, 185.2], [101, 183], [90, 177]]];   // 接點兩邊的控制點共線（切線連續，外框不會折一個角）
  const DW = [[0, 30], [.204, 28], [.42, 19], [.6, 12], [.8, 8.5], [1, 5.5]], DBW = [[0, 12], [.204, 11], [.42, 7], [.6, 4], [1, 1.4]], DHW = [[0, 4], [.3, 4], [.6, 1.2], [1, .5]];
  const DN = 16, DI0 = 28, DT0 = DI0 - 3, DB = DT0 - 4;   // DI0：尾巴從這一節起能動（pet-walk 的 I0）；DT0：尾巴的管子從這一節畫起；DB：底色多往回鋪 4 節（陰影錯位才不會在接縫露出一條暗邊）
  const DPTS = spine(DSP, DN), DF = DPTS.map(p => p.f), DWK = [DW, DBW, DHW].map(ws => DF.map(f => wAt(ws, f) / 2)),   // 每一節的半寬先算好（尾巴每格重畫，不用每次內插）
    FAN = "M172 160 C180 168 184 180 176 192 C172 184 166 182 160 184 C166 178 164 170 166 164Z", FAN_A = Math.atan2(20, -18) * 180 / Math.PI;
  // pts：{x,y,nx,ny,a,f}，k0：第一個點是第幾節（背鰭、腹甲、鱗照節數挑，身體和尾巴兩段才接得起來）；from：裝飾從第幾節開始畫
  function dragonDeco(pts, k0, from, X) {
    const rd = X ? v => Math.round(v * X) : RD;   // X：輸出放大幾倍取整數（尾巴每格重畫：整數轉字串比小數快好幾倍，群組再 scale 回來）
    const side = (ws, off, s) => { const L = [], R = [], hw = DWK[ws]; pts.slice(s || 0).forEach((p, i) => { const w = hw[k0 + (s || 0) + i], o = off * w * 2; L.push([p.x + p.nx * (o + w), p.y + p.ny * (o + w)]); R.push([p.x + p.nx * (o - w), p.y + p.ny * (o - w)]); }); return [L, R.reverse()]; };
    const J = q => q.map(v => rd(v[0]) + " " + rd(v[1])).join(" "), Z = s => "M" + J(s[0].concat(s[1])) + "Z", O = s => "M" + J(s[0]) + "M" + J(s[1]);
    const mine = (k, m, r) => k >= from && (k + k0) % m === r;
    const fins = pts.map((p, i) => [p, i + k0]).filter(([p, k]) => mine(k - k0, 3, 1) && p.f > .05 && p.f < .97).map(([p, k]) => {
      const w = DWK[0][k], bx = p.x - p.nx * w, by = p.y - p.ny * w, h = 5 + w * .35, tx = Math.cos(p.a * Math.PI / 180), ty = Math.sin(p.a * Math.PI / 180);
      return `M${rd(bx - tx * 4)} ${rd(by - ty * 4)}L${rd(bx - p.nx * h + tx * 3)} ${rd(by - p.ny * h + ty * 3)}L${rd(bx + tx * 5)} ${rd(by + ty * 5)}Z`;
    }).join("");
    const plates = pts.map((p, i) => [p, i]).filter(([p, i]) => mine(i, 2, 0) && p.f > .03 && p.f < .92).map(([p, i]) => { const w = DWK[0][k0 + i]; return `M${rd(p.x + p.nx * w * .2)} ${rd(p.y + p.ny * w * .2)}L${rd(p.x + p.nx * w * .95)} ${rd(p.y + p.ny * w * .95)}`; }).join("");
    const scales = pts.map((p, i) => [p, i]).filter(([p, i]) => mine(i, 2, 1) && p.f < .9).map(([p, i]) => {
      const w = DWK[0][k0 + i], c = Math.cos((p.a + 90) * Math.PI / 180), si = Math.sin((p.a + 90) * Math.PI / 180), R = (x, y, u, v) => rd(x + u * c - v * si) + " " + rd(y + u * si + v * c);
      return [-.62, -.12].map(o => { const x = p.x + p.nx * w * o, y = p.y + p.ny * w * o; return `M${R(x, y, -3.2, 0)}Q${R(x, y, 0, 3.6)} ${R(x, y, 3.2, 0)}`; }).join("");
    }).join("");
    const body = side(0, 0, from), belly = side(1, .3, from);   // 0：外形、1：腹帶、2：亮帶（DWK 的順序）
    return { fins, plates, scales, s: Z(body), ln: O(body), b: Z(side(0, 0)), e: Z(belly), el: O(belly), eb: Z(side(1, .3)), hl: Z(side(2, -.22, from)) };
  }
  // 中心線（[x,y] 陣列，從第 DB 節到尾尖）→ 尾巴每一個部件的 path，加上尾鰭的 transform
  function dragonTail(xy) {
    const n = xy.length, pts = xy.map((q, i) => { const a = xy[Math.max(0, i - 1)], b = xy[Math.min(n - 1, i + 1)], tx = b[0] - a[0], ty = b[1] - a[1], L = Math.hypot(tx, ty) || 1; return { x: q[0], y: q[1], nx: -ty / L, ny: tx / L, a: Math.atan2(ty, tx) * 180 / Math.PI, f: DF[DB + i] }; });
    const o = dragonDeco(pts, DB, DT0 - DB, 10), t = pts[n - 1];   // 座標放大 10 倍（.pr-tail6 有 scale(.1)）
    o.fl = `translate(${Math.round(t.x * 10)} ${Math.round(t.y * 10)}) rotate(${rd(t.a - FAN_A)}) scale(10) translate(-172 -162)`;
    return o;
  }
  const dragonBody = (() => {   // 身體（頭到尾巴根部多一點，靜止不變；繩波由 pet-walk 逐點移）
    const o = dragonDeco(DPTS.slice(0, DI0 + 2), 0, 0), d = dragonDeco(DPTS.slice(0, DT0 + 1), 0, 0);   // 外形畫到根部多兩節；裝飾只畫到 DT0（後面被尾巴蓋住）
    return `<path d="${d.fins}" fill="${MANE}" stroke="${sh(MANE, .45)}" stroke-width="2" stroke-linejoin="round"/>` + P(Pa(o.b), JADE, { dx: 4, dy: 5 }) +
      P(Pa(o.eb), BELLY, { sw: 1.6, dx: 2, dy: 2, sk: .14 }) + `<path d="${d.plates}" stroke="${sh(BELLY, .3)}" stroke-width="1.6" stroke-linecap="round"/>` +
      `<path d="${d.hl}" fill="${tn(JADE, .35)}" opacity=".7"/>` + `<path class="pc-d2" d="${d.scales}" stroke="${JD}" stroke-width="1.3" fill="none" opacity=".55"/>`;
  })();
  const dragonTailSvg = (() => {
    const o = dragonTail(DPTS.slice(DB).map(p => [p.x, p.y]));
    return `<g class="pr-tail6" transform="scale(.1)"><path class="t6-fin" d="${o.fins}" fill="${MANE}" stroke="${sh(MANE, .45)}" stroke-width="20" stroke-linejoin="round"/>` +
      `<defs><path id="§t6s" class="t6-s" d="${o.s}"/><path id="§t6b" class="t6-b" d="${o.b}"/><path id="§t6e" class="t6-e" d="${o.e}"/><path id="§t6eb" class="t6-eb" d="${o.eb}"/></defs>` +
      `<clipPath id="§t6c"><use href="#§t6s"/></clipPath><clipPath id="§t6d"><use href="#§t6e"/></clipPath>` +
      `<use href="#§t6s" fill="${sh(JADE, .2)}"/><g clip-path="url(#§t6c)"><use href="#§t6b" fill="${JADE}" transform="translate(-40 -50)"/>` +
      `<use href="#§t6e" fill="${sh(BELLY, .14)}"/><g clip-path="url(#§t6d)"><use href="#§t6eb" fill="${BELLY}" transform="translate(-20 -20)"/></g></g>` +
      `<path class="t6-ln" d="${o.ln}" fill="none" stroke="${sh(JADE, .48)}" stroke-width="30" stroke-linejoin="round" stroke-linecap="round"/>` +
      `<path class="t6-el" d="${o.el}" fill="none" stroke="${sh(BELLY, .48)}" stroke-width="16" stroke-linejoin="round" stroke-linecap="round"/>` +
      `<path class="t6-pl" d="${o.plates}" stroke="${sh(BELLY, .3)}" stroke-width="16" stroke-linecap="round"/><path class="t6-hl" d="${o.hl}" fill="${tn(JADE, .35)}" opacity=".7"/>` +
      `<path class="pc-d2 t6-sc" d="${o.scales}" stroke="${JD}" stroke-width="13" fill="none" opacity=".55"/>` +
      `<g class="pr-fluke" transform="${o.fl}"><g class="pc-tail">${P(Pa(FAN), MANE, { dx: 2, dy: 2 })}<path class="pc-d" d="M172 168 q4 8 2 16 M167 172 q0 6 -3 9" stroke="${tn(MANE, .5)}" stroke-width="1.6" fill="none" stroke-linecap="round"/></g>${CP("tail", 172, 162)}</g></g>`;   // 尾尖＝最後一節（尾巴的 IK 目標就是這一點）
  })();

  const DC1 = [[34, 178, 16], [58, 172, 20], [84, 180, 15], [16, 186, 10], [104, 186, 10]], DC2 = [[150, 176, 14], [170, 170, 16], [188, 178, 11], [130, 184, 9]];
  const DRAGON_CLOUD = cloud(DC1, [[46, 182, 6, 1], [76, 184, 5, -1]]) + cloud(DC2, [[162, 178, 5, 1]]);
  // 雲面高度（圖上 x 處雲的頂；沒有雲＝null）：神龍的果實落在雲上（pet-stage.js）
  const cloudTop6 = x => { let t = null; for (const [cx, cy, r] of DC1.concat(DC2)) if (Math.abs(x - cx) < r) { const y = cy - Math.sqrt(r * r - (x - cx) * (x - cx)); t = t == null ? y : Math.min(t, y); } return t; };
  const DRAGON = `
    <g class="pc-hover pc-soar">
      <g class="pr-deform">${dragonBody}
      <g class="pr-rigid" transform="translate(154 150)"><g transform="matrix(1 0 0 1 -154 -150)">${P(Pa(tube([[[150, 146], [152, 152], [152, 158], [151, 164]]], [[0, 12], [1, 9]])), JADE, { dx: 2, dy: 2 })}${claw(151, 166, 92, 3, JADE)}</g></g></g>
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
      ${dragonTailSvg}
      <g class="pr-pearl"><!-- 平常前爪和龍珠在尾巴前面；尾巴送果實／玩的時候 pet-walk 的 tailLayer 把這一組搬到頭的前面（尾巴就到最上層）-->${P(Pa(tube([[[104, 134], [96, 146], [88, 152], [78, 156]]], [[0, 13], [1, 9]])), JADE, { dx: 2, dy: 2 })}
      <g class="pc-tw"><circle cx="62" cy="160" r="19" fill="#ffd36a" opacity=".28"/></g>
      ${P(Pa("M46 160 Q42 142 52 134 Q53 144 58 145 Q56 130 66 122 Q67 136 73 140 Q77 134 80 128 Q86 144 78 160Z"), "#ffa94a", { sw: 2, dx: 2, dy: 2, sk: .15 })}
      <path class="pc-d" d="M54 150 Q53 142 57 138 Q60 146 64 146 Q63 136 67 131 Q70 142 74 146" fill="none" stroke="#ffe39a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      ${P(C(62, 162, 14), "#ffdf86", { hl: [56, 155, 5, 3.5], dx: 3, dy: 3, sk: .25 })}
      <path class="pc-d" d="M54 164 q6 6 14 -2 q2 -6 -4 -7" stroke="#e0a83a" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      ${claw(76, 157, 160, 4, JADE)}</g>
    </g>`;

  // 頭裡面再包一層 .pr-hfx（2026-10-05 第二輪「控制權分層」）：外層 .pr-head 給姿勢（低頭、走路、看手指——JS 或狀態 class），
  // 內層給咬、嚼、吞、摸頭這些 CSS 小動作。以前兩種都寫在同一個元素的 transform 上，誰後寫誰贏：嚼的動畫一播，低頭的位移就被蓋掉（頭彈起來離開身體）
  function wrapHeads(src) {
    let out = "", i = 0;
    const open = /<g class="pr-head"[^>]*>/g; let m;
    while ((m = open.exec(src))) {
      let j = m.index + m[0].length, depth = 1;
      const tag = /<g\b[^>]*?(\/?)>|<\/g>/g; tag.lastIndex = j; let t;
      while (depth && (t = tag.exec(src))) { if (t[0] === "</g>") depth--; else if (!t[1]) depth++; }
      const close = t.index;   // 這個頭自己的 </g>
      out += src.slice(i, j) + '<g class="pr-hfx">' + src.slice(j, close) + "</g>"; i = close; open.lastIndex = close;
    }
    return out + src.slice(i);
  }
  const A = [EGG, LARVA, BUTTERFLY, FOX, TIGER, HATCHDRAGON, DRAGON].map(wrapHeads);
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
  // ── 帽子 v2（2026-10-09 修正案 R8-2，使用者：「裝扮太粗糙，所有配件都要設計精緻一點」）──
  // 每一頂都用角色同一套 P()（有色外框、右下暗面、左上高光），再加材質細節；座標以 (100,45) 為帽子中心、帽緣在 y≈55（跟舊版相同，掛點表不用全改）
  const HATS = {
    // 草帽：帽頂＋寬帽緣、編織紋（交錯短線）、紅色帽帶＋小蝴蝶結
    straw: P(E(100, 56, 50, 12.5), "#dcb06a", { hl: [80, 52, 16, 3], dx: 2, dy: 3, sw: 2.2 }) +
      `<path d="M58 55 q42 9 84 0 M64 60 q36 7 72 0" stroke="#b98a45" stroke-width="1.2" fill="none" opacity=".6"/>` +
      P(Pa("M72 56 Q74 22 100 21 Q126 22 128 56Z"), "#ecc882", { hl: [88, 32, 7, 10], dx: 3, dy: 3, sw: 2.2 }) +
      `<path d="M78 36 h44 M76 44 h48 M81 28 h38" stroke="#c99a52" stroke-width="1.1" stroke-dasharray="3 2.4" opacity=".75"/>` +
      P(Pa("M72.5 49 Q100 56 127.5 49 L127.8 55 Q100 62 72.2 55Z"), "#c8443a", { dx: 1, dy: 1.5, sw: 1.6 }) +
      P(Pa("M118 52 l9 -5 l1 9Z M118 52 l9 5 l-6 5Z"), "#d65446", { dx: .8, dy: .8, sw: 1.2 }),
    // 派對帽：圓錐＋斜條紋（裁在帽身裡）、點點、毛球
    party: `<clipPath id="§phc"><path d="M100 6 L79 53 Q100 61 121 53Z"/></clipPath>` + P(Pa("M100 6 L79 53 Q100 61 121 53Z"), "#e2657f", { hl: [93, 30, 3, 12], dx: 3, dy: 2, sw: 2.2 }) +
      `<g clip-path="url(#§phc)" opacity=".9"><path d="M70 44 L130 22 M70 58 L130 36 M70 30 L130 8" stroke="#fbe6a0" stroke-width="5"/></g>` +
      `<circle cx="96" cy="47" r="1.8" fill="#7ac0d8"/><circle cx="107" cy="38" r="1.6" fill="#7ac0d8"/>` +
      P(C(100, 7, 7.5), "#f2c94c", { hl: [97, 4, 2.5, 1.8], dx: 1.5, dy: 1.5, sw: 1.8 }) + `<path d="M96 4 l-2 -3 M104 4 l2 -3 M100 1 v-2.4" stroke="#e0a82a" stroke-width="1.4" stroke-linecap="round"/>`,
    // 花冠：藤蔓＋葉子＋五朵不同的花（有花心、花瓣暗面）
    crown: `<path d="M58 53 Q100 33 142 53" stroke="#4e8f3f" stroke-width="5.5" fill="none" stroke-linecap="round"/><path d="M58 53 Q100 33 142 53" stroke="#7ab963" stroke-width="2" fill="none" stroke-linecap="round" opacity=".7"/>` +
      [[72, 45, -30], [128, 45, 30], [86, 39, -60], [114, 39, 60]].map(([x, y, a]) => P(Pa(`M${x} ${y} q6 -9 13 -6 q-4 9 -13 6Z`), "#6aab55", { dx: .8, dy: .8, sw: 1.2 })).join("") +
      [[64, 50, 7, "#e78aa8"], [82, 41, 7.5, "#f6f0f4"], [100, 36, 9, "#f2c94c"], [118, 41, 7.5, "#a8c8ef"], [136, 50, 7, "#e78aa8"]].map(([x, y, r, c]) =>
        [0, 72, 144, 216, 288].map(a => P(E(x, y - r * .55, r * .42, r * .58).replace("<ellipse", `<ellipse transform="rotate(${a} ${x} ${y})"`), c, { dx: .6, dy: .8, sw: 1 })).join("") + `<circle cx="${x}" cy="${y}" r="${(r * .32).toFixed(1)}" fill="#f7c04a" stroke="#c8902a" stroke-width=".8"/>`).join(""),
    // 蝴蝶結：兩片有摺痕的布＋中間的結＋兩條垂下的緞帶
    bow: P(Pa("M100 42 C88 28 72 26 74 42 C72 56 88 56 100 42Z"), "#d95a7a", { hl: [81, 36, 4, 2.6], dx: 2, dy: 2, sw: 2 }) +
      P(Pa("M100 42 C112 28 128 26 126 42 C128 56 112 56 100 42Z"), "#d95a7a", { hl: [115, 36, 4, 2.6], dx: 2, dy: 2, sw: 2 }) +
      `<path d="M78 36 q8 4 14 5 M78 48 q8 -4 14 -4 M122 36 q-8 4 -14 5 M122 48 q-8 -4 -14 -4" stroke="#a83d5a" stroke-width="1.3" fill="none" opacity=".6"/>` +
      P(Pa("M96 46 l-6 14 l5 -2 l2 5 l4 -16Z M104 46 l6 14 l-5 -2 l-2 5 l-4 -16Z"), "#c94a6c", { dx: .8, dy: 1, sw: 1.3 }) +
      P(E(100, 42, 6.5, 7.5), "#b8405f", { hl: [98, 39, 2, 1.6], dx: 1, dy: 1, sw: 1.6 }),
    // 登山頭巾：每月挑戰第一次完成才解鎖（不能用果實買）——布紋＋白色變形蟲花紋＋側邊打結的兩條布尾
    bandana: P(Pa("M61 51 Q100 22 139 51 L136 60 Q100 42 64 60Z"), "#d9573f", { hl: [86, 38, 9, 2.5], dx: 2, dy: 3, sw: 2 }) +
      `<path d="M70 50 q30 -19 60 0" stroke="#f3c7a8" stroke-width="1.6" stroke-dasharray="2.4 3.6" fill="none" stroke-linecap="round"/>` +
      [[86, 41], [100, 36], [114, 41]].map(([x, y]) => `<path d="M${x} ${y} q3 -4 5 0 q-1 3 -5 0Z M${x + 2.5} ${y + 4} a1.2 1.2 0 1 0 .1 0" fill="#fff3d6" opacity=".9"/>`).join("") +
      P(Pa("M136 54 q9 -6 15 -4 q-2 6 -9 8Z"), "#c4452f", { dx: 1, dy: 1, sw: 1.4 }) + P(Pa("M137 57 q8 3 12 10 q-6 1 -12 -4Z"), "#b83e2a", { dx: 1, dy: 1, sw: 1.4 }) +
      P(C(136, 56, 3.4), "#a83826", { dx: .6, dy: .6, sw: 1.2 }),
  };
  // 地區配件（pet-journey.js）：走過那個地區的步道就解鎖，不用果實
  Object.assign(HATS, {
    // 芒草穗（北部）：三支彎彎的穗，穗是一叢毛茸茸的小穗（不是三根棍子）＋綁住的草莖
    silvergrass: [[84, 54, 70, 20, -1], [100, 52, 102, 10, 1], [116, 54, 132, 20, 1]].map(([x0, y0, x1, y1, d]) =>   // 一支穗＝莖＋從頂端往一側散開、垂下來的細絲（芒花），不是箭羽
      `<path d="M${x0} ${y0} Q${(x0 + x1) / 2 - d * 4} ${(y0 + y1) / 2} ${x1} ${y1}" stroke="#a89a62" stroke-width="2.2" fill="none" stroke-linecap="round"/>` +
      [0, 1, 2, 3, 4, 5, 6, 7, 8].map(k => { const a = (-78 + k * 13) * d, r = 19 + (k % 3) * 4, ex = x1 + Math.sin(a * Math.PI / 180) * r, ey = y1 - Math.cos(a * Math.PI / 180) * r * .7 + k * 1.2;
        return `<path d="M${x1} ${y1} Q${((x1 + ex) / 2 + d * 3).toFixed(1)} ${((y1 + ey) / 2 - 4).toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}" stroke="${k % 2 ? "#f3e9cf" : "#e3d5ad"}" stroke-width="${k % 2 ? 2.4 : 1.8}" fill="none" stroke-linecap="round"/>`; }).join("") +
      `<circle cx="${x1}" cy="${y1}" r="2.2" fill="#d8c896"/>`).join("") +
      P(Pa("M88 52 q12 6 24 0 l-1 5 q-11 5 -22 0Z"), "#7f9a4e", { dx: .8, dy: .8, sw: 1.4 }),
    // 楓葉（中部）：一片有葉脈、兩色漸層的楓葉＋小枝別在頭上
    maple: `<g transform="translate(108 34) rotate(-14) scale(1.3)">` + P(Pa("M0 -20 l5 9 l8 -3 l-2 9 l9 2 l-8 6 l3 7 l-9 -2 l-1 9 l-5 -6 l-5 6 l-1 -9 l-9 2 l3 -7 l-8 -6 l9 -2 l-2 -9 l8 3Z"), "#d9532f", { hl: [-4, -6, 4, 2.4], dx: 1.2, dy: 1.4, sw: 1.3 }) +
      `<path d="M0 -14 v24 M0 -2 l-9 -6 M0 -2 l9 -6 M0 4 l-8 3 M0 4 l8 3" stroke="#a83a1f" stroke-width="1" fill="none" stroke-linecap="round"/><path d="M0 10 q2 6 -2 11" stroke="#8a5a32" stroke-width="1.8" fill="none" stroke-linecap="round"/></g>` +
      P(Pa("M80 56 q20 -8 40 0 l-1 4 q-19 -7 -38 0Z"), "#8a5a32", { dx: .8, dy: .8, sw: 1.2 }),
    // 鳳梨帽（南部）：一格一格的鳳梨皮（菱格＋每格中心一點）＋三層葉冠
    pineapple: P(Pa("M100 34 l-15 -20 l12 7 l3 -19 l4 18 l12 -9 l-10 22Z"), "#4f9a3e", { hl: [97, 14, 2, 5], dx: 1.2, dy: 1.2, sw: 1.6 }) +
      `<clipPath id="§pac"><ellipse cx="100" cy="47" rx="27" ry="15"/></clipPath>` + P(E(100, 47, 27, 15), "#f2b632", { hl: [88, 40, 8, 3.4], dx: 2.4, dy: 2.4, sw: 2 }) +
      `<g clip-path="url(#§pac)"><path d="M70 36 l34 30 M80 32 l36 32 M92 30 l34 30 M64 46 l24 22 M130 36 l-34 30 M120 32 l-36 32 M108 30 l-34 30 M136 46 l-24 22" stroke="#cf861a" stroke-width="1.6"/>` +
      [[86, 42], [100, 40], [114, 42], [93, 50], [107, 50], [100, 57], [80, 51], [120, 51]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.3" fill="#9a5a10"/>`).join("") + `</g>`,
    // 浪花頭巾（東部）：藍色頭巾＋白色浪花紋＋側邊捲起的一朵浪
    wave: P(Pa("M61 52 Q100 26 139 52 L137 61 Q100 46 63 61Z"), "#3a86c8", { hl: [86, 40, 9, 2.4], dx: 2, dy: 3, sw: 2 }) +
      `<path d="M68 51 q7 -10 15 -4 q6 -9 15 -2 q8 -9 16 0 q6 -6 12 2" stroke="#eaf6ff" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M72 56 q28 -10 56 0" stroke="#bfe0f6" stroke-width="1.2" fill="none" opacity=".7"/>` +
      P(Pa("M122 47 q7 -20 28 -13 q-13 4 -11 15 q-4 -6 -10 -4 q-4 1 -7 2Z"), "#7cc0ea", { hl: [138, 38, 4, 2], dx: 1.2, dy: 1.2, sw: 1.6 }) +
      `<path d="M138 41 q4 -3 8 -2" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
    // 貝殼髮夾（離島）：扇貝（放射肋＋暗面）＋珍珠＋金色髮夾
    shell: `<g transform="translate(112 40)">` + P(Pa("M-19 9 Q-20 -18 0 -19 Q20 -18 19 9 Q0 15 -19 9Z"), "#f4c7b0", { hl: [-7, -9, 4, 3], dx: 1.6, dy: 1.6, sw: 1.8 }) +
      `<path d="M0 -16 v22 M-8 -13 l3 19 M8 -13 l-3 19 M-14 -5 l7 12 M14 -5 l-7 12" stroke="#d99a80" stroke-width="1.5" stroke-linecap="round"/>` +
      P(Pa("M-9 7 q9 5 18 0 l0 5 q-9 4 -18 0Z"), "#e2a68c", { dx: .6, dy: .6, sw: 1.2 }) + P(C(0, 13, 3), "#fbf6ef", { hl: [-1, 12, 1, .8], dx: .5, dy: .5, sw: 1 }) +
      `<path d="M-24 15 h18" stroke="#d8b24a" stroke-width="2.4" stroke-linecap="round"/></g>`,
  });
  // 季節限定（2026-10-07 寵物新一輪 #17）：聖誕帽（12/1～1/6）、玉兔耳（中秋前後一週）——當季才拿得到，拿了就永遠擁有（pet.js 的 hatSeason）
  Object.assign(HATS, {
    // 聖誕帽：絨布帽身（暗面＋垂下來的帽尖）＋毛絨白邊（一團一團）＋毛球
    santa: P(Pa("M62 54 C62 31 80 15 104 15 C125 15 139 24 143 39 C135 33 127 31 121 32 C127 39 133 47 138 54Z"), "#d6372f", { hl: [86, 28, 9, 4], dx: 2.6, dy: 2.6, sw: 2 }) +
      `<path d="M74 44 q10 -20 32 -22 M118 34 q8 4 12 12" stroke="#f06a5e" stroke-width="2" fill="none" opacity=".5" stroke-linecap="round"/>` +
      [62, 72, 82, 92, 102, 112, 122, 132, 139].map((x, k) => P(C(x, 56 - Math.sin(k / 8 * Math.PI) * 3, 6.2), "#fbf7ee", { dx: .8, dy: 1, sw: 1.2 })).join("") +
      P(C(144, 41, 7), "#fbf7ee", { hl: [142, 38, 2.4, 1.8], dx: 1, dy: 1, sw: 1.4 }),
    // 玉兔耳：耳朵有毛邊（細線）、內耳粉色漸層、頭帶
    rabbit: P(Pa("M84 50 Q66 14 78 4 Q94 6 92 50Z"), "#fbf7ee", { hl: [80, 18, 3, 8], dx: 1.6, dy: 1.6, sw: 1.8 }) + P(Pa("M85 44 Q74 20 80 11 Q88 13 88 44Z"), "#f2b8c6", { dx: 1, dy: 1, sw: 0 }) +
      P(Pa("M116 50 Q134 14 122 4 Q106 6 108 50Z"), "#fbf7ee", { hl: [120, 18, 3, 8], dx: 1.6, dy: 1.6, sw: 1.8 }) + P(Pa("M115 44 Q126 20 120 11 Q112 13 112 44Z"), "#f2b8c6", { dx: 1, dy: 1, sw: 0 }) +
      `<path d="M78 10 l-2 -2 M80 8 l0 -3 M120 8 l0 -3 M122 10 l2 -2" stroke="#d8ccbb" stroke-width="1" stroke-linecap="round"/>` +
      P(Pa("M74 54 Q100 42 126 54 L125 59 Q100 48 75 59Z"), "#e7c37a", { dx: .8, dy: .8, sw: 1.4 }),
  });
  const HAT_LABEL = { none: "不戴", santa: "聖誕帽", rabbit: "玉兔耳", straw: "草帽", party: "派對帽", crown: "花冠", bow: "蝴蝶結", bandana: "登山頭巾", silvergrass: "芒草穗", maple: "楓葉", pineapple: "鳳梨帽", wave: "浪花頭巾", shell: "貝殼髮夾" };
  const HAT_IDS = ["none", "straw", "party", "crown", "bow", "bandana", "silvergrass", "maple", "pineapple", "wave", "shell", "santa", "rabbit"];
  // 各階段頭頂錨點 [x, y, scale]：帽子以自身參考點(x100,y45)對到該階段頭頂。逐一調過位。
  const HAT_ANCHOR = [
    [100, 81, 1.0],   // 0 卵：蛋坐在地上（2026-10-04 往下移）
    [148, 108, 0.6],  // 1 幼蟲：頭在右邊、縮小（戴帽子時臭角會拿掉）
    [100, 58, 0.52],  // 2 蝶：小頭、上移縮小
    [100, 55, 1.0],   // 3 狐（參考）
    [100, 54, 0.98],  // 4 虎
    [100, 56, 0.8],   // 5 幼龍：頭頂在兩支鹿角中間
    [66, 49, 0.9],    // 6 神龍：頭在左上（2026-10-09 R8：0.74→0.9，以前帽子比別隻小一號）
  ];
  // 第二件配件（2026-10-09 修正案 R5 原20：先帽子＋一件配件，建立掛點與圖層）：戴在脖子上——掛點＝每一階頭的支點（pr-head 的 --ox/--oy，本來就是脖子），
  // 畫成頭群組的第一個子元素＝在頭的後面、跟著頭動（幼蟲爬、神龍繩波、狐虎趴下低頭都不會跟脖子分開）。蛋沒有脖子：不戴
  const NECK = { 1: [126, 157, 13], 2: [100, 94, 9], 3: [100, 146, 19], 4: [100, 140, 23], 5: [100, 130, 19], 6: [112, 127, 14] };   // [x, y, 半寬]；幼龍、神龍往下移（不然被下顎和龍鬚整個蓋住，2026-10-09 看截圖調）
  // 2026-10-09 R8-2（使用者：所有配件都要更精緻）：5 件，每件都用 P() 的畫法＋材質；分前後兩層——
  //   front＝頭群組的第一個子元素（脖子前面：圍巾、鈴鐺、領結、背包的背帶、披風的葉扣）；back＝整隻角色最底下（背包本體、披風，從身體兩側和肩膀上露出來）
  //   背包、披風只給直立的狐、虎、幼龍（幼蟲是橫的、蝶有翅膀、神龍是長條身體：放不上去，裝扮視窗會說明）
  const ACC_IDS = ["none", "scarf", "bell", "bowtie", "backpack", "cape"], ACC_LABEL = { none: "不戴", scarf: "紅圍巾", bell: "小鈴鐺", bowtie: "領結", backpack: "登山小背包", cape: "樹葉披風" };
  const ACC_OK = { scarf: [1, 2, 3, 4, 5, 6], bell: [1, 2, 3, 4, 5, 6], bowtie: [1, 2, 3, 4, 5, 6], backpack: [3, 4, 5], cape: [3, 4, 5] };
  function accG(id, i) {
    const n = NECK[clamp(i)]; if (!n || !id || id === "none" || !(ACC_OK[id] || []).includes(clamp(i))) return null;
    const [x, y, w] = n, R = v => Math.round(v * 10) / 10, g = (cls, inner) => `<g class="pc-acc acc-${cls}">${inner}</g>`;
    if (id === "scarf") {   // 針織圍巾：一圈＋垂下來的一條（有流蘇），直條針織紋
      const ring = `M${R(x - w)} ${R(y - 2)} Q${x} ${R(y + w * .45)} ${R(x + w)} ${R(y - 2)} L${R(x + w + 1)} ${R(y + 5)} Q${x} ${R(y + w * .45 + 8)} ${R(x - w - 1)} ${R(y + 5)}Z`;
      const tail = `M${R(x + w * .35)} ${R(y + w * .3)} l${R(w * .12)} ${R(w * .9)} l${R(w * .34)} -${R(w * .06)} l-${R(w * .02)} -${R(w * .86)}Z`;
      const ribs = Array.from({ length: 9 }, (_, k) => { const t = -1 + k / 4, px = x + t * w * .92, py = y + 1.5 + (1 - t * t) * w * .45; return `M${R(px)} ${R(py - 2.6)} v5`; }).join(" ");
      const fr = [0, 1, 2, 3].map(k => `M${R(x + w * .48 + k * w * .09)} ${R(y + w * 1.18)} v${R(Math.max(2.4, w * .14))}`).join(" ");
      return { front: g("scarf", P(Pa(ring), "#d9483b", { hl: [R(x - w * .45), R(y + w * .15), R(w * .3), 1.4], dx: 1, dy: 1.6, sw: 1.6 }) + `<path d="${ribs}" stroke="#a8322a" stroke-width="1" opacity=".55"/>` +
        P(Pa(tail), "#c43c30", { dx: .8, dy: 1, sw: 1.4 }) + `<path d="${fr}" stroke="#f0c9a8" stroke-width="1.3" stroke-linecap="round"/>`) };
    }
    if (id === "bell") {   // 小鈴鐺：紅色皮項圈（有縫線）＋金色鈴（亮面、中間一圈、開口）
      const by = R(y + Math.max(5, w * .3)), r = R(Math.max(3.6, w * .24));
      return { front: g("bell", P(Pa(`M${R(x - w * .75)} ${R(y - 1)} Q${x} ${R(y + w * .35)} ${R(x + w * .75)} ${R(y - 1)} L${R(x + w * .75)} ${R(y + 2.4)} Q${x} ${R(y + w * .35 + 3.4)} ${R(x - w * .75)} ${R(y + 2.4)}Z`), "#c43c30", { dx: .6, dy: .8, sw: 1.2 }) +
        `<path d="M${R(x - w * .6)} ${R(y + .8)} Q${x} ${R(y + w * .33 + 1)} ${R(x + w * .6)} ${R(y + .8)}" stroke="#f2b3a6" stroke-width=".8" stroke-dasharray="1.6 1.4" fill="none"/>` +
        P(C(x, by, r), "#f2c64a", { hl: [R(x - r * .35), R(by - r * .35), R(r * .3), R(r * .22)], dx: R(r * .25), dy: R(r * .25), sw: 1.2 }) +
        `<path d="M${R(x - r * .85)} ${R(by - r * .1)} H${R(x + r * .85)}" stroke="#a87a1e" stroke-width="1"/><path d="M${x} ${R(by + r * .25)} v${R(r * .6)}" stroke="#6a4a10" stroke-width="1.3" stroke-linecap="round"/><circle cx="${x}" cy="${R(by + r * .3)}" r="${R(r * .2)}" fill="#6a4a10"/>`) };
    }
    if (id === "bowtie") {   // 領結：兩片有摺痕的布（深藍底白點）＋中間的結
      const s2 = Math.max(5, w * .42), bx = x, byy = R(y + 2);
      return { front: g("bowtie", P(Pa(`M${bx} ${byy} L${R(bx - s2 * 1.5)} ${R(byy - s2 * .8)} Q${R(bx - s2 * 1.75)} ${byy} ${R(bx - s2 * 1.5)} ${R(byy + s2 * .8)}Z`), "#2f5d9a", { dx: .8, dy: .8, sw: 1.3 }) +
        P(Pa(`M${bx} ${byy} L${R(bx + s2 * 1.5)} ${R(byy - s2 * .8)} Q${R(bx + s2 * 1.75)} ${byy} ${R(bx + s2 * 1.5)} ${R(byy + s2 * .8)}Z`), "#2f5d9a", { dx: .8, dy: .8, sw: 1.3 }) +
        [-1.05, -.6, .6, 1.05].map(t => `<circle cx="${R(bx + t * s2)}" cy="${R(byy + (Math.abs(t) > .8 ? -.25 : .25) * s2)}" r="${R(s2 * .1)}" fill="#e8f0fb"/>`).join("") +
        `<path d="M${R(bx - s2 * .9)} ${R(byy - s2 * .3)} l${R(s2 * .5)} ${R(s2 * .25)} M${R(bx + s2 * .9)} ${R(byy - s2 * .3)} l-${R(s2 * .5)} ${R(s2 * .25)}" stroke="#1f3f6a" stroke-width=".9" opacity=".6"/>` +
        P(E(bx, byy, R(s2 * .32), R(s2 * .42)), "#244a7e", { dx: .4, dy: .4, sw: 1.1 })) };
    }
    if (id === "backpack") {   // 登山小背包：背後的背包（翻蓋、口袋、繩子，從肩膀上和身體兩側露出來）＋胸前兩條背帶和胸扣
      const top = R(y - w * .15), bw = w * 1.8, bh = w * 1.9;   // 比身體寬：從兩側露出來（身體會擋住中間）
      const back = g("backpack-b", P(Pa(`M${R(x - bw)} ${R(top + 6)} Q${R(x - bw)} ${top} ${R(x - bw + 6)} ${top} H${R(x + bw - 6)} Q${R(x + bw)} ${top} ${R(x + bw)} ${R(top + 6)} V${R(top + bh)} H${R(x - bw)}Z`), "#5f8a4a", { hl: [R(x - bw * .5), R(top + 5), R(bw * .3), 2], dx: 1.6, dy: 2, sw: 1.8 }) +
        P(Pa(`M${R(x - bw + 1)} ${R(top + 1)} H${R(x + bw - 1)} V${R(top + bh * .28)} Q${x} ${R(top + bh * .36)} ${R(x - bw + 1)} ${R(top + bh * .28)}Z`), "#4a7238", { dx: .8, dy: 1, sw: 1.4 }) +
        `<path d="M${R(x - bw - 2)} ${R(top + bh * .55)} q-3 ${R(bh * .12)} 0 ${R(bh * .24)} M${R(x + bw + 2)} ${R(top + bh * .55)} q3 ${R(bh * .12)} 0 ${R(bh * .24)}" stroke="#c8913a" stroke-width="2" fill="none" stroke-linecap="round"/>`);
      const sx = w * .58, front = g("backpack-f", [-1, 1].map(d => P(Pa(`M${R(x + d * sx - 2.4)} ${R(y - 1)} L${R(x + d * sx * .8 - 2.4)} ${R(y + w * 1.25)} H${R(x + d * sx * .8 + 2.4)} L${R(x + d * sx + 2.4)} ${R(y - 1)}Z`), "#7a5a36", { dx: .5, dy: .6, sw: 1 })).join("") +
        P(Pa(`M${R(x - sx * .8)} ${R(y + w * .62)} H${R(x + sx * .8)} V${R(y + w * .62 + 3)} H${R(x - sx * .8)}Z`), "#7a5a36", { dx: .4, dy: .4, sw: .9 }) + P(Pa(`M${R(x - 3)} ${R(y + w * .62 - 1.4)} h6 v5.8 h-6Z`), "#e0b44a", { dx: .4, dy: .4, sw: .9 }));
      return { back, front };
    }
    if (id === "cape") {   // 樹葉披風：一片大葉子形狀的披風（葉脈、邊緣有鋸齒），從身體兩側露出來；脖子前面一顆葉子扣
      const cw = w * 2.35, ch = w * 2.75, edge = Array.from({ length: 9 }, (_, k) => { const t = k / 8, px = x - cw + 2 * cw * t, py = y + ch - Math.sin(t * Math.PI) * w * .25 + (k % 2 ? 3 : 0); return `${R(px)} ${R(py)}`; }).join(" L");
      const back = g("cape-b", P(Pa(`M${R(x - w * .7)} ${R(y - 2)} Q${R(x - cw * 1.08)} ${R(y + ch * .45)} ${R(x - cw)} ${R(y + ch)} L${edge} Q${R(x + cw * 1.08)} ${R(y + ch * .45)} ${R(x + w * .7)} ${R(y - 2)}Z`), "#5aa047", { hl: [R(x - cw * .6), R(y + ch * .35), 3, R(ch * .25)], dx: 2, dy: 2.4, sw: 1.8 }) +
        `<path d="M${x} ${R(y + 2)} V${R(y + ch - 2)} ${[-1, 1].map(d => [.3, .55, .8].map(t => `M${x} ${R(y + ch * t)} l${R(d * cw * .55)} ${R(ch * .1)}`).join(" ")).join(" ")}" stroke="#3e7a32" stroke-width="1.2" fill="none" opacity=".7"/>`);
      const front = g("cape-f", P(Pa(`M${R(x - 1)} ${R(y + 1)} q-${R(w * .45)} -${R(w * .05)} -${R(w * .55)} ${R(w * .3)} q${R(w * .4)} ${R(w * .15)} ${R(w * .55)} -${R(w * .3)}Z M${R(x + 1)} ${R(y + 1)} q${R(w * .45)} -${R(w * .05)} ${R(w * .55)} ${R(w * .3)} q-${R(w * .4)} ${R(w * .15)} -${R(w * .55)} -${R(w * .3)}Z`), "#4f9440", { dx: .5, dy: .5, sw: 1.1 }) +
        P(C(x, R(y + 1.4), R(Math.max(2.2, w * .14))), "#c8913a", { dx: .4, dy: .4, sw: 1 }));
      return { back, front };
    }
    return null;
  }
  // 裝扮視窗的格子（2026-10-09 R8-1）：只畫配件本身、放大（以前格子放整隻動物，帽子只佔一成，分不出是哪一頂）
  function hatIcon(id) { if (!HATS[id]) return ""; return `<svg class="dr-ic-svg" viewBox="44 -4 112 72" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${HATS[id].replace(/§/g, "i" + (++U).toString(36) + "_")}</svg>`; }
  function accIcon(i, id) {   // 配件：畫在這一階身上、只取脖子附近（背包、披風取大一點，看得到背後那層）
    const n = NECK[clamp(i)]; if (!n) return ""; const big = id === "backpack" || id === "cape", [x, y, w] = n, hw = big ? w * 2.9 : w * 2.1;
    return svg(i, "dr-ic-svg", "none", false, id).replace(/viewBox="[^"]*"/, `viewBox="${(x - hw).toFixed(1)} ${(y - hw * .55).toFixed(1)} ${(hw * 2).toFixed(1)} ${(hw * 1.5).toFixed(1)}"`);
  }
  function hat(id, i) {
    if (!HATS[id]) return "";
    const a = HAT_ANCHOR[clamp(i || 0)] || [100, 46, 1];
    const tf = `translate(${a[0]} ${a[1]}) scale(${a[2]}) translate(-100 -45)`;
    return `<svg class="pet-hat-svg" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g transform="${tf}">${HATS[id].replace(/§/g, "h" + (++U).toString(36) + "_")}</g></svg>`;   // 帽子裡有裁切（v2）：每份自己的 id
  }
  const EMOJI = ["🥚", "🐛", "🦋", "🦊", "🐅", "🐲", "🐉"];   // 對映 PET_STAGES 的 e，供把同步來的 emoji 反查成階段
  const clamp = i => Math.max(0, Math.min(A.length - 1, (i | 0)));
  // 帽子畫進「頭所在的那一組」（<!--H--> 位置），跟著角色同一個動畫一起動。
  // 以前帽子是另一張疊上去的 SVG、用自己的起伏動畫：彩蝶／神龍的漂浮週期（3.8s、10px）跟帽子（3.4s、6px）
  // 對不上，幾秒後帽子就滑到臉上。
  function hatG(id, i) {
    if (!HATS[id]) return "";
    const a = HAT_ANCHOR[clamp(i)] || [100, 46, 1];
    return `<g class="pc-hat" transform="translate(${a[0]} ${a[1]}) scale(${a[2]}) translate(-100 -45)"><g class="pc-hat-in">${HATS[id]}</g></g>`;   // pc-hat-in：晃動動畫掛在這一層（2026-10-09：掛在 pc-hat 上時 CSS 的 transform-origin 會改到定位用的 transform 屬性，舞台上的帽子整頂偏掉——蝴蝶偏到翅膀上）
  }
  let U = 0;   // 每份 SVG 自己的 id 前綴（§ → p1_、p2_…），避免同頁多份角色的裁切互相串
  // 戴帽子時拿掉 <!--O-->…<!--/O-->（幼蟲的臭角）：帽子要戴在頭上，不是戴在臭角上
  function body(i, hatId, accId) { const pre = "p" + (++U).toString(36) + "_"; let a = A[clamp(i)]; if (HATS[hatId]) a = a.replace(/<!--O-->[\s\S]*?<!--\/O-->/, ""); const ag = accG(accId, i); if (ag && ag.front) a = a.replace(/(<g class="pr-head"[^>]*>)/, "$1" + ag.front); if (ag && ag.back) a = a.replace(/(<g class="pc-(?:bob|hover)[^"]*"[^>]*>)/, "$1" + ag.back); return a.replace("<!--H-->", hatG(hatId, i)).replace("<!--H2-->", hatG(hatId, i)).replace("<!--H3-->", HATS[hatId] ? `<g transform="translate(14 12) rotate(8 100 46)">${hatG(hatId, i)}</g>` : "").replace(/§/g, pre); }
  function prop(i) { const p = PROP[clamp(i)]; if (!p) return ""; const pre = "q" + (++U).toString(36) + "_"; return `<svg class="pet-prop" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${p.replace(/§/g, pre)}</svg>`; }
  // 幼龍（2026-10-05 拿掉腳下的雲）：腳底原本踩在雲上（y≈183），整張往下 13 讓腳底落在跟其他夥伴同一條地面線（y≈196）。
  // 用 viewBox 平移而不是包一層 transform：各部位的支點（transform-box: view-box）座標不用改
  const vb = i => (clamp(i) === 5 ? "0 -13 200 200" : "0 0 200 200");
  // pad：畫布四周多留白（舞台上的主角用：趴下、伸長脖子、尾巴捲起來都不會超出畫框——iOS 的 WebKit 會照畫框裁切，不管 overflow:visible）
  // 2026-10-07 優化輪：留白每隻不同（實測餵食全程超出 200×200 多少＋15，至少 40 給帽子）——以前一律 140（畫布 2.4 倍），蛋／毛毛蟲／蝶的畫布面積剩 34%
  const PADS = [40, 40, 40, 55, 55, 140, 125];   // 神龍 100→125（2026-10-07 尾巴加長、往上捲時 WebKit 會在畫布外裁 13px）
  const padFor = i => PADS[clamp(i)];
  function svg(i, cls, hatId, pad, accId) {
    if (pad === true) pad = padFor(i);
    const v = vb(i).split(" ").map(Number), p = pad || 0, box = p ? `${v[0] - p} ${v[1] - p} ${v[2] + 2 * p} ${v[3] + 2 * p}` : vb(i);
    const W = 200 + 2 * p, pc = u => ((p + u) / W * 100).toFixed(2) + "%";   // 圖上的座標 → 畫布的百分比（轉動支點用）
    const st = p ? ` data-pad="${p}" style="--pf:${(W / 200).toFixed(4)};--pm:${(p / 200).toFixed(4)};--o196:${pc(196)};--o194:${pc(194)};--o190:${pc(190)};--x40:${pc(40)};--x20:${pc(20)}"` : "";
    return `<svg class="pet-critter ${cls || ""}${p ? " pc-pad" : ""}" data-s="${clamp(i)}" viewBox="${box}"${st} role="img" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body(i, hatId, accId)}</svg>`;
  }
  function byEmoji(e) { return EMOJI.indexOf(e); }   // 找不到回 -1
  // 給 canvas 用：帶 width/height 的獨立 SVG data URI（靜態一幀，供 new Image().src 光柵化畫進分享圖卡）
  // hatId 有給就把配件一起畫進去（合照用）
  function dataUri(i, size, hatId, pose, accId) {
    const s = size || 120;
    // 圖片裡吃不到 style.css：開心瞇眼要自己藏起來（以前分享圖卡會同時畫出睜眼和 ^^ 眼）；質感細節 .pc-d2 照畫（圖卡夠大）
    // pose（2026-10-08 R4 原16，拍照選姿勢）：happy 是瞇眼笑（^^ 眼）、sleep 是閉眼（眼睛壓成一條線）；其他是平常坐著
    const ps = pose === "happy" ? ".pc-eye{display:none}.pc-eh{display:inline}" : pose === "sleep" ? ".pc-eye{transform:scaleY(.14);transform-box:fill-box;transform-origin:center}" : "";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="${vb(i)}"><style>.pc-eh,.m-o,.m-t,.m-p,.pr-ext,.pr-legs,.pc-crack2,.pc-crack3{display:none}${ps}</style>${body(i, hatId, accId)}</svg>`;
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
  const dragonSpine = n => spine(DSP, n).map(q => ({ x: q.x, y: q.y }));
  const dragon = { I0: DI0, DB, DT0, tail: dragonTail };   // pet-walk：尾巴從第 I0 節能動、每格用 tail(中心線) 重畫
  const larvaSpine = n => spine(LVS, n).map(q => ({ x: q.x, y: q.y }));   // 幼蟲身體的中心線（pet-walk.js 的 U 型迴轉：身體每一點沿這條線的位置）   // 神龍身體的中心線（pet-walk.js 用來讓尾巴彎過去）
  return { hatIcon, accIcon, ACC_IDS, ACC_LABEL, accOk: (i, id) => !!NECK[clamp(i)] && (!id || id === "none" || (ACC_OK[id] || []).includes(clamp(i))), larvaSpine, dragonSpine, dragon, cloudTop6, svg, padFor, count: A.length, byEmoji, dataUri, habitat, habitatUri, hat, HAT_IDS, HAT_LABEL, headLine, prop };
})();
