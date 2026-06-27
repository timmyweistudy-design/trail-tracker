// 步道天氣：用 Open-Meteo（免金鑰）查步道所在地現況與 3 日預報。
const Weather = (() => {
  const TTL = 60 * 60 * 1000;   // 快取 1 小時
  // WMO 天氣代碼 → 中文 + emoji
  const WMO = {
    0: ["☀️", "晴"], 1: ["🌤️", "晴時多雲"], 2: ["⛅", "多雲"], 3: ["☁️", "陰"],
    45: ["🌫️", "霧"], 48: ["🌫️", "霧凇"],
    51: ["🌦️", "毛毛雨"], 53: ["🌦️", "毛毛雨"], 55: ["🌧️", "毛毛雨"],
    56: ["🌧️", "凍毛雨"], 57: ["🌧️", "凍毛雨"],
    61: ["🌧️", "小雨"], 63: ["🌧️", "中雨"], 65: ["🌧️", "大雨"],
    66: ["🌧️", "凍雨"], 67: ["🌧️", "凍雨"],
    71: ["🌨️", "小雪"], 73: ["🌨️", "中雪"], 75: ["❄️", "大雪"], 77: ["❄️", "霰"],
    80: ["🌦️", "陣雨"], 81: ["🌧️", "陣雨"], 82: ["⛈️", "強陣雨"],
    85: ["🌨️", "陣雪"], 86: ["❄️", "強陣雪"],
    95: ["⛈️", "雷雨"], 96: ["⛈️", "雷雨夾雹"], 99: ["⛈️", "強雷雨"],
  };
  const desc = code => WMO[code] || ["🌡️", "—"];

  const cache = {};
  function ckey(lat, lon) { return `${lat.toFixed(2)},${lon.toFixed(2)}`; }

  async function get(lat, lon) {
    const k = ckey(lat, lon);
    const mem = cache[k];
    if (mem && Date.now() - mem.ts < TTL) return mem.data;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,weather_code,wind_speed_10m,precipitation,relative_humidity_2m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&timezone=Asia%2FTaipei&forecast_days=7`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("weather");
    const data = await res.json();
    cache[k] = { ts: Date.now(), data };
    return data;
  }

  return { get, desc };
})();
