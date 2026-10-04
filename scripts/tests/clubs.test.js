// 山社（js/social/clubs.js）：搜尋頁入口、列表、建立（PRO）、加入碼、山社頁三格、退出、資料庫沒跑時的提示
const __TTP = +process.env.TT_PORT || 8896;   // run-all 並行時會分配不重複的 port
const __path=require("path"),__fs=require("fs");
const __out=p=>{const full=__path.join(__dirname,"out",p);__fs.mkdirSync(p.endsWith("/")?full:__path.dirname(full),{recursive:true});return p.endsWith("/")?full+"/":full;};
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");
const O=__out("club/");const MOCK=__fs.readFileSync(__dirname+"/soc-mock.js","utf8");const errs=[];let fails=0;const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m);if(!c)fails++;};
// 假的山社資料庫（只在瀏覽器裡跑）
const CLUBDB=o=>{const C=window.__clubs={list:[
  {id:"c1",name:"週末山友會",about:"每週六爬郊山，新手友善。\n集合點在捷運站。",region:"臺北市",is_public:true,members:3,is_member:true,my_role:"owner",join_code:"K7QH2M",created_at:"2026-09-01"},
  {id:"c2",name:"花東慢慢走",about:null,region:"花蓮縣",is_public:true,members:12,is_member:false,my_role:null,join_code:null,created_at:"2026-08-01"},
  {id:"c3",name:"一個名字很長很長很長的山社測試名稱",about:null,region:null,is_public:true,members:1,is_member:false,my_role:null,join_code:null,created_at:"2026-07-01"}],
  priv:{id:"c9",name:"秘密基地",about:null,region:null,is_public:false,members:2,is_member:false,my_role:null,join_code:"SECRET",created_at:"2026-07-01"},calls:[]};
 const P=window.__fakeT.profiles;const prof=id=>P.find(p=>p.id===id);
 const roster={c1:[["me","owner"],["u1","member"],["u3","member"]]};
 const cl=Supa.client(),orig=cl.rpc.bind(cl);
 cl.rpc=async(n,a)=>{C.calls.push([n,a]);await new Promise(r=>setTimeout(r,40));
  if(o.noDb&&/club/.test(n))return {data:null,error:{message:"Could not find the function public.club_list in the schema cache"}};
  if(n==="club_list"){const q=(a.p_q||"").trim();return {data:C.list.filter(c=>c.is_member||!q||c.name.includes(q)||(c.region||"").includes(q)),error:null};}
  if(n==="join_club"){const c=C.list.find(x=>x.id===a.p_club);if(!c||!c.is_public)return {data:null,error:null};c.is_member=true;c.my_role="member";c.members++;c.join_code="PUB"+c.id;roster[c.id]=[["u2","owner"],["me","member"]];return {data:c.id,error:null};}
  if(n==="join_club_by_code"){if(a.p_code!=="SECRET")return {data:null,error:null};const c=Object.assign(C.priv,{is_member:true,my_role:"member",members:3});C.list.push(c);roster.c9=[["u3","owner"],["me","member"]];return {data:"c9",error:null};}
  if(n==="create_club"){if(C.list.filter(c=>c.my_role==="owner").length>=3)return {data:null,error:{message:"club limit"}};const c={id:"n"+C.list.length,name:a.p_name,about:a.p_about,region:a.p_region,is_public:a.p_public,members:1,is_member:true,my_role:"owner",join_code:a.p_code,created_at:"2026-10-03"};C.list.push(c);roster[c.id]=[["me","owner"]];return {data:c.id,error:null};}
  if(n==="club_roster")return {data:(roster[a.p_club]||[]).map(([u,r])=>Object.assign({user_id:u,role:r},prof(u))),error:null};
  if(n==="club_board"){const km={me:12.3,u1:21.5,u3:0,u2:4};return {data:(roster[a.p_club]||[]).map(([u])=>Object.assign({user_id:u,km:km[u]||0,hikes:km[u]?2:0,ascent:km[u]?640:0},prof(u))).sort((x,y)=>y.km-x.km),error:null};}
  if(n==="leave_club"){const c=C.list.find(x=>x.id===a.p_club);c.is_member=false;c.my_role=null;return {data:true,error:null};}
  if(n==="kick_club_member"){roster[a.p_club]=roster[a.p_club].filter(([u])=>u!==a.p_user);return {data:true,error:null};}
  if(n==="delete_club"){C.list=C.list.filter(x=>x.id!==a.p_club);return {data:true,error:null};}
  return orig(n,a);};};
(async()=>{const srv=spawn("python3",["-m","http.server",String(__TTP)],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch();
const mk=async(o={})=>{const ctx=await b.newContext({viewport:{width:o.w||390,height:844}});const p=await ctx.newPage();await require(__dirname+"/fake-weather")(p);p.on("pageerror",e=>errs.push(e.message));
 await p.addInitScript(o=>{if(o.free)window.PERSONAL_MODE=false;if(sessionStorage.getItem("seed"))return;sessionStorage.setItem("seed","1");localStorage.setItem("tt_lang",o.lang||"zh");if(o.fs)localStorage.setItem("tt_fontscale",o.fs);["tt_rules_ok","tt_onboarded_v2","tt_coach_trail","tt_locperm_prompted","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_coach_team","tt_coach_social_search","tt_coach_social_friends"].forEach(k=>localStorage.setItem(k,"1"));localStorage.setItem("tt_social","1");},o);
 await p.addInitScript(MOCK);await p.goto("http://localhost:"+__TTP+"/");await p.waitForTimeout(2300);
 await p.evaluate(()=>window.__installFakeSupa({}));await p.evaluate(CLUBDB,o);
 await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));
 await p.click('.tab[data-view="social"]');await p.waitForTimeout(1500);await p.evaluate(()=>SocialUI.go("search"));await p.waitForTimeout(900);
 await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));return p;};
const txt=p=>p.evaluate(()=>document.querySelector('[data-ov="clubs"]')?.innerText||"");
// 使用者內容（translate="no"）、成員名字不算
const uiTxt=p=>p.evaluate(()=>{const o=document.querySelector('[data-ov="clubs"]').cloneNode(true);o.querySelectorAll('[translate="no"],.club-rank-n,.club-no,.fc-av').forEach(e=>e.remove());return o.innerText;});
{const p=await mk();
 ok(await p.evaluate(()=>!!document.getElementById("clubEntry")),"search page has club entry");
 await p.screenshot({path:O+"entry.png"});
 await p.click("#clubEntry");await p.waitForTimeout(700);
 let t=await txt(p);ok(/我的山社/.test(t)&&/週末山友會/.test(t)&&/花東慢慢走/.test(t)&&/12 人/.test(t),"list: mine + public");
 await p.screenshot({path:O+"list.png"});
 await p.fill("#clQ","花蓮");await p.waitForTimeout(700);t=await txt(p);ok(/花東慢慢走/.test(t)&&!/很長很長/.test(t),"search filters by region");
 // 我的山社頁
 await p.click('.club-row[data-id="c1"]');await p.waitForTimeout(800);
 t=await txt(p);ok(/K7QH2M/.test(t)&&/本週排行/.test(t)&&/集合點在捷運站/.test(t),"club page: code, tabs, about");
 const ranks=await p.evaluate(()=>[...document.querySelectorAll(".club-rank")].map(r=>r.querySelector(".club-no").textContent+":"+r.querySelector(".club-rank-n").textContent));
 ok(ranks.join(",")==="1:阿梅,2:Timmy,–:許","board ranks, zero-km gets dash: "+ranks.join(","));
 await p.screenshot({path:O+"board.png"});
 await p.click('.club-tabs .pk-tab[data-t="members"]');await p.waitForTimeout(700);
 ok(await p.evaluate(()=>document.querySelectorAll(".club-mem").length===3&&document.querySelectorAll(".club-kick").length===2&&/社長/.test(document.querySelector(".club-mem").innerText)),"members: owner first, owner can remove others");
 await p.screenshot({path:O+"members.png"});
 await p.click(".club-kick");await p.waitForTimeout(400);await p.keyboard.press("Escape");await p.waitForTimeout(300);
 ok(await p.evaluate(()=>!document.querySelector(".ttdlg-ov")&&!!document.querySelector('[data-ov="clubs"]')&&document.querySelectorAll(".club-mem").length===3),"Esc on confirm cancels only the confirm");
 await p.click(".club-kick");await p.waitForTimeout(400);await p.click(".ttdlg .danger-solid");await p.waitForTimeout(700);
 ok(await p.evaluate(()=>document.querySelectorAll(".club-mem").length===2),"kick removes member");
 await p.click('.club-tabs .pk-tab[data-t="feed"]');await p.waitForTimeout(1200);
 ok(await p.evaluate(()=>document.querySelectorAll("#clTab .feed-card").length>0),"feed shows members' posts");
 await p.screenshot({path:O+"feed.png"});
 // 返回 → 加入公開山社
 await p.click("#clBack");await p.waitForTimeout(700);ok(/我的山社/.test(await txt(p)),"back returns to list");
 await p.fill("#clQ","");await p.waitForTimeout(600);
 await p.click('.club-row[data-id="c2"]');await p.waitForTimeout(600);
 ok(/加入這個山社/.test(await txt(p))&&await p.evaluate(()=>!document.querySelector(".club-tabs")),"non-member sees join button only");
 await p.screenshot({path:O+"join.png"});
 await p.click("#clJoin");await p.waitForTimeout(1200);
 ok(await p.evaluate(()=>!!document.querySelector(".club-tabs"))&&/加入山社了/.test(await p.evaluate(()=>document.getElementById("toast").textContent)),"joined → club page with tabs");
 // 退出
 await p.click("#clLeave");await p.waitForTimeout(400);await p.click(".ttdlg .danger-solid");await p.waitForTimeout(900);
 ok(/找山社/.test(await txt(p))&&await p.evaluate(()=>window.__clubs.calls.some(c=>c[0]==="leave_club")),"leave → back to list");
 // 加入碼
 await p.fill("#clCode","secret");await p.click("#clJoinCode");await p.waitForTimeout(1200);
 ok(/秘密基地/.test(await txt(p))&&await p.evaluate(()=>window.__clubs.calls.some(c=>c[0]==="join_club_by_code"&&c[1].p_code==="SECRET")),"join by code (uppercased) opens club");
 await p.click("#clBack");await p.waitForTimeout(700);
 await p.fill("#clCode","XXXXXX");await p.click("#clJoinCode");await p.waitForTimeout(600);
 ok(/找不到這個加入碼/.test(await p.evaluate(()=>document.getElementById("clMsg").textContent)),"bad code message");
 // 建立
 await p.click("#clNew");await p.waitForTimeout(500);
 await p.click("#clCreate");await p.waitForTimeout(300);ok(/取個名字/.test(await p.evaluate(()=>document.getElementById("clMsg").textContent)),"create needs a name");
 await p.fill("#clName","宜蘭雨天也爬");await p.selectOption("#clRegion","宜蘭縣");await p.fill("#clAbout","下雨也照走");
 await p.screenshot({path:O+"create.png"});
 await p.click("#clCreate");await p.waitForTimeout(1200);
 const call=await p.evaluate(()=>window.__clubs.calls.find(c=>c[0]==="create_club")[1]);
 ok(call.p_name==="宜蘭雨天也爬"&&call.p_region==="宜蘭縣"&&call.p_public===true&&/^[A-Z2-9]{6}$/.test(call.p_code),"create sends fields + 6-char code "+JSON.stringify(call));
 ok(/宜蘭雨天也爬/.test(await txt(p))&&/社長/.test(await p.evaluate(()=>{document.querySelector('.club-tabs .pk-tab[data-t="members"]').click();return new Promise(r=>setTimeout(()=>r(document.getElementById("clTab").innerText),700))})),"new club opens, I'm organizer");
 // 第 4 個 → 上限
 await p.click("#clBack");await p.waitForTimeout(600);await p.evaluate(()=>{window.__clubs.list.push({id:"x",name:"x",is_member:true,my_role:"owner",members:1,is_public:true})});
 await p.click("#clNew");await p.waitForTimeout(400);await p.fill("#clName","第四個");await p.click("#clCreate");await p.waitForTimeout(800);
 ok(/最多建立 3 個/.test(await p.evaluate(()=>document.getElementById("clMsg").textContent)),"club limit message");
 await p.keyboard.press("Escape");await p.waitForTimeout(400);ok(await p.evaluate(()=>!document.querySelector('[data-ov="clubs"]')),"Esc closes");
 await p.close();}
// 免費版：可以加入，建立要升級
{const p=await mk({free:1});await p.click("#clubEntry");await p.waitForTimeout(700);
 ok(await p.evaluate(()=>!!document.querySelector("#clNew .pro-tag")),"free: create shows PRO");
 await p.click("#clNew");await p.waitForTimeout(600);ok(await p.evaluate(()=>!!document.querySelector(".premium-mask")&&!document.getElementById("clName")),"free: create opens upgrade");
 await p.close();}
// 資料庫還沒跑 phase34
{const p=await mk({noDb:1});await p.click("#clubEntry");await p.waitForTimeout(700);
 ok(/schema-phase34-clubs\.sql/.test(await txt(p)),"no DB: clear hint");await p.screenshot({path:O+"nodb.png"});await p.close();}
// 英文、360 大字
{const p=await mk({lang:"en",w:360,fs:"1.65"});
 await p.click("#clubEntry");await p.waitForTimeout(700);
 let t=await uiTxt(p);ok(/My clubs/.test(t)&&/Find a club/.test(t)&&!/[一-鿿]/.test(t)&&/週末山友會/.test(await txt(p)),"en list translated: "+t.replace(/\n/g," | ").slice(0,200));
 await p.screenshot({path:O+"en-list.png"});
 await p.click('.club-row[data-id="c1"]');await p.waitForTimeout(900);
 t=await uiTxt(p);ok(/This week/.test(t)&&/hikes/.test(t)&&!/[一-鿿]/.test(t),"en club page translated: "+t.replace(/\n/g," | ").slice(0,240));
 ok(await p.evaluate(()=>document.querySelector(".pv").scrollWidth<=document.querySelector(".pv").clientWidth+1),"no horizontal overflow at 360/1.65");
 await p.screenshot({path:O+"en-club.png"});await p.close();}
console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails);await b.close();srv.kill();})();
