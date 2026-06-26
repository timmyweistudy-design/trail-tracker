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
DIFF_LABEL = {1: "親子", 2: "輕鬆", 3: "一般", 4: "進階", 5: "挑戰", 6: "困難"}
FAMILY_KEYWORDS = ("親子", "平緩", "無障礙", "輕鬆", "老少咸宜", "好走")
PAVED_KEYWORDS = ("木棧", "枕木", "棧道", "碎石", "石板", "水泥", "鋪面", "土徑")


def to_float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def is_family_friendly(diff, length_km, pave, guide):
    diff = diff or 9
    pave = pave or ""
    guide = guide or ""
    if any(k in guide for k in FAMILY_KEYWORDS):
        return True
    paved = any(k in pave for k in PAVED_KEYWORDS)
    return diff <= 2 and (length_km is not None and length_km <= 3) and paved


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
               family_override=None):
    """所有來源共用的正規化器，輸出統一的步道結構。"""
    entrances = entrances or []
    ascent = (alt_high - alt_low) if (alt_high is not None and alt_low is not None) else None
    family = family_override if family_override is not None else \
        is_family_friendly(difficulty, length_km, pave, guide)
    return {
        "id": f"{source}-{sid}",
        "source": source,
        "name": name,
        "difficulty": difficulty,
        "difficulty_label": DIFF_LABEL.get(difficulty, "未分級"),
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


SOURCES = [
    {"name": "林業署 步道基本資料", "fetch": fetch_forestry, "map": map_forestry},
    # 範例：要加台北市親山步道時，補一支 fetch/map 後解除註解 ↓
    # {"name": "臺北市 親山步道", "fetch": fetch_taipei, "map": map_taipei},
]


def collect():
    """跑遍所有來源，單一來源失敗不影響其他來源。"""
    trails = []
    for s in SOURCES:
        try:
            raw = s["fetch"]()
            mapped = [s["map"](r) for r in raw]
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
