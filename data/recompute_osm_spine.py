#!/usr/bin/env python3
"""重算 OSM 步道長度為「主線長度」（最長連續路徑），取代原本「所有路段加總」造成的偏長。

離線執行：只讀 data/trails.json 內既有幾何，不需網路。
主線長度 = 該步道路網圖的「直徑」（最長最短路徑），用雙次 Dijkstra 估計（對樹狀路網精確）。
長度改變後，依 build_data 相同規則重算 難度／難度標籤／親子友善（爬升沿用既有估值）。
用法：python3 data/recompute_osm_spine.py
"""
import json
import math
import heapq
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import io
import contextlib
_buf = io.StringIO()
with contextlib.redirect_stdout(_buf):
    import build_data as B   # 借用 grade_by_length / grade_by_ascent / is_family_friendly / DIFF_LABEL

HERE = Path(__file__).parent
TRAILS = HERE / "trails.json"


def hav(a, b):
    R = 6371000.0
    r = math.radians
    la1, lo1, la2, lo2 = r(a[0]), r(a[1]), r(b[0]), r(b[1])
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def node_key(p):
    return (round(p[0], 6), round(p[1], 6))   # 相同 OSM 節點座標一致 → 自然接起相鄰路段


def build_graph(geom):
    adj = {}
    def add(u, v, w):
        adj.setdefault(u, []).append((v, w))
        adj.setdefault(v, []).append((u, w))
    for line in geom:
        for i in range(len(line) - 1):
            a, b = line[i], line[i + 1]
            u, v = node_key(a), node_key(b)
            if u == v:
                continue
            add(u, v, hav(a, b))
    return adj


def dijkstra_far(adj, src):
    dist = {src: 0.0}
    pq = [(0.0, src)]
    far, fard = src, 0.0
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist.get(u, 1e18):
            continue
        if d > fard:
            far, fard = u, d
        for v, w in adj.get(u, ()):  # noqa
            nd = d + w
            if nd < dist.get(v, 1e18):
                dist[v] = nd
                heapq.heappush(pq, (nd, v))
    return far, fard


def main_spine_km(geom):
    if not geom:
        return None
    adj = build_graph(geom)
    if not adj:
        return None
    # 起點取最大連通分量中的任一節點：先從任意點找最遠 A，再從 A 找最遠 B → 直徑
    start = next(iter(adj))
    a, _ = dijkstra_far(adj, start)
    _, diam = dijkstra_far(adj, a)
    return round(diam / 1000, 2) if diam > 0 else None


def main():
    trails = json.loads(TRAILS.read_text(encoding="utf-8"))
    changed = 0
    grew = shrank = 0
    deltas = []
    for t in trails:
        if t.get("source") != "osm" or not t.get("geometry"):
            continue
        new_len = main_spine_km(t["geometry"])
        if new_len is None or new_len <= 0.05:
            continue
        old_len = t.get("length_km")
        asc = t.get("ascent")
        # 依 build_data 相同規則重算
        diff = None
        if new_len or asc:
            diff = max(B.grade_by_length(new_len) or 1, B.grade_by_ascent(asc) or 1)
        label = B.DIFF_LABEL.get(diff, "未分級")
        if diff:
            label += "(估)"
        t["length_km"] = new_len
        t["difficulty"] = diff
        t["difficulty_estimated"] = diff is not None
        t["difficulty_label"] = label
        t["family_friendly"] = B.is_family_friendly(diff, new_len, t.get("pave"), t.get("guide"), asc)
        changed += 1
        if old_len:
            deltas.append((old_len, new_len))
            if new_len > old_len + 0.01:
                grew += 1
            elif new_len < old_len - 0.01:
                shrank += 1
    TRAILS.write_text(json.dumps(trails, ensure_ascii=False), encoding="utf-8")
    olds = sorted(o for o, _ in deltas)
    news = sorted(n for _, n in deltas)
    print(f"OSM 重算：{changed} 條")
    if deltas:
        med_old = olds[len(olds) // 2]
        med_new = news[len(news) // 2]
        print(f"  變短 {shrank} 條、變長 {grew} 條、幾乎不變 {len(deltas) - shrank - grew} 條")
        print(f"  長度中位數：{med_old:.2f} → {med_new:.2f} km；最長 {max(olds):.1f} → {max(news):.1f} km")


if __name__ == "__main__":
    main()
