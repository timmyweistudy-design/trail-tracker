"""路線幾何共用工具：距離、Douglas-Peucker 保形簡化、線段連接排序。"""
import math


def haversine(a, b):
    R = 6371000
    r = math.radians
    return 2 * R * math.asin(math.sqrt(
        math.sin(r(b[0] - a[0]) / 2) ** 2
        + math.cos(r(a[0])) * math.cos(r(b[0])) * math.sin(r(b[1] - a[1]) / 2) ** 2))


def _perp_m(p, a, b):
    """p 到線段 a-b 的垂直距離（公尺，等距投影近似）。p/a/b = [lat,lon]"""
    lat0 = math.radians((a[0] + b[0]) / 2)
    mx = 111320 * math.cos(lat0)            # 經度每度公尺
    my = 110540                             # 緯度每度公尺
    ax, ay = a[1] * mx, a[0] * my
    bx, by = b[1] * mx, b[0] * my
    px, py = p[1] * mx, p[0] * my
    dx, dy = bx - ax, by - ay
    seg2 = dx * dx + dy * dy
    if seg2 == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / seg2))
    cx, cy = ax + t * dx, ay + t * dy
    return math.hypot(px - cx, py - cy)


def douglas_peucker(points, eps_m=12):
    """保形簡化：保留偏離超過 eps_m 的轉折點，去掉直線上的冗點。"""
    if len(points) <= 2:
        return points
    dmax, idx = 0, 0
    for i in range(1, len(points) - 1):
        d = _perp_m(points[i], points[0], points[-1])
        if d > dmax:
            dmax, idx = d, i
    if dmax > eps_m:
        left = douglas_peucker(points[:idx + 1], eps_m)
        right = douglas_peucker(points[idx:], eps_m)
        return left[:-1] + right
    return [points[0], points[-1]]


def chain_ways(ways, gap_m=40):
    """把多段 way（各為點序列）依端點相接串成有序連續線。
    回傳 list[polyline]（理想是 1 條；無法相接者各自成段）。"""
    segs = [list(w) for w in ways if w and len(w) >= 2]
    if not segs:
        return []
    chains = []
    used = [False] * len(segs)
    for start in range(len(segs)):
        if used[start]:
            continue
        used[start] = True
        chain = segs[start][:]
        extended = True
        while extended:
            extended = False
            for j in range(len(segs)):
                if used[j]:
                    continue
                s = segs[j]
                # 嘗試把 s 接到 chain 尾端或前端（必要時反轉）
                if haversine(chain[-1], s[0]) <= gap_m:
                    chain += s[1:]; used[j] = True; extended = True
                elif haversine(chain[-1], s[-1]) <= gap_m:
                    chain += s[::-1][1:]; used[j] = True; extended = True
                elif haversine(chain[0], s[-1]) <= gap_m:
                    chain = s[:-1] + chain; used[j] = True; extended = True
                elif haversine(chain[0], s[0]) <= gap_m:
                    chain = s[::-1][:-1] + chain; used[j] = True; extended = True
        chains.append(chain)
    chains.sort(key=lambda c: -polyline_len(c))
    return chains


def polyline_len(pts):
    return sum(haversine(pts[i], pts[i + 1]) for i in range(len(pts) - 1))
