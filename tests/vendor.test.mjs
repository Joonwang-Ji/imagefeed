// 브라우저 AI 검사 번들이 앱 안에 있고, 앱·서비스워커·캐시 설정이 그것을 가리키는지 확인합니다.
import fs from "node:fs";
import path from "node:path";
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error("FAIL:", m); } };
const dir = "public/vendor/nsfw4", main = path.join(dir, "nsfw.js");
ok(fs.existsSync(main), "nsfw.js 번들이 있어야 함");
if (fs.existsSync(main)) {
  const src = fs.readFileSync(main, "utf8");
  // 번들이 불러오는 조각 파일(./xxx.js)이 모두 실제로 있어야 함
  const refs = [...new Set([...src.matchAll(/["']\.\/([\w.\-]+\.js)["']/g)].map((m) => m[1]))];
  ok(refs.length >= 2, "조각 파일 참조를 찾아야 함 (모델·가중치)");
  for (const r of refs) ok(fs.existsSync(path.join(dir, r)), `조각 파일 없음: ${r}`);
  ok(!/https?:\/\/esm\.sh/.test(src), "번들 안에 외부 주소가 없어야 함");
}
const app = fs.readFileSync("public/app.js", "utf8");
ok(/import\("\/vendor\/nsfw4\/nsfw\.js"\)/.test(app), "app.js 가 앱 안의 번들을 먼저 불러와야 함");
ok(app.indexOf("/vendor/nsfw4/nsfw.js") < app.indexOf("esm.sh/nsfwjs"), "외부 주소는 예비로만 (뒤에)");
const sw = fs.readFileSync("public/sw.js", "utf8");
ok(sw.includes("/vendor/nsfw4/") && sw.includes("imagefeed-vendor-nsfw4"), "서비스워커가 번들을 따로 캐시해야 함");
ok(/k !== VENDOR/.test(sw), "서비스워커 업데이트 때 번들 캐시를 지우면 안 됨");
const hd = fs.readFileSync("public/_headers", "utf8");
ok(/\/vendor\/nsfw4\/\*/.test(hd) && /immutable/.test(hd), "번들에 긴 캐시 헤더가 있어야 함");
if (fails) { console.error(`${fails} failed`); process.exit(1); }
console.log("all passed");
