#!/usr/bin/env python3
"""route=hiking 關係幾何爬蟲

route=hiking 關係（osm 來源 ~727 條）原本只抓中心點、沒有路線。
本程式抓各關係的成員 way 幾何，連接成有序路線、保形簡化，
輸出 {relation_id: lines}（osm_routes_geom.json），build_data 依 relation id 對應。

特性：區域分塊、多鏡像、remark 偵測重試、續傳。
用法：python3 crawl_routes.py
"""
import json
import subprocess
import time
from pathlib import Path

from geomutil import douglas_peucker, chain_ways, polyline_len

HERE = Path(__file__).parent
OUT = HERE / "osm_routes_geom.json"
DONE = HERE / "osm_routes_tiles.json"
MIRRORS = [
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]


def tiles():
    """較大的區域 bbox（關係數量少，可用大塊）。"""
    out = []
    lat = 21.8
    while lat < 25.4:
        lon = 119.9
        while lon < 122.1:
            out.append((round(lat, 2), round(lon, 2), round(lat + 0.8, 2), round(lon + 0.8, 2)))
            lon += 0.8
        lat += 0.8
    out += [(23.2, 119.3, 23.8, 119.9), (24.3, 118.1, 24.6, 118.5), (26.0, 119.8, 26.4, 120.6)]
    return out


def fetch_tile(bbox):
    s, w, n, e = bbox
    q = (f'[out:json][timeout:120];relation["route"="hiking"]["name"]({s},{w},{n},{e});out geom;')
    for url in MIRRORS:
        try:
            out = subprocess.run(["curl", "-s", "--max-time", "140", "-X", "POST", url,
                                  "--data-urlencode", "data=" + q],
                                 capture_output=True, timeout=150)
            data = json.loads(out.stdout.decode("utf-8"))
            if data.get("remark"):
                continue
            return [e2 for e2 in data.get("elements", []) if e2["type"] == "relation"]
        except Exception:  # noqa: BLE001
            continue
    return None


def assemble(rel):
    """關係成員 way 幾何 → 連接 + 簡化。"""
    ways = []
    for m in rel.get("members", []):
        g = m.get("geometry")
        if m.get("type") == "way" and g and len(g) >= 2:
            ways.append([[round(p["lat"], 6), round(p["lon"], 6)] for p in g])
    if not ways:
        return None
    chains = [douglas_peucker(ch, 12) for ch in chain_ways(ways) if len(ch) >= 2]
    return chains or None


def main():
    geom = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    done = set(json.loads(DONE.read_text(encoding="utf-8"))) if DONE.exists() else set()
    all_tiles = tiles()
    todo = [t for t in all_tiles if str(t) not in done]
    print(f"關係網格 {len(all_tiles)}，已完成 {len(done)}，待抓 {len(todo)}")
    for i, bbox in enumerate(todo, 1):
        rels = None
        for attempt in range(3):
            rels = fetch_tile(bbox)
            if rels is not None:
                break
            time.sleep(12 * (attempt + 1))
        if rels is None:
            print(f"  格 {i}/{len(todo)} 失敗，跳過")
            continue
        for r in rels:
            ch = assemble(r)
            if ch:
                geom[str(r["id"])] = ch
        done.add(str(bbox))
        OUT.write_text(json.dumps(geom, ensure_ascii=False), encoding="utf-8")
        DONE.write_text(json.dumps(sorted(done), ensure_ascii=False), encoding="utf-8")
        print(f"  格 {i}/{len(todo)} ✓ {len(rels)} 關係（累計 {len(geom)} 條有幾何）")
        time.sleep(6)
    print(f"\n完成：{len(geom)} 條關係有路線幾何 → {OUT}")


if __name__ == "__main__":
    main()
