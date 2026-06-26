#!/usr/bin/env python3
"""Trail Tracker 多來源資料管線

流程：
  1. 跑遍 SOURCES 內每個來源 adapter（fetch 原始資料 + map 成統一結構）
  2. 將平面座標 (TWD97 TM2, 121°E) 轉為 WGS84 經緯度
  3. 計算海拔落差、套用親子友善標記與分級
  4. 跨來源去重合併
  5. 輸出前端用的 web/js/trails-data.js (含 TRAILS 陣列) 與 data/trails.json

要新增縣市來源：在 SOURCES 加一個 {name, fetch, map}（見 forestry 範例）。

用法：
  python3 build_data.py
"""
import json
import math
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent
OUT_JS = HERE.parent / "web" / "js" / "trails-data.js"
OUT_JSON = HERE / "trails.json"

# ---------------------------------------------------------------------------
# TWD97 TM2 (121°E) -> WGS84  反投影
# TWD97 採 GRS80 橢球，與 WGS84 差異在公分等級，地圖用途可直接視為等同。
# ---------------------------------------------------------------------------
def tm2_inverse(x, y, lon0_deg=121.0):
    """較直接的寫法，回傳 (lat, lon) 角度。"""
    a = 6378137.0
    f = 1 / 298.257222101
    k0 = 0.9999
    dx = 250000.0
    e2 = 2 * f - f * f
    x -= dx
    M = y / k0
    mu = M / (a * (1 - e2 / 4 - 3 * e2**2 / 64 - 5 * e2**3 / 256))
    e1 = (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))
    fp = (mu + (3 * e1 / 2 - 27 * e1**3 / 32) * math.sin(2 * mu)
          + (21 * e1**2 / 16 - 55 * e1**4 / 32) * math.sin(4 * mu)
          + (151 * e1**3 / 96) * math.sin(6 * mu)
          + (1097 * e1**4 / 512) * math.sin(8 * mu))
    ep2 = e2 / (1 - e2)
    C1 = ep2 * math.cos(fp) ** 2
    T1 = math.tan(fp) ** 2
    R1 = a * (1 - e2) / (1 - e2 * math.sin(fp) ** 2) ** 1.5
    N1 = a / math.sqrt(1 - e2 * math.sin(fp) ** 2)
    D = x / (N1 * k0)
    lat = fp - (N1 * math.tan(fp) / R1) * (
        D**2 / 2
        - (5 + 3 * T1 + 10 * C1 - 4 * C1**2 - 9 * ep2) * D**4 / 24
        + (61 + 90 * T1 + 298 * C1 + 45 * T1**2 - 252 * ep2 - 3 * C1**2) * D**6 / 720)
    lon_rad = (D - (1 + 2 * T1 + C1) * D**3 / 6
               + (5 - 2 * C1 + 28 * T1 - 3 * C1**2 + 8 * ep2 + 24 * T1**2) * D**5 / 120) / math.cos(fp)
    return math.degrees(lat), lon0_deg + math.degrees(lon_rad)


# ---------------------------------------------------------------------------
# 分級與標記
# ---------------------------------------------------------------------------
# 依林業及自然保育署「自然步道使用困難度分級標準」第 0~6 級
DIFF_LABEL = {0: "無障礙", 1: "親子", 2: "大眾", 3: "進階", 4: "挑戰", 5: "困難", 6: "雪季"}
FAMILY_KEYWORDS = ("親子", "平緩", "無障礙", "輕鬆", "老少咸宜", "好走")
PAVED_KEYWORDS = ("木棧", "枕木", "棧道", "碎石", "石板", "水泥", "鋪面", "土徑")


def to_float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def is_family_friendly(diff, length_km, pave, guide):
    # 難度「進階(3)」以上一律不算親子友善（避免進階步道又標親子的矛盾）
    if diff is None or diff > 2:
        return False
    if diff == 0:           # 無障礙級本就適合親子
        return True
    # 親子(1)、大眾(2)：需有佐證——描述關鍵字，或「鋪面 + 短程(≤3km)」
    if any(k in (guide or "") for k in FAMILY_KEYWORDS):
        return True
    paved = any(k in (pave or "") for k in PAVED_KEYWORDS)
    return length_km is not None and length_km <= 3 and paved


def region_of(position):
    """從『宜蘭縣南澳鄉』取出縣市。"""
    if not position:
        return "其他"
    for sep in ("縣", "市"):
        idx = position.find(sep)
        if idx != -1:
            return position[: idx + 1]
    return "其他"


def make_trail(*, source, sid, name, difficulty=None, length_km=None,
               alt_high=None, alt_low=None, pave=None, tour=None, best_season=None,
               position=None, system=None, admin=None, admin_phone=None, permit=None,
               transport=None, entrances=None, guide=None, url=None,
               family_override=None, difficulty_estimated=False):
    """所有來源共用的正規化器，輸出統一的步道結構。"""
    entrances = entrances or []
    ascent = (alt_high - alt_low) if (alt_high is not None and alt_low is not None) else None
    family = family_override if family_override is not None else \
        is_family_friendly(difficulty, length_km, pave, guide)
    label = DIFF_LABEL.get(difficulty, "未分級")
    if difficulty and difficulty_estimated:
        label += "(估)"
    return {
        "id": f"{source}-{sid}",
        "source": source,
        "name": name,
        "difficulty": difficulty,
        "difficulty_label": label,
        "difficulty_estimated": difficulty_estimated,
        "family_friendly": family,
        "length_km": length_km,
        "alt_high": alt_high, "alt_low": alt_low, "ascent": ascent,
        "pave": pave, "tour": tour, "best_season": best_season,
        "region": region_of(position), "position": position, "system": system,
        "admin": admin, "admin_phone": admin_phone, "permit": permit,
        "transport": transport or {},
        "entrances": entrances,
        "lat": entrances[0]["lat"] if entrances else None,
        "lon": entrances[0]["lon"] if entrances else None,
        "guide": guide or "", "url": url,
    }


# ===========================================================================
# 來源 adapters：每個來源 = fetch() 取得原始陣列 + map_record() 轉成統一結構。
# 要新增縣市，照下面 forestry 的樣子加一個 dict 進 SOURCES 即可。
# ===========================================================================
def fetch_forestry():
    return json.loads(_fetch("https://recreation.forest.gov.tw/mis/api/BasicInfo/Trail"))


def map_forestry(r):
    try:
        diff = int(r.get("TR_DIF_CLASS"))
    except (TypeError, ValueError):
        diff = None
    entrances = []
    for e in (r.get("TR_ENTRANCE") or []):
        x, y = to_float(e.get("x")), to_float(e.get("y"))
        if x and y and x > 100000:                       # TWD97 平面座標
            lat, lon = tm2_inverse(x, y)
            if 21 < lat < 26 and 119 < lon < 123:        # 台灣範圍檢查
                entrances.append({"lat": round(lat, 6), "lon": round(lon, 6),
                                  "height": e.get("height"), "memo": e.get("memo")})
    return make_trail(
        source="forestry", sid=r.get("TRAILID"), name=r.get("TR_CNAME"),
        difficulty=diff, length_km=to_float(r.get("TR_LENGTH_NUM")),
        alt_high=to_float(r.get("TR_ALT")), alt_low=to_float(r.get("TR_ALT_LOW")),
        pave=r.get("TR_PAVE"), tour=r.get("TR_TOUR"), best_season=r.get("TR_BEST_SEASON"),
        position=r.get("TR_POSITION"), system=r.get("TR_MAIN_SYS"),
        admin=r.get("TR_ADMIN"), admin_phone=r.get("TR_ADMIN_PHONE"), permit=r.get("TR_permit"),
        transport={"car": r.get("CAR"), "m_bus": r.get("M_BUS"), "l_bus": r.get("L_BUS")},
        entrances=entrances, guide=r.get("GUIDE_CONTENT"), url=r.get("URL"))


# --- OSM Overpass：全台具名健行步道（route=hiking），大幅擴充覆蓋 ---
OVERPASS = "https://overpass-api.de/api/interpreter"

# 22 縣市概略中心點，用座標就近指派縣市（供地區篩選；非精確行政邊界）
COUNTY_CENTROIDS = {
    "臺北市": (25.07, 121.55), "新北市": (25.01, 121.55), "基隆市": (25.13, 121.74),
    "桃園市": (24.95, 121.25), "新竹市": (24.81, 120.97), "新竹縣": (24.70, 121.12),
    "苗栗縣": (24.49, 120.90), "臺中市": (24.18, 120.85), "彰化縣": (24.05, 120.50),
    "南投縣": (23.85, 120.97), "雲林縣": (23.70, 120.40), "嘉義市": (23.48, 120.45),
    "嘉義縣": (23.45, 120.55), "臺南市": (23.10, 120.30), "高雄市": (22.95, 120.55),
    "屏東縣": (22.55, 120.62), "宜蘭縣": (24.70, 121.74), "花蓮縣": (23.85, 121.45),
    "臺東縣": (22.85, 121.10), "澎湖縣": (23.57, 119.60), "金門縣": (24.43, 118.32),
    "連江縣": (26.16, 119.95),
}


def nearest_county(lat, lon):
    best, bestd = "其他", 1e9
    for name, (clat, clon) in COUNTY_CENTROIDS.items():
        d = (lat - clat) ** 2 + (lon - clon) ** 2
        if d < bestd:
            bestd, best = d, name
    return best


OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
OSM_CACHE = HERE / "osm_cache.json"


def fetch_osm():
    """全台具名健行步道；含重試、多鏡像與本地快取（Overpass 常因負載暫時限流）。"""
    import subprocess
    import time
    query = ('[out:json][timeout:90];area["ISO3166-1"="TW"][admin_level=2]->.tw;'
             '(relation["route"="hiking"]["name"](area.tw););out center tags 1500;')
    for attempt in range(3):
        for url in OVERPASS_MIRRORS:
            try:
                out = subprocess.run(["curl", "-s", "--max-time", "120", url,
                                      "--data-urlencode", "data=" + query],
                                     capture_output=True, timeout=130)
                data = json.loads(out.stdout.decode("utf-8"))
                els = data.get("elements", [])
                if els:
                    OSM_CACHE.write_text(json.dumps(els, ensure_ascii=False), encoding="utf-8")
                    return els
            except Exception:  # noqa: BLE001  下一個鏡像 / 下一輪
                continue
        time.sleep(8 * (attempt + 1))  # 退避後重試
    if OSM_CACHE.exists():
        print("[osm] 線上取得失敗，改用本地快取 osm_cache.json")
        return json.loads(OSM_CACHE.read_text(encoding="utf-8"))
    raise RuntimeError("Overpass 三鏡像皆失敗且無快取")


def _osm_distance_km(tags):
    d = tags.get("distance")
    if not d:
        return None
    m = "".join(c for c in str(d) if (c.isdigit() or c == "."))
    return to_float(m)


# OSM 步道無官方分級 → 依實際長度估算（對齊林業署標準的「步道長度」因子級距與行程天數）。
# 僅以長度推估，較粗略，前端標示「(估)」；上限封頂第5級（第6級為雪季/攀冰，無法由長度判斷）。
def grade_by_length(km):
    if km is None:
        return None
    if km <= 2:       # 短程、約半天內 → 親子級
        return 1
    if km <= 5:       # 半天內 → 大眾級
        return 2
    if km <= 15:      # 約一天 → 進階級
        return 3
    if km <= 25:      # 一至二天 → 挑戰級
        return 4
    return 5          # 25km 以上、需多日 → 困難級


# 由 enrich_osm.py 產生的長度快取 {relation_id: km}
OSM_LENGTHS = {}
_osm_len_file = HERE / "osm_lengths.json"
if _osm_len_file.exists():
    OSM_LENGTHS = {int(k): v for k, v in
                   json.loads(_osm_len_file.read_text(encoding="utf-8")).items()}


def map_osm(e):
    t = e.get("tags", {})
    c = e.get("center") or {}
    lat, lon = c.get("lat"), c.get("lon")
    if not (lat and 21 < lat < 26 and 119 < lon < 122.5):
        return None
    name = t.get("name:zh") or t.get("name")
    ent = [{"lat": round(lat, 6), "lon": round(lon, 6), "height": None, "memo": "步道範圍中心"}]
    length_km = OSM_LENGTHS.get(e.get("id")) or _osm_distance_km(t)
    diff = grade_by_length(length_km)
    # 親子友善不靠長度推斷（缺路面/地形資訊）；交由 is_family_friendly 以描述關鍵字保守判定
    return make_trail(
        source="osm", sid=e.get("id"), name=name,
        difficulty=diff, difficulty_estimated=diff is not None,
        length_km=length_km,
        position=nearest_county(lat, lon),
        system=t.get("network"), admin=t.get("operator"),
        entrances=ent, guide=t.get("description"),
        url=t.get("url") or t.get("website"))


SOURCES = [
    {"name": "林業署 步道基本資料", "fetch": fetch_forestry, "map": map_forestry},
    {"name": "OSM 全台健行步道", "fetch": fetch_osm, "map": map_osm},
    # 要加縣市開放資料時，補一支 fetch/map 後加進來 ↓
    # {"name": "臺北市 親山步道", "fetch": fetch_taipei, "map": map_taipei},
]


def collect():
    """跑遍所有來源，單一來源失敗不影響其他來源。"""
    trails = []
    for s in SOURCES:
        try:
            raw = s["fetch"]()
            mapped = [m for m in (s["map"](r) for r in raw) if m]
            trails += mapped
            print(f"[source] {s['name']}: {len(mapped)} 條")
        except Exception as e:  # noqa: BLE001
            print(f"[source] {s['name']}: 失敗（略過）- {e}")
    return merge(trails)


def merge(trails):
    """跨來源去重：同名 + 入口座標相近（~150m）視為同一條，保留欄位較完整者。"""
    kept = []
    for t in trails:
        dup = None
        for k in kept:
            if t["name"] == k["name"] and t["lat"] and k["lat"] \
                    and abs(t["lat"] - k["lat"]) < 0.0015 and abs(t["lon"] - k["lon"]) < 0.0015:
                dup = k
                break
        if dup is None:
            kept.append(t)
        elif _completeness(t) > _completeness(dup):
            kept[kept.index(dup)] = t
    return kept


def _completeness(t):
    return sum(1 for v in t.values() if v not in (None, "", [], {}))


def _fetch(url):
    """先試 urllib，失敗 (常見於環境憑證問題) 再退回 curl。"""
    import subprocess
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "trail-tracker/1.0"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.read().decode("utf-8-sig")
    except Exception as e:  # noqa: BLE001
        print(f"[fetch] urllib 失敗 ({e}); 改用 curl")
        out = subprocess.run(["curl", "-sL", "--max-time", "60", url],
                             capture_output=True, timeout=70)
        if out.returncode != 0 or not out.stdout:
            raise RuntimeError(f"curl 也失敗: {out.stderr.decode(errors='ignore')}")
        return out.stdout.decode("utf-8-sig")


def main():
    trails = collect()
    by_source = {}
    for t in trails:
        by_source[t["source"]] = by_source.get(t["source"], 0) + 1
    with_geo = sum(1 for t in trails if t["lat"])
    family = sum(1 for t in trails if t["family_friendly"])
    print(f"[merge] 合併後共 {len(trails)} 條 {by_source}；有座標 {with_geo}；親子友善 {family}")

    OUT_JSON.write_text(json.dumps(trails, ensure_ascii=False, indent=2), encoding="utf-8")
    OUT_JS.write_text("// 自動產生，請勿手改 (來源: build_data.py)\n"
                      "window.TRAILS = " + json.dumps(trails, ensure_ascii=False) + ";\n",
                      encoding="utf-8")
    print(f"[write] {OUT_JSON}")
    print(f"[write] {OUT_JS}")

    # 抽樣驗證座標
    sample = next((t for t in trails if t["lat"]), None)
    if sample:
        print(f"[check] {sample['name']} -> lat={sample['lat']}, lon={sample['lon']} "
              f"(難度{sample['difficulty']}/{sample['difficulty_label']}, "
              f"親子={'是' if sample['family_friendly'] else '否'})")


if __name__ == "__main__":
    main()
