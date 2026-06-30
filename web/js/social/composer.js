// 發文視窗：把一筆健行記錄 + 照片發成貼文。用全螢幕覆蓋層，避免和既有面板衝突。
const Composer = (() => {
  let files = [];
  let video = null;
  let rating = 0;

  function open(rec, presetFiles, presetCaption) {
    if (typeof Supa === "undefined" || !Supa.ready()) { alert("社群尚未啟用"); return; }
    Auth.session().then(async (s) => {
      if (!s) { alert("請先到「社群」分頁登入"); return; }
      const prof = await Auth.myProfile();
      if (!prof) { alert("請先到「社群」分頁完成註冊"); return; }
      mount(rec, presetFiles, presetCaption);
    });
  }

  function mount(rec, presetFiles, presetCaption) {
    files = (presetFiles && presetFiles.length) ? presetFiles.slice(0, 9) : []; video = null; rating = 0;
    const wrap = document.createElement("div");
    wrap.className = "composer-mask";
    wrap.innerHTML = `
      <div class="composer">
        <div class="composer-head"><button class="comp-x" aria-label="關閉" id="compX">✕</button><b>分享到社群</b><button class="btn primary comp-post" id="compPost">發布</button></div>
        <div class="comp-trail">⛰️ ${esc(rec.trailName || "自由路線")}　${(rec.distanceKm || 0).toFixed(2)}km　↑${rec.ascent || 0}m</div>
        <div class="comp-rate">這條步道評分　<span class="comp-stars" id="compStars">${[1, 2, 3, 4, 5].map(n => `<span class="cs" data-r="${n}">☆</span>`).join("")}</span></div>
        <textarea id="compCaption" class="comp-cap" placeholder="寫下這趟的心得…" maxlength="2000"></textarea>
        <div class="comp-photos" id="compPhotos"></div>
        <label class="comp-add">＋ 加照片<input type="file" id="compFiles" accept="image/*" multiple hidden></label>
        <label class="comp-add">＋ 加影片<input type="file" id="compVideo" accept="video/*" hidden></label>
        <div id="compVideoName" class="comp-trail"></div>
        <div class="comp-vis">
          <label><input type="radio" name="compVis" value="friends"${(localStorage.getItem("tt_default_vis") || "friends") === "friends" ? " checked" : ""}> 只給好友</label>
          <label><input type="radio" name="compVis" value="public"${localStorage.getItem("tt_default_vis") === "public" ? " checked" : ""}> 公開</label>
        </div>
        <div class="comp-msg" id="compMsg"></div>
      </div>`;
    document.body.appendChild(wrap);
    const cap = wrap.querySelector("#compCaption");
    if (presetCaption) cap.value = presetCaption;
    else { const d = localStorage.getItem("tt_draft"); if (d) cap.value = d; }   // 還原草稿
    cap.addEventListener("input", () => { try { localStorage.setItem("tt_draft", cap.value); } catch (e) { } });
    if (typeof Autocomplete !== "undefined") Autocomplete.attach(cap);
    const stars = wrap.querySelectorAll("#compStars .cs");
    stars.forEach(s => s.addEventListener("click", () => { rating = +s.dataset.r; stars.forEach(x => x.textContent = (+x.dataset.r <= rating) ? "★" : "☆"); }));
    const close = () => { _urls.forEach(u => URL.revokeObjectURL(u)); _urls = []; wrap.remove(); };
    wrap.querySelector("#compX").addEventListener("click", close);
    wrap.querySelector("#compFiles").addEventListener("change", e => {
      for (const f of e.target.files) if (files.length < 9) files.push({ file: f });   // 額外加的照片無時間/里程
      renderPhotos(wrap);
    });
    wrap.querySelector("#compVideo").addEventListener("change", async e => {
      const f = e.target.files[0]; if (!f) return;
      const msg = wrap.querySelector("#compMsg"); msg.textContent = "檢查影片…";
      const r = await Media.validateVideo(f);
      if (!r.ok) { msg.textContent = r.msg; video = null; wrap.querySelector("#compVideoName").textContent = ""; return; }
      video = { file: f, dur: r.dur }; msg.textContent = "";
      wrap.querySelector("#compVideoName").textContent = "🎬 " + f.name;
    });
    wrap.querySelector("#compPost").addEventListener("click", () => submit(wrap, rec, close));
    if (files.length) renderPhotos(wrap);   // 顯示隨手拍預載的照片（可刪可加）
  }

  let _urls = [];
  function renderPhotos(wrap) {
    _urls.forEach(u => URL.revokeObjectURL(u)); _urls = [];   // 回收上一輪的物件 URL
    const box = wrap.querySelector("#compPhotos");
    box.innerHTML = files.map((it, i) => { const u = URL.createObjectURL(it.file || it); _urls.push(u); return `<div class="comp-thumb"><img src="${u}" alt=""><button data-i="${i}" class="comp-del">✕</button>${(it.km != null) ? `<span class="comp-thumb-km">${(+it.km).toFixed(1)}km</span>` : ""}</div>`; }).join("");
    box.querySelectorAll(".comp-del").forEach(b => b.addEventListener("click", () => { files.splice(+b.dataset.i, 1); renderPhotos(wrap); }));
  }

  async function submit(wrap, rec, close) {
    const msg = wrap.querySelector("#compMsg");
    const caption = wrap.querySelector("#compCaption").value.trim();
    const visibility = wrap.querySelector('input[name="compVis"]:checked').value;
    wrap.querySelector("#compPost").disabled = true;
    msg.textContent = "發布中…（上傳照片可能需要一點時間）";
    const r = await Posts.createFromRecord(rec, { caption, visibility, files, video, rating });
    if (r.error) { msg.textContent = "發布失敗：" + r.error; wrap.querySelector("#compPost").disabled = false; return; }
    msg.textContent = "已發布！";
    try { localStorage.removeItem("tt_draft"); } catch (e) { }   // 發布成功清草稿
    if (typeof toast === "function") toast("已分享到社群");
    if (typeof SocialUI !== "undefined") SocialUI.route();   // 刷新動態牆，立即看到新貼文
    setTimeout(close, 600);
  }

  function esc(s) { return (s || "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])); }
  return { open };
})();
