// 測試用假天氣：攔截 Open-Meteo，回固定格式的假資料（不靠外部網路；CI 上真的打 API 會被限流或連不上）
// 用法：await require("./fake-weather")(page)
function hours(n) {
  const out = [], d = new Date(); d.setMinutes(0, 0, 0); d.setHours(0);
  for (let i = 0; i < n; i++) { const t = new Date(d.getTime() + i * 3600e3); const p = x => String(x).padStart(2, "0"); out.push(`${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}T${p(t.getHours())}:00`); }
  return out;
}
function days(n) { return hours(n * 24).filter((_, i) => i % 24 === 0).map(s => s.slice(0, 10)); }
module.exports = async function fakeWeather(page) {
  await page.route(/api\.open-meteo\.com/, route => {
    const url = route.request().url();
    let body;
    if (/hourly=/.test(url)) {   // 山頂天氣
      const t = hours(72);
      body = { hourly: { time: t,
        temperature_2m: t.map((_, i) => 4 + 8 * Math.sin((i % 24 - 6) / 24 * Math.PI * 2)),
        apparent_temperature: t.map((_, i) => 1 + 8 * Math.sin((i % 24 - 6) / 24 * Math.PI * 2)),
        precipitation_probability: t.map((_, i) => (i % 24) >= 13 ? 80 : 20),
        weather_code: t.map((_, i) => (i % 24) >= 14 && (i % 24) <= 17 ? 95 : 3),
        wind_gusts_10m: t.map((_, i) => 20 + (i % 24)) } };
    } else {
      const d = days(7);
      body = { current: { temperature_2m: 18, weather_code: 3, wind_speed_10m: 8, precipitation: 0, relative_humidity_2m: 80 },
        daily: { time: d, weather_code: d.map((_, i) => [3, 61, 95, 3, 2, 61, 3][i]), temperature_2m_max: d.map(() => 22), temperature_2m_min: d.map(() => 14),
          precipitation_probability_max: d.map((_, i) => [20, 80, 90, 20, 10, 70, 30][i]), sunrise: d.map(x => x + "T05:45"), sunset: d.map(x => x + "T17:40") } };
    }
    const ele = (url.match(/[?&]elevation=(-?\d+)/) || [])[1];
    body.elevation = ele != null ? +ele : 1200;   // 真的 API 會回它用的海拔（有帶 elevation 就照帶的）
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  // 地形高度圖磚（terrarium）也攔下來：回一張整片 300 公尺的假圖磚（2026-10-07：以前真的打 AWS，網路一慢 record-v2 的剖面／存檔就逾時失敗）
  const TERR = require("fs").readFileSync(__dirname + "/fixtures/terrain-300m.png");
  const ctx = page.context(); if (ctx.__terr) return; ctx.__terr = true;   // 用 context.route：圖磚是 Service Worker 發的請求，page.route 攔不到
  await ctx.route(/elevation-tiles-prod[^/]*\/terrarium\//, route => route.fulfill({ status: 200, contentType: "image/png", headers: { "access-control-allow-origin": "*" }, body: TERR }));
};
