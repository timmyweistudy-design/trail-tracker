import fs from "fs";
const F = JSON.parse(fs.readFileSync("fonts.json","utf8"));
const face = (fam, arr) => arr.map(x=>`@font-face{font-family:'${fam}';font-style:normal;font-weight:${x.wght};font-display:swap;src:url(data:font/woff2;base64,${x.b64}) format('woff2')}`).join("\n");
const faces = [
  face("Fraunces", F.fraunces),
  face("Hanken Grotesk", F.hanken),
  face("Sora", F.sora),
  face("Newsreader", F.newsreader),
].join("\n");

const cands = [
  { id:"now",  name:"現況（Fraunces 未載入）", desc:"數字掉回中文襯線體 — 偏重、各機不一致，這就是要改的起點", stack:`"Noto Serif TC","Songti TC",Georgia,serif`, tag:"before" },
  { id:"fra",  name:"A · Fraunces", desc:"暖調舊風襯線，有手感與文學感 — 最貼「拾光」的詩意", stack:`"Fraunces",Georgia,serif` },
  { id:"han",  name:"B · Hanken Grotesk", desc:"乾淨人文無襯線，數字極清晰 — 戶外一眼讀懂里程海拔", stack:`"Hanken Grotesk",system-ui,sans-serif` },
  { id:"sor",  name:"B · Sora", desc:"幾何無襯線，俐落現代 — 運動/數據感", stack:`"Sora",system-ui,sans-serif` },
  { id:"new",  name:"A · Newsreader", desc:"報刊文學襯線，優雅易讀 — 比 Fraunces 收斂一點", stack:`"Newsreader",Georgia,serif` },
];

const card = c => `
<article class="card${c.tag==="before"?" before":""}" style="--sample:${c.stack}">
  <header class="ch">
    <div><h2>${c.name}</h2><p>${c.desc}</p></div>
    ${c.tag==="before"?'<span class="pill warn">目前</span>':'<span class="pill">候選</span>'}
  </header>
  <div class="brand"><span class="mk">⛰</span><span class="zh">循徑拾光</span><span class="en s">GATHER&nbsp;THE&nbsp;TRAIL</span></div>
  <div class="hero">
    <div class="big"><span class="s num">12.4</span><span class="u">公里</span></div>
    <div class="sub"><span class="s num">↑680</span> 累積爬升m　·　<span class="s num">↓540</span> 下降m　·　<span class="s num">4.8</span> <span class="s">km/h</span></div>
  </div>
  <div class="stats">
    <div><span class="s num">01:23:45</span><em>時間</em></div>
    <div><span class="s num">8,420</span><em>步數</em></div>
    <div><span class="s num">512</span><em>大卡</em></div>
    <div><span class="s num">17,092</span><em>總里程 km</em></div>
  </div>
  <div class="trail">
    <b class="zh">南澳古道</b>
    <span class="meta">宜蘭縣南澳鄉　·　<span class="s num">1.5</span> 公里　·　<span class="s num">↑100</span>m　·　半天</span>
    <span class="digs s">0 1 2 3 4 5 6 7 8 9　·　海拔 <span class="num">540–590</span> m</span>
  </div>
</article>`;

const style = `
${faces}
:root{
  --bg:#eee9dc; --card:#fffdf8; --ink:#20271f; --soft:#635c4e; --faint:#837b6a; --line:#e6dfce;
  --brand:#2c5d3f; --brand-deep:#16301f; --brand-mid:#3f7a55; --brand-soft:#e4ecdf; --accent:#c2683d;
  --amber:#c98a08;
}
@media (prefers-color-scheme:dark){:root{
  --bg:#12160e; --card:#1b2015; --ink:#e9e4d4; --soft:#a9a693; --faint:#837f6c; --line:#2c3323;
  --brand:#7fc79b; --brand-deep:#0e1a10; --brand-mid:#9fe0b0; --brand-soft:#233020; --accent:#e2895a; --amber:#e8c87a;
}}
:root[data-theme="dark"]{
  --bg:#12160e; --card:#1b2015; --ink:#e9e4d4; --soft:#a9a693; --faint:#837f6c; --line:#2c3323;
  --brand:#7fc79b; --brand-deep:#0e1a10; --brand-mid:#9fe0b0; --brand-soft:#233020; --accent:#e2895a; --amber:#e8c87a;
}
:root[data-theme="light"]{
  --bg:#eee9dc; --card:#fffdf8; --ink:#20271f; --soft:#635c4e; --faint:#837b6a; --line:#e6dfce;
  --brand:#2c5d3f; --brand-deep:#16301f; --brand-mid:#3f7a55; --brand-soft:#e4ecdf; --accent:#c2683d; --amber:#c98a08;
}
*{box-sizing:border-box}
.wrap{font-family:-apple-system,"PingFang TC","Noto Sans TC",system-ui,sans-serif;color:var(--ink);background:var(--bg);
  min-height:100%;padding:26px 18px 60px;line-height:1.5;-webkit-font-smoothing:antialiased}
.top{max-width:920px;margin:0 auto 22px;display:flex;align-items:flex-start;gap:16px;justify-content:space-between}
.top h1{font-family:"Noto Serif TC",serif;font-weight:800;font-size:clamp(21px,3.4vw,29px);margin:0 0 5px;letter-spacing:.5px}
.top p{margin:0;color:var(--soft);font-size:14px;max-width:56ch}
.top .hint{margin-top:8px;font-size:12.5px;color:var(--faint)}
.tgl{flex:none;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:999px;
  padding:9px 15px;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.grid{max-width:920px;margin:0 auto;display:grid;grid-template-columns:1fr;gap:16px}
@media(min-width:720px){.grid{grid-template-columns:1fr 1fr}}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px 18px 20px;
  box-shadow:0 2px 10px rgba(20,28,18,.05);overflow-wrap:anywhere}
.card.before{border-style:dashed;opacity:.96}
.ch{display:flex;gap:10px;justify-content:space-between;align-items:flex-start;margin-bottom:14px}
.ch h2{margin:0;font-size:15px;font-weight:700;letter-spacing:.2px}
.ch p{margin:3px 0 0;font-size:12px;color:var(--soft);line-height:1.4}
.pill{flex:none;font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;background:var(--brand-soft);color:var(--brand);letter-spacing:.3px}
.pill.warn{background:#f3e4d6;color:var(--accent)}
:root[data-theme="dark"] .pill.warn{background:#3a281e}
/* 樣本：Latin/數字用候選字，中文用系統字 */
.s{font-family:var(--sample)}
.num{font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1}
.zh{font-family:"Noto Serif TC","Songti TC",serif}
.brand{display:flex;align-items:center;gap:9px;padding:11px 13px;border-radius:12px;background:var(--brand-deep);color:#f4f1e8;margin-bottom:14px;flex-wrap:wrap}
.brand .mk{width:30px;height:30px;display:grid;place-items:center;border-radius:9px;background:rgba(244,239,226,.14);font-size:17px}
.brand .zh{font-weight:800;font-size:20px;letter-spacing:1px;color:#f8f5ec}
.brand .en{font-size:9.5px;font-weight:600;letter-spacing:3px;color:rgba(231,237,222,.72);align-self:center;margin-left:2px}
.hero{border-radius:12px;background:var(--brand-soft);padding:14px 16px;margin-bottom:12px}
.hero .big{display:flex;align-items:baseline;gap:8px}
.hero .big .num{font-size:52px;font-weight:700;color:var(--brand-deep);line-height:1}
:root[data-theme="dark"] .hero .big .num{color:var(--brand-mid)}
.hero .big .u{font-size:16px;color:var(--soft);font-weight:500}
.hero .sub{margin-top:8px;font-size:14px;color:var(--brand);font-weight:600}
.hero .sub .num{font-weight:700}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
.stats>div{background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:10px 6px;text-align:center}
.stats .num{display:block;font-size:17px;font-weight:700;color:var(--ink)}
.stats em{display:block;margin-top:3px;font-size:10.5px;color:var(--faint);font-style:normal}
.trail{border-top:1px solid var(--line);padding-top:12px;display:flex;flex-direction:column;gap:6px}
.trail b{font-size:19px;font-weight:700;letter-spacing:.5px}
.trail .meta{font-size:12.5px;color:var(--soft)}
.trail .digs{font-size:12.5px;color:var(--faint);letter-spacing:1px}
.foot{max-width:920px;margin:26px auto 0;font-size:13px;color:var(--soft);background:var(--card);border:1px solid var(--line);border-radius:14px;padding:15px 17px;line-height:1.7}
.foot b{color:var(--ink)}
@media (prefers-reduced-motion:no-preference){.card{animation:fi .5s ease both}.card:nth-child(2){animation-delay:.04s}.card:nth-child(3){animation-delay:.08s}.card:nth-child(n+4){animation-delay:.12s}}
@keyframes fi{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
`;

const html = `<style>${style}</style>
<div class="wrap">
  <div class="top">
    <div>
      <h1>循徑拾光 · 字體對照</h1>
      <p>同一組 App 實際文字（品牌、大數字、統計、步道標題），套上幾種候選字型。<b>中文一律用系統字（已清楚）</b>，這裡比較的是「數字／英文／品牌」字型。</p>
      <p class="hint">A＝溫暖文青（襯線）　B＝清晰現代（無襯線）　·　點右上切換明暗看兩種主題</p>
    </div>
    <button class="tgl" id="tgl">◐ 明暗</button>
  </div>
  <div class="grid">
    ${cands.map(card).join("")}
  </div>
  <div class="foot">
    <b>怎麼選：</b>想要「里程/海拔一眼讀懂、乾淨現代」→ 選 <b>B（Hanken Grotesk 或 Sora）</b>；想要「文青、溫潤、貼品牌詩意」→ 選 <b>A（Fraunces 或 Newsreader）</b>。也可混搭：品牌大字用 A、統計數字用 B。<br>
    選好告訴我，我就 self-host 進 repo（離線可用、進 SW 快取、只取用到的字元做子集縮小檔案），中文維持系統字。想連中文也換（粉圓/思源黑體子集）再跟我說。
  </div>
</div>
<script>
(function(){
  var b=document.getElementById("tgl");
  b.addEventListener("click",function(){
    var r=document.documentElement;
    var dark=(r.getAttribute("data-theme")==="dark")||(!r.getAttribute("data-theme")&&matchMedia("(prefers-color-scheme:dark)").matches);
    r.setAttribute("data-theme",dark?"light":"dark");
  });
})();
</script>`;
fs.writeFileSync("font-compare.html", html);
console.log("wrote font-compare.html", Math.round(html.length/1024)+"KB");
