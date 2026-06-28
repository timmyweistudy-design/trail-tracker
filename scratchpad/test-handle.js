const Handle = require("/mnt/c/Users/timmy/projects/trail-tracker/web/js/social/handle.js");
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.error("FAIL", m, "got", JSON.stringify(a)); process.exitCode = 1; } else console.log("ok", m); };

eq(Handle.validate("Tim_99").ok, true, "valid mixed→normalized");
eq(Handle.validate("Tim_99").handle, "tim_99", "normalized lowercase");
eq(Handle.validate("ab").ok, false, "too short");
eq(Handle.validate("a".repeat(21)).ok, false, "too long");
eq(Handle.validate("has space").ok, false, "no space");
eq(Handle.validate("王小明").ok, false, "no CJK");
eq(Handle.validate("  Hiker_Tim ").handle, "hiker_tim", "trim+lower");
console.log("done");
