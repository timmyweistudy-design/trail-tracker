// 貼文留言：列表（含回覆串）、按讚、翻譯、回覆、送出、刪除。從 postview.js 拆出。
const PostComments = (() => {
  const esc = s => Supa.esc(s);
  const T = s => (typeof ttT === "function" ? ttT(s) : s);
  const say = s => { if (typeof toast === "function") toast(T(s)); };
  const _bodies = {};   // 留言原文（翻譯年糕用）

  function mount(wrap, postId) {
    const input = wrap.querySelector("#pvInput"), sendBtn = wrap.querySelector("#pvSend");
    if (typeof Autocomplete !== "undefined") Autocomplete.attach(input);
    sendBtn.addEventListener("click", () => send(wrap, postId));
    // Enter 直接送出（自動完成清單開著時交給它選）
    input.addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing && !document.querySelector(".ac-box")) { e.preventDefault(); send(wrap, postId); } });
    load(wrap, postId);
  }

  const SEL = "id, body, author_id, parent_id, created_at, author:profiles!comments_author_profile_fk(handle, display_name, avatar_url)";
  async function load(wrap, postId) {
    const c = Supa.client();
    const me = wrap.dataset.me, postAuthor = wrap.dataset.author;
    let threaded = true;
    let res = await c.from("comments").select(SEL).eq("post_id", postId).order("created_at", { ascending: true }).limit(300);
    if (res.error) {   // phase11 未跑（無 parent_id）→ 退回基本留言
      threaded = false;
      res = await c.from("comments").select(SEL.replace(" parent_id,", "")).eq("post_id", postId).order("created_at", { ascending: true }).limit(300);
    }
    const data = res.data || [];
    const box = wrap.querySelector("#pvComments"); if (!box) return;
    if (!data.length) { box.innerHTML = `<div class="social-empty pv-cm-empty">${T("還沒有留言，當第一個吧")}</div>`; return; }

    const cl = await Posts.commentLikes(data.map(cm => cm.id));
    const tops = threaded ? data.filter(cm => !cm.parent_id) : data;
    const childrenOf = id => threaded ? data.filter(cm => cm.parent_id === id) : [];
    const name = cm => (cm.author && (cm.author.display_name || cm.author.handle)) || T("山友");
    const av = cm => (cm.author && cm.author.avatar_url)
      ? `<img class="pv-cm-av" src="${esc(cm.author.avatar_url)}" alt="">`
      : `<span class="pv-cm-av ph">${esc(name(cm).slice(0, 1))}</span>`;
    const row = (cm, isReply) => {
      const canDel = cm.author_id === me || postAuthor === me;
      const n = cl.counts[cm.id] || 0, liked = cl.mine.has(cm.id);
      _bodies[cm.id] = cm.body || "";
      return `<div class="pv-cm ${isReply ? "pv-cm-reply" : ""}" data-id="${cm.id}">
        ${av(cm)}<div class="pv-cm-col">
        <div class="pv-cm-main"><b class="pv-cm-who" data-uid="${esc(cm.author_id)}">${esc(name(cm))}</b> ${Feed.richText(cm.body)}</div>
        <div class="pv-cm-tr" data-for="${cm.id}" hidden></div>
        <div class="pv-cm-act">
          <span class="pv-cm-time">${Supa.ago(cm.created_at)}</span>
          <button class="cm-like ${liked ? "on" : ""}" data-id="${cm.id}" aria-label="${T("讚")}">${Feed.heart(liked)}<span>${n || ""}</span></button>
          <button class="cm-tr" data-id="${cm.id}" aria-label="${T("翻譯")}">${ic("translate")}</button>
          ${!isReply ? `<button class="cm-reply" data-id="${cm.id}" data-name="${esc(name(cm))}">${T("回覆")}</button>` : ""}
          ${canDel ? `<button class="cm-del" data-id="${cm.id}" aria-label="${T("刪除")}">${ic("trash")}</button>` : ""}
        </div></div></div>`;
    };
    box.innerHTML = tops.map(cm => row(cm, false) + childrenOf(cm.id).map(r => row(r, true)).join("")).join("");

    box.querySelectorAll(".cm-del").forEach(b => b.addEventListener("click", async () => {
      // 以前按 ✕ 直接刪，沒得後悔
      if (!(await ttConfirm(T("刪掉這則留言？"), T("刪除"), T("取消")))) return;
      const { error } = await c.from("comments").delete().eq("id", b.dataset.id);
      if (error) { say(Supa.errText(error.message)); return; }
      load(wrap, postId);
    }));
    box.querySelectorAll(".cm-like").forEach(b => b.addEventListener("click", async () => {
      if (b._busy) return; b._busy = true;
      const on = !b.classList.contains("on");
      b.classList.toggle("on", on); const h = b.querySelector(".ic-heart"); if (h) h.classList.toggle("on", on);
      const span = b.querySelector("span"); span.textContent = Math.max(0, (+span.textContent || 0) + (on ? 1 : -1)) || "";
      await Posts.toggleCommentLike(b.dataset.id, on);
      b._busy = false;
    }));
    box.querySelectorAll(".pv-cm-who").forEach(b => b.addEventListener("click", () => { if (typeof Discover !== "undefined") Discover.openProfile(b.dataset.uid); }));
    box.querySelectorAll(".cm-reply").forEach(b => b.addEventListener("click", () => setReplyTarget(wrap, b.dataset.id, b.dataset.name)));
    box.querySelectorAll(".cm-tr").forEach(b => b.addEventListener("click", async () => {
      const out = box.querySelector(`.pv-cm-tr[data-for="${b.dataset.id}"]`); if (!out) return;
      if (!out.hidden) { out.hidden = true; return; }
      if (out.dataset.done) { out.hidden = false; return; }
      b.disabled = true;
      const t = await PostView.translateText(_bodies[b.dataset.id] || "", (typeof ttTrTarget === "function") ? ttTrTarget() : "zh-TW");
      b.disabled = false;
      if (!t) { say("翻譯失敗，稍後再試"); return; }
      out.textContent = t; out.dataset.done = "1"; out.hidden = false;
    }));
    box.querySelectorAll(".pv-cm .mention").forEach(b => b.addEventListener("click", () => { if (typeof Discover !== "undefined") Discover.openByHandle(b.dataset.handle); }));
    box.querySelectorAll(".pv-cm .ht").forEach(b => b.addEventListener("click", () => { if (wrap._close) wrap._close(); Feed.openTag(b.dataset.tag); }));
  }

  function setReplyTarget(wrap, parentId, name) {
    wrap.dataset.reply = parentId || "";
    const add = wrap.querySelector(".pv-add"); if (!add) return;
    let hint = wrap.querySelector("#pvReplyHint");
    if (parentId) {
      if (!hint) { hint = document.createElement("div"); hint.id = "pvReplyHint"; hint.className = "pv-reply-hint"; add.parentNode.insertBefore(hint, add); }
      hint.innerHTML = `${T("回覆")} <b>${esc(name || "")}</b> <button id="pvReplyX" aria-label="${T("取消")}">${ic("x")}</button>`;
      hint.querySelector("#pvReplyX").addEventListener("click", () => setReplyTarget(wrap, "", ""));
      const input = wrap.querySelector("#pvInput"); if (input) input.focus();
    } else if (hint) hint.remove();
  }

  let _sending = false;
  async function send(wrap, postId) {
    const input = wrap.querySelector("#pvInput"), btn = wrap.querySelector("#pvSend"); const body = input.value.trim();
    if (!body || _sending) return;   // 送出中再按不會送兩次（鎖要在第一個 await 之前上）
    _sending = true; input.disabled = true; btn.disabled = true;
    const uid = await Supa.uid(); if (!uid) { _sending = false; input.disabled = false; btn.disabled = false; say("先登入才能留言"); return; }
    const parent = wrap.dataset.reply || null;
    const rec = { post_id: postId, author_id: uid, body };
    if (parent) rec.parent_id = parent;
    const c = Supa.client();
    let { error } = await c.from("comments").insert(rec);
    if (error && parent) { delete rec.parent_id; ({ error } = await c.from("comments").insert(rec)); }   // 無 parent_id 欄位→當一般留言
    _sending = false; input.disabled = false; btn.disabled = false;
    if (error) { say(Supa.errText(error.message)); return; }
    input.value = ""; setReplyTarget(wrap, "", ""); Posts.notifyMentions(body, postId); load(wrap, postId);
  }

  return { mount, load };
})();
