// 發文視窗：把一筆健行記錄 + 照片發成貼文。用全螢幕覆蓋層，避免和既有面板衝突。
const Composer = (() => {
  let files = [];
  let video = null;

  function open(rec) {
    if (typeof Supa === "undefined" || !Supa.ready()) { alert("社群尚未啟用"); return; }
    Auth.session().then(async (s) => {
      if (!s) { alert("請先到「社群」分頁登入"); return; }
      const prof = await Auth.myProfile();
      if (!prof) { alert("請先到「社群」分頁完成註冊"); return; }
      mount(rec);
    });
  }

  function mount(rec) {
    files = []; video = null;
    const wrap = document.createElement("div");
    wrap.className = "composer-mask";
    wrap.innerHTML = `
      <div class="composer">
        <div class="composer-head"><button class="comp-x" id="compX">✕</button><b>分享到社群</b><button class="btn primary comp-post" id="compPost">發布</button></div>
        <div class="comp-trail">⛰️ ${esc(rec.trailName || "自由路線")}　${(rec.distanceKm || 0).toFixed(2)}km　↑${rec.ascent || 0}m</div>
        <textarea id="compCaption" class="comp-cap" placeholder="寫下這趟的心得…" maxlength="2000"></textarea>
        <div class="comp-photos" id="compPhotos"></div>
        <label class="comp-add">＋ 加照片<input type="file" id="compFiles" accept="image/*" multiple hidden></label>
        <label class="comp-add">＋ 加影片<input type="file" id="compVideo" accept="video/*" hidden></label>
        <div id="compVideoName" class="comp-trail"></div>
        <div class="comp-vis">
          <label><input type="radio" name="compVis" value="friends" checked> 只給好友</label>
          <label><input type="radio" name="compVis" value="public"> 公開</label>
        </div>
        <div class="comp-msg" id="compMsg"></div>
      </div>`;
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.querySelector("#compX").addEventListener("click", close);
    wrap.querySelector("#compFiles").addEventListener("change", e => {
      for (const f of e.target.files) if (files.length < 9) files.push(f);
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
  }

  function renderPhotos(wrap) {
    const box = wrap.querySelector("#compPhotos");
    box.innerHTML = files.map((f, i) => `<div class="comp-thumb"><img src="${URL.createObjectURL(f)}" alt=""><button data-i="${i}" class="comp-del">✕</button></div>`).join("");
    box.querySelectorAll(".comp-del").forEach(b => b.addEventListener("click", () => { files.splice(+b.dataset.i, 1); renderPhotos(wrap); }));
  }

  async function submit(wrap, rec, close) {
    const msg = wrap.querySelector("#compMsg");
    const caption = wrap.querySelector("#compCaption").value.trim();
    const visibility = wrap.querySelector('input[name="compVis"]:checked').value;
    wrap.querySelector("#compPost").disabled = true;
    msg.textContent = "發布中…（上傳照片可能需要一點時間）";
    const r = await Posts.createFromRecord(rec, { caption, visibility, files, video });
    if (r.error) { msg.textContent = "發布失敗：" + r.error; wrap.querySelector("#compPost").disabled = false; return; }
    msg.textContent = "已發布！";
    if (typeof toast === "function") toast("已分享到社群");
    if (typeof SocialUI !== "undefined") SocialUI.route();   // 刷新動態牆，立即看到新貼文
    setTimeout(close, 600);
  }

  function esc(s) { return (s || "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])); }
  return { open };
})();
