#!/usr/bin/env python3
"""OSM 步道長度補強

讀 osm_cache.json（route=hiking relation 清單），分批向 Overpass 抓幾何，
計算每條步道實際長度，寫入 osm_lengths.json（{relation_id: km}）。
可續傳：已算過的 id 會跳過。build_data.py 會讀此快取設定長度與估算分級。

用法：python3 enrich_osm.py
"""
import json
import math
import subprocess
import time
from pathlib import Path

HERE = Path(__file__).parent
CACHE = HERE / "osm_cache.json"
OUT = HERE / "osm_lengths.json"
MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
CHUNK = 40


def haversine(a, b):
    R = 6371000
    r = math.radians
    h = (math.sin(r(b[0] - a[0]) / 2) ** 2
         + math.cos(r(a[0])) * math.cos(r(b[0])) * math.sin(r(b[1] - a[1]) / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(h))


def rel_length_km(rel):
    total = 0.0
    for m in rel.get("members", []):
        g = m.get("geometry") or []
        for i in range(len(g) - 1):
            total += haversine((g[i]["lat"], g[i]["lon"]), (g[i + 1]["lat"], g[i + 1]["lon"]))
    return round(total / 1000, 2)


def fetch_chunk(ids):
    query = f"[out:json][timeout:90];relation(id:{','.join(map(str, ids))});out geom;"
    for url in MIRRORS:
        try:
            out = subprocess.run(["curl", "-s", "--max-time", "120", "-X", "POST", url,
                                  "--data-urlencode", "data=" + query],
                                 capture_output=True, timeout=130)
            data = json.loads(out.stdout.decode("utf-8"))
            rels = [e for e in data.get("elements", []) if e["type"] == "relation"]
            if rels:
                return rels
        except Exception:  # noqa: BLE001
            continue
    return None


def main():
    els = json.loads(CACHE.read_text(encoding="utf-8"))
    all_ids = [e["id"] for e in els]
    lengths = {}
    if OUT.exists():
        lengths = {int(k): v for k, v in json.loads(OUT.read_text(encoding="utf-8")).items()}
    todo = [i for i in all_ids if i not in lengths]
    print(f"總 {len(all_ids)} 條，已算 {len(lengths)}，待算 {len(todo)}")

    chunks = [todo[i:i + CHUNK] for i in range(0, len(todo), CHUNK)]
    for n, ids in enumerate(chunks, 1):
        rels = None
        for attempt in range(3):
            rels = fetch_chunk(ids)
            if rels:
                break
            print(f"  批次 {n}/{len(chunks)} 重試 {attempt + 1}（限流退避）")
            time.sleep(10 * (attempt + 1))
        if not rels:
            print(f"  批次 {n}/{len(chunks)} 失敗，略過")
            continue
        for r in rels:
            lengths[r["id"]] = rel_length_km(r)
        OUT.write_text(json.dumps(lengths, ensure_ascii=False), encoding="utf-8")  # 邊算邊存
        print(f"  批次 {n}/{len(chunks)} ✓ 累計 {len(lengths)} 條")
        time.sleep(6)  # 友善限流

    got = [v for v in lengths.values() if v and v > 0]
    print(f"完成：{len(lengths)} 條有長度，中位數 "
          f"{sorted(got)[len(got)//2]:.2f} km，最長 {max(got):.1f} km")
    print(f"寫入 {OUT}")


if __name__ == "__main__":
    main()
