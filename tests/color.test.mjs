import fs from "node:fs"; import vm from "node:vm";
const ROOT = new URL("../", import.meta.url).pathname; 
const src = fs.readFileSync(ROOT + "public/color.js","utf8");
const sb = { module: { exports: {} } }; vm.runInNewContext(src, sb);
const C = sb.module.exports;
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else console.log("ok  ", m); };
const W = 32;
function img(fn){ const a = new Uint8ClampedArray(W*W*4); for(let y=0;y<W;y++)for(let x=0;x<W;x++){const [r,g,b]=fn(x/W,y/W);const i=(y*W+x)*4;a[i]=r;a[i+1]=g;a[i+2]=b;a[i+3]=255;} return a; }
const solid = (r,g,b) => img(()=>[r,g,b]);
const names = {red:[220,30,30],orange:[250,140,0],yellow:[250,220,40],green:[60,160,60],teal:[0,170,190],blue:[30,130,230],purple:[140,40,170],pink:[236,100,140],brown:[110,76,50],black:[10,10,10],white:[250,250,250],gray:[150,150,150]};
for (const [n,c] of Object.entries(names)) ok(C.classify(solid(...c),W,W)[0]===n, `solid ${n} -> ${C.classify(solid(...c),W,W)}`);
// 흰 배경에 가운데 빨간 물체(가운데 25%)
const redOnWhite = img((u,v)=> (u>.35&&u<.65&&v>.35&&v<.65)?[220,30,30]:[250,250,250]);
ok(C.classify(redOnWhite,W,W).includes("red"), "red object on white includes red: "+C.classify(redOnWhite,W,W));
// 파란 하늘 70% + 검정 30%
const sky = img((u,v)=> v<.7?[40,120,230]:[10,10,10]);
ok(C.classify(sky,W,W)[0]==="blue", "sky first blue: "+C.classify(sky,W,W));
ok(C.topColor(C.shares(sky,W,W))==="blue", "topColor sky blue");
ok(C.topColor(C.shares(solid(250,250,250),W,W))==="white", "topColor white");
const a = C.shares(sky,W,W), b = C.shares(solid(40,120,230),W,W), c = C.shares(solid(220,30,30),W,W);
ok(C.similarity(a,b) > C.similarity(a,c), `similarity blue-sky closer to blue than red: ${C.similarity(a,b).toFixed(2)} > ${C.similarity(a,c).toFixed(2)}`);
ok(C.similarity(a,a) > .999, "self similarity 1");
ok(C.similarity(null,a)===null, "null sim");
// 투명 픽셀 무시
const tr = new Uint8ClampedArray(16*4); ok(C.shares(tr,4,4)===null && C.classify(tr,4,4)===null, "transparent -> null");
// 연한 분홍
ok(C.bucket(250,200,210)==="pink", "pastel pink bucket: "+C.bucket(250,200,210));
console.log(fail?`\n${fail} failed`:"\nall passed"); process.exit(fail?1:0);
