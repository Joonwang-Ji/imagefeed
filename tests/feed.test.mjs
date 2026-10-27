// 피드 점검: 관련도 순위, 약한 결과 접기, [더 보기](한 번에 60장), 엉뚱한 결과만 나올 때 자동 불러오기 중단
// 실행: npm install --no-save jsdom && node tests/feed.test.mjs
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
  { id: "naver", name: "네이버", w: 1.25, en: false, colors: false, desc: "", keyless: false },
  { id: "pixabay", name: "Pixabay", w: 1.1, en: false, colors: true, desc: "", keyless: false },
  { id: "unsplash", name: "Unsplash", w: 1.0, en: true, colors: true, desc: "", keyless: false },
  { id: "wikimedia", name: "Wikimedia", w: 0.5, en: true, colors: false, desc: "", keyless: true },
];
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
run(fs.readFileSync(ROOT + "color.js", "utf8").replace(/^"use strict";/, "")); run(fs.readFileSync(ROOT + "relevance.js", "utf8").replace(/^"use strict";/, ""));
vm.runInContext(fs.readFileSync(ROOT + "app.js", "utf8"), ctx);
await tick(150);
const $ = (s) => w.document.querySelector(s), $$ = (s) => [...w.document.querySelectorAll(s)];
const titles = () => run("M.items.map((x) => x.title || x.tags.join('/'))");
const srcs = () => run("M.items.map((x) => x.src)");
// 화면 끝에 닿는 것을 흉내 냅니다 (jsdom 에는 IntersectionObserver 가 없어 직접 next() 를 부름)
// 테스트에서는 이미지가 실제로 열리지 않으므로(소스가 이미지를 한 장도 못 연 상태면 다음 페이지를 안 부르는 규칙) 열린 것으로 표시합니다.
const imgOk = () => run("for (const id of ['naver','pixabay','unsplash','wikimedia']) IMGH[id] = { ok: 1, bad: 0 }");
const scrollDown = async (n = 5) => { for (let i = 0; i < n; i++) { await run("M.next()"); await tick(150); } };

// ======== 1) 금강엑슬루타워: 강·자연 사진이 위로 올라오지 않는다 ========
imgOk(); const Q = "금강엑슬루타워";
scenario = {
  tr: { [Q]: { t: "Geumgang Exelu Tower", proper: true, type: "apartment tower" } },
  data: { [Q]: {
    // 네이버: 앞의 3개만 이름이 제목에 있고 나머지는 블로그 글
    naver: () => [...[1, 2, 3].map((n) => item("naver", n, { title: `금강엑슬루타워 전경 ${n}` })), ...Array.from({ length: 12 }, (_, i) => item("naver", 10 + i, { title: `우리 동네 맛집 후기 ${i}` }))],
    // 픽사베이: 금강(강) 자연 사진이 1~30위를 차지 (이전에는 이것이 맨 위에 올라왔음)
    pixabay: () => Array.from({ length: 30 }, (_, i) => item("pixabay", i, { tags: ["river", "geumgang", "nature", "landscape"] })),
    // 언스플래시: 강·숲 사진, 설명 없는 사진 2장
    unsplash: () => [...Array.from({ length: 20 }, (_, i) => item("unsplash", i, { title: "a river running through a lush green forest", tags: ["river", "forest"] })), item("unsplash", 90), item("unsplash", 91)],
    // 위키: 한글 제목 1장은 일치, 나머지는 강 풍경
    wikimedia: () => [item("wikimedia", 1, { title: "금강 엑슬루 타워 전경" }), ...Array.from({ length: 9 }, (_, i) => item("wikimedia", 10 + i, { title: `Geumgang River view ${i}` }))],
  } },
};
run(`startSearch(${JSON.stringify(Q)})`); await tick(1500); await scrollDown();
let t = titles();
ok(/금강엑슬루타워 전경 1/.test(t[0]) || /금강/.test(t[0]), "top item is the real tower: " + t[0]);
const top5 = srcs().slice(0, 5);
ok(run("M.items.slice(0, 4).every((x) => x.tier === 'strong')"), "top 4 are exactly the strong matches (3 naver + 1 wikimedia): " + top5.join(","));
ok(run("M.items.slice(0, 4).some((x) => x.src === 'wikimedia')"), "the wikimedia match (source weight 0.5) still beats naver blog posts that only rank higher");
ok(!run("M.items.some((x) => x.tier === 'weak')"), "no weak item is shown in the main list");
const names = run("M.items.map((x) => x.title)");
ok(names.filter((x) => /River|river/.test(x)).length === 0, "no river photo among the shown items");
ok(run("M.items.filter((x) => x.src === 'unsplash').every((x) => x.tier === 'unknown')"), "unsplash photos without caption are shown as unknown (not punished)");
const shown = $$("#grid .card").length;
ok(shown === run("M.items.length") && shown > 0 && shown < 25, `only relevant/unknown cards shown: ${shown}`);
ok(!$("#more").hidden && !$("#more .wbtn").hidden && /관련도 낮은 결과 \d+개 보기/.test($("#more .wbtn").textContent), "weak results are folded behind a button: " + $("#more .wbtn").textContent);
ok(/정확히 맞는 이미지는 \d+개뿐이에요/.test($("#more .mnote").textContent), "note says few exact matches: " + $("#more .mnote").textContent);
ok(calls.some((c) => /src=wikimedia/.test(c) && /pr=1/.test(c)), "proper-noun search tells the server (pr=1) so wikimedia also uses the Korean name");
const nWeak = +$("#more .wbtn").textContent.match(/\d+/)[0];
ok(nWeak > 50, "the weak pool holds the river photos: " + nWeak);
$("#more .wbtn").click(); await tick(100);
ok(run("M.items.some((x) => x.tier === 'weak')") && $("#more .wbtn").hidden, "opening the folded results adds them below and hides the button");
ok(run("M.items.findIndex((x) => x.tier === 'weak') > M.items.findLastIndex((x) => x.tier === 'strong')"), "opened weak results come after all strong ones");

// ======== 2) 소스 순위만으로는 이길 수 없다: 순위 16위의 관련 이미지가 1위의 무관한 이미지를 이김 ========
// (1번 시나리오의 pixabay 1위는 river 사진이었음) — 같은 점수 방식의 직접 점검
const jr = (it, src) => run(`Relevance.judge(${JSON.stringify(it)}, M.terms, ${JSON.stringify(src)}).tier`);
ok(jr({ title: "금강엑슬루타워", tags: [] }, "wikimedia") === "strong" && jr({ title: "", tags: ["river", "geumgang"] }, "pixabay") === "weak", "feed uses the AI-provided proper-noun terms");

// ======== 3) 일반 검색어: 접지 않고 점수순으로만, 60장씩 [더 보기] ========
const Qc = "cat";
scenario.data[Qc] = {
  pixabay: (p) => p > 2 ? [] : Array.from({ length: 40 }, (_, i) => item("pixabay", (p - 1) * 40 + i, { tags: ["cat", "pet"] })),
  unsplash: (p) => p > 2 ? [] : Array.from({ length: 30 }, (_, i) => item("unsplash", (p - 1) * 30 + i, { title: "a cat on a sofa", tags: ["cat"] })),
};
calls.length = 0; run(`startSearch(${JSON.stringify(Qc)})`); await tick(1500);
ok(run("M.terms.specific") === false, "single common word is not specific (nothing is folded)");
ok($$("#grid .card").length === 60, "first view shows exactly 60 cards: " + $$("#grid .card").length);
ok(!$("#more .mbtn").hidden && $("#more .mbtn").textContent === "더 보기", "[더 보기] button appears after 60 cards");
const pagesAfterFirst = calls.filter((c) => /src=pixabay/.test(c)).length;
ok(pagesAfterFirst === 1, "only the first page was requested so far (rest is buffered): " + pagesAfterFirst);
await run("M.next()"); await tick(50);
ok($$("#grid .card").length === 60 && calls.filter((c) => /src=pixabay/.test(c)).length === 1, "scrolling near the bottom does NOT load more (no endless feed)");
$("#more .mbtn").click(); await tick(1200);
ok($$("#grid .card").length === 120, "[더 보기] adds 60 more from the buffer: " + $$("#grid .card").length);
ok(calls.filter((c) => /src=pixabay/.test(c)).length === 1 || calls.filter((c) => /src=pixabay/.test(c)).length === 2, "buffer is used before asking the server again");
$("#more .mbtn").click(); await tick(1500);
ok($$("#grid .card").length === 140, "second page adds the remaining 20 (total 140): " + $$("#grid .card").length);
ok($("#more .mbtn").hidden, "no [더 보기] once every source is exhausted: hidden=" + $("#more .mbtn").hidden);

// ======== 4) 늦게 도착한 소스의 관련도 높은 이미지가 아래로 밀리지 않는다 ========
const Ql = "sunset beach";
scenario.data[Ql] = {
  pixabay: () => Array.from({ length: 40 }, (_, i) => item("pixabay", i, { tags: ["mountain", "snow"] })), // 무관(약함)
  naver: () => Array.from({ length: 40 }, (_, i) => item("naver", i, { title: `일반 블로그 ${i}` })),
  unsplash: () => [item("unsplash", 1, { title: "sunset on the beach", tags: ["sunset", "beach"] }), item("unsplash", 2, { title: "sunset beach waves", tags: ["sunset", "beach"] })],
};
delay = { unsplash: 900 };
run(`startSearch(${JSON.stringify(Ql)})`); await tick(2200); delay = {};
const order = run("M.items.map((x) => x.src + ':' + x.tier)");
const iU = order.findIndex((x) => x.startsWith("unsplash")), iP = order.findIndex((x) => x === "pixabay:weak");
ok(iU >= 0 && iU < 14, `late strong unsplash photos land right after the first screenful (index ${iU})`);
ok(iP === -1 || iU < iP, "and ahead of the irrelevant pixabay photos");

// ======== 5) 엉뚱한 결과만 나오는 검색어: 자동으로 끝없이 불러오지 않는다 ========
const Qw = "tower hotel";
scenario.data[Qw] = {
  pixabay: (p) => Array.from({ length: 40 }, (_, i) => item("pixabay", (p - 1) * 40 + i, { tags: ["sea", "boat"] })),
  unsplash: (p) => Array.from({ length: 30 }, (_, i) => item("unsplash", (p - 1) * 30 + i, { title: "calm lake", tags: ["lake"] })),
};
calls.length = 0; run(`startSearch(${JSON.stringify(Qw)})`); await tick(1500);
for (let i = 0; i < 4; i++) { await run("M.next()"); await tick(200); } // 화면 끝에 닿는 것을 여러 번 흉내
const pg = Math.max(...calls.map((c) => +c.match(/page=(\d+)/)[1]));
ok(pg === 2, "after two pages without any relevant image the auto-loading stops (max page " + pg + ")");
ok($$("#grid .card").length === 0, "no irrelevant card is shown");
ok(!$("#more .wbtn").hidden && !$("#more .mbtn").hidden, "both buttons: 관련도 낮은 결과 보기 / 더 보기");
ok(/찾지 못했어요/.test($("#more .mnote").textContent) && $("#msg").hidden, "explains that nothing matches exactly (and not the generic 'no results' message): " + $("#more .mnote").textContent);
$("#more .mbtn").click(); await tick(1500);
ok(Math.max(...calls.map((c) => +c.match(/page=(\d+)/)[1])) > pg, "[더 보기] tries the next pages again");
$("#more .wbtn").click(); await tick(100);
ok($$("#grid .card").length > 0, "folded results can still be opened");
{ // 같은 소스의 2쪽 1위가 1쪽 30위보다 앞서면 안 된다 (소스 순위는 쪽을 이어서 매김: 1쪽 항목이 모두 먼저)
  const ns = run("M.items.filter((x) => x.src === 'pixabay').map((x) => +x.full.match(/pixabay\\/(\\d+)_full/)[1])").slice(0, 30);
  ok(ns.length === 30 && ns.every((n, i) => n === i), "within a source, rank continues across pages (page 1 items come before page 2 items): " + ns.slice(0, 10).join(","));
}

// ======== 6) 뷰어의 비슷한 이미지 피드: 접지 않고 30장씩 ========
run('startSearch("cat")'); await tick(1500);
$("#grid .card").click(); await tick(100);
ok(run("lv().feed.chunk") === 30 && run("lv().feed.o.fold") === false, "similar-image feed: 30 per view, nothing folded");
ok(!!$(".simlevel .more"), "similar-image feed has its own 더 보기 area");
$("#vclose").click(); await tick(50);

// ======== 7) 홈/탭 전환 시 버튼이 남지 않는다 ========
$("#homeBtn").click(); await tick(50);
ok($("#more").hidden, "home hides the 더 보기 area");
run('startSearch("cat")'); await tick(1500); ok(!$("#more").hidden, "search shows it again");
$("#tabTr").click(); await tick(50); ok($("#more").hidden, "trends tab hides it");
$("#tabFeed").click(); await tick(50); ok(!$("#more").hidden, "returning to the feed brings it back");

ok(errors.length === 0, "no script errors" + (errors.length ? ": " + errors.slice(0, 3).join(" ; ") : ""));
console.log(fail ? `\n${fail} failed` : "\nall passed"); process.exit(fail ? 1 : 0);
