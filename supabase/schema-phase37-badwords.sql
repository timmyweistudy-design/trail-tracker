-- 不當字詞最後防線（App Store 1.2）：由 scripts/gen-badwords-sql.mjs 從 web/js/moderation.js 的 TT_BAD 產生，不要手改。
-- 跟 App 端同一套：先正規化（全形→半形、小寫、去零寬字元），再分三種比：
--   1. 只留字母的壓縮字串比 sub（中日韓、注音、其他文字；中間塞空白符號也擋得到）
--   2. 數字符號當字母（0→o、@→a、$→s、!→i）後的壓縮字串比 root（英文字根，字母可重複：fuuuck）
--   3. 數字符號當字母後，要是獨立單字才算的 word（避免 shiitake、grape 誤擋）
-- 取代 phase35 的 tt_is_clean；另外補上小隊名稱、貼文的步道名稱。要先跑過 phase35。可重複執行。

create or replace function public.tt_is_clean(t text) returns boolean
language sql immutable as $$
  with n as (select regexp_replace(lower(normalize(coalesce(t, ''), NFKC)), '[\u200b-\u200f\u2060\ufeff\u00ad]', '', 'g') v),
       l as (select v, translate(v, '013457@$!|', 'oieastasii') lv from n)
  select t is null or not (
       regexp_replace(v, '[^[:alpha:]]', '', 'g') ~ '[幹干乾淦赣][你妳恁拎林您伱尼泥][娘媽妈老母老師老师祖宗全家]|[操肏草艹靠][你妳恁拎林您伱尼泥][娘媽妈老母老師老师祖宗全家]|草泥[馬马]|肏|[屌]你|[屌]妳|[雞鸡機机]掰|[雞鸡]歪|[雞鸡機机]巴|懶[叫趴]|[懒][叫趴]|羼|洨|屄|婊|[賤贱](人|貨|货|女人|狗|種|种)|妓女|王八[蛋羔]|去死(?![亡角])|死全家|[你妳][媽妈]死了|[他她你妳][媽妈]的|(衝|做|是|講|讲|幹|干|在|看|說|说|吵|共)三小|三小(啦|喔|啊|阿|咧|拉|啦)|^三小$|靠北(?![側侧邊边方端面部])|靠杯|靠夭|哭夭|白[癡痴]|智障|[腦脑][殘残]|弱智|低能(兒|儿|仔)|[你妳]低能|[傻煞][逼屄比筆笔]|(?<![台臺])北七(?!星)|娘[炮砲]|支那(?!雅)|黑鬼|[約约][砲炮]|打[砲炮]|做[愛爱]|性交|口交|肛交|自慰|打手槍|[陰阴][莖茎道]|[陽阳]具|裸照|裸聊|a片|色情|援交|一夜情|包[養养]|[娛娱][樂乐]城|博弈|博彩|百家[樂乐]|代[儲储]|[線线]上[賭赌]|六合彩|安非他命|搖頭丸|摇头丸|k他命|海洛因|冰毒|ㄍㄢ|ㄐㄅ|ㄍㄋㄋ|ganniniang|ganlinniang|ganninia|kaobei|cnm(?![a-z])|nmsl|jibai|死ね|くそ|クソ|ちんこ|ちんぽ|まんこ|セックス|キチガイ|きちがい|씨발|시발|ㅅㅂ|병신|ㅂㅅ|개새끼|좆|존나|니애미|бля|сука|хуй|хуё|пизд|ебат|ёбан|мудак|курва|ควย|เหี้ย|เย็ด|มึง|địt|đụ|lồn|cặc|मादरचोद|बहनचोद|चूतिया'
    or regexp_replace(lv, '[^[:alpha:]]', '', 'g') ~ 'f+u+c+k+|f+u+k+|f+v+c+k+|p+h+u+c+k+|f+c+k+|m+o+t+h+e+r+f+u+c+k+e+r+|n+i+g+g+e+r+|n+i+g+g+a+|f+a+g+g+o+t+|b+i+t+c+h+|a+s+s+h+o+l+e+|w+h+o+r+e+|s+l+u+t+|p+o+r+n+|w+a+n+k+e+r+|d+i+l+d+o+|b+l+o+w+j+o+b+|h+a+n+d+j+o+b+|c+u+m+s+h+o+t+|j+i+z+z+|b+a+s+t+a+r+d+|k+i+l+l+y+o+u+r+s+e+l+f+|p+u+t+a+n+g+i+n+a+|t+a+n+g+i+n+a+|m+a+d+a+r+c+h+o+d+|b+e+h+e+n+c+h+o+d+|b+h+e+n+c+h+o+d+|c+h+u+t+i+y+a+|v+a+f+f+a+n+c+u+l+o+|h+u+r+e+n+s+o+h+n+|s+c+h+e+i+s+s+e+|s+c+h+e+i+ß+e+|k+l+o+o+t+z+a+k+|n+g+e+n+t+o+t+|k+o+n+t+o+l+|m+e+m+e+k+|s+i+k+t+i+r+|o+r+o+s+p+u+|k+u+r+w+a+'
    or lv ~ '(?<![[:alpha:]])(s+h+i+t+|s+h+i+t+t+y+|c+u+n+t+|p+u+s+s+y+|r+a+p+e+|r+a+p+e+d+|r+e+t+a+r+d+|r+e+t+a+r+d+e+d+|n+a+z+i+|t+w+a+t+|x+x+x+|w+t+f+|s+t+f+u+|k+y+s+|t+m+d+|d+u+m+b+a+s+s+|j+a+c+k+a+s+s+|p+u+t+a+|p+u+t+o+|m+i+e+r+d+a+|p+e+n+d+e+j+o+|p+u+t+a+i+n+|m+e+r+d+e+|s+a+l+o+p+e+|c+o+n+n+a+r+d+|f+o+t+z+e+|c+a+z+z+o+|s+t+r+o+n+z+o+|c+a+r+a+l+h+o+|p+o+r+r+a+|c+h+u+j+|k+u+t+|a+m+k+|g+a+g+o+|b+a+n+g+s+a+t+|a+n+j+i+n+g+)(?![[:alpha:]])'
  ) from l;
$$;

drop trigger if exists tt_clean_posts on public.posts;
create trigger tt_clean_posts before insert or update on public.posts
  for each row execute function public.tt_block_bad_words('caption', 'trail_name');
drop trigger if exists tt_clean_teams on public.teams;
create trigger tt_clean_teams before insert or update on public.teams
  for each row execute function public.tt_block_bad_words('name');
