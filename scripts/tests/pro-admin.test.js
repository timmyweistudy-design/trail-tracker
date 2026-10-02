// 自動化測試（瀏覽器）：免費／PRO 分界、路況回報檢舉、步道人氣冷啟動、管理後台
const __path=require("path"),__fs=require("fs");
const __out=p=>{const full=__path.join(__dirname,"out",p);__fs.mkdirSync(p.endsWith("/")?full:__path.dirname(full),{recursive:true});return p.endsWith("/")?full+"/":full;};
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");const fs=require("fs");
const MOCK=fs.readFileSync(__dirname+"/soc-mock.js","utf8");const O=__out("pro/");
const errs=[];let fails=0;const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m);if(!c)fails++;};
(async()=>{const srv=spawn("python3",["-m","http.server","8891"],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch();
const mk=async(o={})=>{const ctx=await b.newContext({viewport:{width:390,height:844},geolocation:{latitude:24.93,longitude:121.69},permissions:["geolocation"]});const p=await ctx.newPage();p.on("pageerror",e=>errs.push(e.message));
 await p.addInitScript(o=>{if(o.free)window.PERSONAL_MODE=false;if(sessionStorage.getItem("x"))return;sessionStorage.setItem("x","1");localStorage.setItem("tt_lang",o.lang||"zh");["tt_onboarded_v2","tt_coach_trail","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_locperm_prompted","tt_coach_team","tt_coach_soc_friends","tt_coach_soc_explore","tt_coach_soc_search","tt_coach_soc_notif","tt_coach_soc_me"].forEach(k=>localStorage.setItem(k,"1"));for(const k in (o.ls||{}))localStorage.setItem(k,o.ls[k]);},o);
 await p.addInitScript(MOCK);await p.goto("http://localhost:8891/");await p.waitForTimeout(2600);
 if(o.login)await p.evaluate(m=>window.__installFakeSupa(m),o.mock||{});
 await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));return p;};
// ── 免費版：裝扮可開、頭巾可戴、其他配件要 PRO ──
{const p=await mk({free:true,ls:{tt_pet_hats_owned:JSON.stringify(["none","bandana","straw"])}});
 ok(await p.evaluate(()=>!Premium.isOn()),"free user (personal mode off)");
 await p.evaluate(()=>openHatPicker());await p.waitForTimeout(600);
 ok(await p.evaluate(()=>!!document.querySelector('[data-ov="pethat"]')),"free user can open dress-up");
 ok(await p.evaluate(()=>!document.querySelector('.hat-opt[data-hat="bandana"]').classList.contains("locked")&&!document.querySelector('.hat-opt[data-hat="straw"] .pro-tag')&&document.querySelector('.hat-opt[data-hat="party"] .pro-tag')),"bandana + already-owned straw usable; unowned hats show PRO");
 await p.screenshot({path:O+"hats-free.png"});
 await p.click('.hat-opt[data-hat="bandana"]');await p.waitForTimeout(300);ok(await p.evaluate(()=>localStorage.getItem("tt_pet_hat")==="bandana"),"free user wears the earned bandana");
 await p.click('.hat-opt[data-hat="party"]');await p.waitForTimeout(500);
 ok(await p.evaluate(()=>localStorage.getItem("tt_pet_hat")==="bandana"&&!!document.querySelector(".premium-mask")),"PRO hat → upgrade sheet, not equipped");
 const pm=await p.evaluate(()=>document.querySelector(".premium-card").innerText);
 ok(/安全功能永遠免費/.test(pm)&&/留守人/.test(pm)&&/求救卡/.test(pm)&&/主畫面小工具/.test(pm)&&/山行故事/.test(pm),"upgrade sheet: always-free safety list + new PRO items");
 await p.evaluate(()=>document.querySelector(".premium-card").scrollTop=0);await p.screenshot({path:O+"upgrade.png"});
 await p.evaluate(()=>document.querySelectorAll(".premium-mask,.pet-modal").forEach(e=>e.remove()));
 // 安全功能免費：留守人、求救卡、原路返回不跳付費
 await p.evaluate(()=>document.querySelector('.tab[data-view="record"]').click());await p.waitForTimeout(500);
 await p.evaluate(()=>Guardian.openSheet());await p.waitForTimeout(600);ok(await p.evaluate(()=>!!document.querySelector('[data-ov="guard"]')&&!document.querySelector(".premium-mask")),"free: guardian opens");await p.keyboard.press("Escape");await p.waitForTimeout(300);
 await p.evaluate(()=>Outdoor.openSos());await p.waitForTimeout(800);ok(await p.evaluate(()=>!document.querySelector(".premium-mask")),"free: SOS card opens");await p.keyboard.press("Escape");
 // PRO 功能會擋：年度故事、3D
 await p.evaluate(()=>document.querySelector('.tab[data-view="me"]').click());await p.waitForTimeout(500);
 await p.evaluate(()=>document.getElementById("btnYearReview").click());await p.waitForTimeout(500);ok(await p.evaluate(()=>!!document.querySelector(".premium-mask")),"free: year review → upgrade");
 await p.close();}
// ── 小工具：免費版送 locked ──
{const p=await mk({free:true});
 await p.evaluate(()=>{window.__calls=[];});
 const d=await p.evaluate(async()=>{let got=null;const C=window.Capacitor;window.Capacitor={isNativePlatform:()=>true,getPlatform:()=>"ios",Plugins:{},registerPlugin:()=>({available:async()=>({live:true,widget:true}),setWidget:async a=>{got=a;return{ok:true};}})};NativeLive._reset();await NativeLive.pushWidget(true);window.Capacitor=C;return got&&JSON.parse(got.data);});
 ok(d&&d.locked===true&&d.labels.locked,"free: widget data marked locked");
 await p.close();}
{const p=await mk({});
 const d=await p.evaluate(async()=>{let got=null;window.Capacitor={isNativePlatform:()=>true,getPlatform:()=>"ios",Plugins:{},registerPlugin:()=>({available:async()=>({live:true,widget:true}),setWidget:async a=>{got=a;return{ok:true};}})};NativeLive._reset();await NativeLive.pushWidget(true);return got&&JSON.parse(got.data);});
 ok(d&&d.locked===false,"PRO (personal mode): widget unlocked");
 await p.close();}
// ── 路況回報檢舉 ──
{const p=await mk({login:1});
 await p.evaluate(()=>{window.__fakeT.trail_reports=[{id:"t1",trail_id:"forestry-004",kind:"tree",note:"廣告內容",author_name:"阿梅",created_at:new Date().toISOString(),is_mine:false},{id:"t2",trail_id:"forestry-004",kind:"ok",author_name:"我",created_at:new Date().toISOString(),is_mine:true}];window.__flags=[];const F=Supa.client();const from=F.from;F.from=t=>{const q=from(t);if(t==="trail_report_flags"){const ins=q.insert;q.insert=row=>{window.__flags.push(row);return ins.call(q,row);};}return q;};});
 await p.evaluate(()=>openDetail("forestry-004"));await p.waitForTimeout(2200);
 ok(await p.evaluate(()=>document.querySelectorAll("#trailReportBox .trp-flag").length===1&&document.querySelectorAll("#trailReportBox .trp-del").length===1),"others' reports have 檢舉, mine have 刪除");
 await p.evaluate(()=>document.querySelector("#trailReportBox .trp-flag").click());await p.waitForTimeout(500);
 await p.screenshot({path:O+"flag-choice.png"});
 await p.evaluate(()=>{const b=[...document.querySelectorAll(".ttdlg-ov button")].find(x=>/廣告或洗版/.test(x.textContent));if(b)b.click();});await p.waitForTimeout(600);
 const f=await p.evaluate(()=>window.__flags[0]);ok(f&&f.report_id==="t1"&&f.reason==="spam"&&f.reporter_id==="me","flag inserted with reason code");
 ok(await p.evaluate(()=>document.querySelector("#trailReportBox .trp-flag").textContent==="已檢舉"&&document.querySelector("#trailReportBox .trp-flag").disabled),"button shows 已檢舉");
 // 人氣冷啟動
 await p.evaluate(()=>{closeDetail();window.__fakeT.crowd={hikers7:0,hikers30:0,year_hikers:0,grid:null};window.__fakeT.activity=null;});await p.waitForTimeout(300);
 await p.evaluate(()=>openDetail("forestry-027"));await p.waitForTimeout(1800);
 ok(await p.evaluate(()=>{const b=document.getElementById("activityBox");return b&&!b.hidden&&/走完會匿名幫忙累積/.test(b.innerText)&&!b.querySelector(".crowd-grid");}),"cold-start hint shown, no numbers");
 await p.close();}
// ── 管理後台（假資料） ──
{const p=await mk({login:1});
 await p.evaluate(()=>{const c=Supa.client();const rpc=c.rpc;c.rpc=async(n,a)=>{if(n==="admin_queue")return{data:[{kind:"report",id:"r1",created_at:new Date().toISOString(),author:"阿梅",body:"tree 垃圾",trail:"forestry-004",flags:3,reasons:"spam",hidden:true},{kind:"post",id:"p9",created_at:new Date().toISOString(),author:"許",body:"可疑貼文",trail:"某步道",flags:1,reasons:"騷擾",hidden:false}],error:null};if(n==="admin_errors")return{data:[{message:"TypeError: x is null",n:5,users:2,last_at:new Date().toISOString(),app_ver:"v519",ua:"iPhone"}],error:null};if(n==="admin_set_hidden"){window.__adm=a;return{data:null,error:null};}return rpc(n,a);};});
 await p.evaluate(()=>ensureScript("js/admin.js").then(()=>Admin.open("queue")));await p.waitForTimeout(1000);
 ok(await p.evaluate(()=>document.querySelectorAll('[data-ov="admin"] .adm-item').length===2),"admin queue lists items");
 await p.screenshot({path:O+"admin-queue.png"});
 await p.evaluate(()=>document.querySelector('[data-ov="admin"] .adm-tog[data-id="p9"]').click());await p.waitForTimeout(500);
 ok(await p.evaluate(()=>window.__adm&&window.__adm.p_kind==="post"&&window.__adm.p_hidden===true),"hide post calls admin_set_hidden");
 await p.evaluate(()=>document.querySelector('[data-ov="admin"] .pk-tab[data-t="errors"]').click());await p.waitForTimeout(600);
 ok(await p.evaluate(()=>/TypeError: x is null/.test(document.querySelector('[data-ov="admin"]').innerText)),"errors tab lists grouped errors");
 await p.screenshot({path:O+"admin-errors.png"});
 await p.close();}
// ── 英文 ──
{const p=await mk({free:true,lang:"en"});
 await p.evaluate(()=>Premium.gate());await p.waitForTimeout(800);
 const t=await p.evaluate(()=>document.querySelector(".pm-free").innerText);ok(!/[一-鿿]/.test(t),"en always-free block translated: "+t.replace(/\n/g," | "));
 await p.close();}
console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails);await b.close();srv.kill();})();
