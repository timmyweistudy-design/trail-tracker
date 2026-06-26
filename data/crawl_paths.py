#!/usr/bin/env python3
"""全台具名步道 way 爬蟲（OSM highway=path）

route=hiking 關係只涵蓋部分步道；許多步道是獨立的具名 path way。
本程式以網格分塊抓取全台 `way[highway=path][name]`，依名稱＋鄰近合併成步道，
過濾掉市區巷弄（只留真步道），計算長度、路面、難度線索，輸出 osm_paths.json。

特性：分塊、多鏡像、退避重試、續傳（已抓的格子會跳過）。
用法：python3 crawl_paths.py
"""
import json
import math
import subprocess
import time
from pathlib import Path

HERE = Path(__file__).parent
RAW = HERE / "osm_paths_raw.json"     # {way_id: {name,lat,lon,len,surface,sac,tv}}
DONE = HERE / "osm_paths_tiles.json"  # 已完成的格子
OUT = HERE / "osm_paths.json"         # 合併過濾後的步道清單

MIRRORS = [
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.osm.ch/api/interpreter",
]

TRAIL_KW = ("步道", "古道", "山徑", "登山", "親山", "步徑", "林道", "越嶺",
            "棧道", "步階", "環山", "健行", "山道", "步行", "自然步", "生態步")
NAT_SURF = {"ground", "dirt", "earth", "gravel", "fine_gravel", "unpaved", "rock",
            "wood", "sand", "grass", "pebblestone", "compacted", "mud", "stone", "rocks"}
SURF_ZH = {
    "ground": "泥土", "dirt": "泥土", "earth": "泥土", "mud": "泥濘",
    "gravel": "碎石", "fine_gravel": "細碎石", "pebblestone": "鵝卵石",
    "rock": "岩石", "rocks": "岩石", "stone": "石塊", "compacted": "壓實土石",
    "wood": "木棧道", "sand": "沙地", "grass": "草地", "unpaved": "未鋪面",
    "paved": "鋪面", "asphalt": "柏油", "concrete": "水泥", "paving_stones": "石板",
    "wood_chips": "木屑", "steps": "階梯",
}


def haversine(a, b):
    R = 6371000
    r = math.radians
    return 2 * R * math.asin(math.sqrt(
        math.sin(r(b[0] - a[0]) / 2) ** 2
        + math.cos(r(a[0])) * math.cos(r(b[0])) * math.sin(r(b[1] - a[1]) / 2) ** 2))


def tiles():
    """覆蓋台灣本島與外島的 0.4° 網格 bbox。"""
    out = []
    lat = 21.8
    while lat < 25.4:
        lon = 119.9
        while lon < 122.1:
            out.append((round(lat, 2), round(lon, 2), round(lat + 0.4, 2), round(lon + 0.4, 2)))
            lon += 0.4
        lat += 0.4
    # 外島：澎湖、金門、馬祖
    out += [(23.2, 119.3, 23.8, 119.9), (24.3, 118.1, 24.6, 118.5), (26.0, 119.8, 26.4, 120.6)]
    return out


def fetch_tile(bbox):
    s, w, n, e = bbox
    q = f'[out:json][timeout:80];way["highway"="path"]["name"]({s},{w},{n},{e});out geom;'
    for url in MIRRORS:
        try:
            out = subprocess.run(["curl", "-s", "--max-time", "100", "-X", "POST", url,
                                  "--data-urlencode", "data=" + q],
                                 capture_output=True, timeout=110)
            data = json.loads(out.stdout.decode("utf-8"))
            return [e2 for e2 in data.get("elements", []) if e2["type"] == "way" and e2.get("geometry")]
        except Exception:  # noqa: BLE001
            continue
    return None


def way_record(w):
    g = w["geometry"]
    t = w["tags"]
    length = sum(haversine((g[i]["lat"], g[i]["lon"]), (g[i + 1]["lat"], g[i + 1]["lon"]))
                 for i in range(len(g) - 1))
    mid = g[len(g) // 2]
    return {"name": t["name"], "lat": mid["lat"], "lon": mid["lon"], "len": length,
            "surface": t.get("surface"), "sac": t.get("sac_scale"),
            "tv": t.get("trail_visibility")}


def crawl():
    raw = json.loads(RAW.read_text(encoding="utf-8")) if RAW.exists() else {}
    done = set(json.loads(DONE.read_text(encoding="utf-8"))) if DONE.exists() else set()
    all_tiles = tiles()
    todo = [t for t in all_tiles if str(t) not in done]
    print(f"網格共 {len(all_tiles)}，已完成 {len(done)}，待抓 {len(todo)}")
    for i, bbox in enumerate(todo, 1):
        ways = None
        for attempt in range(3):
            ways = fetch_tile(bbox)
            if ways is not None:
                break
            time.sleep(12 * (attempt + 1))
        if ways is None:
            print(f"  格 {i}/{len(todo)} {bbox} 失敗，跳過")
            continue
        for w in ways:
            raw[str(w["id"])] = way_record(w)
        done.add(str(bbox))
        RAW.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
        DONE.write_text(json.dumps(sorted(done), ensure_ascii=False), encoding="utf-8")
        if ways:
            print(f"  格 {i}/{len(todo)} {bbox} ✓ {len(ways)} 段（累計 way {len(raw)}）")
        time.sleep(6)
    return raw


def is_trail(name, surface, sac, tv):
    if any(k in name for k in TRAIL_KW):
        return True
    if sac or tv:
        return True
    return surface in NAT_SURF


def merge(raw):
    """依名稱分組，再以鄰近(≤3km)分群，過濾真步道，合併長度。"""
    by_name = {}
    for w in raw.values():
        by_name.setdefault(w["name"], []).append(w)

    trails = []
    for name, ws in by_name.items():
        clusters = []   # 每群: {pts:[(lat,lon,len)], surface, sac, tv}
        for w in ws:
            placed = None
            for c in clusters:
                if any(haversine((w["lat"], w["lon"]), (p[0], p[1])) < 3000 for p in c["pts"]):
                    placed = c
                    break
            if placed is None:
                placed = {"pts": [], "surface": None, "sac": None, "tv": None}
                clusters.append(placed)
            placed["pts"].append((w["lat"], w["lon"], w["len"]))
            placed["surface"] = placed["surface"] or w["surface"]
            placed["sac"] = placed["sac"] or w["sac"]
            placed["tv"] = placed["tv"] or w["tv"]
        for c in clusters:
            if not is_trail(name, c["surface"], c["sac"], c["tv"]):
                continue
            tot = sum(p[2] for p in c["pts"])
            lat = sum(p[0] for p in c["pts"]) / len(c["pts"])
            lon = sum(p[1] for p in c["pts"]) / len(c["pts"])
            trails.append({
                "name": name, "lat": round(lat, 6), "lon": round(lon, 6),
                "length_km": round(tot / 1000, 2),
                "surface": SURF_ZH.get(c["surface"], c["surface"]),
                "sac": c["sac"],
            })
    return trails


def main():
    raw = crawl()
    trails = merge(raw)
    OUT.write_text(json.dumps(trails, ensure_ascii=False, indent=1), encoding="utf-8")
    withsurf = sum(1 for t in trails if t["surface"])
    withsac = sum(1 for t in trails if t["sac"])
    print(f"\n合併過濾後步道 {len(trails)} 條；有路面 {withsurf}，有 sac 難度 {withsac}")
    print(f"寫入 {OUT}")


if __name__ == "__main__":
    main()
