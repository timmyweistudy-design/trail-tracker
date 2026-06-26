// GPX 匯出/匯入：記錄軌跡可存成 GPX；可匯入別人的 GPX 路線跟著走。
const GPX = (() => {
  function exportRecord(rec) {
    const pts = (rec.track || []).map(p =>
      `   <trkpt lat="${p.lat}" lon="${p.lon}">${p.t ? `<time>${new Date(p.t).toISOString()}</time>` : ""}</trkpt>`).join("\n");
    const name = (rec.trailName || "自由路線").replace(/[<>&]/g, "");
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="步道誌 Trail Tracker" xmlns="http://www.topografix.com/GPX/1/1">
 <metadata><name>${name}</name><time>${rec.date || new Date().toISOString()}</time></metadata>
 <trk><name>${name}</name><trkseg>
${pts}
 </trkseg></trk>
</gpx>`;
    const blob = new Blob([xml], { type: "application/gpx+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name}_${(rec.date || "").slice(0, 10)}.gpx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // 解析 GPX → [{lat, lon}]（支援 trkpt 與 rtept）
  function parse(text) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    const nodes = [...doc.querySelectorAll("trkpt, rtept")];
    return nodes.map(n => ({
      lat: parseFloat(n.getAttribute("lat")),
      lon: parseFloat(n.getAttribute("lon")),
    })).filter(p => !isNaN(p.lat) && !isNaN(p.lon));
  }

  return { exportRecord, parse };
})();
