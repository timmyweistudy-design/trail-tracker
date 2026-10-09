// 開頁後「等到 App 真的好了」再往下，取代固定等 2.5 秒（2026-10-09 實測：開頁到可用約 0.9～1.1 秒）。
// 條件：主程式載入（renderPet 存在）、進場動畫拿掉、分頁列出現；再多等 300ms 讓開機後的第一輪重畫跑完。
// 逾時（8 秒）不丟錯，退回舊行為讓後面的檢查自己報。
module.exports = async (p, settle = 300) => {
  await p.waitForFunction(() => typeof renderPet === "function" && !document.getElementById("splash") && !!document.querySelector('.tab[data-view="pet"]'), null, { polling: 50, timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(settle);
};
