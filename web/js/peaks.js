// 登頂收集冊：臺灣百岳、小百岳。走到山頂（軌跡進到山頂判定半徑內）就自動蓋章，記下日期。
// 資料在 peaks-data.js；蓋章紀錄存 tt_peaks（{ "b1": { at, rec }, "x12": {...} }，b＝百岳、x＝小百岳）。
// 只算真的走過的（模擬、上車都不算）。第一次打開收集冊時，會把以前的紀錄全部掃一遍補蓋。
const Peaks = (() => {
  const T = s => (typeof ttT === "function" ? ttT(s) : s);
  const LISTS = { b: { name: "百岳", data: typeof PEAKS_BAIYUE !== "undefined" ? PEAKS_BAIYUE : [] }, x: { name: "小百岳", data: typeof PEAKS_XIAO !== "undefined" ? PEAKS_XIAO : [] } };
  const KEY = "tt_peaks";
  function got() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save(g) { try { localStorage.setItem(KEY, JSON.stringify(g)); } catch (e) { /* */ } }
  function count(list) { const g = got(); return LISTS[list].data.filter(p => g[list + p[0]]).length; }

  // 一趟紀錄碰到了哪些山頂：先用整條軌跡的外框篩掉不可能的山，再逐點量距離
  function hitsOf(rec) {
    const tr = (rec && rec.track) || [];
    if (rec.sim || rec.vehicle || tr.length < 2) return [];
    let n = 90, s = -90, e = -180, w = 180;
    for (const p of tr) { if (p.lat > n) n = p.lat; if (p.lat < s) s = p.lat; if (p.lon > e) e = p.lon; if (p.lon < w) w = p.lon; }
    const pad = 0.01, out = [];
    for (const list of ["b", "x"]) for (const pk of LISTS[list].data) {
      const [no, , , la, lo, , rad] = pk;
      if (la < s - pad || la > n + pad || lo < w - pad || lo > e + pad) continue;
      for (const p of tr) { if (haversine({ lat: la, lon: lo }, p) <= rad) { out.push({ list, no, pk }); break; } }
    }
    return out;
  }
  // 存好一趟之後呼叫：新蓋到的章回傳出來（同一座山第一次走到才算，日期記第一次）
  function stampRecord(rec, quiet) {
    const hits = hitsOf(rec); if (!hits.length) return [];
    const g = got(), fresh = [];
    for (const h of hits) {
      const k = h.list + h.no;
      if (g[k]) continue;
      g[k] = { at: rec.date || new Date().toISOString(), rec: rec.id || null };
      fresh.push(h);
    }
    if (fresh.length) save(g);
    if (fresh.length && !quiet) {
      fresh.slice(0, 3).forEach((h, i) => setTimeout(() => {
        toast(`${T("登頂蓋章")}${ttColon()}${T(h.pk[1])}${ttParen(`${T(LISTS[h.list].name)} #${h.no}`)}`);
        if (typeof ttBuzz === "function") ttBuzz([80, 40, 80, 40, 160]);
      }, 1200 + i * 2200));
    }
    return fresh;
  }
  // 以前走過的紀錄補蓋一次（只做一次；還原備份後會重做）
  async function backfill() {
    let done = null; try { done = localStorage.getItem("tt_peaks_scan"); } catch (e) { /* */ }
    if (done === "1") return 0;
    let n = 0;
    try {
      const recs = (typeof Store !== "undefined" && Store.allFull) ? await Store.allFull() : [];
      for (const r of recs) n += stampRecord(r, true).length;
      localStorage.setItem("tt_peaks_scan", "1");
    } catch (e) { /* 掃不完下次再掃 */ }
    return n;
  }

  // ───────── 收集冊畫面 ─────────
  let cur = "b";
  function nearTrails(pk) {
    if (typeof TRAILS === "undefined") return [];
    return TRAILS.filter(t => t.lat && haversine({ lat: pk[3], lon: pk[4] }, { lat: t.lat, lon: t.lon }) < 6000)
      .map(t => ({ t, d: haversine({ lat: pk[3], lon: pk[4] }, { lat: t.lat, lon: t.lon }) })).sort((a, b) => a.d - b.d).slice(0, 4);
  }
  function fmtDate(iso) { try { return new Date(iso).toLocaleDateString(ttLocale(), { year: "numeric", month: "numeric", day: "numeric" }); } catch (e) { return ""; } }
  function render(ov) {
    const g = got(), L = LISTS[cur], total = L.data.length, have = L.data.filter(p => g[cur + p[0]]).length;
    const pct = total ? Math.round(have / total * 100) : 0;
    const body = ov.querySelector(".pk-body");
    body.innerHTML = `
      <div class="pk-tabs" role="tablist">${["b", "x"].map(k => `<button class="pk-tab${k === cur ? " on" : ""}" data-l="${k}" role="tab" aria-selected="${k === cur}">${T(LISTS[k].name)} <span>${count(k)}/${LISTS[k].data.length}</span></button>`).join("")}</div>
      <div class="pk-prog"><div class="pk-ring" style="--p:${pct}"><b>${have}</b><small>/ ${total}</small></div>
        <div class="pk-prog-t"><b>${T(have ? "繼續收集" : "還沒蓋到章")}</b><span>${T(cur === "b" ? "臺灣 3,000 公尺以上的百座高山" : "各縣市近郊的百座代表郊山")}</span></div></div>
      <div class="pk-hint">${ic("pin")}<span>${T("走到山頂附近，就會自動蓋章")}</span></div>
      <div class="pk-grid">${L.data.map(p => { const st = g[cur + p[0]]; return `<button class="pk-stamp${st ? " got" : ""}" data-no="${p[0]}" aria-label="${escHtml(T(p[1]))}${st ? "・" + T("已登頂") : ""}"><span class="pk-no">${p[0]}</span><span class="pk-nm">${escHtml(T(p[1]))}</span><span class="pk-el">${p[2].toLocaleString()} m</span>${st ? `<span class="pk-ok">${ic("check")}</span>` : ""}</button>`; }).join("")}</div>`;
    fitNames(body);
    body.querySelectorAll(".pk-tab").forEach(b => b.addEventListener("click", () => { cur = b.dataset.l; ov.querySelector(".pk-detail").classList.remove("show"); render(ov); body.scrollTop = 0; }));
    body.querySelectorAll(".pk-stamp").forEach(b => b.addEventListener("click", () => detail(ov, L.data.find(p => p[0] === +b.dataset.no))));
  }
  // 外文介面的拼音山名常是一長串（Xiuguluanshan），格子放不下會從字中間斷開 → 字縮小一點
  // 名字是介面翻譯器事後換上的，所以看「現在顯示的字」來決定，字一換就重算
  function fitNames(root) { root.querySelectorAll(".pk-nm").forEach(el => { const m = Math.max(...el.textContent.split(/\s+/).map(w => w.length)); el.classList.toggle("long", m > 11); el.classList.toggle("xlong", m > 14); }); }
  function detail(ov, pk) {
    const g = got(), st = g[cur + pk[0]], nt = nearTrails(pk);
    const box = ov.querySelector(".pk-detail");
    box.innerHTML = `<button class="pk-dx" aria-label="${T("關閉")}">${ic("x")}</button>
      <div class="pk-d-top"><span class="pk-d-badge${st ? " got" : ""}">${st ? ic("check") : `<span>${pk[0]}</span>`}</span>
        <div><div class="pk-d-name">${escHtml(T(pk[1]))}</div><div class="pk-d-sub">${T(LISTS[cur].name)} #${pk[0]} · ${pk[2].toLocaleString()} m · ${escHtml(pk[5].split("、").map(T).join("、"))}</div></div></div>
      <div class="pk-d-state${st ? " got" : ""}">${st ? `${ic("check")} <span>${T("登頂於")}</span> <b>${fmtDate(st.at)}</b>` : T("還沒去過。記錄時走到山頂附近就會自動蓋章")}</div>
      ${nt.length ? `<div class="pk-d-h">${T("附近的步道")}</div>${nt.map(x => `<button class="pk-trail" data-id="${x.t.id}">${ic("mountain")}<span>${escHtml(T(x.t.name))}</span><small>${(x.d / 1000).toFixed(1)} km</small></button>`).join("")}` : ""}`;
    box.classList.add("show");
    box.querySelector(".pk-dx").onclick = () => box.classList.remove("show");
    box.querySelectorAll(".pk-trail").forEach(b => b.onclick = () => { closeAll(); if (typeof openDetail === "function") openDetail(b.dataset.id); });
  }
  let _close = null;
  function closeAll() { if (_close) _close(); }
  async function open() {
    if (document.querySelector('[data-ov="peaks"]')) return;
    const ov = document.createElement("div"); ov.className = "pet-modal pk-modal"; ov.dataset.ov = "peaks";
    ov.innerHTML = `<div class="pet-modal-card pk-card"><button class="sheet-close" id="pkClose" aria-label="${T("關閉")}">${ic("x")}</button>
      <h2>${ic("mountain")} ${T("登頂收集冊")}</h2><div class="pk-body"></div><div class="pk-detail"></div></div>`;
    document.body.appendChild(ov);
    let _a11y = null;
    const mo = new MutationObserver(() => { mo.disconnect(); fitNames(ov); watch(); });
    const watch = () => mo.observe(ov.querySelector(".pk-body"), { subtree: true, characterData: true, childList: true });
    _close = () => { mo.disconnect(); if (_a11y) _a11y(); ov.remove(); _close = null; };
    if (typeof ttModalA11y === "function") _a11y = ttModalA11y(ov, _close, { focus: "#pkClose" });
    ov.querySelector("#pkClose").onclick = _close;
    ov.addEventListener("click", e => { if (e.target === ov) _close(); });
    render(ov); watch();
    setTimeout(() => { if (typeof ttCoachPeaks === "function") ttCoachPeaks(); }, 600);
    const n = await backfill();
    if (document.body.contains(ov)) { render(ov); if (n) toast(`${T("從以前的紀錄補蓋了")}${ttColon()}${n}`); }
  }
  return { open, stampRecord, backfill, hitsOf, count, got, LISTS };
})();
if (typeof window !== "undefined") window.Peaks = Peaks;
