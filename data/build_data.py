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

from geomutil import polyline_len as _poly_len

HERE = Path(__file__).parent
OUT_JS = HERE.parent / "web" / "js" / "trails-data.js"
OUT_GEO = HERE.parent / "web" / "js" / "trails-geo.js"
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
DIFF_LABEL = {0: "無障礙", 1: "輕鬆", 2: "一般", 3: "進階", 4: "挑戰", 5: "困難", 6: "雪季"}
FAMILY_KEYWORDS = ("親子", "平緩", "無障礙", "輕鬆", "老少咸宜", "好走")
PAVED_KEYWORDS = ("木棧", "枕木", "棧道", "碎石", "石板", "水泥", "鋪面", "土徑")


def to_float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def is_family_friendly(diff, length_km, pave, guide, ascent=None):
    # 難度「進階(3)」以上一律不算親子友善（避免進階步道又標親子的矛盾）
    if diff is None or diff > 2:
        return False
    # 爬升大（>180m）即使短程也不適合帶小孩
    if ascent is not None and ascent > 180:
        return False
    if diff == 0:           # 無障礙級本就適合親子
        return True
    # 親子(1)、大眾(2)：需有佐證——描述關鍵字，或「鋪面 + 短程(≤3.5km)」
    if any(k in (guide or "") for k in FAMILY_KEYWORDS):
        return True
    paved = any(k in (pave or "") for k in PAVED_KEYWORDS)
    return length_km is not None and length_km <= 3.5 and paved


def region_of(position):
    """取出縣市；以最先出現的『縣』或『市』為界（跨縣市的位置取第一個）。"""
    if not position:
        return "其他"
    idxs = [position.find(s) for s in ("縣", "市") if s in position]
    if idxs:
        return position[: min(idxs) + 1]
    return "其他"


def make_trail(*, source, sid, name, difficulty=None, length_km=None,
               alt_high=None, alt_low=None, pave=None, tour=None, best_season=None,
               position=None, system=None, admin=None, admin_phone=None, permit=None,
               transport=None, entrances=None, guide=None, url=None,
               family_override=None, difficulty_estimated=False, geometry=None, ascent_override=None):
    """所有來源共用的正規化器，輸出統一的步道結構。"""
    entrances = entrances or []
    ascent = ascent_override if ascent_override is not None else \
        ((alt_high - alt_low) if (alt_high is not None and alt_low is not None) else None)
    family = family_override if family_override is not None else \
        is_family_friendly(difficulty, length_km, pave, guide, ascent)
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
        "geometry": geometry or None,   # 路線線段 [[ [lat,lon],... ], ...]
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


# --- 縣市精準歸屬：point-in-polygon（g0v 縣市邊界 GeoJSON）---
def _norm_county(name):
    name = (name or "").replace("台", "臺")        # 台→臺，與既有命名一致
    return "桃園市" if name == "桃園縣" else name   # 2010 舊資料桃園縣→桃園市


COUNTY_POLYS = []   # [(name, (s,w,n,e), [outer_ring,...])]
_geo_file = HERE / "tw_counties.geojson"
if _geo_file.exists():
    _gj = json.loads(_geo_file.read_text(encoding="utf-8"))
    for _f in _gj.get("features", []):
        _nm = _norm_county(_f["properties"].get("COUNTYNAME") or _f["properties"].get("name"))
        _g = _f["geometry"]
        _polys = _g["coordinates"] if _g["type"] == "MultiPolygon" else [_g["coordinates"]]
        _rings = [poly[0] for poly in _polys]      # 只取外環
        _pts = [p for r in _rings for p in r]
        _lons = [p[0] for p in _pts]; _lats = [p[1] for p in _pts]
        COUNTY_POLYS.append((_nm, (min(_lats), min(_lons), max(_lats), max(_lons)), _rings))


def _in_ring(lat, lon, ring):
    inside = False
    n = len(ring); j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]   # lon, lat
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def county_of(lat, lon):
    for name, (s, w, n, e), rings in COUNTY_POLYS:
        if s <= lat <= n and w <= lon <= e and any(_in_ring(lat, lon, r) for r in rings):
            return name
    return nearest_county(lat, lon)   # 離島/邊界外退回中心點法


OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
OSM_CACHE = HERE / "osm_cache.json"


def _backfill_from_tiles(els, url):
    """用分格爬蟲的結果補齊單次全台查詢漏掉的關係。

    ⚠️ Overpass 的「一次查全台」結果**每次不一樣**（實測同一支查詢先後回 950 / 944 條，
    熱門的「南子吝步道」relation 21013677 第二次就沒回來）。這代表每跑一次管線就會隨機
    得失步道，而且完全無聲。crawl_routes.py 是分 18 格查、結果穩定得多，兩邊必須一致，
    所以這裡把「有幾何但這次查詢沒回」的關係按 id 補查標籤。
    """
    import subprocess
    if not OSM_ROUTES_GEOM:
        return els
    have = {str(e.get("id")) for e in els}
    missing = sorted(set(OSM_ROUTES_GEOM) - have)
    if not missing:
        return els
    got = []
    for i in range(0, len(missing), 200):          # 分批，避免 URL 過長
        chunk = ",".join(missing[i:i + 200])
        q = f'[out:json][timeout:120];relation(id:{chunk});out center tags;'
        try:
            out = subprocess.run(["curl", "-s", "--max-time", "130", url,
                                  "--data-urlencode", "data=" + q],
                                 capture_output=True, timeout=140)
            got += [e for e in json.loads(out.stdout.decode("utf-8")).get("elements", [])
                    if e.get("tags", {}).get("name")]
        except Exception:  # noqa: BLE001
            continue
    if got:
        print(f"[osm] 全台查詢漏了 {len(missing)} 條有幾何的關係，按 id 補回 {len(got)} 條")
    return els + got


def fetch_osm():
    """全台具名健行步道；含重試、多鏡像與本地快取（Overpass 常因負載暫時限流）。"""
    import subprocess
    import time
    # route=foot 也要收：台灣有一批步道標成 foot（如陽明山橫嶺古道 relation 6000372），只抓 hiking 會漏。
    # ⚠️ 改用 bbox 而非 area["ISO3166-1"="TW"]：area 過濾對 relation 判定不可靠，實測漏掉 10 條
    # 有幾何的步道（含熱門的「南子吝步道」relation 21013677，route=hiking 卻不在 area 結果裡），
    # 這些在 crawl_routes.py 的分格 bbox 查詢裡抓得到 → 兩邊不一致等於資料靜靜少掉。
    # bbox 範圍含本島與澎湖/金門/馬祖。
    query = ('[out:json][timeout:180];'
             '(relation["route"~"^(hiking|foot)$"]["name"](21.5,118.0,26.5,122.5););'
             'out center tags 4000;')
    for attempt in range(3):
        for url in OVERPASS_MIRRORS:
            try:
                out = subprocess.run(["curl", "-s", "--max-time", "120", url,
                                      "--data-urlencode", "data=" + query],
                                     capture_output=True, timeout=130)
                data = json.loads(out.stdout.decode("utf-8"))
                els = data.get("elements", [])
                if els:
                    els = _backfill_from_tiles(els, url)
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
    """OSM 的 distance 標籤 → 公里。

    ⚠️ 原本是「濾掉所有非數字字元」，等於假設值一定是純數字公里。但 OSM 的 distance 可能寫成
    "12500 m"、"12,5 km"、"7.5mi"——濾字元後 "12500m" 會變成 12500，被當成 12500 公里（千倍誤差），
    而且不會有任何警訊。這裡改成正確解析數值與單位。
    """
    d = tags.get("distance")
    if not d:
        return None
    raw = str(d).strip().lower().replace(",", ".")   # 歐陸寫法 12,5 → 12.5
    num = ""
    for c in raw:
        if c.isdigit() or c == ".":
            num += c
        elif num:                                    # 數字結束（後面是單位）
            break
    val = to_float(num)
    if val is None:
        return None
    unit = raw[len(num):].strip()
    if unit.startswith("mi"):
        return val * 1.609344                        # 英里
    if unit.startswith("m") and not unit.startswith("mi"):
        return val / 1000.0                          # 公尺
    return val                                       # 預設/km


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


# 依累積爬升估難度（linng 與長度取較難者）；上限第5級
def grade_by_ascent(asc):
    if asc is None:
        return None
    if asc < 150:
        return 1
    if asc < 400:
        return 2
    if asc < 800:
        return 3
    if asc < 1500:
        return 4
    return 5


# enrich_elevation.py 產生的沿線爬升 {trail_id: ascent_m}
OSM_ASCENT = {}
_osm_asc_file = HERE / "osm_ascent.json"
if _osm_asc_file.exists():
    OSM_ASCENT = json.loads(_osm_asc_file.read_text(encoding="utf-8"))


# 由 enrich_osm.py 產生的長度快取 {relation_id: km}
OSM_LENGTHS = {}
_osm_len_file = HERE / "osm_lengths.json"
if _osm_len_file.exists():
    OSM_LENGTHS = {int(k): v for k, v in
                   json.loads(_osm_len_file.read_text(encoding="utf-8")).items()}

# crawl_routes.py 產生的關係路線幾何 {relation_id(str): lines}
OSM_ROUTES_GEOM = {}
_osm_routes_file = HERE / "osm_routes_geom.json"
if _osm_routes_file.exists():
    OSM_ROUTES_GEOM = json.loads(_osm_routes_file.read_text(encoding="utf-8"))


def map_osm(e):
    t = e.get("tags", {})
    c = e.get("center") or {}
    lat, lon = c.get("lat"), c.get("lon")
    if not (lat and 21 < lat < 26 and 119 < lon < 122.5):
        return None
    name = t.get("name:zh") or t.get("name")
    geom = OSM_ROUTES_GEOM.get(str(e.get("id")))   # 關係路線幾何
    # 有幾何時用幾何中點為定位、幾何長度更準
    if geom:
        longest = max(geom, key=len)
        mp = longest[len(longest) // 2]
        lat, lon = mp[0], mp[1]
        glen = sum(_poly_len(ch) for ch in geom) / 1000
        if glen > 0.05:
            OSM_LENGTHS_OVERRIDE = round(glen, 2)
        else:
            OSM_LENGTHS_OVERRIDE = None
    else:
        OSM_LENGTHS_OVERRIDE = None
    ent = [{"lat": round(lat, 6), "lon": round(lon, 6), "height": None, "memo": "步道範圍中心"}]
    length_km = OSM_LENGTHS_OVERRIDE or OSM_LENGTHS.get(e.get("id")) or _osm_distance_km(t)
    asc = OSM_ASCENT.get(f"osm-{e.get('id')}")
    diff = max(grade_by_length(length_km) or 1, grade_by_ascent(asc) or 1) if (length_km or asc) else None

    # OSM 多無完整介紹 → 用既有標籤拼出簡介
    guide = t.get("description") or ""
    extra = []
    if t.get("from") and t.get("to"):
        extra.append(f"路線：{t['from']} → {t['to']}")
    if t.get("network"):
        net = {"iwn": "國際級", "nwn": "國家級", "rwn": "區域級", "lwn": "地方級"}.get(t["network"], t["network"])
        extra.append(f"步道系統：{net}")
    if t.get("note"):
        extra.append(t["note"])
    if extra:
        guide = (guide + "\n" if guide else "") + "　".join(extra)
    if not guide:
        guide = "此為社群（OpenStreetMap）收錄之步道，詳細介紹有限，可點下方連結查更多資訊。"
    # 親子友善不靠長度推斷（缺路面/地形資訊）；交由 is_family_friendly 以描述關鍵字保守判定
    return make_trail(
        source="osm", sid=e.get("id"), name=name,
        difficulty=diff, difficulty_estimated=diff is not None,
        length_km=length_km,
        position=county_of(lat, lon),
        system=t.get("network"), admin=t.get("operator"),
        entrances=ent, guide=guide, ascent_override=asc,
        url=t.get("url") or t.get("website"), geometry=geom)


# --- OSM 具名步道 way（crawl_paths.py 預先爬好的 osm_paths.json）---
# OSM SAC 健行難度 → 本專案級別的下限
SAC_LEVEL = {
    "hiking": 1, "mountain_hiking": 3, "demanding_mountain_hiking": 4,
    "alpine_hiking": 4, "demanding_alpine_hiking": 5, "difficult_alpine_hiking": 6,
}
_osm_paths_file = HERE / "osm_paths.json"


def fetch_osm_paths():
    if not _osm_paths_file.exists():
        return []
    return json.loads(_osm_paths_file.read_text(encoding="utf-8"))


def map_osm_path(p):
    lat, lon = p.get("lat"), p.get("lon")
    if not (lat and 21 < lat < 26.5 and 118 < lon < 122.5):
        return None
    length_km = p.get("length_km")
    asc = OSM_ASCENT.get(f"osm_path-{p['name']}-{round(lat, 4)}")
    diff = max(grade_by_length(length_km) or 1, grade_by_ascent(asc) or 1) if (length_km or asc) else None
    sac_floor = SAC_LEVEL.get(p.get("sac"))
    if sac_floor:
        diff = max(diff or 1, sac_floor)
    pave = p.get("surface")
    guide = "此為社群（OpenStreetMap）收錄之步道。" + (f"路面以{pave}為主。" if pave else "")
    return make_trail(
        source="osm_path", sid=f"{p['name']}-{round(lat,4)}", name=p["name"],
        difficulty=diff, difficulty_estimated=True,
        length_km=length_km, pave=pave, ascent_override=asc,
        position=county_of(lat, lon),
        entrances=[{"lat": round(lat, 6), "lon": round(lon, 6), "height": None, "memo": "步道範圍中心"}],
        guide=guide, geometry=p.get("lines"))


SOURCES = [
    {"name": "林業署 步道基本資料", "fetch": fetch_forestry, "map": map_forestry},
    {"name": "OSM 全台健行步道", "fetch": fetch_osm, "map": map_osm},
    {"name": "OSM 具名步道(path)", "fetch": fetch_osm_paths, "map": map_osm_path},
    # 要加縣市開放資料時，補一支 fetch/map 後加進來 ↓
]


import re as _re
# 名稱含這些字＝完全廢棄/拆除/停用的步道，剔除
ABANDONED = _re.compile(
    r"廢林道|廢棄|已廢|荒廢|拆除|停用|消失的|不復存在"
    # 危險/坍塌/直下/攀岩（描述詞，不含單字「崩」以保留地名如「崩山坑」「崩埤山」）
    r"|坍塌|坍方|崩塌|崩壞|崩坍|崩毀|崩解|斷崖|落石|危險|直下|無法穿越|須改道|請備繩|繩索|攀岩|探勘"
    # OSM 有人把 name 欄位當警語/狀態寫（實測：「禁止通行」「遊客止步」「步道中斷」「注意火車」）。
    # 這類對所有來源都要擋，不只 osm_path，故放在此處而非 crawl_paths。
    r"|禁止|止步|請勿|勿入|勿進|中斷|不通|無法進入|拉繩|峭壁|路跡不明|未整|難行"
)


MIN_TRAIL_KM = 0.2   # 與 crawl_paths.MIN_KM 一致；社群來源低於此長度視為殘片

# route=foot 會帶進少量都市步行設施（空橋、行人專用街道、公園跑道分色線），這些不是登山/親子步道。
# 只擋明確非步道者；河堤步道、健康步道、園區串連步道等仍是真的可走步道，保留。
# 不套用於 forestry（官方步道一律信任）。
# 另含「下撤/撤退/替代路段」這類路線註記——它們是走法說明，不是一條可搜尋的步道。
NOT_TRAIL = _re.compile(r"空橋|行人專用街道|商圈|運動公園.*線[A-Z]?$|下撤|撤退|替代路段|替代道路")


def is_abandoned(name):
    return bool(name and ABANDONED.search(name))


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
    before = len(trails)
    trails = [t for t in trails if not is_abandoned(t["name"])]
    print(f"[clean] 剔除廢棄/危險步道 {before - len(trails)} 條")
    # 0m／無長度又無幾何的非步道（橋、平台、點位）一併剔除
    before = len(trails)
    trails = [t for t in trails
              if t.get("length_km") not in (0, 0.0)
              and not (t.get("length_km") is None and not t.get("geometry"))]
    print(f"[clean] 剔除 0m/無資料條目 {before - len(trails)} 條")
    # 社群來源的殘片：幾何只抓到一小段，長度算出 0.0x km。前端顯示「0.03 公里」是壞資料，
    # 不如不收。林業署是官方長度，不套用此門檻。
    before = len(trails)
    trails = [t for t in trails
              if t["source"] == "forestry" or (t.get("length_km") or 0) >= MIN_TRAIL_KM]
    print(f"[clean] 剔除社群來源 <{MIN_TRAIL_KM}km 殘片 {before - len(trails)} 條")
    before = len(trails)
    trails = [t for t in trails
              if t["source"] == "forestry" or not NOT_TRAIL.search(t["name"] or "")]
    print(f"[clean] 剔除都市步行設施（空橋/行人街道/公園跑道）{before - len(trails)} 條")
    borrow_geometry(trails)   # 去重前讓 forestry 借同名 osm 的幾何
    bc = borrow_coords(trails)   # 官方沒給入口座標的，借同縣市同名社群步道的定位點
    if bc:
        print(f"[clean] 無座標官方步道借社群定位 {bc} 條")
    return merge(trails)


# 來源優先序：重複步道優先保留林業署（官方）> OSM 健行路線 > OSM 具名步道
SOURCE_PRIORITY = {"forestry": 3, "osm": 2, "osm_path": 1}


def merge(trails):
    """跨來源去重：同名且座標相近（~1km）視為同一條；保留來源優先者，同源再比完整度。"""
    kept = []
    for t in trails:
        dup = None
        for k in kept:
            if t["name"] != k["name"]:
                continue
            near = (t["lat"] and k["lat"]
                    and abs(t["lat"] - k["lat"]) < 0.01 and abs(t["lon"] - k["lon"]) < 0.01)
            # 同名且涉及林業署 → 一律視為同一條（長步道入口/中心點可能相距數公里）
            forestry_involved = "forestry" in (t["source"], k["source"])
            if near or forestry_involved:
                dup = k
                break
        if dup is None:
            kept.append(t)
        elif _better(t, dup):
            kept[kept.index(dup)] = t
    return kept


def _better(a, b):
    """a 是否該取代 b：先比來源優先（林業署最優先），再比欄位完整度。"""
    pa, pb = SOURCE_PRIORITY.get(a["source"], 0), SOURCE_PRIORITY.get(b["source"], 0)
    if pa != pb:
        return pa > pb
    return _completeness(a) > _completeness(b)


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


def apply_conditions(trails):
    """套用林務署即時步道路況（暫停開放/警示），以 TRAILID 對應林務署步道。"""
    try:
        raw = json.loads(_fetch("https://recreation.forest.gov.tw/mis/api/OpenStatus/Trail"))
    except Exception as e:  # noqa: BLE001
        print(f"[condition] 取得失敗（略過）- {e}")
        return 0
    by_id = {str(c.get("TRAILID")): c for c in raw}
    n = 0
    for t in trails:
        if t["source"] != "forestry":
            continue
        tid = t["id"].split("-", 1)[-1]
        c = by_id.get(tid)
        if c:
            t["condition"] = {
                "status": c.get("TR_TYP"),        # 例：暫停開放
                "title": c.get("TITLE"),
                "section": c.get("TR_SUB"),        # 例：全線 / 0.2K
                "reopen": c.get("opendate"),
                "dep": c.get("DEP_NAME"),
            }
            n += 1
    return n


def borrow_geometry(trails):
    """無幾何的步道（主要 forestry）以同名、最近的有幾何步道借用路線。
    需在去重前呼叫（去重會移除與 forestry 同名的 osm）。"""
    from geomutil import haversine as _hv
    by_name = {}
    for t in trails:
        if t.get("geometry") and t["lat"]:
            by_name.setdefault(t["name"], []).append(t)
    n = 0
    for t in trails:
        if t.get("geometry") or not t["lat"]:
            continue
        cands = by_name.get(t["name"], [])
        if not cands:
            continue
        best = min(cands, key=lambda c: _hv((t["lat"], t["lon"]), (c["lat"], c["lon"])))
        if _hv((t["lat"], t["lon"]), (best["lat"], best["lon"])) < 30000:   # 同名且 <30km
            t["geometry"] = best["geometry"]
            n += 1
    return n


# 官方步道名的「段／群」後綴：借座標時要先去掉才對得上社群那條完整步道
_SEG_SUFFIX = _re.compile(r"(國家森林遊樂區)?步道群$|[：:\-－]?[東西南北中]段$|[東西南北]線$")


def borrow_coords(trails):
    """替「林業署有收錄但沒給入口座標」的步道，向同縣市的同名社群步道借一個定位點。

    林業署 BasicInfo API 的 TR_ENTRANCE 偶爾是空的（實測 3 條：八仙山國家森林遊樂區步道群、
    安通越嶺古道東段、烏山嶺水利古道-西段）。沒有座標的步道在 App 裡等於半殘：地圖不能定位、
    「附近」篩不到、卡片算不出距離。這些步道 OSM 都有對應，借個座標比空著好。

    只借座標不借幾何：「東段／西段／步道群」對應到的是社群那條**完整**步道，
    把整條路線當成某一段的軌跡會誤導；座標只是定位參考，入口 memo 會註明來源。
    """
    from geomutil import haversine as _hv
    n = 0
    for t in trails:
        if t.get("lat") or not t.get("name"):
            continue
        base = _SEG_SUFFIX.sub("", t["name"]).strip("：:-－ ")
        if len(base) < 3:
            continue
        pool = [c for c in trails
                if c is not t and c.get("lat") and c.get("region") == t.get("region")]
        # 由長到短試前綴：官方與社群的用字常差一兩個字（官方「安通越嶺古道」vs OSM「安通越嶺道」），
        # 全名對不上時用前綴才接得起來。最短 3 字＋同縣市，避免亂配。
        cands = []
        for k in range(len(base), 2, -1):
            pre = base[:k]
            cands = [c for c in pool if c["name"].startswith(pre) or pre in c["name"]]
            if cands:
                break
        if not cands:
            continue
        # 幾何完整、名稱最接近的優先
        cands.sort(key=lambda c: (not c.get("geometry"), abs(len(c["name"]) - len(base))))
        best = cands[0]
        t["lat"], t["lon"] = best["lat"], best["lon"]
        t["entrances"] = [{"lat": best["lat"], "lon": best["lon"], "height": None,
                           "memo": f"定位參考自社群步道「{best['name']}」（官方未提供入口座標）"}]
        n += 1
    return n


def disambiguate_names(trails):
    """同名步道（多為通用名如「生態步道」）加上地區以區分。"""
    from collections import Counter
    cnt = Counter(t["name"] for t in trails)
    n = 0
    for t in trails:
        if cnt[t["name"]] >= 3 and t.get("region") and t["region"] not in t["name"]:
            t["name"] = f"{t['name']}（{t['region']}）"
            n += 1
    return n


def main():
    trails = collect()
    cond_n = apply_conditions(trails)
    dis_n = disambiguate_names(trails)
    geo_n = sum(1 for t in trails if t.get("geometry"))
    print(f"[name] 同名加地區區分 {dis_n} 條")
    print(f"[condition] 套用路況/警示 {cond_n} 條；有路線幾何 {geo_n} 條")
    by_source = {}
    for t in trails:
        by_source[t["source"]] = by_source.get(t["source"], 0) + 1
    with_geo = sum(1 for t in trails if t["lat"])
    family = sum(1 for t in trails if t["family_friendly"])
    print(f"[merge] 合併後共 {len(trails)} 條 {by_source}；有座標 {with_geo}；親子友善 {family}")

    # 幾何拆到獨立檔（延遲載入，保持主資料輕量）；並移除前端未用欄位
    geo = {t["id"]: t["geometry"] for t in trails if t.get("geometry")}
    _drop = {"geometry", "difficulty_estimated", "admin_phone"}
    lean = [{k: v for k, v in t.items() if k not in _drop} for t in trails]

    OUT_JSON.write_text(json.dumps(trails, ensure_ascii=False, indent=2), encoding="utf-8")
    OUT_JS.write_text("// 自動產生，請勿手改 (來源: build_data.py)\n"
                      "window.TRAILS = " + json.dumps(lean, ensure_ascii=False) + ";\n",
                      encoding="utf-8")
    OUT_GEO.write_text("// 自動產生：步道路線幾何（延遲載入）\n"
                       "window.TRAILS_GEO = " + json.dumps(geo, ensure_ascii=False) + ";\n",
                       encoding="utf-8")
    print(f"[write] {OUT_JSON}")
    print(f"[write] {OUT_JS}")
    print(f"[write] {OUT_GEO}（{len(geo)} 條路線）")

    # 抽樣驗證座標
    sample = next((t for t in trails if t["lat"]), None)
    if sample:
        print(f"[check] {sample['name']} -> lat={sample['lat']}, lon={sample['lon']} "
              f"(難度{sample['difficulty']}/{sample['difficulty_label']}, "
              f"親子={'是' if sample['family_friendly'] else '否'})")


if __name__ == "__main__":
    main()
