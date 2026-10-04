// 成就步道（js/achievements.js）2026-10-04 美化：徽章本體改 SVG（不再用 emoji，部分裝置是空框）、場景、清單、詳情、分享圖卡
const __path=require("path"),__fs=require("fs");
const ROOT=__path.resolve(__dirname,"../..");const {chromium}=require(ROOT+"/node_modules/playwright");const {spawn}=require("child_process");
const O=__path.join(__dirname,"out","ach");__fs.mkdirSync(O,{recursive:true});
const errs=[];let fails=0;const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m);if(!c)fails++;};
const PORT=8897;
(async()=>{const srv=spawn("python3",["-m","http.server",String(PORT)],{cwd:ROOT+"/web",stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));const b=await chromium.launch();
const mk=async(o={})=>{const ctx=await b.newContext({viewport:{width:390,height:844},reducedMotion:o.reduce?"reduce":"no-preference"});const p=await ctx.newPage();await require(__dirname+"/fake-weather")(p);p.on("pageerror",e=>errs.push(e.message));
 await p.addInitScript(o=>{localStorage.setItem("tt_lang",o.lang||"zh");["tt_onboarded_v2","tt_coach_trail","tt_locperm_prompted","tt_coach_record","tt_coach_record_tools","tt_coach_peaks","tt_coach_team","tt_coach_pet"].forEach(k=>localStorage.setItem(k,"1"));},o);
 await p.goto(`http://localhost:${PORT}/`);await p.waitForTimeout(2500);await p.evaluate(()=>document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e=>e.remove()));
 await p.evaluate(n=>{for(let i=0;i<n;i++){const d=new Date();d.setDate(d.getDate()-i*3);d.setHours(i%2?6:10);Store.addRecord({id:"dbg"+i,date:d.toISOString(),dbg:true,distanceKm:6+i%5,elapsedMs:3*3600e3,ascent:300+i*10,descent:300,steps:9000,kcal:400,track:[],trailId:TRAILS[i*7%TRAILS.length].id})}},o.recs==null?40:o.recs);
 return p;};

{const p=await mk();
 const r=await p.evaluate(()=>{const L=petBadges();return {n:L.length,noIcon:L.filter(b=>!ICON[ACH_ICON[b.n]]).map(b=>b.n),tiers:[...new Set(L.map(b=>b.t))].sort()};});
 ok(r.noIcon.length===0,"every badge has its own line icon (no emoji needed) "+JSON.stringify(r.noIcon));
 await p.evaluate(()=>openAchTree());await p.waitForTimeout(1500);
 const t=await p.evaluate(()=>{const mk=[...document.querySelectorAll(".ach3d-mk")];const emojiRe=/\p{Extended_Pictographic}/u;
  return {mk:mk.length,medals:document.querySelectorAll(".ach3d-mk .ach-medal").length,emoji:mk.filter(m=>emojiRe.test(m.textContent)).length,
   got:document.querySelectorAll(".ach3d-mk .ach-medal.got").length,locked:document.querySelectorAll(".ach3d-mk .ach-medal.locked").length};});
 ok(t.mk>0&&t.medals===t.mk&&t.emoji===0,"trail markers are SVG medals, no emoji glyphs "+JSON.stringify(t));
 ok(t.got>0&&t.locked>0,"both earned (ribbons) and locked (grey + lock) medals shown "+JSON.stringify(t));
 // 外框：高階的外形不一樣（圓 → 齒輪邊 → 放射星 → 八角星）
 const shapes=await p.evaluate(()=>{const L=petBadges();const pick=t=>L.find(b=>b.t===t);return [1,3,5,6].map(t=>{const d=document.createElement("div");d.innerHTML=achMedal(pick(t));return d.querySelector("path[fill^='url']").getAttribute("d").length;});});
 ok(new Set(shapes).size===4,"medal rim shape differs by tier "+shapes);
 // 清單與詳情
 await p.click("#achViewTog");await p.waitForTimeout(600);
 ok(await p.evaluate(()=>{const rows=document.querySelectorAll("#achList .ach-lemo");return rows.length>10&&[...rows].every(r=>r.querySelector(".ach-medal"));}),"list view uses medals too");
 await p.screenshot({path:O+"/list.png"});
 await p.click("#achViewTog");await p.waitForTimeout(500);
 await p.evaluate(()=>document.querySelector(".ach3d-mk.got").click());await p.waitForTimeout(500);
 ok(await p.evaluate(()=>!!document.querySelector(".ach3d-detail.show .ach-medal")),"detail card shows the medal");
 // 分享圖卡畫得出徽章（以前 canvas 上畫 emoji）
 const share=await p.evaluate(async()=>{let blob=null;const orig=window.saveBlob;window.saveBlob=async(bl)=>{blob=bl;return "saved"};try{await shareAchievement(petBadges().find(b=>b.got));for(let i=0;i<30&&!blob;i++)await new Promise(r=>setTimeout(r,100));}finally{window.saveBlob=orig}
  if(!blob)return {ok:false};const im=await createImageBitmap(blob);const c=document.createElement("canvas");c.width=im.width;c.height=im.height;const x=c.getContext("2d");x.drawImage(im,0,0);
  const d=x.getImageData(c.width/2-60,148,120,120).data;let warm=0;for(let k=0;k<d.length;k+=4)if(d[k]>150&&d[k+1]>100)warm++;return {ok:true,warm};});
 ok(share.ok&&share.warm>500,"share card draws the medal "+JSON.stringify(share));
 await p.close();}

console.log("ERRS",JSON.stringify(errs));console.log("FAILS",fails);await b.close();srv.kill();})();
