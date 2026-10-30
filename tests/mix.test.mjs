// 소스 배치 점검(21차): 소스 가중치가 낮은 소스(텀블러 등)도 첫 화면·[더 보기]에 고르게 나오는지, 트렌드의 취향 정렬이 소스를 바닥으로 보내지 않는지
// 실행: npm install --no-save jsdom && node tests/mix.test.mjs
import { JSDOM, VirtualConsole } from "jsdom";
import fs from "node:fs"; import vm from "node:vm";
const ROOT = new URL("../public/", import.meta.url).pathname;
const html = fs.readFileSync(ROOT + "index.html", "utf8").replace(/<script[^>]*><\/script>/g, "");
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else console.log("ok  ", m); };
const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));

const vc = new VirtualConsole(); const errors = []; vc.on("jsdomError", (e) => { if (!/Not implemented/.test(e.message)) errors.push(e.message); });
const dom = new JSDOM(html, { url: "https://app.test/", runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: vc });
const w = dom.window, ctx = dom.getInternalVMContext(), run = (c) => vm.runInContext(c, ctx);
w.localStorage.setItem("pass", JSON.stringify("pw"));
w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
w.HTMLImageElement.prototype.decode = () => Promise.resolve();
w.URL.createObjectURL = () => "blob:fake"; w.URL.revokeObjectURL = () => {};
w.matchMedia = () => ({ matches: false });
if (!w.AbortSignal.timeout) w.AbortSignal.timeout = (ms) => { const c = new w.AbortController(); setTimeout(() => c.abort(), ms); return c.signal; };
w.scrollTo = () => {}; w.Element.prototype.scrollTo = function () {};

const sources = [
  ["naver",1.25,false],["kakao",1.1,false],["kakaoblog",0.9,false],["pixabay",1.1,false],["unsplash",1.0,true],["tumblr",0.7,true],["openverse",0.6,true],
  ["wikimedia",0.5,true],["artic",0.7,true],["cleveland",0.7,true],["vam",0.7,true],["nasa",0.7,true],
].map(([id, w, en]) => ({ id, name: id, w, en, colors: false, desc: "", keyless: false })); // 실제 서버의 소스 가중치
// 시나리오마다 소스별 응답을 바꿉니다: gen[query][src](page) → 항목 배열(또는 빈 배열)
let scenario = {}; const calls = []; let delay = {};
const item = (src, n, o = {}) => ({ title: "", tags: [], thumb: `https://x.test/${src}/${n}.jpg`, full: `https://x.test/${src}/${n}_full.jpg`, page: `https://x.test/p/${src}/${n}`, w: 400, h: 300 + (n % 7) * 10, src, sc: false, adult: false, ...o });
w.fetch = async (url) => {
  const u = String(url), res = (o) => ({ ok: true, status: 200, json: async () => o, blob: async () => new w.Blob(["x"], { type: "image/jpeg" }) });
  if (u.startsWith("/api/config")) return res({ sources, locked: [], ai: true, caption: false });
  if (u.startsWith("/api/tr")) { const q = decodeURIComponent(u.match(/q=([^&]+)/)[1]); return res(scenario.tr?.[q] || { t: q }); }
  if (u.startsWith("/api/search")) {
    calls.push(u);
    const q = decodeURIComponent(u.match(/[?&]q=([^&]*)/)[1]), src = u.match(/src=(\w+)/)[1], page = +u.match(/page=(\d+)/)[1];
    const d = delay[src] || 0; if (d) await tick(d);
    return res({ items: scenario.data?.[q]?.[src]?.(page) || [] });
  }
  if (u.startsWith("/api/img")) return res({});
  return { ok: false, status: 404, json: async () => ({}) };
};
run(fs.readFileSync(ROOT + "color.js", "utf8").replace(/^"use strict";/, "")); run(fs.readFileSync(ROOT + "relevance.js", "utf8").replace(/^"use strict";/, "")); run(fs.readFileSync(ROOT + "safety.js", "utf8").replace(/^"use strict";/, "")); run(fs.readFileSync(ROOT + "taste.js", "utf8").replace(/^"use strict";/, "")); run(fs.readFileSync(ROOT + "avoid.js", "utf8").replace(/^"use strict";/, ""));
vm.runInContext(fs.readFileSync(ROOT + "app.js", "utf8"), ctx);
await tick(150);
const $ = (s) => w.document.querySelector(s), $$ = (s) => [...w.document.querySelectorAll(s)];
const titles = () => run("M.items.map((x) => x.title || x.tags.join('/'))");
const srcs = () => run("M.items.map((x) => x.src)");
// 화면 끝에 닿는 것을 흉내 냅니다 (jsdom 에는 IntersectionObserver 가 없어 직접 next() 를 부름)
// 테스트에서는 이미지가 실제로 열리지 않으므로(소스가 이미지를 한 장도 못 연 상태면 다음 페이지를 안 부르는 규칙) 열린 것으로 표시합니다.
const imgOk = () => run("for (const id of ['naver','kakao','kakaoblog','pixabay','unsplash','tumblr','openverse','wikimedia','artic','cleveland','vam','nasa']) IMGH[id] = { ok: 1, bad: 0 }");
const scrollDown = async (n = 5) => { for (let i = 0; i < n; i++) { await run("M.next()"); await tick(150); } };
imgOk();
const pages = (src, per, f) => (p) => p > 4 ? [] : Array.from({ length: per }, (_, i) => f(src, (p - 1) * per + i));
const dist = (n = 1e9) => { const c = {}; run("M.items.map((x) => x.src)").slice(0, n).forEach((s) => (c[s] = (c[s] || 0) + 1)); return c; };

// ======== 1) 영어 일반 검색어(moon): 소스 가중치가 낮은 텀블러도 첫 화면에 나온다 ========
scenario = { data: { moon: {
  naver: pages("naver", 30, (s, n) => item(s, n, {})),
  kakao: pages("kakao", 30, (s, n) => item(s, n, {})),
  kakaoblog: pages("kakaoblog", 20, (s, n) => item(s, n, { title: "moon night " + n })),
  pixabay: pages("pixabay", 30, (s, n) => item(s, n, { tags: ["moon", "night", "sky"] })),
  unsplash: pages("unsplash", 20, (s, n) => item(s, n, { title: "full moon in the night sky " + n, tags: ["moon"] })),
  tumblr: pages("tumblr", 20, (s, n) => item(s, n, { title: "moon post " + n, tags: ["moon", "night", "aesthetic"] })),
  openverse: pages("openverse", 20, (s, n) => item(s, n, { title: "Moon " + n, tags: ["moon"] })),
  wikimedia: pages("wikimedia", 30, (s, n) => item(s, n, { title: "Moon photo " + n })),
  artic: pages("artic", 20, (s, n) => item(s, n, { title: "Moonlit landscape " + n })),
  cleveland: pages("cleveland", 20, (s, n) => item(s, n, { title: "Moon over the bay " + n })),
  vam: pages("vam", 20, (s, n) => item(s, n, { title: "Moon print " + n })),
  nasa: pages("nasa", 20, (s, n) => item(s, n, { title: "Apollo moon " + n, tags: ["moon", "apollo"] })),
} } };
run('startSearch("moon")'); await tick(1800);
let d = dist(), d12 = new Set(run("M.items.slice(0, 12).map((x) => x.src)"));
ok(run("M.items.length") === 60, "first screen holds 60 cards: " + run("M.items.length"));
ok(d12.size >= 5 && d12.has("tumblr"), "first 12 cards come from at least 5 sources and include tumblr: " + [...d12]);
ok((d.tumblr || 0) >= 4, "tumblr has at least 4 of the first 60 (it had 0 before): " + JSON.stringify(d));
ok(Object.keys(d).length >= 6, "at least 6 different sources in the first 60: " + Object.keys(d).length);
ok(Math.max(...Object.values(d)) <= 16, "no source takes more than 16 of 60: " + Math.max(...Object.values(d)));
ok(!(d.artic || d.cleveland || d.vam), "museum sources that don't fit the topic are not pushed in: " + JSON.stringify({ a: d.artic, c: d.cleveland, v: d.vam }));
await run("M.more()"); await tick(900);
d = dist();
ok(run("M.items.length") === 120 && (d.tumblr || 0) >= 12, "after one [더 보기] tumblr keeps appearing: " + JSON.stringify(d));

// ======== 2) 일반 검색어(cat): 검색어와 안 맞는 소스(NASA·미술관)는 최소 노출 대상이 아니라 끼지 않는다 ========
scenario.data.cat = {
  pixabay: pages("pixabay", 30, (s, n) => item(s, n, { tags: ["cat", "pet"] })),
  unsplash: pages("unsplash", 20, (s, n) => item(s, n, { title: "a cat on a sofa", tags: ["cat"] })),
  tumblr: pages("tumblr", 20, (s, n) => item(s, n, { title: "cat post " + n, tags: ["cat"] })),
  openverse: pages("openverse", 20, (s, n) => item(s, n, { title: "Cat " + n, tags: ["cat"] })),
  wikimedia: pages("wikimedia", 30, (s, n) => item(s, n, { title: "Cat photo " + n })),
  nasa: pages("nasa", 20, (s, n) => item(s, n, { title: "Cat's Eye nebula " + n, tags: ["cat"] })),
  artic: pages("artic", 20, (s, n) => item(s, n, { title: "Cat and mouse " + n })),
};
run('startSearch("cat")'); await tick(1800);
d = dist();
ok((d.tumblr || 0) >= 4 && (d.nasa || 0) === 0 && (d.artic || 0) === 0, "cat: tumblr shows, nasa and a museum do not: " + JSON.stringify(d));

// ======== 3) 한글 검색어: 영어로 번역해 찾는 텀블러도 최소한은 나온다 ========
scenario.tr = { 벚꽃: { t: "cherry blossom" } };
scenario.data["벚꽃"] = {
  naver: pages("naver", 30, (s, n) => item(s, n, { title: "벚꽃 사진 " + n })),
  kakao: pages("kakao", 30, (s, n) => item(s, n, { title: "벚꽃 " + n })),
  pixabay: pages("pixabay", 30, (s, n) => item(s, n, { tags: ["벚꽃", "cherry blossom", "spring"] })),
  unsplash: pages("unsplash", 20, (s, n) => item(s, n, { title: "cherry blossom branch " + n, tags: ["cherry blossom"] })),
  tumblr: pages("tumblr", 20, (s, n) => item(s, n, { title: "cherry blossom " + n, tags: ["cherry blossom", "spring"] })),
};
run('startSearch("벚꽃")'); await tick(1800);
d = dist();
ok((d.tumblr || 0) >= 3, "korean query: tumblr (searched with the english translation) still reaches the first 60: " + JSON.stringify(d));
ok((d.naver || 0) >= 10, "korean query: naver stays a main source: " + JSON.stringify(d));

// ======== 4) 트렌드의 취향 정렬: 취향 점수가 0 인 사진(텀블러 등)이 쪽 맨 아래로 가라앉지 않는다 ========
run("S.taste = true; S.priv = false; Taste.learn(['sunset'], 3)");
const list = Array.from({ length: 20 }, (_, i) => ({ title: "", tags: i === 3 ? ["zzz-tumblr"] : i >= 10 ? ["sunset"] : ["misc" + i], src: i === 3 ? "tumblr" : "pixabay", grp: "best", key: "k" + i }));
const ord = run(`trOrder(${JSON.stringify(list)}).map((x) => x.key)`);
ok(ord.indexOf("k3") <= 5, "tumblr photo at position 3 stays near the top even though no taste tag matches it: index " + ord.indexOf("k3"));
ok(ord.indexOf("k10") > ord.indexOf("k3") && ord.indexOf("k10") > 5, "a taste match gives a boost but cannot jump over the whole page: k10 at " + ord.indexOf("k10"));
ok(ord.slice(0, 3).join() === "k0,k1,k2", "the first items keep their order: " + ord.slice(0, 3));

console.log(fail ? `\n${fail} failed` : "\nall passed"); process.exit(fail ? 1 : 0);
