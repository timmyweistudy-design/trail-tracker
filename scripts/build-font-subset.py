#!/usr/bin/env python3
"""中文字型子集建置：把 21MB 的 TaipeiSans.ttf 裁成只含本站會用到的字。

⚠️ 這支一定要在「新增中文內容之後」重跑，否則新字會靜靜 fallback 成系統字型
   （畫面不會報錯，只是那幾個字長得不一樣）。實測步道資料從 2217 擴充到 2935 條後，
   子集一口氣缺了 324 個字（喵、崠、嵙、糶…）。

字元來源＝所有可能顯示在畫面上的中文：
  - data/trails.json（步道名/地區/介紹/路面/季節/沿線地標/入口備註/路況）
  - web/js/*.js、web/js/social/*.js、web/js/i18n/*.js（介面字串、生態資料、翻譯字典）
  - web/index.html、web/css/style.css
  - web/js/trails-detail.js（沿線地標）

用法：python3 scripts/build-font-subset.py
需要：pip install fonttools brotli
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "TaipeiSans.ttf"
OUT = ROOT / "web" / "vendor" / "fonts" / "taipei-sans.woff2"

# 一定要保留的基本字元（數字、標點、全形標點、常用符號）
ALWAYS = set(
    "0123456789"
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
    " .,:;!?'\"()[]{}<>/\\|-_+=*&%$#@~^`"
    "。，、；：？！「」『』（）〔〕【】《》〈〉—…‧·　～．"
    "±×÷≈≤≥°′″↑↓←→√∞"
)


def texts():
    """所有可能顯示中文的來源。"""
    yield (ROOT / "web" / "index.html").read_text(encoding="utf-8")
    yield (ROOT / "web" / "css" / "style.css").read_text(encoding="utf-8")
    for pat in ("web/js/*.js", "web/js/social/*.js", "web/js/i18n/*.js"):
        for f in sorted(ROOT.glob(pat)):
            yield f.read_text(encoding="utf-8", errors="ignore")
    # 步道資料用 JSON 逐欄取，避免把 id 之類的雜訊也算進來（其實無害，但這樣意圖清楚）
    trails = json.loads((ROOT / "data" / "trails.json").read_text(encoding="utf-8"))
    for t in trails:
        for k in ("name", "region", "position", "guide", "pave", "tour", "best_season",
                  "system", "admin", "admin_phone", "permit", "difficulty_label"):
            v = t.get(k)
            if isinstance(v, str):
                yield v
        for w in (t.get("waypoints") or []):
            yield str(w.get("name") or "")
        for e in (t.get("entrances") or []):
            yield str(e.get("memo") or "")
        c = t.get("condition") or {}
        for v in c.values():
            if isinstance(v, str):
                yield v


def main():
    if not SRC.exists():
        print(f"✗ 找不到原始字型 {SRC}（21MB，未進版控）。"
              "請先取得 TaipeiSansTCBeta-Bold.ttf 並放到專案根目錄命名為 TaipeiSans.ttf")
        return 1
    try:
        from fontTools import subset
        from fontTools.ttLib import TTFont
    except ImportError:
        print("✗ 需要 fontTools：pip install fonttools brotli")
        return 1

    chars = set(ALWAYS)
    for s in texts():
        chars |= set(s)
    # 只保留字型真的有的字（避免 subset 因缺字報錯），並排除控制字元
    src_font = TTFont(SRC)
    have = set()
    for tbl in src_font["cmap"].tables:
        have |= set(tbl.cmap.keys())
    wanted = sorted(c for c in chars if ord(c) in have and ord(c) >= 0x20)
    dropped = sorted(c for c in chars if ord(c) not in have and ord(c) >= 0x20
                     and ("㐀" <= c <= "鿿"))
    print(f"需要字元 {len(chars)}；原字型可提供 {len(wanted)}"
          + (f"；原字型也沒有的中日韓字 {len(dropped)} 個：{''.join(dropped[:40])}" if dropped else ""))

    opts = subset.Options()
    opts.flavor = "woff2"
    opts.desubroutinize = True
    opts.layout_features = ["*"]        # 保留 OpenType features，避免排版變形
    opts.notdef_outline = True
    opts.recalc_bounds = True
    font = subset.load_font(str(SRC), opts)
    subsetter = subset.Subsetter(options=opts)
    subsetter.populate(text="".join(wanted))
    subsetter.subset(font)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    subset.save_font(font, str(OUT), opts)

    size_kb = OUT.stat().st_size / 1024
    check = TTFont(OUT)
    cov = set()
    for tbl in check["cmap"].tables:
        cov |= set(tbl.cmap.keys())
    missing = [c for c in wanted if ord(c) not in cov]
    print(f"✓ 寫入 {OUT}（{size_kb:.0f} KB，含 {len(cov)} 個字元）"
          + (f"；⚠️ 仍缺 {len(missing)} 個" if missing else "；覆蓋完整"))
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
