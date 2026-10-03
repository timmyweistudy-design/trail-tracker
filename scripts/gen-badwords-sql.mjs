// 從 web/js/moderation.js 的 TT_BAD 產生資料庫端的最後防線 supabase/schema-phase37-badwords.sql（兩邊用同一份清單、同一套正規化）。
// 用法：node scripts/gen-badwords-sql.mjs          → 寫檔
//       node scripts/gen-badwords-sql.mjs --check  → 只比對（check.js 會跑；清單改了忘了重產就會失敗）
import fs from "fs";
import path from "path";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const src = fs.readFileSync(path.join(ROOT, "web/js/moderation.js"), "utf8");
const m = src.match(/const TT_BAD = (\{[\s\S]*?\n\});/);
if (!m) { console.error("找不到 TT_BAD"); process.exit(1); }
const TT_BAD = new Function(`return ${m[1]}`)();
const rep = w => w.split("").map(c => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "+").join("");
const q = s => "'" + s.replace(/'/g, "''") + "'";
const SUB = TT_BAD.sub.join("|");
const ROOT_RE = TT_BAD.root.map(rep).join("|");
const WORD = `(?<![[:alpha:]])(${TT_BAD.word.map(rep).join("|")})(?![[:alpha:]])`;
const sql = `-- 不當字詞最後防線（App Store 1.2）：由 scripts/gen-badwords-sql.mjs 從 web/js/moderation.js 的 TT_BAD 產生，不要手改。
-- 跟 App 端同一套：先正規化（全形→半形、小寫、去零寬字元），再分三種比：
--   1. 只留字母的壓縮字串比 sub（中日韓、注音、其他文字；中間塞空白符號也擋得到）
--   2. 數字符號當字母（0→o、@→a、$→s、!→i）後的壓縮字串比 root（英文字根，字母可重複：fuuuck）
--   3. 數字符號當字母後，要是獨立單字才算的 word（避免 shiitake、grape 誤擋）
-- 取代 phase35 的 tt_is_clean；另外補上小隊名稱、貼文的步道名稱。要先跑過 phase35。可重複執行。

create or replace function public.tt_is_clean(t text) returns boolean
language sql immutable as $$
  with n as (select regexp_replace(lower(normalize(coalesce(t, ''), NFKC)), '[\\u200b-\\u200f\\u2060\\ufeff\\u00ad]', '', 'g') v),
       l as (select v, translate(v, '013457@$!|', 'oieastasii') lv from n)
  select t is null or not (
       regexp_replace(v, '[^[:alpha:]]', '', 'g') ~ ${q(SUB)}
    or regexp_replace(lv, '[^[:alpha:]]', '', 'g') ~ ${q(ROOT_RE)}
    or lv ~ ${q(WORD)}
  ) from l;
$$;

drop trigger if exists tt_clean_posts on public.posts;
create trigger tt_clean_posts before insert or update on public.posts
  for each row execute function public.tt_block_bad_words('caption', 'trail_name');
drop trigger if exists tt_clean_teams on public.teams;
create trigger tt_clean_teams before insert or update on public.teams
  for each row execute function public.tt_block_bad_words('name');
`;
const OUT = path.join(ROOT, "supabase/schema-phase37-badwords.sql");
if (process.argv.includes("--check")) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
  if (cur !== sql) { console.error("schema-phase37-badwords.sql 跟 moderation.js 的 TT_BAD 不一致：跑 node scripts/gen-badwords-sql.mjs 重產"); process.exit(1); }
  console.log("badwords sql 同步"); process.exit(0);
}
fs.writeFileSync(OUT, sql); console.log("寫入", path.relative(ROOT, OUT), sql.length, "bytes");
