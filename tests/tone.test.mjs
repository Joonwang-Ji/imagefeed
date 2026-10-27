// 톤(분위기)·팔레트 분류 점검: 순수 함수라 가상 브라우저 없이 확인합니다.
import fs from "node:fs"; import vm from "node:vm";
const ROOT = new URL("../", import.meta.url).pathname;
const sb = { module: { exports: {} } }; vm.runInNewContext(fs.readFileSync(ROOT + "public/color.js", "utf8"), sb);
const C = sb.module.exports;
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else console.log("ok  ", m); };
const W = 32;
function img(fn) { const a = new Uint8ClampedArray(W * W * 4); for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const [r, g, b] = fn(x / W, y / W); const i = (y * W + x) * 4; a[i] = r; a[i + 1] = g; a[i + 2] = b; a[i + 3] = 255; } return a; }
const solid = (r, g, b) => img(() => [r, g, b]);

// ---- 톤 ----
const T = (a) => C.tone(a);
ok(T(solid(128, 128, 128)).tone === "mono", "gray -> mono: " + JSON.stringify(T(solid(128, 128, 128))));
ok(T(img((u, v) => ((u + v) < 1 ? [20, 20, 20] : [235, 235, 235]))).tone === "mono", "black/white photo -> mono");
ok(T(solid(30, 28, 40)).tone === "dark", "very dark -> dark");
ok(T(solid(255, 190, 200)).tone === "pastel", "light pink -> pastel: " + JSON.stringify(T(solid(255, 190, 200))));
ok(T(solid(190, 225, 245)).tone === "pastel", "light blue -> pastel");
ok(T(solid(240, 20, 40)).tone === "vivid", "saturated red -> vivid");
ok(T(solid(0, 150, 255)).tone === "vivid", "saturated blue -> vivid");
ok(T(solid(150, 130, 115)).tone === "muted", "dusty brown -> muted: " + JSON.stringify(T(solid(150, 130, 115))));
ok(T(solid(250, 245, 235)).tone === "mono" || T(solid(250, 245, 235)).tone === "bright", "near-white -> mono/bright");
// 온도
ok(T(solid(230, 120, 40)).temp === "warm", "orange -> warm");
ok(T(solid(40, 120, 220)).temp === "cool", "blue -> cool");
ok(T(solid(128, 128, 128)).temp === "neutral", "gray -> neutral");
ok(T(solid(60, 170, 70)).temp === "neutral", "green alone -> neutral (neither warm nor cool)");
const half = img((u) => (u < 0.5 ? [230, 120, 40] : [40, 120, 220]));
ok(T(half).temp === "neutral", "half warm half cool -> neutral");
ok(C.tone(new Uint8ClampedArray(16 * 4)) === null, "transparent -> null");
ok(Object.keys(C.TONE_KO).length === 9 && C.TONE_KO.pastel === "파스텔", "Korean tone names");

// ---- 팔레트 ----
const p1 = C.palette(img((u) => (u < 0.5 ? [220, 30, 30] : [30, 60, 200])), W, W);
ok(p1.length === 2, "two flat colors -> 2 swatches: " + p1.map((c) => c.hex + ":" + c.name).join(" "));
ok(p1.some((c) => c.name === "red") && p1.some((c) => c.name === "blue"), "names red and blue");
ok(/^#[0-9a-f]{6}$/.test(p1[0].hex), "hex format " + p1[0].hex);
ok(Math.abs(p1.reduce((t, c) => t + c.share, 0) - 1) < 0.02, "shares sum to ~1");
// 비슷한 색은 하나로 합쳐짐
const grad = img((u) => [200 + Math.round(u * 20), 40, 40]);
ok(C.palette(grad, W, W).length === 1, "near-identical reds merge into one swatch");
// 가운데 물체가 가장자리 배경보다 앞에 옴 (배경이 더 넓더라도 주인공 색이 포함)
const obj = img((u, v) => (u > 0.35 && u < 0.65 && v > 0.35 && v < 0.65 ? [230, 40, 40] : [235, 235, 235]));
const po = C.palette(obj, W, W, 3);
ok(po.some((c) => c.name === "red"), "centered red object appears in palette: " + po.map((c) => c.name).join(","));
ok(C.palette(solid(10, 10, 10), W, W)[0].name === "black", "black swatch named black");
ok(C.palette(new Uint8ClampedArray(16 * 4), 4, 4).length === 0, "transparent -> empty palette");
ok(C.palette(img((u, v) => [Math.round(u * 255), Math.round(v * 255), 128]), W, W, 5).length <= 5, "at most n swatches");

console.log(fail ? `\n${fail} failed` : "\nall passed"); process.exit(fail ? 1 : 0);
