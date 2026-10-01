// 個人頁：Phase 1 先做「自己的」檢視與編輯（貼文牆於 Phase 2 接上）。
const Profiles = (() => {
  const esc = s => Supa.esc(s);

  // 把本機寵物名字/等級/里程同步到雲端 profile，讓好友看得到進度
  // 有變才寫；沒變的話 10 分鐘最多一次（以前每進一次社群寫兩次）
  let _syncSig = "", _syncAt = 0;
  async function syncMyStats(uid) {
    if (typeof petStats !== "function") return;
    const s = petStats(); const c = Supa.client(); if (!c) return;
    const sig = [uid, s.name, s.level, s.km].join("|");
    if (sig === _syncSig && Date.now() - _syncAt < 600000) return;
    _syncSig = sig; _syncAt = Date.now();
    try { await c.from("profiles").update({ pet_name: s.name, pet_level: s.level, total_km: s.km }).eq("id", uid); } catch (e) { _syncSig = ""; }
  }
  const T = s => (typeof ttT === "function" ? ttT(s) : s);
  const say = s => { if (typeof toast === "function") toast(T(s)); };
  // 分享我的帳號：App 裡沒有可開的網址，就只分享文字（以前分享出去是 capacitor://localhost 打不開）
  async function shareHandle(prof) {
    let text = T("一起來用「循徑拾光」記錄爬山、養山林夥伴吧！");
    if (prof.handle) text += "\n" + T("在 App 加我：") + "@" + prof.handle;
    const link = Supa.webLink("");
    try {
      if (navigator.share) await navigator.share(link ? { title: "循徑拾光", text, url: link } : { title: "循徑拾光", text });
      else if (navigator.clipboard) { await navigator.clipboard.writeText(link ? text + "\n" + link : text); say("已複製邀請"); }
    } catch (e) { /* 使用者取消分享不算錯 */ }
  }
  function petLine(ps) {
    if (!ps) return "";
    return `<div class="pf-pet">${typeof PET_ART !== "undefined" ? PET_ART.svg((ps.level || 1) - 1) : ps.emoji} ${esc(ps.name)} <span class="lv-chip lvt-${Math.min(ps.level, 7)}">Lv.${ps.level}</span>　·　已走 ${ps.km} km</div>`;
  }

  function renderMe(render, prof) {
    if (prof.avatar_url) window.__meAvatar = prof.avatar_url;   // 地圖「我」標記＝社群頭像（換頭像後也同步）
    const hero = (typeof ttProfileHero === "function") ? ttProfileHero(prof) : "";
    render(`
      <div class="pf${prof.cover_url ? " has-cover" : ""}">
        ${prof.cover_url ? `<div class="pf-cover" style="background-image:url('${esc(prof.cover_url)}')"></div>` : ""}
        ${hero}
        <div class="pf-counts"><span class="cnt" id="pfPostCount"></span><span id="pfFollowCounts" class="pf-fc"></span></div>
        ${prof.bio ? `<div class="pf-bio">${esc(prof.bio)}</div>` : ""}
        <div class="pf-actions4">
          <button class="pf-act" id="pfEdit">${ic("pencil")}<span>${T("編輯")}</span></button>
          <button class="pf-act" id="pfSaved">${ic("bookmark")}<span>${T("收藏")}</span></button>
          <button class="pf-act" id="pfEvents">${ic("calendar")}<span>${T("揪團")}</span></button>
          <button class="pf-act" id="pfSettings">${ic("sliders")}<span>${T("設定")}</span></button>
        </div>
        <div id="pfPosts" class="feed-loading"><span class="spin"></span></div>
      </div>`);
    if (typeof bindProfAch === "function") bindProfAch();
    document.getElementById("pfEdit").addEventListener("click", () => renderEdit(render, prof));
    document.getElementById("pfSaved").addEventListener("click", () => renderSaved(render, prof));
    document.getElementById("pfEvents").addEventListener("click", () => { if (typeof Events !== "undefined") Events.open(); });
    document.getElementById("pfSettings").addEventListener("click", () => renderSettings(render, prof));
    Posts.followCounts(prof.id).then(c => {
      const el = document.getElementById("pfFollowCounts"); if (!el) return;
      el.innerHTML = `<button class="cnt-link" data-mode="followers"><b>${c.followers}</b> ${T("粉絲")}</button><button class="cnt-link" data-mode="following"><b>${c.following}</b> ${T("追蹤中")}</button>`;
      el.querySelectorAll(".cnt-link").forEach(s => s.addEventListener("click", () => { if (typeof Discover !== "undefined") Discover.openUserList(prof.id, s.dataset.mode); }));
    });
    Posts.userPosts(prof.id).then(async posts => {
      // 舊貼文的星星回填本機步道評分（只補「本機未評分」的，不覆蓋較新的本機評分；自由路線不算）
      try {
        if (typeof Store !== "undefined") for (const p of posts) {
          if (p.trail_id && p.rating > 0 && !(Store.trailLog(String(p.trail_id)).rating > 0)) {
            Store.setTrailLog(String(p.trail_id), { rating: p.rating });
          }
        }
      } catch (e) { /* */ }
      const pc = document.getElementById("pfPostCount"); if (pc) pc.innerHTML = `<b>${posts.length}</b> ${T("篇")}`;
      const box = document.getElementById("pfPosts"); if (!box) return;
      box.className = "feed-list";
      if (!posts.length) { box.className = "pf-posts-empty"; box.textContent = T("還沒發過文。走完一趟，在結算頁按「分享到社群」就會出現在這。"); return; }
      const liked = await Posts.likedSet(posts.map(p => p.id));
      box.innerHTML = posts.map(p => Feed.card(p, liked.has(p.id))).join("");
      Feed.bindCards(box);   // 以前這裡只綁「點卡片」，按讚沒反應、影片放不出來
    });
  }

  // 收藏的貼文
  async function renderSaved(render, prof) {
    render(`<div class="pf"><div class="pf-sub-head"><button class="sub-back" id="svBack" aria-label="${T("返回")}">${ic("chevron")}</button><b>${ic("bookmark")} ${T("我的收藏")}</b></div><div id="svPosts" class="feed-loading"><span class="spin"></span></div></div>`);
    document.getElementById("svBack").addEventListener("click", () => renderMe(render, prof));
    const posts = await Posts.savedPosts();
    const box = document.getElementById("svPosts"); if (!box) return;
    if (!posts.length) { box.className = "social-empty"; box.innerHTML = `<span class="ee">${ic("bookmark")}</span>${T("還沒有收藏。看到喜歡的貼文，按右上角的書籤就會收在這。")}`; return; }
    const liked = await Posts.likedSet(posts.map(p => p.id));
    box.className = "feed-list";
    box.innerHTML = posts.map(p => Feed.card(p, liked.has(p.id))).join("");
    Feed.bindCards(box);
  }

  // 刪除帳號（App Store 5.1.1(v) 要求）：兩段確認 → 呼叫 delete-account Edge Function（連 storage＋auth＋DB cascade 全清）→ 登出重載
  async function deleteAccount(render, prof) {
    if (!(await ttConfirm("確定要刪除帳號嗎？你的個人檔案、貼文、留言、追蹤、小隊與雲端備份都會永久刪除，無法復原。", "繼續刪除", "取消"))) return;
    if (!(await ttConfirm("最後確認：帳號與所有資料將永久刪除，真的要刪除嗎？", "永久刪除", "取消"))) return;
    const del = document.getElementById("stDelete");
    if (del) { del.disabled = true; del.textContent = ttT("刪除中…"); }
    try {
      const c = Supa.client();
      const { data, error } = await c.functions.invoke("delete-account");
      if (error || (data && data.error)) {
        if (del) { del.disabled = false; del.textContent = ttT("刪除帳號"); }
        if (typeof toast === "function") toast(T("沒刪成功，等一下再試"));
        return;
      }
      try { ["tt_records", "tt_profile", "tt_favs", "tt_log", "tt_life", "tt_data_uid", "tt_last_sync", "tt_backup_pending"].forEach(k => localStorage.removeItem(k)); } catch (e) { /* */ }
      try { await Auth.signOut(); } catch (e) { /* */ }
      if (typeof toast === "function") toast("帳號已刪除");
      setTimeout(() => location.reload(), 900);
    } catch (e) {
      if (del) { del.disabled = false; del.textContent = ttT("刪除帳號"); }
      if (typeof toast === "function") toast(T("沒刪成功，等一下再試"));
    }
  }
  // 隱私與設定：預設發文可見度 + 封鎖名單管理
  async function renderSettings(render, prof) {
    const defVis = localStorage.getItem("tt_default_vis") || "friends";
    const approval = prof.follow_approval !== false;   // 預設開啟：別人追蹤需我同意
    render(`<div class="pf"><div class="pf-sub-head"><button class="sub-back" id="stBack" aria-label="${T("返回")}">${ic("chevron")}</button><b>${ic("sliders")} ${T("隱私與設定")}</b></div>
      <div class="set-group"><div class="set-label">${T("追蹤")}</div>
        <label class="set-row"><span>${T("別人追蹤我要先經過我同意")}<small>${T("關掉的話，任何人都能直接追蹤你")}</small></span><input type="checkbox" id="stApprove" ${approval ? "checked" : ""}></label>
      </div>
      <div class="set-group" id="stPushGroup" hidden><div class="set-label">${T("通知")}</div>
        <label class="set-row"><span>${T("有人按讚、留言、追蹤時推播通知我")}</span><input type="checkbox" id="stPush"></label>
      </div>
      <div class="set-group"><div class="set-label">預設發文可見度</div>
        <label class="set-row"><span>只給好友</span><input type="radio" name="dvis" value="friends" ${defVis === "friends" ? "checked" : ""}></label>
        <label class="set-row"><span>公開</span><input type="radio" name="dvis" value="public" ${defVis === "public" ? "checked" : ""}></label>
      </div>
      <div class="set-group"><div class="set-label">封鎖名單</div><div id="stBlocks"><div class="feed-loading"><span class="spin"></span></div></div></div>
      <div class="set-group"><div class="set-label">我的檢舉</div><div id="stReports"><div class="feed-loading"><span class="spin"></span></div></div></div>
      <div class="set-group"><div class="set-label">${T("帳號")}</div>
        <button class="set-row set-btn" id="stShare"><span>${ic("share")} ${T("分享我的帳號")}</span></button>
        <button class="set-row set-btn" id="stSignout"><span>${ic("logout")} ${T("登出")}</span></button>
      </div>
      <div class="set-group"><div class="set-label">${T("刪除帳號")}</div>
        <button class="btn ghost st-danger" id="stDelete">${T("刪除帳號")}</button>
        <div class="set-empty">${T("帳號和所有資料（貼文、追蹤、小隊、雲端備份）會永久刪除，救不回來。")}</div>
      </div>
      </div>`);
    document.getElementById("stShare").addEventListener("click", () => shareHandle(prof));
    document.getElementById("stSignout").addEventListener("click", async () => {
      if (!(await ttConfirm(T("要登出嗎？這台手機上的行程不會刪掉。"), T("登出"), T("取消")))) return;
      const btn = document.getElementById("stSignout"); if (btn) btn.disabled = true;
      try { window.__meAvatar = null; if (typeof TeamLive !== "undefined") TeamLive.stop(); } catch (e) { }
      await Auth.signOut();
      say("登出了");
      SocialUI.route();   // 立即切回登入畫面，不必重開 App
    });
    // 推播開關（原本在通知頁最上面一顆大按鈕，每次打開都看到）
    (async () => {
      const web = typeof Push !== "undefined" && Push.supported(), nat = typeof NativePush !== "undefined" && NativePush.available();
      if (!web && !nat) return;
      const g = document.getElementById("stPushGroup"), cb = document.getElementById("stPush"); if (!g || !cb) return;
      cb.checked = web ? await Push.isOn() : await NativePush.isOn(); g.hidden = false;
      cb.addEventListener("change", async () => { cb.disabled = true; const on = web ? await Push.toggle() : await NativePush.toggle(); cb.checked = !!(web ? await Push.isOn() : await NativePush.isOn()); cb.disabled = false; void on; });
    })();
    const del = document.getElementById("stDelete");
    if (del) del.addEventListener("click", () => deleteAccount(render, prof));
    document.getElementById("stBack").addEventListener("click", () => renderMe(render, prof));
    const ap = document.getElementById("stApprove");
    if (ap) ap.addEventListener("change", async () => {
      const c = Supa.client();
      const { error } = await c.from("profiles").update({ follow_approval: ap.checked }).eq("id", prof.id);
      if (error) { ap.checked = !ap.checked; say("沒存成功，等一下再試試"); return; }
      prof.follow_approval = ap.checked; if (typeof SocialUI !== "undefined") SocialUI.setProfile(prof);
      say(ap.checked ? "好，之後有人追蹤會先問你" : "好，任何人都能直接追蹤你了");
    });
    document.querySelectorAll('input[name="dvis"]').forEach(r => r.addEventListener("change", () => {
      localStorage.setItem("tt_default_vis", r.value); say(r.value === "public" ? "之後發文預設公開" : "之後發文預設只給好友");
    }));
    const bb = document.getElementById("stBlocks");
    const people = (typeof Safety !== "undefined") ? await Safety.blockedProfiles() : [];
    if (bb) {
      if (!people.length) bb.innerHTML = `<div class="set-empty">沒有封鎖任何人。</div>`;
      else {
        bb.innerHTML = people.map(p => `<div class="set-block-row" data-id="${p.id}">
          ${p.avatar_url ? `<img class="fc-av" src="${esc(p.avatar_url)}">` : `<div class="fc-av fc-av-ph">${esc((p.display_name || p.handle).slice(0, 1))}</div>`}
          <div class="disc-id"><b>${esc(p.display_name || p.handle)}</b><span>@${esc(p.handle)}</span></div>
          <button class="btn ghost st-unblock" data-id="${p.id}">解除</button></div>`).join("");
        bb.querySelectorAll(".st-unblock").forEach(b => b.addEventListener("click", async () => {
          await Safety.unblock(b.dataset.id); if (typeof toast === "function") toast("已解除封鎖"); renderSettings(render, prof);
        }));
      }
    }
    renderMyReports(render, prof);
  }

  // 我送出的檢舉：可以看、可以撤回（誤按不用認了）
  async function renderMyReports(render, prof) {
    const rb = document.getElementById("stReports");
    if (!rb || typeof Safety === "undefined" || !Safety.myReports) return;
    const rows = await Safety.myReports();
    if (!rows.length) { rb.innerHTML = `<div class="set-empty">沒有檢舉任何內容。</div>`; return; }
    rb.innerHTML = rows.map(r => {
      // 貼文可能已被刪除（post_id 會被設成 null 或查不到內容）→ 據實說明，不要顯示空白
      const what = r.post_id
        ? (r.postText == null ? "（貼文已刪除）" : `「${esc(String(r.postText).slice(0, 40))}${String(r.postText).length > 40 ? "…" : ""}」`)
        : (r.userName ? `@${esc(r.userName)}` : "（對象已不存在）");
      const when = new Date(r.created_at).toLocaleDateString(typeof ttLocale === "function" ? ttLocale() : "zh-TW");
      return `<div class="set-block-row rp-row" data-id="${r.id}">
        <div class="rp-what"><b>${what}</b><span>${esc(r.reason || "")} · ${when}</span></div>
        <button class="btn ghost rp-undo" data-id="${r.id}" data-post="${esc(r.post_id || "")}">撤回</button></div>`;
    }).join("");
    rb.querySelectorAll(".rp-undo").forEach(b => b.addEventListener("click", async () => {
      b.disabled = true;
      const ok = await Safety.unreport(b.dataset.id, b.dataset.post || null);
      if (typeof toast === "function") toast(ok ? (b.dataset.post ? "已撤回檢舉，貼文回到動態牆" : "已撤回檢舉") : "撤回失敗，等一下再試試");
      if (ok) renderMyReports(render, prof); else b.disabled = false;
    }));
  }

  function renderEdit(render, prof) {
    let avatarFile = null, coverFile = null;
    const avHtml = prof.avatar_url
      ? `<img class="pf-av" id="edAvImg" src="${esc(prof.avatar_url)}" alt="">`
      : `<div class="pf-av pf-av-ph" id="edAvImg">${esc((prof.display_name || prof.handle || "?").slice(0, 1))}</div>`;
    render(`
      <div class="social-auth">
        <h3>編輯檔案</h3>
        <div class="pf-av-edit">${avHtml}
          <label class="comp-add">更換頭像<input type="file" id="edAvFile" accept="image/*" hidden></label></div>
        <label class="ob-l">封面照</label>
        <label class="ed-cover${prof.cover_url ? "" : " empty"}" id="edCoverImg" style="${prof.cover_url ? `background-image:url('${esc(prof.cover_url)}')` : ""}"><span class="ed-cover-t">${ic("camera")} ${T(prof.cover_url ? "更換封面" : "加一張封面照")}</span><input type="file" id="edCoverFile" accept="image/*" hidden></label>
        <label class="ob-l" for="edHandle">帳號（朋友用這個找到你）</label>
        <input id="edHandle" class="auth-input" value="${esc(prof.handle || "")}" autocapitalize="off" autocomplete="off" maxlength="20">
        <div class="auth-msg" id="edHandleMsg"></div>
        <label class="ob-l" for="edName">顯示名稱</label>
        <input id="edName" class="auth-input" value="${esc(prof.display_name || "")}" maxlength="40">
        <label class="ob-l" for="edBio">簡介 <small class="ed-count" id="edBioN"></small></label>
        <textarea id="edBio" class="auth-input ed-bio" rows="3" maxlength="300">${esc(prof.bio || "")}</textarea>
        <button class="btn primary" id="edSave">儲存</button>
        <button class="btn ghost" id="edCancel">取消</button>
        <div class="auth-msg" id="edMsg"></div>
      </div>`);
    const setAvatar = f => {
      if (!f) return;
      avatarFile = f;
      const old = document.getElementById("edAvImg");
      const img = document.createElement("img"); img.className = "pf-av"; img.id = "edAvImg"; img.src = URL.createObjectURL(f);
      old.replaceWith(img);
    };
    const setCover = f => {
      if (!f) return;
      coverFile = f; const cv = document.getElementById("edCoverImg"); cv.style.backgroundImage = `url('${URL.createObjectURL(f)}')`; cv.classList.remove("empty");
    };
    document.getElementById("edAvFile").addEventListener("change", e => setAvatar(e.target.files[0]));
    document.getElementById("edCoverFile").addEventListener("change", e => setCover(e.target.files[0]));
    // 原生 App：頭像／封面改走 Capacitor 相機（WKWebView 的 file input 拍照會黑畫面）；網頁維持 file input。
    if (typeof NativeCam !== "undefined" && NativeCam.isNative()) {
      const tx = typeof I18n !== "undefined" ? I18n.tx : null;
      const bind = (inputId, set) => {
        const lab = document.getElementById(inputId).closest(".comp-add, .ed-cover");
        if (lab) lab.addEventListener("click", async ev => { ev.preventDefault(); set(await NativeCam.pickImage(tx)); });
      };
      bind("edAvFile", setAvatar);
      bind("edCoverFile", setCover);
    }
    // handle 即時可用性檢查（與目前相同則略過）
    const hEl = document.getElementById("edHandle"), hMsg = document.getElementById("edHandleMsg");
    let ht = null, hOk = true, seq = 0;
    hEl.addEventListener("input", () => {
      clearTimeout(ht); const v = Handle.validate(hEl.value); const my = ++seq;
      if (v.handle === prof.handle) { hMsg.textContent = ""; hMsg.className = "auth-msg"; hOk = true; return; }
      if (!v.ok) { hMsg.textContent = T(v.msg); hMsg.className = "auth-msg bad"; hOk = false; return; }
      hMsg.textContent = T("檢查中…"); hMsg.className = "auth-msg"; hOk = false;
      ht = setTimeout(async () => {
        const taken = await Auth.handleTaken(v.handle);
        if (my !== seq) return;   // 晚回來的舊結果不算
        if (taken === null) { hMsg.textContent = T("現在查不到，等一下再試"); hMsg.className = "auth-msg bad"; hOk = false; }
        else if (taken) { hMsg.textContent = T("這個帳號名稱有人用了"); hMsg.className = "auth-msg bad"; hOk = false; }
        else { hMsg.textContent = T("可以用"); hMsg.className = "auth-msg ok"; hOk = true; }
      }, 350);
    });
    const bioEl = document.getElementById("edBio"), bioN = document.getElementById("edBioN");
    const bioCount = () => { bioN.textContent = `${bioEl.value.length}/300`; };
    bioEl.addEventListener("input", bioCount); bioCount();
    document.getElementById("edCancel").addEventListener("click", () => renderMe(render, prof));
    document.getElementById("edSave").addEventListener("click", async () => {
      const c = Supa.client(); const msg = document.getElementById("edMsg");
      const display_name = (document.getElementById("edName").value || "").trim();
      const bio = (document.getElementById("edBio").value || "").trim();
      if (bio.length > 300) { msg.textContent = T("簡介最多 300 字"); return; }
      const hv = Handle.validate(hEl.value);
      if (!hv.ok) { msg.textContent = T("帳號名稱") + "：" + T(hv.msg); return; }
      const handleChanged = hv.handle !== prof.handle;
      if (handleChanged && !hOk) { msg.textContent = T("帳號名稱還沒確認可以用"); return; }
      const sv = document.getElementById("edSave"); if (sv.disabled) return; sv.disabled = true;   // 連點會上傳兩次
      msg.textContent = T("儲存中…");
      const patch = { display_name, bio };
      if (handleChanged) patch.handle = hv.handle;
      if (avatarFile) {
        try { patch.avatar_url = await Media.uploadAvatar(prof.id, avatarFile); }
        catch (e) { sv.disabled = false; msg.textContent = T("頭像沒傳上去：") + T(Supa.errText(e && e.message)); return; }
      }
      if (coverFile) {
        try { patch.cover_url = await Media.uploadCover(prof.id, coverFile); }
        catch (e) { sv.disabled = false; msg.textContent = T("封面沒傳上去：") + T(Supa.errText(e && e.message)); return; }
      }
      const { error } = await c.from("profiles").update(patch).eq("id", prof.id);
      if (error) { sv.disabled = false; msg.textContent = /duplicate|unique/i.test(error.message) ? T("這個帳號名稱有人用了") : T(Supa.errText(error.message)); return; }
      const np = Object.assign({}, prof, patch);
      if (typeof SocialUI !== "undefined") SocialUI.setProfile(np);   // 以前沒更新 → 切個子分頁回來又變回舊名字/舊頭像
      say("存好了");
      renderMe(render, np);
    });
  }

  return { renderMe, renderEdit, renderSaved, renderSettings, syncMyStats };
})();
