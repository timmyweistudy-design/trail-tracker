#!/usr/bin/env python3
"""全台具名步道 way 爬蟲（OSM highway=path/footway/steps/track/bridleway）

route=hiking 關係只涵蓋部分步道；許多步道是獨立的具名 way。
早期只抓 `highway=path`，漏掉大量標成 footway（鋪面步道、親山步道）、steps（石階步道）、
track（林道）的真步道——例如陽明山「橫嶺古道」就是 footway，整條被跳過。
本程式以網格分塊抓取，依名稱＋鄰近合併成步道，過濾掉市區巷弄與非步道
（只留真步道），計算長度、路面、難度線索，輸出 osm_paths.json。

抓取條件：
  - highway=path：不限名稱（path 本身就是山徑語意，沿用舊行為以免漏掉）
  - footway/steps/track/bridleway：名稱須含步道關鍵字（否則會撈進整個城市的人行道）

特性：分塊、多鏡像、退避重試、續傳（已抓的格子會跳過）。
用法：
  python3 crawl_paths.py                       # 全台
  python3 crawl_paths.py --bbox 25.0,121.5,25.4,121.9 --tag ymstest   # 單格測試（另存檔案）
"""
import json
import math
import re
import subprocess
import sys
import time
from pathlib import Path

from geomutil import haversine as _hav, douglas_peucker, chain_ways, polyline_len

HERE = Path(__file__).parent
# v2 = 放寬 highway 類型後的抓取；換檔名等於讓所有格子重抓一次（舊 v1 清單不能沿用）
RAW = HERE / "osm_paths_raw.json"        # {way_id: {name,lat,lon,len,surface,sac,tv,hw,...}}
DONE = HERE / "osm_paths_tiles_v2.json"  # 已完成的格子
OUT = HERE / "osm_paths.json"            # 合併過濾後的步道清單

MIRRORS = [
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.osm.ch/api/interpreter",
]

TRAIL_KW = ("步道", "古道", "山徑", "登山", "親山", "步徑", "林道", "越嶺",
            "棧道", "步階", "環山", "健行", "山道", "步行", "自然步", "生態步", "縱走")
# 名稱雖無「步道」字樣但明確是一條路線的（台灣郊山常見命名：黃金十四稜、五指山系縱走、
# 石硿子O型路線、砲台山保線路…）。舊版只看 surface 是否自然，這些沒有 surface 標籤的名路線
# 整批被漏掉（實測單格就漏 35 條以上，含 9.4km 的三方向山路線）。
ROUTE_RE = re.compile(r"路線|路徑|稜|縱走|保線|山腰|O型|O形|環狀|[徑階]|線$|道$|路$")
# 給 Overpass 用的名稱關鍵字（footway/steps/track/bridleway 需符合，否則整城人行道都會進來）
KW_RE = "|".join(TRAIL_KW)
# path 沿用舊行為（不限名稱）；其餘類型限具步道關鍵字之名稱
EXTRA_HW = "footway|steps|track|bridleway"
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
    box = f"{s},{w},{n},{e}"
    q = ('[out:json][timeout:180];('
         f'way["highway"="path"]["name"]({box});'
         f'way["highway"~"^({EXTRA_HW})$"]["name"~"{KW_RE}"]({box});'
         ');out geom;')
    for url in MIRRORS:
        try:
            out = subprocess.run(["curl", "-s", "--max-time", "200", "-X", "POST", url,
                                  "--data-urlencode", "data=" + q],
                                 capture_output=True, timeout=210)
            data = json.loads(out.stdout.decode("utf-8"))
            # Overpass 伺服器端逾時/錯誤會回 200＋空 elements＋remark → 換下一個鏡像重抓
            if data.get("remark"):
                continue
            return [e2 for e2 in data.get("elements", []) if e2["type"] == "way" and e2.get("geometry")]
        except Exception:  # noqa: BLE001
            continue
    return None


def norm_name(s):
    """名稱正規化：OSM 有人用空白排版（「蜜  蜂  巢  古  道」），不正規化會被當成另一條步道。"""
    return re.sub(r"[\s　]+", "", s or "")


def way_record(w):
    g = w["geometry"]
    t = w["tags"]
    pts = [[round(p["lat"], 6), round(p["lon"], 6)] for p in g]   # 存完整幾何，合併時再簡化
    length = polyline_len(pts)
    mid = g[len(g) // 2]
    return {"name": norm_name(t["name"]), "lat": mid["lat"], "lon": mid["lon"], "len": length,
            "surface": t.get("surface"), "sac": t.get("sac_scale"),
            "tv": t.get("trail_visibility"), "geom": pts,
            # 新增：判斷是否真步道要用的欄位
            "hw": t.get("highway"), "access": t.get("access"), "foot": t.get("foot"),
            # abandoned:/disused: 前綴＝實地已不存在，OSM 慣例
            "dead": bool(t.get("abandoned:highway") or t.get("disused:highway")
                         or t.get("abandoned") or t.get("disused")),
            "informal": t.get("informal")}


def crawl(only_bbox=None, raw_file=None, done_file=None):
    raw_f = raw_file or RAW
    done_f = done_file or DONE
    raw = json.loads(raw_f.read_text(encoding="utf-8")) if raw_f.exists() else {}
    done = set(json.loads(done_f.read_text(encoding="utf-8"))) if done_f.exists() else set()
    all_tiles = [only_bbox] if only_bbox else tiles()
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
        raw_f.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
        done_f.write_text(json.dumps(sorted(done), ensure_ascii=False), encoding="utf-8")
        if ways:
            print(f"  格 {i}/{len(todo)} {bbox} ✓ {len(ways)} 段（累計 way {len(raw)}）")
        time.sleep(6)
    return raw


# 名稱根本不是「一條步道」的：OSM 上很多 way 的 name 欄位被拿來寫路名、警語、路段描述。
# 這些混進來會變成使用者搜到的假步道（實測抓到「禁止通行」「防火巷」「拉繩峭壁」「成都路43巷」
# 「無法從水湳洞停車場進入」「2023/07/06市政府終於把列管步道清出來了。」等）。
# 註：廢棄／坍塌／危險／攀岩類的字由 build_data.py 的 ABANDONED 統一處理（涵蓋所有來源），此處不重複。
REJECT_NAME = re.compile(
    # 門牌路名、巷弄（市區巷弄常被標成 path）。
    # ⚠️「\d+號」不可無條件擋——台中大坑1~8號步道、樟湖5號步道都是真步道；只擋結尾的門牌號。
    r"\d+巷|\d+弄|\d+號$|^[^山]{0,8}(路|街|大道)[一二三四五六七八九十]{0,2}段?$"
    # 警語、狀態、指示語當名稱
    r"|禁止|止步|請勿|勿入|勿進|注意|中斷|不通|無法|封閉|遊客止|自行小心|拉繩|峭壁|艱難|路跡|未整|難行"
    # 路段／方向描述，不是步道識別名
    r"|^往|^通往|^接[^駁]|^下山|^上登|^陡上|^陡下|^陡峭|^溪谷路|^田間|捷徑|腰線|^捷|^叉$|^岔$"
    # 純通用詞單獨成名（無地名可辨識），例：小徑、山徑、步道、支線
    r"|^(小徑|小路|山徑|步道|主步道|登山步道|支線|路線|山路|林道|階梯|樓梯|石階|小水管路|水管路|產業道路|農路|防火巷|溪溝)$"
    # 設施／構造物而非步道。⚠️「吊橋」不可無條件擋——鹿鳴吊橋步道、桂花吊橋步道是真步道；
    # 只擋「名稱以橋結尾」＝這個 way 就是那座橋本身。
    r"|橋$|涵管|電梯|停車場|廁所|觀景台|涼亭|排水|水溝|溝$|平台$|通道$|^人行|人行道|軌道$|聯絡"
    # 待查證／非路線的點位
    r"|待考|考查|秘境$"
    # name 欄位被當備註／日期寫（。，＝句子；「、」是合法的名稱連接號，不可排除）
    r"|[。，；]|\d{4}/\d{1,2}/\d{1,2}"
)
# 這些 highway 類型在市區大量存在，名稱必須有步道關鍵字才收（Overpass 已先濾，這裡是雙重保險）
NEED_KW_HW = {"footway", "steps", "track", "bridleway"}
MIN_KM = 0.2      # 低於此長度＝多為單段殘片（0.0x km 的「步道」在 App 上是壞資料）


def way_ok(w):
    """way 層級的排除：實地已不存在、私人土地不可通行。"""
    if w.get("dead"):
        return False
    # OSM 慣例：access=private 但 foot 明示可通行 → 仍可走（例如私設但開放的步道）
    if w.get("access") == "private" and w.get("foot") not in ("yes", "designated", "permissive", "public"):
        return False
    return True


def is_trail(name, surface, sac, tv, hws=()):
    if REJECT_NAME.search(name):
        return False
    if any(k in name for k in TRAIL_KW):
        return True
    # footway/steps/track/bridleway 沒有步道關鍵字就不收（否則是市區人行道／產業道路）
    if hws and NEED_KW_HW.issuperset(hws):
        return False
    if sac or tv:                       # 有 SAC 難度／路跡標記＝山徑
        return True
    if surface in NAT_SURF:             # 自然路面
        return True
    return bool(ROUTE_RE.search(name))  # 名稱本身就是一條路線（黃金十四稜、五指山系縱走…）


def merge(raw, stats=None):
    """依名稱分組，再以鄰近(≤3km)分群，過濾真步道，合併長度。"""
    st = stats if stats is not None else {}
    by_name = {}
    dropped_way = 0
    for w in raw.values():
        if not way_ok(w):                      # 實地不存在／私人土地
            dropped_way += 1
            continue
        by_name.setdefault(norm_name(w["name"]), []).append(w)
    st["dropped_way"] = dropped_way

    trails = []
    st["dropped_name"] = st["dropped_short"] = 0
    for name, ws in by_name.items():
        clusters = []   # 每群: {pts:[(lat,lon,len)], lines:[...], surface, sac, tv, hws}
        for w in ws:
            placed = None
            for c in clusters:
                if any(haversine((w["lat"], w["lon"]), (p[0], p[1])) < 3000 for p in c["pts"]):
                    placed = c
                    break
            if placed is None:
                placed = {"pts": [], "lines": [], "surface": None, "sac": None, "tv": None,
                          "hws": set()}
                clusters.append(placed)
            placed["pts"].append((w["lat"], w["lon"], w["len"]))
            if w.get("geom"):
                placed["lines"].append(w["geom"])
            placed["surface"] = placed["surface"] or w["surface"]
            placed["sac"] = placed["sac"] or w["sac"]
            placed["tv"] = placed["tv"] or w["tv"]
            placed["hws"].add(w.get("hw") or "path")
        for c in clusters:
            if not is_trail(name, c["surface"], c["sac"], c["tv"], c["hws"]):
                st["dropped_name"] += 1
                continue
            # 連接成有序連續線，再保形簡化；長度依連接後路線計算
            chains = chain_ways(c["lines"])
            chains = [douglas_peucker(ch, 12) for ch in chains if len(ch) >= 2]
            if not chains:
                continue
            tot = sum(polyline_len(ch) for ch in chains)
            if tot / 1000 < MIN_KM:            # 殘片：0.0x km 的「步道」在 App 上是壞資料
                st["dropped_short"] += 1
                continue
            longest = max(chains, key=polyline_len)
            mid = longest[len(longest) // 2]
            trails.append({
                "name": name, "lat": round(mid[0], 6), "lon": round(mid[1], 6),
                "length_km": round(tot / 1000, 2),
                "surface": SURF_ZH.get(c["surface"], c["surface"]),
                "sac": c["sac"], "lines": chains,
            })
    return trails


def _argv(flag):
    return sys.argv[sys.argv.index(flag) + 1] if flag in sys.argv else None


# 過濾規則的回歸測試。放寬 highway 條件那次，第一版規則差點把真步道砍掉：
#   「\d+號」殺掉台中大坑1~8號步道；「吊橋」殺掉鹿鳴吊橋步道；「、」殺掉七星山北峰、北北峰箭竹林小徑。
# 這些只有拿真名稱對過才會發現，所以固定成測試（scripts/check.js 會跑）。
KEEP = ["大坑1號步道", "樟湖5號步道", "鹿鳴吊橋步道", "桂花吊橋步道", "八通關越道：鹿鳴吊橋段",
        "橫嶺古道", "七星山北峰、北北峰箭竹林小徑", "砲台山保線路", "保甲路古道", "三方向山路線",
        "五指山系縱走", "俯瞰稜(黃金四稜)", "石硿子O型路線", "劍潭山親山步道通北街支線"]
DROP = ["成都路43巷", "中華路一段13巷", "中山北路一段140巷26弄", "禁止通行", "遊客止步", "步道中斷",
        "防火巷", "三板橋", "木棧橋", "2號橋", "涵管橋", "拉繩峭壁", "待考查", "主步道", "小徑",
        "步道", "登山步道", "人行小步道", "無法從水湳洞停車場進入", "往雀榕巨木路徑",
        "2023/07/06市政府終於把列管步道清出來了。超涼的步道。"]


def selftest():
    bad = []
    for n in KEEP:
        m = REJECT_NAME.search(n)
        if m:
            bad.append(f"✗ 誤殺真步道「{n}」（命中 {m.group(0)}）")
    for n in DROP:
        if not REJECT_NAME.search(n):
            bad.append(f"✗ 非步道「{n}」沒擋到")
    # ROUTE_RE 要收得住無 surface 標籤的具名路線，否則郊山名路線整批漏
    for n in ["三方向山路線", "五指山系縱走", "黃金十四稜", "砲台山保線路", "八百階"]:
        if not (any(k in n for k in TRAIL_KW) or ROUTE_RE.search(n)):
            bad.append(f"✗ 具名路線「{n}」無法通過正面判定")
    for b in bad:
        print(b)
    print(f"{'✗' if bad else '✓'} crawl_paths 過濾規則：保留 {len(KEEP)} 例 / 剔除 {len(DROP)} 例"
          f"{'' if not bad else f'，{len(bad)} 項失敗'}")
    return 1 if bad else 0


def main():
    if "--selftest" in sys.argv:
        return selftest()
    # 單格測試：--bbox s,w,n,e [--tag 名稱]，raw/out 另存，不動正式快取
    bbox_arg, tag = _argv("--bbox"), _argv("--tag") or "test"
    if bbox_arg:
        bbox = tuple(float(x) for x in bbox_arg.split(","))
        raw = crawl(only_bbox=bbox,
                    raw_file=HERE / f"osm_paths_raw_{tag}.json",
                    done_file=HERE / f"osm_paths_tiles_{tag}.json")
        out = HERE / f"osm_paths_{tag}.json"
    else:
        raw = crawl()
        out = OUT
    st = {}
    trails = merge(raw, st)
    out.write_text(json.dumps(trails, ensure_ascii=False, indent=1), encoding="utf-8")
    withsurf = sum(1 for t in trails if t["surface"])
    withsac = sum(1 for t in trails if t["sac"])
    print(f"\n過濾：way 層剔除 {st['dropped_way']}（不存在/私人）；"
          f"名稱非步道 {st['dropped_name']}；殘片(<{MIN_KM}km) {st['dropped_short']}")
    print(f"合併過濾後步道 {len(trails)} 條；有路面 {withsurf}，有 sac 難度 {withsac}")
    print(f"寫入 {out}")


if __name__ == "__main__":
    sys.exit(main() or 0)
