// 用 vm 在假 DOM/Supabase 下載入社群模組，確認不丟例外。
const fs = require("fs"), vm = require("vm"), path = require("path");
const W = "/mnt/c/Users/timmy/projects/trail-tracker/web";
const el = () => ({ innerHTML: "", value: "", className: "", textContent: "", style: {}, addEventListener() {}, focus() {}, classList: { add() {}, remove() {}, contains: () => false } });
const sandbox = {
  console,
  document: { querySelector: () => el(), getElementById: () => el(), createElement: el, addEventListener() {} },
  location: { origin: "http://x", pathname: "/" },
  setTimeout, clearTimeout,
  window: {
    SUPABASE_URL: "http://x", SUPABASE_ANON_KEY: "y",
    supabase: { createClient: () => ({ auth: { onAuthStateChange() {}, getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }), signInWithOAuth: async () => ({}), signInWithOtp: async () => ({ error: null }), signOut: async () => ({}) }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }), insert: async () => ({ error: null }), update: () => ({ eq: async () => ({ error: null }) }) }) }) },
  },
};
sandbox.global = sandbox; sandbox.self = sandbox.window;
const ctx = vm.createContext(sandbox);
for (const f of ["js/social/supa.js", "js/social/handle.js", "js/social/media.js", "js/social/posts.js", "js/social/composer.js", "js/social/safety.js", "js/social/feed.js", "js/social/postview.js", "js/social/discover.js", "js/social/notifications.js", "js/social/lightbox.js", "js/social/auth.js", "js/social/profiles.js", "js/social/social-ui.js"]) {
  try { vm.runInContext(fs.readFileSync(path.join(W, f), "utf8"), ctx, { filename: f }); console.log("loaded", f); }
  catch (e) { console.error("THREW in", f, e.message); process.exitCode = 1; }
}
console.log("ALL SOCIAL MODULES LOADED ✓");
