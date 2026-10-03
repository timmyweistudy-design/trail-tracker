// 發文視窗：把一筆健行記錄 + 照片發成貼文。用全螢幕覆蓋層，避免和既有面板衝突。
const Composer = (() => {
  let files = [];
  let video = null;
  let rating = 0;
  const T = s => (typeof ttT === "function" ? ttT(s) : s);

  function open(rec, presetFiles, presetCaption) {
    if (typeof ttBusy === "function" && ttBusy("composer")) return;   // 防連點
    if (typeof Supa === "undefined" || !Supa.ready()) { toast(T("社群尚未啟用")); return; }
    Auth.session().then(async (s) => {
      if (!s) { toast(T("請先到「社群」分頁登入")); return; }
      const prof = await Auth.myProfile();
      if (!prof) { toast(T("請先到「社群」分頁完成註冊")); return; }
      mount(rec, presetFiles, presetCaption);
    });
  }

  function mount(rec, presetFiles, presetCaption) {
    if (document.querySelector(".composer-mask")) return;   // 防連點疊層
    files = (presetFiles && presetFiles.length) ? presetFiles.slice(0, 9) : []; video = null; rating = 0;
    const wrap = document.createElement("div");
    wrap.className = "composer-mask"; wrap.dataset.ov = "composer";   // data-ov：Esc／返回鍵會關它（以前關不掉）
    wrap.innerHTML = `
      <div class="composer">
        <div class="composer-head"><button class="comp-x" aria-label="${T("關閉")}" id="compX">${ic("x")}</button><b>${T("分享到社群")}</b><button class="btn primary comp-post" id="compPost">${T("發布")}</button></div>
        <div class="comp-trail">${ic("mountain")} <b>${esc(rec.trailName || "自由路線")}</b><span>${(rec.distanceKm || 0).toFixed(1)} km · ↑${Math.round(rec.ascent || 0)} m</span></div>
        ${rec.trailId ? `<div class="comp-rate"><span>${(typeof ttT === "function" ? ttT : x => x)("給這條步道幾顆星")}</span><span class="comp-stars" id="compStars" role="radiogroup">${[1, 2, 3, 4, 5].map(n => `<button type="button" class="cs" data-r="${n}" aria-label="${n}">${typeof STAR_SVG !== "undefined" ? STAR_SVG : "★"}</button>`).join("")}</span></div>` : ""}
        <textarea id="compCaption" class="comp-cap" placeholder="${T("寫下這趟的心得…")}" maxlength="2000"></textarea>
        <div class="comp-photos" id="compPhotos"></div>
        <div class="comp-adds"><label class="comp-add">${ic("camera")} <span>${T("加照片")}</span><input type="file" id="compFiles" accept="image/*" multiple hidden></label>
        <label class="comp-add">${ic("video")} <span>${T("加影片")}</span><input type="file" id="compVideo" accept="video/*" hidden></label></div>
        <div id="compVideoName" class="comp-trail"></div>
        <div class="comp-vis seg" role="radiogroup">
          <label><input type="radio" name="compVis" value="friends"${(localStorage.getItem("tt_default_vis") || "friends") === "friends" ? " checked" : ""}><span>${ic("users")} ${T("只給好友")}</span></label>
          <label><input type="radio" name="compVis" value="public"${localStorage.getItem("tt_default_vis") === "public" ? " checked" : ""}><span>${ic("globe")} ${T("公開")}</span></label>
        </div>
        <div class="comp-msg" id="compMsg"></div>
      </div>`;
    document.body.appendChild(wrap);
    const cap = wrap.querySelector("#compCaption");
    // 草稿綁在這一趟行程上：以前只有一份草稿，分享別趟時會跑出上一趟沒寫完的心得
    const rid = String(rec.id || rec.date || "");
    if (presetCaption) cap.value = presetCaption;
    else { try { const d = JSON.parse(localStorage.getItem("tt_draft") || "null"); if (d && d.rid === rid && d.text) cap.value = d.text; } catch (e) { } }
    cap.addEventListener("input", () => { try { localStorage.setItem("tt_draft", JSON.stringify({ rid, text: cap.value })); } catch (e) { } });
    if (typeof Autocomplete !== "undefined") Autocomplete.attach(cap);
    const stars = wrap.querySelectorAll("#compStars .cs");
    stars.forEach(s => s.addEventListener("click", () => { rating = (rating === +s.dataset.r) ? 0 : +s.dataset.r; stars.forEach(x => x.classList.toggle("on", +x.dataset.r <= rating)); }));   // 再按同一顆＝取消
    let _a11y = null;
    const close = () => { if (_a11y) _a11y(); _urls.forEach(u => URL.revokeObjectURL(u)); _urls = []; wrap.remove(); };
    if (typeof ttModalA11y === "function") _a11y = ttModalA11y(wrap, close, { focus: "#compCaption" });
    wrap.querySelector("#compX").addEventListener("click", close);
    wrap.querySelector("#compFiles").addEventListener("change", e => {
      for (const f of e.target.files) if (files.length < 9) files.push({ file: f });   // 額外加的照片無時間/里程
      renderPhotos(wrap);
    });
    // 原生 App：攔截「加照片」改走 Capacitor 相機（WKWebView 的 file input 拍照會黑畫面）。
    // 一次加一張（相機或相簿），網頁維持 file input 的多選。
    if (typeof NativeCam !== "undefined" && NativeCam.isNative()) {
      const addLabel = wrap.querySelector("#compFiles").closest(".comp-add");
      if (addLabel) addLabel.addEventListener("click", async ev => {
        ev.preventDefault();
        if (files.length >= 9) return;
        const f = await NativeCam.pickImage(typeof I18n !== "undefined" ? I18n.tx : null);
        if (f) { files.push({ file: f }); renderPhotos(wrap); }
      });
    }
    wrap.querySelector("#compVideo").addEventListener("change", async e => {
      const f = e.target.files[0]; if (!f) return;
      const msg = wrap.querySelector("#compMsg"); msg.textContent = T("檢查影片…");
      const r = await Media.validateVideo(f);
      if (!r.ok) { msg.textContent = r.msg; video = null; wrap.querySelector("#compVideoName").textContent = ""; return; }
      video = { file: f, dur: r.dur }; msg.textContent = "";
      wrap.querySelector("#compVideoName").innerHTML = ic("video") + " " + esc(f.name);
    });
    wrap.querySelector("#compPost").addEventListener("click", () => submit(wrap, rec, close));
    if (files.length) renderPhotos(wrap);   // 顯示隨手拍預載的照片（可刪可加）
  }

  let _urls = [];
  function renderPhotos(wrap) {
    _urls.forEach(u => URL.revokeObjectURL(u)); _urls = [];   // 回收上一輪的物件 URL
    const box = wrap.querySelector("#compPhotos");
    box.innerHTML = files.map((it, i) => { const u = URL.createObjectURL(it.file || it); _urls.push(u); return `<div class="comp-thumb"><img src="${u}" alt=""><button data-i="${i}" class="comp-del" aria-label="${T("移除")}">${ic("x")}</button>${(it.km != null) ? `<span class="comp-thumb-km">${(+it.km).toFixed(1)}km</span>` : ""}</div>`; }).join("");
    box.querySelectorAll(".comp-del").forEach(b => b.addEventListener("click", () => { files.splice(+b.dataset.i, 1); renderPhotos(wrap); }));
  }

  async function submit(wrap, rec, close) {
    const msg = wrap.querySelector("#compMsg");
    const caption = wrap.querySelector("#compCaption").value.trim();
    const visibility = wrap.querySelector('input[name="compVis"]:checked').value;
    if (wrap.querySelector("#compPost").disabled) return;
    if (!(await ttRulesGate()) || !ttCleanOk(caption)) return;   // 社群規範＋不當字詞（moderation.js）
    wrap.querySelector("#compPost").disabled = true;
    const T = typeof ttT === "function" ? ttT : x => x;
    msg.textContent = T(files.length || video ? "發布中…照片上傳要一點時間" : "發布中…");
    const r = await Posts.createFromRecord(rec, { caption, visibility, files, video, rating });
    if (r.error) { msg.textContent = T(Supa.errText(r.error)); wrap.querySelector("#compPost").disabled = false; return; }
    msg.textContent = T("發好了！");
    // 貼文星星 → 回寫本機步道評分，讓「我評 4★+」篩選連動（自由路線無 trailId 不算）
    if (rec.trailId && rating > 0 && typeof Store !== "undefined") {
      try { Store.setTrailLog(String(rec.trailId), { rating }); } catch (e) { /* */ }
    }
    try { localStorage.removeItem("tt_draft"); } catch (e) { }   // 發布成功清草稿
    // 有照片沒傳上去要講（以前默默少掉）
    if (typeof toast === "function") toast(r.failed ? `${T("發好了，不過有檔案沒傳上去：")}${r.failed}` : T("分享到社群了"));
    if (typeof SocialUI !== "undefined") SocialUI.refresh();   // 刷新動態牆，立即看到新貼文
    setTimeout(close, 600);
  }

  const esc = s => Supa.esc(s);
  return { open };
})();
