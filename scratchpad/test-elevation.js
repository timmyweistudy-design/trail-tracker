const E = require("/mnt/c/Users/timmy/projects/trail-tracker/web/js/elevation.js");
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.error("FAIL", m, "got", JSON.stringify(a)); process.exitCode = 1; } else console.log("ok", m); };

// 純爬升
eq(E.recompute([100, 105, 110, 120]), { ascent: 20, descent: 0, altHigh: 120, altLow: 100 }, "pure ascent");
// 上下：小於 2m 門檻的抖動不計
eq(E.recompute([100, 101, 100, 101, 100]), { ascent: 0, descent: 0, altHigh: 101, altLow: 100 }, "tiny noise ignored");
// 上山再下山
eq(E.recompute([100, 150, 120]), { ascent: 50, descent: 30, altHigh: 150, altLow: 100 }, "up then down");
// 降取樣保留首尾
const t = []; for (let i = 0; i < 500; i++) t.push({ lat: i * 0.001, lon: 120 });
const ds = E.downsample(t, 200);
eq(ds.length, 200, "downsample to 200");
eq([ds[0].lat, ds[ds.length - 1].lat], [t[0].lat, t[t.length - 1].lat], "keep endpoints");
console.log("done");
