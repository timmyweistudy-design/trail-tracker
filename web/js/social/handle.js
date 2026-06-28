// handle 純驗證：3–20 字、小寫英數與底線。回傳 { ok, handle?, msg? }。
const Handle = (() => {
  const RE = /^[a-z0-9_]{3,20}$/;
  function normalize(s) { return (s || "").trim().toLowerCase(); }
  function validate(s) {
    const h = normalize(s);
    if (h.length < 3) return { ok: false, msg: "至少 3 個字" };
    if (h.length > 20) return { ok: false, msg: "最多 20 個字" };
    if (!RE.test(h)) return { ok: false, msg: "只能用小寫英文、數字、底線" };
    return { ok: true, handle: h };
  }
  return { normalize, validate, RE };
})();
if (typeof module !== "undefined") module.exports = Handle;
