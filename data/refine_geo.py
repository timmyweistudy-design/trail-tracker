#!/usr/bin/env python3
"""步道幾何精煉（離線、不需網路）：
(a) 碎片自動接合：拉高接合容差(40→100→200m)、補內插、丟離群雜訊碎片。
(c) 兩版 OSM 交叉比對：把 osm_paths(way) 與 osm_routes_geom(relation) 兩份幾何依空間鄰近
    彙整成候選，取「最大連通覆蓋」較佳者。授權皆 OSM，乾淨。
(b) 官方 GPX：林業署 BasicInfo API 無幾何欄位、其 ArcGIS 亦未公開步道中心線圖層 → 不可行，
    保留 forestry 借同名 OSM 幾何的現況。

只重寫「目前碎裂(多段)或明顯過短(不到官方長度 65%)」的步道，完好的單段步道保持原樣，避免回歸。
輸出覆蓋 web/js/trails-geo.js。"""
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
GEO_JS = ROOT / "web" / "js" / "trails-geo.js"
TRAILS_JSON = HERE / "trails.json"


def hav(a, b):
    R = 6371000
    r = math.radians
    return 2 * R * math.asin(math.sqrt(
        math.sin(r(b[0] - a[0]) / 2) ** 2
        + math.cos(r(a[0])) * math.cos(r(b[0])) * math.sin(r(b[1] - a[1]) / 2) ** 2))


def plen(pts):
    return sum(hav(pts[i], pts[i + 1]) for i in range(len(pts) - 1))


def chain(segs, gap):
    """把多段依端點相接（容差 gap m），必要時反轉。回傳 list[polyline]。"""
    segs = [list(s) for s in segs if s and len(s) >= 2]
    out, used = [], [False] * len(segs)
    for i in range(len(segs)):
        if used[i]:
            continue
        used[i] = True
        c = segs[i][:]
        ext = True
        while ext:
            ext = False
            for j in range(len(segs)):
                if used[j]:
                    continue
                s = segs[j]
                if hav(c[-1], s[0]) <= gap:
                    c += s[1:]; used[j] = True; ext = True
                elif hav(c[-1], s[-1]) <= gap:
                    c += s[::-1][1:]; used[j] = True; ext = True
                elif hav(c[0], s[-1]) <= gap:
                    c = s[:-1] + c; used[j] = True; ext = True
                elif hav(c[0], s[0]) <= gap:
                    c = s[::-1][:-1] + c; used[j] = True; ext = True
        out.append(c)
    out.sort(key=lambda p: -plen(p))
    return out


def refine_chain(segs):
    """漸進接合：先 40m、剩下的再 100m、200m。回傳接好的多段（已按長度排序）。"""
    c = chain(segs, 40)
    c = chain(c, 100)
    c = chain(c, 200)
    return c


def drop_orphans(chains):
    """丟掉離主線太遠、又太短的雜訊碎片。回傳保留的段。"""
    if not chains:
        return chains
    main = chains[0]
    main_len = plen(main)
    keep = [main]
    for ch in chains[1:]:
        L = plen(ch)
        # 與主線最近距離
        dmin = min(hav(p, q) for p in (ch[0], ch[-1], ch[len(ch) // 2])
                   for q in (main[0], main[-1], main[len(main) // 2]))
        if L >= max(120, main_len * 0.10) and dmin <= 500:   # 夠長且不算太遠 → 是真支線，保留
            keep.append(ch)
    return keep


def interpolate_gaps(pts, step=60):
    """段內相鄰點間距過大處補內插點，模擬走起來平順、里程不因稀疏頂點失真。"""
    if len(pts) < 2:
        return pts
    out = [pts[0]]
    for i in range(1, len(pts)):
        a, b = pts[i - 1], pts[i]
        d = hav(a, b)
        if d > step * 2:
            n = int(d // step)
            for k in range(1, n):
                f = k / n
                out.append([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f])
        out.append(b)
    return out


def lcc_len(chains):
    """最大連通元件長度＝第一段(已排序)的長度。"""
    return plen(chains[0]) if chains else 0


# ── 空間格網：把所有 OSM line 片段丟進 ~500m 格，供每條步道就近取候選 ──
def build_grid(pieces, cell=0.005):
    grid = {}
    for idx, seg in enumerate(pieces):
        for p in seg:
            key = (int(p[0] / cell), int(p[1] / cell))
            grid.setdefault(key, set()).add(idx)
    return grid, cell


def near_pieces(pts, pieces, grid, cell):
    keys = set()
    for p in pts:
        ci, cj = int(p[0] / cell), int(p[1] / cell)
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                keys.add((ci + di, cj + dj))
    cand = set()
    for k in keys:
        cand |= grid.get(k, set())
    # 只留「真的貼近本步道」的片段（任一點距步道任一點 < 120m）
    res = []
    for idx in cand:
        seg = pieces[idx]
        if any(hav(sp, tp) < 120 for sp in (seg[0], seg[-1], seg[len(seg) // 2])
               for tp in (pts[0], pts[-1], pts[len(pts) // 2])):
            res.append(seg)
    return res


def main():
    # 讀現有 geo
    txt = GEO_JS.read_text(encoding="utf-8")
    geo = json.loads(txt[txt.index("{"):txt.rindex("}") + 1])
    trails = {t["id"]: t for t in json.loads(TRAILS_JSON.read_text(encoding="utf-8"))}

    # 收集兩份 OSM 幾何的所有 line 片段（授權乾淨，可交叉比對）
    pieces = []
    for seg in json.loads((HERE / "osm_routes_geom.json").read_text(encoding="utf-8")).values():
        pieces.extend([s for s in seg if s and len(s) >= 2])
    for row in json.loads((HERE / "osm_paths.json").read_text(encoding="utf-8")):
        pieces.extend([s for s in row.get("lines", []) if s and len(s) >= 2])
    grid, cell = build_grid(pieces)
    print(f"[cross] OSM 片段庫 {len(pieces)} 段，格網 {len(grid)} 格")

    # 執行期 chainSegments 會就近把「主線的最大連通元件」走完（含岔路折返），
    # 所以這裡不預接合成單線（預接合會把來回路徑併成雙倍長度、反而害執行期）。
    # 只做執行期做不到的三件事：離群雜訊丟棄、段內內插平滑、過短步道交叉補幾何。
    def orphan_filter(segs):
        """丟掉離主段太遠又太短的雜訊小段（執行期雖也會丟，但先清掉可讓長度統計乾淨）。"""
        segs = [s for s in segs if s and len(s) >= 2]
        if len(segs) <= 1:
            return segs
        segs.sort(key=lambda s: -plen(s))
        main = segs[0]; main_len = plen(main)
        keep = [main]
        for s in segs[1:]:
            L = plen(s)
            dmin = min(hav(p, q) for p in (s[0], s[-1]) for q in (main[0], main[-1], main[len(main) // 2]))
            if L >= max(80, main_len * 0.05) or dmin <= 60:   # 夠長、或就在主線旁(真交會) → 留
                keep.append(s)
        return keep

    # 只「提出候選」，不直接落地：對「有官方長度、且明顯過短」的步道，用兩份 OSM 片段就近彙整成候選段。
    # 實際採不採用交給 apply_geo.js 用執行期 chainSegments 逐條驗證（Python 的接合演算法與執行期不同，
    # 不能拿來當驗收關卡）。不做段內內插（共線加點只讓檔案暴增、路徑不變）。
    candidates = {}
    for tid, segs in list(geo.items()):
        if not segs:
            continue
        official = (trails.get(tid) or {}).get("length_km")
        official_m = official * 1000 if official else 0
        if not official_m:
            continue
        cur = [list(s) for s in segs]
        if lcc_len(refine_chain(cur)) >= official_m * 0.65:   # 覆蓋已足夠 → 不動
            continue
        add = near_pieces([p for s in cur for p in s], pieces, grid, cell)
        if add:
            candidates[tid] = cur + [list(s) for s in add]

    (HERE / "geo_candidates.json").write_text(json.dumps(candidates, ensure_ascii=False), encoding="utf-8")
    print(f"[refine] 產生 {len(candidates)} 條過短步道的補幾何候選 → geo_candidates.json（交由 apply_geo.js 用執行期演算法驗收）")
    return



if __name__ == "__main__":
    main()
