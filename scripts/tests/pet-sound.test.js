// 夥伴音效 精緻版（2026-10-10 第二版，docs/sound-plan-v2.md）＋觸覺回饋
//   素材：manifest 的每一段都有檔案、都在 CREDITS、都是 44.1 kHz；每一類至少 3 段候選
//   細分：每個事件 × 7 階 × 4 種近親 × 5 種地面 × 4 季果實，用到的每一類都在 manifest 裡；吃依季節果實、落地依地面、走路依物種
//   接點：餵食一輪會響「果籃、劃過、落地、腳步、趴下、碰果實、咬、嚼、吞、舔嘴、吃完滿足」；孵化、進化、親密加心
//   環境：時段／季節／天氣／近親物種的組合（蟬、青蛙、雷雨、雪、海鷗、高山、雲上）；睡覺呼吸；天氣點綴
//   試聽板：30 串以上、全部連播、逐步字幕
//   預設：音效整個關掉（PET_SOUND_READY=false）
const __TTP = +process.env.TT_PORT || 8943;
const __path = require("path"), __fs = require("fs"), vm = require("vm");
const ROOT = __path.resolve(__dirname, "../.."); const { chromium } = require(ROOT + "/node_modules/playwright"); const { spawn } = require("child_process");
const MOCK = __fs.readFileSync(__dirname + "/soc-mock.js", "utf8"); const errs = []; let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const KM = [0, 5, 20, 40, 90, 150, 260];
const mp3Rate = f => { const b = __fs.readFileSync(f); let i = 0; if (b.slice(0, 3).toString() === "ID3") i = 10 + ((b[6] & 127) << 21 | (b[7] & 127) << 14 | (b[8] & 127) << 7 | (b[9] & 127)); for (; i < b.length - 4; i++) if (b[i] === 0xff && (b[i + 1] & 0xe0) === 0xe0) { const ver = (b[i + 1] >> 3) & 3, sr = (b[i + 2] >> 2) & 3; const T = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] }; return (T[ver] || [])[sr]; } return 0; };
const MAN = JSON.parse(__fs.readFileSync(ROOT + "/web/sounds/manifest.json", "utf8"));
const NOISE = /^amb:|^music|^sleep/;
{
  const ctx = { console }; ctx.window = ctx; vm.createContext(ctx); vm.runInContext(__fs.readFileSync(ROOT + "/web/js/pet-sound.js", "utf8") + ";window.PetAudio=PetAudio;", ctx); const PA = ctx.PetAudio;
  const DIRS = { sfx: "pet", amb: "amb", music: "music", sting: "sting" };
  const files = [...new Set(Object.entries(MAN).flatMap(([g, o]) => Object.values(o).flat().map(n => `${DIRS[g]}/${n}.mp3`)))];
  const missing = files.filter(f => !__fs.existsSync(ROOT + "/web/sounds/" + f)); ok(missing.length === 0, `every file in the manifest exists (${files.length}) ${JSON.stringify(missing.slice(0, 4))}`);
  const credits = __fs.readFileSync(ROOT + "/web/sounds/CREDITS.md", "utf8"); const nc = files.filter(f => !credits.includes(f)); ok(nc.length === 0, "every file is credited in sounds/CREDITS.md " + JSON.stringify(nc.slice(0, 4)));
  const low = files.filter(f => __fs.existsSync(ROOT + "/web/sounds/" + f) && mp3Rate(ROOT + "/web/sounds/" + f) !== 44100); ok(low.length === 0, "all sounds are 44.1 kHz " + JSON.stringify(low.slice(0, 4)));
  const thin = Object.entries(MAN.sfx).filter(([, v]) => v.length < 3).map(([k, v]) => k + ":" + v.length); ok(thin.length === 0, `every effect has at least 3 candidates (${Object.keys(MAN.sfx).length} kinds) ${JSON.stringify(thin)}`);
  const bad = new Set();
  for (const ev of PA.EVENTS) for (let i = 0; i < 7; i++) for (const v of ["", "deep", "sea", "alpine"]) for (const surface of ["grass", "leaf", "sand", "snow", "cloud"]) for (const fruit of ["spring", "summer", "autumn", "winter"])
    for (const [k] of PA._recipe(ev, i, v, { surface, fruit, lv: i + 1 })) { if (k[0] === "@") { if (!MAN.sting[k.slice(7)]) bad.add(k); } else if (!MAN.sfx[k]) bad.add(k); }
  ok(bad.size === 0, `every sound the ${PA.EVENTS.length} events can ask for exists in the manifest ` + JSON.stringify([...bad].slice(0, 8)));
  const r = (ev, i, o, v) => PA._recipe(ev, i, v || "", o || {}).map(x => x[0]).join("+");
  ok(r("bite", 4, { fruit: "spring" }) !== r("bite", 4, { fruit: "summer" }) && /^peel\+bite_orange/.test(r("bite", 4, { fruit: "winter" })), "eating changes with the season's fruit; winter oranges get peeled first " + r("bite", 4, { fruit: "winter" }));
  ok(["grass", "leaf", "sand", "snow", "cloud"].map(s => r("land", 4, { surface: s }).split("+")[0]).join() === "land_grass,land_leaf,land_sand,land_snow,land_cloud", "berries land differently on grass / leaves / sand / snow / cloud");
  ok([1, 3, 4, 5, 6].map(i => r("step", i)).join() === "crawl,paw_light,paw_heavy,claw,float", "each creature has its own footsteps");
  ok(/fox_call/.test(r("tickle", 3)) && /otter_squeak/.test(r("tickle", 3, {}, "sea")) && /tiger_chuff/.test(r("tickle", 4)), "tickling: fox call, otter squeak, tiger chuff");
  const bd = s => PA._bedsFor(s).join(",");
  ok(bd({ tod: "dawn" }) === "dawn" && bd({ tod: "day", season: "summer" }) === "day,cicada" && bd({ tod: "night", season: "spring" }) === "night,frogs" && bd({ tod: "day", wx: "rain", code: 95 }) === "storm" && bd({ tod: "day", wx: "snow" }) === "snow" && bd({ tod: "day", v: "sea" }) === "gulls,day" && bd({ tod: "day", v: "alpine" }) === "alpine" && bd({ tod: "day", i: 6 }) === "day,sky",
    "ambience: dawn chorus, summer cicadas, spring frogs, thunderstorm, snow, gulls, alpine wind, sky above the clouds");
  ok(Object.keys(MAN.amb).length >= 15 && Object.keys(MAN.music).length === 4 && Object.keys(MAN.sting).length >= 7, `15+ ambience kinds, 4 music groups, 7 short tunes (${Object.keys(MAN.amb).length}/${Object.keys(MAN.music).length}/${Object.keys(MAN.sting).length})`);
  const src = __fs.readFileSync(ROOT + "/web/js/pet-stage.js", "utf8"), walk = __fs.readFileSync(ROOT + "/web/js/pet-walk.js", "utf8");
  ok(["pb-lick", "pb-sigh", "pb-shiver", "pb-bask", "pb-belly"].every(c => src.includes(`"${c}": "`)) && /fx\("special"\)/.test(src) && /fx\("guest_in"\)/.test(src) && /fx\("touch"\)/.test(src) && /fx\("content"\)/.test(src), "idle, guest, touch and after-meal moments send sound events");
  ok(/sndFx\(box, "step"\)/.test(walk) && /sndFx\(box, "flap"\)/.test(walk) && /sndFx\(box, "lie"\)/.test(walk), "walking steps, wing beats and lying down send sound events");
  ok(!/createOscillator/.test(__fs.readFileSync(ROOT + "/web/js/pet.js", "utf8")), "no synthesized beeps in pet.js");
}
(async () => {
  const srv = spawn("python3", ["-m", "http.server", String(__TTP)], { cwd: ROOT + "/web", stdio: "ignore" }); await new Promise(r => setTimeout(r, 1200)); const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const mk = async (km, o = {}) => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Asia/Taipei" }); const p = await ctx.newPage(); await require(__dirname + "/fake-weather")(p); p.on("pageerror", e => errs.push(e.message));
    await p.addInitScript(o => { if (sessionStorage.getItem("seed")) return; sessionStorage.setItem("seed", "1"); localStorage.setItem("tt_lang", "zh"); ["tt_onboarded_v2", "tt_coach_trail", "tt_locperm_prompted", "tt_coach_record", "tt_coach_record_tools", "tt_coach_peaks", "tt_coach_team", "tt_coach_pet"].forEach(k => localStorage.setItem(k, "1")); localStorage.setItem("tt_pet_woke", String(Date.now())); localStorage.setItem("tt_debug_km", String(o.km)); if (!o.nodev) localStorage.setItem("tt_pet_sound_dev", "1"); if (o.tone) localStorage.setItem("tt_pet_tone", o.tone); if (o.music) localStorage.setItem("tt_pet_music", "1"); }, { km, tone: o.tone, nodev: o.nodev, music: o.music });
    await p.addInitScript(MOCK); await p.goto(`http://localhost:${__TTP}/`); await require(__dirname + "/ready")(p);
    await p.evaluate(o => { window.__toneAll = true; petApplyTone(); window.__ps = Object.assign(window.__ps || {}, o.season ? { season: o.season } : {}); document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e => e.remove()); }, o); await p.click('.tab[data-view="pet"]'); await p.waitForTimeout(1000);
    await p.evaluate(() => { window.__psNoIdle = true; document.querySelector(".ps-box").scrollIntoView({ block: "center" }); window.__snd = window.__petSndLog = []; window.__petSndNames = [];
      window.__hap = []; window.Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios", Plugins: { Haptics: { impact: a => window.__hap.push("impact:" + a.style), notification: a => window.__hap.push("notify:" + a.type), vibrate: a => window.__hap.push("vibrate:" + a.duration) } } }; });
    return p;
  };
  const loadAll = p => p.evaluate(async () => { await PetAudio.preload(true); const all = Object.values(PetAudio.M.sfx).flat(), n = all.length, c = () => all.filter(x => PetAudio._loaded().includes(x)).length; for (let k = 0; k < 240 && c() < n; k++) await new Promise(r => setTimeout(r, 250)); return [c(), n]; });
  {
    const p = await mk(KM[4]);
    const first = await p.evaluate(async () => { await PetAudio.manifest(); window.__snd.length = 0; petSound("gift"); return window.__snd.filter(x => !/^amb:|^music|^sleep/.test(x)); });
    ok(first.length === 0, "first time, before files load: silent (no synthesized beep)");
    const [n, tot] = await loadAll(p); ok(n === tot, `all ${tot} effect recordings load and decode (${n})`);
    const r = await p.evaluate(async () => { const w = ms => new Promise(r => setTimeout(r, ms)); const take = () => { const a = window.__snd.filter(x => !/^amb:|^music|^sleep/.test(x)); window.__snd.length = 0; return a; };
      await w(300); take(); await PetStage.react("pat"); const pat = take(); await w(300); petSound("gift"); const gift = take();
      window.__petSndNames.length = 0; for (let k = 0; k < 10; k++) { petSound("land"); await w(70); } const lands = window.__petSndNames.filter(x => /^land_/.test(x)); take();
      localStorage.setItem("tt_pet_sound", "0"); await w(300); await PetStage.react("pat"); const off = take(); localStorage.removeItem("tt_pet_sound");
      bumpAffinity(-100); bumpAffinity(12); await w(700); const heart = take();
      return { pat, gift, lands, off, heart }; });
    ok(r.pat.includes("purr") && r.pat.includes("fur_thick"), "tiger pat: thick fur stroke + purr " + JSON.stringify(r.pat));
    ok(r.gift.includes("bell") && r.gift.includes("unwrap"), "gift: bell and unwrapping " + JSON.stringify(r.gift));
    ok(r.lands.length >= 8 && r.lands.every((x, i) => i === 0 || x !== r.lands[i - 1]), "the same recording never plays twice in a row " + JSON.stringify(r.lands.slice(0, 6)));
    ok(r.off.length === 0, "sound switched off: silent " + JSON.stringify(r.off));
    ok(r.heart.includes("heart"), "a new heart of friendship rings softly " + JSON.stringify(r.heart));
    const h = await p.evaluate(async () => { window.__hap.length = 0; for (let k = 0; k < 6; k++) { document.querySelector("#petEmoji").click(); await new Promise(r => setTimeout(r, 120)); } const taps = window.__hap.slice(); window.__hap.length = 0; petBuzz([60, 40, 140]); const big = window.__hap.slice(); return { taps, big }; });
    ok(h.taps.length >= 1 && h.taps.length <= 2 && h.taps.every(x => x === "impact:LIGHT"), "six quick pats: one or two light taps " + JSON.stringify(h.taps));
    ok(h.big.join() === "notify:SUCCESS", "big moments use the success pattern");
    const a = await p.evaluate(async () => { const w = ms => new Promise(r => setTimeout(r, ms)); window.__ps = Object.assign(window.__ps || {}, { tod: "night", season: "summer" }); petSoundScene(); await w(2500); const night = PetAudio._beds().slice();
      window.__ps.wx = "rain"; window.__ps.code = 95; petSoundScene(); await w(2500); const storm = PetAudio._beds().slice(), spr = PetAudio._sprinkles().slice();
      const _as = PetStage.isAsleep; PetStage.isAsleep = () => true; delete window.__ps.wx; petSoundScene(); await w(2500); const sleep = PetAudio._sleeping(); PetStage.isAsleep = _as;
      document.querySelector('.tab[data-view="explore"]').click(); await w(200); petSoundScene(); await w(300); const away = PetAudio._beds().slice(), sleepAway = PetAudio._sleeping(); delete window.__ps.wx; delete window.__ps.code; return { night, storm, spr, sleep, away, sleepAway }; });
    ok(a.night.join() === "night,frogs", "summer night: crickets and frogs " + JSON.stringify(a.night));
    ok(a.storm.includes("storm") && a.spr.includes("thunder") && a.spr.includes("drip"), "thunderstorm: storm bed, distant thunder and drips " + JSON.stringify([a.storm, a.spr]));
    ok(a.sleep, "asleep: breathing loop plays");
    ok(a.away.length === 0 && !a.sleepAway, "leaving the pet page stops ambience and breathing");
    const s = await p.evaluate(async () => { document.querySelector('.tab[data-view="pet"]').click(); await new Promise(r => setTimeout(r, 600)); document.querySelector("#petHelp").click(); await new Promise(r => setTimeout(r, 600)); return { sw: ["petSoundSw", "petAmbSw", "petMusicSw", "petUiSw"].map(id => !!document.getElementById(id)), vol: document.querySelectorAll(".ah-vol").length }; });
    ok(s.sw.every(Boolean) && s.vol === 3, "settings: sound / ambience / music / button-tap switches, three volume sliders " + JSON.stringify(s));
    const g = await p.evaluate(async () => { document.querySelectorAll(".ttdlg-ov").forEach(e => e.remove()); const w = ms => new Promise(r => setTimeout(r, ms)); window.__snd.length = 0; petSound("hatch", { lv: 2 }); await w(4300); const hatch = window.__snd.filter(x => !/^amb:|^music|^sleep/.test(x)); window.__snd.length = 0; petSound("evolve", { lv: 5 }); await w(3200); const evo = window.__snd.filter(x => !/^amb:|^music|^sleep/.test(x)); return { hatch, evo }; });
    ok(["hatch_tap", "crack_small", "crack_big", "hatch_first", "sting"].every(k => g.hatch.includes(k)), "hatching: taps, cracks, first sound, then a short tune " + JSON.stringify(g.hatch));
    ok(["evo_rise", "evo_swell", "evo_burst", "sting"].every(k => g.evo.includes(k)), "evolving: rise, swell, burst at the white flash, then a short tune " + JSON.stringify(g.evo));
    const bd = await p.evaluate(async () => { await ensureScript("js/sound-board.js"); await SoundBoard.open(); await new Promise(r => setTimeout(r, 400)); const n = SoundBoard.seqs.length;
      document.querySelector('.sb-seq[data-i="4"]').click(); await new Promise(r => setTimeout(r, 15000)); const lines = [...document.querySelectorAll("#sbLog div")].map(d => d.textContent); SoundBoard._stop(); return { n, all: !!document.querySelector("#sbAll"), lines }; });
    ok(bd.n >= 30 && bd.all, `audition board: ${bd.n} sequences and a play-all button`);
    ok(bd.lines.length >= 16 && bd.lines.filter(l => /第 \d+ 步/.test(l) && /[a-z]-\d/.test(l)).length >= 12, `a sequence shows each step and which recording played (${bd.lines.length} lines) ` + JSON.stringify(bd.lines.slice(1, 4)));
    await p.context().close();
  }
  for (const [st, tone, season, want] of [[4, "", "autumn", ["bag", "fall_light", "land_leaf", "paw_heavy", "lie_down", "touch", "bite_persim", "chew_big", "gulp_big", "lick", "purr"]], [1, "", "spring", ["bag", "land_grass", "crawl", "nibble"]], [2, "", "summer", ["wing_flap", "wing_fold", "sip"]], [6, "", "winter", ["land_cloud", "peel", "bite_orange", "gulp_big"]], [3, "sea", "summer", ["land_sand", "paw_light", "bite_mango", "gulp_small", "content"]]]) {
    const p = await mk(KM[st], { tone, season }); await loadAll(p);
    const r = await p.evaluate(async () => { window.__hap.length = 0; window.__snd.length = 0; localStorage.removeItem("tt_pet_fed_t"); localStorage.setItem("tt_pet_berry_bonus", "30"); renderPet(); await new Promise(r => setTimeout(r, 300)); feedPet(); const t0 = Date.now(); await new Promise(r => setTimeout(r, 500));
      while (document.querySelector(".ps-box").classList.contains("feeding") && Date.now() - t0 < 40000) await new Promise(r => setTimeout(r, 250)); await new Promise(r => setTimeout(r, 900)); return { hap: window.__hap.slice(), snd: window.__snd.filter(x => !/^amb:|^music|^sleep/.test(x)) }; });
    const miss = want.filter(k => !r.snd.includes(k));
    ok(miss.length === 0, `stage ${st}${tone ? " " + tone : ""} (${season}): feeding makes every sound ${miss.length ? "— missing " + JSON.stringify(miss) : ""} ${JSON.stringify([...new Set(r.snd)])}`);
    ok(r.snd.filter(x => x === "fall_light").length === 3, `stage ${st}: three berries, three whooshes`);
    ok(r.hap.length <= 3 && !r.hap.some(x => x.startsWith("vibrate")), `stage ${st}: feeding vibrates at most a few light times`);
    await p.context().close();
  }
  {
    const p = await mk(KM[4], { music: 1 });
    const m = await p.evaluate(async () => { const w = ms => new Promise(r => setTimeout(r, ms)); petSoundScene(); await w(800); const on = PetAudio._musicOn(); document.body.classList.add("rec-running"); petSoundScene(); await w(300); const rec = PetAudio._musicOn(); document.body.classList.remove("rec-running"); return { on, rec }; });
    ok(m.on && !m.rec, "music plays on the pet page when switched on, stops while recording " + JSON.stringify(m));
    await p.context().close();
  }
  {
    const p = await mk(KM[4], { nodev: 1 });
    const r = await p.evaluate(async () => { window.__snd.length = 0; petSound("gift"); await PetStage.react("pat"); petSoundScene(); await new Promise(r => setTimeout(r, 400)); document.querySelector("#petHelp") && document.querySelector("#petHelp").click(); await new Promise(r => setTimeout(r, 500)); return { snd: window.__snd.slice(), sw: !!document.getElementById("petSoundSw"), loaded: PetAudio._loaded().length, beds: PetAudio._beds().length }; });
    ok(r.snd.length === 0 && r.loaded === 0 && r.beds === 0, "sound is switched off for everyone until it's ready " + JSON.stringify(r));
    ok(!r.sw, "the sound switches are hidden while sound is off");
    await p.context().close();
  }
  console.log("ERRS", JSON.stringify(errs)); console.log("FAILS", fails + (errs.length ? 1 : 0)); await b.close(); srv.kill(); process.exit(0);
})();
