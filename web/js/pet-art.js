// 山林夥伴 chibi 角色（純 SVG 資產、無邏輯）。7 進化階，viewBox 0 0 200 200。
// 動畫靠 CSS class（見 style.css）：.pc-bob 呼吸起伏 / .pc-eye 眨眼 / .pc-tail 擺動 /
// .pc-wing(.l/.r) 振翅 / .pc-hover 漂浮 / .pc-tw 閃爍。prefers-reduced-motion 會全關。
window.PET_ART = (function () {
  // 0 神秘之卵
  const EGG = `
    <g class="pc-bob">
      <ellipse cx="100" cy="120" rx="50" ry="62" fill="url(#pa-egg)"/>
      <circle cx="78" cy="150" r="4" fill="#d8c393"/><circle cx="121" cy="158" r="5" fill="#d8c393"/><circle cx="112" cy="96" r="3.5" fill="#d8c393"/><circle cx="90" cy="176" r="3" fill="#d8c393"/>
      <path d="M74 108 l12 8 l-9 9 l14 8" fill="none" stroke="#b89f68" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <ellipse cx="80" cy="88" rx="12" ry="20" fill="#ffffff" opacity=".5"/>
    </g>
    <g class="pc-tw"><path d="M150 60 l3 9 l9 3 l-9 3 l-3 9 l-3-9 l-9-3 l9-3Z" fill="#ffe6a0"/></g>
    <g class="pc-tw" style="animation-delay:1.1s"><path d="M44 92 l2 6 l6 2 l-6 2 l-2 6 l-2-6 l-6-2 l6-2Z" fill="#ffe6a0"/></g>
    <defs><radialGradient id="pa-egg" cx="38%" cy="30%" r="72%"><stop offset="0" stop-color="#fbf3dc"/><stop offset="1" stop-color="#e2cfa0"/></radialGradient></defs>`;

  // 1 草叢幼蟲
  const LARVA = `
    <g class="pc-bob">
      <ellipse cx="66" cy="142" rx="18" ry="16" fill="#8bbd4e"/>
      <ellipse cx="90" cy="138" rx="20" ry="18" fill="#97c85a"/>
      <ellipse cx="116" cy="134" rx="22" ry="20" fill="#a3d167"/>
      <path d="M66 158 v7 M90 156 v8 M116 154 v8" stroke="#6a8a34" stroke-width="3" stroke-linecap="round"/>
      <circle cx="143" cy="122" r="27" fill="#b0da78"/>
      <g class="pc-tail">
        <path d="M137 98 q-5-16 3-24" stroke="#7ca23e" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="139" cy="72" r="4.5" fill="#e58a8a"/>
        <path d="M153 98 q6-15 -1-24" stroke="#7ca23e" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="151" cy="72" r="4.5" fill="#e58a8a"/>
      </g>
      <g class="pc-eye"><ellipse cx="136" cy="123" rx="5.4" ry="7.4" fill="#2c3a14"/><circle cx="137.7" cy="119.5" r="1.9" fill="#fff"/></g>
      <g class="pc-eye"><ellipse cx="153" cy="121" rx="5.4" ry="7.4" fill="#2c3a14"/><circle cx="154.7" cy="117.5" r="1.9" fill="#fff"/></g>
      <ellipse cx="129" cy="133" rx="5" ry="3.4" fill="#f0a0a0" opacity=".6"/>
      <path d="M141 133 q6 5 12 1" stroke="#5a7a28" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    </g>`;

  // 2 翩翩彩蝶（友善 chibi：暖色圓翅＋大眼微笑）
  const BUTTERFLY = `
    <g class="pc-hover">
      <g class="pc-wing l">
        <ellipse cx="66" cy="84" rx="31" ry="27" fill="#ef9a6a" transform="rotate(-16 66 84)"/>
        <ellipse cx="72" cy="124" rx="21" ry="19" fill="#f4b98f" transform="rotate(-8 72 124)"/>
        <circle cx="58" cy="82" r="7" fill="#fff3e2"/><circle cx="70" cy="122" r="5" fill="#fff3e2"/>
      </g>
      <g class="pc-wing r">
        <ellipse cx="134" cy="84" rx="31" ry="27" fill="#ef9a6a" transform="rotate(16 134 84)"/>
        <ellipse cx="128" cy="124" rx="21" ry="19" fill="#f4b98f" transform="rotate(8 128 124)"/>
        <circle cx="142" cy="82" r="7" fill="#fff3e2"/><circle cx="130" cy="122" r="5" fill="#fff3e2"/>
      </g>
      <ellipse cx="100" cy="106" rx="9" ry="22" fill="#7a5540"/>
      <circle cx="100" cy="84" r="15" fill="#8a6349"/>
      <path d="M93 71 q-6-13-15-14 M107 71 q6-13 15-14" stroke="#7a5540" stroke-width="3" fill="none" stroke-linecap="round"/>
      <circle cx="76" cy="54" r="4" fill="#e07a34"/><circle cx="124" cy="54" r="4" fill="#e07a34"/>
      <g class="pc-eye"><ellipse cx="93" cy="84" rx="4.6" ry="6.2" fill="#2a1608"/><circle cx="94.6" cy="81" r="1.7" fill="#fff"/></g>
      <g class="pc-eye"><ellipse cx="107" cy="84" rx="4.6" ry="6.2" fill="#2a1608"/><circle cx="108.6" cy="81" r="1.7" fill="#fff"/></g>
      <ellipse cx="88" cy="91" rx="3.6" ry="2.4" fill="#f0a0a0" opacity=".6"/><ellipse cx="112" cy="91" rx="3.6" ry="2.4" fill="#f0a0a0" opacity=".6"/>
      <path d="M95 90 q5 5 10 0" stroke="#2a1608" stroke-width="1.9" fill="none" stroke-linecap="round"/>
    </g>`;

  // 3 靈巧山狐
  const FOX = `
    <g class="pc-bob">
      <g class="pc-tail"><path d="M52 150 C10 140 6 96 34 84 C40 118 66 128 78 138 Z" fill="#d9702f"/><path d="M38 92 C20 94 14 122 34 132 C40 116 40 104 38 92Z" fill="#faf4e6"/></g>
      <ellipse cx="104" cy="150" rx="46" ry="38" fill="#e07a34"/>
      <path d="M104 118 q30 6 34 40 q-34 14 -68 0 q4 -34 34 -40Z" fill="#faf4e6"/>
      <ellipse cx="86" cy="184" rx="12" ry="8" fill="#7a3d15"/><ellipse cx="122" cy="184" rx="12" ry="8" fill="#7a3d15"/>
      <path d="M60 84 L54 34 L98 68 Z" fill="#e07a34"/><path d="M64 74 L60 46 L86 66 Z" fill="#3a1e0c"/>
      <path d="M148 84 L154 34 L110 68 Z" fill="#e07a34"/><path d="M144 74 L148 46 L122 66 Z" fill="#3a1e0c"/>
      <circle cx="104" cy="98" r="48" fill="#e88a44"/>
      <path d="M104 92 q34 4 30 40 q-30 22 -60 0 q-4 -36 30 -40Z" fill="#faf4e6"/>
      <g class="pc-eye"><ellipse cx="86" cy="98" rx="8" ry="10" fill="#2a1608"/><circle cx="88.5" cy="94" r="2.6" fill="#fff"/></g>
      <g class="pc-eye"><ellipse cx="122" cy="98" rx="8" ry="10" fill="#2a1608"/><circle cx="124.5" cy="94" r="2.6" fill="#fff"/></g>
      <ellipse cx="76" cy="116" rx="8" ry="5" fill="#f0a86a" opacity=".7"/><ellipse cx="132" cy="116" rx="8" ry="5" fill="#f0a86a" opacity=".7"/>
      <path d="M104 116 l-7 8 q7 6 14 0 Z" fill="#2a1608"/>
      <path d="M104 124 v8" stroke="#2a1608" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    </g>`;

  // 4 山林猛虎
  const TIGER = `
    <g class="pc-bob">
      <g class="pc-tail"><path d="M150 152 C186 142 190 102 172 94 C168 122 150 134 140 142Z" fill="#e08a34"/><path d="M176 100 l-7 12 M170 116 l-8 11 M161 130 l-8 9" stroke="#3a2410" stroke-width="4" stroke-linecap="round" fill="none"/></g>
      <ellipse cx="100" cy="152" rx="46" ry="38" fill="#e88a3e"/>
      <path d="M100 122 q28 6 30 40 q-30 14 -60 0 q2 -34 30 -40Z" fill="#faf1e0"/>
      <path d="M74 134 h11 M115 134 h11 M78 152 h9 M113 152 h9" stroke="#3a2410" stroke-width="4" stroke-linecap="round"/>
      <ellipse cx="84" cy="186" rx="11" ry="7" fill="#7a3d15"/><ellipse cx="120" cy="186" rx="11" ry="7" fill="#7a3d15"/>
      <circle cx="66" cy="66" r="17" fill="#e88a3e"/><circle cx="66" cy="66" r="8" fill="#3a2410"/>
      <circle cx="138" cy="66" r="17" fill="#e88a3e"/><circle cx="138" cy="66" r="8" fill="#3a2410"/>
      <circle cx="102" cy="96" r="50" fill="#ee9448"/>
      <path d="M102 48 v18 M84 52 l6 16 M120 52 l-6 16" stroke="#3a2410" stroke-width="5" stroke-linecap="round"/>
      <path d="M56 88 l17 6 M56 104 l17 2 M148 88 l-17 6 M148 104 l-17 2" stroke="#3a2410" stroke-width="5" stroke-linecap="round"/>
      <path d="M102 92 q30 2 26 34 q-26 20 -52 0 q-4 -32 26 -34Z" fill="#faf1e0"/>
      <path d="M78 82 l16 7 M126 82 l-16 7" stroke="#3a2410" stroke-width="4" stroke-linecap="round"/>
      <g class="pc-eye"><ellipse cx="86" cy="98" rx="8" ry="10" fill="#2a1608"/><circle cx="88.5" cy="94" r="2.6" fill="#fff"/></g>
      <g class="pc-eye"><ellipse cx="118" cy="98" rx="8" ry="10" fill="#2a1608"/><circle cx="120.5" cy="94" r="2.6" fill="#fff"/></g>
      <path d="M102 116 l-7 8 q7 6 14 0Z" fill="#2a1608"/>
      <path d="M102 124 v5 q-6 6 -12 2 M102 129 q6 4 12 -2" stroke="#2a1608" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    </g>`;

  // 5 初醒幼龍
  const HATCHDRAGON = `
    <g class="pc-bob">
      <g class="pc-tail"><path d="M84 156 C50 168 44 140 60 132 C70 144 80 150 90 150Z" fill="#3f9e6e"/><path d="M54 138 l-9-2 l6-6 l-9-3" fill="#7ed6a6" stroke="#3f9e6e" stroke-width="1.5" stroke-linejoin="round"/></g>
      <g class="pc-wing l"><path d="M84 108 C50 82 42 100 50 118 C60 118 74 118 84 114Z" fill="#7ed6a6"/><path d="M60 92 v22 M70 96 v20" stroke="#49aa78" stroke-width="2"/></g>
      <g class="pc-wing r"><path d="M120 108 C154 82 162 100 154 118 C144 118 130 118 120 114Z" fill="#7ed6a6"/><path d="M144 92 v22 M134 96 v20" stroke="#49aa78" stroke-width="2"/></g>
      <ellipse cx="102" cy="146" rx="34" ry="30" fill="#49aa78"/>
      <path d="M102 124 q20 4 22 30 q-22 12 -44 0 q2 -26 22 -30Z" fill="#cdeede"/>
      <path d="M84 134 h10 M110 134 h10 M88 150 h8 M108 150 h8" stroke="#8fd6b0" stroke-width="2.4" stroke-linecap="round"/>
      <ellipse cx="88" cy="172" rx="10" ry="7" fill="#2f7c56"/><ellipse cx="116" cy="172" rx="10" ry="7" fill="#2f7c56"/>
      <circle cx="102" cy="96" r="40" fill="#52b482"/>
      <path d="M80 62 q-5-16 5-21 q3 12 5 18Z" fill="#e8dcb0"/><path d="M124 62 q5-16 -5-21 q-3 12 -5 18Z" fill="#e8dcb0"/>
      <path d="M92 58 q10-6 20 0 q-4 6 -10 6 q-6 0 -10-6Z" fill="#3f9e6e"/>
      <path d="M102 92 q26 2 22 30 q-22 16 -44 0 q-2 -28 22 -30Z" fill="#cdeede"/>
      <circle cx="94" cy="118" r="2.2" fill="#2f7c56"/><circle cx="110" cy="118" r="2.2" fill="#2f7c56"/>
      <g class="pc-eye"><ellipse cx="88" cy="92" rx="8" ry="10" fill="#1e4a34"/><circle cx="90.5" cy="88" r="2.6" fill="#fff"/></g>
      <g class="pc-eye"><ellipse cx="116" cy="92" rx="8" ry="10" fill="#1e4a34"/><circle cx="118.5" cy="88" r="2.6" fill="#fff"/></g>
      <path d="M92 124 q10 6 20 0" stroke="#2f7c56" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    </g>`;

  // 6 騰雲神龍（重點：東方神龍，chibi 但威嚴——角/鬚/鬃毛/蛇身盤雲/龍珠/發光）
  const DRAGON = `
    <g class="pc-hover">
      <path d="M36 170 q-16 2 -14-13 q-14-6-2-17 q6-12 22-6 q10-14 26-3 q18-11 30 3 q20-5 20 13 q15 3 6 18 q-4 11-20 8 q-14 6-24-2 q-16 6-28-2 q-12 4-16-3Z" fill="#eef3f0"/>
      <path d="M52 172 q40 8 96 0" stroke="#d3e0da" stroke-width="3" fill="none" opacity=".7"/>
    </g>
    <g class="pc-bob">
      <path d="M118 150 C176 156 190 108 158 96 C132 86 120 118 142 128 C158 134 158 112 148 108" fill="none" stroke="#3f9e6e" stroke-width="22" stroke-linecap="round"/>
      <path d="M120 150 C172 154 184 112 158 101" fill="none" stroke="#7ed6a6" stroke-width="9" stroke-linecap="round" opacity=".85"/>
      <path d="M150 88 l7-3 M162 96 l7-1 M170 110 l6 2 M170 126 l6 4" stroke="#2f7c56" stroke-width="4" stroke-linecap="round"/>
      <g class="pc-tail"><path d="M150 150 q18 10 8 30 q-6-4-8-10 q-8 6-14 2 q6-6 8-12 q-4-8 6-10Z" fill="#3f9e6e"/></g>
      <path d="M60 66 q-10-8-8-24 q10 2 12 12 q6-8 14-6 q-4 8 -10 10 q4 8 -2 16Z" fill="#e8dcb0"/>
      <path d="M112 66 q10-8 8-24 q-10 2 -12 12 q-6-8 -14-6 q4 8 10 10 q-4 8 2 16Z" fill="#e8dcb0"/>
      <path d="M52 74 q-6-4-10-2 q4 8 12 10Z M120 74 q6-4 10-2 q-4 8 -12 10Z" fill="#c8a24a"/>
      <path d="M50 60 q6 10 4 24 M132 60 q-6 10 -4 24 M40 84 q10 6 8 20 M142 84 q-10 6 -8 20" stroke="#2f7c56" stroke-width="6" fill="none" stroke-linecap="round" opacity=".9"/>
      <circle cx="90" cy="98" r="46" fill="#4fae7e"/>
      <path d="M46 106 q-26-2-38 10 M48 118 q-24 4 -34 18" stroke="#dcc98a" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <path d="M90 96 q30 0 26 36 q-26 20 -52 2 q-4 -36 26 -38Z" fill="#cdeede"/>
      <path d="M64 84 q10-8 20-2 M96 82 q10-6 20 2" stroke="#c8a24a" stroke-width="4" fill="none" stroke-linecap="round"/>
      <g class="pc-eye"><ellipse cx="74" cy="94" rx="8" ry="11" fill="#1e4a34"/><circle cx="76.5" cy="89" r="2.8" fill="#fff"/></g>
      <g class="pc-eye"><ellipse cx="104" cy="94" rx="8" ry="11" fill="#1e4a34"/><circle cx="106.5" cy="89" r="2.8" fill="#fff"/></g>
      <circle cx="70" cy="122" r="2.4" fill="#2f7c56"/><circle cx="92" cy="122" r="2.4" fill="#2f7c56"/>
      <path d="M66 130 q15 9 30 0" stroke="#2f7c56" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      <path d="M76 130 l-2 6 M86 130 l2 6" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>
      <g class="pc-tw"><circle cx="150" cy="150" r="13" fill="#ffe08a"/><circle cx="150" cy="150" r="13" fill="none" stroke="#fff3cf" stroke-width="2"/><circle cx="146" cy="146" r="3.5" fill="#fffdf0"/></g>
    </g>`;

  const A = [EGG, LARVA, BUTTERFLY, FOX, TIGER, HATCHDRAGON, DRAGON];

  // 棲息地剪影（各階段專屬場景，鋪在角色後方；深色低調、卡片漸層透出來）。viewBox 0 0 400 150，貼底。
  const GROUND = `<path d="M0 150 L0 122 Q200 100 400 120 L400 150Z" fill="#193a24"/>`;
  const STARS = `<circle cx="60" cy="34" r="2.2" fill="#e6ecc8"/><circle cx="330" cy="26" r="2.6" fill="#e6ecc8"/><circle cx="288" cy="54" r="1.6" fill="#e6ecc8"/><circle cx="120" cy="20" r="1.6" fill="#e6ecc8"/>`;
  const grass = (x) => `<path d="M${x} 128 l-5 -16 M${x + 4} 128 l0 -19 M${x + 9} 128 l6 -15" stroke="#22482c" stroke-width="3.4" fill="none" stroke-linecap="round"/>`;
  const pine = (x, s) => `<path d="M${x} 126 l${-13 * s} 0 l${13 * s} ${-26 * s} l${13 * s} ${26 * s} Z" fill="#1e4229"/><path d="M${x} ${126 - 18 * s} l${-10 * s} ${12 * s} l${10 * s} ${-24 * s} l${10 * s} ${24 * s} Z" fill="#1e4229"/>`;
  const flower = (x, c) => `<path d="M${x} 126 v-18" stroke="#173c25" stroke-width="2.6"/><circle cx="${x}" cy="106" r="5" fill="${c}"/><circle cx="${x}" cy="106" r="2" fill="#193a24"/>`;
  const HAB = [
    /* 0 卵：巢＋星空 */ STARS + GROUND + `<path d="M70 130 q50-16 110-8 M120 136 q60-14 130-2" stroke="#22482c" stroke-width="4" fill="none" stroke-linecap="round"/>`,
    /* 1 幼蟲：草地 */ GROUND + grass(50) + grass(150) + grass(250) + grass(330) + `<ellipse cx="300" cy="112" rx="16" ry="7" fill="#22482c"/>`,
    /* 2 蝶：花叢 */ GROUND + grass(70) + grass(300) + flower(130, "#c9668a") + flower(180, "#e2b455") + flower(240, "#c9668a"),
    /* 3 狐：松林 */ GROUND + pine(70, 1.15) + pine(150, .85) + pine(320, 1.05) + pine(255, .8),
    /* 4 虎：岩地 */ GROUND + `<path d="M250 122 q10-34 46-30 q34 2 40 30Z" fill="#1b3620"/><ellipse cx="90" cy="120" rx="30" ry="12" fill="#122a1c"/>` + grass(40) + grass(360),
    /* 5 幼龍：山稜＋星 */ STARS + `<path d="M0 150 L0 92 L70 118 L140 74 L210 116 L290 66 L360 110 L400 84 L400 150Z" fill="#193a23"/>` + GROUND,
    /* 6 神龍：雲海群峰 */ STARS + `<path d="M0 150 L0 100 L90 60 L170 108 L250 54 L340 104 L400 76 L400 150Z" fill="#183820" opacity=".9"/><path d="M40 128 q-10-16 8-18 q6-14 24-8 q14-10 26 2 q18-4 16 14 q-4 12-20 10 q-16 6-28-2 q-14 4-26 2Z" fill="#1a3526" opacity=".8"/><path d="M250 122 q-8-14 8-16 q6-12 22-6 q12-8 22 2 q16-4 14 12 q-4 10-18 9 q-14 5-24-2 q-12 3-24 1Z" fill="#1a3526" opacity=".8"/>`,
  ];
  function habitat(i) { return `<svg class="pet-hab" viewBox="0 0 400 150" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${HAB[clamp(i)]}</svg>`; }

  // 配件（Premium 裝扮）：疊在角色頭頂（同 200x200 座標，畫在頭部上方 y15~60）。none=不戴。
  const HATS = {
    straw: `<ellipse cx="100" cy="55" rx="49" ry="13" fill="#dcb877"/><path d="M73 55 q5-33 27-33 q22 0 27 33Z" fill="#eccf94"/><path d="M73 51 q27 11 54 0" stroke="#c39a55" stroke-width="5" fill="none"/>`,
    party: `<path d="M100 5 l-20 47 q20 9 40 0Z" fill="#e2657f"/><path d="M96 22 l8 0 M88 38 l9 0 M82 50 l7 0" stroke="#fbe6a0" stroke-width="3.5" stroke-linecap="round"/><circle cx="100" cy="6" r="7" fill="#f2c94c"/>`,
    crown: `<path d="M60 52 q40-18 80 0" stroke="#5da24e" stroke-width="6" fill="none" stroke-linecap="round"/><circle cx="68" cy="47" r="7.5" fill="#e78aa8"/><circle cx="68" cy="47" r="2.6" fill="#fbe6a0"/><circle cx="100" cy="37" r="9" fill="#f2c94c"/><circle cx="100" cy="37" r="3.2" fill="#e78aa8"/><circle cx="132" cy="47" r="7.5" fill="#e78aa8"/><circle cx="132" cy="47" r="2.6" fill="#fbe6a0"/>`,
    bow: `<path d="M100 42 l-24 -13 q-7 13 0 26Z" fill="#d95a7a"/><path d="M100 42 l24 -13 q7 13 0 26Z" fill="#d95a7a"/><path d="M78 32 q10 8 0 18 M122 32 q-10 8 0 18" stroke="#b8446020" stroke-width="0" fill="none"/><circle cx="100" cy="42" r="7.5" fill="#c04968"/>`,
  };
  const HAT_LABEL = { none: "不戴", straw: "草帽", party: "派對帽", crown: "花冠", bow: "蝴蝶結" };
  const HAT_IDS = ["none", "straw", "party", "crown", "bow"];
  // 各階段頭頂錨點 [x, y, scale]：帽子以自身參考點(x100,y45)對到該階段頭頂。逐一調過位。
  const HAT_ANCHOR = [
    [100, 62, 1.0],   // 0 卵
    [143, 90, 0.6],   // 1 幼蟲：頭在右下、縮小
    [100, 63, 0.56],  // 2 蝶：小頭、上移縮小
    [104, 50, 1.0],   // 3 狐（參考）
    [102, 48, 1.02],  // 4 虎
    [102, 58, 0.92],  // 5 幼龍
    [86, 56, 0.92],   // 6 神龍：頭偏左
  ];
  function hat(id, i) {
    if (!HATS[id]) return "";
    const a = HAT_ANCHOR[clamp(i || 0)] || [100, 46, 1];
    const tf = `translate(${a[0]} ${a[1]}) scale(${a[2]}) translate(-100 -45)`;
    return `<svg class="pet-hat-svg" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g transform="${tf}">${HATS[id]}</g></svg>`;
  }
  const EMOJI = ["🥚", "🐛", "🦋", "🦊", "🐅", "🐲", "🐉"];   // 對映 PET_STAGES 的 e，供把同步來的 emoji 反查成階段
  const clamp = i => Math.max(0, Math.min(A.length - 1, (i | 0)));
  function svg(i, cls) {
    return `<svg class="pet-critter ${cls || ""}" viewBox="0 0 200 200" role="img" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${A[clamp(i)]}</svg>`;
  }
  function byEmoji(e) { return EMOJI.indexOf(e); }   // 找不到回 -1
  // 給 canvas 用：帶 width/height 的獨立 SVG data URI（靜態一幀，供 new Image().src 光柵化畫進分享圖卡）
  function dataUri(i, size) {
    const s = size || 120;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 200 200">${A[clamp(i)]}</svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }
  return { svg, count: A.length, byEmoji, dataUri, habitat, hat, HAT_IDS, HAT_LABEL };
})();
