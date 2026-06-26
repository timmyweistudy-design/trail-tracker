#!/usr/bin/env python3
"""沿步道路線取樣海拔，計算真實累積爬升（供 OSM 步道分級精準化）。

讀 trails.json（含 geometry），對 osm / osm_path 步道沿最長路線段取樣 ~12 點，
批次向 Open-Meteo elevation API（免金鑰，一次最多 100 點）查海拔，計算累積爬升，
輸出 osm_ascent.json（{trail_id: ascent_m}）。build_data 用它精修難度。

可續傳。用法：python3 enrich_elevation.py
"""
import json
import math
import subprocess
import time
from pathlib import Path

HERE = Path(__file__).parent
TRAILS = HERE / "trails.json"
OUT = HERE / "osm_ascent.json"
SAMPLES = 12
BATCH_PTS = 100      # OpenTopoData 每次最多 100 點


def hav(a, b):
    R = 6371000
    r = math.radians
    return 2 * R * math.asin(math.sqrt(math.sin(r(b[0] - a[0]) / 2) ** 2
        + math.cos(r(a[0])) * math.cos(r(b[0])) * math.sin(r(b[1] - a[1]) / 2) ** 2))


def sample_pts(geometry, n=SAMPLES):
    main = max(geometry, key=len)
    if len(main) <= n:
        return main
    d = [0]
    for i in range(1, len(main)):
        d.append(d[-1] + hav(main[i - 1], main[i]))
    total = d[-1] or 1
    out = []
    for k in range(n):
        target = total * k / (n - 1)
        i = 1
        while i < len(d) - 1 and d[i] < target:
            i += 1
        out.append(main[i])
    return out


class RateLimited(Exception):
    pass


def fetch_elevations(points):
    # OpenTopoData：每秒 1 次、每次最多 100 點、每日 1000 次
    locs = "|".join(f"{p[0]:.5f},{p[1]:.5f}" for p in points)
    url = f"https://api.opentopodata.org/v1/srtm30m?locations={locs}"
    out = subprocess.run(["curl", "-s", "--max-time", "40", url], capture_output=True, timeout=45)
    data = json.loads(out.stdout.decode("utf-8"))
    if data.get("status") == "error":
        msg = data.get("error") or ""
        if "day" in msg.lower() or "limit" in msg.lower():
            raise RateLimited(msg)
        return []
    return [r.get("elevation") for r in data.get("results", [])]


def ascent_of(elev):
    g = 0
    for i in range(1, len(elev)):
        if elev[i] is not None and elev[i - 1] is not None and elev[i] > elev[i - 1]:
            g += elev[i] - elev[i - 1]
    return round(g)


def main():
    trails = json.loads(TRAILS.read_text(encoding="utf-8"))
    todo = [t for t in trails if t["source"] in ("osm", "osm_path") and t.get("geometry")]
    done = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    todo = [t for t in todo if t["id"] not in done]
    print(f"待補海拔 {len(todo)} 條（已完成 {len(done)}）")

    buf = []   # [(trail_id, n_points)]
    pts = []
    processed = 0

    def flush():
        nonlocal buf, pts, processed
        if not pts:
            return
        elev = None
        for attempt in range(3):
            try:
                elev = fetch_elevations(pts)
                if len(elev) >= len(pts):
                    break
            except RateLimited as e:
                OUT.write_text(json.dumps(done, ensure_ascii=False), encoding="utf-8")
                print(f"\n達 Open-Meteo 每小時上限（{e}）。已保存 {len(done)} 條，稍後再執行可續傳。")
                raise SystemExit(0)
            except Exception:  # noqa: BLE001
                pass
            time.sleep(5 * (attempt + 1))
        if not elev or len(elev) < len(pts):
            buf, pts = [], []
            return
        idx = 0
        for tid, npt in buf:
            done[tid] = ascent_of(elev[idx:idx + npt])
            idx += npt
        processed += len(buf)
        buf, pts = [], []
        OUT.write_text(json.dumps(done, ensure_ascii=False), encoding="utf-8")
        time.sleep(1.2)   # OpenTopoData 每秒 1 次

    for t in todo:
        sp = sample_pts(t["geometry"])
        if len(pts) + len(sp) > BATCH_PTS:
            flush()
            print(f"  已處理 {processed}/{len(todo)}")
        buf.append((t["id"], len(sp)))
        pts += sp
    flush()
    vals = [v for v in done.values() if v]
    print(f"完成：{len(done)} 條有爬升，中位數 {sorted(vals)[len(vals)//2] if vals else 0} m，最大 {max(vals) if vals else 0} m")


if __name__ == "__main__":
    main()
