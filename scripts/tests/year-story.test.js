// 自動化測試（瀏覽器）：npm run test:all 會依序跑；截圖輸出到 scripts/tests/out/（不進版控）
const __path=require("path"),__fs=require("fs");
const __out=p=>{const full=__path.join(__dirname,"out",p);__fs.mkdirSync(p.endsWith("/")?full:__path.dirname(full),{recursive:true});return p.endsWith("/")?full+"/":full;};
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");const fs=require("fs");const MOCK=fs.readFileSync(__dirname+"/soc-mock.js","utf8");const O=__out("w3/");
const errs=[];let fails=0;const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m);if(!c)fails++;};
const now=new Date();const mo=k=>{const d=new Date(now.getFullYear(),now.getMonth()-k,10,8);return d.toISOString();};
// 玉山主峰軌跡：從排雲走到主峰附近（主峰 23.47,120.957）
const ys={id:"ys1",date:mo(0),trailName:"玉山步道",trailId:"osm-13678202",distanceKm:10.9,elapsedMs:9*3.6e6,ascent:1100,track:[{lat:23.4870,lon:120.9330,t:1},{lat:23.4780,lon:120.9500,t:2},{lat:23.47005,lon:120.95735,t:3}]};
const simYs=Object.assign({},ys,{id:"ys2",sim:true});
const past=[1,2,3].flatMap(k=>[1,2,3,4].map(i=>({id:`p${k}${i}`,date:new Date(now.getFullYear(),now.getMonth()-k,i*5,8).toISOString(),trailName:"x",distanceKm:10,elapsedMs:3*3.6e6,ascent:300,track:[]})));
(async()=>{const srv=spawn("python3",["-m","http.server","8876"],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch();
const mk=async(o={})=>{const ctx=await b.newContext({viewport:{width:o.w||390,height:844},geolocation:{latitude:23.47,longitude:120.957},permissions:["geolocation"]});const p=await ctx.newPage();await require(__dirname+"/fake-weather")(p);if(o.clock)await p.clock.install({time:o.clock});p.on("pageerror",e=>errs.push(e.message));
 if(o.routeCond)await ctx.route(/workers\.dev/,r=>o.routeCond==="fail"?r.abort():r.fulfill({status:200,contentType:"application/json",body:JSON.stringify(o.routeCond)}));
 await p.addInitScript(o=>{if(sessionStorage.getItem("x"))return;sessionStorage.setItem("x","1");localStorage.setItem("tt_lang",o.lang||"zh");["tt_onboarded_v2","tt_coach_trail","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_locperm_prompted","tt_coach_team","tt_coach_soc_friends","tt_coach_soc_explore","tt_coach_soc_search","tt_coach_soc_notif","tt_coach_soc_me"].forEach(k=>localStorage.setItem(k,"1"));for(const k in (o.ls||{}))localStorage.setItem(k,o.ls[k]);},o);
 await p.addInitScript(()=>{document.addEventListener("DOMContentLoaded",()=>new MutationObserver(()=>document.querySelectorAll(".tour").forEach(e=>e.remove())).observe(document.body,{childList:true,subtree:true}));});await p.addInitScript(MOCK);await p.goto("http://localhost:8876/");await p.waitForTimeout(2500);
 if(o.login)await p.evaluate(m=>window.__installFakeSupa(m),o.mock||{});
 await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));return p;};
// 一整年的假紀錄：玉山（有軌跡、會蓋章）、常走的步道、各月份
const Y=new Date().getFullYear();
const mkr=(i,m,d,h,km,asc,name,tid,extra)=>Object.assign({id:"y"+i,date:new Date(Y,m,d,h+Math.floor(km/3),0).toISOString(),trailName:name,trailId:tid,distanceKm:km,elapsedMs:Math.floor(km/3)*3.6e6+1800e3,ascent:asc,steps:Math.round(km*1350),altHigh:asc+300,track:[]},extra||{});
const ys={track:[{lat:23.4870,lon:120.9330,t:1},{lat:23.4800,lon:120.9450,t:2},{lat:23.4750,lon:120.9520,t:3},{lat:23.47005,lon:120.95735,t:4}],altHigh:3952};
const recs=[mkr(1,0,6,6,8.2,520,"金瓜寮魚蕨步道","forestry-004"),mkr(2,2,9,6,6.1,300,"金瓜寮魚蕨步道","forestry-004"),mkr(3,3,13,5,10.9,1100,"玉山步道","osm-13678202",ys),mkr(4,3,27,6,5,250,"金瓜寮魚蕨步道","forestry-004"),mkr(5,4,4,7,12.3,800,"自由路線",null),mkr(6,6,12,6,7.7,410,"拳頭姆自然步道","forestry-027"),mkr(7,8,6,5,9.4,600,"金瓜寮魚蕨步道","forestry-004"),mkr(8,8,20,6,4.2,180,"自由路線",null)].filter(r=>new Date(r.date)<new Date());
{const p=await mk({ls:{tt_records:JSON.stringify(recs),tt_set_open:"[]",tt_pet_name:"小苔"}});
 await p.evaluate(()=>{window.__saved=[];window.saveBlob=async(b,n)=>{window.__saved.push({n,size:b.size,type:b.type});return "saved";};});
 await p.click('.tab[data-view="me"]');await p.waitForTimeout(800);
 await p.click("#btnYearReview");await p.waitForTimeout(1200);
 ok(await p.evaluate(()=>!!document.getElementById("yrPlay")),"year review has 播放山行故事");
 await p.click("#yrPlay");await p.waitForTimeout(1200);
 ok(await p.evaluate(()=>!!document.querySelector('[data-ov="story"]')&&!document.querySelector('[data-ov="year"]')),"story opens, review closes");
 const keys=await p.evaluate(()=>YearStory.pages(YearStory.collect(new Date().getFullYear())).map(x=>x.key));
 ok(keys[0]==="cover"&&keys[keys.length-1]==="sum"&&keys.includes("dist")&&keys.includes("months")&&keys.includes("persona")&&keys.includes("fav"),"pages: "+keys.join(","));
 const hasPeak=keys.includes("peaks");ok(hasPeak,"Yushan record → peaks page");
 const n=keys.length;
 ok(await p.evaluate(n=>document.querySelectorAll(".ys-bars span").length===n,n),"one progress bar per page");
 for(let k=0;k<n;k++){
   const txt=await p.evaluate(()=>document.querySelector(".ys-stage").innerText);
   if(k===0)ok(/我的山行故事/.test(txt),"cover text");
   await p.screenshot({path:O+`story-${k}-${keys[k]}.png`});
   if(k<n-1){const box=await p.$(".ys-stage");const bb=await box.boundingBox();await p.mouse.click(bb.x+bb.width*0.85,bb.y+bb.height*0.5);await p.waitForTimeout(700);}
 }
 ok(await p.evaluate(n=>document.querySelector(".ys-count").textContent===`${n} / ${n}`,n),"tapped through to last page");
 const box=await p.$(".ys-stage");const bb=await box.boundingBox();await p.mouse.click(bb.x+bb.width*0.1,bb.y+bb.height*0.5);await p.waitForTimeout(500);
 ok(await p.evaluate(n=>document.querySelector(".ys-count").textContent===`${n-1} / ${n}`,n),"tap left → previous page");
 await p.keyboard.press("ArrowLeft");await p.waitForTimeout(300);ok(await p.evaluate(n=>document.querySelector(".ys-count").textContent===`${n-2} / ${n}`,n),"ArrowLeft → previous");
 // 自動往下一頁
 await p.evaluate(()=>{});const c0=await p.evaluate(()=>document.querySelector(".ys-count").textContent);await p.waitForTimeout(7600);const c1=await p.evaluate(()=>document.querySelector(".ys-count").textContent);
 ok(c0!==c1,"auto-advances after ~7s ("+c0+" → "+c1+")");
 // 每頁存圖
 for(let k=0;k<n;k++){await p.evaluate(k=>{const o=document.querySelector('[data-ov="story"]');},k);}
 await p.keyboard.press("ArrowLeft");await p.waitForTimeout(200);
 await p.click(".ys-share");await p.waitForTimeout(2500);
 let s=await p.evaluate(()=>window.__saved);ok(s.length===1&&s[0].type==="image/png"&&s[0].size>20000,"share page → PNG "+JSON.stringify(s[0]||{}));
 // 每一頁都畫得出 1080×1920
 const dims=await p.evaluate(async()=>{const d=YearStory.collect(new Date().getFullYear());const out=[];for(const pg of YearStory.pages(d)){const c=await YearStory.drawPage(pg,d);out.push(pg.key+":"+c.width+"x"+c.height);}return out;});
 ok(dims.every(x=>/1080x1920$/.test(x)),"every page renders 1080×1920: "+dims.length);
 // 存一張摘要圖看看
 const png=await p.evaluate(async()=>{const d=YearStory.collect(new Date().getFullYear());const ps=YearStory.pages(d);const out={};for(const k of ["sum","months","fav","peaks","cover"]){const pg=ps.find(x=>x.key===k);if(!pg)continue;const c=await YearStory.drawPage(pg,d);out[k]=c.toDataURL("image/png");}return out;});
 for(const k in png)require("fs").writeFileSync(O+`story-img-${k}.png`,Buffer.from(png[k].split(",")[1],"base64"));
 await p.keyboard.press("Escape");await p.waitForTimeout(300);ok(await p.evaluate(()=>!document.querySelector('[data-ov="story"]')),"Esc closes story");
 await p.close();}
// 年底橫幅（12 月）
{const ctx0=null;const p=await mk({ls:{tt_records:JSON.stringify(recs),tt_set_open:"[]"},clock:new Date(Y,11,10,9).getTime()});
 await p.click('.tab[data-view="me"]');await p.waitForTimeout(900);
 const t=await p.evaluate(()=>{const b=document.getElementById("meStory");return b?b.innerText:""});
 ok(new RegExp(`你的 ${Y} 山行故事出爐了`).test(t),"December banner: "+t.split("\n")[0]);
 await p.screenshot({path:O+"story-banner.png"});
 await p.click("#sbOpen");await p.waitForTimeout(1500);ok(await p.evaluate(()=>!!document.querySelector('[data-ov="story"]')),"banner opens story");
 await p.keyboard.press("Escape");await p.waitForTimeout(300);
 await p.click("#sbX");await p.waitForTimeout(200);ok(await p.evaluate(()=>!document.querySelector(".story-banner")),"banner dismissed");
 await p.evaluate(()=>renderStats());ok(await p.evaluate(()=>!document.querySelector(".story-banner")),"stays dismissed");
 await p.close();}
{const p=await mk({ls:{tt_records:JSON.stringify(recs)},clock:new Date(Y,5,10,9).getTime()});await p.click('.tab[data-view="me"]');await p.waitForTimeout(800);
 ok(await p.evaluate(()=>!document.querySelector(".story-banner")),"no banner in June");await p.close();}
// 英文
{const p=await mk({lang:"en",ls:{tt_records:JSON.stringify(recs),tt_pet_name:"Moss"}});
 await p.evaluate(()=>ensureScript("js/analytics.js").then(()=>ensureScript("js/year-story.js")));await p.waitForTimeout(800);
 await p.evaluate(()=>YearStory.open(new Date().getFullYear()));await p.waitForTimeout(800);
 const n=await p.evaluate(()=>document.querySelectorAll(".ys-bars span").length);let bad=[];
 for(let k=0;k<n;k++){await p.evaluate(()=>window.dispatchEvent(new Event("x")));const t=await p.evaluate(()=>document.querySelector(".ys-stage").innerText.replace(/金瓜寮魚蕨步道|拳頭姆自然步道|玉山步道/g,""));if(/[一-鿿]/.test(t))bad.push(k+":"+(t.match(/[^\n]*[一-鿿][^\n]*/)||[""])[0]);if(k===1||k===n-1)await p.screenshot({path:O+`story-en-${k}.png`});await p.keyboard.press("ArrowRight");await p.waitForTimeout(500);}
 ok(!bad.length,"en story translated "+bad.join(" | "));
 await p.close();}
console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails);await b.close();srv.kill();})();
