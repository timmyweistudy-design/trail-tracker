// Cloudflare Worker：代理林業署「步道路況」API 並加上 CORS，讓前端可即時取得最新路況。
//
// 部署步驟（Cloudflare 後台）：
//   1. Workers & Pages → Create → Create Worker → 命名（如 trail-conditions）→ Deploy
//   2. Edit code → 把本檔內容整段貼上 → Deploy
//   3. 複製產生的網址（如 https://trail-conditions.<你的子網域>.workers.dev）給我
//
// 之後我會把網址填進 web/js/config.js 的 window.CONDITIONS_PROXY，前端就會即時抓最新路況。
export default {
  async fetch(request) {
    // 預檢
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, OPTIONS",
          "access-control-max-age": "86400",
        },
      });
    }
    try {
      const upstream = await fetch(
        "https://recreation.forest.gov.tw/mis/api/OpenStatus/Trail",
        { headers: { "User-Agent": "trail-tracker-proxy/1.0" }, cf: { cacheTtl: 900 } }
      );
      const body = await upstream.text();
      return new Response(body, {
        status: upstream.status,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "access-control-allow-origin": "*",
          "cache-control": "public, max-age=900",
        },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), {
        status: 502,
        headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
      });
    }
  },
};
