// 媒體處理：照片壓縮 + 縮圖（Canvas）、影片首幀封面、上傳 Supabase Storage。
const Media = (() => {
  // 依長邊上限計算縮放後尺寸（純函式，可測）
  function targetSize(w, h, max) {
    if (w <= max && h <= max) return { w, h };
    const s = max / Math.max(w, h);
    return { w: Math.round(w * s), h: Math.round(h * s) };
  }
  function loadImage(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); res(img); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("image load failed")); };
      img.src = url;
    });
  }
  async function drawJpeg(img, maxLong, quality) {
    const { w, h } = targetSize(img.naturalWidth, img.naturalHeight, maxLong);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    c.getContext("2d").drawImage(img, 0, 0, w, h);
    return await new Promise(r => c.toBlob(r, "image/jpeg", quality));
  }
  // File（圖片）→ { main, thumb, w, h }
  async function compressImage(file, maxLong = 1600, thumbLong = 400, quality = 0.8) {
    const img = await loadImage(file);
    const main = await drawJpeg(img, maxLong, quality);
    const thumb = await drawJpeg(img, thumbLong, quality);
    return { main, thumb, w: img.naturalWidth, h: img.naturalHeight };
  }
  // File（影片）→ 首幀封面 blob（失敗回 null）
  function videoPoster(file) {
    return new Promise((res) => {
      const v = document.createElement("video");
      v.preload = "metadata"; v.muted = true; v.playsInline = true;
      v.onloadeddata = () => {
        try {
          const c = document.createElement("canvas");
          const s = targetSize(v.videoWidth, v.videoHeight, 800);
          c.width = s.w; c.height = s.h;
          c.getContext("2d").drawImage(v, 0, 0, s.w, s.h);
          c.toBlob(b => { URL.revokeObjectURL(v.src); res(b); }, "image/jpeg", 0.8);
        } catch { res(null); }
      };
      v.onerror = () => res(null);
      v.src = URL.createObjectURL(file);
      v.currentTime = 0.1;
    });
  }
  async function upload(userId, postId, blob, name) {
    const c = Supa.client();
    const path = `${userId}/${postId}/${name}`;
    const { error } = await c.storage.from("media").upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: true });
    if (error) throw error;
    return path;
  }
  function publicUrl(path) {
    if (!path) return "";
    const c = Supa.client(); if (!c) return "";
    return c.storage.from("media").getPublicUrl(path).data.publicUrl;
  }

  // 純函式：位元組是否在 MB 上限內（可測）
  function validateSize(bytes, maxMB) { return bytes <= maxMB * 1024 * 1024; }

  // 影片驗證：大小 + 長度。回傳 { ok, msg?, dur? }
  function validateVideo(file, maxSec = 60, maxMB = 50) {
    return new Promise(res => {
      if (!validateSize(file.size, maxMB)) return res({ ok: false, msg: `影片需小於 ${maxMB}MB` });
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => { const d = v.duration; URL.revokeObjectURL(v.src); res(d > maxSec ? { ok: false, msg: `影片需短於 ${maxSec} 秒` } : { ok: true, dur: d }); };
      v.onerror = () => { URL.revokeObjectURL(v.src); res({ ok: false, msg: "無法讀取影片" }); };
      v.src = URL.createObjectURL(file);
    });
  }

  // 影片上傳：原檔 + 封面。回傳 { path, thumb_path, dur }
  async function uploadVideo(userId, postId, file, dur) {
    const c = Supa.client();
    const base = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now());
    const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
    const path = `${userId}/${postId}/${base}.${ext}`;
    const { error } = await c.storage.from("media").upload(path, file, { contentType: file.type || "video/mp4", upsert: true });
    if (error) throw error;
    let thumb_path = null;
    const poster = await videoPoster(file);
    if (poster) thumb_path = await upload(userId, postId, poster, base + "_poster.jpg");
    return { path, thumb_path, dur: dur || null };
  }

  // 上傳頭像（壓到 ≤400px），回傳公開網址
  async function uploadAvatar(uid, file) {
    const { main } = await compressImage(file, 400, 100, 0.85);
    const c = Supa.client();
    const path = `${uid}/avatar/${Date.now()}.jpg`;
    const { error } = await c.storage.from("media").upload(path, main, { contentType: "image/jpeg", upsert: true });
    if (error) throw error;
    return c.storage.from("media").getPublicUrl(path).data.publicUrl;
  }

  return { targetSize, compressImage, videoPoster, upload, publicUrl, validateSize, validateVideo, uploadVideo, uploadAvatar };
})();
if (typeof module !== "undefined") module.exports = Media;
