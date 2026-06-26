#!/usr/bin/env python3
"""維基百科步道描述補充

讀 trails.json 取所有步道名稱，向中文維基百科 REST API 查摘要，
通過相關性檢查者寫入 wiki_cache.json（{name: {extract, url} 或 null}）。
build_data.py 會用此快取替補較貧乏的步道介紹。內容為 CC BY-SA，需標註來源。

特性：快取續傳（含 miss）、相關性過濾、禮貌延遲。
用法：python3 enrich_wiki.py
"""
import json
import subprocess
import time
import urllib.parse
from pathlib import Path

HERE = Path(__file__).parent
TRAILS = HERE / "trails.json"
CACHE = HERE / "wiki_cache.json"
UA = "TrailTracker/1.0 (educational project; contact phome0425@gmail.com)"
REL_KW = ("步道", "古道", "登山", "步行", "健行", "山徑", "越嶺", "國家公園",
          "山", "瀑布", "湖", "森林", "步", "古徑", "稜")


def summary(name):
    enc = urllib.parse.quote(name)
    url = f"https://zh.wikipedia.org/api/rest_v1/page/summary/{enc}"
    out = subprocess.run(["curl", "-s", "--max-time", "20", "-H", f"User-Agent: {UA}", url],
                         capture_output=True, timeout=25)
    try:
        return json.loads(out.stdout.decode("utf-8"))
    except Exception:  # noqa: BLE001
        return None


def relevant(name, d):
    if not d or d.get("type") != "standard":
        return False
    ext = d.get("extract") or ""
    if len(ext) < 25:
        return False
    if "消歧義" in ext or "可以指" in ext:
        return False
    # 摘要需與步道/山林相關，或標題即步道名
    return any(k in ext for k in REL_KW) or name in (d.get("title") or "")


def main():
    trails = json.loads(TRAILS.read_text(encoding="utf-8"))
    names = sorted({t["name"] for t in trails if t.get("name")})
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    todo = [n for n in names if n not in cache]
    print(f"步道名稱 {len(names)}，已查 {len(cache)}，待查 {len(todo)}")

    hits = sum(1 for v in cache.values() if v)
    for i, name in enumerate(todo, 1):
        d = summary(name)
        if relevant(name, d):
            cache[name] = {
                "extract": d["extract"],
                "url": (d.get("content_urls", {}).get("desktop", {}) or {}).get("page", ""),
            }
            hits += 1
        else:
            cache[name] = None
        if i % 25 == 0:
            CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
            print(f"  {i}/{len(todo)}（命中 {hits}）")
        time.sleep(0.15)

    CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    print(f"完成：{len(cache)} 名稱，維基命中 {hits} 條 → {CACHE}")


if __name__ == "__main__":
    main()
