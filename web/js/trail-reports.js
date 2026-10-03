// 山友路況回報：步道詳情頁顯示 7 天內大家回報的路況（倒木、坍方、溪水暴漲…），也能自己回報（要登入）。
// 資料表與讀取函式在 supabase/schema-phase30-trail-reports.sql；資料庫還沒跑那支 SQL 時這區塊整個不出現。
// 回報是安全資訊，不算「社群」：社群功能收起來時照樣看得到。
const TrailReports = (() => {
  const T = s => (typeof ttT === "function" ? ttT(s) : s);
  const KINDS = [
    ["ok", "路況良好", "check"], ["tree", "倒木擋路", "leaf"], ["slide", "坍方落石", "alert"],
    ["water", "溪水暴漲", "drop"], ["trace", "路跡不清", "route"], ["wildlife", "蜂、蛇或野生動物", "paw"], ["other", "其他", "chat"],
  ];
  const kindOf = k => KINDS.find(x => x[0] === k) || KINDS[KINDS.length - 1];
  const ready = () => typeof Supa !== "undefined" && Supa.ready && Supa.ready();
  let _cur = null;

  // 3 分鐘記憶快取：來回看步道不重抓；自己新增／刪除回報後 load(t, true) 強制重抓
  const _cache = new Map();
  async function fetchRecent(trailId, force) {
    const hit = _cache.get(String(trailId));
    if (!force && hit && Date.now() - hit.at < 180000) return hit.v;
    const v = await fetchRecentFresh(trailId);
    if (v) _cache.set(String(trailId), { at: Date.now(), v }); else _cache.delete(String(trailId));
    return v;
  }
  async function fetchRecentFresh(trailId) {
    const c = Supa.client(); if (!c) return null;
    const { data, error } = await c.rpc("trail_reports_recent", { p_trail: String(trailId) });
    if (error) return null;   // 還沒跑 phase30 → 不顯示
    return data || [];
  }
  // 在步道上的大概位置：沿官方路線從起點量過去
  function kmOnTrail(t, r) {
    if (r.lat == null || typeof geoOf !== "function") return null;
    const segs = geoOf(t); if (!segs || !segs.length) return null;
    const line = segs.reduce((a, b) => (b.length > a.length ? b : a), segs[0]);
    if (typeof _distAlong !== "function") return null;
    const off = typeof distToSegment === "function" ? Math.min(...line.slice(1).map((p, i) => distToSegment(r.lat, r.lon, line[i], p))) : 0;
    if (off > 500) return null;   // 離步道太遠，不硬說在第幾公里
    return _distAlong([r.lat, r.lon], line) / 1000;
  }
  function itemHtml(t, r) {
    const [, label, icn] = kindOf(r.kind);
    const km = kmOnTrail(t, r);
    const ago = typeof ttAgo === "function" ? ttAgo(Math.max(1, Math.round((Date.now() - new Date(r.created_at).getTime()) / 1000))) : "";
    return `<div class="trp-item k-${r.kind}">
      <span class="trp-ic">${ic(icn)}</span>
      <div class="trp-body">
        <div class="trp-top"><b>${T(label)}</b>${km != null ? `<span class="trp-km">${ic("pin")} ${km.toFixed(1)} km</span>` : ""}</div>
        ${r.note ? `<div class="trp-note">${escHtml(r.note)}</div>` : ""}
        ${r.photo_url ? `<img class="trp-photo" src="${escHtml(r.photo_url)}" alt="" loading="lazy">` : ""}
        <div class="trp-meta"><span>${escHtml(r.author_name || T("山友"))}</span> · <span>${ago}</span>${r.is_mine ? ` · <button class="trp-del" data-id="${r.id}">${T("刪除")}</button>` : ` · <button class="trp-flag" data-id="${r.id}">${T("檢舉")}</button>`}</div>
      </div></div>`;
  }
  async function load(t, force) {
    const box = document.getElementById("trailReportBox"); if (!box) return;
    _cur = t;
    if (!ready() && typeof window.loadSocial === "function") { try { await window.loadSocial(); } catch (e) { /* */ } }
    if (!ready()) { box.innerHTML = ""; return; }
    const rows = await fetchRecent(t.id, force).catch(() => null);
    if (_cur !== t || !document.getElementById("trailReportBox")) return;
    if (rows == null) { box.innerHTML = ""; return; }
    const bad = rows.filter(r => r.kind !== "ok").length;
    box.innerHTML = `<div class="section-title">${ic("megaphone")}<span>${T("山友回報")}</span><small class="trp-sub">${T("最近 7 天")}</small></div>
      ${rows.length ? `${bad ? `<div class="trp-sum">${ic("alert")}<span>${T("有路況提醒，出發前看一下")}</span><b>${bad}</b></div>` : ""}
        <div class="trp-list">${rows.slice(0, 5).map(r => itemHtml(t, r)).join("")}</div>`
      : `<div class="trp-empty">${T("最近 7 天沒人回報。走完可以幫下一個人回報一下路況")}</div>`}
      <button class="btn ghost trp-add" id="trpAdd">${ic("plus")} ${T("回報路況")}</button>`;
    box.querySelector("#trpAdd").addEventListener("click", () => openForm(t));
    box.querySelectorAll(".trp-photo").forEach(img => img.addEventListener("click", () => { if (typeof Lightbox !== "undefined") Lightbox.open(img.src); }));
    // 檢舉別人的回報（schema-phase33）：3 個人檢舉就先自動藏起來，等管理員看
    box.querySelectorAll(".trp-flag").forEach(b => b.addEventListener("click", async () => {
      const uid = await me();
      if (!uid) { toast(T("先登入才能檢舉")); return; }
      const reason = await ttChoice(T("這則回報哪裡有問題？"), [
        { label: T("取消"), value: null, cls: "ghost" },
        { label: T("內容不實"), value: "false", cls: "ghost" },
        { label: T("廣告或洗版"), value: "spam", cls: "ghost" },
        { label: T("不當內容"), value: "abuse", cls: "danger-solid" },
      ]);
      if (!reason) return;
      b.disabled = true;
      const { error } = await Supa.client().from("trail_report_flags").insert({ report_id: b.dataset.id, reporter_id: uid, reason });
      if (error && !/duplicate|unique/i.test(error.message || "")) { b.disabled = false; toast(/trail_report_flags|does not exist|schema cache/i.test(error.message || "") ? T("資料庫還沒開這個功能") : T(Supa.errText(error.message))); return; }
      b.textContent = T("已檢舉"); toast(T("謝謝，我們會看一下"));
    }));
    box.querySelectorAll(".trp-del").forEach(b => b.addEventListener("click", async () => {
      if (!(await ttConfirm(T("刪掉這則回報？"), T("刪除"), T("取消"), { danger: true }))) return;
      const { error } = await Supa.client().from("trail_reports").delete().eq("id", b.dataset.id);
      if (error) { toast(T(Supa.errText(error.message))); return; }
      toast(T("刪掉了")); load(t, true);
    }));
  }

  async function me() { try { const { data } = await Supa.meUser(); return data && data.user ? data.user.id : null; } catch (e) { return null; } }
  async function openForm(t) {
    if (document.querySelector('[data-ov="trp"]')) return;
    if (!ready()) { toast(T("社群暫時用不了。")); return; }
    const uid = await me();
    if (!uid) {   // 自用模式下社群分頁藏著，也一樣帶去登入
      toast(T("先登入才能回報路況"));
      const tab = document.querySelector('.tab[data-view="social"]'); if (tab) tab.click();
      return;
    }
    let kind = null, photo = null, pos = null;
    const ov = document.createElement("div"); ov.className = "pet-modal trp-modal"; ov.dataset.ov = "trp";
    ov.innerHTML = `<div class="pet-modal-card trp-card"><button class="sheet-close" id="trpX" aria-label="${T("關閉")}">${ic("x")}</button>
      <h2>${ic("megaphone")} ${T("回報路況")}</h2>
      <div class="trp-for">${ic("mountain")} <span>${escHtml(T(t.name))}</span></div>
      <div class="trp-k-h">${T("路況怎麼樣？")}</div>
      <div class="trp-kinds" role="radiogroup">${KINDS.map(([k, l, i]) => `<button class="trp-k k-${k}" data-k="${k}" role="radio" aria-checked="false">${ic(i)}<span>${T(l)}</span></button>`).join("")}</div>
      <textarea id="trpNote" class="comp-cap" maxlength="300" placeholder="${T("補充一句（選填）：例如 2.3K 有倒木，要從旁邊繞")}"></textarea>
      <div class="trp-opts">
        <label class="trp-photo-btn">${ic("camera")} <span id="trpPhotoL">${T("加一張照片")}</span><input type="file" id="trpFile" accept="image/*" hidden></label>
        <label class="trp-loc"><input type="checkbox" class="tt-switch" id="trpLoc" checked> <span>${T("附上我現在的位置")}</span></label>
      </div>
      <div class="auth-msg" id="trpMsg"></div>
      <button class="btn primary" id="trpSend" disabled>${T("送出回報")}</button>
      <div class="trp-tip">${T("回報會公開給所有人看，7 天後自動消失")}</div></div>`;
    document.body.appendChild(ov);
    let _a11y = null;
    const close = () => { if (_a11y) _a11y(); ov.remove(); };
    if (typeof ttModalA11y === "function") _a11y = ttModalA11y(ov, close, { focus: ".trp-k" });
    ov.querySelector("#trpX").onclick = close;
    ov.addEventListener("click", e => { if (e.target === ov) close(); });
    const send = ov.querySelector("#trpSend"), msg = ov.querySelector("#trpMsg");
    ov.querySelectorAll(".trp-k").forEach(b => b.addEventListener("click", () => {
      kind = b.dataset.k;
      ov.querySelectorAll(".trp-k").forEach(x => { const on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-checked", on); });
      send.disabled = false;
    }));
    const setPhoto = f => { if (!f) return; photo = f; ov.querySelector("#trpPhotoL").textContent = T("已選 1 張照片"); };
    ov.querySelector("#trpFile").addEventListener("change", e => setPhoto(e.target.files[0]));
    if (typeof NativeCam !== "undefined" && NativeCam.isNative && NativeCam.isNative()) {
      ov.querySelector(".trp-photo-btn").addEventListener("click", async ev => { ev.preventDefault(); setPhoto(await NativeCam.pickImage(typeof I18n !== "undefined" ? I18n.tx : null)); });
    }
    // 位置：記錄中就用軌跡最後一點；沒在記錄就抓一次。離步道 3 km 以上就不附（人不在現場）
    const s = typeof Recorder !== "undefined" && Recorder.snapshot ? Recorder.snapshot() : null;
    const last = s && s.track && s.track.length ? s.track[s.track.length - 1] : null;
    if (last) pos = { lat: last.lat, lon: last.lon };
    else if (navigator.geolocation) navigator.geolocation.getCurrentPosition(p => { pos = { lat: p.coords.latitude, lon: p.coords.longitude }; }, () => { }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 120000 });
    send.addEventListener("click", async () => {
      if (!kind || send.disabled) return;
      if (!(await ttRulesGate()) || !ttCleanOk(ov.querySelector("#trpNote").value)) return;   // 社群規範＋不當字詞
      send.disabled = true; msg.className = "auth-msg"; msg.textContent = T("送出中…");
      try {
        let photo_url = null;
        if (photo && typeof Media !== "undefined") {
          const { main } = await Media.compressImage(photo, 1280, 200, 0.8);
          const id = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now());
          const path = `${uid}/reports/${id}.jpg`;
          const { error: ue } = await Supa.client().storage.from("media").upload(path, main, { contentType: "image/jpeg", upsert: true });
          if (ue) throw ue;
          photo_url = Supa.client().storage.from("media").getPublicUrl(path).data.publicUrl;
        }
        const useLoc = ov.querySelector("#trpLoc").checked && pos && t.lat && haversine(pos, { lat: t.lat, lon: t.lon }) < 15000;
        const row = { trail_id: String(t.id), author_id: uid, kind, note: ov.querySelector("#trpNote").value.trim() || null, photo_url, lat: useLoc ? pos.lat : null, lon: useLoc ? pos.lon : null };
        const { error } = await Supa.client().from("trail_reports").insert(row);
        if (error) throw error;
        close(); toast(T("謝謝你的回報，下一個人會更安全"));
        if (document.getElementById("trailReportBox") && _cur && String(_cur.id) === String(t.id)) load(t, true);
      } catch (e) {
        send.disabled = false; msg.className = "auth-msg bad";
        const m = (e && e.message) || "";
        msg.textContent = /trail_reports|relation|does not exist|schema cache/i.test(m) ? T("資料庫還沒開這個功能") : /rate limit/i.test(m) ? T("今天回報太多次了，明天再來") : T(Supa.errText(m));
      }
    });
  }
  return { load, openForm, KINDS };
})();
if (typeof window !== "undefined") window.TrailReports = TrailReports;
