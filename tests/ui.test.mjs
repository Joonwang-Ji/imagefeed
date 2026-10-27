import { JSDOM, VirtualConsole } from "jsdom";
import fs from "node:fs"; import vm from "node:vm";
const ROOT = new URL("../public/", import.meta.url).pathname;
const html = fs.readFileSync(ROOT + "index.html", "utf8").replace(/<script[^>]*><\/script>/g, "");
const css = fs.readFileSync(ROOT + "style.css", "utf8");
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log("FAIL", m); } else console.log("ok  ", m); };
const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));

// ---- 정적 점검: 확대 방지·입력칸 16px ----
ok(/maximum-scale=1/.test(html) && /user-scalable=no/.test(html), "viewport blocks page zoom");
ok(/html,body\{touch-action:pan-x pan-y/.test(css), "css: touch-action pan-x pan-y on html/body");
ok(/input\[type=search\],input\[type=password\]\{[^}]*font-size:16px/.test(css) && /select,textarea\{font-size:16px\}/.test(css), "css: inputs/select/textarea are 16px (no iOS focus zoom)");

const vc = new VirtualConsole(); // 화면 이동 같은 jsdom 미구현 경고는 숨김
const errors = []; vc.on("jsdomError", (e) => { if (!/Not implemented/.test(e.message)) errors.push(e.message); });
const dom = new JSDOM(html, { url: "https://app.test/", runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: vc });
const w = dom.window, ctx = dom.getInternalVMContext();
const run = (code) => vm.runInContext(code, ctx);

// ---- 가짜 환경 ----
w.localStorage.setItem("pass", JSON.stringify("pw"));
w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
w.HTMLImageElement.prototype.decode = () => Promise.resolve();
w.URL.createObjectURL = () => "blob:fake"; w.URL.revokeObjectURL = () => {};
w.matchMedia = () => ({ matches: false });
if (!w.AbortSignal.timeout) w.AbortSignal.timeout = (ms) => { const c = new w.AbortController(); setTimeout(() => c.abort(), ms); return c.signal; };
w.scrollTo = () => {}; w.Element.prototype.scrollTo = function () {};
const sources = [
  { id: "pixabay", name: "Pixabay", w: 1.1, en: false, colors: true, desc: "", keyless: false },
  { id: "openverse", name: "Openverse", w: 0.6, en: true, colors: false, desc: "", keyless: true },
];
let cfgCaption = false; const searchCalls = []; let trendsPayload = null, imgFail = false;
const mk = (n, src = "pixabay", tags = ["sunset", "beach", "sea"], title = "") => ({ title, thumb: `https://x.test/${src}${n}.jpg`, full: `https://x.test/${src}${n}_full.jpg`, page: `https://x.test/p${n}`, w: 400, h: 300 + n * 10, tags, src, sc: false, adult: false });
w.fetch = async (url) => {
  const u = String(url), res = (o) => ({ ok: true, status: 200, json: async () => o, blob: async () => new w.Blob(["x"], { type: "image/jpeg" }) });
  if (u.startsWith("/api/config")) return res({ sources, locked: [], ai: false, caption: cfgCaption });
  if (u.startsWith("/api/search")) { searchCalls.push(u); const src = u.match(/src=(\w+)/)[1]; return res({ items: [1, 2, 3, 4, 5, 6].map((n) => mk(n, src)) }); }
  if (u.startsWith("/api/trends")) return res(trendsPayload);
  if (u.startsWith("/api/img")) { if (!imgFail) return res({}); const f = { ok: false, status: 502, json: async () => ({ error: "upstream 403" }) }; f.clone = () => f; return f; }
  return { ok: false, status: 404, json: async () => ({}) };
};
trendsPayload = { date: "2026-10-24", season: [{ label: "할로윈", q: "할로윈 호박", days: 4, kind: "event" }], rising: [{ label: "벚꽃", q: "벚꽃", kind: "rising", note: "▲40%" }, { label: "한옥", q: "한옥", kind: "hot", note: "" }], dl: { state: "ok" }, items: [
  { ...mk(1, "wiki", [], "손흥민"), grp: "news" }, { ...mk(2, "wiki", [], "Mount Fuji"), grp: "news" }, { ...mk(3, "wiki", [], "서울 야경"), grp: "news" },
  { ...mk(4, "pixabay", ["lake"], ""), grp: "pop" }, { ...mk(5, "pixabay", ["tree"], ""), grp: "pop" }, { ...mk(6, "wikimedia", ["sunset"], "Sunset"), grp: "pick" }, { ...mk(7, "naver", ["hanok"], "한옥 마을 풍경"), grp: "hot", topic: "한옥" } ] };

run(fs.readFileSync(ROOT + "color.js", "utf8").replace(/^"use strict";/, "")); run(fs.readFileSync(ROOT + "relevance.js", "utf8").replace(/^"use strict";/, "")); run(fs.readFileSync(ROOT + "safety.js", "utf8").replace(/^"use strict";/, "")); run(fs.readFileSync(ROOT + "taste.js", "utf8").replace(/^"use strict";/, "")); run(fs.readFileSync(ROOT + "avoid.js", "utf8").replace(/^"use strict";/, ""));
vm.runInContext(fs.readFileSync(ROOT + "app.js", "utf8"), ctx);
await tick(150);
const $ = (s) => w.document.querySelector(s), $$ = (s) => [...w.document.querySelectorAll(s)];

// ---- 홈: 카테고리 ----
ok(!$("#home").hidden && $("#login").hidden, "boot: home visible, login hidden");
let chips = $$("#homeChips button").map((b) => b.textContent);
ok(chips.length === 10 && chips.every((t) => /\S+ \S+/.test(t)), `home shows 10 broad categories: ${chips.slice(0, 4).join(", ")}…`);
const seen = new Set(chips.join("|").split("|")); let changed = false;
for (let i = 0; i < 6 && !changed; i++) { $("#homeShuffle").click(); const c2 = $$("#homeChips button").map((b) => b.textContent); changed = c2.join() !== chips.join(); }
ok(changed, "shuffle button gives a different set of categories");
$("#homeChips button").click(); await tick();
const sub = $$("#homeChips button").map((b) => b.textContent);
ok(!$("#homeBack").hidden && $("#homeShuffle").hidden && /전체 보기/.test(sub[0]) && sub.length >= 6, `drill-down shows sub topics: ${sub.slice(0, 3).join(", ")}…`);
ok(/^\S+ \S+/.test($("#homeTitle").textContent), "drill-down title shows category: " + $("#homeTitle").textContent);
$("#homeBack").click(); ok($("#homeBack").hidden && $$("#homeChips button").length === 10, "back returns to categories");

// ---- 검색창 ✕ ----
const q = $("#q"), qc = $("#qClear");
ok(qc.hidden, "clear button hidden when empty");
q.value = "바다"; q.dispatchEvent(new w.Event("input", { bubbles: true })); ok(!qc.hidden, "clear button shows when typing");
const pd = new w.Event("pointerdown", { cancelable: true, bubbles: true }); qc.dispatchEvent(pd); ok(pd.defaultPrevented, "clear button keeps keyboard (pointerdown prevented)");
qc.click(); ok(q.value === "" && qc.hidden, "clear button empties input in one tap");

// ---- 검색 + 색상 필터 소스 선택 ----
run('startSearch("sunset")'); await tick(900);
ok(searchCalls.length === 2 && ["pixabay", "openverse"].every((s) => searchCalls.some((c) => c.includes("src=" + s))), "no color: both sources searched");
ok(!$("#qClear").hidden && $("#q").value === "sunset", "clear button visible after a search fills the box");
searchCalls.length = 0;
run('S.color = "red"; rerun()'); await tick(900);
ok(searchCalls.length === 1 && /src=pixabay/.test(searchCalls[0]) && /color=red/.test(searchCalls[0]), "color (accurate mode): only color-capable source queried: " + searchCalls.map((c) => c.match(/src=\w+/)[0]));
ok($$("#stat .sc.idle").length === 1 && /Openverse/.test($("#stat .sc.idle").textContent) && !/…/.test($("#stat .sc.idle").textContent), "unused source is dimmed, not stuck on '…'");
$("#filterBtn").click(); ok(!$("#cwRow").hidden && /빠르고 정확/.test($("#colorNote").textContent), "filter panel shows accurate/wide switch + note");
searchCalls.length = 0; $$("#cwSeg button")[1].click(); await tick(900);
ok(searchCalls.length === 2, "wide mode queries all sources again");
ok(run("S.colorWide") === true && /모든 소스/.test($("#colorNote").textContent), "wide mode remembered and explained");
run('S.colorWide = false; LS.set("cw", false)');
$("#filterBtn").click(); ok(!$("#filters").hidden, "filter panel open"); $("#filterClose").click(); ok($("#filters").hidden, "filter panel closes with its 닫기 button");
$("#srcBtn").click(); ok(!$("#srcPanel").hidden, "source panel open"); $("#srcClose").click(); ok($("#srcPanel").hidden, "source panel closes with its 닫기 button");
run('S.color = ""; rerun()'); await tick(900);

// ---- 뷰어 + 닫기 ----
ok($$("#grid .card").length >= 6, `search cards rendered: ${$$("#grid .card").length}`);
$("#grid .card").click(); await tick(60);
ok(!$("#viewer").hidden, "viewer opens on card tap");
$("#vfab").click(); await tick(60); ok($("#viewer").hidden, "floating 닫기 button closes viewer");
$("#grid .card").click(); await tick(60); $("#vclose").click(); await tick(60); ok($("#viewer").hidden, "top ✕ closes viewer");

// ---- 확대·축소 ----
$("#grid .card").click(); await tick(60);
const wrap = $(".vwrap"), vimg = $("#vimg"), stage = $(".vstage");
Object.defineProperty(wrap, "clientWidth", { value: 400 }); Object.defineProperty(wrap, "clientHeight", { value: 600 });
Object.defineProperty(vimg, "clientWidth", { value: 400 }); Object.defineProperty(vimg, "clientHeight", { value: 300 });
wrap.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 600 });
const ptr = (type, id, x, y, el = wrap) => { const e = new w.Event(type, { bubbles: true, cancelable: true }); Object.assign(e, { pointerId: id, clientX: x, clientY: y, pointerType: "touch", button: 0 }); el.dispatchEvent(e); };
const Z = () => run("({s:Z.s,x:Z.x,y:Z.y})");
const gs = new w.Event("gesturestart", { cancelable: true, bubbles: true }); w.document.dispatchEvent(gs); ok(gs.defaultPrevented, "iOS pinch gesture on the page is blocked");
ok(Z().s === 1 && !stage.classList.contains("zoomed") && $("#vzreset").hidden, "starts at 1x");
ptr("pointerdown", 1, 200, 300); ptr("pointerup", 1, 200, 300); ptr("pointerdown", 1, 200, 300); ptr("pointerup", 1, 200, 300);
ok(Z().s === 2.5 && stage.classList.contains("zoomed") && !$("#vzreset").hidden && /scale\(2\.5\)/.test(vimg.style.transform), "double-tap zooms to 2.5x and shows reset button");
const idx0 = run("lv().cur");
ptr("pointerdown", 1, 200, 300); ptr("pointermove", 1, 140, 320); ptr("pointerup", 1, 140, 320);
ok(Z().x === -60 && Z().y === 20, `drag pans the zoomed image: ${JSON.stringify(Z())}`);
ok(run("lv().cur") === idx0, "dragging while zoomed does not flip to the next image");
ptr("pointerdown", 1, 100, 300); ptr("pointermove", 1, 800, 300); ptr("pointerup", 1, 800, 300);
ok(Z().x === 300, "pan is clamped to the image edge: x=" + Z().x);
ptr("pointerdown", 1, 200, 300); ptr("pointerup", 1, 200, 300); ptr("pointerdown", 1, 200, 300); ptr("pointerup", 1, 200, 300);
ok(Z().s === 1 && !stage.classList.contains("zoomed") && vimg.style.transform === "", "double-tap again returns to 1x");
ptr("pointerdown", 1, 150, 300); ptr("pointerdown", 2, 250, 300); ptr("pointermove", 1, 100, 300); ptr("pointermove", 2, 300, 300);
ok(Math.abs(Z().s - 2) < 0.01, "pinch out doubles the zoom: " + Z().s);
ptr("pointerup", 1, 100, 300); ptr("pointerup", 2, 300, 300);
ok(Z().s > 1.9, "lifting fingers keeps the zoom");
$("#vzreset").click(); ok(Z().s === 1 && $("#vzreset").hidden, "원래 크기 button resets");
ptr("pointerdown", 1, 150, 300); ptr("pointerdown", 2, 250, 300); ptr("pointermove", 1, 190, 300); ptr("pointermove", 2, 210, 300);
ok(Z().s === 1, "pinch in at 1x does not shrink below 1x"); ptr("pointerup", 1, 190, 300); ptr("pointerup", 2, 210, 300);
const before = run("lv().cur"); ptr("pointerdown", 1, 320, 300); ptr("pointerup", 1, 200, 310); await tick(30);
ok(run("lv().cur") === before + 1, "swipe left at 1x still goes to the next image");
const wheel = new w.Event("wheel", { cancelable: true, bubbles: true }); Object.assign(wheel, { ctrlKey: true, deltaY: -50, clientX: 200, clientY: 300 }); wrap.dispatchEvent(wheel);
ok(Z().s > 1 && wheel.defaultPrevented, "ctrl+wheel zooms on desktop"); $("#vzreset").click();
$("#vclose").click(); await tick(60); ok(Z().s === 1, "zoom resets when viewer closes");

// ---- 비슷한 이미지: 검색어에 색 이름, 색 기준 재정렬 ----
const sc = (it, cap, cw) => run(`simCandidates(${JSON.stringify(it)}, ${JSON.stringify(cap)}, ${JSON.stringify(cw)})`);
let c = sc({ tags: ["sunset", "beach", "sea"], title: "" }, "", "orange");
ok(c[0] === "sunset beach orange" && c.includes("sunset beach sea"), "tags + color word first: " + c.slice(0, 3).join(" / "));
c = sc({ tags: ["red", "poppy"], title: "" }, "", "red"); ok(c[0] === "red poppy", "color word not duplicated: " + c[0]);
c = sc({ tags: [], title: "서울 야경 사진" }, "", "blue"); ok(c[0].endsWith("파랑"), "Korean query gets Korean color word: " + c[0]);
c = sc({ tags: ["a1"], title: "x" }, "city night lights bridge", "blue"); ok(c[0] === "city night lights bridge", "AI caption stays first and unchanged: " + c[0]);
// 재정렬
$("#grid .card").click(); await tick(60);
ok(run("lv()") && true, "viewer open for rerank test");
run(`(() => { const l = lv(); const CT = ColorTools; const rgb = (r,g,b)=>{const a=new Uint8ClampedArray(16*16*4);for(let i=0;i<256;i++){a[i*4]=r;a[i*4+1]=g;a[i*4+2]=b;a[i*4+3]=255;}return CT.shares(a,16,16);};
  l.sig = rgb(40,120,230); l.m.clear(); l.rrDone = 0;
  const cols = [[220,30,30],[220,30,30],[220,30,30],[30,150,60],[30,150,60],[30,150,60],[40,120,230],[40,125,225],[45,118,235]];
  window.__its = cols.map((c,i)=>({ id:"r"+i, title:"c"+i, thumb:"https://x.test/r"+i, full:"https://x.test/r"+i, src:"pixabay", tags:[], sh: rgb(...c) }));
  l.m.add(window.__its.map((it)=>makeCard(it, ()=>{}))); })()`);
run("simRerank(lv())");
const order = run("lv().m.cards.map(c => c._it.title).join()");
ok(/^c6,c7,c8/.test(order), "similar images re-ordered so same-color ones come first: " + order);
ok(run("lv().rrDone") === 1, "rerank counted");
run("lv().m.reorder((a,b)=> a._it.id < b._it.id ? -1 : 1); lv().rrDone = 2; simRerank(lv())");
ok(run("lv().m.cards[0]._it.title") === "c0", "no more than two reranks per image");
$("#vclose").click(); await tick(60);

// ---- 이미지가 계속 열리지 않는 소스: 깜빡임·끝없는 불러오기 방지 ----
{
  const lc = run("loadCard"), img = (c) => c.querySelector("img");
  const fire = (el, type) => el.dispatchEvent(new w.Event(type));
  run('S.only = new Set(["openverse"])'); imgFail = true; searchCalls.length = 0;
  run('startSearch("brokenimg")'); await tick(900);
  let cs = $$("#grid .card");
  ok(cs.length === 6 && searchCalls.length === 1, `broken source: ${cs.length} cards rendered from ${searchCalls.length} search call`);
  for (const [i, c] of cs.slice(0, 4).entries()) {
    await lc(c); await tick(10); fire(img(c), "error");
    if (i < 3) ok(!c.isConnected && !run("Object.keys(DEAD).length"), `failed card ${i + 1} is removed, source not given up yet`);
  }
  await tick(30);
  ok(run("Object.keys(DEAD)").includes("openverse"), "after 4 failures with 0 successes the source is rested");
  ok($$("#grid .card").length === 0, "all its cards (also the ones not opened yet) are cleared from the grid");
  const n = searchCalls.length; await run("M.next()"); await tick(50);
  ok(searchCalls.length === n, "no more pages are requested for the rested source (no endless loading)");
  ok($$("#stat .sc.bad").length === 1 && !!$("#stat .warn"), "stat shows ⚠ on the rested source");
  $("#stat .warn").click(); ok(/upstream 403/.test($("#toast").textContent) && /중계 upstream 403 → 직접 로딩도 실패/.test($("#toast").textContent), "⚠ shows the reason for both paths: " + $("#toast").textContent);
  ok(!$("#msg").hidden && /쉬고 있는/.test($("#msg").textContent), "empty-feed message explains the rested source");
  // 소스 이름을 누르면 다시 시도
  imgFail = false; run("S.ml = false");
  searchCalls.length = 0; $$("#stat .sel").find((b) => /Openverse/.test(b.textContent)).click(); await tick(1100);
  ok(!run("Object.keys(DEAD).length") && searchCalls.length >= 1, "tapping the source name clears the rest and searches again");
  const ov = () => $$("#grid .card").filter((c) => c._it.src === "openverse");
  cs = ov(); ok(cs.length === 6, "its cards are back after the retry (selection was cleared, so all sources searched): " + cs.length);
  await lc(cs[0]); await tick(10); fire(img(cs[0]), "load");
  for (const c of cs.slice(1)) { await lc(c); await tick(5); fire(img(c), "error"); }
  await tick(30);
  ok(!run("Object.keys(DEAD).length") && ov().length === 1, "a source that opened at least one image is never rested; only the broken cards go");
  // 한 장도 안 열린 소스는 다음 페이지를 더 불러오지 않고, 첫 이미지가 열리면 이어서 불러옴
  run('S.only = new Set(["openverse"]); S.ml = false'); imgFail = false; searchCalls.length = 0;
  run('delete IMGH.openverse; delete DEAD.openverse; startSearch("holdtest")'); await tick(900);
  ok(searchCalls.length === 1 && ov().length === 6, "hold test: first page loaded");
  await run("M.next()"); await tick(50);
  ok(searchCalls.length === 1, "page 2 is NOT requested while no image of the source has opened");
  const first = ov()[0]; await lc(first); await tick(10); fire(img(first), "load");
  await run("M.next()"); await tick(50);
  ok(searchCalls.length === 2, "page 2 is requested once the first image opened");
  run('S.only = new Set(); S.ml = true'); imgFail = false;
}
{ // 중계 실패 사유 문구
  const e1 = Object.assign(new Error("HTTP 502"), { detail: "upstream 429" }), e2 = Object.assign(new Error("t"), { name: "TimeoutError" });
  ok(run(`whyOf(${JSON.stringify({ detail: "upstream 429" })})`) === "중계 upstream 429", "whyOf uses proxy detail");
  ok(run(`whyOf({ name: "TimeoutError" })`) === "중계 시간 초과", "whyOf reports timeouts");
}

// ---- 트렌드: 이미지 그리드 ----
$("#tabTr").click(); await tick(100);
ok(!$("#trends").hidden && $$("#trGrid .card").length === 4, `trends tab (추천) shows hot+popular+featured photos but not the wiki news: ${$$("#trGrid .card").length} cards`);
ok($$("#trSeg button").map((b) => b.textContent).join(",") === "추천,뜨는,인기,잘 찍은,화제" && !!$("#trRefresh .i") && $("#trRefresh").getAttribute("aria-label") === "새로고침", "trend header: 5 short tabs + icon-only refresh button");
ok(!$("#trLang") && !$("#trChips"), "no country/language selector or word chips");
ok(/2026-10-24/.test($("#trNote").textContent), "trend note shows date");
ok($$("#trTopics button").length === 3 && /할로윈 D-4/.test($("#trTopics").textContent) && /벚꽃 ▲40%/.test($("#trTopics").textContent), "trend topic chips: season/event + rising with growth: " + $("#trTopics").textContent);
ok(/가져오지 못했어요 \(네이버 API HUB/.test($("#trNote").textContent) === false, "dl ok -> no error note");
$$("#trSeg button")[1].click(); ok($$("#trGrid .card").length === 1 && $$("#trGrid .card .tag")[0].textContent === "한옥", "뜨는 tab shows naver hot-topic images, labelled with the topic");
$$("#trSeg button")[2].click(); ok($$("#trGrid .card").length === 2, "인기 사진 filter shows only popular photos");
$$("#trSeg button")[3].click(); ok($$("#trGrid .card").length === 1, "잘 찍은 사진 filter shows featured pictures");
$$("#trSeg button")[4].click(); ok($$("#trGrid .card").length === 3, "오늘의 화제 filter shows only wiki news photos");
$$("#trSeg button")[0].click(); ok($$("#trGrid .card").length === 4, "추천 excludes news");
$$("#trTopics button")[0].click(); await tick(100); ok($("#q").value === "할로윈 호박" && searchCalls.some((u) => u.includes(encodeURIComponent("할로윈 호박"))), "topic chip starts a search");
$("#tabTr").click(); await tick(60); $$("#trSeg button")[4].click();
ok($$("#trGrid .card .tag").some((t) => t.textContent === "위키백과"), "wiki items labelled 위키백과");
$("#trGrid .card").click(); await tick(60); ok(!$("#viewer").hidden && /손흥민/.test($("#vtitle").textContent), "trend image opens in viewer");
$("#vfab").click(); await tick(60);
$("#tabFeed").click(); $("#homeBtn").click(); await tick(60);
$("#exTrend").click(); await tick(60); ok(!$("#trends").hidden, "home 요즘 화제 button opens trends tab");

// ---- 홈으로 ----
$("#homeBtn").click(); await tick(60); ok(!$("#home").hidden && $("#q").value === "" && $("#qClear").hidden, "⌂ returns to home and clears the box");

// ---- 시트 닫기 ----
$("#gear").click(); ok(!$("#settings").hidden, "settings opens");
$("#settings").click(); ok($("#settings").hidden, "tap outside closes settings");
$("#gear").click(); $("#closeSet").click(); ok($("#settings").hidden, "bottom 닫기 button closes settings");
$("#gear").click(); const grab = $("#settings .grab");
ptr("pointerdown", 5, 100, 100, grab); ptr("pointermove", 5, 100, 130, grab); ptr("pointerup", 5, 100, 130, grab);
ok(!$("#settings").hidden && $("#settings .bsheet").style.transform === "", "short drag on handle snaps back");
ptr("pointerdown", 5, 100, 100, grab); ptr("pointermove", 5, 100, 220, grab); ptr("pointerup", 5, 100, 220, grab);
ok($("#settings").hidden, "dragging the handle down closes settings");
$("#bmSheet").hidden = false; $("#bmSheet").click(); ok($("#bmSheet").hidden, "tap outside closes 보드·메모 sheet");
$("#bmSheet").hidden = false; $("#bmCancel").click(); ok($("#bmSheet").hidden, "취소 closes 보드·메모 sheet");
$("#gear").click(); w.dispatchEvent(Object.assign(new w.Event("keydown", { bubbles: true }), { key: "Escape" })); ok($("#settings").hidden, "Esc closes settings");

// ---- 북마크 검색 ✕ ----
$("#tabBm").click(); await tick(60);
$("#bmq").value = "abc"; $("#bmq").dispatchEvent(new w.Event("input", { bubbles: true })); ok(!$("#bmClear").hidden, "bookmark search ✕ shows");
$("#bmClear").click(); ok($("#bmq").value === "" && run("S.bmq") === "", "bookmark search ✕ clears");

// ======== 9차: 비공개 모드 · 취향 학습 · 톤/팔레트 · 북마크 분석 · 부분 검색 ========
// 캔버스·이미지 로딩·IndexedDB 는 jsdom 에 없으므로 가짜로 대체합니다.
const pastel = new Uint8ClampedArray(32 * 32 * 4); for (let i = 0; i < 32 * 32; i++) pastel.set([255, 200, 200, 255], i * 4);
let canvasData = pastel;
w.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {}, getImageData: () => ({ data: canvasData }) });
w.HTMLCanvasElement.prototype.toBlob = function (cb) { cb(new w.Blob(["c"], { type: "image/jpeg" })); };
w.Image = class { set src(v) { this._s = v; setTimeout(() => this.onload && this.onload(), 0); } get src() { return this._s; } get naturalWidth() { return 400; } get naturalHeight() { return 300; } };
run('DB._m = []; DB.all = async () => DB._m.map((x) => ({ ...x })); DB.put = async (o) => { DB._m = DB._m.filter((x) => x.id !== o.id); DB._m.push(o); return true; }; DB.del = async (id) => { DB._m = DB._m.filter((x) => x.id !== id); return true; };');
const item = (id, tags, extra = {}) => ({ id, key: id, title: "t" + id, thumb: `https://x.test/${id}.jpg`, full: `https://x.test/${id}_f.jpg`, page: "p", src: "pixabay", w: 400, h: 300, tags, ...extra });
run(`globalThis.__i = ${JSON.stringify(item("n1", ["cat", "sofa"]))}`);

// 톤/팔레트 분석
const pi = run("pixelInfo({})");
ok(pi && pi.an && pi.an.tone === "pastel" && pi.an.temp === "warm" && pi.an.pal.length >= 1 && /^#[0-9a-f]{6}$/.test(pi.an.pal[0].hex), "pixelInfo adds tone/temp/palette: " + JSON.stringify(pi?.an && { t: pi.an.tone, w: pi.an.temp, p: pi.an.pal[0] }));
// 톤 필터 판정 (모르는 이미지는 통과)
ok(JSON.stringify(run('(() => { S.tone = "pastel"; const p = predTone(), r = [p({ _it: { an: { tone: "pastel" } } }), p({ _it: { an: { tone: "dark" } } }), p({ _it: {} })]; S.tone = ""; return r; })()')) === "[true,false,true]", "tone filter: match passes, other tone dropped, unknown passes");
ok(JSON.stringify(run('(() => { S.tone = "warm"; const p = predTone(), r = [p({ _it: { an: { tone: "dark", temp: "warm" } } }), p({ _it: { an: { tone: "dark", temp: "cool" } } })]; S.tone = ""; return r; })()')) === "[true,false]", "warm/cool filter uses color temperature");
ok($$("#tones button").length === 9 && $$("#tones button")[0].textContent === "전체", "filter panel has tone row");
$("#filterBtn").click(); $$("#tones button")[1].click(); ok(run("S.tone") === "pastel" && $("#filterBadge").textContent === "1", "tone button sets the filter and badge"); $("#filterReset").click(); ok(run("S.tone") === "" && $("#filterBadge").textContent === "", "reset clears tone"); $("#filterClose").click();

// 취향 학습: 기본 꺼짐, 켜면 학습, 비공개 모드에서는 멈춤
ok(run("S.taste") === false && run("Taste.isEmpty()"), "taste learning is OFF by default and empty");
run("learnFrom(__i, 3)"); ok(run("Taste.isEmpty()"), "off -> nothing learned");
$("#gear").click(); ok($("#sTaste").checked === false && $("#tasteView").hidden, "settings: taste checkbox off"); $("#sTaste").checked = true; $("#sTaste").dispatchEvent(new w.Event("change")); ok(run("S.taste") === true && run("LS.get('tasteOn', false)") === true, "taste turned on and saved"); $("#closeSet").click();
run("learnFrom(__i, 3); learnFrom(__i, 3)"); ok(run("Taste.top(3).includes('cat')") && run("Taste.affinity(['cat'])") > 0.5, "learns tags from a liked image: " + run("Taste.top(3)"));
ok(w.localStorage.getItem("taste") && !/cat.*x\.test/.test(w.localStorage.getItem("taste")) && !/https?:/.test(w.localStorage.getItem("taste")), "stored taste has only aggregated scores (no urls)");
run('learnFrom({ ...__i, adult: true, tags: ["secret", "adultx"] }, 3)'); ok(!run("Taste.top(20)").includes("secret"), "adult-flagged images are never learned");
run('learnFrom({ ...__i, grp: "news", tags: [], title: "손흥민 경기" }, 3)'); ok(!run("Taste.top(20)").some((k) => k.includes("손흥민")), "news (person/event) titles are not learned");
// 순서 조정: 취향에 맞는 이미지가 같은 순위의 다른 이미지보다 위로
const scores = run(`(() => { M.reset(); M.begin("sea"); M.merge([{ src: { id: "pixabay", w: 1 }, items: [{ ...__i, tags: ["plain", "other"], full: "https://x.test/a", title: "A" }, { ...__i, tags: ["cat", "sofa"], full: "https://x.test/b", title: "B" }], base: 0 }]); const r = [...M.pend.values()].map((e) => [e.it.title, e.score]); M.reset(); return r; })()`);
const sa = Object.fromEntries(scores);
ok(sa.B > sa.A, `taste re-ranks results (rank 2 liked image beats rank 1 neutral): A=${sa.A?.toFixed(5)} B=${sa.B?.toFixed(5)}`);

// 비공개 모드
ok(!$("#privBtn").hidden && $("#privBtn").getAttribute("aria-label") === "비공개 모드" && run("S.priv") === false, "private mode icon exists, off by default");
$("#privBtn").click(); ok(run("S.priv") === true && w.document.body.classList.contains("priv") && $("#privBtn").getAttribute("aria-pressed") === "true", "private mode on: body.priv + pressed");
ok(run("tasteOn()") === false, "private mode disables taste");
const tvBefore = run("JSON.stringify(Taste.view())"); run("learnFrom(__i, 5); learnFrom({ ...__i, tags: ['brandnew1', 'brandnew2'] }, 5)"); ok(run("JSON.stringify(Taste.view())") === tvBefore, "private mode: learning paused");
const scoresP = Object.fromEntries(run(`(() => { M.reset(); M.begin("sea"); M.merge([{ src: { id: "pixabay", w: 1 }, items: [{ ...__i, tags: ["plain", "other"], full: "https://x.test/a", title: "A" }, { ...__i, tags: ["cat", "sofa"], full: "https://x.test/b", title: "B" }], base: 0 }]); const r = [...M.pend.values()].map((e) => [e.it.title, e.score]); M.reset(); return r; })()`));
ok(scoresP.A > scoresP.B, "private mode: no taste re-ranking");
$("#tabBm").click(); await tick(40); ok(run("S.view") !== "bm", "private mode: bookmarks cannot be opened");
run("toggleBookmark(__i)"); await tick(40); ok(run("DB._m.length") === 0, "private mode: bookmarking blocked");
$("#homeBtn").click(); await tick(60); ok($$("#homeChips button.mine").length === 0, "private mode: no personalised home chips");
$("#privBtn").click(); ok(run("S.priv") === false && !w.document.body.classList.contains("priv"), "private mode off again");
ok(w.localStorage.getItem("priv") === "false", "private mode state is remembered");

// 북마크 분석 (저장할 때 톤·팔레트) + 취향 반영
run("toggleBookmark(__i)"); await tick(80);
const rec = run("DB._m[0]"); ok(rec && rec.an && rec.an.tone === "pastel" && rec.an.pal.length >= 1, "bookmark stores tone/palette analysis: " + JSON.stringify(rec?.an?.tone));
ok(run("Taste.affinity(['sofa'])") > 0.5, "bookmarking teaches taste");
// 예전 북마크(분석 없음)는 북마크 화면에서 뒤에서 분석
run(`DB._m.push({ id: "old1", title: "old", thumb: "https://x.test/old1.jpg", full: "https://x.test/old1_f.jpg", page: "p", src: "pixabay", w: 400, h: 300, tags: ["old"], ts: 1, blob: new Blob(["x"]) }); DB._m.push({ id: "old2", title: "old2", thumb: "https://x.test/old2.jpg", full: "https://x.test/old2_f.jpg", page: "p", src: "pixabay", w: 400, h: 300, tags: ["old"], ts: 2, blob: new Blob(["x"]) });`);
$("#tabBm").click(); await tick(300);
ok(run("DB._m.every((x) => x.an)"), "old bookmarks get analysed in the background (stored inside the bookmark)");
await tick(200);
ok(!$("#bmfil").hidden && $$("#bmfil button").some((b) => /파스텔/.test(b.textContent)) && $$("#bmfil .dot").length >= 1, "bookmark tone/color filter chips shown: " + $$("#bmfil button").map((b) => b.textContent).join("|"));
const nAll = $$("#bmgrid .card").length; $$("#bmfil button").find((b) => /파스텔/.test(b.textContent)).click(); await tick(60);
ok(nAll === 3 && $$("#bmgrid .card").length === 3, "tone filter keeps pastel bookmarks (" + nAll + ")");
run('DB._m[1].an = { tone: "dark", temp: "cool", cols: ["blue"], pal: [] }'); $$("#bmfil button").find((b) => /파스텔/.test(b.textContent)).click(); await tick(40);
$("#tabFeed").click(); $("#tabBm").click(); await tick(60);
const dk = $$("#bmfil button").find((b) => /어두운/.test(b.textContent)); dk.click(); await tick(60);
ok($$("#bmgrid .card").length === 1, "choosing 어두운 shows only dark bookmarks");
run("S.bmTone = ''; S.bmColor = ''");

// 보드 기반 추천
run(`DB._m.forEach((x) => { x.board = "여행"; x.tags = ["beach", "summer"]; })`); run('S.board = "여행"'); $("#tabFeed").click(); $("#tabBm").click(); await tick(80);
ok(!$("#bmrecRow").hidden, "board with 2+ bookmarks offers 어울리는 이미지");
searchCalls.length = 0; $("#bmrecBtn").click(); await tick(900);
ok(!$("#bmrec").hidden && /beach summer/.test($("#bmrecq").textContent) && searchCalls.some((u) => u.includes(encodeURIComponent("beach summer"))), "board recommendation searches by the board's top tags: " + $("#bmrecq").textContent);
ok($$("#bmrecGrid .card").length >= 1, "board recommendation shows images");
$("#bmrecClose").click(); ok($("#bmrec").hidden, "board recommendation closes");
run('S.board = "__all"');

// 부분 검색
cfgCaption = true; run("cfg.caption = true; capOff = false");
const calls = []; const oldFetch = w.fetch;
w.fetch = async (url, opt) => { if (String(url).startsWith("/api/caption")) { calls.push(opt); return { ok: true, status: 200, json: async () => ({ q: "red flower" }) }; } return oldFetch(url, opt); };
$("#tabFeed").click(); run('startSearch("sunset")'); await tick(900);
$("#grid .card").click(); await tick(120);
ok(!$("#viewer").hidden && !$("#vcrop").hidden, "viewer shows 부분 검색 button when AI caption is available");
$("#vcrop").click(); ok(!$("#vcropui").hidden, "crop overlay opens");
// 너무 작은 영역은 거절
run("setCr({ x: 0.4, y: 0.4, w: 0.01, h: 0.01 })"); w.HTMLElement.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300 }; };
$("#vcropui").hidden = false; await run("cropGo()"); ok(!calls.length, "tiny crop area is rejected without calling AI");
$("#vcrop").click(); run("setCr({ x: 0.1, y: 0.2, w: 0.5, h: 0.5 })"); await run("cropGo()"); await tick(200);
ok(calls.length === 1 && calls[0].method === "POST", "crop sends only the selected region to AI caption");
ok(/red flower/.test($("#vsimq").textContent) && /✂/.test($("#vsimq").textContent), "similar images now follow the cropped part: " + $("#vsimq").textContent);
ok($("#vcropui").hidden, "crop overlay closes after search");
$("#vcrop").click(); $("#vcno").click(); ok($("#vcropui").hidden, "취소 closes crop overlay");
w.fetch = oldFetch;
// 뷰어 팔레트·톤·👍
run("lv().list[lv().cur].an = { tone: 'pastel', temp: 'warm', cols: ['pink'], pal: [{ hex: '#ffc8c8', name: 'pink', share: 0.6 }] }; renderVInfo(lv().list[lv().cur])"); run("lv().crop = false; updateSimHead()");
ok(!$("#vinfo").hidden && $$("#vpal .sw").length === 1 && /파스텔 · 따뜻한/.test($("#vtone").textContent), "viewer shows palette swatches and tone: " + $("#vtone").textContent);
ok(!$("#vsimtone").hidden && /같은 톤만/.test($("#vsimtone").textContent), "same-tone toggle available");
$("#vsimtone").click(); ok(run("lv().toneOnly") === true && /✓/.test($("#vsimtone").textContent), "same-tone toggle turns on");
ok(!$("#vlike").hidden && !$("#vdis").hidden, "👍/👎 shown while taste learning is on");
const aff0 = run("Taste.affinity(['sunset'])"); run("curItem().tags = ['sunset']"); $("#vlike").click(); ok(run("Taste.affinity(['sunset'])") > aff0, "👍 teaches taste");
$("#vdis").click(); run("S.taste = false"); $("#vfab").click(); await tick(60);

// ======== 10차: 종교 주제 제외 · 부분 검색 상자 · 보정 칩 · 취향/추천 안 함 지우기 ========
const { offTopic } = await import("../src/topics.js");
ok(!run("CATS.flatMap((c) => [c[1], ...c[2]])").some((t) => offTopic(t)), "home topic chips contain no other-religion / occult topics");

// 부분 검색 상자: 처음부터 떠 있고, 옮기고, 모서리로 크기를 바꾸고, 이미지 밖으로 못 나가고, 너무 작아지지 않는다
run("S.taste = true; cfg.caption = true; capOff = false");
$("#tabFeed").click(); run('startSearch("sunset")'); await tick(900); $("#grid .card").click(); await tick(120);
$("#vcrop").click();
const ui = $("#vcropui"), CRr = () => run("CR.r"), near = (a, b) => Math.abs(a - b) < 0.005;
ok(!ui.hidden && $$("#vcr .h").length === 4, "crop box starts as a visible box with 4 corner handles");
ptr("pointerdown", 7, 320, 240, ui); ptr("pointermove", 7, 360, 270, ui); ptr("pointerup", 7, 360, 270, ui);
ok(near(CRr().x, 0.2) && near(CRr().y, 0.2) && near(CRr().w, 0.7) && near(CRr().h, 0.7), "dragging the bottom-right corner resizes the box (opposite corner stays): " + JSON.stringify(CRr()));
ptr("pointerdown", 7, 200, 150, ui); ptr("pointermove", 7, 220, 165, ui); ptr("pointerup", 7, 220, 165, ui);
ok(near(CRr().x, 0.25) && near(CRr().y, 0.25) && near(CRr().w, 0.7), "dragging inside the box moves it without resizing: " + JSON.stringify(CRr()));
ptr("pointerdown", 7, 200, 150, ui); ptr("pointermove", 7, 900, 900, ui); ptr("pointerup", 7, 900, 900, ui);
ok(near(CRr().x + CRr().w, 1) && near(CRr().y + CRr().h, 1), "the box cannot leave the image: " + JSON.stringify(CRr()));
{ const r = CRr(); ptr("pointerdown", 7, r.x * 400, r.y * 300, ui); ptr("pointermove", 7, 395, 295, ui); ptr("pointerup", 7, 395, 295, ui); }
ok(CRr().w >= 0.07 - 1e-9 && CRr().h >= 0.07 - 1e-9 && near(CRr().x + CRr().w, 1), "the box keeps a minimum size when a corner is dragged past the other: " + JSON.stringify(CRr()));
run("setCr({ x: 0.1, y: 0.1, w: 0.3, h: 0.3 })"); ptr("pointerdown", 7, 300, 250, ui); ptr("pointermove", 7, 380, 290, ui); ptr("pointerup", 7, 380, 290, ui);
ok(near(CRr().x, 0.75) && near(CRr().w, 0.2), "dragging an empty spot still draws a new box: " + JSON.stringify(CRr()));

// 보정: 부분 검색 결과는 전체 이미지의 태그·현재 검색어로 돌아가지 않고, AI 단어 칩과 직접 입력으로 고칠 수 있다
const capCalls = []; const oldF2 = w.fetch;
w.fetch = async (url, opt) => { if (String(url).startsWith("/api/caption")) { capCalls.push(1); return { ok: true, status: 200, json: async () => ({ q: "speaker wooden shelf" }) }; } return oldF2(url, opt); };
run("setCr({ x: 0.1, y: 0.2, w: 0.5, h: 0.5 })"); await run("cropGo()"); await tick(300);
ok(JSON.stringify(run("lv().cands")) === JSON.stringify(["speaker wooden shelf", "speaker wooden", "speaker"]), "crop search tries only pieces of the AI caption (never the whole image's tags / old query): " + run("lv().cands"));
ok(!$("#vcw").hidden && $$("#vcwChips button").map((b) => b.textContent).join(",") === "speaker,wooden,shelf" && $$("#vcwChips button.on").length === 3, "AI-seen words are shown as chips");
searchCalls.length = 0; $$("#vcwChips button")[2].click(); await tick(900);
ok(searchCalls.some((u) => u.includes("q=speaker%20wooden")) && !searchCalls.some((u) => u.includes("shelf")) && $$("#vcwChips button.off").length === 1, "tapping a word removes it and searches again without it");
$$("#vcwChips button")[1].click(); $$("#vcwChips button")[0].click(); await tick(100);
ok($$("#vcwChips button.on").length === 1, "at least one word always stays on");
searchCalls.length = 0; $("#vcwIn").value = "bluetooth speaker"; $("#vcwForm").dispatchEvent(new w.Event("submit", { cancelable: true, bubbles: true })); await tick(900);
ok(searchCalls.some((u) => u.includes("q=bluetooth%20speaker")) && $$("#vcwChips button").map((b) => b.textContent).join(",") === "bluetooth,speaker", "typing your own words searches by them and shows them as chips");
w.fetch = oldF2;

// 취향 칩은 하나씩 지울 수 있다
run("Taste.clear(); Taste.learn(['zebra','stripe'], 4, { colors: ['black'], tone: 'mono' })"); run("S.taste = true"); $("#vfab").click(); await tick(60);
$("#gear").click();
const tc = () => $$("#tasteView .tchip").map((b) => b.querySelector("span").textContent);
ok(tc().includes("zebra") && tc().includes("stripe") && $("#tasteNote") && !$("#tasteNote").hidden, "taste chips are listed with a delete hint: " + tc());
$$("#tasteView .tchip").find((b) => b.querySelector("span").textContent === "zebra").click();
ok(!tc().includes("zebra") && tc().includes("stripe") && run("Taste.affinity(['zebra'])") === 0 && run("Taste.affinity(['stripe'])") > 0, "tapping one taste chip deletes only that one");
$$("#tasteView .tchip").filter((b) => /검정|흑백/.test(b.textContent)).forEach((b) => b.click()); ok(!tc().some((t) => /검정|흑백/.test(t)), "color / tone chips can be deleted too: " + tc());
$("#closeSet").click();

// 추천 안 함
$("#tabFeed").click(); run('startSearch("sunset")'); await tick(900);
const n0 = $$("#grid .card").length; $("#grid .card").click(); await tick(120);
const k0 = run("keyOf(curItem())"), t0 = $("#vtitle").textContent;
ok(!$("#vhide").hidden && $("#hideSheet").hidden, "viewer has a 추천 안 함 button; sheet starts closed");
$("#vhide").click(); ok(!$("#hideSheet").hidden && !!$("#hidePref") && !!$("#hideBad"), "추천 안 함 opens a sheet with two choices");
$("#hideCancel").click(); ok($("#hideSheet").hidden && !run("Avoid.isHidden(keyOf(curItem()))"), "cancel hides nothing");
$("#vhide").click(); $("#hidePref").click(); await tick(120);
ok(run(`Avoid.isHidden(${JSON.stringify(k0)})`) && $$("#grid .card").length === n0 - 1 && !$$("#grid .card").some((c) => run("keyOf") && c._it && run("keyOf")(c._it) === k0), "hidden image is gone from the feed");
ok(!$("#viewer").hidden && !run("lv().list").some((x) => run("keyOf")(x) === k0), "viewer moves on to another image");
ok(!/https?:/.test(w.localStorage.getItem("avoid")) && !/"sunset"\s*:\s*\{/.test(w.localStorage.getItem("avoid")) && !w.localStorage.getItem("avoid").includes("q="), "avoid store keeps only address keys and tag counts (no URLs, no search words)");
// 같은 종류를 '불편'으로 두 번 알려 주면 비슷한 이미지는 블러
$("#vhide").click(); $("#hideBad").click(); await tick(80); $("#vhide").click(); $("#hideBad").click(); await tick(80);
ok(run("Avoid.view().tags.length") >= 1 && run("Avoid.verdict(['sunset','beach','sea'])") === 2, "after two 'uncomfortable' answers, the same kind is judged for blur");
const bl = run(`(() => { M.reset(); M.begin("zz"); M.merge([{ src: { id: "pixabay", w: 1 }, items: [{ title: "x", tags: ["sunset","beach","sea"], thumb: "https://x.test/zz1.jpg", full: "https://x.test/zz1_full.jpg", page: "p", src: "pixabay", w: 400, h: 300 }, { title: "y", tags: ["dog","park"], thumb: "https://x.test/zz2.jpg", full: "https://x.test/zz2_full.jpg", page: "p", src: "pixabay", w: 400, h: 300 }, { title: "h", tags: ["dog"], thumb: "${k0}", full: "https://${k0}", page: "p", src: "pixabay", w: 400, h: 300 }], base: 0 }]); return [...M.pend.values()].map((e) => [e.it.title, !!e.it.avoidBlur, !!e.it.adult]); })()`);
ok(JSON.stringify(bl) === JSON.stringify([["x", true, true], ["y", false, false]]), "matching new results are blurred (flagged), others untouched, hidden image never returns: " + JSON.stringify(bl));
ok(run(`makeCard({ ...${JSON.stringify(item("av1", ["a"]))}, avoidBlur: true, adult: true }, () => {}).classList.contains("avoid")`), "blurred card gets .avoid (blur works even if the sexual-content blur setting is off)");
ok(/\.card\.avoid\[data-st=flag\]:not\(\.reveal\) img\{filter:blur/.test(css.replace(/\s+/g, "")) || /\.card\.avoid\[data-st=flag\]:not\(\.reveal\)\s+img\s*\{[^}]*blur/.test(css), "CSS blurs .avoid cards regardless of body.noblur");
// 설정에서 확인·되돌리기
$("#gear").click(); ok(/숨긴 이미지 \d+장/.test($("#avoidCount").textContent) && !$("#avoidClear").hidden, "settings shows how many images are hidden: " + $("#avoidCount").textContent);
const av = $$("#avoidView .tchip"); ok(av.length >= 1, "settings lists tags that affect similar images");
const tag0 = av[0].querySelector("span").textContent; av[0].click(); ok(!$$("#avoidView .tchip").some((b) => b.querySelector("span").textContent === tag0), "tapping a tag lifts only that tag");
$("#avoidClear").click(); ok(run("Avoid.isEmpty()") && $("#avoidClear").hidden, "모두 지우기 empties the avoid list");
$("#closeSet").click();

ok(errors.length === 0, "no script errors" + (errors.length ? ": " + errors.slice(0, 3).join(" ; ") : ""));
console.log(fail ? `\n${fail} failed` : "\nall passed"); process.exit(fail ? 1 : 0);
