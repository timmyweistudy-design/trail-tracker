#!/usr/bin/env python3
"""沿線地標：對每條有幾何的步道，向 Overpass 查附近的真實 OSM 地標節點（三角點/山頭/駐在所遺址/
吊橋/觀景/水源/鞍部/山屋），過濾「離步道夠近＝真的在線上」，投影算「距起點里程」，寫進 trails.json 的
waypoints 欄位（依里程排序）。資料全部取自 OSM（真實、具名），不自行編造。

用法：python3 data/enrich_waypoints.py [最短長度km，預設 1.5]
Overpass 回應快取在 scratchpad（可續跑）。之後用 apply-detail-fields.mjs 橋接進 web 詳情檔。
"""
import json, math, sys, time, urllib.request, urllib.parse
from pathlib import Path

HERE = Path(__file__).parent
TRAILS = HERE / "trails.json"
CACHE = Path("/tmp/claude-1000/-mnt-c-Users-timmy/a121fff7-158b-4353-86a8-634bb159139f/scratchpad/wpcache")
CACHE.mkdir(parents=True, exist_ok=True)
OVERPASS = "https://overpass-api.de/api/interpreter"
MIN_KM = float(sys.argv[1]) if len(sys.argv) > 1 else 1.5

# 每類的：離步道最大容許距離(公尺) 與 顯示類型。峰/三角點允許在支稜上(較遠)，遺址/吊橋等必須在線上。
NEAR_ONTRAIL = 70
NEAR_SPUR = 160
CAP = 40                                                        # 每條步道地標上限（避免高稜線抓到一大堆山頭而洗版）


def hav(a, b):
    R = 6371000.0
    r = math.radians
    la1, lo1, la2, lo2 = r(a[0]), r(a[1]), r(b[0]), r(b[1])
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def seg_dist(p, a, b):
    latref = math.radians(a[0])
    c = 6371000.0
    mx = lambda lon: math.radians(lon) * c * math.cos(latref)
    my = lambda lat: math.radians(lat) * c
    px, py = mx(p[1]), my(p[0])
    ax, ay = mx(a[1]), my(a[0])
    bx, by = mx(b[1]), my(b[0])
    dx, dy = bx - ax, by - ay
    l2 = dx * dx + dy * dy
    t = 0.0 if l2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / l2))
    cx, cy = ax + t * dx, ay + t * dy
    return math.hypot(px - cx, py - cy), t


def project(pt, line):
    """回傳 (最短距離m, 距line起點里程m)。"""
    best_d, best_along, cum = 1e18, 0.0, 0.0
    for i in range(1, len(line)):
        a, b = line[i - 1], line[i]
        d, t = seg_dist(pt, a, b)
        seglen = hav(a, b)
        if d < best_d:
            best_d, best_along = d, cum + t * seglen
        cum += seglen
    return best_d, best_along


def _ele(tg):
    """把 OSM 的 ele 標籤安全轉成整數公尺；遇到 '325－－'、範圍、單位等雜訊回 None。"""
    v = tg.get("ele")
    if v is None:
        return None
    import re
    m = re.match(r"\s*(-?\d+(?:\.\d+)?)", str(v))
    return round(float(m.group(1))) if m else None


def classify(tg):
    """回傳 (type, label) 或 None（不收）。type 供前端選圖示。"""
    name = (tg.get("name") or tg.get("name:zh") or "").strip()
    if tg.get("man_made") in ("survey_point", "triangulation_pillar", "survey pillar"):
        e = _ele(tg)
        lbl = name or ("三角點" + (" " + str(e) + "m" if e is not None else ""))
        return ("survey", lbl)                                   # 三角點：即使名字是編號也收
    if tg.get("natural") == "peak":
        if not name:
            return None
        return ("peak", name)                                    # 山頭
    if tg.get("historic"):
        if not name:
            return None
        return ("ruins", name)                                   # 駐在所/木炭窯/碉堡/紀念碑…
    if tg.get("tourism") in ("viewpoint", "attraction"):
        if not name:
            return None
        return ("view", name)                                    # 觀景/景點
    if tg.get("natural") == "spring" or tg.get("amenity") == "drinking_water":
        return ("water", name or "水源")                          # 水源
    if tg.get("amenity") == "shelter" or tg.get("tourism") == "wilderness_hut" or tg.get("building") == "hut":
        if not name:
            return None
        return ("hut", name)                                     # 山屋/避難
    if tg.get("natural") == "saddle" or tg.get("mountain_pass") == "yes":
        if not name:
            return None
        return ("saddle", name)                                  # 鞍部/埡口
    return None


def overpass(bbox, key):
    fp = CACHE / (key + ".json")
    if fp.exists():
        try:
            return json.loads(fp.read_text(encoding="utf-8"))
        except Exception:
            pass
    s, w, n, e = bbox
    b = f"{s},{w},{n},{e}"
    q = ("[out:json][timeout:180];("
         f'node["natural"="peak"]({b});'
         f'node["man_made"~"survey_point|triangulation_pillar"]({b});'
         f'node["historic"]({b});'
         f'way["historic"]({b});'
         f'node["tourism"~"viewpoint|attraction"]({b});'
         f'node["natural"="spring"]({b});node["amenity"="drinking_water"]({b});'
         f'node["natural"="saddle"]({b});node["mountain_pass"="yes"]({b});'
         f'node["amenity"="shelter"]({b});node["tourism"="wilderness_hut"]({b});'
         f'way["bridge"]["name"]({b});'
         ");out center tags;")
    for attempt in range(3):
        try:
            data = urllib.parse.urlencode({"data": q}).encode()
            req = urllib.request.Request(OVERPASS, data=data, headers={"User-Agent": "trail-tracker/1.0"})
            raw = urllib.request.urlopen(req, timeout=210).read()
            j = json.loads(raw)
            fp.write_text(json.dumps(j, ensure_ascii=False), encoding="utf-8")
            time.sleep(1.1)                                       # 禮貌限速
            return j
        except Exception as ex:
            time.sleep(3 + attempt * 3)
    return {"elements": []}


def parse_candidates(j):
    """把一區的 Overpass 回應解析成候選地標清單（跨該區所有步道共用）。"""
    cands = []
    for el in j.get("elements", []):
        tg = el.get("tags", {})
        if el["type"] == "node":
            lat, lon = el.get("lat"), el.get("lon")
        else:
            c = el.get("center") or {}
            lat, lon = c.get("lat"), c.get("lon")
        if lat is None or lon is None:
            continue
        if "bridge" in tg and el["type"] == "way":
            nm = tg.get("name") or ""
            if "橋" not in nm:                                    # 名字要含「橋」（步道本身之後指派時再排除）
                continue
            cat, label = "bridge", nm
        else:
            r = classify(tg)
            if not r:
                continue
            cat, label = r
        cands.append({"lat": lat, "lon": lon, "cat": cat, "label": label[:40], "ele": _ele(tg)})
    return cands


def assign(t, cands):
    """把候選地標指派給某條步道：先用 bbox 粗篩、再算到步道折線的最短距離。"""
    members = [m for m in (t.get("geometry") or []) if len(m) >= 2]
    if not members:
        return []
    ref = max(members, key=len)
    pts = [p for m in members for p in m]
    la = [p[0] for p in pts]; lo = [p[1] for p in pts]
    smin, wmin, nmax, emax = min(la), min(lo), max(la), max(lo)
    tname = t.get("name", "")
    out = {}
    for cd in cands:
        lat, lon = cd["lat"], cd["lon"]
        if not (smin - 0.004 <= lat <= nmax + 0.004 and wmin - 0.004 <= lon <= emax + 0.004):
            continue
        if cd["cat"] == "bridge" and cd["label"] == tname:
            continue
        dmin = min(project((lat, lon), m)[0] for m in members)
        limit = NEAR_SPUR if cd["cat"] in ("peak", "survey") else NEAR_ONTRAIL
        if dmin > limit:
            continue
        _, along = project((lat, lon), ref)
        key = (round(lat, 5), round(lon, 5))
        if key in out:
            continue
        w = {"name": cd["label"], "type": cd["cat"], "lat": round(lat, 6), "lon": round(lon, 6), "distM": round(along)}
        if cd["ele"] is not None:
            w["ele"] = cd["ele"]
        out[key] = w
    wps = sorted(out.values(), key=lambda w: w["distM"])
    if len(wps) > CAP:                                          # 超上限：地標型(駐在所/吊橋/山屋/水源/觀景/鞍部)全留，峰/三角點依里程均勻間引
        keep = [w for w in wps if w["type"] not in ("peak", "survey")]
        rest = [w for w in wps if w["type"] in ("peak", "survey")]
        slots = max(0, CAP - len(keep))
        if slots and rest:
            step = len(rest) / slots
            keep += [rest[min(len(rest) - 1, int(i * step))] for i in range(slots)]
        wps = sorted(keep, key=lambda w: w["distM"])
    return wps


def main():
    from collections import defaultdict
    trails = json.loads(TRAILS.read_text(encoding="utf-8"))
    todo = [t for t in trails if t.get("geometry") and (t.get("length_km") or 0) >= MIN_KM]
    groups = defaultdict(list)
    for t in todo:
        groups[t.get("region") or "?"].append(t)
    print(f"符合(≥{MIN_KM}km) {len(todo)} 條、{len(groups)} 個地區，逐區查 Overpass…")
    have = tot = 0
    for ri, (region, ts) in enumerate(sorted(groups.items()), 1):
        pts = [p for t in ts for m in (t.get("geometry") or []) for p in m]
        if not pts:
            continue
        la = [p[0] for p in pts]; lo = [p[1] for p in pts]
        bbox = (min(la) - 0.01, min(lo) - 0.01, max(la) + 0.01, max(lo) + 0.01)
        j = overpass(bbox, "region_" + str(region))
        cands = parse_candidates(j)
        rh = rt = 0
        for t in ts:
            wps = assign(t, cands)
            if wps:
                t["waypoints"] = wps; have += 1; tot += len(wps); rh += 1; rt += len(wps)
            elif "waypoints" in t:
                del t["waypoints"]
        print(f"  [{ri}/{len(groups)}] {region}：{len(ts)} 條、候選 {len(cands)} → {rh} 條有地標／{rt} 個")
    TRAILS.write_text(json.dumps(trails, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"完成：{have} 條步道有地標、共 {tot} 個（平均 {tot/max(have,1):.1f}/條）")


if __name__ == "__main__":
    main()
