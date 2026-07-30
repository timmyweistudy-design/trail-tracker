#!/usr/bin/env python3
"""步道資料驗收：跑完資料管線後用這支確認三件事，避免「抓進來了但是壞資料」。

  1. 沒有漏掉    —— 與備份比對，列出「舊有、新無」的步道（回歸偵測）
  2. 都是有效步道 —— 掃描名稱，抓出廢棄林道／警語當名稱／巷弄／設施等非步道
  3. 資訊已補齊   —— 逐條檢查必要欄位（長度、爬升、難度、地區、幾何、介紹）覆蓋率

用法：
  python3 data/verify_trails.py                      # 只檢查現況
  python3 data/verify_trails.py <備份 trails.json>   # 加上與備份的差異比對
離開碼：0 = 全部通過；1 = 有問題（詳見輸出）
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).parent
TRAILS = HERE / "trails.json"

# 不該出現在成品裡的名稱樣態（與 crawl_paths.REJECT_NAME / build_data.ABANDONED 對齊，
# 但這裡是「事後驗收」——即使上游漏擋也要在這裡叫出來）
BAD_NAME = [
    ("廢棄/拆除", re.compile(r"廢林道|廢棄|已廢|荒廢|拆除|停用|不復存在")),
    ("危險/坍塌", re.compile(r"坍塌|坍方|崩塌|崩壞|崩坍|崩毀|斷崖|落石|危險|拉繩|峭壁|攀岩|探勘")),
    ("警語當名稱", re.compile(r"禁止|止步|請勿|勿入|勿進|注意|中斷|不通|無法|遊客止|自行小心|路跡|未整|難行")),
    # ⚠️「\d+號」「吊橋」不可無條件擋：大坑1~8號步道、鹿鳴吊橋步道都是真步道
    ("門牌巷弄", re.compile(r"\d+巷|\d+弄|\d+號$")),
    ("設施非步道", re.compile(r"橋$|涵管|電梯|停車場|廁所|觀景台|涼亭|排水|水溝|溝$|平台$|人行道|軌道$")),
    ("方向/片段描述", re.compile(r"^往|^通往|^下山|^上登|^陡上|^陡下|捷徑|腰線")),
    ("備註/日期當名稱", re.compile(r"[。，；]|\d{4}/\d{1,2}/\d{1,2}")),
    ("純通用詞", re.compile(r"^(小徑|小路|山徑|步道|主步道|登山步道|支線|路線|山路|林道|階梯|石階|水管路|防火巷|溪溝|待考查)$")),
]

# 每條步道都應該有的欄位（缺了前端會顯示「—」）
REQUIRED = ["name", "length_km", "difficulty", "difficulty_label", "region", "lat", "lon", "guide"]
# 應該盡量有的欄位（覆蓋率門檻）
DESIRED = {"ascent": 0.90, "geometry": 0.90}
MIN_KM = 0.2


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def main():
    trails = load(TRAILS)
    fail = []
    print(f"=== 資料總覽 ===\n共 {len(trails)} 條　來源 {dict(Counter(t['source'] for t in trails))}")

    # --- 2. 有效步道 ---
    print("\n=== 2. 名稱有效性 ===")
    hits = []
    for t in trails:
        for label, rx in BAD_NAME:
            m = rx.search(t["name"])
            if m:
                hits.append((label, m.group(0), t["name"], t["id"]))
                break
    if hits:
        fail.append(f"名稱可疑 {len(hits)} 條")
        for label, tok, name, tid in hits[:40]:
            print(f"  ✗ [{label}:{tok}] {name}  ({tid})")
        if len(hits) > 40:
            print(f"  …另外 {len(hits) - 40} 條")
    else:
        print("  ✓ 無廢棄林道／警語／巷弄／設施類名稱")

    short = [t for t in trails if (t.get("length_km") or 0) < MIN_KM and t.get("length_km") is not None]
    if short:
        fail.append(f"過短殘片 {len(short)} 條")
        print(f"  ✗ 長度 < {MIN_KM}km 的殘片 {len(short)} 條，例：" +
              "、".join(f"{t['name']}({t['length_km']})" for t in short[:8]))
    else:
        print(f"  ✓ 無 < {MIN_KM}km 的殘片")

    # --- 3. 資訊補齊 ---
    print("\n=== 3. 欄位完整度 ===")
    for f in REQUIRED:
        miss = [t for t in trails if t.get(f) in (None, "", [], {})]
        mark = "✓" if not miss else "✗"
        print(f"  {mark} {f}: 缺 {len(miss)} 條" +
              ("" if not miss else "，例：" + "、".join(t["name"] for t in miss[:5])))
        if miss:
            fail.append(f"{f} 缺 {len(miss)} 條")
    for f, thr in DESIRED.items():
        have = sum(1 for t in trails if t.get(f) not in (None, "", [], {}))
        rate = have / len(trails)
        mark = "✓" if rate >= thr else "✗"
        print(f"  {mark} {f}: {have}/{len(trails)} = {rate:.1%}（門檻 {thr:.0%}）")
        if rate < thr:
            fail.append(f"{f} 覆蓋率 {rate:.1%} < {thr:.0%}")
    wp = sum(1 for t in trails if t.get("waypoints"))
    long_enough = sum(1 for t in trails if (t.get("length_km") or 0) >= 1.5)
    print(f"  · waypoints 沿線地標：{wp} 條（≥1.5km 的有 {long_enough} 條）")

    # --- 1. 沒有漏掉 ---
    if len(sys.argv) > 1:
        print("\n=== 1. 與備份比對（回歸偵測）===")
        old = load(sys.argv[1])
        on = {t["name"] for t in old}
        nn = {t["name"] for t in trails}
        lost = sorted(on - nn)
        gained = sorted(nn - on)
        print(f"  舊 {len(old)} 條 → 新 {len(trails)} 條（{len(gained)} 新增 / {len(lost)} 消失）")
        # 消失的分兩類：被過濾規則有意剔除的 vs 不明消失（後者才是問題）
        unexplained = []
        for name in lost:
            if any(rx.search(name) for _, rx in BAD_NAME):
                continue
            unexplained.append(name)
        print(f"  · 消失但符合過濾規則（有意剔除）：{len(lost) - len(unexplained)} 條")
        print(f"  · 消失且不符任何過濾規則（需人工看）：{len(unexplained)} 條")
        for name in unexplained[:60]:
            print(f"      ? {name}")
        if len(unexplained) > 60:
            print(f"      …另外 {len(unexplained) - 60} 條")
        print(f"  · 新增前 20：" + "、".join(gained[:20]))

    print("\n=== 結論 ===")
    if fail:
        print("✗ 未通過：" + "；".join(fail))
        return 1
    print("✓ 全部通過")
    return 0


if __name__ == "__main__":
    sys.exit(main())
