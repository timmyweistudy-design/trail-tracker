// 真機錄影分析（2026-10-07 寵物新一輪 #25）：使用者傳來的螢幕錄影 → 一張縮圖總表＋「跳格」清單。
// 這幾輪找「閃兩下」「前後抖一下」都是手動拆格、一張一張看；改成固定流程：
//   node scripts/pet-video.js 影片.mp4 [--fps 30] [--crop x,y,w,h] [--from 秒] [--to 秒] [--out 資料夾]
// 輸出：<out>/sheet.png（每 0.2 秒一格的總表，左上角是秒數）、<out>/f0001.png…（指定區段的每一格）、
//       終端機印出「變化量」突然比前後大很多的格（＝畫面跳了一下），附秒數與格號，直接去看那幾張
// ffmpeg：環境變數 FFMPEG、PATH 上的 ffmpeg、或裝了 ffmpeg-static 都可以
const { execFileSync, spawnSync } = require("child_process"), fs = require("fs"), path = require("path");
const args = process.argv.slice(2), opt = k => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : null; };
const src = args.find(a => !a.startsWith("--") && !args[args.indexOf(a) - 1]?.startsWith("--"));
if (!src || !fs.existsSync(src)) { console.log("用法：node scripts/pet-video.js 影片.mp4 [--fps 30] [--crop x,y,w,h] [--from 秒] [--to 秒] [--out 資料夾]"); process.exit(1); }
const FF = process.env.FFMPEG || (() => { try { return require("ffmpeg-static"); } catch (e) { return "ffmpeg"; } })();
const out = opt("out") || path.join(path.dirname(src), path.basename(src).replace(/\.\w+$/, "") + "-frames");
fs.mkdirSync(out, { recursive: true });
const fps = +(opt("fps") || 30), crop = opt("crop"), from = opt("from"), to = opt("to");
const range = [...(from ? ["-ss", from] : []), ...(to ? ["-to", to] : [])];
const cropF = crop ? `crop=${crop.split(",").join(":")},` : "";
// 1) 總表：每 0.2 秒一格、6 欄，左上角印秒數
const sheet = txt => spawnSync(FF, ["-y", "-loglevel", "error", ...range, "-i", src, "-vf", `${cropF}fps=5,scale=240:-2,${txt}tile=6x8`, "-frames:v", "1", path.join(out, "sheet.png")], { stdio: "ignore" }).status === 0;
if (!sheet("drawtext=text='%{pts\\:hms}':x=4:y=4:fontsize=14:fontcolor=white:box=1:boxcolor=black@0.5,")) sheet("");   // 有些 ffmpeg（ffmpeg-static）沒有 drawtext：就不印秒數（每格 0.2 秒，從左上往右數）
// 2) 每一格（指定區段；沒指定就前 6 秒，免得一支長影片拆出幾千張）
execFileSync(FF, ["-y", "-loglevel", "error", ...(from ? ["-ss", from] : []), "-i", src, "-t", to && from ? String(+to - +from) : (to || "6"), "-vf", `${cropF}fps=${fps}`, path.join(out, "f%04d.png")], { stdio: "inherit" });
// 3) 跳格：每一格跟前一格的差（ffmpeg 的 scene 分數），比前後兩格都大很多＝畫面突然跳一下（閃一格、抖一下）
const r = spawnSync(FF, ["-hide_banner", ...range, "-i", src, "-vf", `${cropF}fps=${fps},select='gte(scene,0)',metadata=print`, "-an", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 64 << 20 });
const sc = [...(r.stderr || "").matchAll(/scene_score=([\d.]+)/g)].map(m => +m[1]);
const t0 = +(from || 0), jumps = [];
for (let i = 1; i < sc.length - 1; i++) { const nb = Math.max(sc[i - 1], sc[i + 1]); if (sc[i] > .004 && sc[i] > nb * 2.5) jumps.push([i, sc[i], nb]); }
console.log(`總表：${path.join(out, "sheet.png")}　每格：${out}/f0001.png…　共分析 ${sc.length} 格（${fps} fps）`);
if (!jumps.length) console.log("沒有找到突然跳一下的格");
else { console.log("可能跳格（變化量比前後大 2.5 倍以上）："); jumps.sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([i, s, nb]) => console.log(`  第 ${i + 1} 格　${(t0 + i / fps).toFixed(2)} 秒　變化 ${s.toFixed(4)}（前後 ${nb.toFixed(4)}）`)); }
