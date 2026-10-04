// 社群頁功能測試（假後端）：留言刪除確認、送出防連點、⋯選單、#標籤按讚與 Esc、搜尋不含自己、英文介面揪團狀態。
// 用法：node scripts/social-e2e.js
const __TTP = +process.env.TT_PORT || 8885;   // run-all 並行時會分配不重複的 port
const ROOT=require("path").join(__dirname,"..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");const fs=require("fs");
const MOCK=fs.readFileSync(__dirname+"/fake-supabase.js","utf8");const errs=[];const R=[];const ok=(n,v)=>{R.push((v?"✓ ":"✗ ")+n)};
(async()=>{const srv=spawn("python3",["-m","http.server",String(__TTP)],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));
const b=await chromium.launch();
const mk=async(lang)=>{const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();p.on("pageerror",e=>errs.push(e.message));
await p.addInitScript(l=>{localStorage.setItem("tt_lang",l);["tt_rules_ok","tt_onboarded_v2","tt_locperm_prompted","tt_coach_soc_friends","tt_coach_soc_explore","tt_coach_soc_search","tt_coach_soc_notif","tt_coach_soc_me"].forEach(k=>localStorage.setItem(k,"1"))},lang);await p.addInitScript(MOCK);
await p.goto("http://localhost:"+__TTP+"/");await p.waitForTimeout(2200);await p.evaluate(()=>window.__installFakeSupa({}));
await p.click('.tab[data-view="social"]');await p.waitForTimeout(1500);return p;};
const p=await mk("zh");
// 貼文詳情：留言刪除要確認
await p.evaluate(()=>PostView.open("p1"));await p.waitForTimeout(900);
ok("貼文詳情留言列有頭像與時間",await p.evaluate(()=>!!document.querySelector(".pv-cm .pv-cm-av")&&!!document.querySelector(".pv-cm-time")));
const dels=await p.locator(".cm-del").count();
if(dels){await p.locator(".cm-del").first().click();await p.waitForTimeout(300);ok("刪留言會先問",await p.locator(".ttdlg").count()===1);await p.click(".ttdlg .btn.ghost");}else ok("有可刪留言（自己的）",false);
// 送出鎖＋Enter
const ins=await p.evaluate(async()=>{let n=0;const c=Supa.client();const orig=c.from;c.from=t=>{const q=orig(t);if(t==="comments"){const oi=q.insert;q.insert=function(){n++;return oi.apply(this,arguments)}}return q};const i=document.getElementById("pvInput");i.value="hi";document.getElementById("pvSend").click();document.getElementById("pvSend").click();i.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter"}));await new Promise(r=>setTimeout(r,500));c.from=orig;return n});
ok("連點送出只送一次（"+ins+"）",ins===1);
await p.click("#pvMore");await p.waitForTimeout(300);ok("⋯ 選單有出現",await p.locator(".ttdlg").count()===1);await p.evaluate(()=>{const b=[...document.querySelectorAll(".ttdlg .btn")].pop();b.click()});
await p.click("#pvX");await p.waitForTimeout(300);
// #標籤：Esc 關、按讚有作用
await p.evaluate(()=>Feed.openTag("南澳古道"));await p.waitForTimeout(800);
ok("#標籤頁按讚有反應",await p.evaluate(async()=>{const b=document.querySelector('[data-ov^="tag-"] .fc-like');if(!b)return false;const was=b.classList.contains("on");b.click();await new Promise(r=>setTimeout(r,300));return b.classList.contains("on")!==was&&!document.querySelector('[data-ov^="post-"]')}));
await p.keyboard.press("Escape");await p.waitForTimeout(300);ok("#標籤頁 Esc 可關",await p.evaluate(()=>!document.querySelector('[data-ov^="tag-"]')));
// 搜尋不含自己
await p.click('.sub-tab[data-sub="search"]');await p.waitForTimeout(900);await p.fill("#discQ","i");await p.fill("#discQ","Ti");await p.waitForTimeout(1000);
ok("搜尋結果不含自己",await p.evaluate(()=>![...document.querySelectorAll("#discResults .disc-row")].some(r=>r.dataset.id==="me")));
// 個人頁 ⋯ 封鎖用狀態不讀文字
await p.evaluate(()=>Discover.openProfile("u1"));await p.waitForTimeout(1200);
ok("別人的個人頁有篇數",await p.evaluate(()=>/\d/.test((document.querySelector('[data-ov="profile-u1"] .pf-counts .cnt')||{}).textContent||"")));
await p.close();
// 英文：揪團報名狀態不靠文字
const e=await mk("en");
await e.evaluate(()=>Events.open());await e.waitForTimeout(1200);
const cnt=await e.evaluate(async()=>{let ins=0,del=0;const c=Supa.client();const orig=c.from;c.from=t=>{const q=orig(t);if(t==="event_rsvps"){const oi=q.insert,od=q.delete;q.insert=function(){ins++;return oi.apply(this,arguments)};q.delete=function(){del++;return od.apply(this,arguments)}}return q};
 const b=document.querySelector(".ev-go");b.dataset.going="1";b.click();await new Promise(r=>setTimeout(r,400));const dlg=!!document.querySelector(".ttdlg");if(dlg)document.querySelector(".ttdlg .btn.primary,.ttdlg .btn").click();await new Promise(r=>setTimeout(r,400));c.from=orig;return {ins,del,dlg}});
ok("英文介面：已報名再按＝問取消、刪除報名（"+JSON.stringify(cnt)+"）",cnt.dlg&&cnt.ins===0);
await e.close();
console.log(R.join("\n"));if(errs.length)console.log("頁面錯誤",JSON.stringify(errs));await b.close();srv.kill();const bad=R.filter(x=>x.startsWith("✗")).length+errs.length;console.log(bad?"✗ 社群測試有失敗":"✓ 社群測試全部通過");process.exit(bad?1:0);})();
