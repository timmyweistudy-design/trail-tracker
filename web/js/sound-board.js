// 🎧 音效試聽板（2026-10-10 音效優化輪；只在測試面板開）：我聽不到聲音，所以每個時機的候選都列在這裡，
// 使用者在手機上一段一段聽，勾掉不要的（勾著的會一起放進聲音池輪流用），最後「複製結果」貼回來定稿。
// 勾選存在 tt_snd_pick，PetAudio 立刻照勾選的用（開「🔊試聽音效（開發中）」就能在夥伴頁實際聽到）。
const SoundBoard = (() => {
  const SFX_L = { fall: "果實劃過空氣", land: "果實落地", leaf: "落葉沙沙（落地的尾巴）", crunch: "咬一口（狐、虎、龍）", chew: "咀嚼", nibble: "啃葉（毛毛蟲）", sip: "吸花蜜（蝶）", gulp: "吞下去", purr: "呼嚕（虎、石虎、龍）", fur: "摸毛的沙沙聲", step: "腳步（跳）", flap: "翅膀（蝶、小龍）", bell: "鈴鐺（收禮物）", chime: "風鈴（進化、蛋吃果實）", cone: "松果（玩）", gust: "陣風（起風時）", yawn: "打哈欠（狐、虎、龍）", splash: "甩水（海風近親）", knock: "敲蛋殼（蛋）" };
  const AMB_L = { day: "白天森林（清晨、白天）", dusk: "黃昏", night: "夜晚蟲鳴", rain: "下雨", wind: "風（起風、高山近親）", waves: "海浪（海風近親）", brook: "溪流" };
  const pick = () => { try { return JSON.parse(localStorage.getItem("tt_snd_pick") || "{}") || {}; } catch (e) { return {}; } };
  const save = p => { try { localStorage.setItem("tt_snd_pick", JSON.stringify(p)); } catch (e) { /* */ } };
  let ov = null, mus = null;
  function stopPreview() { if (mus) { mus.pause(); mus = null; } document.querySelectorAll(".sb-play.on").forEach(b => b.classList.remove("on")); }
  async function playOne(name, kind, btn) {
    stopPreview();
    if (kind === "music") { mus = new Audio(PetAudio.DIR(name) + name + ".mp3"); mus.play().catch(() => { }); btn.classList.add("on"); mus.onended = () => btn.classList.remove("on"); return; }
    await PetAudio.load(name);
    if (kind === "amb") { PetAudio.play(name, { vol: .9, len: 12 }); btn.classList.add("on"); setTimeout(() => btn.classList.remove("on"), 12000); return; }
    PetAudio.play(name, { vol: .9 });
  }
  // 整串試聽：照真的動作順序把幾層疊起來（不用開夥伴頁）
  const DEMO = [
    ["三顆果實掉下來", () => [0, 1, 2].forEach(k => { setTimeout(() => PetAudio.cue("fall", 4, ""), k * 170 + 60); setTimeout(() => PetAudio.cue("land", 4, ""), k * 170 + 507); })],
    ["虎吃一顆", () => { PetAudio.cue("bite", 4, ""); setTimeout(() => PetAudio.cue("gulp", 4, ""), 1400); }],
    ["毛毛蟲吃", () => PetAudio.cue("bite", 1, "")],
    ["蝶吃", () => PetAudio.cue("bite", 2, "")],
    ["神龍吃", () => { PetAudio.cue("bite", 6, ""); setTimeout(() => PetAudio.cue("gulp", 6, ""), 1500); }],
    ["摸虎的頭", () => PetAudio.cue("pat", 4, "")],
    ["收禮物", () => PetAudio.cue("gift", 4, "")],
    ["進化", () => PetAudio.cue("evolve", 4, "")],
  ];
  function row(key, label, names, kind) {
    const p = pick(), on = Array.isArray(p[key]) && p[key].length ? new Set(p[key]) : new Set(names);
    return `<div class="sb-row" data-key="${key}"><div class="sb-l">${label}</div><div class="sb-c">${names.map((n, i) => `<span class="sb-it"><button class="sb-play" data-n="${n}" data-kind="${kind}">▶ ${i + 1}</button><input type="checkbox" class="sb-ck" data-n="${n}" aria-label="${label} ${i + 1}"${on.has(n) ? " checked" : ""}></span>`).join("")}</div></div>`;
  }
  function open() {
    if (ov) return; PetAudio.preload(true);
    ov = document.createElement("div"); ov.className = "pet-modal sb-modal"; ov.dataset.ov = "soundboard";
    ov.innerHTML = `<div class="pet-modal-card sb-card"><button class="sheet-close" id="sbX" aria-label="關閉">✕</button><h2>音效試聽板</h2>
      <p class="sb-hint">按 ▶ 聽，勾著的會放進聲音池輪流用（同一個時機可以勾好幾個，聽起來比較不重複）。選完按最下面「複製結果」貼給 Claude。<br>要在夥伴頁實際聽：測試面板開「試聽音效（開發中）」。</p>
      <h3>整串試聽</h3><div class="sb-demo">${DEMO.map(([t], i) => `<button class="btn ghost sb-d" data-i="${i}">${t}</button>`).join("")}</div>
      <h3>音效</h3>${Object.keys(PetAudio.SFX).map(k => row(k, SFX_L[k] || k, PetAudio.SFX[k], "sfx")).join("")}
      <h3>環境音（每段聽 12 秒）</h3>${Object.keys(PetAudio.AMB).map(k => row(k, AMB_L[k] || k, PetAudio.AMB[k], "amb")).join("")}
      <h3>背景音樂</h3>${row("m", "背景音樂（勾著的會輪播）", PetAudio.MUSIC, "music")}
      <div class="sb-foot"><button class="btn ghost" id="sbStop">停止播放</button><button class="btn ghost" id="sbReset">全部重設</button><button class="btn primary" id="sbCopy">複製結果</button></div><pre class="sb-out" id="sbOut" hidden></pre></div>`;
    document.body.appendChild(ov);
    const close = () => { stopPreview(); ov.remove(); ov = null; };
    ov.querySelector("#sbX").onclick = close; ov.addEventListener("click", e => { if (e.target === ov) close(); });
    ov.querySelectorAll(".sb-play").forEach(b => b.addEventListener("click", () => playOne(b.dataset.n, b.dataset.kind, b)));
    ov.querySelectorAll(".sb-d").forEach(b => b.addEventListener("click", () => { PetAudio.preload(true); DEMO[+b.dataset.i][1](); }));
    ov.querySelectorAll(".sb-ck").forEach(c => c.addEventListener("change", () => {
      const r = c.closest(".sb-row"), k = r.dataset.key, chosen = [...r.querySelectorAll(".sb-ck")].filter(x => x.checked).map(x => x.dataset.n), p = pick();
      if (!chosen.length) { c.checked = true; toast("每個時機至少留一個"); return; }
      p[k] = chosen; save(p);
    }));
    ov.querySelector("#sbStop").onclick = stopPreview;
    ov.querySelector("#sbReset").onclick = () => { localStorage.removeItem("tt_snd_pick"); ov.querySelectorAll(".sb-ck").forEach(c => { c.checked = true; }); toast("已重設成全部都用"); };
    ov.querySelector("#sbCopy").onclick = () => {
      const p = {}; ov.querySelectorAll(".sb-row").forEach(r => { const all = r.querySelectorAll(".sb-ck"), ch = [...all].filter(x => x.checked); if (ch.length < all.length) p[r.dataset.key] = ch.map(x => x.dataset.n); });
      const txt = "音效試聽結果（沒列出的時機＝全部都要）：" + JSON.stringify(p);
      const out = ov.querySelector("#sbOut"); out.hidden = false; out.textContent = txt;
      (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast("已複製，貼給 Claude 就好")).catch(() => toast("請長按下面的文字複製"));
    };
  }
  return { open };
})();
