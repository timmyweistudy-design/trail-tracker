#!/usr/bin/env node
// 把「小工具擴充」（主畫面小工具＋鎖定畫面／動態島 Live Activity）加進 iOS 專案。
// 只在 Codemagic 建置時跑（codemagic.yaml：ENABLE_WIDGETS=1 才跑），repo 裡的 project.pbxproj 不動——
// 這樣還沒在 Apple 後台設好 App Group 之前，原本的 TestFlight 建置完全不受影響。
//
// 做的事（重跑不會重複加）：
//   1. 新 target「TrailWidgets」（app extension，iOS 16.2+），原始碼在 ios/App/TrailWidgets/
//   2. 共用的 ios/App/Shared/TrailActivityAttributes.swift 同時編進 App 和 TrailWidgets
//   3. App target 加 TrailLivePlugin.swift、MainViewController.swift；嵌入擴充；加相依
//   4. App 的 Info.plist 加 NSSupportsLiveActivities；App.entitlements 加 App Group
//   5. Main.storyboard 的主畫面改用 MainViewController（才註冊得到 TrailLivePlugin）
//
// 用法：node scripts/ios-add-widgets.mjs [ios/App 的路徑，預設 ios/App]
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const xcode = require("xcode");

const IOS = path.resolve(process.argv[2] || "ios/App");
const PBX = path.join(IOS, "App.xcodeproj/project.pbxproj");
const BUNDLE = process.env.BUNDLE_ID || "com.timmyweistudy.trailtracker";
const GROUP_ID = `group.${BUNDLE}`;
const EXT = "TrailWidgets";
const EXT_SOURCES = ["TrailWidgetsBundle.swift", "HomeWidget.swift", "LiveActivityWidget.swift"];
const APP_SOURCES = ["TrailLivePlugin.swift", "MainViewController.swift"];
const SHARED = "TrailActivityAttributes.swift";
const log = (...a) => console.log("[ios-add-widgets]", ...a);

for (const f of [...EXT_SOURCES.map(n => `${EXT}/${n}`), `${EXT}/Info.plist`, `${EXT}/${EXT}.entitlements`, `Shared/${SHARED}`, ...APP_SOURCES.map(n => `App/${n}`)]) {
  if (!fs.existsSync(path.join(IOS, f))) { console.error(`[ios-add-widgets] 少了檔案：${f}`); process.exit(1); }
}

const proj = xcode.project(PBX);
proj.parseSync();
const objs = proj.hash.project.objects;
const q = s => (/^[A-Za-z0-9_./$-]+$/.test(s) ? s : `"${s}"`);

const hasExt = Object.keys(objs.PBXNativeTarget).some(k => { const t = objs.PBXNativeTarget[k]; return typeof t === "object" && (t.name === EXT || t.name === `"${EXT}"`); });   // xcode 套件存的名字有引號
if (hasExt) {
  log("TrailWidgets 已經在專案裡，專案檔不再改");
} else {
  const appTarget = proj.getFirstTarget();   // { uuid, firstTarget }
  const appT = appTarget.firstTarget;
  const mainGroup = proj.getFirstProject().firstProject.mainGroup;

  // ── 檔案參照與群組 ──
  function fileRef(name, type) {
    const id = proj.generateUuid();
    objs.PBXFileReference[id] = { isa: "PBXFileReference", lastKnownFileType: type, path: q(name), sourceTree: '"<group>"' };
    objs.PBXFileReference[`${id}_comment`] = name;
    return id;
  }
  function group(name, children) {
    const id = proj.generateUuid();
    objs.PBXGroup[id] = { isa: "PBXGroup", children: children.map(([cid, cname]) => ({ value: cid, comment: cname })), path: q(name), sourceTree: '"<group>"' };
    objs.PBXGroup[`${id}_comment`] = name;
    objs.PBXGroup[mainGroup].children.push({ value: id, comment: name });
    return id;
  }
  function findGroupByPath(p) {
    for (const k of Object.keys(objs.PBXGroup)) { const g = objs.PBXGroup[k]; if (typeof g === "object" && (g.path === p || g.path === `"${p}"` || g.name === p)) return k; }
    return null;
  }
  function buildFile(refId, name) {
    const id = proj.generateUuid();
    objs.PBXBuildFile[id] = { isa: "PBXBuildFile", fileRef: refId, fileRef_comment: name };
    objs.PBXBuildFile[`${id}_comment`] = `${name} in Sources`;
    return id;
  }
  function phaseOf(target, isa) {
    for (const p of target.buildPhases) { if (objs[isa] && objs[isa][p.value]) return objs[isa][p.value]; }
    return null;
  }

  const extRefs = EXT_SOURCES.map(n => [fileRef(n, "sourcecode.swift"), n]);
  const extPlist = [fileRef("Info.plist", "text.plist.xml"), "Info.plist"];
  const extEnt = [fileRef(`${EXT}.entitlements`, "text.plist.entitlements"), `${EXT}.entitlements`];
  group(EXT, [...extRefs, extPlist, extEnt]);
  const sharedRef = [fileRef(SHARED, "sourcecode.swift"), SHARED];
  group("Shared", [sharedRef]);
  // App 群組裡加兩個原生檔
  const appGroupId = findGroupByPath("App");
  if (!appGroupId) { console.error("[ios-add-widgets] 找不到 App 群組"); process.exit(1); }
  const appRefs = APP_SOURCES.map(n => [fileRef(n, "sourcecode.swift"), n]);
  appRefs.forEach(([id, n]) => objs.PBXGroup[appGroupId].children.push({ value: id, comment: n }));

  // App 的 Sources：外掛、主畫面、共用資料格式
  const appSources = phaseOf(appT, "PBXSourcesBuildPhase");
  if (!appSources) { console.error("[ios-add-widgets] App 沒有 Sources 階段"); process.exit(1); }
  [...appRefs, sharedRef].forEach(([rid, n]) => appSources.files.push({ value: buildFile(rid, n), comment: `${n} in Sources` }));

  // ── 新 target（xcode 套件會建好設定組、產物 .appex、App 裡的 Copy Files 嵌入階段） ──
  const ext = proj.addTarget(EXT, "app_extension", EXT, `${BUNDLE}.widgets`);
  proj.addBuildPhase([], "PBXSourcesBuildPhase", "Sources", ext.uuid);
  proj.addBuildPhase([], "PBXResourcesBuildPhase", "Resources", ext.uuid);
  proj.addBuildPhase([], "PBXFrameworksBuildPhase", "Frameworks", ext.uuid);
  const extT = objs.PBXNativeTarget[ext.uuid];
  const extSources = phaseOf(extT, "PBXSourcesBuildPhase");
  [...extRefs, sharedRef].forEach(([rid, n]) => extSources.files.push({ value: buildFile(rid, n), comment: `${n} in Sources` }));
  // xcode 套件的 addTargetDependency 在專案還沒有這兩個區段時會「什麼都不做」→ 先建空的
  objs.PBXTargetDependency = objs.PBXTargetDependency || {};
  objs.PBXContainerItemProxy = objs.PBXContainerItemProxy || {};
  proj.addTargetDependency(appTarget.uuid, [ext.uuid]);
  // 產物參照：xcode 套件會寫出 fileEncoding = undefined 這種 Xcode 不認得的值
  const prod = objs.PBXFileReference[extT.productReference];
  if (prod) for (const k of Object.keys(prod)) if (prod[k] === undefined || prod[k] === "undefined") delete prod[k];

  // 嵌入階段：xcode 套件建的叫 Copy Files，改成 Xcode 慣用的名字，並確認目的地是 PlugIns（13）
  for (const p of appT.buildPhases) {
    const cp = objs.PBXCopyFilesBuildPhase && objs.PBXCopyFilesBuildPhase[p.value];
    if (cp && cp.files && cp.files.some(f => /TrailWidgets\.appex/.test(f.comment || ""))) {
      cp.name = '"Embed Foundation Extensions"'; cp.dstSubfolderSpec = 13; cp.dstPath = '""';
      p.comment = "Embed Foundation Extensions";
      // 嵌入的 .appex 要去掉 headers（Xcode 預設）
      cp.files.forEach(f => { const bf = objs.PBXBuildFile[f.value]; if (bf) bf.settings = { ATTRIBUTES: ["RemoveHeadersOnCopy"] }; });
    }
  }

  // ── 擴充的建置設定：版本號跟 App 一樣（App Store 要求），其餘照 Xcode 新增 Widget Extension 的預設 ──
  const appCfgList = objs.XCConfigurationList[appT.buildConfigurationList];
  const appCfg = name => { const c = appCfgList.buildConfigurations.find(x => x.comment === name); return objs.XCBuildConfiguration[c.value].buildSettings; };
  const extCfgList = objs.XCConfigurationList[extT.buildConfigurationList];
  for (const c of extCfgList.buildConfigurations) {
    const bs = objs.XCBuildConfiguration[c.value].buildSettings;
    const a = appCfg(c.comment);
    Object.assign(bs, {
      INFOPLIST_FILE: `${EXT}/Info.plist`,
      CODE_SIGN_ENTITLEMENTS: `${EXT}/${EXT}.entitlements`,
      PRODUCT_BUNDLE_IDENTIFIER: `${BUNDLE}.widgets`,
      PRODUCT_NAME: '"$(TARGET_NAME)"',
      IPHONEOS_DEPLOYMENT_TARGET: "16.2",
      SWIFT_VERSION: "5.0",
      TARGETED_DEVICE_FAMILY: '"1,2"',
      MARKETING_VERSION: a.MARKETING_VERSION,
      CURRENT_PROJECT_VERSION: a.CURRENT_PROJECT_VERSION,
      CODE_SIGN_STYLE: a.CODE_SIGN_STYLE || "Automatic",
      SKIP_INSTALL: "YES",
      APPLICATION_EXTENSION_API_ONLY: "YES",
      GENERATE_INFOPLIST_FILE: "NO",
      LD_RUNPATH_SEARCH_PATHS: '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"',
      SWIFT_EMIT_LOC_STRINGS: "YES",
    });
    if (a.DEVELOPMENT_TEAM) bs.DEVELOPMENT_TEAM = a.DEVELOPMENT_TEAM;
    if (c.comment === "Debug") { bs.SWIFT_OPTIMIZATION_LEVEL = '"-Onone"'; bs.SWIFT_ACTIVE_COMPILATION_CONDITIONS = "DEBUG"; }
    else bs.SWIFT_OPTIMIZATION_LEVEL = '"-O"';
  }
  // 寫回時 xcode 套件會把 0920 這類版本號變成 920，照原樣補回前導 0
  const out = proj.writeSync().replace(/(LastSwiftUpdateCheck|LastUpgradeCheck) = (\d{3});/g, (m, k, v) => `${k} = 0${v};`);
  if (/= undefined;/.test(out)) { console.error("[ios-add-widgets] 產出的專案檔還有 undefined"); process.exit(1); }
  fs.writeFileSync(PBX, out);
  log("加好 TrailWidgets target、App 原生檔、嵌入與相依");
}

// ── App 的 Info.plist：允許 Live Activity ──
const infoPath = path.join(IOS, "App/Info.plist");
let info = fs.readFileSync(infoPath, "utf8");
if (!/NSSupportsLiveActivities/.test(info)) {
  info = info.replace(/\n<\/dict>\s*\n<\/plist>\s*$/, "\n\t<key>NSSupportsLiveActivities</key>\n\t<true/>\n</dict>\n</plist>\n");
  if (!/NSSupportsLiveActivities/.test(info)) { console.error("[ios-add-widgets] Info.plist 改不進去"); process.exit(1); }
  fs.writeFileSync(infoPath, info); log("Info.plist：NSSupportsLiveActivities");
}
// ── App.entitlements：App Group ──
const entPath = path.join(IOS, "App/App.entitlements");
let ent = fs.readFileSync(entPath, "utf8");
if (!ent.includes(GROUP_ID)) {
  ent = ent.replace(/\n<\/dict>\s*\n<\/plist>\s*$/, `\n\t<key>com.apple.security.application-groups</key>\n\t<array>\n\t\t<string>${GROUP_ID}</string>\n\t</array>\n</dict>\n</plist>\n`);
  if (!ent.includes(GROUP_ID)) { console.error("[ios-add-widgets] App.entitlements 改不進去"); process.exit(1); }
  fs.writeFileSync(entPath, ent); log("App.entitlements：App Group");
}
// ── Main.storyboard：主畫面用 MainViewController ──
const sbPath = path.join(IOS, "App/Base.lproj/Main.storyboard");
let sb = fs.readFileSync(sbPath, "utf8");
if (!sb.includes('customClass="MainViewController"')) {
  const before = sb;
  sb = sb.replace('customClass="CAPBridgeViewController" customModule="Capacitor"', 'customClass="MainViewController" customModule="App" customModuleProvider="target"');
  if (sb === before) { console.error("[ios-add-widgets] Main.storyboard 找不到 CAPBridgeViewController"); process.exit(1); }
  fs.writeFileSync(sbPath, sb); log("Main.storyboard：MainViewController");
}
log("完成");
