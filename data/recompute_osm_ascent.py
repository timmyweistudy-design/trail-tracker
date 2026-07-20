#!/usr/bin/env python3
"""重算 OSM 步道的「累積爬升」：沿主脊（最長連續路徑）每 ~30 m 取樣，用 terrarium DEM 圖磚
雙線性內插取高度，再以 median3+平滑+2 m 遲滯門檻累積——與 App 記錄校正同一套方法，數字一致。
取代原本 enrich_elevation.py 只沿「最長單一路段」取 12 點造成的系統性低估；並改用主脊（與長度同一條線）。

前置：先跑 data/recompute_osm_spine.py（長度＝主脊）。用法：python3 data/recompute_osm_ascent.py
圖磚快取在 scratchpad（不進版控）。難度依新長度＋新爬升連動重算（皆標估）。
"""
import json, math, heapq, sys, os, io, contextlib, urllib.request
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
with contextlib.redirect_stdout(io.StringIO()):
    import build_data as B   # grade_by_length / grade_by_ascent / is_family_friendly / DIFF_LABEL

HERE = Path(__file__).parent
TRAILS = HERE / "trails.json"
Z = 14
TILEURL = "https://elevation-tiles-prod.s3.amazonaws.com/terrarium"
CACHE = Path(os.environ.get("DEM_CACHE", "/tmp/claude-1000/-mnt-c-Users-timmy/a121fff7-158b-4353-86a8-634bb159139f/scratchpad/demcache"))
CACHE.mkdir(parents=True, exist_ok=True)


def hav(a, b):
    R = 6371000.0
    r = math.radians
    la1, lo1, la2, lo2 = r(a[0]), r(a[1]), r(b[0]), r(b[1])
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def node_key(p):
    return (round(p[0], 6), round(p[1], 6))


def build_graph(geom):
    adj, coord = {}, {}
    def add(u, v, w):
        adj.setdefault(u, []).append((v, w))
        adj.setdefault(v, []).append((u, w))
    for line in geom:
        for i in range(len(line) - 1):
            a, b = line[i], line[i + 1]
            u, v = node_key(a), node_key(b)
            coord.setdefault(u, (a[0], a[1]))
            coord.setdefault(v, (b[0], b[1]))
            if u == v:
                continue
            add(u, v, hav(a, b))
    return adj, coord


def dijkstra(adj, src):
    dist = {src: 0.0}
    prev = {}
    pq = [(0.0, src)]
    far, fard = src, 0.0
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist.get(u, 1e18):
            continue
        if d > fard:
            far, fard = u, d
        for v, w in adj.get(u, ()):
            nd = d + w
            if nd < dist.get(v, 1e18):
                dist[v] = nd
                prev[v] = u
                heapq.heappush(pq, (nd, v))
    return far, fard, prev


def spine_path(geom):
    adj, coord = build_graph(geom)
    if not adj:
        return None
    a, _, _ = dijkstra(adj, next(iter(adj)))          # 任一點→最遠 A
    b, diam, prev = dijkstra(adj, a)                    # A→最遠 B（＝直徑），記前驅
    if diam <= 0:
        return None
    path, cur = [], b
    while cur is not None:
        path.append(coord[cur])
        cur = prev.get(cur)
    path.reverse()
    return path


def densify(path, step=30.0):
    if not path or len(path) < 2:
        return path
    out = [path[0]]
    for i in range(1, len(path)):
        a, b = path[i - 1], path[i]
        segd = hav(a, b)
        if segd <= 0:
            continue
        n = max(1, int(segd // step))
        for k in range(1, n + 1):
            f = k / n
            out.append((a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f))
    return out


def latlon_tile(lat, lon):
    n = 2 ** Z
    la = math.radians(lat)
    return ((lon + 180) / 360 * n, (1 - math.log(math.tan(la) + 1 / math.cos(la)) / math.pi) / 2 * n)


_tiles = {}
def get_tile(tx, ty):
    k = (tx, ty)
    if k in _tiles:
        return _tiles[k]
    fp = CACHE / f"{tx}_{ty}.png"
    if not fp.exists():
        try:
            req = urllib.request.Request(f"{TILEURL}/{Z}/{tx}/{ty}.png", headers={"User-Agent": "trail-tracker/1.0"})
            fp.write_bytes(urllib.request.urlopen(req, timeout=30).read())
        except Exception:
            _tiles[k] = None
            return None
    try:
        im = Image.open(fp).convert("RGB")
        w, h = im.size
        e = [(r * 256 + g + bb / 256) - 32768 for (r, g, bb) in im.getdata()]
        t = {"e": e, "w": w, "h": h}
    except Exception:
        t = None
    _tiles[k] = t
    return t


def bilin(t, fpx, fpy):
    w, h, e = t["w"], t["h"], t["e"]
    x0 = max(0, min(w - 1, int(math.floor(fpx))))
    y0 = max(0, min(h - 1, int(math.floor(fpy))))
    x1 = min(w - 1, x0 + 1)
    y1 = min(h - 1, y0 + 1)
    dx, dy = fpx - x0, fpy - y0
    a, b, c, d = e[y0 * w + x0], e[y0 * w + x1], e[y1 * w + x0], e[y1 * w + x1]
    top = a + (b - a) * dx
    bot = c + (d - c) * dx
    return top + (bot - top) * dy


def elev_at(lat, lon):
    x, y = latlon_tile(lat, lon)
    tx, ty = int(x), int(y)
    t = get_tile(tx, ty)
    if not t:
        return None
    return bilin(t, (x - tx) * 256, (y - ty) * 256)


def ascent_descent(elevs):
    v = [e for e in elevs if e is not None]
    if len(v) < 2:
        return None
    med3 = lambda a, b, c: max(min(a, b), min(max(a, b), c))
    s = [med3(v[i - 1], v[i], v[i + 1]) if 0 < i < len(v) - 1 else v[i] for i in range(len(v))]
    s = [(s[i - 1] + s[i] + s[i + 1]) / 3 if 0 < i < len(s) - 1 else s[i] for i in range(len(s))]
    asc = desc = 0.0
    ref = hi = lo = s[0]
    DB = 2   # 與 App elevation.js recompute 同門檻
    for e in s:
        hi = max(hi, e)
        lo = min(lo, e)
        dz = e - ref
        if abs(dz) >= DB:
            if dz > 0:
                asc += dz
            else:
                desc += -dz
            ref = e
    return round(asc), round(desc), round(hi), round(lo)


def main():
    trails = json.loads(TRAILS.read_text(encoding="utf-8"))
    todo = [t for t in trails if t.get("source") == "osm" and t.get("geometry")]
    print(f"OSM 有幾何 {len(todo)} 條，開始重算爬升…")
    changed = 0
    deltas = []
    for n, t in enumerate(todo, 1):
        path = spine_path(t["geometry"])
        if not path or len(path) < 2:
            continue
        dens = densify(path, 30)
        if len(dens) > 1500:                      # 超長路線降密度，避免圖磚查太多
            dens = dens[:: (len(dens) // 1500) + 1]
        elevs = [elev_at(la, lo) for (la, lo) in dens]
        r = ascent_descent(elevs)
        if not r:
            continue
        asc, desc, hi, lo = r
        # 步道是雙向的 → 「累積爬升」取登坡方向＝max(上升,下降)，與行走方向無關（避免 A→B 剛好是下坡就低估）
        climb = max(asc, desc)
        old = t.get("ascent")
        t["ascent"] = climb
        t["alt_high"] = hi
        t["alt_low"] = lo
        new_len = t.get("length_km")
        diff = max(B.grade_by_length(new_len) or 1, B.grade_by_ascent(climb) or 1)
        t["difficulty"] = diff
        t["difficulty_estimated"] = True
        t["difficulty_label"] = B.DIFF_LABEL.get(diff, "未分級") + "(估)"
        t["family_friendly"] = B.is_family_friendly(diff, new_len, t.get("pave"), t.get("guide"), climb)
        changed += 1
        if old is not None:
            deltas.append((old, climb))
        if n % 100 == 0:
            print(f"  …{n}/{len(todo)}（圖磚快取 {len(_tiles)}）")
    TRAILS.write_text(json.dumps(trails, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"OSM 爬升重算：{changed} 條")
    if deltas:
        olds = sorted(o for o, _ in deltas)
        news = sorted(n for _, n in deltas)
        up = sum(1 for o, n in deltas if n > o + 1)
        dn = sum(1 for o, n in deltas if n < o - 1)
        print(f"  變高 {up}、變低 {dn}、幾乎不變 {len(deltas) - up - dn}")
        print(f"  ascent 中位數：{olds[len(olds) // 2]} → {news[len(news) // 2]} m；最大 {max(olds)} → {max(news)}")


if __name__ == "__main__":
    main()
