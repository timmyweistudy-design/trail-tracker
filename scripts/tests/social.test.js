// 自動化測試（瀏覽器）：npm run test:all 會依序跑；截圖輸出到 scripts/tests/out/（不進版控）
const __path=require("path"),__fs=require("fs");
const __out=p=>{const full=__path.join(__dirname,"out",p);__fs.mkdirSync(p.endsWith("/")?full:__path.dirname(full),{recursive:true});return p.endsWith("/")?full+"/":full;};
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");const fs=require("fs");
const O=__out("soc5/");fs.mkdirSync(O,{recursive:true});const MOCK=fs.readFileSync(__dirname+"/soc-mock.js","utf8");const errs=[];let fails=0;const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m);if(!c)fails++;};
(async()=>{const srv=spawn("python3",["-m","http.server","8884"],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch();
const mk=async(o={})=>{const ctx=await b.newContext({viewport:{width:o.w||390,height:844}});const p=await ctx.newPage();await require(__dirname+"/fake-weather")(p);p.on("pageerror",e=>errs.push(e.message));
 await p.addInitScript(o=>{localStorage.setItem("tt_lang",o.lang||"zh");["tt_onboarded_v2","tt_coach_trail","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_locperm_prompted","tt_coach_me","tt_coach_soc_friends","tt_coach_soc_explore","tt_coach_soc_search","tt_coach_soc_notif","tt_coach_soc_me","tt_coach_team"].forEach(k=>localStorage.setItem(k,"1"));if(o.dark)localStorage.setItem("tt_theme","dark");},o);
 await p.addInitScript(MOCK);await p.goto("http://localhost:8884/");await p.waitForTimeout(2200);await p.evaluate(o=>window.__installFakeSupa(o),o.mock||{});
 await p.click('.tab[data-view="social"]');await p.waitForTimeout(1500);return p;};
const sub=async(p,s)=>{await p.evaluate(s=>document.querySelector(`.sub-tab[data-sub="${s}"]`).click(),s);await p.waitForTimeout(1300);};
{const p=await mk();
 // 1 分享 fallback
 await p.evaluate(()=>PostView.open("p1"));await p.waitForTimeout(1600);
 await p.evaluate(()=>{Object.defineProperty(navigator,"share",{value:undefined,configurable:true});Object.defineProperty(navigator,"clipboard",{value:{writeText:()=>Promise.reject(new Error("denied"))},configurable:true});});
 await p.click("#pvShare");await p.waitForTimeout(500);
 ok(await p.evaluate(()=>!!document.querySelector(".ttdlg")&&document.querySelector(".ttdlg").innerText.includes("南澳古道")),"share fallback shows text when clipboard denied");
 await p.evaluate(()=>document.querySelector(".ttdlg .btn").click());
 // 5 翻譯鈕：中文介面中文貼文不顯示；英文留言顯示
 ok(await p.evaluate(()=>!document.getElementById("pvTranslate")),"no translate btn for zh caption in zh UI");
 ok(await p.evaluate(()=>{const b=[...document.querySelectorAll(".pv-cm")].map(c=>[c.innerText.includes("This trail"),!!c.querySelector(".cm-tr")]);return b.some(x=>x[0]&&x[1])&&b.filter(x=>!x[0]).every(x=>!x[1])}),"comment translate only on foreign-language comment");
 // 11 表情收合
 const nr=await p.evaluate(()=>document.querySelectorAll(".pv-react-b").length);ok(nr<=8,"reactions collapsed: "+nr);
 await p.evaluate(()=>document.querySelector(".pv-react-more").click());await p.waitForTimeout(500);
 ok(await p.evaluate(()=>document.querySelectorAll(".pv-react-b").length)>=25,"reactions expand with +");
 // 13 作者頭像 14 留言名字一行
 ok(await p.evaluate(()=>!!document.querySelector(".pv-author .fc-av")),"post author has avatar");
 ok(await p.evaluate(()=>{const w=document.querySelector(".pv-cm-who");return getComputedStyle(w).display==="block"}),"comment name on own line");
 await p.evaluate(()=>{document.querySelector(".pv").scrollTop=900});await p.waitForTimeout(300);await p.screenshot({path:O+"a-post.png"});
 await p.evaluate(()=>{document.querySelector(".pv").scrollTop=0});await p.waitForTimeout(200);await p.screenshot({path:O+"a-post0.png"});
 await p.evaluate(()=>document.querySelectorAll(".pv-mask").forEach(e=>e.remove()));
 // 2 composer Esc
 await p.evaluate(()=>Composer.open({id:"r1",trailName:"南澳古道",trailId:"forestry-002",distanceKm:6.4,ascent:512,date:new Date().toISOString(),track:[]}));await p.waitForTimeout(1000);
 await p.screenshot({path:O+"b-composer.png"});
 await p.keyboard.press("Escape");await p.waitForTimeout(300);ok(await p.evaluate(()=>!document.querySelector(".composer-mask")),"composer closes on Esc");
 // 3 個人頁篇數
 await p.evaluate(()=>{window.__realPC=Posts.postCount;Posts.postCount=async()=>57;});
 await p.evaluate(()=>Discover.openProfile("u1"));await p.waitForTimeout(1500);
 ok((await p.evaluate(()=>document.querySelector(".pf-counts .cnt b").textContent))==="57","profile post count uses exact count");
 await p.evaluate(()=>{Posts.postCount=window.__realPC;});
 await p.evaluate(()=>document.querySelectorAll(".pv-mask").forEach(e=>e.remove()));
 ok(await p.evaluate(async()=>await Posts.postCount("u1")),"postCount works with mock: ");
 // 16 粉絲名單追蹤鈕
 await sub(p,"me");await p.evaluate(()=>document.querySelector('#pfFollowCounts .cnt-link[data-mode="followers"]').click());await p.waitForTimeout(1000);
 ok(await p.evaluate(()=>document.querySelectorAll('[data-ov="ulist"] .disc-follow').length>0),"follower list has follow buttons");await p.screenshot({path:O+"c-followers.png"});
 await p.evaluate(()=>document.querySelectorAll('[data-ov="ulist"]').forEach(e=>e.remove()));
 // 18 設定開關樣式
 await p.click("#pfSettings");await p.waitForTimeout(900);
 ok(await p.evaluate(()=>getComputedStyle(document.getElementById("stApprove")).width==="42px"),"settings checkbox is switch");
 await p.screenshot({path:O+"d-settings.png"});await p.evaluate(()=>scrollTo(0,800));await p.waitForTimeout(200);await p.screenshot({path:O+"d-settings2.png"});
 // 8 刪帳號紅鈕
 await p.click("#stDelete");await p.waitForTimeout(300);await p.evaluate(()=>document.querySelectorAll(".ttdlg .btn")[1].click());await p.waitForTimeout(300);
 ok(await p.evaluate(()=>!!document.querySelector(".ttdlg .btn.danger-solid")),"delete account final confirm is danger");await p.evaluate(()=>document.querySelector(".ttdlg .btn").click());
 await p.click("#stBack");await p.waitForTimeout(600);
 // 22 編輯頭像鈕 + 大寫轉小寫
 await p.click("#pfEdit");await p.waitForTimeout(500);await p.fill("#edHandle","Timmy_Hike");await p.dispatchEvent("#edHandle","input");await p.waitForTimeout(300);
 ok((await p.inputValue("#edHandle"))==="timmy_hike","handle auto-lowercase");await p.screenshot({path:O+"e-edit.png"});await p.click("#edCancel");await p.waitForTimeout(500);
 // 6/7 揪團
 await p.click("#pfEvents");await p.waitForTimeout(900);await p.click("#evNew");await p.waitForTimeout(300);await p.click("#evSave");await p.waitForTimeout(300);
 ok(await p.evaluate(()=>{const e=document.querySelector('.ev-err[data-for="evTitle"]');return !e.hidden&&document.getElementById("evTitle").classList.contains("bad")&&document.activeElement.id==="evTitle"}),"event form error under field");
 await p.screenshot({path:O+"f-evform.png"});
 await p.fill("#evTitle","測試揪團");await p.fill("#evWhen","2030-05-01T06:00");await p.dispatchEvent("#evWhen","input");await p.waitForTimeout(200);
 ok((await p.evaluate(()=>document.getElementById("evWhenPv").textContent)).includes("5/1"),"event time preview in app locale: "+await p.evaluate(()=>document.getElementById("evWhenPv").textContent));
 await p.click("#evSave");await p.waitForTimeout(1200);
 ok((await p.evaluate(()=>document.getElementById("toast").textContent)).includes("揪團發出去了"),"event created toast");
 await p.evaluate(()=>{window.__fakeT.events[0].creator_id="me";});await p.evaluate(()=>document.querySelectorAll("[data-ov]").forEach(e=>e.remove()));await p.click("#pfEvents");await p.waitForTimeout(900);
 ok(await p.evaluate(()=>!!document.querySelector(".ev-del")),"own event has delete");
 await p.evaluate(()=>{const c=Supa.client();const of=c.from.bind(c);c.from=n=>{const q=of(n);if(n==="events"){q.delete=()=>({eq:async()=>({error:{message:"Failed to fetch"}})});}return q;};});
 const nBefore=await p.evaluate(()=>document.querySelectorAll(".ev-card").length);
 await p.evaluate(()=>document.querySelector(".ev-del").click());await p.waitForTimeout(300);ok(await p.evaluate(()=>!!document.querySelector(".ttdlg .btn.danger-solid")),"delete event confirm danger");
 await p.evaluate(()=>document.querySelectorAll(".ttdlg .btn")[1].click());await p.waitForTimeout(700);
 ok((await p.evaluate(()=>document.getElementById("toast").textContent)).includes("網路")&&await p.evaluate(()=>document.querySelectorAll(".ev-card").length)===nBefore,"delete event failure reported, card stays");
 await p.screenshot({path:O+"g-events.png"});
 await p.evaluate(()=>document.querySelectorAll("[data-ov]").forEach(e=>e.remove()));
 // 39 通知延遲標已讀
 await sub(p,"notif");ok(await p.evaluate(()=>document.querySelectorAll(".notif.unread").length>0),"unread dots visible");
 const r0=await p.evaluate(()=>window.__fakeT?window.__fakeT.notifications.filter(n=>!n.read).length:-1);
 await p.waitForTimeout(3200);
 const r1=await p.evaluate(()=>window.__fakeT?window.__fakeT.notifications.filter(n=>!n.read).length:-1);
 console.log("unread before/after",r0,r1);
 // 37 檢舉選單 Tab 鎖
 await p.evaluate(()=>{window.__rr=Safety.pickReason()});await p.waitForTimeout(300);
 for(let i=0;i<10;i++)await p.keyboard.press("Tab");
 ok(await p.evaluate(()=>!!document.activeElement.closest(".report-mask")),"Tab stays inside report sheet");
 await p.keyboard.press("Escape");await p.waitForTimeout(200);ok(await p.evaluate(()=>!document.querySelector(".report-mask")),"report sheet Esc closes");
 // 35 收藏清理
 await p.evaluate(()=>localStorage.setItem("tt_saved",JSON.stringify(["p1","gone1","gone2"])));
 await p.evaluate(()=>Posts.savedPosts());ok(await p.evaluate(()=>JSON.parse(localStorage.getItem("tt_saved")).join(","))==="p1","saved list pruned");
 // 33/34 trending 查詢量
 await p.evaluate(()=>{window.__supaCalls.byTable={};});await sub(p,"explore");
 console.log("explore calls",JSON.stringify(await p.evaluate(()=>window.__supaCalls.byTable)));
 ok(await p.evaluate(()=>document.querySelectorAll(".feed-card").length)>0,"explore still shows cards");
 await p.evaluate(()=>document.querySelector('.ex-diff-b[data-d="1"]').click());await p.waitForTimeout(900);
 // 26 取消追蹤按鈕
 await p.close();}
// 4 英文子分頁
for(const w of [390,360]){const p=await mk({lang:"en",w});
 const r=await p.evaluate(()=>{const nav=document.querySelector(".social-subnav");const tabs=[...nav.querySelectorAll(".sub-tab")];const nr=nav.getBoundingClientRect();return {over:nav.scrollWidth>nav.clientWidth+1,me:tabs[4].getBoundingClientRect().right<=nr.right+0.5,badge:(()=>{const bd=document.getElementById("notifBadge").getBoundingClientRect(),me=tabs[4].getBoundingClientRect();return bd.right<=me.left+1})()}});
 ok(!r.over&&r.me&&r.badge,"en subnav fits at "+w+": "+JSON.stringify(r));await p.screenshot({path:O+"h-en-"+w+".png"});
 // 9 composer en
 await p.evaluate(()=>Composer.open({id:"r1",trailName:"南澳古道",distanceKm:6.4,ascent:512,date:new Date().toISOString(),track:[]}));await p.waitForTimeout(1000);
 ok(await p.evaluate(()=>!/[一-鿿]/.test([...document.querySelectorAll(".comp-add,.comp-vis,.composer-head")].map(e=>e.innerText).join(""))),"en composer translated");
 if(w===390){await p.screenshot({path:O+"i-en-composer.png"});
  const vv=await p.evaluate(async()=>{const f=new File([new Uint8Array(60*1024*1024)],"big.mp4",{type:"video/mp4"});return (await Media.validateVideo(f)).msg});ok(vv==="Video too large — max 50 MB","en video msg: "+vv);}
 await p.evaluate(()=>document.querySelectorAll(".composer-mask").forEach(e=>e.remove()));
 if(w===390){await sub(p,"me");ok(!(await p.evaluate(()=>document.querySelector(".prof-pet-t").textContent)).match(/[一-鿿]/),"en hero pet name translated: "+await p.evaluate(()=>document.querySelector(".prof-pet-t").textContent));
  await p.click("#pfEvents");await p.waitForTimeout(900);ok((await p.evaluate(()=>document.querySelector(".ev-meta").textContent)).includes("Organizer"),"en event meta: "+await p.evaluate(()=>document.querySelector(".ev-meta").textContent));
  await p.evaluate(()=>document.querySelectorAll("[data-ov]").forEach(e=>e.remove()));
  await p.click("#pfSettings");await p.waitForTimeout(900);ok(!(await p.evaluate(()=>/[一-鿿]/.test(document.getElementById("subBody").innerText))),"en settings fully translated");
  // 5 英文介面中文貼文要有翻譯鈕
  await p.evaluate(()=>PostView.open("p1"));await p.waitForTimeout(1500);ok(await p.evaluate(()=>!!document.getElementById("pvTranslate")),"en UI zh caption has translate btn");
  // 26 取消追蹤
  await p.evaluate(()=>document.querySelectorAll(".pv-mask").forEach(e=>e.remove()));await sub(p,"search");
 }
 await p.close();}
{const p=await mk({dark:true});await p.evaluate(()=>PostView.open("p4"));await p.waitForTimeout(1600);await p.screenshot({path:O+"j-dark-post.png"});await p.close();}
{const p=await mk({mock:{loggedOut:true},lang:"en"});ok(!(await p.evaluate(()=>/[一-鿿]/.test(document.getElementById("socialBody").innerText))),"en login translated");await p.screenshot({path:O+"k-en-login.png"});await p.close();}
console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails);await b.close();srv.kill();})();
