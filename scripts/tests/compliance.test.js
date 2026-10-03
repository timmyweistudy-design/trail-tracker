// 授權與上架合規：不當字詞、社群規範同意、iNaturalist 照片授權＋署名、Open-Meteo 商用金鑰、Google Places 不長期存、Apple 登入、使用條款頁
const __path=require("path"),__fs=require("fs");
const __out=p=>{const full=__path.join(__dirname,"out",p);__fs.mkdirSync(p.endsWith("/")?full:__path.dirname(full),{recursive:true});return p.endsWith("/")?full+"/":full;};
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");
const O=__out("comp/");const MOCK=__fs.readFileSync(__dirname+"/soc-mock.js","utf8");const errs=[];let fails=0;const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m);if(!c)fails++;};
(async()=>{const srv=spawn("python3",["-m","http.server","8897"],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch();
const mk=async(o={})=>{const ctx=await b.newContext({viewport:{width:390,height:844}});const p=await ctx.newPage();await require(__dirname+"/fake-weather")(p);p.on("pageerror",e=>errs.push(e.message));
 const seen=p.__seen=[];p.on("request",r=>seen.push(r.url()));
 await p.route(/api\.inaturalist\.org/,r=>r.fulfill({status:200,contentType:"application/json",body:JSON.stringify({results:[
  {id:1,uri:"https://www.inaturalist.org/observations/1",observed_on:"2026-09-01",user:{login:"bird_lee",name:"李小鳥"},taxon:{name:"Garrulax taewanus",preferred_common_name:"台灣畫眉"},photos:[{url:"https://x/square.jpg",license_code:"cc-by"}]},
  {id:2,observed_on:"2026-09-02",user:{login:"nc_guy"},taxon:{name:"Urocissa caerulea",preferred_common_name:"台灣藍鵲"},photos:[{url:"https://x/nc/square.jpg",license_code:"cc-by-nc"}]}]})}));
 await p.route(/places\.googleapis\.com/,r=>r.fulfill({status:200,contentType:"application/json",body:JSON.stringify({places:[{displayName:{text:"山腳小吃"},location:{latitude:24.45,longitude:121.75},rating:4.5,userRatingCount:120,primaryType:"restaurant",primaryTypeDisplayName:{text:"餐廳"},googleMapsUri:"https://maps.google.com/?cid=1"}]})}));
 await p.addInitScript(o=>{if(o.key)window.OPEN_METEO_KEY_TEST=o.key;if(o.apple)window.__apple=1;if(sessionStorage.getItem("seed"))return;sessionStorage.setItem("seed","1");localStorage.setItem("tt_lang",o.lang||"zh");["tt_onboarded_v2","tt_coach_trail","tt_locperm_prompted","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_coach_team","tt_coach_soc_friends","tt_coach_soc_explore","tt_coach_soc_search","tt_coach_soc_notif","tt_coach_soc_me"].forEach(k=>localStorage.setItem(k,"1"));localStorage.setItem("foodg_old","{\"ts\":1,\"items\":[]}");localStorage.setItem("amen_old","x");localStorage.setItem("tt_social","1");},o);
 await p.addInitScript(()=>{const iv=setInterval(()=>{if(window.OPEN_METEO_KEY!==undefined&&window.OPEN_METEO_KEY_TEST){window.OPEN_METEO_KEY=window.OPEN_METEO_KEY_TEST;clearInterval(iv);}if(window.SOCIAL_APPLE!==undefined&&window.__apple){window.SOCIAL_APPLE=true;}},1);setTimeout(()=>clearInterval(iv),8000);});
 await p.addInitScript(MOCK);await p.goto("http://localhost:8897/");await p.waitForTimeout(2300);
 await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));return p;};
{const p=await mk();
 // 字詞
 const bw=await p.evaluate(()=>[["今天走樹幹步道，幹線旁停車",ttBadWord("今天走樹幹步道，幹線旁停車")],["shitake mushroom, Dickson",ttBadWord("shitake mushroom, Dickson")],["幹你娘",ttBadWord("幹你娘")],["FUCK this",ttBadWord("FUCK this")],["加入娛樂城",ttBadWord("x","加入娛樂城")]]);
 ok(!bw[0][1]&&!bw[1][1]&&bw[2][1]&&bw[3][1]&&bw[4][1],"bad-word filter: no false positives, catches slurs "+JSON.stringify(bw.map(x=>x[1])));
 ok(await p.evaluate(()=>!localStorage.getItem("foodg_old")&&!localStorage.getItem("amen_old")),"old Google Places caches cleared on load");
 // 社群規範：回報路況前要同意
 await p.evaluate(()=>window.__installFakeSupa({}));
 await p.evaluate(()=>{const t=TRAILS.find(x=>x.source==="forestry");TrailReports.openForm(t);});await p.waitForTimeout(800);
 await p.click(".trp-k");await p.fill("#trpNote","前面有倒木");await p.click("#trpSend");await p.waitForTimeout(500);
 const dlg=await p.evaluate(()=>{const d=document.querySelector(".ttdlg");return d&&d.innerText});
 ok(dlg&&/社群規範/.test(dlg)&&/24 小時/.test(dlg)&&/完整使用條款/.test(dlg),"rules dialog shown before first report");
 await p.screenshot({path:O+"rules.png"});
 await p.click(".ttdlg .btn.ghost");await p.waitForTimeout(400);
 ok(await p.evaluate(()=>!localStorage.getItem("tt_rules_ok")&&!window.__lastInsert),"decline → nothing sent");
 await p.click("#trpSend");await p.waitForTimeout(400);await p.click(".ttdlg .btn.primary");await p.waitForTimeout(1200);
 ok(await p.evaluate(()=>localStorage.getItem("tt_rules_ok")==="1"&&window.__lastInsert&&window.__lastInsert.note==="前面有倒木"),"agree → stored + report sent");
 // 第二次不再問；有髒字擋下
 await p.evaluate(()=>{window.__lastInsert=null;const t=TRAILS.find(x=>x.source==="forestry");TrailReports.openForm(t);});await p.waitForTimeout(800);
 await p.click(".trp-k");await p.fill("#trpNote","雞掰路");await p.click("#trpSend");await p.waitForTimeout(500);
 ok(await p.evaluate(()=>!document.querySelector(".ttdlg")&&!window.__lastInsert&&/不適當/.test(document.getElementById("toast").textContent)),"second time: no dialog; bad word blocked with toast");
 await p.keyboard.press("Escape");await p.waitForTimeout(400);
 // iNaturalist：只顯示可商用照片＋署名
 await p.evaluate(()=>openDetail("forestry-004"));await p.waitForTimeout(900);
 const inat=await p.evaluate(async()=>await Ecology.nearbyObservations(24.4,121.7));
 ok(inat.length===2&&inat[0].thumb&&inat[0].credit==="© 李小鳥 · CC BY"&&!inat[1].thumb&&!inat[1].credit,"iNat: CC BY photo credited, NC photo dropped "+JSON.stringify(inat.map(x=>[x.thumb,x.credit])));
 ok(p.__seen.some(u=>/inaturalist.*photo_license=cc0,cc-by,cc-by-sa/.test(u)),"iNat request asks for commercial-safe licenses only");
 // Google Places：不寫進 localStorage
 await p.evaluate(async()=>{await Food.nearby(TRAILS.find(x=>x.id==="forestry-004"));});
 ok(await p.evaluate(()=>!Object.keys(localStorage).some(k=>/^(foodg|attrg|amen)/.test(k))),"Places results not persisted to localStorage");
 ok(p.__seen.some(u=>/api\.open-meteo\.com/.test(u))&&!p.__seen.some(u=>/customer-api/.test(u)),"no key → free Open-Meteo endpoint");
 // 設定頁連結
 await p.keyboard.press("Escape");await p.waitForTimeout(600);
 await p.evaluate(()=>{window.__opened=[];window.open=u=>{window.__opened.push(u);};});
 await p.click('.tab[data-view="social"]');await p.waitForTimeout(1500);await p.evaluate(()=>SocialUI.go("me"));await p.waitForTimeout(900);
 await p.click("#pfSettings");await p.waitForTimeout(900);
 await p.click("#stTerms");await p.waitForTimeout(900);
 ok(await p.evaluate(()=>{const f=document.querySelector('[data-ov="doc"] iframe');return f&&/terms\.html$/.test(f.getAttribute("src"))&&!window.__opened.length&&/零容忍/.test(f.contentDocument.body.innerText)}),"settings → terms in in-app panel (not a new page)");
 await p.screenshot({path:O+"doc.png"});
 await p.click("#docX");await p.waitForTimeout(300);ok(await p.evaluate(()=>!document.querySelector('[data-ov="doc"]')&&!!document.getElementById("stPrivacy")),"✕ closes panel, back on settings");
 await p.click("#stPrivacy");await p.waitForTimeout(500);ok(await p.evaluate(()=>/privacy\.html$/.test(document.querySelector('[data-ov="doc"] iframe').getAttribute("src"))),"privacy opens in panel");
 await p.keyboard.press("Escape");await p.waitForTimeout(300);ok(await p.evaluate(()=>!document.querySelector('[data-ov="doc"]')&&!!document.getElementById("stPrivacy")),"Esc closes only the panel");
 // 從社群規範對話框裡點「完整使用條款」：疊在上面，關掉後對話框還在
 await p.evaluate(()=>{localStorage.removeItem("tt_rules_ok");window.__gate=ttRulesGate();});await p.waitForTimeout(400);
 await p.click(".rules-link");await p.waitForTimeout(500);
 ok(await p.evaluate(()=>{const d=document.querySelector('[data-ov="doc"]'),g=document.querySelector(".ttdlg-ov");return d&&g&&+getComputedStyle(d).zIndex>+getComputedStyle(g).zIndex}),"terms panel opens above rules dialog");
 await p.keyboard.press("Escape");await p.waitForTimeout(300);
 ok(await p.evaluate(()=>!document.querySelector('[data-ov="doc"]')&&!!document.querySelector(".ttdlg-ov")),"Esc closes panel, rules dialog stays");
 await p.click(".ttdlg .btn.primary");await p.waitForTimeout(300);
 await p.close();}
// 管理提醒通知（phase36）：通知頁顯示、點了開管理頁
{const p=await mk();await p.evaluate(()=>{window.__installFakeSupa({});window.__fakeT.notifications.unshift({id:"na",user_id:"me",type:"admin",actor_id:null,post_id:null,read:false,created_at:new Date().toISOString(),actor:null});});
 await p.click('.tab[data-view="social"]');await p.waitForTimeout(1500);await p.evaluate(()=>SocialUI.go("notif"));await p.waitForTimeout(1200);
 const t=await p.evaluate(()=>{const n=document.querySelector('.notif[data-type="admin"]');return n&&n.innerText});
 ok(t&&/管理提醒/.test(t)&&!/有人/.test(t),"admin digest notification rendered: "+String(t).replace(/\n/g," "));
 await p.click('.notif[data-type="admin"]');await p.waitForTimeout(1500);
 ok(await p.evaluate(()=>!!document.querySelector('[data-ov="admin"]')),"tap opens admin panel");
 await p.close();}
// 第三方登入被擋（註冊關閉）回跳：要講人話、清網址
{const ctx=await b.newContext({viewport:{width:390,height:844}});const p=await ctx.newPage();await require(__dirname+"/fake-weather")(p);p.on("pageerror",e=>errs.push(e.message));
 await p.addInitScript(()=>{["tt_onboarded_v2","tt_coach_trail","tt_locperm_prompted","tt_coach_soc_friends"].forEach(k=>localStorage.setItem(k,"1"));localStorage.setItem("tt_social","1");});
 await p.addInitScript(MOCK);
 await p.goto("http://localhost:8897/?error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed+for+this+instance");await p.waitForTimeout(2300);
 await p.evaluate(()=>{document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove());window.__installFakeSupa({loggedOut:true});});
 await p.click('.tab[data-view="social"]');await p.waitForTimeout(2000);
 const tt=await p.evaluate(()=>[document.getElementById("toast").textContent,location.search]);
 ok(/不開放註冊/.test(tt[0])&&tt[1]==="","signup-disabled redirect → clear message + URL cleaned "+JSON.stringify(tt));
 await ctx.close();}
// 商用金鑰 → customer-api
{const p=await mk({key:"TESTKEY"});await p.evaluate(()=>Weather.get(24.1,121.1));await p.waitForTimeout(300);
 ok(p.__seen.some(u=>/customer-api\.open-meteo\.com\/v1\/forecast\?.*apikey=TESTKEY/.test(u)),"OPEN_METEO_KEY → customer-api with apikey");await p.close();}
// Apple 登入
{const p=await mk({apple:1});await p.evaluate(()=>window.__installFakeSupa({loggedOut:true}));
 await p.evaluate(()=>{Supa.client().auth.signInWithOAuth=async a=>{window.__oauth=a;return {data:{url:"https://x"},error:null};};});
 await p.click('.tab[data-view="social"]');await p.waitForTimeout(1500);
 const order=await p.evaluate(()=>[...document.querySelectorAll(".social-auth .btn")].map(b=>b.id));
 ok(order[0]==="authApple"&&order.includes("authGoogle"),"Apple button first: "+order.join(","));
 await p.screenshot({path:O+"login.png"});
 await p.click("#authApple");await p.waitForTimeout(400);
 ok(await p.evaluate(()=>window.__oauth&&window.__oauth.provider==="apple"),"Apple button calls OAuth with provider apple");await p.close();}
// 使用條款頁
{const ctx=await b.newContext({viewport:{width:390,height:844}});const p=await ctx.newPage();await p.goto("http://localhost:8897/terms.html");
 const t=await p.evaluate(()=>document.body.innerText);ok(await p.evaluate(()=>/noindex/.test((document.querySelector('meta[name="robots"]')||{}).content||"")),"terms page noindex");
 ok(/112/.test(t)&&/零容忍/.test(t)&&/24 小時/.test(t)&&/zero tolerance/.test(t)&&/Apple Standard EULA/.test(t),"terms page has safety disclaimer, zero tolerance, EN version");
 ok(await p.evaluate(()=>document.documentElement.scrollWidth<=391),"terms page fits 390");await p.screenshot({path:O+"terms.png"});await ctx.close();}
console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails);await b.close();srv.kill();})();
