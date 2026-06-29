// 社群寵物互動：看好友的夥伴、送果實、領取別人送的果實。
const Pets = (() => {
  function esc(s) { return (s || "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])); }
  async function me() { const c = Supa.client(); if (!c) return null; const { data } = await c.auth.getUser(); return data && data.user ? data.user.id : null; }

  async function friendsPets() {
    const c = Supa.client(); const uid = await me(); if (!uid) return [];
    const { data: fo } = await c.from("follows").select("following_id").eq("follower_id", uid);
    const { data: fr } = await c.from("follows").select("follower_id").eq("following_id", uid);
    const following = new Set((fo || []).map(r => r.following_id));
    const mutual = (fr || []).map(r => r.follower_id).filter(id => following.has(id));
    if (!mutual.length) return [];
    const { data } = await c.from("profiles").select("id,handle,display_name,avatar_url,pet_name,pet_level").in("id", mutual).limit(100);
    return data || [];
  }

  async function sendGift(toId, n) {
    const c = Supa.client(); const { data, error } = await c.rpc("send_pet_gift", { p_to: toId, p_n: n });
    return { ok: !error && data, error: error && error.message };
  }

  // 領取別人送來的果實 → 加進本機 berryBonus
  async function claimGifts() {
    const c = Supa.client(); const uid = await me(); if (!uid) return 0;
    const { data } = await c.from("pet_gifts").select("id,berries").eq("to_user", uid).eq("claimed", false).limit(200);
    if (!data || !data.length) return 0;
    const sum = data.reduce((s, g) => s + (g.berries || 0), 0);
    await c.from("pet_gifts").update({ claimed: true }).eq("to_user", uid).eq("claimed", false);
    if (sum > 0 && typeof addBerryBonus === "function") addBerryBonus(sum);
    return sum;
  }

  async function renderFriends() {
    const box = document.getElementById("petFriends"); if (!box) return;
    if (typeof Supa === "undefined" || !Supa.ready()) { box.innerHTML = ""; return; }
    const sess = typeof Auth !== "undefined" ? await Auth.session().catch(() => null) : null;
    if (!sess) { box.innerHTML = `<div class="section-title">👯 好友的夥伴</div><div class="social-empty" style="padding:14px">到「社群」分頁登入後，這裡會出現好友的夥伴。</div>`; return; }
    const list = await friendsPets();
    if (!list.length) { box.innerHTML = `<div class="section-title">👯 好友的夥伴</div><div class="social-empty" style="padding:14px">在社群互相追蹤山友後，這裡會出現他們的夥伴，可以送果實打氣。</div>`; return; }
    box.innerHTML = `<div class="section-title">👯 好友的夥伴</div><div class="friend-pets">${list.map(p => {
      const lvl = p.pet_level || 1, emoji = (typeof PET_STAGES !== "undefined" && PET_STAGES[lvl - 1]) ? PET_STAGES[lvl - 1].e : "🥚";
      return `<div class="fp"><span class="fp-pet">${emoji}</span><div class="fp-info"><b>${esc(p.pet_name || p.display_name || p.handle)}</b> <span class="lv-chip lvt-${Math.min(lvl, 7)}">Lv.${lvl}</span><div class="fp-by">@${esc(p.handle)}</div></div><button class="btn ghost fp-gift" data-id="${p.id}" data-name="${esc(p.display_name || p.handle)}">送 3🍓</button></div>`;
    }).join("")}</div>`;
    box.querySelectorAll(".fp-gift").forEach(b => b.addEventListener("click", async () => {
      if (typeof berriesBalance === "function" && berriesBalance() < 3) { if (typeof toast === "function") toast("果實不足，多走幾步 🍓"); return; }
      b.disabled = true; b.textContent = "送出中…";
      const r = await sendGift(b.dataset.id, 3);
      if (!r.ok) { b.disabled = false; b.textContent = "送 3🍓"; if (typeof toast === "function") toast("送出失敗：" + (r.error || "")); return; }
      if (typeof addBerryBonus === "function") addBerryBonus(-3);   // 扣自己 3 顆
      b.textContent = "已送出 ✓";
      if (typeof toast === "function") toast("已送 3🍓 給 " + b.dataset.name + " 的夥伴");
      if (typeof renderPet === "function") renderPet();
    }));
  }

  return { friendsPets, sendGift, claimGifts, renderFriends };
})();
