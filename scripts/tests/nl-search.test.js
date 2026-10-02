// 一句話搜尋（js/nl-search.js＋explore.js）：拆條件、篩結果、「看懂了」條、空白時的示範句、多語言
const __path=require("path"),__fs=require("fs");
const __out=p=>{const full=__path.join(__dirname,"out",p);__fs.mkdirSync(p.endsWith("/")?full:__path.dirname(full),{recursive:true});return p.endsWith("/")?full+"/":full;};
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");const O=__out("nl/");
const errs=[];let fails=0;const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m);if(!c)fails++;};
// 純函式
global.window={};eval(__fs.readFileSync(ROOT+"/web/js/nl-search.js","utf8"));const N=window.NLSearch;
{const c=N.parse("週六台北近郊 3 小時內 有瀑布 不要太陡");ok(c&&c.regions[0]==="臺北市"&&c.maxHours===3&&c.gentle&&c.sights[0][0]==="瀑布"&&!c.words.length,"zh full sentence: "+JSON.stringify(c&&c.chips));}
ok(N.parse("太平山")===null,"plain name stays keyword search");
ok(N.parse("合歡")===null,"two-char name stays keyword search");
{const c=N.parse("宜兰 亲子 半天");ok(c&&c.regions[0]==="宜蘭縣"&&c.family&&c.maxHours===4,"simplified chinese");}
{const c=N.parse("easy hike near me with a lake");ok(c&&c.near&&c.maxDiff===2&&c.sights[0][0]==="湖泊"&&!c.words.length,"english: "+JSON.stringify(c&&c.words));}
{const c=N.parse("兩個小時 挑戰 南部");ok(c&&c.maxHours===2&&c.minDiff===4&&c.regions.includes("高雄市"),"chinese numerals + region group");}
{const c=N.parse("花蓮 5公里內 鯉魚");ok(c&&c.maxKm===5&&c.words.includes("鯉魚"),"km limit + leftover keyword");}
{const c=N.parse("台北 瀑布"),est=()=>2,sl=()=>null;
 ok(N.match({name:"OO瀑布步道",region:"臺北市",difficulty:2},c,est,sl)&&!N.match({name:"OO山步道",region:"臺北市",difficulty:2},c,est,sl)&&!N.match({name:"OO瀑布",region:"新北市",difficulty:2},c,est,sl),"match: region + sight");}
{const c=N.parse("3 小時內 親子");ok(!N.match({name:"x",region:"a",difficulty:1},c,()=>5,()=>null)&&N.match({name:"x",region:"a",difficulty:1},c,()=>3.2,()=>null)&&!N.match({name:"x",region:"a",difficulty:3},c,()=>2,()=>null),"match: hours (15% slack) + family");}
(async()=>{const srv=spawn("python3",["-m","http.server","8883"],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch();
const mk=async(lang)=>{const ctx=await b.newContext({viewport:{width:390,height:844},timezoneId:"Asia/Taipei"});const p=await ctx.newPage();await require(__dirname+"/fake-weather")(p);p.on("pageerror",e=>errs.push(e.message));
 await p.addInitScript(l=>{if(sessionStorage.getItem("seed"))return;sessionStorage.setItem("seed","1");localStorage.setItem("tt_lang",l);["tt_onboarded_v2","tt_coach_trail","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_locperm_prompted","tt_coach_team"].forEach(k=>localStorage.setItem(k,"1"));},lang);
 await p.goto("http://localhost:8883/");await p.waitForTimeout(2300);await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));return p;};
const search=async(p,q)=>{await p.fill("#searchInput",q);await p.waitForTimeout(700);await p.keyboard.press("Enter");await p.waitForTimeout(700);};
const cards=p=>p.evaluate(()=>[...document.querySelectorAll("#trailList .card[data-id]")].map(c=>{const t=TRAILS.find(x=>x.id===c.dataset.id);return t&&{n:t.name,r:t.region,pos:String(t.position||"")}}).filter(Boolean));
{const p=await mk("zh");
 await p.focus("#searchInput");await p.waitForTimeout(500);
 const tips=await p.evaluate(()=>[...document.querySelectorAll("#searchSuggest .sug-tip")].map(e=>e.dataset.q));
 ok(tips.length===2&&tips[0]==="台北 3 小時內 有瀑布","empty query shows sentence tips: "+JSON.stringify(tips));
 await p.screenshot({path:O+"tips-zh.png"});
 await p.dispatchEvent("#searchSuggest .sug-tip","mousedown");await p.waitForTimeout(900);
 const bar=await p.evaluate(()=>{const e=document.getElementById("nlBar");return !e.hidden&&e.innerText});
 ok(bar&&/臺北市/.test(bar)&&/3 小時內/.test(bar)&&/瀑布/.test(bar),"tip click → understood bar: "+String(bar).replace(/\n/g," "));
 const cs=await cards(p);ok(cs.length>0&&cs.every(c=>c.r==="臺北市"&&/瀑/.test(c.n)),"results all Taipei waterfalls ("+cs.length+"): "+cs.slice(0,4).map(c=>c.n).join("、"));
 await p.evaluate(()=>document.activeElement&&document.activeElement.blur());await p.screenshot({path:O+"bar-zh.png"});
 await p.click("#nlClear");await p.waitForTimeout(600);
 ok(await p.evaluate(()=>document.getElementById("nlBar").hidden&&document.getElementById("searchInput").value===""),"clear resets search");
 await search(p,"絹絲");ok(await p.evaluate(()=>document.getElementById("nlBar").hidden),"plain name: no bar");
 const n=await cards(p);ok(n.some(c=>/絹絲/.test(c.n)),"plain name still finds 絹絲瀑布");
 await search(p,"宜蘭 親子 半天");const y=await cards(p);ok(y.length>0&&y.every(c=>c.r==="宜蘭縣"||c.pos.includes("宜蘭縣")),"宜蘭 親子 半天 → only Yilan ("+y.length+")");
 await p.close();}
{const p=await mk("en");
 await search(p,"waterfall near Taipei under 3 hours");
 const bar=await p.evaluate(()=>{const e=document.getElementById("nlBar");return !e.hidden&&e.innerText});
 ok(bar&&!/[一-鿿]/.test(bar)&&/Waterfall/.test(bar),"en bar translated: "+String(bar).replace(/\n/g," "));
 await p.evaluate(()=>document.activeElement&&document.activeElement.blur());await p.screenshot({path:O+"bar-en.png"});await p.close();}
{const p=await mk("ja");
 await p.focus("#searchInput");await p.waitForTimeout(500);
 const t=await p.evaluate(()=>[...document.querySelectorAll("#searchSuggest .sug-tip")].map(e=>[e.innerText,e.dataset.q]));
 ok(t.length===2&&/滝/.test(t[0][0])&&/^Taipei/.test(t[0][1]),"ja tip shows Japanese, searches English: "+JSON.stringify(t[0]));
 await p.dispatchEvent("#searchSuggest .sug-tip","mousedown");await p.waitForTimeout(900);
 ok(await p.evaluate(()=>!document.getElementById("nlBar").hidden),"ja tip parses");
 await p.screenshot({path:O+"bar-ja.png"});await p.close();}
console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails);await b.close();srv.kill();})();
