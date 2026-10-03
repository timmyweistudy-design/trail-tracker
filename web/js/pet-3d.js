// 山林夥伴 3D 展示：只在「手冊 → 轉一圈看看」和進化儀式按了才下載 Three.js（vendor，gzip 約 167 KB）。
// 角色用基本幾何體拼出 chibi 外型（不靠模型檔），卡通著色（三階 toon）＋外描邊（反面放大殼），配色跟 SVG 版一致。
// 不支援 WebGL、或系統設定「減少動態效果」時：不自動旋轉；沒有 WebGL 就退回 SVG 圖。日常畫面（夥伴卡、記錄地圖）完全不用這支。
window.Pet3D = (function () {
  let THREE = null, loading = null;
  function hasGL() {
    try { const c = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl"))); } catch (e) { return false; }
  }
  function load() {
    if (THREE) return Promise.resolve(THREE);
    if (!loading) loading = import(new URL("vendor/three/three.module.min.js", document.baseURI).href).then(m => (THREE = m));
    return loading;
  }
  const reduce = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };

  // ── 角色工廠 ──
  function kit(T) {
    const grad = (() => { const d = new Uint8Array([90, 170, 255]); const t = new T.DataTexture(d, 3, 1, T.RedFormat); t.minFilter = t.magFilter = T.NearestFilter; t.needsUpdate = true; return t; })();
    const mats = new Map();
    const toon = c => { if (!mats.has(c)) mats.set(c, new T.MeshToonMaterial({ color: c, gradientMap: grad })); return mats.get(c); };
    const lineMat = new T.MeshBasicMaterial({ color: 0x2a2416, side: T.BackSide });
    const glow = c => new T.MeshBasicMaterial({ color: c });
    function mesh(geo, color, o) {
      o = o || {};
      const g = new T.Group();
      const m = new T.Mesh(geo, o.flat ? glow(color) : toon(color)); g.add(m);
      if (!o.noLine) { const l = new T.Mesh(geo, lineMat); l.scale.setScalar(1 + (o.line || .06)); g.add(l); }
      if (o.p) g.position.set(...o.p);
      if (o.s) Array.isArray(o.s) ? g.scale.set(...o.s) : g.scale.setScalar(o.s);
      if (o.r) g.rotation.set(...o.r);
      return g;
    }
    const sph = (r, c, o) => mesh(new T.SphereGeometry(r, 28, 20), c, o);
    const cone = (r, h, c, o) => mesh(new T.ConeGeometry(r, h, 20), c, o);
    const cap = (r, l, c, o) => mesh(new T.CapsuleGeometry(r, l, 8, 16), c, o);
    function eyes(parent, x, y, z, r) {
      for (const sx of [-1, 1]) {
        const e = new T.Group(); e.position.set(sx * x, y, z);
        e.add(mesh(new T.SphereGeometry(r, 18, 14), 0x2a1608, { s: [1, 1.25, .6], noLine: true }));
        e.add(mesh(new T.SphereGeometry(r * .32, 10, 8), 0xffffff, { p: [r * .3, r * .45, r * .45], flat: true, noLine: true }));
        e.userData.eye = true; parent.add(e);
      }
    }
    function blush(parent, x, y, z, r) { for (const sx of [-1, 1]) parent.add(sph(r, 0xf0a0a0, { p: [sx * x, y, z], s: [1, .62, .35], noLine: true })); }
    function chain(parent, pts, r0, r1, c) {   // 一串球＝尾巴、身體
      pts.forEach((p, k) => parent.add(sph(r0 + (r1 - r0) * k / Math.max(1, pts.length - 1), c, { p })));
    }
    const B = {
      0: () => { // 神秘之卵
        const g = new T.Group();
        g.add(sph(1, 0xf0e2bd, { s: [1, 1.28, 1] }));
        [[.5, -.5, .72], [-.45, .25, .82], [.15, .75, .7], [-.2, -.95, .55]].forEach(p => g.add(sph(.1, 0xd8c393, { p, s: [1, 1, .4], noLine: true })));
        [[-.25, .2], [.0, .02], [-.2, -.16], [.1, -.32]].reduce((a, b) => { const len = Math.hypot(b[0] - a[0], b[1] - a[1]); const m = mesh(new T.BoxGeometry(.05, len, .05), 0xb89f68, { noLine: true }); m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, .97); m.rotation.z = Math.atan2(b[0] - a[0], b[1] - a[1]) * -1; g.add(m); return b; });
        return g;
      },
      1: () => { // 草叢幼蟲
        const g = new T.Group();
        chain(g, [[-1.05, -.55, 0], [-.6, -.48, 0], [-.12, -.4, 0]], .34, .42, 0x97c85a);
        const h = new T.Group(); h.position.set(.5, -.1, 0); g.add(h);
        h.add(sph(.58, 0xb0da78));
        for (const sx of [-1, 1]) { const a = mesh(new T.CylinderGeometry(.035, .035, .5, 8), 0x7ca23e, { p: [sx * .18, .68, 0], r: [0, 0, sx * -.3], noLine: true }); h.add(a); h.add(sph(.09, 0xe58a8a, { p: [sx * .26, .92, 0] })); }
        eyes(h, .18, .05, .5, .1); blush(h, .34, -.12, .45, .09);
        return g;
      },
      2: () => { // 翩翩彩蝶
        const g = new T.Group();
        g.add(cap(.16, .7, 0x7a5540, { p: [0, -.15, 0] }));
        const h = sph(.3, 0x8a6349, { p: [0, .48, 0] }); g.add(h);
        eyes(h, .11, .02, .25, .07); blush(h, .18, -.08, .22, .05);
        for (const sx of [-1, 1]) {
          const w = new T.Group(); w.position.set(sx * .12, .05, -.05); w.userData.wing = sx;
          w.add(sph(.62, 0xef9a6a, { p: [sx * .55, .25, 0], s: [1, .9, .12] }));
          w.add(sph(.42, 0xf4b98f, { p: [sx * .45, -.42, 0], s: [1, .9, .12] }));
          w.add(sph(.14, 0xfff3e2, { p: [sx * .66, .3, .09], s: [1, 1, .3], noLine: true }));
          g.add(w);
          g.add(mesh(new T.CylinderGeometry(.02, .02, .45, 6), 0x7a5540, { p: [sx * .12, .85, 0], r: [0, 0, sx * -.5], noLine: true }));
          g.add(sph(.07, 0xe07a34, { p: [sx * .24, 1.05, 0] }));
        }
        return g;
      },
      3: () => fourLeg(0xe88a44, 0xfaf4e6, 0x7a3d15, "fox"),
      4: () => fourLeg(0xee9448, 0xfaf1e0, 0x7a3d15, "tiger"),
      5: () => { // 初醒幼龍
        const g = new T.Group();
        g.add(sph(.72, 0x49aa78, { p: [0, -.55, 0], s: [1, .92, .9] }));
        g.add(sph(.5, 0xcdeede, { p: [0, -.5, .48], s: [1, 1, .5], noLine: true }));
        const h = sph(.7, 0x52b482, { p: [0, .38, .05] }); g.add(h);
        h.add(sph(.42, 0xcdeede, { p: [0, -.22, .56], s: [1, .7, .5], noLine: true }));
        eyes(h, .24, .05, .58, .13);
        for (const sx of [-1, 1]) {
          h.add(cone(.09, .32, 0xe8dcb0, { p: [sx * .28, .66, 0], r: [0, 0, sx * -.25] }));
          const w = new T.Group(); w.position.set(sx * .62, -.35, -.25); w.userData.wing = sx;
          w.add(sph(.36, 0x7ed6a6, { s: [1, .7, .1], p: [sx * .22, .1, 0] })); g.add(w);
          g.add(sph(.2, 0x2f7c56, { p: [sx * .32, -1.18, .12], s: [1, .6, 1] }));
        }
        chain(g, [[-.55, -.95, -.35], [-.9, -.85, -.5], [-1.15, -.6, -.55]], .2, .1, 0x3f9e6e);
        return g;
      },
      6: () => { // 騰雲神龍：蛇身用管子沿曲線、雲、龍珠
        const g = new T.Group();
        const curve = new T.CatmullRomCurve3([[.2, -.55, -.2], [.9, -.75, .1], [1.3, -.2, -.3], [.95, .25, -.6], [.6, -.05, -.4], [.85, -.35, .05]].map(p => new T.Vector3(...p)));
        g.add(mesh(new T.TubeGeometry(curve, 60, .2, 14, false), 0x3f9e6e, { line: .03 }));
        const h = sph(.78, 0x4fae7e, { p: [-.2, .3, .15] }); g.add(h);
        h.add(sph(.5, 0xcdeede, { p: [0, -.28, .62], s: [1, .66, .48], noLine: true }));
        eyes(h, .26, .06, .66, .14);
        for (const sx of [-1, 1]) {
          const horn = new T.Group(); horn.position.set(sx * .38, .62, -.1); horn.rotation.z = sx * -.35;
          horn.add(cone(.09, .62, 0xe8dcb0, { p: [0, .25, 0] })); horn.add(cone(.06, .3, 0xe8dcb0, { p: [sx * .14, .2, 0], r: [0, 0, sx * -.9] }));
          h.add(horn);
          const wh = new T.CatmullRomCurve3([[sx * .55, -.2, .4], [sx * 1.0, -.25, .45], [sx * 1.3, -.05, .3]].map(p => new T.Vector3(...p)));
          h.add(mesh(new T.TubeGeometry(wh, 16, .03, 6, false), 0xdcc98a, { noLine: true }));
        }
        const cloud = new T.Group(); cloud.position.set(0, -1.15, 0);
        [[-1, 0, 0, .42], [-.45, .12, .1, .5], [.15, .05, .05, .55], [.75, 0, -.05, .45], [1.2, -.06, 0, .32], [-.2, -.12, .35, .4], [.5, -.1, .35, .38]].forEach(([x, y, z, r]) => cloud.add(sph(r, 0xeef3f0, { p: [x, y, z], s: [1, .62, .8], line: .04 })));
        g.add(cloud);
        const pearl = sph(.22, 0xffe08a, { p: [1.05, -.62, .45], flat: true, line: .05 }); pearl.userData.pearl = true; g.add(pearl);
        return g;
      },
    };
    function fourLeg(c, belly, foot, kind) { // 山狐／猛虎
      const g = new T.Group();
      g.add(sph(.78, c, { p: [0, -.62, 0], s: [1, .86, .9] }));
      g.add(sph(.52, belly, { p: [0, -.6, .5], s: [1, 1.05, .5], noLine: true }));   // 白肚子要確實凸出身體表面，不然兩個面幾乎重疊會鋸齒閃爍
      for (const sx of [-1, 1]) g.add(sph(.22, foot, { p: [sx * .36, -1.28, .2], s: [1, .62, 1.1] }));
      const h = sph(.86, c === 0xe88a44 ? 0xe88a44 : 0xee9448, { p: [0, .42, .05] }); g.add(h);
      h.add(sph(.55, belly, { p: [0, -.25, .64], s: [1, .78, .52], noLine: true }));
      h.add(sph(.1, 0x2a1608, { p: [0, -.04, .94], s: [1.3, .9, .8], noLine: true }));
      eyes(h, .3, .06, .72, .15); blush(h, .5, -.18, .62, .12);
      for (const sx of [-1, 1]) {
        if (kind === "fox") { h.add(cone(.26, .6, c, { p: [sx * .5, .78, 0], r: [0, 0, sx * -.38] })); h.add(cone(.13, .34, 0x3a1e0c, { p: [sx * .5, .74, .1], r: [0, 0, sx * -.38], noLine: true })); }
        else { h.add(sph(.28, c, { p: [sx * .62, .62, -.05] })); h.add(sph(.14, 0x3a2410, { p: [sx * .64, .62, .12], s: [1, 1, .5], noLine: true })); }
      }
      if (kind === "tiger") {
        [[0, .82, .3, 0], [-.22, .76, .38, .3], [.22, .76, .38, -.3]].forEach(([x, y, z, r]) => h.add(mesh(new T.BoxGeometry(.07, .26, .08), 0x3a2410, { p: [x, y, z], r: [.4, 0, r], noLine: true })));
        for (const sx of [-1, 1]) [.08, -.1].forEach(y => h.add(mesh(new T.BoxGeometry(.3, .06, .06), 0x3a2410, { p: [sx * .78, y, .2], r: [0, sx * .5, 0], noLine: true })));
      }
      const tail = new T.Group(); tail.userData.tail = true; tail.position.set(-.7, -.7, -.3); g.add(tail);
      chain(tail, [[0, 0, 0], [-.3, .25, -.1], [-.42, .62, -.1], [-.32, .95, 0]], .22, .26, c);
      tail.add(sph(.2, kind === "fox" ? 0xfaf4e6 : 0x3a2410, { p: [-.25, 1.18, .05] }));
      return g;
    }
    return { build: i => (B[i] || B[0])() };
  }

  // ── 檢視器 ──
  let cur = null;   // { renderer, raf, ov, dispose }
  async function open(stageIdx, name) {
    if (document.querySelector('[data-ov="pet3d"]')) return;
    const T = typeof ttT === "function" ? ttT : s => s;
    const ov = document.createElement("div"); ov.className = "pet-modal pet3d-ov"; ov.dataset.ov = "pet3d";
    const fallback = typeof PET_ART !== "undefined" ? PET_ART.svg(stageIdx) : "";
    ov.innerHTML = `<div class="pet-modal-card pet3d-card"><button class="sheet-close" id="p3Close" aria-label="${T("關閉")}">${typeof ic === "function" ? ic("x") : "×"}</button>
      <h2>${name ? (typeof escHtml === "function" ? escHtml(name) : name) : ""}</h2>
      <div class="pet3d-stage" id="p3Stage"><div class="pet3d-load">${fallback}</div></div>
      <p class="dex-intro pet3d-hint">${T("用手指拖曳，轉一圈看看")}</p></div>`;
    document.body.appendChild(ov);
    let _a11y = null, closed = false;
    const close = () => { closed = true; if (_a11y) _a11y(); stop(); ov.remove(); };
    if (typeof ttModalA11y === "function") _a11y = ttModalA11y(ov, close, { focus: "#p3Close" });
    ov.addEventListener("click", e => { if (e.target === ov) close(); });
    ov.querySelector("#p3Close").addEventListener("click", close);
    if (!hasGL()) { ov.querySelector(".pet3d-hint").textContent = T("這台裝置不支援 3D，先看平面的"); ov.classList.add("no3d"); return; }
    let Tm;
    try { Tm = await load(); } catch (e) { ov.querySelector(".pet3d-hint").textContent = T("3D 載入失敗，先看平面的"); ov.classList.add("no3d"); return; }
    if (closed) return;
    const host = ov.querySelector("#p3Stage");
    const w = host.clientWidth, h = host.clientHeight;
    const renderer = new Tm.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    renderer.domElement.className = "pet3d-canvas";
    renderer.domElement.setAttribute("aria-label", name || "");
    renderer.domElement.setAttribute("role", "img");
    host.innerHTML = ""; host.appendChild(renderer.domElement);
    const scene = new Tm.Scene();
    const cam = new Tm.PerspectiveCamera(32, w / h, .1, 50); cam.position.set(0, .25, 7.2); cam.lookAt(0, -.1, 0);
    scene.add(new Tm.HemisphereLight(0xfff6e6, 0x4a5a48, 1.25));
    const sun = new Tm.DirectionalLight(0xffffff, 1.6); sun.position.set(2.5, 3.5, 4); scene.add(sun);
    const actor = kit(Tm).build(stageIdx); scene.add(actor);
    const ground = new Tm.Mesh(new Tm.CircleGeometry(1.25, 40), new Tm.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .16 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -1.42; ground.scale.set(1, .5, 1); scene.add(ground);
    // 拖曳轉、放開慣性；沒碰時慢慢自轉（減少動態效果時不自轉）
    let yaw = -.5, pitch = .08, vy = 0, drag = null;
    const calm = reduce();
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.addEventListener("pointerdown", e => { drag = { x: e.clientX, y: e.clientY }; vy = 0; renderer.domElement.setPointerCapture(e.pointerId); });
    renderer.domElement.addEventListener("pointermove", e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY }; yaw += dx * .012; vy = dx * .012; pitch = Math.max(-.5, Math.min(.6, pitch + dy * .006)); });
    const up = () => { drag = null; };
    renderer.domElement.addEventListener("pointerup", up); renderer.domElement.addEventListener("pointercancel", up);
    const t0 = performance.now();
    let raf = 0;
    function frame(now) {
      raf = requestAnimationFrame(frame);
      const t = (now - t0) / 1000;
      if (!drag) { vy *= .94; yaw += vy + (calm ? 0 : .006); }
      actor.rotation.set(pitch, yaw, 0);
      if (!calm) {
        actor.position.y = Math.sin(t * 1.8) * .06;
        actor.traverse(o => {
          if (o.userData.wing) o.rotation.y = o.userData.wing * Math.sin(t * 9) * .55;
          if (o.userData.tail) o.rotation.z = Math.sin(t * 2.4) * .18;
          if (o.userData.eye) o.scale.y = (t % 4.4) > 4.25 ? .15 : 1;
          if (o.userData.pearl) o.position.y = -.62 + Math.sin(t * 2.2) * .06;
        });
      }
      renderer.render(scene, cam);
    }
    raf = requestAnimationFrame(frame);
    const onVis = () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else if (!raf) raf = requestAnimationFrame(frame); };
    document.addEventListener("visibilitychange", onVis);
    function stop() {
      cancelAnimationFrame(raf); raf = 0; document.removeEventListener("visibilitychange", onVis);
      scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      const seen = new Set(); scene.traverse(o => { if (o.material && !seen.has(o.material)) { seen.add(o.material); o.material.dispose(); } });
      renderer.dispose(); if (renderer.forceContextLoss) renderer.forceContextLoss();
      cur = null;
    }
    cur = { renderer, stop, scene };
  }
  function stop() { if (cur) cur.stop(); }
  // 測試用：畫面上有多少非透明像素（確認真的畫出東西，不是一片空白）
  function inkRatio() {
    if (!cur) return 0;
    const c = cur.renderer.domElement, gl = cur.renderer.getContext();
    const px = new Uint8Array(c.width * c.height * 4); gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let n = 0; for (let k = 3; k < px.length; k += 4) if (px[k] > 20) n++;
    return n / (c.width * c.height);
  }
  return { open, stop, hasGL, load, inkRatio };
})();
