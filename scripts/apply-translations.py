# 批次寫入翻譯：每列 25 欄用 | 分隔：中文 key | en | cn | de | es | fr | hi | id | it | ja | km | ko | mn | ms | my | ne | nl | pl | pt | ru | th | tl | tr | uk | vi
# 已有的 key 會更新譯文，沒有的會新增到各語言檔（web/js/i18n/<code>.js，英文也在 i18n/en.js）。
# 用法：python3 scripts/apply-translations.py rows.txt [more.txt ...]   之後跑 npm run check
import json, re, sys
T = {}
for fn in sys.argv[1:]:
    for line in open(fn, encoding="utf-8"):
        line = line.rstrip("\n")
        if not line.strip(): continue
        p = line.split("|"); assert len(p) == 25, (fn, p[0], len(p))
        T[p[0]] = p[1:]
L = ["en","cn","de","es","fr","hi","id","it","ja","km","ko","mn","ms","my","ne","nl","pl","pt","ru","th","tl","tr","uk","vi"]
j = lambda x: json.dumps(x, ensure_ascii=False)
import os
WEB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web", "js")
def setv(s, k, v):
    return re.subn("(" + re.escape(j(k)) + r"\s*:\s*)\"(?:[^\"\\\\]|\\\\.)*\"", lambda m: m.group(1) + j(v), s)
stats = {}
for i, l in enumerate(L):
    p = f"{WEB}/i18n/{l}.js"   # en 也拆到 i18n/en.js 了
    s = open(p, encoding="utf-8").read(); add = []
    for k, v in T.items():
        s, n = setv(s, k, v[i])
        if n == 0: add.append((k, v[i]))
    s = s.replace("return { D: {", "return { D: {" + "".join(f"{j(k)}:{j(v)}," for k, v in add), 1)
    open(p, "w", encoding="utf-8").write(s); stats[l] = len(add)
print(len(T), stats)
